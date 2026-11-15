import { hex, mix, type RGB } from '../../engine/color';
import { clamp } from '../../engine/ease';
import type { VoiceName } from '../../sound';

/**
 * The colours and the sound of one of the three skies, which are the three colours of mushroom she
 * can bounce from.
 */
export interface Palette {
  readonly name: 'sunrise' | 'candy' | 'starry';
  /** The sky from the meadow (0) to the moon (1). */
  readonly sky: readonly (readonly [number, RGB])[];
  /** The cloud she stands on: its sunlit top, its body, and the shadow under it. */
  readonly cloud: { readonly top: RGB; readonly body: RGB; readonly belly: RGB };
  /** The clouds far off, which are fainter and nearer the colour of the sky. */
  readonly far: { readonly top: RGB; readonly belly: RGB };
  /** The meadow: far hills, near hills, and the grass in front. */
  readonly hills: readonly [RGB, RGB, RGB];
  /** The colours her sparkles are. */
  readonly accents: readonly RGB[];
  /** The colour of the light a landing throws. */
  readonly glow: RGB;
  /** How high up the stars come out, from 0 to 1. */
  readonly nightAt: number;
  /** The instrument each cloud is played on. */
  readonly voice: VoiceName;
  /** The moon. */
  readonly moon: RGB;
}

const c = hex;

const SUNRISE: Palette = {
  name: 'sunrise',
  sky: [
    [0, c('#ffd6aa')],
    [0.07, c('#ffbf94')],
    [0.2, c('#8fcdf8')],
    [0.45, c('#4d92e4')],
    [0.7, c('#2c43a8')],
    [0.88, c('#1b1d64')],
    [1, c('#0c0b36')],
  ],
  cloud: { top: c('#ffffff'), body: c('#fff1e6'), belly: c('#f2a3a6') },
  far: { top: c('#fff4ea'), belly: c('#f6c0b4') },
  hills: [c('#b6d9a0'), c('#7fc27e'), c('#4fa660')],
  accents: [c('#ffd75e'), c('#ff9ec4'), c('#ffffff'), c('#9ee6ff')],
  glow: c('#ffe2a8'),
  nightAt: 0.55,
  voice: 'marimba',
  moon: c('#fff3d0'),
};

const CANDY: Palette = {
  name: 'candy',
  sky: [
    [0, c('#ffe3ee')],
    [0.08, c('#ffc3de')],
    [0.25, c('#f3a3e2')],
    [0.5, c('#b27ce9')],
    [0.75, c('#6b49c8')],
    [0.9, c('#3a2080')],
    [1, c('#1d104c')],
  ],
  cloud: { top: c('#ffffff'), body: c('#ffe6f3'), belly: c('#d6a2ec') },
  far: { top: c('#fff0f8'), belly: c('#e8bcf0') },
  hills: [c('#f5c6e4'), c('#ee9fd0'), c('#d975bd')],
  accents: [c('#ff7ac8'), c('#ffd1f0'), c('#ffffff'), c('#b6a2ff')],
  glow: c('#ffc4ea'),
  nightAt: 0.6,
  voice: 'bell',
  moon: c('#ffe6f4'),
};

const STARRY: Palette = {
  name: 'starry',
  sky: [
    [0, c('#bdebff')],
    [0.08, c('#7dc7f6')],
    [0.25, c('#4091e7')],
    [0.5, c('#2252ba')],
    [0.72, c('#152c7c')],
    [0.9, c('#0b1552')],
    [1, c('#040a2e')],
  ],
  cloud: { top: c('#f2fbff'), body: c('#c4e2ff'), belly: c('#7e8fe0') },
  far: { top: c('#d7eeff'), belly: c('#9fb4ee') },
  hills: [c('#8fc6d8'), c('#4f9bb4'), c('#2f6e92')],
  accents: [c('#9fe7ff'), c('#c6b6ff'), c('#ffffff'), c('#ffe28a')],
  glow: c('#aedbff'),
  nightAt: 0.18,
  voice: 'glass',
  moon: c('#e8f2ff'),
};

const PALETTES: Readonly<Record<string, Palette>> = { red: SUNRISE, pink: CANDY, blue: STARRY };

/** The sky of a mushroom's colour. Any other is the first. */
export const paletteOf = (look: string): Palette => PALETTES[look] ?? SUNRISE;

/** The colour of the sky at a height, from 0 at the meadow to 1 at the moon. */
export function skyAt(p: Palette, altitude: number, out?: { r: number; g: number; b: number }): RGB {
  const a = clamp(altitude);
  const stops = p.sky;
  let i = 1;
  while (i < stops.length - 1 && stops[i]![0] < a) i++;
  const [a0, c0] = stops[i - 1]!;
  const [a1, c1] = stops[i]!;
  const t = a1 === a0 ? 0 : clamp((a - a0) / (a1 - a0));
  const result = mix(c0, c1, t);
  if (out) {
    out.r = result[0];
    out.g = result[1];
    out.b = result[2];
  }
  return result;
}

/** How much of the night shows at a height, from 0 (none) to 1 (all the stars). */
export const nightAt = (p: Palette, altitude: number): number => clamp((altitude - p.nightAt) / (1 - p.nightAt));
