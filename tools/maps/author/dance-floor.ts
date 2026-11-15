import { mkdirSync, writeFileSync } from 'node:fs';
import type { LifeKind } from '../../../src/shared/life';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, pt, rect, Scatter } from './geom';
import { paintSky, toyMaker } from './playground-kit';

/**
 * The dance floor, where the herd goes when the dancing game is done. A floor of lit glass squares
 * lies in the middle of a violet lawn, stage lights stand on it and go through the colours, and the
 * playground's toys are set round it again, so there is a great deal to touch. The way back to the
 * playground is a glowing place at the south edge. Nothing here is saved and nothing can go wrong.
 * Everything is in world units; y grows toward the viewer.
 */
export function authorDanceFloor(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'playground').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'dance-floor',
    widthTiles: 40,
    heightTiles: 26,
    tileset: 'dance-floor',
    bundle: 'playground',
    music: 'garden',
    ambience: 'garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(4096);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  const EXIT = pt(1280, 1520);
  const BOTTOM = H - 102;

  // Space
  b.open(rect(224, 600, W - 224, BOTTOM));
  // Path edges sit half a tile off the vertex grid so each is a whole number of tiles wide: the
  // floor is 21 by 8 tiles and the way to it 5 wide.
  b.pathBand(rect(608, 800, 1952, 1312), rect(1120, 1280, 1440, BOTTOM));
  b.classify();
  paintSky(b);

  // The way back, and where the herd arrives
  b.portal({
    name: 'playground-gate',
    bounds: { x: EXIT.x - 120, y: EXIT.y - 20, w: 240, h: 76 },
    approach: pt(EXIT.x, EXIT.y - 70),
    toMap: 'playground',
    toSpawn: 'from-dance-floor',
  });
  // The herd stands in a row across the floor, Wildstar at the east end. A row has to be longer
  // than the five gaps between friends.
  const ARRIVAL = [pt(1700, 1236), pt(1320, 1236), pt(940, 1236)];
  b.spawn('from-party', 'south', ARRIVAL);
  for (let x = 940; x <= 1700; x += 190) sc.add(x, 1236, 100);
  sc.add(EXIT.x, EXIT.y - 40, 200);

  // The lights. They are only light, so the herd walks through them. The ring round the floor keeps
  // one colour each and the four inside go through them all.
  const toy = toyMaker(b, sc, footprints);
  const LIGHTS = [
    [656, 850, 'pink'],
    [1904, 850, 'cyan'],
    [656, 1060, 'gold'],
    [1904, 1060, 'gold'],
    [656, 1270, 'cyan'],
    [1904, 1270, 'pink'],
    [960, 990, 'rainbow'],
    [1600, 990, 'rainbow'],
    [960, 1180, 'rainbow'],
    [1600, 1180, 'rainbow'],
  ] as const;
  LIGHTS.forEach(([x, y, look], i) => {
    toy({
      name: `light-${i + 1}`,
      def: 'disco-light',
      look,
      sprite: 'pg-stage-beam',
      at: pt(x, y),
      w: 120,
      h: 180,
      up: 170,
      stand: 70,
      hold: true,
    });
  });

  // The toys. The fountain of jewels at the back of the floor, and a confetti popper at each side
  // of it, which opens the dancing game again.
  toy({
    name: 'gem-fountain-1',
    def: 'gem-fountain',
    sprite: 'pg-gem-fountain',
    at: pt(1280, 910),
    w: 290,
    h: 250,
    up: 190,
    stand: 124,
  });
  toy({
    name: 'popper-1',
    def: 'confetti-popper',
    sprite: 'pg-popper',
    at: pt(410, 1010),
    w: 120,
    h: 210,
    up: 180,
    stand: 70,
  });
  toy({
    name: 'popper-2',
    def: 'confetti-popper',
    sprite: 'pg-popper',
    at: pt(2150, 1010),
    w: 120,
    h: 210,
    up: 180,
    stand: 70,
  });

  // Balloon stands in the four corners of the lawn.
  toy({
    name: 'balloons-1',
    def: 'balloon-stand',
    look: 'party',
    sprite: 'pg-balloon-weight',
    at: pt(330, 700),
    w: 140,
    h: 290,
    up: 262,
    stand: 70,
  });
  toy({
    name: 'balloons-2',
    def: 'balloon-stand',
    look: 'warm',
    sprite: 'pg-balloon-weight',
    at: pt(2230, 700),
    w: 140,
    h: 290,
    up: 262,
    stand: 70,
  });
  toy({
    name: 'balloons-3',
    def: 'balloon-stand',
    look: 'cool',
    sprite: 'pg-balloon-weight',
    at: pt(300, 1470),
    w: 140,
    h: 290,
    up: 262,
    stand: 70,
  });
  toy({
    name: 'balloons-4',
    def: 'balloon-stand',
    look: 'party',
    sprite: 'pg-balloon-weight',
    at: pt(2230, 1470),
    w: 140,
    h: 290,
    up: 262,
    stand: 70,
  });

  // Fireworks along the north lawn and the east.
  toy({
    name: 'fireworks-1',
    def: 'firework-launcher',
    look: 'red',
    sprite: 'pg-fireworks-red',
    at: pt(860, 690),
    w: 140,
    h: 190,
    up: 160,
    stand: 96,
  });
  toy({
    name: 'fireworks-2',
    def: 'firework-launcher',
    look: 'blue',
    sprite: 'pg-fireworks-blue',
    at: pt(1700, 690),
    w: 140,
    h: 190,
    up: 160,
    stand: 96,
  });
  toy({
    name: 'fireworks-3',
    def: 'firework-launcher',
    look: 'gold',
    sprite: 'pg-fireworks-gold',
    at: pt(2070, 800),
    w: 140,
    h: 190,
    up: 160,
    stand: 96,
  });

  // Spell cannons on the west lawn, aiming east across the floor, and a row of bouncy mushrooms on
  // the east.
  toy({
    name: 'cannon-1',
    def: 'spell-cannon',
    look: 'star',
    sprite: 'pg-cannon-star',
    at: pt(460, 1170),
    w: 170,
    h: 150,
    up: 120,
    stand: 100,
  });
  toy({
    name: 'cannon-2',
    def: 'spell-cannon',
    look: 'heart',
    sprite: 'pg-cannon-heart',
    at: pt(460, 1370),
    w: 170,
    h: 150,
    up: 120,
    stand: 100,
  });
  [
    [2030, 1180, 'red'],
    [2150, 1180, 'pink'],
    [2270, 1180, 'blue'],
  ].forEach(([x, y, look], i) => {
    toy({
      name: `mushroom-${i + 1}`,
      def: 'bouncy-mushroom',
      look: look as string,
      sprite: `pg-mushroom-${look}`,
      at: pt(x as number, y as number),
      w: 120,
      h: 130,
      up: 108,
      stand: 96,
    });
  });

  // Bubble machines on the north lawn, either side of the fountain, and morph machines on the
  // south, either side of the way to the exit. A toy's tap box is as tall as its picture, so no two
  // stand where their boxes meet, and a finger on one never opens another.
  toy({
    name: 'bubbles-1',
    def: 'bubble-machine',
    sprite: 'pg-bubbles',
    at: pt(1000, 700),
    w: 120,
    h: 270,
    up: 240,
    stand: 74,
  });
  toy({
    name: 'bubbles-2',
    def: 'bubble-machine',
    sprite: 'pg-bubbles',
    at: pt(1560, 700),
    w: 120,
    h: 270,
    up: 240,
    stand: 74,
  });
  toy({
    name: 'morph-1',
    def: 'morph-machine',
    look: 'apple-gem',
    sprite: 'pg-morph-apple-gem',
    at: pt(860, 1420),
    w: 190,
    h: 210,
    up: 180,
    stand: 90,
  });
  toy({
    name: 'morph-2',
    def: 'morph-machine',
    look: 'berry-flower',
    sprite: 'pg-morph-berry-flower',
    at: pt(1700, 1420),
    w: 190,
    h: 210,
    up: 180,
    stand: 90,
  });

  // The trees round the edge
  const TREES = ['pg-tree-blossom-1', 'pg-tree-blossom-2', 'pg-tree-oak-lavender-1'] as const;
  let trees = 0;
  for (let attempt = 0; attempt < 30000 && trees < 90; attempt++) {
    const x = -30 + rnd() * (W + 60),
      y = 470 + rnd() * (H - 470 + 30);
    if (b.openness(x, y) > -40) continue;
    if (y > H - 62 && x > 160 && x < W - 160) continue; // the lower edge stays low so the herd is never hidden there
    const id = pick(TREES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.6 + 14)) continue;
    b.place(id, x, y);
    trees++;
  }

  // Ground life
  const FLOWERS = ['pink', 'sky', 'yellow', 'white', 'lilac'].flatMap((c) => [
    `pg-flowers-${c}-1`,
    `pg-flowers-${c}-2`,
  ]);
  const clear = (x: number, y: number, m = 40): boolean => b.openness(x, y) > m && b.waterAt(x, y) === 0;
  const nearPath = (x: number, y: number): boolean => b.onPath(x, y, 48);
  for (let i = 0; i < 90; i++) {
    const cx = 260 + rnd() * (W - 520),
      cy = 640 + rnd() * 900;
    if (!clear(cx, cy, 60) || nearPath(cx, cy)) continue;
    const bloom = pick(FLOWERS),
      bloom2 = pick(FLOWERS);
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 170,
        y = cy + (rnd() - 0.5) * 90;
      if (!clear(x, y, 40) || nearPath(x, y) || !sc.tryAdd(x, y, 28)) continue;
      b.place(rnd() < 0.6 ? bloom : bloom2, x, y);
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = 260 + rnd() * (W - 520),
      y = 640 + rnd() * 900;
    if (!clear(x, y, 50) || nearPath(x, y) || !sc.tryAdd(x, y, 30)) continue;
    b.place(`pg-windflower-${pick(['pink', 'lilac'])}-1`, x, y);
  }
  const BUSHES = ['pg-bush-pink-dots', 'pg-bush-rose-dots'] as const;
  for (let i = 0, n = 0; i < 8000 && n < 14; i++) {
    const x = 250 + rnd() * (W - 500),
      y = 640 + rnd() * 900;
    if (!clear(x, y, 70) || nearPath(x, y)) continue;
    const id = pick(BUSHES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 28) + 60)) continue;
    b.solid(id, x, y);
    n++;
  }
  for (let i = 0, n = 0; i < 20000 && n < 40; i++) {
    const x = rnd() * W,
      y = 620 + rnd() * (H - 620 - 60);
    if (!clear(x, y, 6) || b.onPath(x, y, 24)) continue;
    if (!sc.tryAdd(x, y, 30, 0.7)) continue;
    b.place(`pg-pebbles-${pick([1, 2])}`, x, y, 'ground-detail');
    n++;
  }

  // Grazing
  const graze = (name: string, x: number, y: number, facing: 'east' | 'west'): void => {
    const dx = facing === 'east' ? 1 : -1;
    sc.add(x + dx * 40, y, 70);
    b.anchor({ name, tags: ['graze'], pos: pt(x + dx * 64, y), approach: [E(x, y, facing)] });
  };
  graze('graze-1', 330, 900, 'east');
  graze('graze-2', 2230, 900, 'west');
  graze('graze-3', 640, 1490, 'east');
  graze('graze-4', 2030, 1490, 'west');

  // Who lives here
  const live = (name: string, kind: LifeKind, cx: number, cy: number, w: number, h: number, count: number): void =>
    b.life({ name, kind, area: { x: cx - w / 2, y: cy - h / 2, w, h }, shape: 'rect', count });
  live('butterfly-west', 'butterfly', 500, 1000, 600, 600, 3);
  live('butterfly-east', 'butterfly', 2060, 1000, 600, 600, 3);
  live('fairy-floor', 'fairy', 1280, 1060, 1200, 500, 3);
  live('fairy-north', 'fairy', 1280, 720, 900, 120, 1);
  live('bird-north', 'bird', 1280, 720, 1100, 100, 2);
  live('bunny-west', 'bunny', 420, 880, 220, 120, 1);
  live('bunny-east', 'bunny', 2140, 880, 220, 120, 1);
  live('bee-lawn', 'bee', 1280, 1400, 1000, 200, 2);

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('dance-floor');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/dance-floor.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorDanceFloor();
  console.log(
    `dance-floor: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
