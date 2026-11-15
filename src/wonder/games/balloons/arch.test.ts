import { describe, expect, it } from 'vitest';
import { archOf, BUILD_SECONDS, columnOf, flight, RING_COLORS, tripOf } from './arch';

/**
 * Screens in units: phone landscape, a tall phone, desktop, a Fire tablet, a phone upright, a
 * tablet upright.
 */
const SCREENS = [
  { name: 'phone landscape', w: 863, h: 360 },
  { name: 'tall phone landscape', w: 852, h: 393 },
  { name: 'desktop', w: 640, h: 360 },
  { name: 'fire tablet', w: 576, h: 360 },
  { name: 'phone upright', w: 360, h: 780 },
  { name: 'tall phone upright', w: 390, h: 844 },
  { name: 'tablet upright', w: 360, h: 480 },
] as const;

/**
 * Where the game puts the feet and the top of the rainbow on a screen: on the hills, and under the
 * star meter and the garland.
 */
const feet = (h: number): number => h * 0.84;
const top = (h: number): number => Math.max(78, h * 0.2);

describe('the balloon rainbow', () => {
  for (const s of SCREENS) {
    describe(s.name, () => {
      const a = archOf(s.w, feet(s.h), top(s.h));

      it('has six rings of the six colours and plenty of balloons', () => {
        expect(a.rings).toBe(6);
        expect(RING_COLORS).toHaveLength(6);
        expect(new Set(a.slots.map((p) => p.ring)).size).toBe(6);
        expect(a.slots.length).toBeGreaterThan(70);
      });

      it('fits on the screen: every balloon is whole, and under the top the game keeps clear', () => {
        for (const p of a.slots) {
          expect(p.x - a.r).toBeGreaterThanOrEqual(0);
          expect(p.x + a.r).toBeLessThanOrEqual(s.w);
          expect(p.y - a.r).toBeGreaterThanOrEqual(top(s.h) - 0.5);
          expect(p.y).toBeLessThanOrEqual(feet(s.h));
        }
      });

      it('never puts two balloons in nearly the same place, though the rings are packed so that balloons touch', () => {
        let least = Infinity;
        for (let i = 0; i < a.slots.length; i++) {
          for (let j = i + 1; j < a.slots.length; j++) {
            least = Math.min(least, Math.hypot(a.slots[i]!.x - a.slots[j]!.x, a.slots[i]!.y - a.slots[j]!.y));
          }
        }
        expect(least).toBeGreaterThan(a.r * 1.4);
      });

      it('is level: the left and the right half have the same number of balloons', () => {
        const left = a.slots.filter((p) => p.x < a.cx).length;
        expect(Math.abs(left - (a.slots.length - left))).toBeLessThanOrEqual(a.rings);
      });

      it('leaves an opening inside for the heart that is wide enough and tall enough', () => {
        expect(a.openRx).toBeGreaterThan(50);
        expect(a.openRy).toBeGreaterThan(36);
        // And nothing of the innermost ring is in it.
        for (const p of a.slots) {
          if (p.ring !== a.rings - 1) continue;
          const inside = ((p.x - a.cx) / a.openRx) ** 2 + ((p.y - a.baseY) / a.openRy) ** 2;
          expect(inside).toBeGreaterThanOrEqual(1);
        }
      });
    });
  }

  it('puts the outside ring outside: higher and wider than the inside one', () => {
    const a = archOf(863, feet(360), top(360));
    const rim = (ring: number): { top: number; wide: number } => {
      const of = a.slots.filter((p) => p.ring === ring);
      return {
        top: Math.min(...of.map((p) => p.y)),
        wide: Math.max(...of.map((p) => p.x)) - Math.min(...of.map((p) => p.x)),
      };
    };
    for (let ring = 1; ring < a.rings; ring++) {
      expect(rim(ring).top).toBeGreaterThan(rim(ring - 1).top);
      expect(rim(ring).wide).toBeLessThan(rim(ring - 1).wide);
    }
  });

  it('cuts into columns that every ring reaches, so a song played across it is heard in every colour', () => {
    const a = archOf(863, feet(360), top(360));
    for (const columns of [4, 7, 12]) {
      for (let c = 0; c < columns; c++) {
        const inColumn = a.slots.filter((p) => columnOf(p.u, columns) === c);
        expect(new Set(inColumn.map((p) => p.ring)).size).toBe(a.rings);
      }
    }
    expect(columnOf(0, 7)).toBe(0);
    expect(columnOf(1, 7)).toBe(6);
    expect(columnOf(-0.5, 7)).toBe(0);
    expect(columnOf(0.4999, 2)).toBe(0);
    expect(columnOf(0.5, 2)).toBe(1);
  });
});

describe('the trip of a balloon to the rainbow', () => {
  const a = archOf(863, feet(360), top(360));
  const gift = { x: 431, y: 300 };
  const first = a.slots[0]!;

  it('starts at the gift, ends exactly on its place, and is done by the time the build is', () => {
    const trip = tripOf(first, 0);
    expect(flight(gift, first, trip.leaves - 1, trip)).toMatchObject({ x: gift.x, y: gift.y, flying: true });
    expect(flight(gift, first, trip.arrives, trip)).toMatchObject({ x: first.x, y: first.y, flying: false });
    for (const p of a.slots) expect(tripOf(p, 1).arrives).toBeLessThanOrEqual(BUILD_SECONDS);
  });

  it('lets the outside ring go first, and each ring from its left foot to its right', () => {
    const outer = a.slots.filter((p) => p.ring === 0);
    const inner = a.slots.filter((p) => p.ring === a.rings - 1);
    expect(tripOf(outer[0]!, 0).arrives).toBeLessThan(tripOf(inner[0]!, 0).arrives);
    expect(tripOf(outer[0]!, 0).arrives).toBeLessThan(tripOf(outer[outer.length - 1]!, 0).arrives);
    // A balloon is in the air for the same time wherever it is going.
    const air = (p: (typeof a.slots)[number]): number => tripOf(p, 0).arrives - tripOf(p, 0).leaves;
    expect(air(outer[3]!)).toBeCloseTo(air(inner[2]!), 6);
  });

  it('passes a little over its place and settles back, rather than stopping dead', () => {
    // The balloon at the very top of the rainbow has the longest way up.
    const apex = a.slots.reduce((best, p) => (p.y < best.y ? p : best));
    const trip = tripOf(apex, 0);
    let highest = Infinity;
    for (let t = trip.leaves; t <= trip.arrives; t += 0.01) highest = Math.min(highest, flight(gift, apex, t, trip).y);
    expect(highest).toBeLessThan(apex.y - 1);
  });
});
