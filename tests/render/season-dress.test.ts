import { describe, expect, it } from 'vitest';
import {
  type Cell,
  cellsOfPage,
  dressCells,
  dressTiles,
  outOfSeason,
  type Pixels,
  roleOf,
} from '../../src/render/season';
import { luma, toHsv } from '../../src/render/season/color';
import type { Bundle } from '../../src/shared/manifest';
import { SEASON_IDS, type SeasonId } from '../../src/shared/seasons';

type Rgba = readonly [number, number, number, number];

const GRASS: Rgba = [60, 160, 60, 255];
const PATH: Rgba = [180, 130, 80, 255];
const WATER: Rgba = [50, 140, 190, 255];
const OUTLINE: Rgba = [20, 24, 20, 255];
const AIR: Rgba = [0, 0, 0, 0];

/** A page made of the colours given, one row of them, each 8 pixels wide and 8 tall. */
function swatches(...colours: Rgba[]): Pixels {
  const width = colours.length * 8;
  const data = new Uint8Array(width * 8 * 4);
  colours.forEach((c, i) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data.set(c, (y * width + i * 8 + x) * 4);
  });
  return { width, height: 8, data };
}

const at = (px: Pixels, i: number): Rgba => {
  // The middle of the swatch, away from the edges that a cap of snow or a speck would reach.
  const p = (4 * px.width + i * 8 + 4) * 4;
  return [px.data[p]!, px.data[p + 1]!, px.data[p + 2]!, px.data[p + 3]!] as const;
};
const copy = (px: Pixels): Pixels => ({ width: px.width, height: px.height, data: new Uint8Array(px.data) });
const hsvOf = ([r, g, b]: Rgba): { h: number; s: number; v: number } => {
  const out = { h: 0, s: 0, v: 0 };
  toHsv(r, g, b, out);
  return out;
};

describe('the ground in the seasons', () => {
  const ground = (): Pixels => swatches(GRASS, PATH, WATER, OUTLINE, AIR);

  it('is the ground as it was drawn in summer', () => {
    const px = ground();
    const before = copy(px);
    dressTiles(px, 'summer');
    expect(px.data).toEqual(before.data);
  });

  it('keeps the alpha of every pixel, and the air and the dark outlines, in every season', () => {
    for (const season of SEASON_IDS) {
      const px = ground();
      dressTiles(px, season);
      const was = ground();
      for (let p = 3; p < px.data.length; p += 4) expect(px.data[p], `${season} alpha at ${p}`).toBe(was.data[p]);
      expect(at(px, 3), `${season} outline`).toEqual(OUTLINE);
      expect(at(px, 4), `${season} air`).toEqual(AIR);
    }
  });

  it('puts snow on the grass in winter, a trodden grey on the path and ice on the water', () => {
    const px = ground();
    dressTiles(px, 'winter');
    const [gr, gg, gb] = at(px, 0);
    expect(Math.min(gr, gg, gb), 'snow is light').toBeGreaterThan(110);
    expect(luma(gr, gg, gb), 'snow is as light as a cloud').toBeGreaterThan(0.6);
    expect(gb, 'snow is a little blue').toBeGreaterThanOrEqual(gr);
    const [pr, , pb] = at(px, 1);
    expect(pb, 'a trodden path is cool grey').toBeGreaterThan(pr);
    const path = hsvOf(at(px, 1));
    expect(path.s, 'a path has lost its brown').toBeLessThan(0.3);
    const ice = hsvOf(at(px, 2));
    expect(ice.h, 'ice is blue').toBeGreaterThan(180);
    expect(ice.h).toBeLessThan(230);
    expect(ice.s, 'ice is paler than the water').toBeLessThan(hsvOf(WATER).s);
  });

  it('turns the grass to a dry gold-green in autumn, and the water a little greyer and darker', () => {
    const px = ground();
    dressTiles(px, 'autumn');
    const grass = hsvOf(at(px, 0));
    expect(grass.h, 'yellow-green').toBeGreaterThan(40);
    expect(grass.h).toBeLessThan(80);
    expect(at(px, 1), 'the path is as it was').toEqual(PATH);
    const water = hsvOf(at(px, 2));
    expect(water.v).toBeLessThan(hsvOf(WATER).v);
    expect(water.s).toBeLessThan(hsvOf(WATER).s);
  });

  it('freshens the grass in spring and leaves the path and the water', () => {
    const px = ground();
    dressTiles(px, 'spring');
    const [, g] = at(px, 0);
    expect(g).toBeGreaterThan(150);
    expect(at(px, 1)).toEqual(PATH);
    expect(at(px, 2)).toEqual(WATER);
  });

  it('comes out the same every time', () => {
    for (const season of SEASON_IDS) {
      const a = swatches(GRASS, PATH, WATER);
      const b = swatches(GRASS, PATH, WATER);
      dressTiles(a, season);
      dressTiles(b, season);
      expect(a.data).toEqual(b.data);
    }
  });
});

