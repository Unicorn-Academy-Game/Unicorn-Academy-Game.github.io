import type { RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { flowerAt } from './manor-flowers';
import { Painter } from './paint';
import { GEM } from './palette';

/**
 * Two small pictures hung on the manor's walls: the jewelled butterfly that is the lift's clue, and
 * the flower garlands that swag between the columns. Both are painted on exact pixels.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

export const CLUE_CANVAS = { w: 72, h: 64, ox: 36, oy: 32 } as const;
export const CLUE_FRAMES = 6;

interface Wing {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
  ramp: readonly RGB[];
}

const RUBY: RGB[] = [
  [150, 24, 70],
  [214, 50, 100],
  [255, 100, 150],
  [255, 170, 200],
];
const SAPPHIRE: RGB[] = [
  [34, 60, 170],
  [70, 110, 235],
  [130, 174, 255],
  [200, 226, 255],
];

function paintWing(p: Painter, w: Wing, flap: number): void {
  const rx = w.rx * flap;
  for (let y = Math.floor(w.cy - w.ry - 2); y <= Math.ceil(w.cy + w.ry + 2); y++) {
    for (let x = Math.floor(w.cx - rx - 2); x <= Math.ceil(w.cx + rx + 2); x++) {
      const dx = x + 0.5 - w.cx,
        dy = y + 0.5 - w.cy;
      // The wing is an ellipse leaning away from the body.
      const u = (dx * Math.cos(w.tilt) + dy * Math.sin(w.tilt)) / Math.max(1, rx),
        v = (-dx * Math.sin(w.tilt) + dy * Math.cos(w.tilt)) / w.ry;
      const d = Math.hypot(u, v);
      if (d > 1) continue;
      if (d > 0.84) {
        p.px(x, y, rgb(GEM.gold[3]!));
        continue;
      }
      // A facet: three tones split by diagonals, a pale glint near the top.
      const k = u * 0.6 + v * 0.8;
      p.px(x, y, rgb(w.ramp[k < -0.35 ? 3 : k < 0.05 ? 2 : k < 0.45 ? 1 : 0]!));
      if (d < 0.22 && u + v < -0.1) p.px(x, y, [255, 255, 255]);
    }
  }
}

/**
 * A butterfly made of jewels. It beats its wings and throws out a few sparkles, so a child sees
 * something is alive in the wall.
 */
export function renderClue(frame: number): Rgba {
  const { w, h, ox, oy } = CLUE_CANVAS;
  const img = createRgba(w, h);
  const p = new Painter(img);
  // A soft glow behind, so the clue reads from across the room.
  const pulse = 0.5 + 0.5 * Math.sin((frame / CLUE_FRAMES) * Math.PI * 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - ox) / 30, (y + 0.5 - oy) / 26);
      if (d < 1) p.over(x, y, [255, 236, 150], (1 - d) * (0.28 + pulse * 0.14));
    }
  const flap = [1, 0.82, 0.58, 0.4, 0.58, 0.82][frame % CLUE_FRAMES]!;
  paintWing(p, { cx: ox - 11, cy: oy + 7, rx: 8, ry: 10, tilt: -0.5, ramp: SAPPHIRE }, flap);
  paintWing(p, { cx: ox + 11, cy: oy + 7, rx: 8, ry: 10, tilt: 0.5, ramp: SAPPHIRE }, flap);
  paintWing(p, { cx: ox - 12, cy: oy - 5, rx: 12, ry: 11, tilt: 0.5, ramp: RUBY }, flap);
  paintWing(p, { cx: ox + 12, cy: oy - 5, rx: 12, ry: 11, tilt: -0.5, ramp: RUBY }, flap);
  // Body and feelers in gold.
  for (let y = -11; y <= 13; y++) {
    const r = Math.abs(y) > 9 ? 1 : 2;
    for (let x = -r + 1; x <= r - 1 + (r === 2 ? 0 : 0); x++) p.px(ox + x, oy + y + 1, rgb(GEM.gold[x < 0 ? 5 : 3]!));
  }
  for (const [dx, dy] of [
    [-1, -13],
    [-2, -14],
    [-3, -15],
    [1, -13],
    [2, -14],
    [3, -15],
  ] as const)
    p.px(ox + dx, oy + dy, rgb(GEM.gold[4]!));
  p.px(ox - 3, oy - 16, [255, 255, 255]);
  p.px(ox + 3, oy - 16, [255, 255, 255]);
  // Sparkles that come and go round it, each lasting three frames.
  const spots: [number, number][] = [
    [-26, -12],
    [24, -18],
    [-20, 18],
    [27, 12],
    [2, -26],
  ];
  spots.forEach(([dx, dy], i) => {
    const on = (frame + i * 2) % CLUE_FRAMES;
    if (on > 2) return;
    const size = on === 1 ? 4 : 2;
    const x = ox + dx,
      y = oy + dy;
    p.px(x, y, [255, 255, 255]);
    for (let k = 1; k <= size; k++)
      for (const [ax, ay] of [
        [k, 0],
        [-k, 0],
        [0, k],
        [0, -k],
      ] as const)
        p.over(x + ax, y + ay, [255, 250, 200], k === size ? 0.5 : 0.95);
  });
  return img;
}

export const GARLAND_CANVAS = { w: 480, h: 74, ox: 240, oy: 0 } as const;

/**
 * A swag of flowers and leaves between two gold bows. It hangs from `oy` 0, so the map places it by
 * its top edge.
 */
export function renderGarland(): Rgba {
  const { w, h, ox } = GARLAND_CANVAS;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const sag = 44,
    half = (w - 40) / 2;
  const centre = (x: number): number => 8 + sag * (1 - ((x - ox) / half) ** 2);
  const thick = (x: number): number => 6 + 5 * (1 - Math.abs((x - ox) / half) ** 1.5);
  for (let x = ox - Math.round(half); x <= ox + Math.round(half); x++) {
    const cy = centre(x),
      t = thick(x);
    for (let y = Math.floor(cy - t); y <= Math.ceil(cy + t); y++) {
      const d = Math.abs(y + 0.5 - cy) / t;
      if (d > 1) continue;
      const c = flowerAt(x, y, { seed: 11, cell: 9, fill: 1 });
      const dark = d > 0.88 || (c[0] === 34 && c[1] === 40);
      p.px(x, y, dark ? [30, 36, 58] : rgb(c));
    }
  }
  // A gold bow at each end, and a short tassel under the lowest point.
  for (const sx of [-1, 1]) {
    const x = ox + sx * Math.round(half),
      y = Math.round(centre(x));
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const bow = Math.abs(dx) > 2 && Math.abs(dy) < 5 - Math.abs(dx) * 0.4;
        const knot = Math.hypot(dx, dy) < 3.2;
        if (bow || knot) p.px(x + dx, y + dy, rgb(GEM.gold[knot ? 5 : Math.abs(dy) < 2 ? 4 : 3]!));
      }
    for (let k = 0; k < 14; k++) {
      p.px(x - sx * 2, y + 7 + k, rgb(GEM.gold[k % 3 === 0 ? 5 : 3]!));
      p.px(x + sx * 2, y + 7 + k, rgb(GEM.gold[k % 3 === 0 ? 4 : 2]!));
    }
  }
  return img;
}
