import { mkdirSync, writeFileSync } from 'node:fs';
import type { LifeKind } from '../../../src/shared/life';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, stand as E, lane, type Pt, pt, Scatter, T, tp } from './geom';
import { Placer } from './placer';

/**
 * Santa's grove, a snowy clearing off the forest where it is always Christmas. A trodden trail
 * comes in from the forest's gate and runs up to a round square. The Christmas tree stands in the
 * square with presents round its foot, candy-cane lamp posts line the trail, and trails lead off
 * to Santa's cabin in the north-west, the sleigh and its reindeer in the east, and a field of
 * snowmen in the south-east. Firs fill everything else. Santa, and the elves who help him, walk
 * between the tree, the sleigh and the cabin. All numbers are tiles unless named otherwise.
 */

const WRAPS = ['red', 'green', 'blue', 'gold', 'pink'] as const;

export function authorSantaGrove(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'grove').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'santa-grove',
    widthTiles: 56,
    heightTiles: 42,
    tileset: 'snow-grove',
    bundle: 'grove',
    music: 'snow',
    ambience: 'sky-garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(1225);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  // The shape of the land
  const SQUARE = pt(28, 19);
  const CABIN = pt(11, 10.4);
  const SLEIGH = pt(44, 15);
  const FIELD = pt(44, 31.5);
  const GATE = tp(2.3, 35.5);

  const square = blob(tp(SQUARE.x, SQUARE.y), 8.6 * T, 6 * T, { seed: 11, wobble: 0.08 });
  const cabinYard = blob(tp(CABIN.x, CABIN.y + 1.2), 5.2 * T, 4 * T, { seed: 12 });
  const sleighYard = blob(tp(SLEIGH.x, SLEIGH.y + 0.8), 6.2 * T, 4.4 * T, { seed: 13 });
  const snowField = blob(tp(FIELD.x, FIELD.y), 6.8 * T, 4.4 * T, { seed: 14 });
  const entry = lane(
    [tp(2.3, 35.5), tp(5, 37.2), tp(9.6, 37.6), tp(14.4, 35), tp(19, 31), tp(23.6, 26.4), tp(26.6, 23.2)],
    3 * T,
    { seed: 21, wobble: 0.05 },
  );
  const toCabin = lane([tp(21, 17.6), tp(16.4, 15), tp(12.8, 13.6), tp(11, 12.8)], 2.4 * T, { seed: 22, wobble: 0.05 });
  const toSleigh = lane([tp(34.6, 18.4), tp(38.6, 17.2), tp(42, 16.4)], 2.4 * T, { seed: 23, wobble: 0.05 });
  const toField = lane([tp(31, 23.6), tp(35, 27), tp(39.4, 30)], 2.4 * T, { seed: 24, wobble: 0.05 });
  const lanes = [entry, toCabin, toSleigh, toField];

  b.open(square, cabinYard, sleighYard, snowField, ...lanes.map((l) => l.region));
  b.pathBand(
    blob(tp(SQUARE.x, SQUARE.y + 0.4), 3.4 * T, 2.2 * T, { seed: 31, wobble: 0.1 }),
    ...lanes.map((l) => lane(l.line, 1.3 * T, { seed: 32 }).region),
    blob(tp(CABIN.x, CABIN.y + 2), 2.2 * T, 1.3 * T, { seed: 33, wobble: 0.1 }),
    blob(tp(SLEIGH.x - 1, SLEIGH.y + 1.6), 3.2 * T, 1.6 * T, { seed: 34, wobble: 0.1 }),
  );
  b.classify();

  const placer = new Placer(b, sc, footprints);
  const inOpen = (x: number, y: number, margin = 0): boolean => b.openness(x, y) > margin;
  const onLane = (x: number, y: number, slack: number): boolean => lanes.some((l) => l.region(x, y) > -slack);

  // The way back to the forest: a candy-cane gate at the west edge
  b.place('xm-gate', GATE.x, GATE.y);
  b.block({ kind: 'circle', x: GATE.x - 98, y: GATE.y, r: 12 });
  b.block({ kind: 'circle', x: GATE.x + 98, y: GATE.y, r: 12 });
  b.portal({
    name: 'forest-gate',
    bounds: { x: GATE.x - 70, y: GATE.y - 40, w: 140, h: 90 },
    approach: pt(GATE.x, GATE.y + 52),
    toMap: 'forest',
    toSpawn: 'from-grove',
  });
  sc.add(GATE.x, GATE.y, 160);
  b.spawn('from-forest', 'east', [pt(614, 2406), pt(817, 2203), pt(1020, 2000)]);

  // The Christmas tree stands in the middle of the square
  const TREE = tp(SQUARE.x, SQUARE.y - 2.6);
  placer.prop({
    name: 'xmas-tree-1',
    def: 'xmas-tree',
    sprite: 'xm-tree',
    at: TREE,
    width: 240,
    tall: 500,
    keep: 150,
    approach: [E(TREE.x - 70, TREE.y + 110, 'north'), E(TREE.x + 70, TREE.y + 110, 'north')],
  });
  // Presents round its foot, and more by the sleigh
  const present = (name: string, tx: number, ty: number, i: number): void =>
    placer.prop({
      name,
      def: 'present',
      look: WRAPS[i % WRAPS.length]!,
      sprite: `xm-present-${WRAPS[i % WRAPS.length]!}`,
      at: tp(tx, ty),
      width: 110,
      tall: 110,
      keep: 40,
      loose: true,
    });
  const giftSpots = [
    [-3.6, -1.2],
    [-2.6, 0.9],
    [-1.2, 1.6],
    [1.2, 1.7],
    [2.8, 1.0],
    [3.8, -1.1],
    [-4.8, 1.6],
    [4.9, 1.7],
    [-0.1, -4.6],
  ] as const;
  for (const [i, [dx, dy]] of giftSpots.entries()) present(`present-${i + 1}`, SQUARE.x + dx, SQUARE.y + dy, i);
  const sleighSpots = [
    [-3.6, 2.2],
    [-2.6, 2.9],
    [-4.4, 3.0],
  ] as const;
  for (const [i, [dx, dy]] of sleighSpots.entries())
    present(`present-sleigh-${i + 1}`, SLEIGH.x + dx, SLEIGH.y + dy, i + 2);

  // Candy-cane lamp posts line the square and the trails
  const lamp = (name: string, tx: number, ty: number, i: number): void =>
    placer.prop({
      name,
      def: 'candy-lamp',
      look: i % 2 === 0 ? 'red' : 'green',
      sprite: `xm-lamp-${i % 2 === 0 ? 'red' : 'green'}`,
      at: tp(tx, ty),
      width: 80,
      tall: 180,
      keep: 30,
      loose: true,
    });
  let lamps = 0;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    const x = SQUARE.x + Math.cos(a) * 7.4,
      y = SQUARE.y + Math.sin(a) * 4.8;
    const px = x * T,
      py = y * T;
    if (!inOpen(px, py, 90)) continue;
    lamp(`lamp-${++lamps}`, x, y, lamps);
  }
  for (const [tx, ty] of [
    [4.2, 38.8],
    [7.6, 36],
    [12.4, 36.8],
    [16.4, 32.4],
    [20.6, 29.8],
    [22.6, 24.4],
    [24.6, 27.6],
    [13.6, 14.6],
    [18, 16.2],
    [37.4, 16.2],
    [40, 18.6],
    [33.8, 27.2],
    [37.8, 31.2],
  ] as const)
    lamp(`lamp-${++lamps}`, tx, ty, lamps);

  // Santa's cabin, in the north-west: the house is drawn by the map, and its door takes the herd
  // inside. The front wall's foot is 37 px below the cabin's anchor, so the ground it stands on runs
  // that far, and the herd comes up to the door from the snow in front of it.
  const C = tp(CABIN.x, CABIN.y);
  b.place('xm-cabin', C.x, C.y, 'object-bases', 0);
  b.block({ kind: 'rect', x: C.x - 124, y: C.y - 158, w: 248, h: 196 });
  b.interactable({
    name: 'cabin-door-1',
    definitionId: 'cabin-door',
    pos: C,
    hit: { x: C.x - 34, y: C.y - 42, w: 68, h: 86 },
    approach: [E(C.x, C.y + 74, 'north')],
  });
  b.portal({
    name: 'cabin-gate',
    bounds: { x: C.x - 44, y: C.y + 56, w: 88, h: 36 },
    approach: pt(C.x, C.y + 74),
    toMap: 'santa-cabin',
    toSpawn: 'from-grove',
    door: 'cabin-door-1',
  });
  b.spawn('from-cabin', 'south', [
    pt(C.x, C.y + 124),
    pt(C.x + 196, C.y + 184),
    pt(C.x + 296, C.y + 234),
    pt(C.x + 346, C.y + 299),
    pt(C.x + 496, C.y + 299),
    pt(C.x + 556, C.y + 334),
  ]);
  sc.add(C.x, C.y - 70, 280);
  sc.add(C.x, C.y + 130, 150);

  // The sleigh, with two reindeer in front of it
  const S = tp(SLEIGH.x, SLEIGH.y);
  placer.prop({
    name: 'sleigh-1',
    def: 'sleigh',
    sprite: 'xm-sleigh',
    at: S,
    width: 250,
    tall: 150,
    keep: 60,
    approach: [E(S.x - 30, S.y + 96, 'north'), E(S.x + 90, S.y + 80, 'north')],
  });
  for (const [i, [dx, dy]] of (
    [
      [4.6, -0.2],
      [5.8, 1.8],
    ] as const
  ).entries())
    placer.prop({
      name: `reindeer-${i + 1}`,
      def: 'reindeer',
      sprite: 'xm-reindeer',
      at: tp(SLEIGH.x + dx, SLEIGH.y + dy),
      width: 120,
      tall: 200,
      keep: 50,
      loose: true,
    });

  // A field of snowmen
  for (const [i, [dx, dy]] of (
    [
      [-3.4, -1.2],
      [-0.6, -2],
      [2.4, -1.4],
      [-2, 1.6],
      [1.2, 1.4],
      [3.8, 1.6],
    ] as const
  ).entries())
    placer.prop({
      name: `snowman-${i + 1}`,
      def: 'snowman',
      look: i % 2 === 0 ? 'red' : 'green',
      sprite: `xm-snowman-${i % 2 === 0 ? 'red' : 'green'}`,
      at: tp(FIELD.x + dx, FIELD.y + dy),
      width: 110,
      tall: 190,
      keep: 50,
      loose: true,
    });
  // Mounds of snow to jump on, in the square, the cabin yard and the field
  let piles = 0;
  for (const [cx, cy, n] of [
    [SQUARE.x, SQUARE.y, 5],
    [CABIN.x, CABIN.y + 1.4, 3],
    [SLEIGH.x, SLEIGH.y + 1, 3],
    [FIELD.x, FIELD.y, 4],
  ] as const)
    for (let attempt = 0, got = 0; attempt < 400 && got < n; attempt++) {
      const a = rnd() * Math.PI * 2,
        d = 2.4 + rnd() * 4;
      const x = (cx + Math.cos(a) * d) * T,
        y = (cy + Math.sin(a) * d * 0.7) * T;
      if (!placer.roomAt(x, y, 110) || b.onPath(x, y, 40) || !sc.tryAdd(x, y, 110, 0.8)) continue;
      placer.prop({
        name: `snow-${++piles}`,
        def: 'snow-pile',
        look: rnd() < 0.5 ? '1' : '2',
        sprite: 'xm-pile-1',
        at: pt(x, y),
        width: 130,
        tall: 70,
        keep: 20,
        loose: true,
      });
      got++;
    }
  placer.open();

  // The wood: firs on every side, as far as the camera can see
  const firs = ['xm-fir-1', 'xm-fir-2', 'xm-fir-3'];
  for (let attempt = 0; attempt < 90000; attempt++) {
    const x = -60 + rnd() * (W + 120),
      y = -40 + rnd() * (H + 140);
    const o = b.openness(x, y);
    if (o > 6 || o < -760) continue;
    const id = pick(firs);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.7 + 10)) continue;
    b.place(id, x, y);
  }
  // Firs standing inside the open ground near its edge, so the rim is a tree line and not a cut
  for (let attempt = 0, rim = 0; attempt < 6000 && rim < 110; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    const o = b.openness(x, y);
    if (o < 60 || o > 190 || onLane(x, y, 150)) continue;
    const id = pick(firs);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) + 70)) continue;
    b.solid(id, x, y);
    rim++;
  }
  // Stones under the snow and low drifts, never on a trail
  for (let attempt = 0, n = 0; attempt < 5000 && n < 60; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    if (!inOpen(x, y, 70) || onLane(x, y, 100)) continue;
    const id = pick(['xm-rock-1', 'xm-rock-2', 'xm-pile-1', 'xm-pile-2']);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 30) + 50)) continue;
    if (id.includes('rock')) b.solid(id, x, y);
    else b.place(id, x, y);
    n++;
  }

  // Where the herd can graze on what the snow leaves, and drink
  const graze = (name: string, tx: number, ty: number, facing: 'east' | 'west'): void => {
    const x = tx * T,
      y = ty * T;
    const at = placer.snap(pt(x, y), 70);
    b.anchor({
      name,
      tags: ['graze'],
      pos: pt(at.x + (facing === 'east' ? 64 : -64), at.y),
      approach: [E(at.x, at.y, facing)],
    });
  };
  graze('graze-grove-1', 22.6, 20.8, 'east');
  graze('graze-grove-2', 33.2, 21.6, 'west');
  graze('graze-grove-3', 39.4, 33.6, 'east');
  graze('graze-grove-4', 10, 14, 'west');

  // Who lives here: Santa goes from the sleigh to the tree and rests by the cabin, and two elves run
  // between the presents and the tree
  const anchor = (name: string, tag: string, want: Pt, facing: 'north' | 'south' | 'east' | 'west'): void => {
    const at = placer.snap(want, 60);
    b.anchor({ name, tags: [tag], pos: at, approach: [E(at.x, at.y, facing)] });
  };
  anchor('santa-sleigh-1', 'sleigh', pt(S.x - 80, S.y + 120), 'north');
  anchor('santa-sleigh-2', 'sleigh', pt(S.x + 150, S.y + 90), 'west');
  anchor('santa-tree-1', 'tree', pt(TREE.x - 150, TREE.y + 200), 'north');
  anchor('santa-tree-2', 'tree', pt(TREE.x + 150, TREE.y + 200), 'north');
  anchor('santa-chair-1', 'chair', pt(C.x - 90, C.y + 150), 'north');
  anchor('santa-chair-2', 'chair', pt(C.x + 100, C.y + 160), 'north');
  b.npc('santa', pt(C.x + 20, C.y + 170), 'south');
  for (const [i, [tx, ty]] of (
    [
      [-3.6, 0.2],
      [-1.2, 2.4],
      [2.8, 2.2],
      [4.8, 0.2],
      [0.6, 3.8],
    ] as const
  ).entries())
    anchor(`elf-gift-${i + 1}`, 'gift', tp(SQUARE.x + tx, SQUARE.y + ty), 'south');
  for (const [i, [tx, ty]] of (
    [
      [-1.4, -1],
      [1.6, -0.8],
      [-0.2, 0.5],
    ] as const
  ).entries())
    anchor(`elf-tree-${i + 1}`, 'tree', tp(SQUARE.x + tx, SQUARE.y - 2.6 + 2.4 + ty), 'north');
  b.npc('elf', tp(SQUARE.x - 4, SQUARE.y + 3), 'east');
  b.npc('elf', tp(SQUARE.x + 4, SQUARE.y + 3), 'west');

  // Who lives here: birds that stay for the winter, and fairies over the snow
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
  live('bird-square', 'bird', SQUARE.x * T, SQUARE.y * T, 1200, 600, 4, 'ellipse');
  live('bird-cabin', 'bird', C.x, C.y + 100, 700, 400, 2, 'ellipse');
  live('fairy-tree', 'fairy', TREE.x, TREE.y + 100, 800, 700, 3, 'ellipse');
  live('fairy-field', 'fairy', FIELD.x * T, FIELD.y * T, 900, 500, 2, 'ellipse');

  placer.finish();
  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('snow-grove');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/santa-grove.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorSantaGrove();
  console.log(
    `santa-grove: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
