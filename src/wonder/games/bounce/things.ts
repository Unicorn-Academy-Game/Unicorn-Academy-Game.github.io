import { COLORS, css, lighten, RAINBOW, type RGB } from '../../engine/color';
import { clamp, easeInOutCubic, lerp, TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import { PORTAL_RADIUS, PORTAL_RISE } from './ascent';

/**
 * The things in the sky that are not clouds: the door to the moon at the top, the stars that hang
 * along the leaps, and the heart over a friend who is waiting to be found.
 */

/**
 * The door to the moon: a round window in the sky above the last cloud, ringed with gold, that
 * shows the garden on the moon with light turning round in it. `x` and `y` are the standing line of
 * the gate's cloud. `near` is how close she is, from 0 to 1, which opens it a little wider. `open`
 * is how far it has opened wide, from 0 to 1, until it is `reach` wide and the window is all there
 * is. `beat` is 1 on a beat of the music and falls away.
 */
export function paintPortal(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D,
  vista: HTMLCanvasElement,
  x: number,
  y: number,
  t: number,
  near: number,
  open: number,
  reach: number,
  beat: number,
  tint: RGB,
  calm: boolean,
): void {
  const cx = x;
  const cy = y - PORTAL_RISE;
  const small = PORTAL_RADIUS * (0.9 + 0.1 * near) * (1 + 0.012 * beat);
  const r = lerp(small, reach, easeInOutCubic(open));
  const rim = 1 - clamp(open * 1.6);
  // The glow round it and the long soft rays that turn very slowly. They are laid on the sky before
  // the window, so that they light the sky and do not wash out what is seen through it.
  g.save();
  g.globalCompositeOperation = 'lighter';
  glowAt(g, cx, cy, small * 4.6 * (1 + open), lighten(tint, 0.3), (0.34 + 0.1 * beat) * (1 - open * 0.7));
  if (rim > 0.01) {
    g.fillStyle = css(lighten(tint, 0.5), (calm ? 0.035 : 0.06) * rim);
    const ray = r * 3.2;
    for (let i = 0; i < 12; i++) {
      const a = t * 0.07 + (i / 12) * TAU;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a - 0.07) * ray, cy + Math.sin(a - 0.07) * ray);
      g.lineTo(cx + Math.cos(a + 0.07) * ray, cy + Math.sin(a + 0.07) * ray);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
  // The window, with the moon in it.
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  g.drawImage(vista, cx - r, cy - r, r * 2, r * 2);
  // The light at its edge, a little paler than the middle so that it reads as a window and not a
  // hole.
  const edge = g.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
  edge.addColorStop(0, css(lighten(tint, 0.6), 0));
  edge.addColorStop(1, css(lighten(tint, 0.6), 0.3 * rim));
  g.fillStyle = edge;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  if (rim > 0.01) {
    for (const [grow, width, color] of [
      [1, 5, [255, 226, 140]],
      [0.9, 2, [255, 255, 255]],
      [1.1, 2, [255, 226, 140]],
    ] as const) {
      g.strokeStyle = css(color, (grow === 1 ? 0.95 : 0.6) * rim);
      g.lineWidth = width;
      g.beginPath();
      g.arc(cx, cy, r * grow, 0, TAU);
      g.stroke();
    }
  }
  // Light going round in it, in three arms.
  for (let arm = 0; arm < 3; arm++) {
    for (let k = 0; k < 9; k++) {
      const u = k / 9;
      const a = t * 0.9 + arm * (TAU / 3) + u * 2.6;
      const rr = r * (0.1 + u * 0.78);
      glowAt(
        light,
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr,
        (14 + u * 8) * (1 + open * 2),
        k % 3 === 0 ? [255, 226, 140] : lighten(tint, 0.4),
        0.7 * (1 - u * 0.5) * (1 - open * 0.8),
        'spark',
      );
    }
  }
  // A ring of seven small lights, in the colours of the rainbow, that turn the other way.
  if (rim > 0.01) {
    for (let i = 0; i < RAINBOW.length; i++) {
      const a = -t * 0.5 + (i / RAINBOW.length) * TAU;
      glowAt(light, cx + Math.cos(a) * r * 1.22, cy + Math.sin(a) * r * 1.22, 17, lighten(RAINBOW[i]!, 0.3), 0.8 * rim);
    }
  }
}

/**
 * The picture of the moon laid over the whole screen, as big as the door was when it had opened
 * wide: what is left of the door as the real garden comes up under it. It fades by `alpha`, from 1
 * to 0.
 */
export function paintCover(
  g: CanvasRenderingContext2D,
  vista: HTMLCanvasElement,
  cx: number,
  cy: number,
  r: number,
  alpha: number,
): void {
  if (alpha <= 0.004) return;
  const before = g.globalAlpha;
  g.globalAlpha = before * clamp(alpha);
  g.drawImage(vista, cx - r, cy - r, r * 2, r * 2);
  g.globalAlpha = before;
}

/**
 * A star that hangs in the air, turning about its middle, with a glow. `gem` is the picture of a
 * star.
 */
export function paintPickup(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D,
  gem: HTMLCanvasElement,
  x: number,
  y: number,
  t: number,
  i: number,
): void {
  const bob = Math.sin(t * 3 + i * 1.7) * 2.6;
  const turn = 0.74 + 0.26 * Math.cos(t * 2.4 + i * 0.9);
  const size = 30;
  glowAt(light, x, y + bob, 48, COLORS.gold, 0.38);
  g.drawImage(gem, x - (size * turn) / 2, y + bob - size / 2, size * turn, size);
}

/**
 * A heart over a friend who is waiting to be found, rising and falling a little, so she can be seen
 * from far off.
 */
export function paintCall(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  beat: number,
): void {
  const bob = Math.sin(t * 2.4) * 4;
  const size = 11 + 1.4 * beat;
  glowAt(light, x, y + bob, 70, [255, 140, 190], 0.5 + 0.2 * beat);
  g.save();
  g.translate(x, y + bob);
  g.rotate(Math.sin(t * 1.7) * 0.12);
  g.fillStyle = css([255, 104, 156]);
  g.strokeStyle = css([255, 255, 255]);
  g.lineWidth = 2.6;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, size * 0.9);
  g.bezierCurveTo(-size * 1.5, size * 0.1, -size * 0.7, -size * 0.9, 0, -size * 0.25);
  g.bezierCurveTo(size * 0.7, -size * 0.9, size * 1.5, size * 0.1, 0, size * 0.9);
  g.closePath();
  g.stroke();
  g.fill();
  g.fillStyle = css([255, 255, 255], 0.6);
  g.beginPath();
  g.ellipse(-size * 0.45, -size * 0.18, size * 0.22, size * 0.13, -0.7, 0, TAU);
  g.fill();
  g.restore();
}

/** A ring that opens where a finger touched and fades. `age` is in seconds. */
export function paintRipple(g: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  const u = clamp(age / 0.5);
  g.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - u)).toFixed(3)})`;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x, y, 8 + u * 34, 0, TAU);
  g.stroke();
}
