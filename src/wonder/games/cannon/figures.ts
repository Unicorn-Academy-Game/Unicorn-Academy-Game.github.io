import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, lerp, TAU } from '../../engine/ease';
import { roundedRect } from '../../engine/paint';
import type { Dress } from './dress';

/**
 * The drawings of the star cannon: a sleeping star or heart with a face and a nightcap, the line
 * between two stars, a z.
 */

const INK: RGB = [38, 24, 78];

/** A star with five points, centred on the origin, `r` from the middle to a tip. */
function starPath(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.54;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
}

/** A heart centred on the origin, `r` from the middle to its side. */
function heartPath(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.moveTo(0, r * 0.96);
  g.bezierCurveTo(-r * 0.36, r * 0.62, -r * 1.05, r * 0.22, -r * 1.0, -r * 0.28);
  g.bezierCurveTo(-r * 0.95, -r * 0.8, -r * 0.3, -r * 1.0, 0, -r * 0.5);
  g.bezierCurveTo(r * 0.3, -r * 1.0, r * 0.95, -r * 0.8, r * 1.0, -r * 0.28);
  g.bezierCurveTo(r * 1.05, r * 0.22, r * 0.36, r * 0.62, 0, r * 0.96);
  g.closePath();
}

/** How one sleeper looks this frame. */
export interface SleeperLook {
  readonly x: number;
  readonly y: number;
  /** From the middle to the tip of a point (or the side of a heart), in units. */
  readonly r: number;
  /** 0 asleep to 1 awake. */
  readonly open: number;
  /** How big it is compared with at rest. */
  readonly pop: number;
  readonly tilt: number;
  /** 0 eyes open, 1 shut, for an awake star. */
  readonly blink: number;
  /** 0 to 1 around a breath, for the mouth of a sleeper. */
  readonly breath: number;
  /** 1 with the nightcap on, and less as it comes off. */
  readonly cap: number;
  readonly capColor: RGB;
  /** How much brighter than at rest, from 0, for a star that is singing. */
  readonly shine: number;
}

/** Where a nightcap sits on a star or a heart, and how big it is, from the sleeper's middle. */
export function capAt(figure: 'star' | 'heart', r: number): { x: number; y: number; rot: number; size: number } {
  return figure === 'star'
    ? { x: -r * 0.12, y: -r * 0.8, rot: -0.3, size: r * 0.9 }
    : { x: -r * 0.52, y: -r * 0.78, rot: -0.55, size: r * 0.9 };
}

