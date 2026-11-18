import { mkdirSync, writeFileSync } from 'node:fs';
import type { LifeKind } from '../../../src/shared/life';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, type Pt, pt, rect, Scatter, T, tp } from './geom';
import { Placer } from './placer';

/**
 * The beach, on the island's north shore where the river comes out. A glittering sea fills the
 * north and runs in as a bay in the middle: the herd can wade in it and swim farther out. Along the
 * water lie shells and starfish and clams that have pearls in them. Dig spots hide more shells, a
 * few places are left for building castles, a lighthouse stands on the east dunes, and umbrellas,
 * buckets, driftwood and palms are about. The way back to the river is at the west end. Everything
 * is in world units (one unit is one art pixel); y grows toward the viewer.
 */

/** Where the water stops and the sand starts, as a height from the top of the map, at each x. */
const shoreline = (x: number): number =>
  12.6 * T + 1.4 * T * Math.sin(x / (5 * T)) + 4.2 * T * Math.exp(-(((x - 33 * T) / (6.5 * T)) ** 2));

const SHELL_LOOKS = [
  'scallop-pink',
  'scallop-lilac',
  'turret-cream',
  'turret-gold',
  'conch-pink',
  'conch-cream',
] as const;

export function authorBeach(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'shore').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'beach',
    widthTiles: 64,
    heightTiles: 44,
    tileset: 'beach',
    bundle: 'shore',
    music: 'garden',
    ambience: 'garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(777);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  const RIVER_GATE = pt(170, 1152);
  const LIGHTHOUSE = pt(3640, 1060);

  // The sea fills everything north of the shoreline. The herd may go into it, but not out to the
  // horizon: the last stretch is too deep.
  const sea = (x: number, y: number): number => shoreline(x) - y;
  const swim = (x: number, y: number): number => Math.min(sea(x, y), y - 300);
  const land = rect(64, 300, W - 64, 2620);
  b.open(land);
  b.pond(sea);
  b.sea(swim);

  // The damp sand the sea leaves: a band along the water, and a path from the river gate to it.
  b.pathBand((x, y) => 96 - Math.abs(y - (shoreline(x) + 150)), rect(32, 1090, 640, 1214));
  b.classify();

  const placer = new Placer(b, sc, footprints, (x, y, shore) => b.pondness(x, y) < -shore);

  // The sky, far hills over the sea and clouds
  for (let i = 0; i < 64; i++) b.place('sh-sky-strip', 32 + i * 64, 330, 'backdrop', -3000);
  for (const [id, x, y] of [
    ['sh-cloud-3', 380, 130],
    ['sh-cloud-1', 900, 80],
    ['sh-cloud-5', 1500, 160],
    ['sh-cloud-2', 2080, 100],
    ['sh-cloud-4', 2480, 170],
    ['sh-cloud-3', 2900, 90],
    ['sh-cloud-4', 3400, 150],
    ['sh-cloud-2', 3800, 90],
  ] as const)
    b.place(id, x, y, 'backdrop', -2000);
  for (let i = 0; i < 9; i++) b.place(`sh-hills-far-${i % 3}`, i * 512, 330, 'backdrop', -1000);

  // Keep scenery off the arrival and the gate
  sc.add(RIVER_GATE.x + 140, RIVER_GATE.y, 250);
  sc.add(LIGHTHOUSE.x, LIGHTHOUSE.y, 150);

  // The way back to the river: a gate between two palms at the west edge
  b.place('sh-palm-1', 120, RIVER_GATE.y - 120);
  b.place('sh-palm-3', 120, RIVER_GATE.y + 120);
  for (const dy of [-120, 120]) b.block({ kind: 'circle', x: 120, y: RIVER_GATE.y + dy, r: 18 });
  b.portal({
    name: 'river-gate',
    bounds: { x: 40, y: RIVER_GATE.y - 75, w: 150, h: 150 },
    approach: RIVER_GATE,
    toMap: 'river',
    toSpawn: 'from-beach',
  });
  b.spawn('from-river', 'east', [pt(600, 1152), pt(397, 1355), pt(194, 1558)]);
  for (const [x, y, r] of [
    [500, 1250, 170],
    [330, 1450, 170],
  ] as const)
    sc.add(x, y, r);

  // The lighthouse, with crystal boulders at its foot
  placer.prop({
    name: 'lighthouse-1',
    def: 'lighthouse',
    sprite: 'sh-lighthouse-dark',
    at: LIGHTHOUSE,
    width: 190,
    tall: 460,
    keep: 100,
    approach: [E(LIGHTHOUSE.x, LIGHTHOUSE.y + 150, 'north'), E(LIGHTHOUSE.x - 190, LIGHTHOUSE.y + 90, 'east')],
  });
  b.vista({
    id: 'lighthouse',
    stand: pt(LIGHTHOUSE.x, LIGHTHOUSE.y + 150),
    radius: 420,
    below: 120,
    show: { x: LIGHTHOUSE.x - 160, y: LIGHTHOUSE.y - 470, w: 320, h: 480 },
  });
  for (const [id, dx, dy] of [
    ['sh-boulder-amethyst', -230, -30],
    ['sh-boulder-sapphire', 240, 10],
    ['sh-boulder-diamond', 120, -120],
    ['sh-boulder-emerald', -150, -110],
  ] as const) {
    sc.add(LIGHTHOUSE.x + dx, LIGHTHOUSE.y + dy, 60);
    b.solid(id, LIGHTHOUSE.x + dx, LIGHTHOUSE.y + dy);
  }

  // Places to build a castle, and castles that are built already
  const sites = [
    [11.5, 20.5],
    [13.5, 23.5],
    [19.5, 19],
    [24, 23.5],
    [47, 21],
    [52, 25.5],
  ] as const;
  for (const [i, [tx, ty]] of sites.entries())
    placer.prop({
      name: `castle-site-${i + 1}`,
      def: 'castle-site',
      sprite: 'sh-castle-small',
      at: tp(tx, ty),
      width: 150,
      tall: 130,
      keep: 60,
      loose: true,
    });
  for (const [i, [tx, ty, grand]] of (
    [
      [16.5, 27.5, true],
      [41, 28.5, true],
      [28, 24, false],
      [35, 21.5, false],
      [57, 22, false],
    ] as const
  ).entries())
    placer.prop({
      name: `castle-${i + 1}`,
      def: 'sand-castle',
      look: grand ? 'grand' : 'small',
      sprite: grand ? 'sh-castle-grand' : 'sh-castle-small',
      at: tp(tx, ty),
      width: grand ? 230 : 170,
      tall: grand ? 210 : 150,
      keep: 60,
      loose: true,
    });

  // Digging, clams and shells
  const along = (n: number, y0: (x: number) => number, y1: (x: number) => number, edge = 300) => {
    const out: Pt[] = [];
    for (let attempt = 0; attempt < 4000 && out.length < n; attempt++) {
      const x = edge + rnd() * (W - 2 * edge);
      const y = y0(x) + rnd() * (y1(x) - y0(x));
      if (!placer.roomAt(x, y, 90, 30)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 190)) continue;
      out.push(pt(x, y));
    }
    return out;
  };
  for (const [i, at] of along(
    14,
    (x) => shoreline(x) + 320,
    () => 2150,
    360,
  ).entries())
    placer.prop({
      name: `dig-${i + 1}`,
      def: 'dig-spot',
      sprite: 'sh-mound',
      at,
      width: 100,
      tall: 70,
      keep: 40,
      loose: true,
    });
  for (const [i, at] of along(
    9,
    (x) => shoreline(x) + 60,
    (x) => shoreline(x) + 200,
    360,
  ).entries())
    placer.prop({
      name: `clam-${i + 1}`,
      def: 'clam',
      sprite: 'sh-clam-shut',
      at,
      width: 100,
      tall: 80,
      keep: 40,
      shore: 10,
      loose: true,
    });
  for (const [i, at] of along(
    26,
    (x) => shoreline(x) + 80,
    () => 2250,
    200,
  ).entries())
    placer.prop({
      name: `shell-${i + 1}`,
      def: 'seashell',
      look: SHELL_LOOKS[i % SHELL_LOOKS.length]!,
      sprite: `sh-shell-${SHELL_LOOKS[i % SHELL_LOOKS.length]!}`,
      at,
      width: 70,
      tall: 60,
      keep: 20,
      loose: true,
    });
  placer.open();

  // Umbrellas and buckets, driftwood and starfish: scenery to sit by
  let umbrellas = 0;
  for (let attempt = 0; attempt < 3000 && umbrellas < 7; attempt++) {
    const x = 400 + rnd() * (W - 800),
      y = shoreline(x) + 450 + rnd() * 900;
    if (!placer.roomAt(x, y, 110) || !sc.tryAdd(x, y, 150)) continue;
    b.solid(pick(['sh-umbrella-pink', 'sh-umbrella-teal', 'sh-umbrella-yellow']), x, y);
    b.place(pick(['sh-bucket-pink', 'sh-bucket-teal']), x + (rnd() < 0.5 ? -70 : 70), y + 30);
    umbrellas++;
  }
  let wood = 0;
  for (let attempt = 0; attempt < 3000 && wood < 8; attempt++) {
    const x = 300 + rnd() * (W - 600),
      y = shoreline(x) + 260 + rnd() * 500;
    if (!placer.roomAt(x, y, 70) || !sc.tryAdd(x, y, 100)) continue;
    b.solid(pick(['sh-driftwood-1', 'sh-driftwood-2']), x, y);
    wood++;
  }
  let stars = 0;
  for (let attempt = 0; attempt < 4000 && stars < 22; attempt++) {
    const x = 200 + rnd() * (W - 400),
      y = shoreline(x) + 20 + rnd() * 240;
    if (b.pondness(x, y) > -14 || !sc.tryAdd(x, y, 56)) continue;
    b.place(pick(['sh-starfish-1', 'sh-starfish-2']), x, y);
    stars++;
  }
  // Rocks and pebbles on the sand, and a few tufts of grass in the dunes
  let bits = 0;
  for (let attempt = 0; attempt < 6000 && bits < 120; attempt++) {
    const x = 100 + rnd() * (W - 200),
      y = shoreline(x) + 120 + rnd() * 1500;
    if (b.openness(x, y) < 30 || b.pondness(x, y) > -40 || b.onPath(x, y, 30)) continue;
    if (!sc.tryAdd(x, y, 70)) continue;
    b.place(pick(['sh-pebbles-1', 'sh-pebbles-2', 'sh-tuft-1', 'sh-tuft-2', 'sh-tuft-3', 'sh-rock-grey-1']), x, y);
    bits++;
  }

  // Palms on the dunes at the back and round the edges
  let palms = 0;
  for (let attempt = 0; attempt < 40000 && palms < 120; attempt++) {
    const x = -20 + rnd() * (W + 40),
      y = 2000 + rnd() * (H - 2000 + 30);
    const o = b.openness(x, y);
    if (o > 30) continue;
    if (y < 2400 && o > -20) continue;
    if (!sc.tryAdd(x, y, 62)) continue;
    b.place(pick(['sh-palm-1', 'sh-palm-2', 'sh-palm-3', 'sh-palm-4']), x, y);
    palms++;
  }
  for (let attempt = 0; attempt < 6000 && palms < 150; attempt++) {
    const x = -20 + rnd() * (W + 40),
      y = shoreline(x) + 200 + rnd() * 1900;
    if (b.openness(x, y) < 60 || b.pondness(x, y) > -120 || b.onPath(x, y, 30)) continue;
    if (!placer.roomAt(x, y, 100) || !sc.tryAdd(x, y, 220)) continue;
    b.solid(pick(['sh-palm-1', 'sh-palm-2', 'sh-palm-3', 'sh-palm-4']), x, y);
    palms++;
  }

  // Drinking from the sea
  for (const [i, x] of [900, 1900, 2700, 3200].entries()) {
    let y = shoreline(x) - 30;
    while (b.waterAt(x, y) > 0.2 && y < H) y += 8;
    b.anchor({
      name: `drink-sea-${i + 1}`,
      tags: ['drink'],
      pos: pt(x, y - 60),
      approach: [E(x, y + 20, 'north')],
    });
  }

  // Who lives here: a ranger who walks the sand between the castles, and the keeper of the
  // lighthouse, who comes down to its foot to look out to sea
  for (const [i, [tx, ty]] of (
    [
      [11.5, 22.5],
      [19.5, 21],
      [24, 25.5],
      [47, 23.5],
      [52, 27],
    ] as const
  ).entries()) {
    const at = tp(tx, ty);
    b.anchor({ name: `ranger-${i + 1}`, tags: ['shore'], pos: at, approach: [E(at.x, at.y, 'south')] });
  }
  b.npc('ranger', tp(24, 25.5), 'south');
  b.anchor({
    name: 'keeper-1',
    tags: ['quay'],
    pos: pt(LIGHTHOUSE.x, LIGHTHOUSE.y + 150),
    approach: [E(LIGHTHOUSE.x, LIGHTHOUSE.y + 150, 'north')],
  });
  b.anchor({
    name: 'keeper-2',
    tags: ['quay'],
    pos: pt(LIGHTHOUSE.x - 190, LIGHTHOUSE.y + 90),
    approach: [E(LIGHTHOUSE.x - 190, LIGHTHOUSE.y + 90, 'east')],
  });
  b.npc('skipper', pt(LIGHTHOUSE.x - 100, LIGHTHOUSE.y + 200), 'north');

  // Who lives here: fish in the bay, gulls and butterflies on the sand
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
  live('fish-sea-west', 'fish', 1000, 560, 1500, 300, 5, 'ellipse');
  live('fish-sea-mid', 'fish', 2200, 640, 1500, 340, 5, 'ellipse');
  live('fish-sea-east', 'fish', 3300, 540, 1200, 300, 4, 'ellipse');
  live('dragonfly-shore', 'dragonfly', 2000, 900, 2800, 400, 3);
  live('bird-shore-west', 'bird', 900, 1100, 1400, 300, 3);
  live('bird-shore-east', 'bird', 3000, 1000, 1400, 300, 3);
  live('bird-dunes', 'bird', 2000, 2100, 3000, 300, 3);
  live('butterfly-dunes-west', 'butterfly', 900, 2000, 1400, 500, 3);
  live('butterfly-dunes-east', 'butterfly', 3100, 2000, 1400, 500, 3);
  live('fairy-beach', 'fairy', 2000, 1500, 3200, 700, 2);
  live('bee-dunes', 'bee', 2000, 2050, 3000, 400, 2);

  placer.finish();
  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('beach');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/beach.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorBeach();
  console.log(`beach: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`);
}
