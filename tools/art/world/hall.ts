import { hex, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { archShape, column, extrude, FRONT, lathe, type P2, scallopEdge } from './arch';
import type { DoorGeometry, DoorStyle } from './doors';
import { flowerAt } from './manor-flowers';
import { paintTwilight } from './manor-sky';
import { Painter } from './paint';
import { GEM, INTERIOR, PALACE, type Ramp } from './palette';
import { box } from './prims';
import { renderScene, SceneBuilder } from './scene';
import { MAHOGANY } from './treasure';
import { shade } from './walls';

/**
 * The treasure house as architecture: a grand hall seen as a cutaway from the south. The back wall
 * is three sprites that butt together (a niche wall, the doorway wall, another niche wall), cream
 * plaster over rosewood paneling, under a gold cornice. Columns cover the joints. The two side
 * walls are thin strips along the map's edges.
 */
const rgb = (c: RGB): readonly [number, number, number] => [c[0], c[1], c[2]];

export interface Canvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export const HALL = {
  /**
   * One wall sprite. Its anchor is the foot of the wall, a little above the bottom edge so the
   * baseboard fits.
   */
  wall: { w: 512, h: 340, ox: 256, oy: 332 } as Canvas,
  /**
   * Wall height in scene units, and the extra the cornice and ceiling band take on screen above it.
   */
  height: 300,
  column: { w: 104, h: 330, ox: 52, oy: 318 } as Canvas,
  /**
   * Map x of the three wall pieces' centres, the y of the wall's foot, and the columns' y (a little
   * in front of it).
   */
  wallY: 330,
  columnY: 340,
  /** Width of the side wall strips, and of the soft shadow they throw on the floor beside them. */
  side: 52,
  sideShadow: 14,
};

export const HALL_DOOR = { w: 176, h: 206, base: v3(0, -2, 5) };

const NIGHT: Ramp = [
  [44, 30, 74],
  [58, 40, 92],
  [80, 56, 116],
];
const WINE: Ramp = ramp(hex('#5b2849'), {
  steps: 5,
  shadowHue: 320,
  lightHue: 10,
  lean: 1.0,
  lightness: [-0.22, -0.12, -0.04, 0.04, 0.1],
});
const CEILING: RGB = [40, 28, 66];

/**
 * What a hall is made of and tinted with. The treasure house and the throne room share one; the
 * manor has its own.
 */
export interface HallTheme {
  plaster: Ramp;
  cream: Ramp;
  wood: Ramp;
  /** The flat colour of recesses that a painter fills in later (niche backs, window glass). */
  wine: Ramp;
  cloth: Ramp;
  ceiling: RGB;
  /** The wall's outer edge and the soft shadow it throws on the floor. */
  edge: RGB;
  shadow: RGB;
  lineTint: RGB;
  dotTint: RGB;
  /** The picture over the 'right' wall piece. Default is the palace on its hill. */
  painting?: (p: Painter, x0: number, y0: number, w: number, h: number) => void;
}

export const HALL_THEME: HallTheme = {
  plaster: INTERIOR.plaster,
  cream: INTERIOR.cream,
  wood: MAHOGANY,
  wine: WINE,
  cloth: PALACE.banner,
  ceiling: CEILING,
  edge: [74, 48, 92],
  shadow: [44, 22, 56],
  lineTint: [255, 238, 250],
  dotTint: [255, 226, 246],
};

const r6 = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.3, -0.2, -0.1, -0.03, 0.04, 0.1] });
const wineOf = (base: string): Ramp =>
  ramp(hex(base), { steps: 5, shadowHue: 300, lightHue: 20, lean: 1.0, lightness: [-0.22, -0.12, -0.04, 0.04, 0.1] });

/**
 * The rooms of the palace beyond the throne room are the same architecture in other colours: blush
 * for the rooms to rest and have tea in, pale sky for the rooms of books and music, and sage for
 * the rooms of food and flowers.
 */
export const ROSE_THEME: HallTheme = {
  plaster: r6('#f8d7de', 335, 60),
  cream: r6('#fff0ee', 330, 70),
  wood: r6('#b86f88', 330, 40),
  wine: wineOf('#6a2c4a'),
  cloth: r6('#e0608f', 325, 50),
  ceiling: [76, 34, 64],
  edge: [106, 56, 90],
  shadow: [66, 28, 58],
  lineTint: [255, 232, 240],
  dotTint: [255, 214, 232],
};
export const SKY_THEME: HallTheme = {
  plaster: r6('#d7e9f9', 220, 90),
  cream: r6('#f4fbff', 215, 100),
  wood: r6('#5d7ab8', 240, 150),
  wine: wineOf('#2a3a74'),
  cloth: r6('#4aa0d8', 235, 150),
  ceiling: [30, 40, 86],
  edge: [54, 66, 122],
  shadow: [28, 36, 72],
  lineTint: [236, 246, 255],
  dotTint: [220, 238, 255],
};
export const SAGE_THEME: HallTheme = {
  plaster: r6('#e1edd2', 150, 90),
  cream: r6('#f7f9ea', 130, 90),
  wood: r6('#90694a', 320, 70),
  wine: wineOf('#2f5a46'),
  cloth: r6('#d96a86', 325, 50),
  ceiling: [30, 60, 50],
  edge: [58, 94, 72],
  shadow: [28, 52, 42],
  lineTint: [240, 255, 232],
  dotTint: [228, 250, 220],
};

