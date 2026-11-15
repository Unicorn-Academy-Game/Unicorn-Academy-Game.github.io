import type { RGB } from '../core/color';
import type { Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { v3 } from '../core/vec';
import { archShape, column, coneRoof, dome, extrude, FRONT, finial, gableRoof, hipRoof, lathe } from './arch';
import { Painter } from './paint';
import { GEM, PALACE, type Ramp } from './palette';
import { box, ribbon } from './prims';
import { type RenderedObject, renderScene, SceneBuilder } from './scene';
import { shade, tiles, masonry as wallMasonry, wallScale } from './walls';

/**
 * The Fairy Palace, as pieces that share one coordinate system: x east, y away from the camera, z
 * up, with the origin at the middle of the keep's front wall on the ground. Each piece renders to
 * its own sprite and the map places them at the same world position, so they line up exactly.
 * Windows and the door are drawn on afterwards in 2D, where every pixel is chosen.
 */

/**
 * The palace is modelled big and drawn at this many pixels per unit, so it fits a phone's view
 * beside the unicorns.
 */
export const PALACE_SCALE = 0.85;
const PITCH = (27 * Math.PI) / 180;
/**
 * Masonry sized in final pixels, so every course is a whole number of rows and the mortar stays one
 * crisp pixel.
 */
const rowUnits = (px: number): number => px / (PALACE_SCALE * Math.cos(PITCH));
const colUnits = (px: number): number => px / PALACE_SCALE;

/** Layout in scene units. The map reads these to place sprites and to block the footprint. */
export const PALACE_LAYOUT = {
  keep: { w: 560, d: 230, h: 520 },
  tower: { x: 412, y: 34, r: 88, h: 540, roof: 250 },
  wing: { x0: 502, x1: 740, d: 190, h: 270 },
  endTower: { x: 830, y: 56, r: 62, h: 400, roof: 200 },
  door: { w: 132, h: 188 },
  /** The gold rod the banner hangs from, and how much wall is free beneath it. */
  banner: { rodZ: 486, width: 380, drop: 196, y: -9 },
} as const;

const S = wallScale(PALACE_SCALE);
const masonry = (o: Parameters<typeof wallMasonry>[0]) => wallMasonry(o, S);

interface Kit {
  b: SceneBuilder;
  wallMat: number;
  trimMat: number;
  goldMat: number;
  roofMat: Record<'rose' | 'violet', number>;
  darkMat: number;
  carpetMat: number;
}

/** Everything shared by all palace pieces: the variants and materials. */
function kit(): Kit {
  const b = new SceneBuilder();
  const wall = b.variant('wall', PALACE.wall);
  const mortarVar = b.variant('mortar', shade(PALACE.wall, 0.8, [255, 245, 255]), {
    protect: true,
    noLines: true,
    noOutline: true,
  });
  const gold = b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] });
  const rose = b.variant('roofRose', PALACE.roofRose);
  const roseLip = b.variant('roofRoseLip', shade(PALACE.roofRose, 0.76, [255, 235, 255]), {
    protect: true,
    noLines: true,
  });
  const violet = b.variant('roofViolet', PALACE.roofViolet);
  const violetLip = b.variant('roofVioletLip', shade(PALACE.roofViolet, 0.76, [235, 235, 255]), {
    protect: true,
    noLines: true,
  });
  const night = b.variant(
    'night',
    [
      [44, 30, 74],
      [58, 40, 92],
      [80, 56, 116],
    ] as Ramp,
    { flat: 0 },
  );
  const carpet = b.variant('carpet', PALACE.banner);

  const wallStone = masonry({ rowH: rowUnits(22), blockW: colUnits(56), seed: 3 });
  const wallMat = b.material({
    name: 'wall',
    shade: (s) => (wallStone(s).mortar ? mortarVar : wall),
    bias: (s) => wallStone(s).tone,
  });
  const trimMat = b.solid('trim', wall);
  const goldMat = b.solid('gold', gold, (s) => (hash2(s.px, s.py, 11) - 0.5) * 0.05);
  const roofTile = tiles({ rowH: 12, tileW: 16, seed: 21 });
  const roofMat = {
    rose: b.material({
      name: 'roofRose',
      shade: (s) => (roofTile(s).lip ? roseLip : rose),
      bias: (s) => roofTile(s).tone,
    }),
    violet: b.material({
      name: 'roofViolet',
      shade: (s) => (roofTile(s).lip ? violetLip : violet),
      bias: (s) => roofTile(s).tone,
    }),
  };
  const darkMat = b.solid('night', night);
  const carpetMat = b.solid('carpet', carpet);
  return { b, wallMat, trimMat, goldMat, roofMat, darkMat, carpetMat };
}

