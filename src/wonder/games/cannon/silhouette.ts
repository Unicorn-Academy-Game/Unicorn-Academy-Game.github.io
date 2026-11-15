import { css, darken, lighten, type RGB } from '../../engine/color';
import { lerp, TAU } from '../../engine/ease';
import { prerender } from '../../engine/paint';
import type { Dress } from './dress';

/**
 * The picture the stars make, drawn as a soft shape of light. The stars of a constellation are only
 * where its points are, and a few dots do not make a unicorn. As the stars wake, this glows up
 * behind them, so a child sees the horse and the horn and the flowing tail and knows what they have
 * been waking. It is drawn once, at the size of the picture, and only faded after.
 */

/**
 * How much room round the picture the drawing has for its glow, as a share of the picture's width.
 */
export const GLOW_ROOM = 0.07;

type Pt = readonly [number, number];
type Curve = readonly [Pt, Pt, Pt, Pt];

/**
 * What a drawing is given. The sheet is one unit wide, so sizes are shares of the picture's width.
 */
interface Brush {
  readonly dress: Dress;
  /** The blur of the glow in canvas pixels, which the sheet's own scale does not change. */
  readonly blur: number;
}

/**
 * The drawn shape of each picture, by the constellation's name. They all fit a sheet one unit wide.
 */
const DRAWINGS: Readonly<Record<string, (g: CanvasRenderingContext2D, brush: Brush) => void>> = {
  unicorn: drawUnicorn,
  heart: drawHeart,
};

/**
 * Taking the glow's blur as a share of the picture's width, in pixels of the canvas the picture is
 * drawn into.
 */
const BLUR = 0.034;
const SCALE = 2;

/**
 * The picture as a canvas, `width` units across with the room for its glow all round. `flipped`
 * mirrors it. Its top left is `GLOW_ROOM * width` up and to the left of the sheet's own.
 */
export function silhouette(
  name: string,
  dress: Dress,
  width: number,
  aspect: number,
  flipped: boolean,
): HTMLCanvasElement {
  const pad = GLOW_ROOM * width;
  const draw = DRAWINGS[name] ?? drawUnicorn;
  return prerender(
    width + pad * 2,
    width * aspect + pad * 2,
    (g) => {
      g.translate(pad, pad);
      if (flipped) {
        g.translate(width, 0);
        g.scale(-1, 1);
      }
      g.scale(width, width);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      draw(g, { dress, blur: width * BLUR * SCALE });
    },
    SCALE,
  );
}

/**
 * What the body of the picture is filled with: pearl, a little darker toward its feet, with a glow
 * round it.
 */
function pearl(g: CanvasRenderingContext2D, { dress, blur }: Brush, height: number): void {
  const fill = g.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, css(dress.pearl[0]));
  fill.addColorStop(1, css(dress.pearl[1]));
  g.fillStyle = fill;
  g.strokeStyle = fill;
  glow(g, dress.awake.glow, blur, 0.95);
}

function glow(g: CanvasRenderingContext2D, color: RGB, blur: number, alpha: number): void {
  g.shadowColor = css(color, alpha);
  g.shadowBlur = blur;
}

const noGlow = (g: CanvasRenderingContext2D): void => {
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
};

/** A point along a cubic curve. */
function along([a, b, c, d]: Curve, t: number): Pt {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0], w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1]];
}

/**
 * A ribbon along a curve, `from` wide at its start and `to` wide at its end, with round ends.
 * Filled with the current fill.
 */
function ribbon(g: CanvasRenderingContext2D, curve: Curve, from: number, to: number): void {
  // As many round dabs as it takes for the thin end to be a line and not a row of dots.
  let length = 0;
  let before = curve[0];
  for (let i = 1; i <= 12; i++) {
    const at = along(curve, i / 12);
    length += Math.hypot(at[0] - before[0], at[1] - before[1]);
    before = at;
  }
  const steps = Math.min(260, Math.max(24, Math.ceil(length / (Math.min(from, to) * 0.3))));
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = along(curve, t);
    const r = lerp(from, to, t) / 2;
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fill();
}

