import { hex, mix, type RGB, ramp } from '../core/color';
import { createRgba, type Rgba } from '../core/image';
import { hash2 } from '../core/rng';
import { bayer, tileMix, tileNoise, wrapTo } from './noise';
import { GEM, INTERIOR, PAL, type Ramp } from './palette';

/**
 * Procedural terrain tiles.
 *
 * Every texture is a function of position inside a 128 px repeating field, and a tile samples the
 * field at its place in that 2 x 2 repeat. Neighboring tiles therefore agree along every shared
 * edge, whichever variants are placed, and the ground only repeats every 128 px instead of every
 * 64.
 *
 * Transitions follow corner-based Wang rules. Each tile carries four corner classes, the class
 * changes across the tile along a wobbly contour, and a tile edge only depends on the two corners
 * it joins, so any two tiles with matching corners fit.
 */
export const TILE_PX = 64;
export const FIELD = 128;
/** Position variants per axis. The field is 2 tiles wide. */
export const POS = 2;
export const WATER_FRAMES = 4;

export type EdgeKind = 'path' | 'water';

export const isBiomeId = (s: string): s is BiomeId => s in BIOMES;

/**
 * Corner bits of a tile: top-left 1, top-right 2, bottom-left 4, bottom-right 8. A set bit means
 * the corner is not grass.
 */
export const CORNER = { tl: 1, tr: 2, bl: 4, br: 8 } as const;

export type BiomeId =
  | 'forest'
  | 'garden'
  | 'treasure-house'
  | 'palace-hall'
  | 'palace-rose'
  | 'palace-sky'
  | 'palace-sage'
  | 'stable'
  | 'manor-hall'
  | 'manor-upper'
  | 'crystal-cave'
  | 'dance-floor';

export interface Biome {
  id: BiomeId;
  /** The ordinary ground and its ramp, which also colours the soft rim where a path meets it. */
  grass: Ramp;
  /** What the ordinary ground is made of. Default is grass. */
  ground?: 'marble' | 'straw' | 'rock';
  path: 'dirt' | 'cobble' | 'carpet' | 'brick' | 'rock' | 'disco';
  /** The path's own ramp, when it is not the default for its kind. */
  pathRamp?: Ramp;
  /** Straight, trimmed edges (a laid carpet) instead of the wandering rim of a worn path. */
  crisp?: boolean;
  /**
   * The path is not a way laid in the ground but rock that stands up from it, a wall: its edge
   * shows a face or a lit top, and the floor is shaded at its foot.
   */
  raised?: boolean;
  /** Draw tiles for ponds. The garden has none. */
  water: boolean;
  /**
   * What a pond is made of, when it is not clear water with a sandy bank: the water, the bank, and
   * the colours that glint on it.
   */
  pool?: { water: Ramp; bank: Ramp; glints: readonly RGB[] };
  /** Blade clusters per axis on the repeating field. Fewer is a tidier lawn. */
  blades: number;
}

const floorRamp = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 0.9, lightness: [-0.3, -0.2, -0.1, -0.04, 0, 0.045] });
const carpetRamp = (base: string, shadowHue: number, lightHue: number): Ramp =>
  ramp(hex(base), { steps: 6, shadowHue, lightHue, lean: 1.0, lightness: [-0.3, -0.2, -0.1, 0, 0.07, 0.14] });
/**
 * The manor's ground floor is lilac marble with a pumpkin carpet. The Sky Garden above is pearl
 * marble with a jade carpet.
 */
const MANOR_FLOOR = floorRamp('#a590cc', 275, 320);
const MANOR_CARPET = carpetRamp('#d2641f', 350, 60);
const SKY_FLOOR = floorRamp('#e4eee6', 220, 90);
const SKY_CARPET = carpetRamp('#2c9a74', 190, 120);
/**
 * The rooms of the palace beyond the throne room keep its cream marble and tint it: rose for the
 * rooms to rest in, pale sky for the rooms of books and music, and sage for the rooms of food and
 * flowers.
 */
const ROSE_FLOOR = floorRamp('#f4dde0', 335, 80);
const ROSE_CARPET = carpetRamp('#c8456f', 330, 40);
const SKYROOM_FLOOR = floorRamp('#dcebf7', 220, 95);
const SKYROOM_CARPET = carpetRamp('#d9a93a', 25, 95);
const SAGE_FLOOR = floorRamp('#e6eed8', 165, 90);
const SAGE_CARPET = carpetRamp('#4a9a6a', 185, 110);
/**
 * The crystal cave: a floor of worn lilac stone, walls of deep indigo rock, and a pool that glows
 * turquoise.
 */