interface TowerOpts {
  cx: number;
  cy: number;
  z0?: number;
  r: number;
  h: number;
  roofH: number;
  roof: 'rose' | 'violet';
  /** Which way the pennant streams. */
  flag: 1 | -1;
  /** Gold balcony ring at this fraction of the height, or none. */
  balcony?: number;
  bands?: number[];
  seed?: number;
}

/** A tower with a cone roof: bands of trim, a gold balcony ring, a finial and a pennant. */
function tower(k: Kit, o: TowerOpts): void {
  const { b } = k;
  const { cx, cy, r, h, roofH } = o;
  const z0 = o.z0 ?? 0;
  const stone = masonry({ rowH: rowUnits(22), blockW: colUnits(48), round: { cx, cy, r }, seed: o.seed ?? 4 });
  const wallMesh = b.mesh(
    b.material({ name: 'towerWall', shade: (s) => (stone(s).mortar ? 1 : 0), bias: (s) => stone(s).tone }),
  );
  lathe(wallMesh, {
    c: v3(cx, cy, z0),
    segs: 28,
    profile: [
      [r * 1.12, 0],
      [r * 1.12, 20],
      [r * 1.04, 28],
      [r, 34],
      [r, h - 24],
      [r * 1.05, h - 12],
      [r * 1.14, h - 6],
      [r * 1.14, h],
    ],
  });
  const trim = b.mesh(k.trimMat);
  for (const f of o.bands ?? [0.36, 0.7])
    lathe(trim, {
      c: v3(cx, cy, z0 + h * f),
      segs: 28,
      profile: [
        [r * 1.0, 0],
        [r * 1.1, 4],
        [r * 1.1, 12],
        [r * 1.02, 16],
      ],
    });
  const gold = b.mesh(k.goldMat);
  if (o.balcony !== undefined) {
    const bz = z0 + h * o.balcony + 16;
    lathe(gold, {
      c: v3(cx, cy, bz),
      segs: 28,
      profile: [
        [r * 1.2, 0],
        [r * 1.2, 5],
        [r * 1.12, 5],
      ],
    });
    const posts = Math.round(r / 4.4);
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      lathe(gold, {
        c: v3(cx + Math.cos(a) * r * 1.17, cy + Math.sin(a) * r * 1.17, bz + 5),
        segs: 6,
        profile: [
          [1.6, 0],
          [1.1, 4],
          [1.1, 12],
          [1.8, 14],
          [0, 14],
        ],
      });
    }
  }
  coneRoof(b.mesh(k.roofMat[o.roof]), v3(cx, cy, z0 + h), r, roofH, 28, 1.35);
  finial(gold, v3(cx, cy, z0 + h + roofH - 4), 70, 5.5);
  const flag = b.mesh(k.roofMat.rose, { twoSided: true, noLines: true, noShadow: true });
  const fz = z0 + h + roofH + 50;
  ribbon(
    flag,
    [
      { p: v3(cx, cy, fz), w: 7, t: 1 },
      { p: v3(cx + 24 * o.flag, cy, fz - 4), w: 6.5, t: 1 },
      { p: v3(cx + 52 * o.flag, cy, fz + 2), w: 4, t: 1 },
      { p: v3(cx + 76 * o.flag, cy, fz - 2), w: 0.8, t: 1 },
    ],
    v3(0, -1, 0),
    6,
  );
}

