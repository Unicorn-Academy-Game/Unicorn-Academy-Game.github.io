import { fromOklch, hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { projectPoint } from '../core/render';
import { hash2, mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { archShape, extrude, FRONT, lathe } from './arch';
import { glow } from './cave-flora';
import { KNOB, sparkle } from './cave-gems';
import { type DoorGeometry, type DoorStyle, renderDoor } from './doors';
import { underGlow } from './glow';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob, box, tube } from './prims';
import { renderScene, SceneBuilder, scaleScene, WORLD_PITCH } from './scene';

/**
 * The witch's hut, at the back of the cave. It is round, with a roof like a hat that has bent over,
 * a chimney that leans, one round window that glows, and a door that opens when she taps it. It is
 * a little bit spooky, the way a hut in a cave ought to be, and every part of it is warm: nothing
 * in it is dark or sharp.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const r6 = (
  base: string,
  shadowHue: number,
  lightHue: number,
  light: readonly number[] = [-0.3, -0.2, -0.1, -0.03, 0.04, 0.1],
): Ramp => ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.9, lightness: light });
const WOOD = r6('#8a5f6e', 330, 60);
const HAT = r6('#5a4aa8', 275, 320, [-0.3, -0.2, -0.1, 0, 0.06, 0.13]);
const BAND = r6('#e8b44a', 25, 90, [-0.32, -0.21, -0.1, 0, 0.09, 0.17]);
const IRON: Ramp = [
  [34, 30, 52],
  [52, 46, 74],
  [78, 70, 104],
  [112, 102, 140],
  [158, 148, 188],
];
const MOSS = glow(150, 0.13);
export const HUT_PLUG: RGB = [54, 20, 90];

/**
 * The hut is built in round numbers and drawn this many times bigger, so that it stands well above
 * the herd.
 */
const K = 1.4;
export const HUT_CANVAS: Canvas = { w: 460, h: 520, ox: 230, oy: 420 };
const WALL = { r: 76, h: 100 };
const DOOR = { w: 50, h: 76 };

export const HUT_DOOR_GEOMETRY: DoorGeometry = {
  building: HUT_CANVAS,
  base: [0, (-WALL.r + 6) * K, 12 * K],
  w: DOOR.w * K,
  h: DOOR.h * K,
  plug: HUT_PLUG,
};

/**
 * The door seen from outside: plum planks with iron straps, and the green-gold light of the room
 * behind it.
 */
export const HUT_DOOR_STYLE: DoorStyle = {
  leaf: r6('#2f6a6e', 195, 130, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]),
  trim: IRON,
  light: [
    [236, 255, 170],
    [196, 240, 120],
    [110, 176, 90],
  ],
  kind: 'stable',
  straw: false,
};

interface Window {
  x: number;
  y: number;
  z: number;
  r: number;
}

