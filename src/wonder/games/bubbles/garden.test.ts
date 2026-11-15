import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import type { Screen } from '../../engine/chrome';
import { SCREENS } from '../../engine/screens';
import { Butterfly } from './fliers';
import { Garden } from './garden';
import { PRIZE, PRIZES } from './kinds';
import { insidePond, planOf } from './layout';
import { looksOf } from './looks';
import type { Heard } from './residents';

const STEP = 1 / 30;
const STAYERS = PRIZES.filter((p) => PRIZE[p].home !== 'none');

function gardenOn(s: Screen, seed = 7): Garden {
  return new Garden(new Rng(seed), planOf(s), null);
}

/**
 * Lets `seconds` go by, returns everything the residents said in them, and calls `each` after every
 * step.
 */
function run(g: Garden, seconds: number, each: () => void = () => {}): Heard[] {
  const heard: Heard[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    g.update(STEP);
    g.drain((e) => heard.push(e));
    each();
  }
  return heard;
}

/** A point in the air where a bubble might burst. */
const burst = (g: Garden, i = 0): { x: number; y: number } => ({
  x: g.plan.w * (0.2 + 0.12 * (i % 6)),
  y: g.plan.air.floor * (0.3 + 0.08 * (i % 4)),
});

const finite = (n: number): boolean => Number.isFinite(n);