/**
 * The Magic Hall: pearl-lilac walls over violet wood, with indigo glass in the windows and gold
 * trim, glittering like the building outside.
 */
export const MAGIC_THEME: HallTheme = {
  plaster: r6('#e6d8ff', 280, 330),
  cream: r6('#fff2fd', 300, 60),
  wood: r6('#7c5ac0', 275, 320),
  wine: wineOf('#2c2070'),
  cloth: r6('#e45fcf', 310, 340),
  ceiling: [44, 30, 100],
  edge: [86, 62, 150],
  shadow: [40, 26, 90],
  lineTint: [255, 240, 255],
  dotTint: [255, 232, 250],
};

/**
 * The witch's hut inside: honey timber walls over worn boards, bottle-green curtains where the
 * windows are, and a ceiling of smoky rafters. It is bigger on the inside.
 */
export const WITCH_THEME: HallTheme = {
  plaster: r6('#d4aa78', 28, 70),
  cream: r6('#f1dcb0', 35, 80),
  wood: r6('#6e4a2c', 18, 60),
  wine: wineOf('#24523c'),
  cloth: r6('#3fa874', 190, 120),
  ceiling: [52, 36, 30],
  edge: [92, 64, 44],
  shadow: [48, 32, 28],
  lineTint: [255, 244, 214],
  dotTint: [255, 236, 190],
};

/**
 * The door as seen from inside: the same teal leaves and gold work, but the light behind them is
 * the garden's daylight.
 */
export const HALL_DOOR_STYLE: DoorStyle = {
  leaf: PALACE.roofTeal,
  trim: GEM.gold,
  light: [
    [246, 255, 238],
    [204, 238, 196],
    [150, 206, 150],
  ],
  kind: 'treasure',
};

/**
 * A door between two rooms of the palace: rose leaves with the same gold work, and the warm light
 * of the room beyond.
 */
export const HALL_ROOM_DOOR_STYLE: DoorStyle = {
  leaf: PALACE.door,
  trim: GEM.gold,
  light: [
    [255, 246, 218],
    [255, 232, 180],
    [244, 208, 142],
  ],
  kind: 'treasure',
};

/** The Magic Hall's door from inside: violet leaves with gold work, and the river's light beyond. */
export const MAGIC_DOOR_STYLE: DoorStyle = {
  leaf: r6('#8f6ae0', 275, 330),
  trim: GEM.gold,
  light: [
    [232, 250, 255],
    [180, 226, 255],
    [140, 196, 250],
  ],
  kind: 'treasure',
};

/** The hut's door from inside: boards held by black iron, and the green-gold light of the cave beyond. */
export const WITCH_DOOR_STYLE: DoorStyle = {
  leaf: r6('#8a5a38', 20, 60),
  trim: GEM.gold,
  light: [
    [236, 255, 196],
    [196, 255, 106],
    [150, 220, 90],
  ],
  kind: 'treasure',
};

export const HALL_DOOR_GEOMETRY: DoorGeometry = {
  building: HALL.wall,
  base: HALL_DOOR.base,
  w: HALL_DOOR.w,
  h: HALL_DOOR.h,
};

/**
 * Which part of the wall's damask a point falls on: a diamond lattice with a dot in each cell.
 * Periodic in 64 units, so wall pieces tile.
 */
const damask = (s: SampleInfo): 'line' | 'dot' | null => {
  const fx = (((s.rest[0] % 64) + 64) % 64) / 64,
    fz = ((((s.rest[2] - 6) % 64) + 64) % 64) / 64;
  const d = Math.abs(fx - 0.5) + Math.abs(fz - 0.5);
  if (Math.abs(d - 0.5) < 0.012) return 'line';
  if (d < 0.05) return 'dot';
  return null;
};

/**
 * Light surfaces sit high on their ramp: a wall facing the viewer is lit to about 0.48, which
 * should land near the ramp's base color.
 */
export const LIGHT_BANDS = [0.04, 0.16, 0.3, 0.5, 0.86] as const;

const grain = (s: SampleInfo): number => Math.sin(s.rest[0] * 0.5 + Math.floor(s.rest[2] / 9) * 1.7) * 0.025;

interface Mats {
  th: HallTheme;
  plaster: number;
  wood: number;
  gold: number;
  cream: number;
  wine: number;
  night: number;
  cloth: number;
}

