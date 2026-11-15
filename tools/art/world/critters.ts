import { mix, type RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { TAU, type V3, v3 } from '../core/vec';
import { type Canvas, dome, drawTiny, tone } from './critter-kit';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob, blobAlong, ribbon, tube } from './prims';
import { SceneBuilder } from './scene';

const DARK: Ramp = [
  [22, 16, 36],
  [40, 30, 62],
  [64, 50, 96],
];
const SNOUT = tone('#ff9aa8', 330, 70);
const WHITE = tone('#ffffff', 290, 80);

/**
 * Paints a one-pixel white highlight on an eye, after the render, so it lands on an exact pixel.
 */
function sparkle(img: Rgba, at: (p: V3) => [number, number], p: V3): void {
  const [x, y] = at(p);
  new Painter(img).px(x, y - 1, [255, 255, 255]);
}

/**
 * Frogs face the viewer: two big eyes and a wide smile read better than a profile, and a front view
 * needs no flipping.
 */
/** Sitting is six frames: breathing in and out, and a blink on the last. */
export const FROG: { canvas: Canvas; sitFrames: number; unit: number } = {
  canvas: { w: 64, h: 64, ox: 32, oy: 52 },
  sitFrames: 6,
  unit: 1.3,
};

export const FROG_LOOKS = {
  green: { back: tone('#5cc84a', 200, 105), belly: tone('#f1f7b0', 70, 100) },
  teal: { back: tone('#2fc4b0', 235, 120), belly: tone('#e4fbe6', 150, 100) },
  sunny: { back: tone('#f0b630', 20, 95), belly: tone('#fff2b8', 40, 100) },
} as const satisfies Record<string, { back: Ramp; belly: Ramp }>;
export type FrogName = keyof typeof FROG_LOOKS;

export type FrogClip = 'sit' | 'crouch' | 'air';
const EYE_WHITE = tone('#fffdf4', 280, 80);
const CHEEK = tone('#ff9ab0', 330, 70);

interface FrogPose {
  /** Scales of the body: crouching is wide and low, in the air tall and narrow. */
  sx: number;
  sz: number;
  /** How far the whole frog is lifted off the ground, and how far the feet trail below it. */
  lift: number;
  throat: number;
}
const FROG_POSE: Record<FrogClip, FrogPose> = {
  sit: { sx: 1, sz: 1, lift: 0, throat: 0 },
  crouch: { sx: 1.1, sz: 0.8, lift: 0, throat: 0 },
  air: { sx: 0.92, sz: 1.18, lift: 4, throat: 0 },
};

