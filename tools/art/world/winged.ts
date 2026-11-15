import { mix, type RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { TAU, type V3, v3 } from '../core/vec';
import { type Canvas, drawTiny, tone } from './critter-kit';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob, blobAlong, tube } from './prims';
import { SceneBuilder } from './scene';

/**
 * Creatures that live in the air: butterflies, dragonflies, bees and the fairies. Their wings are
 * painted flat, pixel by pixel, because a wing is nearly see-through and a painted one can be.
 * Bodies are rendered, so they are lit like the rest.
 */

/**
 * The rotated ellipse a wing is cut from, as local coordinates: `u` along its length, `v` across,
 * and `d` out from the middle.
 */
interface Local {
  u: number;
  v: number;
  d: number;
}

/** Fills a rotated ellipse. `paint` returns a colour for a pixel, or null to leave it clear. */
function leaf(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  paint: (l: Local, x: number, y: number) => readonly [number, number, number, number] | null,
): void {
  const reach = Math.ceil(Math.max(rx, ry)) + 2;
  const c = Math.cos(rot),
    s = Math.sin(rot);
  for (let y = Math.floor(cy) - reach; y <= Math.ceil(cy) + reach; y++) {
    for (let x = Math.floor(cx) - reach; x <= Math.ceil(cx) + reach; x++) {
      const dx = x + 0.5 - cx,
        dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / rx;
      const v = (-dx * s + dy * c) / ry;
      const d = Math.hypot(u, v);
      if (d > 1) continue;
      const col = paint({ u, v, d }, x, y);
      if (col) p.over(x, y, [col[0], col[1], col[2]], col[3] / 255);
    }
  }
}

const rgb = (r: Ramp, i: number): RGB => r[Math.max(0, Math.min(r.length - 1, i))]!;

export const BUTTERFLY: { canvas: Canvas; frames: number } = { canvas: { w: 64, h: 56, ox: 32, oy: 44 }, frames: 4 };

export const BUTTERFLY_LOOKS = {
  monarch: {
    wing: tone('#ff8a22', 330, 70),
    edge: tone('#2a1c3a', 280, 280),
    spots: [255, 250, 240] as RGB,
    pattern: 'veins',
  },
  morpho: {
    wing: tone('#3a8cff', 255, 130),
    edge: tone('#1a1a4a', 270, 270),
    spots: [200, 235, 255] as RGB,
    pattern: 'plain',
  },
  swallowtail: {
    wing: tone('#ffe04a', 40, 95),
    edge: tone('#2c2038', 280, 280),
    spots: [255, 130, 150] as RGB,
    pattern: 'stripes',
  },
  blossom: {
    wing: tone('#ff7eb6', 320, 60),
    edge: tone('#7a2a66', 310, 300),
    spots: [255, 240, 250] as RGB,
    pattern: 'plain',
  },
  lilac: {
    wing: tone('#b690ff', 280, 330),
    edge: tone('#3e2a7a', 275, 290),
    spots: [255, 232, 255] as RGB,
    pattern: 'veins',
  },
} as const;
export type ButterflyName = keyof typeof BUTTERFLY_LOOKS;

/**
 * One frame of a butterfly seen from above and in front. The wings open and close with `flap`: 1 is
 * wide, 0 is shut.
 */