function materials(b: SceneBuilder, th: HallTheme = HALL_THEME): Mats {
  const plasterV = b.variant('plaster', th.plaster, { bands: LIGHT_BANDS });
  const lineV = b.variant('plasterLine', shade(th.plaster, 0.9, th.lineTint), {
    bands: LIGHT_BANDS,
    noLines: true,
    protect: true,
  });
  const dotV = b.variant('plasterDot', shade(th.plaster, 0.84, th.dotTint), {
    bands: LIGHT_BANDS,
    noLines: true,
    protect: true,
  });
  return {
    th,
    plaster: b.material({
      name: 'plaster',
      shade: (s) => {
        const k = damask(s);
        return k === 'line' ? lineV : k === 'dot' ? dotV : plasterV;
      },
    }),
    wood: b.solid('wood', b.variant('wood', th.wood, { bands: LIGHT_BANDS }), grain),
    gold: b.solid(
      'gold',
      b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] }),
      (s) => (hash2(s.px, s.py, 11) - 0.5) * 0.04,
    ),
    cream: b.solid('cream', b.variant('cream', th.cream, { bands: LIGHT_BANDS })),
    // Flat colors, so the painter can find these pixels exactly and the shading cannot dim them.
    wine: b.solid('wine', b.variant('wine', th.wine, { flat: 1, noLines: true })),
    night: b.solid('night', b.variant('night', NIGHT, { flat: 0 })),
    cloth: b.solid('cloth', b.variant('cloth', th.cloth), (s) => (hash2(s.px, s.py, 13) - 0.5) * 0.04),
  };
}

/** An open outline of an arch: up one side, over the top, down the other. */
export function archLine(width: number, height: number, n = 16): P2[] {
  const r = width / 2,
    spring = Math.max(0, height - r);
  const pts: P2[] = [
    [-r, 0],
    [-r, spring],
  ];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  pts.push([r, spring], [r, 0]);
  return pts;
}

/** The band between two arches, open at the bottom. */
export const archRing = (wo: number, ho: number, wi: number, hi: number): P2[] => [
  ...archLine(wo, ho),
  ...archLine(wi, hi).reverse(),
];

/**
 * The wall every piece shares: plaster, paneling, rail, baseboard, cornice. It runs past the
 * sprite's edges so the pieces meet cleanly.
 */
function wallBody(b: SceneBuilder, m: Mats): void {
  const H = HALL.height;
  const reach = 384;
  box(b.mesh(m.plaster), v3(0, 17, H / 2), v3(reach * 2, 34, H));
  // Paneling below the rail, with raised panels.
  box(b.mesh(m.wood), v3(0, -3, 57), v3(reach * 2, 6, 84));
  for (let k = -3; k <= 3; k++) {
    box(b.mesh(m.wood), v3(k * 128, -7, 57), v3(104, 4, 62), 0, 1.4);
    box(b.mesh(m.wood), v3(k * 128, -9.5, 57), v3(84, 2, 42), 0, 1);
  }
  const gold = b.mesh(m.gold);
  box(gold, v3(0, -6, 102), v3(reach * 2, 8, 8));
  box(b.mesh(m.wood), v3(0, -5, 8), v3(reach * 2, 10, 16));
  box(b.mesh(m.gold), v3(0, -5.5, 17.5), v3(reach * 2, 11, 3));
  // Cornice: cream cove, gold band, dentils, a cream crown.
  box(b.mesh(m.cream), v3(0, -3, 277), v3(reach * 2, 6, 10));
  for (let x = -reach + 7; x < reach; x += 14) box(b.mesh(m.cream), v3(x, -7, 281), v3(7, 5, 6));
  box(b.mesh(m.gold), v3(0, -6.5, 288), v3(reach * 2, 13, 5));
  box(b.mesh(m.cream), v3(0, -8, 295), v3(reach * 2, 16, 10));
  box(b.mesh(m.gold), v3(0, -8.5, 301), v3(reach * 2, 17, 3));
}

/** An arched niche set into the wall, with a gold frame, a recessed back and a sill. */
function niche(b: SceneBuilder, m: Mats, x: number, g: Recess = { x, w: 108, h: 150, z0: 118 }): void {
  const { w, h, z0 } = g;
  extrude(b.mesh(m.gold), archRing(w + 26, h + 6 + 13, w, h + 6), FRONT(x, 0, z0 - 6), 0, 9, { caps: 'front' });
  extrude(b.mesh(m.cream), archRing(w + 40, h + 6 + 21, w + 26, h + 6 + 13), FRONT(x, 0, z0 - 6), 0, 6, {
    caps: 'front',
  });
  extrude(b.mesh(m.wine), archShape(w, h), FRONT(x, 0, z0), 0, 3, { caps: 'front' });
  box(b.mesh(m.gold), v3(x, -8, z0 - 3), v3(w + 40, 16, 7), 0, 1);
  box(b.mesh(m.cream), v3(x, -6, z0 - 8.5), v3(w + 46, 12, 4));
}

/**
 * A hanging tapestry: a gold rod, a rose cloth with a scalloped hem, a gold border. Returns its
 * centre and size for the emblem.
 */
