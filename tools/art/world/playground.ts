import { hex, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { coneRoof, extrude, FRONT, lathe, type P2 } from './arch';
import { gem } from './gems';
import { starPoly } from './hall';
import { Painter } from './paint';
import { GEM, type Ramp } from './palette';
import { blob, blobAlong, box, ribbon, tube } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { stoneKit } from './stone';

/**
 * The playground: toys for a small child, all bright and round, drawn with the same camera and
 * light as the rest of the world. Nothing here is sharp or scary, and nothing is ever used up. What
 * moves does so in frames drawn here; what bursts into light is done by the effects in
 * `src/render/fx/play.ts`.
 */

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });

/** The colours of the toys. Each is a full ramp, so a toy can be dressed in any of them. */
export const TOY = {
  red: r6('#f0485f', 335, 50),
  orange: r6('#ff9a3c', 335, 60),
  yellow: r6('#ffd84a', 20, 95),
  green: r6('#4fcf6a', 200, 105),
  teal: r6('#35c9c0', 230, 120),
  blue: r6('#4a9cf0', 265, 200),
  purple: r6('#a468e8', 285, 330),
  pink: r6('#f27cac', 325, 55),
  cream: r6('#fff1dc', 320, 80),
  wood: r6('#b27c52', 320, 70),
  iron: r6('#7d86a6', 260, 110),
} as const;
export type Toy = keyof typeof TOY;

const noise =
  (seed: number, amount = 0.04) =>
  (s: SampleInfo): number =>
    (hash2(s.px, s.py, seed) - 0.5) * amount;
export const paint = (b: SceneBuilder, name: string, colors: Ramp, seed = 3): number =>
  b.solid(name, b.variant(name, colors), noise(seed));
const circle = (r: number, n = 24): P2[] =>
  Array.from({ length: n }, (_, i): P2 => [Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r]);

export function render(
  b: SceneBuilder,
  c: Canvas,
  extra: Partial<Parameters<typeof renderScene>[1]> = {},
): { rgba: Rgba; at: (p: V3) => [number, number] } {
  const r = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
    ...extra,
  });
  return { rgba: r.rgba, at: r.at };
}

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export const MUSHROOM_CANVAS: Canvas = { w: 140, h: 130, ox: 70, oy: 98 };
export const MUSHROOM_FRAMES = 10;
export const MUSHROOM_LOOKS = ['red', 'pink', 'blue'] as const;
export type MushroomLook = (typeof MUSHROOM_LOOKS)[number];
const CAP: Record<MushroomLook, Toy> = { red: 'red', pink: 'pink', blue: 'blue' };

/**
 * How squashed the cap is at a moment of the bounce: pressed flat first, then stretched, then a
 * smaller wobble each time.
 */
export const squashAt = (t: number): number => Math.sin(TAU * 2.2 * t) * (1 - t) ** 1.2;

/**
 * A springy mushroom: a cream stem and a round spotted cap. Frame `f` of the bounce, or frame 0 at
 * rest.
 */
export function renderMushroom(look: MushroomLook, f: number): Rgba {
  const b = new SceneBuilder();
  const s = squashAt(f / MUSHROOM_FRAMES);
  const stem = b.mesh(paint(b, 'stem', TOY.cream, 5));
  const capM = b.mesh(paint(b, 'cap', TOY[CAP[look]], 7));
  const spot = b.mesh(b.solid('spot', b.variant('spot', TOY.cream)));
  const stemTop = 36 * (1 - 0.3 * s);
  lathe(stem, {
    c: v3(0, 0, 0),
    segs: 20,
    smooth: true,
    profile: [
      [19, 0],
      [17, 5],
      [13, 22],
      [14 + 4 * s, stemTop],
    ],
  });
  const R = 46 * (1 + 0.16 * s);
  const H = 36 * (1 - 0.26 * s);
  const prof: P2[] = [[R * 0.92, 0]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push([Math.cos(a) * R, Math.sin(a) * H]);
  }
  lathe(capM, { c: v3(0, 0, stemTop - 4), segs: 26, smooth: true, profile: [[0, 0], ...prof] });
  // Spots sit on the cap's skin, each a flat white ellipsoid pushed into it.
  const spots: readonly [number, number, number][] = [
    [0.2, 0.9, 11],
    [2.3, 0.78, 10],
    [4.1, 0.82, 12],
    [5.3, 0.62, 8],
    [1.2, 0.5, 8],
    [3.2, 0.45, 9],
  ];
  for (const [angle, lift, r] of spots) {
    const a = lift * (Math.PI / 2);
    const x = Math.cos(angle) * Math.cos(a) * R * 0.96,
      y = Math.sin(angle) * Math.cos(a) * R * 0.96,
      z = stemTop - 4 + Math.sin(a) * H * 0.98;
    blob(spot, v3(x, y, z), v3(r, r, 3.4), angle, { rings: 5, segs: 8 });
  }
  return render(b, MUSHROOM_CANVAS, { aoRadius: 7 }).rgba;
}

export const BALLOON_CANVAS: Canvas = { w: 160, h: 290, ox: 80, oy: 250 };
export const BALLOON_LOOKS = ['party', 'warm', 'cool'] as const;
export type BalloonLook = (typeof BALLOON_LOOKS)[number];
const BALLOON_COLOURS: Record<BalloonLook, readonly Toy[]> = {
  party: ['red', 'yellow', 'blue', 'green', 'pink'],
  warm: ['red', 'orange', 'yellow', 'pink', 'orange'],
  cool: ['blue', 'teal', 'purple', 'green', 'blue'],
};
/** Where the strings are tied: the top of the little gift box the bunch is weighted with. */
const KNOT = v3(0, 0, 30);

/** A gift box with a bow, the weight every bunch of balloons is tied to. */
export function renderBalloonWeight(): Rgba {
  const b = new SceneBuilder();
  const box1 = b.mesh(paint(b, 'gift', TOY.purple, 3));
  const ribbonM = b.mesh(paint(b, 'ribbon', TOY.yellow, 4));
  box(box1, v3(0, 0, 13), v3(40, 34, 26), 0.1, 1.4);
  box(ribbonM, v3(0, 0, 13), v3(7, 35.6, 27.6), 0.1);
  box(ribbonM, v3(0, 0, 13), v3(41.6, 7, 27.6), 0.1);
  blob(ribbonM, v3(-6, 0, 29), v3(8, 4.4, 5.6), 0.4, { rings: 5, segs: 8 });
  blob(ribbonM, v3(6, 0, 29), v3(8, 4.4, 5.6), -0.4, { rings: 5, segs: 8 });
  return render(b, BALLOON_CANVAS, { aoRadius: 6 }).rgba;
}

