import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/shared/manifest';
import { blit, createRgba, crop, type Rgba } from '../../tools/art/core/image';
import { type PackedAtlas, type PackInput, packAtlas, packPages } from '../../tools/assets/lib/atlas';

/**
 * An opaque block whose every pixel differs from its neighbors, so a picture that lands turned,
 * shifted or swapped is seen.
 */
function block(seed: number, w: number, h: number): Rgba {
  const img = createRgba(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      img.data.set(
        [(seed * 37 + x * 5) & 255, (seed * 11 + y * 9) & 255, (seed + x * y * 3 + 1) & 255, 255],
        (y * w + x) * 4,
      );
    }
  }
  return img;
}

/**
 * A canvas with a block placed in it, as a frame is drawn: the picture is where it is on a larger
 * transparent square.
 */
function placed(seed: number, w: number, h: number, canvas: number, ox: number, oy: number): Rgba {
  const img = createRgba(canvas, canvas);
  blit(img, block(seed, w, h), ox, oy);
  return img;
}

const pixel = (img: Rgba, x: number, y: number): number[] =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const same = (a: Rgba, b: Rgba): boolean =>
  a.width === b.width && a.height === b.height && Buffer.compare(a.data, b.data) === 0;

/** What a sheet holds at a rect. */
const holds = (sheet: PackedAtlas, r: Rect): Rgba => crop(sheet.image, r.x, r.y, r.w, r.h);

/**
 * Two rects with their repeated edges `edge` deep round each, and whether those boxes share any
 * pixel.
 */
const touch = (a: Rect, b: Rect, edge: number): boolean =>
  a.x < b.x + b.w + 2 * edge && b.x < a.x + a.w + 2 * edge && a.y < b.y + b.h + 2 * edge && b.y < a.y + a.h + 2 * edge;

