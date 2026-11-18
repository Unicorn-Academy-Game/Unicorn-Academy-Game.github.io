import { hex, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32, noise3 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { extrude, FRONT, gableRoof, lathe, type P2 } from './arch';
import type { Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import type { Canvas } from './shore';
import { fir } from './trees';

/**
 * Santa's grove: firs with snow on every bough, a Christmas tree as tall as a house with a star on
 * top, presents to open, a sleigh and a reindeer, a snowman, striped lamp posts, a snowy cabin and
 * mounds of snow. Built in round numbers and drawn with the same camera and light as the herd.
 */

const r6 = (
  base: string,
  shadowHue: number,
  lightHue: number,
  lightness: readonly number[] = [-0.3, -0.2, -0.1, 0, 0.08, 0.16],
): Ramp => ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.95, lightness });

const SNOW = r6('#f6f9ff', 232, 55, [-0.24, -0.15, -0.08, -0.03, 0.02, 0.05]);
const ICE = r6('#bfe6ff', 235, 170, [-0.26, -0.17, -0.09, -0.02, 0.05, 0.1]);
const RED = r6('#d9303f', 348, 45, [-0.3, -0.2, -0.1, 0, 0.08, 0.16]);
const GREEN = r6('#2f9a4f', 165, 110, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const GOLD = r6('#f2c34b', 25, 90, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const BLUE = r6('#3f78e0', 250, 200, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const PINK = r6('#ff7fb2', 330, 40, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const VIOLET = r6('#8a5fd8', 275, 320, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const TURQUOISE = r6('#34c7b8', 220, 130, [-0.3, -0.2, -0.1, 0, 0.09, 0.17]);
const LOG = r6('#9a5f3c', 15, 65, [-0.32, -0.21, -0.1, 0, 0.07, 0.14]);
const DARK_WOOD = r6('#5a3a2a', 10, 50, [-0.3, -0.2, -0.1, 0, 0.07, 0.13]);
const STONE = r6('#8c91ad', 250, 80, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const COAL = r6('#2a2a38', 250, 270, [-0.1, -0.06, -0.03, 0, 0.05, 0.1]);
const CARROT = r6('#ff8a2a', 10, 55, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);
const FUR = r6('#b5834f', 18, 60, [-0.3, -0.2, -0.1, 0, 0.08, 0.14]);
const FUR_LIGHT = r6('#e8c79a', 18, 75, [-0.28, -0.18, -0.09, 0, 0.06, 0.1]);
const WARM = r6('#fff0a8', 30, 95, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]);
const LAMP_RED = r6('#ff4a58', 348, 50, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]);
const BRASS = r6('#c9a24a', 25, 80, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);

const BANDS = [0.2, 0.42, 0.64, 0.86];

const grain =
  (seed: number, amount = 0.07) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount +
    (noise3(s.rest[0] * 0.2, s.rest[1] * 0.2, s.rest[2] * 0.2, seed) - 0.5) * 0.12;

const sprite = (scene: SceneBuilder, canvas: Canvas, ss = 4): Rgba =>
  renderScene(scene, { width: canvas.w, height: canvas.h, originX: canvas.ox, originY: canvas.oy, ss }).rgba;

export {
  BANDS,
  BLUE,
  BRASS,
  COAL,
  DARK_WOOD,
  FUR,
  FUR_LIGHT,
  GOLD,
  GREEN,
  grain,
  ICE,
  LOG,
  PINK,
  RED,
  r6,
  SNOW,
  STONE,
  sprite as renderGrove,
  TURQUOISE,
  VIOLET,
  WARM,
};

/** A fir tree with the tiers of its boughs drifted over in snow. */
function snowOn(b: SceneBuilder, seed: number, k: number, tiers = 6): void {
  const rng = mulberry32(seed * 7 + 3);
  const snow = b.variant('snow', SNOW, { bands: BANDS });
  const mat = b.solid('snow', snow, grain(seed, 0.04));
  const part = b.newPart();
  const m = b.mesh(mat, { part, noLines: true });
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const z = (62 + t * 52) * k;
    const radius = (112 - f * 82) * k;
    const count = Math.round(16 - f * 6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng() * 0.5 + t;
      // The snow lies on the boughs that face up and toward the viewer, and a little on the back.
      const rr = radius * (0.5 + rng() * 0.42);
      const cl = (21 - f * 6) * k * (0.85 + rng() * 0.45);
      blob(m, v3(Math.cos(a) * rr, Math.sin(a) * rr * 0.9, z - rr * 0.1 + 8 * k), v3(cl * 1.2, cl, cl * 0.5), a, {
        rings: 5,
        segs: 8,
      });
    }
    blob(m, v3(0, 0, z + 16 * k), v3(radius * 0.55, radius * 0.55, 14 * k), 0, { rings: 5, segs: 10 });
  }
  blob(m, v3(0, 0, (62 + tiers * 52 - 6) * k), v3(14 * k, 13 * k, 20 * k), 0, { rings: 6, segs: 9 });
}

/** A tall fir, white along every bough. */
export function snowFir(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const b = fir({ seed: o.seed, foliage: 'spruce', scale: k });
  snowOn(b, o.seed, k);
  return b;
}

/**
 * The Christmas tree: a fir half again as big as the others, wound with a gold garland and hung
 * with baubles, a star on its top and a little snow on its boughs. `lights` draws nothing but the
 * lights, in the same place, to be laid over it.
 */
export function christmasTree(o: { lights: boolean; phase?: number; scale?: number; snow?: boolean }): SceneBuilder {
  const k = o.scale ?? 1.5;
  const seed = 6;
  const b = o.lights ? new SceneBuilder() : fir({ seed, foliage: 'spruce', scale: k });
  const rng = mulberry32(81);
  const tiers = 6;
  const bauble = (name: string, rampOf: Ramp, emissive?: number) =>
    b.solid(
      name,
      b.variant(name, rampOf, {
        bands: BANDS,
        noLines: true,
        ...(emissive ? { emissive, protect: true, noOutline: true } : {}),
      }),
    );
  if (!o.lights) {
    if (o.snow ?? true) snowOn(b, seed, k);
    // The garland winds up the tree in a spiral that tightens toward the top.
    const gold = b.variant('garland', GOLD, { bands: BANDS });
    const gm = b.mesh(b.solid('garland', gold, grain(2, 0.05)));
    const pts: { p: V3; r: number }[] = [];
    for (let i = 0; i <= 70; i++) {
      const f = i / 70;
      const z = (86 + f * 258) * k;
      const rad = (104 - f * 86) * k * 1.0;
      const a = f * TAU * 3.4 + 0.6;
      pts.push({ p: v3(Math.cos(a) * rad, Math.sin(a) * rad * 0.9, z), r: 4.2 * k });
    }
    tube(gm, pts, { segs: 6, n: 140 });
  }
  const mats = o.lights
    ? [
        bauble('l-gold', WARM, 4),
        bauble('l-rose', LAMP_RED, 4),
        bauble('l-cyan', ICE, 4),
        bauble('l-mint', r6('#9ff5c0', 150, 120, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]), 4),
      ]
    : [
        bauble('b-red', RED),
        bauble('b-blue', BLUE),
        bauble('b-gold', GOLD),
        bauble('b-violet', VIOLET),
        bauble('b-pink', PINK),
      ];
  const meshes = mats.map((m) => b.mesh(m, { noLines: true }));
  let nth = 0;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const z = (62 + t * 52) * k;
    const radius = (112 - f * 82) * k;
    const count = o.lights ? Math.round(10 - f * 3) : Math.round(8 - f * 3);
    for (let i = 0; i < count; i++) {
      // Everything hangs on the side that faces the viewer.
      const a = Math.PI * (0.05 + 0.9 * ((i + 0.5 + rng() * 0.4) / count)) + Math.PI;
      const rr = radius * (0.9 + rng() * 0.2);
      const zz = z - 10 * k - rng() * 14 * k;
      const r = o.lights ? 5.6 * k : (8.4 + rng() * 2.4) * k;
      const mesh = meshes[Math.floor(rng() * meshes.length)]!;
      // Lights chase: each frame lights every third bulb.
      if (o.phase !== undefined && nth++ % 3 !== o.phase) continue;
      blob(mesh, v3(Math.cos(a) * rr, Math.sin(a) * rr * 0.92, zz), v3(r, r, r), 0, {
        rings: 6,
        segs: 9,
      });
    }
  }
  // The star on the top.
  const topZ = (62 + tiers * 52 - 6) * k;
  const starMat = o.lights ? bauble('star-glow', WARM, 5) : bauble('star', GOLD);
  const star: P2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = (i % 2 === 0 ? 26 : 11.5) * k;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  extrude(b.mesh(starMat, { noLines: true }), star, FRONT(0, -3 * k, topZ + 20 * k), 0, 8 * k, { smooth: 8 });
  return b;
}

type Wrap = 'red' | 'green' | 'blue' | 'gold' | 'pink';
const WRAPS: Readonly<Record<Wrap, { paper: Ramp; ribbon: Ramp }>> = {
  red: { paper: RED, ribbon: GOLD },
  green: { paper: GREEN, ribbon: RED },
  blue: { paper: BLUE, ribbon: SNOW },
  gold: { paper: GOLD, ribbon: RED },
  pink: { paper: PINK, ribbon: TURQUOISE },
};
export const WRAP_NAMES = Object.keys(WRAPS) as readonly Wrap[];

/**
 * A present tied with a ribbon and a big bow. Open, its lid is lifted off at an angle and a warm
 * light comes up out of the box.
 */
export function present(o: { wrap: Wrap; open: boolean; seed: number }): SceneBuilder {
  const w = WRAPS[o.wrap];
  const b = new SceneBuilder();
  const paper = b.variant('paper', w.paper, { bands: BANDS });
  const tie = b.variant('ribbon', w.ribbon, { bands: BANDS });
  const pm = b.solid('paper', paper, grain(o.seed, 0.015));
  const rm = b.solid('ribbon', tie, grain(o.seed + 1, 0.03));
  const base = b.mesh(pm);
  box(base, v3(0, 0, 17), v3(46, 40, 34), 0);
  const band = b.mesh(rm);
  box(band, v3(0, 0, 17), v3(8, 41.5, 35), 0);
  box(band, v3(0, 0, 17), v3(47.5, 8, 35), 0);
  const lid = b.mesh(pm);
  const lidBand = b.mesh(rm);
  if (!o.open) {
    box(lid, v3(0, 0, 38), v3(50, 44, 9), 0);
    box(lidBand, v3(0, 0, 38), v3(8, 45.5, 10), 0);
    box(lidBand, v3(0, 0, 38), v3(51.5, 8, 10), 0);
    const bow = b.mesh(rm, { noLines: true });
    for (const s of [-1, 1]) blob(bow, v3(s * 9, 0, 49), v3(10, 4.4, 8), s * 0.5, { rings: 7, segs: 10 });
    blob(bow, v3(0, 0, 47), v3(4.6, 4.6, 4.6), 0, { rings: 5, segs: 8 });
  } else {
    // The lid stands on its edge behind the box and leans back.
    box(lid, v3(34, 4, 60), v3(50, 44, 9), 0.5);
    box(lidBand, v3(34, 4, 60), v3(8, 45.5, 10), 0.5);
    box(lidBand, v3(34, 4, 60), v3(51.5, 8, 10), 0.5);
    // What was inside: a glow and stars
    const light = b.variant('glow', WARM, { emissive: 4, protect: true, noLines: true });
    const lm = b.mesh(b.solid('glow', light), { noLines: true });
    blob(lm, v3(0, 0, 36), v3(17, 14, 5), 0, { rings: 5, segs: 10 });
    for (const [x, z, r] of [
      [-8, 54, 3.4],
      [9, 62, 3],
      [1, 72, 2.6],
    ] as const)
      blob(lm, v3(x, 0, z), v3(r, r, r), 0, { rings: 4, segs: 6 });
  }
  return b;
}

/** A red sleigh with curled runners, its seat heaped with presents and a sack, facing east. */
export function sleigh(): SceneBuilder {
  const b = new SceneBuilder();
  const red = b.variant('red', RED, { bands: BANDS });
  const gold = b.variant('gold', GOLD, { bands: BANDS });
  const brown = b.variant('sack', FUR, { bands: BANDS });
  const dark = b.variant('dark', DARK_WOOD, { bands: BANDS });
  const snow = b.variant('snow', SNOW, { bands: BANDS });
  const redM = b.solid('red', red, grain(3, 0.015));
  const goldM = b.solid('gold', gold);
  const darkM = b.solid('dark', dark, grain(4, 0.08));
  // The two sides are one curved shape, pushed out to the left and the right.
  const side: P2[] = [
    [-60, 14],
    [-62, 40],
    [-54, 62],
    [-40, 56],
    [-34, 36],
    [34, 36],
    [44, 48],
    [58, 70],
    [66, 62],
    [60, 38],
    [50, 20],
    [30, 14],
  ];
  const sides = b.mesh(redM);
  extrude(sides, side, { o: [0, -26, 6], u: [1, 0, 0], v: [0, 0, 1] }, 0, 6, { smooth: 40 });
  extrude(sides, side, { o: [0, 20, 6], u: [1, 0, 0], v: [0, 0, 1] }, 0, 6, { smooth: 40 });
  box(b.mesh(redM), v3(0, 0, 20), v3(110, 44, 6), 0);
  box(b.mesh(redM), v3(-56, 0, 40), v3(6, 48, 40), 0);
  // Gold trim along the top edge and the runners
  const trim = b.mesh(goldM);
  for (const y of [-26, 26]) {
    tube(
      trim,
      [
        { p: v3(-60, y, 56), r: 1.8 },
        { p: v3(-36, y, 58), r: 1.8 },
        { p: v3(34, y, 44), r: 1.8 },
        { p: v3(58, y, 72), r: 1.8 },
      ],
      { segs: 6, n: 24 },
    );
  }
  const runners = b.mesh(darkM);
  for (const y of [-24, 24]) {
    tube(
      runners,
      [
        { p: v3(-70, y, 8), r: 2.8 },
        { p: v3(-40, y, 3), r: 2.8 },
        { p: v3(40, y, 3), r: 2.8 },
        { p: v3(66, y, 10), r: 2.8 },
        { p: v3(78, y, 28), r: 2.8 },
        { p: v3(72, y, 44), r: 2.4 },
      ],
      { segs: 6, n: 30 },
    );
    for (const x of [-34, 30])
      tube(
        runners,
        [
          { p: v3(x, y, 3), r: 2.2 },
          { p: v3(x, y * 0.8, 20), r: 2.2 },
        ],
        { segs: 6 },
      );
  }
  // The load
  const sack = b.mesh(b.solid('sack', brown, grain(5, 0.1)));
  blob(sack, v3(-30, 0, 52), v3(26, 20, 26), 0.4, { rings: 8, segs: 12 });
  blob(sack, v3(-30, 0, 78), v3(11, 10, 11), 0, { rings: 6, segs: 9 });
  const tieM = b.mesh(goldM);
  tube(
    tieM,
    [
      { p: v3(-30, 0, 72), r: 3 },
      { p: v3(-30, 0, 76), r: 3 },
    ],
    { segs: 8 },
  );
  const colours: readonly [Ramp, number, number, number][] = [
    [BLUE, 14, -8, 0],
    [GREEN, 28, 8, 0.3],
    [PINK, 8, 12, -0.2],
  ];
  colours.forEach(([ramp0, x, y, yaw], i) => {
    const paper = b.variant(`p${i}`, ramp0, { bands: BANDS });
    box(b.mesh(b.solid(`p${i}`, paper)), v3(x, y, 36), v3(22, 20, 22), yaw);
    box(b.mesh(goldM), v3(x, y, 36), v3(4, 21, 23), yaw);
  });
  // A dusting of snow on the load
  const snowM = b.mesh(b.solid('snow', snow), { noLines: true });
  blob(snowM, v3(-30, 0, 76), v3(10, 9, 3), 0, { rings: 4, segs: 8 });
  blob(snowM, v3(24, -4, 51), v3(11, 9, 3), 0, { rings: 4, segs: 8 });
  return b;
}

/** A reindeer standing with its head up and a glowing red nose, facing east. */
export function reindeer(): SceneBuilder {
  const b = new SceneBuilder();
  const fur = b.solid('fur', b.variant('fur', FUR, { bands: BANDS }), grain(11, 0.1));
  const light = b.solid('fur-light', b.variant('fur-light', FUR_LIGHT, { bands: BANDS }), grain(12, 0.08));
  const hoof = b.solid('hoof', b.variant('hoof', COAL, { bands: BANDS }));
  const horn = b.solid('antler', b.variant('antler', DARK_WOOD, { bands: BANDS }), grain(13, 0.1));
  const nose = b.solid('nose', b.variant('nose', LAMP_RED, { emissive: 3, protect: true, noLines: true }));
  const eye = b.solid('eye', b.variant('eye', COAL, { noLines: true }));
  const body = b.mesh(fur);
  blob(body, v3(0, 0, 58), v3(40, 19, 22), 0, { rings: 10, segs: 14 });
  blob(body, v3(-30, 0, 62), v3(18, 16, 19), 0, { rings: 8, segs: 12 });
  const chest = b.mesh(light);
  blob(chest, v3(32, 0, 58), v3(14, 14, 18), 0, { rings: 8, segs: 12 });
  blob(b.mesh(light), v3(-2, -4, 50), v3(34, 14, 12), 0, { rings: 7, segs: 12 });
  const legs = b.mesh(fur);
  for (const [x, y] of [
    [28, -10],
    [26, 10],
    [-26, -10],
    [-28, 10],
  ] as const)
    tube(
      legs,
      [
        { p: v3(x, y, 50), r: 6.4 },
        { p: v3(x + 1, y, 22), r: 4.2 },
        { p: v3(x + 1, y, 8), r: 3.6 },
      ],
      { segs: 8, n: 12 },
    );
  const hooves = b.mesh(hoof);
  for (const [x, y] of [
    [29, -10],
    [27, 10],
    [-25, -10],
    [-27, 10],
  ] as const)
    blob(hooves, v3(x, y, 4), v3(5.6, 5, 4.4), 0, { rings: 5, segs: 8 });
  // Neck and head
  tube(
    b.mesh(fur),
    [
      { p: v3(36, 0, 70), r: 11 },
      { p: v3(48, 0, 92), r: 8.4 },
      { p: v3(54, 0, 104), r: 7.6 },
    ],
    { segs: 10, n: 14 },
  );
  blob(b.mesh(fur), v3(60, 0, 108), v3(14, 9.4, 10), 0.1, { rings: 8, segs: 12 });
  blob(b.mesh(light), v3(72, 0, 104), v3(9, 6.4, 6.4), 0, { rings: 7, segs: 10 });
  blob(b.mesh(nose), v3(79, 0, 105), v3(4.6, 4.6, 4.6), 0, { rings: 6, segs: 9 });
  for (const s of [-1, 1]) {
    blob(b.mesh(eye), v3(67, s * 7.2, 112), v3(1.8, 1.8, 2.2), 0, { rings: 4, segs: 6 });
    // Ears
    blob(b.mesh(fur), v3(50, s * 9, 116), v3(3.2, 5, 8), s * 0.5, { rings: 5, segs: 8 });
  }
  // Antlers
  const ant = b.mesh(horn);
  for (const s of [-1, 1]) {
    tube(
      ant,
      [
        { p: v3(56, s * 5, 114), r: 1.9 },
        { p: v3(52, s * 10, 130), r: 1.7 },
        { p: v3(48, s * 14, 146), r: 1.4 },
        { p: v3(52, s * 17, 160), r: 1 },
      ],
      { segs: 6, n: 16 },
    );
    for (const [z, dy, dx] of [
      [124, 8, 4],
      [138, 8, -2],
    ] as const)
      tube(
        ant,
        [
          { p: v3(53 - (z - 124) * 0.2, s * (8 + (z - 124) * 0.3), z), r: 1.3 },
          { p: v3(53 + dx, s * (8 + dy + 8), z + 12), r: 0.9 },
        ],
        {
          segs: 6,
          n: 8,
        },
      );
  }
  // Tail
  blob(b.mesh(light), v3(-46, 0, 66), v3(6, 5, 7), 0, { rings: 5, segs: 8 });
  return b;
}

/** A snowman in a top hat and a red scarf, with a carrot nose and arms of sticks. */
export function snowman(o: { scarf: 'red' | 'green' | 'blue' }): SceneBuilder {
  const b = new SceneBuilder();
  const snow = b.variant('snow', SNOW, { bands: BANDS });
  const sm = b.solid('snow', snow, grain(21, 0.04));
  const body = b.mesh(sm);
  blob(body, v3(0, 0, 26), v3(34, 32, 27), 0, { rings: 10, segs: 16 });
  blob(b.mesh(sm), v3(0, 0, 70), v3(25, 24, 22), 0, { rings: 10, segs: 16 });
  blob(b.mesh(sm), v3(0, 0, 105), v3(18.5, 18, 17), 0, { rings: 10, segs: 16 });
  const coal = b.mesh(b.solid('coal', b.variant('coal', COAL, { noLines: true })));
  for (const x of [-6.4, 6.4]) blob(coal, v3(x, -16.4, 110), v3(2.2, 1.6, 2.2), 0, { rings: 4, segs: 6 });
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + ((i + 0.5) / 6) * Math.PI;
    blob(
      coal,
      v3(Math.cos(a) * 8, -17.4 + Math.sin(a) * 0.8 - 0.4, 98 + 0.6 * Math.sin((i / 5) * Math.PI) * 3),
      v3(1.2, 1, 1.2),
      0,
      { rings: 3, segs: 5 },
    );
  }
  for (const z of [78, 64, 50]) blob(coal, v3(0, -24.4, z), v3(2.4, 1.6, 2.4), 0, { rings: 4, segs: 6 });
  tube(
    b.mesh(b.solid('carrot', b.variant('carrot', CARROT, { bands: BANDS }))),
    [
      { p: v3(0, -17, 105), r: 3.6 },
      { p: v3(0, -33, 104), r: 0.7 },
    ],
    { segs: 8, n: 8 },
  );
  // Scarf
  const cloth = o.scarf === 'red' ? RED : o.scarf === 'green' ? GREEN : BLUE;
  const scarf = b.mesh(b.solid('scarf', b.variant('scarf', cloth, { bands: BANDS }), grain(22, 0.05)));
  const loop: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    loop.push({ p: v3(Math.cos(a) * 19, Math.sin(a) * 18.4, 89), r: 4.6 });
  }
  tube(scarf, loop, { segs: 8, n: 40, capEnd: false });
  tube(
    scarf,
    [
      { p: v3(10, -17, 90), r: 3.8 },
      { p: v3(14, -21, 74), r: 3.6 },
      { p: v3(12, -21, 58), r: 3.2 },
    ],
    { segs: 8, n: 12 },
  );
  // Arms
  const stick = b.mesh(b.solid('stick', b.variant('stick', DARK_WOOD, { bands: BANDS }), grain(23, 0.1)));
  for (const s of [-1, 1]) {
    tube(
      stick,
      [
        { p: v3(s * 22, 0, 72), r: 2.2 },
        { p: v3(s * 44, -2, 84), r: 1.8 },
        { p: v3(s * 58, -2, 100), r: 1.4 },
      ],
      { segs: 6, n: 14 },
    );
    tube(
      stick,
      [
        { p: v3(s * 47, -2, 87), r: 1.3 },
        { p: v3(s * 56, -2, 80), r: 1 },
      ],
      { segs: 5 },
    );
  }
  // The top hat
  const hat = b.solid('hat', b.variant('hat', COAL, { bands: BANDS }), grain(24, 0.04));
  lathe(b.mesh(hat), {
    c: v3(0, 0, 120),
    profile: [
      [0, 0],
      [24, 0],
      [24, 3],
      [14, 4],
      [14, 30],
      [0, 30],
    ],
    segs: 18,
  });
  const band = b.solid('hat-band', b.variant('hat-band', RED, { bands: BANDS }));
  lathe(b.mesh(band), {
    c: v3(0, 0, 124),
    profile: [
      [0, 0],
      [14.6, 0],
      [14.6, 7],
      [0, 7],
    ],
    segs: 18,
  });
  return b;
}

