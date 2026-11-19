import type { Rng } from '../../../domain/rng';
import { css, darken, lighten, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { paintMoon, prerender, roundedRect, verticalGradient } from '../../engine/paint';
import type { Plan } from './layout';
import type { HouseShape } from './shape';

/** The colours a house can be painted, and the trim of its door. */
export interface Palette {
  readonly wall: RGB;
  readonly roof: RGB;
  readonly trim: RGB;
}

export const PALETTES: readonly Palette[] = [
  { wall: [255, 226, 190], roof: [214, 62, 72], trim: [150, 96, 70] },
  { wall: [250, 200, 212], roof: [60, 150, 96], trim: [124, 82, 112] },
  { wall: [196, 224, 255], roof: [150, 92, 196], trim: [92, 86, 142] },
  { wall: [210, 238, 214], roof: [64, 110, 196], trim: [112, 98, 72] },
];

const SNOW: RGB = [250, 252, 255];
const BRICK: RGB = [178, 86, 72];
export const WINDOW_DARK: RGB = [30, 38, 88];
/** The glow of a lit window, and of the bulbs along a roof, in turn. */
export const WARM: RGB = [255, 214, 120];
export const BULBS: readonly RGB[] = [
  [255, 96, 96],
  [255, 208, 96],
  [112, 172, 255],
  [255, 132, 212],
  [120, 236, 152],
];

/** A picture of a house or a tree and where its foot is in it, in units. */
export interface Art {
  readonly canvas: HTMLCanvasElement;
  readonly ox: number;
  readonly oy: number;
  readonly w: number;
  readonly h: number;
}

const PAD = 8;

/** A house, with its windows dark: the game lights them. */
export function makeHouse(shape: HouseShape, palette: Palette, pixels: number): Art {
  const half = Math.max(shape.roof.half, -shape.wall.x) + PAD;
  const up = -shape.chimney.top + PAD;
  const w = half * 2;
  const h = up + PAD;
  const { wall, roof, chimney: c, door } = shape;
  const canvas = prerender(
    w,
    h,
    (g) => {
      g.translate(half, up);
      // The chimney stands behind the roof, with a dark mouth at the top for the present to fall in.
      g.fillStyle = css(BRICK);
      g.fillRect(c.x - c.w / 2, c.top, c.w, c.base - c.top);
      g.strokeStyle = css(darken(BRICK, 0.35), 0.55);
      g.lineWidth = 0.8;
      for (let y = c.top + 6; y < c.base; y += 5) {
        g.beginPath();
        g.moveTo(c.x - c.w / 2, y);
        g.lineTo(c.x + c.w / 2, y);
        g.stroke();
      }
      g.fillStyle = css(lighten(BRICK, 0.1));
      roundedRect(g, c.x - c.w / 2 - 2.5, c.top - 3, c.w + 5, 6, 2);
      g.fill();
      g.fillStyle = css([34, 22, 30]);
      g.beginPath();
      g.ellipse(c.x, c.top - 0.6, c.w / 2 - 0.5, 2.4, 0, 0, TAU);
      g.fill();

      // The wall, with a darker foot, and logs on a cabin.
      const body = g.createLinearGradient(0, wall.y, 0, 0);
      body.addColorStop(0, css(palette.wall));
      body.addColorStop(1, css(darken(palette.wall, 0.14)));
      g.fillStyle = body;
      g.fillRect(wall.x, wall.y, wall.w, wall.h);
      if (shape.name === 'cabin') {
        g.strokeStyle = css(darken(palette.wall, 0.3), 0.55);
        g.lineWidth = 1.2;
        for (let y = wall.y + 8; y < -4; y += 8) {
          g.beginPath();
          g.moveTo(wall.x, y);
          g.lineTo(wall.x + wall.w, y);
          g.stroke();
        }
      }
      g.fillStyle = css(darken(palette.wall, 0.28), 0.9);
      g.fillRect(wall.x, -5, wall.w, 5);

      // The roof, its shingles, and a thick quilt of snow along it.
      const slate = g.createLinearGradient(0, roof.apex, 0, roof.eave + 6);
      slate.addColorStop(0, css(lighten(palette.roof, 0.16)));
      slate.addColorStop(1, css(darken(palette.roof, 0.18)));
      g.save();
      g.beginPath();
      g.moveTo(-roof.half, roof.eave + 6);
      g.lineTo(-roof.half + 1, roof.eave);
      g.lineTo(0, roof.apex - 2);
      g.lineTo(roof.half - 1, roof.eave);
      g.lineTo(roof.half, roof.eave + 6);
      g.closePath();
      g.fillStyle = slate;
      g.fill();
      g.clip();
      g.strokeStyle = css(darken(palette.roof, 0.4), 0.45);
      g.lineWidth = 1;
      for (let y = roof.apex + 8; y < roof.eave + 6; y += 6) {
        g.beginPath();
        g.moveTo(-roof.half, y);
        g.lineTo(roof.half, y);
        g.stroke();
      }
      g.restore();
      g.fillStyle = css([30, 24, 50], 0.22);
      g.fillRect(wall.x, roof.eave + 6, wall.w, 3);
      // Snow lies over the top of the roof, with a scalloped edge, and in heaps at the eaves.
      const cut = 0.5;
      const edgeY = roof.apex + (roof.eave - roof.apex) * cut;
      const edgeX = roof.half * cut;
      g.fillStyle = css([196, 212, 244], 0.7);
      for (let x = -edgeX + 1; x <= edgeX; x += 7.5) {
        g.beginPath();
        g.arc(x, edgeY + 2.4, 4.4, 0, TAU);
        g.fill();
      }
      g.fillStyle = css(SNOW);
      g.beginPath();
      g.moveTo(0, roof.apex - 3.5);
      g.lineTo(edgeX + 2.5, edgeY + 0.5);
      g.lineTo(-edgeX - 2.5, edgeY + 0.5);
      g.closePath();
      g.fill();
      for (let x = -edgeX + 1; x <= edgeX; x += 7.5) {
        g.beginPath();
        g.arc(x, edgeY + 1, 4.4, 0, TAU);
        g.fill();
      }
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(side * (roof.half - 7), roof.eave + 1, 7.5, 3.4, 0, 0, TAU);
        g.fill();
      }

      // The door, with a wreath on it, and the windows, which are dark panes in white frames.
      g.fillStyle = css(palette.trim);
      roundedRect(g, door.x, door.y, door.w, door.h, 3);
      g.fill();
      g.fillStyle = css(lighten(palette.trim, 0.25));
      g.beginPath();
      g.arc(door.x + door.w - 3.8, door.y + door.h / 2 + 3, 1.3, 0, TAU);
      g.fill();
      g.strokeStyle = css([52, 140, 84]);
      g.lineWidth = 2.6;
      g.beginPath();
      g.arc(door.x + door.w / 2, door.y + 8.5, 4.4, 0, TAU);
      g.stroke();
      g.fillStyle = css([230, 56, 70]);
      for (const a of [0.6, 2.2, 3.9]) {
        g.beginPath();
        g.arc(door.x + door.w / 2 + Math.cos(a) * 4.4, door.y + 8.5 + Math.sin(a) * 4.4, 1.3, 0, TAU);
        g.fill();
      }
      for (const win of shape.windows) {
        g.fillStyle = css([255, 250, 240]);
        roundedRect(g, win.x - 1.6, win.y - 1.6, win.w + 3.2, win.h + 3.2, 2.6);
        g.fill();
        g.fillStyle = css(WINDOW_DARK);
        roundedRect(g, win.x, win.y, win.w, win.h, 1.8);
        g.fill();
        g.fillStyle = css(SNOW);
        roundedRect(g, win.x - 2.4, win.y + win.h + 0.8, win.w + 4.8, 3.4, 1.7);
        g.fill();
      }
      if (shape.name === 'bakery') awning(g, shape.windows[0]!, palette);

      // Snow heaped round the foot.
      g.fillStyle = css(SNOW);
      for (let x = -half + 10; x <= half - 8; x += 17) {
        g.beginPath();
        g.ellipse(x, 0, 13, 5.2, 0, 0, TAU);
        g.fill();
      }
      g.fillStyle = css([186, 204, 240], 0.6);
      g.beginPath();
      g.ellipse(0, 3, half - 4, 2.6, 0, 0, TAU);
      g.fill();
    },
    pixels,
  );
  return { canvas, ox: half, oy: up, w, h };
}

