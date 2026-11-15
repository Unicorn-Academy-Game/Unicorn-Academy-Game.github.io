/**
 * The kinds of creature that live in the world besides the unicorns and the grown-ups. What each
 * one does is in `content/life.ts`.
 */
export const LIFE_KINDS = [
  'bird',
  'frog',
  'duck',
  'bunny',
  'snail',
  'ladybug',
  'fish',
  'butterfly',
  'dragonfly',
  'bee',
  'fairy',
] as const;
export type LifeKind = (typeof LIFE_KINDS)[number];