const CAVE_FLOOR = ramp(hex('#7f72ab'), {
  steps: 6,
  shadowHue: 270,
  lightHue: 330,
  lean: 1.0,
  lightness: [-0.3, -0.2, -0.11, -0.04, 0.02, 0.09],
});
const CAVE_ROCK = ramp(hex('#3a2f63'), {
  steps: 6,
  shadowHue: 265,
  lightHue: 300,
  lean: 0.9,
  lightness: [-0.2, -0.12, -0.05, 0, 0.07, 0.15],
});
const CAVE_WATER = ramp(hex('#2fcfc2'), {
  steps: 6,
  shadowHue: 250,
  lightHue: 170,
  lean: 1.0,
  lightness: [-0.3, -0.2, -0.1, 0, 0.1, 0.22],
});
const CAVE_BANK = ramp(hex('#c9b8ee'), {
  steps: 6,
  shadowHue: 290,
  lightHue: 340,
  lean: 0.8,
  lightness: [-0.3, -0.2, -0.1, -0.03, 0.04, 0.1],
});
/** The little glints a crystal throws on stone and water: ice blue, pink, mint and gold. */
const GLINTS: readonly RGB[] = [
  [190, 240, 255],
  [255, 200, 240],
  [214, 255, 214],
  [255, 238, 170],
];

/** The dance floor's lawn has gone violet, and the floor is edged with a pale lilac curb. */
const DANCE_LAWN = ramp(hex('#ab78e8'), {
  steps: 6,
  shadowHue: 275,
  lightHue: 330,
  lean: 1.0,
  lightness: [-0.3, -0.2, -0.1, 0, 0.09, 0.18],
});
const DANCE_CURB = ramp(hex('#d2bdff'), {
  steps: 6,
  shadowHue: 280,
  lightHue: 330,
  lean: 0.9,
  lightness: [-0.42, -0.3, -0.18, -0.06, 0.04, 0.12],
});

export const BIOMES: Record<Biome['id'], Biome> = {
  forest: { id: 'forest', grass: PAL.grass, path: 'dirt', water: true, blades: 13 },
  garden: { id: 'garden', grass: PAL.lawn, path: 'cobble', water: true, blades: 9 },
  'treasure-house': {
    id: 'treasure-house',
    grass: INTERIOR.cream,
    ground: 'marble',
    path: 'carpet',
    pathRamp: INTERIOR.carpet,
    crisp: true,
    water: false,
    blades: 0,
  },
  'palace-hall': {
    id: 'palace-hall',
    grass: INTERIOR.cream,
    ground: 'marble',
    path: 'carpet',
    pathRamp: INTERIOR.royal,
    crisp: true,
    water: false,
    blades: 0,
  },
  'palace-rose': {
    id: 'palace-rose',
    grass: ROSE_FLOOR,
    ground: 'marble',
    path: 'carpet',
    pathRamp: ROSE_CARPET,
    crisp: true,
    water: false,
    blades: 0,
  },
  'palace-sky': {
    id: 'palace-sky',
    grass: SKYROOM_FLOOR,
    ground: 'marble',
    path: 'carpet',
    pathRamp: SKYROOM_CARPET,
    crisp: true,
    water: false,
    blades: 0,
  },
  'palace-sage': {
    id: 'palace-sage',
    grass: SAGE_FLOOR,
    ground: 'marble',
    path: 'carpet',
    pathRamp: SAGE_CARPET,
    crisp: true,
    water: false,
    blades: 0,
  },
  stable: {
    id: 'stable',
    grass: INTERIOR.earth,
    ground: 'straw',
    path: 'brick',
    pathRamp: INTERIOR.brick,
    crisp: true,
    water: false,
    blades: 0,
  },
  'manor-hall': {
    id: 'manor-hall',
    grass: MANOR_FLOOR,
    ground: 'marble',
    path: 'carpet',
    pathRamp: MANOR_CARPET,
    crisp: true,
    water: false,
    blades: 0,
  },
  'manor-upper': {
    id: 'manor-upper',
    grass: SKY_FLOOR,
    ground: 'marble',
    path: 'carpet',
    pathRamp: SKY_CARPET,
    crisp: true,
    water: false,
    blades: 0,
  },
  // The path is the rock that stands round the cave, and the ground is the floor. The map paints
  // rock wherever the herd cannot go.
  'crystal-cave': {
    id: 'crystal-cave',
    grass: CAVE_FLOOR,
    ground: 'rock',
    path: 'rock',
    pathRamp: CAVE_ROCK,
    raised: true,
    water: true,
    pool: { water: CAVE_WATER, bank: CAVE_BANK, glints: GLINTS },
    blades: 0,
  },
  'dance-floor': {
    id: 'dance-floor',
    grass: DANCE_LAWN,
    path: 'disco',
    pathRamp: DANCE_CURB,
    crisp: true,
    water: false,
    blades: 9,
  },
};

