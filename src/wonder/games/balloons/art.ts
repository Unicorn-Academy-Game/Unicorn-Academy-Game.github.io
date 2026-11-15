import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, hump, TAU } from '../../engine/ease';
import { prerender } from '../../engine/paint';

/**
 * How a balloon looks. The body of each colour and size is drawn once and kept, so a screen full of
 * them costs a picture stamped per balloon. What moves, the face, the string, the shine on a foil,
 * is drawn fresh on top.
 */

const INK = '#2a1840';

/** A balloon body drawn into a canvas, and where its middle is in it. */
export interface Body {
  readonly canvas: HTMLCanvasElement;
  /** The middle of the balloon, from the top left of the canvas, in units. */
  readonly ox: number;
  readonly oy: number;
  /** Size of the canvas in units. */
  readonly w: number;
  readonly h: number;
}

/** How tall a balloon is above and below its middle, in radii. The knot is below the body. */
const TOP = 1.12;
const BOTTOM = 1.34;
const PAD = 4;

const bodies = new Map<string, Body>();
const foils = new Map<string, Body>();

/**
 * The size to draw a picture at so that it is sharp on a screen that has this many device pixels in
 * a unit.
 */
const sharpness = (k: number): number => Math.min(3, Math.max(1, Math.ceil(k * 2) / 2));

/** The outline of a balloon: an egg, rounder at the top, narrowing to the neck where it is tied. */
function eggPath(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.moveTo(0, -r * TOP);
  g.bezierCurveTo(r * 0.62, -r * TOP, r, -r * 0.56, r, -r * 0.04);
  g.bezierCurveTo(r, r * 0.56, r * 0.48, r * 1.0, r * 0.1, r * 1.12);
  g.lineTo(-r * 0.1, r * 1.12);
  g.bezierCurveTo(-r * 0.48, r * 1.0, -r, r * 0.56, -r, -r * 0.04);
  g.bezierCurveTo(-r, -r * 0.56, -r * 0.62, -r * TOP, 0, -r * TOP);
  g.closePath();
}

/** The picture of a balloon of this colour and radius, with its knot. */
export function bodyOf(color: RGB, r: number, k: number): Body {
  const scale = sharpness(k);
  const key = `${color[0]},${color[1]},${color[2]}|${Math.round(r * 2)}|${scale}`;
  const found = bodies.get(key);
  if (found) return found;
  const w = r * 2 + PAD * 2;
  const h = r * (TOP + BOTTOM) + PAD * 2;
  const ox = w / 2;
  const oy = PAD + r * TOP;
  const canvas = prerender(
    w,
    h,
    (g) => {
      g.translate(ox, oy);
      paintBody(g, color, r);
    },
    scale,
  );
  const made = { canvas, ox, oy, w, h };
  bodies.set(key, made);
  return made;
}

function paintBody(g: CanvasRenderingContext2D, c: RGB, r: number): void {
  // The knot goes first, so the body overlaps its top.
  g.fillStyle = css(darken(c, 0.12));
  g.beginPath();
  g.moveTo(-r * 0.15, r * 1.31);
  g.quadraticCurveTo(-r * 0.04, r * 1.12, -r * 0.1, r * 1.04);
  g.lineTo(r * 0.1, r * 1.04);
  g.quadraticCurveTo(r * 0.04, r * 1.12, r * 0.15, r * 1.31);
  g.quadraticCurveTo(0, r * 1.26, -r * 0.15, r * 1.31);
  g.closePath();
  g.fill();
  g.strokeStyle = css(darken(c, 0.5), 0.55);
  g.lineWidth = Math.max(0.8, r * 0.04);
  g.lineJoin = 'round';
  g.stroke();

  g.save();
  eggPath(g, r);
  g.clip();
  // Lit from the top left: light there, the true colour across the middle, and deeper toward the
  // far edge.
  const base = g.createRadialGradient(-r * 0.34, -r * 0.42, r * 0.06, -r * 0.04, -r * 0.04, r * 1.28);
  base.addColorStop(0, css(lighten(c, 0.46)));
  base.addColorStop(0.3, css(lighten(c, 0.14)));
  base.addColorStop(0.7, css(c));
  base.addColorStop(1, css(darken(c, 0.34)));
  g.fillStyle = base;
  g.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
  // Light that comes through from behind, a soft rim along the lower right.
  const rim = g.createRadialGradient(r * 0.66, r * 0.74, r * 0.04, r * 0.5, r * 0.58, r * 0.78);
  rim.addColorStop(0, css(lighten(c, 0.6), 0.5));
  rim.addColorStop(1, css(lighten(c, 0.6), 0));
  g.fillStyle = rim;
  g.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
  g.restore();

  eggPath(g, r);
  g.strokeStyle = css(darken(c, 0.5), 0.5);
  g.lineWidth = Math.max(0.8, r * 0.045);
  g.stroke();

  // The shine: a long soft ellipse and a dot.
  g.save();
  g.translate(-r * 0.44, -r * 0.52);
  g.rotate(-0.55);
  g.fillStyle = 'rgba(255,255,255,0.78)';
  g.beginPath();
  g.ellipse(0, 0, r * 0.12, r * 0.27, 0, 0, TAU);
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.62)';
  g.beginPath();
  g.arc(-r * 0.15, -r * 0.82, r * 0.055, 0, TAU);
  g.fill();
}

