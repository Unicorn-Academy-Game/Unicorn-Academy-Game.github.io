import { flake, glyph, place, snowflake } from '../glyphs';
import type { UnicornSpec } from '../spec';
import { commonPalette, hairKeys, hairPalette } from './shared';

/**
 * Glacier: silver-white coat with a lavender cast, silver mane and tail streaked with pink, lilac
 * and teal, periwinkle spiral horn, bright blue eyes, white halter with a pink noseband.
 * Descriptors recorded in assets/source/reference/characters.md.
 */
const HAIR = [
  ['hair0', '#f2f0fa', '#8a84b8'],
  ['hair1', '#e4e0f4', '#7c76ae'],
  ['hair2', '#f6c4de', '#a8508a'],
  ['hair3', '#d6c6f4', '#6f5ab0'],
  ['hair4', '#f2f0fa', '#8a84b8'],
  ['hair5', '#c4ecee', '#4a8a9a'],
] as const;

export const glacier: UnicornSpec = {
  id: 'glacier',
  displayName: 'Glacier',
  build: { bulk: 0.97, neck: 1.06, head: 1.1 },
  palette: {
    ...commonPalette({
      coat: {
        base: '#eceaf8',
        colors: ['#7a80b6', '#a8aedc', '#cfd2ee', '#e9ebf9', '#fbfbff'],
        outline: '#4a5086',
        outlineLit: '#7b82bc',
      },
      muzzle: {
        base: '#e4cadc',
        colors: ['#a67e9e', '#c9a4be', '#e3c8da', '#f2dfeb'],
        outline: '#4a5086',
        outlineLit: '#7b82bc',
      },
      hoof: { base: '#aeb2d4', colors: ['#656a9e', '#8c91c0', '#b9bddc'], outline: '#454a80' },
      horn: {
        base: '#8b80e6',
        colors: ['#4e44a6', '#6e62d0', '#9086ec', '#b8b0fa', '#e0dcff'],
        outline: '#302a78',
        outlineLit: '#6a60c4',
      },
      hornGroove: { base: '#6a5ec8', colors: ['#4e44a6', '#6e62d0'], outline: '#302a78' },
      earInner: { base: '#f4bcd6', colors: ['#b0688e', '#e898bc', '#f8cadc'], outline: '#4a5086' },
      eyeRing: '#142a5a',
      iris: ['#2a72c4', '#78c6f4'],
      nostril: '#6a5a86',
      mouth: '#7a688e',
    }),
    ...hairPalette(HAIR),
    strap: { base: '#f4f6fc', steps: 4, ramp: { shadowHue: 260 }, outline: '#6c78a6', outlineLit: '#a8b4d4' },
    trim: { base: '#c8d2e6', steps: 4, outline: '#50607f', outlineLit: '#90a0c0' },
    gem: { base: '#5adcf0', steps: 3, outline: '#1a7a98', priority: 2 },
    snow: { base: '#74bcec', colors: ['#4f98d4', '#74bcec', '#a8e0fa'], outline: '#4a5086', outlineLit: '#7b82bc' },
    noseband: { base: '#f27aa8', steps: 4, ramp: { shadowHue: 330 }, outline: '#9a2a68', outlineLit: '#d85a8a' },
  },
  hair: hairKeys(HAIR),
  mane: { locks: 10, length: [24, 36], width: [6, 9], flow: 0.65, forelock: 2 },
  tail: { locks: 11, length: [52, 66], width: [8, 12] },
  halter: { strap: 'strap', trim: 'trim', gem: 'gem', noseband: 'noseband' },
  // Pale blue snowflakes on the shoulder and hip, authored per side so the two flanks differ.
  decals: [
    glyph('snow', -1, place(snowflake(1.6), { x: 18, z: 51, size: 12.5, rot: 0.1 })),
    glyph('snow', -1, place(snowflake(1.5), { x: -22, z: 50, size: 9, rot: 0.45 })),
    glyph('snow', -1, place(flake(1.5), { x: -3, z: 58, size: 4 })),
    glyph('snow', 1, place(snowflake(1.6), { x: -20, z: 52, size: 11.5, rot: -0.1 })),
    glyph('snow', 1, place(snowflake(1.5), { x: 20, z: 48, size: 8.5, rot: 0.6 })),
    glyph('snow', 1, place(flake(1.5), { x: 3, z: 60, size: 3.8 })),
  ],
  horn: { length: 34, turns: 3.6, baseRadius: 3.4 },
  eye: { lash: true, size: 1.02 },
  signature: 'hoof-stamp',
};
