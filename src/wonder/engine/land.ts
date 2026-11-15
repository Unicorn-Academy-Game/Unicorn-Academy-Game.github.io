import type { Rng } from '../../domain/rng';
import { css, darken, lighten, type RGB } from './color';
import { smooth, TAU } from './ease';

/**
 * Hills, trees and sleepy faces, drawn in code, for the games that have a landscape. Each is a pure
 * drawing: it keeps nothing.
 */

/** A hill line: how high the ground is at each place across the screen. */
export type Contour = (x: number) => number;

/** A line of low hills made of three waves, with level ground where something stands on it. */
export function contourOf(
  rng: Rng,
  base: number,
  amp: number,
  w: number,
  flatAt?: { readonly x: number; readonly reach: number },
): Contour {
  const waves = [
    { a: rng.range(0.55, 0.8), f: rng.range(0.9, 1.6), p: rng.range(0, TAU) },
    { a: rng.range(0.3, 0.45), f: rng.range(2.2, 3.4), p: rng.range(0, TAU) },
    { a: rng.range(0.1, 0.2), f: rng.range(5, 8), p: rng.range(0, TAU) },
  ];
  return (x) => {
    const u = x / w;
    let y = 0;
    for (const k of waves) y += Math.sin(u * TAU * k.f + k.p) * k.a;
    const level = flatAt ? smooth(Math.abs(x - flatAt.x) / flatAt.reach) : 1;
    return base - y * amp * level;
  };
}

/**
 * Fills the ground under a contour, with a gradient from the top colour to the bottom one, and a
 * light edge along its top.
 */
export function fillGround(
  g: CanvasRenderingContext2D,
  line: Contour,
  w: number,
  h: number,
  top: number,
  colors: readonly [RGB, RGB],
  edge: number,
): void {
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) g.lineTo(x, line(x));
  g.lineTo(w, h);
  g.closePath();
  const grad = g.createLinearGradient(0, top, 0, h);
  grad.addColorStop(0, css(colors[0]));
  grad.addColorStop(1, css(colors[1]));
  g.fillStyle = grad;
  g.fill();
  if (edge > 0) {
    g.strokeStyle = css(lighten(colors[0], 0.3), edge);
    g.lineWidth = 1.8;
    g.lineJoin = 'round';
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) g.moveTo(x, line(x));
      else g.lineTo(x, line(x));
    }
    g.stroke();
  }
}

/** A round tree: a short trunk and two lumps of leaves, the top one lighter. */
export function paintTree(g: CanvasRenderingContext2D, x: number, y: number, s: number, leaf: RGB): void {
  g.fillStyle = css(darken(leaf, 0.55));
  g.fillRect(x - s * 0.1, y - s * 0.5, s * 0.2, s * 0.55);
  g.fillStyle = css(darken(leaf, 0.12));
  g.beginPath();
  g.arc(x, y - s * 0.95, s * 0.52, 0, TAU);
  g.fill();
  g.fillStyle = css(lighten(leaf, 0.14));
  g.beginPath();
  g.arc(x - s * 0.1, y - s * 1.1, s * 0.4, 0, TAU);
  g.fill();
}

/** A face on a cloud, a sun or a moon, with its eyes shut in a smile. */
export function sleepyFace(g: CanvasRenderingContext2D, x: number, y: number, s: number, ink: RGB, blush: RGB): void {
  g.strokeStyle = css(ink);
  g.lineWidth = Math.max(1.1, s * 0.07);
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(x + side * s * 0.28, y, s * 0.11, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y + s * 0.02, s * 0.13, Math.PI * 0.18, Math.PI * 0.82);
  g.stroke();
  g.fillStyle = css(blush, 0.5);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + side * s * 0.48, y + s * 0.12, s * 0.12, s * 0.07, 0, 0, TAU);
    g.fill();
  }
}