function frog(look: (typeof FROG_LOOKS)[FrogName], o: FrogPose): SceneBuilder {
  const b = new SceneBuilder();
  const back = b.variant('back', look.back);
  const belly = b.variant('belly', look.belly);
  const white = b.variant('white', EYE_WHITE, { noLines: true, priority: 2 });
  const dark = b.variant('dark', DARK, { noLines: true, protect: true, priority: 3 });
  const cheek = b.variant('cheek', CHEEK, { noLines: true, priority: 2 });
  const mat = b.material({
    name: 'frog',
    shade: (s) => (s.n[1] < -0.45 && s.rest[2] < 7.8 && s.rest[1] < -3 && Math.abs(s.rest[0]) < 5.4 ? belly : back),
  });
  const limbMat = b.solid('limb', back);
  const whiteMat = b.solid('white', white);
  const darkMat = b.solid('dark', dark);
  const cheekMat = b.solid('cheek', cheek);
  const { sx, sz, lift } = o;
  const body = b.mesh(mat);
  blob(body, v3(0, 0, 9.5 * sz + lift), v3(13 * sx, 11, 9.4 * sz), 0, { rings: 9, segs: 14 });
  blob(body, v3(0, -6, 12.2 * sz + lift), v3(11.6 * sx, 8, 7.4 * sz), 0, { rings: 8, segs: 13 });
  // The throat swells and falls as it breathes.
  const throat = b.mesh(mat, { noLines: true });
  blob(throat, v3(0, -10.4, 7 * sz + lift), v3((5.2 + o.throat * 1.2) * sx, 3.3, 3.5 * sz + o.throat * 1.1), 0, {
    rings: 5,
    segs: 9,
  });
  for (const side of [-1, 1]) {
    // Eyes bulge from the top of the head; the white shows round the dark.
    const eyeAt = v3(side * 6.4 * sx, -5, 19.6 * sz + lift);
    const lid = b.mesh(mat);
    blob(lid, v3(eyeAt[0], eyeAt[1], eyeAt[2] - 1.3), v3(5.6 * sx, 5, 4.8 * sz), 0, { rings: 6, segs: 10 });
    const ball = b.mesh(whiteMat, { noLines: true });
    blob(ball, v3(eyeAt[0], eyeAt[1] - 1.2, eyeAt[2] + 0.4), v3(4.6 * sx, 4.2, 4.5 * sz), 0, { rings: 7, segs: 11 });
    const pupil = b.mesh(darkMat, { noLines: true });
    blob(pupil, v3(eyeAt[0] + side * -0.2, eyeAt[1] - 4.9, eyeAt[2] - 0.2), v3(2.3 * sx, 1.3, 2.9 * sz), 0, {
      rings: 5,
      segs: 8,
    });
    // Rosy cheeks.
    const blush = b.mesh(cheekMat, { noLines: true });
    blob(blush, v3(side * 10.6 * sx, -9.4, 9.6 * sz + lift), v3(3, 1.4, 2.2), side * 0.3, { rings: 4, segs: 7 });
    // Front legs, short and straight, with flat feet turned out.
    const arm = b.mesh(limbMat, { noLines: true });
    tube(
      arm,
      [
        { p: v3(side * 6.8 * sx, -8, 6 * sz + lift), r: 2.5 },
        { p: v3(side * 7.8 * sx, -12, lift > 0 ? 4.6 : 1.2), r: 2.1 },
      ],
      { segs: 6, n: 5, capEnd: true },
    );
    blob(arm, v3(side * 8.6 * sx, -13.4, lift > 0 ? 4.2 : 0.8), v3(3.3, 2.7, 0.9), side * 0.35, { rings: 4, segs: 7 });
    // Hind legs: a big folded thigh at the side and a long foot, or stretched down in the air.
    const leg = b.mesh(limbMat);
    if (lift > 0) {
      tube(
        leg,
        [
          { p: v3(side * 11 * sx, 2, 8 * sz + lift), r: 4.8 },
          { p: v3(side * 14, 0, 5 + lift * 0.3), r: 3.2 },
          { p: v3(side * 15, -3, 1.6), r: 2.2 },
        ],
        { segs: 7, n: 8, capEnd: true },
      );
      blob(leg, v3(side * 15.6, -6, 0.9), v3(3.6, 5.2, 1), side * 0.25, { rings: 4, segs: 7 });
    } else {
      blob(leg, v3(side * 11.6 * sx, 1.5, 6.4 * sz), v3(4.6, 8.8, 6 * sz), 0, { rings: 7, segs: 10 });
      blob(leg, v3(side * 12.6 * sx, -6.4, 1.1), v3(3.8, 6, 1.1), side * 0.18, { rings: 4, segs: 8 });
    }
  }
  return b;
}

export function renderFrog(name: FrogName, clip: FrogClip, frame: number): Rgba {
  const pose = FROG_POSE[clip];
  const blink = clip === 'sit' && frame % FROG.sitFrames === FROG.sitFrames - 1;
  const { rgba, at } = drawTiny(
    frog(FROG_LOOKS[name], { ...pose, throat: clip === 'sit' ? Math.floor(frame / 2) % 2 : 0 }),
    FROG.canvas,
    { unit: FROG.unit },
  );
  const p = new Painter(rgba);
  const { sx, sz, lift } = pose;
  // The last sitting frame blinks: a green lid line across each eye. Otherwise a highlight sits on
  // each pupil.
  for (const side of [-1, 1]) {
    const [px, py] = at(v3(side * 6.4 * sx, -9.9, 19.4 * sz + lift));
    if (blink) {
      for (let k = -4; k <= 4; k++)
        p.px(Math.round(px) + k, Math.round(py) - 1 + (Math.abs(k) > 2 ? 1 : 0), [44, 120, 52]);
    } else {
      p.px(Math.round(px) - 1, Math.round(py) - 2, [255, 255, 255]);
      p.px(Math.round(px), Math.round(py) - 2, [255, 255, 255]);
    }
  }
  // The smile: from one cheek to the other, ends turned up.
  let last: [number, number] | null = null;
  for (let k = 0; k <= 14; k++) {
    const t = k / 14,
      x = (t - 0.5) * 16 * sx;
    const [mx, my] = at(v3(x, -12.6 + Math.abs(x) * 0.12, (9.4 + (Math.abs(t - 0.5) * 2) ** 2 * 2.9) * sz + lift));
    const cur: [number, number] = [Math.round(mx), Math.round(my)];
    if (last) {
      p.line(last[0], last[1], cur[0], cur[1], [70, 34, 62]);
      p.line(last[0], last[1] + 1, cur[0], cur[1] + 1, [70, 34, 62]);
    }
    last = cur;
  }
  return rgba;
}

