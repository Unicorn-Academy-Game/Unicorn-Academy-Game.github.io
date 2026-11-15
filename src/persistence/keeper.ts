import { exportFile, summarize, type WorldSummary } from '../shared/exchange';
import { WorldSaveV1 } from '../shared/save';
import { initialWorld } from '../shared/start';
import type { SaveClock } from './save-service';
import { firstValid, type LocalStore } from './store';

/**
 * What a parent can do to the world: download it, see the copies that were put aside, and swap it
 * for a new one, a file, or an earlier copy. Every swap puts the world it replaces aside first, in
 * the same step. Each one ends with the game restarting onto the new world, because the running
 * game holds the old one in memory.
 */

export interface ShelfEntry {
  /** What to pass back to `replace`: the id of a backup on this device. */
  key: string;
  /** Milliseconds since 1970, when it was put aside. */
  at: number;
  /** Why it was put aside. */
  reason: string;
  summary: WorldSummary;
}

export type ReplaceSource =
  | { kind: 'fresh' }
  | { kind: 'file'; save: WorldSaveV1 }
  | { kind: 'device-backup'; id: number };

export type ReplaceResult = { ok: true } | { ok: false; reason: string };

/** Something kept instead of deleted, as text a parent can still download. */
export interface SetAside {
  at: number;
  why: string;
  text: string;
}

/**
 * What was put aside on this device: data that could not be read, and a Spell Book put away before
 * a new one was started. None of it is the world, so it is there to be found in every visit,
 * whether or not the saved world is being used.
 */
export async function setAside(store: Pick<LocalStore, 'quarantined'>): Promise<SetAside[]> {
  return (await store.quarantined()).map((q) => ({ at: q.at, why: q.why, text: q.raw }));
}

export interface KeeperDeps {
  store: LocalStore;
  clock: SaveClock;
  newId: () => string;
  seed: () => number;
  /**
   * The running game's world, as a save, or null before the game has started. A download holds
   * this, so it has what is on screen even when the device could not store the latest of it.
   */
  live: () => WorldSaveV1 | null;
  /** Brings the running game's newest state onto the disk. */
  flush: () => Promise<void>;
  /** Stops the running game from saving over what is about to be installed. */
  retire: () => void;
  /** Restarts the game onto the world on the device. */
  restart: () => void;
}

const REASON = {
  fresh: 'Before starting over',
  file: 'Before loading a file',
  earlier: 'Before going back to an earlier world',
} as const;

export class WorldKeeper {
  constructor(private readonly deps: KeeperDeps) {}

  /** The world on this device as the game would load it, or null when there is none. */
  async current(): Promise<WorldSaveV1 | null> {
    const { store } = this.deps;
    const [record, history] = await Promise.all([store.current(), store.history()]);
    return firstValid(record ? [record, ...history] : history)?.record.save ?? null;
  }

  /**
   * The world as a file to download: the game as it is now, or the world on the device before the
   * game has started.
   */
  async exportWorld(): Promise<{ filename: string; text: string } | null> {
    const world = this.deps.live() ?? (await this.current());
    return world ? exportFile(world, new Date(this.deps.clock.now()).toISOString()) : null;
  }

  /** The copies that were put aside on this device, newest first. */
  async shelf(): Promise<ShelfEntry[]> {
    const entries: ShelfEntry[] = [];
    for (const b of await this.deps.store.backups()) {
      const parsed = WorldSaveV1.safeParse(b.save);
      if (parsed.success && b.id !== undefined)
        entries.push({ key: String(b.id), at: b.at, reason: b.reason, summary: summarize(parsed.data) });
    }
    return entries;
  }

  /**
   * What swapping would bring in, for a parent to look at before they agree. Null when the copy is
   * gone or unreadable.
   */
  async preview(source: ReplaceSource): Promise<WorldSummary | null> {
    const save = await this.read(source);
    return save ? summarize(save) : null;
  }

  private async read(source: ReplaceSource): Promise<WorldSaveV1 | null> {
    switch (source.kind) {
      case 'fresh':
        return initialWorld({
          worldGeneration: this.deps.newId(),
          snapshotId: this.deps.newId(),
          rngState: this.deps.seed(),
        });
      case 'file':
        return source.save;
      case 'device-backup': {
        const found = (await this.deps.store.backups()).find((b) => b.id === source.id);
        const parsed = found ? WorldSaveV1.safeParse(found.save) : null;
        return parsed?.success ? parsed.data : null;
      }
    }
  }

  /**
   * Swaps the world on this device for another. The world it replaces goes on the shelf in the same
   * step, so there is never a moment with the old world gone and no copy. Then the game restarts.
   */
  async replace(source: ReplaceSource): Promise<ReplaceResult> {
    const { store, clock } = this.deps;
    await this.deps.flush();
    const incoming = await this.read(source);
    if (!incoming) return { ok: false, reason: 'That copy could not be read.' };

    const world: WorldSaveV1 =
      source.kind === 'fresh'
        ? incoming
        : { ...incoming, worldGeneration: this.deps.newId(), snapshotId: this.deps.newId() };
    const outgoing = await this.current();
    const reason = source.kind === 'fresh' ? REASON.fresh : source.kind === 'file' ? REASON.file : REASON.earlier;
    try {
      await store.replace(world, 'replace', clock.now(), outgoing ? { save: outgoing, reason } : null);
    } catch {
      return { ok: false, reason: 'This device could not store the new world, so nothing was changed.' };
    }
    this.deps.retire();
    this.deps.restart();
    return { ok: true };
  }
}