/** A leg: a ribbon from the body down through a knee to the ground, and a hoof on its end. */
function leg(g: CanvasRenderingContext2D, top: Pt, knee: Pt, foot: Pt, from: number, to: number, hoof: string): void {
  // The curve that passes through the knee halfway along, as a cubic.
  const mid: Pt = [(4 * knee[0] - top[0] - foot[0]) / 2, (4 * knee[1] - top[1] - foot[1]) / 2];
  const toward = (a: Pt, b: Pt): Pt => [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3];
  ribbon(g, [top, toward(top, mid), toward(foot, mid), foot], from, to);
  const was = g.fillStyle;
  noGlow(g);
  g.fillStyle = hoof;
  g.beginPath();
  g.ellipse(foot[0], foot[1] - to * 0.1, to * 0.64, to * 0.5, 0, 0, TAU);
  g.fill();
  g.fillStyle = was;
}

/**
 * A unicorn at a gallop, facing right: a round body, an arched neck, a long face with a horn, front
 * legs reaching forward and hind legs pushing back, and a mane and a tail that stream out behind in
 * colours. Each part is one soft shape, so she is as gentle as a plush toy.
 */
function drawUnicorn(g: CanvasRenderingContext2D, brush: Brush): void {
  const { dress, blur } = brush;
  const strands = dress.caps;
  const gold = css(dress.awake.body);
  const tail: readonly Curve[] = [
    [
      [0.26, 0.22],
      [0.15, 0.13],
      [0.07, 0.21],
      [0.0, 0.16],
    ],
    [
      [0.26, 0.23],
      [0.16, 0.2],
      [0.09, 0.28],
      [0.01, 0.25],
    ],
    [
      [0.26, 0.24],
      [0.18, 0.27],
      [0.11, 0.33],
      [0.04, 0.34],
    ],
  ];
  // The tail goes behind her.
  tail.forEach((curve, i) => {
    g.fillStyle = css(strands[(i + 1) % strands.length]!);
    glow(g, strands[(i + 1) % strands.length]!, blur, 0.7);
    ribbon(g, curve, 0.05 - i * 0.004, 0.012);
  });
  pearl(g, brush, 0.52);
  const hoof = css(darken(dress.awake.body, 0.05));
  // The far legs go behind her body, the near ones in front of it.
  leg(g, [0.57, 0.33], [0.65, 0.4], [0.69, 0.49], 0.058, 0.044, hoof);
  leg(g, [0.36, 0.34], [0.31, 0.42], [0.21, 0.49], 0.064, 0.044, hoof);
  // Her body, neck and head in one outline, from the root of her tail along her back, up her neck,
  // round her face, and back along her throat, chest and belly.
  pearl(g, brush, 0.52);
  g.beginPath();
  g.moveTo(0.255, 0.215);
  g.bezierCurveTo(0.33, 0.185, 0.46, 0.175, 0.55, 0.185);
  g.bezierCurveTo(0.62, 0.19, 0.7, 0.115, 0.76, 0.085);
  g.bezierCurveTo(0.82, 0.095, 0.89, 0.13, 0.945, 0.178);
  g.bezierCurveTo(0.965, 0.19, 0.965, 0.222, 0.94, 0.226);
  g.bezierCurveTo(0.9, 0.232, 0.86, 0.222, 0.835, 0.202);
  g.bezierCurveTo(0.78, 0.24, 0.7, 0.28, 0.66, 0.31);
  g.bezierCurveTo(0.62, 0.34, 0.56, 0.37, 0.5, 0.37);
  g.bezierCurveTo(0.42, 0.375, 0.34, 0.36, 0.3, 0.34);
  g.bezierCurveTo(0.22, 0.32, 0.2, 0.25, 0.255, 0.215);
  g.closePath();
  g.fill();
  // The ear.
  g.beginPath();
  g.moveTo(0.752, 0.095);
  g.lineTo(0.792, 0.092);
  g.lineTo(0.772, 0.036);
  g.closePath();
  g.fill();
  leg(g, [0.62, 0.32], [0.72, 0.38], [0.78, 0.455], 0.064, 0.046, hoof);
  leg(g, [0.3, 0.31], [0.2, 0.38], [0.09, 0.43], 0.072, 0.046, hoof);
  // Her mane streams back from the crest of her neck.
  const mane: readonly Curve[] = [
    [
      [0.77, 0.09],
      [0.7, 0.03],
      [0.62, 0.09],
      [0.54, 0.04],
    ],
    [
      [0.73, 0.11],
      [0.66, 0.08],
      [0.58, 0.15],
      [0.47, 0.11],
    ],
    [
      [0.68, 0.14],
      [0.6, 0.15],
      [0.54, 0.22],
      [0.44, 0.2],
    ],
  ];
  mane.forEach((curve, i) => {
    g.fillStyle = css(strands[i % strands.length]!);
    glow(g, strands[i % strands.length]!, blur, 0.7);
    ribbon(g, curve, 0.04, 0.01);
  });
  noGlow(g);
  // The horn, which is the brightest part, with the twist of it drawn round.
  const base: readonly [Pt, Pt] = [
    [0.846, 0.106],
    [0.878, 0.118],
  ];
  const tip: Pt = [0.962, -0.012];
  const horn = g.createLinearGradient(0.85, 0.11, tip[0], tip[1]);
  horn.addColorStop(0, gold);
  horn.addColorStop(1, css(lighten(dress.awake.core, 0.5)));
  g.fillStyle = horn;
  glow(g, dress.awake.glow, blur, 1);
  g.beginPath();
  g.moveTo(base[0][0], base[0][1]);
  g.lineTo(base[1][0], base[1][1]);
  g.lineTo(tip[0], tip[1]);
  g.closePath();
  g.fill();
  noGlow(g);
  g.strokeStyle = css(darken(dress.awake.rim, 0.1), 0.55);
  g.lineWidth = 0.0055;
  g.lineCap = 'butt';
  for (let i = 1; i <= 5; i++) {
    const u = i / 6;
    g.beginPath();
    g.moveTo(lerp(base[0][0], tip[0], u), lerp(base[0][1], tip[1], u));
    g.lineTo(lerp(base[1][0], tip[0], u - 0.07), lerp(base[1][1], tip[1], u - 0.07));
    g.stroke();
  }
  // An eye, a nostril and a blush.
  g.fillStyle = css([52, 34, 96]);
  g.beginPath();
  g.ellipse(0.874, 0.148, 0.0095, 0.0125, 0.3, 0, TAU);
  g.fill();
  g.fillStyle = css([255, 255, 255], 0.85);
  g.beginPath();
  g.arc(0.877, 0.143, 0.0035, 0, TAU);
  g.fill();
  g.fillStyle = css(darken(dress.pearl[1], 0.35), 0.8);
  g.beginPath();
  g.ellipse(0.948, 0.2, 0.005, 0.0038, 0.3, 0, TAU);
  g.fill();
  g.fillStyle = css([255, 150, 170], 0.5);
  g.beginPath();
  g.ellipse(0.846, 0.185, 0.018, 0.011, 0.3, 0, TAU);
  g.fill();
}

/** A plump heart, as wide as the picture, with a soft shine on its upper left. */
function drawHeart(g: CanvasRenderingContext2D, brush: Brush): void {
  const h = 0.7826;
  pearl(g, brush, h);
  g.beginPath();
  g.moveTo(0.5, 0.2);
  g.bezierCurveTo(0.5, 0.03, 0.04, -0.02, 0.0, 0.26);
  g.bezierCurveTo(-0.02, 0.5, 0.3, 0.6, 0.5, h * 0.99);
  g.bezierCurveTo(0.7, 0.6, 1.02, 0.5, 1.0, 0.26);
  g.bezierCurveTo(0.96, -0.02, 0.5, 0.03, 0.5, 0.2);
  g.closePath();
  g.fill();
  noGlow(g);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(0.25, 0.17, 0.09, 0.05, -0.6, 0, TAU);
  g.fill();
}
