import { describe, expect, it } from 'vitest';
import { chromeOf, type Rect } from '../../engine/chrome';
import { cellAt, FRUIT_COUNT, PARTS, type Plan, planOf, type Spot, standsOf } from './layout';

/**
 * The screens the workshop is on: a phone held both ways, a wide one, and a tablet held both ways,
 * with how many pixels a unit is.
 */
const SCREENS: readonly (readonly [number, number, number])[] = [
  [863, 360, 1],
  [640, 360, 1],
  [840, 360, 1],
  [480, 360, 2.13],
  [360, 780, 1],
  [360, 720, 1],
  [360, 640, 1],
  [360, 480, 2.13],
];

const where = (w: number, h: number, unit: number): string => `${w}x${h} at ${unit} pixels a unit`;

const covers = (rect: Rect, c: Spot): boolean =>
  c.x + c.r > rect.x0 && c.x - c.r < rect.x1 && c.y + c.r > rect.y0 && c.y - c.r < rect.y1;

function touchables(plan: Plan): { name: string; spot: Spot }[] {
  return [
    ...plan.fruit.map((spot, i) => ({ name: `fruit ${i}`, spot })),
    { name: 'the lever', spot: plan.lever },
    { name: 'the whistle', spot: plan.whistle },
    { name: 'the dome', spot: plan.dome },
    { name: 'the hopper', spot: plan.hopper },
  ];
}

