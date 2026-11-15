import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { checkInvariants } from '../../src/domain/invariants';
import { Rng } from '../../src/domain/rng';
import type { DomainEvent, Rules, World } from '../../src/domain/types';
import { createWorld, dispatch, drainEvents, step } from '../../src/domain/world';
import { NORTH, WEST } from '../../src/shared/compass';
import { distance, leaderOf, makeWorld, meadow, persistentWith, run, teleport } from './fixtures';

const only = <T extends DomainEvent['type']>(events: DomainEvent[], type: T): Extract<DomainEvent, { type: T }>[] =>
  events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);

/** A world in which friends wait to be asked. */
const asking = (seed = 12345, rules: Rules = { friends: 'ask' }): World => makeWorld({ seed, rules });

/** Puts Wildstar this far west of the friend, on level ground in the clearing. */
function stand(world: World, apart = 100): void {
  const leaf = world.unicorns.leaf!;
  const spot = { x: leaf.pos.x - apart, y: leaf.pos.y };
  if (!world.nav.isWalkable(spot, 2))
    throw new Error(`the test stands Wildstar at ${spot.x}, ${spot.y}, which is not open ground`);
  teleport(world, 'wildstar', spot);
}

/** Runs until `done`, checking invariants on every step, and fails if it never happens. */
function until(world: World, done: (w: World) => boolean, seconds: number, what: string): void {
  for (let i = 0; i < Math.round(seconds * CONFIG.stepHz); i++) {
    if (done(world)) return;
    step(world);
    const bad = checkInvariants(world);
    if (bad.length > 0) throw new Error(`t=${world.time.toFixed(2)} ${bad[0]!}`);
  }
  if (!done(world)) throw new Error(`timed out after ${seconds}s waiting for ${what}`);
}

describe('friends who join as Wildstar walks up, which is how the game has always been', () => {
  it('is the rule a world has when nobody says otherwise', () => {
    expect(makeWorld().rules).toEqual({ friends: 'walk-up' });
  });

  it('recruits on the walk, and never speaks of meeting or leaving', () => {
    const world = makeWorld();
    dispatch(world, { type: 'move', commandId: 'c1', destination: { x: 1450, y: 1100 } });
    run(world, 30);
    const events = drainEvents(world);
    expect(world.persistent.recruited).toContain('leaf');
    expect(only(events, 'friend-met')).toEqual([]);
    expect(only(events, 'friend-away')).toEqual([]);
    expect(world.met.size).toBe(0);
  });
});

