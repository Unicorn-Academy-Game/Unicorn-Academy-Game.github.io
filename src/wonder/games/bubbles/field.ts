import type { Rng } from '../../../domain/rng';
import type { UnicornId } from '../../../shared/ids';
import { clamp, damp, TAU } from '../../engine/ease';
import type { Prize } from './kinds';
import { looksOf } from './looks';

/**
 * The bubbles in the air: where each is, how it floats, and what happens when two touch. Nothing
 * here draws or makes a sound, so the rules of the air are tested on their own. A bubble rises
 * slowly, sways, and is carried by a wind that comes and goes. Two that meet join into one bigger
 * bubble that holds what both held, which is what makes a bubble feel like a bubble.
 */

/**
 * The radius of a bubble with one prize in it. Two prizes make it a good deal wider, since the room
 * they need adds up.
 */
export const R_ONE = 31;
/** The widest a bubble that joined others may be, and the most prizes it may hold. */
export const R_MOST = 56;
export const PRIZES_MOST = 3;
/** The radius of a bubble that holds `n` prizes. */
export const radiusFor = (n: number): number => R_ONE * Math.sqrt(Math.max(1, n));

export interface Bubble {
  readonly id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How big it is now, and how big it is growing to. A bubble swells as it leaves the wand. */
  r: number;
  rTo: number;
  age: number;
  phase: number;
  /**
   * How far it is squashed along `squashAt` (0 is round), and how fast that is changing. A spring
   * settles it.
   */
  squash: number;
  squashV: number;
  squashAt: number;
  /** Which colours the film is in, 0 to 1. */
  hue: number;
  prizes: Prize[];
  /**
   * Which look each prize has (its colour, its kind of flower), so what comes out is the very one
   * the player saw inside.
   */
  looks: number[];
  /**
   * How many prizes it held before the last change to what it holds, and when (by its age) that
   * was, so the picture can ease from one to the other.
   */
  held0: number;
  changedAt: number;
  /** A friend who floats inside it. */
  rider: UnicornId | null;
  /**
   * A finger is holding it, as the player blows it. It stays where the finger puts it and nothing
   * joins it.
   */
  held: boolean;
  /** Blown by the player, not by the machine. */
  mine: boolean;
  /**
   * A place it is drifting toward, with a steady pull, instead of drifting with the wind, and the
   * fastest it goes there.
   */
  aim: { x: number; y: number } | null;
  speed: number;
  /**
   * Seconds before it bursts by itself, or null if it stays until it is popped. Such a bubble does
   * not join others.
   */
  life: number | null;
}

export interface Birth {
  x: number;
  y: number;
  r?: number;
  vx?: number;
  vy?: number;
  prizes: Prize[];
  looks?: number[];
  rider?: UnicornId;
  held?: boolean;
  mine?: boolean;
  /** Start as a speck and swell to `r`. */
  swell?: boolean;
  /** Seconds before it bursts by itself. */
  life?: number;
}

/**
 * The air: how wide it is, the line above which a bubble has gone, and the ground it will not sink
 * below.
 */
export interface Air {
  readonly w: number;
  readonly top: number;
  readonly floor: number;
}

/** What happened in one step. */
export interface Happened {
  /** `gone` was taken into `into`. */
  readonly joined: { readonly into: Bubble; readonly gone: Bubble }[];
  /** Floated off the top. */
  readonly left: Bubble[];
  /** Burst by itself, because its time was up. */
  readonly burst: Bubble[];
}

/** Units per second a bubble rises, and how much the speed drifts. */
const RISE = 17;
const SWAY = 9;
/**
 * Bubbles younger than this many seconds do not join, so a new one leaves the wand before it meets
 * the last.
 */
const YOUNG = 0.9;
/** How much two bubbles must overlap, as a share of their radii added, before they join. */
const JOIN_AT = 0.8;
/** The edge of the air where a bubble is turned back. */
const EDGE = 14;
/** The fastest a bubble may go when something pushes it. */
const FASTEST = 150;
/** The fastest a bubble goes toward a place it is aimed at, unless it was born to go faster. */
const AIM_SPEED = 90;

/**
 * The wind at a moment, in units per second to the right. It comes and goes, so no two minutes look
 * the same.
 */
