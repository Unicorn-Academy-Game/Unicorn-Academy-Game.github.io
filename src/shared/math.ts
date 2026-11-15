/** The number nearest `value` that lies between `lo` and `hi`. Both default to the unit range. */
export const clamp = (value: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, value));

/** The number that is `t` of the way from `a` to `b`. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
