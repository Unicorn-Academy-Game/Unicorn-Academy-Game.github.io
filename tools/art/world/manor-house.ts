import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { coneRoof, extrude, FRONT, finial, gableRoof, hipRoof, lathe, pointedShape } from './arch';
import type { DoorGeometry, DoorStyle } from './doors';
import { Painter } from './paint';
import { GEM, type Ramp } from './palette';
import { blob, box, tube } from './prims';
import { type RenderedObject, renderScene, SceneBuilder } from './scene';
import { masonry, shade, tiles, wallScale } from './walls';

/**
 * The Spooky Manor, seen from outside: a dark purple gothic house with crooked towers, a steep
 * roof, a pointed doorway and windows that glow orange from inside. It is meant to look cosy from
 * far away and spooky-cute up close. Nothing here is frightening: the roofs lean, the windows are
 * warm and the only creatures are bats and pumpkins with friendly faces.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];
const S = wallScale(1);

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
const WALL = r6('#7a5cae', 275, 320);
const TRIM = r6('#cdbbea', 285, 60, [-0.3, -0.19, -0.1, -0.04, 0, 0.05]);
const ROOF = r6('#3c2a6c', 280, 330, [-0.3, -0.2, -0.1, 0, 0.06, 0.13]);
const IRON: Ramp = [
  [34, 30, 52],
  [52, 46, 74],
  [78, 70, 104],
  [112, 102, 140],
  [158, 148, 188],
];
const PUMPKIN = r6('#f08a24', 350, 70, [-0.32, -0.21, -0.1, 0, 0.09, 0.17]);
const VINE = r6('#3a8a58', 215, 110, [-0.3, -0.2, -0.1, 0, 0.1, 0.19]);

/**
 * The doorway's dark plug has its own colour, so the door sprite finds it exactly whatever the
 * walls look like.
 */
const PLUG: RGB = [58, 22, 96];

export const MANOR = {
  canvas: { w: 600, h: 520, ox: 300, oy: 456 } as Canvas,
  body: { w: 300, d: 170, h: 170 },
  door: { w: 88, h: 118 },
  doorBase: { x: 0, y: -2, z: 16 },
  plug: PLUG,
};

export const MANOR_DOOR_GEOMETRY: DoorGeometry = {
  building: MANOR.canvas,
  base: [MANOR.doorBase.x, MANOR.doorBase.y, MANOR.doorBase.z],
  w: MANOR.door.w,
  h: MANOR.door.h,
  plug: PLUG,
};

/**
 * The door seen from outside: dark plum planks with iron straps, and the cosy orange light of the
 * hall behind.
 */
export const MANOR_OUT_STYLE: DoorStyle = {
  leaf: r6('#4d2e5e', 285, 330, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]),
  trim: IRON,
  light: [
    [255, 240, 170],
    [255, 190, 84],
    [214, 110, 40],
  ],
  kind: 'stable',
  straw: false,
};

interface Mats {
  b: SceneBuilder;
  wall: number;
  trim: number;
  roof: number;
  iron: number;
  plug: number;
  gold: number;
  pumpkin: number;
  vine: number;
  tower: (cx: number, cy: number, r: number) => number;
}

function materials(): Mats {
  const b = new SceneBuilder();
  const wallV = b.variant('wall', WALL);
  const mortarV = b.variant('mortar', shade(WALL, 0.78, [245, 235, 255]), {
    protect: true,
    noLines: true,
    noOutline: true,
  });
  const trimV = b.variant('trim', TRIM);
  const roofV = b.variant('roof', ROOF);
  const lipV = b.variant('roofLip', shade(ROOF, 0.72, [240, 230, 255]), { protect: true, noLines: true });
  const stone = masonry({ rowH: S.rowUnits(20), blockW: S.colUnits(46), seed: 4 }, S);
  const roofTile = tiles({ rowH: 12, tileW: 16, seed: 21, along: 'y' });
  return {
    b,
    wall: b.material({ name: 'wall', shade: (s) => (stone(s).mortar ? mortarV : wallV), bias: (s) => stone(s).tone }),
    trim: b.solid('trim', trimV, (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.03),
    roof: b.material({ name: 'roof', shade: (s) => (roofTile(s).lip ? lipV : roofV), bias: (s) => roofTile(s).tone }),
    iron: b.solid('iron', b.variant('iron', IRON)),
    plug: b.solid('plug', b.variant('plug', [PLUG, PLUG, PLUG] as Ramp, { flat: 0, noLines: true })),
    gold: b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })),
    pumpkin: b.solid('pumpkin', b.variant('pumpkin', PUMPKIN)),
    vine: b.solid('vine', b.variant('vine', VINE)),
    tower: (cx, cy, r) => {
      const round = masonry({ rowH: S.rowUnits(20), blockW: S.colUnits(46), round: { cx, cy, r }, seed: 8 }, S);
      return b.material({
        name: `tower-${cx}`,
        shade: (s) => (round(s).mortar ? mortarV : wallV),
        bias: (s) => round(s).tone,
      });
    },
  };
}

