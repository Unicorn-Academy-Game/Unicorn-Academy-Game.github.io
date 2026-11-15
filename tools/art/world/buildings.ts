import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { v3 } from '../core/vec';
import { archShape, column, extrude, FRONT, finial, gableRoof, lathe } from './arch';
import { feedCrate } from './feed';
import { Painter } from './paint';
import { GEM, PAL, PALACE, type Ramp } from './palette';
import { box } from './prims';
import { type RenderedObject, renderScene, SceneBuilder } from './scene';
import { masonry, shade, tiles, wallScale } from './walls';

const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];
const S = wallScale(1);

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

interface Mats {
  b: SceneBuilder;
  wall: number;
  trim: number;
  gold: number;
  roof: number;
  dark: number;
  wood: number;
  stone: number;
}

const COOL_STONE: Ramp = ramp(hex('#ebe4f4'), {
  steps: 6,
  shadowHue: 285,
  lightHue: 85,
  lean: 0.8,
  lightness: [-0.3, -0.19, -0.1, -0.04, 0, 0.05],
});
const TERRACOTTA: Ramp = ramp(hex('#e0825c'), {
  steps: 6,
  shadowHue: 330,
  lightHue: 60,
  lean: 1.0,
  lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
});
const WOOD_DARK: Ramp = ramp(hex('#8a5a3c'), {
  steps: 6,
  shadowHue: 320,
  lightHue: 65,
  lean: 0.9,
  lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17],
});

function materials(o: { wall: Ramp; roof: Ramp; seed: number; roofRows?: 'x' | 'y' }): Mats {
  const b = new SceneBuilder();
  const wallV = b.variant('wall', o.wall);
  const mortarV = b.variant('mortar', shade(o.wall, 0.8, [255, 245, 255]), {
    protect: true,
    noLines: true,
    noOutline: true,
  });
  const goldV = b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] });
  const roofV = b.variant('roof', o.roof);
  const lipV = b.variant('roofLip', shade(o.roof, 0.76, [250, 235, 245]), { protect: true, noLines: true });
  const nightV = b.variant(
    'night',
    [
      [44, 30, 74],
      [58, 40, 92],
      [80, 56, 116],
    ] as Ramp,
    { flat: 0 },
  );
  const woodV = b.variant('wood', WOOD_DARK);
  const stoneV = b.variant('stone', PAL.stone);
  const stone = masonry({ rowH: S.rowUnits(22), blockW: S.colUnits(52), seed: o.seed }, S);
  const roofTile = tiles({ rowH: 12, tileW: 16, seed: o.seed + 17, along: o.roofRows ?? 'x' });
  return {
    b,
    wall: b.material({ name: 'wall', shade: (s) => (stone(s).mortar ? mortarV : wallV), bias: (s) => stone(s).tone }),
    trim: b.solid('trim', wallV, (s) => (hash2(s.px, s.py, 3) - 0.5) * 0.03),
    gold: b.solid('gold', goldV, (s) => (hash2(s.px, s.py, 11) - 0.5) * 0.05),
    roof: b.material({ name: 'roof', shade: (s) => (roofTile(s).lip ? lipV : roofV), bias: (s) => roofTile(s).tone }),
    dark: b.solid('night', nightV),
    wood: b.solid('wood', woodV, (s) => (hash2(s.px >> 1, s.py, 5) - 0.5) * 0.08),
    stone: b.solid('stone', stoneV, (s) => (hash2(s.px, s.py, 9) - 0.5) * 0.06),
  };
}

export const TREASURE = {
  canvas: { w: 460, h: 420, ox: 230, oy: 330 } as Canvas,
  body: { w: 340, d: 200, h: 168 },
  door: { w: 100, h: 120 },
  /**
   * Door centre on the ground in scene units, for the overlay sprites and the map's door anchor.
   */
  doorBase: { x: 0, y: -2, z: 14 },
};

