import type { Vec2 } from '../shared/ids';
import { CONFIG } from './config';
import { dist } from './geometry';

/** The direction of travel along a trail, and how straight it is there (see `Trail.bendAt`). */
export interface Bend {
  tangent: Vec2;
  straight: number;
}

interface Crumb {
  x: number;
  y: number;
  /** Arc length from the start of the recorded path. */
  s: number;
}

/**
 * The path Wildstar actually walked, as breadcrumbs with arc length. Followers walk along it, so
 * they take the same corners as the leader and never cut across a bend that the leader had to
 * round.
 *
 * Breadcrumbs are dropped about every 16 units and at every corner the movement system reports, so
 * a straight segment between two crumbs is always a segment the leader really walked.
 */
export class Trail {
  private crumbs: Crumb[] = [];
  private start = 0;
  private headPos: Vec2;
  private headS = 0;
  private changes = 0;

  constructor(origin: Vec2) {
    this.headPos = { x: origin.x, y: origin.y };
    this.crumbs.push({ x: origin.x, y: origin.y, s: 0 });
  }

  /** Arc length of the leader's current position. */
  get head(): number {
    return this.headS;
  }

  /**
   * Counts every change to the trail, so anything worked out from it can tell when it is out of
   * date.
   */
  get revision(): number {
    return this.changes;
  }

  /** Arc length of the oldest retained point. */
  get tail(): number {
    return this.crumbs[this.start]!.s;
  }

  get headPoint(): Vec2 {
    return this.headPos;
  }

  /**
   * Replaces the whole trail with a polyline ordered from oldest to newest. Used to seed arrivals
   * and loads. The arc length of the newest point is the length of the polyline, unless `head` says
   * what it is: a trail that is laid again under a herd that is already walking it keeps the
   * numbers the herd was given, so each one is still where its own arc length says.
   */
  seed(points: readonly Vec2[], head?: number): void {
    this.changes++;
    const first = points[0]!;
    this.crumbs = [{ x: first.x, y: first.y, s: 0 }];
    this.start = 0;
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      s += dist(points[i - 1]!, points[i]!);
      this.crumbs.push({ x: points[i]!.x, y: points[i]!.y, s });
    }
    const last = points[points.length - 1]!;
    this.headPos = { x: last.x, y: last.y };
    if (head !== undefined) {
      const shift = head - s;
      for (const c of this.crumbs) c.s += shift;
      s = head;
    }
    this.headS = s;
  }

  /** Records the leader's new position. `corner` forces a crumb so bends are kept exactly. */
  push(pos: Vec2, corner = false): void {
    this.changes++;
    const last = this.crumbs[this.crumbs.length - 1]!;
    const d = dist(last, pos);
    this.headS = last.s + d;
    this.headPos = { x: pos.x, y: pos.y };
    if (d >= CONFIG.herd.crumb || (corner && d > 0.5)) this.crumbs.push({ x: pos.x, y: pos.y, s: this.headS });
    this.trim();
  }

  private trim(): void {
    const cutoff = this.headS - CONFIG.herd.retention;
    // Keep one crumb at or before the cutoff so interpolation near it stays valid.
    while (this.start + 1 < this.crumbs.length && this.crumbs[this.start + 1]!.s <= cutoff) this.start++;
    if (this.start > 256) {
      this.crumbs = this.crumbs.slice(this.start);
      this.start = 0;
    }
  }

  /** The point at arc length `s`, clamped to the retained range. */
  pointAt(s: number): Vec2 {
    const c = this.crumbs;
    const last = c[c.length - 1]!;
    if (s >= this.headS) return { x: this.headPos.x, y: this.headPos.y };
    if (s <= c[this.start]!.s) return { x: c[this.start]!.x, y: c[this.start]!.y };
    // The final span runs from the last crumb to the live head.
    if (s >= last.s) return this.lerpSpan(last, { x: this.headPos.x, y: this.headPos.y, s: this.headS }, s);
    let lo = this.start,
      hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid]!.s <= s) lo = mid;
      else hi = mid;
    }
    return this.lerpSpan(c[lo]!, c[hi]!, s);
  }

  private lerpSpan(a: Crumb, b: Crumb, s: number): Vec2 {
    const span = b.s - a.s;
    const t = span < 1e-9 ? 0 : (s - a.s) / span;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /**
   * Unit direction of travel at arc length `s`, measured over `span` units on each side, and how
   * straight the trail is there: the chord between the two ends over the trail between them, 1 on a
   * straight and near 0 in a hairpin. A wider span turns corners more slowly, which is what lets a
   * follower's sideways offset swing round a bend instead of snapping across it. In a hairpin the
   * direction reverses in one step, so the offset is scaled by `straight` and passes through zero
   * on its way to the other side.
   */
  bendAt(s: number, span: number): Bend {
    const from = Math.max(this.tail, s - span);
    const to = Math.min(this.headS, s + span);
    const a = this.pointAt(from);
    const b = this.pointAt(to);
    const chord = dist(a, b);
    return {
      tangent: chord < 1e-6 ? { x: 1, y: 0 } : { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord },
      straight: to - from < 1e-6 ? 1 : chord / (to - from),
    };
  }

  /**
   * Arc length of the trail point nearest to `p` within `[from, to]`, with its distance. Used to
   * join the trail from the side. A window that lies off either end of the retained trail, as one
   * does while the trail is shorter than a follower's gap, is held to that end instead of being
   * empty.
   */
  nearest(p: Vec2, from: number, to: number): { s: number; d: number } {
    const lo = Math.min(Math.max(from, this.tail), this.headS);
    const hi = Math.min(Math.max(to, this.tail), this.headS);
    let bestS = lo;
    let bestD = Infinity;
    for (let s = lo; s <= hi + 0.001; s += 8) {
      const d = dist(this.pointAt(Math.min(s, hi)), p);
      if (d < bestD) {
        bestD = d;
        bestS = Math.min(s, hi);
      }
    }
    return { s: bestS, d: bestD };
  }
}