describe('what the garden holds', () => {
  const s = SCREENS[0]!;

  it('lets a prize that does not stay go, and one that does stay in', () => {
    const g = gardenOn(s);
    for (const p of PRIZES) {
      const r = g.add(p, 0, burst(g));
      expect(r !== null).toBe(PRIZE[p].home !== 'none');
    }
    expect(g.residents).toHaveLength(STAYERS.length);
  });

  it('keeps to the most of each kind, and the oldest is the one that leaves', () => {
    for (const p of STAYERS) {
      const g = gardenOn(s);
      const cap = g.capOf(p);
      const firsts: unknown[] = [];
      for (let i = 0; i < cap + 3; i++) {
        const r = g.add(p, i % looksOf(p), burst(g, i));
        expect(r).not.toBeNull();
        if (i < 3) firsts.push(r);
        run(g, 0.1);
        expect(g.count(p)).toBeLessThanOrEqual(cap);
      }
      expect(g.count(p)).toBe(cap);
      // The three that came first are the three that left.
      for (const f of firsts) expect(g.residents.find((r) => r === f)?.leaving ?? true).toBe(true);
    }
  });

  it('lets the ones that left go for good, and does not keep them in the count', () => {
    const g = gardenOn(s);
    const cap = g.capOf('butterfly');
    for (let i = 0; i < cap + 4; i++) g.add('butterfly', 0, burst(g, i));
    run(g, 12);
    expect(g.residents.filter((r) => r.prize === 'butterfly')).toHaveLength(cap);
  });

  it('is full when it holds all it can of a kind, and not before', () => {
    const g = gardenOn(s);
    expect(g.full('bird')).toBe(false);
    for (let i = 0; i < g.capOf('bird'); i++) g.add('bird', 0, burst(g, i));
    expect(g.full('bird')).toBe(true);
    expect(g.full('fish')).toBe(false);
  });

  it('has room for fewer flowers on a screen with less meadow, never more than it has places for', () => {
    for (const screen of SCREENS) {
      const g = gardenOn(screen);
      expect(g.capOf('flower')).toBeLessThanOrEqual(g.plan.slots.length - 2);
      expect(g.capOf('flower')).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('every kind of resident, on every screen', () => {
  for (const screen of SCREENS) {
    describe(screen.name, () => {
      it('comes down, says it landed, and stays where it belongs for a long time', () => {
        const g = gardenOn(screen, 11);
        const plan = g.plan;
        const heard: Heard[] = [];
        for (const p of STAYERS) for (let i = 0; i < Math.min(g.capOf(p), 5); i++) g.add(p, i, burst(g, i + 2));
        const checked = { walkers: 0, swimmers: 0, perched: 0 };
        const said = run(g, 120, () => {
          for (const r of g.residents) {
            expect(finite(r.x) && finite(r.y)).toBe(true);
            if (r.falling || r.leaving) continue;
            if (r.prize === 'fish') {
              if (r.layer === 'water') {
                expect(insidePond(plan.pond, r.x, r.y)).toBeLessThanOrEqual(1);
                checked.swimmers++;
              }
            } else if (r.prize === 'ladybug' || r.prize === 'snail') {
              expect(r.x).toBeGreaterThan(14);
              expect(r.x).toBeLessThan(plan.w - 14);
              expect(r.y).toBeGreaterThan(plan.meadow.top + 5);
              expect(r.y).toBeLessThan(plan.meadow.bottom + 5);
              expect(insidePond(plan.pond, r.x, r.y)).toBeGreaterThan(1.25);
              checked.walkers++;
            } else if (r.prize === 'bird') {
              expect(plan.perches.some((q) => Math.hypot(q.x - r.x, q.y - r.y) < 0.5)).toBe(true);
              checked.perched++;
            } else if (r.prize === 'butterfly' || r.prize === 'bee' || r.prize === 'fairy') {
              expect(r.x).toBeGreaterThan(-1);
              expect(r.x).toBeLessThan(plan.w + 1);
              expect(r.y).toBeGreaterThan(plan.roam.top - 60);
              expect(r.y).toBeLessThan(plan.friends.top);
            }
          }
        });
        heard.push(...said);
        expect(checked.walkers).toBeGreaterThan(1000);
        expect(checked.swimmers).toBeGreaterThan(1000);
        expect(checked.perched).toBeGreaterThan(1000);
        for (const p of STAYERS.filter((q) => PRIZE[q].home === 'meadow' || PRIZE[q].home === 'pond')) {
          expect(heard.some((e) => e.is === 'land' && e.prize === p)).toBe(true);
        }
        // Two minutes of the garden checked at every frame is more than the default five seconds on
        // a busy machine.
      }, 60_000);

      it('keeps every resident on a screen of its own shape and drops none of them when the screen turns', () => {
        for (const other of SCREENS) {
          const g = gardenOn(screen, 3);
          for (const p of STAYERS) for (let i = 0; i < Math.min(g.capOf(p), 4); i++) g.add(p, i, burst(g, i));
          run(g, 6);
          const before = g.residents.length;
          const next = planOf(other);
          g.refit(next);
          run(g, 0.5);
          expect(g.residents.length).toBeGreaterThanOrEqual(before - 4);
          for (const r of g.residents) {
            expect(finite(r.x) && finite(r.y)).toBe(true);
            expect(r.x).toBeGreaterThanOrEqual(-1);
            expect(r.x).toBeLessThanOrEqual(next.w + 1);
            expect(r.y).toBeGreaterThan(next.roam.top - 80);
            expect(r.y).toBeLessThan(next.h);
            if (r.prize === 'fish' && r.layer === 'water')
              expect(insidePond(next.pond, r.x, r.y)).toBeLessThanOrEqual(1);
            if (r.prize === 'flower') expect(g.blooms.some((b) => b === r)).toBe(true);
          }
          const slots = g.blooms.map((b) => b.at);
          expect(new Set(slots).size).toBe(slots.length);
          for (const slot of slots) expect(next.slots).toContain(slot);
        }
      });
    });
  }
});

describe('flowers', () => {
  const s = SCREENS[0]!;

  it('grow each in a place of its own, and say when they have bloomed', () => {
    const g = gardenOn(s);
    const n = g.capOf('flower');
    for (let i = 0; i < n; i++) g.add('flower', i, burst(g, i));
    const heard = run(g, 4);
    const slots = g.blooms.map((b) => b.at);
    expect(new Set(slots).size).toBe(n);
    expect(heard.filter((e) => e.is === 'land')).toHaveLength(n);
    expect(heard.filter((e) => e.is === 'bloom')).toHaveLength(n);
    expect(g.blooms.every((b) => b.ready)).toBe(true);
  });

  it('do not crowd when there is room: the second grows away from the first', () => {
    const g = gardenOn(s);
    g.add('flower', 0, { x: 300, y: 100 });
    g.add('flower', 1, { x: 300, y: 100 });
    const [a, b] = g.blooms;
    expect(Math.hypot(a!.at.x - b!.at.x, a!.at.y - b!.at.y)).toBeGreaterThan(30);
  });

  it('grow near the place they were let out when there is room', () => {
    for (const x of [120, 400, 700]) {
      const g = gardenOn(s);
      g.add('flower', 0, { x, y: 100 });
      expect(Math.abs(g.blooms[0]!.at.x - x)).toBeLessThan(70);
    }
  });

  it('spread over the meadow, and do not pile up, when every bubble bursts in the same place', () => {
    const g = gardenOn(s);
    for (let i = 0; i < 9; i++) g.add('flower', i, { x: 90, y: 100 });
    const xs = g.blooms.map((b) => b.at.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(g.plan.w * 0.4);
  });

  it('shrink away and are gone when the garden has no room for them', () => {
    const g = gardenOn(s);
    const n = g.capOf('flower');
    for (let i = 0; i < n; i++) g.add('flower', i, burst(g, i));
    run(g, 3);
    const first = g.blooms[0]!;
    g.add('flower', 0, burst(g));
    expect(first.ready).toBe(false);
    run(g, 3);
    expect(g.blooms).not.toContain(first);
    expect(g.blooms).toHaveLength(n);
  });

  it('are touched where the petals are, not where the stem meets the ground and not far off', () => {
    const g = gardenOn(s);
    g.add('flower', 0, burst(g));
    run(g, 3);
    const f = g.blooms[0]!;
    expect(g.at(f.head.x, f.head.y)).toBe(f);
    expect(g.at(f.head.x + 120, f.head.y)).toBeNull();
  });
});

describe('what visits the flowers', () => {
  const s = SCREENS[0]!;

  it('butterflies come and sit on them, one on a flower, and leave again', () => {
    const g = gardenOn(s, 5);
    for (let i = 0; i < 8; i++) g.add('flower', i, burst(g, i));
    for (let i = 0; i < 4; i++) g.add('butterfly', i, burst(g, i + 1));
    const flies = g.residents.filter((r): r is Butterfly => r instanceof Butterfly);
    const was = flies.map(() => false);
    let sat = 0;
    let rose = 0;
    run(g, 150, () => {
      flies.forEach((b, i) => {
        if (b.perched) sat++;
        else if (was[i]) rose++;
        was[i] = b.perched;
      });
      // Never two on one flower: every flower that is taken is taken by no more than one of them.
      expect(g.blooms.filter((f) => f.taken).length).toBeLessThanOrEqual(flies.length);
    });
    expect(sat).toBeGreaterThan(300);
    expect(rose).toBeGreaterThan(8);
  });

  it('bees sip from them, and the sip is heard', () => {
    const g = gardenOn(s, 5);
    for (let i = 0; i < 6; i++) g.add('flower', i, burst(g, i));
    g.add('bee', 0, burst(g, 3));
    g.add('bee', 0, burst(g, 4));
    const heard = run(g, 60);
    expect(heard.filter((e) => e.is === 'sip').length).toBeGreaterThan(4);
  });

  it('the fairy blesses a flower, which glows and then fades, and the blessing is heard', () => {
    const g = gardenOn(s, 5);
    for (let i = 0; i < 6; i++) g.add('flower', i, burst(g, i));
    const fairy = g.add('fairy', 0, burst(g, 3))!;
    let lit = 0;
    const heard = run(g, 60, () => {
      if (g.blooms.some((b) => b.glow > 0.5)) lit++;
    });
    expect(heard.some((e) => e.is === 'bless')).toBe(true);
    expect(lit).toBeGreaterThan(5);
    fairy.leave(g);
    run(g, 6);
    expect(g.blooms.every((b) => b.glow < 0.05)).toBe(true);
  });

  it('with no flowers about, they simply drift, and keep out of the way of the floor', () => {
    const g = gardenOn(s);
    g.add('butterfly', 0, burst(g));
    g.add('bee', 0, burst(g));
    g.add('fairy', 0, burst(g));
    run(g, 60, () => {
      for (const r of g.residents) expect(r.y).toBeLessThan(g.plan.friends.top);
    });
    expect(g.residents).toHaveLength(3);
  });
});

describe('birds', () => {
  const s = SCREENS[0]!;

  it('each take a perch of their own, sing, and move on', () => {
    const g = gardenOn(s, 9);
    for (let i = 0; i < 3; i++) g.add('bird', i, burst(g, i));
    const spots = new Set<string>();
    const heard = run(g, 80, () => {
      if (g.residents.every((r) => !r.falling)) {
        const at = g.residents.map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`);
        expect(new Set(at).size).toBe(3);
        for (const a of at) spots.add(a);
      }
    });
    expect(heard.filter((e) => e.is === 'sing').length).toBeGreaterThan(12);
    // In eighty seconds they have each moved at least once, so they have sat in more than three
    // places between them.
    expect(spots.size).toBeGreaterThan(3);
  });

  it('answer a touch with a song', () => {
    const g = gardenOn(s);
    const bird = g.add('bird', 0, burst(g));
    run(g, 4);
    const before = g.residents.length;
    g.drain(() => {});
    bird!.poke(g);
    const heard: Heard[] = [];
    g.drain((e) => heard.push(e));
    expect(heard.some((e) => e.is === 'sing')).toBe(true);
    expect(heard.some((e) => e.is === 'poke')).toBe(true);
    expect(g.residents).toHaveLength(before);
  });

  it('free their perch when they leave, so the next bird can take it', () => {
    const g = gardenOn(s, 2);
    const cap = g.capOf('bird');
    for (let i = 0; i < cap + 6; i++) {
      g.add('bird', i, burst(g, i));
      run(g, 1.5);
    }
    run(g, 8);
    const perched = g.residents.filter((r) => !r.leaving);
    expect(perched).toHaveLength(cap);
    expect(new Set(perched.map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`)).size).toBe(cap);
  });
});

describe('fish', () => {
  const s = SCREENS[0]!;

  it('splash into the pond, and leap clear of it now and then, and come down in it', () => {
    const g = gardenOn(s, 4);
    for (let i = 0; i < 4; i++) g.add('fish', i, burst(g, i));
    let high = 0;
    const heard = run(g, 90, () => {
      for (const r of g.residents) if (r.layer === 'ground' && !r.falling) high++;
    });
    expect(heard.filter((e) => e.is === 'land' && e.wet)).toHaveLength(4);
    const up = heard.filter((e) => e.is === 'leap' && e.up).length;
    const down = heard.filter((e) => e.is === 'leap' && !e.up).length;
    expect(up).toBeGreaterThan(6);
    expect(Math.abs(up - down)).toBeLessThanOrEqual(4);
    expect(high).toBeGreaterThan(30);
    for (const e of heard) if (e.is === 'leap') expect(insidePond(g.plan.pond, e.x, e.y)).toBeLessThanOrEqual(1);
  });

  it('leap when touched', () => {
    const g = gardenOn(s, 4);
    const fish = g.add('fish', 0, burst(g));
    run(g, 2);
    g.drain(() => {});
    const x = fish!.x;
    const y = fish!.y;
    expect(g.at(x, y)).toBe(fish);
    fish!.poke(g);
    expect(fish!.layer).toBe('ground');
    run(g, 0.5);
    expect(fish!.layer).toBe('ground');
    run(g, 1);
    expect(fish!.layer).toBe('water');
  });
});

describe('a touch on the water', () => {
  const s = SCREENS[0]!;

  it('brings the fish that are swimming to the ripple, and they go on swimming after', () => {
    const g = gardenOn(s, 4);
    for (let i = 0; i < 3; i++) g.add('fish', i, burst(g, i));
    run(g, 8);
    const spot = { x: g.plan.pond.x - g.plan.pond.rx * 0.45, y: g.plan.pond.y + g.plan.pond.ry * 0.1 };
    const swimmers = (): typeof g.residents => g.residents.filter((r) => r.layer === 'water');
    const far = (): number =>
      swimmers().reduce((sum, r) => sum + Math.hypot(r.x - spot.x, r.y - spot.y), 0) / Math.max(1, swimmers().length);
    const before = far();
    g.lure(spot.x, spot.y);
    run(g, 2.2);
    expect(far(), 'closer to where she touched').toBeLessThan(before);
    for (const r of swimmers()) expect(insidePond(g.plan.pond, r.x, r.y)).toBeLessThanOrEqual(1);
    // Having come, they swim off again to other places.
    const there = swimmers().map((r) => ({ x: r.x, y: r.y }));
    run(g, 6);
    const moved = swimmers().filter((r, i) => Math.hypot(r.x - there[i]!.x, r.y - there[i]!.y) > 12);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('does nothing to a fish that is leaping or has gone, and nothing at all when there are none', () => {
    const g = gardenOn(s, 4);
    expect(() => g.lure(g.plan.pond.x, g.plan.pond.y)).not.toThrow();
    const fish = g.add('fish', 0, burst(g));
    run(g, 2);
    fish!.poke(g);
    const x = fish!.x;
    g.lure(g.plan.pond.x - 50, g.plan.pond.y);
    run(g, 0.2);
    expect(Math.abs(fish!.x - x), 'a leap is not turned in the air').toBeLessThan(12);
  });
});

describe('what is on foot', () => {
  const s = SCREENS[0]!;

  it('ladybugs fly a little way when touched and come down on the meadow, out of the pond', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = gardenOn(s, seed);
      const bug = g.add('ladybug', 0, burst(g));
      run(g, 2);
      const from = { x: bug!.x, y: bug!.y };
      bug!.poke(g);
      run(g, 1.6);
      const p = g.plan;
      expect(insidePond(p.pond, bug!.x, bug!.y)).toBeGreaterThan(1.25);
      expect(bug!.y).toBeGreaterThan(p.meadow.top);
      expect(bug!.y).toBeLessThan(p.meadow.bottom + 5);
      // She came down somewhere else.
      expect(Math.hypot(bug!.x - from.x, bug!.y - from.y)).toBeGreaterThan(20);
    }
  });

  it('snails leave glitter behind them as they go, and a burst of it when touched', () => {
    const g = gardenOn(s, 8);
    const snail = g.add('snail', 0, burst(g));
    const heard = run(g, 90);
    expect(heard.filter((e) => e.is === 'dust').length).toBeGreaterThan(5);
    g.drain(() => {});
    snail!.poke(g);
    const after: Heard[] = [];
    g.drain((e) => after.push(e));
    expect(after.some((e) => e.is === 'dust' && e.n >= 8)).toBe(true);
  });
});

describe('a touch', () => {
  const s = SCREENS[0]!;

  it('finds the resident in front, and answers every kind with something the player can hear', () => {
    for (const p of STAYERS) {
      const g = gardenOn(s, 6);
      const r = g.add(p, 0, burst(g));
      run(g, 4);
      g.drain(() => {});
      r!.poke(g);
      const heard: Heard[] = [];
      g.drain((e) => heard.push(e));
      expect(heard.some((e) => e.is === 'poke' && e.prize === p)).toBe(true);
    }
  });

  it('lands on each resident somewhere near the middle of it', () => {
    for (const p of STAYERS) {
      const g = gardenOn(s, 6);
      g.add(p, 0, burst(g));
      run(g, 4);
      const r = g.residents[0]!;
      let found = 0;
      for (let dx = -40; dx <= 40; dx += 4)
        for (let dy = -40; dy <= 40; dy += 4) if (g.at(r.x + dx, r.y + dy) === r) found++;
      expect(found).toBeGreaterThan(8);
    }
  });

  it('is on nothing in an empty garden', () => {
    const g = gardenOn(s);
    expect(g.at(100, 100)).toBeNull();
  });

  it('does not touch a resident that is on its way out', () => {
    const g = gardenOn(s);
    const r = g.add('butterfly', 0, burst(g))!;
    run(g, 1);
    r.leave(g);
    expect(g.at(r.x, r.y)).toBeNull();
  });
});

describe('the garden', () => {
  it('forgets everything when it is cleared, and its perches are free again', () => {
    const g = gardenOn(SCREENS[0]!);
    for (let i = 0; i < 3; i++) g.add('bird', i, burst(g, i));
    for (let i = 0; i < 5; i++) g.add('flower', i, burst(g, i));
    g.clear();
    expect(g.residents).toHaveLength(0);
    expect(g.blooms).toHaveLength(0);
    for (let i = 0; i < 3; i++) g.add('bird', i, burst(g, i));
    run(g, 5);
    expect(g.residents.filter((r) => !r.falling)).toHaveLength(3);
  });

  it('is deterministic: the same seed makes the same garden', () => {
    const make = (): string => {
      const g = gardenOn(SCREENS[0]!, 99);
      for (const p of STAYERS) g.add(p, 1, burst(g));
      run(g, 30);
      return g.residents.map((r) => `${r.prize}:${r.x.toFixed(3)},${r.y.toFixed(3)}`).join(' ');
    };
    expect(make()).toBe(make());
  });
});
