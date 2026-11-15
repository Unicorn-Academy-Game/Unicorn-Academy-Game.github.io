import { BIOMES, buildTileset } from '../art/world/terrain';
import { RECIPES } from '../assets/env/registry';
import { type CompileContext, compileAll } from './compile';

/**
 * Compiles every map under assets/maps into public/assets/maps. Usage: tsx tools/maps/build-maps.ts
 */
export function mapContext(): CompileContext {
  const sprites: Record<string, Set<string>> = {};
  for (const r of RECIPES) {
    sprites[r.bundle] ??= new Set();
    sprites[r.bundle]!.add(r.id);
  }
  return {
    sprites,
    tilesets: Object.fromEntries(Object.values(BIOMES).map((b) => [b.id, { count: buildTileset(b).tiles.length }])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = compileAll('assets/maps', 'public/assets/maps', mapContext());
  for (const o of out) console.log(`map ${o.id}: ${o.file}`);
}
