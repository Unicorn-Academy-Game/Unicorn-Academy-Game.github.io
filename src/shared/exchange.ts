import { z } from 'zod';
import type { MapId } from './ids';
import { MAX_SAVE_BYTES, SaveEnvelope, WorldSaveV1 } from './save';

/**
 * The file a parent downloads and later chooses to import. It holds the world and a little about
 * itself, and never anything that identifies a person or a sign-in.
 */

export const EXPORT_APP = 'unicorn-academy';
/**
 * What marks a file as a Spell Book, so one is never taken for a world. The Spell Book file itself
 * is written and read in the learning engine.
 */
export const BOOK_KIND = 'spell-book';

const ExportFileV1 = z.strictObject({
  app: z.literal(EXPORT_APP),
  format: z.literal(1),
  /** When the file was made, as an ISO date and time. */
  exportedAt: z.string().max(40),
  save: WorldSaveV1,
});
type ExportFileV1 = z.infer<typeof ExportFileV1>;

/** Room for the wrapper around a save that is at the size limit. */
const WRAPPER_BYTES = 1024;

export function exportFile(save: WorldSaveV1, exportedAt: string): { filename: string; text: string } {
  const file: ExportFileV1 = { app: EXPORT_APP, format: 1, exportedAt, save };
  return { filename: `${EXPORT_APP}-${exportedAt.slice(0, 10)}.json`, text: `${JSON.stringify(file, null, 2)}\n` };
}

export type ImportResult = { ok: true; save: WorldSaveV1 } | { ok: false; reason: string };

/**
 * Reads a chosen file. It accepts this game's export file, and also a bare save, which is what a
 * damaged-data export from the recovery list holds. The reasons are written for a parent to read.
 */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_SAVE_BYTES + WRAPPER_BYTES)
    return { ok: false, reason: 'That file is too big to be a saved world.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not a saved world. It could not be read.' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'That file is not a saved world.' };
  if ('kind' in raw && raw.kind === BOOK_KIND)
    return { ok: false, reason: 'That file is a Spell Book, not a world. A Spell Book is added under Learning.' };

  const wrapped = 'app' in raw ? ExportFileV1.safeParse(raw) : null;
  if (wrapped)
    return wrapped.success
      ? { ok: true, save: wrapped.data.save }
      : { ok: false, reason: 'That file is not a saved world from this game.' };

  const envelope = SaveEnvelope.safeParse(raw);
  if (envelope.success && envelope.data.schemaVersion > 1)
    return { ok: false, reason: 'That world was saved by a newer version of the game. Update the app first.' };
  const bare = WorldSaveV1.safeParse(raw);
  return bare.success
    ? { ok: true, save: bare.data }
    : { ok: false, reason: 'That file is not a saved world from this game.' };
}

/** What a parent is shown before a world is adopted: enough to tell it from another. */
export interface WorldSummary {
  friends: number;
  places: number;
  mapId: MapId;
}

export const summarize = (save: WorldSaveV1): WorldSummary => ({
  friends: save.recruited.length,
  places: save.visitedMaps.length,
  mapId: save.mapId,
});