/**
 * A tree on a page of 60 by 80: a round crown of green, lighter at the top, and a brown trunk
 * below.
 */
function tree(): { px: Pixels; cell: Cell } {
  const width = 60;
  const height = 80;
  const data = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, c: Rgba): void => void data.set(c, (y * width + x) * 4);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.hypot(x - 30, y - 26) > 25) continue;
      const light = 1 - y / 60;
      put(x, y, [Math.round(30 + 60 * light), Math.round(90 + 100 * light), Math.round(30 + 50 * light), 255]);
    }
  }
  for (let y = 50; y < 80; y++) for (let x = 26; x < 34; x++) put(x, y, [110, 72, 46, 255]);
  return { px: { width, height, data }, cell: { x: 0, y: 0, w: width, h: height, role: 'tree' } };
}
const pixel = (px: Pixels, x: number, y: number): Rgba => {
  const p = (y * px.width + x) * 4;
  return [px.data[p]!, px.data[p + 1]!, px.data[p + 2]!, px.data[p + 3]!] as const;
};

describe('the scenery in the seasons', () => {
  it('is as it was drawn in summer', () => {
    const { px, cell } = tree();
    const before = copy(px);
    dressCells(px, [cell], 'summer');
    expect(px.data).toEqual(before.data);
  });

  it('keeps the alpha of every pixel, and what is outside every picture, in every season', () => {
    for (const season of SEASON_IDS) {
      const { px, cell } = tree();
      const before = copy(px);
      dressCells(px, [{ ...cell, h: 70 }], season);
      for (let p = 3; p < px.data.length; p += 4) expect(px.data[p], `${season} alpha at ${p}`).toBe(before.data[p]);
      for (let y = 70; y < 80; y++)
        for (let x = 0; x < 60; x++)
          expect(pixel(px, x, y), `${season} outside at ${x},${y}`).toEqual(pixel(before, x, y));
    }
  });

  it('covers the crown of a tree with snow in winter, with its shade still dark, and leaves the trunk brown', () => {
    const { px, cell } = tree();
    dressCells(px, [cell], 'winter');
    const [tr, tg, tb] = pixel(px, 30, 3);
    expect(luma(tr, tg, tb), 'the top of the crown is white').toBeGreaterThan(0.85);
    const [sr, sg, sb] = pixel(px, 30, 48);
    expect(luma(sr, sg, sb), 'the underside is darker').toBeLessThan(0.5);
    expect(sb, 'and it is a cold green').toBeGreaterThan(sr);
    expect(pixel(px, 30, 70), 'the trunk below the snow is not touched').toEqual([110, 72, 46, 255]);
  });

  it('turns a tree to reds, oranges and golds in autumn and leaves its trunk, and leaves a conifer green', () => {
    const { px, cell } = tree();
    dressCells(px, [cell], 'autumn');
    for (const [x, y] of [
      [30, 20],
      [14, 26],
      [46, 30],
      [30, 40],
    ] as const) {
      const { h } = hsvOf(pixel(px, x, y));
      expect(h < 70 || h > 340, `warm hue ${h.toFixed(0)} at ${x},${y}`).toBe(true);
    }
    expect(pixel(px, 30, 70)).toEqual([110, 72, 46, 255]);
    const pine = tree();
    dressCells(pine.px, [{ ...pine.cell, role: 'conifer' }], 'autumn');
    expect(pine.px.data).toEqual(tree().px.data);
  });

  it('makes a tree fresh green or pink with blossom in spring, and leaves its trunk', () => {
    const { px, cell } = tree();
    dressCells(px, [cell], 'spring');
    expect(px.data).not.toEqual(tree().px.data);
    const { h } = hsvOf(pixel(px, 30, 20));
    expect((h >= 70 && h <= 170) || h >= 290 || h <= 20, `fresh green or blossom, hue ${h.toFixed(0)}`).toBe(true);
    expect(pixel(px, 30, 70)).toEqual([110, 72, 46, 255]);
  });

  it('lays a cap of snow on the top of something plain in winter, and not over a light that glows', () => {
    const width = 20;
    const height = 30;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([180, 40, 40, 255], (y * width + x) * 4);
    data.set([255, 200, 60, 255], (0 * width + 5) * 4);
    const px = { width, height, data };
    dressCells(px, [{ x: 0, y: 0, w: width, h: height, role: 'prop' }], 'winter');
    const [r, g, b] = pixel(px, 12, 0);
    expect(luma(r, g, b), 'white on top').toBeGreaterThan(0.9);
    expect(pixel(px, 12, 25), 'and nothing lower down').toEqual([180, 40, 40, 255]);
    expect(pixel(px, 5, 0), 'a flame is not buried').toEqual([255, 200, 60, 255]);
  });

  it('puts snow on a tall thing only as deep as the thing is wide and tall allow, and never past what is there', () => {
    const width = 6;
    const height = 3;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([90, 60, 120, 255], (y * width + x) * 4);
    const px = { width, height, data };
    dressCells(px, [{ x: 0, y: 0, w: width, h: height, role: 'rock' }], 'winter');
    for (let p = 3; p < data.length; p += 4) expect(data[p]).toBe(255);
  });

  it('takes the blue out of the sky in winter and leaves things the weather does not touch', () => {
    const sky = swatches([110, 170, 240, 255]);
    const cloud = swatches([250, 250, 250, 255]);
    const before = copy(sky);
    dressCells(sky, [{ x: 0, y: 0, w: 8, h: 8, role: 'sky' }], 'winter');
    expect(sky.data).not.toEqual(before.data);
    const [r, , b] = pixel(sky, 4, 4);
    expect(b - r, 'a grey sky has less blue').toBeLessThan(240 - 110);
    const kept = copy(cloud);
    dressCells(cloud, [{ x: 0, y: 0, w: 8, h: 8, role: 'skip' }], 'winter');
    expect(cloud.data).toEqual(kept.data);
    const summer = copy(before);
    dressCells(summer, [{ x: 0, y: 0, w: 8, h: 8, role: 'sky' }], 'autumn');
    expect(summer.data).toEqual(before.data);
  });

  it('puts snow on the roof of a house where the roof is coloured and the wall is stone', () => {
    const width = 30;
    const height = 40;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        data.set(y < 12 ? [220, 90, 140, 255] : [200, 190, 180, 255], (y * width + x) * 4);
    const px = { width, height, data };
    dressCells(px, [{ x: 0, y: 0, w: width, h: height, role: 'building' }], 'winter');
    const [r, g, b] = pixel(px, 15, 8);
    expect(luma(r, g, b), 'the roof is white').toBeGreaterThan(0.8);
    expect(pixel(px, 15, 30), 'the wall is as it was').toEqual([200, 190, 180, 255]);
  });
});