export function renderButterfly(name: ButterflyName, frame: number): Rgba {
  const look = BUTTERFLY_LOOKS[name];
  const { w, h, ox } = BUTTERFLY.canvas;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const cy = 26;
  const open = [1, 0.62, 0.26, 0.62][frame % BUTTERFLY.frames]!;
  const outline = rgb(look.edge, 0);
  const wing = (dir: -1 | 1): void => {
    const fx = ox + dir * 11 * open,
      fy = cy - 6;
    leaf(p, fx, fy, 12.5 * open + 1.5, 9, dir * -0.52, (l) => {
      if (l.d > 0.88) return [...outline, 255];
      if (l.d > 0.72) return [...rgb(look.edge, 2), 255];
      if (look.pattern === 'stripes' && Math.sin(l.u * 7 + 0.6) > 0.5) return [...rgb(look.edge, 2), 255];
      if (look.pattern === 'veins' && Math.abs(l.v * 5 - Math.round(l.v * 5)) < 0.09 && l.d > 0.18)
        return [...rgb(look.edge, 1), 255];
      // The wing is deeper at the body and lighter toward the tip.
      return [...rgb(look.wing, Math.round(1 + (l.d < 0.35 ? 0 : 1) + (l.u * dir * -1 > 0 ? 1 : 2))), 255];
    });
    const hx = ox + dir * 8 * open,
      hy = cy + 8;
    leaf(p, hx, hy, 8.4 * open + 1.2, 7, dir * 0.45, (l) => {
      if (l.d > 0.86) return [...outline, 255];
      if (l.d > 0.7) return [...rgb(look.edge, 2), 255];
      if (look.pattern === 'stripes' && Math.sin(l.u * 6) > 0.4) return [...rgb(look.edge, 2), 255];
      return [...rgb(look.wing, l.d < 0.4 ? 2 : 3), 255];
    });
    for (const [sx, sy] of [
      [9.4, -9],
      [14.4, -3.4],
      [15.6, 3],
      [3, 15.2],
      [7.6, 14.6],
    ] as const) {
      const x = Math.round(ox + dir * sx * open),
        y = Math.round(cy + sy);
      p.over(x, y, look.spots, 0.95);
      p.over(x + dir, y, look.spots, 0.6);
    }
  };
  wing(-1);
  wing(1);
  // The body, a slim dark bar with a round head and two curling feelers.
  const body = rgb(look.edge, 1);
  for (let y = cy - 8; y <= cy + 10; y++) {
    const half = y < cy - 5 ? 1.5 : 1.1 + Math.max(0, 1 - Math.abs(y - cy)) * 0.9;
    for (let x = ox - 2; x <= ox + 2; x++) if (Math.abs(x + 0.5 - ox) <= half) p.px(x, y, body);
  }
  for (const dir of [-1, 1]) {
    p.px(ox + dir * 2, cy - 10, body);
    p.px(ox + dir * 3, cy - 11, body);
    p.px(ox + dir * 4, cy - 13, body);
    p.px(ox + dir * 5, cy - 13, rgb(look.wing, 4));
  }
  p.px(ox - 1, cy - 7, [255, 255, 255]);
  p.px(ox + 1, cy - 7, [255, 255, 255]);
  return img;
}

export const DRAGONFLY: { canvas: Canvas; frames: number } = { canvas: { w: 88, h: 64, ox: 44, oy: 48 }, frames: 3 };

export const DRAGONFLY_LOOKS = {
  sapphire: { body: tone('#2f8cff', 255, 130), eye: tone('#2ee0c8', 200, 120) },
  ruby: { body: tone('#f0405a', 335, 60), eye: tone('#ffb0c0', 340, 70) },
  jade: { body: tone('#38c47a', 200, 115), eye: tone('#c8ff70', 100, 105) },
} as const;
export type DragonflyName = keyof typeof DRAGONFLY_LOOKS;