interface Opening {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  round?: boolean;
}

function build(): { b: SceneBuilder; windows: Opening[]; attic: { x: number; z: number; r: number }; vane: V3 } {
  const m = materials();
  const { b } = m;
  const { w, d, h } = MANOR.body;
  const put = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat = m.wall): void => {
    box(b.mesh(mat), v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), v3(x1 - x0, y1 - y0, z1 - z0), 0);
  };
  const windows: Opening[] = [];

  // The house: a stone block on a plinth, a band of trim, and a pointed doorway under a little
  // porch
  put(-w / 2, w / 2, 0, d, 0, h);
  put(-w / 2 - 6, w / 2 + 6, -6, d + 6, 0, 14, m.trim);
  put(-w / 2 - 6, w / 2 + 6, -8, d + 8, h - 12, h + 4, m.trim);
  put(-w / 2 - 4, w / 2 + 4, -5, d + 4, 84, 90, m.trim);
  const { door } = MANOR;
  extrude(b.mesh(m.trim), pointedShape(door.w + 48, door.h + 44), FRONT(0, 0, 16), 0, 10, { caps: 'front' });
  extrude(b.mesh(m.iron), pointedShape(door.w + 14, door.h + 12), FRONT(0, 0, 16), 0, 12, { caps: 'front' });
  extrude(b.mesh(m.plug), pointedShape(door.w, door.h), FRONT(0, 0, 16), 0, 14, { caps: 'front' });
  for (let i = 0; i < 3; i++) put(-70 - (2 - i) * 8, 70 + (2 - i) * 8, -20 - i * 16, -2, 0, 14 - i * 4, m.trim);
  // Two buttresses either side of the door, each capped with a small stone spire and a glowing
  // pumpkin on its foot.
  for (const sx of [-1, 1]) {
    put(sx * 82 - 11, sx * 82 + 11, -22, 2, 0, 126, m.trim);
    lathe(b.mesh(m.trim), {
      c: v3(sx * 82, -10, 126),
      segs: 10,
      smooth: true,
      profile: [
        [15, 0],
        [14, 4],
        [8, 8],
        [5, 22],
        [0, 40],
      ],
    });
  }
  // Windows: two pairs on the front, drawn in later in warm light.
  for (const sx of [-1, 1]) {
    windows.push(
      { x: sx * 112, y: -1, z: 26, w: 40, h: 54, round: true },
      { x: sx * 112, y: -1, z: 104, w: 40, h: 50, round: true },
    );
    for (const z of [26, 104]) put(sx * 112 - 27, sx * 112 + 27, -5, 0, z - 6, z + 4, m.trim);
  }

  // The roof: steep, with the pointed end to the front, a round attic window and a crooked chimney
  const roofBase = h + 6;
  gableRoof(b.mesh(m.roof), v3(0, d / 2 + 2, roofBase), w - 6, d - 6, 118, 'y', 16);
  extrude(
    b.mesh(m.wall),
    [
      [-w / 2 + 2, 0],
      [w / 2 - 2, 0],
      [0, 112],
    ],
    FRONT(0, -10, roofBase - 2),
    -2,
    6,
    { caps: 'front' },
  );
  // The gable's raking edge in pale stone, so the pointed end is outlined against the roof.
  for (const sx of [-1, 1])
    tube(
      b.mesh(m.trim),
      [
        { p: v3(sx * (w / 2 - 2), -14, roofBase - 2), r: 3.4 },
        { p: v3(0, -14, roofBase + 112), r: 3.4 },
      ],
      { segs: 6 },
    );
  box(b.mesh(m.trim), v3(0, d / 2 + 2, roofBase + 119), v3(8, d - 6, 7));
  put(60, 96, 100, 138, roofBase + 40, roofBase + 150, m.trim);
  put(56, 100, 96, 142, roofBase + 150, roofBase + 164, m.trim);
  // Little iron finials on the gable's corners.
  for (const sx of [-1, 1]) finial(b.mesh(m.iron), v3(sx * (w / 2 + 4), -4, h + 6), 44, 5);

  // The left tower: round, three drums, each stepped a little to one side so it leans, under a bent
  // witch's hat
  const drums: { cx: number; r: number; z0: number; z1: number }[] = [
    { cx: -204, r: 54, z0: 0, z1: 120 },
    { cx: -200, r: 48, z0: 120, z1: 196 },
    { cx: -190, r: 42, z0: 196, z1: 256 },
  ];
  const TY = 56;
  for (const t of drums) {
    lathe(b.mesh(m.tower(t.cx, TY, t.r)), {
      c: v3(t.cx, TY, t.z0),
      segs: 22,
      profile: [
        [t.r, 0],
        [t.r, t.z1 - t.z0],
        [0, t.z1 - t.z0],
      ],
    });
    lathe(b.mesh(m.trim), {
      c: v3(t.cx, TY, t.z1 - 4),
      segs: 22,
      profile: [
        [t.r + 5, 0],
        [t.r + 5, 6],
        [t.r - 6, 6],
        [0, 6],
      ],
    });
  }
  lathe(b.mesh(m.trim), {
    c: v3(-204, TY, 0),
    segs: 22,
    profile: [
      [60, 0],
      [60, 12],
      [54, 14],
      [0, 14],
    ],
  });
  coneRoof(b.mesh(m.roof), v3(-182, TY, 256), 56, 138, 24, 1.7);
  finial(b.mesh(m.iron), v3(-166, TY, 388), 46, 4);
  windows.push(
    { x: -204, y: TY - 54, z: 52, w: 18, h: 40, round: true },
    { x: -200, y: TY - 48, z: 140, w: 24, h: 38, round: true },
    { x: -190, y: TY - 42, z: 212, w: 22, h: 30, round: true },
  );

  // The right tower: square and tall, with a pyramid roof that has slipped sideways
  const RX = 202,
    RY = 44;
  put(RX - 44, RX + 44, RY - 44, RY + 44, 0, 236);
  put(RX - 52, RX + 52, RY - 52, RY + 52, 0, 16, m.trim);
  put(RX - 50, RX + 50, RY - 50, RY + 50, 118, 126, m.trim);
  put(RX - 52, RX + 52, RY - 52, RY + 52, 230, 246, m.trim);
  hipRoof(b.mesh(m.roof), v3(RX - 10, RY, 246), 88, 88, 124, 12);
  finial(b.mesh(m.gold), v3(RX - 10, RY, 366), 42, 4.6);
  windows.push(
    { x: RX, y: RY - 44, z: 150, w: 30, h: 50, round: true },
    { x: RX, y: RY - 44, z: 40, w: 24, h: 40, round: true },
  );
  // A sad little bat-shaped weathervane on the chimney.
  const vane = v3(78, 120, roofBase + 170);
  tube(
    b.mesh(m.iron),
    [
      { p: v3(78, 120, roofBase + 164), r: 1.6 },
      { p: vane, r: 1.6 },
    ],
    { segs: 6 },
  );

  // Ivy: a few vines climb the corners, with small leaves
  for (const sx of [-1, 1]) {
    const pts = Array.from({ length: 6 }, (_, i) => ({
      p: v3(sx * (w / 2 - 6 + Math.sin(i * 1.7) * 3), -3, 20 + i * 24),
      r: 1.8,
    }));
    tube(b.mesh(m.vine), pts, { segs: 6 });
    pts.forEach((q, i) => {
      blob(b.mesh(m.vine), v3(q.p[0] + (i % 2 ? 6 : -6) * sx, -4, q.p[2]), v3(6, 2.4, 4), 0, { rings: 4, segs: 8 });
    });
  }
  return { b, windows, attic: { x: 0, z: roofBase + 44, r: 21 }, vane };
}

