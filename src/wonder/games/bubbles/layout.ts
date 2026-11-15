import { chromeOf, type Screen } from '../../engine/chrome';
import { clamp } from '../../engine/ease';
import { type Air, R_MOST } from './field';

/**
 * Where everything of the bubble garden stands on a screen, in units. A screen can be a phone on
 * its side, a tablet, a phone upright or a desktop, so nothing here is a number for one of them: it
 * is all worked out from the size. From the front of the picture to the back it goes: the machine
 * and the friends along the bottom, then the meadow with its flowers and its pond, then the hills,
 * the tree and the sky. The bubbles float over all of it, above the heads of the friends.
 */

/**
 * The machine as its picture is made, before it is scaled: how wide it is, how tall from the ground
 * to the top of its ring, and how high above the ground the middle of the ring is.
 */
export const MACHINE = { wide: 88, tall: 118, mouth: 100.5 } as const;
/**
 * The big blossom tree and the bush as their pictures are made: how far above the base of the trunk
 * or the bush a bird can sit, and how far to the side.
 */
const TREE = { perch: { dx: -50, dy: -288 } } as const;
const BUSH = { perch: { dx: -6, dy: -58 } } as const;
/**
 * The rock that stands by the pond, as drawn: where it stands from the pond's near end, how big it
 * is drawn, and how high its top is above its base.
 */
export const ROCK = { dx: -1.12, dy: 0.5, scale: 0.55, perch: { dx: 4, dy: -21 } } as const;
/** How tall a friend is at full size, from her hooves to the tip of her horn. */
export const FRIEND = 112;

export interface Slot {
  readonly x: number;
  readonly y: number;
  /** How big a flower grows here: smaller far off, bigger near. */
  readonly scale: number;
}

export interface Plan {
  /** The size of the screen. */
  readonly w: number;
  readonly h: number;
  /** The line where the far hills meet the sky. */
  readonly horizon: number;
  /** The ground the friends and the machine stand on. */
  readonly feet: number;
  /** How big the friends are at most, and how high the tallest of them reaches. */
  readonly friends: { readonly scale: number; readonly top: number };
  /** The air the bubbles float in. They leave above `top` and are held up above the friends. */
  readonly air: Air;
  /** The meadow: the band of ground between the far hills and the friends. */
  readonly meadow: { readonly top: number; readonly bottom: number };
  /**
   * The air the creatures fly in: from under the meter down to just above the heads of the friends.
   */
  readonly roam: { readonly top: number; readonly bottom: number };
  readonly machine: {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    /** The middle of the ring, where bubbles are blown from. */
    readonly mouth: { readonly x: number; readonly y: number };
    readonly half: number;
    readonly height: number;
  };
  /** The pond, an ellipse. */
  readonly pond: { readonly x: number; readonly y: number; readonly rx: number; readonly ry: number };
  /** Where flowers may grow, in the order they are tried. */
  readonly slots: readonly Slot[];
  /** Where the friends begin to stand, to the right of the machine. */
  readonly standFrom: number;
  /**
   * The tree and the bush behind the meadow: where the base of each stands, and how big its picture
   * is drawn.
   */
  readonly tree: { readonly x: number; readonly y: number; readonly scale: number };
  readonly bush: { readonly x: number; readonly y: number; readonly scale: number };
  /** Where a bird may sit: the top of the machine, the tree, the bush and the rock by the pond. */
  readonly perches: readonly { readonly x: number; readonly y: number }[];
  /** The great bubble of the finale. */
  readonly giant: { readonly x: number; readonly y: number; readonly r: number };
  /** The rainbow of the finale and of the rainbow prize: its two feet on the ground and its top. */
  readonly rainbow: { readonly x0: number; readonly x1: number; readonly baseY: number; readonly top: number };
  /** How many bubbles the machine keeps in the air at once. */
  readonly crowd: number;
}

/**
 * How inside the pond a point is: under 1 is in it, and the number is how far from the middle in
 * the pond's own units.
 */
export const insidePond = (pond: Plan['pond'], x: number, y: number): number =>
  Math.hypot((x - pond.x) / pond.rx, (y - pond.y) / pond.ry);