function build(): { b: SceneBuilder; windows: Window[]; tip: V3 } {
  const b = new SceneBuilder();
  const rng = mulberry32(61);
  const wallV = b.variant('wall', WOOD);
  const wall = b.material({
    name: 'wall',
    shade: () => wallV,
    // Planks run up the wall, twenty-four of them round, each with a dark seam at its edge and a
    // tone of its own.
    bias: (s) => {
      const a = Math.atan2(s.rest[1], s.rest[0]);
      const plank = Math.floor((a + Math.PI) / (TAU / 24));
      const edge = (a + Math.PI) / (TAU / 24) - plank;
      return (edge < 0.1 ? -0.16 : 0) + (hash2(plank, 3, 9) - 0.5) * 0.12;
    },
  });
  const hatV = b.variant('hat', HAT);
  const lipV = b.variant('hatLip', r6('#2e2468', 280, 330), { protect: true, noLines: true });
  const hat = b.material({
    name: 'hat',
    shade: (s) => (Math.floor(s.rest[2] / (11 * K)) !== Math.floor((s.rest[2] - 1.6 * K) / (11 * K)) ? lipV : hatV),
    bias: (s) =>
      (hash2(Math.floor((Math.atan2(s.rest[1], s.rest[0]) + Math.PI) / 0.3), Math.floor(s.rest[2] / (11 * K)), 5) -
        0.5) *
      0.14,
  });
  const stone = b.solid(
    'stone',
    b.variant('stone', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }),
    (s) => (hash2(s.px, s.py, 6) - 0.5) * 0.08,
  );
  const band = b.solid('band', b.variant('band', BAND, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }));
  const iron = b.solid('iron', b.variant('iron', IRON));
  const plug = b.solid('plug', b.variant('plug', [HUT_PLUG, HUT_PLUG, HUT_PLUG] as Ramp, { flat: 0, noLines: true }));
  const moss = b.solid('moss', b.variant('moss', MOSS, { noLines: true }), (s) => (hash2(s.px, s.py, 12) - 0.5) * 0.2);
  const trim = b.solid('trim', b.variant('trim', WOOD));

  // The foot: a ring of rough stones the hut stands on.
  lathe(b.mesh(stone), {
    c: v3(0, 0, 0),
    segs: 16,
    smooth: true,
    profile: [
      [WALL.r + 14, 0],
      [WALL.r + 12, 10],
      [WALL.r + 4, 16],
      [0, 16],
    ],
  });
  const rim = b.mesh(stone);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + rng() * 0.3;
    const r = 11 + rng() * 6;
    blob(
      rim,
      v3(Math.cos(a) * (WALL.r + 16), Math.sin(a) * (WALL.r + 16) * 0.92, r * 0.5),
      v3(r * 1.1, r * 0.9, r * 0.8),
      rng() * 3,
      { rings: 5, segs: 8 },
    );
  }
  // The walls: two drums, the upper one pushed a little to one side, so the hut leans.
  lathe(b.mesh(wall), {
    c: v3(0, 0, 14),
    segs: 24,
    profile: [
      [WALL.r, 0],
      [WALL.r, WALL.h - 40],
      [WALL.r - 2, WALL.h - 40],
      [0, WALL.h - 40],
    ],
  });
  lathe(b.mesh(wall), {
    c: v3(5, 0, 14 + WALL.h - 40),
    segs: 24,
    profile: [
      [WALL.r - 4, 0],
      [WALL.r - 6, 46],
      [0, 46],
    ],
  });
  lathe(b.mesh(trim), {
    c: v3(0, 0, 14 + WALL.h - 44),
    segs: 24,
    profile: [
      [WALL.r + 4, 0],
      [WALL.r + 4, 6],
      [WALL.r - 8, 6],
      [0, 6],
    ],
  });

  // The doorway: a dark plug under a frame, in front of the wall, for the door sprite to fill.
  const dz = 14;
  extrude(b.mesh(trim), archShape(DOOR.w + 22, DOOR.h + 16), FRONT(0, -WALL.r + 4, dz - 4), 0, 7, { caps: 'front' });
  extrude(b.mesh(iron), archShape(DOOR.w + 8, DOOR.h + 6), FRONT(0, -WALL.r + 2, dz - 2), 0, 8, { caps: 'front' });
  extrude(b.mesh(plug), archShape(DOOR.w, DOOR.h), FRONT(0, -WALL.r + 1, dz - 2), 0, 9, { caps: 'front' });
  for (let i = 0; i < 2; i++)
    box(b.mesh(stone), v3(0, -WALL.r - 8 - i * 9, 5 + i * 3), v3(DOOR.w + 28 - i * 10, 14, 10 - i * 3), 0);

  // The hat: a brim, then four pieces, each bending a little further over, with a gold band between
  // them.
  const base = 14 + WALL.h + 2;
  lathe(b.mesh(hat), {
    c: v3(5, 0, base - 6),
    segs: 26,
    smooth: true,
    profile: [
      [WALL.r + 30, 0],
      [WALL.r + 28, 5],
      [WALL.r + 10, 12],
      [WALL.r - 6, 20],
      [0, 20],
    ],
  });
  const pieces = [
    { x: 5, z: base + 12, r0: WALL.r - 2, r1: 56, h: 54 },
    { x: 14, z: base + 12 + 52, r0: 56, r1: 38, h: 50 },
    { x: 28, z: base + 12 + 52 + 48, r0: 38, r1: 22, h: 46 },
    { x: 48, z: base + 12 + 52 + 48 + 44, r0: 22, r1: 0, h: 58 },
  ];
  for (const p of pieces) {
    lathe(b.mesh(hat), {
      c: v3(p.x, 0, p.z),
      segs: 24,
      smooth: true,
      profile: [
        [p.r0, 0],
        [(p.r0 + p.r1) / 2 - 2, p.h * 0.5],
        [p.r1 + 1, p.h * 0.94],
        [p.r1 === 0 ? 0 : p.r1, p.h],
      ],
    });
    if (p.r1 > 0)
      lathe(b.mesh(band), {
        c: v3(p.x, 0, p.z + p.h - 3),
        segs: 24,
        profile: [
          [p.r1 + 4, 0],
          [p.r1 + 4, 5],
          [p.r1 - 2, 5],
          [0, 5],
        ],
      });
  }
  const tipTop = pieces[3]!;
  tube(
    b.mesh(iron),
    [
      { p: v3(tipTop.x, 0, tipTop.z + tipTop.h - 2), r: 1.6 },
      { p: v3(tipTop.x + 4, 0, tipTop.z + tipTop.h + 12), r: 1.2 },
    ],
    { segs: 5, n: 3 },
  );
  blob(b.mesh(band), v3(tipTop.x + 4, 0, tipTop.z + tipTop.h + 14), v3(5, 5, 5), 0, { rings: 4, segs: 7 });

  // A patch of moss on the brim, and a chimney of stones that leans out of the back of the hat.
  blob(b.mesh(moss), v3(-42, -52, base + 10), v3(26, 18, 7), 0.3, { rings: 5, segs: 9 });
  blob(b.mesh(moss), v3(50, -58, base + 4), v3(20, 14, 6), 0.1, { rings: 5, segs: 9 });
  const chimney = [
    { x: -34, z: base + 50, w: 34 },
    { x: -30, z: base + 78, w: 32 },
    { x: -22, z: base + 104, w: 30 },
  ];
  for (const c of chimney) box(b.mesh(stone), v3(c.x, 36, c.z), v3(c.w, c.w - 4, 32), (c.x + 30) * 0.02);
  box(b.mesh(trim), v3(-20, 36, base + 124), v3(40, 34, 8), 0.1);

  // An iron hook by the door.
  tube(
    b.mesh(iron),
    [
      { p: v3(WALL.r * 0.5, -WALL.r * 0.74, 78), r: 1.8 },
      { p: v3(WALL.r * 0.62, -WALL.r * 0.9, 80), r: 1.8 },
      { p: v3(WALL.r * 0.74, -WALL.r * 0.98, 70), r: 1.8 },
    ],
    { segs: 5, n: 5 },
  );
  scaleScene(b, K);
  return {
    b,
    windows: [{ x: -WALL.r * 0.72 * K, y: -WALL.r * 0.69 * K, z: 70 * K, r: 15 * K }],
    tip: v3((tipTop.x + 4) * K, 0, (tipTop.z + tipTop.h + 14) * K),
  };
}

