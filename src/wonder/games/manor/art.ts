import type { Rng } from '../../../domain/rng';
import { css, darken, lighten, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { glowAt, prerender, roundedRect, verticalGradient } from '../../engine/paint';

/**
 * What the Spooky Manor looks like in the pictures that are about it: the stone front with its lit
 * windows, the great door with its iron and its arch, the steps, the pumpkins that stand by them
 * and the golden hall that shows when the door opens. Drawn in code so it is exactly the size of
 * any screen, and made once.
 */

/** Where everything stands, in the view's units. */
export interface Front {
  readonly w: number;
  readonly h: number;
  /**
   * The doorway: its middle, its top (where the arch begins to curve is `top + width / 2`) and its
   * foot.
   */
  readonly door: { readonly x: number; readonly top: number; readonly bottom: number; readonly w: number };
  /** The foot of the steps: what the pumpkins and the letters stand on. */
  readonly ground: number;
}

/** The outline of an arched doorway with its left edge at `x`, as a closed path. */
export function archPath(g: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number): void {
  g.beginPath();
  g.moveTo(x, bottom);
  g.lineTo(x, top + w / 2);
  g.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, bottom);
  g.closePath();
}

export function frontOf(w: number, h: number): Front {
  const landscape = w >= h;
  const doorW = landscape ? Math.min(h * 0.4, w * 0.3) : Math.min(w * 0.52, h * 0.34);
  const doorH = Math.min(doorW * 1.62, h * 0.62);
  const bottom = h * (landscape ? 0.76 : 0.7);
  return { w, h, door: { x: w / 2, top: bottom - doorH, bottom, w: doorW }, ground: bottom + h * 0.08 };
}

/**
 * Where the two pumpkins stand by the steps, kept on the screen even when the door nearly fills it.
 */
export function pumpkinSpots(f: Front): { x: number; y: number; r: number }[] {
  const r = Math.max(14, Math.min(f.door.w * 0.2, f.h * 0.07));
  const reach = Math.min(f.door.w * 0.95 + r, f.w / 2 - r - 8);
  return [-1, 1].map((side) => ({ x: f.door.x + side * reach, y: f.ground + r * 0.5, r }));
}

const STONE: readonly RGB[] = [
  [74, 62, 112],
  [84, 70, 124],
  [66, 56, 102],
  [90, 76, 130],
];

