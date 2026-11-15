import { mkdirSync, writeFileSync } from 'node:fs';
import { GEM_TABLES, tableOf } from '../../../src/content/props';
import { HALL } from '../../art/world/hall';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * The treasure house. A hall in cream and gold, seen as a cutaway from the south: the door in the
 * middle of the back wall, a rose carpet running down from it and spreading into a rug, and the
 * treasure on both sides. Gold, bars and sacks of coin, two desks of banknotes and the two chests
 * to the west, which is the vault; a table for every gem to the east, in the order of the book.
 * Everything is in world units; y grows toward the viewer.
 */
export function authorTreasureHouse(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'treasure-house').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'treasure-house',
    widthTiles: 24,
    heightTiles: 18,
    tileset: 'treasure-house',
    bundle: 'treasure-house',
    music: 'quiet',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space: the floor in front of the back wall, clear of the side walls
  b.open(rect(104, WY - 4, W - 104, H - 52));
  // The carpet runs from the door and opens into a rug. Edges sit half a tile off the grid so each
  // is a whole number of tiles wide.
  b.pathBand(rect(672, WY - 40, 864, H + 8), rect(544, 672, 992, 992));
  b.classify();

  // The architecture
  const pieces = [
    ['hall-wall-left', 256],
    ['hall-wall-door', 768],
    ['hall-wall-right', 1280],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024]) b.place('hall-column', x, HALL.columnY, 'object-bases', 0);
  b.place('hall-side-west', 0, 0, 'foreground', 0);
  b.place('hall-side-east', W, 0, 'foreground', 0);
  // The columns stand in front of the wall, and can be walked around.
  for (const x of [512, 1024]) b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });

  // The door
  const DOOR = pt(768, WY);
  b.interactable({
    name: 'hall-door',
    definitionId: 'door',
    look: 'treasure-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'garden-gate',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'palace-garden',
    toSpawn: 'from-treasure-house',
    door: 'hall-door',
  });

  // Where the herd arrives: just inside, facing the room
  b.spawn('from-garden', 'south', [pt(890, 592), pt(687, 795), pt(484, 998)]);

  // Things to tap
  const prop = (sprite: string, x: number, y: number): void => b.footprint(sprite, x, y);
  const item = (o: {
    name: string;
    def: string;
    sprite?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    up?: number;
    stand: number;
  }): void => {
    prop(o.sprite ?? o.def, o.x, o.y);
    b.interactable({
      name: o.name,
      definitionId: o.def,
      pos: pt(o.x, o.y),
      hit: hit(o.x, o.y, o.w, o.h, o.up),
      approach: [E(o.x, o.y + o.stand, 'north')],
    });
  };
  // Two chests side by side below the gold, in the west half, which is the vault. The east half is
  // the gems.
  item({ name: 'chest-1', def: 'chest', sprite: 'chest-closed', x: 250, y: 880, w: 160, h: 160, up: 130, stand: 86 });
  item({ name: 'chest-2', def: 'chest', sprite: 'chest-closed', x: 410, y: 880, w: 160, h: 160, up: 130, stand: 86 });
  // The cloud and the bowl, in the middle of the rug: tap them for the treasure game.
  item({
    name: 'rain-maker-1',
    def: 'rain-maker',
    sprite: 'tr-rain-maker',
    x: 768,
    y: 900,
    w: 170,
    h: 230,
    up: 205,
    stand: 84,
  });
  // West: coins, bars, sacks and the two desks of paper money. Each is one word and is drawn as
  // that word.
  item({ name: 'gold-1', def: 'coin-pile', x: 190, y: 452, w: 170, h: 110, up: 84, stand: 80 });
  item({ name: 'gold-2', def: 'gold-bars', x: 336, y: 446, w: 170, h: 120, up: 96, stand: 80 });
  item({ name: 'notes-1', def: 'money-desk', x: 482, y: 454, w: 180, h: 140, up: 110, stand: 76 });
  item({ name: 'notes-2', def: 'cash-desk', x: 250, y: 660, w: 180, h: 140, up: 110, stand: 76 });
  item({ name: 'gold-3', def: 'sack-pile', x: 430, y: 690, w: 170, h: 130, up: 100, stand: 80 });
  // East: a table for every gem, three to a row, in the order the book lists them. Every table
  // holds one gem and gives that word.
  const COLUMNS = [1090, 1230, 1370] as const;
  const ROWS = [450, 620, 790, 960] as const;
  let trays = 0;
  GEM_TABLES.forEach((gem, i) => {
    const x = COLUMNS[i % COLUMNS.length]!,
      y = ROWS[Math.floor(i / COLUMNS.length)]!;
    if (gem === 'diamond') item({ name: 'diamond-1', def: tableOf(gem), x, y, w: 110, h: 180, up: 160, stand: 66 });
    else item({ name: `gems-${++trays}`, def: tableOf(gem), x, y, w: 110, h: 140, up: 120, stand: 66 });
  });

  // Furniture: lamps either side of the door, urns, barrels and crates round the edges
  const solid = (sprite: string, x: number, y: number): void => b.solid(sprite, x, y);
  solid('tr-lamp', 590, WY + 74);
  solid('tr-lamp', 946, WY + 74);
  solid('tr-urn-teal', 124, 600);
  solid('barrel-coins', 150, 806);
  solid('tr-urn-rose', 124, 1052);
  solid('tr-urn-teal', 640, 1050);
  solid('tr-urn-rose', 896, 1050);

  // Who lives here: fairies drawn to the shine
  b.life({
    name: 'fairy-treasure',
    kind: 'fairy',
    area: { x: 320, y: 480, w: 900, h: 480 },
    shape: 'ellipse',
    count: 3,
  });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('treasure-house');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/treasure-house.tmj', JSON.stringify(out.tmj));
  return out;
}
