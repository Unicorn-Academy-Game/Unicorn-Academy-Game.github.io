import { bolt, glyph, place, socks } from '../glyphs';
import { lightningBlaze } from '../markings';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * Storm: violet-slate coat with a white lightning blaze, periwinkle mane and tail, pale lavender
 * spiral horn, amber eyes under a confident half-lid, dark halter with a silver cheek plate.
 * Descriptors recorded in assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#6a7ee8', '#2a3a94'],
  ['hair1', '#8a9cf4', '#3a4ca8'],
  ['hair2', '#5a62d0', '#26288a'],
  ['hair3', '#a8b8fa', '#4a58b4'],
  ['hair4', '#7a6ad8', '#34268c'],
  ['hair5', '#9aa8f6', '#3c48a8'],
] as const;

export const storm: UnicornSpec = {
  id: 'storm',
  displayName: 'Storm',
  build: { bulk: 1, neck: 1, head: 1.12 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#7a6cc4',
        colors: ['#392f74', '#5849a0', '#7a6cc4', '#a090e0', '#c6baf6'],
        outline: '#221b54',
        outlineLit: '#4a3e8a',
      },
      muzzle: {
        base: '#8c80cc',
        colors: ['#4a4088', '#6a5eaa', '#8c80cc', '#aaa0e2'],
        outline: '#221b54',
        outlineLit: '#4a3e8a',
      },
      hoof: { base: '#5a4e98', colors: ['#2e2660', '#443a7c', '#6a5eaa'], outline: '#1e1850' },
      horn: {
        base: '#b9b4e6',
        colors: ['#6a65a6', '#8f8ac6', '#b9b4e6', '#d9d6f6', '#f3f1ff'],
        outline: '#403c80',
        outlineLit: '#8480c0',
      },
      hornGroove: { base: '#8f8ac6', colors: ['#6a65a6', '#8f8ac6'], outline: '#403c80' },
      earInner: { base: '#c8a4e0', colors: ['#7a5ca4', '#b08cd0', '#d6b8ec'], outline: '#221b54' },
      eyeRing: '#1c1030',
      iris: ['#864616', '#e8a640'],
      nostril: '#2e2462',
      mouth: '#3a2e72',
    }),
    blaze: { base: '#f4f2ff', colors: ['#c2bce8', '#e4e0fa', '#fbfaff'], outline: '#7a72b8' },
    feather: {
      base: '#cfc6f4',
      colors: ['#8f84d0', '#b0a6e8', '#d4ccf8', '#eeeaff'],
      outline: '#221b54',
      outlineLit: '#4a3e8a',
    },
    boltMark: { base: '#e8e4fb', colors: ['#bdb4ec', '#e8e4fb', '#ffffff'], outline: '#221b54', outlineLit: '#4a3e8a' },
    ...hairPalette(HAIR),
    strap: { base: '#3a384c', steps: 4, ramp: { shadowHue: 270 }, outline: '#14121e', outlineLit: '#5c5a74' },
    trim: { base: '#c8cede', steps: 4, outline: '#505874', outlineLit: '#949cb8' },
    gem: { base: '#b898ff', steps: 3, outline: '#4c2a9a', priority: 2 },
    plate: { base: '#cfd5e4', steps: 4, ramp: { shadowHue: 265 }, outline: '#46506e', outlineLit: '#8e98b6' },
  },
  hair: hairKeys(HAIR),
  mane: { locks: 11, length: [24, 36], width: [6, 9], flow: 0.7, forelock: 2 },
  tail: { locks: 11, length: [52, 66], width: [8, 12] },
  halter: { strap: 'strap', trim: 'trim', gem: 'gem', plate: 'plate' },
  // The blaze follows the head. White lightning runs across the shoulder, barrel and hip, different
  // on each flank.
  decals: [
    lightningBlaze('blaze'),
    socks('feather', 13, 5),
    glyph('boltMark', -1, place(bolt(2.4), { x: 17, z: 52, size: 13, rot: 0.3 })),
    glyph('boltMark', -1, place(bolt(2.2), { x: -20, z: 53, size: 11, rot: -0.45 })),
    glyph('boltMark', 1, place(bolt(2.4), { x: 4, z: 54, size: 13, rot: -0.2, flip: true })),
    glyph('boltMark', 1, place(bolt(2.0), { x: 24, z: 47, size: 8, rot: 0.5 })),
    glyph('boltMark', 1, place(bolt(2.2), { x: -23, z: 52, size: 10, rot: 0.3 })),
  ],
  horn: { length: 33, turns: 3.2, baseRadius: 3.5 },
  eye: { lash: false, size: 1, lid: 0.3 },
  signature: 'hop',
};