export const windAt = (t: number): number => 8 * Math.sin(t * 0.21) + 5 * Math.sin(t * 0.53 + 1.3);

export class Field {
  readonly bubbles: Bubble[] = [];
  private next = 1;

  constructor(private readonly rng: Rng) {}

  add(o: Birth): Bubble {
    const rTo = o.r ?? radiusFor(o.prizes.length);
    const b: Bubble = {
      id: this.next++,
      x: o.x,
      y: o.y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      r: o.swell ? rTo * 0.18 : rTo,
      rTo,
      age: 0,
      phase: this.rng.range(0, TAU),
      squash: 0,
      squashV: 0,
      squashAt: 0,
      hue: this.rng.next(),
      prizes: o.prizes,
      looks: o.looks ?? o.prizes.map((p) => this.rng.int(looksOf(p))),
      held0: o.prizes.length,
      changedAt: -1,
      rider: o.rider ?? null,
      held: o.held ?? false,
      mine: o.mine ?? false,
      aim: null,
      speed: AIM_SPEED,
      life: o.life ?? null,
    };
    this.bubbles.push(b);
    return b;
  }

  /** One more prize goes into a bubble, which swells to make room for it and wobbles. */
  addPrize(b: Bubble, prize: Prize, look: number): void {
    b.held0 = b.prizes.length;
    b.changedAt = b.age;
    b.prizes.push(prize);
    b.looks.push(look);
    b.rTo = radiusFor(b.prizes.length);
    b.squashV += 6;
  }

  remove(b: Bubble): void {
    const i = this.bubbles.indexOf(b);
    if (i >= 0) this.bubbles.splice(i, 1);
  }

  clear(): void {
    this.bubbles.length = 0;
  }

  /**
   * The bubble a touch at a point means, with `slack` units of room around each: the smallest of
   * the ones it is in, so a small bubble in front of a big one is still hit. A bubble that has not
   * swelled to `grown` of its size, from 0 to 1, is not found.
   */
  at(x: number, y: number, slack: number, grown = 0): Bubble | null {
    let best: Bubble | null = null;
    let bestD = Infinity;
    for (const b of this.bubbles) {
      if (b.held || b.r < b.rTo * grown) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d > b.r + slack) continue;
      if (!best || b.r < best.r - 0.5 || (Math.abs(b.r - best.r) <= 0.5 && d < bestD)) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * A finger sweeping through the air at (x, y) at this velocity pushes every bubble near it along,
   * a little.
   */
  push(x: number, y: number, vx: number, vy: number, reach: number): number {
    let moved = 0;
    for (const b of this.bubbles) {
      if (b.held || b.rider) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      const near = b.r + reach;
      if (d >= near) continue;
      const fall = 1 - d / near;
      b.vx = clamp(b.vx + vx * 0.3 * fall, -FASTEST, FASTEST);
      b.vy = clamp(b.vy + vy * 0.3 * fall, -FASTEST, FASTEST);
      b.squashAt = Math.atan2(vy, vx);
      b.squashV += Math.min(5, Math.hypot(vx, vy) / 90) * fall;
      moved++;
    }
    return moved;
  }

  /** Moves the air on by `dt` seconds at time `t`. */
  step(dt: number, t: number, air: Air): Happened {
    const joined: { into: Bubble; gone: Bubble }[] = [];
    const left: Bubble[] = [];
    const burst: Bubble[] = [];
    for (const b of this.bubbles) this.drift(b, dt, t, air);
    this.meet(dt, joined);
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      if (b.life !== null && b.life <= 0) {
        this.bubbles.splice(i, 1);
        burst.push(b);
      } else if (!b.held && b.y + b.r < air.top) {
        this.bubbles.splice(i, 1);
        left.push(b);
      }
    }
    return { joined, left, burst };
  }