export const DUCK: { canvas: Canvas; floatFrames: number } = {
  canvas: { w: 84, h: 64, ox: 42, oy: 44 },
  floatFrames: 2,
};

export const DUCK_LOOKS = {
  white: {
    body: tone('#fffaf0', 290, 80),
    head: tone('#fffaf0', 290, 80),
    bill: tone('#ff9a2e', 330, 70),
    wing: tone('#e4dcec', 290, 85),
  },
  yellow: {
    body: tone('#ffe45c', 30, 95),
    head: tone('#ffe45c', 30, 95),
    bill: tone('#ff9a2e', 330, 70),
    wing: tone('#f4c93a', 25, 90),
  },
  mallard: {
    body: tone('#b98a62', 320, 70),
    head: tone('#1f9a6a', 215, 110),
    bill: tone('#f2d23a', 30, 95),
    wing: tone('#8c6a4e', 310, 65),
  },
} as const satisfies Record<string, { body: Ramp; head: Ramp; bill: Ramp; wing: Ramp }>;
export type DuckName = keyof typeof DUCK_LOOKS;

function duck(look: (typeof DUCK_LOOKS)[DuckName], o: { quack: boolean; wag: number }): SceneBuilder {
  const b = new SceneBuilder();
  const body = b.variant('body', look.body);
  const head = b.variant('head', look.head);
  const billV = b.variant('bill', look.bill, { noLines: true });
  const wing = b.variant('wing', look.wing);
  const dark = b.variant('dark', DARK, { noLines: true, protect: true, priority: 3 });
  const bodyMat = b.solid('body', body);
  const headMat = b.solid('head', head);
  const billMat = b.solid('bill', billV);
  const wingMat = b.solid('wing', wing);
  const darkMat = b.solid('dark', dark);
  const m = b.mesh(bodyMat);
  blobAlong(m, v3(-2, 0, 8), v3(19, 12.5, 9.5), v3(0, 1, 0), 0.06, { rings: 9, segs: 14 });
  // The tail tips up behind.
  blobAlong(m, v3(-19, 0, 12.4 + o.wag * 0.6), v3(7, 4.4, 4.6), v3(0, 1, 0), -0.55, { rings: 6, segs: 9 });
  // The folded wing is a long teardrop lying along the flank, its tip lifted behind.
  for (const side of [-1, 1]) {
    const w = b.mesh(wingMat);
    blobAlong(w, v3(-5, side * 9.6, 10.6), v3(12.5, 3.4, 5.4), v3(0, 1, 0), 0.34, { rings: 7, segs: 11 });
  }
  // Neck and head, the head thrown back a little to quack.
  const hy = o.quack ? 2 : 0;
  const neck = b.mesh(headMat);
  tube(
    neck,
    [
      { p: v3(10, 0, 12), r: 6.2 },
      { p: v3(13.5, 0, 17.5), r: 5.4 },
      { p: v3(15, 0, 23 + hy), r: 5.2 },
    ],
    { segs: 10, n: 8, capEnd: true },
  );
  const h = b.mesh(headMat);
  blob(h, v3(15.5, 0, 25 + hy), v3(7.6, 7, 7), 0, { rings: 8, segs: 12 });
  const bill = b.mesh(billMat, { noLines: true });
  blob(bill, v3(23, 0, 23.6 + hy + (o.quack ? 1 : 0)), v3(5.6, 3.7, 1.7), 0, { rings: 5, segs: 9 });
  if (o.quack) blob(bill, v3(22.4, 0, 20.4 + hy), v3(4.4, 3.1, 1.2), 0, { rings: 4, segs: 8 });
  for (const side of [-1, 1]) {
    const eye = b.mesh(darkMat, { noLines: true });
    blob(eye, v3(19, side * 5.6, 27 + hy), v3(1.8, 1.6, 2.1), 0, { rings: 5, segs: 8 });
  }
  return b;
}

export function renderDuck(name: DuckName, clip: 'float' | 'quack', frame: number): Rgba {
  const { rgba, at } = drawTiny(duck(DUCK_LOOKS[name], { quack: clip === 'quack', wag: frame % 2 }), DUCK.canvas);
  const hy = clip === 'quack' ? 2 : 0;
  sparkle(rgba, at, v3(19, -5.6, 28 + hy));
  // The waterline: the body sits in the pond, so a pale ripple wraps round where it meets the
  // water.
  const p = new Painter(rgba);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU;
    const [x, y] = at(v3(Math.cos(a) * 24 - 2, Math.sin(a) * 15, 0.5));
    const lit = Math.sin(a) > -0.1;
    if (lit) p.over(x, y, [236, 249, 255], 0.55 + 0.2 * Math.sin(a * 3 + frame));
  }
  return rgba;
}