/** A bunch of five balloons on strings, drawn from the knot up. */
export function renderBalloons(look: BalloonLook): Rgba {
  const b = new SceneBuilder();
  const string = b.mesh(b.solid('string', b.variant('string', TOY.cream, { noLines: true })));
  const spots: readonly [number, number, number][] = [
    [-30, 6, 176],
    [-8, -4, 206],
    [24, 4, 186],
    [-18, 10, 140],
    [16, -2, 150],
  ];
  BALLOON_COLOURS[look].forEach((colour, i) => {
    const [x, y, z] = spots[i]!;
    const m = b.mesh(paint(b, `balloon-${i}`, TOY[colour], 11 + i));
    blob(m, v3(x, y, z), v3(19, 19, 24), 0, { rings: 9, segs: 14 });
    // The knot, a little cone below, and the string down to the gift box.
    blob(m, v3(x, y, z - 25), v3(4.4, 4.4, 4), 0, { rings: 4, segs: 6 });
    tube(
      string,
      [
        { p: v3(x, y, z - 28), r: 0.9 },
        { p: v3(x * 0.7, y * 0.7, z * 0.5), r: 0.9 },
        { p: KNOT, r: 0.9 },
      ],
      { n: 8, segs: 5 },
    );
  });
  return render(b, BALLOON_CANVAS, { aoRadius: 6 }).rgba;
}

export const POPPER_CANVAS: Canvas = { w: 150, h: 230, ox: 75, oy: 190 };

/**
 * A tall party popper standing on a wooden foot, striped in bright colours, with streamers curling
 * out of its mouth.
 */
export function renderPopper(): Rgba {
  const b = new SceneBuilder();
  const stripes = [TOY.red, TOY.yellow, TOY.blue, TOY.cream].map((r, i) => b.variant(`stripe-${i}`, r));
  const body = b.material({
    name: 'stripes',
    shade: (s) => stripes[Math.floor((((Math.atan2(s.rest[1], s.rest[0]) / TAU) % 1) + 1) * 8) % 4]!,
    bias: noise(2),
  });
  lathe(b.mesh(body), {
    c: v3(0, 0, 14),
    segs: 24,
    smooth: true,
    profile: [
      [7, 0],
      [12, 30],
      [20, 70],
      [28, 112],
      [27, 116],
    ],
  });
  const foot = b.mesh(paint(b, 'foot', TOY.wood, 5));
  lathe(foot, {
    c: v3(0, 0, 0),
    segs: 18,
    smooth: true,
    profile: [
      [26, 0],
      [26, 6],
      [14, 10],
      [9, 16],
      [8, 20],
    ],
  });
  const rim = b.mesh(paint(b, 'rim', TOY.purple, 6));
  lathe(rim, {
    c: v3(0, 0, 124),
    segs: 24,
    smooth: true,
    profile: [
      [29, 0],
      [31, 3],
      [29, 7],
      [24, 7],
      [26, 3],
      [26, 0],
    ],
  });
  const dark = b.mesh(
    b.solid(
      'mouth',
      b.variant(
        'mouth',
        [
          [40, 24, 60],
          [64, 40, 92],
        ] as Ramp,
        { noLines: true },
      ),
    ),
  );
  lathe(dark, {
    c: v3(0, 0, 126),
    segs: 22,
    profile: [
      [25, 0],
      [0, 0],
    ],
  });
  const streamer = [TOY.pink, TOY.green, TOY.orange, TOY.teal];
  streamer.forEach((c, i) => {
    const m = b.mesh(paint(b, `streamer-${i}`, c, 20 + i), { twoSided: true });
    const a = (i / 4) * TAU + 0.6;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    ribbon(
      m,
      [
        { p: v3(dx * 6, dy * 6, 124), w: 3, t: 0.8 },
        { p: v3(dx * 18, dy * 18, 150 + i * 6), w: 3.6, t: 0.8 },
        { p: v3(dx * 34, dy * 34 + 6, 156 + i * 4), w: 3.4, t: 0.8 },
        { p: v3(dx * 38, dy * 38 + 12, 138 + i * 4), w: 3, t: 0.8 },
        { p: v3(dx * 30, dy * 30 + 14, 122 + i * 3), w: 2.4, t: 0.8 },
      ],
      v3(0, -1, 0),
      5,
    );
  });
  // A few bits of confetti caught in the air above it.
  const rnd = mulberry32(8);
  [TOY.red, TOY.yellow, TOY.blue, TOY.green, TOY.pink].forEach((c, i) => {
    const m = b.mesh(paint(b, `bit-${i}`, c, 30 + i));
    for (let k = 0; k < 3; k++)
      blob(m, v3((rnd() - 0.5) * 70, (rnd() - 0.5) * 30, 150 + rnd() * 30), v3(3.4, 2, 1), rnd() * 3, {
        rings: 3,
        segs: 5,
      });
  });
  return render(b, POPPER_CANVAS, { aoRadius: 7 }).rgba;
}

export const FIREWORK_CANVAS: Canvas = { w: 150, h: 190, ox: 75, oy: 150 };
export const FIREWORK_LOOKS = ['red', 'blue', 'gold'] as const;
export type FireworkLook = (typeof FIREWORK_LOOKS)[number];
const ROCKET: Record<FireworkLook, { body: Toy; nose: Toy }> = {
  red: { body: 'red', nose: 'yellow' },
  blue: { body: 'blue', nose: 'cream' },
  gold: { body: 'yellow', nose: 'red' },
};

/**
 * A wooden crate with three rockets standing in it, fanned a little, their paper tubes striped and
 * their noses round.
 */