describe('what a sprite is, by its name', () => {
  const cases: [string, ReturnType<typeof roleOf>][] = [
    ['tree-oak-lime-1', 'tree'],
    ['g-tree-apple-1', 'tree'],
    ['pg-tree-willow-emerald-1', 'tree'],
    ['mn-twisty-tree', 'tree'],
    ['tree-fir-spruce-2', 'conifer'],
    ['tree-blossom-1', 'blossom'],
    ['g-tree-blossom-2', 'blossom'],
    ['flowers-pink-1', 'flower'],
    ['g-windflower-lilac-2', 'flower'],
    ['lily-1', 'flower'],
    ['mushrooms-rose', 'prop'],
    ['g-bush-lime-1', 'plant'],
    ['tuft-3', 'plant'],
    ['hedge-h-128', 'plant'],
    ['g-bed-carrot', 'plant'],
    ['rock-grey-2', 'rock'],
    ['pebbles-1', 'rock'],
    ['manor-house', 'manor'],
    ['palace-wing-left', 'building'],
    ['stable-house', 'building'],
    ['treasure-house', 'building'],
    ['hills-far-1', 'distant'],
    ['pg-hills-near-0', 'distant'],
    ['sky-strip', 'sky'],
    ['pg-sky-strip', 'sky'],
    ['cloud-3', 'skip'],
    ['rainbow', 'skip'],
    ['fountain-jet', 'skip'],
    ['fountain-rainbow-inner-3-left', 'skip'],
    ['pg-balloons-warm', 'skip'],
    ['brazier-lit', 'skip'],
    ['mn-fence', 'prop'],
    ['door-stable', 'prop'],
    ['g-piano', 'prop'],
    ['pg-morph-apple-gem', 'prop'],
    ['palace-banner', 'prop'],
  ];
  for (const [name, role] of cases) it(`calls ${name} a ${role}`, () => expect(roleOf(name)).toBe(role));

  it('leaves the blooms and the lily pads out in winter, and nothing else out at any time', () => {
    expect(outOfSeason('winter', 'flowers-pink-1')).toBe(true);
    expect(outOfSeason('winter', 'lily-2')).toBe(true);
    expect(outOfSeason('winter', 'tree-oak-lime-1')).toBe(false);
    expect(outOfSeason('winter', 'rock-grey-1')).toBe(false);
    for (const season of ['spring', 'summer', 'autumn'] as SeasonId[])
      expect(outOfSeason(season, 'flowers-pink-1')).toBe(false);
  });
});

