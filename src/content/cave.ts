/**
 * The pool of the cave, in world units. The prop that stands for it is kept on its south shore,
 * `pointRise` below its middle, because a spell has to see what it is cast at and the water, which
 * nobody can cross, is in the way of anything farther in.
 */
export const POOL = { rx: 256, ry: 154, pointRise: 130 } as const;