function tapestry(
  b: SceneBuilder,
  m: Mats,
  x: number,
  zTop: number,
  w: number,
  h: number,
): { x: number; z: number; w: number; h: number } {
  const hem = scallopEdge(w, 7, 4);
  const border = scallopEdge(w + 10, 8, 4);
  const cloth = (ww: number, hh: number, edge: P2[]): P2[] => [
    [-ww / 2, hh],
    [-ww / 2, 0],
    ...edge.slice(1),
    [ww / 2, hh],
  ];
  extrude(b.mesh(m.gold), cloth(w + 10, h + 5, border), FRONT(x, 0, zTop - h - 5), 0, 3.6, { caps: 'front' });
  extrude(b.mesh(m.cloth), cloth(w, h, hem), FRONT(x, 0, zTop - h), 0, 5.2, { caps: 'front' });
  box(b.mesh(m.gold), v3(x, -6, zTop + 3), v3(w + 22, 5, 5), 0, 1);
  for (const sx of [-1, 1]) box(b.mesh(m.gold), v3(x + sx * (w / 2 + 12), -6, zTop + 3), v3(6, 7, 7), 0, 1.5);
  return { x, z: zTop - h / 2, w, h };
}

/**
 * A framed recess in the wall that a painter later fills: x of its centre, its size, and the height
 * of its sill.
 */
export interface Recess {
  x: number;
  w: number;
  h: number;
  z0: number;
}

/**
 * `doorL` and `doorR` are the doorway wall for a room whose door is at its west or east end: the
 * hanging goes on the side that has wall.
 */
export type WallPiece = 'left' | 'door' | 'doorL' | 'doorR' | 'right' | 'throne' | 'flowers' | 'lift' | 'windows';

interface WallPlan {
  b: SceneBuilder;
  tapestries: { x: number; z: number; w: number; h: number }[];
  painting?: { x: number; z: number; w: number; h: number };
  medallion?: { x: number; z: number; r: number };
  niches: number[];
  /** Recesses painted with a wall of flowers, and with the twilight view. */
  flowerPanels: Recess[];
  windows: Recess[];
}

function planWall(piece: WallPiece, th: HallTheme): WallPlan {
  const b = new SceneBuilder();
  const m = materials(b, th);
  wallBody(b, m);
  const plan: WallPlan = { b, tapestries: [], niches: [], flowerPanels: [], windows: [] };
  if (piece === 'throne') {
    // The wall behind the throne: a tall arch framed in cream and gold, hung with wine velvet and
    // drawn back by two curtains.
    const w = 220,
      h = 244,
      z = 8;
    extrude(b.mesh(m.cream), archRing(w + 66, h + 33, w + 22, h + 11), FRONT(0, 0, z), 0, 12, { caps: 'front' });
    extrude(b.mesh(m.gold), archRing(w + 22, h + 11, w, h), FRONT(0, 0, z), 0, 14, { caps: 'front' });
    extrude(b.mesh(m.wine), archShape(w, h), FRONT(0, 0, z), 0, 16, { caps: 'front' });
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 20);
      extrude(
        b.mesh(m.cloth),
        [
          [-24, 0],
          [24, 0],
          [18, 214],
          [-18, 214],
        ],
        FRONT(x, 0, z + 4),
        0,
        24,
        { caps: 'front' },
      );
      for (const dx of [-9, 9]) box(b.mesh(m.gold), v3(x + dx, -24, z + 100), v3(1.4, 1, 190), 0, 0);
      box(b.mesh(m.gold), v3(x, -26, z + 96), v3(30, 3, 5), 0, 1);
    }
    plan.medallion = { x: 0, z: 262, r: 12 };
  } else if (piece === 'door' || piece === 'doorL' || piece === 'doorR') {
    const { w, h } = HALL_DOOR;
    const z = HALL_DOOR.base[2];
    // Cream surround, gold liner, then the dark opening the door sprites cover. Each steps out a
    // little further than the last.
    extrude(b.mesh(m.cream), archRing(w + 66, h + 33, w + 22, h + 11), FRONT(0, 0, z), 0, 12, { caps: 'front' });
    extrude(b.mesh(m.gold), archRing(w + 22, h + 11, w, h), FRONT(0, 0, z), 0, 14, { caps: 'front' });
    extrude(b.mesh(m.night), archShape(w, h), FRONT(0, 0, z), 0, 16, { caps: 'front' });
    box(b.mesh(m.cream), v3(0, -15, 2.5), v3(w + 70, 26, 5), 0, 1);
    box(b.mesh(m.gold), v3(0, -22, 1.5), v3(w + 40, 6, 3), 0, 0.6);
    for (const sx of [-1, 1]) column(b.mesh(m.cream), v3(sx * 136, -14, 0), 272, 10);
    for (const sx of piece === 'doorL' ? [1] : piece === 'doorR' ? [-1] : [-1, 1])
      plan.tapestries.push(tapestry(b, m, sx * 212, 246, 48, 130));
    plan.medallion = { x: 0, z: 262, r: 11 };
  } else if (piece === 'flowers') {
    // Two tall panels of living flowers in gold frames, with a ribbon-hung medallion between them.
    for (const x of [-150, 150]) {
      const g = { x, w: 132, h: 168, z0: 100 };
      niche(b, m, x, g);
      plan.flowerPanels.push(g);
    }
    plan.medallion = { x: 0, z: 190, r: 16 };
  } else if (piece === 'lift') {
    // The doorway of the lift, framed like a door. Narrow flower panels stand either side, so the
    // whole wall is one garden.
    const { w, h } = HALL_DOOR;
    const z = HALL_DOOR.base[2];
    extrude(b.mesh(m.cream), archRing(w + 66, h + 33, w + 22, h + 11), FRONT(0, 0, z), 0, 12, { caps: 'front' });
    extrude(b.mesh(m.gold), archRing(w + 22, h + 11, w, h), FRONT(0, 0, z), 0, 14, { caps: 'front' });
    extrude(b.mesh(m.night), archShape(w, h), FRONT(0, 0, z), 0, 16, { caps: 'front' });
    box(b.mesh(m.cream), v3(0, -15, 2.5), v3(w + 70, 26, 5), 0, 1);
    box(b.mesh(m.gold), v3(0, -22, 1.5), v3(w + 40, 6, 3), 0, 0.6);
    for (const sx of [-1, 1]) {
      const g = { x: sx * 196, w: 72, h: 176, z0: 64 };
      niche(b, m, g.x, g);
      plan.flowerPanels.push(g);
    }
    plan.medallion = { x: 0, z: 262, r: 11 };
  } else if (piece === 'windows') {
    // Three tall windows onto the night.
    for (const x of [-168, 0, 168]) {
      const g = { x, w: 120, h: 158, z0: 78 };
      niche(b, m, x, g);
      plan.windows.push(g);
    }
  } else {
    for (const x of [-132, 132]) {
      niche(b, m, x);
      plan.niches.push(x);
    }
    if (piece === 'left') plan.tapestries.push(tapestry(b, m, 0, 252, 66, 138));
    else {
      const w = 80,
        h = 104;
      box(b.mesh(m.gold), v3(0, -4, 190), v3(w + 16, 8, h + 16), 0, 1.6);
      box(b.mesh(m.cream), v3(0, -3, 190), v3(w + 8, 6.4, h + 8));
      plan.painting = { x: 0, z: 190, w, h };
    }
  }
  return plan;
}