export function renderFireworks(look: FireworkLook): Rgba {
  const b = new SceneBuilder();
  const wood = b.mesh(paint(b, 'crate', TOY.wood, 3));
  const slat = b.mesh(paint(b, 'slat', r6('#d9b07a', 320, 80), 4));
  box(wood, v3(0, -19, 14), v3(84, 4, 28));
  box(wood, v3(0, 19, 14), v3(84, 4, 28));
  for (const sx of [-1, 1]) box(wood, v3(sx * 40, 0, 14), v3(4, 42, 28));
  box(wood, v3(0, 0, 3), v3(80, 38, 6));
  box(slat, v3(0, -21.4, 14), v3(70, 1.6, 4));
  const dark = b.mesh(
    b.solid(
      'inside',
      b.variant(
        'inside',
        [
          [60, 44, 52],
          [88, 66, 78],
        ] as Ramp,
        { noLines: true },
      ),
    ),
  );
  box(dark, v3(0, 0, 25), v3(76, 34, 6));
  const colours = ROCKET[look];
  const body = paint(b, 'rocket-body', TOY[colours.body], 6);
  const nose = paint(b, 'rocket-nose', TOY[colours.nose], 7);
  const band = paint(b, 'rocket-band', TOY.cream, 8);
  const stick = paint(b, 'stick', TOY.wood, 9);
  [-1, 0, 1].forEach((k) => {
    const a = k * 0.2;
    const d: V3 = v3(Math.sin(a), 0, Math.cos(a));
    const at = (t: number): V3 => v3(k * 24 + d[0] * t, 0, 26 + d[2] * t);
    tube(
      b.mesh(stick),
      [
        { p: at(-4), r: 1.3 },
        { p: at(-26), r: 1.3 },
      ],
      { n: 2, segs: 5 },
    );
    tube(
      b.mesh(body),
      [
        { p: at(0), r: 7 },
        { p: at(52), r: 7 },
      ],
      { n: 3, segs: 14 },
    );
    tube(
      b.mesh(band),
      [
        { p: at(14), r: 7.4 },
        { p: at(20), r: 7.4 },
      ],
      { n: 2, segs: 14, capEnd: true },
    );
    tube(
      b.mesh(band),
      [
        { p: at(34), r: 7.4 },
        { p: at(38), r: 7.4 },
      ],
      { n: 2, segs: 14, capEnd: true },
    );
    tube(
      b.mesh(nose),
      [
        { p: at(50), r: 7 },
        { p: at(58), r: 6 },
        { p: at(66), r: 3.4 },
        { p: at(71), r: 0.8 },
      ],
      { n: 8, segs: 14 },
    );
  });
  return render(b, FIREWORK_CANVAS, { aoRadius: 7 }).rgba;
}

export const GEM_FOUNTAIN_CANVAS: Canvas = { w: 280, h: 320, ox: 140, oy: 232 };
export const GEM_JET_FRAMES = 10;
const GEM_COLOURS = [GEM.ruby, GEM.sapphire, GEM.emerald, GEM.amethyst, GEM.topaz] as const;

/**
 * A round marble basin with a pedestal, a great amethyst on top of it and four more gems sitting in
 * the water.
 */
export function renderGemFountain(): Rgba {
  const b = new SceneBuilder();
  const k = stoneKit(b, 9);
  const marble = b.mesh(k.marble);
  lathe(marble, {
    c: v3(0, 0, 0),
    segs: 30,
    smooth: true,
    profile: [
      [0, 0],
      [90, 0],
      [92, 5],
      [92, 22],
      [86, 28],
      [76, 28],
      [74, 22],
    ],
  });
  lathe(b.mesh(k.water), {
    c: v3(0, 0, 21),
    segs: 30,
    profile: [
      [74, 0],
      [0, 0],
    ],
  });
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, 0),
    segs: 30,
    smooth: true,
    profile: [
      [92.4, 10],
      [94, 12],
      [92.4, 15],
    ],
  });
  lathe(marble, {
    c: v3(0, 0, 18),
    segs: 20,
    smooth: true,
    profile: [
      [20, 0],
      [15, 8],
      [10, 30],
      [12, 40],
      [25, 47],
      [30, 54],
      [24, 58],
    ],
  });
  lathe(b.mesh(k.gold), {
    c: v3(0, 0, 18),
    segs: 20,
    smooth: true,
    profile: [
      [12.6, 36],
      [14, 38],
      [12.6, 41],
    ],
  });
  const jewel = (ramp: Ramp, name: string): number =>
    b.solid(name, b.variant(name, ramp, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }));
  gem(b.mesh(jewel(GEM.amethyst, 'big')), v3(0, 0, 18 + 58 + 18), 24, {
    sides: 8,
    stretch: [1, 1],
    crown: 0.5,
    pavilion: 0.9,
  });
  [GEM.ruby, GEM.sapphire, GEM.emerald, GEM.topaz].forEach((ramp, i) => {
    const a = (i / 4) * TAU + 0.7;
    gem(b.mesh(jewel(ramp, `water-${i}`)), v3(Math.cos(a) * 52, Math.sin(a) * 52, 25), 10.5, { sides: 6, yaw: i });
  });
  return render(b, GEM_FOUNTAIN_CANVAS, { aoRadius: 8 }).rgba;
}

/**
 * The gems that leap from the top of the fountain and fall to the water, frame `f` of a loop, drawn
 * over the basin.
 */
