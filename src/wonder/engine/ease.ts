import { clamp, lerp } from '../../shared/math';

export { clamp, lerp };

/**
 * Small, pure easing and smoothing helpers. Every game leans on these, so they are the one place
 * the curves are written down.
 */

export const TAU = Math.PI * 2;

/** Where `x` sits between `a` and `b`, held to 0 and 1 outside them. */
export const unlerp = (a: number, b: number, x: number): number => (a === b ? 0 : clamp((x - a) / (b - a)));

/** Maps `x` from one range to another, held to the second range. */
export const remap = (x: number, a: number, b: number, c: number, d: number): number => lerp(c, d, unlerp(a, b, x));

/** `x` wrapped into [0, n), also for negative numbers. */
export const wrap = (x: number, n: number): number => ((x % n) + n) % n;

export const smooth = (t: number): number => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};

export const smoother = (t: number): number => {
  const u = clamp(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

export const easeInQuad = (t: number): number => clamp(t) ** 2;
export const easeOutQuad = (t: number): number => 1 - (1 - clamp(t)) ** 2;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t)) ** 3;
export const easeInOutCubic = (t: number): number => {
  const u = clamp(t);
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
};
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;

/** Overshoots its target and settles back, the pop of a button that has just been pressed. */
export const easeOutBack = (t: number, overshoot = 1.70158): number => {
  const u = clamp(t) - 1;
  return 1 + (overshoot + 1) * u ** 3 + overshoot * u ** 2;
};

/** A springy arrival that rings a few times. */
export const easeOutElastic = (t: number): number => {
  const u = clamp(t);
  if (u === 0 || u === 1) return u;
  return 2 ** (-10 * u) * Math.sin(((u * 10 - 0.75) * TAU) / 3) + 1;
};

export const easeOutBounce = (t: number): number => {
  let u = clamp(t);
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) {
    u -= 1.5 / d;
    return n * u * u + 0.75;
  }
  if (u < 2.5 / d) {
    u -= 2.25 / d;
    return n * u * u + 0.9375;
  }
  u -= 2.625 / d;
  return n * u * u + 0.984375;
};

/** 0 to 1 and back to 0 as `t` goes 0 to 1: a pulse with a soft top. */
export const hump = (t: number): number => Math.sin(Math.PI * clamp(t));

/**
 * Moves `from` toward `to` the same way at any frame rate: `rate` is how many times per second the
 * gap shrinks by a factor of e. A stable replacement for `lerp(a, b, 0.1)` in a loop.
 */
export const damp = (from: number, to: number, rate: number, dt: number): number =>
  lerp(from, to, 1 - Math.exp(-rate * dt));

/**
 * A spring that chases a target. Stepped in small slices so a long frame cannot make it explode.
 * Used for squash and stretch, wobbling bubbles and buttons that pop.
 */
export class Spring {
  v = 0;

  constructor(
    public x = 0,
    public target = 0,
    /** Stiffness, in 1/s^2. */
    public k = 180,
    /** Damping, in 1/s. Critical damping is 2 * sqrt(k). */
    public c = 14,
  ) {}

  /** Gives the spring a kick, in units per second. */
  kick(v: number): void {
    this.v += v;
  }

  step(dt: number): number {
    const slices = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      this.v += (this.k * (this.target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

/**
 * The `i`th of `n` values spread evenly across [lo, hi], both ends included. A single value sits in
 * the middle.
 */
export const spread = (i: number, n: number, lo: number, hi: number): number =>
  n <= 1 ? (lo + hi) / 2 : lerp(lo, hi, i / (n - 1));