describe('friends who wait to be asked', () => {
  it('stop and tell the game when Wildstar comes near, and do not join', () => {
    const world = asking();
    dispatch(world, { type: 'move', commandId: 'c1', destination: { x: 1450, y: 1100 } });
    run(world, 30);
    const events = drainEvents(world);
    expect(world.persistent.recruited).toEqual(['wildstar']);
    const met = only(events, 'friend-met');
    expect(met).toHaveLength(1);
    expect(met[0]).toMatchObject({ unicornId: 'leaf', at: world.unicorns.leaf!.pos });
    expect(only(events, 'friend-recruited')).toEqual([]);
    expect(only(events, 'greeting-started')).toEqual([]);
    expect(world.met.has('leaf')).toBe(true);
    // The friend notices her with a little sparkle, where the friend stands.
    expect(
      only(events, 'effect').filter((e) => e.effect === 'sparkle' && distance(e.at, world.unicorns.leaf!.pos) < 1),
    ).toHaveLength(1);
  });

  it('stand where they are and turn to look at Wildstar, wherever she goes', () => {
    const world = asking();
    const leaf = world.unicorns.leaf!;
    stand(world, 100);
    run(world, 1);
    expect(world.met.has('leaf')).toBe(true);
    expect(leaf.facing).toBe(WEST);
    const where = { ...leaf.pos };
    run(world, 8);
    expect(distance(leaf.pos, where)).toBeLessThan(1);
    expect(leaf.speed).toBe(0);
    expect(leaf.path).toBeNull();
    expect(leaf.state.kind).toBe('unrecruited-idle');
    teleport(world, 'wildstar', { x: leaf.pos.x, y: leaf.pos.y - 100 });
    run(world, 1);
    expect(leaf.facing).toBe(NORTH);
    expect(distance(leaf.pos, where)).toBeLessThan(1);
  });

  it('say so once, and not again for as long as Wildstar stays', () => {
    const world = asking();
    stand(world);
    run(world, 2);
    expect(only(drainEvents(world), 'friend-met')).toHaveLength(1);
    run(world, 40);
    const later = drainEvents(world);
    expect(only(later, 'friend-met')).toEqual([]);
    expect(only(later, 'friend-away')).toEqual([]);
  });

  it('are not found through a wall', () => {
    const world = asking();
    const leaf = world.unicorns.leaf!;
    leaf.pos = { x: 1290, y: 600 };
    leaf.prev = { ...leaf.pos };
    leaderOf(world).pos = { x: 1170, y: 600 };
    world.trail.seed([{ x: 1170, y: 600 }]);
    expect(distance(leaf.pos, leaderOf(world).pos), 'near enough that only the wall keeps them apart').toBeLessThan(
      world.map.encounters[0]!.triggerRadius,
    );
    expect(world.nav.lineOfSight(leaf.pos, leaderOf(world).pos), 'with the wall between them').toBe(false);
    run(world, 2);
    expect(only(drainEvents(world), 'friend-met')).toEqual([]);
    expect(world.met.size).toBe(0);
  });

  it('let go once Wildstar is well away, and are met again when she comes back', () => {
    const world = asking();
    const leaf = world.unicorns.leaf!;
    const apart = (d: number) => teleport(world, 'wildstar', { x: leaf.pos.x - d, y: leaf.pos.y });
    apart(100);
    run(world, 0.2);
    expect(only(drainEvents(world), 'friend-met')).toHaveLength(1);
    apart(400);
    run(world, 0.2);
    const gone = drainEvents(world);
    expect(only(gone, 'friend-away')).toEqual([{ type: 'friend-away', unicornId: 'leaf' }]);
    expect(world.met.size).toBe(0);
    apart(100);
    run(world, 0.2);
    expect(only(drainEvents(world), 'friend-met')).toHaveLength(1);
    expect(world.met.has('leaf')).toBe(true);
  });

  it('do not flicker when Wildstar stands at the edge: she has to go a good way past the distance at which they were met', () => {
    const world = asking();
    const leaf = world.unicorns.leaf!;
    const radius = world.map.encounters[0]!.triggerRadius;
    teleport(world, 'wildstar', { x: leaf.pos.x - radius - 25, y: leaf.pos.y });
    run(world, 0.1);
    expect(world.met.size, 'outside the radius, nothing yet').toBe(0);
    teleport(world, 'wildstar', { x: leaf.pos.x - radius + 15, y: leaf.pos.y });
    run(world, 0.1);
    expect(world.met.has('leaf')).toBe(true);
    for (const apart of [radius + 25, radius + 50, radius + 20, radius + 55]) {
      teleport(world, 'wildstar', { x: leaf.pos.x - apart, y: leaf.pos.y });
      run(world, 0.5);
      expect(world.met.has('leaf'), `at ${apart}`).toBe(true);
    }
    teleport(world, 'wildstar', { x: leaf.pos.x - radius * 1.5, y: leaf.pos.y });
    run(world, 0.2);
    expect(world.met.size).toBe(0);
    expect(only(drainEvents(world), 'friend-away')).toHaveLength(1);
  });

  it('watch Wildstar go for a moment before they wander again, however long they waited', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = asking(seed);
      const leaf = world.unicorns.leaf!;
      stand(world);
      run(world, 6);
      const waiting = { ...leaf.pos };
      teleport(world, 'wildstar', { x: waiting.x - 500, y: waiting.y });
      run(world, 1.3);
      expect(world.met.size, `seed ${seed}`).toBe(0);
      expect(distance(leaf.pos, waiting), `seed ${seed}`).toBeLessThan(1);
      expect(leaf.state.kind, `seed ${seed}`).toBe('unrecruited-idle');
    }
  });

  it('go back to their clearing once Wildstar has gone, and wander as they did', () => {
    const world = asking();
    const leaf = world.unicorns.leaf!;
    stand(world);
    run(world, 2);
    const waiting = { ...leaf.pos };
    teleport(world, 'wildstar', { x: waiting.x - 500, y: waiting.y });
    run(world, 0.2);
    expect(world.met.size).toBe(0);
    let farthest = 0;
    run(world, 40, () => (farthest = Math.max(farthest, distance(leaf.pos, waiting))));
    expect(world.met.size).toBe(0);
    expect(farthest, 'she moves again').toBeGreaterThan(8);
    expect(distance(leaf.pos, { x: 1550, y: 1200 }), 'and stays in her clearing').toBeLessThan(120 + 60);
  });

  it('stop at once when they were mid walk, and do not walk away on a route they were given a moment before', () => {
    let tried = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const world = asking(seed);
      const leaf = world.unicorns.leaf!;
      let walking = false;
      try {
        until(world, () => (walking = leaf.path !== null), 25, 'a walk');
      } catch {
        continue;
      }
      if (!walking) continue;
      tried += 1;
      stand(world, 90);
      run(world, 0.1);
      expect(world.met.has('leaf'), `seed ${seed}`).toBe(true);
      expect(leaf.path, `seed ${seed}: she holds no route while she waits`).toBeNull();
      expect(leaf.speed, `seed ${seed}`).toBe(0);
      const where = { ...leaf.pos };
      run(world, 6);
      expect(distance(leaf.pos, where), `seed ${seed}`).toBeLessThan(1);
      // And when Wildstar goes she does not simply pick up the walk she was on: she watches her go
      // first.
      teleport(world, 'wildstar', { x: where.x - 500, y: where.y });
      run(world, 1.2);
      expect(distance(leaf.pos, where), `seed ${seed} after Wildstar left`).toBeLessThan(1);
    }
    expect(tried, 'the case happened in enough worlds to mean something').toBeGreaterThanOrEqual(3);
  });

  it('put down whatever they were doing when Wildstar comes, and are not left in the middle of it', () => {
    let tried = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const world = asking(seed);
      const leaf = world.unicorns.leaf!;
      try {
        until(world, () => leaf.state.kind === 'performing', 40, 'a little activity');
      } catch {
        continue;
      }
      tried += 1;
      stand(world, 90);
      run(world, 0.1);
      expect(world.met.has('leaf'), `seed ${seed}`).toBe(true);
      expect(leaf.state.kind, `seed ${seed}`).toBe('unrecruited-idle');
      run(world, 10);
      expect(leaf.state.kind, `seed ${seed}`).toBe('unrecruited-idle');
    }
    expect(tried, 'the case happened in enough worlds to mean something').toBeGreaterThanOrEqual(3);
  });
});