/** A dragonfly side-on, facing east, hovering, with its four wings beating. */
export function renderDragonfly(name: DragonflyName, frame: number): Rgba {
  const look = DRAGONFLY_LOOKS[name];
  const { w, h, ox, oy } = DRAGONFLY.canvas;
  const img = createRgba(w, h);
  const p = new Painter(img);
  const beat = [-0.5, 0.1, 0.62][frame % DRAGONFLY.frames]!;
  const cy = oy - 16;
  const wingSkin = (l: Local, tint: number): readonly [number, number, number, number] | null => {
    if (l.d > 0.9) return [255, 255, 255, 190];
    if (Math.abs(l.v) < 0.07 && l.u > -0.7) return [255, 255, 255, 170];
    if (Math.abs(l.u * 4 - Math.round(l.u * 4)) < 0.1 && l.d > 0.3) return [255, 255, 255, 120];
    return [210 + tint, 236, 255, 96];
  };
  // The far pair behind the body, the near pair in front of it.
  const wings = (near: boolean): void => {
    const k = near ? 1 : 0.8;
    const spread = near ? 0.18 : -0.1;
    leaf(p, ox - 4 - (near ? 0 : 3), cy - 10 + beat * 4, 21 * k, 5.2 * k, -1.62 + beat * 0.8 + spread - 0.5, (l) =>
      wingSkin(l, 0),
    );
    leaf(p, ox + 1 - (near ? 0 : 2), cy - 9 + beat * 3, 19 * k, 5.2 * k, -1.34 + beat * 0.7 + spread - 0.5, (l) =>
      wingSkin(l, 8),
    );
  };
  wings(false);
  const b = rgb(look.body, 3);
  const dark = rgb(look.body, 1);
  // Abdomen: a long thin tail in rings that thickens a little at the base.
  for (let i = 0; i < 30; i++) {
    const x = ox - 6 - i;
    const y = cy + 3 + i * 0.12;
    const r = i < 5 ? 2.6 - i * 0.18 : 1.5;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      if (Math.abs(dy) <= r)
        p.px(Math.round(x), Math.round(y + dy), i % 5 === 4 ? dark : dy < 0 ? rgb(look.body, 4) : b);
  }
  // Thorax and head.
  leaf(p, ox - 1, cy + 1, 7, 5.2, 0, (l) => [...rgb(look.body, l.v < -0.1 ? 4 : l.d > 0.8 ? 1 : 3), 255]);
  leaf(p, ox + 8, cy, 5.4, 5, 0, (l) => [...rgb(look.eye, l.d > 0.82 ? 1 : l.v < -0.2 ? 4 : 3), 255]);
  p.px(ox + 10, cy - 1, [20, 14, 34]);
  p.px(ox + 11, cy - 1, [20, 14, 34]);
  p.px(ox + 10, cy - 2, [255, 255, 255]);
  // Six legs tucked up under the thorax.
  for (const dx of [-3, 0, 3]) p.line(ox + dx, cy + 5, ox + dx + 1, cy + 9, dark);
  wings(true);
  return img;
}

export const BEE: { canvas: Canvas; frames: number } = { canvas: { w: 56, h: 52, ox: 28, oy: 40 }, frames: 2 };

const BEE_YELLOW = tone('#ffd02e', 30, 95);
const BEE_DARK = tone('#3a2a46', 280, 285);

function bee(): SceneBuilder {
  const b = new SceneBuilder();
  const yellow = b.variant('yellow', BEE_YELLOW);
  const dark = b.variant('dark', BEE_DARK);
  const mat = b.material({ name: 'bee', shade: (s) => (Math.sin(s.rest[0] * 0.72 + 0.6) > 0.25 ? dark : yellow) });
  const fur = b.solid('dark', dark);
  const body = b.mesh(mat);
  blobAlong(body, v3(-3, 0, 12), v3(11, 7.4, 7.4), v3(0, 1, 0), 0.12, { rings: 8, segs: 13 });
  const head = b.mesh(fur);
  blob(head, v3(9.4, 0, 14), v3(5.6, 5.4, 5.4), 0, { rings: 6, segs: 10 });
  for (const side of [-1, 1]) {
    const f = b.mesh(fur, { noLines: true });
    tube(
      f,
      [
        { p: v3(11.6, side * 1.6, 18), r: 0.5 },
        { p: v3(14.6, side * 2.6, 22), r: 0.45 },
      ],
      { segs: 4, n: 3, capEnd: true },
    );
    const leg = b.mesh(fur, { noLines: true });
    tube(
      leg,
      [
        { p: v3(2, side * 3, 6), r: 0.6 },
        { p: v3(3.4, side * 4, 1.6), r: 0.5 },
      ],
      { segs: 4, n: 3, capEnd: true },
    );
  }
  return b;
}