/** A lamp post striped like a candy cane, hooked over at the top where a lantern glows. */
export function candyLamp(o: { stripe: 'red' | 'green' }): SceneBuilder {
  const b = new SceneBuilder();
  const a = b.variant('a', o.stripe === 'red' ? RED : GREEN, { bands: BANDS });
  const w = b.variant('w', SNOW, { bands: BANDS });
  const mat = b.material({
    name: 'candy',
    shade: (s) => (Math.floor((s.rest[2] + s.rest[0] * 0.6 + s.rest[1] * 0.6) / 13) % 2 === 0 ? a : w),
    bias: grain(31, 0.03),
  });
  const pole = b.mesh(mat);
  const path: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 12; i++) path.push({ p: v3(0, 0, i * 12), r: 4.2 });
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * Math.PI * 0.95;
    path.push({ p: v3(Math.sin(t) * 16 - 0, 0, 144 + (1 - Math.cos(t)) * 8), r: 4.2 });
  }
  tube(pole, path, { segs: 10, n: 80 });
  // The lantern that hangs from the hook
  const light = b.variant('glow', WARM, { emissive: 3.5, protect: true, noLines: true });
  const brass = b.solid('brass', b.variant('brass', BRASS, { bands: BANDS }));
  tube(
    b.mesh(brass),
    [
      { p: v3(30, 0, 148), r: 1.2 },
      { p: v3(30, 0, 136), r: 1.2 },
    ],
    { segs: 5 },
  );
  lathe(b.mesh(brass), {
    c: v3(30, 0, 108),
    profile: [
      [0, 0],
      [8, 0],
      [8, 2],
      [0, 2],
    ],
    segs: 10,
  });
  blob(b.mesh(b.solid('glow', light), { noLines: true }), v3(30, 0, 120), v3(7.4, 7.4, 11), 0, { rings: 7, segs: 10 });
  lathe(b.mesh(brass), {
    c: v3(30, 0, 130),
    profile: [
      [0, 0],
      [9, 0],
      [5, 6],
      [0, 8],
    ],
    segs: 10,
  });
  // A drift of snow at its foot
  blob(
    b.mesh(b.solid('snow', b.variant('snow', SNOW, { bands: BANDS }), grain(32, 0.04)), { noLines: true }),
    v3(0, 0, 3),
    v3(15, 12, 7),
    0,
    {
      rings: 6,
      segs: 10,
    },
  );
  return b;
}

