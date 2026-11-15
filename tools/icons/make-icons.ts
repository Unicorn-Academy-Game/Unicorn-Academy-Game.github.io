import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EAST } from '../../src/shared/compass';
import { facingKey, Manifest } from '../../src/shared/manifest';
import { clamp, lerp } from '../../src/shared/math';
import { createRgba, type Rgba, upscale, writePng } from '../art/core/image';
import { readPicture } from '../lib/picture';

/**
 * `pnpm icons:build`: draws the home screen icons from Wildstar's own sprite, so the icon is made
 * of the same pixels the game shows. The head is enlarged with hard pixels and given the ink
 * outline the title wordmark has. It sits in a round badge in the wordmark's pink and violet, on
 * the title screen's deep green with a few sparkles. One 1024 pixel master is drawn for each layout
 * and shrunk with area averaging, because pixel art only stays even when it is enlarged by whole
 * numbers.
 *
 * The outputs in `public/icons` are committed. Run this again only when the art or the layout
 * changes.
 */

const ASSETS = 'public/assets';
const OUT = 'public/icons';
const MASTER = 1024;

type Color = readonly [number, number, number];
const INK: Color = [0x26, 0x18, 0x3d];
const CREAM: Color = [0xff, 0xf7, 0xd1];
const GOLD: Color = [0xff, 0xd7, 0x5e];
const PINK: Color = [0xff, 0x7a, 0xc8];
const VIOLET: Color = [0x9b, 0x6b, 0xff];
const BLUSH: Color = [0xff, 0xc9, 0xea];

/**
 * The part of Wildstar's idle frame that shows the head and the start of the neck, in the sprite's
 * own 192 pixel canvas.
 */
const HEAD = { x: 92, y: 36, w: 96, h: 112 } as const;
/** The point of the head the layouts place: just below the eye. */
const EYE = { x: 150, y: 82 } as const;

const mixColor = (a: Color, b: Color, t: number): Color => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const smooth = (t: number): number => t * t * (3 - 2 * t);

function wildstarHead(): Rgba {
  const manifest = Manifest.parse(JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8')));
  const wildstar = manifest.unicorns.wildstar;
  if (!wildstar) throw new Error('the manifest has no Wildstar');
  const frame = wildstar.clips.idle?.[facingKey(EAST)]?.frames[0];
  const rect = frame && wildstar.atlas.rects[frame.rect];
  if (!rect) throw new Error('Wildstar has no idle frame facing east');
  const sheet = readPicture(join(ASSETS, wildstar.atlas.file));
  const head = createRgba(HEAD.w, HEAD.h);
  for (let y = 0; y < HEAD.h; y++) {
    for (let x = 0; x < HEAD.w; x++) {
      const ax = rect.x + (HEAD.x + x - rect.ox);
      const ay = rect.y + (HEAD.y + y - rect.oy);
      if (ax < rect.x || ay < rect.y || ax >= rect.x + rect.w || ay >= rect.y + rect.h) continue;
      const from = (ay * sheet.width + ax) * 4;
      head.data.set(sheet.data.subarray(from, from + 4), (y * HEAD.w + x) * 4);
    }
  }
  return head;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function put(img: Rgba, x: number, y: number, color: Color, alpha: number): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height || alpha <= 0) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = Math.round(lerp(img.data[i]!, color[0], alpha));
  img.data[i + 1] = Math.round(lerp(img.data[i + 1]!, color[1], alpha));
  img.data[i + 2] = Math.round(lerp(img.data[i + 2]!, color[2], alpha));
  img.data[i + 3] = 255;
}

/** The title screen's green, lighter near the top. */
function night(): Rgba {
  const img = createRgba(MASTER, MASTER);
  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const r = smooth(clamp(Math.hypot(x - MASTER * 0.5, (y - MASTER * 0.38) * 0.95) / (MASTER * 0.8)));
      put(img, x, y, [lerp(0x2f, 0x0e, r), lerp(0x6e, 0x1c, r), lerp(0x4e, 0x16, r)], 1);
    }
  }
  return img;
}

/** Specks and four-point sparkles built from square cells, the way the game's own pixels are. */
function sparkles(img: Rgba, seed: number, stars: readonly (readonly [number, number, number, Color])[]): void {
  const cell = MASTER / 64;
  const paint = (cx: number, cy: number, color: Color, alpha = 1): void => {
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) put(img, Math.round(cx * cell) + x, Math.round(cy * cell) + y, color, alpha);
  };
  const random = rng(seed);
  for (let i = 0; i < 46; i++)
    paint(Math.floor(random() * 64), Math.floor(random() * 64), i % 3 === 0 ? PINK : CREAM, 0.24 + random() * 0.3);
  for (const [cx, cy, arm, color] of stars) {
    paint(cx, cy, color);
    for (let i = 1; i <= arm; i++) {
      const a = i === arm ? 0.55 : 1;
      paint(cx - i, cy, color, a);
      paint(cx + i, cy, color, a);
      paint(cx, cy - i, color, a);
      paint(cx, cy + i, color, a);
    }
  }
}

interface Layout {
  /** Radius of the badge as a fraction of the icon. */
  radius: number;
  /** Whole-number enlargement of Wildstar's pixels. */
  scale: number;
  /** Where the middle of the badge sits, as fractions of the icon. */
  center: readonly [number, number];
  /** Where the eye sits relative to the middle of the badge, in fractions of the icon. */
  eye: readonly [number, number];
}

/**
 * Coverage of a disc with a soft one pixel edge, so the badge has no jaggies before it is shrunk.
 */
const disc = (x: number, y: number, cx: number, cy: number, r: number): number =>
  clamp(r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5);