describe('packing pictures into one sheet', () => {
  it('keeps only the visible pixels of a picture and remembers where they sat in its canvas', () => {
    const sheet = packAtlas([{ key: 'a', image: placed(1, 7, 5, 32, 11, 9) }]);
    expect(sheet.rects).toHaveLength(1);
    const r = sheet.rects[0]!;
    expect({ w: r.w, h: r.h, ox: r.ox, oy: r.oy, sw: r.sw, sh: r.sh }).toEqual({
      w: 7,
      h: 5,
      ox: 11,
      oy: 9,
      sw: 32,
      sh: 32,
    });
    expect(same(holds(sheet, r), block(1, 7, 5))).toBe(true);
  });

  it('puts every picture on the sheet exactly as it was drawn', () => {
    const inputs: PackInput[] = Array.from({ length: 40 }, (_, i) => ({
      key: `f${i}`,
      image: placed(i, 6 + (i % 9), 8 + (i % 7), 40, 3 + (i % 5), 2 + (i % 4)),
    }));
    const sheet = packAtlas(inputs);
    for (const [i, input] of inputs.entries()) {
      const r = sheet.rects[sheet.rectOf.get(input.key)!]!;
      expect(same(holds(sheet, r), block(i, 6 + (i % 9), 8 + (i % 7))), `picture ${i}`).toBe(true);
      expect({ ox: r.ox, oy: r.oy }).toEqual({ ox: 3 + (i % 5), oy: 2 + (i % 4) });
    }
  });

  it('lets identical pictures share a rect, and only pictures that are identical where they sit', () => {
    const sheet = packAtlas([
      { key: 'one', image: placed(4, 10, 10, 32, 5, 5) },
      { key: 'again', image: placed(4, 10, 10, 32, 5, 5) },
      { key: 'moved', image: placed(4, 10, 10, 32, 6, 5) },
      { key: 'bigger canvas', image: placed(4, 10, 10, 40, 5, 5) },
      { key: 'other', image: placed(5, 10, 10, 32, 5, 5) },
    ]);
    const of = (key: string): number => sheet.rectOf.get(key)!;
    expect(of('again')).toBe(of('one'));
    expect(new Set([of('one'), of('moved'), of('bigger canvas'), of('other')]).size).toBe(4);
    expect(sheet.rects).toHaveLength(4);
  });

  it('gives a picture with nothing visible a one pixel rect at the corner of its canvas', () => {
    const sheet = packAtlas([
      { key: 'blank', image: createRgba(32, 32) },
      { key: 'real', image: placed(1, 4, 4, 32, 2, 2) },
    ]);
    const r = sheet.rects[sheet.rectOf.get('blank')!]!;
    expect({ w: r.w, h: r.h, ox: r.ox, oy: r.oy, sw: r.sw, sh: r.sh }).toEqual({
      w: 1,
      h: 1,
      ox: 0,
      oy: 0,
      sw: 32,
      sh: 32,
    });
    expect(pixel(sheet.image, r.x, r.y)).toEqual([0, 0, 0, 0]);
  });

  it('repeats the edge pixels of a picture into the gap round it, as deep as it was asked to and no deeper', () => {
    const sheet = packAtlas([{ key: 'a', image: placed(3, 6, 5, 16, 4, 4) }], { padding: 3, extrude: 2 });
    const r = sheet.rects[0]!;
    const inside = (x: number, y: number): number[] => pixel(sheet.image, r.x + x, r.y + y);
    for (let e = 1; e <= 2; e++) {
      for (let i = 0; i < r.w; i++) {
        expect(inside(i, -e)).toEqual(inside(i, 0));
        expect(inside(i, r.h - 1 + e)).toEqual(inside(i, r.h - 1));
      }
      for (let j = 0; j < r.h; j++) {
        expect(inside(-e, j)).toEqual(inside(0, j));
        expect(inside(r.w - 1 + e, j)).toEqual(inside(r.w - 1, j));
      }
    }
    // The third pixel of a gap that is three wide is left clear.
    expect(inside(-3, 2)).toEqual([0, 0, 0, 0]);
    expect(inside(2, -3)).toEqual([0, 0, 0, 0]);
  });

  it('keeps every picture its padding away from the others and from the edge, on a sheet whose size is a multiple of four', () => {
    const inputs: PackInput[] = Array.from({ length: 60 }, (_, i) => ({
      key: `f${i}`,
      image: placed(i, 5 + ((i * 7) % 23), 6 + ((i * 5) % 29), 48, 4, 3),
    }));
    const sheet = packAtlas(inputs, { padding: 2, extrude: 1 });
    expect(sheet.width % 4).toBe(0);
    expect(sheet.height % 4).toBe(0);
    for (const r of sheet.rects) {
      expect(r.x).toBeGreaterThanOrEqual(2);
      expect(r.y).toBeGreaterThanOrEqual(2);
      expect(r.x + r.w + 2).toBeLessThanOrEqual(sheet.width);
      expect(r.y + r.h + 2).toBeLessThanOrEqual(sheet.height);
    }
    for (let i = 0; i < sheet.rects.length; i++)
      for (let j = i + 1; j < sheet.rects.length; j++)
        expect(touch(sheet.rects[i]!, sheet.rects[j]!, 1), `${i} and ${j}`).toBe(false);
  });

  it('is the same sheet every time', () => {
    const inputs: PackInput[] = Array.from({ length: 30 }, (_, i) => ({
      key: `f${i}`,
      image: placed(i % 11, 8 + (i % 6), 9 + (i % 5), 32, 3, 3),
    }));
    const a = packAtlas(inputs);
    const b = packAtlas(inputs);
    expect(b.rects).toEqual(a.rects);
    expect(same(b.image, a.image)).toBe(true);
  });

  it('refuses instead of shrinking a picture, when one is wider than the page or they do not all fit', () => {
    expect(() => packAtlas([{ key: 'wide', image: placed(1, 60, 4, 64, 0, 0) }], { maxSize: 32 })).toThrow('wide');
    const many: PackInput[] = Array.from({ length: 20 }, (_, i) => ({
      key: `f${i}`,
      image: placed(i, 20, 20, 24, 0, 0),
    }));
    expect(() => packAtlas(many, { maxSize: 64 })).toThrow('page limit is 64px');
  });
});