const GLOW_YELLOW: readonly RGB[] = [
  [236, 255, 178],
  [214, 244, 130],
  [168, 218, 98],
  [118, 176, 84],
];

function paintWindow(p: Painter, at: (q: V3) => [number, number], w: Window): void {
  const [cx0, cy0] = at(v3(w.x, w.y, w.z));
  const cx = Math.round(cx0),
    cy = Math.round(cy0);
  const R = w.r;
  // Warm light on the wall round it, then the frame, then the glass.
  for (let y = -R - 14; y <= R + 14; y++) {
    for (let x = -R - 14; x <= R + 14; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d <= R + 4 || d > R + 14 || p.get(cx + x, cy + y)[3] !== 255) continue;
      p.over(cx + x, cy + y, [214, 244, 130], 0.22 * (1 - (d - R - 4) / 10));
    }
  }
  for (let y = -R - 5; y <= R + 5; y++) {
    for (let x = -R - 5; x <= R + 5; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R + 4) continue;
      let c: RGB;
      if (d > R + 2) c = [38, 28, 62];
      else if (d > R - 1) c = IRON[x + y < 0 ? 4 : 2]!;
      else {
        const t = (y + R) / (2 * R);
        c = GLOW_YELLOW[t < 0.25 ? 0 : t < 0.55 ? 1 : t < 0.8 ? 2 : 3]!;
      }
      p.px(cx + x, cy + y, rgb(c));
    }
  }
  // A cross of frame, and a glint on the glass.
  for (let y = -R + 1; y < R; y++) p.px(cx, cy + y, [74, 56, 96]);
  for (let x = -R + 1; x < R; x++) p.px(cx + x, cy, [74, 56, 96]);
  p.px(cx - R + 3, cy - R + 5, [255, 255, 255]);
}

let hut: Rgba | undefined;