interface DormerOpts {
  x: number;
  /** Where the dormer's front face stands on the roof, as a y position. */
  yFront: number;
  w: number;
  /** Height of the face above the roof surface, and how far the little gable rises above that. */
  wall: number;
  rise: number;
  /** Height of the main roof's front slope at a y position, and how fast it climbs. */
  roofZ: (y: number) => number;
  slope: number;
}

/**
 * A gabled dormer on a sloping roof. Its ridge ends where it meets the main slope, so nothing
 * floats.
 */
function dormer(k: Kit, o: DormerOpts): WindowSpec {
  const { b } = k;
  const zRoof = o.roofZ(o.yFront);
  const zWall = zRoof + o.wall;
  const depth = (o.wall + o.rise) / o.slope;
  const yMid = o.yFront + depth / 2;
  box(b.mesh(k.wallMat), v3(o.x, yMid, (zRoof - 8 + zWall) / 2), v3(o.w, depth, zWall - zRoof + 8), 0);
  extrude(
    b.mesh(k.wallMat),
    [
      [-o.w / 2, 0],
      [o.w / 2, 0],
      [0, o.rise],
    ],
    FRONT(o.x, o.yFront, zWall),
    -depth,
    0,
    { caps: 'front' },
  );
  gableRoof(b.mesh(k.roofMat.rose), v3(o.x, yMid, zWall), o.w, depth, o.rise, 'y', 6);
  return { x: o.x, z: zRoof + 5, w: o.w - 18, h: o.wall - 2, y: o.yFront };
}

export interface WindowSpec {
  /** Center x and bottom z of the window on its wall, in scene units. */
  x: number;
  z: number;
  w: number;
  h: number;
  /** On a round tower, the radius, so the window sits on the curved front. */
  round?: number;
  /** Where the wall's front is in y. Default 0, or -round on a tower. */
  y?: number;
}

export type PalacePiece = 'keep' | 'tower-left' | 'tower-right' | 'wing-left' | 'wing-right' | 'end-left' | 'end-right';

/** The slant of the camera: one unit of depth moves a point this much up the screen. */
const DEPTH = Math.sin(PITCH) * PALACE_SCALE;

export interface PieceLayout {
  canvas: { w: number; h: number; ox: number; oy: number };
  /**
   * Where the piece's own origin sits relative to the keep's, in map units (screen pixels at zoom
   * 1).
   */
  at: { x: number; y: number };
}

/**
 * Where the rod's centre line sits above the keep's ground origin, in pixels. The banner sprite
 * hangs from here.
 */
export const BANNER_ROD_RISE = Math.round(
  (-PALACE_LAYOUT.banner.y * -Math.sin(PITCH) + PALACE_LAYOUT.banner.rodZ * Math.cos(PITCH)) * PALACE_SCALE,
);

const K = PALACE_SCALE;
/** Whole pixels, so a piece lands on the pixel grid wherever the map puts the palace. */
const px = (units: number): number => Math.round(units * K);
const rise = (y: number): number => -Math.round(y * DEPTH);
export const PALACE_PIECES: Record<PalacePiece, PieceLayout> = {
  keep: { canvas: { w: 584, h: 864, ox: 292, oy: 813 }, at: { x: 0, y: 0 } },
  'tower-left': {
    canvas: { w: 196, h: 700, ox: 98, oy: 655 },
    at: { x: -px(PALACE_LAYOUT.tower.x), y: rise(PALACE_LAYOUT.tower.y) },
  },
  'tower-right': {
    canvas: { w: 196, h: 700, ox: 98, oy: 655 },
    at: { x: px(PALACE_LAYOUT.tower.x), y: rise(PALACE_LAYOUT.tower.y) },
  },
  'wing-left': {
    canvas: { w: 236, h: 374, ox: 118, oy: 362 },
    at: { x: -px((PALACE_LAYOUT.wing.x0 + PALACE_LAYOUT.wing.x1) / 2), y: 0 },
  },
  'wing-right': {
    canvas: { w: 236, h: 374, ox: 118, oy: 362 },
    at: { x: px((PALACE_LAYOUT.wing.x0 + PALACE_LAYOUT.wing.x1) / 2), y: 0 },
  },
  'end-left': {
    canvas: { w: 144, h: 544, ox: 72, oy: 511 },
    at: { x: -px(PALACE_LAYOUT.endTower.x), y: rise(PALACE_LAYOUT.endTower.y) },
  },
  'end-right': {
    canvas: { w: 144, h: 544, ox: 72, oy: 511 },
    at: { x: px(PALACE_LAYOUT.endTower.x), y: rise(PALACE_LAYOUT.endTower.y) },
  },
};