/** A mound of snow, glittering. */
export function snowPile(o: { seed: number; big: boolean }): SceneBuilder {
  const rng = mulberry32(o.seed * 5 + 1);
  const b = new SceneBuilder();
  const sm = b.solid('snow', b.variant('snow', SNOW, { bands: BANDS }), grain(o.seed, 0.05));
  const m = b.mesh(sm, { noLines: true });
  const k = o.big ? 1.5 : 1;
  blob(m, v3(0, 0, 14 * k), v3(48 * k, 34 * k, 22 * k), 0.2, { rings: 8, segs: 14 });
  blob(m, v3(-26 * k, 6 * k, 9 * k), v3(26 * k, 20 * k, 14 * k), 0.5, { rings: 6, segs: 10 });
  blob(m, v3(30 * k, 4 * k, 8 * k), v3(24 * k, 18 * k, 12 * k), -0.4, { rings: 6, segs: 10 });
  const glint = b.solid('glint', b.variant('glint', ICE, { emissive: 3, protect: true, noLines: true }));
  const gm = b.mesh(glint, { noLines: true });
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU;
    blob(
      gm,
      v3(Math.cos(a) * 30 * k * rng(), -Math.abs(Math.sin(a)) * 22 * k * rng() - 6, 20 * k + rng() * 8),
      v3(1.6, 1.2, 1.6),
      0,
      { rings: 3, segs: 5 },
    );
  }
  return b;
}

