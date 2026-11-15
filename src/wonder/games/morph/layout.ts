import { chromeOf } from '../../engine/chrome';
import { clamp } from '../../engine/ease';

/**
 * Where everything in the workshop is, from the size of the screen. The machine stands in the
 * middle, with a hopper on the left that the fruit go into and a chute on the right that the new
 * things come out of. On a screen held sideways the fruit are on a cart at the left and the shelf
 * they end up on is at the right. On a phone held upright the machine is at the top, the shelf is
 * under it and the fruit are in a row along the bottom. Every place is in the game's own units.
 */

export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A place a friend stands: where her hooves are, and how big she is drawn. */
export interface Stand {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * The machine, drawn once and kept, in units of its own with the middle of its foot at the origin
 * and up being negative. It is `PARTS.height` tall and `PARTS.width` wide, and the plan scales it
 * to the screen.
 */
export const PARTS = {
  width: 262,
  height: 258,
  plinth: { x0: -104, x1: 104, y0: -30, y1: 0 },
  body: { x0: -84, x1: 84, y0: -150, y1: -30 },
  dome: { x: 0, y: -190, r: 54 },
  /** Where the fruit goes in, at the top of the funnel on the left. */
  hopper: { x: -104, y: -236, r: 30 },
  /** Where the pipe from the dome meets the funnel. */
  hopperPipe: { x: -64, y: -192 },
  /** Where new things come out, at the end of the chute on the right. */
  chute: { x: 120, y: -46, r: 20 },
  chimney: { x: 58, y0: -150, y1: -224, w: 26 },
  whistle: { x: 58, y: -230, r: 24 },
  lever: { x: -84, y: -96, length: 56, r: 24 },
  gauge: { x: -34, y: -90, r: 25 },
  gear: { x: 30, y: -92, r: 28 },
  lamps: [-60, -30, 0, 30, 60].map((x) => ({ x, y: -136 })),
} as const;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Plan {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  /** The line where the grass of the meadow begins, at the back. */
  readonly horizon: number;
  /** How much the machine's own units are scaled to the screen. */
  readonly s: number;
  readonly machine: { readonly x: number; readonly y: number };
  readonly hopper: Spot;
  readonly dome: Spot;
  readonly chute: Spot;
  readonly lever: Spot;
  readonly whistle: Spot;
  readonly gauge: Spot;
  /** The fruit, in the order of the rainbow, as the places they sit and how big each is drawn. */
  readonly fruit: readonly Spot[];
  /** How big a fruit is drawn, as a multiple of its picture. */
  readonly fruitScale: number;
  /** The cart or the crate the fruit sit on, as a rectangle. */
  readonly cart: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** The shelf the new things end up on, as a rectangle, with the cells in it. */
  readonly shelf: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
    readonly cols: number;
    readonly rows: number;
    readonly cell: number;
  };
  /**
   * Where a creature the machine makes by surprise comes to rest when it is one that walks, and how
   * it is told to wander when it flies.
   */
  readonly sky: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** Where the hatchling that comes out of the machine at the end stands. */
  readonly hatch: Spot;
  /**
   * The row the friends stand in along the front: where their hooves are, how big each is drawn,
   * how far apart they are and where the middle of the row is.
   */
  readonly row: { readonly y: number; readonly scale: number; readonly step: number; readonly middle: number };
}

/** How many fruit there are on the cart. */
export const FRUIT_COUNT = 7;
/** The most a shelf holds before the oldest are taken off to make room. */
export const SHELF_CELLS = 16;

/**
 * The width a screen held sideways is designed for, in units. A narrower one scales everything down
 * together.
 */
const WIDE = 700;
/** How tall a friend is at full size, in units, to keep the fruit above her head. */
const FRIEND_HEIGHT = 120;
/** How wide a friend is at full size, side on, tail and all. */
const FRIEND_WIDTH = 128;

/** A place on the machine, in its own units, as it is on the screen. */
export const onMachine = (plan: Pick<Plan, 's' | 'machine'>, x: number, y: number): { x: number; y: number } => ({
  x: plan.machine.x + x * plan.s,
  y: plan.machine.y + y * plan.s,
});

/** The places on the machine that are touched or aimed at, put where the machine is. */
function spotsOf(
  machineX: number,
  base: number,
  s: number,
): Pick<Plan, 'hopper' | 'dome' | 'chute' | 'lever' | 'whistle' | 'gauge' | 'hatch'> {
  const at = (x: number, y: number, r: number): Spot => ({ x: machineX + x * s, y: base + y * s, r: r * s });
  return {
    hopper: at(PARTS.hopper.x, PARTS.hopper.y, PARTS.hopper.r),
    dome: at(PARTS.dome.x, PARTS.dome.y, PARTS.dome.r),
    chute: at(PARTS.chute.x, PARTS.chute.y, PARTS.chute.r),
    lever: at(PARTS.lever.x - PARTS.lever.length * 0.62, PARTS.lever.y - PARTS.lever.length * 0.74, PARTS.lever.r),
    whistle: at(PARTS.whistle.x, PARTS.whistle.y, PARTS.whistle.r),
    gauge: at(PARTS.gauge.x, PARTS.gauge.y, PARTS.gauge.r),
    hatch: at(54, -6, 48),
  };
}

