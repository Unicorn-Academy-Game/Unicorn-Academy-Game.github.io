/**
 * When the computer by the palace is tapped, its screen wakes and a light runs along its keys. The
 * art draws the frames of the waking and the effect sends a spark up from each key as the light
 * reaches it, and both are written from the numbers here, so a spark leaves a key at the moment
 * that key is lit and the two cannot drift apart.
 */

/**
 * How many pixels of the picture a unit of the computer's model is drawn at, so it stands a fine
 * size beside a unicorn.
 */
export const COMPUTER_UNIT = 1.3;
/**
 * The angle the world is looked at from, in degrees. The model's depth and height are seen from it.
 */
const PITCH_DEGREES = 27;

/**
 * How the screen looks in each frame: how bright its glass is, from 0 for dark to 1 for the flash,
 * and how big its letters are, or 0 for none. The first frame and the last are the computer at
 * rest.
 */
export const SCREEN: readonly { readonly glass: number; readonly letters: number }[] = [
  { glass: 0, letters: 1 },
  { glass: 1, letters: 0 },
  { glass: 0.18, letters: 1.22 },
  { glass: 0.08, letters: 1.1 },
  { glass: 0.02, letters: 1.04 },
  { glass: 0, letters: 1 },
];
export const COMPUTER_FRAMES = SCREEN.length;
export const COMPUTER_FPS = 10;

/**
 * Keys across a row of the keyboard, and how far apart their middles are, in units of the
 * computer's model.
 */
export const COLUMNS = 11;
export const COLUMN_PITCH = 13.2;
/** Rows of keys, front to back. */
export const ROWS = 3;

/**
 * How far before the first column and past the last the light starts and ends, in columns, so the
 * first and the last frame are the computer at rest.
 */
const RUN_UP = 2.4;
/** How far from the light a key still shines, in columns. */
const REACH = 2.2;
/** How much a key must shine to be lit. */
export const LIT = 0.3;
/** The light's travel from the first frame to the last, in columns. */
const TRAVEL = COLUMNS - 1 + 2 * RUN_UP;

/** Where the light is in a frame, as a number of columns from the first. */
export const lightAt = (frame: number): number => -RUN_UP + (frame / (COMPUTER_FRAMES - 1)) * TRAVEL;

/**
 * How much a column shines while the light is at `light`: nothing when it is far off and all of it
 * when the light is on it.
 */
export const glowOf = (column: number, light: number): number => Math.max(0, 1 - Math.abs(column - light) / REACH);

/** How long after the tap the light is on a column. */
export const timeOfColumn = (column: number): number =>
  (((column + RUN_UP) / TRAVEL) * (COMPUTER_FRAMES - 1)) / COMPUTER_FPS;

/** How far from the middle of the computer, in pixels of the picture, a column of keys is. */
export const offsetOfColumn = (column: number): number => (column - (COLUMNS - 1) / 2) * COLUMN_PITCH * COMPUTER_UNIT;

/**
 * Where the keys are in the picture, in pixels from the computer's ground point: how far below it,
 * since the keys jut out toward the viewer, and how far above it. These are the model's 45 units
 * out and 46 up, seen from the pitch the world is drawn at.
 */
export const KEYBOARD = {
  down: Math.sin((PITCH_DEGREES * Math.PI) / 180) * 45 * COMPUTER_UNIT,
  up: Math.cos((PITCH_DEGREES * Math.PI) / 180) * 46 * COMPUTER_UNIT,
} as const;

/**
 * Where the middle of the screen's glass is in the picture, in the same terms: the model's 28 units
 * out and 102 up.
 */
export const SCREEN_SPOT = {
  down: Math.sin((PITCH_DEGREES * Math.PI) / 180) * 28 * COMPUTER_UNIT,
  up: Math.cos((PITCH_DEGREES * Math.PI) / 180) * 102 * COMPUTER_UNIT,
} as const;