describe('the pictures on a page', () => {
  it('are the rects of the page, each with the role of the sprite that is drawn from it', () => {
    const rect = (x: number) => ({ x, y: 0, w: 10, h: 10, ox: 0, oy: 0, sw: 10, sh: 10 });
    const bundle: Bundle = {
      pages: [
        { file: 'a.png', width: 100, height: 20, rects: [rect(0), rect(20), rect(40), rect(60)] },
        { file: 'b.png', width: 100, height: 20, rects: [rect(0)] },
      ],
      sprites: {
        'tree-oak-lime-1': {
          origin: [0, 0] as [number, number],
          loop: false,
          frames: [{ page: 0, rect: 0, ms: 1000 }],
        },
        'tuft-1': {
          origin: [0, 0] as [number, number],
          loop: false,
          frames: [
            { page: 0, rect: 1, ms: 1000 },
            { page: 0, rect: 2, ms: 1000 },
          ],
        },
        // Two names for one picture: the particular one wins over a plain prop.
        lamp: { origin: [0, 0] as [number, number], loop: false, frames: [{ page: 0, rect: 1, ms: 1000 }] },
        'rock-grey-1': { origin: [0, 0] as [number, number], loop: false, frames: [{ page: 1, rect: 0, ms: 1000 }] },
      },
    };
    expect(cellsOfPage(bundle, 0).map((c) => c.role)).toEqual(['tree', 'plant', 'plant', 'prop']);
    expect(cellsOfPage(bundle, 0)[1]).toEqual({ x: 20, y: 0, w: 10, h: 10, role: 'plant' });
    expect(cellsOfPage(bundle, 1).map((c) => c.role)).toEqual(['rock']);
    expect(() => cellsOfPage(bundle, 2)).toThrow();
  });
});