/** A boulder capped with snow. */
export function snowRock(o: { seed: number; scale?: number }): SceneBuilder {
  const k = o.scale ?? 1;
  const b = new SceneBuilder();
  const rock = b.solid('rock', b.variant('rock', STONE, { bands: BANDS }), grain(o.seed, 0.16));
  blob(b.mesh(rock), v3(0, 0, 22 * k), v3(40 * k, 30 * k, 24 * k), o.seed * 0.7, { rings: 8, segs: 12 });
  blob(b.mesh(rock), v3(-30 * k, 8 * k, 12 * k), v3(20 * k, 16 * k, 14 * k), 0.5, { rings: 6, segs: 10 });
  const snow = b.solid('snow', b.variant('snow', SNOW, { bands: BANDS }), grain(o.seed + 3, 0.04));
  blob(b.mesh(snow, { noLines: true }), v3(2 * k, 2 * k, 36 * k), v3(34 * k, 24 * k, 12 * k), o.seed * 0.7, {
    rings: 7,
    segs: 12,
  });
  blob(b.mesh(snow, { noLines: true }), v3(-30 * k, 8 * k, 22 * k), v3(16 * k, 12 * k, 6 * k), 0.5, {
    rings: 5,
    segs: 9,
  });
  return b;
}

/** Santa's cabin: round logs, a snowy roof, a chimney, a door with a wreath and windows aglow. */
export function cabin(): SceneBuilder {
  const b = new SceneBuilder();
  const log = b.variant('log', LOG, { bands: BANDS });
  const logM = b.material({
    name: 'log',
    shade: () => log,
    bias: (s) => (Math.sin(s.rest[2] * 0.52) * 0.5 + 0.5) * 0.1 - 0.04 + (hash2(s.px, s.py, 41) - 0.5) * 0.05,
  });
  box(b.mesh(logM), v3(0, 0, 58), v3(240, 160, 116), 0);
  // Corner posts
  const post = b.mesh(b.solid('post', b.variant('post', DARK_WOOD, { bands: BANDS }), grain(42, 0.1)));
  for (const [x, y] of [
    [-120, -80],
    [120, -80],
    [-120, 80],
    [120, 80],
  ] as const)
    box(post, v3(x, y, 54), v3(14, 14, 112), 0);
  // The roof: red under the snow
  const roof = b.solid('roof', b.variant('roof', RED, { bands: BANDS }), grain(43, 0.05));
  gableRoof(b.mesh(roof), v3(0, 0, 116), 240, 160, 56, 'x', 20);
  const snow = b.solid('roof-snow', b.variant('roof-snow', SNOW, { bands: BANDS }), grain(44, 0.02));
  const drifts = b.mesh(snow, { noLines: true });
  // A thick cap of snow along the ridge, and drifts lying down the slope and over the eaves
  blob(drifts, v3(0, 0, 176), v3(132, 22, 10), 0, { rings: 6, segs: 14 });
  for (const [x, y, rx, ry, z] of [
    [-92, -52, 34, 17, 142],
    [-30, -62, 40, 20, 134],
    [34, -48, 36, 17, 148],
    [96, -60, 30, 16, 136],
    [-70, -86, 28, 9, 120],
    [20, -90, 36, 9, 122],
    [88, -88, 26, 9, 120],
  ] as const)
    blob(drifts, v3(x, y, z), v3(rx, ry, 8), 0, { rings: 5, segs: 10 });
  // Icicles under the front eave
  const ice = b.mesh(b.solid('icicle', b.variant('icicle', ICE, { bands: BANDS })), { noLines: true });
  for (let i = 0; i < 14; i++) {
    const x = -124 + i * 19 + (i % 2) * 3;
    tube(
      ice,
      [
        { p: v3(x, -98, 120), r: 2.6 },
        { p: v3(x, -98, 120 - 10 - (i % 3) * 5), r: 0.3 },
      ],
      { segs: 5, n: 4 },
    );
  }
  // The chimney, with a cap of snow
  const brick = b.solid('brick', b.variant('brick', STONE, { bands: BANDS }), grain(45, 0.14));
  box(b.mesh(brick), v3(70, 20, 176), v3(30, 30, 80), 0);
  blob(b.mesh(snow, { noLines: true }), v3(70, 20, 218), v3(21, 21, 8), 0, { rings: 5, segs: 10 });
  // The door
  const wood = b.solid('door', b.variant('door', DARK_WOOD, { bands: BANDS }), grain(46, 0.08));
  box(b.mesh(wood), v3(0, -81, 38), v3(50, 4, 76), 0);
  const gold = b.solid('knob', b.variant('knob', GOLD, { bands: BANDS }));
  blob(b.mesh(gold), v3(14, -85, 36), v3(3.4, 3.4, 3.4), 0, { rings: 5, segs: 8 });
  // A wreath on the door
  const wreath = b.mesh(b.solid('wreath', b.variant('wreath', GREEN, { bands: BANDS }), grain(47, 0.12)));
  const ring: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * TAU;
    ring.push({ p: v3(Math.cos(a) * 14, -86, 54 + Math.sin(a) * 14), r: 4 });
  }
  tube(wreath, ring, { segs: 8, n: 40, capEnd: false });
  const bow = b.mesh(b.solid('wreath-bow', b.variant('wreath-bow', RED, { bands: BANDS })), { noLines: true });
  for (const s of [-1, 1]) blob(bow, v3(s * 6, -90, 40), v3(6, 2.4, 4), s * 0.5, { rings: 5, segs: 8 });
  // Windows aglow, with a frame, and a snowy sill
  const glow = b.solid('window', b.variant('window', WARM, { emissive: 2.6, protect: true, noLines: true }));
  const frame = b.solid('frame', b.variant('frame', SNOW, { bands: BANDS }));
  for (const x of [-78, 78]) {
    box(b.mesh(frame), v3(x, -81, 66), v3(46, 3, 42), 0);
    box(b.mesh(glow, { noLines: true }), v3(x, -83, 66), v3(38, 2, 34), 0);
    box(b.mesh(frame), v3(x, -84, 66), v3(3, 2, 36), 0);
    box(b.mesh(frame), v3(x, -84, 66), v3(40, 2, 3), 0);
    blob(b.mesh(snow, { noLines: true }), v3(x, -84, 44), v3(26, 6, 4), 0, { rings: 4, segs: 8 });
  }
  // Snow banked against the walls and a path of lights over the door
  for (const [x, rx] of [
    [-100, 44],
    [96, 50],
  ] as const)
    blob(b.mesh(snow, { noLines: true }), v3(x, -86, 8), v3(rx, 18, 14), 0, { rings: 5, segs: 10 });
  const bulbs = [RED, GOLD, BLUE, GREEN, PINK];
  const lights = bulbs.map((c, i) =>
    b.mesh(b.solid(`bulb${i}`, b.variant(`bulb${i}`, c, { emissive: 2.2, protect: true, noLines: true })), {
      noLines: true,
    }),
  );
  for (let i = 0; i < 15; i++) {
    const t = (i + 0.5) / 15;
    const x = -112 + t * 224;
    blob(lights[i % lights.length]!, v3(x, -86, 100 - Math.sin(t * Math.PI) * 5), v3(3.2, 3.2, 3.2), 0, {
      rings: 4,
      segs: 7,
    });
  }
  return b;
}

