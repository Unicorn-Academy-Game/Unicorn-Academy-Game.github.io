import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { ARRIVALS, COMING, Guests, guestsFor, WHEN } from './guests';
import { planOf } from './layout';

const VIEWS: readonly (readonly [number, number])[] = [
  [863, 360],
  [480, 360],
  [360, 780],
  [360, 480],
];

const crowd = (w = 863, h = 360, seed = 3): { guests: Guests; plan: ReturnType<typeof planOf> } => {
  const guests = new Guests(new Rng(seed));
  const plan = planOf(w, h);
  guests.place(plan);
  return { guests, plan };
};

describe('who comes to the party', () => {
  it('grows with the play, one guest at a time, and never shrinks', () => {
    let last = 0;
    for (let points = 0; points < 80; points += 0.5) {
      const n = guestsFor(points);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n - last).toBeLessThanOrEqual(1);
      last = n;
    }
    expect(guestsFor(0)).toBe(0);
    expect(guestsFor(WHEN[0]!)).toBe(1);
    expect(guestsFor(1e9)).toBe(ARRIVALS.length);
    expect(WHEN).toHaveLength(ARRIVALS.length);
  });

  it('puts each guest on the screen, and does not put two in the same place', () => {
    for (const [w, h] of VIEWS) {
      const { guests, plan } = crowd(w, h);
      guests.ensure(ARRIVALS.length, 0);
      expect(guests.list).toHaveLength(ARRIVALS.length);
      for (const g of guests.list) {
        expect(g.home.x, `${g.kind} in ${w}x${h}`).toBeGreaterThan(0);
        expect(g.home.x).toBeLessThan(plan.w);
        expect(g.home.y).toBeGreaterThan(0);
        expect(g.home.y).toBeLessThan(plan.h + 4);
      }
      const standing = guests.list.filter((g) => g.kind === 'frog' || g.kind === 'bunny');
      for (let i = 0; i < standing.length; i++) {
        for (let j = i + 1; j < standing.length; j++) {
          expect(Math.abs(standing[i]!.home.x - standing[j]!.home.x), `${i} and ${j} in ${w}x${h}`).toBeGreaterThan(30);
        }
      }
    }
  });

  it('flies about above the floor and never off the screen', () => {
    for (const [w, h] of VIEWS) {
      const { guests, plan } = crowd(w, h, 9);
      guests.ensure(ARRIVALS.length, 0);
      for (const g of guests.list.filter((g) => g.kind === 'fairy' || g.kind === 'butterfly')) {
        for (let now = COMING; now < 120; now += 0.37) {
          const p = guests.pose(g, now);
          expect(p.x, `${g.kind} in ${w}x${h} at ${now}`).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(plan.w);
          expect(p.y).toBeGreaterThan(plan.h * 0.1);
          expect(p.y).toBeLessThan(plan.floor.top);
        }
      }
    }
  });

  it('comes in from the side and ends where it stands', () => {
    const { guests, plan } = crowd();
    guests.ensure(2, 10);
    for (const g of guests.list) {
      const start = guests.pose(g, 10);
      const end = guests.pose(g, 10 + COMING);
      expect(Math.abs(start.x - g.from.x)).toBeLessThan(2);
      expect(Math.abs(end.x - g.home.x)).toBeLessThan(2);
      expect(Math.abs(end.y - g.home.y)).toBeLessThan(2);
      // It is outside the screen when it starts.
      expect(start.x < 0 || start.x > plan.w).toBe(true);
    }
  });

  it('faces the middle of the floor, whichever way its picture was drawn', () => {
    const { guests } = crowd();
    guests.ensure(ARRIVALS.length, 0);
    for (const g of guests.list) {
      if (g.kind === 'fairy' || g.kind === 'butterfly') continue;
      const p = guests.pose(g, 5);
      const native = g.kind === 'bird' ? -1 : g.kind === 'bunny' ? 1 : 0;
      if (native === 0) continue;
      const facesRight = p.flip ? native < 0 : native > 0;
      expect(facesRight, `${g.kind} at ${g.home.x}`).toBe(g.home.x < 863 / 2);
    }
  });

  it('hops on its own beat of four, and all of them hop when something goes off', () => {
    const { guests } = crowd();
    guests.ensure(4, 0);
    const high = (now: number): number => Math.max(...guests.list.map((g) => guests.pose(g, now).lift));
    expect(high(5)).toBe(0);
    guests.onBeat(0, 5);
    // Only the guest whose beat it is goes up.
    const up = guests.list.filter((g) => g.hopAt === 5);
    expect(up.length).toBeGreaterThan(0);
    expect(up.length).toBeLessThan(guests.list.length);
    guests.cheer(400, 1, 8);
    for (const g of guests.list) expect(guests.pose(g, 8.2).lift, g.kind).toBeGreaterThan(2);
  });

  it('hops a big hop when it is touched, and a flier does not', () => {
    const { guests } = crowd();
    guests.ensure(ARRIVALS.length, 0);
    const frog = guests.list[0]!;
    const found = guests.at(frog.home.x, frog.home.y - 14, 10);
    expect(found).toBe(frog);
    guests.poke(frog, 10);
    expect(guests.pose(frog, 10.2).lift).toBeGreaterThan(10);
    const fairy = guests.list.find((g) => g.kind === 'fairy')!;
    guests.poke(fairy, 10);
    expect(guests.pose(fairy, 10.2).lift).toBe(0);
  });

  it('keeps who is here when the screen turns, and starts over when asked', () => {
    const { guests } = crowd();
    guests.ensure(5, 0);
    guests.place(planOf(360, 780));
    expect(guests.list).toHaveLength(5);
    for (const g of guests.list) expect(g.home.x).toBeLessThan(360);
    guests.reset();
    expect(guests.list).toHaveLength(0);
  });
});
