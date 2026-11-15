import type { Facing, Vec2 } from './ids';

/**
 * The ways a unicorn faces and how they relate. A unicorn faces one of 32 equal steps round the
 * circle, numbered clockwise on the map from east, so each step is 11.25 degrees and turning,
 * mirroring and finding the nearest facing a clip has are plain arithmetic on the numbers. People,
 * creatures, maps and saves keep to the four names of `Facing`, so a unicorn's facing can only
 * reach them through `cardinalOf`, and theirs can only reach a unicorn through `facingOfCardinal`.
 * Everything that turns a heading into a facing, a facing into a direction, or a wanted facing into
 * one a clip really has goes through here, so the simulation, the view and the art tools agree.
 */

/** How many facings there are round the circle. */
export const FACING_COUNT = 32;

/** One step of the ring, in radians: 11.25 degrees. */
export const FACING_STEP = (2 * Math.PI) / FACING_COUNT;

// prettier-ignore
export type UnicornFacing =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31;

/** Every facing, from east clockwise round the map. */
export const UNICORN_FACINGS: readonly UnicornFacing[] = Array.from(
  { length: FACING_COUNT },
  (_, i) => i as UnicornFacing,
);

/**
 * The eight that have names, four steps apart. East is 0 and the numbers run clockwise on the map.
 */
export const EAST = 0 as const;
export const SOUTHEAST = 4 as const;
export const SOUTH = 8 as const;
export const SOUTHWEST = 12 as const;
export const WEST = 16 as const;
export const NORTHWEST = 20 as const;
export const NORTH = 24 as const;
export const NORTHEAST = 28 as const;

/** The names of the eight, clockwise from east, for words meant to be read. */
const EIGHT_NAMES = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'] as const;

/** A facing for a person to read: its number, and its name when it has one. */
export const facingLabel = (f: UnicornFacing): string => (f % 4 === 0 ? `${f} (${EIGHT_NAMES[f / 4]})` : String(f));

/**
 * The facing a name such as `southwest` stands for, or `undefined` when it names none of the eight.
 */
export const facingNamed = (name: string): UnicornFacing | undefined => {
  const i = (EIGHT_NAMES as readonly string[]).indexOf(name);
  return i < 0 ? undefined : ((i * 4) as UnicornFacing);
};

/** The eight named facings, clockwise from east. */
export const COMPASS_EIGHT: readonly UnicornFacing[] = [
  EAST,
  SOUTHEAST,
  SOUTH,
  SOUTHWEST,
  WEST,
  NORTHWEST,
  NORTH,
  NORTHEAST,
];

/** The four that people and creatures have. */
export const COMPASS_FOUR: readonly UnicornFacing[] = [EAST, SOUTH, WEST, NORTH];

/** The facing a whole number of steps round the ring lands on, however many times round it goes. */
export const facingAt = (steps: number): UnicornFacing =>
  (((Math.round(steps) % FACING_COUNT) + FACING_COUNT) % FACING_COUNT) as UnicornFacing;

/**
 * Reads a facing written as text, as the manifest keys its clips, or `undefined` when the text is
 * not exactly one.
 */
export function parseFacing(text: string): UnicornFacing | undefined {
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n < FACING_COUNT && String(n) === text ? (n as UnicornFacing) : undefined;
}

/** How many steps lie between two facings, the short way round, from 0 to 16. */
export function stepsBetween(a: UnicornFacing, b: UnicornFacing): number {
  const d = Math.abs(a - b);
  return Math.min(d, FACING_COUNT - d);
}

/**
 * Which way round the ring is the short way from one facing to another: 1 for clockwise on the map,
 * -1 for the other way, and 0 when they are the same. Two facings opposite each other are as near
 * either way, and the clockwise way is taken.
 */
export function turnWay(from: UnicornFacing, to: UnicornFacing): -1 | 0 | 1 {
  const clockwise = (((to - from) % FACING_COUNT) + FACING_COUNT) % FACING_COUNT;
  return clockwise === 0 ? 0 : clockwise > FACING_COUNT / 2 ? -1 : 1;
}

/**
 * The facing `steps` nearer to `to` than `from` is, going the short way round, or `to` itself when
 * that is fewer steps away. Two facings opposite each other are as near either way, and the
 * clockwise way on the map is taken: east to west goes by the south, west to east by the north.
 */
export function stepToward(from: UnicornFacing, to: UnicornFacing, steps: number): UnicornFacing {
  return facingAt(from + turnWay(from, to) * Math.min(stepsBetween(from, to), steps));
}

/**
 * The facing that is the same view turned around the vertical axis, which is what flipping its
 * picture shows.
 */
export const mirrorOf = (f: UnicornFacing): UnicornFacing => facingAt(FACING_COUNT / 2 - f);

/**
 * The angle of a facing in radians, measured like atan2(y, x) on the map, so east is 0, south is a
 * quarter turn and west is pi.
 */
export const angleOf = (f: UnicornFacing): number => (f <= FACING_COUNT / 2 ? f : f - FACING_COUNT) * FACING_STEP;

const D = Math.SQRT1_2;

