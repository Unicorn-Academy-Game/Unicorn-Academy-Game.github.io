import type { RGB } from '../core/color';
import { hash2 } from '../core/rng';

/**
 * A wall of flowers as a pure function of the pixel: the same call on the wall panel, on the
 * disguised lift door and on a garland gives the same blooms. Blooms sit on a jittered grid. Each
 * is a ring of petals round a bright eye, set on leaves.
 */
const BLOOMS: readonly { petal: RGB; shade: RGB; light: RGB; eye: RGB }[] = [
  { petal: [232, 64, 98], shade: [168, 34, 74], light: [255, 130, 150], eye: [255, 214, 90] },
  { petal: [255, 150, 192], shade: [214, 96, 150], light: [255, 214, 232], eye: [255, 232, 120] },
  { petal: [158, 98, 226], shade: [110, 62, 176], light: [208, 164, 255], eye: [255, 226, 110] },
  { petal: [255, 246, 228], shade: [214, 196, 214], light: [255, 255, 250], eye: [255, 190, 70] },
  { petal: [255, 206, 74], shade: [226, 150, 38], light: [255, 238, 150], eye: [196, 90, 40] },
  { petal: [255, 154, 62], shade: [214, 100, 34], light: [255, 206, 120], eye: [255, 240, 150] },
  { petal: [98, 164, 255], shade: [58, 108, 214], light: [172, 214, 255], eye: [255, 240, 150] },
];
const LEAF: readonly RGB[] = [
  [28, 96, 66],
  [38, 128, 78],
  [58, 160, 92],
  [100, 196, 112],
];
const OUTLINE: RGB = [34, 40, 64];

export interface FlowerOpts {
  /** Distance between blooms in pixels. */
  cell?: number;
  seed?: number;
  /** Fraction of cells that hold a bloom. */
  fill?: number;
}

export function flowerAt(X: number, Y: number, o: FlowerOpts = {}): RGB {
  const cell = o.cell ?? 11,
    seed = o.seed ?? 1,
    fill = o.fill ?? 0.92;
  const cx0 = Math.floor(X / cell),
    cy0 = Math.floor(Y / cell);
  let best: { d: number; kind: number; bx: number; by: number; r: number } | null = null;
  for (let j = cy0 - 1; j <= cy0 + 1; j++) {
    for (let i = cx0 - 1; i <= cx0 + 1; i++) {
      if (hash2(i, j, seed) > fill) continue;
      const bx = (i + 0.5 + (hash2(i, j, seed + 5) - 0.5) * 0.7) * cell;
      const by = (j + 0.5 + (hash2(i, j, seed + 9) - 0.5) * 0.7) * cell;
      const r = cell * (0.34 + hash2(i, j, seed + 13) * 0.14);
      const d = Math.hypot(X + 0.5 - bx, Y + 0.5 - by) / r;
      if (d < 1.12 && (!best || d < best.d))
        best = { d, kind: Math.floor(hash2(i, j, seed + 3) * BLOOMS.length), bx, by, r };
    }
  }
  if (!best) {
    // Leaves: mostly the middle greens, sparkles of light, a few dark gaps.
    const h = hash2(X >> 1, Y >> 1, seed + 21);
    const lit = hash2(X, Y, seed + 22);
    return h < 0.2 ? LEAF[0]! : h < 0.62 ? LEAF[1]! : lit < 0.12 ? LEAF[3]! : LEAF[2]!;
  }
  const b = BLOOMS[best.kind]!;
  if (best.d > 1.0) return OUTLINE;
  if (best.d < 0.3) return b.eye;
  const a = Math.atan2(Y + 0.5 - best.by, X + 0.5 - best.bx);
  // Petals are the lobes of a five-fold rosette. The dips between lobes show a darker petal
  // underneath.
  const lobe = Math.cos(a * 5 + hash2(Math.round(best.bx), Math.round(best.by), seed) * 6);
  const edge = best.d > 0.78 - lobe * 0.08;
  const topLeft = (X + 0.5 - best.bx) * -0.7 + (Y + 0.5 - best.by) * -0.9 > best.r * 0.35;
  if (edge) return topLeft ? b.petal : b.shade;
  return lobe > 0.3 ? (topLeft ? b.light : b.petal) : b.shade;
}