describe('the workshop', () => {
  it('has seven fruit, and every place the player touches on the screen', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      expect(plan.fruit, where(w, h, unit)).toHaveLength(FRUIT_COUNT);
      for (const { name, spot } of touchables(plan)) {
        expect(spot.x - spot.r, `${name} in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(0);
        expect(spot.x + spot.r, `${name} in ${where(w, h, unit)}`).toBeLessThanOrEqual(w);
        expect(spot.y - spot.r, `${name} in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(0);
        expect(spot.y + spot.r, `${name} in ${where(w, h, unit)}`).toBeLessThanOrEqual(h);
      }
    }
  });

  it('keeps everything the player touches out from under the buttons and the star counter the page draws over it', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      const over = chromeOf({ w, h, unit });
      for (const { name, spot } of touchables(plan)) {
        for (const [what, rect] of [
          ['the way out', over.wayOut],
          ['the star counter', over.meter],
          ['the corner buttons', over.corner],
        ] as const) {
          expect(covers(rect, spot), `${name} under ${what} in ${where(w, h, unit)}`).toBe(false);
        }
      }
      for (let i = 0; i < plan.shelf.cols * plan.shelf.rows; i++) {
        const c = cellAt(plan, i);
        for (const [what, rect] of [
          ['the way out', over.wayOut],
          ['the star counter', over.meter],
          ['the corner buttons', over.corner],
        ] as const) {
          expect(
            covers(rect, { x: c.x, y: c.y, r: plan.shelf.cell / 2 - 2 }),
            `shelf cell ${i} under ${what} in ${where(w, h, unit)}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps the shelf and the lever clear of the buttons that come when it is over, in a screen held sideways', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      if (plan.portrait) continue;
      const over = chromeOf({ w, h, unit });
      expect(plan.shelf.y1, where(w, h, unit)).toBeLessThanOrEqual(over.finish.y0 - 1);
      expect(covers(over.finish, plan.lever), where(w, h, unit)).toBe(false);
      for (const f of plan.fruit) expect(covers(over.finish, f), where(w, h, unit)).toBe(false);
    }
  });

  it('keeps the fruit a finger apart, and big enough for one', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      for (let i = 0; i < plan.fruit.length; i++) {
        // A fruit is at least as wide as a fingertip on the screen it is on.
        expect(plan.fruit[i]!.r * unit, `fruit ${i} in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(21);
        for (let j = i + 1; j < plan.fruit.length; j++) {
          const a = plan.fruit[i]!;
          const b = plan.fruit[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `fruit ${i} and ${j} in ${where(w, h, unit)}`).toBeGreaterThan(
            Math.min(a.r, b.r) * 1.7,
          );
        }
      }
    }
  });

  it('keeps the fruit, the shelf and the machine from lying on top of one another', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      const half = (PARTS.width / 2) * plan.s;
      const body = {
        x0: plan.machine.x - half,
        x1: plan.machine.x + half,
        y0: plan.machine.y - PARTS.height * plan.s,
        y1: plan.machine.y,
      };
      for (const f of plan.fruit) {
        const outside =
          f.x + f.r <= body.x0 + 4 || f.x - f.r >= body.x1 - 4 || f.y - f.r >= body.y1 - 2 || f.y + f.r <= body.y0;
        expect(outside, `a fruit in the machine in ${where(w, h, unit)}`).toBe(true);
      }
      const sh = plan.shelf;
      const clear = sh.x0 >= body.x1 - 4 || sh.y0 >= body.y1 - 2;
      expect(clear, `the shelf in the machine in ${where(w, h, unit)}`).toBe(true);
      for (const f of plan.fruit) {
        const apart = f.x + f.r <= sh.x0 || f.x - f.r >= sh.x1 || f.y + f.r <= sh.y0 || f.y - f.r >= sh.y1;
        expect(apart, `a fruit on the shelf in ${where(w, h, unit)}`).toBe(true);
      }
    }
  });

  it('puts the machine inside the screen and its funnel under the star counter, never over it', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      const half = (PARTS.width / 2) * plan.s;
      expect(plan.machine.x - half, where(w, h, unit)).toBeGreaterThanOrEqual(0);
      expect(plan.machine.x + half, where(w, h, unit)).toBeLessThanOrEqual(w);
      expect(plan.machine.y - PARTS.height * plan.s, where(w, h, unit)).toBeGreaterThanOrEqual(0);
      expect(plan.machine.y, where(w, h, unit)).toBeLessThan(h);
    }
  });

  it('puts every friend in the row, nobody on top of another, the leader in the middle, and every one on the screen', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      for (let n = 1; n <= 6; n++) {
        const stands = standsOf(n, plan);
        expect(stands, `${n} friends in ${where(w, h, unit)}`).toHaveLength(n);
        for (const s of stands) {
          expect(s.x - 40 * s.scale, `a friend in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(0);
          expect(s.x + 40 * s.scale, `a friend in ${where(w, h, unit)}`).toBeLessThanOrEqual(w);
          expect(s.y, `a friend in ${where(w, h, unit)}`).toBeLessThanOrEqual(h);
        }
        if (n % 2 === 1) expect(stands[0]!.x).toBeCloseTo(plan.row.middle, 6);
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++)
            expect(
              Math.abs(stands[i]!.x - stands[j]!.x),
              `friends ${i} and ${j} of ${n} in ${where(w, h, unit)}`,
            ).toBeGreaterThanOrEqual(plan.row.step - 1e-6);
        }
      }
    }
  });

  it('keeps the friends below the fruit, so a finger on a fruit is never on a friend', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      const heads = plan.row.y - 100 * plan.row.scale;
      const lowest = Math.max(...plan.fruit.map((f) => f.y + f.r));
      expect(lowest, where(w, h, unit)).toBeLessThanOrEqual(heads + 14);
    }
  });

  it('fills the shelf from its top left, every cell inside it', () => {
    for (const [w, h, unit] of SCREENS) {
      const plan = planOf(w, h, unit);
      const sh = plan.shelf;
      const last = sh.cols * sh.rows - 1;
      expect(cellAt(plan, 0).x).toBeLessThan(cellAt(plan, 1).x);
      expect(cellAt(plan, 0).y).toBeLessThan(cellAt(plan, sh.cols).y);
      for (let i = 0; i <= last; i++) {
        const c = cellAt(plan, i);
        expect(c.x - sh.cell / 2, `cell ${i} in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(sh.x0 - 1e-6);
        expect(c.x + sh.cell / 2, `cell ${i} in ${where(w, h, unit)}`).toBeLessThanOrEqual(sh.x1 + 1e-6);
        expect(c.y + sh.cell / 2, `cell ${i} in ${where(w, h, unit)}`).toBeLessThanOrEqual(sh.y1 + 1e-6);
        expect(c.y - sh.cell / 2, `cell ${i} in ${where(w, h, unit)}`).toBeGreaterThanOrEqual(sh.y0 - 1e-6);
      }
    }
  });
});