export function planOf(w: number, h: number, unit = 1): Plan {
  const portrait = h > w;
  const over = chromeOf({ w, h, unit });
  const margin = Math.max(10, w * 0.03);
  const top = over.meter.y1 + 8;

  if (portrait) {
    const f = clamp(w / 360, 0.8, 1.15);
    const r = Math.min(24 * f, ((w - 16) / FRUIT_COUNT - 4) / 2);
    const scale = clamp(0.5 * f, 0.4, 0.55);
    const friendY = h - 10;
    const fruitY = friendY - FRIEND_HEIGHT * scale - 6 - r;
    const step = 2 * r + 4;
    const fruitX0 = (w - step * FRUIT_COUNT) / 2;
    const fruit: Spot[] = Array.from({ length: FRUIT_COUNT }, (_, i) => ({
      x: fruitX0 + step * (i + 0.5),
      y: fruitY,
      r,
    }));
    const cell = clamp((w - 20) / 8, 28, 42);
    const shelfBottom = fruitY - r - 8;
    const shelfTop = shelfBottom - (2 * cell + 8);
    const shelfX0 = (w - 8 * cell) / 2;
    const base = shelfTop - 8;
    const s = Math.min(1, (w - 24) / PARTS.width, Math.max(0.5, (base - top) / PARTS.height));
    const machineX = w / 2 + 4;
    return {
      w,
      h,
      portrait,
      horizon: base - PARTS.height * s * 0.55,
      s,
      machine: { x: machineX, y: base },
      ...spotsOf(machineX, base, s),
      fruit,
      fruitScale: clamp((r * 2) / 40, 0.9, 1.35),
      cart: {
        x0: fruitX0 - 4,
        y0: fruitY + r * 0.55,
        x1: fruitX0 + step * FRUIT_COUNT + 4,
        y1: fruitY + r * 0.55 + 18,
      },
      shelf: { x0: shelfX0, y0: shelfTop, x1: shelfX0 + 8 * cell, y1: shelfBottom, cols: 8, rows: 2, cell },
      sky: { x0: 14, y0: top + 2, x1: w - 14, y1: base - 10 },
      row: { y: friendY, scale, step: clamp(FRIEND_WIDTH * scale * 0.92, 40, 74), middle: w / 2 },
    };
  }

  const f = clamp(Math.min(w / WIDE, h / 360), 0.5, 1.15);
  const r = Math.max(15, 24 * f);
  const gap = 2 * r + 4;
  const cartW = gap * 4;
  // The machine is as big as fits between the star counter and the ground.
  const s = Math.min(0.94 * f, (h * 0.86 - top) / PARTS.height);
  const spanL = margin + cartW + 10;
  // The shelf is as big as the room at the right allows, and as the room above the buttons does.
  const room = w - margin - (spanL + PARTS.width * s + 16 + 10);
  let cell = clamp(Math.min(40 * f, room / 4), 24, 46);
  const machineX = Math.max(spanL + (PARTS.width * s) / 2 + 8, (spanL + (w - margin - 4 * cell - 10)) / 2);
  // Its whistle and its funnel stay out from under the star counter, so the machine is lowered
  // until they do.
  const base = Math.min(h * 0.86, Math.max(h * 0.8, top + PARTS.height * s));
  const front = base - 0.9 * r - 6;
  const fruit: Spot[] = [];
  const x0 = margin;
  for (let c = 0; c < 4; c++) fruit.push({ x: x0 + gap * (c + 0.5), y: front - 1.8 * r, r });
  for (let c = 0; c < 3; c++) fruit.push({ x: x0 + gap * (c + 1), y: front, r });
  const y1 = Math.min(base + 2, over.finish.y0 - 6);
  const y0 = over.corner.y1 + 6;
  cell = Math.min(cell, (y1 - y0 - 10) / 4);
  const shelfX1 = w - margin;
  const shelfX0 = shelfX1 - 4 * cell;
  const scale = clamp(0.5 * f + 0.06, 0.42, 0.62);
  return {
    w,
    h,
    portrait,
    horizon: h * 0.5,
    s,
    machine: { x: machineX, y: base },
    ...spotsOf(machineX, base, s),
    fruit,
    fruitScale: clamp((r * 2) / 40, 0.8, 1.35),
    cart: { x0: x0 - 6, y0: front + r * 0.8, x1: x0 + cartW + 6, y1: front + r * 0.8 + 16 },
    shelf: { x0: shelfX0, y0: y1 - (4 * cell + 10), x1: shelfX1, y1, cols: 4, rows: 4, cell },
    sky: { x0: 14, y0: over.corner.y1 + 4, x1: w - 14, y1: base - 30 },
    row: { y: h - 6, scale, step: clamp(FRIEND_WIDTH * scale * 0.92, 40, 74), middle: w * 0.46 },
  };
}

/**
 * Where `n` friends stand, the first of them, who is the leader, in the middle of the row and the
 * others going out from her one side and then the other, so that a herd of two or three is together
 * in the middle and not spread across the screen.
 */
export function standsOf(n: number, plan: Plan): Stand[] {
  const count = Math.min(6, Math.max(0, n));
  const spots = Array.from({ length: count }, (_, j) => j - (count - 1) / 2);
  spots.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  return spots.map((k) => ({ x: plan.row.middle + k * plan.row.step, y: plan.row.y, scale: plan.row.scale }));
}

/** The centre of cell `i` of the shelf, filling it from the top left and across. */
export function cellAt(plan: Plan, i: number): Cell {
  const { shelf } = plan;
  const col = i % shelf.cols;
  const row = Math.floor(i / shelf.cols);
  return { x: shelf.x0 + shelf.cell * (col + 0.5), y: shelf.y0 + 6 + shelf.cell * (row + 0.5) };
}
