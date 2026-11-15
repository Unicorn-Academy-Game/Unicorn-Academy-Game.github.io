import { mkdirSync, writeFileSync } from 'node:fs';
import type { Facing } from '../../../src/shared/ids';
import type { LifeKind } from '../../../src/shared/life';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, lane, type Pt, pt, type Region, rect, Scatter, T, tp, union } from './geom';

/**
 * The Magical Forest. A ring of lanes joins six clearings, each with its own look, around a dense
 * wood, with cross lanes through a central grove. Everything outside the clearings and lanes is
 * wood: solid for the herd, and filled with trees as far as the camera can see. All numbers are
 * tiles unless named otherwise.
 */
export function authorForest(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'forest').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'forest',
    widthTiles: 64,
    heightTiles: 48,
    tileset: 'forest',
    bundle: 'forest',
    music: 'forest',
    ambience: 'forest',
    start: 'start',
    footprints,
    sprites,
  });
  const sc = new Scatter(2026);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const weighted = <A>(xs: readonly (readonly [A, number])[]): A => {
    let t = rnd() * xs.reduce((s, [, w]) => s + w, 0);
    for (const [a, w] of xs) {
      t -= w;
      if (t <= 0) return a;
    }
    return xs[0]![0];
  };

  // The shape of the land
  const C = {
    start: pt(12, 37),
    leaf: pt(12, 26),
    glacier: pt(14, 12),
    river: pt(31, 11),
    cinder: pt(50, 12),
    storm: pt(52, 26),
    exit: pt(58, 38),
    grove: pt(31, 25),
    south: pt(33, 38),
  };
  const clearings: Record<keyof typeof C, Region> = {
    start: blob(tp(C.start.x, C.start.y), 8.3 * T, 5.2 * T, { seed: 11 }),
    leaf: blob(tp(C.leaf.x, C.leaf.y), 7.8 * T, 5.4 * T, { seed: 12 }),
    glacier: blob(tp(C.glacier.x, C.glacier.y), 7.6 * T, 5.6 * T, { seed: 13 }),
    river: blob(tp(C.river.x, C.river.y), 10.2 * T, 6.6 * T, { seed: 14 }),
    cinder: blob(tp(C.cinder.x, C.cinder.y), 7.2 * T, 5.4 * T, { seed: 15 }),
    storm: blob(tp(C.storm.x, C.storm.y), 7.2 * T, 5.4 * T, { seed: 16 }),
    exit: blob(tp(C.exit.x, C.exit.y), 5.6 * T, 5.2 * T, { seed: 17 }),
    grove: blob(tp(C.grove.x, C.grove.y), 6.2 * T, 4.6 * T, { seed: 18 }),
    south: blob(tp(C.south.x, C.south.y), 6.8 * T, 4.2 * T, { seed: 19 }),
  };

  const ring = [
    { pts: [C.start, pt(11, 32), C.leaf, pt(12, 19), C.glacier], seed: 21 },
    { pts: [C.glacier, pt(22, 9.5), pt(26, 13.8), pt(31, 14.4), pt(36, 13.6), pt(41, 9.8), C.cinder], seed: 22 },
    { pts: [C.cinder, pt(53, 19), C.storm, pt(55, 33), C.exit], seed: 23 },
    { pts: [C.exit, pt(48, 41.5), C.south, pt(22, 41.4), C.start], seed: 24 },
  ].map((l) =>
    lane(
      l.pts.map((p) => tp(p.x, p.y)),
      3 * T,
      { seed: l.seed },
    ),
  );
  const cross = [
    { pts: [C.leaf, pt(21, 27.4), C.grove, pt(42, 27), C.storm], seed: 31 },
    { pts: [C.grove, pt(30, 18), pt(31.5, 14.4)], seed: 32 },
    { pts: [C.grove, pt(32, 32), C.south], seed: 33 },
  ].map((l) =>
    lane(
      l.pts.map((p) => tp(p.x, p.y)),
      2.3 * T,
      { seed: l.seed },
    ),
  );

  // The way out: a short lane east from the exit court to the palace garden's gate.
  const gateLane = lane([tp(58, 38), tp(60.4, 38), tp(62.6, 38)], 1.5 * T, { seed: 71, wobble: 0.04 });

  // The Spooky Manor stands in its own dark yard between the river, the grove and Storm's hill. A
  // footpath joins it to the cross lane.
  const MANOR = pt(42, 20.6);
  const manorYard = blob(tp(MANOR.x, MANOR.y + 0.2), 5.6 * T, 4.6 * T, { seed: 81, wobble: 0.1 });
  const manorLane = lane([tp(42, 22.6), tp(42.5, 25), tp(42, 27)], 1.5 * T, { seed: 82, wobble: 0.04 });

  b.open(
    ...Object.values(clearings),
    manorYard,
    manorLane.region,
    ...ring.map((l) => l.region),
    ...cross.map((l) => l.region),
    gateLane.region,
  );

  // Dirt paths: the ring is broad and bright, the cross lanes are footpaths, and each clearing has
  // a worn middle.
  const plaza = (c: Pt, rx: number, ry: number, seed: number): Region =>
    blob(tp(c.x, c.y), rx * T, ry * T, { seed, wobble: 0.2 });
  b.pathBand(
    ...ring.map((l) => lane(l.line, 1.3 * T, { seed: 41 }).region),
    ...cross.map((l) => lane(l.line, 0.85 * T, { seed: 42 }).region),
    lane(gateLane.line, 0.8 * T, { seed: 72, wobble: 0.04 }).region,
    lane(manorLane.line, 0.8 * T, { seed: 83, wobble: 0.04 }).region,
    plaza(pt(MANOR.x, MANOR.y + 1.6), 2.6, 1.1, 84),
    plaza(C.start, 2.6, 1.8, 51),
    plaza(C.leaf, 2, 1.5, 52),
    plaza(C.glacier, 2.2, 1.6, 53),
    plaza(C.cinder, 3.4, 2.4, 54),
    plaza(C.storm, 2.2, 1.6, 55),
    plaza(C.exit, 2.6, 2.4, 56),
    plaza(C.grove, 2.2, 1.6, 57),
    plaza(C.south, 2.4, 1.6, 58),
  );
  const riverPond = blob(tp(31, 9.2), 5.3 * T, 2.2 * T, { seed: 61, wobble: 0.2 });
  const leafSpring = blob(tp(14.2, 23.2), 2.0 * T, 1.2 * T, { seed: 62, wobble: 0.2 });
  b.pond(riverPond, leafSpring);
  b.classify();

  // Helpers
  const inOpen = (x: number, y: number, margin = 0): boolean => b.openness(x, y) > margin;
  const onLane = (x: number, y: number, slack: number): boolean =>
    [...ring, ...cross, gateLane].some((l) => l.region(x, y) > -slack);
  const dry = (x: number, y: number, margin = 60): boolean =>
    b.waterAt(x, y) === 0 &&
    b.waterAt(x + margin, y) === 0 &&
    b.waterAt(x - margin, y) === 0 &&
    b.waterAt(x, y + margin) === 0 &&
    b.waterAt(x, y - margin) === 0;

  /**
   * Walks from the middle of a pond toward one side until the water ends, and returns a point `gap`
   * units past the shore.
   */
  const shore = (center: Pt, side: 1 | -1, gap: number): Pt => {
    let x = center.x;
    while (b.waterAt(x, center.y) > 0.2 && Math.abs(x - center.x) < 900) x += side * 8;
    return pt(x + side * gap, center.y);
  };

  // Set pieces: solid trees and rocks that give each clearing a character
  const solid = (id: string, tx: number, ty: number): void => {
    const x = tx * T,
      y = ty * T;
    sc.add(x, y, (footprints[id] ?? 24) + 30);
    b.solid(id, x, y);
  };
  /**
   * A prop the game draws itself: it keeps its footprint and keeps scenery away, but the map holds
   * no picture of it.
   */
  const propSpot = (id: string, tx: number, ty: number): void => {
    const x = tx * T,
      y = ty * T;
    sc.add(x, y, (footprints[id] ?? 24) + 30);
    b.footprint(id, x, y);
  };
  const deco = (id: string, x: number, y: number, layer: 'ground-detail' | 'object-bases' = 'object-bases'): void => {
    b.place(id, x, y, layer);
  };

  // Start meadow: a big old oak on the rim, two dormant crystals for Wildstar's light, and a
  // welcome of flowers.
  solid('tree-oak-emerald-3', 6.6, 34.2);
  solid('tree-blossom-2', 17.4, 33.4);
  propSpot('crystal-amethyst-dim-1', 15.2, 39.6);
  propSpot('crystal-amethyst-dim-2', 10.0, 40.4);
  solid('rock-moss-1', 18.6, 38.6);
  solid('bush-emerald-1', 7.4, 41.2);

  // Leaf's glade: blossom trees, many flowers, mushrooms, and a little spring.
  solid('tree-blossom-1', 7.2, 22.6);
  solid('tree-blossom-2', 12.6, 21.4);
  solid('tree-blossom-1', 17.8, 21.6);
  solid('tree-oak-lime-1', 6.6, 29.8);
  solid('bush-pink-dots', 8.2, 30.4);
  solid('bush-rose-dots', 17.6, 29.2);
  deco('mushrooms-rose', 9.8 * T, 23.6 * T);
  deco('mushrooms-sky', 15.6 * T, 28.4 * T);

  // Glacier's hollow: pale crystals, frosted stones, firs and birches.
  solid('crystal-ice-3', 14.0, 10.6);
  solid('crystal-ice-1', 12.2, 11.2);
  solid('crystal-ice-2', 15.8, 11.6);
  solid('rock-frost-1', 9.6, 13.6);
  solid('rock-frost-2', 18.6, 12.6);
  solid('rock-frost-1', 11.4, 8.6);
  solid('tree-fir-spruce-2', 8.0, 9.6);
  solid('tree-birch-lime-1', 19.6, 9.4);
  solid('tree-fir-spruce-1', 6.8, 14.6);

  // River's bank: willows behind the pond, reeds at the shore, pads on the water.
  solid('tree-willow-emerald-1', 25.8, 6.0);
  solid('tree-willow-emerald-1', 36.4, 6.4);
  solid('bush-lime-1', 38.4, 12.4);
  solid('bush-emerald-2', 23.8, 12.6);
  solid('rock-moss-2', 38.2, 15.4);
  for (const [tx, ty, id] of [
    [27.2, 11.6, 'reeds-1'],
    [29.4, 11.9, 'reeds-2'],
    [33.6, 11.9, 'reeds-1'],
    [35.8, 11.6, 'reeds-2'],
    [26.2, 7.8, 'reeds-2'],
    [36.8, 8.2, 'reeds-1'],
  ] as const)
    deco(id, tx * T, ty * T);
  for (const [tx, ty, id] of [
    [29.5, 9.0, 'lily-2'],
    [32.8, 9.6, 'lily-1'],
    [31.2, 8.4, 'lily-1'],
    [34.2, 8.9, 'lily-2'],
  ] as const)
    deco(id, tx * T, ty * T, 'ground-detail');
  deco('lily-1', 13.8 * T, 23.3 * T, 'ground-detail');
  deco('lily-2', 14.8 * T, 23.0 * T, 'ground-detail');

  // Cinder's ridge: warm stones, golden oaks and bare earth.
  for (const [tx, ty, id] of [
    [54.2, 9.8, 'rock-warm-3'],
    [55.8, 11.4, 'rock-warm-2'],
    [53.6, 12.6, 'rock-warm-1'],
    [56.2, 13.8, 'rock-warm-1'],
    [54.6, 15.4, 'rock-warm-3'],
    [46.6, 9.4, 'rock-warm-2'],
  ] as const)
    solid(id, tx, ty);
  solid('tree-oak-gold-1', 45.0, 14.6);
  solid('tree-oak-gold-2', 49.6, 6.6);
  solid('bush-emerald-1', 44.4, 11.0);

  // Storm's hill: a meadow of windflowers under lavender trees, with tall standing stones.
  solid('tree-oak-lavender-1', 46.8, 22.6);
  solid('tree-oak-lavender-2', 58.2, 30.4);
  solid('rock-grey-3', 56.4, 23.6);
  solid('rock-grey-2', 48.4, 29.8);
  solid('rock-grey-1', 57.6, 27.4);

  // The grove: one great oak to find from afar, and a lit-up crystal ring.
  solid('tree-oak-emerald-3', 31.0, 23.0);
  propSpot('crystal-amethyst-dim-1', 27.4, 26.6);
  propSpot('crystal-amethyst-dim-2', 35.0, 26.8);
  solid('bush-lime-2', 34.6, 22.8);
  solid('bush-lime-1', 27.6, 22.6);

  // South meadow and the exit court.
  solid('tree-oak-lime-2', 28.8, 40.0);
  solid('tree-blossom-1', 38.6, 36.6);
  solid('rock-grey-1', 36.4, 40.4);
  solid('tree-oak-emerald-1', 61.6, 33.8);
  solid('tree-oak-emerald-2', 62.6, 45.6);
  solid('bush-pink-dots', 54.2, 40.6);
  // The gate: two vine-wrapped pillars either side of the lane, with the garden beyond.
  for (const dy of [-2.1, 2.1]) solid('forest-gate-pillar', 61.6, 38 + dy);
  // Nothing tall stands in front of the pillars, so the gate always shows.
  for (const [x, y, r] of [
    [62.4 * T, 38 * T, 170],
    [61.6 * T, 42.2 * T, 250],
    [64 * T, 40.4 * T, 170],
    [61.6 * T, 35.6 * T, 90],
  ] as const)
    sc.add(x, y, r);
  // Low planting where the wood stands back, so the pillars are not left in bare ground.
  for (const [id, tx, ty] of [
    ['bush-emerald-1', 61.2, 41.4],
    ['bush-lime-2', 62.5, 41.0],
    ['bush-pink-dots', 60.4, 40.9],
    ['bush-rose-dots', 63.1, 40.2],
  ] as const)
    deco(id, tx * T, ty * T);

  // The Spooky Manor: a purple house with orange windows, jack-o-lanterns by the path, iron lamp
  // posts, a crooked tree and low fences.
  {
    const x0 = MANOR.x * T,
      y0 = MANOR.y * T;
    const reserve = (x: number, y: number, r: number): void => sc.add(x, y, r);
    reserve(x0, y0 - 80, 330);
    reserve(x0, y0 + 160, 150);
    b.place('manor-house', x0, y0, 'object-bases', 0);
    b.block({ kind: 'rect', x: x0 - 215, y: y0 - 112, w: 430, h: 112 });
    // The way in. The door is drawn over the house and asks for a word.
    const door = pt(x0, y0);
    b.interactable({
      name: 'manor-door-1',
      definitionId: 'manor-door',
      look: 'manor-out',
      pos: door,
      hit: { x: door.x - 62, y: door.y - 132, w: 124, h: 160 },
      approach: [{ x: door.x, y: door.y + 38, facing: 'north' }],
    });
    b.portal({
      name: 'manor-gate',
      bounds: { x: door.x - 40, y: door.y + 16, w: 80, h: 44 },
      approach: pt(door.x, door.y + 38),
      toMap: 'manor-hall',
      toSpawn: 'from-forest',
      door: 'manor-door-1',
    });
    b.spawn('from-manor', 'south', [
      pt(door.x, door.y + 110),
      pt(door.x, door.y + 390),
      pt(door.x + 330, door.y + 400),
    ]);
    // Jack-o-lanterns by the path. They are props the game draws, so the map holds only their
    // footprints.
    for (const [n, dx, dy, look] of [
      [1, -190, 70, 'big'],
      [2, 190, 70, 'big'],
      [3, -180, 250, 'mid'],
      [4, 180, 250, 'mid'],
      [5, -80, 110, 'small'],
      [6, 80, 110, 'small'],
    ] as const) {
      const x = x0 + dx,
        y = y0 + dy;
      reserve(x, y, 70);
      b.footprint(`mn-pumpkin-${look}`, x, y);
      const hitTop = look === 'big' ? 100 : look === 'mid' ? 76 : 54;
      b.interactable({
        name: `jack-o-lantern-${n}`,
        definitionId: 'jack-o-lantern',
        look,
        pos: pt(x, y),
        hit: { x: x - 46, y: y - hitTop - 6, w: 92, h: hitTop + 26 },
        approach: [
          look === 'mid'
            ? { x, y: y - footprints['mn-pumpkin-mid']! - 60, facing: 'south' }
            : { x, y: y + footprints[`mn-pumpkin-${look}`]! + 60, facing: 'north' },
        ],
      });
    }
    // Iron lamp posts, a crooked tree and fences.
    for (const dx of [-290, 290]) {
      reserve(x0 + dx, y0 + 55, 60);
      b.solid('mn-lamp-post', x0 + dx, y0 + 55);
    }
    reserve(x0 - 330, y0 + 40, 90);
    b.solid('mn-twisty-tree', x0 - 330, y0 + 40);
    for (const dx of [-330, 330]) {
      reserve(x0 + dx, y0 + 130, 100);
      b.place('mn-fence', x0 + dx, y0 + 130, 'object-bases', 0);
      b.block({ kind: 'rect', x: x0 + dx - 96, y: y0 + 123, w: 192, h: 14 });
    }
    // Dewy cobwebs in the corners of the house, and bats over the roofs.
    b.place('mn-cobweb-l', x0 - 262, y0 - 232, 'foreground', 0);
    b.place('mn-cobweb-r', x0 + 262, y0 - 232, 'foreground', 0);
    for (const [dx, dy] of [
      [-210, -470],
      [40, -540],
      [260, -420],
      [-340, -330],
      [380, -290],
    ] as const)
      b.place('mn-bat', x0 + dx, y0 + dy, 'foreground', 0);
    b.life({
      name: 'wisp-manor',
      kind: 'fairy',
      area: { x: x0 - 300, y: y0 + 20, w: 600, h: 260 },
      shape: 'ellipse',
      count: 2,
    });
  }

  // The wood: trees fill everything the herd cannot walk on, as far as the camera can ever see
  const zoneOf = (x: number, y: number): keyof typeof C => {
    let best: keyof typeof C = 'start',
      bd = Infinity;
    for (const [k, c] of Object.entries(C) as [keyof typeof C, Pt][]) {
      const d = Math.hypot(x - c.x * T, y - c.y * T);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };
  const treesFor = (zone: keyof typeof C): readonly (readonly [string, number])[] => {
    switch (zone) {
      case 'glacier':
        return [
          ['tree-fir-spruce-1', 3],
          ['tree-fir-spruce-2', 3],
          ['tree-fir-spruce-3', 2],
          ['tree-birch-lime-1', 2],
          ['tree-birch-lime-2', 2],
          ['tree-oak-emerald-2', 1],
        ];
      case 'river':
        return [
          ['tree-oak-emerald-1', 3],
          ['tree-oak-emerald-2', 2],
          ['tree-oak-lime-1', 2],
          ['tree-birch-lime-2', 1],
          ['tree-willow-emerald-1', 1],
        ];
      case 'cinder':
        return [
          ['tree-oak-gold-1', 3],
          ['tree-oak-gold-2', 3],
          ['tree-oak-emerald-1', 2],
          ['tree-fir-spruce-2', 1],
        ];
      case 'storm':
        return [
          ['tree-oak-lavender-1', 3],
          ['tree-oak-lavender-2', 3],
          ['tree-fir-spruce-1', 2],
          ['tree-oak-emerald-2', 1],
        ];
      case 'leaf':
        return [
          ['tree-blossom-1', 3],
          ['tree-blossom-2', 3],
          ['tree-oak-lime-1', 3],
          ['tree-oak-lime-2', 2],
          ['tree-oak-emerald-1', 1],
        ];
      case 'exit':
        return [
          ['tree-oak-emerald-1', 3],
          ['tree-oak-emerald-3', 1],
          ['tree-oak-lime-1', 2],
          ['tree-blossom-2', 1],
        ];
      default:
        return [
          ['tree-oak-emerald-1', 3],
          ['tree-oak-emerald-2', 3],
          ['tree-oak-lime-1', 2],
          ['tree-oak-lime-2', 2],
          ['tree-fir-spruce-2', 1],
          ['tree-birch-lime-1', 1],
          ['tree-blossom-2', 1],
        ];
    }
  };
  const W = b.width,
    H = b.height;
  for (let attempt = 0; attempt < 90000; attempt++) {
    const x = -60 + rnd() * (W + 120),
      y = -40 + rnd() * (H + 140);
    const o = b.openness(x, y);
    // Wood proper: not walkable, and within sight of somewhere walkable (the camera sees about 700
    // units).
    if (o > 6 || o < -760) continue;
    const id = weighted(treesFor(zoneOf(x, y)));
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.7 + 10)) continue;
    deco(id, x, y);
  }

  // Trees standing inside open ground near its edge, so the rim looks like a tree line and not a
  // cut.
  let rim = 0;
  for (let attempt = 0; attempt < 6000 && rim < 140; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    const o = b.openness(x, y);
    if (o < 60 || o > 190 || onLane(x, y, 150) || !dry(x, y, 70)) continue;
    const id = weighted(treesFor(zoneOf(x, y)));
    const r = (footprints[id] ?? 24) + 70;
    if (!sc.tryAdd(x, y, r)) continue;
    b.solid(id, x, y);
    rim++;
  }

  // Ground life: flowers, bushes, stones, tufts
  const flowerSets: Record<keyof typeof C, readonly string[]> = {
    start: ['flowers-yellow-1', 'flowers-white-1', 'flowers-pink-2'],
    leaf: ['flowers-pink-1', 'flowers-pink-2', 'flowers-white-2', 'flowers-lilac-1', 'flowers-coral-2'],
    glacier: ['flowers-white-1', 'flowers-sky-1', 'flowers-sky-2', 'flowers-white-2'],
    river: ['flowers-sky-1', 'flowers-sky-2', 'flowers-white-1', 'flowers-lilac-2'],
    cinder: ['flowers-coral-1', 'flowers-yellow-2', 'flowers-coral-2'],
    storm: ['flowers-lilac-1', 'flowers-lilac-2', 'flowers-white-1'],
    exit: ['flowers-pink-1', 'flowers-yellow-1', 'flowers-white-1', 'flowers-lilac-1'],
    grove: ['flowers-white-2', 'flowers-lilac-2', 'flowers-sky-1'],
    south: ['flowers-yellow-2', 'flowers-coral-1', 'flowers-white-1', 'flowers-pink-2'],
  };
  const density: Record<keyof typeof C, number> = {
    start: 10,
    leaf: 26,
    glacier: 9,
    river: 12,
    cinder: 9,
    storm: 8,
    exit: 12,
    grove: 10,
    south: 14,
  };
  for (const [zone, n] of Object.entries(density) as [keyof typeof C, number][]) {
    const c = C[zone];
    for (let k = 0; k < n; k++) {
      // Flowers grow in drifts: pick a spot, then a few clumps around it.
      let cx = 0,
        cy = 0,
        tries = 0;
      do {
        const a = rnd() * Math.PI * 2,
          d = Math.sqrt(rnd()) * 7 * T;
        cx = c.x * T + Math.cos(a) * d;
        cy = c.y * T + Math.sin(a) * d * 0.7;
        tries++;
      } while (tries < 40 && (!inOpen(cx, cy, 80) || !dry(cx, cy, 50) || zoneOf(cx, cy) !== zone));
      if (tries >= 40) continue;
      const count = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) {
        const x = cx + (rnd() - 0.5) * 150,
          y = cy + (rnd() - 0.5) * 90;
        if (!inOpen(x, y, 40) || !dry(x, y, 30)) continue;
        if (!sc.tryAdd(x, y, 26)) continue;
        deco(pick(flowerSets[zone]), x, y);
      }
    }
  }
  // Windflowers across Storm's hill, in broad swaying drifts.
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2,
      d = Math.sqrt(rnd()) * 6.6 * T;
    const x = C.storm.x * T + Math.cos(a) * d,
      y = C.storm.y * T + Math.sin(a) * d * 0.72;
    if (!inOpen(x, y, 70) || onLane(x, y, 20)) continue;
    if (!sc.tryAdd(x, y, 30)) continue;
    deco(`windflower-${pick(['pink', 'lilac', 'coral'])}-${pick([1, 2])}`, x, y);
  }
  // Bushes and stones where there is room, never on a lane.
  const clutter: [string, number][] = [
    ['bush-emerald-1', 3],
    ['bush-emerald-2', 3],
    ['bush-lime-1', 2],
    ['bush-lime-2', 2],
    ['bush-pink-dots', 1],
    ['bush-rose-dots', 1],
    ['rock-grey-1', 1],
    ['rock-grey-2', 1],
    ['rock-moss-1', 1],
    ['rock-moss-2', 1],
  ];
  let bushes = 0;
  for (let attempt = 0; attempt < 5000 && bushes < 110; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    if (!inOpen(x, y, 70) || onLane(x, y, 120) || !dry(x, y, 70)) continue;
    const id = weighted(clutter);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 28) + 52)) continue;
    b.solid(id, x, y);
    bushes++;
  }
  const mush = ['mushrooms-rose', 'mushrooms-sky', 'mushrooms-sand'];
  for (let i = 0, n = 0; i < 2000 && n < 26; i++) {
    const x = rnd() * W,
      y = rnd() * H;
    if (!inOpen(x, y, 40) || !dry(x, y, 40) || !sc.tryAdd(x, y, 40)) continue;
    deco(pick(mush), x, y);
    n++;
  }
  // Ground detail: tufts and pebbles that sit under everything and never block.
  for (let i = 0, n = 0; i < 9000 && n < 520; i++) {
    const x = rnd() * W,
      y = rnd() * H;
    if (!inOpen(x, y, 10) || !dry(x, y, 24)) continue;
    const tuft = rnd() < 0.78;
    if (!sc.tryAdd(x, y, tuft ? 36 : 30, 0.7)) continue;
    deco(tuft ? `tuft-${pick([1, 2, 3])}` : `pebbles-${pick([1, 2])}`, x, y, tuft ? 'object-bases' : 'ground-detail');
    n++;
  }

  // The mouth of the Crystal Cave, in the hill north of Glacier's hollow. It is made after the wood
  // is planted, so every tree that was planted stays where it was, and what stood on its ground is
  // taken away.
  const MOUTH = tp(14, 5.8);
  const mouthCourt = blob(tp(14, 7), 3.6 * T, 1.2 * T, { seed: 91, wobble: 0.05 });
  const mouthWay = lane([tp(14, 8.6), tp(14, 5.4)], 1.1 * T, { seed: 92, wobble: 0.02 });
  b.open(mouthCourt, mouthWay.region);
  b.pathBand(
    blob(tp(14, 7.2), 2.2 * T, 0.8 * T, { seed: 93, wobble: 0.1 }),
    lane(mouthWay.line, 0.7 * T, { seed: 94, wobble: 0.02 }).region,
  );
  b.classify();
  b.clear(union(mouthCourt, mouthWay.region, rect(MOUTH.x - 320, -200, MOUTH.x + 320, MOUTH.y + 30)));
  b.place('rock-cave-mouth', MOUTH.x, MOUTH.y, 'object-bases', 0);
  b.portal({
    name: 'cave-mouth',
    bounds: { x: MOUTH.x - 56, y: MOUTH.y - 50, w: 112, h: 44 },
    approach: pt(MOUTH.x, MOUTH.y + 40),
    toMap: 'crystal-cave',
    toSpawn: 'from-forest',
  });
  b.spawn('from-cave', 'south', [pt(896, 461), pt(1056, 461), pt(1419, 824)]);

  // Where the herd stands, what it can use, and who waits to be found. A spawn is the way the herd
  // came in: Wildstar at its start, the friends along it a gap apart in the order they were found.
  // `tools/maps/herd-line.ts` suggests lines, and the compile step checks that each one holds every
  // herd.
  b.spawn('start', 'east', [pt(858, 2342), pt(858, 1995), pt(858, 1648)]);
  b.spawn('from-garden', 'west', [pt(3405, 2445), pt(3565, 2445), pt(3565, 1931)]);

  b.portal({
    name: 'garden-gate',
    bounds: { x: 4000, y: 2370, w: 90, h: 124 },
    approach: pt(3900, 2432),
    toMap: 'palace-garden',
    toSpawn: 'from-forest',
  });

  const E = (x: number, y: number, facing: Facing) => ({ x, y, facing });
  b.encounter({ unicornId: 'leaf', home: tp(12.8, 26.2), greeting: tp(11.2, 28.2), facing: 'west' });
  b.encounter({ unicornId: 'glacier', home: tp(15.0, 12.2), greeting: tp(13.2, 14.2), facing: 'west' });
  b.encounter({ unicornId: 'river', home: tp(34.2, 12.8), greeting: tp(32.4, 14.4), facing: 'north' });
  b.encounter({ unicornId: 'cinder', home: tp(51.4, 11.6), greeting: tp(49.6, 13.4), facing: 'west' });
  b.encounter({ unicornId: 'storm', home: tp(53.4, 25.2), greeting: tp(51.4, 27.4), facing: 'west' });

  // Crystals wait for Wildstar's light. Their pictures come from their saved state.
  const crystal = (name: string, tx: number, ty: number, from: Facing): void => {
    const x = tx * T,
      y = ty * T;
    b.interactable({
      name,
      definitionId: 'crystal',
      pos: pt(x, y),
      hit: { x: x - 46, y: y - 100, w: 92, h: 120 },
      approach: [E(x + (from === 'east' ? -64 : 64), y + 40, from)],
    });
  };
  crystal('crystal-1', 15.2, 39.6, 'east');
  crystal('crystal-2', 10.0, 40.4, 'west');
  crystal('crystal-3', 27.4, 26.6, 'east');
  crystal('crystal-4', 35.0, 26.8, 'west');

  // Grazing: the tuft sits ahead of the unicorn's muzzle, and the unicorn stands to its side.
  const graze = (name: string, tx: number, ty: number, facing: 'east' | 'west'): void => {
    const x = tx * T,
      y = ty * T;
    const dx = facing === 'east' ? 1 : -1;
    b.anchor({ name, tags: ['graze'], pos: pt(x + dx * 64, y), approach: [E(x, y, facing)] });
    deco(`tuft-${1 + (Math.round(tx * 7 + ty * 3) % 3)}`, x + dx * 66, y + 2);
  };
  graze('graze-start-1', 10.6, 35.2, 'east');
  graze('graze-start-2', 14.8, 36.0, 'west');
  graze('graze-start-3', 9.2, 39.2, 'east');
  graze('graze-leaf-1', 9.4, 26.2, 'east');
  graze('graze-leaf-2', 15.0, 27.6, 'west');
  graze('graze-leaf-3', 11.0, 24.0, 'west');
  graze('graze-glacier-1', 12.0, 13.6, 'east');
  graze('graze-glacier-2', 16.8, 13.2, 'west');
  graze('graze-river-1', 28.0, 14.6, 'east');
  graze('graze-river-2', 36.2, 15.0, 'west');
  graze('graze-cinder-1', 47.6, 12.2, 'east');
  graze('graze-cinder-2', 52.4, 14.8, 'west');
  graze('graze-storm-1', 49.8, 25.0, 'east');
  graze('graze-storm-2', 55.0, 26.4, 'west');
  graze('graze-grove-1', 28.6, 25.2, 'east');
  graze('graze-grove-2', 33.6, 24.8, 'west');
  graze('graze-south-1', 30.4, 38.6, 'east');
  graze('graze-south-2', 36.0, 38.2, 'west');
  graze('graze-exit-1', 55.8, 41.2, 'east');

  // Drinking: stand on a bank facing the water, close enough for the muzzle to reach it.
  const drink = (name: string, center: Pt, side: 1 | -1): void => {
    const stand = shore(center, side, 46);
    b.anchor({
      name,
      tags: ['drink'],
      pos: pt(stand.x - side * 60, stand.y),
      approach: [E(stand.x, stand.y, side === 1 ? 'west' : 'east')],
    });
  };
  drink('drink-pond-west', tp(31, 9.2), -1);
  drink('drink-pond-east', tp(31, 9.2), 1);
  drink('drink-spring-west', tp(14.2, 23.2), -1);
  drink('drink-spring-east', tp(14.2, 23.2), 1);

  // Who lives here. Each is a patch of the map and how many live in it, in tiles around a middle.
  // The game puts them down at random inside it.
  const live = (
    name: string,
    kind: LifeKind,
    cx: number,
    cy: number,
    w: number,
    h: number,
    count: number,
    shape: 'rect' | 'ellipse' = 'rect',
  ): void =>
    b.life({ name, kind, area: { x: (cx - w / 2) * T, y: (cy - h / 2) * T, w: w * T, h: h * T }, shape, count });

  // Birds and rabbits on the grass of the clearings, and snails and ladybirds among the flowers.
  live('bird-start', 'bird', 12, 37.5, 7, 4, 3);
  live('bird-leaf', 'bird', 12.5, 27, 6, 3.5, 2);
  live('bird-glacier', 'bird', 14, 13.5, 6, 3, 2);
  live('bird-river', 'bird', 31, 14, 8, 2.5, 2);
  live('bird-cinder', 'bird', 50, 13.5, 6, 3.5, 2);
  live('bird-storm', 'bird', 52, 26.5, 6, 3.5, 2);
  live('bird-grove', 'bird', 31, 26, 6, 3, 2);
  live('bird-south', 'bird', 33, 39, 6, 3, 2);
  live('bird-exit', 'bird', 57.5, 39.5, 4, 3, 1);
  live('bunny-start', 'bunny', 11, 38, 5, 3, 2);
  live('bunny-leaf', 'bunny', 13, 28, 4, 2.5, 2);
  live('bunny-river', 'bunny', 28, 14.5, 4, 2, 1);
  live('bunny-cinder', 'bunny', 49, 13.5, 4, 3, 1);
  live('bunny-south', 'bunny', 31, 39.5, 4, 2.5, 2);
  live('bunny-grove', 'bunny', 29, 26, 4, 3, 1);
  live('bunny-storm', 'bunny', 54, 27.5, 4, 2.5, 1);
  live('snail-start', 'snail', 14, 36.5, 4, 2, 2);
  live('snail-leaf', 'snail', 10, 27.5, 4, 2, 2);
  live('snail-grove', 'snail', 33.5, 25.5, 4, 2, 1);
  live('snail-river', 'snail', 34.5, 13.5, 4, 2, 1);
  live('snail-glacier', 'snail', 11.5, 14, 3, 2, 1);
  live('ladybug-start', 'ladybug', 10, 39, 4, 2, 3);
  live('ladybug-leaf', 'ladybug', 11, 25.2, 4, 2, 3);
  live('ladybug-south', 'ladybug', 35, 39.2, 4, 2, 2);

  // The ponds: ducks on the top, fish underneath, frogs on the bank and dragonflies over it.
  live('frog-pond', 'frog', 31, 12.3, 7, 1.6, 3);
  live('frog-spring', 'frog', 14.2, 25, 3.6, 1.2, 2);
  live('duck-pond', 'duck', 31, 9.2, 6.4, 2.6, 3, 'ellipse');
  live('duck-spring', 'duck', 14.2, 23.2, 2.2, 1.2, 1, 'ellipse');
  live('fish-pond', 'fish', 31, 9.2, 6, 2.4, 4, 'ellipse');
  live('fish-spring', 'fish', 14.2, 23.2, 2, 1, 1, 'ellipse');
  live('dragonfly-pond', 'dragonfly', 31, 9.2, 8, 3.5, 2);
  live('dragonfly-spring', 'dragonfly', 14.2, 23.2, 4, 2.5, 1);

  // Butterflies, bees and the fairies, who go where they like.
  live('butterfly-start', 'butterfly', 12, 36, 9, 5, 3);
  live('butterfly-leaf', 'butterfly', 12, 26, 9, 5, 3);
  live('butterfly-glacier', 'butterfly', 14, 12, 8, 5, 1);
  live('butterfly-river', 'butterfly', 31, 13, 10, 4, 2);
  live('butterfly-cinder', 'butterfly', 50, 12, 8, 5, 2);
  live('butterfly-storm', 'butterfly', 52, 26, 8, 5, 2);
  live('butterfly-grove', 'butterfly', 31, 25, 7, 5, 2);
  live('butterfly-south', 'butterfly', 33, 38, 8, 4, 2);
  live('butterfly-exit', 'butterfly', 58, 38, 5, 5, 2);
  live('bee-leaf', 'bee', 11, 26, 7, 4, 3);
  live('bee-start', 'bee', 12, 36.5, 7, 3, 2);
  live('bee-south', 'bee', 33, 38.5, 6, 3, 1);
  live('fairy-start', 'fairy', 12, 37, 9, 5, 2);
  live('fairy-leaf', 'fairy', 12, 26, 9, 5, 2);
  live('fairy-glacier', 'fairy', 14, 12.5, 8, 5, 1);
  live('fairy-river', 'fairy', 31, 12, 11, 5, 2);
  live('fairy-cinder', 'fairy', 50, 12, 8, 5, 1);
  live('fairy-storm', 'fairy', 52, 26, 8, 5, 1);
  live('fairy-exit', 'fairy', 58, 38, 5, 5, 1);
  live('fairy-grove', 'fairy', 31, 25, 7, 5, 2);
  live('fairy-south', 'fairy', 33, 38, 8, 4, 1);
  live('fairy-lane-west', 'fairy', 11.5, 31.5, 3, 6, 1);
  live('fairy-lane-north', 'fairy', 22, 10.5, 6, 3, 1);

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('forest');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/forest.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorForest();
  console.log(
    `forest: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the wood mask)`,
  );
}