export function renderGemJet(f: number): Rgba {
  const b = new SceneBuilder();
  const count = 10;
  for (let i = 0; i < count; i++) {
    const t = (f / GEM_JET_FRAMES + i / count) % 1;
    const a = (i / count) * TAU * 2.3 + 0.4;
    const reach = 62 * Math.sin(t * Math.PI * 0.5 + 0.0) * (0.55 + (0.45 * ((i * 7) % 5)) / 4);
    const z = 112 + 78 * Math.sin(t * Math.PI) - 90 * t * t * 0.0 - 70 * t * t;
    const ramp = GEM_COLOURS[i % GEM_COLOURS.length]!;
    const name = `jet-${i % GEM_COLOURS.length}`;
    const m = b.mesh(b.solid(name, b.variant(name, ramp, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));
    gem(m, v3(Math.cos(a) * reach, Math.sin(a) * reach * 0.8, z), 6.4 + (i % 3) * 1.2, { sides: 6, yaw: t * 6 + i });
  }
  return render(b, GEM_FOUNTAIN_CANVAS, { aoRadius: 5 }).rgba;
}

export const SLIDE_CANVAS: Canvas = { w: 420, h: 290, ox: 200, oy: 244 };
export const SLIDE_BALL_FRAMES = 12;
const SLIDE_TOP = 118;
const SLIDE_FROM = -72;
const SLIDE_TO = 156;
/**
 * Height of the slide's surface at a share `u` of the way down: gentle at the top, steepest in the
 * middle, flat at the bottom.
 */
const slideZ = (u: number): number => SLIDE_TOP * (1 - smooth(u)) + 6;
const slideX = (u: number): number => SLIDE_FROM + (SLIDE_TO - SLIDE_FROM) * u;

/**
 * A play tower with a ladder, a roof and a slide of rainbow stripes that curves down from its
 * platform.
 */
export function renderSlide(): Rgba {
  const b = new SceneBuilder();
  const post = b.mesh(paint(b, 'post', TOY.cream, 3));
  const floor = b.mesh(paint(b, 'floor', TOY.yellow, 4));
  const white = b.mesh(paint(b, 'rail', TOY.cream, 5));
  const cx = -108;
  for (const [x, y] of [
    [-34, -30],
    [34, -30],
    [-34, 30],
    [34, 30],
  ] as const)
    box(post, v3(cx + x, y, 86), v3(9, 9, 172), 0, 1.2);
  box(floor, v3(cx, 0, SLIDE_TOP), v3(84, 72, 7), 0, 1);
  // A low rail round the back and sides of the platform.
  for (const [x, y, w, d] of [
    [0, 30, 76, 4],
    [-34, 0, 4, 56],
    [34, 0, 4, 56],
  ] as const)
    box(white, v3(cx + x, y, SLIDE_TOP + 20), v3(w, d, 4));
  for (const x of [-26, -9, 9, 26]) box(white, v3(cx + x, 30, SLIDE_TOP + 11), v3(3, 3, 22));
  // The ladder leans on the west side: two rails and a rung at every step.
  for (const y of [-14, 14])
    tube(
      white,
      [
        { p: v3(cx - 36, y, 0), r: 2 },
        { p: v3(cx - 36, y, SLIDE_TOP), r: 2 },
      ],
      { n: 3, segs: 6 },
    );
  for (let z = 14; z < SLIDE_TOP; z += 17) box(white, v3(cx - 36, 0, z), v3(3, 30, 3));
  // The roof is a cone in violet with a gold gem on its point.
  coneRoof(b.mesh(paint(b, 'roof', TOY.purple, 6)), v3(cx, 0, 172), 62, 50, 24, 1.25);
  gem(b.mesh(b.solid('top', b.variant('top', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))), v3(cx, 0, 232), 9, {
    sides: 6,
    crown: 0.7,
    pavilion: 0.5,
  });
  // Seven stripes, the slide itself.
  const colours: Toy[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'];
  colours.forEach((c, i) => {
    const m = b.mesh(paint(b, `stripe-${i}`, TOY[c], 10 + i));
    const y = (i - 3) * 9.4;
    const pts = Array.from({ length: 26 }, (_, n) => {
      const u = n / 25;
      return { p: v3(slideX(u), y, slideZ(u)), w: 4.9, t: 1.8 };
    });
    ribbon(m, pts, v3(0, 0, 1), 4);
  });
  for (const sy of [-1, 1]) {
    const pts = Array.from({ length: 26 }, (_, n) => {
      const u = n / 25;
      return { p: v3(slideX(u), sy * 34, slideZ(u) + 7), r: 2.8 };
    });
    tube(white, pts, { n: 40, segs: 6 });
  }
  return render(b, SLIDE_CANVAS, { aoRadius: 8 }).rgba;
}

/**
 * A glossy ball rolling down the slide, frame `f` of the ride. Transparent but for the ball, on the
 * slide's own canvas.
 */
export function renderSlideBall(f: number): Rgba {
  const b = new SceneBuilder();
  const u = f / (SLIDE_BALL_FRAMES - 1);
  const m = b.mesh(paint(b, 'ball', TOY.pink, 4));
  const stripe = b.mesh(paint(b, 'ball-stripe', TOY.cream, 5));
  const c = v3(slideX(u), 0, slideZ(u) + 14);
  blob(m, c, v3(14, 14, 14), 0, { rings: 9, segs: 14 });
  blob(stripe, v3(c[0], c[1], c[2] + 12.4), v3(8, 8, 3.4), 0, { rings: 4, segs: 8 });
  return render(b, SLIDE_CANVAS, { aoRadius: 5 }).rgba;
}

export const CANNON_CANVAS: Canvas = { w: 200, h: 160, ox: 84, oy: 118 };
export const CANNON_LOOKS = ['star', 'heart'] as const;
export type CannonLook = (typeof CANNON_LOOKS)[number];
const CANNON: Record<CannonLook, { barrel: Toy; band: Toy; carriage: Toy; emblem: Toy }> = {
  star: { barrel: 'yellow', band: 'blue', carriage: 'red', emblem: 'yellow' },
  heart: { barrel: 'pink', band: 'cream', carriage: 'purple', emblem: 'pink' },
};
/** The muzzle of each cannon, relative to its ground point, so the effect can fly from it. */
export const MUZZLE = { x: 74, z: 86 } as const;

const heartPoly = (cx: number, cy: number, size: number): P2[] =>
  Array.from({ length: 28 }, (_, i): P2 => {
    const t = (i / 28) * TAU;
    return [
      cx + size * 0.0625 * 16 * Math.sin(t) ** 3,
      cy + size * 0.0625 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    ];
  });

/**
 * A painted cannon on two wheels that points east and shoots stars or hearts, never anything that
 * hurts.
 */
export function renderCannon(look: CannonLook): Rgba {
  const b = new SceneBuilder();
  const c = CANNON[look];
  const wood = paint(b, 'wheel', TOY.wood, 3);
  const hub = b.solid('hub', b.variant('hub', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }));
  const carriage = b.mesh(paint(b, 'carriage', TOY[c.carriage], 5));
  for (const sy of [-1, 1]) {
    box(carriage, v3(-4, sy * 17, 34), v3(78, 6, 24), 0, 1.2);
    extrude(b.mesh(wood), circle(22, 22), FRONT(-6, sy < 0 ? -26 : 20, 24), 0, 6, { smooth: 40 });
    extrude(b.mesh(hub), circle(7, 12), FRONT(-6, sy < 0 ? -29 : 26, 24), 0, 4);
  }
  box(carriage, v3(-4, 0, 26), v3(70, 30, 8), 0, 1);
  // The barrel rises toward the muzzle. Bands of a second colour ring it, and the mouth flares.
  const el = 0.42;
  const dir: V3 = v3(Math.cos(el), 0, Math.sin(el));
  const b0 = v3(-34, 0, 46);
  const at = (t: number): V3 => v3(b0[0] + dir[0] * t, 0, b0[2] + dir[2] * t);
  const barrel = b.mesh(paint(b, 'barrel', TOY[c.barrel], 6));
  tube(
    barrel,
    [
      { p: at(0), r: 15 },
      { p: at(30), r: 14 },
      { p: at(70), r: 13 },
      { p: at(92), r: 13.4 },
      { p: at(104), r: 18 },
      { p: at(110), r: 18 },
    ],
    { n: 22, segs: 18, capStart: true },
  );
  const band = b.mesh(paint(b, 'band', TOY[c.band], 7));
  for (const [t0, t1] of [
    [16, 22],
    [52, 58],
    [96, 101],
  ] as const)
    tube(
      band,
      [
        { p: at(t0), r: 15.4 },
        { p: at(t1), r: 15.4 },
      ],
      { n: 2, segs: 18 },
    );
  blobAlong(
    b.mesh(
      b.solid(
        'mouth',
        b.variant(
          'mouth',
          [
            [40, 24, 60],
            [64, 40, 92],
          ] as Ramp,
          { noLines: true },
        ),
      ),
    ),
    at(110.6),
    v3(14, 14, 2.4),
    v3(0, 1, 0),
    Math.PI / 2 - el,
    { rings: 4, segs: 12 },
  );
  // An emblem on the near side of the carriage.
  const emblem = b.mesh(paint(b, 'emblem', TOY[c.emblem], 8));
  const poly = look === 'star' ? starPoly(0, 0, 11, 5) : heartPoly(0, 1, 15);
  extrude(emblem, poly, FRONT(-4, -20.4, 36), 0, -2.2);
  return render(b, CANNON_CANVAS, { aoRadius: 8 }).rgba;
}

export const MORPH_CANVAS: Canvas = { w: 230, h: 260, ox: 115, oy: 196 };
export const MORPH_FRAMES = 16;
export const MORPH_LOOKS = ['apple-gem', 'berry-flower'] as const;
export type MorphLook = (typeof MORPH_LOOKS)[number];
const GLASS = r6('#cdeeff', 245, 190);

/** A thing sitting in a dome, `scale` of its full size, in whichever shape the machine knows. */
function morphItem(b: SceneBuilder, kind: 'apple' | 'gem' | 'berries' | 'flower', c: V3, scale: number): void {
  if (scale < 0.05) return;
  const s = scale;
  if (kind === 'apple') {
    blob(b.mesh(paint(b, 'apple', TOY.red, 41)), v3(c[0], c[1], c[2]), v3(11 * s, 11 * s, 10.4 * s), 0, {
      rings: 8,
      segs: 12,
    });
    tube(
      b.mesh(paint(b, 'apple-stem', TOY.wood, 42)),
      [
        { p: v3(c[0], c[1], c[2] + 9 * s), r: 1.2 * s },
        { p: v3(c[0] + 2 * s, c[1], c[2] + 16 * s), r: 1 * s },
      ],
      { n: 3, segs: 5 },
    );
    blob(
      b.mesh(paint(b, 'apple-leaf', TOY.green, 43)),
      v3(c[0] + 6 * s, c[1], c[2] + 14 * s),
      v3(6 * s, 2.4 * s, 2.6 * s),
      0.3,
      { rings: 4, segs: 6 },
    );
  } else if (kind === 'gem') {
    gem(
      b.mesh(b.solid('morph-gem', b.variant('morph-gem', GEM.sapphire, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))),
      v3(c[0], c[1], c[2] + 2 * s),
      13 * s,
      { sides: 8, crown: 0.5, pavilion: 0.9 },
    );
  } else if (kind === 'berries') {
    const m = b.mesh(paint(b, 'berry', TOY.blue, 44));
    for (const [dx, dy, dz] of [
      [-6, 0, -3],
      [6, 0, -3],
      [0, -2, 6],
      [0, 5, -2],
    ] as const)
      blob(m, v3(c[0] + dx * s, c[1] + dy * s, c[2] + dz * s), v3(6.4 * s, 6.4 * s, 6.4 * s), 0, { rings: 6, segs: 9 });
  } else {
    const petal = b.mesh(paint(b, 'petal', TOY.pink, 45));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      blob(
        petal,
        v3(c[0] + Math.cos(a) * 8 * s, c[1] + Math.sin(a) * 4.6 * s - 2 * s, c[2] + 4 * s + Math.sin(a) * 2 * s),
        v3(6 * s, 5 * s, 4 * s),
        a,
        { rings: 5, segs: 8 },
      );
    }
    blob(
      b.mesh(paint(b, 'centre', TOY.yellow, 46)),
      v3(c[0], c[1] - 3 * s, c[2] + 4.6 * s),
      v3(5 * s, 5 * s, 3.4 * s),
      0,
      { rings: 5, segs: 8 },
    );
    tube(
      b.mesh(paint(b, 'flower-stem', TOY.green, 47)),
      [
        { p: v3(c[0], c[1], c[2] - 12 * s), r: 1.6 * s },
        { p: v3(c[0], c[1], c[2] + 2 * s), r: 1.4 * s },
      ],
      { n: 3, segs: 5 },
    );
  }
}

