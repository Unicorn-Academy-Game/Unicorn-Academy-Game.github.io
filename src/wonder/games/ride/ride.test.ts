import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { Course, type Group, type MotifName } from './course';
import { CRUISE, FASTEST, GRAVITY, LEAP, MOST_BOOST, RIDE_HEIGHT, Runner, SLOWEST } from './runner';
import { HIGHEST, LOWEST, Track } from './track';

const track = (seed = 7, to = 30000): Track => {
  const t = new Track(new Rng(seed));
  t.extend(to);
  return t;
};

describe('the rainbow', () => {
  it('is one height at every place, smooth, and flat only where one hill meets the next', () => {
    const t = track();
    for (const h of t.all) {
      expect(t.heightAt(h.x0)).toBeCloseTo(h.y0, 6);
      expect(t.heightAt(h.x1)).toBeCloseTo(h.y1, 6);
      expect(t.slopeAt(h.x0 + 0.0001)).toBeCloseTo(0, 3);
      expect(t.slopeAt(h.x1 - 0.0001)).toBeCloseTo(0, 3);
      // No step at the join: the height a hair either side is the same.
      expect(Math.abs(t.heightAt(h.x1 - 0.01) - t.heightAt(h.x1 + 0.01))).toBeLessThan(0.05);
    }
  });

  it('knows its own slope: the height changes by about the slope for each unit along', () => {
    const t = track();
    for (let x = 0; x < 20000; x += 37.3) {
      const measured = (t.heightAt(x + 0.5) - t.heightAt(x - 0.5)) / 1;
      expect(measured).toBeCloseTo(t.slopeAt(x), 2);
    }
  });

  it('is the same for the same seed and different for another', () => {
    const a = track(3, 8000);
    const b = track(3, 8000);
    const c = track(4, 8000);
    expect(a.all).toEqual(b.all);
    expect(a.all).not.toEqual(c.all);
  });

  it('never wanders off the top or the bottom, however long the ride', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = track(seed, 120000);
      for (let x = 0; x < 120000; x += 25) {
        const y = t.heightAt(x);
        expect(y).toBeGreaterThanOrEqual(HIGHEST - 0.5);
        expect(y).toBeLessThanOrEqual(LOWEST + 0.5);
      }
    }
  });

  it('is never bent so sharply that its colours would fold over themselves', () => {
    // The stripes are 50 units across, so the middle must curve more gently than a circle of 25
    // units, with room to spare.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const t = track(seed, 60000);
      for (let x = 0; x < 60000; x += 9) {
        const s = t.slopeAt(x);
        const radius = (1 + s * s) ** 1.5 / Math.max(1e-9, Math.abs(t.bendAt(x)));
        expect(radius).toBeGreaterThan(45);
      }
    }
  });

  it('falls and rises in turn, so every flat place is a top or a bottom', () => {
    const t = track();
    const hills = t.all.slice(1);
    let turns = 0;
    for (let i = 1; i < hills.length; i++) {
      const before = Math.sign(hills[i - 1]!.y1 - hills[i - 1]!.y0);
      const now = Math.sign(hills[i]!.y1 - hills[i]!.y0);
      if (before === now) turns++;
    }
    // A hill held to the limits may be followed by one of its own direction, but never often.
    expect(turns).toBeLessThan(hills.length * 0.05);
  });

  it('finds a valley to hand over at, and can be cut there and nowhere else', () => {
    const t = new Track(new Rng(11));
    const v = t.valleyAfter(500, 1200);
    expect(v.x).toBeGreaterThanOrEqual(1700);
    expect(t.slopeAt(v.x)).toBeCloseTo(0, 6);
    expect(t.heightAt(v.x)).toBeCloseTo(v.y, 6);
    expect(t.heightAt(v.x - 40)).toBeLessThan(v.y);
    expect(() => t.cut(v.x + 13)).toThrow(/can only be cut/);
    t.cut(v.x);
    expect(t.end).toBeCloseTo(v.x, 6);
    expect(t.heightAt(v.x + 500)).toBeCloseTo(v.y, 6);
  });

  it('lets go of what is far behind without losing where she is', () => {
    const t = track(5, 20000);
    const before = t.heightAt(15000);
    t.forget(15000);
    expect(t.heightAt(15000)).toBe(before);
    expect(t.all.length).toBeLessThan(20);
  });
});

