import { describe, expect, it } from 'vitest';
import { chromeOf } from '../../engine/chrome';
import { GREAT, JET_COUNT, jetAt, planOf, standsOf } from './layout';

/**
 * The shapes of screen a game is played on: a phone held wide, a tablet, a phone held upright, a
 * short one and a tall one.
 */
const SCREENS = [
  { name: 'phone wide', w: 863, h: 360, unit: 1 },
  { name: 'narrow phone wide', w: 640, h: 360, unit: 1 },
  { name: 'tablet', w: 576, h: 360, unit: 2.2 },
  { name: 'upright phone', w: 360, h: 780, unit: 1 },
  { name: 'short upright', w: 360, h: 560, unit: 1 },
  { name: 'upright tablet', w: 360, h: 600, unit: 2.2 },
] as const;

describe('where everything is in the moonlit square', () => {
  for (const s of SCREENS) {
    describe(s.name, () => {
      const plan = planOf(s.w, s.h, s.unit);
      const over = chromeOf({ w: s.w, h: s.h, unit: s.unit });

      it('has seven jets in a row from the left to the right, in the screen and not under the page', () => {
        expect(plan.jets).toHaveLength(JET_COUNT);
        plan.jets.forEach((j, i) => {
          expect(j.x - j.rx, `jet ${i} left`).toBeGreaterThan(0);
          expect(j.x + j.rx, `jet ${i} right`).toBeLessThan(s.w);
          expect(j.y + j.ry, `jet ${i} bottom`).toBeLessThan(s.h);
          if (i > 0)
            expect(j.x - plan.jets[i - 1]!.x, `jet ${i} is a spacing from the one before`).toBeCloseTo(plan.spacing, 5);
          for (const [name, r] of [
            ['the way out', over.wayOut],
            ['the stars', over.meter],
            ['the buttons', over.corner],
          ] as const) {
            const inside = j.x > r.x0 && j.x < r.x1 && j.y > r.y0 && j.y < r.y1;
            expect(inside, `jet ${i} is not under ${name}`).toBe(false);
          }
        });
        // The finish buttons only come at the end, and the ring keeps the pools they would cover
        // out of the way as far as it can.
        const covered = plan.jets.filter((j) => j.x + j.rx > over.finish.x0 && j.y + j.ry > over.finish.y0);
        expect(
          covered.length,
          'at most the end of the ring is under the buttons that come at the end',
        ).toBeLessThanOrEqual(1);
      });

      it('stands the great fountain behind the middle of the ring, under the stars and clear of the top', () => {
        expect(plan.fountain.x).toBeCloseTo(s.w / 2, 5);
        expect(plan.fountain.y, 'behind the ring').toBeLessThanOrEqual(plan.jets[3]!.y);
        expect(plan.fountain.y + 0, 'on the screen').toBeLessThan(s.h);
        const top = plan.fountain.y + GREAT.top * plan.fountain.s;
        expect(top, 'its top is under the stars').toBeGreaterThanOrEqual(over.meter.y1 - 6);
        expect(plan.gem.y, 'the big gem is on the fountain').toBeLessThan(plan.fountain.y);
        expect(plan.gem.r).toBeGreaterThan(20);
        expect(plan.fountain.x - GREAT.halfWidth * plan.fountain.s, 'the fountain is in the screen').toBeGreaterThan(0);
        expect(plan.fountain.x + GREAT.halfWidth * plan.fountain.s).toBeLessThan(s.w);
      });

      it('has a rainbow over it that is in the screen, and whose top is under the stars', () => {
        const a = plan.arch;
        expect(a.x - a.rx).toBeGreaterThanOrEqual(0);
        expect(a.x + a.rx).toBeLessThanOrEqual(s.w);
        expect(a.y - a.ry, 'the top of the rainbow').toBeGreaterThanOrEqual(over.meter.y1);
        expect(a.band).toBeGreaterThan(4);
        expect(a.rx - a.band * 7, 'seven bands fit inside the rainbow').toBeGreaterThan(20);
        expect(a.ry - a.band * 7).toBeGreaterThan(10);
      });

      it('lets a jewel go up as far as the stars and no further, and as far as the top of the screen where nothing is', () => {
        expect(plan.ceiling(s.w / 2)).toBeGreaterThanOrEqual(over.meter.y1);
        expect(plan.ceiling(s.w * 0.1 + 100)).toBeLessThanOrEqual(plan.ceiling(s.w / 2));
        for (let i = 0; i < JET_COUNT; i++)
          expect(
            plan.jets[i]!.y - plan.ceiling(plan.jets[i]!.x),
            `jet ${i} has room to throw jewels up`,
          ).toBeGreaterThan(100);
      });

      it('gives each jet a strip of the screen of its own that is not narrower than a small finger', () => {
        for (let i = 0; i < JET_COUNT; i++) {
          const j = plan.jets[i]!;
          expect(jetAt(plan, j.x, j.y), `at jet ${i}`).toBe(i);
          expect(jetAt(plan, j.x, plan.ceiling(j.x) + 4), `up in the column of jet ${i}`).toBe(i);
          expect(jetAt(plan, j.x + plan.spacing * 0.3, j.y - 20), `beside jet ${i}`).toBe(i);
        }
        // About a finger's width on the page. A phone held upright has 52 units between the jets
        // and a tablet more of them.
        expect(plan.spacing * s.unit, 'in pixels').toBeGreaterThan(38);
        expect(jetAt(plan, -10, 100), 'off the left').toBe(-1);
        expect(jetAt(plan, s.w + 10, 100), 'off the right').toBe(-1);
        expect(jetAt(plan, s.w / 2, s.h + 5), 'under the screen').toBe(-1);
      });

      for (const n of [1, 2, 3, 6]) {
        it(`stands ${n} friends on the screen, each of them clear of the fountain and of one another`, () => {
          const stands = standsOf(n, plan);
          expect(stands).toHaveLength(n);
          stands.forEach((a, i) => {
            expect(a.x, `friend ${i} left`).toBeGreaterThan(20);
            expect(a.x, `friend ${i} right`).toBeLessThan(s.w - 20);
            expect(a.y, `friend ${i} on the screen`).toBeLessThan(s.h - 4);
            if (!plan.portrait)
              expect(
                Math.abs(a.x - plan.fountain.x),
                `friend ${i} is beside the fountain and not in front of it`,
              ).toBeGreaterThan(GREAT.halfWidth * plan.fountain.s);
            stands.forEach((b, j) => {
              if (j > i)
                expect(
                  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 3,
                  `friends ${i} and ${j} are apart`,
                ).toBeGreaterThan(plan.friendStep * 0.8);
            });
          });
          if (plan.portrait) {
            // Upright they stand in a row under the ring.
            for (const a of stands)
              expect(a.y, 'under the ring').toBeGreaterThan(Math.max(...plan.jets.map((j) => j.y + j.ry)));
          }
        });
      }
    });
  }
});