/** The hut. It is drawn once and handed out as it is, because the door is cut from it. */
export function renderHut(): Rgba {
  if (hut) return hut;
  const { b, windows } = build();
  const c = HUT_CANVAS;
  const out = renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 3,
    lineDepth: 6,
    aoRadius: 10,
    shadowBias: 3.2,
    shadowFit: true,
  });
  const p = new Painter(out.rgba);
  for (const w of windows) paintWindow(p, out.at, w);
  hut = out.rgba;
  return hut;
}

/**
 * The door over the doorway, shut at frame 0 and swung open by the last, with the light of the room
 * spilling out.
 */
export const renderHutDoor = (frame: number): Rgba => renderDoor(HUT_DOOR_GEOMETRY, HUT_DOOR_STYLE, frame, renderHut());

/** The smoke is drawn on the hut's own anchor, so it lines up with the hut whatever its size. */
export const SMOKE_CANVAS: Canvas = { w: 300, h: 560, ox: 150, oy: 470 };
export const SMOKE_FRAMES = 8;
const MOUTH: V3 = v3(-20 * K, 36 * K, (14 + WALL.h + 2 + 130) * K);

/**
 * A curl of pale violet smoke that rises from the chimney's mouth and thins as it goes, painted in
 * puffs so it keeps the pixel-art look. The loop is exact.
 */
export function renderSmoke(frame: number): Rgba {
  const c = SMOKE_CANVAS;
  const img: Rgba = { width: c.w, height: c.h, data: new Uint8Array(c.w * c.h * 4) };
  const p = new Painter(img);
  const [mx, my] = projectPoint({ originX: c.ox, originY: c.oy, pitch: WORLD_PITCH }, MOUTH);
  const puffs = 6;
  for (let i = 0; i < puffs; i++) {
    const u = ((i + frame / SMOKE_FRAMES) % puffs) / puffs;
    const y = my - u * 190;
    const x = mx + Math.sin(u * 6.2 + i * 1.3) * (6 + u * 18);
    const r = 6 + u * 16;
    const a = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.85;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const shade = (dx + dy) / (2 * r);
        const col: RGB = shade < -0.25 ? [240, 230, 255] : shade > 0.3 ? [178, 160, 214] : [210, 198, 238];
        p.over(Math.round(x + dx), Math.round(y + dy), col, a * (d > r - 2 ? 0.7 : 1));
      }
    }
  }
  return img;
}

export const CAULDRON_CANVAS: Canvas = { w: 200, h: 210, ox: 100, oy: 150 };
export const CAULDRON_FRAMES = 8;

function buildCauldron(): SceneBuilder {
  const b = new SceneBuilder();
  const iron = b.solid(
    'iron',
    b.variant('iron', IRON, { bands: [0.2, 0.4, 0.62, 0.84] }),
    (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.05,
  );
  const stone = b.solid('stone', b.variant('stone', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }));
  const coal = b.solid(
    'coal',
    b.variant(
      'coal',
      [
        [148, 34, 20],
        [230, 84, 24],
        [255, 150, 40],
      ] as Ramp,
      { emissive: 2, noLines: true },
    ),
    (s) => (hash2(s.px >> 1, s.py >> 1, 5) - 0.5) * 0.4,
  );
  const rng = mulberry32(8);
  const ring = b.mesh(stone);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = 11 + rng() * 4;
    blob(ring, v3(Math.cos(a) * 52, Math.sin(a) * 40, r * 0.5), v3(r * 1.1, r * 0.95, r * 0.8), rng() * 3, {
      rings: 5,
      segs: 8,
    });
  }
  const fire = b.mesh(coal, { noLines: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    blob(fire, v3(Math.cos(a) * 24, Math.sin(a) * 18, 6), v3(8, 7, 5), a, { rings: 4, segs: 6 });
  }
  const legs = b.mesh(iron);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    tube(
      legs,
      [
        { p: v3(Math.cos(a) * 38, Math.sin(a) * 30, 1), r: 3.4 },
        { p: v3(Math.cos(a) * 32, Math.sin(a) * 26, 20), r: 3 },
      ],
      { segs: 6, n: 4 },
    );
  }
  const pot = b.mesh(iron);
  lathe(pot, {
    c: v3(0, 0, 16),
    segs: 20,
    smooth: true,
    profile: [
      [18, 0],
      [34, 8],
      [44, 24],
      [42, 40],
      [36, 46],
      [39, 49],
      [34, 49],
      [32, 44],
      [38, 38],
      [38, 26],
      [30, 12],
      [0, 6],
    ],
  });
  tube(
    b.mesh(iron),
    [
      { p: v3(-38, 0, 62), r: 2 },
      { p: v3(0, 0, 84), r: 2 },
      { p: v3(38, 0, 62), r: 2 },
    ],
    { segs: 6, n: 8 },
  );
  return b;
}