export const BUNNY: { canvas: Canvas; sitFrames: number } = { canvas: { w: 72, h: 80, ox: 36, oy: 62 }, sitFrames: 2 };

export const BUNNY_LOOKS = {
  white: { fur: tone('#f7f2ec', 290, 80), inner: tone('#ffb3c6', 330, 70) },
  grey: { fur: tone('#aaa6bc', 275, 90), inner: tone('#f2b5c8', 330, 70) },
  caramel: { fur: tone('#dba066', 320, 75), inner: tone('#ffc0c8', 335, 70) },
} as const satisfies Record<string, { fur: Ramp; inner: Ramp }>;
export type BunnyName = keyof typeof BUNNY_LOOKS;

function bunny(look: (typeof BUNNY_LOOKS)[BunnyName], o: { hop: boolean; twitch: number }): SceneBuilder {
  const b = new SceneBuilder();
  const fur = b.variant('fur', look.fur);
  const inner = b.variant('inner', look.inner, { noLines: true, priority: 2 });
  const dark = b.variant('dark', DARK, { noLines: true, protect: true, priority: 3 });
  const nose = b.variant('nose', SNOUT, { noLines: true, priority: 2 });
  const white = b.variant('white', WHITE);
  const furMat = b.solid('fur', fur);
  const innerMat = b.solid('inner', inner);
  const darkMat = b.solid('dark', dark);
  const noseMat = b.solid('nose', nose);
  const whiteMat = b.solid('white', white);
  const stretch = o.hop ? 1 : 0;
  const body = b.mesh(furMat);
  blobAlong(
    body,
    v3(0 - stretch * 2, 0, 11 + stretch * 3),
    v3(12.5 + stretch * 5, 10, 10.6 - stretch * 2),
    v3(0, 1, 0),
    stretch * -0.35,
    { rings: 9, segs: 13 },
  );
  const hx = 11 + stretch * 7,
    hz = 22 + stretch * 1;
  blob(body, v3(hx, 0, hz), v3(8.6, 7.8, 7.6), 0, { rings: 8, segs: 12 });
  // Long ears that lean back, one twitching.
  for (const side of [-1, 1]) {
    const lean = (o.hop ? 0.9 : 0.22) + (side === 1 ? o.twitch * 0.22 : 0);
    const ear = b.mesh(furMat);
    const ex = hx - 2 - Math.sin(lean) * 8,
      ez = hz + 7 + Math.cos(lean) * 8;
    blobAlong(ear, v3(ex, side * 3.4, ez), v3(2.7, 2.2, 10), v3(0, 1, 0), -lean, { rings: 6, segs: 9 });
    const lining = b.mesh(innerMat, { noLines: true });
    blobAlong(lining, v3(ex + 0.7, side * 4.9, ez + 0.4), v3(1.2, 0.9, 7.6), v3(0, 1, 0), -lean, { rings: 5, segs: 8 });
  }
  const tailB = b.mesh(whiteMat);
  blob(tailB, v3(-12 - stretch * 6, 0, 8 + stretch * 2), v3(4.8, 4.8, 4.8), 0, { rings: 6, segs: 9 });
  const n = b.mesh(noseMat, { noLines: true });
  blob(n, v3(hx + 8.1, 0, hz - 0.6), v3(1.6, 1.8, 1.4), 0, { rings: 4, segs: 7 });
  for (const side of [-1, 1]) {
    const eye = b.mesh(darkMat, { noLines: true });
    blob(eye, v3(hx + 4.4, side * 6.6, hz + 1.8), v3(2, 1.8, 2.6), 0, { rings: 5, segs: 8 });
  }
  // Paws and big hind feet.
  for (const side of [-1, 1]) {
    const paw = b.mesh(furMat);
    if (!o.hop) {
      blob(paw, v3(8, side * 4.6, 2.2), v3(3.4, 2.4, 2.4), 0, { rings: 4, segs: 7 });
      blob(paw, v3(0, side * 8.4, 1.8), v3(9, 3.2, 2), 0, { rings: 5, segs: 8 });
    } else {
      tube(
        paw,
        [
          { p: v3(8, side * 5, 8), r: 2.2 },
          { p: v3(15, side * 5.2, 4.4), r: 1.8 },
        ],
        { segs: 6, n: 4, capEnd: true },
      );
      blob(paw, v3(-12, side * 7, 2), v3(11, 3.2, 2), 0, { rings: 5, segs: 8 });
    }
  }
  return b;
}