export const polyHas = (poly: readonly P2[], x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const starPoly = (cx: number, cy: number, R: number, r: number): P2[] =>
  Array.from({ length: 10 }, (_, i): P2 => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? R : r;
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
  });

function paintStar(p: Painter, cx: number, cy: number, R: number): void {
  const poly = starPoly(cx, cy, R, R * 0.44);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (!polyHas(poly, x + 0.5, y + 0.5)) continue;
      const k = (x + 0.5 - cx) * 0.7 + (y + 0.5 - cy) * 0.9;
      p.px(x, y, rgb(GEM.gold[k < -R * 0.35 ? 5 : k < R * 0.2 ? 4 : k < R * 0.55 ? 3 : 2]!));
    }
  }
  p.px(Math.round(cx - R * 0.25), Math.round(cy - R * 0.25), [255, 252, 224]);
}

function paintTapestry(
  p: Painter,
  at: (q: V3) => [number, number],
  t: { x: number; z: number; w: number; h: number },
): void {
  const [cx, cy] = at(v3(t.x, -6, t.z + t.h * 0.12));
  paintStar(p, cx, cy, Math.min(18, t.w * 0.34));
  for (const dz of [t.h * 0.33, -t.h * 0.34]) {
    const [sx, sy] = at(v3(t.x, -6, t.z + dz));
    const poly = starPoly(sx, sy, 4.2, 1.9);
    for (let y = Math.floor(sy - 5); y <= Math.ceil(sy + 5); y++)
      for (let x = Math.floor(sx - 5); x <= Math.ceil(sx + 5); x++)
        if (polyHas(poly, x + 0.5, y + 0.5)) p.px(x, y, rgb(GEM.gold[4]!));
  }
}

function paintMedallion(p: Painter, at: (q: V3) => [number, number], mdl: { x: number; z: number; r: number }): void {
  const [mx0, my0] = at(v3(mdl.x, -13, mdl.z));
  const mx = Math.round(mx0),
    my = Math.round(my0);
  const R = mdl.r;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R) continue;
      const spoke =
        d > R * 0.55 && Math.floor(((Math.atan2(y + 0.5, x + 0.5) + Math.PI) / (Math.PI * 2)) * 14) % 2 === 0;
      p.px(
        mx + x,
        my + y,
        rgb(
          d > R - 1.4
            ? [122, 70, 20]
            : d > R * 0.55
              ? GEM.gold[spoke ? 5 : 3]!
              : GEM.gold[x + y < -1 ? 5 : x + y < 3 ? 4 : 3]!,
        ),
      );
    }
}

