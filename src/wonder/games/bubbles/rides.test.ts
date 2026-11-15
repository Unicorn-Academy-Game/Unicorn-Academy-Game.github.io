import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { UNICORN_IDS } from '../../../shared/ids';
import type { Named } from '../../engine/screens';
import { SCREENS } from '../../engine/screens';
import { Audience } from '../sky/audience';
import { Field } from './field';
import { FRIEND, planOf } from './layout';
import { bubbleFor, fallSeconds, type Happened, type Ride, Rides } from './rides';

const STEP = 1 / 60;

interface Setup {
  readonly rng: Rng;
  readonly field: Field;
  readonly plan: ReturnType<typeof planOf>;
  readonly audience: Audience;
  readonly rides: Rides;
  now: number;
}

function setup(s: Named, friends = 4, seed = 3): Setup {
  const rng = new Rng(seed);
  const field = new Field(rng);
  const plan = planOf(s);
  const audience = new Audience(null, rng, [255, 255, 255]);
  audience.stand(UNICORN_IDS.slice(0, friends), s.w, plan.standFrom, plan.feet, 0, 0, {
    side: 'right',
    maxScale: plan.friends.scale,
  });
  return { rng, field, plan, audience, rides: new Rides(field, rng), now: 0 };
}

/** Lets time go by the way the game does it, and tells everything that happened. */
function run(g: Setup, seconds: number, each: () => void = () => {}): Happened[] {
  const told: Happened[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    g.now += STEP;
    // The air moves first and the friends follow it, as the game does it, so she is always exactly
    // where her bubble is.
    g.field.step(STEP, g.now, g.plan.air);
    told.push(...g.rides.update(STEP, g.now, g.plan));
    g.audience.update(g.now);
    each();
  }
  return told;
}

const screen = SCREENS[0]!;

