import { css, darken, lighten, mix, type RGB } from './color';
import { TAU } from './ease';

/**
 * The little pictures particles are made of, drawn once per colour and kept. Every one is a 64 by
 * 64 canvas centred on its middle, so a particle of any size is that picture scaled. Colours are
 * shared by whole families of nearby shades.
 */

export const SHAPES = [
  'glow',
  'spark',
  'star4',
  'star5',
  'heart',
  'dot',
  'streak',
  'confetti',
  'ring',
  'bubble',
  'petal',
  'note',
  'flake',
  'leaf',
  'butterfly',
  'pic',
  'tail',
  'halo',
  'ribbon',
] as const;
export type Shape = (typeof SHAPES)[number];

/**
 * Shapes that are drawn by adding light to what is behind them unless the particle says otherwise.
 */
export const GLOWING: ReadonlySet<Shape> = new Set<Shape>(['glow', 'spark', 'star4', 'streak', 'ring']);

/**
 * Shapes that are drawn from a cached picture, as opposed to being stroked or filled directly.
 * `ribbon`, like `streak` and `confetti`, is drawn directly.
 */
const DRAWN_FROM_PICTURE: ReadonlySet<Shape> = new Set<Shape>([
  'glow',
  'spark',
  'star4',
  'star5',
  'heart',
  'dot',
  'bubble',
  'petal',
  'note',
  'flake',
  'leaf',
  'butterfly',
  'tail',
  'halo',
]);

const SIZE = 64;
const C = SIZE / 2;

const WHITE: RGB = [255, 255, 255];

type Canvas2D = CanvasRenderingContext2D;

function newCanvas(): { canvas: HTMLCanvasElement; g: Canvas2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return { canvas, g: canvas.getContext('2d')! };
}

function radial(g: Canvas2D, stops: readonly [number, RGB, number][], radius = C): CanvasGradient {
  const grad = g.createRadialGradient(C, C, 0, C, C, radius);
  for (const [at, color, alpha] of stops) grad.addColorStop(at, css(color, alpha));
  return grad;
}

function fillGlow(g: Canvas2D, color: RGB, strength = 1): void {
  g.fillStyle = radial(g, [
    [0, lighten(color, 0.7), 0.9 * strength],
    [0.18, lighten(color, 0.35), 0.7 * strength],
    [0.45, color, 0.26 * strength],
    [0.75, color, 0.07 * strength],
    [1, color, 0],
  ]);
  g.fillRect(0, 0, SIZE, SIZE);
}

const drawers: Record<
  Exclude<Shape, 'streak' | 'confetti' | 'ring' | 'pic' | 'ribbon'>,
  (g: Canvas2D, color: RGB) => void
