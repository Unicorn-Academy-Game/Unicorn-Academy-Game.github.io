import { createHash } from 'node:crypto';
import type { Rect } from '../../../src/shared/manifest';
import { alphaBounds, createRgba, crop, type Rgba } from '../../art/core/image';

export interface PackInput {
  /** Unique name; identical pixels share one rect. */
  key: string;
  image: Rgba;
  /**
   * Inputs that are next to each other in the list and share a group are never split across two
   * pages by `packPages`, so a clip that is drawn from one page is drawn from only that page.
   */
  group?: string;
}

export interface PackedAtlas {
  width: number;
  height: number;
  image: Rgba;
  rects: Rect[];
  /** Input key to index in `rects`. */
  rectOf: Map<string, number>;
}

export interface PackOptions {
  maxSize?: number;
  /** Transparent gap between rects. */
  padding?: number;
  /**
   * Edge pixels repeated into the gap, so bilinear sampling at fractional zoom does not pick up a
   * dark fringe.
   */
  extrude?: number;
  /**
   * `rows` lays pictures in rows as tall as the tallest picture in each, so a short picture beside
   * a tall one leaves the room under it empty. `fill` puts each picture in the gap that holds it
   * most snugly. A sheet's file name carries a hash of its pixels, so changing how it is packed
   * makes every player download it again: `rows` stays the default and a sheet moves to `fill` when
   * it is being rebuilt anyway.
   */
  fit?: 'rows' | 'fill';
}

const EMPTY: Rgba = { width: 1, height: 1, data: new Uint8Array(4) };

const pixelHash = (img: Rgba): string =>
  createHash('sha256').update(`${img.width}x${img.height}:`).update(img.data).digest('hex');

/**
 * An input trimmed to its visible pixels and named by what they are, so identical pictures can
 * share one rect.
 */
interface Prepared {
  key: string;
  /** The trimmed pixels. */
  image: Rgba;
  /** Where the trimmed pixels sit in the untrimmed canvas, and that canvas's size. */
  ox: number;
  oy: number;
  sw: number;
  sh: number;
  /** The same for every input whose trimmed pixels, place and canvas are the same. */
  same: string;
}

function prepare(inputs: readonly PackInput[]): Prepared[] {
  return inputs.map(({ key, image }) => {
    const b = alphaBounds(image);
    const trimmed = b ? crop(image, b.x, b.y, b.w, b.h) : EMPTY;
    const same = `${pixelHash(trimmed)}:${b?.x ?? 0},${b?.y ?? 0}:${image.width}x${image.height}`;
    return { key, image: trimmed, ox: b?.x ?? 0, oy: b?.y ?? 0, sw: image.width, sh: image.height, same };
  });
}

interface Unique extends Omit<Prepared, 'key' | 'same'> {
  x: number;
  y: number;
}