/** A nightcap with its base at the origin: a drooping cone, a pale band and a pompom. */
export function paintCap(g: CanvasRenderingContext2D, color: RGB, size: number, alpha = 1): void {
  const s = size;
  const was = g.globalAlpha;
  g.globalAlpha = was * alpha;
  g.lineJoin = 'round';
  g.fillStyle = css(color);
  g.strokeStyle = css(darken(color, 0.4));
  g.lineWidth = Math.max(1, s * 0.08);
  g.beginPath();
  g.moveTo(-s * 0.5, 0);
  g.quadraticCurveTo(-s * 0.3, -s * 0.95, s * 0.62, -s * 0.78);
  g.quadraticCurveTo(s * 0.34, -s * 0.5, s * 0.5, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = css([255, 250, 240]);
  roundedRect(g, -s * 0.56, -s * 0.12, s * 1.12, s * 0.2, s * 0.1);
  g.fill();
  g.beginPath();
  g.arc(s * 0.64, -s * 0.8, s * 0.17, 0, TAU);
  g.fill();
  g.globalAlpha = was;
}

/** Draws one sleeper: its body, its face asleep or awake, and its nightcap while it has one. */
export function paintSleeper(g: CanvasRenderingContext2D, dress: Dress, s: SleeperLook): void {
  const { r, open } = s;
  const body = mix(dress.asleep.body, dress.awake.body, open);
  const rim = mix(dress.asleep.rim, dress.awake.rim, open);
  const lit = mix(lighten(dress.asleep.body, 0.25), dress.awake.core, open);
  g.save();
  g.translate(s.x, s.y);
  g.rotate(s.tilt);
  g.scale(s.pop, s.pop);
  const heart = dress.figure === 'heart';
  const path = (): void => (heart ? heartPath(g, r * 0.86) : starPath(g, r * 0.84));
  g.lineJoin = 'round';
  // The outline first, a little wider than the body, so the rounded points have an edge.
  path();
  g.strokeStyle = css(rim);
  g.lineWidth = heart ? 4 : r * 0.3 + 3;
  g.stroke();
  const fill = g.createRadialGradient(-r * 0.22, -r * 0.3, r * 0.05, 0, 0, r * 1.05);
  fill.addColorStop(0, css(lighten(lit, s.shine * 0.5)));
  fill.addColorStop(0.55, css(lighten(body, s.shine * 0.3)));
  fill.addColorStop(1, css(rim));
  path();
  g.fillStyle = fill;
  g.fill();
  if (!heart) {
    g.strokeStyle = fill;
    g.lineWidth = r * 0.3;
    g.stroke();
  }
  // A shine on the upper left, like a plush toy.
  g.fillStyle = 'rgba(255,255,255,0.34)';
  g.beginPath();
  g.ellipse(-r * 0.3, heart ? -r * 0.42 : -r * 0.24, r * 0.16, r * 0.1, -0.7, 0, TAU);
  g.fill();

  const fy = heart ? -r * 0.06 : r * 0.1;
  if (open < 0.999) face(g, r, fy, 1 - open, false, s);
  if (open > 0.001) face(g, r, fy, open, true, s);

  if (s.cap > 0.001) {
    const at = capAt(dress.figure, r);
    g.save();
    g.translate(at.x, at.y);
    g.rotate(at.rot);
    paintCap(g, s.capColor, at.size, s.cap);
    g.restore();
  }
  g.restore();
}

/**
 * The face. Asleep it is two shut eyes, flushed cheeks and a small round mouth that breathes. Awake
 * it is bright round eyes that blink and a smile.
 */
function face(g: CanvasRenderingContext2D, r: number, y: number, alpha: number, awake: boolean, s: SleeperLook): void {
  const was = g.globalAlpha;
  g.globalAlpha = was * clamp(alpha);
  const ex = r * 0.25;
  g.fillStyle = 'rgba(255,120,150,0.42)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * r * 0.4, y + r * 0.2, r * 0.13, r * 0.085, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = css(INK, 0.9);
  g.fillStyle = css(INK);
  g.lineCap = 'round';
  if (awake) {
    const shut = clamp(s.blink);
    for (const side of [-1, 1]) {
      const cx = side * ex;
      if (shut > 0.6) {
        g.lineWidth = Math.max(1.2, r * 0.07);
        g.beginPath();
        g.moveTo(cx - r * 0.1, y);
        g.quadraticCurveTo(cx, y + r * 0.08, cx + r * 0.1, y);
        g.stroke();
        continue;
      }
      g.beginPath();
      g.ellipse(cx, y, r * 0.105, r * 0.14 * (1 - shut), 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(cx - r * 0.035, y - r * 0.05, r * 0.04, 0, TAU);
      g.fill();
      g.fillStyle = css(INK);
    }
    g.lineWidth = Math.max(1.2, r * 0.07);
    g.beginPath();
    g.arc(0, y + r * 0.1, r * 0.17, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else {
    g.lineWidth = Math.max(1.2, r * 0.07);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * ex - r * 0.11, y - r * 0.02);
      g.quadraticCurveTo(side * ex, y + r * 0.1, side * ex + r * 0.11, y - r * 0.02);
      g.stroke();
    }
    const puff = r * (0.05 + 0.035 * Math.sin(s.breath * TAU));
    g.beginPath();
    g.ellipse(0, y + r * 0.2, puff, puff * 1.15, 0, 0, TAU);
    g.fillStyle = css(INK, 0.8);
    g.fill();
  }
  g.globalAlpha = was;
}

/** A z, drawn with three strokes, that sleepers breathe out. `x`, `y` is its middle. */
export function paintZ(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  color: RGB = [255, 255, 255],
): void {
  if (alpha <= 0.01) return;
  const h = size / 2;
  g.save();
  g.translate(x, y);
  g.rotate(-0.15);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = css(INK, alpha * 0.5);
  g.lineWidth = Math.max(2.4, size * 0.34);
  g.beginPath();
  g.moveTo(-h, -h);
  g.lineTo(h, -h);
  g.lineTo(-h, h);
  g.lineTo(h, h);
  g.stroke();
  g.strokeStyle = css(color, alpha);
  g.lineWidth = Math.max(1.4, size * 0.2);
  g.stroke();
  g.restore();
}

/**
 * The line between two stars. Before they are both awake it is a row of faint dashes, so there is a
 * picture to wake. After it is a bright line that draws itself from the star that woke first, with
 * a spark at its tip while it grows and a twinkle that runs along it after.
 */
export function paintLink(
  g: CanvasRenderingContext2D,
  dress: Dress,
  from: { x: number; y: number },
  to: { x: number; y: number },
  drawn: number,
  t: number,
  seed: number,
  calm: boolean,
): void {
  if (drawn <= 0) {
    g.strokeStyle = css(dress.line, 0.3);
    g.lineWidth = 1.6;
    g.setLineDash([3, 6]);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();
    g.setLineDash([]);
    return;
  }
  const x = lerp(from.x, to.x, drawn);
  const y = lerp(from.y, to.y, drawn);
  g.lineCap = 'round';
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = css(dress.line, 0.2);
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(x, y);
  g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = css(lighten(dress.line, 0.55), 0.92);
  g.lineWidth = 1.9;
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(x, y);
  g.stroke();
  if (drawn < 1) return;
  // A twinkle that travels along the finished line, slowly, each line on its own beat.
  const u = (t * (calm ? 0.18 : 0.3) + seed) % 1;
  const a = Math.sin(u * Math.PI);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = css(lighten(dress.line, 0.6), 0.55 * a);
  g.beginPath();
  g.arc(lerp(from.x, to.x, u), lerp(from.y, to.y, u), 2.6, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}
