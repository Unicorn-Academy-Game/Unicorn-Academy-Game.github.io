import type { Surface } from '../game/ports';
import type { CompiledMap } from '../shared/compiled-map';
import type { Vec2 } from '../shared/ids';
import type { TilesetAsset } from '../shared/manifest';
import { TILE } from '../shared/map';

/**
 * Where a point on a map is hard or soft underfoot, from the tile drawn there and what the tileset
 * says that tile is.
 */
export function surfaceLookup(
  map: Pick<CompiledMap, 'logic' | 'render'>,
  tileset: Pick<TilesetAsset, 'surfaces'>,
): (p: Vec2) => Surface {
  const { widthTiles, heightTiles } = map.logic;
  const { ground } = map.render;
  return (p) => {
    const col = Math.floor(p.x / TILE);
    const row = Math.floor(p.y / TILE);
    if (col < 0 || row < 0 || col >= widthTiles || row >= heightTiles) return 'soft';
    return tileset.surfaces[ground[row * widthTiles + col] ?? -1] === 'h' ? 'hard' : 'soft';
  };
}
