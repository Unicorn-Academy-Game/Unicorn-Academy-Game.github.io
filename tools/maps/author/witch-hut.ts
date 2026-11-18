import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * The witch's hut, inside. It is a good deal bigger than it looks from the yard: a hall of honey
 * timber with a green rug from the door, a cauldron that bubbles by the fire side, a crystal ball on
 * its stand, shelves of jars that clink, two beds of leaves and the witch herself, who stirs, looks
 * into her ball and takes down a jar. Everything is in world units; y grows toward the viewer.
 */
export function authorWitchHut(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'cave').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'witch-hut',
    widthTiles: 24,
    heightTiles: 18,
    tileset: 'witch-hut',
    bundle: 'cave',
    music: 'quiet',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space: the floor in front of the back wall, clear of the side walls. A rug runs from the door
  // and opens into a round of green in the middle of the room.
  b.open(rect(104, WY - 4, W - 104, H - 52));
  b.pathBand(rect(672, WY - 40, 864, H + 8), rect(480, 592, 1056, 976));
  b.classify();

  // The architecture
  const pieces = [
    ['hw-wall-left', 256],
    ['hw-wall-door', 768],
    ['hw-wall-right', 1280],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024]) {
    b.place('hw-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('hw-side-west', 0, 0, 'foreground', 0);
  b.place('hw-side-east', W, 0, 'foreground', 0);

  // The door out to the yard
  const DOOR = pt(768, WY);
  b.interactable({
    name: 'hut-door-in',
    definitionId: 'door',
    look: 'hut-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'yard-gate',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'crystal-cave',
    toSpawn: 'from-hut',
    door: 'hut-door-in',
  });
  b.spawn('from-cave', 'south', [pt(890, 592), pt(687, 795), pt(484, 998)]);

  // Things to tap
  const item = (o: {
    name: string;
    def: string;
    sprite: string;
    look?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    up: number;
    stand: number;
  }): void => {
    b.footprint(o.sprite, o.x, o.y);
    b.interactable({
      name: o.name,
      definitionId: o.def,
      ...(o.look ? { look: o.look } : {}),
      pos: pt(o.x, o.y),
      hit: hit(o.x, o.y, o.w, o.h, o.up),
      approach: [E(o.x, o.y + o.stand, 'north')],
    });
  };
  item({
    name: 'cauldron-1',
    def: 'witch-cauldron',
    sprite: 'cc-cauldron',
    x: 1180,
    y: 640,
    w: 130,
    h: 150,
    up: 130,
    stand: 96,
  });
  item({
    name: 'orb-1',
    def: 'crystal-ball',
    sprite: 'cc-orb-stand',
    x: 360,
    y: 640,
    w: 110,
    h: 220,
    up: 200,
    stand: 90,
  });
  for (const [n, x] of [
    [1, 188],
    [2, 1348],
  ] as const)
    item({ name: `jars-${n}`, def: 'jar-shelf', sprite: 'cc-jars', x, y: 500, w: 180, h: 160, up: 120, stand: 84 });
  item({
    name: 'bed-1',
    def: 'cave-bed',
    sprite: 'cc-bed-leafy-long',
    look: 'long',
    x: 230,
    y: 870,
    w: 210,
    h: 140,
    up: 120,
    stand: 104,
  });
  item({
    name: 'bed-2',
    def: 'cave-bed',
    sprite: 'cc-bed-leafy-round',
    look: 'round',
    x: 1310,
    y: 870,
    w: 160,
    h: 140,
    up: 120,
    stand: 104,
  });
  for (const [n, x, y] of [
    [1, 1100, 850],
    [2, 1000, 960],
  ] as const)
    item({
      name: `sleepers-${n}`,
      def: 'sleeping-crystals',
      sprite: 'cc-sleep-1',
      x,
      y,
      w: 100,
      h: 120,
      up: 110,
      stand: 70,
    });

  // A broom leans on the wall, and glowing things grow in the corners and along the front
  b.place('cc-broom', 330, 440, 'object-bases', 0);
  const grow: readonly (readonly [string, number, number])[] = [
    ['cc-mushrooms-gold', 150, 760],
    ['cc-mushrooms-rose', 214, 1040],
    ['cc-bulbs-1', 150, 1000],
    ['cc-mushrooms-cyan', 1400, 1040],
    ['cc-bulbs-2', 1380, 760],
    ['cc-mushrooms-mint', 1330, 1000],
    ['cc-mushrooms-lilac', 740, 1060],
    ['cc-bulbs-1', 880, 1090],
  ];
  for (const [id, x, y] of grow) b.place(id, x, y);
  for (const [x, y] of [
    [330, 560],
    [1230, 520],
    [770, 880],
  ] as const)
    b.place('cc-wisp', x, y, 'foreground', 0);

  // Where the witch goes: to stir at the cauldron, look into her ball and take a jar down
  b.anchor({ name: 'stir-1', tags: ['stir'], pos: pt(1180, 716), approach: [E(1180, 716, 'north')] });
  b.anchor({ name: 'gaze-1', tags: ['gaze'], pos: pt(360, 716), approach: [E(360, 716, 'north')] });
  b.anchor({ name: 'shelf-1', tags: ['shelf'], pos: pt(188, 584), approach: [E(188, 584, 'north')] });
  b.anchor({ name: 'shelf-2', tags: ['shelf'], pos: pt(1348, 584), approach: [E(1348, 584, 'north')] });

  b.npc('witch', pt(900, 780), 'south');

  // Who lives here: wisps that drift between the beams
  b.life({ name: 'wisp-hut', kind: 'fairy', area: { x: 420, y: 560, w: 700, h: 420 }, shape: 'ellipse', count: 2 });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('witch-hut');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/witch-hut.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorWitchHut();
  console.log(`witch-hut: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`);
}
