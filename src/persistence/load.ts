import { type LoadPlan, planLoad } from '../domain';
import type { MapId } from '../shared/ids';
import { SaveEnvelope } from '../shared/save';
import type { SnapshotRecord } from './db';
import type { LocalStore } from './store';

export type LoadOutcome =
  /** Nothing usable is stored. `damaged` says whether something unreadable was kept aside. */
  | { kind: 'fresh'; damaged: boolean }
  /**
   * A saved world. `skipped` counts newer snapshots that failed validation before this one passed.
   */
  | { kind: 'resume'; plan: LoadPlan; skipped: number }
  /** The stored world was written by a newer build. This build must not touch it. */
  | { kind: 'too-new' };

/**
 * Chooses the world to start from: the newest stored snapshot that validates, falling back through
 * the history. Bad snapshots are kept aside and never deleted here. A snapshot from a newer schema
 * stops the load, because writing over it from an older build would lose progress.
 */
export async function loadWorld(store: LocalStore, knownMaps: readonly MapId[], now: number): Promise<LoadOutcome> {
  const current = await store.current();
  const history = await store.history();
  const seen = new Set<string>();
  const candidates: SnapshotRecord[] = [];
  for (const record of [...(current ? [current] : []), ...history]) {
    if (seen.has(record.snapshotId)) continue;
    seen.add(record.snapshotId);
    candidates.push(record);
  }

  const bad: { record: SnapshotRecord; why: string }[] = [];
  const settle = async (adopt: SnapshotRecord | null): Promise<void> => {
    for (const { record, why } of bad) await store.quarantine(record.save, why, now);
    await store.discard(
      bad.map((b) => b.record.snapshotId),
      adopt,
    );
  };

  for (const record of candidates) {
    const envelope = SaveEnvelope.safeParse(record.save);
    if (envelope.success && envelope.data.schemaVersion > 1) return { kind: 'too-new' };
    const planned = planLoad(record.save, knownMaps);
    if (planned.ok) {
      await settle(bad.length > 0 ? record : null);
      return { kind: 'resume', plan: planned.plan, skipped: bad.length };
    }
    bad.push({ record, why: planned.reason });
  }
  await settle(null);
  return { kind: 'fresh', damaged: bad.length > 0 };
}
