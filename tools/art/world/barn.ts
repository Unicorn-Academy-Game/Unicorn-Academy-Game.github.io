import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import type { DoorGeometry, DoorStyle } from './doors';
import { CARROTS, heap, ORCHARD } from './feed';
import { type Canvas, LIGHT_BANDS, polyHas, starPoly } from './hall';
import { Painter } from './paint';
import { GEM, INTERIOR, PAL, type Ramp } from './palette';
import { box } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { shade } from './walls';

/**
 * The stable as architecture, a cutaway seen from the south like the treasure hall. The back wall
 * is whitewashed plaster over plank paneling, framed in dark timber. Six open stalls line it, three
 * each side of a big barn door, each divided from the next by a low partition. A post and a header
 * beam frame the front of every stall.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

export const BARN = {
  /**
   * A wall piece covers two stalls; the door piece covers the doorway; an end piece covers one
   * stall by the side wall.
   */
  wall: { w: 512, h: 400, ox: 256, oy: 392 } as Canvas,
  end: { w: 256, h: 400, ox: 128, oy: 392 } as Canvas,
  height: 340,
  /** Map y of the back wall's foot. */
  wallY: 420,
  /** How far a stall reaches into the room, in map units, and how wide it is. */
  stallDepth: 170,
  stallWidth: 256,
  frame: { w: 296, h: 340, ox: 20, oy: 326 } as Canvas,
  post: { w: 40, h: 340, ox: 20, oy: 326 } as Canvas,
  side: 52,
  sideShadow: 14,
};

export const BARN_DOOR = { w: 208, h: 232, base: v3(0, -2, 6) };

const NIGHT: Ramp = [
  [44, 30, 74],
  [58, 40, 92],
  [80, 56, 116],
];
const CEILING = hex('#3a2a28');
const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.95, lightness: [-0.32, -0.21, -0.1, 0, 0.09, 0.17] });
const BEAM = r6('#6e4630', 320, 60);
const PLANK = INTERIOR.plank;
const IRON: Ramp = [
  [34, 32, 48],
  [52, 50, 68],
  [74, 72, 92],
  [104, 102, 124],
  [150, 148, 172],
];
/** Hay: golden, not pale. Its top surfaces stay a warm yellow instead of washing out to cream. */
export const HAY: Ramp = ramp(hex('#d6a640'), {
  steps: 6,
  shadowHue: 28,
  lightHue: 78,
  lean: 1.0,
  lightness: [-0.36, -0.24, -0.12, -0.02, 0.06, 0.12],
});

/** The interior door: the stable's plank leaves, with the garden's daylight behind them. */
export const BARN_DOOR_STYLE: DoorStyle = {
  leaf: PAL.wood,
  trim: IRON,
  light: [
    [246, 255, 238],
    [204, 238, 196],
    [150, 206, 150],
  ],
  kind: 'stable',
  straw: false,
};
export const BARN_DOOR_GEOMETRY: DoorGeometry = {
  building: BARN.wall,
  base: BARN_DOOR.base,
  w: BARN_DOOR.w,
  h: BARN_DOOR.h,
};

/** Smooth value noise, so plaster shows soft trowel marks and not blocks. */
const vnoise = (x: number, y: number, seed: number): number => {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const fx = x - x0,
    fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed),
    b = hash2(x0 + 1, y0, seed),
    c = hash2(x0, y0 + 1, seed),
    d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const mottle = (s: SampleInfo): number => (vnoise(s.rest[0] / 70, s.rest[2] / 56, 17) - 0.5) * 0.09;

/**
 * Straw is drawn as short strands lying along a diagonal, each a few units wide and of its own
 * length, which reads as hay where random speckle reads as cotton.
 */
