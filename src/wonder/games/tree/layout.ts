import { chromeOf } from '../../engine/chrome';
import { clamp } from '../../engine/ease';
import { CROWN, GIFT, HOOKS, LIGHTS, type Spot, TREE_HEIGHT, TREE_WIDTH } from './shape';

/** What lies in the tray, which is what the player hangs. */
export const ORNAMENTS = ['ball-red', 'ball-blue', 'ball-gold', 'cane', 'bell', 'star'] as const;
export type Ornament = (typeof ORNAMENTS)[number];

/** The half width of a place in the tray, in units, and the gap between their middles. */
export const TRAY_RADIUS = 23;
const TRAY_GAP = 52;
const MARGIN = 8;
/** A screen at least this much wider than it is tall has its tray at the side. */
const WIDE = 1.3;

export interface Plan {
  /** The tree: its middle, its tip, the foot of its trunk, and how many units one of its own is. */
  readonly tree: { readonly x: number; readonly top: number; readonly foot: number; readonly scale: number };
  /** Where the ornaments hang, and the string of lights, on the screen. */
  readonly hooks: readonly Spot[];
  readonly lights: readonly Spot[];
  /** How big an ornament is on each hook, as a share of its picture. */
  readonly sizes: readonly number[];
  /** The middle of the star on top, and how big its picture is. */
  readonly star: Spot;
  readonly starSize: number;
  /** The middle of each place in the tray, in the order of `ORNAMENTS`. */
  readonly tray: readonly Spot[];
  /** The box the tray stands in. */
  readonly shelf: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Where the bases of the presents stand under the tree at the end, and how big they are. */
  readonly gifts: readonly Spot[];
  readonly giftScale: number;
  /** Where the snow begins. */
  readonly ground: number;
  /** How near a hook an ornament must be let go to hang there. */
  readonly reach: number;
}

/** Where the places of the tray are, the box round them, and the room it leaves for the tree. */
interface Tray {
  readonly at: readonly Spot[];
  readonly shelf: Plan['shelf'];
  /** The tree may use the screen from here to the right. */
  readonly left: number;
  /** The tree may use the screen down to here. */
  readonly floor: number;
}

const BOX = TRAY_RADIUS + 8;

/** Two columns of three at the left, below the way out, for a screen that is wide and not tall. */
function sideTray(h: number, below: number): Tray {
  const gapX = TRAY_RADIUS * 2 + 8;
  const gapY = TRAY_RADIUS * 2 + 10;
  const x = MARGIN + BOX;
  const rows = ORNAMENTS.length / 2;
  const tall = (rows - 1) * gapY + BOX * 2;
  const top = below + (h - MARGIN - below - tall) / 2;
  const at = ORNAMENTS.map((_, i): Spot => ({ x: x + (i % 2) * gapX, y: top + BOX + Math.floor(i / 2) * gapY }));
  return {
    at,
    shelf: { x: MARGIN, y: top, w: gapX + BOX * 2, h: tall },
    left: MARGIN + gapX + BOX * 2 + 14,
    floor: h - 16,
  };
}

/**
 * One row along the bottom of the screen, centred. Where the buttons that come at the end would
 * cover it, it moves to the left, and where they would cover it there it is raised above them.
 */
function rowTray(w: number, h: number, finish: { x0: number; y0: number }): Tray {
  const width = (ORNAMENTS.length - 1) * TRAY_GAP + TRAY_RADIUS * 2;
  const fits = (x0: number): boolean => x0 + width <= finish.x0 - MARGIN;
  let x0 = (w - width) / 2;
  let y = h - BOX - 6;
  if (!fits(x0)) x0 = MARGIN;
  if (!fits(x0)) {
    x0 = Math.max(MARGIN, (w - width) / 2);
    y = finish.y0 - BOX - 4;
  }
  const at = ORNAMENTS.map((_, i): Spot => ({ x: x0 + TRAY_RADIUS + i * TRAY_GAP, y }));
  return {
    at,
    shelf: { x: x0 - 8, y: y - BOX, w: width + 16, h: BOX * 2 },
    left: 0,
    floor: y - BOX - 10,
  };
}

/**
 * Where everything is for a screen of this size in units, with `unit` CSS pixels to the unit. The
 * tree takes the middle between the stars at the top and the tray. On a wide screen the tray stands
 * at the left, and the tree has the whole height of the screen. On any other it lies along the
 * bottom.
 */
export function planOf(w: number, h: number, unit: number): Plan {
  const over = chromeOf({ w, h, unit });
  const tray = w >= h * WIDE ? sideTray(h, over.wayOut.y1 + 8) : rowTray(w, h, over.finish);
  const foot = tray.floor;
  // What is above the tip of the tree is the star, and above that the row of stars of the meter.
  const sky = Math.max(over.meter.y1, h * 0.04) + 14;
  const across = w - tray.left;
  const scale = clamp(Math.min((foot - sky) / (TREE_HEIGHT + CROWN), (across - 28) / TREE_WIDTH), 0.5, 4);
  const giftScale = clamp(scale * 0.34, 0.8, 1.3);
  const gift = (GIFT.w / 2 + 6) * giftScale;
  // Where the buttons that come at the end would cover the foot of the tree, it stands clear of them.
  const low = foot > over.finish.y0 - 40;
  const edge = low ? over.finish.x0 - MARGIN : w;
  const want = 1.2 * (TREE_WIDTH / 2) * scale;
  let x = tray.left + across / 2;
  if (low) x = Math.max(Math.min(x, edge - want - gift), tray.left + (TREE_WIDTH / 2 + 4) * scale);
  const tree = { x, top: foot - TREE_HEIGHT * scale, foot, scale };
  // The four presents stand in a row across the foot of the tree, as far out as there is room.
  const span = Math.max(30, Math.min(want, x - tray.left - gift, edge - x - gift));
  const at = (s: Spot): Spot => ({ x: tree.x + s.x * scale, y: tree.top + s.y * scale });
  const base = clamp(scale * 0.32, 0.55, 1);
  return {
    tree,
    hooks: HOOKS.map(at),
    lights: LIGHTS.map(at),
    // An ornament is bigger the lower it hangs, as if the tree came toward the player.
    sizes: HOOKS.map((s) => base * (0.72 + 0.34 * clamp(s.y / 92))),
    star: at({ x: 0, y: -7.6 }),
    starSize: 17.4 * scale,
    tray: tray.at,
    shelf: tray.shelf,
    gifts: [-1, -0.52, 0.56, 1].map((u): Spot => ({ x: tree.x + u * span, y: foot - 3 })),
    giftScale,
    ground: foot - 5 * scale,
    reach: 54 + scale * 7,
  };
}

/**
 * The free hook nearest a point, or null when none is within `reach` of it. A hook that has an
 * ornament is not free.
 */
export function nearestFree(
  hooks: readonly Spot[],
  taken: ReadonlySet<number>,
  x: number,
  y: number,
  reach: number,
): number | null {
  let best: number | null = null;
  let bestD = reach * reach;
  hooks.forEach((hook, i) => {
    if (taken.has(i)) return;
    const d = (hook.x - x) ** 2 + (hook.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The place of the tray that a point is on, or null. */
export function slotAt(tray: readonly Spot[], x: number, y: number): number | null {
  let best: number | null = null;
  let bestD = (TRAY_RADIUS + 9) ** 2;
  tray.forEach((slot, i) => {
    const d = (slot.x - x) ** 2 + (slot.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