export function renderBunny(name: BunnyName, clip: 'sit' | 'hop', frame: number): Rgba {
  const hop = clip === 'hop';
  const { rgba, at } = drawTiny(bunny(BUNNY_LOOKS[name], { hop, twitch: frame % 2 }), BUNNY.canvas);
  const s = hop ? 1 : 0;
  sparkle(rgba, at, v3(11 + s * 7 + 4.4, -6.6, 22 + s + 2.2));
  // Whiskers.
  const p = new Painter(rgba);
  const [wx, wy] = at(v3(11 + s * 7 + 7.4, -5.6, 22 + s - 1.6));
  for (const [dx, dy] of [
    [3, -1],
    [4, 0],
    [3, 1],
  ] as const)
    for (let k = 0; k < 3; k++) p.over(wx + dx + k, wy + dy * (k === 2 ? 1 : 0), [255, 255, 255], 0.7);
  return rgba;
}

export const SNAIL: { canvas: Canvas; crawlFrames: number } = {
  canvas: { w: 60, h: 48, ox: 30, oy: 36 },
  crawlFrames: 2,
};

export const SNAIL_LOOKS = {
  peach: { shell: tone('#ff9a6a', 330, 70), stripe: tone('#ffd8a8', 40, 90) },
  violet: { shell: tone('#a07af0', 275, 330), stripe: tone('#e2c8ff', 290, 330) },
  mint: { shell: tone('#52d0a0', 200, 120), stripe: tone('#c8f6d8', 120, 110) },
} as const satisfies Record<string, { shell: Ramp; stripe: Ramp }>;
export type SnailName = keyof typeof SNAIL_LOOKS;

const SLIME = tone('#e8d4b0', 320, 80);

function snail(look: (typeof SNAIL_LOOKS)[SnailName], o: { reach: number }): SceneBuilder {
  const b = new SceneBuilder();
  const flesh = b.variant('flesh', SLIME);
  const shell = b.variant('shell', look.shell);
  const stripe = b.variant('stripe', look.stripe);
  const dark = b.variant('dark', DARK, { noLines: true, protect: true, priority: 3 });
  const fleshMat = b.solid('flesh', flesh);
  // The shell's pale bands wind round it with the spiral.
  const shellMat = b.material({
    name: 'shell',
    shade: (s) =>
      Math.sin(Math.atan2(s.rest[2] - 15, s.rest[0] + 4) * 3 + Math.hypot(s.rest[2] - 15, s.rest[0] + 4) * 0.55) > 0.55
        ? stripe
        : shell,
  });
  const darkMat = b.solid('dark', dark);
  const body = b.mesh(fleshMat);
  // A long low foot, lifted at the front into a neck that stretches as it crawls.
  blob(body, v3(-1, 0, 3.3), v3(16, 6.4, 3.4), 0, { rings: 6, segs: 10 });
  tube(
    body,
    [
      { p: v3(8, 0, 4), r: 4.4 },
      { p: v3(14 + o.reach, 0, 8), r: 3.7 },
      { p: v3(18 + o.reach * 1.4, 0, 12.5), r: 3.3 },
    ],
    { segs: 9, n: 8, capEnd: true },
  );
  for (const side of [-1, 1]) {
    const stalk = b.mesh(fleshMat, { noLines: true });
    tube(
      stalk,
      [
        { p: v3(18.4 + o.reach * 1.4, side * 1.6, 14), r: 0.9 },
        { p: v3(20 + o.reach * 1.6, side * 3, 21 + o.reach * 0.4), r: 0.8 },
      ],
      { segs: 5, n: 4, capEnd: true },
    );
    const eye = b.mesh(darkMat, { noLines: true });
    blob(eye, v3(20.4 + o.reach * 1.6, side * 3.2, 22.2 + o.reach * 0.4), v3(1.7, 1.7, 1.7), 0, { rings: 4, segs: 7 });
  }
  const sh = b.mesh(shellMat);
  const path: V3[] = [];
  const turns = 2.3;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * turns * TAU + 0.4;
    const r = 2 + (1 - t) * 6.4;
    path.push(v3(-4 + Math.cos(a) * r * 1.05, 0, 15 + Math.sin(a) * r));
  }
  tube(
    sh,
    path.map((p, i) => ({ p, r: 2.4 + (i / 14) * 5.6 })),
    { segs: 11, n: 56, capEnd: true, capStart: true, up: v3(0, 1, 0) },
  );
  return b;
}