const strandAt = (s: SampleInfo): boolean => {
  const [x, y, z] = s.rest;
  const u = x + 0.55 * z + 0.3 * y,
    w = z - 0.55 * x;
  const id = Math.floor(u / 4.2);
  const seg = Math.floor(w / 15 + hash2(id, 1, 3) * 3);
  return hash2(id, seg, 9) > 0.5 && ((u % 4.2) + 4.2) % 4.2 < 1.5;
};

export interface BarnMats {
  plaster: number;
  plank: number;
  beam: number;
  iron: number;
  straw: number;
  gold: number;
  glass: number;
  night: number;
  rope: number;
}

export function barnMaterials(b: SceneBuilder): BarnMats {
  const plasterV = b.variant('plaster', INTERIOR.plaster, { bands: LIGHT_BANDS });
  const plankV = b.variant('plank', PLANK, { bands: LIGHT_BANDS });
  const seamV = b.variant('plankSeam', shade(PLANK, 0.62, [255, 232, 240]), {
    bands: LIGHT_BANDS,
    noLines: true,
    protect: true,
  });
  const strawV = b.variant('straw', HAY);
  const strandV = b.variant('strand', shade(HAY, 0.8, [255, 236, 226]), { noLines: true });
  return {
    plaster: b.solid('plaster', plasterV, mottle),
    // Boards run up and down, with a dark seam every 18 units.
    plank: b.material({
      name: 'plank',
      shade: (s) => (((s.rest[0] % 18) + 18) % 18 < 1.3 && Math.abs(s.n[1]) > 0.5 ? seamV : plankV),
      bias: (s) => (hash2(Math.floor(s.rest[0] / 18), 3, 5) - 0.5) * 0.07,
    }),
    beam: b.solid(
      'beam',
      b.variant('beam', BEAM, { bands: LIGHT_BANDS }),
      (s) => Math.sin(s.rest[2] * 0.22 + s.rest[0] * 0.05) * 0.02,
    ),
    iron: b.solid('iron', b.variant('iron', IRON)),
    straw: b.material({
      name: 'straw',
      shade: (s) => (strandAt(s) ? strandV : strawV),
      bias: (s) => (hash2(s.px >> 1, s.py >> 1, 22) - 0.5) * 0.08,
    }),
    gold: b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })),
    glass: b.solid(
      'glass',
      b.variant(
        'glass',
        [
          [255, 196, 96],
          [255, 222, 128],
          [255, 240, 170],
          [255, 250, 210],
        ],
        { emissive: 2, noLines: true },
      ),
    ),
    night: b.solid('night', b.variant('night', NIGHT, { flat: 0 })),
    rope: b.solid('rope', b.variant('rope', r6('#c9a470', 330, 85))),
  };
}

export type BarnPiece = 'end-west' | 'bay-west' | 'door' | 'bay-east' | 'end-east';

/**
 * Each stall wears a plaque in the colour of the friend it is for, west to east: Wildstar, Leaf,
 * Glacier, then River, Cinder, Storm.
 */
const PLAQUES: Record<Exclude<BarnPiece, 'door'>, RGB[]> = {
  'end-west': [[255, 226, 140]],
  'bay-west': [
    [84, 190, 104],
    [150, 208, 255],
  ],
  'bay-east': [
    [56, 168, 204],
    [242, 112, 62],
  ],
  'end-east': [[150, 118, 226]],
};

/**
 * Everything the wall pieces share: plaster, paneling, rail, tie beam, top plate. It runs past the
 * sprite's edges so the pieces meet cleanly.
 */
function body(b: SceneBuilder, m: BarnMats): void {
  const H = BARN.height;
  const reach = 384;
  box(b.mesh(m.plaster), v3(0, 17, H / 2), v3(reach * 2, 34, H));
  box(b.mesh(m.plank), v3(0, -3, 53), v3(reach * 2, 6, 106));
  box(b.mesh(m.beam), v3(0, -6, 110), v3(reach * 2, 11, 9));
  box(b.mesh(m.beam), v3(0, -5, 10), v3(reach * 2, 9, 20));
  box(b.mesh(m.beam), v3(0, -7, H - 44), v3(reach * 2, 14, 16));
  box(b.mesh(m.beam), v3(0, -8, H - 8), v3(reach * 2, 16, 16));
  box(b.mesh(m.iron), v3(0, -9, H + 1), v3(reach * 2, 4, 3));
}

