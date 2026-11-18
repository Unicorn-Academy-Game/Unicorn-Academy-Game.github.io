import { mkdirSync, writeFileSync } from 'node:fs';
import { POOL } from '../../../src/content/cave';
import { GEM_IDS, type GemId } from '../../../src/content/produce';
import { clusterOf } from '../../../src/content/props';
import type { Facing } from '../../../src/shared/ids';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, stand as E, hitBox as hit, lane, type Pt, pt, type Region, Scatter, T, tp, union } from './geom';

/**
 * How far above the foot of its dais the tip of the Heart Crystal is drawn, in world units, and a
 * little air over it.
 */
const HEART_TIP = 232 + 24;
/**
 * How far under the leader's feet the Heart Hall's camera keeps in view, so that she stands clear
 * of the bubble for the way out, which hangs over the bottom of a phone.
 */
const LEADER_ROOM = 120;

/**
 * The Crystal Cave, under the hill north of Glacier's hollow. A short way in from the mouth is the
 * Heart Hall, with the Heart Crystal on its dais and pillars that wait for the storm. West of it is
 * the pool room, with a glowing pool and the witch's beds. East is the witch's yard, with her hut,
 * her cauldron and a crystal ball, and north is the Gem Grotto, where every kind of gem grows in
 * clusters to gather. Nothing is dark and nothing is sharp: the rock is violet and everything that
 * grows in it shines. All numbers are tiles unless named otherwise.
 */