/**
 * The brew in the pot: a disc of glowing liquid with bubbles that rise and burst, and its colour is
 * a different colour of the rainbow each frame, so it never keeps still.
 */
export function renderCauldron(frame: number): Rgba {
  const c = CAULDRON_CANVAS;
  const r = renderScene(buildCauldron(), {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 8,
    lineDepth: 5,
  });
  const img = r.rgba;
  const [cx0, cy0] = r.at(v3(0, 0, 16 + 47));
  const cx = Math.round(cx0),
    cy = Math.round(cy0);
  const hue = 130 + (frame / CAULDRON_FRAMES) * 80;
  const liquid: RGB[] = [
    fromOklch(0.6, 0.14, hue),
    fromOklch(0.72, 0.17, hue),
    fromOklch(0.84, 0.15, hue + 8),
    fromOklch(0.94, 0.08, hue + 14),
  ];
  const RX = 33,
    RY = 14;
  const lit = underGlow(img, cx, cy - 22, 76, 66, fromOklch(0.8, 0.15, hue), 0.36);
  const q = new Painter(lit);
  for (let y = -RY; y <= RY; y++) {
    for (let x = -RX; x <= RX; x++) {
      if ((x / RX) ** 2 + (y / RY) ** 2 > 1) continue;
      const t = (y + RY) / (2 * RY);
      q.px(cx + x, cy + y, rgb(liquid[t < 0.2 ? 3 : t < 0.5 ? 2 : t < 0.8 ? 1 : 0]!));
    }
  }
  // Bubbles rise from the brew, each a ring with a spark, and burst at the top of their climb.
  for (let i = 0; i < 5; i++) {
    const u = (i / 5 + frame / CAULDRON_FRAMES) % 1;
    const bx = cx + Math.round((hash2(i, 4, 2) - 0.5) * 40);
    const by = cy - Math.round(u * 46) - 2;
    const rr = u > 0.88 ? 4 : 2 + Math.round(hash2(i, 9, 2) * 2);
    for (let a = 0; a < 16; a++)
      q.over(
        Math.round(bx + Math.cos((a / 16) * TAU) * rr),
        Math.round(by + Math.sin((a / 16) * TAU) * rr),
        [255, 255, 255],
        u > 0.88 ? 0.4 : 0.85,
      );
    q.px(bx - 1, by - 1, [255, 255, 255]);
  }
  sparkle(lit, cx + 34, cy - 54 + (frame % 4), 2, fromOklch(0.92, 0.1, hue));
  return lit;
}

export const BROOM_CANVAS: Canvas = { w: 90, h: 190, ox: 45, oy: 164 };

/**
 * A broom leaning on nothing in particular: a straight stick, a tie of dark twine and a bundle of
 * straw.
 */
export function renderBroom(): Rgba {
  const b = new SceneBuilder();
  const wood = b.mesh(b.solid('wood', b.variant('wood', WOOD)));
  const straw = b.mesh(
    b.solid(
      'straw',
      b.variant('straw', r6('#d8b062', 40, 90, [-0.3, -0.2, -0.1, 0, 0.08, 0.16]), { noLines: true }),
      (s) => (hash2(s.px, s.py, 4) - 0.5) * 0.16,
    ),
  );
  const twine = b.mesh(b.solid('twine', b.variant('twine', IRON)));
  tube(
    wood,
    [
      { p: v3(0, 0, 30), r: 3.2 },
      { p: v3(8, 0, 90), r: 3 },
      { p: v3(16, 0, 140), r: 2.8 },
    ],
    { segs: 7, n: 6 },
  );
  lathe(straw, {
    c: v3(0, 0, 0),
    segs: 14,
    smooth: true,
    profile: [
      [26, 0],
      [22, 8],
      [12, 22],
      [6, 40],
      [4, 56],
    ],
    yaw: 0,
  });
  lathe(twine, {
    c: v3(2, 0, 38),
    segs: 12,
    profile: [
      [8, 0],
      [8, 5],
      [5, 5],
      [0, 5],
    ],
  });
  const c = BROOM_CANVAS;
  return renderScene(b, { width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss: 4, aoRadius: 6, lineDepth: 4 })
    .rgba;
}

