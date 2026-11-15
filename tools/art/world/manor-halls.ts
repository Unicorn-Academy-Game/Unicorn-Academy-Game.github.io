import { hex, type RGB, ramp } from '../core/color';
import type { DoorStyle } from './doors';
import type { HallTheme } from './hall';
import { paintTwilight } from './manor-sky';
import type { Painter } from './paint';
import { GEM, type Ramp } from './palette';

/**
 * What the Spooky Manor's two floors are made of. The ground floor is plum plaster, ebony paneling
 * and pumpkin velvet. The Sky Garden above is a pale greenhouse blue with jade wood and pearl. Both
 * keep the gold, so the rooms feel like one house.
 */
const r = (base: string, o: Parameters<typeof ramp>[1] = {}): Ramp =>
  ramp(hex(base), {
    steps: 6,
    shadowHue: 280,
    lightHue: 60,
    lean: 0.9,
    lightness: [-0.32, -0.21, -0.1, -0.035, 0, 0.04],
    ...o,
  });

/** The painting over the right-hand wall piece: the forest at twilight, with a big moon. */
function twilightPainting(p: Painter, x0: number, y0: number, w: number, h: number): void {
  paintTwilight(
    p,
    { x0, y0, w, h, moon: { x: x0 + w * 0.7, y: y0 + h * 0.3, r: Math.round(w * 0.12) }, seed: 9 },
    () => true,
  );
  for (let x = x0; x < x0 + w; x++) {
    p.over(x, y0, [20, 10, 40], 0.4);
    p.over(x, y0 + 1, [20, 10, 40], 0.2);
  }
  for (let y = y0; y < y0 + h; y++) {
    p.over(x0, y, [20, 10, 40], 0.4);
    p.over(x0 + 1, y, [20, 10, 40], 0.2);
  }
}

const WINE_DARK: Ramp = [
  [22, 12, 48],
  [30, 18, 60],
  [64, 36, 92],
  [148, 70, 96],
  [236, 138, 90],
];

export const MANOR_THEME: HallTheme = {
  plaster: r('#8a6db8', { shadowHue: 275, lightHue: 320 }),
  cream: r('#eadff3', { shadowHue: 285, lightHue: 60, lightness: [-0.3, -0.19, -0.1, -0.04, 0, 0.045] }),
  wood: r('#53305e', { shadowHue: 285, lightHue: 330, lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15] }),
  wine: WINE_DARK,
  cloth: r('#cf5a1e', { shadowHue: 350, lightHue: 60, lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14] }),
  ceiling: [30, 20, 58],
  edge: [42, 26, 66],
  shadow: [24, 12, 46],
  lineTint: [235, 220, 255],
  dotTint: [255, 218, 240],
  painting: twilightPainting,
};

export const SKY_GARDEN_THEME: HallTheme = {
  plaster: r('#86b2c0', { shadowHue: 235, lightHue: 90 }),
  cream: r('#f4eedc', { shadowHue: 300, lightHue: 80, lightness: [-0.3, -0.19, -0.1, -0.04, 0, 0.045] }),
  wood: r('#2f5f50', { shadowHue: 240, lightHue: 120, lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15] }),
  wine: WINE_DARK,
  cloth: r('#7a3fb0', { shadowHue: 285, lightHue: 330, lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14] }),
  ceiling: [26, 30, 64],
  edge: [34, 56, 76],
  shadow: [18, 30, 56],
  lineTint: [225, 245, 255],
  dotTint: [255, 244, 214],
  painting: twilightPainting,
};

const LEAVES_EBONY = r('#5a3566', { shadowHue: 285, lightHue: 330, lightness: [-0.3, -0.2, -0.1, 0, 0.08, 0.15] });

/**
 * The door out of the gallery, seen from inside: plum leaves and gold work, with the twilight
 * forest's pale blue light behind.
 */
export const MANOR_DOOR_STYLE: DoorStyle = {
  leaf: LEAVES_EBONY,
  trim: GEM.gold,
  light: [
    [226, 214, 255],
    [168, 150, 232],
    [110, 94, 186],
  ],
  kind: 'treasure',
};

const CABIN_LIGHT: readonly [RGB, RGB, RGB] = [
  [255, 248, 206],
  [255, 222, 128],
  [226, 168, 58],
];
/** The lift's doors on the ground floor look like a wall of flowers until a clue is found. */
export const LIFT_SECRET_STYLE: DoorStyle = {
  leaf: LEAVES_EBONY,
  trim: GEM.gold,
  light: CABIN_LIGHT,
  kind: 'lift',
  skin: 'flowers',
};
/** Up in the Sky Garden the lift is plain gold. */
export const LIFT_GOLD_STYLE: DoorStyle = {
  leaf: LEAVES_EBONY,
  trim: GEM.gold,
  light: CABIN_LIGHT,
  kind: 'lift',
  skin: 'gold',
};
