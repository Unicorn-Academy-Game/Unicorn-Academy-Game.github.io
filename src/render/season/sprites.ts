import { clamp } from '../../shared/math';
import type { SeasonId } from '../../shared/seasons';
import { type Hsv, hash, luma, patches, put, type Rgb, sample, smooth, toHsv } from './color';
import {
  AUTUMN_TURN,
  FROSTED,
  FROSTED_CONIFER,
  GROUND_SNOW,
  SPRING_FRESH,
  SPRING_PINK,
  SPRING_WHITE,
} from './palettes';
import type { Cell, Pixels, Role } from './pixels';
import { capSnow, glows, OPAQUE } from './snow';

const TREELIKE: ReadonlySet<Role> = new Set<Role>(['tree', 'blossom', 'conifer']);
const FOLIAGE: ReadonlySet<Role> = new Set<Role>(['tree', 'blossom', 'conifer', 'plant', 'distant']);

/**
 * Recolours the sprites on a page for a season, in place, a picture at a time, each by what it is.
 * Pixels outside every cell are the gaps between pictures and are left alone. Summer is the sprites
 * as they were drawn, and the alpha of every pixel is left alone.
 */
export function dressCells(px: Pixels, cells: readonly Cell[], season: SeasonId): void {
  if (season === 'summer') return;
  for (const cell of cells) {
    if (cell.role === 'skip') continue;
    if (cell.role === 'sky') {
      sky(px, cell, season);
      continue;
    }
    if (FOLIAGE.has(cell.role)) foliage(px, cell, season);
    if (season !== 'winter') continue;
    if (cell.role === 'flower') frost(px, cell);
    if (cell.role === 'building' || cell.role === 'manor') roofSnow(px, cell, cell.role === 'manor');
    capSnow(px, cell, SNOW_DEPTH[cell.role] ?? 1);
  }
}

/** How much deeper than usual a cap of snow lies on each kind of thing. */
const SNOW_DEPTH: Partial<Record<Role, number>> = {
  rock: 1.8,
  building: 1.6,
  manor: 1.6,
  prop: 1.2,
  tree: 1.2,
  blossom: 1.2,
  conifer: 1.2,
};

/**
 * Whether a pixel of a tree or a bush is leaf, and not trunk, bark, outline or a stone. Leaves are
 * coloured, or a pale highlight in the crown. Wood is brown, and neither as bright as gold leaves
 * nor as pale as bark.
 */
function isLeaf(c: Hsv, treelike: boolean, below: number): boolean {
  if (c.v < 0.1) return false;
  if (c.s < 0.14) return c.v > 0.72 && below < 0.5;
  if (!treelike) return true;
  if (c.h >= 6 && c.h <= 40 && c.s >= 0.22 && c.s <= 0.72 && c.v <= 0.82) return false;
  // The trunk of a blossom tree is a dark red-brown, and it is down below the crown.
  return !(below > 0.5 && (c.h >= 320 || c.h < 6) && c.s >= 0.2 && c.s <= 0.75 && c.v <= 0.7);
}

/**
 * The light that 5 in every 100 of the leaves are darker than, and the light that 5 in every 100
 * are lighter than, for a picture's foliage.
 */
function lightRange(bins: Uint32Array, count: number): [number, number] {
  const at = (share: number): number => {
    let seen = 0;
    for (let i = 0; i < bins.length; i++) {
      seen += bins[i]!;
      if (seen >= count * share) return i / 255;
    }
    return 1;
  };
  return [at(0.05), at(0.95)];
}

type Style = 'fresh' | 'pink' | 'white' | 'both';

/**
 * How a tree comes out in spring: the blossom trees are pink and white, and some of the others are,
 * with the rest in new leaf.
 */
function styleOf(role: Role, pick: number): Style {
  if (role === 'blossom') return pick < 0.4 ? 'pink' : 'both';
  if (role !== 'tree') return 'fresh';
  if (pick < 0.35) return 'fresh';
  if (pick < 0.6) return 'pink';
  if (pick < 0.75) return 'white';
  return 'both';
}

function foliage(px: Pixels, cell: Cell, season: SeasonId): void {
  const { width, data } = px;
  const treelike = TREELIKE.has(cell.role);
  if (cell.role === 'conifer' && season !== 'winter') return;
  const c: Hsv = { h: 0, s: 0, v: 0 };
  const o: Rgb = { r: 0, g: 0, b: 0 };
  const bins = new Uint32Array(256);
  let count = 0;
  const pixels = (each: (x: number, y: number, p: number, below: number) => void): void => {
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        const p = (y * width + x) * 4;
        if (data[p + 3] === 0) continue;
        toHsv(data[p]!, data[p + 1]!, data[p + 2]!, c);
        if (isLeaf(c, treelike, (y - cell.y) / cell.h)) each(x, y, p, (y - cell.y) / cell.h);
      }
    }
  };
  pixels((_x, _y, p) => {
    bins[Math.round(luma(data[p]!, data[p + 1]!, data[p + 2]!) * 255)]!++;
    count++;
  });
  if (count === 0) return;
  const [lo, hi] = lightRange(bins, count);
  const span = Math.max(hi - lo, 0.1);

  const seed = (cell.x * 31 + cell.y) | 0;
  const own = hash(cell.x, cell.y, 5);
  const size = Math.max(14, Math.round(Math.min(cell.w, cell.h) / 3.5));
  const style = styleOf(cell.role, own);
  pixels((x, y, p) => {
    const t = clamp((luma(data[p]!, data[p + 1]!, data[p + 2]!) - lo) / span);
    if (season === 'winter') {
      sample(cell.role === 'distant' ? GROUND_SNOW : cell.role === 'conifer' ? FROSTED_CONIFER : FROSTED, t, o);
    } else if (season === 'autumn') {
      turned(x, y, t, size, seed, own, o);
    } else {
      blossomed(x, y, t, size, seed, style, o);
    }
    put(data, p, o.r, o.g, o.b);
  });
}

