import { mkdirSync, writeFileSync } from 'node:fs';
import type { LifeKind } from '../../../src/shared/life';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, disc, stand as E, hitBox as hit, type Pt, pt, rect, Scatter } from './geom';
import { paintSky, toyMaker } from './playground-kit';

/**
 * The playground. A rainbow gate in the north wall opens on a paved plaza with a fountain of
 * jewels. Round it, the toys: a rainbow slide and balloon stands on the west, firework pads on the
 * east, bouncy mushrooms, spell cannons, a bubble machine, confetti poppers and two morph machines
 * on the lawn to the south, and a frog pond in the south-east corner. Nothing here is saved and
 * nothing can go wrong. Everything is in world units; y grows toward the viewer.
 */
export function authorPlayground(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'playground').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'playground',
    widthTiles: 40,
    heightTiles: 28,
    tileset: 'garden',
    bundle: 'playground',
    music: 'garden',
    ambience: 'garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(2048);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  const GATE = pt(1248, 640); // the arch's ground point
  const PLAZA = pt(1248, 1010);
  const POND = pt(2000, 1450);

  // Space
  b.open(rect(224, 600, W - 224, 1690));
  // Path edges sit half a tile off the vertex grid so each is a whole number of tiles wide.
  b.pathBand(
    rect(1120, 560, 1376, 1010), // from the gate down to the plaza
    disc(PLAZA, 330), // the plaza and its fountain
  );
  b.pond(blob(POND, 290, 150, { seed: 91, wobble: 0.14 }));
  b.classify();

  // The sky
  paintSky(b);

  // The gate
  b.place('pg-arch', GATE.x, GATE.y, 'object-bases', 0);
  for (const sx of [-1, 1]) b.block({ kind: 'circle', x: GATE.x + sx * 90, y: GATE.y, r: 22 });
  // Beyond the arch there is nothing to walk on, so the portal sits just under it and fires as the
  // herd passes between the pillars.
  b.portal({
    name: 'garden-gate',
    bounds: { x: GATE.x - 70, y: GATE.y - 44, w: 140, h: 40 },
    approach: pt(GATE.x, GATE.y + 56),
    toMap: 'palace-garden',
    toSpawn: 'from-playground',
  });
  b.spawn('from-garden', 'south', [pt(GATE.x, GATE.y + 160), pt(1000, 890), pt(740, 930), pt(480, 940)]);
  // Back from the dance floor they stand in a row on the paving south of the fountain, which the
  // scenery below already keeps clear.
  b.spawn('from-dance-floor', 'south', [pt(1550, PLAZA.y + 160), pt(1245, PLAZA.y + 160), pt(940, PLAZA.y + 160)]);

  // Keep scenery off the gate, the plaza and the herd's arrival.
  for (const [x, y, r] of [
    [GATE.x, GATE.y + 120, 220],
    [PLAZA.x, PLAZA.y, 340],
    [1000, 890, 100],
    [740, 930, 100],
    [480, 940, 100],
  ] as const)
    sc.add(x, y, r);

  // Toys
  const toy = toyMaker(b, sc, footprints);

  // The fountain of jewels, in the middle of the plaza.
  toy({
    name: 'gem-fountain-1',
    def: 'gem-fountain',
    sprite: 'pg-gem-fountain',
    at: PLAZA,
    w: 290,
    h: 250,
    up: 190,
    stand: 124,
  });

  // The rainbow slide, west of the plaza. Its tower and ramp stand across the ground, so the herd
  // walks round it.
  const SLIDE = pt(640, 800);
  sc.add(SLIDE.x + 20, SLIDE.y, 240);
  b.block({ kind: 'rect', x: SLIDE.x - 148, y: SLIDE.y - 36, w: 316, h: 72 });
  b.interactable({
    name: 'slide-1',
    definitionId: 'rainbow-slide',
    pos: SLIDE,
    hit: { x: SLIDE.x - 150, y: SLIDE.y - 250, w: 320, h: 300 },
    approach: [E(SLIDE.x + 20, SLIDE.y + 86, 'north')],
  });

  // Balloon stands: one by each side of the path to the gate, and one at the slide's foot.
  toy({
    name: 'balloons-1',
    def: 'balloon-stand',
    look: 'party',
    sprite: 'pg-balloon-weight',
    at: pt(950, 760),
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
    at: pt(1546, 760),
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
    at: pt(300, 1040),
    w: 140,
    h: 290,
    up: 262,
    stand: 70,
  });

  // Fireworks on the east side, in a gentle row.
  toy({
    name: 'fireworks-1',
    def: 'firework-launcher',
    look: 'red',
    sprite: 'pg-fireworks-red',
    at: pt(1930, 790),
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
    at: pt(2130, 880),
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
    at: pt(2260, 790),
    w: 140,
    h: 190,
    up: 160,
    stand: 96,
  });

  // Bouncy mushrooms in a ring south-west of the plaza.
  [
    [430, 1110, 'red'],
    [590, 1190, 'pink'],
    [750, 1110, 'blue'],
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

  // Spell cannons at the west edge of the south lawn, aiming east across it.
  toy({
    name: 'cannon-1',
    def: 'spell-cannon',
    look: 'star',
    sprite: 'pg-cannon-star',
    at: pt(380, 1350),
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
    at: pt(380, 1540),
    w: 170,
    h: 150,
    up: 120,
    stand: 100,
  });

  // A bubble machine, the confetti poppers and the two morph machines along the south.
  toy({
    name: 'bubbles-1',
    def: 'bubble-machine',
    sprite: 'pg-bubbles',
    at: pt(700, 1480),
    w: 120,
    h: 270,
    up: 240,
    stand: 74,
  });
  toy({
    name: 'popper-1',
    def: 'confetti-popper',
    sprite: 'pg-popper',
    at: pt(940, 1400),
    w: 120,
    h: 210,
    up: 180,
    stand: 70,
  });
  toy({
    name: 'popper-2',
    def: 'confetti-popper',
    sprite: 'pg-popper',
    at: pt(1580, 1400),
    w: 120,
    h: 210,
    up: 180,
    stand: 70,
  });
  toy({
    name: 'morph-1',
    def: 'morph-machine',
    look: 'apple-gem',
    sprite: 'pg-morph-apple-gem',
    at: pt(1090, 1570),
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
    at: pt(1440, 1570),
    w: 190,
    h: 210,
    up: 180,
    stand: 90,
  });

  // The pond and the bench
  const deco = (id: string, x: number, y: number, layer: 'ground-detail' | 'object-bases' = 'object-bases'): void =>
    b.place(id, x, y, layer);
  for (const [x, y, id] of [
    [1770, 1350, 'pg-reeds-1'],
    [2230, 1330, 'pg-reeds-2'],
    [1730, 1560, 'pg-reeds-2'],
    [2290, 1560, 'pg-reeds-1'],
    [1880, 1628, 'pg-reeds-1'],
  ] as const)
    deco(id, x, y);
  for (const [x, y, id] of [
    [1790, 1410, 'pg-lily-2'],
    [2200, 1490, 'pg-lily-1'],
    [2150, 1380, 'pg-lily-1'],
    [1780, 1500, 'pg-lily-2'],
    [1960, 1350, 'pg-lily-1'],
  ] as const)
    deco(id, x, y, 'ground-detail');
  for (const [x, y, id] of [
    [1700, 1450, 'pg-rock-moss-1'],
    [2300, 1450, 'pg-rock-grey-1'],
  ] as const) {
    sc.add(x, y, (footprints[id] ?? 28) + 20);
    b.solid(id, x, y);
  }
  sc.add(POND.x, POND.y, 360);
  b.place('pg-bench', 1810, 1250);
  b.block({ kind: 'rect', x: 1740, y: 1226, w: 140, h: 26 });
  b.place('pg-urn-1', 1060, 690);
  b.place('pg-urn-2', 1436, 690);
  for (const x of [1060, 1436]) b.block({ kind: 'circle', x, y: 690, r: 26 });
  // Drinking: stand on the bank facing the water.
  const bank = (dx: number): Pt => {
    let x = POND.x;
    const side = dx < 0 ? -1 : 1;
    while (b.waterAt(x, POND.y) > 0.2 && Math.abs(x - POND.x) < 900) x += side;
    return pt(x + side * 46, POND.y);
  };
  const west = bank(-1);
  b.anchor({
    name: 'drink-pond-west',
    tags: ['drink'],
    pos: pt(west.x + 60, west.y),
    approach: [E(west.x, west.y, 'east')],
  });

  // The trees round the edge
  const TREES = [
    'pg-tree-blossom-1',
    'pg-tree-blossom-2',
    'pg-tree-oak-lavender-1',
    'pg-tree-oak-lime-1',
    'pg-tree-oak-lime-2',
    'pg-tree-birch-lime-1',
  ] as const;
  let trees = 0;
  for (let attempt = 0; attempt < 30000 && trees < 90; attempt++) {
    const x = -30 + rnd() * (W + 60),
      y = 470 + rnd() * (H - 470 + 30);
    if (b.openness(x, y) > -40) continue;
    if (y > 1730 && x > 160 && x < W - 160) continue; // the lower edge stays low so the herd is never hidden there
    const id = pick(TREES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.6 + 14)) continue;
    b.place(id, x, y);
    trees++;
  }

  // Ground life
  const FLOWERS = ['pink', 'sky', 'yellow', 'white', 'lilac', 'coral'].flatMap((c) => [
    `pg-flowers-${c}-1`,
    `pg-flowers-${c}-2`,
  ]);
  const clear = (x: number, y: number, m = 40): boolean => b.openness(x, y) > m && b.waterAt(x, y) === 0;
  const nearPath = (x: number, y: number): boolean => b.onPath(x, y, 48);
  for (let i = 0; i < 120; i++) {
    const cx = 260 + rnd() * (W - 520),
      cy = 640 + rnd() * 1000;
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
  for (let i = 0; i < 60; i++) {
    const x = 260 + rnd() * (W - 520),
      y = 640 + rnd() * 1000;
    if (!clear(x, y, 50) || nearPath(x, y) || !sc.tryAdd(x, y, 30)) continue;
    b.place(`pg-windflower-${pick(['pink', 'lilac'])}-1`, x, y);
  }
  const BUSHES = [
    'pg-bush-lime-1',
    'pg-bush-lime-2',
    'pg-bush-emerald-1',
    'pg-bush-pink-dots',
    'pg-bush-rose-dots',
  ] as const;
  for (let i = 0, n = 0; i < 8000 && n < 26; i++) {
    const x = 250 + rnd() * (W - 500),
      y = 640 + rnd() * 1010;
    if (!clear(x, y, 70) || nearPath(x, y)) continue;
    const id = pick(BUSHES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 28) + 60)) continue;
    b.solid(id, x, y);
    n++;
  }
  for (let i = 0, n = 0; i < 20000 && n < 230; i++) {
    const x = rnd() * W,
      y = 620 + rnd() * (H - 620 - 60);
    if (!clear(x, y, 6) || b.onPath(x, y, 24)) continue;
    const tuft = rnd() < 0.8;
    if (!sc.tryAdd(x, y, tuft ? 34 : 30, 0.7)) continue;
    b.place(
      tuft ? `pg-tuft-${pick([1, 2, 3])}` : `pg-pebbles-${pick([1, 2])}`,
      x,
      y,
      tuft ? 'object-bases' : 'ground-detail',
    );
    n++;
  }

  // Grazing
  const graze = (name: string, x: number, y: number, facing: 'east' | 'west'): void => {
    const dx = facing === 'east' ? 1 : -1;
    sc.add(x + dx * 40, y, 70);
    b.anchor({ name, tags: ['graze'], pos: pt(x + dx * 64, y), approach: [E(x, y, facing)] });
    b.place(`pg-tuft-${1 + (Math.round(x * 7 + y * 3) % 3)}`, x + dx * 66, y + 2);
  };
  graze('graze-1', 330, 700, 'east');
  graze('graze-2', 2200, 1150, 'west');
  graze('graze-3', 1560, 1250, 'west');
  graze('graze-4', 500, 1330, 'east');

  // Who lives here
  const live = (
    name: string,
    kind: LifeKind,
    cx: number,
    cy: number,
    w: number,
    h: number,
    count: number,
    shape: 'rect' | 'ellipse' = 'rect',
  ): void => b.life({ name, kind, area: { x: cx - w / 2, y: cy - h / 2, w, h }, shape, count });
  live('bird-lawn-west', 'bird', 420, 1250, 300, 100, 2);
  live('bird-lawn-east', 'bird', 2100, 1050, 300, 100, 2);
  live('bunny-lawn-west', 'bunny', 380, 780, 220, 120, 1);
  live('bunny-lawn-east', 'bunny', 2150, 1200, 220, 120, 2);
  live('ladybug-lawn', 'ladybug', 560, 1020, 220, 80, 2);
  live('snail-lawn', 'snail', 1560, 1130, 220, 80, 1);
  live('butterfly-west', 'butterfly', 600, 1000, 700, 500, 3);
  live('butterfly-east', 'butterfly', 1950, 1100, 700, 500, 3);
  live('bee-lawn', 'bee', 1250, 1250, 1000, 400, 2);
  live('fairy-plaza', 'fairy', PLAZA.x, PLAZA.y, 700, 400, 2);
  live('fairy-south', 'fairy', 1300, 1480, 900, 300, 1);
  live('duck-pond', 'duck', POND.x, POND.y, 300, 110, 2, 'ellipse');
  live('fish-pond', 'fish', POND.x, POND.y, 280, 100, 3, 'ellipse');
  live('frog-pond', 'frog', POND.x, POND.y + 175, 440, 60, 2);
  live('dragonfly-pond', 'dragonfly', POND.x, POND.y, 560, 320, 2);

  // The frog sits on her pad in the south of the pond. The water keeps the herd out, so she is
  // tapped from the bank, facing north. She is placed last and takes no room from the scatter, so
  // the lawn, trees and bushes are laid just as they were without her.
  b.interactable({
    name: 'frog-pond-1',
    definitionId: 'frog-pond',
    pos: pt(2000, 1520),
    hit: hit(2000, 1520, 230, 112, 84),
    approach: [E(2000, 1660, 'north')],
  });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('garden');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/playground.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorPlayground();
  console.log(
    `playground: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