type Tex = (X: number, Y: number, frame: number) => RGB;

const band = (v: number, thresholds: readonly number[]): number => {
  let b = 0;
  while (b < thresholds.length && v >= thresholds[b]!) b++;
  return b;
};

/** A feature point list for a jittered grid on the repeating field. Positions wrap. */
function scatter(cells: number, jitter: number, seed: number): { x: number; y: number; id: number }[] {
  const size = FIELD / cells;
  const out: { x: number; y: number; id: number }[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      out.push({
        x: (i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter) * size,
        y: (j + 0.5 + (hash2(i, j, seed + 7) - 0.5) * jitter) * size,
        id: j * cells + i,
      });
    }
  }
  return out;
}

/** Distance (wrapped) to the nearest and second-nearest feature point, and the nearest one's id. */
function nearest(
  pts: readonly { x: number; y: number; id: number }[],
  X: number,
  Y: number,
): { d1: number; d2: number; id: number; dx: number; dy: number } {
  let d1 = Infinity,
    d2 = Infinity,
    id = 0,
    bx = 0,
    by = 0;
  for (const p of pts) {
    let dx = X - p.x,
      dy = Y - p.y;
    if (dx > FIELD / 2) dx -= FIELD;
    else if (dx < -FIELD / 2) dx += FIELD;
    if (dy > FIELD / 2) dy -= FIELD;
    else if (dy < -FIELD / 2) dy += FIELD;
    const d = Math.hypot(dx, dy);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      id = p.id;
      bx = dx;
      by = dy;
    } else if (d < d2) d2 = d;
  }
  return { d1, d2, id, dx: bx, dy: by };
}

/** Paints a small marking at a wrapped position into a per-pixel overlay lookup. */
type Overlay = Map<number, RGB>;
const key = (X: number, Y: number): number => wrapTo(Y, FIELD) * FIELD + wrapTo(X, FIELD);
const plot = (o: Overlay, X: number, Y: number, c: RGB): void => void o.set(key(X, Y), c);

function grassTexture(g: Ramp, blades: number, seed: number): Tex {
  const overlay: Overlay = new Map();
  // Blades: short vertical strokes, dark at the root, pale at the tip, leaning a pixel with the
  // wind. Clustered, never a grid.
  const clusters = scatter(blades, 1.0, seed + 3);
  const perCluster = 3;
  for (const t of clusters) {
    const roll = hash2(t.id, 2, seed);
    if (roll < 0.12) continue;
    const bx = Math.round(t.x),
      by = Math.round(t.y);
    const n = 2 + Math.floor(hash2(t.id, 3, seed) * perCluster);
    for (let i = 0; i < n; i++) {
      const dx = Math.round((hash2(t.id, 10 + i, seed) - 0.5) * 6);
      const dy = Math.round((hash2(t.id, 20 + i, seed) - 0.5) * 4);
      const h = 2 + Math.floor(hash2(t.id, 30 + i, seed) * 3);
      const lean = hash2(t.id, 40 + i, seed) < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) {
        const px = bx + dx + (k >= 2 ? lean : 0),
          py = by + dy - k;
        plot(overlay, px, py, k === 0 ? g[1]! : k === h - 1 && h >= 3 ? g[4]! : g[3]!);
      }
      plot(overlay, bx + dx + 1, by + dy + 1, g[1]!);
    }
  }
  const macro = [
    { cell: 16, weight: 0.5 },
    { cell: 8, weight: 0.35 },
    { cell: 4, weight: 0.15 },
  ];
  return (X, Y) => {
    const o = overlay.get(key(X, Y));
    if (o) return o;
    const f = tileMix(X, Y, FIELD, macro, seed);
    const v = f + (bayer(X, Y) - 0.5) * 0.16;
    // Mostly the middle tone, with small pockets of shade and sun.
    return g[2 + band(v, [0.27, 0.77]) - 1]!;
  };
}

