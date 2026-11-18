import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { CHANDELIER_HANG } from '../../art/world/throne-room';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, pt, rect, Scatter } from './geom';
import { Placer } from './placer';

/**
 * Inside the Magic Hall. Only Wildstar comes in. A violet runner leads from the door to a circle of
 * spells on the floor, with a lotus fountain beyond it. Spell books hover over their lecterns along
 * the walls and turn their pages, star globes spin their rings, candles float in the air, two
 * cauldrons bubble, three chandeliers hang and glowing mushrooms grow in the corners. Everything
 * that moves is drawn in frames, and everything that can be touched answers with its own sparkle.
 * Everything is in world units; y grows toward the viewer.
 */
export function authorMagicHall(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'magic').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'magic-hall',
    widthTiles: 40,
    heightTiles: 18,
    tileset: 'magic-hall',
    bundle: 'magic',
    music: 'quiet',
    ambience: 'sky-garden',
    solo: true,
    footprints,
    sprites,
  });
  const sc = new Scatter(99);
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;
  const DOOR = pt(1280, WY);
  const CIRCLE = pt(1280, 660);
  const FOUNTAIN = pt(1280, 930);

  // Space, and the runner: from the door down to the circle
  b.open(rect(104, WY - 4, W - 104, H - 24));
  b.pathBand(rect(1184, WY - 40, 1376, 590));
  b.classify();
  const placer = new Placer(b, sc, footprints, () => true);

  // The architecture
  const pieces = [
    ['mh-wall-left', 256],
    ['mh-wall-windows', 768],
    ['mh-wall-door', 1280],
    ['mh-wall-windows', 1792],
    ['mh-wall-right', 2304],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024, 1536, 2048]) {
    b.place('mh-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('mh-side-west', 0, 0, 'foreground', 0);
  b.place('mh-side-east', W, 0, 'foreground', 0);

  // The door out to the river, and the way in
  b.interactable({
    name: 'hall-door-in',
    definitionId: 'door',
    look: 'magic-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'hall-exit',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'river',
    toSpawn: 'from-magic-hall',
    door: 'hall-door-in',
  });
  b.spawn('from-river', 'south', [pt(DOOR.x, 470), pt(DOOR.x, 640), pt(900, 640)]);

  // The circle of spells on the floor, which answers with a rainbow
  sc.add(CIRCLE.x, CIRCLE.y, 200);
  b.place('mh-circle', CIRCLE.x, CIRCLE.y, 'ground-detail', 0);
  b.interactable({
    name: 'spell-circle-1',
    definitionId: 'spell-circle',
    pos: CIRCLE,
    hit: { x: CIRCLE.x - 150, y: CIRCLE.y - 60, w: 300, h: 120 },
    approach: [E(CIRCLE.x, CIRCLE.y + 120, 'north'), E(CIRCLE.x - 230, CIRCLE.y + 20, 'east')],
  });

  // The fountain
  placer.prop({
    name: 'fountain-1',
    def: 'hall-fountain',
    sprite: 'mh-fountain-lotus',
    at: FOUNTAIN,
    width: 280,
    tall: 220,
    keep: 20,
    approach: [E(FOUNTAIN.x - 190, FOUNTAIN.y + 90, 'east'), E(FOUNTAIN.x + 190, FOUNTAIN.y + 90, 'west')],
  });

  // Spell books on their lecterns, along the wall either side of the door
  const covers = ['rose', 'sky', 'gold', 'mint'] as const;
  for (const [i, x] of [440, 700, 960, 1600, 1860, 2120].entries())
    placer.prop({
      name: `book-${i + 1}`,
      def: 'spell-book',
      look: covers[i % covers.length]!,
      sprite: `mh-book-${covers[i % covers.length]!}`,
      at: pt(x, 480),
      width: 90,
      tall: 190,
      keep: 30,
    });

  // Star globes, and candles in the air
  for (const [i, [x, y]] of (
    [
      [800, 700],
      [1760, 700],
    ] as const
  ).entries())
    placer.prop({
      name: `globe-${i + 1}`,
      def: 'star-globe',
      sprite: 'mh-globe',
      at: pt(x, y),
      width: 130,
      tall: 230,
      keep: 30,
    });
  for (const [i, [x, y]] of (
    [
      [450, 700],
      [2100, 700],
      [640, 900],
      [1920, 900],
    ] as const
  ).entries())
    placer.prop({
      name: `candles-${i + 1}`,
      def: 'floating-candles',
      sprite: 'mh-candles',
      at: pt(x, y),
      width: 120,
      tall: 170,
      keep: 20,
    });
  for (const [i, x] of [260, 2300].entries())
    placer.prop({
      name: `cauldron-${i + 1}`,
      def: 'hall-cauldron',
      sprite: 'mh-cauldron',
      at: pt(x, 930),
      width: 130,
      tall: 150,
      keep: 30,
    });
  placer.open();

  // Chandeliers
  for (const [n, x, floor] of [
    [1, 520, 800],
    [2, 1280, 780],
    [3, 2040, 800],
  ] as const) {
    const hang = pt(x, floor - CHANDELIER_HANG);
    b.place('mh-chandelier-shadow', x, floor, 'ground-detail', 0);
    b.interactable({
      name: `chandelier-${n}`,
      definitionId: 'hall-chandelier',
      pos: hang,
      hit: { x: x - 96, y: hang.y - 150, w: 192, h: 170 },
      approach:
        n === 2 ? [E(x + 150, floor + 10, 'west'), E(x - 150, floor + 10, 'east')] : [E(x, floor + 30, 'north')],
    });
  }

  // Glowing mushrooms and bulbs grow in the corners and along the front, and wisps float over them
  const hues = ['cyan', 'rose', 'gold', 'lilac', 'mint'] as const;
  let grown = 0;
  const rnd = sc.rng;
  for (let attempt = 0; attempt < 4000 && grown < 26; attempt++) {
    const x = 130 + rnd() * (W - 260),
      y = 420 + rnd() * 700;
    const nearEdge = x < 380 || x > W - 380 || y > 1020;
    if (!nearEdge || b.openness(x, y) < 20 || b.clearanceAt(x, y) < 40 || !sc.tryAdd(x, y, 80)) continue;
    b.place(
      rnd() < 0.7 ? `mh-mushrooms-${hues[Math.floor(rnd() * hues.length)]!}` : `mh-bulbs-${1 + Math.floor(rnd() * 2)}`,
      x,
      y,
    );
    grown++;
  }
  for (const [x, y] of [
    [330, 560],
    [2230, 560],
    [980, 1010],
    [1590, 1010],
    [200, 780],
    [2360, 780],
  ] as const)
    b.place('mh-wisp', x, y, 'foreground', 0);

  // Who lives here: little wisps that drift between the books
  // The wizard who keeps the hall: he walks between the circle of spells and the fountain
  b.anchor({
    name: 'wizard-1',
    tags: ['wizard'],
    pos: pt(CIRCLE.x, CIRCLE.y + 120),
    approach: [E(CIRCLE.x, CIRCLE.y + 120, 'north')],
  });
  b.anchor({
    name: 'wizard-2',
    tags: ['wizard'],
    pos: pt(CIRCLE.x - 230, CIRCLE.y + 20),
    approach: [E(CIRCLE.x - 230, CIRCLE.y + 20, 'east')],
  });
  b.anchor({
    name: 'wizard-3',
    tags: ['wizard'],
    pos: pt(FOUNTAIN.x - 190, FOUNTAIN.y + 90),
    approach: [E(FOUNTAIN.x - 190, FOUNTAIN.y + 90, 'east')],
  });
  b.anchor({
    name: 'wizard-4',
    tags: ['wizard'],
    pos: pt(FOUNTAIN.x + 190, FOUNTAIN.y + 90),
    approach: [E(FOUNTAIN.x + 190, FOUNTAIN.y + 90, 'west')],
  });
  b.npc('wizard', pt(CIRCLE.x - 230, CIRCLE.y + 20), 'east');
  b.life({ name: 'wisp-west', kind: 'fairy', area: { x: 300, y: 520, w: 800, h: 460 }, shape: 'ellipse', count: 2 });
  b.life({ name: 'wisp-east', kind: 'fairy', area: { x: 1460, y: 520, w: 800, h: 460 }, shape: 'ellipse', count: 2 });

  placer.finish();
  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('magic-hall');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/magic-hall.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorMagicHall();
  console.log(
    `magic-hall: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