/**
 * How a face looks: where the eyes are turned, how shut they are, and how wide the mouth is open in
 * song.
 */
export interface Face {
  /** Where the eyes look, from -1 to 1 either way. */
  lookX: number;
  lookY: number;
  /** 0 is open, 1 is shut. */
  blink: number;
  /** 0 is a smile, 1 is a mouth open wide in song. */
  sing: number;
  /** 0 is usual, 1 is surprised. */
  wide: number;
}

export const newFace = (): Face => ({ lookX: 0, lookY: 0, blink: 0, sing: 0, wide: 0 });

/**
 * The face of a balloon of radius `r`, centred on its middle. Drawn in the balloon's own turned and
 * squashed space.
 */
export function paintFace(g: CanvasRenderingContext2D, r: number, f: Face, blush = true): void {
  const eyeY = -r * 0.04 + f.lookY * r * 0.03;
  const apart = r * 0.33;
  const shut = clamp(f.blink);
  const wide = 1 + f.wide * 0.3;
  const ew = r * 0.115 * wide;
  const eh = r * 0.155 * wide * (1 - shut * 0.88);
  g.fillStyle = INK;
  for (const side of [-1, 1]) {
    const ex = side * apart + f.lookX * r * 0.045;
    g.beginPath();
    g.ellipse(ex, eyeY, ew, Math.max(r * 0.02, eh), 0, 0, TAU);
    g.fill();
  }
  if (shut < 0.5) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const side of [-1, 1]) {
      const ex = side * apart + f.lookX * r * 0.045;
      g.beginPath();
      g.arc(ex + ew * 0.32, eyeY - eh * 0.34, Math.max(0.7, r * 0.04), 0, TAU);
      g.fill();
    }
  }
  if (blush && r >= 20) {
    g.fillStyle = 'rgba(255,112,150,0.42)';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(side * r * 0.58, r * 0.26, r * 0.13, r * 0.08, 0, 0, TAU);
      g.fill();
    }
  }
  const mouthY = r * (0.3 + 0.07 * f.sing);
  if (f.sing > 0.05) {
    // Singing: an open mouth that is wider and taller the more it sings, with a tongue.
    const mw = r * (0.075 + 0.07 * f.sing);
    const mh = r * (0.06 + 0.16 * f.sing);
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(0, mouthY + mh * 0.2, mw, mh, 0, 0, TAU);
    g.fill();
    if (mh > r * 0.1) {
      g.fillStyle = 'rgba(255,120,140,0.95)';
      g.beginPath();
      g.ellipse(0, mouthY + mh * 0.62, mw * 0.62, mh * 0.42, 0, 0, TAU);
      g.fill();
    }
  } else {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.9, r * 0.055);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, mouthY - r * 0.1, r * 0.13, Math.PI * 0.18, Math.PI * 0.82);
    g.stroke();
  }
}

/**
 * How shut an eye is at a moment: it blinks for a tenth of a second every few seconds, and not
 * together with any other.
 */