/**
 * The picture over the right-hand wall: the palace on its hill under a rainbow. Hand-placed pixels,
 * kept small and bright.
 */
function paintLandscape(p: Painter, x0: number, y0: number, w: number, h: number): void {
  const horizon = y0 + Math.round(h * 0.64);
  const sky: RGB[] = [
    [126, 196, 255],
    [162, 210, 255],
    [204, 224, 255],
    [250, 222, 240],
  ];
  for (let y = y0; y < y0 + h; y++) {
    const t = (y - y0) / h;
    const c = sky[t < 0.18 ? 0 : t < 0.38 ? 1 : t < 0.55 ? 2 : 3]!;
    for (let x = x0; x < x0 + w; x++) p.px(x, y, rgb(c));
  }
  // Sun.
  const sx = x0 + w * 0.8,
    sy = y0 + h * 0.2;
  for (let y = -8; y <= 8; y++)
    for (let x = -8; x <= 8; x++) {
      const d = Math.hypot(x, y);
      if (d <= 6) p.px(Math.round(sx + x), Math.round(sy + y), rgb(GEM.gold[d < 3 ? 5 : 4]!));
      else if (d <= 8) p.over(Math.round(sx + x), Math.round(sy + y), [255, 244, 200], 0.4);
    }
  // Rainbow.
  const rb: RGB[] = [
    [240, 84, 108],
    [255, 156, 74],
    [255, 224, 88],
    [112, 208, 122],
    [92, 168, 252],
    [166, 128, 238],
  ];
  const rcx = x0 + w * 0.4,
    rcy = horizon + 8,
    R = w * 0.42;
  for (let y = y0; y < horizon + 6; y++)
    for (let x = x0; x < x0 + w; x++) {
      const d = Math.hypot(x + 0.5 - rcx, y + 0.5 - rcy);
      const band = Math.floor((R - d) / 2);
      if (band >= 0 && band < rb.length) p.px(x, y, rgb(rb[band]!));
    }
  // Clouds.
  for (const [cx, cy, r] of [
    [x0 + w * 0.2, y0 + h * 0.22, 6],
    [x0 + w * 0.62, y0 + h * 0.12, 5],
  ] as const) {
    for (let y = -r; y <= r; y++)
      for (let x = -r * 2; x <= r * 2; x++) {
        const e = (x / (r * 1.7)) ** 2 + (y / (r * 0.8)) ** 2;
        if (e <= 1)
          p.px(
            Math.round(cx + x),
            Math.round(cy + y + (Math.abs(x) < r * 0.6 ? -2 : 0)),
            y > 1 ? [226, 230, 250] : [255, 255, 255],
          );
      }
  }
  // Far hill with the palace, then a nearer green one.
  const far: RGB = [132, 208, 150],
    near: RGB = [82, 176, 104],
    nearDark: RGB = [64, 150, 90];
  for (let y = horizon - 12; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const hill =
        horizon + 4 - Math.max(0, 14 - Math.abs(x - (x0 + w * 0.58)) * 0.28) + Math.sin((x - x0) * 0.4) * 0.8;
      if (y >= hill) p.px(x, y, rgb(far));
    }
  const cx = Math.round(x0 + w * 0.58),
    base = horizon - 9;
  const pinks: RGB[] = [
    [255, 214, 232],
    [244, 170, 206],
    [208, 118, 168],
  ];
  p.rect(cx - 9, base - 9, 18, 10, rgb(pinks[1]!));
  p.rect(cx - 9, base - 9, 9, 10, rgb(pinks[0]!));
  p.rect(cx + 5, base - 9, 4, 10, rgb(pinks[2]!));
  for (const [dx, hgt] of [
    [-9, 16],
    [0, 22],
    [9, 16],
  ] as const) {
    p.rect(cx + dx - 2, base - hgt, 5, hgt - 6, rgb(pinks[dx < 0 ? 0 : dx > 0 ? 1 : 0]!));
    for (let k = 0; k < 6; k++)
      p.rect(
        cx + dx - 3 + Math.floor(k / 2),
        base - hgt - 6 + k,
        7 - Math.floor(k / 2) * 2 + (k % 2 === 0 ? 0 : 0),
        1,
        rgb(k < 3 ? [214, 90, 150] : [188, 70, 136]),
      );
    p.px(cx + dx, base - hgt - 7, rgb(GEM.gold[5]!));
  }
  p.rect(cx - 2, base - 5, 4, 6, rgb(GEM.gold[3]!));
  for (let y = horizon + 6; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const hill = horizon + 8 + Math.abs(x - (x0 + w * 0.15)) * 0.2 - 8;
      if (y >= hill) p.px(x, y, rgb(y > hill + 3 ? near : nearDark));
    }
  for (let i = 0; i < 9; i++)
    p.px(x0 + 4 + ((i * 11) % (w - 8)), y0 + h - 2 - (i % 4), rgb(i % 2 ? [255, 240, 120] : [255, 150, 190]));
  // The frame's inner shade.
  for (let x = x0; x < x0 + w; x++) {
    p.over(x, y0, [40, 20, 50], 0.4);
    p.over(x, y0 + 1, [40, 20, 50], 0.2);
  }
  for (let y = y0; y < y0 + h; y++) {
    p.over(x0, y, [40, 20, 50], 0.4);
    p.over(x0 + 1, y, [40, 20, 50], 0.2);
  }
}