/** A round striped bee, side-on, its two wings a blur above it. */
export function renderBee(frame: number): Rgba {
  const { rgba, at } = drawTiny(bee(), BEE.canvas, { aoRadius: 3, lineDepth: 2 });
  const p = new Painter(rgba);
  const [ex, ey] = at(v3(11.4, 4.2, 15.4));
  p.px(ex, ey, [255, 255, 255]);
  const up = frame % 2 === 0;
  for (const [dx, dz, rot] of [
    [-2, 21, up ? -1.5 : -0.5],
    [3, 20, up ? -1.1 : -0.1],
  ] as const) {
    const [x, y] = at(v3(dx, 0, dz));
    leaf(p, x - 4, y - (up ? 5 : 0), 11, 4.6, rot, (l) => (l.d > 0.88 ? [255, 255, 255, 200] : [214, 238, 255, 110]));
  }
  return rgba;
}

export const FAIRY: { canvas: Canvas; frames: number; fps: number } = {
  canvas: { w: 132, h: 118, ox: 66, oy: 98 },
  frames: 6,
  fps: 10,
};

/**
 * A ramp for something that glows: the shadow stays a deep shade of the colour and the lights run
 * up to nearly white.
 */
const glowRamp = (base: RGB): Ramp => [
  mix(base, [70, 0, 90], 0.3),
  base,
  mix(base, [255, 255, 255], 0.2),
  mix(base, [255, 255, 255], 0.4),
  mix(base, [255, 255, 255], 0.62),
  mix(base, [255, 255, 255], 0.84),
];

export const FAIRY_LOOKS = {
  pink: { base: [236, 98, 218] as RGB, glow: [255, 120, 210] as RGB },
  lilac: { base: [168, 124, 250] as RGB, glow: [190, 150, 255] as RGB },
  mint: { base: [64, 214, 170] as RGB, glow: [110, 245, 200] as RGB },
  sky: { base: [82, 176, 250] as RGB, glow: [120, 205, 255] as RGB },
  sun: { base: [255, 190, 64] as RGB, glow: [255, 220, 120] as RGB },
  coral: { base: [255, 120, 104] as RGB, glow: [255, 160, 140] as RGB },
} as const;
export type FairyName = keyof typeof FAIRY_LOOKS;

const FAIRY_EYE: Ramp = [
  [34, 10, 62],
  [58, 18, 96],
  [92, 34, 132],
  [140, 70, 176],
];

/** A round head a little big for the body, so she reads as a small person and not as a droplet. */
const HEAD = { x: 2.4, z: 36, rx: 7.2, ry: 6.8, rz: 7 } as const;
const EYE_AT = { x: 5.2, z: 36.2 } as const;
const CHEEK_AT = { x: 5.2, z: 31.4 } as const;
const SHOULDER = { x: -3.2, y: 3.2, z: 25 } as const;

const pixel = ([x, y]: readonly [number, number]): [number, number] => [Math.round(x), Math.round(y)];

/**
 * The point on the head's front surface (the side facing the viewer) at a given x and height, so
 * details painted there sit on the skin.
 */
const onHead = (x: number, z: number, lift = 0): V3 => {
  const u = ((x - HEAD.x) / HEAD.rx) ** 2 + ((z - HEAD.z) / HEAD.rz) ** 2;
  return v3(x, -HEAD.ry * Math.sqrt(Math.max(0.02, 1 - u)) - lift, z);
};

/**
 * The fairy herself: a small figure with a round head, one big glossy eye, a curl of hair, a slim
 * bodice and a short flared skirt on thin legs. The body is rendered so it is lit like everything
 * else; the wings and the glow around her are painted, because both are see-through, and they are
 * the biggest part of her.
 */