describe('a bubble blown round a friend', () => {
  it('swells round her where she stands, with nobody inside it but her, and she trots', () => {
    const g = setup(screen);
    const f = g.audience.members[1]!;
    const ride = g.rides.start(f, g.plan, g.now)!;
    expect(ride).not.toBeNull();
    const b = ride.bubble!;
    expect(b.rider).toBe(f.id);
    expect(b.prizes).toEqual([]);
    expect(b.x).toBe(f.x);
    expect(b.rTo).toBeCloseTo(bubbleFor(f.scale), 6);
    expect(b.r).toBeLessThan(b.rTo * 0.3);
    // Her middle is the middle of it, and her hooves are lower.
    expect(b.y).toBeLessThan(f.y);
    expect(b.y).toBeGreaterThan(f.y - FRIEND * f.scale);
    expect(f.clip).toBe('walk');
    expect(g.rides.riding(f)).toBe(true);
    expect(g.rides.of(b)).toBe(ride);
    run(g, 0.5);
    expect(f.lift).toBeCloseTo(0, 6);
  });

  it('is only blown once for one friend, and a second friend can have one too', () => {
    const g = setup(screen);
    const [a, b] = g.audience.members as [(typeof g.audience.members)[number], (typeof g.audience.members)[number]];
    expect(g.rides.start(a, g.plan, 0)).not.toBeNull();
    expect(g.rides.start(a, g.plan, 0)).toBeNull();
    expect(g.rides.start(b, g.plan, 0)).not.toBeNull();
    expect(g.rides.list).toHaveLength(2);
    expect(g.field.bubbles).toHaveLength(2);
  });

  it('lifts her into the sky, where she hangs, and keeps her inside her bubble all the way', () => {
    const g = setup(screen);
    const f = g.audience.members[0]!;
    const ride = g.rides.start(f, g.plan, g.now)!;
    const b = ride.bubble!;
    let highest = 0;
    run(g, 12, () => {
      expect(Number.isFinite(f.lift) && Number.isFinite(f.x)).toBe(true);
      expect(f.lift).toBeGreaterThanOrEqual(0);
      // Her feet are in the bubble, near the bottom of it, once it has swelled round her.
      const feet = f.y - f.lift;
      if (b.r > b.rTo * 0.97) expect(Math.abs(feet - b.y)).toBeLessThan(b.r);
      expect(Math.abs(f.x - b.x)).toBeLessThan(0.001);
      highest = Math.max(highest, f.lift);
    });
    expect(ride.phase).toBe('hover');
    expect(highest).toBeGreaterThan(60);
    // The bubble is over the garden, on the screen, and below the meter.
    expect(b.y - b.r).toBeGreaterThan(g.plan.roam.top - 8);
    expect(b.x - b.r).toBeGreaterThan(-1);
    expect(b.x + b.r).toBeLessThan(g.plan.w + 1);
  });

  it('makes her, and the bubble, bigger the higher it takes her, so she is easy to see, and the size she was when she lands', () => {
    const g = setup(screen);
    const f = g.audience.members[1]!;
    const was = f.scale;
    const ride = g.rides.start(f, g.plan, g.now)!;
    const b = ride.bubble!;
    run(g, 0.6);
    expect(f.scale).toBeCloseTo(was, 3);
    run(g, 8);
    expect(f.scale).toBeGreaterThan(was * 1.15);
    expect(b.rTo).toBeCloseTo(bubbleFor(f.scale), 6);
    expect(b.rTo).toBeGreaterThan(bubbleFor(was) * 1.15);
    g.field.remove(b);
    g.rides.burst(ride, g.now);
    let last = f.scale;
    run(g, fallSeconds(f.lift) + 0.2, () => {
      expect(f.scale).toBeLessThanOrEqual(last + 1e-9);
      last = f.scale;
    });
    expect(f.scale).toBe(was);
  });

  it('turns her to face the way she goes', () => {
    const g = setup(screen);
    const f = g.audience.members[0]!;
    const ride = g.rides.start(f, g.plan, 0)!;
    const faces = new Set<string>();
    run(g, 6, () => {
      if (Math.abs(ride.bubble!.vx) > 8) faces.add(`${Math.sign(ride.bubble!.vx)}:${f.facing}`);
    });
    for (const k of faces) expect(k === '1:east' || k === '-1:west').toBe(true);
  });

  it('floats her down to where she stood when it bursts, and she stands as she did', () => {
    const g = setup(screen);
    const f = g.audience.members[2]!;
    const home = { x: f.x, y: f.y, facing: f.facing };
    const ride = g.rides.start(f, g.plan, g.now)!;
    run(g, 6);
    expect(f.lift).toBeGreaterThan(40);
    const from = f.lift;
    g.field.remove(ride.bubble!);
    g.rides.burst(ride, g.now);
    expect(ride.bubble).toBeNull();
    let last = f.lift;
    let rises = 0;
    const told = run(g, fallSeconds(from) + 0.2, () => {
      if (f.lift > last + 2.5) rises++;
      last = f.lift;
    });
    expect(told.map((t) => t.is)).toEqual(['landed']);
    expect(rises).toBe(0);
    expect(f.lift).toBe(0);
    expect(f.x).toBeCloseTo(home.x, 6);
    expect(f.y).toBe(home.y);
    expect(f.facing).toBe(home.facing);
    expect(f.clip).toBe('idle');
    expect(g.rides.riding(f)).toBe(false);
    expect(g.rides.list).toHaveLength(0);
  });

  it('comes down by itself if she leaves her in it long enough, bursts softly at the bottom of the air, and she lands', () => {
    const g = setup(screen);
    const f = g.audience.members[0]!;
    const ride = g.rides.start(f, g.plan, g.now)!;
    const told = run(g, 40);
    expect(told.map((t) => t.is)).toEqual(['drifted', 'landed']);
    const drifted = told[0] as Extract<Happened, { is: 'drifted' }>;
    expect(drifted.ride).toBe(ride);
    expect(drifted.y).toBeGreaterThan(g.plan.air.floor - 90);
    expect(g.field.bubbles).toHaveLength(0);
    expect(f.lift).toBe(0);
    expect(g.rides.list).toHaveLength(0);
  });

  it('puts her down all the same if her bubble is taken from the air some other way', () => {
    const g = setup(screen);
    const f = g.audience.members[0]!;
    const ride = g.rides.start(f, g.plan, g.now)!;
    run(g, 4);
    g.field.clear();
    const told = run(g, 3);
    expect(ride.bubble).toBeNull();
    expect(told.map((t) => t.is)).toEqual(['landed']);
    expect(f.lift).toBe(0);
  });

  it('is quicker when it is part of a show: it swells, and takes her up, in less time', () => {
    const slow = setup(screen);
    const quick = setup(screen);
    const a = slow.rides.start(slow.audience.members[0]!, slow.plan, 0)!;
    const b = quick.rides.start(quick.audience.members[0]!, quick.plan, 0, true)!;
    run(slow, 1.8);
    run(quick, 1.8);
    expect(b.friend.lift).toBeGreaterThan(a.friend.lift + 15);
  });

  it('may be burst the moment it is blown, before it has lifted her at all', () => {
    const g = setup(screen);
    const f = g.audience.members[0]!;
    const ride = g.rides.start(f, g.plan, g.now)!;
    run(g, 0.1);
    g.field.remove(ride.bubble!);
    g.rides.burst(ride, g.now);
    const told = run(g, 2);
    expect(told.map((t) => t.is)).toEqual(['landed']);
    expect(f.lift).toBe(0);
    expect(f.x).toBeCloseTo(ride.home.x, 6);
  });

  it('keeps every friend in a bubble of her own, apart, when all of them are lifted', () => {
    const g = setup(SCREENS[4]!, 5);
    const rides: Ride[] = g.audience.members.map((m) => g.rides.start(m, g.plan, 0)!);
    run(g, 14);
    const spots = rides.map((r) => r.spot);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++)
        expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(30);
    }
    for (const r of rides) expect(r.bubble).not.toBeNull();
  });

  it('puts everyone down and takes the bubbles away when it is cleared', () => {
    const g = setup(screen);
    const homes = g.audience.members.map((m) => ({ x: m.x, facing: m.facing }));
    for (const m of g.audience.members) g.rides.start(m, g.plan, 0);
    run(g, 5);
    expect(g.audience.members.some((m) => m.lift > 10)).toBe(true);
    g.rides.clear();
    expect(g.field.bubbles).toHaveLength(0);
    expect(g.rides.list).toHaveLength(0);
    g.audience.members.forEach((m, i) => {
      expect(m.lift).toBe(0);
      expect(m.x).toBeCloseTo(homes[i]!.x, 6);
      expect(m.facing).toBe(homes[i]!.facing);
    });
  });
});

describe('a ride on every screen', () => {
  for (const s of SCREENS) {
    it(`takes a friend up and down again and keeps her on the screen, on ${s.name}`, () => {
      const g = setup(s, 5);
      const f = g.audience.members[0]!;
      g.rides.start(f, g.plan, 0);
      const told = run(g, 40, () => {
        expect(f.x).toBeGreaterThan(0);
        expect(f.x).toBeLessThan(g.plan.w);
        expect(f.y - f.lift).toBeGreaterThan(g.plan.roam.top - 10);
      });
      expect(told.map((t) => t.is)).toEqual(['drifted', 'landed']);
    });
  }
});
