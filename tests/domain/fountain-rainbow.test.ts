import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCH_PIECES, pieceId, RAINBOW, type RainbowPhase, rainbowPhase } from '../../src/content/fountain-rainbow';
import { CONFIG, type DomainEvent, dispatch, drainEvents, type World } from '../../src/domain';
import { findReactions } from '../../src/domain/systems/magic';
import { CompiledMap } from '../../src/shared/compiled-map';
import type { MapId, UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import type { LogicMap } from '../../src/shared/map';
import { ALL, makeWorld, run, teleport } from './fixtures';

type Pt = { x: number; y: number };

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const mapOf = (id: MapId): LogicMap =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8'))).logic;
const GARDEN = mapOf('palace-garden');

/**
 * The rainbow is a prop for each piece of its arch. The first says how far along it is, and the
 * rest keep time with it.
 */
const HOSTS = ARCH_PIECES.map((piece) => `palace-garden/rainbow-${pieceId(piece)}`);
const HOST = HOSTS[0]!;
const PADS = ['palace-garden/pad-east', 'palace-garden/pad-west', 'palace-garden/pad-front'];
const REACTION = 'light-rainbow';

/**
 * The places the court is played from: at the foot of each statue, in front of the basin, and at
 * the two cups.
 */
const STAND_SPOTS: Pt[] = [
  { x: 2110, y: 1680 },
  { x: 2690, y: 1680 },
  { x: 2400, y: 1670 },
  { x: 2250, y: 1670 },
  { x: 2550, y: 1670 },
];
/**
 * The same, with the cups' own places moved to where a unicorn stands to drink from them, because
 * the cups are not places to stand and a herd put there is pushed out of them.
 */
const STANDABLE_SPOTS: Pt[] = [...STAND_SPOTS.slice(0, 3), { x: 2184, y: 1670 }, { x: 2616, y: 1670 }];
/**
 * Places that are far from the fountain, one well south of it on the lawn and one well to the west
 * in the garden.
 */
const FAR_SPOTS: Pt[] = [
  { x: 2400, y: 2500 },
  { x: 1100, y: 1500 },
];
/**
 * Places a child can stand that are not in the court but are near the fountain: beside it to the
 * east and north east, west of the court, and out on the lawn to the south.
 */
const NEAR_SPOTS: Pt[] = [
  { x: 2840, y: 1300 },
  { x: 2900, y: 1700 },
  { x: 1800, y: 1720 },
  { x: 1950, y: 1500 },
  { x: 2400, y: 2000 },
  { x: 2000, y: 1900 },
  { x: 2800, y: 1950 },
];

const garden = (map: LogicMap = GARDEN, recruited: UnicornId[] = []): World =>
  makeWorld({ map, recruited, seed: 5, arrival: { kind: 'spawn', spawnId: 'from-forest' } });
const without = (map: LogicMap, instanceId: string): LogicMap => ({
  ...map,
  interactables: map.interactables.filter((i) => i.instanceId !== instanceId),
});

const cast = (world: World, who: UnicornId = 'wildstar'): void =>
  dispatch(world, { type: 'cast', commandId: `t${world.tick}-${who}`, unicornId: who });
const steps = (world: World, seconds: number): DomainEvent[] => {
  run(world, seconds);
  return drainEvents(world);
};

/**
 * Puts `who` at `at`, has her cast, and runs on to the moment the spell is released. Everything
 * that happened on the way is returned.
 */
function castFrom(world: World, at: Pt, who: UnicornId = 'wildstar'): DomainEvent[] {
  teleport(world, who, at);
  cast(world, who);
  const seen: DomainEvent[] = [];
  const released = (): boolean => seen.some((e) => e.type === 'cast-released');
  for (let i = 0; i < 3 * CONFIG.stepHz && !released(); i++) seen.push(...steps(world, 1 / CONFIG.stepHz));
  if (!released()) throw new Error(`${who} did not release a spell from ${at.x},${at.y}`);
  return seen;
}

const rainbowsIn = (events: DomainEvent[]): number =>
  events.filter((e) => e.type === 'prop-reacted' && e.reaction === REACTION).length;
const shown = (world: World) => world.transient.get(HOST);
/** How many seconds into its life the rainbow is, or null if it is not up. */
const age = (world: World): number | null => {
  const up = shown(world);
  return up ? world.time - up.since : null;
};

const grid = (step: number): Pt[] => {
  const out: Pt[] = [];
  for (let y = 1600; y <= 1760; y += step) for (let x = 2010; x <= 2790; x += step) out.push({ x, y });
  return out;
};

/** Where in the court in front of the fountain she can stand and her light finds no rainbow. */
function deaf(map: LogicMap, step: number): Pt[] {
  const world = garden(map);
  const wildstar = world.unicorns.wildstar!;
  return grid(step)
    .filter((at) => world.nav.isWalkable(at))
    .filter((at) => {
      teleport(world, 'wildstar', at);
      return !findReactions(world, wildstar, 'light').some((f) => f.reaction.id === REACTION);
    });
}

describe('the rainbow over the fountain', () => {
  describe('where it comes up', () => {
    it('stands over the fountain once Wildstar has cast from any of the places the court is played from', () => {
      for (const at of STAND_SPOTS) {
        const world = garden();
        const seen = castFrom(world, at);
        expect(rainbowsIn(seen), `${at.x},${at.y}`).toBe(1);
        expect(shown(world), `${at.x},${at.y}`).toMatchObject({ kind: REACTION });
        expect(age(world)).toBeCloseTo(0, 6);
      }
    });

    it('is found from every spot she can stand on in front of the fountain, and between the spots too', () => {
      for (const step of [40, 10]) {
        const world = garden();
        const standable = grid(step).filter((at) => world.nav.isWalkable(at));
        expect(standable.length, `the sweep at ${step} has spots`).toBeGreaterThan(step === 40 ? 60 : 900);
        expect(deaf(GARDEN, step), `spots with no rainbow in the sweep at ${step}`).toEqual([]);
      }
    });

    it('needs all three pads, because the statues stand in the way of a pad from the spots at the foot of the others', () => {
      for (const pad of PADS) expect(deaf(without(GARDEN, pad), 40).length, `without ${pad}`).toBeGreaterThan(0);
    });

    it('is found by being near the fountain, beside the court and on the lawn south of it', () => {
      for (const at of NEAR_SPOTS) {
        const world = garden();
        const seen = castFrom(world, at);
        expect(rainbowsIn(seen), `${at.x},${at.y}`).toBe(1);
        expect(shown(world), `${at.x},${at.y}`).toMatchObject({ kind: REACTION });
      }
    });

    it('is also found from behind the fountain, where the rainbow stands', () => {
      const world = garden();
      castFrom(world, { x: 2400, y: 1320 });
      expect(shown(world)).toBeDefined();
    });

    it('does not come up from far away', () => {
      for (const at of FAR_SPOTS) {
        const world = garden();
        const seen = castFrom(world, at);
        expect(rainbowsIn(seen), `${at.x},${at.y}`).toBe(0);
        expect(shown(world), `${at.x},${at.y}`).toBeUndefined();
      }
    });

    it('comes from her light and from no other spell', () => {
      for (const who of ALL.filter((id) => id !== 'wildstar')) {
        const world = garden(GARDEN, ALL);
        for (const at of STANDABLE_SPOTS) castFrom(world, at, who);
        expect(shown(world), who).toBeUndefined();
      }
    });

    it('does not come up on any other map, which has no pads for her light to find', () => {
      for (const id of ['forest', 'stable', 'treasure-house', 'playground'] as const) {
        const map = mapOf(id);
        const world = makeWorld({
          map,
          seed: 5,
          arrival: { kind: 'spawn', spawnId: map.start ?? map.spawns[0]!.spawnId },
        });
        const seen = castFrom(world, { ...world.unicorns.wildstar!.pos });
        expect(rainbowsIn(seen), id).toBe(0);
        expect(
          [...world.transient.values()].filter((t) => t.kind === REACTION),
          id,
        ).toEqual([]);
      }
    });
  });

  describe('how long it stands', () => {
    it('stands for its life after one cast, and then the fountain is as it was', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const up = shown(world)!;
      expect(up.until - up.since).toBeCloseTo(RAINBOW.life, 6);
      steps(world, RAINBOW.life - 0.2);
      expect(shown(world)).toBeDefined();
      steps(world, 0.3);
      expect(shown(world)).toBeUndefined();
    });

    it('is one rainbow for a cast, whichever pads are in reach, with every piece of the arch up', () => {
      const world = garden();
      const seen = castFrom(world, STAND_SPOTS[2]!);
      expect(rainbowsIn(seen)).toBe(1);
      expect([...world.transient.values()].filter((t) => t.kind === REACTION)).toHaveLength(ARCH_PIECES.length);
      expect(HOSTS.filter((id) => world.transient.get(id)?.kind === REACTION)).toEqual(HOSTS);
    });

    it('keeps every piece of the arch to the same times, through more time given and to the end', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const lives = (): Set<string> => new Set(HOSTS.map((id) => JSON.stringify(world.transient.get(id) ?? null)));
      expect(lives().size).toBe(1);
      for (let i = 0; i < 10 * CONFIG.stepHz; i++) {
        if (i < 7 * CONFIG.stepHz && i % 30 === 0) cast(world);
        steps(world, 1 / CONFIG.stepHz);
        expect(lives().size, `at step ${i}`).toBe(1);
      }
      expect([...lives()], 'every piece is over, and none is left from a second rainbow').toEqual(['null']);
    });

    it('is given more time by a cast while it stands, without starting over', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const first = { ...shown(world)! };
      steps(world, 1);
      castFrom(world, STAND_SPOTS[2]!);
      const second = shown(world)!;
      expect(second.since).toBe(first.since);
      expect(second.until).toBeGreaterThan(first.until);
      expect(second.until - second.since).toBeLessThanOrEqual(RAINBOW.cap + 1e-9);
      expect(rainbowPhase(age(world)!, second.until - second.since)).toBe('forming');
    });

    it('is kept for no more than the cap, however long she goes on casting', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const began = shown(world)!.since;
      let longest = 0;
      for (let i = 0; i < 10 * CONFIG.stepHz; i++) {
        if (i % 18 === 0) cast(world);
        steps(world, 1 / CONFIG.stepHz);
        const up = shown(world);
        if (up?.since === began) longest = Math.max(longest, up.until - up.since);
      }
      expect(longest).toBeCloseTo(RAINBOW.cap, 6);
      expect(shown(world)?.since === began, 'the first rainbow is over by now').toBe(false);
    });

    it('does not jump from one phase to an earlier one when it is given more time', () => {
      const order: RainbowPhase[] = ['forming', 'arched', 'fading'];
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      let last = 0;
      for (let i = 0; i < 9 * CONFIG.stepHz; i++) {
        if (i % 45 === 0) cast(world);
        steps(world, 1 / CONFIG.stepHz);
        const up = shown(world);
        if (!up) break;
        const now = order.indexOf(rainbowPhase(age(world)!, up.until - up.since));
        expect(now, `at ${age(world)!.toFixed(2)} seconds`).toBeGreaterThanOrEqual(last);
        last = now;
      }
      expect(last).toBe(2);
    });

    it('is left to fade when she casts during the fade', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const first = { ...shown(world)! };
      steps(world, RAINBOW.life - RAINBOW.fade / 2 - 0.3);
      expect(rainbowPhase(age(world)!, first.until - first.since)).toBe('fading');
      const seen = castFrom(world, STAND_SPOTS[2]!);
      expect(rainbowsIn(seen)).toBe(1);
      expect(shown(world)).toEqual(first);
      steps(world, 1);
      expect(shown(world)).toBeUndefined();
    });

    it('comes up again from the next cast once it is over', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      const first = { ...shown(world)! };
      steps(world, RAINBOW.life + 0.2);
      expect(shown(world)).toBeUndefined();
      castFrom(world, STAND_SPOTS[2]!);
      expect(shown(world)!.since).toBeGreaterThan(first.until);
    });
  });

  describe('the light around it', () => {
    const lights = (events: DomainEvent[]): Extract<DomainEvent, { type: 'effect' }>[] =>
      events.filter(
        (e): e is Extract<DomainEvent, { type: 'effect' }> => e.type === 'effect' && e.effect === 'fountain-rainbow',
      );

    it('is asked for once when the rainbow comes up, over the fountain, for as long as the rainbow will stand', () => {
      for (const at of STAND_SPOTS) {
        const world = garden();
        const seen = lights(castFrom(world, at));
        expect(seen, `${at.x},${at.y}`).toHaveLength(1);
        expect(seen[0]!.at).toEqual({ x: 2400, y: 1400 });
        expect(seen[0]!.seconds).toBeCloseTo(RAINBOW.life, 6);
      }
    });

    it('is asked for again, with the time the rainbow has left, when a cast gives it more time', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      steps(world, 1);
      const seen = lights(castFrom(world, STAND_SPOTS[2]!));
      expect(seen).toHaveLength(1);
      expect(seen[0]!.seconds).toBeGreaterThan(RAINBOW.life - 1);
      expect(seen[0]!.seconds, 'the time left, not a whole life').toBeCloseTo(shown(world)!.until - world.time, 1);
    });

    it('is not asked for when a cast gives the rainbow no more time, at its cap or in its fade', () => {
      const world = garden();
      castFrom(world, STAND_SPOTS[2]!);
      steps(world, 1.6);
      castFrom(world, STAND_SPOTS[2]!);
      expect(shown(world)!.until - shown(world)!.since, 'the second cast took it to the cap').toBeCloseTo(
        RAINBOW.cap,
        6,
      );
      steps(world, 0.5);
      expect(lights(castFrom(world, STAND_SPOTS[2]!)), 'at the cap').toEqual([]);
      steps(world, RAINBOW.cap - age(world)! - RAINBOW.fade / 2 - 0.3);
      expect(rainbowPhase(age(world)!, RAINBOW.cap)).toBe('fading');
      expect(lights(castFrom(world, STAND_SPOTS[2]!)), 'in the fade').toEqual([]);
    });

    it('is not asked for from far away, from another spell, or on another map', () => {
      for (const at of FAR_SPOTS) expect(lights(castFrom(garden(), at)), `${at.x},${at.y}`).toEqual([]);
      const world = garden(GARDEN, ALL);
      for (const who of ALL.filter((id) => id !== 'wildstar'))
        for (const at of STANDABLE_SPOTS) expect(lights(castFrom(world, at, who)), who).toEqual([]);
      const forest = mapOf('forest');
      const away = makeWorld({
        map: forest,
        seed: 5,
        arrival: { kind: 'spawn', spawnId: forest.start ?? forest.spawns[0]!.spawnId },
      });
      expect(lights(castFrom(away, { ...away.unicorns.wildstar!.pos }))).toEqual([]);
    });
  });

  describe('how it passes through its phases', () => {
    it('forms, stands arched and fades, in that order and for as long as the times say', () => {
      const seconds = (t: number) => rainbowPhase(t, RAINBOW.life);
      expect(seconds(0)).toBe('forming');
      expect(seconds(RAINBOW.form - 0.01)).toBe('forming');
      expect(seconds(RAINBOW.form)).toBe('arched');
      expect(seconds(RAINBOW.life - RAINBOW.fade - 0.01)).toBe('arched');
      expect(seconds(RAINBOW.life - RAINBOW.fade)).toBe('fading');
      expect(seconds(RAINBOW.life)).toBe('fading');
    });

    it('fades for the same time at the end of a life that was made longer', () => {
      for (const total of [RAINBOW.life, 7.2, RAINBOW.cap]) {
        expect(rainbowPhase(total - RAINBOW.fade - 0.01, total), `${total}`).toBe('arched');
        expect(rainbowPhase(total - RAINBOW.fade, total), `${total}`).toBe('fading');
      }
    });
  });

  describe('as a sequence of steps', () => {
    it('is the same every time, with the invariants holding at every step', () => {
      const play = (): string => {
        const world = garden(GARDEN, ALL);
        const log: unknown[] = [];
        for (const [i, at] of [...STANDABLE_SPOTS, ...FAR_SPOTS].entries()) {
          log.push(castFrom(world, at));
          steps(world, 0.5 + i * 0.3);
          log.push(world.transient.get(HOST) ?? null);
        }
        log.push(steps(world, RAINBOW.life + 1), [...world.transient.entries()]);
        return JSON.stringify(log);
      };
      const first = play();
      expect(first).toContain(REACTION);
      expect(play()).toBe(first);
    });
  });
});