function fairyBody(look: (typeof FAIRY_LOOKS)[FairyName], bob: number): SceneBuilder {
  const b = new SceneBuilder();
  const rim = mix(look.base, [90, 10, 110], 0.6);
  const rimLit = mix(look.base, [255, 255, 255], 0.3);
  const skinBase = mix(look.base, [255, 238, 228], 0.72);
  const skin = b.variant('skin', glowRamp(skinBase), { outline: rim, outlineLit: rimLit });
  const dress = b.variant('dress', glowRamp(mix(look.base, [110, 20, 150], 0.12)), {
    outline: rim,
    outlineLit: rimLit,
  });
  const hair = b.variant('hair', glowRamp(mix(look.base, [96, 14, 128], 0.45)), { outline: rim, outlineLit: rimLit });
  const eyeV = b.variant('eye', FAIRY_EYE, { noLines: true, protect: true, priority: 3 });
  const blushV = b.variant('blush', mixRamp(glowRamp(skinBase), [255, 70, 130]), { noLines: true, priority: 2 });
  const skinMat = b.solid('skin', skin);
  const dressMat = b.solid('dress', dress);
  const hairMat = b.solid('hair', hair);
  const eyeMat = b.solid('eye', eyeV);
  const blushMat = b.solid('blush', blushV);
  const z = bob;
  const head = b.mesh(skinMat);
  blob(head, v3(HEAD.x, 0, HEAD.z + z), v3(HEAD.rx, HEAD.ry, HEAD.rz), 0, { rings: 10, segs: 16 });
  const tuft = b.mesh(hairMat);
  blob(tuft, v3(HEAD.x - 1.6, 0.4, HEAD.z + 3.4 + z), v3(6.6, 6.5, 4.4), 0, { rings: 7, segs: 12 });
  // A curl of hair that goes up and back over her head and curls down, where the old tip of her
  // tail was.
  tube(
    tuft,
    [
      { p: v3(-1, 0, 41 + z), r: 2.8 },
      { p: v3(-5.5, 0, 45 + z), r: 2.3 },
      { p: v3(-11, 0, 45.4 + z), r: 1.7 },
      { p: v3(-14.5, 0, 42 + z), r: 1.1 },
      { p: v3(-14, 0, 38.6 + z), r: 0.6 },
    ],
    { segs: 8, n: 24, capEnd: true },
  );
  const neck = b.mesh(skinMat);
  tube(
    neck,
    [
      { p: v3(0.6, 0, 31 + z), r: 2.2 },
      { p: v3(0, 0, 28 + z), r: 2.5 },
    ],
    { segs: 8, n: 3 },
  );
  const bodice = b.mesh(dressMat);
  tube(
    bodice,
    [
      { p: v3(0, 0, 28.5 + z), r: 3.7 },
      { p: v3(-0.2, 0, 24 + z), r: 3.7 },
      { p: v3(-0.4, 0, 20.5 + z), r: 3.0 },
    ],
    { segs: 10, n: 8 },
  );
  const skirt = b.mesh(dressMat);
  tube(
    skirt,
    [
      { p: v3(-0.4, 0, 21 + z), r: 3.0 },
      { p: v3(-0.5, 0, 17.4 + z), r: 5.2 },
      { p: v3(-0.6, 0, 13.4 + z), r: 7 },
      { p: v3(-0.6, 0, 11.4 + z), r: 6.6 },
      { p: v3(-0.6, 0, 10.4 + z), r: 5.2 },
    ],
    { segs: 14, n: 12, capEnd: true },
  );
  const limbs = b.mesh(skinMat, { noLines: true });
  // Thin legs, one a little bent, with small round feet.
  tube(
    limbs,
    [
      { p: v3(-1.8, -1.6, 10.6 + z), r: 1.35 },
      { p: v3(-2.6, -1.6, 4.4 + z * 0.3), r: 1.15 },
      { p: v3(-0.4, -1.6, 1.6 + z * 0.3), r: 1.1 },
    ],
    { segs: 6, n: 6, capEnd: true },
  );
  blob(limbs, v3(0.9, -1.6, 1 + z * 0.3), v3(2.4, 1.7, 1.4), 0, { rings: 4, segs: 7 });
  tube(
    limbs,
    [
      { p: v3(2.6, 1.6, 10.6 + z), r: 1.3 },
      { p: v3(4.4, 1.6, 5.2 + z * 0.3), r: 1.1 },
      { p: v3(7.2, 1.6, 3.6 + z * 0.3), r: 1.05 },
    ],
    { segs: 6, n: 6, capEnd: true },
  );
  blob(limbs, v3(8.6, 1.6, 3.4 + z * 0.3), v3(2.3, 1.6, 1.4), 0, { rings: 4, segs: 7 });
  // Arms: the near one reaches out in front of her, the far one is mostly behind the bodice.
  tube(
    limbs,
    [
      { p: v3(1.6, -3.1, 26.4 + z), r: 1.4 },
      { p: v3(5.2, -4.6, 22.6 + z), r: 1.2 },
      { p: v3(8.4, -5, 19.4 + z), r: 1.1 },
    ],
    { segs: 6, n: 6, capEnd: true },
  );
  blob(limbs, v3(9.2, -5.1, 18.6 + z), v3(1.9, 1.7, 1.9), 0, { rings: 4, segs: 7 });
  tube(
    limbs,
    [
      { p: v3(SHOULDER.x + 1.6, 3, 26.4 + z), r: 1.3 },
      { p: v3(2.6, 4, 21.4 + z), r: 1.15 },
      { p: v3(5.2, 4.2, 20.2 + z), r: 1.05 },
    ],
    { segs: 6, n: 6, capEnd: true },
  );
  // The eye: one large dark oval set on the face, with a soft blush beneath it.
  const eye = b.mesh(eyeMat, { noLines: true });
  blobAlong(eye, onHead(EYE_AT.x, EYE_AT.z + z), v3(3.4, 2.2, 5), v3(0, 1, 0), 0.2, { rings: 9, segs: 14 });
  const cheek = b.mesh(blushMat, { noLines: true });
  blob(cheek, onHead(CHEEK_AT.x, CHEEK_AT.z + z), v3(2.2, 1.2, 1.5), -0.4, { rings: 5, segs: 8 });
  return b;
}

