import { describe, expect, it } from 'vitest';
import { chrome, chromeOf, type Rect } from '../../engine/chrome';
import { SCREENS } from '../../engine/screens';
import { insidePond, planOf } from './layout';

const hits = (a: Rect, x: number, y: number, r: number): boolean =>
  x + r > a.x0 && x - r < a.x1 && y + r > a.y0 && y - r < a.y1;

describe('where the bubble garden puts things', () => {
  for (const s of SCREENS) {
    describe(s.name, () => {
      const plan = planOf(s);

      it('stands the whole machine on the ground at the left, with its ring in the air above its box and clear of every button', () => {
        const m = plan.machine;
        expect(m.x - m.half).toBeGreaterThan(0);
        expect(m.x + m.half).toBeLessThan(s.w * 0.45);
        expect(m.y).toBeGreaterThan(plan.feet);
        expect(m.y).toBeLessThan(s.h);
        expect(m.mouth.y).toBeLessThan(m.y - m.height * 0.6);
        expect(m.mouth.y - 20).toBeGreaterThan(chromeOf(s).meter.y1);
        for (const c of chrome(s)) expect(hits(c, m.mouth.x, m.mouth.y, 20)).toBe(false);
      });

      it('lays the air from one side to the other, with its top above the screen and its floor above the heads of the friends', () => {
        expect(plan.air.w).toBe(s.w);
        expect(plan.air.top).toBeLessThan(0);
        expect(plan.air.floor).toBeLessThan(plan.friends.top);
        expect(plan.friends.top).toBeLessThan(plan.feet);
        expect(plan.horizon).toBeLessThan(plan.friends.top);
      });

      it('puts the pond on the meadow to the right of the machine, all of it on the screen', () => {
        const p = plan.pond;
        expect(p.x - p.rx).toBeGreaterThan(plan.machine.x + plan.machine.half);
        expect(p.x + p.rx).toBeLessThan(s.w);
        expect(p.y - p.ry).toBeGreaterThan(plan.horizon);
        expect(p.y + p.ry).toBeLessThan(plan.friends.top);
      });

      it('has places to grow plenty of flowers, on the meadow, out of the water and out from under the machine', () => {
        expect(plan.slots.length).toBeGreaterThanOrEqual(10);
        for (const slot of plan.slots) {
          expect(slot.x).toBeGreaterThan(0);
          expect(slot.x).toBeLessThan(s.w);
          expect(slot.y).toBeGreaterThan(plan.horizon);
          expect(slot.y).toBeLessThan(plan.friends.top);
          expect(insidePond(plan.pond, slot.x, slot.y)).toBeGreaterThan(1);
          expect(Math.abs(slot.x - plan.machine.x)).toBeGreaterThan(plan.machine.half);
        }
      });

      it('keeps the places for flowers apart, so no two grow on top of each other', () => {
        const at = plan.slots;
        for (let i = 0; i < at.length; i++) {
          for (let j = i + 1; j < at.length; j++)
            expect(Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y)).toBeGreaterThan(24);
        }
      });

      it('leaves the friends room to stand to the right of the machine', () => {
        expect(plan.standFrom).toBeGreaterThan(plan.machine.x + plan.machine.half);
        expect(s.w - plan.standFrom).toBeGreaterThan(190);
      });

      it('has the great bubble of the finale fit between the star meter and the ground, in the middle', () => {
        const g = plan.giant;
        expect(g.r).toBeGreaterThan(70);
        expect(g.y - g.r).toBeGreaterThanOrEqual(chromeOf(s).meter.y1);
        expect(g.y + g.r).toBeLessThan(plan.feet);
        expect(g.x).toBeCloseTo(s.w / 2, 6);
      });

      it('has the rainbow stand on the ground and reach as high as the room allows, under the star meter', () => {
        const r = plan.rainbow;
        expect(r.x0).toBeGreaterThan(0);
        expect(r.x1).toBeLessThan(s.w);
        expect(r.top).toBeGreaterThanOrEqual(chromeOf(s).meter.y1);
        expect(r.baseY).toBeLessThan(plan.feet);
        expect(r.baseY - r.top).toBeGreaterThan(Math.min(s.h * 0.3, s.w * 0.3));
      });

      it('keeps a good number of bubbles in the air, fewer on a small screen', () => {
        expect(plan.crowd).toBeGreaterThanOrEqual(6);
        expect(plan.crowd).toBeLessThanOrEqual(11);
      });

      it('stands the tree and the bush on the edge of the meadow, with the top of the tree under the star meter', () => {
        for (const t of [plan.tree, plan.bush]) {
          expect(t.x).toBeGreaterThan(0);
          expect(t.x).toBeLessThan(s.w);
          expect(t.y).toBeGreaterThan(plan.horizon);
          expect(t.y).toBeLessThan(plan.friends.top);
        }
        expect(plan.tree.y - 302 * plan.tree.scale).toBeGreaterThan(chromeOf(s).meter.y1);
      });

      it('has every perch on the screen', () => {
        for (const p of plan.perches) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(s.w);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(plan.feet);
        }
      });
    });
  }
});