export function renderSnail(name: SnailName, frame: number): Rgba {
  const reach = frame % 2 === 0 ? 0 : 2.4;
  const { rgba, at } = drawTiny(snail(SNAIL_LOOKS[name], { reach }), SNAIL.canvas);
  sparkle(rgba, at, v3(20.4 + reach * 1.6, -3.2, 23.2 + reach * 0.4));
  return rgba;
}

export const LADYBUG: { canvas: Canvas; walkFrames: number; flyFrames: number } = {
  canvas: { w: 48, h: 40, ox: 24, oy: 30 },
  walkFrames: 2,
  flyFrames: 2,
};

export const LADYBUG_LOOKS = {
  red: { shell: tone('#ec3a4a', 335, 55) },
  orange: { shell: tone('#ff8a32', 330, 70) },
  yellow: { shell: tone('#ffd33a', 30, 95) },
} as const satisfies Record<string, { shell: Ramp }>;
export type LadybugName = keyof typeof LADYBUG_LOOKS;

const INK: RGB = [30, 22, 44];
const SPOT_AT: readonly (readonly [number, number])[] = [
  [-0.5, -0.5],
  [0.02, -0.55],
  [0.5, -0.46],
  [-0.5, 0.5],
  [0.02, 0.55],
  [0.5, 0.46],
];

/**
 * Painted by hand, since she is a few dozen pixels across: a round shell with a seam and six spots,
 * a dark head, three legs a side.
 */
export function renderLadybug(name: LadybugName, clip: 'walk' | 'fly', frame: number): Rgba {
  const { shell } = LADYBUG_LOOKS[name];
  const img = createRgba(LADYBUG.canvas.w, LADYBUG.canvas.h);
  const p = new Painter(img);
  const fly = clip === 'fly';
  const beat = frame % 2;
  const cx = 22,
    cy = fly ? 21 : 22,
    rx = 11.5,
    ry = 9.4;
  const outline = mix(shell[0]!, INK, 0.55);

  if (fly) {
    // Two see-through wings, up on the first frame and spread on the second.
    const spread = beat === 0 ? 6.5 : 10;
    for (const side of [-1, 1]) {
      const wy = cy + side * (ry * 0.4 + spread),
        tilt = side * (beat === 0 ? 0.35 : 0.12);
      for (let y = Math.floor(wy - 7); y <= Math.ceil(wy + 7); y++) {
        for (let x = Math.floor(cx - 14); x <= Math.ceil(cx + 10); x++) {
          const dx = x + 0.5 - (cx - 2),
            dy = y + 0.5 - wy - tilt * (x - cx) * 0.5;
          const d = Math.hypot(dx / 11, dy / 3.6);
          if (d > 1) continue;
          p.over(x, y, d > 0.82 ? [200, 190, 235] : [244, 242, 255], d > 0.82 ? 0.9 : 0.62);
        }
      }
    }
  } else {
    // Three legs a side, the pairs taking turns.
    for (const side of [-1, 1]) {
      for (const [lx, phase] of [
        [7, 0],
        [0, 1],
        [-7, 0],
      ] as const) {
        const kick = phase === beat ? 1.5 : -1.5;
        const y0 = Math.round(cy + side * (ry - 1.5));
        p.line(Math.round(cx + lx), y0, Math.round(cx + lx + kick), y0 + side * 4, INK);
        p.px(Math.round(cx + lx + kick), y0 + side * 4 + side, INK);
      }
    }
  }

  const marks = (nx: number, ny: number, lit: number): RGB | null => {
    if (Math.abs(ny) < 0.075) return INK;
    for (const [sx, sy] of SPOT_AT)
      if (Math.hypot((nx - sx) * rx, (ny - sy) * ry) < 2.3) return lit > 0.85 ? [70, 52, 96] : INK;
    return null;
  };
  if (fly) {
    // The shell is split and lifted: the dark back shows between the halves.
    dome(p, cx, cy, rx * 0.86, ry * 0.7, [
      [26, 20, 40],
      [40, 32, 62],
      [60, 48, 92],
    ]);
    for (const side of [-1, 1] as const) {
      const lift = side * (beat === 0 ? 3.2 : 2);
      const half = new Painter(createRgba(LADYBUG.canvas.w, LADYBUG.canvas.h));
      dome(half, cx, cy, rx, ry, shell, { outline, colorAt: marks, skip: (_nx, ny) => Math.sign(ny) !== side });
      for (let y = 0; y < half.h; y++) {
        for (let x = 0; x < half.w; x++) {
          const c = half.get(x, y);
          if (c[3] === 255) p.px(x, Math.round(y + lift), [c[0], c[1], c[2]]);
        }
      }
    }
  } else {
    dome(p, cx, cy, rx, ry, shell, { outline, colorAt: marks });
  }

  // The head, black with two white cheeks, and a pair of feelers.
  const hx = cx + rx - 1.4;
  dome(
    p,
    hx,
    cy,
    3.9,
    4.3,
    [
      [20, 14, 34],
      [32, 24, 52],
      [48, 38, 74],
    ],
    {},
  );
  for (const side of [-1, 1]) {
    p.px(Math.round(hx + 1.6), Math.round(cy + side * 2.4), [255, 255, 255]);
    p.px(Math.round(hx + 2.6), Math.round(cy + side * 2.4), [255, 255, 255]);
    p.line(Math.round(hx + 3), Math.round(cy + side * 1.6), Math.round(hx + 6), Math.round(cy + side * 5.6), INK);
    p.px(Math.round(hx + 7), Math.round(cy + side * 6.2), INK);
  }
  // A glint on the shell.
  const g = shell[shell.length - 1]!;
  p.px(Math.round(cx - 5), Math.round(cy - 5), mix(g, [255, 255, 255], 0.7));
  p.px(Math.round(cx - 4), Math.round(cy - 5), mix(g, [255, 255, 255], 0.5));
  return img;
}

