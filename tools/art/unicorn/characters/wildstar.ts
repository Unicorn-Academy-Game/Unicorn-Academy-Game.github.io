import { sparkle } from '../markings';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * Wildstar: pale lilac pearl coat, rainbow mane and tail, golden spiral horn, white star sparkles
 * on the flanks, white-mint halter with teal gems. Descriptors recorded in
 * assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#ff6f95', '#8c1f59'],
  ['hair1', '#ff9468', '#9c3a2a'],
  ['hair2', '#ffd65c', '#9a6a1a'],
  ['hair3', '#8ddc6e', '#2f7a46'],
  ['hair4', '#4fd6c4', '#1f6f86'],
  ['hair5', '#70b2ff', '#2f4fb0'],
  ['hair6', '#e87ed8', '#8a2a8c'],
] as const;

export const wildstar: UnicornSpec = {
  id: 'wildstar',
  displayName: 'Wildstar',
  build: { bulk: 1, neck: 1, head: 1.12 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#c2b0ec',
        colors: ['#6c5aa6', '#9482cd', '#bfaee9', '#dccffa', '#f7f1ff'],
        outline: '#42367c',
        outlineLit: '#6a58aa',
      },
      muzzle: {
        base: '#dbb7e1',
        colors: ['#8d68a8', '#b98fc8', '#dcb8e2', '#efd2ee'],
        outline: '#42367c',
        outlineLit: '#6a58aa',
      },
      hoof: { base: '#a695cf', colors: ['#5f4f95', '#8574b8', '#b5a5dc'], outline: '#463a82' },
      horn: { base: '#f4c95e', steps: 5, ramp: { lean: 0.6 }, outline: '#8b5a1f', outlineLit: '#c98f3a' },
      hornGroove: { base: '#c98a2c', colors: ['#a96a1f', '#d99a34'], outline: '#8b5a1f' },
      earInner: { base: '#f3b8d8', colors: ['#b5649e', '#e394c0', '#f7c7e2'], outline: '#463a82' },
      eyeRing: '#26142f',
      iris: ['#4a2358', '#7a4590'],
      nostril: '#4a3270',
      mouth: '#5a3c82',
    }),
    star: { base: '#ffffff', colors: ['#d4c8f0', '#f2ecff', '#ffffff'], outline: '#8a78c4' },
    ...hairPalette(HAIR),
    strap: { base: '#f5fcf7', steps: 4, ramp: { shadowHue: 250 }, outline: '#6a7aa0', outlineLit: '#a9b6d2' },
    trim: { base: '#d3dcea', steps: 4, outline: '#56627f', outlineLit: '#93a0be' },
    gem: { base: '#3fd3c4', steps: 3, outline: '#136f88', priority: 2 },
  },
  hair: hairKeys(HAIR),
  mane: { locks: 10, length: [20, 30], width: [6, 9], flow: 0.7, forelock: 2 },
  tail: { locks: 11, length: [52, 68], width: [8, 12] },
  halter: { strap: 'strap', trim: 'trim', gem: 'gem' },
  decals: [
    sparkle('star', 1, 20, 52, 7.6, 0.3),
    sparkle('star', 1, 8, 43, 4.6, -0.2),
    sparkle('star', 1, 27, 63, 3.2, 0.5),
    sparkle('star', 1, -14, 54, 4.0, 0.2),
    sparkle('star', -1, 17, 48, 5.2, -0.3),
    sparkle('star', -1, 4, 59, 3.6, 0.4),
    sparkle('star', -1, -20, 49, 4.4, 0.1),
  ],
  horn: { length: 33, turns: 3.4, baseRadius: 3.6 },
  eye: { lash: true, size: 1 },
  signature: 'mote-gaze',
};
