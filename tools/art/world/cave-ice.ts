import type { RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2, mulberry32 } from '../core/rng';
import { sparkle } from './cave-gems';

/**
 * The sheet of ice that lies on the pool of the cave while the ice spell holds it: pale plates with
 * a seam between them, a lit lip on the upper left of each, a bright rim and a few glints. It is
 * flat on the floor, drawn a little wider than the pool so it covers the bank, and the game fades
 * it in and out.
 */
export const ICE_CANVAS = { w: 640, h: 380, ox: 320, oy: 190 } as const;

/** Half the width and height of the sheet's outline, before it wanders. */
const REACH = { x: 304, y: 174 } as const;

const PLATE: readonly RGB[] = [
  [150, 178, 228],
  [186, 212, 246],
  [214, 233, 253],
  [238, 247, 255],
  [255, 255, 255],
];
const SEAM: RGB = [112, 148, 214];
const RIM: RGB = [88, 122, 196];

export function renderIce(): Rgba {
  const { w, h, ox, oy } = ICE_CANVAS;
  const img = createRgba(w, h);
  const rng = mulberry32(404);
  // Plates are the cells of scattered points, found in a round space so they stay round once the
  // sheet is squashed.
  const sites = Array.from({ length: 30 }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng());
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  });
  const wander = (a: number): number =>
    1 + 0.035 * Math.sin(a * 3 + 1) + 0.025 * Math.sin(a * 5 + 4) + 0.015 * Math.sin(a * 9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x - ox) / REACH.x,
        v = (y - oy) / REACH.y;
      const a = Math.atan2(v, u);
      const r = Math.hypot(u, v) / wander(a);
      if (r >= 1) continue;
      let d1 = Infinity,
        d2 = Infinity,
        id = 0,
        nx = 0,
        ny = 0;
      sites.forEach((s, i) => {
        const dx = u - s.x,
          dy = v - s.y;
        const d = Math.hypot(dx * REACH.x, dy * REACH.y);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = i;
          nx = dx;
          ny = dy;
        } else if (d < d2) d2 = d;
      });
      const edge = d2 - d1;
      const rimWidth = 1 - r;
      let color: RGB;
      if (rimWidth < 0.012) color = RIM;
      else if (rimWidth < 0.05) color = PLATE[4]!;
      else if (edge < 2.4) color = SEAM;
      else {
        let tone = 1 + Math.floor(hash2(id, 3, 17) * 3);
        // The lip of a plate is lit on its upper left and in shadow on its lower right.
        if (edge < 6.5) tone += nx + ny < 0 ? 1 : -1;
        if (hash2(x >> 2, y >> 2, 41) > 0.965) tone += 1;
        color = PLATE[Math.max(0, Math.min(4, tone))]!;
      }
      img.data.set([color[0], color[1], color[2], 255], (y * w + x) * 4);
    }
  }
  for (const [px, py, size] of [
    [-150, -40, 3],
    [60, -90, 2],
    [170, 30, 3],
    [-40, 70, 2],
    [-210, 50, 2],
    [120, 90, 2],
  ] as const)
    sparkle(img, ox + px, oy + py, size, [255, 255, 255]);
  return img;
}