describe('telling a friend she may join', () => {
  const met = (): World => {
    const world = asking();
    stand(world);
    run(world, 1);
    drainEvents(world);
    return world;
  };

  it('is the same joining as walking up: saved at once, greeted, and then in the herd', () => {
    const world = met();
    dispatch(world, { type: 'befriend', commandId: 'b1', unicornId: 'leaf' });
    const events = drainEvents(world);
    expect(only(events, 'friend-recruited')).toEqual([{ type: 'friend-recruited', unicornId: 'leaf' }]);
    expect(events.some((e) => e.type === 'save-needed' && e.reason === 'recruit')).toBe(true);
    expect(only(events, 'greeting-started')).toHaveLength(1);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
    expect(world.met.size).toBe(0);
    const leaf = world.unicorns.leaf!;
    until(world, () => leaf.state.kind === 'casting', 3, 'the greeting spell');
    until(world, () => leaf.state.kind === 'following' || leaf.state.kind === 'recovering', 4, 'joining the herd');
    run(world, 20);
    expect(world.order).toEqual(['leaf']);
  });

  it('is done once, however many times the game says it', () => {
    const world = met();
    for (const id of ['b1', 'b2', 'b3']) dispatch(world, { type: 'befriend', commandId: id, unicornId: 'leaf' });
    run(world, 10);
    const events = drainEvents(world);
    expect(only(events, 'friend-recruited')).toHaveLength(1);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
    expect(world.order).toEqual(['leaf']);
  });

  it('does nothing for a friend who is not here, who has joined already, or who is not beside her', () => {
    const world = asking();
    dispatch(world, { type: 'befriend', commandId: 'b1', unicornId: 'storm' });
    dispatch(world, { type: 'befriend', commandId: 'b2', unicornId: 'wildstar' });
    dispatch(world, { type: 'befriend', commandId: 'b3', unicornId: 'leaf' });
    expect(world.persistent.recruited).toEqual(['wildstar']);
    expect(
      drainEvents(world).filter(
        (e) => e.type === 'friend-recruited' || (e.type === 'save-needed' && e.reason === 'recruit'),
      ),
    ).toEqual([]);
    const joined = makeWorld({ recruited: ['leaf'], rules: { friends: 'ask' } });
    dispatch(joined, { type: 'befriend', commandId: 'b4', unicornId: 'leaf' });
    expect(joined.persistent.recruited).toEqual(['wildstar', 'leaf']);
    expect(joined.order).toEqual(['leaf']);
  });

  it('works for a friend who is beside her even if the game never heard that she was met', () => {
    const world = asking();
    stand(world);
    dispatch(world, { type: 'befriend', commandId: 'b1', unicornId: 'leaf' });
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
  });

  it('is not undone by Wildstar walking away while the friend greets her, and the friend comes after her', () => {
    const world = met();
    dispatch(world, { type: 'befriend', commandId: 'b1', unicornId: 'leaf' });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1100, y: 1250 } });
    run(world, 30);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
    expect(only(drainEvents(world), 'friend-away')).toEqual([]);
    expect(distance(world.unicorns.leaf!.pos, leaderOf(world).pos)).toBeLessThan(260);
  });
});