function dirtTexture(d: Ramp, seed: number): Tex {
  const overlay: Overlay = new Map();
  const pebbles = scatter(9, 1.0, seed + 5);
  for (const p of pebbles) {
    const roll = hash2(p.id, 9, seed);
    if (roll < 0.35) continue;
    const x = Math.round(p.x),
      y = Math.round(p.y);
    const big = roll > 0.8;
    const w = big ? 4 : 3,
      h = big ? 3 : 2;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        // Shade each pebble pixel from the light at its top-left to the shadow at its bottom-right.
        const t = (i / (w - 1) + j / (h - 1)) / 2;
        plot(overlay, x + i, y + j, d[t < 0.25 ? 5 : t < 0.7 ? 4 : 2]!);
      }
    }
    plot(overlay, x + w, y + h, d[1]!);
    plot(overlay, x + w - 1, y + h, d[1]!);
  }
  const macro = [
    { cell: 64, weight: 0.1 },
    { cell: 32, weight: 0.22 },
    { cell: 16, weight: 0.38 },
    { cell: 8, weight: 0.3 },
  ];
  return (X, Y) => {
    const o = overlay.get(key(X, Y));
    if (o) return o;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + 2);
    if (speck > 0.972) return d[2]!;
    if (speck < 0.025) return d[4]!;
    const f = tileMix(X, Y, FIELD, macro, seed);
    const v = 0.5 + (f - 0.5) * 0.8 + (bayer(X, Y) - 0.5) * 0.1;
    return d[2 + band(v, [0.33, 0.7])]!;
  };
}

function cobbleTexture(c: Ramp, seed: number): Tex {
  const pts = scatter(5, 0.5, seed + 41);
  return (X, Y) => {
    const n = nearest(pts, X, Y);
    const edge = n.d2 - n.d1;
    // Mortar: a thin dark seam where two cells are nearly equally close.
    if (edge < 1.7) return c[1]!;
    const tone = hash2(n.id, 3, seed);
    // Two close tones per stone, rarely a warmer or cooler one, so the path reads as laid stone and
    // not a pattern.
    let base = tone < 0.14 ? 2 : tone < 0.72 ? 3 : 4;
    // A one pixel lit rim on the upper left of each stone and a shaded one on the lower right.
    const toward = (n.dx + n.dy) / Math.max(1, n.d1 + 1);
    if (edge < 3.4) base += toward < -0.25 ? 1 : toward > 0.25 ? -1 : 0;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + n.id);
    if (speck > 0.985) base -= 1;
    else if (speck < 0.012) base += 1;
    const idx = Math.max(1, Math.min(5, base));
    return c[idx]!;
  };
}

/**
 * Cream marble slabs: a dark groove, a lit lip, a shaded far edge, a faint vein and the odd fleck
 * of gold dust.
 */
function marbleTexture(m: Ramp, seed: number): Tex {
  const SLAB = 32;
  return (X, Y) => {
    const sx = Math.floor(X / SLAB),
      sy = Math.floor(Y / SLAB);
    const lx = X - sx * SLAB,
      ly = Y - sy * SLAB;
    if (lx === 0 || ly === 0) return m[1]!;
    if (lx === 1 || ly === 1) return m[5]!;
    if (lx === SLAB - 1 || ly === SLAB - 1) return m[2]!;
    const tone = hash2(sx, sy, seed);
    let base = (sx + sy) % 2 === 0 ? 4 : 3;
    if (tone > 0.78) base -= 1;
    else if (tone < 0.12) base += 1;
    // A soft sheen across a few slabs, as if the room's light were falling on polished stone.
    const slant = lx + ly;
    if (tone > 0.3 && tone < 0.5 && slant > 22 && slant < 27) base += 1;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + 3);
    if (speck > 0.992) return GEM.gold[4]!;
    if (speck < 0.01) base -= 1;
    return m[Math.max(1, Math.min(5, base))]!;
  };
}

/**
 * Woven carpet: a fine weave, lozenges picked out in a lighter thread and a gold stitch at the
 * middle of each.
 */
function carpetTexture(c: Ramp, seed: number): Tex {
  return (X, Y) => {
    const lx = wrapTo(X, 32),
      ly = wrapTo(Y, 32);
    const d = Math.abs(lx - 15.5) + Math.abs(ly - 15.5);
    // A small four-petal flower in gold at the middle of each lozenge.
    if (d < 1.2 || (d < 4.2 && (Math.abs(lx - 15.5) < 1.2 || Math.abs(ly - 15.5) < 1.2) && d > 2.2))
      return GEM.gold[d < 1.2 ? 4 : 3]!;
    if (d > 13.2 && d < 14.4) return c[4]!;
    if (d > 14.4 && d < 15.6) return c[1]!;
    const weave = (X + Y) % 2 === 0 ? 0 : 1;
    const fleck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed) > 0.985 ? 1 : 0;
    return c[Math.max(1, Math.min(5, 2 + (d < 13 && weave ? 1 : 0) + fleck))]!;
  };
}

/**
 * Packed earth strewn with straw: short bright strokes lying every which way, a dark shadow pixel
 * under each.
 */