/** A glowing halo around every lit pixel, so a light on a tree seems to shine. */
export function glowOf(src: Rgba, radius: number, strength: number): Rgba {
  const w = src.width,
    h = src.height;
  const acc = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src.data[i + 3]! < 128) continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const d = Math.hypot(dx, dy);
          if (d > radius) continue;
          const f = (1 - d / radius) ** 2 * strength;
          const j = (yy * w + xx) * 4;
          acc[j] = acc[j]! + src.data[i]! * f;
          acc[j + 1] = acc[j + 1]! + src.data[i + 1]! * f;
          acc[j + 2] = acc[j + 2]! + src.data[i + 2]! * f;
          acc[j + 3] = acc[j + 3]! + f;
        }
    }
  const out = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const j = p * 4;
    const weight = acc[j + 3]!;
    if (src.data[j + 3]! >= 128) {
      out.set(src.data.subarray(j, j + 4), j);
      continue;
    }
    if (weight <= 0.01) continue;
    out[j] = Math.min(255, acc[j]! / weight);
    out[j + 1] = Math.min(255, acc[j + 1]! / weight);
    out[j + 2] = Math.min(255, acc[j + 2]! / weight);
    out[j + 3] = Math.min(200, Math.round(weight * 255));
  }
  return { width: w, height: h, data: out };
}