describe('packing pictures to fill the room beside tall ones', () => {
  /**
   * Four tall strips and twelve short blocks, which rows lay with the blocks in rows as tall as the
   * strips.
   */
  const strips: PackInput[] = Array.from({ length: 4 }, (_, i) => ({
    key: `strip${i}`,
    image: placed(i + 1, 10, 120, 128, 0, 0),
  }));
  const blocks: PackInput[] = Array.from({ length: 12 }, (_, i) => ({
    key: `block${i}`,
    image: placed(i + 20, 40, 30, 64, 0, 0),
  }));
  const mixed = [...strips, ...blocks];

  it('makes a smaller sheet than rows when short pictures stand beside tall ones', () => {
    const rows = packAtlas(mixed, { maxSize: 256 });
    const filled = packAtlas(mixed, { maxSize: 256, fit: 'fill' });
    expect(filled.width * filled.height).toBeLessThan(rows.width * rows.height * 0.6);
  });

  it('puts every picture on the sheet exactly as it was drawn, its padding away from the others and from the edge, on a sheet whose size is a multiple of four', () => {
    const sheet = packAtlas(mixed, { maxSize: 256, fit: 'fill', padding: 2, extrude: 1 });
    expect(sheet.width % 4).toBe(0);
    expect(sheet.height % 4).toBe(0);
    for (const [i, input] of mixed.entries()) {
      const r = sheet.rects[sheet.rectOf.get(input.key)!]!;
      const [w, h] = i < 4 ? [10, 120] : [40, 30];
      expect(same(holds(sheet, r), block(i < 4 ? i + 1 : i - 4 + 20, w, h)), `picture ${i}`).toBe(true);
      expect(r.x).toBeGreaterThanOrEqual(2);
      expect(r.y).toBeGreaterThanOrEqual(2);
      expect(r.x + r.w + 2).toBeLessThanOrEqual(sheet.width);
      expect(r.y + r.h + 2).toBeLessThanOrEqual(sheet.height);
    }
    for (let i = 0; i < sheet.rects.length; i++)
      for (let j = i + 1; j < sheet.rects.length; j++)
        expect(touch(sheet.rects[i]!, sheet.rects[j]!, 1), `${i} and ${j}`).toBe(false);
  });

  it('is the same sheet every time', () => {
    const a = packAtlas(mixed, { maxSize: 256, fit: 'fill' });
    const b = packAtlas(mixed, { maxSize: 256, fit: 'fill' });
    expect(b.rects).toEqual(a.rects);
    expect(same(b.image, a.image)).toBe(true);
  });

  it('refuses instead of shrinking a picture, when one is wider than the page or they do not all fit', () => {
    expect(() => packAtlas([{ key: 'wide', image: placed(1, 60, 4, 64, 0, 0) }], { maxSize: 32, fit: 'fill' })).toThrow(
      'wide',
    );
    const many: PackInput[] = Array.from({ length: 20 }, (_, i) => ({
      key: `f${i}`,
      image: placed(i, 20, 20, 24, 0, 0),
    }));
    expect(() => packAtlas(many, { maxSize: 64, fit: 'fill' })).toThrow('page limit is 64px');
  });

  it('keeps the pictures of a group on one page and fills each page with whole units in order, as rows do', () => {
    const grouped = mixed.map((input, i) => ({ ...input, group: `g${Math.floor(i / 4)}` }));
    const { pages, place } = packPages(grouped, { maxSize: 128, fit: 'fill' });
    expect(pages.length).toBeGreaterThan(1);
    for (let g = 0; g < 4; g++)
      expect(new Set([0, 1, 2, 3].map((k) => place.get(grouped[g * 4 + k]!.key)!.page)).size, `group ${g}`).toBe(1);
    const order = grouped.map((input) => place.get(input.key)!.page);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(128);
      expect(page.height).toBeLessThanOrEqual(128);
    }
  });
});