/**
 * A low wooden partition between stalls: seen end-on it is a thin band running forward from the
 * wall.
 */
function partition(b: SceneBuilder, m: BarnMats, x: number): void {
  const reach = BARN.stallDepth / Math.sin((27 * Math.PI) / 180);
  box(b.mesh(m.plank), v3(x, -reach / 2, 55), v3(8, reach, 110));
  box(b.mesh(m.beam), v3(x, -reach / 2, 113), v3(12, reach, 6));
}

/** A heavy post up the wall at a stall boundary, with the braces that tie it to the beam. */
function wallPost(b: SceneBuilder, m: BarnMats, x: number): void {
  const H = BARN.height;
  box(b.mesh(m.beam), v3(x, -7, H / 2), v3(20, 14, H), 0, 1);
}

/**
 * A stall's own furnishings against the back wall: a manger with fruit heaped in it, a rack of
 * carrots above, a hanging lantern.
 */
function stallFittings(b: SceneBuilder, m: BarnMats, x: number): { lantern: V3; plaque: V3 } {
  const lx = x - 42;
  const H = BARN.height;
  // The manger: a plank trough on the wall, a deep front, fruit mounded in it.
  box(b.mesh(m.plank), v3(x, -34, 38), v3(150, 6, 40));
  box(b.mesh(m.beam), v3(x, -34, 60), v3(156, 9, 6), 0, 1);
  for (const sx of [-1, 1]) box(b.mesh(m.beam), v3(x + sx * 72, -17, 40), v3(7, 34, 44));
  box(b.mesh(m.plank), v3(x, -17, 22), v3(150, 34, 6));
  heap(b, { at: v3(x, -17, 56), rx: 62, ry: 8, h: 14, count: 20, mix: ORCHARD, seed: 40 + Math.round(x) });
  // The fruit rack: slats between two rails, carrots pushed through.
  box(b.mesh(m.beam), v3(x, -10, 168), v3(150, 8, 6));
  box(b.mesh(m.beam), v3(x, -10, 98), v3(150, 8, 6));
  for (let i = -5; i <= 5; i++) box(b.mesh(m.beam), v3(x + i * 14, -10, 133), v3(5, 7, 72));
  heap(b, { at: v3(x, -2, 112), rx: 60, ry: 2, h: 30, count: 14, mix: CARROTS, seed: 80 + Math.round(x) });
  // A lantern hanging from the tie beam.
  const lz = H - 120;
  box(b.mesh(m.iron), v3(lx, -8, H - 52), v3(2.4, 3, 28));
  box(b.mesh(m.iron), v3(lx, -8, lz + 24), v3(16, 12, 4));
  box(b.mesh(m.glass), v3(lx, -8, lz + 11), v3(11, 8, 20));
  box(b.mesh(m.iron), v3(lx, -8, lz - 1), v3(15, 11, 4));
  lathe(b.mesh(m.iron), {
    c: v3(lx, -8, lz + 26),
    segs: 10,
    profile: [
      [8, 0],
      [3, 7],
      [0, 9],
    ],
  });
  return { lantern: v3(lx, -12, lz + 11), plaque: v3(x + 42, -3, 236) };
}

interface Plan {
  b: SceneBuilder;
  stalls: number[];
  lanterns: V3[];
  plaques: { at: V3; color: RGB }[];
  charm?: V3;
  door: boolean;
  posts: number[];
}

