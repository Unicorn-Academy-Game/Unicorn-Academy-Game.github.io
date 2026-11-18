import type { RGB } from '../../core/color';
import type { Rgba } from '../../core/image';
import { Canvas2D, type Shape } from '../../fx/kit';
import { tone } from '../produce';

/**
 * The pictures drawn for words, in the same chunky glossy style as the fruit and the gems: a
 * dome-shaded fill in a ramp of its own colour, an outline in a dark tone of that colour, and a
 * bright spot where the light lands. A picture is drawn on a square of `DRAW` pixels, and the
 * outline goes round it on a margin, so a drawing may reach right to the edge of its square and
 * still be outlined all the way round. The picture stands centred on its canvas, since a word's
 * picture is shown in a frame and never stands on the ground.
 */
export const DRAW = 48;
const MARGIN = 2;
export const WORD_CANVAS = {
  w: DRAW + MARGIN * 2,
  h: DRAW + MARGIN * 2,
  ox: DRAW / 2 + MARGIN,
  oy: DRAW / 2 + MARGIN,
} as const;

export const canvas = (): Canvas2D => new Canvas2D(DRAW, DRAW);

export const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const WHITE: RGB = [255, 255, 255];

/** Closes a drawing with the outline every picture has, on the margin round it. */
export const done = (drawn: Canvas2D): Rgba => {
  const c = new Canvas2D(WORD_CANVAS.w, WORD_CANVAS.h);
  for (let y = 0; y < DRAW; y++)
    c.px.set(drawn.px.subarray(y * DRAW * 4, (y + 1) * DRAW * 4), ((y + MARGIN) * c.w + MARGIN) * 4);
  c.outline((n) => dark(n, 0.44));
  c.outline((n) => dark(n, 0.28), true);
  return c.rgba();
};

/** A shape turned about a point by `a` radians, clockwise on the screen. */
export const turn =
  (shape: Shape, cx: number, cy: number, a: number): Shape =>
  (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return shape(cx + dx * c + dy * s, cy - dx * s + dy * c);
  };

export const rect =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Ramps, darkest first. The hue of the shade and of the light lean away from the colour, as they do
// in the fruit.
export const RED = tone('#e8403f', 330, 50);
export const ROSE = tone('#ee4f7f', 335, 15);
export const PINK = tone('#ff7fb2', 335, 20);
export const ORANGE = tone('#f2862b', 335, 60);
export const AMBER = tone('#f5a31f', 15, 70);
export const YELLOW = tone('#ffd84a', 25, 85);
export const GOLD = tone('#f2c22e', 25, 80);
export const GREEN = tone('#5cbf4f', 200, 105);
export const LEAF = tone('#3f9b4a', 200, 110);
export const MINT = tone('#8ee0a8', 190, 120);
export const TEAL = tone('#35b5aa', 215, 150);
export const BLUE = tone('#4f93ee', 270, 200);
export const SKY = tone('#9ad7ff', 260, 215);
export const SLATE = tone('#6f88c4', 270, 200);
export const PURPLE = tone('#9657dd', 285, 330);
export const LILAC = tone('#c7a6f4', 280, 335);
export const CREAM = tone('#fff0d2', 20, 75);
export const PEACH = tone('#ffb48c', 345, 55);
export const WOOD = tone('#b06e3e', 320, 55);
export const DARKWOOD = tone('#7b4a2e', 315, 45);
export const STONE = tone('#bdb9cc', 270, 215);
export const SNOW = tone('#f4f2ff', 270, 60);
export const NIGHT = tone('#4a3a86', 275, 300);
export const INK = tone('#352b55', 270, 290);
export const BRICK = tone('#d9774a', 335, 45);
export const JADE = tone('#3fbf8c', 205, 125);
export const ONYX = tone('#3b3a4a', 265, 250);
export const BURLAP = tone('#cfa467', 330, 65);
export const SAND = tone('#ecc98f', 20, 70);
export const IRON = tone('#7d8aa6', 265, 215);
export const BROWN = tone('#8a5a3a', 320, 50);