const GLOW: readonly RGB[] = [
  [255, 244, 178],
  [255, 214, 110],
  [250, 168, 58],
  [214, 110, 40],
];

function paintWindow(p: Painter, at: RenderedObject['at'], o: Opening): void {
  const [cx0, by] = at(v3(o.x, o.y, o.z));
  const [, ty] = at(v3(o.x, o.y, o.z + o.h));
  const cx = Math.round(cx0),
    y1 = Math.round(by),
    y0 = Math.round(ty);
  const hw = o.w / 2 - 1;
  const arch = hw;
  const inside = (x: number, y: number): boolean => {
    const dx = Math.abs(x + 0.5 - cx);
    if (dx > hw) return false;
    if (y < y0 || y >= y1) return false;
    if (y < y0 + arch) return Math.hypot(dx, y + 0.5 - (y0 + arch)) <= hw + 0.4;
    return true;
  };
  // Warm light on the wall round it first, then a frame, then the glass.
  for (let y = y0 - 14; y < y1 + 12; y++)
    for (let x = cx - hw - 14; x < cx + hw + 14; x++) {
      if (inside(x, y) || p.get(x, y)[3] !== 255) continue;
      const dd = Math.hypot((x + 0.5 - cx) / (hw + 14), (y + 0.5 - (y0 + y1) / 2) / ((y1 - y0) / 2 + 12));
      if (dd < 1) p.over(x, y, [255, 190, 90], 0.2 * (1 - dd));
    }
  for (let y = y0 - 2; y < y1 + 2; y++)
    for (let x = cx - hw - 3; x <= cx + hw + 3; x++) {
      const near =
        inside(x - 1, y) ||
        inside(x + 1, y) ||
        inside(x, y - 1) ||
        inside(x, y + 1) ||
        inside(x - 2, y) ||
        inside(x + 2, y) ||
        inside(x, y - 2);
      if (!inside(x, y) && near && p.get(x, y)[3] === 255) p.px(x, y, rgb(x + y < cx + y0 ? TRIM[4]! : TRIM[2]!));
    }
  for (let y = y0; y < y1; y++)
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (!inside(x, y)) continue;
      const t = (y - y0) / Math.max(1, y1 - y0);
      p.px(x, y, rgb(GLOW[t < 0.2 ? 0 : t < 0.5 ? 1 : t < 0.8 ? 2 : 3]!));
    }
  // Dark muntins: one up the middle, one across.
  const my = Math.round(y0 + (y1 - y0) * 0.42);
  for (let y = y0; y < y1; y++) if (inside(cx, y)) p.px(cx, y, [74, 38, 82]);
  if (o.w > 28)
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) if (inside(x, my)) p.px(x, my, [74, 38, 82]);
}

