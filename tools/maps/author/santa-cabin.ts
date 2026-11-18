import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * Santa's cabin, inside. It is a good deal bigger than it looks from the grove: a hall of red pine
 * with a red rug from the door, a stone hearth with a crackling fire and stockings on the left,
 * windows onto the snow on the right, two shelves of toys either side of the door, the elves'
 * bench, a little Christmas tree with presents under it, a table of cookies for Santa and his sack.
 * Two elves work here, at the bench and round the tree. Santa is out at his sleigh. Everything is in
 * world units; y grows toward the viewer.
 */
export function authorSantaCabin(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'grove').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'santa-cabin',
    widthTiles: 24,
    heightTiles: 18,
    tileset: 'santa-cabin',
    bundle: 'grove',
    music: 'snow',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space: the floor in front of the back wall, clear of the side walls. A red rug runs from the
  // door and opens into a round in the middle of the room.
  b.open(rect(104, WY - 4, W - 104, H - 52));
  b.pathBand(rect(672, WY - 40, 864, H + 8), rect(480, 592, 1056, 976));
  b.classify();

  // The architecture: the hearth wall, the door wall and the wall of windows
  const pieces = [
    ['xw-wall-left', 256],
    ['xw-wall-door', 768],
    ['xw-wall-windows', 1280],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024]) {
    b.place('xw-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('xw-side-west', 0, 0, 'foreground', 0);
  b.place('xw-side-east', W, 0, 'foreground', 0);

  // The door out to the grove
  const DOOR = pt(768, WY);
  b.interactable({
    name: 'cabin-door-in',
    definitionId: 'door',
    look: 'cabin-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'grove-gate',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'santa-grove',
    toSpawn: 'from-cabin',
    door: 'cabin-door-in',
  });
  b.spawn('from-grove', 'south', [pt(768, 450), pt(680, 740), pt(768, 1030)]);

  // Things to tap. `block` is the ground the thing stands on, and `stand` how far in front of its
  // foot the herd comes to it.
  const item = (o: {
    name: string;
    def: string;
    look?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    up: number;
    stand: number;
    block?: { x: number; y: number; w: number; h: number } | { x: number; y: number; r: number };
    sprite?: string;
  }): void => {
    if (o.block) b.block('r' in o.block ? { kind: 'circle', ...o.block } : { kind: 'rect', ...o.block });
    if (o.sprite) b.footprint(o.sprite, o.x, o.y);
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
    name: 'hearth-1',
    def: 'cabin-hearth',
    x: 256,
    y: 396,
    w: 220,
    h: 270,
    up: 250,
    stand: 74,
    block: { x: 146, y: 344, w: 220, h: 64 },
  });
  item({
    name: 'armchair-1',
    def: 'armchair',
    x: 160,
    y: 560,
    w: 100,
    h: 130,
    up: 116,
    stand: 54,
    block: { x: 112, y: 536, w: 96, h: 30 },
  });
  item({
    name: 'cookies-1',
    def: 'cookie-table',
    x: 372,
    y: 592,
    w: 110,
    h: 90,
    up: 66,
    stand: 60,
    block: { x: 372, y: 588, r: 40 },
  });
  item({
    name: 'sack-1',
    def: 'santa-sack',
    x: 156,
    y: 730,
    w: 90,
    h: 120,
    up: 110,
    stand: 54,
    block: { x: 156, y: 724, r: 34 },
  });
  for (const [n, x] of [
    [1, 600],
    [2, 936],
  ] as const)
    item({
      name: `toy-shelf-${n}`,
      def: 'toy-shelf',
      x,
      y: 392,
      w: 150,
      h: 200,
      up: 186,
      stand: 66,
      block: { x: x - 72, y: 352, w: 144, h: 44 },
    });
  item({
    name: 'bench-1',
    def: 'toy-bench',
    x: 1120,
    y: 440,
    w: 170,
    h: 110,
    up: 92,
    stand: 64,
    block: { x: 1040, y: 408, w: 160, h: 40 },
  });
  item({
    name: 'tree-1',
    def: 'room-tree',
    x: 1360,
    y: 500,
    w: 150,
    h: 240,
    up: 224,
    stand: 100,
    block: { x: 1360, y: 494, r: 28 },
  });
  for (const [n, look, x, y] of [
    [1, 'red', 1236, 590],
    [2, 'green', 1318, 650],
    [3, 'blue', 1400, 650],
    [4, 'gold', 1170, 650],
  ] as const)
    item({
      name: `present-${n}`,
      def: 'present',
      look,
      sprite: `xm-present-${look}`,
      x,
      y,
      w: 70,
      h: 80,
      up: 60,
      stand: 52,
    });

  // Where the elves go: to the bench to put toys together, and to the presents and round the tree
  b.anchor({ name: 'elf-gift-1', tags: ['gift'], pos: pt(1120, 520), approach: [E(1120, 520, 'north')] });
  b.anchor({ name: 'elf-gift-2', tags: ['gift'], pos: pt(1250, 740), approach: [E(1250, 740, 'north')] });
  b.anchor({ name: 'elf-gift-3', tags: ['gift'], pos: pt(1360, 760), approach: [E(1360, 760, 'north')] });
  b.anchor({ name: 'elf-tree-1', tags: ['tree'], pos: pt(1280, 520), approach: [E(1280, 520, 'east')] });
  b.anchor({ name: 'elf-tree-2', tags: ['tree'], pos: pt(1360, 560), approach: [E(1360, 560, 'north')] });
  b.npc('elf', pt(1100, 620), 'south');
  b.npc('elf', pt(1300, 760), 'west');

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('santa-cabin');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/santa-cabin.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorSantaCabin();
  console.log(
    `santa-cabin: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
