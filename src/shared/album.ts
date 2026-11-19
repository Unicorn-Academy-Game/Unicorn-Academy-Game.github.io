/**
 * What the player has kept in the sticker book: the stickers they have earned and a few counts of
 * what they have done that the saved world does not remember. It is kept on the device beside the
 * spell book and the play record and is not part of the world, so a world that starts again never
 * takes a sticker away, and it holds nothing but good news.
 *
 * Every function here returns a new record, and putting two together keeps the larger of each
 * count and every sticker either has, so two tabs or two copies of the page can never lose one.
 */

export const ALBUM_VERSION = 1;

/** The most names a record keeps of each kind, so a record that grew wild cannot fill the device. */
const MAX_NAMES = 256;
const NAME = /^[a-z][a-z0-9:-]{0,31}$/;
/** The most any one count will hold. */
const MAX_COUNT = 1_000_000;
/** The last day a sticker can say it came on: far past any clock, and a safe whole number. */
const MAX_DAY = 3_000_000;

export interface AlbumRecord {
  v: typeof ALBUM_VERSION;
  /** How many times the player has done each thing, by name. It only ever grows. */
  counts: Readonly<Record<string, number>>;
  /** The stickers the player has earned, by id, each with the day it came, counted from 1970. */
  got: Readonly<Record<string, number>>;
}

export const emptyAlbum = (): AlbumRecord => ({ v: ALBUM_VERSION, counts: {}, got: {} });

/** A name is lower case words, and never one that every object already has, such as `constructor`. */
const isName = (name: string): boolean => NAME.test(name) && !(name in Object.prototype);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : null;

/** The days since 1970 that a moment, in milliseconds, falls on. */
export const dayOf = (ms: number): number => Math.max(0, Math.min(MAX_DAY, Math.floor(ms / 86_400_000)));

export interface ReadAlbum {
  album: AlbumRecord;
  /**
   * A newer version of the game wrote the record. It reads as empty, and nothing should write over
   * it.
   */
  newer: boolean;
}

function readNames(raw: unknown, max: number, floor: number): Record<string, number> {
  const names: Record<string, number> = {};
  if (!isRecord(raw)) return names;
  for (const [name, value] of Object.entries(raw)) {
    if (Object.keys(names).length >= MAX_NAMES) break;
    const n = isName(name) ? whole(value, max) : null;
    if (n !== null && n >= floor) names[name] = n;
  }
  return names;
}

/**
 * Reads what is stored as kindly as it can. An entry that cannot be read is left out and the rest
 * is kept, so one bad number never costs the player the others, and a record from a newer version
 * reads as empty and says so, so that it can be left alone.
 */
export function readAlbum(raw: unknown): ReadAlbum {
  if (!isRecord(raw)) return { album: emptyAlbum(), newer: false };
  const version = raw.v;
  if (typeof version === 'number' && version > ALBUM_VERSION) return { album: emptyAlbum(), newer: true };
  return {
    album: { v: ALBUM_VERSION, counts: readNames(raw.counts, MAX_COUNT, 1), got: readNames(raw.got, MAX_DAY, 0) },
    newer: false,
  };
}

const larger = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [name, n] of Object.entries(b)) out[name] = Math.max(out[name] ?? 0, n);
  return out;
};

/**
 * Both records put together: the larger of every count, and every sticker either has, with the
 * earlier day for one that both have. It gives the same record whichever comes first.
 */
export function mergeAlbum(a: AlbumRecord, b: AlbumRecord): AlbumRecord {
  const got: Record<string, number> = { ...a.got };
  for (const [id, day] of Object.entries(b.got)) got[id] = id in got ? Math.min(got[id]!, day) : day;
  return { v: ALBUM_VERSION, counts: larger(a.counts, b.counts), got };
}

/** The record with one more of something done. A count stops at its limit. */
export function noted(album: AlbumRecord, name: string, by = 1): AlbumRecord {
  if (!isName(name) || !(by >= 1)) return album;
  const had = album.counts[name] ?? 0;
  const next = Math.min(MAX_COUNT, had + Math.floor(by));
  if (next === had || (had === 0 && Object.keys(album.counts).length >= MAX_NAMES)) return album;
  return { ...album, counts: { ...album.counts, [name]: next } };
}

/** The record with stickers added, each on `day` unless it came already. */
export function earned(album: AlbumRecord, ids: readonly string[], day: number): AlbumRecord {
  const fresh = ids.filter((id) => isName(id) && !(id in album.got));
  if (fresh.length === 0 || Object.keys(album.got).length + fresh.length > MAX_NAMES) return album;
  const got = { ...album.got };
  for (const id of fresh) got[id] = Math.max(0, Math.min(MAX_DAY, day));
  return { ...album, got };
}

/** Whether two records say the same, so that a change that changes nothing is not written. */
export const sameAlbum = (a: AlbumRecord, b: AlbumRecord): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const sorted = (album: AlbumRecord): unknown => {
  const keys = (map: Readonly<Record<string, number>>): [string, number][] =>
    Object.entries(map).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return [album.v, keys(album.counts), keys(album.got)];
};
