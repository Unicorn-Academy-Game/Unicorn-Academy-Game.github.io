import { glyph, leafFan, place, vine } from '../glyphs';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * Leaf: butter-cream coat, long violet mane and tail with teal streaks and tucked daisies, copper
 * spiral horn, lavender eyes, green vine halter with leaves. Descriptors recorded in
 * assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#8a2fc8', '#3f1070'],
  ['hair1', '#a54ad8', '#4a1488'],
  ['hair2', '#6a22a8', '#321060'],
  ['hair3', '#3fb4b8', '#16606c'],
  ['hair4', '#7c3cc4', '#3a1678'],
  ['hair5', '#b868e8', '#541a90'],
] as const;

export const leaf: UnicornSpec = {
  id: 'leaf',
  displayName: 'Leaf',
  build: { bulk: 1, neck: 1, head: 1.12 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#f0dc9c',
        colors: ['#a88252', '#d3ad74', '#ecd08e', '#f7e6ac', '#fff7d2'],
        outline: '#764a2c',
        outlineLit: '#c29a58',
      },
      muzzle: {
        base: '#f0d2ac',
        colors: ['#b8825e', '#dba982', '#f1cba6', '#fae2c4'],
        outline: '#764a2c',
        outlineLit: '#c29a58',
      },
      hoof: { base: '#c9a778', colors: ['#7e5a38', '#a9835a', '#d0ad80'], outline: '#5c3e24' },
      horn: {
        base: '#e98a3c',
        colors: ['#8e421c', '#c0622a', '#e98a3c', '#f9b660', '#ffdc96'],
        outline: '#6a2e14',
        outlineLit: '#c47028',
      },
      hornGroove: { base: '#a8501e', colors: ['#8e421c', '#c0622a'], outline: '#6a2e14' },
      earInner: { base: '#f3b8c0', colors: ['#b0647a', '#e394a6', '#f7c7ce'], outline: '#764a2c' },
      eyeRing: '#2a1840',
      iris: ['#5a3ca4', '#9a7ee0'],
      nostril: '#6a4630',
      mouth: '#7a5236',
    }),
    leafmark: { base: '#ffffff', colors: ['#f2e4b8', '#ffffff', '#ffffff'], outline: '#764a2c', outlineLit: '#c29a58' },
    ...hairPalette(HAIR),
    vine: { base: '#3fae6a', steps: 4, ramp: { shadowHue: 200 }, outline: '#175a3a', outlineLit: '#2f8a52' },
    vineTrim: { base: '#2f8a52', steps: 3, outline: '#134a30' },
    vineGem: { base: '#43d6a0', steps: 3, outline: '#136f58', priority: 2 },
    leafGreen: { base: '#5ccf86', steps: 4, ramp: { shadowHue: 200 }, outline: '#1f6a42', outlineLit: '#3fa468' },
    petal: { base: '#ffffff', colors: ['#cfc6e8', '#f2eefc', '#ffffff'], outline: '#8a7ec0' },
    daisyHeart: { base: '#ffd84a', colors: ['#d89a1c', '#ffd84a'], outline: '#9a6410' },
  },
  hair: hairKeys(HAIR),
  mane: {
    locks: 11,
    length: [24, 36],
    width: [6, 9],
    flow: 0.6,
    forelock: 2,
    flowers: { petal: 'petal', heart: 'daisyHeart', count: 6 },
  },
  tail: { locks: 11, length: [50, 64], width: [8, 12] },
  halter: { strap: 'vine', trim: 'vineTrim', gem: 'vineGem', leaves: 'leafGreen' },
  // White leaf fans and vines, like the ornament on the official artwork's shoulder and hip.
  decals: [
    glyph('leafmark', -1, place(leafFan(1.5), { x: 18, z: 50, size: 12, rot: 0.15 })),
    glyph('leafmark', -1, place(vine(1.4), { x: -21, z: 52, size: 10, rot: 0.1 })),
    glyph('leafmark', 1, place(vine(1.4), { x: 20, z: 49, size: 10, rot: -0.1, flip: true })),
    glyph('leafmark', 1, place(leafFan(1.5), { x: -22, z: 54, size: 11, rot: -0.35 })),
  ],
  horn: { length: 32, turns: 3.2, baseRadius: 3.5 },
  eye: { lash: true, size: 1 },
  signature: 'flower-sniff',
};