export function authorCrystalCave(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'cave').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'crystal-cave',
    widthTiles: 52,
    heightTiles: 42,
    tileset: 'crystal-cave',
    bundle: 'cave',
    music: 'quiet',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const sc = new Scatter(2027);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;

  // The shape of the cave
  const HEART = tp(26, 28.4);
  const POOL_MIDDLE = tp(8.4, 25.5);
  const HUT = tp(43.8, 23.2);

  const antechamber = blob(tp(26, 38.2), 5.8 * T, 3.8 * T, { seed: 101, wobble: 0.08 });
  const hall = union(
    blob(tp(26, 28.8), 11.8 * T, 7.6 * T, { seed: 102, wobble: 0.1 }),
    blob(tp(18.6, 31), 6.8 * T, 5.2 * T, { seed: 106, wobble: 0.1 }),
    blob(tp(33.4, 30.6), 6.8 * T, 5.4 * T, { seed: 107, wobble: 0.1 }),
  );
  const grotto = union(
    blob(tp(26, 10.6), 14 * T, 6.4 * T, { seed: 103, wobble: 0.09 }),
    blob(tp(18, 11), 8 * T, 6 * T, { seed: 108, wobble: 0.1 }),
    blob(tp(34.4, 10.6), 8 * T, 6 * T, { seed: 109, wobble: 0.1 }),
  );
  const poolRoom = union(
    blob(tp(8.2, 26.2), 7 * T, 7.8 * T, { seed: 104, wobble: 0.1 }),
    blob(tp(11.6, 30.4), 5 * T, 4 * T, { seed: 114, wobble: 0.1 }),
  );
  const yard = blob(tp(43.8, 24.6), 7.2 * T, 7.8 * T, { seed: 105, wobble: 0.09 });
  const rooms: Region[] = [antechamber, hall, grotto, poolRoom, yard];
  const passages = [
    lane([tp(26, 36.6), tp(26, 33)], 3 * T, { seed: 110, wobble: 0.03 }),
    lane([tp(26, 23.6), tp(26.3, 19.5), tp(26, 15.4)], 2.4 * T, { seed: 111, wobble: 0.05 }),
  ];
  b.open(...rooms, ...passages.map((p) => p.region));

  // The rock stands wherever the herd cannot go, and its foot is the edge of the floor.
  b.pathBand((x, y) => 8 - b.openness(x, y));
  const pool = blob(POOL_MIDDLE, POOL.rx, POOL.ry, { seed: 120, wobble: 0.05 });
  b.pond(pool);
  b.classify();

  // Helpers
  const dry = (x: number, y: number, margin = 70): boolean => b.pondness(x, y) < -margin;
  const nearPassage = (x: number, y: number, slack: number): boolean => passages.some((p) => p.region(x, y) > -slack);
  /** Keeps scenery off a spot, for something the map draws itself or the game does. */
  const reserve = (p: Pt, r: number): void => sc.add(p.x, p.y, r);

  const problems: string[] = [];
  /** True when open ground, and no water, lies `need` units from the point in every direction. */
  const hasRoom = (x: number, y: number, need: number): boolean =>
    Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2).every(
      (a) =>
        b.openness(x + Math.cos(a) * need, y + Math.sin(a) * need) > 0 &&
        b.pondness(x + Math.cos(a) * need, y + Math.sin(a) * need) < 0,
    );
  /**
   * The nearest spot to `p` with room all round for `need` units, so a thing set down roughly lands
   * where it has room.
   */
  const snap = (p: Pt, need: number): Pt => {
    if (hasRoom(p.x, p.y, need)) return p;
    for (let d = 16; d <= 480; d += 16) {
      const around = Array.from(
        { length: 24 },
        (_, k): Pt => ({
          x: p.x + Math.cos((k / 24) * Math.PI * 2) * d,
          y: p.y + Math.sin((k / 24) * Math.PI * 2) * d,
        }),
      ).filter((q) => hasRoom(q.x, q.y, need));
      if (around.length > 0)
        return around.reduce((a, q) =>
          Math.hypot(q.x - HEART.x, q.y - HEART.y) < Math.hypot(a.x - HEART.x, a.y - HEART.y) ? q : a,
        );
    }
    throw new Error(`crystal-cave: nowhere near (${Math.round(p.x)}, ${Math.round(p.y)}) has ${need} units of room`);
  };
  /**
   * Two places to stand by a prop, the nearest that have room all round, south first when two are
   * as near. A tall prop is seen whole from a short way off, and a phone held sideways shows little
   * above her feet.
   */
  const standsBy = (at: Pt, r: number): { x: number; y: number; facing: Facing }[] =>
    (
      [
        [0, 1],
        [-0.8, 0.6],
        [0.8, 0.6],
        [-1, 0.3],
        [1, 0.3],
      ] as const
    )
      .flatMap(([dx, dy]) => {
        const away = [56, 76, 100, 130]
          .map((m) => r + m)
          .find((m) => b.clearanceAt(at.x + dx * m, at.y + dy * m) >= 40);
        return away === undefined ? [] : [{ dx, dy, away }];
      })
      .sort((p, q) => p.away - q.away)
      .slice(0, 2)
      .map(({ dx, dy, away }) => E(at.x + dx * away, at.y + dy * away, 'north'));
  type PropSpec = {
    name: string;
    def: string;
    sprite: string;
    at: Pt;
    width: number;
    tall: number;
    look?: string;
    approach?: readonly { x: number; y: number; facing: Facing }[];
    keep?: number;
    loose?: boolean;
  };
  const pending: (PropSpec & { r: number })[] = [];
  /**
   * A prop the game draws: it keeps its footprint and keeps scenery away, and the map holds no
   * picture of it. With `loose`, it is moved to the nearest place that has room.
   */
  const prop = (o: PropSpec): void => {
    const r = footprints[o.sprite]!;
    if (o.loose) o = { ...o, at: snap(o.at, r + 50) };
    if (!hasRoom(o.at.x, o.at.y, r + 50))
      problems.push(`${o.name} stands too close to the rock or the water, with ${r + 50} units wanted all round`);
    reserve(o.at, r + (o.keep ?? 50));
    b.footprint(o.sprite, o.at.x, o.at.y);
    pending.push({ ...o, r });
  };
  /**
   * Opens every prop to the herd once all of them stand, so each place to stand is found with every
   * footprint in view.
   */
  const openProps = (): void => {
    for (const o of pending) {
      const approach = o.approach ?? standsBy(o.at, o.r);
      if (approach.length === 0) problems.push(`${o.name} has no room to stand beside it`);
      b.interactable({
        name: o.name,
        definitionId: o.def,
        ...(o.look ? { look: o.look } : {}),
        pos: o.at,
        hit: hit(o.at.x, o.at.y, o.width, o.tall + 20, o.tall),
        approach,
      });
    }
  };

  // The Heart Hall
  const HEART_STAND = pt(HEART.x, HEART.y + 124);
  prop({
    name: 'heart-1',
    def: 'heart-crystal',
    sprite: 'cc-heart-dais',
    at: HEART,
    width: 230,
    tall: 330,
    keep: 120,
    approach: [
      E(HEART_STAND.x, HEART_STAND.y, 'north'),
      E(HEART.x - 150, HEART.y + 70, 'north'),
      E(HEART.x + 150, HEART.y + 70, 'north'),
    ],
  });
  // The crystal rises higher over her feet than a phone held sideways shows. While the herd is in
  // the hall the camera pulls back and up, only as far as it takes to show all of it, and keeps
  // room under her feet so the bubble for the way out does not sit on her.
  b.vista({
    id: 'heart-hall',
    stand: HEART_STAND,
    radius: 440,
    below: LEADER_ROOM,
    show: { x: HEART.x - 130, y: HEART.y - HEART_TIP, w: 260, h: HEART_TIP + 20 },
  });
  for (const [n, tx, ty] of [
    [1, 19, 27],
    [2, 33, 27],
    [3, 21.4, 33.2],
    [4, 30.6, 33.2],
  ] as const)
    prop({ name: `pillar-${n}`, def: 'storm-pillar', sprite: 'cc-pillar-rock', at: tp(tx, ty), width: 100, tall: 280 });
  for (const [n, tx, ty] of [
    [1, 22.4, 36.5],
    [2, 29.6, 36.5],
  ] as const)
    prop({
      name: `chimes-${n}`,
      def: 'cave-chimes',
      sprite: 'cc-chimes',
      at: tp(tx, ty),
      width: 230,
      tall: 200,
      loose: true,
    });
  const sleepers: [number, number][] = [
    [17.4, 23.4],
    [34.6, 23.4],
    [14.8, 31],
    [37.2, 31.4],
    [21, 22.4],
    [31, 22.4],
    [14.4, 13.8],
    [37.6, 13.8],
    [8.6, 32.2],
    [13.4, 19.8],
    [49.2, 19.8],
    [38.4, 19.4],
  ];
  sleepers.forEach(([tx, ty], i) => {
    prop({
      name: `sleepers-${i + 1}`,
      def: 'sleeping-crystals',
      sprite: 'cc-sleep-1',
      at: tp(tx, ty),
      width: 90,
      tall: 110,
      keep: 40,
      loose: true,
    });
  });

  // The pool room. The pool's point is on its south shore, so a spell cast at it can see it. The
  // ice is drawn up from there to the middle.
  const POOL_POINT = pt(POOL_MIDDLE.x, POOL_MIDDLE.y + POOL.pointRise);
  reserve(POOL_MIDDLE, POOL.rx + 70);
  b.interactable({
    name: 'pool-1',
    definitionId: 'glow-pool',
    pos: POOL_POINT,
    hit: hit(POOL_MIDDLE.x, POOL_MIDDLE.y + POOL.ry, POOL.rx * 2, POOL.ry * 2, POOL.ry * 2),
    approach: [E(POOL_MIDDLE.x, POOL_MIDDLE.y + POOL.ry + 90, 'north')],
  });

  // The beds: four of leaves and flowers in the pool room, and two by the hut
  const bed = (n: number, look: 'long' | 'round', tx: number, ty: number): void =>
    prop({
      name: `bed-${n}`,
      def: 'cave-bed',
      look,
      sprite: `cc-bed-leafy-${look}`,
      at: tp(tx, ty),
      width: look === 'long' ? 200 : 150,
      tall: 130,
      loose: true,
    });
  bed(1, 'long', 5.8, 20.6);
  bed(2, 'round', 11.4, 20.9);
  bed(3, 'long', 5.6, 31.2);
  bed(4, 'round', 11.6, 31.4);
  bed(5, 'long', 39.4, 29.8);
  bed(6, 'round', 48.4, 29.6);

  // The witch's yard
  reserve(pt(HUT.x, HUT.y - 60), 260);
  reserve(pt(HUT.x, HUT.y + 80), 120);
  b.place('cc-hut', HUT.x, HUT.y, 'object-bases', 0);
  b.block({ kind: 'rect', x: HUT.x - 112, y: HUT.y - 72, w: 224, h: 72 });
  b.place('cc-smoke', HUT.x, HUT.y, 'foreground', 0);
  b.interactable({
    name: 'hut-door-1',
    definitionId: 'hut-door',
    pos: HUT,
    hit: { x: HUT.x - 58, y: HUT.y - 150, w: 116, h: 176 },
    approach: [E(HUT.x, HUT.y + 62, 'north')],
  });
  prop({ name: 'cauldron-1', def: 'witch-cauldron', sprite: 'cc-cauldron', at: tp(40.2, 24.8), width: 120, tall: 130 });
  b.solid('cc-jars', 47.8 * T, 24.6 * T);
  reserve(tp(47.8, 24.6), 110);
  prop({ name: 'orb-1', def: 'crystal-ball', sprite: 'cc-orb-stand', at: tp(43.8, 28.4), width: 100, tall: 200 });
  b.place('cc-broom', 46.4 * T, 23.3 * T, 'object-bases', 0);
  for (const [tx, ty] of [
    [40, 21.8],
    [47.8, 21.2],
    [45.4, 26.2],
  ] as const)
    b.place('cc-wisp', tx * T, ty * T, 'foreground', 0);

  // The Gem Grotto: rows of clusters, two of every gem, with one rainbow cluster in the middle at
  // the back and one at the side
  const GROTTO_ROWS: readonly (readonly [number, readonly (readonly [GemId, number])[]])[] = [
    [5.6, [['rainbow', 26]]],
    [
      7.2,
      [
        ['ruby', 14.2],
        ['topaz', 17.4],
        ['emerald', 20.6],
        ['jade', 23.8],
        ['sapphire', 27],
        ['amethyst', 30.2],
        ['diamond', 33.4],
        ['opal', 36.6],
      ],
    ],
    [
      10.2,
      [
        ['onyx', 15.8],
        ['ruby', 19],
        ['topaz', 22.2],
        ['emerald', 25.4],
        ['jade', 28.6],
        ['sapphire', 31.8],
        ['amethyst', 35],
      ],
    ],
    [
      13,
      [
        ['diamond', 15],
        ['opal', 18.2],
        ['onyx', 33.8],
        ['rainbow', 37],
      ],
    ],
  ];
  const counts = new Map<GemId, number>();
  for (const [ty, row] of GROTTO_ROWS) {
    for (const [gem, tx] of row) {
      const n = (counts.get(gem) ?? 0) + 1;
      counts.set(gem, n);
      prop({
        name: `${gem}-cluster-${n}`,
        def: clusterOf(gem),
        sprite: gem === 'rainbow' ? 'cc-rainbow-1' : `cc-${gem}-1`,
        at: tp(tx, ty),
        width: 120,
        tall: 120,
        keep: 36,
      });
    }
  }
  if (GEM_IDS.some((gem) => counts.get(gem) !== 2)) throw new Error('every gem grows in exactly two clusters');

  openProps();

  // The way out
  const EXIT = tp(26, 41.4);
  b.portal({
    name: 'forest-gate',
    bounds: { x: EXIT.x - 120, y: EXIT.y - 20, w: 240, h: 76 },
    approach: pt(EXIT.x, EXIT.y - 70),
    toMap: 'forest',
    toSpawn: 'from-cave',
  });
  // The hut: its door takes the herd inside, and brings her out in front of it
  b.portal({
    name: 'hut-gate',
    bounds: { x: HUT.x - 52, y: HUT.y + 28, w: 104, h: 56 },
    approach: pt(HUT.x, HUT.y + 62),
    toMap: 'witch-hut',
    toSpawn: 'from-cave',
    door: 'hut-door-1',
  });
  b.spawn('from-hut', 'south', [pt(2819, 1593), pt(2649, 1763), pt(2649, 1329)]);
  b.spawn('from-forest', 'north', [pt(1664, 2317), pt(1834, 2487), pt(1400, 2487)]);

  // Who drinks at the pool
  /**
   * Walks from the middle of the pool toward one side until the water ends, and returns a point
   * `gap` units past the shore.
   */
  const shore = (side: 1 | -1, axis: 'x' | 'y', gap: number): Pt => {
    let d = 0;
    const at = (): Pt =>
      axis === 'x' ? pt(POOL_MIDDLE.x + side * d, POOL_MIDDLE.y) : pt(POOL_MIDDLE.x, POOL_MIDDLE.y + side * d);
    while (b.waterAt(at().x, at().y) > 0.2 && d < 600) d += 8;
    d += gap;
    return at();
  };
  for (const [name, side, axis, facing] of [
    ['drink-pool-west', -1, 'x', 'east'],
    ['drink-pool-east', 1, 'x', 'west'],
    ['drink-pool-north', -1, 'y', 'south'],
    ['drink-pool-south', 1, 'y', 'north'],
  ] as const) {
    const s = shore(side, axis, 46);
    const into = axis === 'x' ? pt(s.x - side * 60, s.y) : pt(s.x, s.y - side * 60);
    b.anchor({ name, tags: ['drink'], pos: into, approach: [E(s.x, s.y, facing)] });
  }

  // Scenery
  const W = b.width,
    H = b.height;
  // Spires and boulders standing in the rock all round the floor, so the walls have depth, and a
  // few boulders on the rim of the floor.
  let spires = 0;
  for (let attempt = 0; attempt < 30000 && spires < 150; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    const o = b.openness(x, y);
    if (o > -26 || o < -230) continue;
    const id = pick(['cc-spire-1', 'cc-spire-2', 'cc-rock-3', 'cc-rock-2']);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 30) * 1.6 + 14)) continue;
    b.place(id, x, y);
    spires++;
  }
  let boulders = 0;
  for (let attempt = 0; attempt < 8000 && boulders < 46; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    const edge = Math.max(...rooms.map((r) => r(x, y)));
    if (edge < 60 || edge > 130 || nearPassage(x, y, 130) || !dry(x, y, 120)) continue;
    const id = pick(['cc-rock-1', 'cc-rock-2', 'cc-rock-1']);
    if (!sc.tryAdd(x, y, footprints[id]! + 60)) continue;
    b.solid(id, x, y);
    boulders++;
  }
  // What grows on the floor and shines, in drifts of one colour: it is walked over, like flowers.
  const hues = ['cyan', 'rose', 'gold', 'lilac', 'mint'] as const;
  let glowing = 0;
  for (let attempt = 0; attempt < 9000 && glowing < 120; attempt++) {
    const x = rnd() * W,
      y = rnd() * H;
    if (b.openness(x, y) < 30 || !dry(x, y, 80)) continue;
    const kind = rnd() < 0.72 ? `cc-mushrooms-${pick(hues)}` : `cc-bulbs-${pick([1, 2])}`;
    if (!sc.tryAdd(x, y, 54)) continue;
    b.place(kind, x, y);
    glowing++;
  }

  // Who lives here: tiny friendly wisps, fish in the pool and frogs and snails on the floor
  const zone = (cx: number, cy: number, w: number, h: number): { x: number; y: number; w: number; h: number } => ({
    x: (cx - w / 2) * T,
    y: (cy - h / 2) * T,
    w: w * T,
    h: h * T,
  });
  b.life({ name: 'wisp-hall', kind: 'fairy', area: zone(26, 28, 20, 11), shape: 'ellipse', count: 2 });
  b.life({ name: 'wisp-grotto', kind: 'fairy', area: zone(26, 10, 24, 9), shape: 'ellipse', count: 2 });
  b.life({ name: 'wisp-yard', kind: 'fairy', area: zone(43.8, 25, 11, 9), shape: 'ellipse', count: 1 });
  b.life({ name: 'wisp-pool', kind: 'fairy', area: zone(8.4, 26, 10, 13), shape: 'ellipse', count: 1 });
  b.life({
    name: 'fish-pool',
    kind: 'fish',
    area: {
      x: POOL_MIDDLE.x - POOL.rx + 40,
      y: POOL_MIDDLE.y - POOL.ry + 36,
      w: (POOL.rx - 40) * 2,
      h: (POOL.ry - 36) * 2,
    },
    shape: 'ellipse',
    count: 3,
  });
  b.life({
    name: 'dragonfly-pool',
    kind: 'dragonfly',
    area: { x: POOL_MIDDLE.x - 300, y: POOL_MIDDLE.y - 190, w: 600, h: 380 },
    shape: 'ellipse',
    count: 2,
  });
  b.life({ name: 'frog-pool', kind: 'frog', area: zone(8.4, 29.4, 6, 1.6), count: 2 });
  b.life({ name: 'snail-hall', kind: 'snail', area: zone(18.4, 31.6, 4, 2), count: 1 });
  b.life({ name: 'snail-yard', kind: 'snail', area: zone(45.6, 28.6, 4, 2), count: 1 });

  if (problems.length > 0) throw new Error(`crystal-cave:\n  ${problems.join('\n  ')}`);
  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('crystal-cave');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/crystal-cave.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorCrystalCave();
  console.log(
    `crystal-cave: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the rock mask)`,
  );
}