/** The striped awning over the window of the bakery, with a scalloped edge. */
function awning(g: CanvasRenderingContext2D, win: HouseShape['windows'][number], palette: Palette): void {
  const x0 = win.x - 4;
  const w = win.w + 8;
  const top = win.y - 11;
  const n = Math.round(w / 6);
  const step = w / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(i % 2 === 0 ? palette.roof : SNOW);
    g.beginPath();
    g.moveTo(x0 + i * step + 0.6, top);
    g.lineTo(x0 + (i + 1) * step - 0.6, top);
    g.lineTo(x0 + (i + 1) * step + 0.8, top + 9);
    g.lineTo(x0 + i * step - 0.8, top + 9);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(x0 + (i + 0.5) * step, top + 9, step / 2, 0, Math.PI);
    g.fill();
  }
}

/** The sleigh's size: its picture, and where its runner stands in it. */
export const SLEIGH = { w: 108, h: 92, ox: 58, oy: 78 };

/**
 * Santa's sleigh, drawn side on, facing right, with Santa and a sack of presents in it. Its runner
 * stands at the origin, and the tow rope is made fast at the front.
 */
export function makeSleigh(pixels: number): HTMLCanvasElement {
  return prerender(
    SLEIGH.w,
    SLEIGH.h,
    (g) => {
      g.translate(SLEIGH.ox, SLEIGH.oy);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // The sack of presents behind Santa, with three of them looking out.
      g.fillStyle = css([186, 134, 84]);
      g.beginPath();
      g.moveTo(-42, -26);
      g.bezierCurveTo(-52, -48, -38, -60, -24, -52);
      g.bezierCurveTo(-18, -44, -16, -34, -18, -26);
      g.closePath();
      g.fill();
      g.fillStyle = css([150, 104, 64]);
      g.beginPath();
      g.ellipse(-30, -52, 8, 3, -0.3, 0, TAU);
      g.fill();
      const gifts: readonly [number, number, RGB, RGB][] = [
        [-36, -56, [72, 132, 232], [255, 255, 255]],
        [-26, -59, [222, 62, 84], [255, 222, 120]],
        [-30, -64, [62, 172, 112], [255, 92, 112]],
      ];
      for (const [x, y, body, ribbon] of gifts) {
        g.fillStyle = css(body);
        roundedRect(g, x - 5, y - 5, 10, 10, 1.6);
        g.fill();
        g.fillStyle = css(ribbon);
        g.fillRect(x - 0.9, y - 5, 1.8, 10);
        g.fillRect(x - 5, y - 0.9, 10, 1.8);
      }
      // Santa: a red coat, a pink face, a white beard and a hat with a pom on it.
      g.fillStyle = css([210, 40, 56]);
      g.beginPath();
      g.ellipse(-3, -30, 12, 13, 0, 0, TAU);
      g.fill();
      g.fillStyle = css([252, 196, 170]);
      g.beginPath();
      g.arc(0, -48, 7.4, 0, TAU);
      g.fill();
      g.fillStyle = css(SNOW);
      g.beginPath();
      g.ellipse(2.6, -43.6, 6.4, 5.4, 0.1, 0, TAU);
      g.fill();
      g.fillStyle = css([236, 128, 138]);
      g.beginPath();
      g.arc(5.4, -47.6, 1.5, 0, TAU);
      g.fill();
      g.fillStyle = css([40, 30, 60]);
      g.beginPath();
      g.arc(3.2, -50.4, 0.95, 0, TAU);
      g.fill();
      g.fillStyle = css([210, 40, 56]);
      g.beginPath();
      g.moveTo(-8, -52);
      g.quadraticCurveTo(-6, -64, -15, -62);
      g.quadraticCurveTo(-4, -70, 8, -53);
      g.closePath();
      g.fill();
      g.fillStyle = css(SNOW);
      g.beginPath();
      g.ellipse(0, -53, 9, 3, -0.12, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(-15.5, -62, 3, 0, TAU);
      g.fill();
      // The body of the sleigh in front of him, curling up at the front, with gold trim and a runner.
      const tub = g.createLinearGradient(0, -34, 0, -6);
      tub.addColorStop(0, css([232, 62, 78]));
      tub.addColorStop(1, css([168, 30, 56]));
      g.fillStyle = tub;
      g.beginPath();
      g.moveTo(-44, -34);
      g.bezierCurveTo(-48, -14, -38, -7, -26, -7);
      g.lineTo(28, -7);
      g.bezierCurveTo(44, -7, 50, -22, 46, -36);
      g.bezierCurveTo(42, -30, 36, -26, 30, -25);
      g.lineTo(-30, -25);
      g.bezierCurveTo(-36, -28, -40, -31, -44, -34);
      g.closePath();
      g.fill();
      g.strokeStyle = css([255, 214, 110]);
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(-42, -31);
      g.bezierCurveTo(-45, -14, -36, -9, -26, -9);
      g.lineTo(28, -9);
      g.bezierCurveTo(42, -9, 47, -22, 44, -34);
      g.stroke();
      g.strokeStyle = css([226, 196, 120]);
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(-44, -2);
      g.quadraticCurveTo(-46, 1, -38, 1);
      g.lineTo(34, 1);
      g.bezierCurveTo(50, 1, 56, -6, 52, -17);
      g.stroke();
      g.lineWidth = 2.4;
      for (const x of [-26, 22]) {
        g.beginPath();
        g.moveTo(x, -7);
        g.lineTo(x, 0);
        g.stroke();
      }
    },
    pixels,
  );
}

/** A pine in the snow, with its foot in the middle at the bottom. */
export const PINE = { w: 44, h: 70 };

export function makePine(pixels: number): HTMLCanvasElement {
  return prerender(
    PINE.w,
    PINE.h,
    (g) => {
      g.translate(PINE.w / 2, PINE.h - 4);
      g.fillStyle = css([92, 62, 48]);
      g.fillRect(-3, -8, 6, 8);
      const tiers = [
        { half: 19, top: -34, bottom: -6 },
        { half: 15, top: -50, bottom: -24 },
        { half: 10.5, top: -64, bottom: -42 },
      ];
      for (const t of tiers) {
        const grad = g.createLinearGradient(0, t.top, 0, t.bottom);
        grad.addColorStop(0, css([54, 138, 92]));
        grad.addColorStop(1, css([28, 94, 74]));
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, t.top);
        g.lineTo(t.half, t.bottom);
        g.lineTo(-t.half, t.bottom);
        g.closePath();
        g.fill();
        g.fillStyle = css(SNOW);
        g.beginPath();
        g.moveTo(0, t.top - 1);
        g.lineTo(t.half * 0.55, t.top + (t.bottom - t.top) * 0.5);
        g.quadraticCurveTo(t.half * 0.3, t.top + (t.bottom - t.top) * 0.4, 0, t.top + (t.bottom - t.top) * 0.55);
        g.quadraticCurveTo(
          -t.half * 0.3,
          t.top + (t.bottom - t.top) * 0.4,
          -t.half * 0.55,
          t.top + (t.bottom - t.top) * 0.5,
        );
        g.closePath();
        g.fill();
      }
      g.fillStyle = css(SNOW);
      g.beginPath();
      g.ellipse(0, 0, 14, 3.4, 0, 0, TAU);
      g.fill();
    },
    pixels,
  );
}