/**
 * Replaces the flat wine pixels of each niche with a lit backdrop: a warm pool of light on a deep
 * ground.
 */
function paintNiches(p: Painter, at: (q: V3) => [number, number], xs: readonly number[], th: HallTheme): void {
  const WINE = th.wine;
  const wine = WINE[1]!.map(Math.round);
  for (const x of xs) {
    const [cx, cy] = at(v3(x, -3, 118 + 70));
    for (let y = Math.round(cy) - 110; y < Math.round(cy) + 90; y++) {
      for (let px = Math.round(cx) - 62; px < Math.round(cx) + 62; px++) {
        const c = p.get(px, y);
        if (c[3] !== 255 || c[0] !== wine[0] || c[1] !== wine[1] || c[2] !== wine[2]) continue;
        const dx = (px + 0.5 - cx) / 56,
          dy = (y + 0.5 - (cy + 30)) / 90;
        // A pool of light, dithered so the steps between its bands do not read as rings.
        const lit = Math.max(0, 1 - Math.hypot(dx, dy) * 1.05);
        const bayer = ((px & 1) + ((y & 1) << 1)) * 0.25 + 0.125 - 0.5;
        const t = Math.max(0, Math.min(3, Math.floor(lit * 3.6 + 0.2 + bayer * 0.9)));
        p.px(px, y, rgb(WINE[t]!));
      }
    }
  }
}

/**
 * Fills everything above the wall's top with the dark of the room's unseen ceiling, brightest where
 * it meets the cornice.
 */
function paintCeiling(p: Painter, CEILING: RGB): void {
  for (let x = 0; x < p.w; x++) {
    let top = 0;
    while (top < p.h && p.get(x, top)[3] === 0) top++;
    if (top >= p.h) continue;
    for (let y = 0; y < top; y++) {
      const t = 1 - y / Math.max(1, top);
      const k = t > 0.88 ? 1.5 : t > 0.5 ? 1.18 : 1;
      p.px(x, y, rgb([Math.min(255, CEILING[0] * k), Math.min(255, CEILING[1] * k), Math.min(255, CEILING[2] * k)]));
    }
  }
}

/** A soft contact shadow on the floor under the baseboard. */
function paintFooting(p: Painter, shadow: RGB): void {
  for (let k = 0; k < 7; k++) {
    for (let x = 0; x < p.w; x++) {
      const y = HALL.wall.oy + 3 + k;
      if (p.get(x, y)[3] === 0) p.over(x, y, shadow, 0.3 * (1 - k / 7));
    }
  }
}

/**
 * Fills the flat recess pixels in a recess's frame: `paint` gets the pixel, and the recess's box so
 * it can place things in it.
 */
function fillRecess(
  p: Painter,
  at: (q: V3) => [number, number],
  th: HallTheme,
  g: Recess,
  paint: (x: number, y: number, box: { x0: number; y0: number; w: number; h: number }) => void,
): void {
  const flat = th.wine[1]!.map(Math.round);
  const [ax, ay] = at(v3(g.x - g.w / 2, -3, g.z0 + g.h));
  const [bx, by] = at(v3(g.x + g.w / 2, -3, g.z0));
  const box = { x0: Math.round(ax), y0: Math.round(ay), w: Math.round(bx - ax), h: Math.round(by - ay) };
  for (let y = box.y0 - 2; y < box.y0 + box.h + 2; y++) {
    for (let x = box.x0 - 2; x < box.x0 + box.w + 2; x++) {
      const c = p.get(x, y);
      if (c[3] === 255 && c[0] === flat[0] && c[1] === flat[1] && c[2] === flat[2]) paint(x, y, box);
    }
  }
}