export function blinkOf(age: number, phase: number): number {
  const every = 3.4 + (phase % 1.7);
  const at = (age + phase * 2.3) % every;
  return at < 0.13 ? hump(at / 0.13) : 0;
}

/** A balloon's string: from its knot down in an easy S, trailing behind the way it moves. */
export function paintTrail(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  tail: number,
  age: number,
  color: RGB,
  alpha = 0.9,
): void {
  const len = r * 1.05 + 12;
  const curl = Math.sin(age * 2.6) * 2.6;
  g.strokeStyle = css(color, alpha);
  g.lineWidth = 1.15;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x + curl, y + len * 0.36, x - curl * 0.8 + tail * 0.5, y + len * 0.7, x + tail, y + len);
  g.stroke();
}

/** A string that runs straight to where it is tied, hanging a little slack. */
export function paintString(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGB,
  alpha = 0.92,
): void {
  const slack = Math.min(10, Math.hypot(x1 - x0, y1 - y0) * 0.05);
  g.strokeStyle = css(color, alpha);
  g.lineWidth = 1.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + slack * Math.sign(x0 - x1 || 1), (y0 + y1) / 2 + slack, x1, y1);
  g.stroke();
}

/**
 * What a balloon is drawn with at this moment, all in one place so a painter and a sheet of them
 * agree.
 */
export interface Look {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly tilt: number;
  /** 1 is whole. Below that it is being blown up, and a little over it is the spring of it. */
  readonly grow: number;
  /** A knock to its shape that comes and goes, squashing it. */
  readonly bump: number;
  readonly alpha: number;
}

/** Where on the screen the knot of a balloon is, which is where its string starts. */
export function knotOf(b: { x: number; y: number; r: number; tilt: number }, grow = 1): { x: number; y: number } {
  const d = b.r * 1.3 * grow;
  return { x: b.x - Math.sin(b.tilt) * d, y: b.y + Math.cos(b.tilt) * d };
}

/**
 * Draws a balloon body with the squash and lean it has. The face goes on after, in the same space,
 * with `face`.
 */
export function paintBalloon(
  g: CanvasRenderingContext2D,
  body: Body,
  l: Look,
  face: ((g: CanvasRenderingContext2D) => void) | null,
): void {
  if (l.grow <= 0.01 || l.alpha <= 0.01) return;
  const squash = clamp(l.bump, -0.4, 0.4);
  const s = Math.max(0.02, l.grow);
  g.save();
  g.translate(l.x, l.y);
  if (l.tilt) g.rotate(l.tilt);
  g.scale(s * (1 - squash * 0.5), s * (1 + squash));
  if (l.alpha !== 1) g.globalAlpha *= l.alpha;
  g.drawImage(body.canvas, -body.ox, -body.oy, body.w, body.h);
  if (face) face(g);
  g.restore();
}

export type Foil = 'star' | 'heart';

const GOLD: RGB = [255, 206, 66];
const ROSE: RGB = [255, 96, 150];
export const foilColor = (kind: Foil): RGB => (kind === 'star' ? GOLD : ROSE);

function starPath(g: CanvasRenderingContext2D, big: number, small: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? big : small;
    if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
}

function heartPath(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.moveTo(0, r * 0.96);
  g.bezierCurveTo(-r * 1.28, r * 0.12, -r * 1.08, -r * 0.92, -r * 0.46, -r * 0.84);
  g.bezierCurveTo(-r * 0.2, -r * 0.8, -r * 0.02, -r * 0.62, 0, -r * 0.4);
  g.bezierCurveTo(r * 0.02, -r * 0.62, r * 0.2, -r * 0.8, r * 0.46, -r * 0.84);
  g.bezierCurveTo(r * 1.08, -r * 0.92, r * 1.28, r * 0.12, 0, r * 0.96);
  g.closePath();
}

/**
 * A foil balloon in the shape of a star or a heart: facets of metal that catch the light different
 * ways.
 */