function mixRamp(r: Ramp, toward: RGB): Ramp {
  return r.map((c) => mix(c, toward, 0.55));
}

/**
 * How wide a wing is at a place along it, as a share of its widest: narrow at the root, full toward
 * the rounded tip, and closing to a point.
 */
const wingEdge = (u: number): number => Math.sqrt(Math.max(0, 1 - u * u)) * (0.68 + 0.32 * u);

/** One frame of a fairy. `frame` runs through a full beat of the wings. */
export function renderFairy(name: FairyName, frame: number): Rgba {
  const look = FAIRY_LOOKS[name];
  const t = (frame % FAIRY.frames) / FAIRY.frames;
  const beat = Math.sin(t * TAU);
  const { w, h } = FAIRY.canvas;
  const out = createRgba(w, h);
  const p = new Painter(out);
  const body = drawTiny(fairyBody(look, 0), FAIRY.canvas, {
    aoRadius: 5,
    lineDepth: 3,
    ss: 4,
    shadowStrength: 0.12,
    aoStrength: 0.22,
  });
  const root = body.at(v3(SHOULDER.x, SHOULDER.y, SHOULDER.z));
  const glow = look.glow;
  const bodyMid = body.at(v3(0, 0, 24));

  // The glow: a soft halo with a few steps in it so it keeps the pixel look. It stops where it
  // would be too faint to see, so it does not stretch the picture's edges.
  const pulse = 0.82 + 0.18 * Math.cos(t * TAU);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - bodyMid[0]) / 36, (y - bodyMid[1]) / 38);
      if (d >= 1) continue;
      const step = Math.floor((1 - d) * 5) / 5;
      p.over(x, y, glow, 0.4 * pulse * step * step);
    }
  }

  const wingFor = (near: boolean): void => {
    const flap = beat * 0.4;
    const k = near ? 1 : 0.9;
    const ox = root[0] + (near ? 0 : -1),
      oy = root[1] + (near ? 0 : -2);
    // Each side has an upper wing, broad and swept back and up, and a lower one, shorter and swept
    // down and back. The pair on the far side is spread a little wider, so the four read as four.
    const upper = -2.25 - flap * 0.8 + (near ? 0 : 0.36);
    const lower = -3.45 + flap * 0.5 + (near ? 0 : 0.34);
    for (const [len, wid, ang, fade] of [
      [32 * k, 17.5 * k, upper, 1],
      [21 * k, 10.5 * k, lower, 0.86],
    ] as const) {
      const cx = ox + Math.cos(ang) * len * 0.96,
        cy = oy + Math.sin(ang) * len * 0.96;
      leaf(p, cx, cy, len, wid, ang, (l) => {
        const edge = wingEdge(l.u);
        const q = Math.abs(l.v) / Math.max(0.0001, edge);
        if (q > 1) return null;
        if (q > 0.9 || l.u > 0.9) return [...mix(glow, [255, 255, 255], 0.25), Math.round(235 * fade)];
        const vein = Math.abs(l.v) < 0.07 && l.u > -0.7;
        const branch = l.u > -0.35 && Math.abs(Math.abs(l.v) - edge * 0.52) < 0.045;
        if (vein || branch) return [255, 255, 255, Math.round((vein ? 210 : 150) * fade)];
        // Pearl white near the root, pink toward the rim, all of it see-through.
        const pink = Math.min(1, q * 1.2);
        const c = mix([255, 252, 255], glow, pink * 0.6);
        return [c[0], c[1], c[2], Math.round((96 + 70 * (1 - q)) * fade)];
      });
    }
  };
  wingFor(false);
  wingFor(true);
  // The body, over both pairs of wings so that her face is clear.
  for (let i = 0; i < body.rgba.data.length; i += 4) {
    const a = body.rgba.data[i + 3]!;
    if (a === 0) continue;
    const x = (i / 4) % w,
      y = Math.floor(i / 4 / w);
    p.px(x, y, [body.rgba.data[i]!, body.rgba.data[i + 1]!, body.rgba.data[i + 2]!, a]);
  }
  // A soft inner glow, brightest at the bodice, so she looks lit from inside.
  const chest = body.at(v3(1, -3, 22));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out.data[(y * w + x) * 4 + 3] !== 255) continue;
      const d = Math.hypot((x - chest[0]) / 14, (y - chest[1]) / 16);
      if (d < 1) p.over(x, y, [255, 240, 250], 0.34 * (1 - d) * (1 - d));
    }
  }
  // The glossy eye: dark above, lit from below by the glow of her skin, with a big highlight and a
  // small one.
  const [ex, ey] = pixel(body.at(onHead(EYE_AT.x, EYE_AT.z, 2)));
  const isEye = new Set(FAIRY_EYE.map((c) => c.join(',')));
  const dark = FAIRY_EYE[0]!;
  const lit = mix(look.base, [60, 20, 120], 0.45);
  for (let y = ey - 7; y <= ey + 7; y++) {
    for (let x = ex - 6; x <= ex + 6; x++) {
      const i = (y * w + x) * 4;
      if (out.data[i + 3] !== 255 || !isEye.has(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`)) continue;
      const v = Math.min(1, Math.max(0, (y - (ey - 5)) / 10));
      const c = mix(dark, lit, v * v);
      p.px(x, y, [c[0], c[1], c[2], 255]);
    }
  }
  for (const [dx, dy] of [
    [-2, -3],
    [-1, -3],
    [-2, -2],
    [-1, -2],
  ] as const)
    p.over(ex + dx, ey + dy, [255, 255, 255], 1);
  p.over(ex + 1, ey + 2, [255, 255, 255], 0.9);
  for (let k = -2; k <= 2; k++)
    p.over(ex + k, ey - 6 + Math.round(k * k * 0.14), mix(glow, [255, 255, 255], 0.5), 0.55);
  // A small star on her bodice, and a few glints on her skin and hair.
  const [sx, sy] = pixel(body.at(v3(1.4, -3.8, 24.5)));
  p.over(sx, sy, [255, 255, 255], 0.95);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const)
    p.over(sx + dx, sy + dy, [255, 255, 255], 0.55);
  for (const [dx, dy, dz] of [
    [-4, -8, 41],
    [3, -8, 43],
    [7, -9, 15],
    [-6, -5, 30],
    [9, -8, 22],
  ] as const) {
    const [gx, gy] = pixel(body.at(v3(dx, dy, dz)));
    if ((frame + dx) % 3 !== 0) continue;
    p.over(gx, gy, [255, 255, 255], 0.95);
    p.over(gx + 1, gy, [255, 255, 255], 0.5);
    p.over(gx - 1, gy, [255, 255, 255], 0.5);
    p.over(gx, gy + 1, [255, 255, 255], 0.5);
    p.over(gx, gy - 1, [255, 255, 255], 0.5);
  }
  return out;
}