export function pieceScene(piece: PalacePiece): { scene: SceneBuilder; windows: WindowSpec[]; door: boolean } {
  const k = kit();
  const { b } = k;
  const L = PALACE_LAYOUT;
  const windows: WindowSpec[] = [];
  let door = false;

  const wallBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat = k.wallMat): void => {
    box(b.mesh(mat), v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), v3(x1 - x0, y1 - y0, z1 - z0), 0);
  };
  const balustrade = (x0: number, x1: number, y: number, z: number, mesh = b.mesh(k.trimMat)): void => {
    box(mesh, v3((x0 + x1) / 2, y, z + 30), v3(x1 - x0, 8, 7), 0);
    box(mesh, v3((x0 + x1) / 2, y, z + 3), v3(x1 - x0, 9, 6), 0);
    const n = Math.max(2, Math.floor((x1 - x0) / 15));
    for (let i = 0; i <= n; i++)
      lathe(mesh, {
        c: v3(x0 + 3 + (i * (x1 - x0 - 6)) / n, y, z + 5),
        segs: 8,
        smooth: true,
        profile: [
          [3.4, 0],
          [3.4, 3],
          [2.4, 6],
          [2.9, 14],
          [2.0, 19],
          [3.3, 22],
          [3.3, 25],
          [0, 25],
        ],
      });
  };

  if (piece === 'keep') {
    const { w, d, h } = L.keep;
    door = true;
    wallBox(-w / 2, w / 2, 0, d, 0, h);
    wallBox(-w / 2 - 4, w / 2 + 4, -12, d + 8, 0, 26, k.trimMat);
    wallBox(-w / 2 - 4, w / 2 + 4, -18, d + 14, h - 26, h + 4, k.trimMat);
    const gold = b.mesh(k.goldMat);
    box(gold, v3(0, -19, h - 12), v3(w + 8, 3, 5), 0);
    box(gold, v3(0, -13, 40), v3(w + 4, 3, 4), 0);
    // A sweep of marble steps up to the door, with a rose carpet down the middle.
    for (let i = 0; i < 4; i++)
      wallBox(-104 - (3 - i) * 10, 104 + (3 - i) * 10, -30 - i * 26, -2, 0, 26 - i * 7, k.trimMat);
    for (let i = 0; i < 4; i++)
      box(b.mesh(k.carpetMat, { noLines: true }), v3(0, -17 - i * 26, 26 - i * 7 + 0.6), v3(60, 24, 1.4), 0);
    // Door: a pale arched frame, a gold arch of trim, and a dark reveal the 2D pass paints the
    // doors into.
    extrude(b.mesh(k.trimMat), archShape(L.door.w + 52, L.door.h + 46), FRONT(0, 0, 24), 0, 12, { caps: 'front' });
    extrude(b.mesh(k.goldMat), archShape(L.door.w + 22, L.door.h + 18), FRONT(0, 0, 24), 0, 14, { caps: 'front' });
    extrude(b.mesh(k.darkMat), archShape(L.door.w + 8, L.door.h + 6), FRONT(0, 0, 24), 0, 16, { caps: 'front' });
    // Four columns carry a balcony over the entrance.
    for (const x of [-112, -78, 78, 112]) column(b.mesh(k.trimMat), v3(x, -26, 24), 238, 9);
    wallBox(-140, 140, -42, -4, 262, 284, k.trimMat);
    box(gold, v3(0, -43, 273), v3(282, 3, 5), 0);
    balustrade(-140, 140, -36, 284);
    // Windows beside the door and tall ones above, either side of where the banner hangs.
    for (const x of [-236, 236]) {
      windows.push({ x, z: 80, w: 56, h: 112 });
      windows.push({ x, z: 336, w: 56, h: 140 });
    }
    // The rod for the banner, with ball ends.
    box(gold, v3(0, L.banner.y, L.banner.rodZ), v3(L.banner.width + 30, 6, 6), 0);
    for (const s of [-1, 1]) finial(gold, v3(s * (L.banner.width / 2 + 22), L.banner.y, L.banner.rodZ - 4), 26, 4);
    // Parapet with a balustrade along the front, then a low hip roof behind it.
    balustrade(-w / 2 - 2, w / 2 + 2, -12, h + 4, b.mesh(k.trimMat));
    const roofRise = 90;
    const roofHd = (d - 30) / 2 + 14;
    const roofEave = d / 2 - roofHd;
    hipRoof(b.mesh(k.roofMat.rose), v3(0, d / 2, h + 20), w - 30, d - 30, roofRise, 14);
    for (const dx of [-112, 112])
      windows.push(
        dormer(k, {
          x: dx,
          yFront: 20,
          w: 58,
          wall: 40,
          rise: 20,
          roofZ: (y) => h + 20 + (roofRise * (y - roofEave)) / roofHd,
          slope: roofRise / roofHd,
        }),
      );
    const ridgeHalf = (w - 30 - (d - 30)) / 2;
    box(gold, v3(0, d / 2, h + 20 + roofRise + 1), v3(ridgeHalf * 2 + 10, 7, 5), 0);
    // The central spire rises from behind, tallest of all.
    tower(k, { cx: 0, cy: 130, z0: h + 30, r: 78, h: 150, roofH: 230, roof: 'rose', flag: 1, bands: [0.5], seed: 7 });
    // Small turrets on the front corners.
    for (const s of [-1, 1] as const)
      tower(k, {
        cx: s * (w / 2 - 22),
        cy: 22,
        z0: h - 20,
        r: 30,
        h: 90,
        roofH: 110,
        roof: 'violet',
        flag: s,
        bands: [0.55],
        seed: 9 + s,
      });
  } else if (piece === 'tower-left' || piece === 'tower-right') {
    const m = piece === 'tower-left' ? -1 : 1;
    const t = L.tower;
    tower(k, { cx: 0, cy: 0, r: t.r, h: t.h, roofH: t.roof, roof: 'rose', flag: m, balcony: 0.7 });
    for (const z of [92, 244, 396]) windows.push({ x: 0, z, w: 42, h: 80, round: t.r });
  } else if (piece === 'wing-left' || piece === 'wing-right') {
    const { x0, x1, d, h } = L.wing;
    const w = x1 - x0;
    wallBox(-w / 2, w / 2, 0, d, 0, h);
    wallBox(-w / 2 - 3, w / 2 + 3, -8, d + 6, 0, 24, k.trimMat);
    wallBox(-w / 2 - 3, w / 2 + 3, -14, d + 10, h - 24, h + 4, k.trimMat);
    box(b.mesh(k.goldMat), v3(0, -15, h - 12), v3(w + 6, 3, 5), 0);
    balustrade(-w / 2 - 1, w / 2 + 1, -6, h + 4);
    const zBase = h + 24;
    const rise = 96;
    const hd = (d - 30) / 2 + 12;
    const yEave = d / 2 + 6 - hd;
    gableRoof(b.mesh(k.roofMat.rose), v3(0, d / 2 + 6, zBase), w - 30, d - 30, rise, 'x', 12);
    const gold = b.mesh(k.goldMat);
    box(gold, v3(0, d / 2 + 6, zBase + rise + 1), v3(w - 8, 7, 5), 0);
    for (const s of [-1, 1]) finial(gold, v3(s * (w / 2 - 6), d / 2 + 6, zBase + rise - 2), 34, 5);
    for (const dx of [-58, 58])
      windows.push(
        dormer(k, {
          x: dx,
          yFront: 32,
          w: 54,
          wall: 34,
          rise: 17,
          roofZ: (y) => zBase + (rise * (y - yEave)) / hd,
          slope: rise / hd,
        }),
      );
    for (let i = 0; i < 3; i++) windows.push({ x: -w / 2 + (i + 0.5) * (w / 3), z: 96, w: 50, h: 118 });
  } else {
    const m = piece === 'end-left' ? -1 : 1;
    const t = L.endTower;
    tower(k, { cx: 0, cy: 0, r: t.r, h: t.h, roofH: t.roof, roof: 'violet', flag: m, balcony: 0.66, bands: [0.4] });
    for (const z of [96, 236]) windows.push({ x: 0, z, w: 34, h: 70, round: t.r });
  }
  return { scene: b, windows, door };
}

