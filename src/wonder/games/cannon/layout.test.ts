import { describe, expect, it } from 'vitest';
import { chrome } from '../../engine/chrome';
import { viewOf } from '../../engine/painter';
import { CONSTELLATIONS } from './constellations';
import { hung, openSky, placePicture, plan, SMALLEST } from './layout';

/** The screens the game is for, as the page gives them: CSS pixels wide and high. */
const SCREENS = {
  'a phone held sideways': [863, 360],
  'an iPhone held sideways': [852, 393],
  'a phone held upright': [360, 780],
  'a tall phone held upright': [390, 844],
  'a laptop': [1280, 720],
  'a Fire HD 10 held sideways': [1280, 800],
  'a tablet held upright': [768, 1024],
  'a small window': [640, 360],
} as const;

describe.each(Object.entries(SCREENS))('on %s', (_name, [cssW, cssH]) => {
  const view = viewOf(cssW, cssH);

  describe.each(Object.values(CONSTELLATIONS))('the $name', (c) => {
    const where = plan(view, c);
    const at = hung(c, where.picture).spots;

    it('fits with room to spare, and keeps every star, and the cap it sleeps in, clear of what the page draws over the game', () => {
      expect(where.picture.clear).toBe(true);
      const r = where.picture.r;
      for (const a of chrome(view)) {
        for (const p of at) {
          const overlaps = p.x + r > a.x0 && p.x - r < a.x1 && p.y + r > a.y0 && p.y - r * 1.7 < a.y1;
          expect(overlaps).toBe(false);
        }
      }
    });

    it('keeps every star on the screen and above the ground', () => {
      for (const p of at) {
        expect(p.x - where.picture.r).toBeGreaterThanOrEqual(0);
        expect(p.x + where.picture.r).toBeLessThanOrEqual(view.w);
        expect(p.y - where.picture.r * 1.7).toBeGreaterThanOrEqual(0);
        expect(p.y + where.picture.r).toBeLessThan(where.feet - 60);
      }
    });

    it('is big enough to see a face on a star, with every star clear of the next', () => {
      expect(where.picture.width).toBeGreaterThanOrEqual(SMALLEST);
      expect(where.picture.r).toBeCloseTo(where.picture.width * c.starShare, 9);
      let closest = Infinity;
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++)
          closest = Math.min(closest, Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y));
      }
      expect(closest).toBeGreaterThan(where.picture.r * 2);
    });

    it('has open sky for the great burst of the finale, which keeps off the picture and inside the screen', () => {
      const horizon = where.feet - 66;
      const open = openSky(view, where.picture, c.aspect, horizon);
      const sheet = {
        x0: where.picture.x,
        y0: where.picture.y,
        x1: where.picture.x + where.picture.width,
        y1: where.picture.y + where.picture.width * c.aspect,
      };
      const apart = Math.hypot(
        Math.max(sheet.x0 - open.x, 0, open.x - sheet.x1),
        Math.max(sheet.y0 - open.y, 0, open.y - sheet.y1),
      );
      expect(open.r).toBeGreaterThan(0);
      expect(apart).toBeGreaterThanOrEqual(open.r - 1e-6);
      expect(open.x - open.r).toBeGreaterThanOrEqual(0);
      expect(open.x + open.r).toBeLessThanOrEqual(view.w);
      expect(open.y - open.r).toBeGreaterThanOrEqual(0);
      expect(open.y + open.r).toBeLessThanOrEqual(horizon + 1e-6);
    });
  });
});

describe('the size of the picture', () => {
  it('is bigger on the screen with more room, and the biggest it can be on each', () => {
    const size = (w: number, h: number, name: string): number =>
      plan(viewOf(w, h), CONSTELLATIONS[name]!).picture.width;
    // A Fire tablet and a phone held sideways have the room for a unicorn most of the way up the
    // screen.
    expect(size(1280, 800, 'star')).toBeGreaterThan(300);
    expect(size(863, 360, 'star')).toBeGreaterThan(300);
    expect(size(1280, 800, 'heart')).toBeGreaterThan(220);
    expect(size(863, 360, 'heart')).toBeGreaterThan(200);
  });

  it('hangs a unicorn as her mirror image when that makes her bigger, and never a heart', () => {
    const phone = viewOf(863, 360);
    expect(plan(phone, CONSTELLATIONS.star!).picture.flipped).toBe(true);
    expect(plan(phone, CONSTELLATIONS.heart!).picture.flipped).toBe(false);
  });

  it('falls back to the smallest size in the middle when nothing is clear, and says so', () => {
    const room = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const placed = placePicture(CONSTELLATIONS.star!, room, [{ x0: -10, y0: -10, x1: 410, y1: 310 }]);
    expect(placed.clear).toBe(false);
    expect(placed.width).toBe(SMALLEST);
  });
});
