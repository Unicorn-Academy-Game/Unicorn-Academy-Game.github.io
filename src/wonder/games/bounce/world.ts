import type { Rng } from '../../../domain/rng';
import type { UnicornId } from '../../../shared/ids';
import { clamp } from '../../engine/ease';
import { arcPoint } from './hop';

/**
 * The sky she climbs: a ladder of clouds from a mushroom in a meadow up to a gate to the moon. It
 * is the same width on every screen and the camera looks at as much of it as the screen holds, so a
 * game is laid out the same in every hand. Everything about it comes from the seed, so the same
 * seed is the same sky, and every cloud can be got to from the one below.
 */

/** The height between one row of clouds and the next. */
export const ROW = 118;
/** How many rows of clouds there are between the mushroom and the gate. */
export const ROWS = 30;
export const WORLD_W = 800;
/** How far a leap rises above the higher of the two clouds it joins. */
export const LIFT = 62;
/** How far she can leap sideways, up and down, from where she stands. */
export const MAX_DX = 340;
const MAX_UP = 170;
const MAX_DOWN = 260;
/**
 * How far above her hooves the middle of her body is, which is where a star must hang for her to
 * gather it.
 */
export const BODY = 42;
/** Which rows a friend waits on, one friend to a row, in the order she found them. */
export const FRIEND_ROWS: readonly number[] = [4, 9, 14, 19, 24];
/** How many stars hang along a leap that has them. */
export const ARC_STARS = 5;
/** The least room between two clouds of a row, and between a cloud and the edge of the sky. */
const GAP = 40;
const EDGE = 24;

export type CloudKind =
  | 'mushroom'
  | 'plain'
  | 'jelly'
  | 'heart'
  | 'music'
  | 'sleepy'
  | 'rainbow'
  | 'star'
  | 'friend'
  | 'gate';

/** A cloud with something about it that a plain one has not. */
export const isSpecial = (kind: CloudKind): boolean =>
  kind === 'jelly' ||
  kind === 'heart' ||
  kind === 'music' ||
  kind === 'rainbow' ||
  kind === 'star' ||
  kind === 'friend';

export interface Cloud {
  /** The mushroom is -1 and the rest count up from 0. */
  readonly id: number;
  /** -1 for the mushroom, 0 and up for the rows, and `ROWS` for the gate. */
  readonly row: number;
  /** The middle of it. */
  readonly x: number;
  /** The line she stands on. */
  readonly y: number;
  readonly width: number;
  readonly kind: CloudKind;
  readonly friend: UnicornId | null;
  /** Which of the two drawings of its kind. */
  readonly drawing: 0 | 1;
  /** Where it is in its slow bob, in turns. */
  readonly phase: number;
  /** How many steps up the scale its note is: the further right, the higher. */
  readonly step: number;
  /** The cloud before it on the way up, which is where the stars that lead to it start. */
  readonly parent: number;
}

/** A star hanging in the air along the leap to a cloud. */
export interface Pickup {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** The cloud the leap goes to. */
  readonly cloud: number;
  /** Which of the stars along it, from the first. */
  readonly index: number;
}

/** What she can leap to from one place, and so the shape of every leap the game lets her make. */
export function reachable(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): boolean {
  const up = from.y - to.y;
  return Math.abs(to.x - from.x) <= MAX_DX && up <= MAX_UP && -up <= MAX_DOWN;
}

/** The note of a place across the sky, as steps up the scale from 0 to 9. */
export const stepAt = (x: number): number => clamp(Math.floor((x / WORLD_W) * 10), 0, 9);

function rowAt<T>(rows: T[][], index: number): T[] {
  const row = rows[index] ?? [];
  rows[index] = row;
  return row;
}

export class World {
  private readonly rows: Cloud[][];
  private readonly starRows: Pickup[][] = [];
  private readonly byIdMap = new Map<number, Cloud>();

  constructor(
    readonly clouds: readonly Cloud[],
    readonly pickups: readonly Pickup[],
  ) {
    this.rows = [];
    for (const c of clouds) {
      rowAt(this.rows, c.row + 1).push(c);
      this.byIdMap.set(c.id, c);
    }
    for (const p of pickups) rowAt(this.starRows, this.byId(p.cloud).row + 1).push(p);
  }

