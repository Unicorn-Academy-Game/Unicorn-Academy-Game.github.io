/**
 * Draw order, back to front. Everything that stands on the ground sorts by the y of its feet, which
 * is why scenery, props and unicorns share one band. The other bands are fixed layers around it.
 */
export const DEPTH = {
  ground: 0,
  water: 1,
  backdrop: 2,
  shadow: 10,
  groundDetail: 20,
  /** Feet y is added to this, so a larger y draws in front. Maps are under 8192 units tall. */
  standing: 100,
  effects: 150_000,
  foreground: 200_000,
} as const;

/**
 * Order within a flat layer that has no feet, still by y so overlapping pieces stack consistently.
 */
export const flatDepth = (base: number, y: number): number => base + y / 100_000;

export const standingDepth = (feetY: number, bias = 0): number => DEPTH.standing + feetY + bias;