function plan(piece: BarnPiece): Plan {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  body(b, m);
  const out: Plan = { b, stalls: [], lanterns: [], plaques: [], door: piece === 'door', posts: [] };
  const colors = piece === 'door' ? [] : PLAQUES[piece];
  const stall = (x: number): void => {
    const f = stallFittings(b, m, x);
    out.lanterns.push(f.lantern);
    out.plaques.push({ at: f.plaque, color: colors[out.stalls.length]! });
    out.stalls.push(x);
  };
  const H = BARN.height;
  if (piece === 'bay-west' || piece === 'bay-east') {
    for (const x of [-128, 128]) stall(x);
    for (const x of [-256, 0, 256]) {
      wallPost(b, m, x);
      out.posts.push(x);
    }
    for (const x of [-256, 0, 256]) partition(b, m, x);
  } else if (piece === 'end-west') {
    stall(0);
    wallPost(b, m, 128);
    partition(b, m, 128);
  } else if (piece === 'end-east') {
    stall(0);
    wallPost(b, m, -128);
    partition(b, m, -128);
  } else {
    // The barn door: a heavy timber surround, a lintel, and a dark opening the door sprites cover.
    const { w, h } = BARN_DOOR;
    const z = BARN_DOOR.base[2];
    for (const sx of [-1, 1]) {
      wallPost(b, m, sx * 256);
      partition(b, m, sx * 256);
      box(b.mesh(m.beam), v3(sx * (w / 2 + 14), -12, (z + h) / 2 + 12), v3(26, 18, h + 24), 0, 1.2);
      box(b.mesh(m.iron), v3(sx * (w / 2 + 4), -22, z + h * 0.28), v3(6, 3, 10));
      box(b.mesh(m.iron), v3(sx * (w / 2 + 4), -22, z + h * 0.72), v3(6, 3, 10));
    }
    box(b.mesh(m.beam), v3(0, -13, z + h + 12), v3(w + 80, 20, 26), 0, 1.4);
    box(b.mesh(m.plank), v3(0, -9, z + h + 36), v3(w + 40, 8, 26));
    out.charm = v3(0, -14, z + h + 36);
    box(b.mesh(m.night), v3(0, -1, z + h / 2), v3(w, 3, h));
    // The doorway's plug sits in front of the plaster, so the overlay finds it in the building's
    // own pixels.
    box(b.mesh(m.night), v3(0, -16, z + h / 2), v3(w, 4, h));
    box(b.mesh(m.beam), v3(0, -16, 2), v3(w + 56, 24, 6), 0, 1);
    for (const sx of [-1, 1]) {
      const lz = H - 120;
      const x = sx * 176;
      box(b.mesh(m.iron), v3(x, -8, H - 52), v3(2.4, 3, 28));
      box(b.mesh(m.iron), v3(x, -8, lz + 24), v3(16, 12, 4));
      box(b.mesh(m.glass), v3(x, -8, lz + 11), v3(11, 8, 20));
      box(b.mesh(m.iron), v3(x, -8, lz - 1), v3(15, 11, 4));
      out.lanterns.push(v3(x, -12, lz + 11));
    }
  }
  return out;
}

/** A warm pool of light around a lantern on the wall. */
function glow(p: Painter, x: number, y: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const px = Math.round(x) + dx,
        py = Math.round(y) + dy;
      if (p.get(px, py)[3] !== 255) continue;
      p.over(px, py, [255, 214, 120], 0.34 * (1 - d) ** 1.6);
    }
  }
}

/** A gold horseshoe, hung points up for luck. */
function horseshoe(p: Painter, cx: number, cy: number): void {
  for (let y = -9; y <= 9; y++) {
    for (let x = -8; x <= 8; x++) {
      const d = Math.hypot(x, y - 1);
      if (d > 8.2 || d < 4.6 || (y > 3 && Math.abs(x) < 4)) continue;
      if (y > 5 && Math.abs(x) < 6 && Math.abs(x) > 3) continue;
      const lit = x + y < -2;
      p.px(Math.round(cx) + x, Math.round(cy) + y, rgb(GEM.gold[lit ? 5 : d > 6.8 ? 3 : 4]!));
    }
  }
  for (const [dx, dy] of [
    [-6, 3],
    [6, 3],
    [-7, -1],
    [7, -1],
    [-5, -5],
    [5, -5],
  ] as const)
    p.px(Math.round(cx) + dx, Math.round(cy) + dy, [90, 52, 20]);
}

