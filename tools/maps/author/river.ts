import { mkdirSync, writeFileSync } from 'node:fs';
import type { LifeKind } from '../../../src/shared/life';
import { hash2 } from '../../art/core/rng';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, stand as E, lane, type Pt, pt, rect, Scatter, T, tp } from './geom';
import { Placer } from './placer';

/**
 * The magic river. It runs from the west, past the palace, to the sea in the east, glittering and
 * shot with violet. The herd comes in from the palace gate on the south bank, where lawns and
 * flowers lie along the water. The river is full of flat stones, near enough to step from one to
 * the next, so every part of it can be crossed. On the far bank stands the Magic Hall, and only
 * Wildstar may go in. Where the river meets the sea a sandy path leads to the beach. Everything is
 * in world units (one unit is one art pixel); y grows toward the viewer.
 */

/** How the river's stones are laid: a ring of them every `ALONG` units, `ACROSS` apart. */
const ALONG = 220;
const ACROSS = 150;
/** Stones this close, centre to centre, are one hop apart. */
const LINK = 270;
/**
 * The ground radius of each stone, as the art draws it. A stone is at least three cells of the
 * 32 unit navigation grid across each way, and a hop is three wide: a foot is 22 wide and needs a
 * cell centre of its own, so anything narrower is a stone that is drawn and cannot be stood on.
 */
const STONE_R = { 1: 76, 2: 70, 3: 86, 4: 74 } as const;
/** How wide a hop is either side of the line from stone to stone. */
const HOP = 54;

interface Stone {
  x: number;
  y: number;
  n: 1 | 2 | 3 | 4;
  /** The place across the river: -2 at the north bank, 2 at the south bank. */
  col: number;
}