function buildTreasure(): { scene: SceneBuilder; portholes: { x: number; z: number; r: number }[] } {
  const m = materials({ wall: COOL_STONE, roof: PALACE.roofTeal, seed: 5, roofRows: 'y' });
  const { b } = m;
  const { w, d, h } = TREASURE.body;
  const put = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat = m.wall): void => {
    box(b.mesh(mat), v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), v3(x1 - x0, y1 - y0, z1 - z0), 0);
  };
  put(-w / 2, w / 2, 0, d, 0, h);
  put(-w / 2 - 6, w / 2 + 6, -8, d + 6, 0, 16, m.trim);
  put(-w / 2 - 8, w / 2 + 8, -16, d + 10, h - 14, h + 6, m.trim);
  const gold = b.mesh(m.gold);
  box(gold, v3(0, -17, h - 4), v3(w + 16, 3, 5), 0);
  box(gold, v3(0, -9, 24), v3(w + 12, 3, 4), 0);
  // The doorway: a gold arch of trim around a dark opening the door sprites cover.
  extrude(b.mesh(m.trim), archShape(TREASURE.door.w + 40, TREASURE.door.h + 36), FRONT(0, 0, 14), 0, 10, {
    caps: 'front',
  });
  extrude(b.mesh(m.gold), archShape(TREASURE.door.w + 16, TREASURE.door.h + 14), FRONT(0, 0, 14), 0, 12, {
    caps: 'front',
  });
  extrude(b.mesh(m.dark), archShape(TREASURE.door.w + 4, TREASURE.door.h + 3), FRONT(0, 0, 14), 0, 14, {
    caps: 'front',
  });
  // Steps, a pair of columns and a lintel that carries the pediment.
  for (let i = 0; i < 3; i++) put(-92 - (2 - i) * 8, 92 + (2 - i) * 8, -22 - i * 18, -2, 0, 14 - i * 4, m.trim);
  for (const x of [-70, 70]) column(b.mesh(m.trim), v3(x, -30, 14), 144, 9);
  put(-96, 96, -40, -14, 158, 174, m.trim);
  box(gold, v3(0, -41, 166), v3(196, 3, 5), 0);
  // Roof: a steep gable with the pointed end facing the player, a gold ridge and gold pinnacles.
  const roofBase = h + 6;
  gableRoof(b.mesh(m.roof), v3(0, d / 2 + 2, roofBase), w - 10, d - 10, 98, 'y', 14);
  box(gold, v3(0, d / 2 + 2, roofBase + 98 + 1), v3(7, d - 6, 6), 0);
  for (const sx of [-1, 1]) {
    finial(gold, v3(sx * (w / 2 + 2), -4, h + 4), 52, 6);
    finial(gold, v3(sx * (w / 2 + 2), d, h + 4), 40, 5);
  }
  // The front gable end: a stone triangle filled in under the roof edge.
  extrude(
    b.mesh(m.trim),
    [
      [-w / 2 + 2, 0],
      [w / 2 - 2, 0],
      [0, 94],
    ],
    FRONT(0, -10, roofBase - 2),
    -2,
    6,
    { caps: 'front' },
  );
  lathe(gold, {
    c: v3(0, -10, roofBase + 92),
    segs: 14,
    smooth: true,
    profile: [
      [2, 0],
      [6, 6],
      [8, 16],
      [6, 26],
      [0, 34],
    ],
  });
  return {
    scene: b,
    portholes: [
      { x: -126, z: 104, r: 21 },
      { x: 126, z: 104, r: 21 },
    ],
  };
}

