import { describe, expect, it } from 'vitest';
import type { Fall } from '../content/seasons';
import { countFor, feelOf, MARGIN, makeFlakes, type Placed, place, type View } from './weather-field';

const FALLS: readonly Fall[] = ['snow', 'leaves', 'petals'];
const VIEW: View = { x: 400, y: 300, w: 560, h: 260 };
const spot = (): Placed => ({ x: 0, y: 0, angle: 0, alpha: 0, variant: 0 });

describe('what falls from the sky', () => {
  it('is the same flakes every time, with numbers that are all in range, and no two the same', () => {
    for (const fall of FALLS) {
      const a = makeFlakes(fall, 50);
      expect(makeFlakes(fall, 50)).toEqual(a);
      expect(new Set(a.map((f) => `${f.u}:${f.v}`)).size).toBe(50);
      for (const f of a) {
        for (const n of [f.u, f.v, f.size, f.reach, f.rate]) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThan(1);
        }
        expect(f.turn).toBeGreaterThanOrEqual(-1);
        expect(f.turn).toBeLessThan(1);
        expect(Number.isInteger(f.variant)).toBe(true);
        expect(f.variant).toBeGreaterThanOrEqual(0);
        expect(f.variant).toBeLessThan(feelOf(fall).variants);
      }
      expect(new Set(a.map((f) => f.variant)).size, `${fall} uses its pictures`).toBe(feelOf(fall).variants);
    }
  });

  it('is not the same flakes for snow as for leaves', () => {
    expect(makeFlakes('snow', 5).map((f) => f.u)).not.toEqual(makeFlakes('leaves', 5).map((f) => f.u));
  });

  it('stays in the view and a little way round it, at any time and anywhere the camera is', () => {
    const out = spot();
    for (const fall of FALLS) {
      const flakes = makeFlakes(fall, 80);
      for (const seconds of [0, 0.4, 7, 120, 3600, 86_400]) {
        for (const view of [VIEW, { x: 0, y: 0, w: 300, h: 200 }, { x: 4096, y: 2048, w: 900, h: 500 }]) {
          for (const flake of flakes) {
            place(flake, fall, seconds, view, out);
            expect(out.x).toBeGreaterThanOrEqual(view.x - MARGIN - 1e-6);
            expect(out.x).toBeLessThan(view.x + view.w + MARGIN + 1e-6);
            expect(out.y).toBeGreaterThanOrEqual(view.y - MARGIN - 1e-6);
            expect(out.y).toBeLessThan(view.y + view.h + MARGIN + 1e-6);
          }
        }
      }
    }
  });

  it('falls, at the speed of its size, and the bigger a flake is the faster it goes', () => {
    const out = spot();
    for (const fall of FALLS) {
      const feel = feelOf(fall);
      const small = { ...makeFlakes(fall, 1)[0]!, size: 0, v: 0.1, reach: 0 };
      const big = { ...small, size: 1 };
      const drop = (flake: typeof small): number => {
        place(flake, fall, 0, VIEW, out);
        const before = out.y;
        place(flake, fall, 0.5, VIEW, out);
        return (((out.y - before) % (VIEW.h + 2 * MARGIN)) + VIEW.h + 2 * MARGIN) % (VIEW.h + 2 * MARGIN);
      };
      expect(drop(small)).toBeCloseTo(feel.speed[0] * 0.5, 1);
      expect(drop(big)).toBeCloseTo(feel.speed[1] * 0.5, 1);
      expect(feel.speed[1]).toBeGreaterThan(feel.speed[0]);
    }
  });

  it('swings from side to side by no more than its reach, and does not turn what does not turn', () => {
    const out = spot();
    for (const fall of FALLS) {
      const feel = feelOf(fall);
      const flake = { ...makeFlakes(fall, 1)[0]!, size: 0.5, reach: 1, rate: 0.5, turn: 0 };
      const xs: number[] = [];
      for (let t = 0; t < 12; t += 0.05) {
        place(flake, fall, t, VIEW, out);
        xs.push(out.x);
        expect(Math.abs(out.angle)).toBeLessThanOrEqual(feel.tip + 1e-9);
      }
      expect(Math.max(...xs) - Math.min(...xs), `${fall} moves sideways`).toBeGreaterThan(0);
    }
    const snow = { ...makeFlakes('snow', 1)[0]!, turn: 1 };
    place(snow, 'snow', 30, VIEW, out);
    expect(out.angle).toBe(0);
  });

  it('turns a leaf or a petal as it goes down', () => {
    const out = spot();
    for (const fall of ['leaves', 'petals'] as const) {
      const flake = { ...makeFlakes(fall, 1)[0]!, turn: 1 };
      place(flake, fall, 0, VIEW, out);
      const first = out.angle;
      place(flake, fall, 10, VIEW, out);
      expect(out.angle).not.toBeCloseTo(first, 1);
    }
  });

  it('goes by the world and not the screen: with the camera still it does not drift, and with the camera moving a small flake goes by slower than a big one', () => {
    const out = spot();
    const flake = { ...makeFlakes('snow', 1)[0]!, size: 0, reach: 0, u: 0.4, v: 0.3 };
    place(flake, 'snow', 5, VIEW, out);
    const there = { x: out.x, y: out.y };
    place(flake, 'snow', 5, VIEW, out);
    expect(out).toMatchObject(there);
    const shift = (size: number): number => {
      const f = { ...flake, size };
      place(f, 'snow', 5, VIEW, out);
      const before = out.x - VIEW.x;
      place(f, 'snow', 5, { ...VIEW, x: VIEW.x + 20 }, out);
      return before - (out.x - (VIEW.x + 20));
    };
    // On the screen a flake moves back by as much as the camera moved, times how near it is.
    expect(shift(1)).toBeGreaterThan(shift(0));
  });

  it('is fainter when it is small', () => {
    const out = spot();
    for (const fall of FALLS) {
      const flake = makeFlakes(fall, 1)[0]!;
      place({ ...flake, size: 0 }, fall, 1, VIEW, out);
      const faint = out.alpha;
      place({ ...flake, size: 1 }, fall, 1, VIEW, out);
      expect(out.alpha).toBeGreaterThan(faint);
      expect(out.alpha).toBeLessThanOrEqual(1);
      expect(faint).toBeGreaterThan(0.5);
    }
  });

  it('fills a bigger view with more, a calmer quality with fewer, and never more than the most', () => {
    for (const fall of FALLS) {
      const small = countFor(fall, { x: 0, y: 0, w: 300, h: 160 }, 1);
      const big = countFor(fall, { x: 0, y: 0, w: 600, h: 320 }, 1);
      expect(big).toBeGreaterThan(small);
      expect(countFor(fall, VIEW, 0.5)).toBeLessThan(countFor(fall, VIEW, 1));
      expect(countFor(fall, { x: 0, y: 0, w: 20_000, h: 20_000 }, 1)).toBe(feelOf(fall).most);
      expect(countFor(fall, { x: 0, y: 0, w: 20_000, h: 20_000 }, 0.5)).toBe(Math.round(feelOf(fall).most * 0.5));
      expect(countFor(fall, VIEW, 0)).toBe(0);
    }
  });

  it('is plenty of snow on a phone, and less of leaves and petals than of snow', () => {
    const phone: View = { x: 0, y: 0, w: 530, h: 245 };
    expect(countFor('snow', phone, 1)).toBeGreaterThan(80);
    expect(countFor('snow', phone, 1)).toBeLessThanOrEqual(160);
    expect(countFor('leaves', phone, 1)).toBeLessThan(countFor('snow', phone, 1));
    expect(countFor('petals', phone, 1)).toBeLessThan(countFor('snow', phone, 1));
  });
});
