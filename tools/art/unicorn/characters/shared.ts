import type { PaletteEntry } from '../spec';

const flatDetail = (color: string, priority: number): PaletteEntry => ({
  base: color,
  colors: [color],
  flat: 0,
  priority,
  noOutline: true,
});

/**
 * The parts of a palette that differ per character. Everything else about eyes, nostrils and glow
 * is shared.
 */
export interface CommonColors {
  coat: PaletteEntry;
  muzzle: PaletteEntry;
  hoof: PaletteEntry;
  horn: PaletteEntry;
  hornGroove: PaletteEntry;
  earInner: PaletteEntry;
  /** Dark outline and pupil color. */
  eyeRing: string;
  /** Iris colors, darker toward the lid. */
  iris: readonly [string, string];
  nostril: string;
  mouth: string;
}

export function commonPalette(c: CommonColors): Record<string, PaletteEntry> {
  return {
    coat: c.coat,
    muzzle: c.muzzle,
    hoof: c.hoof,
    horn: c.horn,
    hornGroove: c.hornGroove,
    hornGlow: { base: '#fff4c4', colors: ['#fff0b0', '#fffbe0'], emissive: 1, outline: '#f0c05a', noLines: true },
    earInner: c.earInner,
    nostril: { ...flatDetail(c.nostril, 3), protect: true },
    mouth: flatDetail(c.mouth, 2),
    eyeRing: { ...flatDetail(c.eyeRing, 4), protect: true, noLines: true },
    eyeIris: { base: c.iris[0], colors: c.iris, priority: 4, protect: true, noOutline: true, noLines: true },
    eyeGlint: { ...flatDetail('#ffffff', 6), protect: true, noLines: true },
  };
}

/**
 * Hair palette entries as [key, base, outline]. Each lock blends into the next entry toward its
 * tip.
 */
export const hairPalette = (entries: readonly (readonly [string, string, string])[]): Record<string, PaletteEntry> =>
  Object.fromEntries(entries.map(([key, base, outline]) => [key, { base, steps: 4, outline }]));

export const hairKeys = (entries: readonly (readonly [string, string, string])[]): string[] =>
  entries.map(([key]) => key);