function paintTreasure(
  img: Rgba,
  at: RenderedObject['at'],
  portholes: readonly { x: number; z: number; r: number }[],
): void {
  const p = new Painter(img);
  const gold = GEM.gold;
  for (const w of portholes) {
    const [cx0, cy0] = at(v3(w.x, -1, w.z));
    const cx = Math.round(cx0),
      cy = Math.round(cy0);
    const R = w.r;
    for (let y = -R - 5; y <= R + 5; y++) {
      for (let x = -R - 5; x <= R + 5; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5);
        if (d > R + 4) continue;
        let c: RGB;
        if (d > R + 2) c = [86, 46, 90];
        else if (d > R - 1) c = gold[x + y < 0 ? 4 : 2]!;
        else if (d > R - 3) c = gold[x + y < 0 ? 3 : 1]!;
        else {
          const t = (y + R) / (2 * R);
          c = PALACE.glass[t < 0.25 ? 4 : t < 0.55 ? 3 : t < 0.8 ? 2 : 1]!;
          if (Math.abs(x) <= 0 || Math.abs(y) <= 0) c = gold[3]!;
        }
        p.px(cx + x, cy + y, rgb(c));
      }
    }
    // Warm light on the wall around it.
    for (let y = -R - 12; y <= R + 12; y++)
      for (let x = -R - 12; x <= R + 12; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5);
        if (d <= R + 4 || d > R + 12 || p.get(cx + x, cy + y)[3] !== 255) continue;
        p.over(cx + x, cy + y, rgb(PALACE.glass[3]!), d < R + 7 ? 0.28 : 0.12);
      }
  }
  // A sun medallion on the pediment.
  const [mx0, my0] = at(v3(0, -11, TREASURE.body.h + 6 + 40));
  const mx = Math.round(mx0),
    my = Math.round(my0);
  for (let y = -22; y <= 22; y++)
    for (let x = -22; x <= 22; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > 21) continue;
      const ray = Math.atan2(y + 0.5, x + 0.5);
      const spoke = d > 12 && Math.floor(((ray + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0;
      let c: RGB;
      if (d > 19) c = [122, 70, 20];
      else if (d > 12) c = spoke ? gold[4]! : gold[2]!;
      else if (d > 10) c = [122, 70, 20];
      else c = gold[x + y < -2 ? 5 : x + y < 3 ? 4 : 3]!;
      p.px(mx + x, my + y, rgb(c));
    }
}

export function renderTreasureHouse(): Rgba {
  const { scene, portholes } = buildTreasure();
  const c = TREASURE.canvas;
  const out = renderScene(scene, {
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
  paintTreasure(out.rgba, out.at, portholes);
  return out.rgba;
}

export const STABLE = {
  canvas: { w: 460, h: 400, ox: 230, oy: 322 } as Canvas,
  body: { w: 380, d: 190, h: 150 },
  door: { w: 112, h: 106 },
  doorBase: { x: 0, y: -2, z: 16 },
};

function buildStable(): {
  scene: SceneBuilder;
  windows: { x: number; z: number; w: number; h: number }[];
  hatch: { x: number; z: number };
} {
  const m = materials({ wall: PALACE.wall, roof: TERRACOTTA, seed: 9 });
  const { b } = m;
  const { w, d, h } = STABLE.body;
  const plaster = b.variant('plaster', PALACE.wall);
  const plasterMat = b.solid('plaster', plaster);
  const put = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: number): void => {
    box(b.mesh(mat), v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), v3(x1 - x0, y1 - y0, z1 - z0), 0);
  };
  put(-w / 2, w / 2, 0, d, 16, h, plasterMat);
  put(-w / 2 - 4, w / 2 + 4, -4, d + 4, 0, 18, m.stone);
  // The timber frame: posts, rails and braces on the front.
  const post = (x: number): void => put(x - 5, x + 5, -7, 0, 16, h + 2, m.wood);
  for (const x of [-w / 2, -w / 2 + 96, -76, 76, w / 2 - 96, w / 2]) post(x);
  put(-w / 2, w / 2, -7, 0, 16, 26, m.wood);
  put(-w / 2, w / 2, -7, 0, h - 10, h + 4, m.wood);
  put(-w / 2, w / 2, -6, 0, 62, 70, m.wood);
  // The doorway for the split door, set in a heavy timber surround.
  const dw = STABLE.door.w / 2,
    dh = STABLE.door.h;
  put(-dw - 12, -dw, -9, 0, 16, 16 + dh + 12, m.wood);
  put(dw, dw + 12, -9, 0, 16, 16 + dh + 12, m.wood);
  put(-dw - 12, dw + 12, -10, 0, 16 + dh, 16 + dh + 14, m.wood);
  extrude(
    b.mesh(m.dark),
    [
      [-dw, 0],
      [dw, 0],
      [dw, dh],
      [-dw, dh],
    ],
    FRONT(0, 0, 16),
    -1,
    5,
    { caps: 'front' },
  );
  // Roof: a long terracotta slope with a loft dormer, a wooden ridge and a weathervane post.
  const roofBase = h + 4;
  gableRoof(b.mesh(m.roof), v3(0, d / 2 + 2, roofBase), w - 6, d - 6, 100, 'x', 18);
  put(-w / 2 - 12, w / 2 + 12, d / 2 - 1, d / 2 + 5, roofBase + 99, roofBase + 105, m.wood);
  // Loft dormer: a wall box and a little roof over it.
  const dz = roofBase + 30;
  put(-34, 34, 28, 74, dz - 4, dz + 46, plasterMat);
  extrude(
    b.mesh(plasterMat),
    [
      [-34, 0],
      [34, 0],
      [0, 26],
    ],
    FRONT(0, 26, dz + 46),
    -48,
    0,
    { caps: 'front' },
  );
  gableRoof(b.mesh(m.roof), v3(0, 51, dz + 46), 68, 48, 26, 'y', 8);
  put(-26, 26, 25, 28, dz + 2, dz + 40, m.dark);
  // Crates of fruit and a water trough beside the door.
  feedCrate(b, { at: v3(108, -44, 0), kind: 'apple', yaw: 0.04, seed: 21 });
  feedCrate(b, { at: v3(107, -44, 28), kind: 'berry', yaw: -0.06, seed: 22 });
  feedCrate(b, { at: v3(182, -18, 0), kind: 'carrot', yaw: 0.12, seed: 23 });
  put(-190, -120, -66, -34, 0, 24, m.wood);
  put(-186, -124, -62, -38, 20, 25, b.solid('water', b.variant('water', PAL.water, { protect: true })));
  const gold = b.mesh(m.gold);
  lathe(gold, {
    c: v3(w / 2 + 6, d / 2 + 2, roofBase + 100),
    segs: 8,
    smooth: true,
    profile: [
      [2, 0],
      [2.4, 40],
      [1.4, 46],
      [0, 46],
    ],
  });
  return {
    scene: b,
    windows: [
      { x: -124, z: 70, w: 44, h: 52 },
      { x: 124, z: 70, w: 44, h: 52 },
    ],
    hatch: { x: 0, z: dz + 20 },
  };
}

function paintStable(
  img: Rgba,
  at: RenderedObject['at'],
  windows: readonly { x: number; z: number; w: number; h: number }[],
  hatch: { x: number; z: number },
): void {
  const p = new Painter(img);
  const wood = WOOD_DARK;
  const glass = PALACE.glass;
  // Diagonal braces in the low bays, drawn flat: thin timber is too narrow for the 3D pass to keep
  // clean.
  const bay = (x0: number, x1: number, rising: boolean): void => {
    const [ax, ay] = at(v3(rising ? x0 : x1, -7, 27));
    const [bx, by2] = at(v3(rising ? x1 : x0, -7, 61));
    const steps = Math.ceil(Math.hypot(bx - ax, by2 - ay));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(ax + (bx - ax) * t),
        y = Math.round(ay + (by2 - ay) * t);
      for (let k = -3; k <= 3; k++) p.px(x, y + k, rgb(wood[k < -1 ? 4 : k > 1 ? 1 : 3]!));
    }
  };
  bay(-185, -99, true);
  bay(99, 185, false);
  for (const w of windows) {
    const [cx0, by] = at(v3(w.x, -1, w.z));
    const [, ty] = at(v3(w.x, -1, w.z + w.h));
    const x0 = Math.round(cx0 - w.w / 2),
      x1 = x0 + w.w,
      y0 = Math.round(ty),
      y1 = Math.round(by);
    for (let y = y0 - 4; y < y1 + 4; y++) for (let x = x0 - 4; x < x1 + 4; x++) p.px(x, y, rgb(wood[1]!));
    for (let y = y0 - 2; y < y1 + 2; y++)
      for (let x = x0 - 2; x < x1 + 2; x++) p.px(x, y, rgb(wood[x < (x0 + x1) / 2 ? 4 : 3]!));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = (y - y0) / (y1 - y0);
        p.px(x, y, rgb(glass[t < 0.25 ? 4 : t < 0.55 ? 3 : t < 0.8 ? 2 : 1]!));
      }
    }
    const mx = Math.round((x0 + x1) / 2),
      my = Math.round((y0 + y1) / 2);
    for (let y = y0; y < y1; y++) p.px(mx, y, rgb(wood[3]!));
    for (let x = x0; x < x1; x++) p.px(x, my, rgb(wood[3]!));
    // Teal shutters with a heart cut-out, and a flower box under the sill.
    for (const s of [-1, 1]) {
      const sx0 = s < 0 ? x0 - 14 : x1 + 1;
      for (let y = y0 - 2; y < y1 + 2; y++)
        for (let x = sx0; x < sx0 + 13; x++) p.px(x, y, rgb(PALACE.roofTeal[(x - sx0) % 4 === 3 ? 2 : 3]!));
      for (let y = y0 - 2; y < y1 + 2; y++) p.px(sx0 + (s < 0 ? 0 : 12), y, rgb(PALACE.roofTeal[1]!));
    }
    for (let x = x0 - 6; x < x1 + 6; x++)
      for (let y = y1 + 2; y < y1 + 8; y++) p.px(x, y, rgb(wood[y === y1 + 2 ? 4 : 2]!));
    for (let i = 0; i < 7; i++) {
      const fx = x0 - 4 + i * Math.round((w.w + 8) / 6);
      const bloom = [BLOOM_PINK, BLOOM_YELLOW, BLOOM_WHITE][i % 3]!;
      p.px(fx, y1, rgb(bloom));
      p.px(fx + 1, y1, rgb(bloom));
      p.px(fx, y1 - 1, rgb(bloom));
      p.px(fx + 1, y1 - 1, rgb([255, 214, 90]));
      p.px(fx, y1 + 1, rgb([60, 140, 70]));
      p.px(fx + 1, y1 + 1, rgb([60, 140, 70]));
    }
  }
  // The loft hatch: a small door standing open on a heap of fruit.
  const [hx0, hy0] = at(v3(hatch.x, 24, hatch.z));
  const hx = Math.round(hx0),
    hy = Math.round(hy0);
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) p.px(hx + x, hy + y, rgb(PAL.wood[1]!));
  for (const [dx, dy, r, c] of [
    [-6, 6, 5, FRUIT.apple],
    [3, 7, 5, FRUIT.apple],
    [-1, 0, 4, FRUIT.berry],
    [8, 1, 4, FRUIT.carrot],
    [-8, -1, 4, FRUIT.carrot],
  ] as const) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        p.px(hx + dx + x, hy + dy + y, rgb(x + y < -r / 2 ? c[2] : x + y > r / 2 ? c[0] : c[1]));
      }
  }
  for (let y = -14; y <= 14; y++)
    for (let x = -14; x <= 14; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) >= 13) p.px(hx + x, hy + y, rgb(wood[2]!));
    }
  // Weathervane: a little unicorn silhouette on the ridge post.
  const [wx0, wy0] = at(v3(STABLE.body.w / 2 + 6, STABLE.body.d / 2 + 2, STABLE.body.h + 4 + 146));
  const wx = Math.round(wx0),
    wy = Math.round(wy0);
  const horse = [
    '..........#..',
    '.........##..',
    '........###..',
    '..####.####..',
    '.###########.',
    '#############.',
    '.####..####..',
    '.#.#....#.#..',
  ];
  horse.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '#') p.px(wx - 6 + i, wy - 6 + j, rgb(GEM.gold[j < 1 ? 5 : j < 4 ? 4 : 2]!));
    });
  });
}

const FRUIT = {
  apple: [
    [168, 38, 56],
    [232, 64, 63],
    [250, 130, 108],
  ],
  berry: [
    [70, 100, 200],
    [111, 168, 255],
    [190, 220, 255],
  ],
  carrot: [
    [190, 84, 30],
    [242, 134, 43],
    [255, 190, 110],
  ],
} as const satisfies Record<string, readonly (readonly [number, number, number])[]>;
const BLOOM_PINK: RGB = [240, 122, 168];
const BLOOM_YELLOW: RGB = [255, 216, 74];
const BLOOM_WHITE: RGB = [255, 246, 236];

export function renderStableExterior(): Rgba {
  const { scene, windows, hatch } = buildStable();
  const c = STABLE.canvas;
  const out = renderScene(scene, {
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
  paintStable(out.rgba, out.at, windows, hatch);
  return out.rgba;
}