export function renderPiece(
  piece: PalacePiece,
  canvas: { w: number; h: number; ox: number; oy: number },
  ss = 3,
): { img: Rgba; at: RenderedObject['at'] } {
  const { scene, windows, door } = pieceScene(piece);
  const out = renderScene(scene, {
    width: canvas.w,
    height: canvas.h,
    originX: canvas.ox,
    originY: canvas.oy,
    ss,
    unit: PALACE_SCALE,
    lineDepth: 6,
    aoRadius: 12,
    shadowBias: 3.2,
    shadowFit: true,
  });
  drawDetails(out.rgba, out.at, windows, door);
  return { img: out.rgba, at: out.at };
}

const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

/** Windows and the door, drawn by hand onto the render at the projected wall positions. */
function drawDetails(img: Rgba, at: RenderedObject['at'], windows: readonly WindowSpec[], door: boolean): void {
  const c = new Painter(img);
  for (const w of windows) {
    const wy = w.y ?? (w.round ? -w.round : 0);
    const [bx, by] = at(v3(w.x, wy - 0.5, w.z));
    const [, ty] = at(v3(w.x, wy - 0.5, w.z + w.h));
    const top = Math.round(Math.min(by, ty));
    const bottom = Math.round(Math.max(by, ty));
    const pw = Math.round(w.w * PALACE_SCALE);
    windowArch(c, Math.round(bx - pw / 2), top, pw, bottom - top);
  }
  if (door) drawDoor(c, at);
}