/**
 * The way into Santa's grove, drawn for the forest: a pair of candy-cane posts that curve over to
 * make one arch, a garland with a red bow hung along it, a star on the top, and snow at the feet.
 */
export function gate(): SceneBuilder {
  const b = new SceneBuilder();
  const red = b.variant('a', RED, { bands: BANDS });
  const white = b.variant('w', SNOW, { bands: BANDS });
  const cane = b.material({
    name: 'candy',
    shade: (s) => (Math.floor((s.rest[2] + s.rest[0] * 0.7 + s.rest[1] * 0.7 + 400) / 13) % 2 === 0 ? red : white),
    bias: grain(31, 0.03),
  });
  const half = 96;
  const top = 176;
  const path: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 12; i++) path.push({ p: v3(-half, 0, (i * top) / 12 - 4), r: 6 });
  for (let i = 1; i < 28; i++) {
    const t = (i / 28) * Math.PI;
    path.push({ p: v3(-Math.cos(t) * half, 0, top + Math.sin(t) * 46), r: 6 });
  }
  for (let i = 12; i >= 0; i--) path.push({ p: v3(half, 0, (i * top) / 12 - 4), r: 6 });
  tube(b.mesh(cane), path, { segs: 10, n: 160 });
  // A garland hung along the arch, with a bow at the top and gold baubles
  const leaf = b.mesh(b.solid('garland', b.variant('garland', GREEN, { bands: BANDS }), grain(41, 0.05)), {
    noLines: true,
  });
  const gar: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = (i / 36) * Math.PI;
    gar.push({ p: v3(-Math.cos(t) * (half - 6), -8, top - 8 + Math.sin(t) * 40), r: 6.5 + (i % 3) });
  }
  tube(leaf, gar, { segs: 8, n: 90 });
  const bow = b.mesh(b.solid('bow', b.variant('bow', RED, { bands: BANDS })), { noLines: true });
  for (const sx of [-1, 1]) blob(bow, v3(sx * 14, -14, top + 30), v3(15, 6, 9), sx * 0.5, { rings: 5, segs: 9 });
  blob(bow, v3(0, -14, top + 30), v3(6, 6, 6), 0, { rings: 5, segs: 8 });
  const gold = b.mesh(b.solid('ball', b.variant('ball', GOLD, { bands: BANDS })), { noLines: true });
  for (let i = 3; i < 36; i += 5) {
    const t = (i / 36) * Math.PI;
    blob(gold, v3(-Math.cos(t) * (half - 6), -16, top - 12 + Math.sin(t) * 40), v3(5, 5, 5), 0, { rings: 5, segs: 8 });
  }
  // The star over the middle
  const starMat = b.mesh(b.solid('star', b.variant('star', GOLD, { bands: BANDS })), { noLines: true });
  const poly: P2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 === 0 ? 24 : 10;
    poly.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  extrude(starMat, poly, FRONT(0, -3, top + 70), 0, 7, { smooth: 8 });
  // Drifts of snow at the feet
  const snow = b.mesh(b.solid('drift', b.variant('drift', SNOW, { bands: BANDS }), grain(32, 0.04)), { noLines: true });
  for (const sx of [-1, 1]) blob(snow, v3(sx * half, 4, 4), v3(30, 20, 11), 0, { rings: 6, segs: 10 });
  return b;
}