/** Rides a track, tapping at the moments `taps` says, and calls `each` after every step. */
function ride(
  t: Track,
  seconds: number,
  opts: {
    taps?: (r: Runner, time: number) => boolean;
    each?: (r: Runner, time: number) => void;
    boost?: number;
    speed?: number;
  } = {},
): Runner {
  const r = new Runner(t, -300, opts.speed ?? CRUISE);
  if (opts.boost) r.speedUp(opts.boost);
  const dt = 1 / 60;
  for (let time = 0; time < seconds; time += dt) {
    if (opts.taps?.(r, time)) r.tap();
    r.step(dt);
    opts.each?.(r, time);
  }
  return r;
}

describe('the rider', () => {
  it('never stops and never runs away, whatever the rainbow does', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = track(seed);
      let slowest = Infinity;
      let fastest = 0;
      const r = ride(t, 80, {
        each: (run) => {
          const v = Math.hypot(run.vx, run.vy);
          slowest = Math.min(slowest, run.vx);
          fastest = Math.max(fastest, v);
        },
      });
      expect(slowest).toBeGreaterThan(SLOWEST * 0.6);
      expect(fastest).toBeLessThan(FASTEST * 1.6);
      // Eighty seconds at no less than the slowest speed is a long way.
      expect(r.x).toBeGreaterThan(80 * SLOWEST * 0.8);
    }
  });

  it('speeds up on a fall and slows on a rise, and is back at her own speed on the flat', () => {
    const t = track(2);
    let fall = 0;
    let rise = 0;
    ride(t, 60, {
      each: (r) => {
        if (!r.grounded) return;
        const s = t.slopeAt(r.x);
        if (s > 0.35) fall = Math.max(fall, r.speed);
        if (s < -0.35) rise = rise === 0 ? r.speed : Math.min(rise, r.speed);
      },
    });
    expect(fall).toBeGreaterThan(CRUISE + 40);
    expect(rise).toBeLessThan(CRUISE - 30);
  });

  it('leaps on a tap, steps off the air on a second, and cannot go up forever', () => {
    const t = new Track(new Rng(1));
    t.extend(3000);
    const r = new Runner(t, -300);
    const start = r.y;
    r.tap();
    expect(r.step(1 / 60).leap).toBe(1);
    expect(r.grounded).toBe(false);
    let one = start;
    for (let i = 0; i < 25; i++) {
      r.step(1 / 60);
      one = Math.min(one, r.y);
    }
    r.tap();
    let leap = 0;
    for (let i = 0; i < 4 && leap === 0; i++) leap = r.step(1 / 60).leap;
    expect(leap).toBe(2);
    let two = one;
    for (let i = 0; i < 60; i++) {
      // More taps in the same air do nothing.
      r.tap();
      expect(r.step(1 / 60).leap).toBe(0);
      two = Math.min(two, r.y);
    }
    expect(start - one).toBeGreaterThan((LEAP ** 2 / (2 * GRAVITY)) * 0.85);
    expect(one - two).toBeGreaterThan(20);
    expect(start - two).toBeLessThan(260);
  });

  it('leaps again the moment she lands when the tap came just before she did', () => {
    const t = new Track(new Rng(1));
    t.extend(3000);
    const r = new Runner(t, -300);
    r.tap();
    r.step(1 / 60);
    for (let i = 0; i < 12; i++) r.step(1 / 60);
    // Both her leaps are used, so a tap now has nowhere to go but the landing.
    r.tap();
    expect(r.step(1 / 60).leap).toBe(2);
    while (!(r.vy > 0 && r.lift < RIDE_HEIGHT + 30)) r.step(1 / 60);
    r.tap();
    let landed = false;
    for (let i = 0; i < 30 && !landed; i++) {
      const m = r.step(1 / 60);
      if (m.landed > 0) {
        landed = true;
        expect(m.leap).toBe(1);
        expect(r.grounded).toBe(false);
      }
    }
    expect(landed).toBe(true);
  });

  it('still leaps from a hilltop for a moment after she has left it', () => {
    const t = track(3);
    const r = new Runner(t, -300);
    let waited = -1;
    for (let time = 0; time < 120 && waited < 0; time += 1 / 60) {
      r.speedUp(MOST_BOOST);
      if (r.step(1 / 60).crest) waited = 0;
    }
    expect(waited).toBe(0);
    // A few frames after she left, a tap is a leap from the rainbow, with all her height.
    for (let i = 0; i < 3; i++) r.step(1 / 60);
    r.tap();
    expect(r.step(1 / 60).leap).toBe(1);
    expect(r.leaps).toBe(1);
  });

  it('is never under the rainbow, with any taps at any times', () => {
    for (const seed of [1, 2, 3]) {
      const t = track(seed);
      const rng = new Rng(seed * 101);
      let worst = -Infinity;
      ride(t, 120, {
        boost: 1,
        taps: () => rng.next() < 0.06,
        each: (r) => {
          worst = Math.max(worst, r.y - (t.heightAt(r.x) - RIDE_HEIGHT));
        },
      });
      expect(worst).toBeLessThan(0.001);
    }
  });

  it('leaves the top of a hill when she is fast enough, and not when she is slow', () => {
    const t = track(3);
    const crests = (boost: number): number => {
      let n = 0;
      ride(t, 60, { boost, each: (r) => void (r.moments.crest && n++) });
      return n;
    };
    // A boost fades in a couple of seconds, so it is renewed every step to hold her fast.
    let held = 0;
    const r = new Runner(t, -300);
    for (let time = 0; time < 60; time += 1 / 60) {
      r.speedUp(MOST_BOOST);
      if (r.step(1 / 60).crest) held++;
    }
    expect(held).toBeGreaterThan(2);
    expect(crests(0)).toBeLessThanOrEqual(held);
  });

  it('is faster with a boost, and the boost fades away', () => {
    const t = track(1, 5000);
    const r = new Runner(t, -300);
    r.speedUp(1);
    const first = r.target;
    expect(first).toBeGreaterThan(CRUISE + 100);
    for (let i = 0; i < 60 * 4; i++) r.step(1 / 60);
    expect(r.boost).toBe(0);
    expect(r.target).toBe(CRUISE);
  });
});