function strawTexture(e: Ramp, seed: number): Tex {
  const overlay: Overlay = new Map();
  const straws = scatter(8, 1.0, seed + 5);
  for (const t of straws) {
    if (hash2(t.id, 2, seed) < 0.3) continue;
    const len = 4 + Math.floor(hash2(t.id, 3, seed) * 5);
    const slope = (hash2(t.id, 4, seed) - 0.5) * 0.7;
    const gold = hash2(t.id, 5, seed) > 0.4;
    for (let k = 0; k < len; k++) {
      const x = Math.round(t.x + k),
        y = Math.round(t.y + k * slope);
      plot(overlay, x, y, PAL.straw[k === 0 || !gold ? 2 : 3]!);
      plot(overlay, x, y + 1, e[1]!);
    }
  }
  const macro = [
    { cell: 32, weight: 0.3 },
    { cell: 16, weight: 0.4 },
    { cell: 8, weight: 0.3 },
  ];
  return (X, Y) => {
    const o = overlay.get(key(X, Y));
    if (o) return o;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + 2);
    if (speck > 0.985) return e[4]!;
    if (speck < 0.02) return e[1]!;
    const v = tileMix(X, Y, FIELD, macro, seed) + (bayer(X, Y) - 0.5) * 0.12;
    return e[2 + band(v, [0.32, 0.74])]!;
  };
}

/**
 * Running-bond brick, wide and low, with a pale mortar line and a lit lip so the floor reads as
 * laid.
 */
function brickTexture(b: Ramp, seed: number): Tex {
  const BW = 32,
    BH = 16;
  return (X, Y) => {
    const row = Math.floor(Y / BH);
    const xs = X + (row % 2 === 0 ? 0 : BW / 2);
    const col = Math.floor(xs / BW);
    const lx = wrapTo(xs, BW),
      ly = Y - row * BH;
    if (ly === 0 || lx === 0) return b[1]!;
    if (ly === 1 || lx === 1) return b[4]!;
    if (ly === BH - 1 || lx === BW - 1) return b[2]!;
    const tone = hash2(col, row, seed);
    let base = tone < 0.2 ? 2 : tone < 0.75 ? 3 : 4;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + 1);
    if (speck > 0.985) base -= 1;
    else if (speck < 0.012) base += 1;
    return b[Math.max(1, Math.min(5, base))]!;
  };
}

/**
 * Which of the five colours each square of the field is. No square has a neighbour of its own
 * colour, across the repeat as well.
 */
const DISCO_HUES = [
  [0, 1, 2, 3],
  [3, 4, 0, 1],
  [1, 2, 3, 4],
  [4, 0, 1, 2],
] as const;

/**
 * The dance floor: squares of lit glass in five jewel colours, a dark seam round each, a bright lip
 * on the upper left and a shaded one on the lower right, and each deepening toward its edge as if
 * the lamp were under its middle.
 */
function discoTexture(seed: number): Tex {
  const SQUARE = 32;
  const jewels = [GEM.ruby, GEM.sapphire, GEM.topaz, GEM.emerald, GEM.amethyst] as const;
  const seam = INTERIOR.night[1]!;
  return (X, Y) => {
    const sx = Math.floor(X / SQUARE),
      sy = Math.floor(Y / SQUARE);
    const lx = X - sx * SQUARE,
      ly = Y - sy * SQUARE;
    if (lx === 0 || ly === 0) return seam;
    const jewel = jewels[DISCO_HUES[sy]![sx]!]!;
    if (lx === 1 || ly === 1) return jewel[4]!;
    if (lx === SQUARE - 1 || ly === SQUARE - 1) return jewel[1]!;
    if (hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + 3) > 0.996) return [255, 255, 255];
    const reach = Math.hypot(lx - SQUARE / 2, ly - SQUARE / 2) / (SQUARE / 2) + (bayer(X, Y) - 0.5) * 0.18;
    return jewel[reach < 0.4 ? 4 : reach < 0.72 ? 3 : 2]!;
  };
}

/**
 * The floor: broad flagstones of worn lilac stone, each a tone or two from its neighbour, with a
 * lit lip on the upper left, a hairline crack between them and, now and then, the glint of a
 * crystal in the stone.
 */
