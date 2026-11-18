import { RAIN_KINDS } from '../../../content/rain';
import { chromeOf } from '../../engine/chrome';
import { clamp } from '../../engine/ease';

/**
 * Where everything in the treasure vault is, for the size of the screen. The sky is open at the top
 * and the treasure comes down through the whole screen; the chest it goes into stands at the bottom
 * with three heaps in it, one for each kind, and the friends stand on the floor in front. Held
 * sideways the friends are on the left and the chest to the right of them, and upright the chest is
 * in the middle with the friends in a row under it.
 */

/**
 * The chest, in units, seen from the front and a little above. Its sizes are all shares of its
 * width.
 */
export interface Chest {
  /** The middle of it and the line of its front rim, which is where the treasure goes in. */
  readonly x: number;
  readonly rim: number;
  readonly w: number;
  /** How tall the front panel is under the rim, and the back wall and the open lid over it. */
  readonly front: number;
  readonly back: number;
  readonly lid: number;
}

export interface Bay {
  /** Where the heap's middle is and how wide it may spread. */
  readonly x: number;
  readonly half: number;
}

export interface Stand {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface Plan {
  readonly w: number;
  readonly h: number;
  readonly portrait: boolean;
  /** Where the sky ends and the wall begins. */
  readonly sky: number;
  /** Where the wall meets the floor. */
  readonly floor: number;
  /**
   * The chest while the player plays, and in the finale, when it comes to the middle and is shown
   * off.
   */
  readonly chest: Chest;
  readonly centre: Chest;
  /**
   * The clock at the top: where its middle is, how far out it reaches, and how much it is drawn
   * smaller than its own 25 units.
   */
  readonly clock: { readonly x: number; readonly y: number; readonly r: number; readonly scale: number };
  readonly friendScale: number;
  readonly friendStep: number;
  readonly friendY: number;
  /** Where pieces begin to fade, so that they do not go on falling through the floor. */
  readonly fadeFrom: number;
}

/** The clock's reach in its own units. */
export const CLOCK_R = 25;

/** The chest at a given middle, with its parts in proportion. */
function chestAt(x: number, rim: number, w: number): Chest {
  return { x, rim, w, front: w * 0.31, back: w * 0.27, lid: w * 0.21 };
}

/**
 * The three heaps: gems on the left, gold in the middle, money on the right, side by side inside
 * the chest.
 */
export function baysOf(chest: Chest): readonly Bay[] {
  const inner = chest.w * 0.8;
  const half = inner / RAIN_KINDS.length / 2;
  return RAIN_KINDS.map((_, i) => ({ x: chest.x - inner / 2 + half + i * half * 2, half }));
}

/** Where everything is for a screen this size. */
export function planOf(w: number, h: number, unit: number): Plan {
  const portrait = h > w;
  const chestW = portrait ? clamp(Math.min(w * 0.62, h * 0.3), 140, 230) : clamp(h * 0.52, 150, 200);
  const friendScale = portrait ? 0.56 : 0.5;
  const friendStep = portrait ? 46 : 40;
  const friendY = h - (portrait ? 12 : 14);
  const rim = h - (portrait ? 70 : 20) - chestW * 0.31;
  const sky = portrait ? h * 0.2 : h * 0.27;
  const floor = portrait ? h - 120 : h - 70;
  const herdEnd = 40 + 5 * friendStep + 28;
  const x = portrait ? w / 2 : Math.max(w / 2, herdEnd + chestW / 2 + 22);
  const chest = chestAt(Math.min(x, w - chestW / 2 - 14), rim, chestW);
  const centre = chestAt(w / 2, rim, chestW);
  // The clock sits in the gap on the top row between the way out and whatever is next to it: the
  // stars when the screen is wide, and the sound and settings buttons when the stars have moved to
  // a row of their own.
  const ch = chromeOf({ w, h, unit });
  // The buttons are as big as a thumb on any screen, so on a big screen they are small in units,
  // and the clock is drawn to match them.
  const scale = clamp(1.08 / unit, 0.5, 1);
  const from = ch.wayOut.x1;
  const to = ch.meter.y0 > 0 ? ch.corner.x0 : ch.meter.x0;
  const r = CLOCK_R * scale;
  // On a narrow screen the four buttons in the corner leave no gap that is wide enough, so the clock
  // goes to the left of the row of stars, under the way out.
  const clock =
    to - from >= 2 * r + 12
      ? { x: from + Math.min((to - from) / 2, 52), y: (ch.wayOut.y1 - ch.wayOut.y0) / 2, r, scale }
      : { x: ch.meter.x0 / 2, y: (ch.meter.y0 + ch.meter.y1) / 2, r, scale };
  return { w, h, portrait, sky, floor, chest, centre, clock, friendScale, friendStep, friendY, fadeFrom: friendY - 54 };
}

/**
 * Where the friends stand: along the floor from the left, or in a row under the chest. The first,
 * Wildstar, is the nearest the chest sideways.
 */
export function standsOf(n: number, plan: Plan): Stand[] {
  const out: Stand[] = [];
  const step = Math.min(plan.friendStep, (plan.w - 40) / Math.max(1, n));
  if (plan.portrait) {
    for (let i = 0; i < n; i++) {
      const slot = i === 0 ? 0 : i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
      out.push({
        x: plan.w / 2 + slot * step + (n % 2 === 0 ? step / 2 : 0),
        y: plan.friendY + (i % 2) * 4,
        scale: plan.friendScale,
      });
    }
    return out;
  }
  const left = 40;
  for (let i = 0; i < n; i++) out.push({ x: left + i * step, y: plan.friendY + (i % 2) * 4, scale: plan.friendScale });
  return out;
}