  get mushroom(): Cloud {
    return this.rows[0]![0]!;
  }

  get gate(): Cloud {
    return this.rows[ROWS + 1]![0]!;
  }

  /** The clouds of a row, from the left. Row -1 is the mushroom and `ROWS` is the gate. */
  row(row: number): readonly Cloud[] {
    return this.rows[row + 1] ?? [];
  }

  byId(id: number): Cloud {
    const c = this.byIdMap.get(id);
    if (!c) throw new Error(`there is no cloud ${id}`);
    return c;
  }

  /** The stars that hang along the leaps to the clouds of a row. */
  starsOf(row: number): readonly Pickup[] {
    return this.starRows[row + 1] ?? [];
  }

  /** How far up the sky a height is, from 0 at the meadow to 1 at the gate. */
  altitude(y: number): number {
    return clamp((0 - y) / (0 - this.gate.y));
  }

  /**
   * The first and last rows that can be seen between two heights, from `top` (the smaller) to
   * `bottom`. Rows are a little crooked, so it is a little generous.
   */
  rowsIn(top: number, bottom: number): readonly [number, number] {
    const first = Math.floor(-bottom / ROW) - 2;
    const last = Math.ceil(-top / ROW) + 1;
    return [Math.max(-1, first), Math.min(ROWS, last)];
  }
}

interface Band {
  readonly until: number;
  readonly weights: Readonly<Partial<Record<CloudKind, number>>>;
}

/** What the clouds of the low sky, the middle and the high are likely to be. */
const BANDS: readonly Band[] = [
  { until: 10, weights: { plain: 60, sleepy: 14, jelly: 12, heart: 7, music: 7 } },
  { until: 20, weights: { plain: 40, rainbow: 14, heart: 14, music: 12, jelly: 10, sleepy: 10 } },
  { until: ROWS, weights: { plain: 34, star: 22, rainbow: 14, music: 12, heart: 10, jelly: 8 } },
];

/** What each of the three skies likes, on top of that. */
const LEAN: Readonly<Record<string, Readonly<Partial<Record<CloudKind, number>>>>> = {
  red: { rainbow: 1.8 },
  pink: { heart: 1.8, jelly: 1.4 },
  blue: { star: 1.7, music: 1.4 },
};

/**
 * The clouds she meets first, one of each kind, so she sees what the sky has before she has climbed
 * far.
 */
const TEACH: Readonly<Record<number, CloudKind>> = {
  0: 'plain',
  1: 'sleepy',
  2: 'jelly',
  3: 'heart',
  5: 'music',
  7: 'rainbow',
  11: 'star',
};

const WIDTH: Readonly<Record<CloudKind, readonly [number, number]>> = {
  mushroom: [130, 130],
  plain: [112, 148],
  jelly: [122, 150],
  heart: [130, 158],
  music: [130, 158],
  sleepy: [120, 150],
  rainbow: [140, 168],
  star: [130, 158],
  friend: [150, 150],
  gate: [300, 300],
};

/**
 * Lays out a sky. `friends` are the unicorns who wait on clouds to be found, in the order they will
 * be met, and `look` is which of the three skies it is, which says what the clouds are likely to
 * be.
 */
