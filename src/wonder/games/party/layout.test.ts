import { describe, expect, it } from 'vitest';
import { chromeOf } from '../../engine/chrome';
import { FOOTPRINT, floorEdges, floorY, planOf, rowDepths, slotsOf } from './layout';

/**
 * The screens a party is on: a phone and a desktop either way up, a tablet, and the widest and
 * narrowest of them.
 */
const VIEWS: readonly (readonly [number, number])[] = [
  [863, 360],
  [640, 360],
  [480, 360],
  [840, 360],
  [360, 780],
  [360, 640],
  [360, 480],
];

describe('the party', () => {
  it('has every place on the screen, at every size', () => {
    for (const [w, h] of VIEWS) {
      const plan = planOf(w, h);
      const inside = (x: number, y: number, what: string): void => {
        expect(x, `${what} x in ${w}x${h}`).toBeGreaterThan(0);
        expect(x, `${what} x in ${w}x${h}`).toBeLessThan(w);
        expect(y, `${what} y in ${w}x${h}`).toBeGreaterThan(0);
        expect(y, `${what} y in ${w}x${h}`).toBeLessThanOrEqual(h);
      };
      for (const c of plan.cannons) inside(c.x, c.y, 'a cannon');
      inside(plan.ball.x, plan.ball.y, 'the ball');
      inside(plan.pinata.x, plan.pinata.y, 'the pinata');
      for (const s of plan.speakers) inside(s.x, s.y, 'a speaker');
      for (const p of plan.poles) inside(p.x, p.base, 'a pole');
      expect(plan.floor.bottom).toBeLessThan(plan.ground);
      expect(plan.ground).toBeLessThan(h);
    }
  });

  it('keeps everything the player touches at the top of the screen out from under the buttons and the star counter the page draws over it', () => {
    for (const unit of [1, 2]) {
      for (const [w, h] of VIEWS) {
        const plan = planOf(w, h, unit);
        const over = chromeOf({ w, h, unit });
        const covered = (c: { x: number; y: number; r: number }): string | null => {
          for (const [name, r] of [
            ['the way out', over.wayOut],
            ['the star counter', over.meter],
            ['the corner buttons', over.corner],
          ] as const) {
            if (c.x + c.r > r.x0 && c.x - c.r < r.x1 && c.y + c.r > r.y0 && c.y - c.r < r.y1) return name;
          }
          return null;
        };
        expect(covered(plan.ball), `the ball in ${w}x${h} at ${unit} pixels a unit`).toBeNull();
        expect(covered(plan.pinata), `the pinata in ${w}x${h} at ${unit} pixels a unit`).toBeNull();
        for (const s of plan.speakers)
          expect(
            covered({ x: s.x, y: s.y - s.h / 2, r: Math.min(s.w, s.h) / 2 }),
            `a speaker in ${w}x${h} at ${unit} pixels a unit`,
          ).toBeNull();
      }
    }
  });

  it('keeps the cannons, the ball and the pinata apart so a finger can tell them from one another', () => {
    for (const [w, h] of VIEWS) {
      const plan = planOf(w, h);
      const things = [
        { x: plan.cannons[0].x, y: plan.cannons[0].y - 50, r: 30 },
        { x: plan.cannons[1].x, y: plan.cannons[1].y - 50, r: 30 },
        { x: plan.ball.x, y: plan.ball.y, r: plan.ball.r },
        { x: plan.pinata.x, y: plan.pinata.y, r: plan.pinata.r },
      ];
      for (let i = 0; i < things.length; i++) {
        for (let j = i + 1; j < things.length; j++) {
          const a = things[i]!;
          const b = things[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${i} and ${j} in ${w}x${h}`).toBeGreaterThan(a.r + b.r + 8);
        }
      }
    }
  });

  it('puts every friend on the floor, nobody on top of another, and the leader at the front', () => {
    for (const [w, h] of VIEWS) {
      const plan = planOf(w, h);
      for (let n = 1; n <= 6; n++) {
        const slots = slotsOf(n, plan);
        expect(slots).toHaveLength(n);
        const where = `${n} friends in ${w}x${h}`;
        for (const s of slots) {
          const edges = floorEdges(plan.floor, s.depth);
          expect(s.x, where).toBeGreaterThan(edges.left);
          expect(s.x, where).toBeLessThan(edges.right);
          expect(s.y, where).toBeCloseTo(floorY(plan.floor, s.depth), 6);
          // Her head is on the screen when she is at her tallest.
          expect(s.y - 120 * s.scale, where).toBeGreaterThan(0);
        }
        // The leader is first, in front.
        expect(slots[0]!.depth, where).toBe(Math.max(...slots.map((s) => s.depth)));
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = slots[i]!;
            const b = slots[j]!;
            const across = Math.abs(a.x - b.x);
            const reach = ((a.scale + b.scale) / 2) * FOOTPRINT * 0.8;
            const apart = Math.abs(a.y - b.y);
            // Either well to one side, or far enough up the floor that the one in front does not
            // hide the one behind.
            expect(
              across >= reach * 0.62 || apart >= 22,
              `${i} and ${j} of ${where}: ${across.toFixed(0)} across, ${apart.toFixed(0)} apart, reach ${reach.toFixed(0)}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('turns every friend toward the middle', () => {
    const plan = planOf(863, 360);
    for (const s of slotsOf(6, plan)) {
      if (s.x < plan.w / 2 - 1) expect(s.home).toBe(1);
      if (s.x > plan.w / 2 + 1) expect(s.home).toBe(-1);
    }
  });

  it('has the rows of tiles get taller toward the front, and the same at every size', () => {
    const rows = rowDepths(4);
    expect(rows[0]).toBe(0);
    expect(rows[4]).toBe(1);
    for (let i = 1; i < rows.length - 1; i++) expect(rows[i + 1]! - rows[i]!).toBeGreaterThan(rows[i]! - rows[i - 1]!);
  });
});