export function renderHallWall(piece: WallPiece, th: HallTheme = HALL_THEME): Rgba {
  const plan = planWall(piece, th);
  const c = HALL.wall;
  const out = renderScene(plan.b, {
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
  paintNiches(p, out.at, plan.niches, th);
  for (const g of plan.flowerPanels) {
    fillRecess(p, out.at, th, g, (x, y) => p.px(x, y, rgb(flowerAt(x, y, { seed: 5, cell: 14 }))));
    // A dark inner edge, so the flowers sit behind the frame.
    fillRecess(p, out.at, th, g, (x, y, bx) => {
      const e = Math.min(x - bx.x0, bx.x0 + bx.w - x, y - bx.y0);
      if (e < 3) p.over(x, y, [20, 20, 40], 0.5 - e * 0.15);
    });
  }
  for (const g of plan.windows) {
    const boxes: { x0: number; y0: number; w: number; h: number }[] = [];
    fillRecess(p, out.at, th, g, (_x, _y, bx) => {
      if (boxes.length === 0) boxes.push(bx);
    });
    const glass = new Set<number>();
    fillRecess(p, out.at, th, g, (x, y) => glass.add(y * 4096 + x));
    const bx = boxes[0];
    if (bx)
      paintTwilight(
        p,
        {
          x0: bx.x0,
          y0: bx.y0,
          w: bx.w,
          h: bx.h,
          moon: g.x === 0 ? { x: bx.x0 + bx.w * 0.6, y: bx.y0 + bx.h * 0.28, r: 14 } : { x: -999, y: -999, r: 1 },
          seed: 3,
        },
        (x, y) => glass.has(y * 4096 + x),
      );
  }
  for (const t of plan.tapestries) paintTapestry(p, out.at, t);
  if (plan.medallion) paintMedallion(p, out.at, plan.medallion);
  if (plan.painting) {
    const { x, z, w, h } = plan.painting;
    const [x0, y0] = out.at(v3(x - w / 2, -7.5, z + h / 2));
    const [x1, y1] = out.at(v3(x + w / 2, -7.5, z - h / 2));
    (th.painting ?? paintLandscape)(p, Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0));
  }
  paintCeiling(p, th.ceiling);
  paintFooting(p, th.shadow);
  return out.rgba;
}

/**
 * A tall round column in cream with a gold capital and a marble plinth, for the joints between wall
 * pieces.
 */
export function renderHallColumn(th: HallTheme = HALL_THEME): Rgba {
  const b = new SceneBuilder();
  const m = materials(b, th);
  const c = HALL.column;
  box(b.mesh(m.cream), v3(0, 0, 5), v3(44, 44, 10), 0, 1);
  column(b.mesh(m.cream), v3(0, 0, 10), 272, 13);
  lathe(b.mesh(m.gold), {
    c: v3(0, 0, 278),
    segs: 16,
    profile: [
      [19, 0],
      [21, 0],
      [21, 6],
      [19, 6],
      [0, 6],
    ],
  });
  lathe(b.mesh(m.gold), {
    c: v3(0, 0, 14),
    segs: 16,
    profile: [
      [17, 0],
      [19, 0],
      [19, 3],
      [17, 3],
      [0, 3],
    ],
  });
  return renderScene(b, {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    lineDepth: 5,
    aoRadius: 8,
    shadowBias: 3,
    shadowFit: true,
  }).rgba;
}

/**
 * The top of a side wall seen from the front, then its cut end near the viewer, with a soft shadow
 * on the floor beside it. The room is `rows` pixels deep from the back wall's top to the map's
 * bottom edge. Drawn flat: a strip of cream coping over a rosewood and plaster end. `flip` mirrors
 * it for the east side.
 */
export function renderHallSide(rows: number, flip: boolean, th: HallTheme = HALL_THEME): Rgba {
  const wall = HALL.side,
    total = wall + HALL.sideShadow;
  const img = createRgba(total, rows);
  const p = new Painter(img);
  const cream = th.cream,
    wood = th.wood,
    gold = GEM.gold,
    CEILING = th.ceiling;
  const COS = Math.cos((27 * Math.PI) / 180);
  // Where the cut end begins: the wall is 300 units tall, so the end face is 267 px of screen.
  const endTop = rows - Math.round(HALL.height * COS);
  const col = (x: number): number => (flip ? total - 1 - x : x);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < wall; x++) {
      let c: RGB;
      if (y < 52) c = CEILING;
      else if (y < endTop) {
        // Coping: cream on top, gold along the inner edge, and a darker outer face where it meets
        // the map's border.
        if (x >= wall - 3) c = x === wall - 1 ? th.edge : gold[x === wall - 2 ? 4 : 3]!;
        else if (x >= wall - 8) c = cream[2]!;
        else if (y % 32 === 31) c = cream[2]!;
        else c = hash2(x, y >> 3, 3) > 0.93 ? cream[3]! : cream[4]!;
      } else {
        const z = (rows - y) / COS;
        if (x >= wall - 1) c = th.edge;
        else if (z < 16) c = wood[2]!;
        else if (z < 98) c = x >= wall - 4 ? wood[2]! : (x * 3 + 7) % 26 < 2 ? wood[1]! : wood[3]!;
        else if (z < 106) c = gold[x < 6 ? 5 : 4]!;
        else if (z < 270) c = x >= wall - 4 ? cream[2]! : hash2(x, y, 2) > 0.985 ? cream[3]! : cream[4]!;
        else if (z < 278) c = cream[3]!;
        else c = gold[4]!;
      }
      p.px(col(x), y, rgb(c));
    }
    // Shadow on the floor next to the wall, fading out.
    if (y >= 52)
      for (let k = 0; k < HALL.sideShadow; k++)
        p.over(col(wall + k), y, th.shadow, 0.3 * (1 - k / HALL.sideShadow) ** 1.4);
  }
  return img;
}