export function buildWorld(rng: Rng, friends: readonly UnicornId[], look: string): World {
  const clouds: Cloud[] = [];
  const pickups: Pickup[] = [];
  let id = 0;

  const widthOf = (kind: CloudKind): number => {
    const [lo, hi] = WIDTH[kind];
    return lo === hi ? lo : Math.round(rng.range(lo, hi));
  };

  const make = (
    row: number,
    x: number,
    y: number,
    kind: CloudKind,
    friend: UnicornId | null,
    parent: number,
    width = widthOf(kind),
  ): Cloud => {
    const cloud: Cloud = {
      id: row < 0 ? -1 : id++,
      row,
      x,
      y,
      width,
      kind,
      friend,
      drawing: rng.next() < 0.5 ? 0 : 1,
      phase: rng.next(),
      step: stepAt(x),
      parent,
    };
    clouds.push(cloud);
    return cloud;
  };

  const mushroom = make(-1, WORLD_W / 2, 0, 'mushroom', null, -1);
  let previous: readonly Cloud[] = [mushroom];
  let path = WORLD_W / 2;
  const lean = LEAN[look] ?? {};

  const kindFor = (row: number): CloudKind => {
    const band = BANDS.find((b) => row < b.until) ?? BANDS[BANDS.length - 1]!;
    const kinds = Object.keys(band.weights) as CloudKind[];
    return rng.weighted(kinds, (k) => (band.weights[k] ?? 0) * (lean[k] ?? 1)) ?? 'plain';
  };

  const arcTo = (cloud: Cloud, parent: Cloud): void => {
    for (let i = 0; i < ARC_STARS; i++) {
      const at = arcPoint(parent.x, parent.y, cloud.x, cloud.y, LIFT, (i + 1) / (ARC_STARS + 1));
      pickups.push({ id: pickups.length, x: at.x, y: at.y - BODY, cloud: cloud.id, index: i });
    }
  };

  for (let r = 0; r < ROWS; r++) {
    // The way up: each step along it is a stride she can make, so there is always a way to the top.
    const side = rng.next() < 0.5 ? -1 : 1;
    let next = path + side * rng.range(110, 260);
    if (next < 150 || next > 650) next = path - side * rng.range(110, 260);
    path = clamp(next, r >= ROWS - 3 ? 260 : 140, r >= ROWS - 3 ? 540 : 660);

    const friendIndex = FRIEND_ROWS.indexOf(r);
    const friend = friendIndex >= 0 ? (friends[friendIndex] ?? null) : null;
    const baseY = -(r + 1) * ROW;
    const near = (x: number): Cloud =>
      previous.reduce((best, c) => (Math.abs(c.x - x) < Math.abs(best.x - x) ? c : best));

    const mainKind: CloudKind = friend ? 'friend' : (TEACH[r] ?? kindFor(r));
    const main = make(r, Math.round(path), Math.round(baseY + rng.range(-14, 14)), mainKind, friend, near(path).id);
    const row: Cloud[] = [main];

    // Others beside it, never touching, each one a leap from something in the row below: it is put
    // near one of those, so it is.
    const wanted = 2 + (rng.next() < 0.5 ? 1 : 0);
    const room = (x: number, width: number): boolean =>
      row.every((c) => Math.abs(c.x - x) >= (c.width + width) / 2 + GAP) &&
      x - width / 2 > EDGE &&
      x + width / 2 < WORLD_W - EDGE;
    const addAt = (x: number): boolean => {
      const kind = kindFor(r);
      const width = widthOf(kind);
      if (!room(x, width)) return false;
      row.push(make(r, x, Math.round(baseY + rng.range(-14, 14)), kind, null, near(x).id, width));
      return true;
    };
    for (let tries = 0; row.length < wanted && tries < 16; tries++) {
      const from = rng.pick(previous);
      addAt(Math.round(from.x + rng.range(-170, 170)));
    }
    // If chance would not find room, look for it in order, from the far side of the sky to the
    // near.
    for (let x = 120; row.length < 2 && x <= 680; x += 10) {
      const spot = main.x < WORLD_W / 2 ? 800 - x : x;
      if (previous.some((p) => Math.abs(p.x - spot) <= MAX_DX - 30)) addAt(spot);
    }
    row.sort((a, b) => a.x - b.x);

    // Stars lead to the clouds that have something in them, and along the first step and then every
    // third step of the way up.
    for (const c of row) {
      const lights = isSpecial(c.kind) || (c === main && (r === 0 || r % 3 === 2));
      if (lights) arcTo(c, clouds.find((o) => o.id === c.parent)!);
    }
    previous = row;
  }

  // The gate to the moon, at the top of the way up.
  make(
    ROWS,
    WORLD_W / 2,
    -(ROWS + 1) * ROW - 10,
    'gate',
    null,
    previous.reduce((best, c) => (Math.abs(c.x - WORLD_W / 2) < Math.abs(best.x - WORLD_W / 2) ? c : best)).id,
  );

  // Rows are kept in order from the left, so a stand-in for a person and a test can walk them the
  // same way.
  clouds.sort((a, b) => a.row - b.row || a.x - b.x);
  return new World(clouds, pickups);
}
