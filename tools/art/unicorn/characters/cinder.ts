import { chestSpot, flame, flames, glyph, legBand, place, stroke } from '../glyphs';
import { PART } from '../parts';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * Cinder: warm terracotta coat, red-pink and gold mane and tail, rose spiral horn, brown eyes,
 * black halter with silver studs and a golden flame charm. Descriptors recorded in
 * assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#e8386a', '#7a1438'],
  ['hair1', '#f06a50', '#8a2a1c'],
  ['hair2', '#f8b040', '#9a5a12'],
  ['hair3', '#f6d46c', '#9a7a22'],
  ['hair4', '#d8305a', '#74102e'],
  ['hair5', '#f48a48', '#8a3c16'],
] as const;

export const cinder: UnicornSpec = {
  id: 'cinder',
  displayName: 'Cinder',
  build: { bulk: 1.05, neck: 0.98, head: 1.12 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#ee9a5c',
        colors: ['#a2472c', '#cd6c3c', '#ec9256', '#f9b87a', '#ffdaa6'],
        outline: '#6a281c',
        outlineLit: '#b8582e',
      },
      muzzle: {
        base: '#e89066',
        colors: ['#a04a30', '#c8683e', '#e48e62', '#f4ae84'],
        outline: '#6a281c',
        outlineLit: '#b8582e',
      },
      hoof: { base: '#8a5036', colors: ['#4c2a1e', '#6e3e2a', '#94583c'], outline: '#341810' },
      horn: {
        base: '#e88a86',
        colors: ['#9c4650', '#c4666a', '#e88a86', '#f8aaa4', '#ffd2ca'],
        outline: '#6a2630',
        outlineLit: '#c46466',
      },
      hornGroove: { base: '#c4666a', colors: ['#9c4650', '#c4666a'], outline: '#6a2630' },
      earInner: { base: '#f0a890', colors: ['#a85a4a', '#e08c78', '#f6c0ac'], outline: '#6a281c' },
      eyeRing: '#2a1410',
      iris: ['#5a3220', '#b06a3a'],
      nostril: '#5a2c1e',
      mouth: '#6a3424',
    }),
    flameMark: {
      base: '#ffcc62',
      colors: ['#f4ac4c', '#ffcc62', '#ffeaa2'],
      outline: '#6a281c',
      outlineLit: '#b8582e',
    },
    gold: {
      base: '#f2b83a',
      colors: ['#b8741c', '#e8a02c', '#f8c850', '#ffe69a'],
      outline: '#6a281c',
      outlineLit: '#b8582e',
    },
    ruby: { base: '#e83a3a', colors: ['#8a1424', '#c8283a', '#f0505a'], outline: '#6a281c', priority: 2 },
    ...hairPalette(HAIR),
    strap: { base: '#34303c', steps: 4, ramp: { shadowHue: 270 }, outline: '#14101c', outlineLit: '#58526a' },
    trim: { base: '#d0d4e0', steps: 4, outline: '#545a72', outlineLit: '#98a0ba' },
    gem: { base: '#ffb53a', steps: 3, outline: '#9a5410', priority: 2 },
    stud: { base: '#e4e8f2', steps: 3, outline: '#5a607a', outlineLit: '#a4acc4' },
    flame: {
      base: '#ffb02e',
      colors: ['#c8601a', '#f48a24', '#ffb02e', '#ffe070'],
      outline: '#8a3a10',
      outlineLit: '#e08020',
    },
  },
  hair: hairKeys(HAIR),
  mane: { locks: 12, length: [26, 38], width: [6, 9], flow: 0.8, forelock: 2 },
  tail: { locks: 12, length: [54, 68], width: [8, 12] },
  halter: { strap: 'strap', trim: 'trim', gem: 'gem', studs: 'stud', charm: { kind: 'flame', paint: 'flame' } },
  // Lighter flame tongues, tone on tone with the coat.
  decals: [
    glyph('flameMark', -1, place(flames(0.5), { x: 18, z: 51, size: 9.5, rot: 0.1 })),
    glyph('flameMark', -1, place(flame(0.55), { x: -20, z: 54, size: 8, rot: 0.55 })),
    glyph('flameMark', -1, place(flame(0.55), { x: -26, z: 50, size: 6, rot: 0.9 })),
    glyph('flameMark', 1, place(flame(0.55), { x: 19, z: 50, size: 8, rot: -0.2 })),
    // Golden breast collar with a ruby, and a gold cuff above each fore hoof.
    glyph('gold', -1, [
      stroke(
        [
          [31, 46],
          [26, 52],
          [19, 59],
          [11, 65],
        ],
        3.6,
        3.6,
      ),
    ]),
    glyph('gold', 1, [
      stroke(
        [
          [31, 46],
          [26, 52],
          [19, 59],
          [11, 65],
        ],
        3.6,
        3.6,
      ),
    ]),
    chestSpot('ruby', 49, 3.4),
    legBand('gold', [PART.foreL, PART.foreR], 7, 11),
    glyph('flameMark', 1, place(flames(0.5), { x: -22, z: 52, size: 9, rot: -0.3 })),
  ],
  horn: { length: 33, turns: 3.4, baseRadius: 3.7 },
  eye: { lash: false, size: 1 },
  signature: 'mane-toss',
};