  private drift(b: Bubble, dt: number, t: number, air: Air): void {
    b.age += dt;
    b.phase += dt * 1.1;
    if (b.life !== null) b.life -= dt;
    // The skin wobbles back to round, like a spring.
    b.squashV += (-90 * b.squash - 7 * b.squashV) * dt;
    b.squash = clamp(b.squash + b.squashV * dt, -0.35, 0.35);
    if (Math.abs(b.r - b.rTo) > 0.02) b.r = damp(b.r, b.rTo, 6.5, dt);
    else b.r = b.rTo;
    if (b.held) return;
    if (b.aim) {
      b.vx = damp(b.vx, clamp((b.aim.x - b.x) * 1.5, -b.speed, b.speed), 3, dt);
      b.vy = damp(b.vy, clamp((b.aim.y - b.y) * 1.5, -b.speed, b.speed), 3, dt);
    } else {
      const lift = RISE + 5 * Math.sin(b.phase * 0.6 + t * 0.35);
      const sway = SWAY * Math.sin(b.phase + t * 0.9);
      b.vy = damp(b.vy, -lift, 0.9, dt);
      b.vx = damp(b.vx, windAt(t) + sway, 0.7, dt);
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // A wall of air at each side turns it back, and the ground holds it up.
    const left = EDGE + b.r * 0.4;
    const right = air.w - left;
    if (b.x < left) b.vx = Math.max(b.vx, 6 + (left - b.x) * 0.9);
    if (b.x > right) b.vx = Math.min(b.vx, -6 - (b.x - right) * 0.9);
    if (b.y > air.floor - b.r) b.vy = Math.min(b.vy, -8 - (b.y - (air.floor - b.r)) * 0.9);
  }

  /** Bubbles that touch push each other away, and bubbles that overlap a good deal join. */
  private meet(dt: number, joined: { into: Bubble; gone: Bubble }[]): void {
    const all = this.bubbles;
    const gone = new Set<Bubble>();
    for (let i = 0; i < all.length; i++) {
      const a = all[i]!;
      if (gone.has(a) || a.held) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]!;
        if (gone.has(b) || b.held) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const sum = a.r + b.r;
        if (d >= sum) continue;
        if (d < sum * JOIN_AT && canJoin(a, b)) {
          const into = a.rTo >= b.rTo ? a : b;
          const out = into === a ? b : a;
          join(into, out);
          gone.add(out);
          joined.push({ into, gone: out });
          if (out === a) break;
          continue;
        }
        // They bump: each is pushed off the other in proportion to how far into it the other is.
        const push = Math.min(90, (sum - d) * 14) * dt;
        const nx = dx / d;
        const ny = dy / d;
        const share = b.r / sum;
        if (!a.rider && !a.aim) {
          a.vx -= nx * push * share * 2;
          a.vy -= ny * push * share * 2;
        }
        if (!b.rider && !b.aim) {
          b.vx += nx * push * (1 - share) * 2;
          b.vy += ny * push * (1 - share) * 2;
        }
      }
    }
    if (gone.size > 0) {
      for (let i = all.length - 1; i >= 0; i--) if (gone.has(all[i]!)) all.splice(i, 1);
    }
  }
}

/**
 * Whether two bubbles may become one: neither carries a friend or has a time of its own to burst,
 * both are grown, and the new one is no bigger than a bubble may be.
 */
function canJoin(a: Bubble, b: Bubble): boolean {
  if (a.rider || b.rider) return false;
  if (a.life !== null || b.life !== null) return false;
  if (a.age < YOUNG || b.age < YOUNG) return false;
  if (a.prizes.length + b.prizes.length > PRIZES_MOST) return false;
  return Math.hypot(a.rTo, b.rTo) <= R_MOST;
}

/**
 * Folds `out` into `into`: the area is the two areas, it sits between them, it carries both loads
 * and wobbles at the touch.
 */
export function join(into: Bubble, out: Bubble): void {
  const wa = into.rTo * into.rTo;
  const wb = out.rTo * out.rTo;
  const total = wa + wb;
  into.x = (into.x * wa + out.x * wb) / total;
  into.y = (into.y * wa + out.y * wb) / total;
  into.vx = (into.vx * wa + out.vx * wb) / total;
  into.vy = (into.vy * wa + out.vy * wb) / total;
  into.r = Math.max(into.r, out.r);
  into.rTo = Math.sqrt(total);
  into.held0 = into.prizes.length;
  into.changedAt = into.age;
  into.prizes = [...into.prizes, ...out.prizes];
  into.looks = [...into.looks, ...out.looks];
  into.mine = into.mine && out.mine;
  into.squashAt = Math.atan2(out.y - into.y, out.x - into.x);
  into.squashV += 6;
}
