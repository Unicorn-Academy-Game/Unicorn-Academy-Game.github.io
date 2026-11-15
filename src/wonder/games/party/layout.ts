import { chromeOf } from '../../engine/chrome';
import { lerp } from '../../engine/ease';

/**
 * Where everything at the party is, from the size of the screen. A party is a dance floor seen from
 * the front, going back from the edge of the stage into the night, with a pole at each back corner
 * and a cannon at each front one. Every place is in the game's own units, and every size is a share
 * of the screen, so the same party is on a phone held either way, a tablet and a desktop.
 */

/** Where a friend dances, and the way she faces when she is not turning. */
export interface Slot {
  readonly x: number;
  /** Where her hooves are. */
  readonly y: number;
  readonly scale: number;
  /** 1 if she faces right, toward the middle of the floor, and -1 if she faces left. */
  readonly home: 1 | -1;
  /** How far forward on the floor she stands, from 0 at the back edge to 1 at the front. */
  readonly depth: number;
}

/** The floor, as a flat shape wide at the front and narrow at the back. */
export interface FloorShape {
  readonly top: number;
  readonly bottom: number;
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
  /** The tiles across the floor and the rows of them from the back to the front. */
  readonly cols: number;
  readonly rows: number;
}

export interface CannonSpot {
  readonly x: number;
  /** Where its foot is on the ground. */
  readonly y: number;
  readonly scale: number;
  /** How far it leans toward the middle, in radians, positive being clockwise. */
  readonly lean: number;
  readonly side: -1 | 1;
}

interface Pole {
  readonly x: number;
  readonly base: number;
  readonly top: number;
  readonly side: -1 | 1;
}

interface Speaker {
  readonly x: number;
  /** Where it stands. */
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The string of lights that runs from pole to pole and on to the edges of the screen. */
interface Wire {
  /** How high it is at the poles. */
  readonly y: number;
  /** How far it sags in the middle between them. */
  readonly sag: number;
  readonly left: number;
  readonly right: number;
}

export interface Plan {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  readonly floor: FloorShape;
  /** The front edge of the stage, where the grass begins. */
  readonly ground: number;
  readonly cannons: readonly [CannonSpot, CannonSpot];
  readonly wire: Wire;
  /** The mirror ball: where it hangs, how big it is, and where its string is tied. */
  readonly ball: { readonly x: number; readonly y: number; readonly r: number; readonly top: number };
  /** The pinata: where its rope is tied, and where its middle hangs when it is still. */
  readonly pinata: { readonly x: number; readonly top: number; readonly y: number; readonly r: number };
  readonly poles: readonly [Pole, Pole];
  readonly speakers: readonly [Speaker, Speaker];
  /** How big a friend is drawn at the front of the floor, at most. */
  readonly scaleMost: number;
}

/**
 * How wide a friend is at full size, in units, side on. Her picture is about 160 across at scale 1,
 * and a dance takes some room.
 */
export const FOOTPRINT = 128;

/** How much of the floor's width the dancers may use. */
const ROW_USE = 0.9;

/**
 * The floor's shape and the stage around it. `unit` is how many CSS pixels a unit is, which says
 * how much of the picture the page's own buttons and star counter take, and so where the mirror
 * ball can hang and still be seen.
 */
export function planOf(w: number, h: number, unit = 1): Plan {
  const portrait = h > w;
  const k = Math.min(1.2, Math.max(0.9, h / 360));
  const top = h * 0.6;
  const bottom = h * (portrait ? 0.915 : 0.935);
  const floor: FloorShape = portrait
    ? {
        top,
        bottom,
        topLeft: w * 0.1,
        topRight: w * 0.9,
        bottomLeft: w * 0.012,
        bottomRight: w * 0.988,
        cols: 8,
        rows: 4,
      }
    : {
        top,
        bottom,
        topLeft: w * 0.17,
        topRight: w * 0.83,
        bottomLeft: w * 0.045,
        bottomRight: w * 0.955,
        cols: 12,
        rows: 4,
      };
  const lean = 0.26;
  const cannonX = Math.max(portrait ? 30 : 34, w * (portrait ? 0.085 : 0.047));
  const cannonY = portrait ? h * 0.984 : h * 0.978;
  const cannonScale = portrait ? 0.92 : Math.min(1.2, Math.max(0.9, h / 340));
  const cannons: [CannonSpot, CannonSpot] = [
    { x: cannonX, y: cannonY, scale: cannonScale, lean, side: -1 },
    { x: w - cannonX, y: cannonY, scale: cannonScale, lean: -lean, side: 1 },
  ];
  const wireY = h * 0.045;
  const poleBase = top + (bottom - top) * 0.04;
  const poles: [Pole, Pole] = portrait
    ? [
        { x: w * 0.05, base: poleBase, top: wireY, side: -1 },
        { x: w * 0.95, base: poleBase, top: wireY, side: 1 },
      ]
    : [
        { x: floor.topLeft - 6, base: poleBase, top: wireY, side: -1 },
        { x: floor.topRight + 6, base: poleBase, top: wireY, side: 1 },
      ];
  const wire: Wire = { y: wireY, sag: h * 0.05, left: poles[0].x, right: poles[1].x };
  const pinataX = w * (portrait ? 0.27 : 0.255);
  // On a phone held sideways the star counter is in the way of where the ball would hang, so it
  // hangs below the counter. On a narrow screen the pinata can be under it too.
  const counter = chromeOf({ w, h, unit }).meter;
  const ballR = portrait ? 25 : 21 * k;
  const ball = {
    x: w / 2,
    y: Math.max(portrait ? h * 0.2 : h * 0.215, counter.y1 + ballR + 6),
    r: ballR,
    top: heightOfWire(wire, w / 2, w),
  };
  const pinataR = portrait ? 36 : 31 * k;
  const underCounter = pinataX + pinataR > counter.x0 && pinataX - pinataR < counter.x1;
  const pinata = {
    x: pinataX,
    top: heightOfWire(wire, pinataX, w) + 2,
    y: Math.max(portrait ? h * 0.345 : h * 0.33, underCounter ? counter.y1 + pinataR + 4 : 0),
    r: pinataR,
  };
  const sw = (portrait ? 54 : 66) * k;
  const sh = (portrait ? 80 : 98) * k;
  const sx = portrait ? w * 0.145 : Math.max(sw / 2 + 4, w * 0.105);
  const sy = top + (portrait ? 18 : 24);
  const speakers: [Speaker, Speaker] = [
    { x: sx, y: sy, w: sw, h: sh },
    { x: w - sx, y: sy, w: sw, h: sh },
  ];
  return {
    w,
    h,
    portrait,
    floor,
    ground: floor.bottom + (portrait ? h * 0.02 : h * 0.01),
    cannons,
    wire,
    ball,
    pinata,
    poles,
    speakers,
    scaleMost: portrait ? 0.98 : 0.92,
  };
}

/**
 * How high the string of lights is at a place across the screen: sagging between the poles, and
 * drooping a little more toward the edges beyond them.
 */
function heightOfWire(wire: Wire, x: number, w: number): number {
  const middle = (wire.left + wire.right) / 2;
  const half = (wire.right - wire.left) / 2;
  const t = (x - middle) / half;
  if (Math.abs(t) <= 1) return wire.y + wire.sag * (1 - t * t);
  const pole = x < middle ? wire.left : wire.right;
  const edge = x < middle ? 0 : w;
  const along = Math.min(1, Math.max(0, (x - pole) / (edge - pole)));
  return wire.y + wire.sag * 0.35 * along;
}

export const wireAt = (plan: Plan, x: number): number => heightOfWire(plan.wire, x, plan.w);

/** The left and right edges of the floor at a depth, from 0 at the back to 1 at the front. */
export function floorEdges(f: FloorShape, depth: number): { left: number; right: number } {
  return { left: lerp(f.topLeft, f.bottomLeft, depth), right: lerp(f.topRight, f.bottomRight, depth) };
}

export const floorY = (f: FloorShape, depth: number): number => lerp(f.top, f.bottom, depth);

/**
 * How far down the floor each row of tiles starts, so the rows near the front are taller, the way a
 * floor going away from you is.
 */
export function rowDepths(rows: number): number[] {
  return Array.from({ length: rows + 1 }, (_, i) => (i / rows) ** 1.35);
}

/**
 * How many friends stand in each row, from the back to the front. The rows are chosen so that each
 * is between the gaps of the one in front of it, and the first friend, who is the leader, stands in
 * the middle of the front.
 */
const ROWS: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [2, 3],
  6: [3, 2, 1],
};

