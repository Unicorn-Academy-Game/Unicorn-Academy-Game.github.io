import type { Pic } from '../../engine/bank';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { prerender } from '../../engine/paint';
import type { Bloom, Fruit } from './recipes';

/**
 * The flowers the berry machine makes, drawn in code once for each fruit: a rose, a poppy, a daisy,
 * a marigold, a sunflower, a pompom and a cornflower, each in the colour of the fruit it came from,
 * on a short stem with two leaves. Each is 64 wide and 80 tall with the foot of the stem at the
 * bottom middle, so one is stood on a shelf by its foot.
 */

export const BLOOM_W = 64;
export const BLOOM_H = 80;
/** Where the middle of the head is in the picture, and how far across its petals reach at most. */
export const HEAD = { x: 32, y: 29, r: 25 } as const;

const LEAF: RGB = [64, 176, 98];

function stem(g: CanvasRenderingContext2D): void {
  g.lineCap = 'round';
  g.strokeStyle = css(darken(LEAF, 0.35));
  g.lineWidth = 4.2;
  g.beginPath();
  g.moveTo(32, 76);
  g.quadraticCurveTo(30, 60, 32, 44);
  g.stroke();
  g.strokeStyle = css(LEAF);
  g.lineWidth = 2.6;
  g.stroke();
  for (const side of [-1, 1] as const) {
    g.save();
    g.translate(31 + side * 1.5, 64 - (side > 0 ? 4 : 10));
    g.rotate(side * 0.9);
    g.fillStyle = css(LEAF);
    g.strokeStyle = css(darken(LEAF, 0.4));
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(side * 9, -8, side * 17, -1);
    g.quadraticCurveTo(side * 9, 5, 0, 0);
    g.fill();
    g.stroke();
    g.restore();
  }
}

/**
 * A petal pointing up from the origin, as long as `len` and as wide as `wid`, in a body colour with
 * a paler middle.
 */
function petal(g: CanvasRenderingContext2D, len: number, wid: number, color: RGB, light: RGB): void {
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, css(darken(color, 0.2)));
  grad.addColorStop(0.65, css(color));
  grad.addColorStop(1, css(lighten(color, 0.22)));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(color, 0.38), 0.85);
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-wid, -len * 0.25, -wid * 0.9, -len * 0.92, 0, -len);
  g.bezierCurveTo(wid * 0.9, -len * 0.92, wid, -len * 0.25, 0, 0);
  g.fill();
  g.stroke();
  g.strokeStyle = css(light, 0.45);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -len * 0.18);
  g.lineTo(0, -len * 0.7);
  g.stroke();
}

function ring(
  g: CanvasRenderingContext2D,
  count: number,
  turn: number,
  len: number,
  wid: number,
  color: RGB,
  light: RGB,
  from = 0,
): void {
  for (let i = 0; i < count; i++) {
    g.save();
    g.rotate(turn + from + (i / count) * TAU);
    petal(g, len, wid, color, light);
    g.restore();
  }
}

function disc(g: CanvasRenderingContext2D, r: number, inner: RGB, outer: RGB): void {
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, css(inner));
  grad.addColorStop(1, css(outer));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(outer, 0.4), 0.9);
  g.lineWidth = 1.1;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.stroke();
}

