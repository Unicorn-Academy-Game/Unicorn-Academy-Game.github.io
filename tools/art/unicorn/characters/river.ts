import { glyph, place, scroll, wave } from '../glyphs';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * River: azure coat, magenta and indigo streaked mane and tail, pink pearl spiral horn, deep blue
 * eyes, pink halter with a red noseband and a silver spiral charm. Descriptors recorded in
 * assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#e0489a', '#7a1a60'],
  ['hair1', '#f070b8', '#8a2470'],
  ['hair2', '#5a48c8', '#2a1a84'],
  ['hair3', '#3a78e0', '#1a3a9a'],
  ['hair4', '#c04ad0', '#661a84'],
  ['hair5', '#7a58e0', '#3a1c94'],
] as const;

export const river: UnicornSpec = {
  id: 'river',
  displayName: 'River',
  build: { bulk: 1, neck: 1, head: 1.12 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#6aa8ee',
        colors: ['#2c5eb4', '#4a88de', '#70aef2', '#9ccdfb', '#c6e5ff'],
        outline: '#1b3a84',
        outlineLit: '#3c74c8',
      },
      muzzle: {
        base: '#5a86d0',
        colors: ['#2c52a0', '#4a78c4', '#6e9ee0', '#8cb6ee'],
        outline: '#1b3a84',
        outlineLit: '#3c74c8',
      },
      hoof: { base: '#4c78c0', colors: ['#264c94', '#3c68b0', '#5e88d0'], outline: '#1a3478' },
      horn: {
        base: '#f294c4',
        colors: ['#b24a88', '#d86ea8', '#f294c4', '#ffb9dc', '#ffe2f0'],
        outline: '#7a2458',
        outlineLit: '#d0689e',
      },
      hornGroove: { base: '#d86ea8', colors: ['#b24a88', '#d86ea8'], outline: '#7a2458' },
      earInner: { base: '#f0a8d0', colors: ['#a85a94', '#e48cc0', '#f8c4e0'], outline: '#1b3a84' },
      eyeRing: '#101a48',
      iris: ['#20306c', '#5074c8'],
      nostril: '#1e3a7a',
      mouth: '#2a4488',
    }),
    wave: { base: '#bfe6ff', colors: ['#8cc6f8', '#bfe6ff', '#f0faff'], outline: '#1b3a84', outlineLit: '#3c74c8' },
    ...hairPalette(HAIR),
    strap: { base: '#ec5a94', steps: 4, ramp: { shadowHue: 320 }, outline: '#8a1a58', outlineLit: '#d03e7c' },
    trim: { base: '#d8deee', steps: 4, outline: '#5a6890', outlineLit: '#9aa8c8' },
    gem: { base: '#8ee2ff', steps: 3, outline: '#1a78a0', priority: 2 },
    noseband: { base: '#ea3c4c', steps: 4, ramp: { shadowHue: 350 }, outline: '#8a1424', outlineLit: '#cc2c40' },
    silver: { base: '#dfe5f2', steps: 4, outline: '#56648c', outlineLit: '#98a6c6' },
  },
  hair: hairKeys(HAIR),
  mane: { locks: 11, length: [24, 36], width: [6, 9], flow: 0.7, forelock: 2 },
  tail: { locks: 11, length: [52, 66], width: [8, 12] },
  halter: {
    strap: 'strap',
    trim: 'trim',
    gem: 'gem',
    noseband: 'noseband',
    charm: { kind: 'spiral', paint: 'silver' },
  },
  // Breaking-wave flourishes on the shoulder and hip. Each flank gets the other flank's motif, so
  // they never mirror.
  decals: [
    glyph('wave', -1, place(wave(1.8), { x: 19, z: 50, size: 11, rot: 0.05 })),
    glyph('wave', -1, place(scroll(1.7), { x: -21, z: 53, size: 10, rot: 0.1 })),
    glyph('wave', 1, place(scroll(1.7), { x: 19, z: 49, size: 9, rot: -0.1 })),
    glyph('wave', 1, place(wave(1.8), { x: -22, z: 52, size: 10.5, rot: -0.15, flip: true })),
  ],
  horn: { length: 31, turns: 3, baseRadius: 3.6 },
  eye: { lash: true, size: 1.02 },
  signature: 'splash',
};