describe('tapping a friend who has not joined', () => {
  it('walks Wildstar over, and the friend is met when she gets there, with no refusal on the way', () => {
    const world = asking();
    dispatch(world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    run(world, 30);
    const events = drainEvents(world);
    expect(only(events, 'command-refused')).toEqual([]);
    expect(only(events, 'friend-met')).toHaveLength(1);
    expect(world.met.has('leaf')).toBe(true);
    expect(world.persistent.recruited).toEqual(['wildstar']);
    expect(world.leader.phase).toBe('idle');
    expect(distance(leaderOf(world).pos, world.unicorns.leaf!.pos)).toBeLessThanOrEqual(160);
  });

  it('asks again when the friend was already waiting, so the game can offer what it offered before', () => {
    const world = asking();
    stand(world);
    run(world, 1);
    drainEvents(world);
    dispatch(world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    expect(only(drainEvents(world), 'friend-met')).toHaveLength(1);
    run(world, 10);
    const later = drainEvents(world);
    expect(only(later, 'command-refused')).toEqual([]);
    expect(only(later, 'friend-met')).toEqual([]);
    expect(world.met.has('leaf')).toBe(true);
    expect(world.persistent.recruited).toEqual(['wildstar']);
  });

  it('is not a refusal when she is already standing where she would meet the friend, before the friend has been reached', () => {
    const world = asking();
    teleport(world, 'wildstar', world.map.encounters[0]!.greeting);
    dispatch(world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    run(world, 2);
    const events = drainEvents(world);
    expect(only(events, 'command-refused')).toEqual([]);
    expect(only(events, 'friend-met')).toHaveLength(1);
    expect(world.met.has('leaf')).toBe(true);
  });

  it('does not make a friend who has not been met say so before Wildstar is there', () => {
    const world = asking();
    dispatch(world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    expect(only(drainEvents(world), 'friend-met')).toEqual([]);
  });

  it('still joins at once under the old rule, as before', () => {
    const world = makeWorld();
    dispatch(world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    run(world, 30);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
  });
});

describe('the rule changing while the game runs', () => {
  it('lets a waiting friend join as soon as it goes back to walking up, after letting her go', () => {
    const rules: Rules = { friends: 'ask' };
    const world = asking(1, rules);
    stand(world);
    run(world, 1);
    drainEvents(world);
    rules.friends = 'walk-up';
    run(world, 0.5);
    const events = drainEvents(world)
      .map((e) => e.type)
      .filter((t) => t === 'friend-away' || t === 'friend-recruited');
    expect(events).toEqual(['friend-away', 'friend-recruited']);
    expect(world.met.size).toBe(0);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
  });

  it('lets a friend who was waiting far off wander again when it goes back to walking up', () => {
    const rules: Rules = { friends: 'ask' };
    const world = asking(2, rules);
    stand(world);
    run(world, 1);
    teleport(world, 'wildstar', { x: world.unicorns.leaf!.pos.x - 400, y: world.unicorns.leaf!.pos.y });
    rules.friends = 'walk-up';
    run(world, 0.5);
    expect(world.met.size).toBe(0);
    expect(world.persistent.recruited).toEqual(['wildstar']);
  });

  it('is one object that every world shares, so changing it changes the world on the screen', () => {
    const rules: Rules = { friends: 'walk-up' };
    const first = makeWorld({ rules });
    const second = createWorld({
      map: meadow(),
      persistent: persistentWith(),
      seed: 3,
      arrival: { kind: 'spawn', spawnId: 'start' },
      rules,
    });
    rules.friends = 'ask';
    expect(first.rules.friends).toBe('ask');
    expect(second.rules.friends).toBe('ask');
  });
});

describe('what the invariants say about friends who wait', () => {
  it('is silent in a world where friends wait, throughout', () => {
    const world = asking();
    stand(world);
    for (let i = 0; i < 200; i++) {
      step(world);
      expect(checkInvariants(world)).toEqual([]);
    }
  });

  it('names a waiting friend who is not here, who has joined, or who is busy with something else', () => {
    const world = asking();
    world.met.add('storm');
    expect(checkInvariants(world).join(' ')).toMatch(/storm is waiting to be found but is not here/);
    world.met.clear();
    world.met.add('leaf');
    world.unicorns.leaf!.state = { kind: 'greeting', castAt: 1 };
    expect(checkInvariants(world).join(' ')).toMatch(/leaf is waiting to be found but is greeting/);
    world.unicorns.leaf!.state = { kind: 'unrecruited-idle', nextAt: 1 };
    world.persistent.recruited.push('leaf');
    expect(checkInvariants(world).join(' ')).toMatch(/leaf is waiting to be found but is already found/);
  });
});

describe('a long play with friends who wait', () => {
  it('keeps every invariant while she wanders, taps, is asked, joins, and the rule changes under her', () => {
    for (const seed of [1, 2, 3]) {
      const rules: Rules = { friends: 'ask' };
      const world = asking(seed, rules);
      const random = new Rng(seed * 7919);
      const spots = [
        { x: 1450, y: 1100 },
        { x: 1700, y: 1250 },
        { x: 900, y: 700 },
        { x: 600, y: 500 },
        { x: 1500, y: 1350 },
      ];
      // What the events say about her, read the way a game would, must always agree with what the
      // world holds.
      let waiting = false;
      for (let turn = 0; turn < 40; turn++) {
        const pick = random.next();
        const commandId = `c${seed}-${turn}`;
        if (pick < 0.35)
          dispatch(world, { type: 'move', commandId, destination: spots[Math.floor(random.next() * spots.length)]! });
        else if (pick < 0.55) dispatch(world, { type: 'greet', commandId, unicornId: 'leaf' });
        else if (pick < 0.7) dispatch(world, { type: 'befriend', commandId, unicornId: 'leaf' });
        else if (pick < 0.75) rules.friends = rules.friends === 'ask' ? 'walk-up' : 'ask';
        else if (pick < 0.85)
          dispatch(world, { type: 'steer', commandId, heading: { x: random.next() - 0.5, y: random.next() - 0.5 } });
        run(world, 2 + random.next() * 4);
        for (const e of drainEvents(world)) {
          if (e.type === 'friend-met') waiting = true;
          if (e.type === 'friend-away' || e.type === 'friend-recruited') waiting = false;
        }
        expect(waiting, `seed ${seed} turn ${turn}`).toBe(world.met.has('leaf'));
        for (const id of world.met)
          expect(world.persistent.recruited.includes(id), `${id} is waiting and joined`).toBe(false);
      }
    }
  });
});