interface Layout {
  width: number;
  height: number;
  uniques: Unique[];
  /** Input key to index in `uniques`. */
  uniqueOf: Map<string, number>;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Deduplicates identical trimmed images and packs them into one page without drawing anything.
 * Throws when they do not fit, so detail is never silently lost.
 */
function layout(items: readonly Prepared[], maxSize: number, pad: number, fit: 'rows' | 'fill'): Layout {
  const uniques: Unique[] = [];
  const bySame = new Map<string, number>();
  const uniqueOf = new Map<string, number>();
  for (const { key, same, ...picture } of items) {
    let idx = bySame.get(same);
    if (idx === undefined) {
      idx = uniques.length;
      bySame.set(same, idx);
      uniques.push({ ...picture, x: 0, y: 0 });
    }
    uniqueOf.set(key, idx);
  }
  const size = fit === 'fill' ? fill(uniques, maxSize, pad) : rows(uniques, maxSize, pad);
  return { ...size, uniques, uniqueOf };
}

/** Tallest first keeps the rows tight. */
function rows(uniques: Unique[], maxSize: number, pad: number): Size {
  const order = uniques
    .map((_, i) => i)
    .sort(
      (a, b) =>
        uniques[b]!.image.height - uniques[a]!.image.height || uniques[b]!.image.width - uniques[a]!.image.width,
    );
  let x = pad,
    y = pad,
    shelf = 0,
    usedW = 0;
  for (const i of order) {
    const u = uniques[i]!;
    if (x + u.image.width + pad > maxSize) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    if (x + u.image.width + pad > maxSize)
      throw new Error(`atlas: image ${u.image.width}px wide exceeds the ${maxSize}px page`);
    u.x = x;
    u.y = y;
    x += u.image.width + pad;
    shelf = Math.max(shelf, u.image.height);
    usedW = Math.max(usedW, x);
  }
  const height = Math.ceil((y + shelf + pad) / 4) * 4;
  if (height > maxSize)
    throw new Error(
      `atlas: needs ${height}px of height but the page limit is ${maxSize}px for ${uniques.length} images`,
    );
  return { width: Math.ceil(usedW / 4) * 4, height };
}

/** Free room on a page. */
interface Gap {
  x: number;
  y: number;
  w: number;
  h: number;
}

const holds = (a: Gap, b: Gap): boolean => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

/**
 * The gaps that are left when `used` is taken out. A gap it cuts into is replaced by what is left
 * of it above, below and to either side, which overlap one another; a piece that another gap holds
 * is dropped, and of two that are the same the first stays. A gap it does not touch was not inside
 * another and cannot hold a piece of one that was not inside it either, so only the pieces are
 * compared.
 */
function cut(gaps: readonly Gap[], used: Gap): Gap[] {
  const kept: Gap[] = [];
  const pieces: Gap[] = [];
  for (const g of gaps) {
    if (used.x >= g.x + g.w || used.x + used.w <= g.x || used.y >= g.y + g.h || used.y + used.h <= g.y) {
      kept.push(g);
      continue;
    }
    if (used.x > g.x) pieces.push({ x: g.x, y: g.y, w: used.x - g.x, h: g.h });
    if (used.x + used.w < g.x + g.w)
      pieces.push({ x: used.x + used.w, y: g.y, w: g.x + g.w - used.x - used.w, h: g.h });
    if (used.y > g.y) pieces.push({ x: g.x, y: g.y, w: g.w, h: used.y - g.y });
    if (used.y + used.h < g.y + g.h)
      pieces.push({ x: g.x, y: used.y + used.h, w: g.w, h: g.y + g.h - used.y - used.h });
  }
  const whole = pieces.filter(
    (p, i) =>
      !kept.some((k) => holds(k, p)) && !pieces.some((q, j) => j !== i && holds(q, p) && (!holds(p, q) || j < i)),
  );
  return [...kept, ...whole];
}

/**
 * How well a picture of `w` by `h` sits in a gap, the first number first and the second to break a
 * tie, a smaller one being better.
 */
type Snug = (gap: Gap, w: number, h: number) => readonly [number, number];
/** The gap it leaves the least room in beside the picture, which fills the small gaps first. */
const TIGHT: Snug = (g, w, h) => [Math.min(g.w - w, g.h - h), Math.max(g.w - w, g.h - h)];
/** The gap that leaves the picture's bottom edge highest, which keeps the page short. */
const HIGH: Snug = (g, _width, h) => [g.y + h, g.x];

/**
 * Puts the pictures in the order given each in the gap `snug` likes best, or fails if one has no
 * gap that holds it.
 */
function place(
  uniques: readonly Unique[],
  order: readonly number[],
  maxSize: number,
  pad: number,
  snug: Snug,
): (Size & { at: { x: number; y: number }[] }) | null {
  let gaps: Gap[] = [{ x: 0, y: 0, w: maxSize - pad, h: maxSize - pad }];
  const at: { x: number; y: number }[] = [];
  let right = 0,
    bottom = 0;
  for (const i of order) {
    const w = uniques[i]!.image.width + pad;
    const h = uniques[i]!.image.height + pad;
    let best: Gap | undefined;
    let score: readonly [number, number] = [Infinity, Infinity];
    for (const g of gaps) {
      if (g.w < w || g.h < h) continue;
      const s = snug(g, w, h);
      if (s[0] < score[0] || (s[0] === score[0] && s[1] < score[1])) {
        best = g;
        score = s;
      }
    }
    if (!best) return null;
    at[i] = { x: pad + best.x, y: pad + best.y };
    gaps = cut(gaps, { x: best.x, y: best.y, w, h });
    right = Math.max(right, best.x + w);
    bottom = Math.max(bottom, best.y + h);
  }
  return { at, width: Math.ceil((pad + right) / 4) * 4, height: Math.ceil((pad + bottom) / 4) * 4 };
}

/**
 * The longest first, which leaves the small pictures to fill what the big ones leave. Both ways of
 * choosing a gap are tried and the smaller page is kept.
 */
function fill(uniques: Unique[], maxSize: number, pad: number): Size {
  const longest = (i: number): number => Math.max(uniques[i]!.image.width, uniques[i]!.image.height);
  const area = (i: number): number => uniques[i]!.image.width * uniques[i]!.image.height;
  const order = uniques.map((_, i) => i).sort((a, b) => longest(b) - longest(a) || area(b) - area(a) || a - b);
  for (const u of uniques)
    if (u.image.width + 2 * pad > maxSize)
      throw new Error(`atlas: image ${u.image.width}px wide exceeds the ${maxSize}px page`);
  const found = [TIGHT, HIGH].flatMap((snug) => {
    const placed = place(uniques, order, maxSize, pad, snug);
    return placed ? [placed] : [];
  });
  const best = found.sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (!best)
    throw new Error(`atlas: the ${uniques.length} images do not fit on one page, and the page limit is ${maxSize}px`);
  uniques.forEach((u, i) => {
    u.x = best.at[i]!.x;
    u.y = best.at[i]!.y;
  });
  return { width: best.width, height: best.height };
}

/**
 * Draws a layout into a page, repeating each picture's edge pixels `extrude` deep into the gap
 * round it.
 */
function paint({ width, height, uniques, uniqueOf }: Layout, ext: number): PackedAtlas {
  const page = createRgba(width, height);
  const put = (src: Rgba, dx: number, dy: number, sx: number, sy: number): void => {
    const si = (sy * src.width + sx) * 4;
    page.data.set(src.data.subarray(si, si + 4), (dy * width + dx) * 4);
  };
  for (const u of uniques) {
    for (let r = 0; r < u.image.height; r++)
      for (let c = 0; c < u.image.width; c++) put(u.image, u.x + c, u.y + r, c, r);
    // Extrude each edge outward by repeating the nearest edge pixel.
    for (let e = 1; e <= ext; e++) {
      for (let c = -e + 1; c < u.image.width + e - 1; c++) {
        const cc = Math.min(u.image.width - 1, Math.max(0, c));
        put(u.image, u.x + c, u.y - e, cc, 0);
        put(u.image, u.x + c, u.y + u.image.height - 1 + e, cc, u.image.height - 1);
      }
      for (let r = -e + 1; r < u.image.height + e - 1; r++) {
        const rr = Math.min(u.image.height - 1, Math.max(0, r));
        put(u.image, u.x - e, u.y + r, 0, rr);
        put(u.image, u.x + u.image.width - 1 + e, u.y + r, u.image.width - 1, rr);
      }
    }
  }

  const rects: Rect[] = uniques.map((u) => ({
    x: u.x,
    y: u.y,
    w: u.image.width,
    h: u.image.height,
    ox: u.ox,
    oy: u.oy,
    sw: u.sw,
    sh: u.sh,
  }));
  return { width, height, image: page, rects, rectOf: new Map(uniqueOf) };
}

/**
 * Trims every input to its visible pixels, deduplicates identical trimmed images, and packs them
 * into one page. Throws instead of shrinking when the page limit is exceeded, so detail is never
 * silently lost.
 */
export function packAtlas(inputs: readonly PackInput[], opts: PackOptions = {}): PackedAtlas {
  const pad = opts.padding ?? 2;
  return paint(
    layout(prepare(inputs), opts.maxSize ?? 2048, pad, opts.fit ?? 'rows'),
    Math.min(opts.extrude ?? 1, pad),
  );
}

export interface PackedPages {
  pages: PackedAtlas[];
  /** Input key to its page and rect. */
  place: Map<string, { page: number; rect: number }>;
}

/**
 * Packs inputs into as few pages as fit, keeping input order so a bundle's layout is stable from
 * run to run. A page grows until the packer refuses, then the next input, or the next group of
 * them, starts the next page.
 */
export function packPages(inputs: readonly PackInput[], opts: PackOptions = {}): PackedPages {
  const maxSize = opts.maxSize ?? 2048;
  const pad = opts.padding ?? 2;
  const fit = opts.fit ?? 'rows';
  const items = prepare(inputs);
  const fits = (list: readonly Prepared[]): boolean => {
    try {
      layout(list, maxSize, pad, fit);
      return true;
    } catch {
      return false;
    }
  };
  // A unit is what may not be split: one input, or the run of inputs that share a group.
  const units: number[][] = [];
  inputs.forEach((input, i) => {
    const last = units[units.length - 1];
    if (last && input.group !== undefined && inputs[last[0]!]!.group === input.group) last.push(i);
    else units.push([i]);
  });

  const groups: number[][] = [];
  let current: number[] = [];
  let area = 0;
  for (const unit of units) {
    const unitArea = unit.reduce((sum, i) => sum + (items[i]!.image.width + 2) * (items[i]!.image.height + 2), 0);
    // Cheap rejection first: a page cannot hold more pixels than it has.
    if (
      current.length > 0 &&
      (area + unitArea > maxSize * maxSize * 0.92 || !fits([...current, ...unit].map((i) => items[i]!)))
    ) {
      groups.push(current);
      current = [];
      area = 0;
    }
    current.push(...unit);
    area += unitArea;
  }
  if (current.length > 0) groups.push(current);
  const pages: PackedAtlas[] = [];
  const place = new Map<string, { page: number; rect: number }>();
  groups.forEach((g, page) => {
    const packed = paint(
      layout(
        g.map((i) => items[i]!),
        maxSize,
        pad,
        fit,
      ),
      Math.min(opts.extrude ?? 1, pad),
    );
    pages.push(packed);
    for (const [key, rect] of packed.rectOf) place.set(key, { page, rect });
  });
  return { pages, place };
}
