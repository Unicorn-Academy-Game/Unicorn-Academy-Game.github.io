import { describe, expect, it } from 'vitest';
import { chrome, chromeOf, type Rect } from '../../engine/chrome';
import { R_BOUQUET } from './field';
import { planOf, SAG } from './layout';
import { LONGEST_PHRASE } from './songbook';

/**
 * Every screen the game is shown on, in units, with the size of one unit in pixels (a phone is 1, a
 * desktop is 2).
 */
const SCREENS = [
  { name: 'phone landscape', w: 863, h: 360, unit: 1 },
  { name: 'tall phone landscape', w: 852, h: 393, unit: 1 },
  { name: 'desktop', w: 640, h: 360, unit: 2 },
  { name: 'fire tablet', w: 576, h: 360, unit: 2.22 },
  { name: 'phone upright', w: 360, h: 780, unit: 1 },
  { name: 'tall phone upright', w: 390, h: 844, unit: 1 },
  { name: 'tablet upright', w: 360, h: 480, unit: 1.33 },
] as const;

const hits = (a: Rect, x: number, y: number, r: number): boolean =>
  x + r > a.x0 && x - r < a.x1 && y + r > a.y0 && y - r < a.y1;

describe('where the balloon game puts things', () => {
  for (const s of SCREENS) {
    describe(s.name, () => {
      const plan = planOf(s);
      const ties = plan.ties.map((t) => ({
        x: t.x + Math.sin(t.angle) * t.length,
        y: t.y - Math.cos(t.angle) * t.length,
      }));

      it('hangs five balloons side by side, in the order of the scale from the left to the right, each whole on the screen', () => {
        expect(ties).toHaveLength(5);
        for (let i = 1; i < ties.length; i++) expect(ties[i]!.x).toBeGreaterThan(ties[i - 1]!.x);
        for (const t of ties) {
          expect(t.x - R_BOUQUET).toBeGreaterThan(0);
          expect(t.x + R_BOUQUET).toBeLessThan(s.w);
          expect(t.y - R_BOUQUET).toBeGreaterThan(0);
          expect(t.y + R_BOUQUET).toBeLessThan(plan.feet);
        }
      });

      it('keeps the balloons of the bouquet from covering each other, so each is a good size to tap', () => {
        for (let i = 1; i < ties.length; i++) {
          expect(Math.hypot(ties[i]!.x - ties[i - 1]!.x, ties[i]!.y - ties[i - 1]!.y)).toBeGreaterThan(
            R_BOUQUET * 2 - 1,
          );
        }
      });

      it('stands the gift on the hill in the middle, with the strings tied to the top of it', () => {
        const gift = plan.gift;
        expect(gift.x).toBeCloseTo(s.w / 2, 6);
        expect(gift.y).toBeGreaterThan(plan.feet);
        expect(gift.y).toBeLessThan(s.h);
        // The strings meet just under the top edge of the gift, so they come out from behind its
        // lid.
        expect(gift.tieY).toBeGreaterThan(gift.y - gift.height);
        expect(gift.tieY).toBeLessThan(gift.y - gift.height + 8);
        for (const t of plan.ties) expect(t.y).toBe(gift.tieY);
        expect(gift.half).toBeGreaterThan(20);
      });

      it('is level: the middle balloon is in the middle and the fan is even', () => {
        expect(ties[2]!.x).toBeCloseTo(s.w / 2, 6);
        expect(ties[0]!.x + ties[4]!.x).toBeCloseTo(s.w, 6);
        expect(ties[1]!.x + ties[3]!.x).toBeCloseTo(s.w, 6);
      });

      it('keeps every balloon of the bouquet clear of the buttons and the star meter', () => {
        for (const t of ties) for (const c of chrome(s)) expect(hits(c, t.x, t.y, R_BOUQUET)).toBe(false);
      });

      it('has room for the longest phrase of a song in the garland, under the star meter, clear of every button', () => {
        const g = plan.garland;
        const half = ((LONGEST_PHRASE - 1) * g.step) / 2 + g.r;
        expect(g.cx - half).toBeGreaterThan(0);
        expect(g.cx + half).toBeLessThan(s.w);
        for (const c of chrome(s)) {
          expect(hits(c, g.cx - half, g.y, g.r)).toBe(false);
          expect(hits(c, g.cx + half, g.y, g.r)).toBe(false);
          expect(hits(c, g.cx, g.ribbon, g.r)).toBe(false);
        }
        expect(g.ribbon).toBeGreaterThan(g.y);
      });

      it('puts the garland above the bouquet, with a gap, so the song is not behind the balloons', () => {
        const topOfBouquet = Math.min(...ties.map((t) => t.y - R_BOUQUET));
        expect(plan.garland.ribbon + SAG + 3).toBeLessThanOrEqual(topOfBouquet);
      });

      it('lets balloons rise from behind the near hills and leave off the top', () => {
        expect(plan.area.floor).toBeGreaterThan(plan.feet);
        expect(plan.area.top).toBeLessThan(0);
        expect(plan.area.w).toBe(s.w);
        expect(plan.horizon).toBeLessThan(plan.feet);
      });

      it('leaves the rainbow room: its feet on the hills and its top under the star meter, as big as the room allows', () => {
        const meter = chromeOf(s).meter.y1;
        expect(plan.rainbow.baseY).toBeLessThan(plan.feet);
        expect(plan.rainbow.top).toBeGreaterThanOrEqual(meter);
        expect(plan.rainbow.baseY - plan.rainbow.top).toBeGreaterThan(Math.min(s.h * 0.55, s.w * 0.9));
      });
    });
  }
});