describe('packing pictures into pages', () => {
  /** 20 by 20 blocks on a 64 page: two across and two down, so four to a page. */
  const small = { maxSize: 64, padding: 2, extrude: 1 };
  const pictures = (count: number, group?: (i: number) => string | undefined): PackInput[] =>
    Array.from({ length: count }, (_, i) => {
      const name = group?.(i);
      return { key: `p${i}`, image: placed(i + 1, 20, 20, 24, 2, 2), ...(name === undefined ? {} : { group: name }) };
    });

  it('uses one page, and the sheet packAtlas makes, when everything fits', () => {
    const inputs = pictures(4);
    const { pages, place } = packPages(inputs, small);
    expect(pages).toHaveLength(1);
    const alone = packAtlas(inputs, small);
    expect(pages[0]!.rects).toEqual(alone.rects);
    expect(same(pages[0]!.image, alone.image)).toBe(true);
    expect([...place.values()].every((p) => p.page === 0)).toBe(true);
  });

  it('starts another page when one is full and never makes a page bigger than the limit', () => {
    const { pages } = packPages(pictures(10), small);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(64);
      expect(page.height).toBeLessThanOrEqual(64);
    }
  });

  it('puts every picture where its place says, on a page that holds it exactly as it was drawn', () => {
    const inputs = pictures(10);
    const { pages, place } = packPages(inputs, small);
    expect(place.size).toBe(10);
    for (const [i, input] of inputs.entries()) {
      const at = place.get(input.key)!;
      expect(same(holds(pages[at.page]!, pages[at.page]!.rects[at.rect]!), block(i + 1, 20, 20)), `picture ${i}`).toBe(
        true,
      );
    }
  });

  it('keeps the order of the pictures, so each page holds a run of them', () => {
    const inputs = pictures(14);
    const { place } = packPages(inputs, small);
    const pagesInOrder = inputs.map((i) => place.get(i.key)!.page);
    expect(pagesInOrder).toEqual([...pagesInOrder].sort((a, b) => a - b));
  });

  it('keeps the pictures of a group on one page, whatever the size of the group, which a plain fill would not', () => {
    // Four fit a page. Groups of three leave a place for one more, and a plain fill would put it
    // there.
    const threes = pictures(15, (i) => `g${Math.floor(i / 3)}`);
    const plain = packPages(pictures(15), small);
    expect(plain.pages.length).toBe(4);
    const grouped = packPages(threes, small);
    for (let g = 0; g < 5; g++) {
      const mine = new Set([0, 1, 2].map((k) => grouped.place.get(`p${g * 3 + k}`)!.page));
      expect(mine.size, `group ${g}`).toBe(1);
    }
    expect(grouped.pages).toHaveLength(5);
    // A group that fills a page exactly stays whole too, with two before it and two after.
    const fours = packPages(
      pictures(8, (i) => (i < 2 ? 'a' : i < 6 ? 'b' : 'c')),
      small,
    );
    const pagesOfB = new Set([2, 3, 4, 5].map((i) => fours.place.get(`p${i}`)!.page));
    expect(pagesOfB.size).toBe(1);
  });

  it('fills pages with pictures that have no group one picture at a time', () => {
    const { place } = packPages(pictures(6), small);
    expect([0, 1, 2, 3, 4, 5].map((i) => place.get(`p${i}`)!.page)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('counts a group as a run of neighbours, so a name that comes back later is not the same group', () => {
    const { place } = packPages(
      pictures(6, (i) => (i % 2 === 0 ? 'even' : 'odd')),
      small,
    );
    expect([0, 1, 2, 3, 4, 5].map((i) => place.get(`p${i}`)!.page)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('refuses a group that cannot fit one page, which would otherwise be split silently', () => {
    expect(() =>
      packPages(
        pictures(5, () => 'too many'),
        small,
      ),
    ).toThrow('page limit is 64px');
  });

  it('gives the same pages every time', () => {
    const inputs = pictures(13, (i) => `g${Math.floor(i / 3)}`);
    const a = packPages(inputs, small);
    const b = packPages(inputs, small);
    expect(b.pages.map((p) => p.rects)).toEqual(a.pages.map((p) => p.rects));
    expect(b.pages.every((p, i) => same(p.image, a.pages[i]!.image))).toBe(true);
    expect([...b.place]).toEqual([...a.place]);
  });
});
