import { chrome, type Rect, type Screen } from '../../engine/chrome';
import { type Constellation, mirror, type Spot } from './constellations';

/** Where a picture goes: the left and the top of its sheet, and how wide it is. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** How big a star is, from its middle to the tip of a point. */
  readonly r: number;
  /** Whether it hangs as a mirror image, which it does when that lets it be bigger. */
  readonly flipped: boolean;
  /**
   * Whether it found room that keeps clear of everything it was told to avoid. If not it is the
   * smallest size, put in the middle.
   */
  readonly clear: boolean;
}

/** The smallest a picture may be. Smaller than this the faces are not faces. */
export const SMALLEST = 130;
/**
 * How far a star's body reaches from its middle, in radii, to the side, above (with its nightcap)
 * and below.
 */
const BODY = { side: 1.05, above: 1.75, below: 1.0 };

/**
 * Puts a picture of stars on the screen as big as it can be. The screen has things drawn over it
 * that a finger and an eye must not lose a star behind: the way out, the five stars of the meter,
 * the buttons in the corner. Rather than shrink the picture to sit below all of them, this slides
 * it about and tries each size from the largest down, and takes the first that has no star under
 * anything, nearest the middle of the room. A tall screen has room for it anywhere. A short one
 * tucks the head of the unicorn into the gap between the meter and the corner.
 *
 * `room` is where the middle of a star may be.
 */
export function placePicture(picture: Constellation, room: Rect, avoid: readonly Rect[]): Placement {
  const roomW = room.x1 - room.x0;
  const roomH = room.y1 - room.y0;
  const biggest = Math.min(roomW, roomH / picture.aspect);
  const centre = { x: (room.x0 + room.x1) / 2, y: (room.y0 + room.y1) / 2 };
  const step = 6;
  const ways = picture.handed ? [picture, mirror(picture)] : [picture];
  for (let width = biggest; width >= SMALLEST; width *= 0.97) {
    const height = width * picture.aspect;
    const r = width * picture.starShare;
    let best: { x: number; y: number; cost: number; flipped: boolean } | null = null;
    for (const [i, way] of ways.entries()) {
      for (let y = room.y0; y <= room.y1 - height + 1e-6; y += step) {
        for (let x = room.x0; x <= room.x1 - width + 1e-6; x += step) {
          if (!keepsClear(way, x, y, width, r, avoid)) continue;
          const cost = Math.abs(x + width / 2 - centre.x) + 0.7 * Math.abs(y + height / 2 - centre.y);
          if (!best || cost < best.cost) best = { x, y, cost, flipped: i === 1 };
        }
      }
    }
    if (best) return { x: best.x, y: best.y, width, r, flipped: best.flipped, clear: true };
  }
  const width = Math.min(SMALLEST, biggest);
  const at = { x: centre.x - width / 2, y: centre.y - (width * picture.aspect) / 2 };
  return { ...at, width, r: width * picture.starShare, flipped: false, clear: false };
}

/**
 * The picture as it hangs: the picture, mirrored if the placement says so, with each star put where
 * it goes on the screen.
 */
export function hung(picture: Constellation, at: Placement): { readonly shape: Constellation; readonly spots: Spot[] } {
  const shape = at.flipped ? mirror(picture) : picture;
  return { shape, spots: shape.points.map((p) => ({ x: at.x + p.x * at.width, y: at.y + p.y * at.width })) };
}

/**
 * Whether no star of the picture, put here, has any of its body under one of the rectangles. A
 * star's body is a box: its width across, a little more than its height below the middle, and above
 * the middle the height of its nightcap, which is a good deal.
 */
function keepsClear(
  picture: Constellation,
  x: number,
  y: number,
  width: number,
  r: number,
  avoid: readonly Rect[],
): boolean {
  const side = r * BODY.side + 2;
  const above = r * BODY.above + 2;
  const below = r * BODY.below + 2;
  for (const p of picture.points) {
    const sx = x + p.x * width;
    const sy = y + p.y * width;
    for (const a of avoid) {
      if (sx + side > a.x0 && sx - side < a.x1 && sy + below > a.y0 && sy - above < a.y1) return false;
    }
  }
  return true;
}

