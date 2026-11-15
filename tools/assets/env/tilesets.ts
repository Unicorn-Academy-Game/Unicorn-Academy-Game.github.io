import type { TilesetAsset } from '../../../src/shared/manifest';
import { createRgba, type Rgba } from '../../art/core/image';
import {
  BIOMES,
  type Biome,
  type BiomeId,
  buildTileset,
  TILE_PX,
  type TileMeta,
  type Tileset,
} from '../../art/world/terrain';

const TILE_MARGIN = 1;
const TILE_SPACING = 2;
const WATER_MS = 260;

export interface BuiltTileset {
  asset: Omit<TilesetAsset, 'file'>;
  image: Rgba;
  set: Tileset;
}

/** Lays tiles out in a grid with each tile's edge pixels repeated into the gap around it. */
function layoutTileset(set: Tileset, columns: number): { image: Rgba; width: number; height: number } {
  const rows = Math.ceil(set.tiles.length / columns);
  const cell = TILE_PX + TILE_SPACING;
  const width = TILE_MARGIN * 2 + columns * cell - TILE_SPACING;
  const height = TILE_MARGIN * 2 + rows * cell - TILE_SPACING;
  const image = createRgba(width, height);
  const put = (src: Rgba, sx: number, sy: number, dx: number, dy: number): void => {
    image.data.set(src.data.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), (dy * width + dx) * 4);
  };
  set.tiles.forEach((tile, i) => {
    const x0 = TILE_MARGIN + (i % columns) * cell;
    const y0 = TILE_MARGIN + Math.floor(i / columns) * cell;
    for (let y = -1; y <= TILE_PX; y++) {
      for (let x = -1; x <= TILE_PX; x++) {
        // Outside the tile the nearest edge pixel is repeated, which is what 1 px of extrusion
        // means.
        put(tile, Math.min(TILE_PX - 1, Math.max(0, x)), Math.min(TILE_PX - 1, Math.max(0, y)), x0 + x, y0 + y);
      }
    }
  });
  return { image, width, height };
}

/**
 * What each tile sounds like underfoot. Marble, cave stone and the glass of the dance floor ring,
 * cobbles and bricks knock, grass, straw, dirt and carpet are soft. A tile where a path meets the
 * ground takes whichever covers more of its corners.
 */
function surfacesOf(biome: Biome, set: Tileset): string {
  const hardGround = biome.ground === 'marble' || biome.ground === 'rock';
  const hardPath = biome.path === 'cobble' || biome.path === 'brick' || biome.path === 'rock' || biome.path === 'disco';
  const bits = (mask: number): number => [1, 2, 4, 8].filter((b) => mask & b).length;
  return set.meta
    .map((m) => {
      if (m.kind === 'grass') return hardGround;
      if (m.kind === 'path') return hardPath;
      if (m.kind === 'path-edge') return bits(m.mask) >= 2 ? hardPath : hardGround;
      return false;
    })
    .map((hard) => (hard ? 'h' : 's'))
    .join('');
}

export function buildTilesetAsset(biome: BiomeId): BuiltTileset {
  const set = buildTileset(BIOMES[biome]);
  const columns = 24;
  const { image, width, height } = layoutTileset(set, columns);
  // Water tiles cycle through their frames in step.
  const groups = new Map<string, number[]>();
  set.meta.forEach((m: TileMeta, id) => {
    if (m.kind !== 'water' && m.kind !== 'water-edge') return;
    const key = `${m.kind}:${m.mask}:${m.pos}`;
    const list = groups.get(key) ?? [];
    list[m.frame] = id;
    groups.set(key, list);
  });
  const animations = [...groups.values()].map((tiles) => ({ tiles, ms: WATER_MS }));
  return {
    asset: {
      width,
      height,
      tileSize: TILE_PX,
      margin: TILE_MARGIN,
      spacing: TILE_SPACING,
      columns,
      count: set.tiles.length,
      animations,
      surfaces: surfacesOf(BIOMES[biome], set),
    },
    image,
    set,
  };
}
