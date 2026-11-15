import type { UnicornId } from '../../../shared/ids';
import type { RGB } from '../../engine/color';

/**
 * The seven jewels, one for each jet, in the order of the rainbow. Each has the note of its own
 * step of the scale, so the jets in order are a scale that goes up, and a finger drawn along the
 * ring plays it.
 */

export interface Jewel {
  readonly id: string;
  readonly color: RGB;
  /** A paler colour, for the light in a column and the glints. */
  readonly light: RGB;
  /** Which step of the pentatonic scale it sings. */
  readonly step: number;
}

const jewel = (id: string, color: RGB, light: RGB, step: number): Jewel => ({ id, color, light, step });

export const JEWELS: readonly Jewel[] = [
  jewel('ruby', [232, 44, 74], [255, 150, 164], 0),
  jewel('citrine', [255, 142, 36], [255, 208, 140], 1),
  jewel('topaz', [255, 208, 48], [255, 240, 160], 2),
  jewel('emerald', [58, 200, 116], [170, 246, 196], 3),
  jewel('sapphire', [70, 132, 255], [176, 210, 255], 4),
  jewel('amethyst', [168, 98, 236], [220, 186, 255], 5),
  jewel('rose', [255, 132, 200], [255, 202, 232], 6),
];

/** The jet each friend plays when she is touched, by the colour that is hers. */
export const FRIEND_JET: Readonly<Record<UnicornId, number>> = {
  wildstar: 2,
  leaf: 3,
  glacier: 6,
  river: 4,
  cinder: 0,
  storm: 5,
};

/** The root of the fountain's notes, middle C. Every note is of its major pentatonic scale. */
export const ROOT = 60;
