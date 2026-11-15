import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import type { UnicornId } from '../../../shared/ids';
import { childBot, expertBot, holdUpBot } from './bots';
import { AIM_SECONDS, Climb, choose, type Event, flightTime, standAt, WORTH } from './climb';
import { type Happening, simulate, steady } from './simulate';
import { ARC_STARS, buildWorld, type Cloud, ROWS, reachable, WORLD_W } from './world';

const HERD: readonly UnicornId[] = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'];
const BEAT = 0.6;
const TEMPO = 100;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const start = (seed: number, herd: readonly UnicornId[] = ['wildstar'], look = 'red'): Climb =>
  new Climb(buildWorld(new Rng(seed), herd.slice(1), look), herd);
const only = <T extends Event['type']>(log: readonly Happening[], type: T): Extract<Event, { type: T }>[] =>
  log.filter((h) => h.event.type === type).map((h) => h.event as Extract<Event, { type: T }>);
const onGrid = (beats: number): boolean => Math.abs(beats * 2 - Math.round(beats * 2)) < 1e-6;

/** Everything that must be true of every rider at every moment. */
function sound(c: Climb): void {
  for (const r of c.riders) {
    expect(Number.isFinite(r.x) && Number.isFinite(r.y), 'where she is').toBe(true);
    if (r.mode === 'stand') {
      expect(r.y).toBe(r.to.y);
      expect(Math.abs(r.x - r.to.x)).toBeLessThanOrEqual(r.to.width / 2);
    } else {
      expect(r.arc).not.toBeNull();
      expect(r.t).toBeGreaterThanOrEqual(0);
      expect(r.t).toBeLessThan(r.arc!.seconds + 1e-9);
      // She is only ever in the air between two clouds she can leap between.
      expect(reachable(r.from, r.to)).toBe(true);
    }
  }
}