/** The front of the manor and the night over it, which never moves. */
export function paintFront(g: CanvasRenderingContext2D, f: Front, rng: Rng): void {
  const { w, h } = f;
  verticalGradient(g, 0, 0, w, h, [
    [0, [14, 10, 44]],
    [0.3, [44, 26, 88]],
    [1, [70, 40, 100]],
  ]);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = css([255, 244, 224], rng.range(0.35, 1));
    g.fillRect(rng.range(0, w), rng.range(0, h * 0.18), 1.4, 1.4);
  }
  glowAt(g, w * 0.16, h * 0.1, h * 0.6, [255, 224, 150], 0.3);
  g.fillStyle = css([255, 238, 190]);
  g.beginPath();
  g.arc(w * 0.16, h * 0.1, h * 0.05, 0, TAU);
  g.fill();

  // The wall: courses of stone, each block a little different, with a dark line between.
  const wallTop = h * 0.2;
  g.fillStyle = css([58, 46, 92]);
  g.fillRect(0, wallTop, w, h - wallTop);
  const course = 22;
  for (let row = 0, y = wallTop; y < h; row++, y += course) {
    const block = 44 + (row % 3) * 8;
    for (let x = -((row * 17) % block); x < w; x += block) {
      g.fillStyle = css(STONE[rng.int(STONE.length)]!);
      roundedRect(g, x + 1.5, y + 1.5, block - 3, course - 3, 4);
      g.fill();
    }
  }
  // The roof's edge: a row of dark tiles along the top of the wall.
  g.fillStyle = css([34, 22, 66]);
  g.fillRect(0, wallTop - 14, w, 16);
  for (let x = 0; x < w + 24; x += 24) {
    g.beginPath();
    g.arc(x, wallTop + 2, 12, 0, Math.PI);
    g.fill();
  }
  // Two tall windows, lit from inside.
  const windowW = Math.min(46, w * 0.09);
  for (const side of [-1, 1]) {
    const x = f.door.x + side * (f.door.w / 2 + Math.min(w * 0.2, 130)) - windowW / 2;
    const top = f.door.top + 4;
    const hh = (f.door.bottom - f.door.top) * 0.55;
    glowAt(g, x + windowW / 2, top + hh / 2, hh * 1.7, [255, 190, 90], 0.35);
    archPath(g, x, top, windowW, top + hh);
    g.fillStyle = css([255, 204, 110]);
    g.fill();
    g.strokeStyle = css([50, 34, 74]);
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.moveTo(x + windowW / 2, top);
    g.lineTo(x + windowW / 2, top + hh);
    g.moveTo(x, top + hh * 0.5);
    g.lineTo(x + windowW, top + hh * 0.5);
    g.stroke();
  }

  // The steps up to the door, wider than it, in pale stone.
  const { door } = f;
  for (let i = 0; i < 3; i++) {
    const inset = i * 14;
    const y = door.bottom + i * (f.ground - door.bottom) * 0.34;
    g.fillStyle = css(lighten([98, 84, 138], 0.04 * (3 - i)));
    roundedRect(
      g,
      door.x - door.w * 0.8 - 20 + inset * -0.4,
      y,
      door.w * 1.6 + 40 + inset * 0.8,
      (f.ground - door.bottom) * 0.4,
      6,
    );
    g.fill();
  }
  // The stone round the door, with its keystone.
  const rim = 12;
  archPath(g, door.x - door.w / 2 - rim, door.top - rim, door.w + rim * 2, door.bottom);
  g.fillStyle = css([112, 96, 150]);
  g.fill();
  g.strokeStyle = css([40, 28, 70]);
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = css([138, 120, 176]);
  roundedRect(g, door.x - 13, door.top - rim - 6, 26, 24, 4);
  g.fill();
}

/**
 * One leaf of the door, from its hinge edge at the left of the picture to the seam at the right.
 * Draw it flipped for the right-hand leaf.
 */
export function leafPicture(f: Front, side: 'left' | 'right'): HTMLCanvasElement {
  const { door } = f;
  const half = door.w / 2;
  const hh = door.bottom - door.top;
  return prerender(half, hh, (g) => {
    // The whole arch is drawn and the picture keeps its half.
    const offset = side === 'left' ? 0 : -half;
    g.save();
    g.translate(offset, 0);
    archPath(g, 0, 0, door.w, hh);
    g.clip();
    const wood = g.createLinearGradient(0, 0, door.w, 0);
    wood.addColorStop(0, css([84, 46, 40]));
    wood.addColorStop(0.5, css([116, 66, 52]));
    wood.addColorStop(1, css([84, 46, 40]));
    g.fillStyle = wood;
    g.fillRect(0, 0, door.w, hh);
    // Planks, with the grain a little off from one to the next.
    const planks = 6;
    for (let i = 0; i < planks; i++) {
      const x = (i / planks) * door.w;
      g.fillStyle = css(darken([116, 66, 52], 0.06 * (i % 2) + 0.03));
      g.fillRect(x + 1, 0, door.w / planks - 2, hh);
      g.fillStyle = css([40, 22, 28], 0.5);
      g.fillRect(x, 0, 1.6, hh);
    }
    // Iron straps across it, with rivets.
    for (const at of [0.2, 0.52, 0.84]) {
      const y = hh * at;
      g.fillStyle = css([44, 36, 58]);
      g.fillRect(0, y - 7, door.w, 14);
      g.fillStyle = css([150, 140, 176]);
      for (let x = 10; x < door.w; x += 22) {
        g.beginPath();
        g.arc(x, y, 2.6, 0, TAU);
        g.fill();
      }
    }
    g.restore();
    g.strokeStyle = css([34, 20, 30]);
    g.lineWidth = 3;
    g.strokeRect(0, 0, half, hh);
  });
}

/**
 * A jack-o-lantern with its candle lit: the body, its three lobes, a stem and a face that glows.
 */
