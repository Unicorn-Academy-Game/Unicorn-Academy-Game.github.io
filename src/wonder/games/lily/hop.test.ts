import { describe, expect, it } from 'vitest';
import { CROUCH, flightOf, Hopper, heightOf, MOST_WAITING, type Point, SETTLE } from './hop';

const spots = (place: number): Point => ({ x: place * 100, y: 50 + (place % 2) * 40 });
const never = (): void => {
  throw new Error('landed when she should not have');
};

/** Runs a hopper to a time in small steps, as a game does, and says where it landed and when. */
function run(
  h: Hopper,
  from: number,
  to: number,
  landings: { place: number; at: number }[] = [],
): { place: number; at: number }[] {
  for (let t = from; t <= to + 1e-9; t += 1 / 60) {
    h.step(t, spots, { landed: (place) => landings.push({ place, at: t }) });
  }
  return landings;
}

describe('the length of a hop', () => {
  it('takes longer and goes higher the further the frog goes, and no more than a limit either way', () => {
    expect(flightOf(0)).toBeCloseTo(0.4);
    expect(flightOf(100)).toBeLessThan(flightOf(300));
    expect(flightOf(5000)).toBeCloseTo(0.82);
    expect(heightOf(0)).toBeCloseTo(24);
    expect(heightOf(100)).toBeLessThan(heightOf(250));
    expect(heightOf(5000)).toBeCloseTo(82);
  });
});

describe('a frog hopping', () => {
  it('sits where she is put until she is asked to hop', () => {
    const h = new Hopper(0);
    expect(h.busy).toBe(false);
    run(h, 0, 3);
    const b = h.body(3, spots);
    expect(b).toMatchObject({ x: 0, y: 50, lift: 0, pose: 'sit' });
  });

  it('crouches, goes through the air in an arc, and lands exactly on the place', () => {
    const h = new Hopper(0);
    expect(h.go(1)).toBe(true);
    h.step(1, spots, { landed: never });
    expect(h.busy).toBe(true);
    expect(h.body(1 + CROUCH / 2, spots).pose, 'low before the spring').toBe('crouch');
    const flight = flightOf(Math.hypot(100, 40));
    const air = h.body(1 + CROUCH + flight / 2, spots);
    expect(air.pose).toBe('air');
    expect(air.lift, 'highest in the middle').toBeCloseTo(heightOf(Math.hypot(100, 40)), 5);
    expect(air.x, 'half way along').toBeCloseTo(50, 5);
    expect(air.through).toBeCloseTo(0.5, 5);
    const landings = run(h, 1, 3);
    expect(landings).toHaveLength(1);
    expect(landings[0]!.place).toBe(1);
    expect(landings[0]!.at).toBeGreaterThanOrEqual(1 + CROUCH + flight);
    expect(landings[0]!.at).toBeLessThan(1 + CROUCH + flight + 0.05);
    const down = h.body(3, spots);
    expect(down).toMatchObject({ x: 100, y: 90, lift: 0, pose: 'sit' });
    expect(h.at).toBe(1);
  });

  it('is low for a moment after she lands, and then stands up', () => {
    const h = new Hopper(0);
    h.go(1);
    const landings = run(h, 0, 2);
    const at = landings[0]!.at;
    const just = h.body(at + 0.02, spots);
    expect(just.sy).toBeLessThan(1);
    expect(just.sx).toBeGreaterThan(1);
    const later = h.body(at + SETTLE + 0.05, spots);
    expect(later.sy).toBe(1);
    expect(later.sx).toBe(1);
  });

  it('faces the way she goes, and keeps facing it on a hop straight up', () => {
    const h = new Hopper(1);
    h.go(0);
    h.step(0, spots, { landed: () => undefined });
    expect(h.body(0.5, spots).face).toBe(-1);
    run(h, 0, 2);
    const flat = (p: number): Point => ({ x: 40, y: p * 60 });
    h.go(2);
    h.step(3, flat, { landed: () => undefined });
    expect(h.body(3.4, flat).face, 'a hop with no way across keeps the way she faced').toBe(-1);
  });

  it('hops along the places she is asked for, one after another, landing on each', () => {
    const h = new Hopper(0);
    for (const place of [1, 2, 3]) expect(h.go(place)).toBe(true);
    const landings = run(h, 0, 6);
    expect(landings.map((l) => l.place)).toEqual([1, 2, 3]);
    for (let i = 1; i < landings.length; i++)
      expect(landings[i]!.at, 'each after the last').toBeGreaterThan(landings[i - 1]!.at + CROUCH);
    expect(h.busy).toBe(false);
  });

  it('will not hop to where she is going, and will not have more than a few waiting', () => {
    const h = new Hopper(0);
    expect(h.go(0), 'where she is').toBe(false);
    expect(h.go(2)).toBe(true);
    expect(h.go(2), 'where she is already going').toBe(false);
    for (let i = 0; i < MOST_WAITING + 3; i++) h.go(3 + i);
    run(h, 0, 20);
    expect(h.at).not.toBe(0);
    h.reset(5);
    expect(h.go(6, 1)).toBe(true);
    expect(h.go(7, 1), 'the limit can be lifted or lowered by the game').toBe(false);
    h.reset(5);
    for (let i = 0; i < 7; i++) expect(h.go(i === 0 ? 6 : 6 + i, 8)).toBe(true);
  });

  it('knows where she is going, for a game that wants to show it', () => {
    const h = new Hopper(0);
    expect(h.target).toBe(0);
    h.go(2);
    h.go(4);
    expect(h.target).toBe(4);
    expect(h.heading).toBe(2);
    h.step(0, spots, { landed: () => undefined });
    expect(h.heading).toBe(2);
    expect(h.target).toBe(4);
  });

  it('follows the screen when a place moves while she is in the air', () => {
    const h = new Hopper(0);
    h.go(1);
    h.step(0, spots, { landed: () => undefined });
    const half = CROUCH + flightOf(Math.hypot(100, 40)) / 2;
    const moved = (p: number): Point => ({ x: p * 200, y: 10 });
    const b = h.body(half, moved);
    expect(b.x).toBeCloseTo(100, 4);
    expect(b.y).toBeCloseTo(10, 4);
  });

  it('is told when she springs, and which way, and how long the hop is', () => {
    const h = new Hopper(0);
    h.go(1);
    const seen: { from: number; to: number; flight: number }[] = [];
    h.step(0.5, spots, {
      left: (from, to, hop) => seen.push({ from, to, flight: hop.flight }),
      landed: () => undefined,
    });
    expect(seen).toEqual([{ from: 0, to: 1, flight: flightOf(Math.hypot(100, 40)) }]);
  });

  it('forgets her hops on a reset and sits at the place she is put', () => {
    const h = new Hopper(0);
    h.go(1);
    h.go(2);
    h.step(0, spots, { landed: () => undefined });
    h.reset(3);
    expect(h.busy).toBe(false);
    expect(h.at).toBe(3);
    expect(h.body(1, spots)).toMatchObject({ x: 300, pose: 'sit' });
  });
});