/** The eight named directions exactly, so a heading along one has no rounding dust in it. */
const EXACT: Readonly<Record<number, Vec2>> = {
  [EAST]: { x: 1, y: 0 },
  [SOUTHEAST]: { x: D, y: D },
  [SOUTH]: { x: 0, y: 1 },
  [SOUTHWEST]: { x: -D, y: D },
  [WEST]: { x: -1, y: 0 },
  [NORTHWEST]: { x: -D, y: -D },
  [NORTH]: { x: 0, y: -1 },
  [NORTHEAST]: { x: D, y: -D },
};

/** Unit vector of a facing on the map. North is up the map, which is toward smaller y. */
export const vecOf = (f: UnicornFacing): Vec2 => {
  const exact = EXACT[f];
  return exact ? { x: exact.x, y: exact.y } : { x: Math.cos(angleOf(f)), y: Math.sin(angleOf(f)) };
};

/**
 * How far a facing is from the nearest side view, in steps: 0 for east and west, 8 for north and
 * south.
 */
const sideness = (f: UnicornFacing): number => Math.min(stepsBetween(f, EAST), stepsBetween(f, WEST));

/**
 * Of the facings a clip has, the one nearest to the facing wanted: the same one when it has it,
 * else the least turned. Where two are as near, the one nearer a side view wins, so a diagonal that
 * sits between a side view and a front or back view takes the side view, and between east and west,
 * east. Where that is the same too, the one on the east side wins, and last of all the lower
 * number, so the answer never depends on the order the facings are listed in.
 */
export function nearestAmong<F extends UnicornFacing>(among: readonly F[], want: UnicornFacing): F {
  const rank = (f: F): number =>
    ((stepsBetween(f, want) * 16 + sideness(f)) * 2 + (f > SOUTH && f < NORTH ? 1 : 0)) * FACING_COUNT + f;
  return among.reduce((best, f) => (rank(f) < rank(best) ? f : best));
}

/** The side view, east or west, that a facing leans to. North and south lean east. */
export const sideOf = (f: UnicornFacing): UnicornFacing => (f > SOUTH && f < NORTH ? WEST : EAST);

const NAME_OF: Readonly<Record<number, Facing>> = {
  [EAST]: 'east',
  [SOUTH]: 'south',
  [WEST]: 'west',
  [NORTH]: 'north',
};
const FACING_OF: Readonly<Record<Facing, UnicornFacing>> = { east: EAST, south: SOUTH, west: WEST, north: NORTH };
const CARDINAL_OF: readonly Facing[] = UNICORN_FACINGS.map((f) => NAME_OF[nearestAmong(COMPASS_FOUR, f)]!);

/**
 * The four-way facing that stands for a unicorn's, wherever the world has only four, as a save
 * does. A diagonal gives way to its side view, east or west, because the side views are the ones
 * drawn for every clip. Anything else is the cardinal it is nearest.
 */
export const cardinalOf = (f: UnicornFacing): Facing => CARDINAL_OF[f]!;

/** The unicorn's facing for a four-way one: the same direction. */
export const facingOfCardinal = (f: Facing): UnicornFacing => FACING_OF[f];

const angleDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/**
 * The facing among `among` nearest to a heading. The current facing is kept until the heading is
 * more than `hysteresis` radians past the boundary halfway to its neighbour, so a path that wobbles
 * near a boundary does not flip back and forth. The facings are taken to be evenly spaced round the
 * circle. Where two are equally near, the first listed wins.
 */
export function facingAmong<F extends UnicornFacing>(
  among: readonly F[],
  heading: Vec2,
  current: F,
  hysteresis: number,
): F {
  if (heading.x === 0 && heading.y === 0) return current;
  const a = Math.atan2(heading.y, heading.x);
  if (angleDiff(a, angleOf(current)) <= Math.PI / among.length + hysteresis) return current;
  let best: F = current;
  let bestD = Infinity;
  for (const f of among) {
    const d = angleDiff(a, angleOf(f));
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/**
 * How far past the halfway point to the next of her 32 facings a heading must swing before a
 * unicorn is turned to it, in radians, which is about 3.4 degrees. A wobble of a finger or a path
 * that stays inside it never turns her back and forth.
 */
export const TURN_HYSTERESIS = 0.06;

/**
 * The facing nearest to a heading among the four. People and creatures, who have no diagonals, turn
 * by this.
 */
export const facingFor = (heading: Vec2, current: Facing, hysteresis = 0.2): Facing =>
  NAME_OF[facingAmong(COMPASS_FOUR, heading, facingOfCardinal(current), hysteresis)]!;

/**
 * The facing nearest to a heading among the four straight ones, for a gesture she makes in only
 * those, such as a cast.
 */
export const straightFacingFor = (heading: Vec2, current: UnicornFacing, hysteresis = 0.2): UnicornFacing =>
  facingAmong(COMPASS_FOUR, heading, nearestAmong(COMPASS_FOUR, current), hysteresis);

/** The facing nearest to a heading among all 32. A unicorn on her feet is turned by this. */
export const unicornFacingFor = (heading: Vec2, current: UnicornFacing, hysteresis = TURN_HYSTERESIS): UnicornFacing =>
  facingAmong(UNICORN_FACINGS, heading, current, hysteresis);