/** A round plaque in a friend's colour, with a gold rim and a small white star. */
function plaque(p: Painter, cx: number, cy: number, color: RGB): void {
  const x0 = Math.round(cx),
    y0 = Math.round(cy);
  const R = 12;
  const star = starPoly(0, 0, 6, 2.7);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R) continue;
      let c: RGB;
      if (d > R - 1.4) c = [96, 56, 24];
      else if (d > R - 3.6) c = GEM.gold[x + y < -3 ? 5 : x + y < 4 ? 4 : 2]!;
      else {
        const k = x + y < -4 ? 1.18 : x + y > 5 ? 0.78 : 1;
        c = [Math.min(255, color[0] * k), Math.min(255, color[1] * k), Math.min(255, color[2] * k)];
        if (polyHas(star, x + 0.5, y + 0.5)) c = [255, 252, 238];
      }
      p.px(x0 + x, y0 + y, rgb(c));
    }
  }
}

/**
 * Rafters and a plank roof, seen from beneath through the open cutaway, above the wall's top plate.
 */
function paintRoof(p: Painter): void {
  for (let x = 0; x < p.w; x++) {
    let top = 0;
    while (top < p.h && p.get(x, top)[3] === 0) top++;
    if (top >= p.h) continue;
    for (let y = 0; y < top; y++) {
      const fromWall = top - y;
      const plank = Math.floor(x / 15) % 2 === 0;
      const rafter = ((x % 128) + 128) % 128 < 11;
      const k = fromWall < 4 ? 1.55 : fromWall < 22 ? 1.2 : 1;
      let c: RGB = rafter
        ? BEAM[2]!
        : plank
          ? [CEILING[0] * 1, CEILING[1], CEILING[2]]
          : [CEILING[0] * 0.86, CEILING[1] * 0.86, CEILING[2] * 0.86];
      c = [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
      p.px(x, y, rgb(c));
    }
  }
}

function paintFooting(p: Painter, oy: number): void {
  for (let k = 0; k < 7; k++)
    for (let x = 0; x < p.w; x++)
      if (p.get(x, oy + 3 + k)[3] === 0) p.over(x, oy + 3 + k, [50, 30, 30], 0.3 * (1 - k / 7));
}

export function renderBarnWall(piece: BarnPiece): Rgba {
  const pl = plan(piece);
  const c = piece === 'bay-west' || piece === 'bay-east' || piece === 'door' ? BARN.wall : BARN.end;
  const out = renderScene(pl.b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 3,
    lineDepth: 6,
    aoRadius: 8,
    aoStrength: 0.32,
    shadowStrength: 0.34,
    shadowBias: 3,
    shadowFit: true,
  });
  const p = new Painter(out.rgba);
  for (const q of pl.plaques) {
    const [x, y] = out.at(q.at);
    plaque(p, x, y, q.color);
  }
  if (pl.charm) {
    const [x, y] = out.at(pl.charm);
    horseshoe(p, x, y);
  }
  for (const l of pl.lanterns) {
    const [x, y] = out.at(l);
    glow(p, x, y, 44);
  }
  paintRoof(p);
  paintFooting(p, c.oy);
  return out.rgba;
}

/**
 * One stall's front: a post at its left edge and a header beam over its opening. Anchored at the
 * post's foot.
 */