export const FISH: { canvas: Canvas; leapFrames: number; swimFrames: number } = {
  canvas: { w: 72, h: 72, ox: 36, oy: 36 },
  leapFrames: 3,
  swimFrames: 2,
};

export const FISH_LOOKS = {
  koi: { body: tone('#ff8a3a', 330, 70), fin: tone('#ffb070', 340, 80), patch: tone('#fff4ea', 300, 80) },
  blue: { body: tone('#4aa0ff', 255, 130), fin: tone('#9ad0ff', 250, 140), patch: tone('#e4f4ff', 250, 150) },
  gold: { body: tone('#ffc83a', 25, 95), fin: tone('#ffe68a', 30, 100), patch: tone('#fff6c8', 40, 100) },
} as const satisfies Record<string, { body: Ramp; fin: Ramp; patch: Ramp }>;
export type FishName = keyof typeof FISH_LOOKS;

/**
 * A fish in the air, along the x axis and tipped by `pitch` (positive lifts the nose). Positions
 * are turned about the middle.
 */
function fish(look: (typeof FISH_LOOKS)[FishName], o: { pitch: number; flick: number }): SceneBuilder {
  const b = new SceneBuilder();
  const body = b.variant('body', look.body);
  const fin = b.variant('fin', look.fin, { noLines: true });
  const patch = b.variant('patch', look.patch);
  const dark = b.variant('dark', DARK, { noLines: true, protect: true, priority: 3 });
  const bodyMat = b.material({
    name: 'body',
    shade: (s) => (Math.sin(s.rest[0] * 0.5 + 2) > 0.5 && s.rest[2] > -1 ? patch : body),
  });
  const finMat = b.solid('fin', fin);
  const darkMat = b.solid('dark', dark);
  const c = Math.cos(o.pitch),
    s = Math.sin(o.pitch);
  /** Turns a point of the fish, given along its length, across it and up, into the scene. */
  const at = (x: number, y: number, z: number): V3 => v3(x * c - z * s, y, x * s + z * c);
  const m = b.mesh(bodyMat);
  blobAlong(m, at(0, 0, 0), v3(16, 6, 7.4), v3(0, 1, 0), -o.pitch, { rings: 8, segs: 13 });
  blobAlong(m, at(8, 0, 0.6), v3(10, 5.2, 6.4), v3(0, 1, 0), -o.pitch, { rings: 7, segs: 11 });
  // Tail: a vertical fan that flicks to one side.
  const tail = b.mesh(finMat, { noLines: true });
  ribbon(
    tail,
    [
      { p: at(-14, 0, 0), w: 1.6, t: 1 },
      { p: at(-20, o.flick, 2.6), w: 4.5, t: 0.7 },
      { p: at(-26, o.flick * 1.6, 5), w: 3, t: 0.5 },
    ],
    v3(0, 1, 0),
    5,
  );
  ribbon(
    tail,
    [
      { p: at(-14, 0, 0), w: 1.6, t: 1 },
      { p: at(-20, o.flick, -2.6), w: 4.5, t: 0.7 },
      { p: at(-26, o.flick * 1.6, -5), w: 3, t: 0.5 },
    ],
    v3(0, 1, 0),
    5,
  );
  const dorsal = b.mesh(finMat, { noLines: true });
  ribbon(
    dorsal,
    [
      { p: at(5, 0, 6), w: 1.6, t: 0.6 },
      { p: at(-2, 0, 11), w: 4, t: 0.6 },
      { p: at(-9, 0, 6.5), w: 1.4, t: 0.5 },
    ],
    v3(0, 1, 0),
    5,
  );
  for (const side of [-1, 1]) {
    const flipper = b.mesh(finMat, { noLines: true });
    ribbon(
      flipper,
      [
        { p: at(4, side * 5.6, -2), w: 1.4, t: 0.6 },
        { p: at(-1, side * 9.6, -4.4), w: 3.4, t: 0.6 },
        { p: at(-5, side * 10.6, -5.6), w: 1.2, t: 0.5 },
      ],
      v3(0, 0, 1),
      5,
    );
    const eye = b.mesh(darkMat, { noLines: true });
    blob(eye, at(13, side * 4.1, 2.2), v3(2, 1.7, 2), 0, { rings: 5, segs: 8 });
  }
  return b;
}

