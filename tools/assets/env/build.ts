import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle, Sprite, TilesetAsset } from '../../../src/shared/manifest';
import { writePng } from '../../art/core/image';
import { BIOMES, type BiomeId } from '../../art/world/terrain';
import { packPages } from '../lib/atlas';
import { shortHash } from '../lib/hash';
import { encodeSheet, SHEET_EXTENSION } from '../lib/sheet';
import { frameCount, RECIPES } from './registry';
import { readCached, renderMissing } from './render';
import { buildTilesetAsset } from './tilesets';
import type { BundleId, Recipe } from './types';

export interface EnvironmentBuild {
  bundles: Record<string, Bundle>;
  tilesets: Record<string, TilesetAsset>;
  /** Footprints for map authors. Not part of the runtime manifest. */
  footprints: Record<string, number>;
}

/**
 * The bundles whose pages are packed to fill the room beside tall pictures. Every other bundle
 * keeps the rows it was packed in, because a page's name carries a hash of its pixels and packing
 * one differently makes every player download it again. A bundle moves here when it is being
 * rebuilt anyway.
 */
const FILLED: ReadonlySet<BundleId> = new Set(['garden', 'palace-hall']);

/**
 * Draws what is missing, packs each bundle into pages and writes the tile sheets. Returns the
 * manifest sections.
 */
export async function buildEnvironment(
  publicDir: string,
  recipes: readonly Recipe[] = RECIPES,
): Promise<EnvironmentBuild> {
  await renderMissing(recipes);
  const outDir = join(publicDir, 'bundles');
  mkdirSync(outDir, { recursive: true });
  const written = new Set<string>();

  const bundles: Record<string, Bundle> = {};
  const ids = [...new Set(recipes.map((r) => r.bundle))] as BundleId[];
  for (const id of ids) {
    const mine = recipes.filter((r) => r.bundle === id);
    const inputs = mine.flatMap((r) =>
      Array.from({ length: frameCount(r) }, (_, f) => ({ key: `${r.id}@${f}`, image: readCached(r, f) })),
    );
    const packed = packPages(inputs, { maxSize: 2048, padding: 2, extrude: 1, fit: FILLED.has(id) ? 'fill' : 'rows' });
    const pages = packed.pages.map((p, i) => {
      const sheet = encodeSheet(`${id} page ${i}`, { width: p.width, height: p.height, data: p.image.data });
      const file = `bundles/${id}-${i}.${shortHash(sheet)}.${SHEET_EXTENSION}`;
      writeFileSync(join(publicDir, file), sheet);
      written.add(file);
      return { file, width: p.width, height: p.height, rects: p.rects };
    });
    const sprites: Record<string, Sprite> = {};
    for (const r of mine) {
      const frames = Array.from({ length: frameCount(r) }, (_, f) => {
        const at = packed.place.get(`${r.id}@${f}`)!;
        return { page: at.page, rect: at.rect, ms: r.anim ? Math.round(1000 / r.anim.fps) : 1000 };
      });
      const sprite: Sprite = { origin: [r.canvas.ox, r.canvas.oy], frames, loop: r.anim?.loop ?? false };
      if (r.shadow) sprite.shadow = r.shadow;
      if (r.canopy) sprite.canopy = r.canopy;
      sprites[r.id] = sprite;
    }
    bundles[id] = { pages, sprites };
    console.log(
      `env: bundle ${id}: ${mine.length} sprites on ${pages.length} page(s) ${pages.map((p) => `${p.width}x${p.height}`).join(', ')}`,
    );
  }

  const tilesets: Record<string, TilesetAsset> = {};
  for (const biome of Object.keys(BIOMES) as BiomeId[]) {
    const built = buildTilesetAsset(biome);
    const sheet = encodeSheet(`the ${biome} tiles`, {
      width: built.image.width,
      height: built.image.height,
      data: built.image.data,
    });
    const file = `bundles/tiles-${biome}.${shortHash(sheet)}.${SHEET_EXTENSION}`;
    writeFileSync(join(publicDir, file), sheet);
    written.add(file);
    tilesets[biome] = { file, ...built.asset };
    writePng(`assets/maps/tilesets/${biome}.png`, built.image);
    console.log(`env: tileset ${biome}: ${built.asset.count} tiles in ${built.asset.width}x${built.asset.height}`);
  }

  for (const name of readdirSync(outDir)) if (!written.has(`bundles/${name}`)) rmSync(join(outDir, name));
  return {
    bundles,
    tilesets,
    footprints: Object.fromEntries(recipes.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : []))),
  };
}
