import { describe, expect, it } from 'vitest';
import { chromeOf, type Rect } from '../../src/wonder/engine/chrome';
import { viewOf } from '../../src/wonder/engine/painter';
import { nearestFree, ORNAMENTS, planOf, slotAt, TRAY_RADIUS } from '../../src/wonder/games/tree/layout';
import { CROWN, HOOKS, halfWidthAt, LIGHTS, TIERS, TREE_HEIGHT } from '../../src/wonder/games/tree/shape';

/** The screens a child plays on, in CSS pixels, held both ways. */
const SCREENS: readonly (readonly [number, number])[] = [
  [390, 844],
  [360, 640],
  [320, 568],
  [412, 915],
  [768, 1024],
  [844, 390],
  [667, 375],
  [568, 320],
  [640, 360],
  [740, 360],
  [1024, 768],
  [1366, 1024],
  [1920, 1080],
];

const hits = (r: Rect, x: number, y: number, pad = 0): boolean =>
  x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;

describe('the shape of the Christmas tree', () => {
  it('keeps every hook and every light inside the tree, and clear of one another', () => {
    for (const [name, spots] of [
      ['hook', HOOKS],
      ['light', LIGHTS],
    ] as const) {
      for (const s of spots) {
        expect(s.y, `${name} at ${s.x},${s.y} is below the tip`).toBeGreaterThan(0);
        expect(s.y, `${name} at ${s.x},${s.y} is above the foot of the lowest bough`).toBeLessThan(
          TIERS.at(-1)!.bottom - 6,
        );
        // An ornament hangs on the foliage and not in the air beside it.
        expect(Math.abs(s.x), `${name} at ${s.x},${s.y} is in from the edge`).toBeLessThanOrEqual(
          halfWidthAt(s.y) - (name === 'hook' ? 4 : 1.5),
        );
      }
      for (let i = 0; i < spots.length; i++)
        for (let j = i + 1; j < spots.length; j++)
          expect(
            Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y),
            `${name} ${i} and ${j} are apart`,
          ).toBeGreaterThanOrEqual(name === 'hook' ? 7 : 5);
    }
  });

  it('has more hooks than it takes to fill the five stars, and more lights than the stars light', () => {
    expect(HOOKS.length).toBeGreaterThanOrEqual(22);
    expect(LIGHTS.length).toBe(20);
  });

  it('is widest at its lowest bough, and its tiers climb', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i]!.apex).toBeGreaterThan(TIERS[i - 1]!.apex);
      expect(TIERS[i]!.half).toBeGreaterThan(TIERS[i - 1]!.half);
    }
    expect(TREE_HEIGHT).toBeGreaterThan(TIERS.at(-1)!.bottom);
  });
});