function badge(img: Rgba, layout: Layout, head: Rgba): void {
  const cx = MASTER * layout.center[0];
  const cy = MASTER * layout.center[1];
  const r = MASTER * layout.radius;
  const ring = Math.max(10, r * 0.045);

  // The head as a layer of its own, enlarged and given its ink outline at the new size so the
  // outline is one source pixel thick.
  const big = upscale(head, layout.scale);
  const k = layout.scale;
  const ex = Math.round(cx + MASTER * layout.eye[0] - (EYE.x - HEAD.x) * k);
  const ey = Math.round(cy + MASTER * layout.eye[1] - (EYE.y - HEAD.y) * k);
  const alphaAt = (x: number, y: number): number => {
    const sx = x - ex;
    const sy = y - ey;
    return sx < 0 || sy < 0 || sx >= big.width || sy >= big.height ? 0 : big.data[(sy * big.width + sx) * 4 + 3]!;
  };
  const colorAt = (x: number, y: number): Color => {
    const i = ((y - ey) * big.width + (x - ex)) * 4;
    return [big.data[i]!, big.data[i + 1]!, big.data[i + 2]!];
  };

  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const shadow = clamp((r + MASTER * 0.012 - Math.hypot(x - cx, y - cy - MASTER * 0.025)) / (MASTER * 0.03));
      put(img, x, y, INK, 0.38 * shadow * (1 - disc(x, y, cx, cy, r)));
      const inside = disc(x, y, cx, cy, r);
      if (inside <= 0) continue;
      // The badge fills with the wordmark's gradient, light at the top left and violet at the
      // bottom right.
      const t = clamp((x - cx + (y - cy)) / (r * 2.4) + 0.5);
      const base = t < 0.55 ? mixColor(BLUSH, PINK, t / 0.55) : mixColor(PINK, VIOLET, (t - 0.55) / 0.45);
      put(img, x, y, base, inside);
      let a = alphaAt(x, y);
      let color: Color | null = a > 0 ? colorAt(x, y) : null;
      if (a === 0) {
        // One enlarged pixel of ink around the sprite, wherever a neighbouring source pixel is
        // drawn.
        let near = false;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const)
          near ||= alphaAt(x + dx * k, y + dy * k) > 0;
        if (near) {
          color = INK;
          a = 255;
        }
      }
      if (color) put(img, x, y, color, (a / 255) * inside);
    }
  }

  // The rim: ink outside, a thin cream highlight just inside it.
  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const outer = disc(x, y, cx, cy, r + ring * 0.2);
      const inner = disc(x, y, cx, cy, r - ring);
      put(img, x, y, INK, clamp(outer - inner));
      const hl = disc(x, y, cx, cy, r - ring) - disc(x, y, cx, cy, r - ring - Math.max(3, ring * 0.3));
      put(img, x, y, CREAM, 0.55 * clamp(hl));
    }
  }
}

function master(layout: Layout, head: Rgba, stars: readonly (readonly [number, number, number, Color])[]): Rgba {
  const img = night();
  sparkles(img, 7, stars);
  badge(img, layout, head);
  return img;
}

/** Shrinks an opaque image by averaging exactly the area each new pixel covers. */
function shrink(src: Rgba, size: number): Rgba {
  if (size === src.width) return src;
  const out = createRgba(size, size);
  const f = src.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0];
      let weight = 0;
      for (let sy = Math.floor(y * f); sy < Math.min(src.height, Math.ceil((y + 1) * f)); sy++) {
        const wy = Math.min(sy + 1, (y + 1) * f) - Math.max(sy, y * f);
        for (let sx = Math.floor(x * f); sx < Math.min(src.width, Math.ceil((x + 1) * f)); sx++) {
          const w = wy * (Math.min(sx + 1, (x + 1) * f) - Math.max(sx, x * f));
          const i = (sy * src.width + sx) * 4;
          sums[0]! += src.data[i]! * w;
          sums[1]! += src.data[i + 1]! * w;
          sums[2]! += src.data[i + 2]! * w;
          weight += w;
        }
      }
      out.data.set(
        [Math.round(sums[0]! / weight), Math.round(sums[1]! / weight), Math.round(sums[2]! / weight), 255],
        (y * size + x) * 4,
      );
    }
  }
  return out;
}

function main(): void {
  const head = wildstarHead();
  const stars: readonly (readonly [number, number, number, Color])[] = [
    [8, 9, 3, CREAM],
    [56, 6, 2, GOLD],
    [4, 38, 2, GOLD],
    [59, 33, 3, CREAM],
    [12, 57, 2, CREAM],
    [53, 58, 2, GOLD],
  ];
  // "Any" icons are shown as drawn. "Maskable" ones are cut to a circle or a rounded square by the
  // phone, so the badge stays inside the middle 80 percent.
  const any = master({ radius: 0.4, scale: 9, center: [0.5, 0.5], eye: [0.045, -0.025] }, head, stars);
  const maskable = master({ radius: 0.34, scale: 8, center: [0.5, 0.5], eye: [0.04, -0.022] }, head, stars);
  const tight = master({ radius: 0.49, scale: 11, center: [0.5, 0.5], eye: [0.05, -0.03] }, head, []);
  const outputs: [string, Rgba][] = [
    ['icon-512.png', shrink(any, 512)],
    ['icon-192.png', shrink(any, 192)],
    ['maskable-512.png', shrink(maskable, 512)],
    ['apple-touch-icon.png', shrink(any, 180)],
    ['favicon-32.png', shrink(tight, 32)],
  ];
  for (const [name, image] of outputs) {
    writePng(join(OUT, name), image);
    console.log(`wrote ${join(OUT, name)} (${image.width}x${image.height})`);
  }
}

main();