/**
 * A machine with two glass cages joined by a pipe: what goes in at the left comes out as something
 * else at the right. Frame `f` of the cycle.
 */
export function renderMorph(look: MorphLook, f: number): Rgba {
  const b = new SceneBuilder();
  const t = f / (MORPH_FRAMES - 1);
  const [inKind, outKind] = look === 'apple-gem' ? (['apple', 'gem'] as const) : (['berries', 'flower'] as const);
  const body = look === 'apple-gem' ? TOY.teal : TOY.purple;
  const trim = look === 'apple-gem' ? TOY.yellow : TOY.pink;
  // The cycle: one thing shrinks as the other swells, the new one stays a moment, then it all runs
  // back.
  const k1 = smooth(t / 0.45);
  const k2 = smooth((t - 0.7) / 0.28);
  const into = t < 0.5 ? 1 - k1 : k2;
  const out = t < 0.5 ? k1 * (1 + 0.22 * Math.sin(Math.PI * k1)) : 1 - k2;
  const pull = t < 0.7 ? smooth(t / 0.12) : 1 - smooth((t - 0.7) / 0.24);

  const m = b.mesh(paint(b, 'body', body, 3));
  const tm = b.mesh(paint(b, 'trim', trim, 4));
  box(m, v3(0, 0, 33), v3(122, 66, 66), 0, 2);
  box(tm, v3(0, -33.4, 62), v3(124, 2, 8), 0, 0.6);
  box(tm, v3(0, -33.4, 6), v3(124, 2, 8), 0, 0.6);
  // A dial and a row of lights on the front.
  extrude(b.mesh(paint(b, 'dial', TOY.cream, 5)), circle(11, 16), FRONT(-30, -33.4, 34), 0, -3, { smooth: 40 });
  tube(
    b.mesh(b.solid('needle', b.variant('needle', TOY.red, { noLines: true }))),
    [
      { p: v3(-30, -37, 34), r: 1.4 },
      { p: v3(-30 + Math.cos(0.6 + pull * 2) * 8, -37, 34 + Math.sin(0.6 + pull * 2) * 8), r: 1.1 },
    ],
    { n: 2, segs: 5 },
  );
  [TOY.red, TOY.yellow, TOY.green].forEach((c, i) => {
    blob(b.mesh(paint(b, `lamp-${i}`, c, 10 + i)), v3(8 + i * 14, -35, 38), v3(4.6, 3, 4.6), 0, { rings: 5, segs: 8 });
  });
  // The funnel in the middle of the lid and a star on a stalk above it.
  lathe(tm, {
    c: v3(0, 0, 66),
    segs: 16,
    smooth: true,
    profile: [
      [11, 0],
      [7, 12],
      [6, 38],
      [10, 44],
    ],
  });
  gem(b.mesh(b.solid('star', b.variant('star', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))), v3(0, 0, 124), 12, {
    sides: 5,
    crown: 0.6,
    pavilion: 0.6,
  });
  tube(
    b.mesh(paint(b, 'stalk', TOY.iron, 12)),
    [
      { p: v3(0, 0, 108), r: 1.8 },
      { p: v3(0, 0, 118), r: 1.8 },
    ],
    { n: 2, segs: 6 },
  );
  // Two cages of glass ribs on rings. Their contents show through.
  const glass = b.mesh(paint(b, 'glass', GLASS, 13));
  const ringM = b.mesh(paint(b, 'ring', TOY.iron, 14));
  for (const sx of [-1, 1]) {
    const cxm = sx * 40;
    lathe(ringM, {
      c: v3(cxm, 0, 66),
      segs: 18,
      smooth: true,
      profile: [
        [26, 0],
        [26, 4],
        [22, 4],
        [22, 0],
      ],
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      const pts = Array.from({ length: 9 }, (_, n) => {
        const th = (n / 8) * Math.PI;
        return {
          p: v3(cxm + Math.cos(th) * Math.cos(a) * 24, Math.cos(th) * Math.sin(a) * 24, 68 + Math.sin(th) * 30),
          r: 1.4,
        };
      });
      tube(glass, pts, { n: 16, segs: 5 });
    }
    gem(
      b.mesh(b.solid(`knob-${sx}`, b.variant(`knob-${sx}`, GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))),
      v3(cxm, 0, 100),
      4.4,
      { sides: 6 },
    );
  }
  // The pipe that joins them, over the funnel, and a lever on the side.
  tube(
    b.mesh(paint(b, 'pipe', TOY.iron, 15)),
    [
      { p: v3(-34, 14, 70), r: 3 },
      { p: v3(-14, 16, 84), r: 3 },
      { p: v3(14, 16, 84), r: 3 },
      { p: v3(34, 14, 70), r: 3 },
    ],
    { n: 16, segs: 8 },
  );
  const ang = (70 - 55 * pull) * (Math.PI / 180);
  const pivot = v3(63, -10, 40);
  const tip = v3(pivot[0] + Math.cos(ang) * 28, pivot[1], pivot[2] + Math.sin(ang) * 28);
  tube(
    b.mesh(paint(b, 'lever', TOY.iron, 16)),
    [
      { p: pivot, r: 2.2 },
      { p: tip, r: 2.2 },
    ],
    { n: 3, segs: 6 },
  );
  blob(b.mesh(paint(b, 'knob', TOY.red, 17)), tip, v3(6, 6, 6), 0, { rings: 6, segs: 9 });
  blob(tm, pivot, v3(5, 5, 5), 0, { rings: 5, segs: 8 });
  morphItem(b, inKind, v3(-40, 0, 78), into);
  morphItem(b, outKind, v3(40, 0, 78), out);
  return render(b, MORPH_CANVAS, { aoRadius: 8 }).rgba;
}

export const BUBBLE_CANVAS: Canvas = { w: 230, h: 300, ox: 115, oy: 224 };
export const BUBBLE_FRAMES = 12;
let bubbleBase: { rgba: Rgba; ring: [number, number] } | undefined;

function bubbleMachineBase(): { rgba: Rgba; ring: [number, number] } {
  if (bubbleBase) return bubbleBase;
  const b = new SceneBuilder();
  const m = b.mesh(paint(b, 'body', TOY.purple, 3));
  const trim = b.mesh(paint(b, 'trim', TOY.yellow, 4));
  const cream = b.mesh(paint(b, 'cream', TOY.cream, 5));
  box(m, v3(0, 0, 24), v3(84, 54, 48), 0, 2);
  box(trim, v3(0, -27.4, 6), v3(86, 2, 8), 0, 0.6);
  // The fan: a ring and a dark mouth on the front, with three blades.
  extrude(cream, circle(19, 20), FRONT(0, -27.4, 26), 0, -3, { smooth: 40 });
  extrude(
    b.mesh(
      b.solid(
        'mouth',
        b.variant(
          'mouth',
          [
            [56, 36, 86],
            [86, 60, 124],
          ] as Ramp,
          { noLines: true },
        ),
      ),
    ),
    circle(15, 20),
    FRONT(0, -30.2, 26),
    0,
    -2,
    { smooth: 40 },
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    tube(
      b.mesh(b.solid(`blade-${i}`, b.variant(`blade-${i}`, TOY.cream))),
      [
        { p: v3(0, -33, 26), r: 1.4 },
        { p: v3(Math.cos(a) * 12, -33, 26 + Math.sin(a) * 12), r: 1.8 },
      ],
      { n: 2, segs: 5 },
    );
  }
  // A stalk up from the lid, and on it the wand's ring that the bubbles leave from.
  tube(
    trim,
    [
      { p: v3(0, 6, 48), r: 3.6 },
      { p: v3(0, 6, 92), r: 3 },
    ],
    { n: 4, segs: 8 },
  );
  const ringC = v3(0, 6, 108);
  tube(
    b.mesh(b.solid('wand', b.variant('wand', TOY.pink))),
    Array.from({ length: 25 }, (_, i) => ({
      p: v3(Math.cos((i / 24) * TAU) * 17 + ringC[0], ringC[1], Math.sin((i / 24) * TAU) * 17 + ringC[2]),
      r: 2.4,
    })),
    { n: 48, segs: 6 },
  );
  // Two stars and a heart on the side.
  for (const [x, c] of [
    [-26, TOY.pink],
    [26, TOY.green],
  ] as const)
    blob(b.mesh(paint(b, `dot-${x}`, c, 8)), v3(x, -28, 40), v3(5, 2, 5), 0, { rings: 5, segs: 8 });
  const r = render(b, BUBBLE_CANVAS, { aoRadius: 7 });
  bubbleBase = { rgba: r.rgba, ring: r.at(ringC) };
  return bubbleBase;
}

/**
 * The machine with bubbles leaving the ring, frame `f` of a loop. Each is a thin shining ring that
 * grows as it rises and pops at the top.
 */
export function renderBubbleMachine(f: number): Rgba {
  const base = bubbleMachineBase();
  const img: Rgba = { width: base.rgba.width, height: base.rgba.height, data: new Uint8Array(base.rgba.data) };
  const p = new Painter(img);
  const [rx, ry] = base.ring;
  const count = 9;
  for (let i = 0; i < count; i++) {
    const t = (f / BUBBLE_FRAMES + i / count) % 1;
    const size = 0.55 + ((i * 5) % 4) * 0.2;
    const r = 3 + size * 8 * (0.35 + 0.65 * t);
    const x = rx + Math.sin(t * TAU * 1.4 + i * 1.7) * (10 + 8 * t) + ((i % 3) - 1) * 12 * t;
    const y = ry - 8 - t * 120 * (0.8 + 0.2 * size);
    const alpha = t > 0.84 ? Math.max(0, (1 - t) / 0.16) : Math.min(1, t / 0.08);
    if (alpha <= 0) continue;
    const R = Math.round(r);
    for (let dy = -R - 1; dy <= R + 1; dy++) {
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = Math.hypot(dx, dy);
        const px = Math.round(x) + dx,
          py = Math.round(y) + dy;
        if (d > R + 0.4) continue;
        if (d > R - 1.1) {
          const lower = dx + dy > R * 0.5;
          p.over(px, py, lower ? [255, 196, 238] : [186, 236, 255], 0.85 * alpha);
        } else p.over(px, py, [255, 255, 255], 0.14 * alpha);
      }
    }
    p.over(Math.round(x - R * 0.45), Math.round(y - R * 0.5), [255, 255, 255], alpha);
    if (R >= 5) p.over(Math.round(x - R * 0.45) + 1, Math.round(y - R * 0.5) + 1, [255, 255, 255], 0.7 * alpha);
  }
  return img;
}