describe('where the tree, its tray and its presents are on each screen', () => {
  for (const [width, height] of SCREENS) {
    const view = viewOf(width, height);
    const plan = planOf(view.w, view.h, view.unit);
    const over = chromeOf({ w: view.w, h: view.h, unit: view.unit });
    const where = `${width}x${height}`;

    it(`keeps the tray whole on the screen and clear of the buttons on ${where}`, () => {
      expect(plan.tray).toHaveLength(ORNAMENTS.length);
      for (const at of plan.tray) {
        expect(at.x - TRAY_RADIUS, 'left edge').toBeGreaterThanOrEqual(0);
        expect(at.x + TRAY_RADIUS, 'right edge').toBeLessThanOrEqual(view.w);
        expect(at.y + TRAY_RADIUS, 'bottom edge').toBeLessThanOrEqual(view.h);
        expect(at.y - TRAY_RADIUS, 'top edge').toBeGreaterThanOrEqual(0);
        for (const [rect, name] of [
          [over.finish, 'the buttons at the end'],
          [over.wayOut, 'the way out'],
          [over.corner, 'the corner'],
          [over.meter, 'the stars'],
        ] as const) {
          expect(hits(rect, at.x, at.y, TRAY_RADIUS * 0.8), `a place in the tray is under ${name}`).toBe(false);
        }
      }
      for (let i = 0; i < plan.tray.length; i++)
        for (let j = i + 1; j < plan.tray.length; j++) {
          const a = plan.tray[i]!;
          const b = plan.tray[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `places ${i} and ${j} are apart`).toBeGreaterThanOrEqual(
            TRAY_RADIUS * 2,
          );
        }
    });

    it(`stands the whole tree clear of the tray, under the stars and inside the screen on ${where}`, () => {
      const { tree, shelf } = plan;
      const half = (TIERS.at(-1)!.half + 2) * tree.scale;
      const box = { x0: tree.x - half, x1: tree.x + half, y0: tree.top - CROWN * tree.scale, y1: tree.foot };
      const apart =
        box.x1 <= shelf.x || box.x0 >= shelf.x + shelf.w || box.y1 <= shelf.y || box.y0 >= shelf.y + shelf.h;
      expect(apart, 'the tree and the tray are not on top of each other').toBe(true);
      expect(plan.star.y - plan.starSize / 2, 'the star on top is under the row of stars').toBeGreaterThanOrEqual(
        over.meter.y1,
      );
      expect(box.y0, 'room for the star').toBeGreaterThanOrEqual(over.meter.y1);
      expect(box.x0, 'left of the tree').toBeGreaterThanOrEqual(0);
      expect(box.x1, 'right of the tree').toBeLessThanOrEqual(view.w);
      expect(tree.foot, 'the foot of the tree is on the screen').toBeLessThanOrEqual(view.h);
      expect(tree.scale, 'a tree big enough to dress').toBeGreaterThanOrEqual(1);
    });

    it(`shows ornaments in sizes a finger can find on ${where}`, () => {
      expect(plan.sizes).toHaveLength(HOOKS.length);
      for (const size of plan.sizes) {
        expect(size).toBeGreaterThanOrEqual(0.4);
        expect(size).toBeLessThanOrEqual(1.1);
      }
      // The lower on the tree, the bigger.
      expect(plan.sizes.at(-1)!).toBeGreaterThan(plan.sizes[0]!);
    });

    it(`puts every hook and every light in sight and out from under the buttons on ${where}`, () => {
      for (const at of [...plan.hooks, ...plan.lights]) {
        expect(at.x).toBeGreaterThan(0);
        expect(at.x).toBeLessThan(view.w);
        expect(at.y).toBeGreaterThan(0);
        expect(at.y).toBeLessThan(view.h);
        for (const rect of [over.wayOut, over.corner, over.meter, over.finish])
          expect(hits(rect, at.x, at.y), `a hook at ${at.x | 0},${at.y | 0} is under a button`).toBe(false);
      }
    });

    it(`keeps the presents on the snow, in sight and clear of the buttons on ${where}`, () => {
      expect(plan.gifts).toHaveLength(4);
      for (const at of plan.gifts) {
        expect(at.x).toBeGreaterThan(20);
        expect(at.x).toBeLessThan(view.w - 20);
        expect(at.y).toBeLessThan(view.h);
        expect(hits(over.finish, at.x, at.y - 20), 'a present is under the buttons at the end').toBe(false);
      }
    });
  }
});

describe('finding where an ornament hangs', () => {
  const hooks = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ];

  it('picks the free hook nearest to the point', () => {
    expect(nearestFree(hooks, new Set(), 90, 5, 80)).toBe(1);
    expect(nearestFree(hooks, new Set(), 190, -5, 80)).toBe(2);
  });

  it('passes over a hook that has an ornament and takes the next nearest', () => {
    expect(nearestFree(hooks, new Set([1]), 90, 5, 120)).toBe(0);
  });

  it('is null when nothing free is within reach, and when nothing is free at all', () => {
    expect(nearestFree(hooks, new Set(), 100, 300, 80)).toBeNull();
    expect(nearestFree(hooks, new Set([0, 1, 2]), 100, 0, Infinity)).toBeNull();
  });

  it('finds the place of the tray a point is on, and none when it is between them', () => {
    const tray = [
      { x: 50, y: 300 },
      { x: 110, y: 300 },
    ];
    expect(slotAt(tray, 52, 296)).toBe(0);
    expect(slotAt(tray, 118, 310)).toBe(1);
    expect(slotAt(tray, 80, 200)).toBeNull();
  });
});