export function pumpkin(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const body: RGB = [255, 138, 40];
  for (const [dx, scale] of [
    [-0.5, 0.82],
    [0.5, 0.82],
    [0, 1],
  ] as const) {
    const grad = g.createRadialGradient(x + dx * r - r * 0.2, y - r * 0.4, r * 0.1, x + dx * r, y - r * 0.2, r * scale);
    grad.addColorStop(0, css(lighten(body, 0.25)));
    grad.addColorStop(1, css(darken(body, 0.28)));
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x + dx * r, y - r * 0.2, r * scale * 0.7, r * scale * 0.82, 0, 0, TAU);
    g.fill();
  }
  g.fillStyle = css([70, 120, 60]);
  roundedRect(g, x - r * 0.1, y - r * 1.25, r * 0.2, r * 0.4, 3);
  g.fill();
  g.fillStyle = css([255, 232, 130]);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + side * r * 0.5, y - r * 0.55);
    g.lineTo(x + side * r * 0.2, y - r * 0.25);
    g.lineTo(x + side * r * 0.62, y - r * 0.2);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.moveTo(x - r * 0.55, y);
  for (let i = 0; i <= 6; i++) g.lineTo(x - r * 0.55 + (i / 6) * r * 1.1, y + (i % 2 === 0 ? 0 : r * 0.28));
  g.lineTo(x + r * 0.5, y + r * 0.1);
  g.lineTo(x - r * 0.5, y + r * 0.1);
  g.closePath();
  g.fill();
}

/**
 * The hall as it shows through the open door: warm, deep, with a carpet running in and a chandelier
 * far back.
 */
export function hallPicture(f: Front): HTMLCanvasElement {
  const { door } = f;
  const hh = door.bottom - door.top;
  return prerender(door.w, hh, (g, w, h) => {
    verticalGradient(g, 0, 0, w, h, [
      [0, [255, 214, 120]],
      [0.5, [246, 146, 70]],
      [1, [168, 70, 52]],
    ]);
    // Floor running back, with the carpet narrowing to a point of light.
    g.fillStyle = css([150, 52, 56]);
    g.beginPath();
    g.moveTo(w * 0.1, h);
    g.lineTo(w * 0.44, h * 0.6);
    g.lineTo(w * 0.56, h * 0.6);
    g.lineTo(w * 0.9, h);
    g.closePath();
    g.fill();
    g.fillStyle = css([255, 214, 120], 0.8);
    g.beginPath();
    g.moveTo(w * 0.34, h);
    g.lineTo(w * 0.47, h * 0.6);
    g.lineTo(w * 0.53, h * 0.6);
    g.lineTo(w * 0.66, h);
    g.closePath();
    g.fill();
    glowAt(g, w / 2, h * 0.5, w * 1.1, [255, 236, 170], 0.5);
    // A chandelier, a little ring of light.
    g.strokeStyle = css([120, 70, 30]);
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(w / 2, h * 0.3, w * 0.14, h * 0.025, 0, 0, TAU);
    g.stroke();
    // The walls of the hall at both sides, darker toward the door.
    const wall = g.createLinearGradient(0, 0, w, 0);
    wall.addColorStop(0, css([90, 40, 60], 0.85));
    wall.addColorStop(0.28, css([90, 40, 60], 0));
    wall.addColorStop(0.72, css([90, 40, 60], 0));
    wall.addColorStop(1, css([90, 40, 60], 0.85));
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
  });
}

/** The gold plate on the seam of the door with the keyhole in it. */
export function paintLock(g: CanvasRenderingContext2D, x: number, y: number, r: number, glow: number): void {
  g.fillStyle = css([40, 28, 56]);
  g.beginPath();
  g.arc(x, y, r + 3, 0, TAU);
  g.fill();
  const plate = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  plate.addColorStop(0, css([255, 238, 150]));
  plate.addColorStop(1, css([214, 150, 40]));
  g.fillStyle = plate;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = css([255, 246, 190], 0.2 + 0.8 * glow);
  g.beginPath();
  g.arc(x, y - r * 0.18, r * 0.26, 0, TAU);
  g.fill();
  roundedRect(g, x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.62, 2);
  g.fill();
}
