import Phaser from 'phaser';
import type { CompiledMap } from '../shared/compiled-map';
import type { TilesetAsset } from '../shared/manifest';
import { DEPTH } from './depth';
import { tilesTexture } from './keys';

/** What the parser wants for a layer of ids, which Tiled numbers from 1 with 0 for empty. */
const gid = (tile: number): number => (tile < 0 ? 0 : tile + 1);

/**
 * The compiled map as the Tiled JSON that Phaser's parser reads, so tile animation, tile culling
 * and seam-free sampling come from the engine. Only the first tile of each animation group carries
 * the animation, because the water layer places that tile and the others are its later frames.
 */
function tiledJson(map: CompiledMap, tileset: TilesetAsset, name: string): object {
  const { widthTiles: width, heightTiles: height } = map.logic;
  const layer = (id: number, layerName: string, data: readonly number[]): object => ({
    id,
    name: layerName,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width,
    height,
    opacity: 1,
    visible: true,
    data: data.map(gid),
  });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width,
    height,
    tilewidth: tileset.tileSize,
    tileheight: tileset.tileSize,
    nextlayerid: 3,
    nextobjectid: 1,
    layers: [layer(1, 'ground', map.render.ground), layer(2, 'water', map.render.water)],
    tilesets: [
      {
        firstgid: 1,
        name,
        image: `${name}.png`,
        imagewidth: tileset.width,
        imageheight: tileset.height,
        margin: tileset.margin,
        spacing: tileset.spacing,
        tilewidth: tileset.tileSize,
        tileheight: tileset.tileSize,
        columns: tileset.columns,
        tilecount: tileset.count,
        tiles: tileset.animations.map((a) => ({
          id: a.tiles[0],
          animation: a.tiles.map((tileid) => ({ tileid, duration: a.ms })),
        })),
      },
    ],
  };
}

type Layer = Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;

export interface GroundLayers {
  ground: Layer;
  water: Layer;
  destroy(): void;
}

let serial = 0;

export function createGround(scene: Phaser.Scene, map: CompiledMap, tileset: TilesetAsset): GroundLayers {
  const key = `tilemap:${map.logic.id}:${++serial}`;
  scene.cache.tilemap.add(key, {
    format: Phaser.Tilemaps.Formats.TILED_JSON,
    data: tiledJson(map, tileset, map.render.tileset),
  });
  const tilemap = scene.make.tilemap({ key });
  const set = tilemap.addTilesetImage(map.render.tileset, tilesTexture(map.render.tileset));
  if (!set) throw new Error(`tileset ${map.render.tileset} did not attach`);
  const ground = tilemap.createLayer('ground', set, 0, 0);
  const water = tilemap.createLayer('water', set, 0, 0);
  if (!ground || !water) throw new Error('the ground layers did not build');
  ground.setDepth(DEPTH.ground);
  water.setDepth(DEPTH.water);
  return {
    ground,
    water,
    destroy: () => {
      tilemap.destroy();
      scene.cache.tilemap.remove(key);
    },
  };
}