export function foilOf(kind: Foil, r: number, k: number): Body {
  const scale = sharpness(k);
  const key = `${kind}|${Math.round(r * 2)}|${scale}`;
  const found = foils.get(key);
  if (found) return found;
  const w = r * 2.5 + PAD * 2;
  const h = r * 2.5 + PAD * 2;
  const c = foilColor(kind);
  const canvas = prerender(
    w,
    h,
    (g) => {
      g.translate(w / 2, h / 2 - (kind === 'star' ? 0 : r * 0.04));
      const outline = (): void => (kind === 'star' ? starPath(g, r * 1.06, r * 0.5) : heartPath(g, r));
      g.lineJoin = 'round';
      g.lineCap = 'round';
      // The edge is soft, so the points of the star are not sharp and the foil looks pillowy.
      outline();
      g.fillStyle = css(darken(c, 0.12));
      g.fill();
      g.lineWidth = r * 0.2;
      g.strokeStyle = css(darken(c, 0.12));
      g.stroke();
      g.save();
      outline();
      g.clip();
      // Facets: wedges from the middle that are light and dark by turns.
      if (kind === 'star') {
        for (let i = 0; i < 10; i++) {
          const a0 = -Math.PI / 2 + (i * Math.PI) / 5;
          const a1 = a0 + Math.PI / 5;
          g.fillStyle = css(i % 2 === 0 ? lighten(c, 0.34) : mix(c, [255, 140, 40], 0.18));
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a0) * r * 1.5, Math.sin(a0) * r * 1.5);
          g.lineTo(Math.cos(a1) * r * 1.5, Math.sin(a1) * r * 1.5);
          g.closePath();
          g.fill();
        }
      } else {
        g.fillStyle = css(lighten(c, 0.3));
        g.fillRect(-r * 1.6, -r * 1.6, r * 1.6, r * 3.4);
        g.fillStyle = css(mix(c, [220, 40, 110], 0.3));
        g.fillRect(0, -r * 1.6, r * 1.6, r * 3.4);
        // A few creases of the foil, running out from the dip at the top.
        g.strokeStyle = css(lighten(c, 0.55), 0.5);
        g.lineWidth = Math.max(0.8, r * 0.035);
        for (const [x, y] of [
          [-0.62, 0.46],
          [-0.2, 0.7],
          [0.3, 0.64],
          [0.7, 0.4],
        ] as const) {
          g.beginPath();
          g.moveTo(0, -r * 0.36);
          g.lineTo(x * r, y * r);
          g.stroke();
        }
      }
      const sheen = g.createRadialGradient(-r * 0.34, -r * 0.4, r * 0.05, 0, 0, r * 1.4);
      sheen.addColorStop(0, css(lighten(c, 0.7), 0.85));
      sheen.addColorStop(0.45, css(lighten(c, 0.3), 0.18));
      sheen.addColorStop(1, css(darken(c, 0.45), 0.4));
      g.fillStyle = sheen;
      g.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
      g.restore();
      outline();
      g.strokeStyle = css(darken(c, 0.5), 0.6);
      g.lineWidth = Math.max(1, r * 0.04);
      g.stroke();
      g.save();
      g.translate(-r * 0.42, -r * 0.46);
      g.rotate(-0.6);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.ellipse(0, 0, r * 0.1, r * 0.22, 0, 0, TAU);
      g.fill();
      g.restore();
    },
    scale,
  );
  const made = { canvas, ox: w / 2, oy: h / 2 - (kind === 'star' ? 0 : r * 0.04), w, h };
  foils.set(key, made);
  return made;
}

/** A twinkle on a piece of foil: a small four-pointed star that comes and goes. */
export function paintTwinkle(g: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number): void {
  if (alpha <= 0.02) return;
  g.fillStyle = `rgba(255,255,255,${clamp(alpha).toFixed(3)})`;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? size : size * 0.2;
    if (i === 0) g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

/** A small bow of ribbon, for a balloon that is a gift. */
export function paintBow(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: RGB): void {
  g.fillStyle = css(color);
  g.strokeStyle = css(darken(color, 0.4), 0.7);
  g.lineWidth = Math.max(0.7, size * 0.07);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + side * size * 0.9, y - size * 0.9, x + side * size * 1.25, y + size * 0.15, x, y);
    g.fill();
    g.stroke();
  }
  g.fillStyle = css(lighten(color, 0.25));
  g.beginPath();
  g.arc(x, y, size * 0.24, 0, TAU);
  g.fill();
  g.stroke();
}