export const FROG_LILY_CANVAS: Canvas = { w: 230, h: 140, ox: 130, oy: 96 };
const FROG = r6('#74dc52', 205, 100);
const PAD = ramp(hex('#47cf8e'), {
  steps: 6,
  shadowHue: 195,
  lightHue: 110,
  lean: 1.0,
  lightness: [-0.2, -0.12, -0.05, 0, 0.07, 0.14],
});
const LOTUS = r6('#ff8fc4', 320, 55);

/**
 * A lily pad with a round green frog on it, and a smaller pad beside her that carries a pink lotus.
 * It floats in the pond; the herd taps it from the bank.
 */
export function renderFrogLily(): Rgba {
  const b = new SceneBuilder();
  // The pads, flat and round with a rim that curls up a little, and a lighter vein on each.
  const pad = b.mesh(paint(b, 'pad', PAD, 3));
  const vein = b.mesh(b.solid('vein', b.variant('vein', r6('#86e0a6', 175, 110), { noLines: true })));
  const padAt = (x: number, y: number, r: number, k: number): void => {
    lathe(pad, {
      c: v3(x, y, 0),
      segs: 26,
      smooth: true,
      profile: [
        [0, 3.2],
        [r * 0.7, 3],
        [r * 0.96, 3.6],
        [r, 5],
        [r * 0.97, 2.4],
        [r * 0.9, 0.6],
      ],
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + k;
      tube(
        vein,
        [
          { p: v3(x + Math.cos(a) * r * 0.1, y + Math.sin(a) * r * 0.1, 3.9), r: 0.7 },
          { p: v3(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, 4.2), r: 0.5 },
        ],
        { n: 3, segs: 4 },
      );
    }
  };
  padAt(0, 0, 50, 0.4);
  padAt(-74, 22, 30, 1.1);
  padAt(58, 40, 20, 2.2);
  // The frog: a round body, a wide head that is almost part of it, a pale belly, folded back legs
  // and two bulging eyes.
  const skin = b.mesh(paint(b, 'frog', FROG, 5));
  const belly = b.mesh(paint(b, 'belly', TOY.cream, 6));
  blob(skin, v3(0, 6, 20), v3(22, 24, 17), 0, { rings: 10, segs: 16 });
  blob(belly, v3(0, -9, 14), v3(12, 10, 8.5), 0, { rings: 7, segs: 12 });
  blob(skin, v3(0, -12, 26), v3(19, 14, 12.5), 0, { rings: 9, segs: 14 });
  for (const sx of [-1, 1]) {
    blob(skin, v3(sx * 19, 12, 12), v3(10, 15, 10), sx * 0.3, { rings: 7, segs: 10 });
    blob(skin, v3(sx * 17, -2, 4.4), v3(7, 11, 3.2), sx * -0.35, { rings: 5, segs: 8 });
    tube(
      skin,
      [
        { p: v3(sx * 11, -18, 12), r: 3.4 },
        { p: v3(sx * 13, -26, 6), r: 2.8 },
      ],
      { n: 4, segs: 6 },
    );
    blob(skin, v3(sx * 14, -29, 4), v3(5.2, 5.6, 2.4), 0, { rings: 5, segs: 8 });
    blob(skin, v3(sx * 10, -9, 36), v3(8.2, 8, 8.2), 0, { rings: 7, segs: 10 });
    blob(
      b.mesh(b.solid('eye', b.variant('eye', TOY.cream, { noLines: true }))),
      v3(sx * 10, -13, 37.5),
      v3(6.2, 5.4, 6.2),
      0,
      { rings: 6, segs: 9 },
    );
    blob(
      b.mesh(
        b.solid(
          'pupil',
          b.variant(
            'pupil',
            [
              [28, 24, 52],
              [52, 44, 80],
            ] as Ramp,
            { noLines: true },
          ),
        ),
      ),
      v3(sx * 10, -17.6, 37.4),
      v3(3.2, 2.4, 3.4),
      0,
      { rings: 5, segs: 8 },
    );
    blob(
      b.mesh(
        b.solid(
          'glint',
          b.variant(
            'glint',
            [
              [255, 255, 255],
              [255, 255, 255],
            ] as Ramp,
            { noLines: true },
          ),
        ),
      ),
      v3(sx * 10 - 1.2, -19.6, 39),
      v3(1.1, 0.8, 1.1),
      0,
      { rings: 3, segs: 5 },
    );
    blob(b.mesh(paint(b, 'cheek', TOY.pink, 8)), v3(sx * 15, -21, 21), v3(3.4, 1.6, 2.4), 0, { rings: 4, segs: 7 });
  }
  tube(
    b.mesh(
      b.solid(
        'smile',
        b.variant(
          'smile',
          [
            [96, 36, 56],
            [130, 56, 78],
          ] as Ramp,
          { noLines: true },
        ),
      ),
    ),
    Array.from({ length: 7 }, (_, n) => {
      const t = n / 6;
      return {
        p: v3((t - 0.5) * 18, -25.9 - Math.sin(t * Math.PI) * 0.4, 23.6 - Math.sin(t * Math.PI) * 2.8),
        r: 1.15,
      };
    }),
    { n: 12, segs: 5 },
  );
  // The lotus on the small pad: two rings of petals round a yellow heart, and a bud beside it.
  const petals = b.mesh(paint(b, 'petal', LOTUS, 9));
  const inner = b.mesh(paint(b, 'petal-in', r6('#ffc2e0', 320, 60), 10));
  const lx = -74,
    ly = 22;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    blob(petals, v3(lx + Math.cos(a) * 12, ly + Math.sin(a) * 12, 10), v3(4.6, 10, 5), a - Math.PI / 2, {
      rings: 6,
      segs: 9,
    });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    blob(inner, v3(lx + Math.cos(a) * 6.4, ly + Math.sin(a) * 6.4, 15), v3(3.6, 8.4, 6.2), a - Math.PI / 2, {
      rings: 6,
      segs: 9,
    });
  }
  blob(b.mesh(paint(b, 'heart', TOY.yellow, 11)), v3(lx, ly, 12), v3(4.4, 4.4, 3.4), 0, { rings: 5, segs: 8 });
  tube(
    b.mesh(paint(b, 'bud-stem', PAD, 12)),
    [
      { p: v3(58, 40, 4), r: 1.3 },
      { p: v3(58, 40, 10), r: 1.2 },
    ],
    { n: 3, segs: 5 },
  );
  blob(petals, v3(58, 40, 15), v3(4.6, 4.6, 7.4), 0, { rings: 6, segs: 9 });
  blob(b.mesh(paint(b, 'bud-tip', TOY.green, 13)), v3(58, 40, 10.6), v3(3.4, 3.4, 2), 0, { rings: 4, segs: 7 });
  return render(b, FROG_LILY_CANVAS, { aoRadius: 6 }).rgba;
}