/** Where everything stands on a screen. */
export interface Plan {
  /** The ground the cannon and the friends stand on. */
  readonly feet: number;
  /** The wheel of the cannon, and how big it is drawn. */
  readonly cannon: { readonly x: number; readonly scale: number };
  readonly picture: Placement;
}

/** How high above the ground a friend's head comes, so the picture keeps above it. */
const HEADS = 84;
/**
 * How near the side of the screen the middle of a star may come, which keeps it out from under a
 * notch.
 */
const EDGE = 32;

export function plan(s: Screen, picture: Constellation): Plan {
  const feet = s.h - 30;
  const cannon = { x: Math.max(74, s.w * 0.1), scale: 0.95 };
  const room: Rect = { x0: EDGE, y0: 34, x1: s.w - EDGE, y1: feet - HEADS };
  return { feet, cannon, picture: placePicture(picture, room, chrome(s)) };
}

/**
 * Where the moon or the sun goes: the place the stars and the page's buttons are farthest from, so
 * the picture and the moon do not sit on each other. The moon may go anywhere in the sky, and
 * prefers the top of it. The sun sits on the horizon, so it only slides along it.
 */
export function orbSpot(spots: readonly Spot[], r: number, s: Screen, horizon: number, sits: 'sky' | 'horizon'): Spot {
  const over = chrome(s);
  const score = (x: number, y: number): number => {
    let near = Infinity;
    for (const p of spots) near = Math.min(near, Math.hypot(x - p.x, y - p.y));
    let clear = Infinity;
    for (const a of over)
      clear = Math.min(clear, Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.y0 - y, 0, y - a.y1)));
    return Math.min(near, clear * 1.3) - (sits === 'sky' ? 0.2 * y : 0);
  };
  let best: Spot = { x: s.w * 0.85, y: horizon * 0.4 };
  let bestScore = -Infinity;
  const ys = sits === 'horizon' ? [horizon - 2] : range(r + 28, horizon - r - 36, 12);
  for (const y of ys) {
    for (const x of range(r + 28, s.w - r - 28, 12)) {
      const here = score(x, y);
      if (here > bestScore) {
        bestScore = here;
        best = { x, y };
      }
    }
  }
  return best;
}

/** A circle of open sky: where a burst may open, and how far it may reach. */
export interface Opening {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * The widest open sky: the largest circle that fits in a strip of sky beside, above or below the
 * picture and above the horizon. The great burst that ends the finale opens there, so it frames the
 * picture and does not wash it out.
 */
export function openSky(s: Screen, at: Placement, aspect: number, horizon: number): Opening {
  const pad = at.r * 1.4 + 6;
  const box = { x0: at.x - pad, y0: at.y - pad, x1: at.x + at.width + pad, y1: at.y + at.width * aspect + pad };
  // Below the page's buttons, which fill the top of the screen.
  const top = Math.max(8, 80 / s.unit);
  const strips: Rect[] = [
    { x0: box.x1, y0: top, x1: s.w - 8, y1: horizon },
    { x0: 8, y0: top, x1: box.x0, y1: horizon },
    { x0: 8, y0: top, x1: s.w - 8, y1: box.y0 },
    { x0: 8, y0: box.y1, x1: s.w - 8, y1: horizon },
  ];
  let best: Opening = { x: at.x + at.width / 2, y: at.y + (at.width * aspect) / 2, r: 0 };
  for (const a of strips) {
    const r = Math.min(a.x1 - a.x0, a.y1 - a.y0) / 2;
    if (r > best.r) best = { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2, r };
  }
  return best;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-6; v += step) out.push(v);
  return out.length > 0 ? out : [(from + to) / 2];
}
