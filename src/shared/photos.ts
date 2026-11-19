/**
 * The pictures the player has taken with the camera: small photographs of the world as it stood on
 * the screen. They are kept on the device in a record of their own beside the sticker book, so a
 * world that starts again never takes one away, and nothing here ever leaves the device.
 *
 * Every function returns a new record, and putting two together keeps every picture either has
 * that was not put away, so two tabs or two copies of the page can never lose one. A picture put
 * away is remembered by its id, so that a tab that still holds it cannot bring it back.
 */

export const PHOTOS_VERSION = 1;

/** The most pictures the album keeps. When it is full the oldest makes room for the newest. */
export const MAX_PHOTOS = 48;
/** The most ids of pictures put away that a record remembers. */
const MAX_GONE = 96;
/** The longest a picture may be as text, which is about 120 KB of JPEG. */
export const MAX_IMAGE_CHARS = 160_000;
/** The shortest and longest side a picture may have, in pixels. */
const MIN_SIDE = 16;
const MAX_SIDE = 2048;

const ID = /^[a-z0-9]{6,20}$/;
const PLACE = /^[a-z][a-z0-9-]{0,31}$/;
const IMAGE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]{16,}={0,2}$/;

export interface Photo {
  id: string;
  /** When it was taken, in milliseconds since 1970. */
  at: number;
  /** The place the player was in, by its id. */
  place: string;
  /** The picture, as a JPEG in a data URL. */
  image: string;
  /** Its size in pixels. */
  w: number;
  h: number;
}

export interface PhotosRecord {
  v: typeof PHOTOS_VERSION;
  /** Oldest first. */
  shots: readonly Photo[];
  /** The ids of pictures put away. */
  gone: readonly string[];
}

export const emptyPhotos = (): PhotosRecord => ({ v: PHOTOS_VERSION, shots: [], gone: [] });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const side = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_SIDE && value <= MAX_SIDE;

/** Whether `value` is a picture this version can keep. */
export function isPhoto(value: unknown): value is Photo {
  if (!isRecord(value)) return false;
  const { id, at, place, image, w, h } = value;
  return (
    typeof id === 'string' &&
    ID.test(id) &&
    typeof at === 'number' &&
    Number.isSafeInteger(at) &&
    at >= 0 &&
    typeof place === 'string' &&
    PLACE.test(place) &&
    typeof image === 'string' &&
    image.length <= MAX_IMAGE_CHARS &&
    IMAGE.test(image) &&
    side(w) &&
    side(h)
  );
}

export interface ReadPhotos {
  photos: PhotosRecord;
  /**
   * A newer version of the game wrote the record. It reads as empty, and nothing should write over
   * it.
   */
  newer: boolean;
}

const byTime = (a: Photo, b: Photo): number => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Puts pictures in order, once each, without those that were put away, and keeps the newest
 * `MAX_PHOTOS`.
 */
function tidy(shots: readonly Photo[], gone: readonly string[]): PhotosRecord {
  const away = new Set(gone);
  const seen = new Map<string, Photo>();
  for (const photo of shots) if (!away.has(photo.id) && !seen.has(photo.id)) seen.set(photo.id, photo);
  const kept = [...seen.values()].sort(byTime).slice(-MAX_PHOTOS);
  return { v: PHOTOS_VERSION, shots: kept, gone: [...new Set(gone)].slice(-MAX_GONE) };
}

/**
 * Reads what is stored as kindly as it can. A picture that cannot be read is left out and the rest
 * is kept, and a record from a newer version reads as empty and says so, so that it can be left
 * alone.
 */
export function readPhotos(raw: unknown): ReadPhotos {
  if (!isRecord(raw)) return { photos: emptyPhotos(), newer: false };
  const version = raw.v;
  if (typeof version === 'number' && version > PHOTOS_VERSION) return { photos: emptyPhotos(), newer: true };
  const shots = Array.isArray(raw.shots) ? raw.shots.filter(isPhoto) : [];
  const gone = Array.isArray(raw.gone)
    ? raw.gone.filter((id): id is string => typeof id === 'string' && ID.test(id))
    : [];
  return { photos: tidy(shots, gone), newer: false };
}

/**
 * Both records put together: every picture either has that neither has put away. It gives the same
 * pictures whichever comes first.
 */
export const mergePhotos = (a: PhotosRecord, b: PhotosRecord): PhotosRecord =>
  tidy([...a.shots, ...b.shots], [...a.gone, ...b.gone]);

/** The record with one more picture. A picture that was put away stays away. */
export const added = (photos: PhotosRecord, photo: Photo): PhotosRecord =>
  mergePhotos(photos, { v: PHOTOS_VERSION, shots: [photo], gone: [] });

/** The record without one picture, which is then remembered as put away. */
export function removed(photos: PhotosRecord, id: string): PhotosRecord {
  if (!photos.shots.some((p) => p.id === id)) return photos;
  return tidy(
    photos.shots.filter((p) => p.id !== id),
    [...photos.gone, id],
  );
}

/** Whether two records say the same, so that a change that changes nothing is not written. */
export const samePhotos = (a: PhotosRecord, b: PhotosRecord): boolean =>
  a.shots.length === b.shots.length &&
  a.shots.every((p, i) => p.id === b.shots[i]!.id) &&
  a.gone.length === b.gone.length &&
  [...a.gone].sort().join() === [...b.gone].sort().join();
