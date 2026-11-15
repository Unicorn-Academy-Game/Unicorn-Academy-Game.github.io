import type { UnicornId } from '../../../src/shared/ids';
import { createRgba, writePng } from '../core/image';
import { UNICORNS } from './characters';
import { PART } from './parts';

/**
 * Flat preview of a unicorn's flank decals in the side-view plane, both sides, over a rough barrel
 * outline. Usage: CHAR=glacier tsx glyph-preview.ts out.png
 */
const id = (process.env.CHAR ?? 'glacier') as UnicornId;
const spec = UNICORNS[id];
const out = process.argv[2] ?? 'assets/source/_scratch/glyphs.png';
const S = 6,
  X0 = -42,
  X1 = 50,
  Z0 = 30,
  Z1 = 100;
const hex = (h: string): [number, number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  255,
];
const W = (X1 - X0) * S,
  H = (Z1 - Z0) * S;
const img = createRgba(W, H * 2 + 8, [40, 44, 60, 255]);
const coat = hex(spec.palette.coat!.colors?.[3] ?? spec.palette.coat!.base);
for (const [row, side] of [
  [0, -1],
  [1, 1],
] as const) {
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = X0 + px / S,
        z = Z1 - py / S;
      let c: [number, number, number, number] | null = null;
      // rough silhouette: barrel rows and neck, only to place the eye
      const inBody = x > -36 && x < 33 && z > 41 && z < 68;
      const inNeck =
        Math.hypot(x - (22 + (z - 60) * 0.55), 0) < 7 &&
        z > 56 &&
        z < 92 &&
        x > 18 + (z - 60) * 0.5 - 8 &&
        x < 18 + (z - 60) * 0.5 + 12;
      const inLeg = z < 46 && ((x > 20 && x < 31) || (x > -29 && x < -18));
      if (inBody || inNeck || inLeg) c = coat;
      for (const d of spec.decals)
        if (d.test([x, side * 10, z], PART.body, null))
          c = hex(spec.palette[d.paint]!.colors?.[3] ?? spec.palette[d.paint]!.base);
      if (c) img.data.set(c, ((row * (H + 8) + py) * W + px) * 4);
    }
  }
}
writePng(out, img);
console.log(`wrote ${out}`);
