import { blit, createRgba, upscale, writePng } from '../core/image';
import { BIOMES, type BiomeId, buildTileset, type EdgeKind, pickTile, TILE_PX, WATER_FRAMES } from './terrain';

/**
 * Draws a small test map with a winding path and a pond. Usage: tsx
 * tools/art/world/terrain-preview.ts [forest|garden|crystal-cave]
 */
const biomeId = (process.argv[2] ?? 'forest') as BiomeId;
const set = buildTileset(BIOMES[biomeId]);
const W = 16,
  H = 10;
const vx = W + 1,
  vy = H + 1;
const cls: ('grass' | EdgeKind)[] = new Array(vx * vy).fill('grass');
const setV = (x: number, y: number, c: 'grass' | EdgeKind): void => {
  if (x >= 0 && y >= 0 && x < vx && y < vy) cls[y * vx + x] = c;
};
// A path that wanders left to right, three vertices wide.
for (let x = 0; x < vx; x++) {
  const cy = 6 + Math.round(Math.sin(x * 0.55) * 1.4);
  for (let k = -1; k <= 1; k++) setV(x, cy + k, 'path');
}
if (BIOMES[biomeId].water)
  for (let y = 0; y < vy; y++)
    for (let x = 0; x < vx; x++) if (Math.hypot((x - 11) / 3.2, (y - 1.4) / 1.5) < 1) setV(x, y, 'water');

for (let frame = 0; frame < (BIOMES[biomeId].water ? WATER_FRAMES : 1); frame++) {
  const img = createRgba(W * TILE_PX, H * TILE_PX);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const corners = [cls[r * vx + c]!, cls[r * vx + c + 1]!, cls[(r + 1) * vx + c]!, cls[(r + 1) * vx + c + 1]!];
      const pick = pickTile(set, corners, c, r, frame);
      if (!pick) throw new Error(`no tile for ${corners.join(',')} at ${c},${r}`);
      blit(img, set.tiles[pick.id]!, c * TILE_PX, r * TILE_PX);
    }
  }
  writePng(`assets/source/_scratch/terrain-${biomeId}-${frame}.png`, img);
  if (frame === 0) writePng(`assets/source/_scratch/terrain-${biomeId}-2x.png`, upscale(img, 2));
}
console.log(`${set.tiles.length} tiles`);