/**
 * How many steps apart the friends of a row stand, where it is not one. Two rows of two would hide
 * each other, so for four the back pair stands wide of the front pair, and for three the back pair
 * stands a little wide of the one in front.
 */
const SPREAD: Readonly<Record<number, readonly number[]>> = {
  3: [1.5, 1],
  4: [3, 1],
};

/**
 * How much bigger a friend is drawn when there are only a few of them, so that one or two on the
 * floor are not lost on it.
 */
const GROW: Readonly<Record<number, number>> = { 1: 1.22, 2: 1.16, 3: 1.08, 4: 1, 5: 1, 6: 1 };

/** How far down the floor each row stands, for each number of rows, from the back to the front. */
const DEPTHS: Readonly<Record<number, readonly number[]>> = {
  1: [0.7],
  2: [0.34, 0.78],
  3: [0.2, 0.5, 0.82],
};

/**
 * The places `n` friends dance, the first being the leader in the middle of the front, and then
 * outward and back, so that if only a few are in the herd they are in front and the floor looks
 * full. A row is a step apart and the next row stands in the gaps.
 */
export function slotsOf(n: number, plan: Plan): Slot[] {
  const counts = ROWS[Math.min(6, Math.max(1, n))] ?? ROWS[6]!;
  if (n <= 0) return [];
  const depths = DEPTHS[counts.length]!;
  const middle = plan.w / 2;
  const widest = Math.max(...counts);
  const mid = floorEdges(plan.floor, depths[Math.floor(depths.length / 2)]!);
  // One step between friends of a row. A pair does not stand a whole floor apart.
  const step = Math.min(((mid.right - mid.left) * ROW_USE) / (widest + 0.35), plan.portrait ? 120 : 175);
  const slots: Slot[] = [];
  counts.forEach((count, row) => {
    const depth = depths[row]!;
    const scale = Math.min(lerp(0.6, plan.scaleMost * GROW[Math.min(n, 6)]!, depth), step / (FOOTPRINT * 0.86));
    // A wide row is kept on the floor, which is narrower at the back.
    const edges = floorEdges(plan.floor, depth);
    const gap = Math.min(step * (SPREAD[n]?.[row] ?? 1), ((edges.right - edges.left) * ROW_USE) / (count - 1 + 0.35));
    for (let i = 0; i < count; i++) {
      const x = middle + (i - (count - 1) / 2) * gap;
      slots.push({ x, y: floorY(plan.floor, depth), scale, home: x < middle - 1 ? 1 : x > middle + 1 ? -1 : 1, depth });
    }
  });
  // The front and the middle first.
  return slots.sort((a, b) => b.depth - a.depth || Math.abs(a.x - middle) - Math.abs(b.x - middle) || a.x - b.x);
}