/** A lamp post: the lantern is lit by the game, over the top. */
export const LAMP = { w: 20, h: 58 };

export function makeLamp(pixels: number): HTMLCanvasElement {
  return prerender(
    LAMP.w,
    LAMP.h,
    (g) => {
      g.translate(LAMP.w / 2, LAMP.h - 3);
      g.fillStyle = css([64, 56, 92]);
      g.fillRect(-1.6, -44, 3.2, 44);
      g.fillRect(-4, -4, 8, 4);
      g.fillStyle = css([52, 46, 80]);
      roundedRect(g, -6, -52, 12, 10, 2.5);
      g.fill();
      g.fillStyle = css([255, 232, 160]);
      roundedRect(g, -4.4, -50.4, 8.8, 7, 1.8);
      g.fill();
      g.fillStyle = css([52, 46, 80]);
      g.beginPath();
      g.moveTo(-7.4, -52);
      g.lineTo(0, -58);
      g.lineTo(7.4, -52);
      g.closePath();
      g.fill();
      g.fillStyle = css(SNOW);
      g.beginPath();
      g.ellipse(0, -0.5, 8, 2.6, 0, 0, TAU);
      g.fill();
    },
    pixels,
  );
}

/** The night sky as far as the horizon, with a moon in it: it does not move. */
export function makeSky(w: number, h: number, plan: Plan, pixels: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      verticalGradient(g, 0, 0, w, plan.ground, [
        [0, [12, 14, 50]],
        [0.5, [38, 36, 100]],
        [0.85, [104, 72, 140]],
        [1, [176, 110, 150]],
      ]);
      paintMoon(g, w < h ? w * 0.74 : w * 0.16, Math.max(plan.top + 34, h * 0.2), Math.min(26, h * 0.06));
    },
    pixels,
  );
}

/** A strip of dark pines along the bottom of a picture `w` wide, that repeats. */
export function makePines(w: number, h: number, rng: Rng, pixels: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      g.fillStyle = css([30, 56, 84]);
      const n = Math.round(w / 34);
      for (let i = 0; i < n; i++) {
        // Spread across the strip.
        const x = ((i + 0.2 + rng.next() * 0.6) / n) * w;
        const s = rng.range(0.6, 1.05);
        const tall = 44 * s;
        // Drawn again a strip to each side, so one that crosses the join carries on into the next.
        for (const at of [x - w, x, x + w]) {
          g.beginPath();
          g.moveTo(at, h - tall - 6);
          g.lineTo(at + 15 * s, h - 3);
          g.lineTo(at - 15 * s, h - 3);
          g.closePath();
          g.fill();
        }
      }
      g.fillRect(0, h - 5, w, 5);
    },
    pixels,
  );
}