function caveFloorTexture(f: Ramp, seed: number): Tex {
  const pts = scatter(4, 0.8, seed + 17);
  const macro = [
    { cell: 32, weight: 0.5 },
    { cell: 16, weight: 0.35 },
    { cell: 8, weight: 0.15 },
  ];
  return (X, Y) => {
    const n = nearest(pts, X, Y);
    const edge = n.d2 - n.d1;
    if (edge < 1.5) return f[1]!;
    const tone = hash2(n.id, 5, seed);
    let base = tone < 0.2 ? 2 : tone < 0.72 ? 3 : 4;
    const toward = (n.dx + n.dy) / Math.max(1, n.d1 + 1);
    if (edge < 3.2) base += toward < -0.25 ? 1 : toward > 0.25 ? -1 : 0;
    else {
      const v = tileMix(X, Y, FIELD, macro, seed) + (bayer(X, Y) - 0.5) * 0.14;
      base += v < 0.3 ? -1 : v > 0.74 ? 1 : 0;
    }
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + n.id);
    if (speck > 0.9965)
      return GLINTS[Math.floor(hash2(wrapTo(X, FIELD) >> 1, wrapTo(Y, FIELD) >> 1, seed + 9) * GLINTS.length)]!;
    if (speck < 0.01) base -= 1;
    return f[Math.max(1, Math.min(5, base))]!;
  };
}

/**
 * The rock the cave is cut in: big dark blocks with a seam between them, a vertical grain in each
 * and a pale chip of crystal here and there. It is never walked on, so it is darker and rougher
 * than anything underfoot.
 */
function caveRockTexture(r: Ramp, seed: number): Tex {
  const pts = scatter(3, 0.9, seed + 29);
  return (X, Y) => {
    const n = nearest(pts, X, Y);
    const edge = n.d2 - n.d1;
    if (edge < 2.4) return r[0]!;
    const tone = hash2(n.id, 7, seed);
    let base = tone < 0.25 ? 1 : tone < 0.75 ? 2 : 3;
    const toward = (n.dx + n.dy) / Math.max(1, n.d1 + 1);
    if (edge < 4.4) base += toward < -0.2 ? 1 : toward > 0.2 ? -1 : 0;
    // A grain that runs down the block, and a dither so the big blocks are not flat.
    if (hash2(wrapTo(X, FIELD), Math.floor(wrapTo(Y, FIELD) / 5), seed + 3) > 0.84) base -= 1;
    else if (bayer(X, Y) > 0.9 && tone > 0.5) base += 1;
    const speck = hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), seed + n.id);
    if (speck > 0.9985)
      return GLINTS[Math.floor(hash2(wrapTo(X, FIELD) >> 2, wrapTo(Y, FIELD) >> 2, seed + 11) * GLINTS.length)]!;
    return r[Math.max(0, Math.min(5, base))]!;
  };
}

function waterTexture(w: Ramp, seed: number, glints?: readonly RGB[]): Tex {
  const macro = [
    { cell: 64, weight: 0.1 },
    { cell: 32, weight: 0.25 },
    { cell: 16, weight: 0.4 },
    { cell: 8, weight: 0.25 },
  ];
  return (X, Y, frame) => {
    // Drift the field by a quarter of its width per frame, so four frames loop exactly.
    const sx = wrapTo(X + (FIELD / WATER_FRAMES) * frame, FIELD);
    const f = tileMix(sx, Y, FIELD, macro, seed);
    // Short pale ripples: thin bands of a stretched noise, kept to the lighter half of the surface.
    const ridge = Math.abs(tileNoise(sx, Y * 3, FIELD, 32, seed + 77) - 0.5);
    if (ridge < 0.02 && tileNoise(sx, Y, FIELD, 8, seed + 5) > 0.55)
      return glints && hash2(sx >> 2, Y >> 2, seed + 3) > 0.7
        ? glints[Math.floor(hash2(sx >> 3, Y >> 3, seed + 4) * glints.length)]!
        : w[4]!;
    const v = 0.5 + (f - 0.5) * 0.75 + (bayer(X, Y) - 0.5) * 0.1;
    return w[1 + band(v, [0.36, 0.66])]!;
  };
}

export interface TileMeta {
  kind: 'grass' | 'path' | 'water' | 'path-edge' | 'water-edge';
  mask: number;
  /** Position inside the 2 x 2 field repeat: column + 2 * row. */
  pos: number;
  frame: number;
}

export interface Tileset {
  biome: Biome['id'];
  tiles: Rgba[];
  meta: TileMeta[];
  /** Tile id lookup: `${kind}:${mask}:${pos}:${frame}`. */
  ids: Map<string, number>;
}

export const tileKey = (kind: TileMeta['kind'], mask: number, pos: number, frame = 0): string =>
  `${kind}:${mask}:${pos}:${frame}`;

/** How much an edge whose weight grows along (gx, gy) faces the light from the upper left. */
const litBy = (gx: number, gy: number): number => -(gx * -0.7 + gy * -0.7);

