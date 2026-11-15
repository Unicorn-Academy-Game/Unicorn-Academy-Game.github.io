import { clamp, smooth } from '../../engine/ease';
import { type Cloud, ROWS, type World } from './world';

/**
 * The finale's flight: the way from wherever she stands up through the sky to the moon, as one
 * smooth curve that weaves over a cloud of every row on the way, and how fast she goes along it. A
 * long way takes longer than a short one but not by as much as it is longer, so from low down it is
 * a rocket and from the top it is a leap.
 */

/** Where she is on the curve, and which way it is going. */
export interface Spot {
  x: number;
  y: number;
  /** Radians, 0 being to the right and negative up, as on the screen. */
  angle: number;
}

export const newSpot = (): Spot => ({ x: 0, y: 0, angle: -Math.PI / 2 });

/** A cloud the curve passes, and how far along it. */
export interface Pass {
  readonly s: number;
  readonly cloud: Cloud;
}

/** How high above the standing line of the gate the door to the moon is, and how big. */
export const PORTAL_RISE = 128;
export const PORTAL_RADIUS = 86;

/** How far above a cloud the curve goes over it, so she is over it and not in it. */
const OVER = 14;
/** How many points of the curve there are between one cloud and the next. */
const DETAIL = 14;
/**
 * How many points either side the sideways swing is averaged over, which is what rounds the corners
 * where the way changes side.
 */
const ROUND = 11;

export class Ascent {
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  /** How far along the curve each point is. */
  private readonly along: number[] = [];
  readonly passes: Pass[] = [];
  readonly length: number;
  /** How long the flight takes. */
  readonly seconds: number;
  readonly portal: { readonly x: number; readonly y: number };

  /**
   * `from` is where her hooves are, and `row` the row of the cloud she stands on, which is -1 for
   * the mushroom.
   */
  constructor(world: World, from: { readonly x: number; readonly y: number; readonly row: number }) {
    const gate = world.gate;
    this.portal = { x: gate.x, y: gate.y - PORTAL_RISE };
    // The knots the curve goes through: where she is, the nearest cloud of each row above her, and
    // the door.
    const knots: { x: number; y: number; cloud: Cloud | null }[] = [{ x: from.x, y: from.y - OVER, cloud: null }];
    let x = from.x;
    for (let r = from.row + 1; r < ROWS; r++) {
      let best: Cloud | null = null;
      for (const c of world.row(r)) if (!best || Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
      if (!best) continue;
      knots.push({ x: best.x, y: best.y - OVER, cloud: best });
      x = best.x;
    }
    if (from.row < ROWS) knots.push({ x: gate.x, y: gate.y - OVER * 2, cloud: gate });
    knots.push({ x: this.portal.x, y: this.portal.y, cloud: null });

    // A curve that runs through every knot: a Catmull-Rom spline, with its end points doubled so it
    // begins and ends along the line to the next knot.
    const rawX: number[] = [knots[0]!.x];
    const rawY: number[] = [knots[0]!.y];
    const at: number[] = [0];
    for (let i = 0; i < knots.length - 1; i++) {
      const p0 = knots[Math.max(0, i - 1)]!;
      const p1 = knots[i]!;
      const p2 = knots[i + 1]!;
      const p3 = knots[Math.min(knots.length - 1, i + 2)]!;
      for (let k = 1; k <= DETAIL; k++) {
        const t = k / DETAIL;
        const t2 = t * t;
        const t3 = t2 * t;
        rawX.push(
          0.5 *
            (2 * p1.x +
              (p2.x - p0.x) * t +
              (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
              (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        );
        rawY.push(
          0.5 *
            (2 * p1.y +
              (p2.y - p0.y) * t +
              (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
              (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
        );
      }
      at.push(rawX.length - 1);
    }

    // Where the way changes side at each cloud it turns sharply. Its sideways swing is averaged
    // over a stretch either side, with less and less of the stretch toward the two ends, which
    // therefore stay where they are. The way up is not touched.
    const n = rawX.length;
    for (let i = 0; i < n; i++) {
      const h = Math.min(ROUND, i, n - 1 - i);
      let sum = 0;
      let weight = 0;
      for (let j = i - h; j <= i + h; j++) {
        const w = h + 1 - Math.abs(j - i);
        sum += rawX[j]! * w;
        weight += w;
      }
      this.xs.push(sum / weight);
      this.ys.push(rawY[i]!);
    }
    let length = 0;
    this.along.push(0);
    for (let i = 1; i < n; i++) {
      length += Math.hypot(this.xs[i]! - this.xs[i - 1]!, this.ys[i]! - this.ys[i - 1]!);
      this.along.push(length);
    }
    for (let i = 1; i < knots.length - 1; i++) {
      const cloud = knots[i]!.cloud;
      if (cloud && cloud !== gate) this.passes.push({ s: this.along[at[i]!]!, cloud });
    }
    this.length = length;
    this.seconds = clamp(2.2 + length / 420, 2.6, 9);
  }

  /**
   * How far along the curve she is `t` seconds into the flight. She starts and ends slowly and is
   * fastest in the middle.
   */
  distanceAt(t: number): number {
    return this.length * smooth(clamp(t / this.seconds));
  }

  /** The place `s` units along the curve, and which way it is going there. */
  at(s: number, out: Spot = newSpot()): Spot {
    const d = clamp(s, 0, this.length);
    // The point just before `d`, found by halving the range.
    let lo = 0;
    let hi = this.along.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.along[mid]! <= d) lo = mid;
      else hi = mid;
    }
    const span = this.along[hi]! - this.along[lo]!;
    const f = span > 1e-9 ? (d - this.along[lo]!) / span : 0;
    out.x = this.xs[lo]! + (this.xs[hi]! - this.xs[lo]!) * f;
    out.y = this.ys[lo]! + (this.ys[hi]! - this.ys[lo]!) * f;
    // Which way it goes is taken over a short stretch either side, so the turn is smooth and not a
    // series of corners.
    const a = Math.max(0, lo - 2);
    const b = Math.min(this.along.length - 1, hi + 2);
    out.angle = Math.atan2(this.ys[b]! - this.ys[a]!, this.xs[b]! - this.xs[a]!);
    return out;
  }

  /**
   * The clouds the curve crosses between two distances, the first not included and the last
   * included.
   */
  crossed(from: number, to: number, out: Pass[] = []): Pass[] {
    out.length = 0;
    for (const p of this.passes) if (p.s > from && p.s <= to) out.push(p);
    return out;
  }
}