/** About how far apart the rows and the columns of places to grow a flower are. */
const ROW = 22;
const COLUMN = 38;

export function planOf(s: Screen): Plan {
  const chrome = chromeOf(s);
  const tall = s.w / s.h < 0.9;
  const feet = s.h * 0.94;
  const friendScale = clamp(s.h * 0.0017, 0.45, 0.66);
  const friendsTop = feet - FRIEND * friendScale - (tall ? 15 * friendScale : 0);
  // A tall screen has more room for ground than for sky.
  const horizon = s.h * (tall ? 0.5 : 0.55);
  const scale = clamp(Math.min(s.h * 0.0027, s.w * 0.0026), 0.75, 1.05);
  const mx = clamp(s.w * 0.17, MACHINE.wide * scale * 0.6 + 12, s.w * 0.3);
  const my = Math.min(feet + 8, s.h - 14 * scale);
  const machine = {
    x: mx,
    y: my,
    scale,
    mouth: { x: mx, y: my - MACHINE.mouth * scale },
    half: (MACHINE.wide * scale) / 2,
    height: MACHINE.tall * scale,
  };
  const meadow = { top: horizon + 12, bottom: friendsTop - 6 };
  const band = meadow.bottom - meadow.top;
  const pondRx = clamp(s.w * 0.17, 70, 190);
  const pond = {
    x: s.w * 0.72,
    y: meadow.top + band * 0.5,
    rx: pondRx,
    ry: clamp(band * 0.4, 16, Math.min(46, pondRx * 0.4)),
  };
  // Flowers may grow at any place of a staggered lattice across the meadow, the far rows smaller,
  // never in the water and never under the machine.
  const slots: Slot[] = [];
  const rows = clamp(Math.round(band / ROW), 3, 6);
  const columns = Math.max(4, Math.round(s.w / COLUMN));
  for (let row = 0; row < rows; row++) {
    const y = meadow.top + (band * (row + 0.5)) / rows;
    for (let i = 0; i < columns; i++) {
      const x = ((i + 0.5 + (row % 2) * 0.5) / columns) * s.w;
      if (x < 24 || x > s.w - 24) continue;
      if (insidePond(pond, x, y) < 1.2) continue;
      if (Math.abs(x - machine.x) < machine.half + 22) continue;
      slots.push({ x, y, scale: 0.55 + (0.35 * row) / (rows - 1) });
    }
  }
  const tree = { x: s.w * 0.42, y: horizon + 16, scale: clamp(s.h * 0.0011, 0.32, 0.5) };
  const bush = { x: s.w * 0.9, y: horizon + 14, scale: clamp(s.h * 0.0014, 0.5, 0.8) };
  const standFrom = machine.x + machine.half + 30;
  const top = chrome.meter.y1 + 8;
  const giantR = Math.min((friendsTop - 6 - top) / 2, s.w * 0.3);
  const rainbowBase = horizon + 10;
  return {
    w: s.w,
    h: s.h,
    horizon,
    feet,
    friends: { scale: friendScale, top: friendsTop },
    air: { w: s.w, top: -R_MOST * 1.2, floor: friendsTop - 6 },
    meadow,
    roam: { top: top + 24, bottom: friendsTop - 14 },
    machine,
    pond,
    slots,
    standFrom,
    tree,
    bush,
    perches: [
      { x: machine.x, y: machine.y - MACHINE.tall * scale - 1 },
      { x: tree.x + TREE.perch.dx * tree.scale, y: tree.y + TREE.perch.dy * tree.scale },
      { x: bush.x + BUSH.perch.dx * bush.scale, y: bush.y + BUSH.perch.dy * bush.scale },
      { x: pond.x + ROCK.dx * pond.rx + ROCK.perch.dx, y: pond.y + ROCK.dy * pond.ry + ROCK.perch.dy },
    ],
    giant: { x: s.w / 2, y: top + giantR, r: giantR },
    rainbow: {
      x0: s.w * 0.08,
      x1: s.w * 0.92,
      baseY: rainbowBase,
      top: Math.max(top, rainbowBase - Math.min(s.w * 0.42, s.h * 0.6)),
    },
    crowd: clamp(Math.round((s.w * friendsTop) / 28000), 6, 11),
  };
}