function windowArch(c: Painter, x: number, y: number, w: number, h: number): void {
  const frame = PALACE.wall;
  const glass = PALACE.glass;
  const edge: RGB = [96, 54, 104];
  const r = w / 2;
  const cx = x + r;
  const spring = y + r;
  const inside = (px: number, py: number, inset: number): boolean => {
    const rr = r - inset;
    if (px < x + inset || px >= x + w - inset || py >= y + h - inset) return false;
    if (py >= spring) return true;
    return Math.hypot(px + 0.5 - cx, py + 0.5 - spring) <= rr;
  };
  // Warm light spilling onto the wall around the window, in a few hard steps.
  for (let py = y - 10; py < y + h + 8; py++) {
    for (let px = x - 10; px < x + w + 10; px++) {
      if (c.get(px, py)[3] !== 255) continue;
      let best = 99;
      for (let k = 3; k <= 9 && best === 99; k += 3) if (inside(px, py, -k)) best = k;
      if (best === 99) continue;
      c.over(px, py, rgb(glass[3]!), best === 3 ? 0.34 : best === 6 ? 0.2 : 0.1);
    }
  }
  // Surround: a dark outer edge, a pale frame, then the glass.
  for (let py = y - 3; py <= y + h; py++)
    for (let px = x - 4; px < x + w + 4; px++) if (inside(px, py, -3)) c.px(px, py, rgb(edge));
  for (let py = y - 2; py < y + h; py++)
    for (let px = x - 3; px < x + w + 3; px++) if (inside(px, py, -2)) c.px(px, py, rgb(frame[px < cx ? 4 : 3]!));
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (inside(px, py, 0)) c.px(px, py, rgb(edge));
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (!inside(px, py, 2)) continue;
      const t = (py - y) / h;
      c.px(px, py, rgb(glass[t < 0.22 ? 4 : t < 0.5 ? 3 : t < 0.78 ? 2 : 1]!));
    }
  }
  const mx = Math.round(cx - 0.5);
  for (let py = y + 2; py < y + h - 2; py++) if (inside(mx, py, 2)) c.px(mx, py, rgb(frame[3]!));
  const bar = Math.round(y + h * 0.56);
  for (let px = x + 2; px < x + w - 2; px++) c.px(px, bar, rgb(frame[3]!));
  // Keystone and sill.
  for (let px = Math.round(cx) - 2; px < Math.round(cx) + 2; px++)
    for (let py = y - 6; py < y - 2; py++) c.px(px, py, rgb(frame[4]!));
  for (let px = x - 5; px < x + w + 5; px++) {
    c.px(px, y + h, rgb(frame[4]!));
    c.px(px, y + h + 1, rgb(frame[2]!));
    c.px(px, y + h + 2, rgb(edge));
  }
}