> = {
  glow(g, color) {
    g.fillStyle = radial(g, [
      [0, WHITE, 0.95],
      [0.1, lighten(color, 0.6), 0.9],
      [0.3, lighten(color, 0.2), 0.5],
      [0.62, color, 0.14],
      [1, color, 0],
    ]);
    g.fillRect(0, 0, SIZE, SIZE);
  },

  spark(g, color) {
    g.fillStyle = radial(g, [
      [0, WHITE, 1],
      [0.14, lighten(color, 0.75), 1],
      [0.28, color, 0.75],
      [0.5, color, 0.2],
      [1, color, 0],
    ]);
    g.fillRect(0, 0, SIZE, SIZE);
  },

  /**
   * The soft coloured light around a spark. It has no white in it, so a line of sparks keeps its
   * colour.
   */
  halo(g, color) {
    g.fillStyle = radial(g, [
      [0, color, 0.6],
      [0.35, color, 0.24],
      [0.7, color, 0.06],
      [1, color, 0],
    ]);
    g.fillRect(0, 0, SIZE, SIZE);
  },

  /**
   * The streak a spark leaves behind it, drawn pointing along +x with its head at the right edge
   * and its tip at the left. It is only ever used as the tail of a `spark`, stretched to as long as
   * the spark's own speed makes it.
   */
  tail(g, color) {
    const layers: readonly [number, number][] = [
      [13, 0.2],
      [7.5, 0.4],
      [3.2, 0.95],
    ];
    for (const [half, strength] of layers) {
      const grad = g.createLinearGradient(0, 0, SIZE, 0);
      grad.addColorStop(0, css(color, 0));
      grad.addColorStop(0.55, css(lighten(color, 0.3), 0.55 * strength));
      grad.addColorStop(1, css(lighten(color, 0.5), strength));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, C);
      g.quadraticCurveTo(SIZE * 0.5, C - half * 0.7, SIZE, C - half);
      g.lineTo(SIZE, C + half);
      g.quadraticCurveTo(SIZE * 0.5, C + half * 0.7, 0, C);
      g.closePath();
      g.fill();
    }
  },

  /** A four pointed twinkle with a halo: the shape of a bright star in a drawing. */
  star4(g, color) {
    fillGlow(g, color, 0.55);
    const arm = C - 2;
    g.beginPath();
    g.moveTo(C, C - arm);
    g.quadraticCurveTo(C + 1.6, C - 1.6, C + arm, C);
    g.quadraticCurveTo(C + 1.6, C + 1.6, C, C + arm);
    g.quadraticCurveTo(C - 1.6, C + 1.6, C - arm, C);
    g.quadraticCurveTo(C - 1.6, C - 1.6, C, C - arm);
    g.closePath();
    const fill = g.createRadialGradient(C, C, 0, C, C, arm);
    fill.addColorStop(0, css(WHITE, 1));
    fill.addColorStop(0.35, css(lighten(color, 0.55), 1));
    fill.addColorStop(1, css(color, 0.85));
    g.fillStyle = fill;
    g.fill();
  },

  /** A chubby five pointed star with rounded points, the one a child draws. */
  star5(g, color) {
    const outer = 27;
    const inner = 12.5;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outer : inner;
      const x = C + Math.cos(a) * r;
      const y = C + Math.sin(a) * r + 1;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = css(color);
    g.stroke();
    const fill = g.createLinearGradient(0, 4, 0, SIZE - 4);
    fill.addColorStop(0, css(lighten(color, 0.6)));
    fill.addColorStop(1, css(color));
    g.fillStyle = fill;
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = radial(g, [
      [0, WHITE, 0.6],
      [0.5, WHITE, 0],
      [1, WHITE, 0],
    ]);
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'source-over';
  },

  heart(g, color) {
    g.beginPath();
    g.moveTo(C, SIZE - 6);
    g.bezierCurveTo(C - 34, C + 8, C - 24, 3, C, 20);
    g.bezierCurveTo(C + 24, 3, C + 34, C + 8, C, SIZE - 6);
    g.closePath();
    const fill = g.createLinearGradient(0, 6, 0, SIZE - 6);
    fill.addColorStop(0, css(lighten(color, 0.45)));
    fill.addColorStop(0.55, css(color));
    fill.addColorStop(1, css(darken(color, 0.18)));
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = css(lighten(color, 0.55), 0.7);
    g.stroke();
    g.beginPath();
    g.ellipse(C - 12, 21, 6.5, 3.6, -0.7, 0, TAU);
    g.fillStyle = css(WHITE, 0.7);
    g.fill();
  },

  /** A round bead with a soft edge. */
  dot(g, color) {
    g.beginPath();
    g.arc(C, C, C - 4, 0, TAU);
    g.fillStyle = radial(
      g,
      [
        [0, lighten(color, 0.5), 1],
        [0.7, color, 1],
        [0.92, darken(color, 0.15), 1],
        [1, darken(color, 0.15), 0],
      ],
      C - 3,
    );
    g.fill();
  },

  /**
   * A soap bubble: nearly clear, a bright rim, a window of light, and a slip of colour from the
   * tint.
   */
  bubble(g, color) {
    const r = C - 3;
    g.fillStyle = radial(
      g,
      [
        [0, mix(color, WHITE, 0.7), 0.04],
        [0.62, mix(color, WHITE, 0.55), 0.1],
        [0.88, mix(color, WHITE, 0.4), 0.3],
        [1, WHITE, 0.55],
      ],
      r,
    );
    g.beginPath();
    g.arc(C, C, r, 0, TAU);
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = css(WHITE, 0.7);
    g.stroke();
    const sweep = g.createLinearGradient(C - r, C - r, C + r, C + r);
    sweep.addColorStop(0, css([255, 120, 200], 0.28));
    sweep.addColorStop(0.35, css([120, 220, 255], 0));
    sweep.addColorStop(0.65, css([140, 255, 200], 0));
    sweep.addColorStop(1, css([255, 230, 120], 0.3));
    g.fillStyle = sweep;
    g.beginPath();
    g.arc(C, C, r - 1, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(C - r * 0.38, C - r * 0.42, r * 0.28, r * 0.15, -0.75, 0, TAU);
    g.fillStyle = css(WHITE, 0.85);
    g.fill();
    g.beginPath();
    g.ellipse(C + r * 0.42, C + r * 0.46, r * 0.12, r * 0.06, -0.75, 0, TAU);
    g.fillStyle = css(WHITE, 0.45);
    g.fill();
  },

  petal(g, color) {
    g.beginPath();
    g.moveTo(C, SIZE - 8);
    g.bezierCurveTo(C - 30, C + 6, C - 18, 4, C, 6);
    g.bezierCurveTo(C + 18, 4, C + 30, C + 6, C, SIZE - 8);
    const fill = g.createLinearGradient(0, 6, 0, SIZE - 8);
    fill.addColorStop(0, css(lighten(color, 0.5)));
    fill.addColorStop(1, css(color));
    g.fillStyle = fill;
    g.fill();
  },

  note(g, color) {
    g.fillStyle = css(color);
    g.strokeStyle = css(color);
    g.beginPath();
    g.ellipse(C - 8, SIZE - 15, 11, 8, -0.4, 0, TAU);
    g.fill();
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(C + 2.5, SIZE - 19);
    g.lineTo(C + 2.5, 9);
    g.stroke();
    g.beginPath();
    g.moveTo(C + 2.5, 9);
    g.bezierCurveTo(C + 8, 20, C + 22, 20, C + 20, 34);
    g.lineWidth = 5;
    g.stroke();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = radial(g, [
      [0, WHITE, 0.55],
      [1, WHITE, 0],
    ]);
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'source-over';
  },

  flake(g, color) {
    fillGlow(g, color, 0.35);
    g.strokeStyle = css(lighten(color, 0.7));
    g.lineCap = 'round';
    g.lineWidth = 3.2;
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(C, C);
      g.rotate((i * TAU) / 6);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -26);
      g.moveTo(0, -15);
      g.lineTo(-7, -22);
      g.moveTo(0, -15);
      g.lineTo(7, -22);
      g.stroke();
      g.restore();
    }
  },

  leaf(g, color) {
    g.beginPath();
    g.moveTo(C, SIZE - 6);
    g.bezierCurveTo(C - 30, C + 10, C - 22, 8, C, 5);
    g.bezierCurveTo(C + 22, 8, C + 30, C + 10, C, SIZE - 6);
    const fill = g.createLinearGradient(C - 20, 0, C + 20, SIZE);
    fill.addColorStop(0, css(lighten(color, 0.4)));
    fill.addColorStop(1, css(darken(color, 0.1)));
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = css(darken(color, 0.3), 0.6);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(C, SIZE - 8);
    g.lineTo(C, 10);
    g.stroke();
  },

  /** Two wings seen from above with a small body. A flutter is the particle squeezing its width. */
  butterfly(g, color) {
    const wing = (sx: number): void => {
      g.save();
      g.translate(C, C);
      g.scale(sx, 1);
      g.beginPath();
      g.moveTo(1, -2);
      g.bezierCurveTo(14, -34, 36, -26, 28, -6);
      g.bezierCurveTo(24, 2, 12, 2, 1, 1);
      g.bezierCurveTo(14, 4, 30, 12, 24, 26);
      g.bezierCurveTo(18, 34, 6, 22, 1, 4);
      g.closePath();
      const fill = g.createLinearGradient(0, -30, 30, 26);
      fill.addColorStop(0, css(lighten(color, 0.45)));
      fill.addColorStop(0.6, css(color));
      fill.addColorStop(1, css(mix(color, [255, 255, 255], 0.2)));
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = css(darken(color, 0.35), 0.8);
      g.stroke();
      g.beginPath();
      g.arc(14, -13, 4, 0, TAU);
      g.fillStyle = css(WHITE, 0.7);
      g.fill();
      g.restore();
    };
    wing(1);
    wing(-1);
    g.beginPath();
    g.ellipse(C, C, 2.4, 12, 0, 0, TAU);
    g.fillStyle = css(darken(color, 0.55));
    g.fill();
  },
};

/** The picture for a shape in one colour. Shapes that are stroked or filled directly have none. */
export function makeShape(shape: Shape, color: RGB): HTMLCanvasElement | null {
  if (!DRAWN_FROM_PICTURE.has(shape)) return null;
  const { canvas, g } = newCanvas();
  drawers[shape as keyof typeof drawers](g, color);
  return canvas;
}