function paintAttic(p: Painter, at: RenderedObject['at'], a: { x: number; z: number; r: number }): void {
  const [cx0, cy0] = at(v3(a.x, -11, a.z));
  const cx = Math.round(cx0),
    cy = Math.round(cy0);
  const R = a.r;
  for (let y = -R - 5; y <= R + 5; y++)
    for (let x = -R - 5; x <= R + 5; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R + 4) continue;
      let c: RGB;
      if (d > R + 2) c = [40, 26, 66];
      else if (d > R - 1) c = TRIM[x + y < 0 ? 4 : 2]!;
      else if (d > R - 3) c = TRIM[x + y < 0 ? 3 : 1]!;
      else {
        const t = (y + R) / (2 * R);
        c = GLOW[t < 0.25 ? 0 : t < 0.55 ? 1 : t < 0.8 ? 2 : 3]!;
      }
      p.px(cx + x, cy + y, rgb(c));
    }
  // A tiny bat is hanging in the window, upside down against the light, with its wings folded.
  const dark: RGB = [66, 34, 88];
  for (const [x, y] of [
    [0, -2],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [0, 1],
    [-2, -4],
    [-2, -3],
    [2, -4],
    [2, -3],
    [-1, 2],
    [1, 2],
  ] as const)
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) p.px(cx + x * 2 + k, cy + y * 2 + j - 2, rgb(dark));
  for (const dx of [-3, 2]) p.px(cx + dx, cy - 3, [255, 246, 200]);
  p.px(cx, cy - R + 1, [255, 255, 255]);
}

export function renderManor(): Rgba {
  const { b, windows, attic } = build();
  const c = MANOR.canvas;
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
  paintAttic(p, out.at, attic);
  return out.rgba;
}