export const ARCH_CANVAS: Canvas = { w: 300, h: 260, ox: 150, oy: 214 };

/**
 * The gate between the garden and the playground, one at each end: two pillars with a rainbow
 * arched between them, a gold gem on top and a balloon tied to each pillar.
 */
export function renderPlaygroundArch(): Rgba {
  const b = new SceneBuilder();
  const R = 112;
  const colours: Toy[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'];
  colours.forEach((c, i) => {
    const r = R - i * 6.4;
    const m = b.mesh(paint(b, `arc-${i}`, TOY[c], 3 + i));
    tube(
      m,
      Array.from({ length: 21 }, (_, n) => {
        const th = (n / 20) * Math.PI;
        return { p: v3(Math.cos(th) * r, 0, 44 + Math.sin(th) * r * 0.92), r: 3.6 };
      }),
      { n: 60, segs: 8 },
    );
  });
  const pillar = b.mesh(paint(b, 'pillar', TOY.cream, 20));
  const cap = b.mesh(paint(b, 'cap', TOY.pink, 21));
  for (const sx of [-1, 1]) {
    lathe(pillar, {
      c: v3(sx * (R - 22), 0, 0),
      segs: 16,
      smooth: true,
      profile: [
        [18, 0],
        [18, 6],
        [13, 10],
        [12, 40],
        [14, 44],
      ],
    });
    lathe(cap, {
      c: v3(sx * (R - 22), 0, 40),
      segs: 16,
      smooth: true,
      profile: [
        [18, 0],
        [18, 5],
        [12, 8],
        [0, 9],
      ],
    });
  }
  gem(
    b.mesh(b.solid('top', b.variant('top', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }))),
    v3(0, 0, 44 + R * 0.92 + 13),
    11,
    { sides: 6, crown: 0.7, pavilion: 0.5 },
  );
  // A balloon tied to each pillar.
  (
    [
      { sx: -1, c: TOY.red },
      { sx: 1, c: TOY.blue },
    ] as const
  ).forEach(({ sx, c }, i) => {
    const x = sx * (R - 8),
      z = 106;
    blob(b.mesh(paint(b, `balloon-${i}`, c, 30 + i)), v3(x + sx * 8, -4, z), v3(14, 14, 18), 0, { rings: 8, segs: 12 });
    tube(
      b.mesh(b.solid(`string-${i}`, b.variant(`string-${i}`, TOY.cream, { noLines: true }))),
      [
        { p: v3(x + sx * 8, -4, z - 20), r: 0.8 },
        { p: v3(x, -2, 52), r: 0.8 },
      ],
      { n: 6, segs: 5 },
    );
  });
  return render(b, ARCH_CANVAS, { aoRadius: 8 }).rgba;
}