function cornerWeight(mask: number, u: number, v: number): number {
  const tl = mask & 1 ? 1 : 0,
    tr = mask & 2 ? 1 : 0,
    bl = mask & 4 ? 1 : 0,
    br = mask & 8 ? 1 : 0;
  return (1 - v) * ((1 - u) * tl + u * tr) + v * ((1 - u) * bl + u * br);
}

/**
 * Direction of increasing weight, as a unit vector in tile space, used to light the rim of a raised
 * or sunken edge.
 */
function gradient(mask: number, u: number, v: number): [number, number] {
  const e = 0.02;
  const gx = cornerWeight(mask, Math.min(1, u + e), v) - cornerWeight(mask, Math.max(0, u - e), v);
  const gy = cornerWeight(mask, u, Math.min(1, v + e)) - cornerWeight(mask, u, Math.max(0, v - e));
  const l = Math.hypot(gx, gy);
  return l < 1e-6 ? [0, 0] : [gx / l, gy / l];
}

export function buildTileset(biome: Biome): Tileset {
  const grass =
    biome.ground === 'marble'
      ? marbleTexture(biome.grass, 101)
      : biome.ground === 'straw'
        ? strawTexture(biome.grass, 101)
        : biome.ground === 'rock'
          ? caveFloorTexture(biome.grass, 101)
          : grassTexture(biome.grass, biome.blades, 101);
  const pathRamp = biome.pathRamp ?? (biome.path === 'dirt' ? PAL.dirt : PAL.cobble);
  const pathTex = {
    dirt: () => dirtTexture(PAL.dirt, 202),
    cobble: () => cobbleTexture(PAL.cobble, 202),
    carpet: () => carpetTexture(pathRamp, 202),
    brick: () => brickTexture(pathRamp, 202),
    rock: () => caveRockTexture(pathRamp, 202),
    disco: () => discoTexture(202),
  }[biome.path]();
  const pool = biome.pool ?? { water: PAL.water, bank: PAL.sand, glints: undefined };
  const waterTex = waterTexture(pool.water, 303, pool.glints);
  const g = biome.grass;
  const wobble = (X: number, Y: number): number =>
    tileMix(
      X,
      Y,
      FIELD,
      [
        { cell: 32, weight: 0.4 },
        { cell: 16, weight: 0.4 },
        { cell: 8, weight: 0.2 },
      ],
      909,
    ) - 0.5;
  const foamDots = (X: number, Y: number): number => hash2(wrapTo(X, FIELD), wrapTo(Y, FIELD), 515);

  const tiles: Rgba[] = [];
  const meta: TileMeta[] = [];
  const ids = new Map<string, number>();
  const add = (m: TileMeta, img: Rgba): void => {
    ids.set(tileKey(m.kind, m.mask, m.pos, m.frame), tiles.length);
    tiles.push(img);
    meta.push(m);
  };

  const render = (m: TileMeta, pixel: (X: number, Y: number, u: number, v: number) => RGB): Rgba => {
    const img = createRgba(TILE_PX, TILE_PX);
    const X0 = (m.pos % POS) * TILE_PX,
      Y0 = Math.floor(m.pos / POS) * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const c = pixel(X0 + x, Y0 + y, (x + 0.5) / TILE_PX, (y + 0.5) / TILE_PX);
        img.data.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255], (y * TILE_PX + x) * 4);
      }
    }
    return img;
  };

  for (let pos = 0; pos < POS * POS; pos++) {
    add(
      { kind: 'grass', mask: 0, pos, frame: 0 },
      render({ kind: 'grass', mask: 0, pos, frame: 0 }, (X, Y) => grass(X, Y, 0)),
    );
    add(
      { kind: 'path', mask: 15, pos, frame: 0 },
      render({ kind: 'path', mask: 15, pos, frame: 0 }, (X, Y) => pathTex(X, Y, 0)),
    );
  }

  // Grass to path (dirt or cobble): a sunken, softly rimmed edge.
  for (let mask = 1; mask < 15; mask++) {
    for (let pos = 0; pos < POS * POS; pos++) {
      const m: TileMeta = { kind: 'path-edge', mask, pos, frame: 0 };
      add(
        m,
        render(m, (X, Y, u, v) => {
          const p =
            cornerWeight(mask, u, v) +
            (biome.crisp || biome.raised ? 0 : wobble(X, Y) * 0.55) +
            (biome.raised ? wobble(X, Y) * 0.4 : 0);
          const [gx, gy] = gradient(mask, u, v);
          if (biome.raised) {
            // Rock that stands up from the floor. Where it lies up the screen the floor looks at
            // its face, a dark band grained downward. Elsewhere it sees the lit top edge of the
            // rock. At its foot the floor is shaded either way.
            if (p < 0.4) return grass(X, Y, 0);
            if (p < 0.47) return g[p < 0.435 ? 0 : 1]!;
            if (p < 0.5) return pathRamp[gy < -0.3 ? 2 : 5]!;
            if (gy < -0.3 && p < 0.6) return pathRamp[hash2(wrapTo(X, FIELD), 3, 616) > 0.55 ? 2 : 1]!;
            return pathTex(X, Y, 0);
          }
          if (biome.crisp) {
            // A trimmed edge: a thin shadow on the ground, a braid or curb, and the path itself.
            if (p < 0.4) return grass(X, Y, 0);
            if (p < 0.45) return g[1]!;
            if (p < 0.5)
              return biome.path === 'carpet'
                ? GEM.gold[litBy(gx, gy) > 0.2 ? 4 : 2]!
                : pathRamp[litBy(gx, gy) > 0.2 ? 4 : 2]!;
            if (p < 0.54) return pathRamp[1]!;
            return pathTex(X, Y, 0);
          }
          // Light comes from the upper left: an edge that faces it catches a bright lip, the
          // opposite one a dark one.
          const facing = -(gx * -0.7 + gy * -0.7);
          if (p < 0.4) return grass(X, Y, 0);
          if (p < 0.46) return g[p < 0.43 ? 0 : 1]!;
          if (p < 0.52) return pathRamp[facing > 0.2 ? 1 : 2]!;
          if (p < 0.55) return pathRamp[facing < -0.2 ? 5 : 4]!;
          return pathTex(X, Y, 0);
        }),
      );
    }
  }

  if (biome.water) {
    for (let frame = 0; frame < WATER_FRAMES; frame++) {
      for (let pos = 0; pos < POS * POS; pos++) {
        const m: TileMeta = { kind: 'water', mask: 15, pos, frame };
        add(
          m,
          render(m, (X, Y) => waterTex(X, Y, frame)),
        );
      }
      for (let mask = 1; mask < 15; mask++) {
        for (let pos = 0; pos < POS * POS; pos++) {
          const m: TileMeta = { kind: 'water-edge', mask, pos, frame };
          add(
            m,
            render(m, (X, Y, u, v) => {
              const p = cornerWeight(mask, u, v) + wobble(X, Y) * 0.6;
              const deep = (): RGB => waterTex(X, Y, frame);
              if (p < 0.34) return grass(X, Y, 0);
              if (p < 0.39) return g[p < 0.365 ? 0 : 1]!;
              // Wet sand and mud where the bank meets the pond.
              if (p < 0.47) return pool.bank[p < 0.43 ? 2 : 3]!;
              if (p < 0.5) return pool.bank[1]!;
              // Shallows: lighter water with foam flecks that drift with the frame.
              if (p < 0.6) {
                const fleck = foamDots(X + frame * 3, Y) > 0.88;
                return fleck ? pool.water[5]! : pool.water[p < 0.55 ? 3 : 2]!;
              }
              return deep();
            }),
          );
        }
      }
    }
  }
  return { biome: biome.id, tiles, meta, ids };
}