function drawDoor(c: Painter, at: RenderedObject['at']): void {
  const { w: doorW, h } = PALACE_LAYOUT.door;
  const w = Math.round(doorW * PALACE_SCALE);
  const [bx, by] = at(v3(0, -15, 24));
  const [, ty] = at(v3(0, -15, 24 + h));
  const x0 = Math.round(bx - w / 2);
  const top = Math.round(ty);
  const bottom = Math.round(by);
  const r = w / 2;
  const spring = top + r;
  const cx = x0 + r;
  const wood = PALACE.door;
  const gold = GEM.gold;
  const inside = (px: number, py: number): boolean =>
    px >= x0 && px < x0 + w && py < bottom && (py >= spring || Math.hypot(px + 0.5 - cx, py + 0.5 - spring) <= r);
  for (let py = top; py < bottom; py++) {
    for (let px = x0; px < x0 + w; px++) {
      if (!inside(px, py)) continue;
      if (py < spring + 6) {
        const a = Math.atan2(py + 0.5 - (spring + 6), px + 0.5 - cx);
        const ray = Math.floor(((a + Math.PI) / Math.PI) * 9);
        c.px(px, py, rgb(gold[ray % 2 === 0 ? 4 : 2]!));
        continue;
      }
      c.px(px, py, rgb(wood[px < cx ? 4 : 3]!));
    }
  }
  for (let py = spring + 6; py < bottom; py++) {
    c.px(Math.round(cx - 0.5), py, rgb(gold[1]!));
    c.px(Math.round(cx), py, rgb(gold[3]!));
  }
  for (const [px0, px1] of [
    [x0 + 8, cx - 5],
    [cx + 5, x0 + w - 8],
  ] as const) {
    for (const [py0, py1] of [
      [spring + 16, spring + 64],
      [spring + 74, bottom - 10],
    ] as const) {
      for (let px = Math.round(px0); px < Math.round(px1); px++) {
        c.px(px, py0, rgb(gold[3]!));
        c.px(px, py1, rgb(gold[2]!));
      }
      for (let py = py0; py <= py1; py++) {
        c.px(Math.round(px0), py, rgb(gold[3]!));
        c.px(Math.round(px1) - 1, py, rgb(gold[2]!));
      }
      // A rose boss in the middle of each panel.
      const mx = Math.round((px0 + px1) / 2),
        my = Math.round((py0 + py1) / 2);
      c.px(mx, my, rgb(gold[4]!));
      c.px(mx - 1, my, rgb(gold[3]!));
      c.px(mx, my + 1, rgb(gold[2]!));
    }
  }
  for (const hx of [cx - 10, cx + 9]) {
    c.px(Math.round(hx), Math.round((spring + bottom) / 2), rgb(gold[5]!));
    c.px(Math.round(hx), Math.round((spring + bottom) / 2) + 1, rgb(gold[2]!));
  }
}

export { dome };