export const JARS_CANVAS: Canvas = { w: 190, h: 150, ox: 95, oy: 110 };
const JAR_HUES = [330, 150, 255, 80, 205] as const;

/** A low stone table with five jars of potion on it, each a different colour and each shining. */
export function renderJars(): Rgba {
  const b = new SceneBuilder();
  const stone = b.mesh(b.solid('stone', b.variant('stone', KNOB, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] })));
  box(stone, v3(0, 0, 18), v3(150, 52, 36), 0);
  box(stone, v3(0, 0, 38), v3(160, 60, 6), 0);
  JAR_HUES.forEach((hue, i) => {
    const x = -56 + i * 28;
    const y = i % 2 === 0 ? -4 : 6;
    const h = 32 + (i % 3) * 8;
    const glass = b.mesh(b.solid(`jar${i}`, b.variant(`jar${i}`, glow(hue, 0.17), { noLines: true })), {
      noLines: true,
    });
    lathe(glass, {
      c: v3(x, y, 41),
      segs: 10,
      smooth: true,
      profile: [
        [8, 0],
        [11, 4],
        [11, h - 12],
        [6, h - 6],
        [5, h],
      ],
    });
    const cork = b.mesh(b.solid(`cork${i}`, b.variant(`cork${i}`, WOOD)));
    lathe(cork, {
      c: v3(x, y, 41 + h),
      segs: 8,
      profile: [
        [6, 0],
        [6, 5],
        [0, 5],
      ],
    });
  });
  const c = JARS_CANVAS;
  const r = renderScene(b, { width: c.w, height: c.h, originX: c.ox, originY: c.oy, ss: 4, aoRadius: 7, lineDepth: 5 });
  const [cx, cy] = r.at(v3(0, 0, 60));
  const lit = underGlow(r.rgba, cx, cy, 92, 54, fromOklch(0.82, 0.14, 200), 0.3);
  sparkle(lit, Math.round(cx) - 44, Math.round(cy) - 20, 2, fromOklch(0.92, 0.1, 330));
  sparkle(lit, Math.round(cx) + 36, Math.round(cy) - 28, 2, fromOklch(0.92, 0.1, 150));
  return lit;
}

export const WISP_CANVAS: Canvas = { w: 80, h: 90, ox: 40, oy: 60 };
export const WISP_FRAMES = 8;

/**
 * A tiny friendly light that bobs on the spot: a round pale body with two black dots for eyes, a
 * curl of a tail, and a soft glow round it.
 */
export function renderWisp(frame: number): Rgba {
  const img: Rgba = {
    width: WISP_CANVAS.w,
    height: WISP_CANVAS.h,
    data: new Uint8Array(WISP_CANVAS.w * WISP_CANVAS.h * 4),
  };
  const t = (frame / WISP_FRAMES) * TAU;
  const cx = WISP_CANVAS.ox,
    cy = WISP_CANVAS.oy - 6 + Math.round(Math.sin(t) * 4);
  const lit = underGlow(img, cx, cy, 36, 36, [190, 255, 214], 0.4);
  const p = new Painter(lit);
  const R = 11;
  for (let y = -R; y <= R + 14; y++) {
    for (let x = -R; x <= R; x++) {
      const head = Math.hypot(x, y) <= R;
      const k = y - R * 0.4;
      const tail = k > 0 && Math.abs(x - Math.sin(t + k * 0.28) * 4) < (R - k * 0.5) * 0.7 && k < 15;
      if (!head && !tail) continue;
      const shade = (x + y) / (2 * R);
      p.px(cx + x, cy + y, shade < -0.3 ? [255, 255, 255] : shade > 0.35 ? [176, 226, 214] : [226, 252, 244]);
    }
  }
  // Two small dark eyes and a little smile: friendly, and a little sleepy.
  for (const ex of [-4, 4])
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) p.px(cx + ex + k, cy - 2 + j, [46, 40, 82]);
  for (const [sx, sy] of [
    [-2, 4],
    [-1, 5],
    [0, 5],
    [1, 5],
    [2, 4],
  ] as const)
    p.px(cx + sx, cy + sy, [46, 40, 82]);
  return lit;
}