/**
 * A leaf turning: broad patches that lean to red in one tree and to gold in another, each lit along
 * its own ramp, with a last green in the odd corner. The patches are larger than the lumps of a
 * crown, so the colour changes across the tree and the light changes across every lump.
 */
function turned(x: number, y: number, t: number, size: number, seed: number, own: number, o: Rgb): void {
  const u = clamp(0.4 + (patches(x, y, size, seed) - 0.5) * 1.1 + (own - 0.5) * 0.5);
  const f = u * (AUTUMN_TURN.length - 1);
  const i = Math.min(Math.floor(f), AUTUMN_TURN.length - 2);
  const k = smooth(0.25, 0.75, f - i);
  sample(AUTUMN_TURN[i]!, t, o);
  const { r, g, b } = o;
  sample(AUTUMN_TURN[i + 1]!, t, o);
  o.r = r + (o.r - r) * k;
  o.g = g + (o.g - g) * k;
  o.b = b + (o.b - b) * k;
}

/** New leaf or blossom, by the style of the tree. */
function blossomed(x: number, y: number, t: number, size: number, seed: number, style: Style, o: Rgb): void {
  if (style === 'fresh') sample(SPRING_FRESH, t, o);
  else if (style === 'pink') sample(SPRING_PINK, t, o);
  else if (style === 'white') sample(SPRING_WHITE, t, o);
  else sample(patches(x, y, size, seed + 3) < 0.4 ? SPRING_WHITE : SPRING_PINK, t, o);
}

/**
 * The roofs of a house in winter. A roof is the coloured part high up in the picture, where the
 * walls are stone or timber and not as colourful. Snow lies on it, and only the lines of the tiles
 * and the shade of a tower show. The manor's walls are as purple as its roof, so for it a roof is
 * only what is dark.
 */
function roofSnow(px: Pixels, cell: Cell, darkOnly: boolean): void {
  const { width, data } = px;
  const c: Hsv = { h: 0, s: 0, v: 0 };
  const o: Rgb = { r: 0, g: 0, b: 0 };
  const top = darkOnly ? 0.55 : 0.5;
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    if ((y - cell.y) / cell.h >= top) break;
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3]! < OPAQUE) continue;
      toHsv(data[p]!, data[p + 1]!, data[p + 2]!, c);
      if (c.s < 0.2 || glows(c) || (darkOnly && c.v >= 0.6)) continue;
      sample(GROUND_SNOW, smooth(darkOnly ? 0.18 : 0.3, darkOnly ? 0.6 : 0.95, c.v), o);
      put(data, p, o.r, o.g, o.b);
    }
  }
}

/**
 * Flowers that are left in the cold are touched with frost: most of their colour goes, and what is
 * left is pale.
 */
function frost(px: Pixels, cell: Cell): void {
  const { width, data } = px;
  const c: Hsv = { h: 0, s: 0, v: 0 };
  const o: Rgb = { r: 0, g: 0, b: 0 };
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3]! < OPAQUE) continue;
      const r = data[p]!;
      const g = data[p + 1]!;
      const b = data[p + 2]!;
      toHsv(r, g, b, c);
      if (c.s < 0.25 || glows(c)) continue;
      sample(GROUND_SNOW, smooth(0.25, 0.95, luma(r, g, b)), o);
      put(data, p, o.r * 0.7 + r * 0.3, o.g * 0.7 + g * 0.3, o.b * 0.7 + b * 0.3);
    }
  }
}

/**
 * The sky in winter is a grey that is a little blue. The other seasons keep the blue they have, and
 * the haze over the world tints it.
 */
function sky(px: Pixels, cell: Cell, season: SeasonId): void {
  if (season !== 'winter') return;
  const { width, data } = px;
  const o: Rgb = { r: 0, g: 0, b: 0 };
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] === 0) continue;
      const grey = luma(data[p]!, data[p + 1]!, data[p + 2]!) * 255;
      o.r = grey * 0.82 + 42;
      o.g = grey * 0.86 + 46;
      o.b = grey * 0.9 + 52;
      put(data, p, data[p]! * 0.3 + o.r * 0.7, data[p + 1]! * 0.3 + o.g * 0.7, data[p + 2]! * 0.3 + o.b * 0.7);
    }
  }
}
