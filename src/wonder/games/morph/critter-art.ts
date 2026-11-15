import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { gemImage } from '../../engine/gems';
import { BLOOM_W, bloomImage, HEAD } from './bloom-art';
import type { Shape } from './hatchling';
import { FRUITS, type FruitId, type Product } from './recipes';

/**
 * The hatchling, drawn in code: a soft round creature with big shining eyes, rosy cheeks, two
 * little feet and two little arms, in the colour of what the machine made most of. A crystal one
 * wears three stones on its head and a blossom one wears three flowers. Its feet are at the origin,
 * up is negative, and it is about 70 units tall.
 */

const INK: RGB = [44, 28, 62];

/** How tall it is, in units, so the game can put a name to where its head is. */
export const HATCHLING_HEIGHT = 72;

export interface Coat {
  readonly color: RGB;
  readonly product: Product;
  /** The three fruit whose stones or flowers it wears, most of all first. */
  readonly crown: readonly FruitId[];
}

export function paintHatchling(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  shape: Shape,
  coat: Coat,
  t: number,
): void {
  const up = Math.max(0, shape.lift);
  // A shadow on the ground, smaller and paler as it goes up.
  const lowness = 1 / (1 + up / 60);
  g.fillStyle = `rgba(10,10,40,${(0.28 * lowness).toFixed(3)})`;
  g.beginPath();
  g.ellipse(
    x + shape.shift * scale,
    y + 1,
    30 * scale * (0.7 + 0.3 * lowness),
    6 * scale * (0.7 + 0.3 * lowness),
    0,
    0,
    TAU,
  );
  g.fill();

  g.save();
  g.translate(x + shape.shift * scale, y - up * scale);
  g.rotate(shape.turn);
  const sx = Math.abs(shape.face) < 0.06 ? 0.06 * Math.sign(shape.face || 1) : shape.face;
  g.scale(scale * sx * (1 - shape.stretch * 0.5), scale * (1 + shape.stretch));
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const base = mix(coat.color, [255, 255, 255], 0.3);
  const edge = darken(coat.color, 0.5);
  const ink = css(edge, 0.95);

  // The feet.
  for (const side of [-1, 1] as const) {
    g.fillStyle = css(darken(base, 0.12));
    g.strokeStyle = ink;
    g.lineWidth = 1.8;
    g.beginPath();
    g.ellipse(side * 13, -3.5, 9.5, 5.2, 0, 0, TAU);
    g.fill();
    g.stroke();
  }
  // The arm that does not wave, and the one that does, behind the body.
  arm(g, -1, 0.35 + 0.15 * Math.sin(t * 2.4), base, ink);
  arm(g, 1, 0.5 - shape.wave * 2.3, base, ink);

  // The body, round and soft, lit from the top left.
  const body = g.createRadialGradient(-10, -50, 4, 0, -34, 36);
  body.addColorStop(0, css(lighten(base, 0.55)));
  body.addColorStop(0.55, css(base));
  body.addColorStop(1, css(darken(coat.color, 0.22)));
  g.fillStyle = body;
  g.strokeStyle = ink;
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(0, -33, 30, 28, 0, 0, TAU);
  g.fill();
  g.stroke();
  // A pale belly.
  g.fillStyle = css(lighten(base, 0.72), 0.7);
  g.beginPath();
  g.ellipse(0, -22, 15, 12, 0, 0, TAU);
  g.fill();
  if (coat.product === 'gem') {
    // Facets, as a stone has, in a lighter tone, across the head.
    g.strokeStyle = css(lighten(base, 0.7), 0.55);
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-26, -40);
    g.lineTo(-10, -58);
    g.lineTo(0, -44);
    g.lineTo(12, -59);
    g.lineTo(26, -40);
    g.stroke();
  } else {
    // A little leaf at each side, as a bud has.
    for (const side of [-1, 1] as const) {
      g.fillStyle = css([88, 190, 112]);
      g.strokeStyle = css([40, 100, 66]);
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(side * 26, -30);
      g.quadraticCurveTo(side * 40, -44, side * 38, -30);
      g.quadraticCurveTo(side * 38, -21, side * 26, -30);
      g.fill();
      g.stroke();
    }
  }
  // The face: two big eyes with a shine in each, rosy cheeks and a smile.
  const closed = Math.min(1, Math.max(0, shape.blink));
  for (const side of [-1, 1] as const) {
    const ex = side * 11.5;
    g.fillStyle = css(INK);
    g.beginPath();
    g.ellipse(ex, -36, 5.8, 7.4 * (1 - 0.88 * closed), 0, 0, TAU);
    g.fill();
    if (closed < 0.5) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex - 1.8, -39, 2.2, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(ex + 2, -33.4, 1.1, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,120,150,0.5)';
    g.beginPath();
    g.ellipse(side * 19, -26, 5.6, 3.4, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = css(INK);
  g.lineWidth = 2;
  const open = Math.max(0, shape.smile - 0.6) / 0.4;
  g.beginPath();
  if (open > 0.3) {
    g.fillStyle = css([164, 52, 84]);
    g.moveTo(-6.6, -27);
    g.quadraticCurveTo(0, -27 + 12 * open, 6.6, -27);
    g.closePath();
    g.fill();
    g.stroke();
  } else {
    g.moveTo(-5, -27.6);
    g.quadraticCurveTo(0, -27.6 + 5 * (0.4 + shape.smile), 5, -27.6);
    g.stroke();
  }
  // The crown: three stones or three flowers.
  const at: readonly (readonly [number, number, number])[] = [
    [-15, -57, -0.4],
    [0, -63, 0],
    [15, -57, 0.4],
  ];
  coat.crown.slice(0, 3).forEach((id, i) => {
    const [cx, cy, tilt] = at[i]!;
    const fruit = FRUITS[id];
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt + 0.06 * Math.sin(t * 2 + i));
    if (coat.product === 'gem') {
      g.drawImage(gemImage(fruit.color), -9.5, -12, 19, 19);
    } else {
      const image = bloomImage(fruit, 3);
      const w = 22;
      // Only the head of the flower, cut from its picture.
      const k = image.width / BLOOM_W;
      g.drawImage(
        image,
        (HEAD.x - HEAD.r) * k,
        (HEAD.y - HEAD.r) * k,
        HEAD.r * 2 * k,
        HEAD.r * 2 * k,
        -w / 2,
        -w / 2 - 2,
        w,
        w,
      );
    }
    g.restore();
  });
  g.restore();
}

function arm(g: CanvasRenderingContext2D, side: -1 | 1, raise: number, base: RGB, ink: string): void {
  g.save();
  g.translate(side * 26, -30);
  g.rotate(side * raise);
  g.fillStyle = css(darken(base, 0.06));
  g.strokeStyle = ink;
  g.lineWidth = 1.8;
  g.beginPath();
  g.ellipse(side * 8, 4, 10, 5.4, side * 0.3, 0, TAU);
  g.fill();
  g.stroke();
  g.restore();
}