const PAINTERS: Readonly<Record<Bloom, (g: CanvasRenderingContext2D, color: RGB, light: RGB) => void>> = {
  rose(g, color, light) {
    ring(g, 6, 0.2, 24, 12, darken(color, 0.1), light);
    ring(g, 6, 0.5, 19, 10, color, light);
    ring(g, 5, 0.1, 13.5, 8, lighten(color, 0.08), light);
    // The tight middle of a rose, in a spiral.
    g.strokeStyle = css(darken(color, 0.45), 0.9);
    g.lineWidth = 1.6;
    g.fillStyle = css(lighten(color, 0.14));
    g.beginPath();
    g.arc(0, 0, 7, 0, TAU);
    g.fill();
    g.beginPath();
    for (let a = 0; a < TAU * 2; a += 0.3) {
      const rr = 1 + a * 0.46;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.stroke();
  },
  poppy(g, color, light) {
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate(0.3 + (i / 5) * TAU);
      g.translate(0, -11);
      const grad = g.createRadialGradient(0, -3, 2, 0, 0, 15);
      grad.addColorStop(0, css(lighten(color, 0.18)));
      grad.addColorStop(1, css(darken(color, 0.1)));
      g.fillStyle = grad;
      g.strokeStyle = css(darken(color, 0.4), 0.85);
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(0, 0, 13.5, 14.5, 0, 0, TAU);
      g.fill();
      g.stroke();
      g.restore();
    }
    disc(g, 6.5, [58, 40, 70], [26, 18, 38]);
    g.fillStyle = css(light, 0.9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      g.beginPath();
      g.arc(Math.cos(a) * 4.4, Math.sin(a) * 4.4, 0.9, 0, TAU);
      g.fill();
    }
  },
  daisy(g, color, light) {
    ring(g, 12, 0.1, 24, 5.4, lighten(color, 0.38), light);
    ring(g, 12, 0.1 + TAU / 24, 19, 4.6, lighten(color, 0.14), light);
    disc(g, 8, [255, 238, 130], [244, 180, 40]);
  },
  marigold(g, color, light) {
    ring(g, 14, 0.1, 22, 7, darken(color, 0.06), light);
    ring(g, 12, 0.3, 17, 6.5, color, light);
    ring(g, 10, 0.2, 12, 5.5, lighten(color, 0.12), light);
    ring(g, 8, 0.4, 7.5, 4, lighten(color, 0.3), light);
  },
  sunflower(g, color, light) {
    ring(g, 16, 0, 25, 5.2, darken(color, 0.04), light);
    ring(g, 16, TAU / 32, 21, 5, lighten(color, 0.1), light);
    disc(g, 11.5, [128, 82, 42], [58, 34, 22]);
    g.fillStyle = css([210, 160, 80], 0.9);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt(i / 28) * 9;
      g.beginPath();
      g.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.9, 0, TAU);
      g.fill();
    }
  },
  pompom(g, color, light) {
    // A ball of small round flowers, the way a hydrangea is.
    const dots: [number, number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt((i + 0.5) / 26) * 17;
      dots.push([Math.cos(a) * rr, Math.sin(a) * rr, 6.4 - (rr / 17) * 1.4]);
    }
    for (const [x, y, r] of dots) {
      g.save();
      g.translate(x, y);
      const tone = mix(color, light, ((x + y + 34) / 68) * 0.65);
      g.fillStyle = css(tone);
      g.strokeStyle = css(darken(color, 0.4), 0.8);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = css(lighten(tone, 0.5), 0.9);
      g.beginPath();
      g.arc(-r * 0.25, -r * 0.25, r * 0.28, 0, TAU);
      g.fill();
      g.restore();
    }
  },
  bell(g, color, light) {
    // A cornflower: a star of five wide, notched petals around a bright middle.
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate(0.1 + (i / 5) * TAU);
      const grad = g.createLinearGradient(0, 0, 0, -25);
      grad.addColorStop(0, css(darken(color, 0.15)));
      grad.addColorStop(1, css(lighten(color, 0.2)));
      g.fillStyle = grad;
      g.strokeStyle = css(darken(color, 0.4), 0.9);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-10, -18);
      g.lineTo(-5, -25);
      g.lineTo(0, -21);
      g.lineTo(5, -25);
      g.lineTo(10, -18);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    disc(g, 6.5, lighten(light, 0.6), light);
    g.fillStyle = css(darken(color, 0.3), 0.9);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.beginPath();
      g.arc(Math.cos(a) * 3, Math.sin(a) * 3, 0.9, 0, TAU);
      g.fill();
    }
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/**
 * The flower for a fruit, drawn the first time it is asked for. `scale` is how many pixels there
 * are in a unit of the picture.
 */
export function bloomImage(fruit: Fruit, scale = 2): HTMLCanvasElement {
  const key = `${fruit.id}|${scale}`;
  let image = cache.get(key);
  if (!image) {
    image = prerender(
      BLOOM_W,
      BLOOM_H,
      (g) => {
        stem(g);
        g.save();
        g.translate(HEAD.x, HEAD.y);
        g.lineJoin = 'round';
        PAINTERS[fruit.bloom](g, fruit.color, fruit.light);
        g.restore();
      },
      scale,
    );
    cache.set(key, image);
  }
  return image;
}

const pics = new Map<HTMLCanvasElement, Pic>();

/** A flower as a picture a particle can be, held by the foot of its stem. */
export function pictureOfBloom(image: HTMLCanvasElement): Pic {
  let pic = pics.get(image);
  if (!pic) {
    pic = {
      image,
      sx: 0,
      sy: 0,
      sw: image.width,
      sh: image.height,
      ax: image.width / 2,
      ay: image.height * (HEAD.y / BLOOM_H),
    };
    pics.set(image, pic);
  }
  return pic;
}