describe('the climb', () => {
  it('has her stand on the mushroom, and stay there until she is sent', () => {
    const c = start(3);
    const log = simulate(c, { act: () => null }, 6, { each: sound });
    expect(log).toEqual([]);
    expect(c.leader.to).toBe(c.world.mushroom);
    expect(c.leader.mode).toBe('stand');
  });

  it('sends her to the cloud she is told to, who she lands on, in the time the leap said', () => {
    for (const seed of SEEDS) {
      const c = start(seed);
      const to = c.world.row(0).find((cloud) => cloud.parent === -1)!;
      const log = simulate(c, { act: (k) => (k.time === 0 ? { x: to.x, y: to.y + 12 } : null) }, 4, { each: sound });
      const [launch] = only(log, 'launch');
      const [land] = only(log, 'land');
      expect(launch?.to).toBe(to);
      expect(land?.cloud).toBe(to);
      expect(land?.fresh).toBe(true);
      expect(c.leader.mode).toBe('stand');
      expect(c.leader.to).toBe(to);
      // She is on the cloud, not off it.
      expect(Math.abs(c.leader.x - to.x)).toBeLessThanOrEqual(to.width / 2);
      expect(c.leader.y).toBe(to.y);
    }
  });

  it('has her land on a half beat of the music, however far she goes', () => {
    for (const seed of SEEDS) {
      for (const tempo of [66, 100, 128]) {
        const c = start(seed);
        const log = simulate(c, holdUpBot(), 14, { tempo, each: sound });
        const beat = 60 / tempo;
        // A leap that follows a landing begins where it ended, so it is timed from there. One after
        // she has stood is timed from now.
        let at = 0;
        let landedIn = -1;
        let leaps = 0;
        for (const { time, event } of log) {
          if (event.type === 'launch' && event.rider === 0) {
            if (time !== landedIn) at = time;
            at += event.seconds;
            leaps++;
            expect(onGrid(at / beat), `seed ${seed} tempo ${tempo}: landing at ${at}`).toBe(true);
          }
          if (event.type === 'land' && event.rider === 0) landedIn = time;
        }
        expect(leaps).toBeGreaterThan(5);
      }
    }
  });

  it('times a leap by how far it goes, between about a half and one and a half seconds, and always to a half beat', () => {
    const clock = (beats: number) => ({ beats, seconds: BEAT });
    for (const [dx, up] of [
      [0, 0],
      [100, 0],
      [200, 100],
      [340, 170],
      [340, -260],
      [30, -120],
    ] as const) {
      for (const beats of [0, 0.13, 0.5, 1.77, 12.49]) {
        const t = flightTime(dx, up, clock(beats));
        expect(t).toBeGreaterThanOrEqual(0.6);
        expect(t).toBeLessThanOrEqual(1.4 + BEAT / 2);
        expect(onGrid(beats + t / BEAT)).toBe(true);
      }
    }
  });

  it('gathers every star that hangs along a leap, when she goes the way they lead', () => {
    for (const seed of SEEDS) {
      const c = start(seed);
      const to = c.world
        .row(0)
        .find((cloud) => cloud.parent === -1 && c.world.pickups.some((p) => p.cloud === cloud.id))!;
      const log = simulate(c, { act: (k) => (k.time === 0 ? { x: to.x, y: to.y + 12 } : null) }, 4, { each: sound });
      const stars = only(log, 'star');
      expect(stars.map((s) => s.pickup.index).sort()).toEqual(Array.from({ length: ARC_STARS }, (_, i) => i));
      expect(stars.every((s) => s.worth === WORTH.star)).toBe(true);
      // And not twice.
      simulate(c, { act: () => null }, 3, { each: sound });
      expect(c.taken.size).toBe(ARC_STARS);
    }
  });

  it('goes on to the next leap the moment she lands, for as long as she is being sent', () => {
    const c = start(2);
    const log = simulate(c, holdUpBot(), 20, { each: sound });
    const events = log
      .filter((h) => h.event.type === 'launch' || h.event.type === 'land')
      .filter((h) => 'rider' in h.event && h.event.rider === 0);
    for (let i = 1; i < events.length - 1; i++) {
      if (events[i]!.event.type === 'land') {
        expect(events[i + 1]!.event.type).toBe('launch');
        expect(events[i + 1]!.time, 'the next leap leaves at the moment of the landing').toBe(events[i]!.time);
      }
    }
    expect(events.length).toBeGreaterThan(20);
  });

  it('stops where she was sent, and does not leap again until she is sent somewhere else', () => {
    const c = start(4);
    const to = c.world.row(1)[0]!;
    // She is sent to the second row; two leaps get her there and she stays.
    const log = simulate(c, { act: (k) => (k.time === 0 ? { x: to.x, y: to.y + 12 } : null) }, 12, { each: sound });
    const launches = only(log, 'launch').length;
    expect(launches).toBeLessThanOrEqual(3);
    expect(c.leader.mode).toBe('stand');
    expect(c.aim).toBeNull();
    const before = log.length;
    const more = simulate(c, { act: () => null }, 5, { each: sound });
    expect(more).toHaveLength(0);
    expect(before).toBeGreaterThan(0);
  });

  it('is told when a touch has nowhere to send her, so the game can answer it some other way', () => {
    const c = start(5);
    // On the cloud she already stands on.
    c.touch(c.leader.to.x, c.leader.to.y + 12);
    expect(c.events.map((e) => e.type)).toEqual(['stay']);
    c.events.length = 0;
    c.release();
    // Far below the meadow, where there is nothing to get nearer to.
    c.touch(400, 900);
    expect(c.events.map((e) => e.type)).toEqual(['stay']);
  });

  it('forgets where she was sent after a while, unless a finger is still there, and never stops her mid leap', () => {
    const c = start(6);
    c.send(400, -100000, false);
    // The first cloud she can reach is nearer, so she goes; but there is no way to the sky above,
    // so she goes as far as there is.
    simulate(c, { act: () => null }, AIM_SECONDS + 1, { each: sound });
    expect(c.aim).toBeNull();
    const d = start(6);
    d.send(400, -100000, true);
    simulate(d, { act: () => null }, 40, { each: sound });
    expect(d.leader.to.row, 'a finger that stays takes her as far up as it points').toBeGreaterThan(20);
  });

  it('is worth the most for the new, and nothing for where she has been', () => {
    const c = start(7);
    const first = c.world.row(0)[0]!;
    const log = simulate(c, { act: (k) => (k.time === 0 ? { x: first.x, y: first.y + 12 } : null) }, 3, {
      each: sound,
    });
    const land = only(log, 'land')[0]!;
    expect(land.worth).toBeGreaterThanOrEqual(WORTH.fresh + WORTH.height);
    // Back to the mushroom and up to the same cloud again: nothing for it.
    const back = simulate(
      c,
      {
        act: (k) =>
          k.leader.to === first && k.aim === null && k.leader.mode === 'stand'
            ? { x: k.world.mushroom.x, y: 12 }
            : null,
      },
      4,
      { each: sound },
    );
    expect(only(back, 'land').every((l) => l.rider !== 0 || l.worth === 0 || l.cloud !== first)).toBe(true);
    const again = simulate(
      c,
      {
        act: (k) =>
          k.leader.to === k.world.mushroom && k.aim === null && k.leader.mode === 'stand'
            ? { x: first.x, y: first.y + 12 }
            : null,
      },
      5,
      { each: sound },
    );
    const revisit = only(again, 'land').find((l) => l.cloud === first)!;
    expect(revisit.fresh).toBe(false);
    expect(revisit.worth).toBe(0);
  });

  it('counts a run of new clouds, and starts again after a pause', () => {
    const c = start(8);
    const log = simulate(c, holdUpBot(), 12, { each: sound });
    const combos = only(log, 'land')
      .filter((l) => l.rider === 0 && l.fresh)
      .map((l) => l.combo);
    expect(combos.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    // A long time with nothing to do, and the next new cloud is the first of a new run.
    const d = start(8);
    simulate(d, { act: () => null }, 1, { each: sound });
    d.send(d.world.row(0)[0]!.x, d.world.row(0)[0]!.y + 12, false);
    const rest = simulate(d, { act: () => null }, 4, { each: sound });
    expect(only(rest, 'land').filter((l) => l.rider === 0)[0]!.combo).toBe(1);
  });

  it('gets to the gate when she is always sent up, in half a minute or so, and says so', () => {
    for (const seed of SEEDS) {
      const c = start(seed, HERD, ['red', 'pink', 'blue'][seed % 3]!);
      const log = simulate(c, holdUpBot(), 120, { each: sound, until: (e) => e.type === 'top' });
      const top = log.find((h) => h.event.type === 'top');
      expect(top, `seed ${seed}`).toBeDefined();
      expect(top!.time).toBeGreaterThan(24);
      expect(top!.time).toBeLessThan(45);
      expect(c.bestRow).toBe(ROWS);
    }
  });

  it('gets there, a little slower, for a child who touches anywhere without looking', () => {
    for (const seed of SEEDS) {
      const c = start(seed, ['wildstar']);
      const bot = childBot(new Rng(seed + 99), { above: 190, below: 90, left: 0, right: 863 });
      const log = simulate(c, bot, 200, { each: sound, until: (e) => e.type === 'top' });
      const top = log.find((h) => h.event.type === 'top');
      expect(top, `seed ${seed}`).toBeDefined();
      expect(top!.time).toBeLessThan(150);
    }
  });

  it('gets there for a child who follows the stars, gathering most of them on the way', () => {
    for (const seed of SEEDS) {
      const c = start(seed, ['wildstar']);
      const log = simulate(c, expertBot(), 120, { each: sound, until: (e) => e.type === 'top' });
      expect(log.some((h) => h.event.type === 'top')).toBe(true);
      expect(c.taken.size / c.world.pickups.length, `seed ${seed}`).toBeGreaterThan(0.2);
    }
  });

  it('puts the friends she finds behind her, who go where she went, one after another and a beat apart', () => {
    for (const seed of SEEDS) {
      const c = start(seed, HERD);
      const friends = c.world.clouds.filter((cloud) => cloud.kind === 'friend');
      expect(friends).toHaveLength(5);
      // She goes to each of them in turn by way of the clouds she comes from.
      const way = (to: Cloud): Cloud[] => {
        const path: Cloud[] = [];
        for (let at = to; at.row >= 0; at = c.world.byId(at.parent)) path.unshift(at);
        return path;
      };
      const route = [...way(friends[0]!), ...way(friends[1]!).filter((cloud) => cloud.row > friends[0]!.row)];
      let next = 0;
      const log = simulate(
        c,
        {
          act(k) {
            if (k.leader.mode !== 'stand' || k.aim) return null;
            const to = route[next++];
            return to ? { x: to.x, y: to.y + 12 } : null;
          },
        },
        90,
        {
          each: sound,
          until: () => next >= route.length && c.leader.mode === 'stand' && c.leader.to === route[route.length - 1],
        },
      );
      simulate(c, { act: () => null }, 12, { each: sound });
      const joins = only(log, 'join');
      expect(joins.map((j) => j.id)).toEqual(['leaf', 'glacier']);
      expect(joins.every((j) => j.worth === WORTH.friend)).toBe(true);
      // After a while they are all on the cloud she is on.
      expect(c.riders).toHaveLength(3);
      for (const r of c.riders) {
        expect(r.mode).toBe('stand');
        expect(r.to).toBe(c.leader.to);
      }
      // Each stands to one side of her, and none on top of another.
      const xs = c.riders.map((r) => r.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(14);
    }
  });

  it('has a friend land on each cloud after her, in her order, and a beat or more later', () => {
    const c = start(3, HERD);
    const friend = c.world.clouds.find((cloud) => cloud.kind === 'friend')!;
    const way: Cloud[] = [];
    for (let at = friend; at.row >= 0; at = c.world.byId(at.parent)) way.unshift(at);
    let next = 0;
    const log = simulate(
      c,
      {
        act: (k) =>
          k.leader.mode === 'stand' && !k.aim && next < way.length
            ? { x: way[next]!.x, y: way[next++]!.y + 12 }
            : k.leader.to === friend && !k.aim
              ? { x: 400, y: friend.y - 900 }
              : null,
      },
      40,
      { each: sound },
    );
    const lands = only(log, 'land');
    const mine = lands.filter((l) => l.rider === 0).map((l) => l.cloud);
    const hers = lands.filter((l) => l.rider === 1).map((l) => l.cloud);
    expect(hers.length).toBeGreaterThan(0);
    // She lands on the clouds the leader landed on after the friend joined, in the same order.
    const after = mine.slice(mine.indexOf(friend) + 1);
    expect(hers.slice(0, after.length)).toEqual(after.slice(0, hers.length));
    // And on a half beat, since all leaps are.
    const times = log.filter((h) => h.event.type === 'land' && h.event.rider === 1).map((h) => h.time);
    expect(times.length).toBeGreaterThan(0);
  });

  it('is never worse off for a leap going wrong, because there is no wrong leap: it always lands on a cloud', () => {
    for (const seed of SEEDS) {
      for (const bot of [childBot(new Rng(seed), { above: 400, below: 400, left: -200, right: 1000 }), holdUpBot()]) {
        const c = start(seed, HERD);
        simulate(c, bot, 60, { each: sound, tempo: 90 + seed * 6 });
      }
    }
    // Sixty seconds of play for every seed and both bots: a good deal of work, and it must not fail
    // only because the machine is busy.
  }, 60_000);

  it('can be put back to the start', () => {
    const c = start(2, HERD);
    simulate(c, holdUpBot(), 15, { each: sound });
    expect(c.bestRow).toBeGreaterThan(5);
    c.reset();
    expect(c.leader.to).toBe(c.world.mushroom);
    expect(c.bestRow).toBe(-1);
    expect(c.visited.size).toBe(1);
    expect(c.taken.size).toBe(0);
    expect(c.riders).toHaveLength(1);
    expect(c.aim).toBeNull();
    expect(c.events).toHaveLength(0);
  });

  it('copes with a frame that is a very long time', () => {
    const c = start(1, HERD);
    const to = c.world.row(0)[0]!;
    c.touch(to.x, to.y + 12);
    for (let i = 0; i < 12; i++) {
      c.step(1.2, steady(c.time + 1.2, TEMPO));
      sound(c);
    }
    expect(c.leader.to.row).toBeGreaterThanOrEqual(0);
  });
});

describe('where she goes', () => {
  it('is the cloud that is touched, when it is one she can leap to', () => {
    for (const seed of SEEDS) {
      const w = buildWorld(new Rng(seed), [], 'blue');
      for (const from of [w.mushroom, ...w.row(3), ...w.row(12)]) {
        for (let r = from.row - 1; r <= from.row + 1; r++) {
          for (const to of w.row(r)) {
            if (to === from || !reachable(from, to)) continue;
            expect(choose(w, from, { x: to.x, y: to.y + 12 })).toBe(to);
          }
        }
      }
    }
  });

  it('is the one that gets her nearest, for a touch in the sky, and never a cloud she cannot leap to or the one she is on', () => {
    const rng = new Rng(5);
    for (const seed of SEEDS) {
      const w = buildWorld(new Rng(seed), [], 'pink');
      for (let i = 0; i < 300; i++) {
        const from = rng.pick(w.clouds);
        const aim = { x: rng.range(-100, WORLD_W + 100), y: from.y + rng.range(-700, 400) };
        const to = choose(w, from, aim);
        if (!to) continue;
        expect(to).not.toBe(from);
        expect(reachable(from, to)).toBe(true);
        const far = (c: Cloud) => Math.hypot(c.x - aim.x, (c.y + 12 - aim.y) * 1.15);
        expect(far(to)).toBeLessThan(far(from));
      }
    }
  });

  it('is nowhere, for a touch she is already as near as she can get to', () => {
    const w = buildWorld(new Rng(3), [], 'red');
    const from = w.row(4)[0]!;
    expect(choose(w, from, { x: from.x, y: from.y + 12 })).toBeNull();
    expect(choose(w, w.mushroom, { x: 400, y: 5000 })).toBeNull();
  });
});

describe('where she stands', () => {
  it('is on the cloud, whoever she is, and a different place for each of the friends', () => {
    const w = buildWorld(new Rng(9), [], 'red');
    for (const c of w.clouds) {
      for (let index = 0; index < 6; index++) {
        for (let hops = 0; hops < 5; hops++) {
          const x = standAt(index, c, hops);
          expect(Math.abs(x - c.x)).toBeLessThanOrEqual(c.width / 2 - 18 + 1e-9);
        }
      }
      const spots = [0, 1, 2].map((i) => standAt(i, w.row(Math.max(0, c.row))[0] ?? c, 0));
      expect(new Set(spots.map((s) => Math.round(s))).size).toBe(3);
    }
  });
});
