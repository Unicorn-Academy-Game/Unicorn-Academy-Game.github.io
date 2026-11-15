import { MAX_LEVEL, type StartHelp } from '../shared/learning';

/**
 * The ladder a word climbs. A level says how well the player knows a word, and each level uses a
 * rung, which says how much help the card gives while they spell it. Both are tables, so making the
 * ladder longer or the help gentler is a change to a row.
 */

export type RungId = 'copy' | 'follow' | 'peek' | 'recall';

/** What the card shows of the word while the player spells. */
export type Model =
  /** Every letter, drawn faintly in the place it goes. */
  | 'in-places'
  /** The whole word, written above the empty places. */
  | 'above'
  /** The first letter is given and the rest are hidden. */
  | 'first-letter'
  /** Only the picture and the empty places. */
  | 'none';

/**
 * Which keys work. The others fade but keep their places, so the keyboard is the same shape at
 * every rung.
 */
export type Keys = 'word' | 'bank' | 'all';

export interface Rung {
  id: RungId;
  model: Model;
  /** Whether the next key glows without being asked. */
  lights: boolean;
  keys: Keys;
  /** Whether the help button shows the whole word for a moment as well as lighting the key. */
  peek: boolean;
  /**
   * How many wrong keys a spell can have and still count as clean. A slip of a small finger is not
   * a failure.
   */
  allow: number;
}

export const RUNGS: Readonly<Record<RungId, Rung>> = {
  copy: { id: 'copy', model: 'in-places', lights: true, keys: 'word', peek: false, allow: 2 },
  follow: { id: 'follow', model: 'above', lights: false, keys: 'bank', peek: false, allow: 1 },
  peek: { id: 'peek', model: 'first-letter', lights: false, keys: 'all', peek: true, allow: 1 },
  recall: { id: 'recall', model: 'none', lights: false, keys: 'all', peek: false, allow: 1 },
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface Level {
  /** For the parent page. */
  name: string;
  rung: RungId;
  /** Clean completions in a row that move a word up from this level. */
  needs: number;
  /**
   * How long after a completion that leaves the word at this level it is due again, in
   * milliseconds.
   */
  due: number;
}

export const LEVELS: readonly Level[] = [
  { name: 'Just met', rung: 'copy', needs: 1, due: 0 },
  { name: 'Learning', rung: 'follow', needs: 2, due: 10 * MINUTE },
  { name: 'Getting it', rung: 'peek', needs: 2, due: HOUR },
  { name: 'Nearly there', rung: 'recall', needs: 1, due: DAY },
  { name: 'Knows it', rung: 'recall', needs: 1, due: 3 * DAY },
  { name: 'A master', rung: 'recall', needs: 1, due: 14 * DAY },
];

/**
 * What the reading computer gives at each level of a word or a sentence, in the order of `LEVELS`,
 * and how far one clean read climbs. It is a table like the rungs above, so making the help gentler
 * or the climb longer is a change to a row. A clean read climbs a level at once, because a word or
 * a sentence is read two or three times in all, and a climb of two at a level would keep the help
 * on for good.
 */
export interface ReadRung {
  /** The tile the player needs next shines without being asked. */
  lights: boolean;
  /**
   * The voice says a word once its tiles have joined, so that the player says it after the voice
   * and not before.
   */
  says: boolean;
  /** How many wrong touches still count as clean. A slip of a small finger is not a failure. */
  allow: number;
  /** Clean reads in a row that move it up from this level. */
  needs: number;
}

export const READ_RUNGS: readonly ReadRung[] = [
  // Just met: the tile shines, and the word is said to the player as the tiles join.
  { lights: true, says: true, allow: 2, needs: 1 },
  // Learning: the tile still shines, and the player says the word themselves.
  { lights: true, says: false, allow: 2, needs: 1 },
  // Getting it and beyond: nothing shines unless the player asks, and they say the word themselves.
  { lights: false, says: false, allow: 1, needs: 1 },
  { lights: false, says: false, allow: 1, needs: 1 },
  { lights: false, says: false, allow: 1, needs: 1 },
  { lights: false, says: false, allow: 1, needs: 1 },
];

/** The level a word that is new to the player starts at, by how much help a parent chose. */
export const START_LEVEL: Readonly<Record<StartHelp, number>> = { full: 0, some: 1, little: 2 };

/**
 * The level a number stands for. A level from somewhere else lands on the nearest one that exists.
 */
export const levelOf = (level: number): Level =>
  LEVELS[Math.min(MAX_LEVEL, Math.max(0, Math.trunc(Number.isFinite(level) ? level : 0)))]!;

/** The help a word gets at a level. */
export const rungAt = (level: number): Rung => RUNGS[levelOf(level).rung];

/** What the reading computer gives a word or a sentence at a level. */
export const readRungAt = (level: number): ReadRung =>
  READ_RUNGS[Math.min(MAX_LEVEL, Math.max(0, Math.trunc(Number.isFinite(level) ? level : 0)))]!;