describe('what hangs along the rainbow', () => {
  const made = (seed: number, to = 9000): { t: Track; c: Course } => {
    const t = new Track(new Rng(seed));
    const c = new Course(t, new Rng(seed + 1000), -300);
    c.fill(to);
    return { t, c };
  };

  it('is the same for the same seed', () => {
    const a = made(5);
    const b = made(5);
    expect(a.c.stars).toEqual(b.c.stars);
    expect(a.c.hoops).toEqual(b.c.hoops);
  });

  it('starts with stars to ride through, and brings in the harder things as she goes', () => {
    const { c } = made(9, 12000);
    expect(c.groups[0]!.motif).toBe('trail');
    const seen = new Set<MotifName>(c.groups.map((g) => g.motif));
    expect(seen.has('arc')).toBe(true);
    expect(seen.has('hoop')).toBe(true);
    // Nothing that wants a step off the air comes in the first stretch.
    for (const g of c.groups) if (g.x < 1000) expect(['trail', 'arc', 'hoop']).toContain(g.motif);
  });

  it('puts every star and hoop above the rainbow, never in it', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { t, c } = made(seed, 14000);
      for (const s of c.stars) expect(s.y).toBeLessThan(t.heightAt(s.x) - RIDE_HEIGHT + 5);
      for (const h of c.hoops) expect(h.y).toBeLessThan(t.heightAt(h.x) - 20);
    }
  });

  it('counts the members of each group, so a whole one can be told', () => {
    const { c } = made(6, 12000);
    for (const g of c.groups) {
      const members = c.stars.filter((s) => s.group === g.id).length + c.hoops.filter((h) => h.group === g.id).length;
      expect(members, `${g.motif} at ${g.x.toFixed(0)}`).toBe(g.size);
      expect(g.size).toBeGreaterThan(0);
    }
  });

  it('pays the bonus once, on the last of a group', () => {
    const { c } = made(6, 3000);
    const g = c.groups[0]!;
    const mine = c.stars.filter((s) => s.group === g.id);
    let paid = 0;
    for (const s of mine) paid += c.take(s);
    expect(paid).toBe(g.bonus);
    expect(c.take(mine[0]!)).toBe(0);
  });

  it('can be gathered: a rider who rides through the trails and leaps where an arc begins takes most of what is hung', () => {
    const fractions = new Map<MotifName, number[]>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { t, c } = made(seed, 11000);
      const r = new Runner(t, -300);
      const leapAt = new Map<number, Group>();
      for (const g of c.groups) if (g.motif !== 'trail' && g.motif !== 'hoop') leapAt.set(g.id, g);
      const taken = new Set<unknown>();
      const pending = [...leapAt.values()].sort((a, b) => a.x - b.x);
      let stepAfter = -1;
      for (let time = 0; time < 120 && r.x < 10500; time += 1 / 60) {
        const next = pending[0];
        if (next && r.x >= next.x && r.grounded) {
          r.tap();
          stepAfter = next.motif === 'double' || next.motif === 'crown' ? 0.36 : next.motif === 'heart' ? 0.3 : -1;
          pending.shift();
        }
        if (stepAfter >= 0 && !r.grounded && r.air >= stepAfter) {
          r.tap();
          stepAfter = -1;
        }
        r.step(1 / 60);
        for (const s of c.stars) {
          if (!s.taken && Math.hypot(s.x - r.x, s.y - r.y) < 40) {
            c.take(s);
            taken.add(s);
          }
        }
        for (const h of c.hoops) {
          if (!h.taken && Math.abs(h.x - r.x) < 12 && Math.abs(h.y - r.y) < h.radius) {
            c.takeHoop(h);
            r.speedUp(1);
          }
        }
      }
      for (const g of c.groups) {
        if (g.x > 10000) continue;
        const list = fractions.get(g.motif) ?? [];
        list.push(g.got / g.size);
        fractions.set(g.motif, list);
      }
    }
    const report = [...fractions]
      .map(([m, f]) => `${m} ${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)} of ${f.length}`)
      .join(', ');
    for (const [motif, list] of fractions) {
      const mean = list.reduce((a, b) => a + b, 0) / list.length;
      expect(mean, `${motif}: ${report}`).toBeGreaterThan(motif === 'trail' || motif === 'hoop' ? 0.9 : 0.6);
    }
  });

  it('gives a rider who only rides, and never taps, a trail and a hoop at a time to gather', () => {
    let points = 0;
    const { t, c } = made(2, 7000);
    const r = new Runner(t, -300);
    for (let time = 0; time < 60 && r.x < 6500; time += 1 / 60) {
      r.step(1 / 60);
      for (const s of c.stars) {
        if (!s.taken && Math.hypot(s.x - r.x, s.y - r.y) < 40) {
          c.take(s);
          points += s.value;
        }
      }
      for (const h of c.hoops) {
        if (!h.taken && Math.abs(h.x - r.x) < 12 && Math.abs(h.y - r.y) < h.radius) {
          c.takeHoop(h);
          points += 4;
          r.speedUp(1);
        }
      }
    }
    expect(points).toBeGreaterThan(30);
  });

  it('stops placing when it is cut, and lets go of what she has passed', () => {
    const { c } = made(3, 5000);
    const before = c.stars.length;
    c.cut(3000);
    expect(c.stars.every((s) => s.x <= 3000)).toBe(true);
    expect(c.stars.length).toBeLessThan(before);
    c.fill(9000);
    expect(c.stars.every((s) => s.x <= 3000)).toBe(true);
    c.forget(2900);
    expect(c.stars.every((s) => s.x >= 2400)).toBe(true);
  });
});