export function authorRiver(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'shore').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'river',
    widthTiles: 80,
    heightTiles: 56,
    tileset: 'river',
    bundle: 'shore',
    music: 'garden',
    ambience: 'garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(4242);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  // Fixed points
  const HALL = tp(40, 15.5);
  const GARDEN_GATE = pt(170, 2816);
  const BEACH_GATE = pt(4900, 3040);

  // The shape of the land: the river between a north bank and a south bank, flowing out into a
  // wide mouth in the east, which is the sea.
  const river = lane(
    [tp(-3, 28.5), tp(9, 30.5), tp(22, 27.5), tp(34, 31), tp(46, 28), tp(56, 31), tp(64, 32)],
    4.3 * T,
    {
      wobble: 0.1,
      seed: 7,
    },
  );
  const mouth = blob(tp(71.5, 32), 10.5 * T, 8.4 * T, { wobble: 0.07, seed: 8 });
  // The land starts a little behind the hall's front, so the herd cannot walk where it would be
  // hidden by it.
  const land = rect(96, HALL.y - 60, 5088, 3488);
  b.open(land, river.region, mouth);
  b.pond(river.region);
  b.sea(mouth);

  // Sand paths: from the palace gate to the river, along the south bank to the mouth, and on round
  // its shore to the beach gate. And in front of the hall.
  b.pathBand(
    lane([pt(32, 2816), tp(8, 44), tp(15, 41.5), tp(22, 38.5), tp(30, 37.2)], 1.5 * T, { wobble: 0.04, seed: 21 })
      .region,
    lane([tp(30, 37.2), tp(40, 37.6), tp(50, 38.6), tp(58, 40.8), tp(66, 44.6), tp(72, 47.4), tp(77, 47.5)], 1.5 * T, {
      wobble: 0.04,
      seed: 22,
    }).region,
    rect(HALL.x - 160, HALL.y + 40, HALL.x + 160, HALL.y + 360),
    lane([pt(HALL.x, HALL.y + 330), tp(40, 24.4)], 1.2 * T, { wobble: 0.03, seed: 23 }).region,
  );
  b.classify();

  // The stones. They lie in rings across the river, a little apart, and every two that are near
  // enough are joined by a hop.
  const arc: number[] = [0];
  for (let i = 1; i < river.line.length; i++)
    arc.push(
      arc[i - 1]! + Math.hypot(river.line[i]!.x - river.line[i - 1]!.x, river.line[i]!.y - river.line[i - 1]!.y),
    );
  const along = (s: number): { p: Pt; n: Pt } => {
    let i = 1;
    while (i < arc.length - 1 && arc[i]! < s) i++;
    const a = river.line[i - 1]!,
      c = river.line[i]!;
    const u = (s - arc[i - 1]!) / Math.max(1e-6, arc[i]! - arc[i - 1]!);
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const t = { x: (c.x - a.x) / len, y: (c.y - a.y) / len };
    const n = { x: t.y, y: -t.x };
    return { p: { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u }, n: n.y > 0 ? { x: -n.x, y: -n.y } : n };
  };
  const stones: Stone[] = [];
  let ring = 0;
  for (let s = 420; s < arc[arc.length - 1]!; s += ALONG, ring++) {
    const { p, n } = along(s);
    if (p.x > 55 * T) break;
    for (let col = -3; col <= 3; col++) {
      const off = col * ACROSS + (ring % 2 === 0 ? 0 : ACROSS / 2);
      const x = p.x + n.x * off + (hash2(ring, col, 5) - 0.5) * 30;
      const y = p.y + n.y * off + (hash2(ring, col, 6) - 0.5) * 20;
      if (river.region(x, y) < 20 || mouth(x, y) > -90) continue;
      // A few places are left deep, so the stones are a way and not a floor.
      if (hash2(ring, col, 7) < 0.14) continue;
      stones.push({ x, y, n: (1 + Math.floor(hash2(ring, col, 8) * 4)) as Stone['n'], col });
    }
  }
  const hops: [Stone, Stone][] = [];
  for (let i = 0; i < stones.length; i++)
    for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i]!,
        c = stones[j]!;
      if (Math.hypot(a.x - c.x, a.y - c.y) <= LINK && hash2(i, j, 9) < 0.78) hops.push([a, c]);
    }

  // A stone by a bank is joined to the land, so it can be stepped to from the shore. A stone that no
  // run of hops joins to a bank is left out altogether: it would be drawn and could not be reached.
  const landingFor = (s: Stone, dy: 1 | -1): Pt | null => {
    for (let d = 40; d <= 200; d += 8) if (river.region(s.x, s.y + dy * d) < -70) return pt(s.x, s.y + dy * d);
    return null;
  };
  const bridges: [Stone, Pt][] = [];
  for (const s of stones)
    for (const dy of [-1, 1] as const) {
      const land = landingFor(s, dy);
      if (land) bridges.push([s, land]);
    }
  const linked = new Set<Stone>(bridges.map(([s]) => s));
  for (const s of linked)
    for (const [a, c] of hops) {
      const o = a === s ? c : c === s ? a : undefined;
      if (o && !linked.has(o)) linked.add(o);
    }
  stones.splice(0, stones.length, ...stones.filter((s) => linked.has(s)));
  hops.splice(0, hops.length, ...hops.filter(([a, c]) => linked.has(a) && linked.has(c)));
  // One bridge to each bank per stone is enough, and the nearest of them is kept
  const landed = new Set<string>();
  const landings: [Pt, Pt][] = [];
  for (const [s, land] of bridges.sort((p, q) => Math.abs(p[1].y - p[0].y) - Math.abs(q[1].y - q[0].y))) {
    const key = `${s.x},${s.y},${land.y > s.y ? 1 : -1}`;
    if (landed.has(key) || !linked.has(s)) continue;
    landed.add(key);
    landings.push([s, land]);
  }
  for (const s of stones) {
    const r = STONE_R[s.n];
    b.stone(s.x, s.y, r * 0.95, r * 0.7);
  }
  for (const [a, c] of hops) b.hop(a, c, HOP);
  for (const [a, land] of landings) b.hop(a, land, HOP);
  b.classify();

  // The river must be crossable: some stone that touches the south bank reaches one that touches
  // the north bank, by hops.
  {
    const touches = (s: Stone, dy: 1 | -1): boolean => river.region(s.x, s.y + dy * 80) < 0;
    const reach = new Set<Stone>(stones.filter((s) => touches(s, 1)));
    const queue = [...reach];
    for (const s of queue)
      for (const [a, c] of hops) {
        const o = a === s ? c : c === s ? a : undefined;
        if (o && !reach.has(o)) {
          reach.add(o);
          queue.push(o);
        }
      }
    if (!stones.some((s) => touches(s, -1) && reach.has(s)))
      throw new Error('river: no run of stones goes from the south bank to the north bank');
  }

  const placer = new Placer(b, sc, footprints, (x, y, shore) => b.pondness(x, y) < -shore);

  // The sky, behind everything: sky, clouds, far hills, near hills
  for (let i = 0; i < 80; i++) b.place('sh-sky-strip', 32 + i * 64, 560, 'backdrop', -3000);
  for (const [id, x, y] of [
    ['sh-cloud-3', 380, 240],
    ['sh-cloud-1', 900, 160],
    ['sh-cloud-5', 1500, 270],
    ['sh-cloud-2', 2080, 190],
    ['sh-cloud-4', 2480, 300],
    ['sh-cloud-3', 2900, 150],
    ['sh-cloud-4', 160, 380],
    ['sh-cloud-2', 1260, 90],
    ['sh-cloud-1', 3300, 220],
    ['sh-cloud-5', 3700, 110],
    ['sh-cloud-3', 4100, 300],
    ['sh-cloud-2', 4500, 180],
    ['sh-cloud-4', 4900, 280],
  ] as const)
    b.place(id, x, y, 'backdrop', -2000);
  for (let i = 0; i < 10; i++) {
    b.place(`sh-hills-far-${i % 3}`, 256 + i * 512 - 256, 560, 'backdrop', -1000);
    b.place(`sh-hills-near-${(i + 1) % 3}`, 256 + i * 512 - 120, 620, 'backdrop', -900);
  }

  // Keep scenery off the arrival, the gates and the hall's plaza
  for (const [x, y, r] of [
    [GARDEN_GATE.x + 140, GARDEN_GATE.y, 260],
    [BEACH_GATE.x, BEACH_GATE.y, 260],
    [HALL.x, HALL.y + 140, 420],
  ] as const)
    sc.add(x, y, r);

  // The stones themselves
  for (const s of stones) {
    sc.add(s.x, s.y, 40);
    b.place(`sh-stone-${s.n}`, s.x, s.y);
  }
  const onWayOfStones = (x: number, y: number, margin: number): boolean =>
    stones.some((s) => Math.hypot(s.x - x, s.y - y) < margin) ||
    [...hops, ...landings].some(([a, c]) => {
      const ex = c.x - a.x,
        ey = c.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey)));
      return Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t)) < margin;
    });

  // Crystal boulders standing in the deep places, and lilies on the water between the stones
  let boulders = 0;
  for (let attempt = 0; attempt < 4000 && boulders < 14; attempt++) {
    const x = 500 + rnd() * (55 * T - 500),
      y = 1300 + rnd() * 800;
    if (river.region(x, y) < 70 || onWayOfStones(x, y, 110)) continue;
    const id = pick(['sh-boulder-amethyst', 'sh-boulder-sapphire', 'sh-boulder-diamond', 'sh-boulder-emerald']);
    if (!sc.tryAdd(x, y, 70)) continue;
    b.solid(id, x, y);
    boulders++;
  }
  let lilies = 0;
  for (let attempt = 0; attempt < 6000 && lilies < 70; attempt++) {
    const x = 160 + rnd() * (60 * T),
      y = 1300 + rnd() * 900;
    if (river.region(x, y) < 40 || onWayOfStones(x, y, 80) || mouth(x, y) > -40) continue;
    if (!sc.tryAdd(x, y, 52)) continue;
    b.place(pick(['sh-lily-1', 'sh-lily-2']), x, y, 'ground-detail');
    lilies++;
  }

  // The Magic Hall
  b.place('sh-hall', HALL.x, HALL.y, 'object-bases', 0);
  b.block({ kind: 'rect', x: HALL.x - 345, y: HALL.y - 70, w: 690, h: 114 });
  b.interactable({
    name: 'hall-door',
    definitionId: 'hall-door',
    pos: pt(HALL.x, HALL.y + 20),
    hit: { x: HALL.x - 70, y: HALL.y - 160, w: 140, h: 190 },
    approach: [E(HALL.x, HALL.y + 100, 'north')],
  });
  b.portal({
    name: 'hall-gate',
    bounds: { x: HALL.x - 50, y: HALL.y + 56, w: 100, h: 30 },
    approach: pt(HALL.x, HALL.y + 100),
    toMap: 'magic-hall',
    toSpawn: 'from-river',
    door: 'hall-door',
  });
  b.vista({
    id: 'hall',
    stand: pt(HALL.x, HALL.y + 280),
    radius: 520,
    below: 150,
    show: { x: HALL.x - 400, y: HALL.y - 600, w: 800, h: 640 },
  });

  // Plants round the hall, that throw glitter when they are touched
  const bush = (n: 1 | 2 | 3) => ({ sprite: `sh-gl-bush-${n}`, look: `bush-${n}`, def: 'glitter-plant' });
  const flower = (n: 1 | 2 | 3) => ({ sprite: `sh-gl-flowers-${n}`, look: `flowers-${n}`, def: 'glitter-plant' });
  let planted = 0;
  const plant = (kind: ReturnType<typeof bush>, at: Pt, o: { r?: number; loose?: boolean } = {}): void => {
    planted++;
    placer.prop({
      name: `glitter-${planted}`,
      def: kind.def,
      look: kind.look,
      sprite: kind.sprite,
      at,
      width: 100,
      tall: 80,
      keep: 22,
      ...o,
    });
  };
  const n3 = (i: number): 1 | 2 | 3 => ((Math.abs(i) % 3) + 1) as 1 | 2 | 3;
  for (const side of [-1, 1]) {
    for (const [i, dx] of [430, 560, 700, 860, 1030, 1220, 1430, 1650, 1900].entries()) {
      plant(bush(n3(i + (side > 0 ? 1 : 0))), pt(HALL.x + side * dx, HALL.y + 90 + (i % 2) * 110), { loose: true });
      plant(flower(n3(i + 2)), pt(HALL.x + side * (dx + 70), HALL.y + 250 + (i % 3) * 70), { r: 18, loose: true });
    }
    for (const [dx, dy] of [
      [300, 220],
      [380, 340],
      [640, 360],
      [980, 330],
    ] as const)
      plant(flower(n3(dx)), pt(HALL.x + side * dx, HALL.y + dy), { r: 18, loose: true });
    for (const [name, dx, dy] of [
      ['near', 470, 210],
      ['far', 1500, 200],
    ] as const)
      placer.prop({
        name: `glitter-tree-${name}-${side < 0 ? 'west' : 'east'}`,
        def: 'glitter-tree',
        sprite: 'sh-gl-tree',
        at: pt(HALL.x + side * dx, HALL.y + dy),
        width: 150,
        tall: 260,
        keep: 60,
        loose: true,
      });
  }
  placer.open();

  // The palace gate and the beach gate. Each stands between two palms.
  b.place('sh-palm-2', 120, GARDEN_GATE.y - 120);
  b.place('sh-palm-4', 120, GARDEN_GATE.y + 120);
  for (const dy of [-120, 120]) b.block({ kind: 'circle', x: 120, y: GARDEN_GATE.y + dy, r: 18 });
  b.portal({
    name: 'garden-gate',
    bounds: { x: 40, y: GARDEN_GATE.y - 75, w: 150, h: 150 },
    approach: GARDEN_GATE,
    toMap: 'palace-garden',
    toSpawn: 'from-river',
  });
  b.place('sh-palm-1', 5010, BEACH_GATE.y - 120);
  b.place('sh-palm-3', 5010, BEACH_GATE.y + 120);
  for (const dy of [-120, 120]) b.block({ kind: 'circle', x: 5010, y: BEACH_GATE.y + dy, r: 18 });
  b.portal({
    name: 'beach-gate',
    bounds: { x: 4950, y: BEACH_GATE.y - 70, w: 120, h: 140 },
    approach: BEACH_GATE,
    toMap: 'beach',
    toSpawn: 'from-river',
  });

  // Where the herd arrives
  b.spawn('from-garden', 'east', [pt(700, 2816), pt(280, 2816), pt(280, 3240)]);
  b.spawn('from-beach', 'west', [pt(4460, 3040), pt(4800, 3040), pt(4800, 3300)]);
  b.spawn('from-magic-hall', 'south', [
    pt(HALL.x, HALL.y + 230),
    pt(HALL.x - 203, HALL.y + 433),
    pt(HALL.x - 406, HALL.y + 636),
  ]);

  // Drinking at the river, and grazing on the lawns
  const shoreFrom = (x: number, y: number, dir: 1 | -1): Pt => {
    let yy = y;
    while (b.waterAt(x, yy) < 0.2 && yy > 200 && yy < H - 200) yy += dir * 8;
    return pt(x, yy - dir * 52);
  };
  for (const [i, x] of [700, 1560, 3160, 3700].entries()) {
    const s = shoreFrom(x, 3000, -1);
    b.anchor({
      name: `drink-south-${i + 1}`,
      tags: ['drink'],
      pos: pt(s.x, s.y - 60),
      approach: [E(s.x, s.y, 'north')],
    });
  }
  for (const [i, x] of [900, 1900, 3300].entries()) {
    const s = shoreFrom(x, HALL.y + 400, 1);
    b.anchor({
      name: `drink-north-${i + 1}`,
      tags: ['drink'],
      pos: pt(s.x, s.y + 60),
      approach: [E(s.x, s.y, 'south')],
    });
  }
  const graze = (name: string, x: number, y: number, facing: 'east' | 'west'): void => {
    const dx = facing === 'east' ? 1 : -1;
    sc.add(x + dx * 40, y, 70);
    b.anchor({ name, tags: ['graze'], pos: pt(x + dx * 64, y), approach: [E(x, y, facing)] });
    b.place(`sh-tuft-${1 + (Math.round(x * 7 + y * 3) % 3)}`, x + dx * 66, y + 2);
  };
  graze('graze-1', 640, 2560, 'east');
  graze('graze-2', 1700, 2900, 'west');
  graze('graze-3', 2600, 2700, 'east');
  graze('graze-4', 3500, 2800, 'west');
  graze('graze-5', 760, 3200, 'east');
  graze('graze-6', 3900, 3100, 'west');

  // Flowers and bushes on the south lawn, that glitter too
  for (let attempt = 0; attempt < 4000 && planted < 100; attempt++) {
    const x = 300 + rnd() * (62 * T),
      y = 2300 + rnd() * 1100;
    if (b.openness(x, y) < 80 || b.pondness(x, y) > -70 || b.onPath(x, y, 70)) continue;
    const kind = rnd() < 0.55 ? flower(n3(Math.floor(rnd() * 3))) : bush(n3(Math.floor(rnd() * 3)));
    const r = footprints[kind.sprite] ?? 18;
    if (!placer.roomAt(x, y, r + 50) || !sc.tryAdd(x, y, 80)) continue;
    plant(kind, pt(x, y), { r });
  }
  placer.open();

  // Scenery: trees all round the edge and behind, reeds and pebbles along the shore, tufts on the lawn
  const TREES = ['sh-tree-blossom-1', 'sh-tree-oak-lime-1', 'sh-tree-oak-lime-2', 'sh-tree-oak-emerald-1'] as const;
  let trees = 0;
  for (let attempt = 0; attempt < 40000 && trees < 330; attempt++) {
    const x = -40 + rnd() * (W + 80),
      y = 360 + rnd() * (H - 360 + 40);
    if (b.openness(x, y) > -90) continue;
    // The hall's backdrop stays clear, and the lower edge keeps its trees off the herd.
    if (y < HALL.y - 20 && Math.abs(x - HALL.x) < 420) continue;
    if (y > H - 130 && x > 160 && x < W - 160) continue;
    if (mouth(x, y) > -200) continue;
    const id = pick(TREES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.6 + 14)) continue;
    b.place(id, x, y);
    trees++;
  }
  let reeds = 0;
  for (let attempt = 0; attempt < 9000 && reeds < 90; attempt++) {
    const x = 120 + rnd() * (W - 240),
      y = 1250 + rnd() * 900;
    const d = river.region(x, y);
    if (d > 8 || d < -34 || onWayOfStones(x, y, 70) || mouth(x, y) > -30) continue;
    if (!sc.tryAdd(x, y, 66)) continue;
    b.place(pick(['sh-reeds-1', 'sh-reeds-2', 'sh-pebbles-1', 'sh-reeds-1']), x, y);
    reeds++;
  }
  let tufts = 0;
  for (let attempt = 0; attempt < 8000 && tufts < 260; attempt++) {
    const x = 120 + rnd() * (W - 240),
      y = HALL.y - 20 + rnd() * (H - HALL.y);
    if (b.openness(x, y) < 20 || b.pondness(x, y) > -50 || b.onPath(x, y, 30)) continue;
    if (!sc.tryAdd(x, y, 70)) continue;
    b.place(
      pick(['sh-tuft-1', 'sh-tuft-2', 'sh-tuft-3', 'sh-flowers-pink-1', 'sh-flowers-white-1', 'sh-flowers-sky-1']),
      x,
      y,
    );
    tufts++;
  }

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
  // The river itself is stones from bank to bank, so the fish and the ducks keep to the open water
  // where it comes out into the sea.
  live('fish-river-mouth', 'fish', 4500, 1950, 800, 260, 3, 'ellipse');
  live('duck-river-mouth', 'duck', 4500, 2250, 700, 240, 2, 'ellipse');
  live('dragonfly-river-west', 'dragonfly', 1200, 1800, 1600, 600, 3);
  live('dragonfly-river-east', 'dragonfly', 3500, 1950, 1600, 600, 3);
  live('fairy-river', 'fairy', 2400, 1900, 3000, 700, 2);
  live('fairy-hall', 'fairy', HALL.x, HALL.y + 200, 1800, 400, 2);
  live('butterfly-hall-west', 'butterfly', HALL.x - 900, HALL.y + 240, 1000, 400, 3);
  live('butterfly-hall-east', 'butterfly', HALL.x + 900, HALL.y + 240, 1000, 400, 3);
  live('bird-hall', 'bird', HALL.x, HALL.y + 260, 1700, 300, 3);
  live('bird-lawn-west', 'bird', 900, 2800, 700, 200, 2);
  live('bird-lawn-east', 'bird', 3100, 2900, 700, 200, 2);
  live('bunny-lawn-west', 'bunny', 800, 3000, 600, 240, 2);
  live('bunny-lawn-east', 'bunny', 3300, 3100, 600, 240, 2);
  live('butterfly-lawn', 'butterfly', 2000, 2900, 2200, 600, 4);
  live('bee-lawn', 'bee', 2200, 3000, 2400, 600, 3);
  live('ladybug-lawn', 'ladybug', 1500, 3000, 500, 160, 2);
  live('snail-lawn', 'snail', 2700, 3200, 500, 160, 1);
  live('fish-mouth', 'fish', 4600, 2050, 900, 450, 5, 'ellipse');
  live('bird-mouth', 'bird', 4500, 2650, 900, 200, 3);

  placer.finish();
  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('river');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/river.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorRiver();
  console.log(`river: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`);
}
