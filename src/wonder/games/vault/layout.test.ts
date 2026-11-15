import { describe, expect, it } from 'vitest';
import { chrome } from '../../engine/chrome';
import { SHORT_SIDE } from '../../engine/painter';
import { baysOf, planOf, standsOf } from './layout';

/** The shapes of screen a child holds the game in, as the view the engine makes of them. */
const VIEWS = [
  { w: 640, h: SHORT_SIDE, unit: 1.08, name: 'a phone held sideways' },
  { w: 863, h: SHORT_SIDE, unit: 2.1, name: 'a wide tablet' },
  { w: 560, h: SHORT_SIDE, unit: 1, name: 'the narrowest sideways' },
  { w: SHORT_SIDE, h: 640, unit: 1.08, name: 'a phone upright' },
  { w: SHORT_SIDE, h: 480, unit: 1, name: 'the shortest upright' },
  { w: SHORT_SIDE, h: 780, unit: 1.5, name: 'the tallest upright' },
];

describe('where everything is in the vault', () => {
  for (const view of VIEWS) {
    const plan = planOf(view.w, view.h, view.unit);
    it(`keeps the chest and the clock on the screen, ${view.name}`, () => {
      const { chest, centre } = plan;
      for (const c of [chest, centre]) {
        expect(c.x - c.w / 2).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w / 2).toBeLessThanOrEqual(view.w);
        expect(c.rim + c.front).toBeLessThanOrEqual(view.h);
        expect(c.rim - c.back - c.lid, 'the lid is under the sky and the stars').toBeGreaterThan(plan.sky);
      }
      expect(plan.clock.x - plan.clock.r).toBeGreaterThanOrEqual(0);
      expect(plan.clock.y - plan.clock.r).toBeGreaterThanOrEqual(0);
    });

    it(`keeps the clock out from under the buttons, ${view.name}`, () => {
      const c = plan.clock;
      const buttons = chrome({ w: view.w, h: view.h, unit: view.unit });
      for (const r of buttons) {
        const inside = c.x + c.r > r.x0 && c.x - c.r < r.x1 && c.y + c.r > r.y0 && c.y - c.r < r.y1;
        expect(inside, `the clock is under a button at ${JSON.stringify(r)}`).toBe(false);
      }
    });

    it(`has three heaps side by side inside the chest, ${view.name}`, () => {
      const bays = baysOf(plan.chest);
      expect(bays).toHaveLength(3);
      expect(bays[0]!.x).toBeLessThan(bays[1]!.x);
      expect(bays[1]!.x).toBeLessThan(bays[2]!.x);
      expect(bays[0]!.x - bays[0]!.half).toBeGreaterThan(plan.chest.x - plan.chest.w / 2);
      expect(bays[2]!.x + bays[2]!.half).toBeLessThan(plan.chest.x + plan.chest.w / 2);
    });

    it(`stands the friends on the floor and on the screen, ${view.name}`, () => {
      for (const n of [1, 3, 6]) {
        const stands = standsOf(n, plan);
        expect(stands).toHaveLength(n);
        for (const s of stands) {
          expect(s.x).toBeGreaterThan(0);
          expect(s.x).toBeLessThan(view.w);
          expect(s.y).toBeLessThanOrEqual(view.h);
        }
      }
    });
  }

  it('keeps the friends from standing in the chest when it is held sideways', () => {
    for (const view of VIEWS.filter((v) => v.w > v.h)) {
      const plan = planOf(view.w, view.h, view.unit);
      const last = standsOf(6, plan).at(-1)!;
      expect(last.x + 20, view.name).toBeLessThan(plan.chest.x - plan.chest.w / 2);
    }
  });
});
