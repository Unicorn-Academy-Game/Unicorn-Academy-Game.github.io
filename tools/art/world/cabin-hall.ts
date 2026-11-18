import { hex, ramp } from '../core/color';
import type { DoorStyle } from './doors';
import type { HallTheme } from './hall';
import { GEM, type Ramp } from './palette';

/**
 * Santa's cabin inside. It is the same hall as the palace's rooms, dressed as a log house: red
 * pine timbers, cream trim, red tapestries, a night of snow in the windows and a ceiling of dark
 * rafters. Like the witch's hut it is bigger inside than it looks from the grove. Its windows look
 * out on the same snowy night as the Santa grove.
 */
const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.3, -0.2, -0.1, -0.03, 0.04, 0.1] });
const wineOf = (base: string): Ramp =>
  ramp(hex(base), { steps: 5, shadowHue: 235, lightHue: 215, lean: 1.0, lightness: [-0.22, -0.12, -0.04, 0.04, 0.1] });

export const CABIN_THEME: HallTheme = {
  plaster: r6('#c07a4c', 15, 65),
  cream: r6('#f7ebd2', 30, 80),
  wood: r6('#6b3f27', 10, 55),
  wine: wineOf('#1d3558'),
  cloth: r6('#cc3340', 350, 40),
  ceiling: [58, 34, 30],
  edge: [100, 62, 42],
  shadow: [54, 30, 28],
  lineTint: [255, 236, 204],
  dotTint: [255, 226, 180],
};

/** The door from inside: pine boards with gold hinges, and the cold blue light of the snow beyond. */
export const CABIN_DOOR_STYLE: DoorStyle = {
  leaf: r6('#8a5230', 15, 60),
  trim: GEM.gold,
  light: [
    [238, 247, 255],
    [190, 222, 255],
    [138, 182, 240],
  ],
  kind: 'stable',
  straw: false,
};