/**
 * Chooses a tile's id from its four corner classes and its place on the map. Returns null for
 * combinations the set lacks.
 */
export function pickTile(
  set: Tileset,
  corners: readonly ('grass' | EdgeKind)[],
  col: number,
  row: number,
  frame = 0,
): { layer: 'ground' | 'water'; id: number } | null {
  const classes = new Set(corners);
  const pos = (col % POS) + POS * (row % POS);
  const maskOf = (kind: EdgeKind): number => corners.reduce((m, c, i) => (c === kind ? m | (1 << i) : m), 0);
  if (classes.size === 1) {
    const only = corners[0]!;
    if (only === 'grass') return { layer: 'ground', id: set.ids.get(tileKey('grass', 0, pos))! };
    if (only === 'path') return { layer: 'ground', id: set.ids.get(tileKey('path', 15, pos))! };
    const id = set.ids.get(tileKey('water', 15, pos, frame));
    return id === undefined ? null : { layer: 'water', id };
  }
  if (classes.size === 2 && classes.has('grass')) {
    const other = corners.find((c) => c !== 'grass')! as EdgeKind;
    const mask = maskOf(other);
    if (other === 'path') return { layer: 'ground', id: set.ids.get(tileKey('path-edge', mask, pos))! };
    const id = set.ids.get(tileKey('water-edge', mask, pos, frame));
    return id === undefined ? null : { layer: 'water', id };
  }
  return null;
}

export { mix };