export function renderFish(name: FishName, clip: 'leap', frame: number): Rgba {
  void clip;
  const pitch = [0.95, 0.05, -0.95][frame % 3]!;
  const flick = [2.2, -1.8, 2][frame % 3]!;
  const { rgba, at } = drawTiny(fish(FISH_LOOKS[name], { pitch, flick }), FISH.canvas);
  const c = Math.cos(pitch),
    s = Math.sin(pitch);
  sparkle(rgba, at, v3(13 * c - 2.2 * s, -4.1, 13 * s + 2.2 * c));
  return rgba;
}

/**
 * What a fish seen through the water is drawn on: a little wider than it is tall, nose to the east.
 */
export const FISH_SWIM: { canvas: Canvas; frames: number } = { canvas: { w: 56, h: 28, ox: 28, oy: 14 }, frames: 2 };

/**
 * A fish seen from above through the water: its own colours softened toward the blue of the pond, a
 * darker edge so the shape holds, a tail that wags and a pair of small fins. It is painted flat
 * because it lies under the surface.
 */
export function renderFishShade(name: FishName, frame: number): Rgba {
  const look = FISH_LOOKS[name];
  const { w, h } = FISH_SWIM.canvas;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const water: RGB = [46, 112, 186];
  const body = mix(look.body[1]!, water, 0.18);
  const edge = mix(look.body[0]!, [16, 44, 100], 0.4);
  const fin = mix(look.fin[1]!, water, 0.3);
  const patch = mix(look.patch[1]!, water, 0.22);
  const wag = Math.sin((frame / FISH_SWIM.frames) * TAU) * 2.4;
  const cy = h / 2;
  const nose = 47,
    root = 17,
    length = nose - root;
  // How far the body reaches from its middle line at a place along it: a round nose, widest a third
  // of the way back.
  const half = (t: number): number =>
    t <= 0 || t >= 1 ? 0 : 6.8 * Math.sqrt(Math.max(0, 1 - (2 * t ** 0.7 - 1) ** 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5,
        py = y + 0.5;
      const t = (nose - px) / length;
      // The tail fans out behind the root, forked, and swings from side to side.
      const k = (root - px) / (root - 3);
      if (k > 0 && k < 1) {
        const mid = cy + wag * k * k;
        const reach = 1.1 + 6.4 * k ** 0.8;
        const off = Math.abs(py - mid);
        const fork = k > 0.62 ? (k - 0.62) * 9 : 0;
        if (off < reach && off >= fork) p.over(x, y, fin, 0.9);
      }
      // A small fin each side, swept back from just behind the head.
      for (const side of [-1, 1]) {
        const fx = (px - 38) / 5.2,
          fy = (py - (cy + side * (half(0.3) + 1.2) + (38 - px) * side * 0.22)) / 1.9;
        if (fx * fx + fy * fy < 1) p.over(x, y, fin, 0.85);
      }
      const reach = half(t);
      const off = Math.abs(py - cy);
      if (off < reach) {
        const rim = reach - off < 1.15 || t < 0.06;
        const mark = name === 'koi' && off < reach * 0.7 && Math.sin(t * 15 + 0.6) > 0.3 && t > 0.22 && t < 0.92;
        const back = off < 1.4 && t > 0.12;
        p.over(x, y, rim ? edge : mark ? patch : back ? mix(body, patch, 0.35) : body, 0.97);
      }
    }
  }
  // An eye on each side of the head.
  for (const dy of [-3, 3]) p.over(nose - 7, Math.round(cy + dy - 0.5), [14, 20, 44], 0.95);
  return img;
}