export function renderBarnFrame(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const c = BARN.frame;
  postGeometry(b, m, 0);
  box(b.mesh(m.beam), v3(BARN.stallWidth / 2, 0, 244), v3(BARN.stallWidth, 14, 16), 0, 1.2);
  box(b.mesh(m.beam), v3(BARN.stallWidth / 2, 0, 228), v3(BARN.stallWidth, 8, 6), 0, 0.8);
  // Knee braces under the header.
  for (const [x, dir] of [
    [0, 1],
    [BARN.stallWidth, -1],
  ] as const) {
    for (let i = 0; i < 6; i++) box(b.mesh(m.beam), v3(x + dir * (10 + i * 6), 0, 224 - i * 6.2), v3(8, 7, 7));
  }
  return renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 3,
    lineDepth: 5,
    aoRadius: 8,
    shadowBias: 3,
    shadowFit: true,
  }).rgba;
}

function postGeometry(b: SceneBuilder, m: BarnMats, x: number): void {
  box(b.mesh(m.beam), v3(x, 0, 126), v3(18, 18, 252), 0, 1.4);
  box(b.mesh(m.beam), v3(x, 0, 6), v3(26, 26, 12), 0, 1.2);
  box(b.mesh(m.iron), v3(x, -9.6, 90), v3(20, 2.6, 5));
  box(b.mesh(m.iron), v3(x, -9.6, 190), v3(20, 2.6, 5));
  box(b.mesh(m.beam), v3(x, 0, 252), v3(24, 22, 8), 0, 1.2);
}

/** A lone post, to close the row at the end of a run of stalls. */
export function renderBarnPost(): Rgba {
  const b = new SceneBuilder();
  const m = barnMaterials(b);
  const c = BARN.post;
  postGeometry(b, m, 0);
  return renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 3,
    lineDepth: 5,
    aoRadius: 8,
    shadowBias: 3,
    shadowFit: true,
  }).rgba;
}

/**
 * Like the hall's: the coping of the side wall, the cut end near the viewer, and a soft shadow on
 * the floor.
 */
export function renderBarnSide(rows: number, flip: boolean): Rgba {
  const wall = BARN.side,
    total = wall + BARN.sideShadow;
  const img = createRgba(total, rows);
  const p = new Painter(img);
  const cream = INTERIOR.plaster;
  const COS = Math.cos((27 * Math.PI) / 180);
  const endTop = rows - Math.round(BARN.height * COS);
  const col = (x: number): number => (flip ? total - 1 - x : x);
  const ceilTop = BARN.wallY - Math.round(BARN.height * COS) - 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < wall; x++) {
      let c: RGB;
      if (y < ceilTop) c = [CEILING[0], CEILING[1], CEILING[2]];
      else if (y < endTop) {
        if (x >= wall - 3) c = x === wall - 1 ? [58, 36, 34] : BEAM[x === wall - 2 ? 4 : 3]!;
        else if (x >= wall - 9) c = BEAM[2]!;
        else if (y % 36 === 35) c = cream[2]!;
        else c = hash2(x, y >> 3, 3) > 0.94 ? cream[3]! : cream[4]!;
      } else {
        const z = (rows - y) / COS;
        if (x >= wall - 1) c = [58, 36, 34];
        else if (z < 106) c = x >= wall - 4 ? PLANK[2]! : (x * 3 + 5) % 18 < 1.3 ? PLANK[1]! : PLANK[3]!;
        else if (z < 115) c = BEAM[4]!;
        else if (z < BARN.height - 18) c = x >= wall - 4 ? cream[2]! : hash2(x, y, 2) > 0.985 ? cream[3]! : cream[4]!;
        else c = BEAM[3]!;
      }
      p.px(col(x), y, rgb(c));
    }
    if (y >= ceilTop)
      for (let k = 0; k < BARN.sideShadow; k++)
        p.over(col(wall + k), y, [50, 30, 30], 0.3 * (1 - k / BARN.sideShadow) ** 1.4);
  }
  return img;
}
