/**
 * When the piano by the palace is tapped, a finger runs up its keys. The art draws the frames of
 * the run and the effect sends a note up from each key as the finger passes it, and both are
 * written from the numbers here, so a note leaves a key at the moment that key is down and the two
 * cannot drift apart.
 */

/** White keys, counted from a C: two octaves. */
export const PIANO_KEYS = 14;
/** How far apart the white keys are, in units of the piano's model. */
export const KEY_PITCH = 10.7;
/**
 * How many pixels of the picture a unit of the model is drawn at, so the piano stands a fine size
 * beside a unicorn.
 */
export const PIANO_UNIT = 1.2;
export const PIANO_FRAMES = 14;
export const PIANO_FPS = 16;

/**
 * How far before the first key and past the last the finger starts and ends, in keys, so the first
 * and the last frame are the piano at rest.
 */
const RUN_UP = 2.4;
/** How far from the finger a key is still pressed, in keys. */
const PRESS_REACH = 1.7;
/** The finger's travel from the first frame to the last, in keys. */
const TRAVEL = PIANO_KEYS - 1 + 2 * RUN_UP;

/** Where the finger is in a frame, as a number of keys from the first key. */
export const fingerAt = (frame: number): number => -RUN_UP + (frame / (PIANO_FRAMES - 1)) * TRAVEL;

/**
 * How far down a key is while the finger is at `finger`: nothing when it is far off and all the way
 * when the finger is on it.
 */
export const pressOf = (key: number, finger: number): number => Math.max(0, 1 - Math.abs(key - finger) / PRESS_REACH);

/** How long after the tap the finger is on a key. */
export const timeOfKey = (key: number): number => (((key + RUN_UP) / TRAVEL) * (PIANO_FRAMES - 1)) / PIANO_FPS;

/** How far from the middle of the piano, in pixels of the picture, a key is. */
export const offsetOfKey = (key: number): number => (key - (PIANO_KEYS - 1) / 2) * KEY_PITCH * PIANO_UNIT;

/**
 * Where the keys are in the picture, in pixels from the piano's ground point: how far below it,
 * since the keys jut out toward the viewer, and how far above it. These are the model's 46 units
 * out and 78 up, seen from the pitch the world is drawn at.
 */
export const KEYBOARD = { down: 21 * PIANO_UNIT, up: 70 * PIANO_UNIT } as const;

/**
 * Which of the five notes of the tone matrix each of the seven white keys of an octave plays,
 * counted from 0 for C up to 4 for A. F and B are not in that key, so they have no note.
 */
const NOTE_OF_WHITE: readonly (number | null)[] = [0, 1, 2, null, 3, 4, null];

export const noteOfKey = (key: number): number | null => NOTE_OF_WHITE[key % 7] ?? null;
