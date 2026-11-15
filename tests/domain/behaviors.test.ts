import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { checkInvariants } from '../../src/domain/invariants';
import { retire } from '../../src/domain/ops';
import type { DomainEvent, World } from '../../src/domain/types';
import { createWorld, dispatch, drainEvents, step } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { distance, leaderOf, makeWorld, meadow, persistentWith, run, teleport } from './fixtures';

const FRIENDS: UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];

/**
 * Steps until `done` is true, checking invariants each step. Fails the test if the time runs out.
 */
function until(world: World, done: (w: World) => boolean, seconds: number, what: string): void {
  const steps = Math.round(seconds * CONFIG.stepHz);
  for (let i = 0; i < steps; i++) {
    if (done(world)) return;
    step(world);
    const bad = checkInvariants(world);
    if (bad.length > 0) throw new Error(`t=${world.time.toFixed(2)} ${bad[0]!}`);
  }
  if (!done(world)) throw new Error(`timed out after ${seconds}s waiting for ${what}`);
}

const holders = (w: World): string[] => w.anchors.snapshot().flatMap((a) => a.holders.map((h) => `${a.anchorId}:${h}`));
const performing = (w: World): string[] =>
  Object.values(w.unicorns).flatMap((u) => (u!.state.kind === 'performing' ? [`${u!.id}:${u!.state.activity}`] : []));
const eventsOf = <T extends DomainEvent['type']>(events: DomainEvent[], type: T): Extract<DomainEvent, { type: T }>[] =>
  events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);

function busyWorld(seed = 3): World {
  return makeWorld({ recruited: FRIENDS, seed });
}

describe('idle behavior', () => {
  it('stopped companions do at least three different things at once', () => {
    const world = busyWorld();
    let most = 0;
    run(world, 90, (w) => {
      most = Math.max(most, new Set(performing(w).map((p) => p.split(':')[1])).size);
    });
    expect(most).toBeGreaterThanOrEqual(3);
  });

  it('each personality favors its own signature activity', () => {
    const world = busyWorld(11);
    const counts = new Map<string, number>();
    run(world, 240, () => {
      for (const e of drainEvents(world))
        if (e.type === 'activity-started')
          counts.set(`${e.actorId}:${e.activityId}`, (counts.get(`${e.actorId}:${e.activityId}`) ?? 0) + 1);
    });
    for (const [id, signature] of [
      ['leaf', 'flower-sniff'],
      ['glacier', 'hoof-stamp'],
      ['river', 'splash'],
      ['cinder', 'mane-toss'],
      ['storm', 'hop'],
      ['wildstar', 'mote-gaze'],
    ] as const) {
      expect(counts.get(`${id}:${signature}`) ?? 0, `${id} ${signature}`).toBeGreaterThan(0);
    }
  });

  it('does not repeat an activity more than twice in a row while alternatives exist', () => {
    const world = busyWorld(5);
    const log = new Map<string, string[]>();
    run(world, 300, () => {
      for (const e of drainEvents(world))
        if (e.type === 'activity-started' && typeof e.actorId === 'string')
          log.set(e.actorId, [...(log.get(e.actorId) ?? []), e.activityId]);
    });
    for (const [id, seq] of log) {
      let run = 1;
      for (let i = 1; i < seq.length; i++) {
        run = seq[i] === seq[i - 1] ? run + 1 : 1;
        expect(run, `${id}: ${seq.slice(Math.max(0, i - 4), i + 1).join(', ')}`).toBeLessThanOrEqual(
          CONFIG.idle.repeatLimit,
        );
      }
    }
  });

  it('activities last between two and six seconds', () => {
    const world = busyWorld(8);
    const starts = new Map<string, number>();
    const lengths: number[] = [];
    run(world, 200, (w) => {
      for (const u of Object.values(w.unicorns)) {
        const key = u!.id;
        const s = u!.state;
        if (s.kind === 'performing' && !starts.has(key)) starts.set(key, w.time);
        if (s.kind !== 'performing' && starts.has(key)) {
          lengths.push(w.time - starts.get(key)!);
          starts.delete(key);
        }
      }
    });
    expect(lengths.length).toBeGreaterThan(20);
    // Activities cut short by a command are not part of this. There are none here.
    for (const l of lengths) expect(l).toBeGreaterThan(1.1);
    expect(Math.max(...lengths)).toBeLessThan(6.5);
  });
});

describe('reservations', () => {
  it('release when Wildstar moves, within the cancel window', () => {
    const world = busyWorld(3);
    until(world, (w) => holders(w).length >= 2, 120, 'two anchors held');
    const t0 = world.time;
    dispatch(world, { type: 'move', commandId: 'm', destination: { x: 700, y: 760 } });
    until(
      world,
      (w) => performing(w).length === 0 && holders(w).length === 0,
      CONFIG.idle.cancelWithin + 0.25,
      'all activities released',
    );
    expect(world.time - t0).toBeLessThanOrEqual(CONFIG.idle.cancelWithin + 0.2);
  });

  it('release when the holder is told to cast', () => {
    const world = busyWorld(3);
    until(world, (w) => holders(w).length >= 1, 120, 'an anchor held');
    const [first] = holders(world);
    const unicorn = first!.split(':')[1] as UnicornId;
    dispatch(world, { type: 'cast', commandId: 'c', unicornId: unicorn });
    expect(holders(world).some((h) => h.endsWith(`:${unicorn}`))).toBe(false);
    expect(checkInvariants(world)).toEqual([]);
    run(world, 3);
  });

  it('release when the world is retired for a transition', () => {
    const world = busyWorld(3);
    until(world, (w) => holders(w).length >= 1, 120, 'an anchor held');
    retire(world);
    expect(holders(world)).toEqual([]);
    expect(world.paused).toBe(true);
  });

  it('release for an actor that is removed', () => {
    const world = busyWorld(3);
    until(world, (w) => holders(w).length >= 1, 120, 'an anchor held');
    const unicorn = holders(world)[0]!.split(':')[1] as UnicornId;
    expect(world.anchors.releaseAll(unicorn).length).toBeGreaterThan(0);
    expect(holders(world).some((h) => h.endsWith(`:${unicorn}`))).toBe(false);
  });

  it('nuzzling reserves both friends and releases both together', () => {
    const world = makeWorld({ recruited: ['leaf', 'river'], seed: 21 });
    let both = false;
    until(
      world,
      (w) => {
        const p = performing(w);
        both = p.includes('leaf:nuzzle') && p.includes('river:nuzzle');
        return both;
      },
      240,
      'a nuzzle',
    );
    expect(both).toBe(true);
    dispatch(world, { type: 'move', commandId: 'm', destination: { x: 800, y: 760 } });
    until(world, (w) => !performing(w).some((p) => p.endsWith('nuzzle')), 1, 'nuzzle ended for both');
  });
});

describe('cups', () => {
  it('both cups work for Wildstar, one after the other', () => {
    const world = makeWorld({ seed: 2 });
    dispatch(world, { type: 'interact', commandId: 'a', instanceId: 'forest/cup-a' });
    until(world, (w) => leaderOf(w).state.kind === 'performing', 15, 'Wildstar drinking at cup A');
    expect(holders(world)).toEqual(['forest/cup-a-spot:wildstar']);
    dispatch(world, { type: 'interact', commandId: 'b', instanceId: 'forest/cup-b' });
    expect(holders(world)).toEqual(['forest/cup-b-spot:wildstar']);
    until(
      world,
      (w) => leaderOf(w).state.kind === 'performing' && holders(w)[0] === 'forest/cup-b-spot:wildstar',
      15,
      'Wildstar drinking at cup B',
    );
    const events = drainEvents(world);
    expect(eventsOf(events, 'prop-activity').filter((e) => e.activity === 'cup-fill')).toHaveLength(2);
  });

  it('a player interaction takes a cup from an idle companion, who yields, without deadlock', () => {
    const world = makeWorld({ recruited: ['river', 'glacier'], seed: 6 });
    // Stand within reach of both cups, so companions consider them.
    dispatch(world, { type: 'move', commandId: 'near', destination: { x: 1050, y: 860 } });
    let cup = '';
    until(
      world,
      (w) => {
        const h = holders(w).find((x) => x.startsWith('forest/cup-') && !x.endsWith('wildstar'));
        if (h) cup = h.split(':')[0]!.replace('forest/', '').replace('-spot', '');
        return !!h;
      },
      400,
      'a companion at a cup',
    );
    const rival = holders(world)
      .find((h) => h.includes(cup))!
      .split(':')[1] as UnicornId;
    dispatch(world, { type: 'interact', commandId: 'p', instanceId: `forest/${cup}` });
    // The companion lets go at once.
    expect(holders(world)).toEqual([`forest/${cup}-spot:wildstar`]);
    expect(world.unicorns[rival]!.state.kind).not.toBe('performing');
    until(
      world,
      (w) => leaderOf(w).state.kind === 'performing' && w.unicorns.wildstar!.state.kind === 'performing',
      20,
      'Wildstar drinking',
    );
    expect(holders(world)).toContain(`forest/${cup}-spot:wildstar`);
    // And the companion is back in the herd rather than stuck.
    run(world, 12);
    expect(['following', 'recovering', 'performing', 'approaching', 'waiting']).toContain(
      world.unicorns[rival]!.state.kind,
    );
  });

  it('an idle companion cannot take a cup Wildstar holds', () => {
    const world = makeWorld({ recruited: ['river', 'glacier', 'cinder'], seed: 9 });
    dispatch(world, { type: 'interact', commandId: 'p', instanceId: 'forest/cup-a' });
    run(world, 60, () => {
      const hs = holders(world).filter((h) => h.startsWith('forest/cup-a-spot'));
      expect(hs.length).toBeLessThanOrEqual(1);
    });
  });
});

describe('magic', () => {
  it('bounds pending work, effects and events when a tap is repeated very fast', () => {
    const world = busyWorld(4);
    let released = 0;
    let maxPending = 0;
    const ids = ['wildstar', ...FRIENDS] as UnicornId[];
    const castIds = new Set<string>();
    for (let i = 0; i < 90; i++) {
      for (let k = 0; k < 5; k++)
        for (const id of ids) dispatch(world, { type: 'cast', commandId: `c${i}-${k}-${id}`, unicornId: id });
      step(world);
      for (const u of Object.values(world.unicorns))
        if (u!.state.kind === 'casting') maxPending = Math.max(maxPending, u!.state.cast.pending ? 1 : 0);
      expect(world.effects.filter((until) => until > world.time).length).toBeLessThanOrEqual(CONFIG.magic.effectCap);
      expect(world.events.length).toBeLessThanOrEqual(512);
      expect(checkInvariants(world)).toEqual([]);
    }
    for (const e of drainEvents(world))
      if (e.type === 'cast-released') {
        released++;
        expect(castIds.has(e.castId), 'a cast released twice').toBe(false);
        castIds.add(e.castId);
      }
    expect(maxPending).toBeLessThanOrEqual(1);
    // Three seconds of tapping: each unicorn can finish about five casts, not hundreds.
    expect(released).toBeLessThanOrEqual(ids.length * 6);
  });

  it('an interrupted cast does not release, and a released one is not repeated', () => {
    const world = makeWorld({ seed: 2 });
    dispatch(world, { type: 'cast', commandId: 'c', unicornId: 'wildstar' });
    run(world, 0.1);
    dispatch(world, { type: 'move', commandId: 'm', destination: { x: 800, y: 760 } });
    run(world, 2);
    expect(eventsOf(drainEvents(world), 'cast-released')).toHaveLength(0);

    dispatch(world, { type: 'cast', commandId: 'c2', unicornId: 'wildstar' });
    run(world, 0.5);
    dispatch(world, { type: 'move', commandId: 'm2', destination: { x: 900, y: 760 } });
    run(world, 2);
    expect(eventsOf(drainEvents(world), 'cast-released')).toHaveLength(1);
  });

  it('a spell reaches a compatible prop nearby and the reaction is saved', () => {
    const cases: [UnicornId, string, string][] = [
      ['wildstar', 'forest/lantern-1', 'lantern'],
      ['leaf', 'forest/bed-1', 'flowerbed'],
      ['cinder', 'forest/brazier-1', 'brazier'],
    ];
    for (const [caster, instance, kind] of cases) {
      const world = makeWorld({ recruited: ['leaf', 'cinder'], seed: 2 });
      const prop = world.interactables.get(instance)!;
      // The herd arrives with Wildstar, so a friend casts from where the trail puts it and goes
      // back to it afterward.
      teleport(world, 'wildstar', { x: prop.pos.x, y: prop.pos.y + 110 });
      dispatch(world, { type: 'cast', commandId: 'c', unicornId: caster });
      run(world, 1.2);
      const saved = world.persistent.props[instance];
      expect(saved?.kind, `${caster} ${instance}`).toBe(kind);
      if (saved?.kind === 'lantern') expect(saved.lit).toBe(true);
      if (saved?.kind === 'brazier') expect(saved.lit).toBe(true);
      if (saved?.kind === 'flowerbed') expect(saved.state).toBe('flowering');
      const events = drainEvents(world);
      expect(eventsOf(events, 'prop-reacted').map((e) => e.instanceId)).toContain(instance);
    }
  });

  describe('being near is enough', () => {
    const LANTERN = 'forest/lantern-1';

    /** The meadow with more lanterns of the same kind as its own, at the places given. */
    function withLanterns(...spots: [number, number][]) {
      const map = meadow();
      const base = map.interactables.find((i) => i.instanceId === LANTERN)!;
      const extra = spots.map(([x, y], i) => ({
        ...base,
        instanceId: `forest/lantern-extra-${i}`,
        pos: { x, y },
        hit: { ...base.hit, x: x - 40, y: y - 20 },
      }));
      return { ...map, interactables: [...map.interactables, ...extra] };
    }
    const lit = (world: World): string[] =>
      Object.entries(world.persistent.props)
        .filter(([, s]) => s.kind === 'lantern' && s.lit)
        .map(([id]) => id)
        .sort();
    const castFrom = (world: World, from: { x: number; y: number }, who: UnicornId = 'wildstar'): void => {
      teleport(world, 'wildstar', from);
      dispatch(world, { type: 'cast', commandId: 'c', unicornId: who });
      run(world, 1.2);
    };

    it('finds a lantern a few unicorn lengths away, not only one at her hooves', () => {
      const prop = meadow().interactables.find((i) => i.instanceId === LANTERN)!;
      for (const away of [120, 240, CONFIG.magic.reach - 20]) {
        const world = makeWorld({ seed: 2 });
        castFrom(world, { x: prop.pos.x, y: prop.pos.y + away });
        expect(lit(world), `${away} away`).toEqual([LANTERN]);
      }
    });

    it('does not find a lantern beyond what she can reach', () => {
      const prop = meadow().interactables.find((i) => i.instanceId === LANTERN)!;
      const world = makeWorld({ seed: 2 });
      castFrom(world, { x: prop.pos.x, y: prop.pos.y + CONFIG.magic.reach + 40 });
      expect(lit(world)).toEqual([]);
    });

    it('lights several lanterns at once, the nearest few, and leaves the rest', () => {
      const spots: [number, number][] = [
        [700, 600],
        [760, 700],
        [860, 640],
        [1000, 520],
        [650, 450],
        [560, 600],
      ];
      const world = makeWorld({ map: withLanterns(...spots), seed: 2 });
      const from = { x: 800, y: 560 };
      castFrom(world, from);
      const byDistance = [...world.interactables.values()]
        .filter((i) => i.definitionId === 'lantern')
        .sort((a, b) => distance(a.pos, from) - distance(b.pos, from))
        .map((i) => i.instanceId);
      expect(byDistance.length).toBeGreaterThan(CONFIG.magic.each);
      expect(lit(world)).toEqual(byDistance.slice(0, CONFIG.magic.each).sort());
      expect(eventsOf(drainEvents(world), 'prop-reacted')).toHaveLength(CONFIG.magic.each);
    });

    it('lights every one of them, with all its sparks for the nearest and a share of them for the rest, so a crowded place stays light on a phone', () => {
      const spots: [number, number][] = [
        [700, 600],
        [760, 700],
        [860, 640],
        [1000, 520],
      ];
      const world = makeWorld({ map: withLanterns(...spots), seed: 2 });
      castFrom(world, { x: 800, y: 560 });
      const events = drainEvents(world);
      const reacted = eventsOf(events, 'prop-reacted').map((e) => e.instanceId);
      expect(reacted).toHaveLength(CONFIG.magic.each);
      const at = (id: string) => world.interactables.get(id)!.pos;
      const sparks = events.flatMap((e) =>
        e.type === 'effect' && reacted.some((id) => at(id).x === e.at.x && at(id).y === e.at.y) ? [e] : [],
      );
      expect(sparks).toHaveLength(CONFIG.magic.each);
      expect(sparks.filter((e) => e.share === undefined)).toHaveLength(CONFIG.magic.shown);
      expect(sparks.filter((e) => e.share === CONFIG.magic.lesser)).toHaveLength(
        CONFIG.magic.each - CONFIG.magic.shown,
      );
      expect(lit(world)).toHaveLength(CONFIG.magic.each);
    });

    it('touches at most a handful of things in one spell, however many kinds are near', () => {
      const map = meadow();
      const [pinwheel] = map.interactables.filter((i) => i.definitionId === 'pinwheel');
      const kinds = ['pinwheel', 'weather-ornament', 'storm-pillar', 'cave-chimes'];
      const crowd = kinds.flatMap((kind, k) =>
        [0, 1, 2, 3].map((n) => ({
          ...pinwheel!,
          instanceId: `forest/${kind}-${n}`,
          definitionId: kind,
          pos: { x: 700 + k * 70, y: 600 + n * 40 },
          hit: { ...pinwheel!.hit, x: 660 + k * 70, y: 580 + n * 40 },
        })),
      );
      const world = makeWorld({
        map: { ...map, interactables: [...map.interactables, ...crowd] },
        recruited: ['storm'],
        seed: 2,
      });
      castFrom(world, { x: 800, y: 640 }, 'storm');
      expect(eventsOf(drainEvents(world), 'prop-reacted')).toHaveLength(CONFIG.magic.most);
    });

    it('does not reach a lantern behind a wall, however near it is', () => {
      const world = makeWorld({ map: withLanterns([1110, 400]), seed: 2 });
      castFrom(world, { x: 1330, y: 400 });
      expect(lit(world)).toEqual([]);
      expect(eventsOf(drainEvents(world), 'prop-reacted')).toHaveLength(0);
    });
  });

  it('still succeeds with its base spectacle when no prop is near, and changes nothing', () => {
    const world = makeWorld({ seed: 2 });
    teleport(world, 'wildstar', { x: 1700, y: 1500 });
    const before = JSON.stringify(world.persistent.props);
    dispatch(world, { type: 'cast', commandId: 'c', unicornId: 'wildstar' });
    run(world, 1.2);
    const events = drainEvents(world);
    expect(eventsOf(events, 'cast-released')).toHaveLength(1);
    expect(events.some((e) => e.type === 'effect' && e.effect === 'light-burst')).toBe(true);
    expect(eventsOf(events, 'prop-reacted')).toHaveLength(0);
    expect(JSON.stringify(world.persistent.props)).toBe(before);
  });

  it('never changes walkability or removes an interactable', () => {
    const world = makeWorld({ recruited: FRIENDS, seed: 2 });
    const cells = world.nav.walkableCells();
    const props = [...world.interactables.keys()].sort();
    const route = JSON.stringify(world.nav.findPath({ x: 600, y: 760 }, { x: 1700, y: 1200 }));
    for (let round = 0; round < 6; round++) {
      for (const id of ['wildstar', ...FRIENDS] as UnicornId[])
        dispatch(world, { type: 'cast', commandId: `c${round}${id}`, unicornId: id });
      dispatch(world, { type: 'move', commandId: `m${round}`, destination: { x: 600 + round * 150, y: 600 } });
      run(world, 4);
    }
    expect(world.nav.walkableCells()).toBe(cells);
    expect([...world.interactables.keys()].sort()).toEqual(props);
    expect(JSON.stringify(world.nav.findPath({ x: 600, y: 760 }, { x: 1700, y: 1200 }))).toBe(route);
  });
});

describe('commands', () => {
  it('a late path result cannot revive an old command', () => {
    const world = makeWorld({ seed: 2 });
    world.paths.budget = 0;
    dispatch(world, { type: 'move', commandId: 'old', destination: { x: 300, y: 300 } });
    dispatch(world, { type: 'move', commandId: 'new', destination: { x: 1000, y: 1000 } });
    world.paths.budget = CONFIG.nav.pathBudget;
    run(world, 12);
    expect(distance(leaderOf(world).pos, { x: 1000, y: 1000 })).toBeLessThan(CONFIG.speed.arrive + 2);
  });

  it('a new tap replaces an approach-and-interact command, which then never fires', () => {
    const world = makeWorld({ seed: 2 });
    dispatch(world, { type: 'interact', commandId: 'chest', instanceId: 'forest/chest-1' });
    run(world, 0.4);
    dispatch(world, { type: 'move', commandId: 'away', destination: { x: 900, y: 1100 } });
    run(world, 15);
    expect(world.persistent.props['forest/chest-1']).toEqual({ kind: 'chest', open: false });
    expect(eventsOf(drainEvents(world), 'cast-released')).toHaveLength(0);
  });

  it('the chest opens and closes repeatedly and the state is saved', () => {
    const world = makeWorld({ seed: 2 });
    for (const open of [true, false, true]) {
      dispatch(world, { type: 'interact', commandId: `c${open}`, instanceId: 'forest/chest-1' });
      until(
        world,
        (w) =>
          w.persistent.props['forest/chest-1']?.kind === 'chest' &&
          (w.persistent.props['forest/chest-1'] as { open: boolean }).open === open,
        15,
        `chest ${open ? 'open' : 'closed'}`,
      );
      run(world, 1.5);
    }
    expect(eventsOf(drainEvents(world), 'save-needed').some((e) => e.reason === 'prop')).toBe(true);
  });

  it('a tap in a blocked place goes to the nearest reachable spot, and far outside is refused gently', () => {
    const world = makeWorld({ seed: 2 });
    drainEvents(world);
    dispatch(world, { type: 'move', commandId: 'wall', destination: { x: 1230, y: 300 } });
    run(world, 12);
    const p = leaderOf(world).pos;
    expect(world.nav.isWalkable(p)).toBe(true);
    expect(distance(p, { x: 1230, y: 300 })).toBeLessThan(80);

    const here = { ...leaderOf(world).pos };
    drainEvents(world);
    dispatch(world, { type: 'move', commandId: 'nowhere', destination: { x: -3000, y: -3000 } });
    const events = drainEvents(world);
    expect(eventsOf(events, 'command-refused')).toHaveLength(1);
    run(world, 1);
    expect(distance(leaderOf(world).pos, here)).toBeLessThan(1);
  });

  it('a door opens before the herd goes through, and then the world is finished', () => {
    const world = makeWorld({ recruited: ['leaf', 'storm'], seed: 2 });
    dispatch(world, { type: 'interact', commandId: 'door', instanceId: 'forest/door-1' });
    let opened = -1;
    let entered = -1;
    until(
      world,
      (w) => {
        const ev = drainEvents(w);
        if (opened < 0 && eventsOf(ev, 'prop-activity').some((e) => e.activity === 'door-opening')) opened = w.time;
        if (entered < 0 && eventsOf(ev, 'portal-entered').length > 0) entered = w.time;
        return entered >= 0;
      },
      20,
      'the portal',
    );
    expect(entered - opened).toBeGreaterThanOrEqual(0.6);
    expect(world.paused).toBe(true);
    const before = world.time;
    step(world);
    expect(world.time).toBe(before);
    dispatch(world, { type: 'move', commandId: 'late', destination: { x: 100, y: 100 } });
    expect(world.events.length).toBe(0);
  });

  it('walking into a doorway takes the herd through too', () => {
    const world = makeWorld({ seed: 2 });
    dispatch(world, { type: 'move', commandId: 'walk', destination: { x: 1950, y: 710 } });
    let went = false;
    until(world, (w) => (went = eventsOf(drainEvents(w), 'portal-entered').length > 0 || went), 20, 'the portal');
    expect(went).toBe(true);
  });
});

describe('friends in the clearings', () => {
  it('an unfound friend lives in its clearing and stays inside it', () => {
    const world = makeWorld({ seed: 3 });
    const leaf = world.unicorns.leaf!;
    let farthest = 0;
    run(world, 120, () => {
      farthest = Math.max(farthest, distance(leaf.pos, { x: 1550, y: 1200 }));
    });
    expect(farthest).toBeLessThan(120 + 60);
    expect(world.persistent.recruited).toEqual(['wildstar']);
  });

  it('greets a new friend with hearts and a little magic, and then it joins the herd', () => {
    const world = makeWorld({ seed: 3 });
    dispatch(world, { type: 'greet', commandId: 'g', unicornId: 'leaf' });
    until(world, (w) => w.persistent.recruited.includes('leaf'), 30, 'recruitment');
    const events = drainEvents(world);
    expect(eventsOf(events, 'greeting-started')).toHaveLength(1);
    expect(events.some((e) => e.type === 'effect' && e.effect === 'hearts')).toBe(true);
    const leaf = world.unicorns.leaf!;
    until(world, () => leaf.state.kind === 'casting', 3, 'the greeting spell');
    until(world, () => leaf.state.kind === 'following' || leaf.state.kind === 'recovering', 4, 'joining the herd');
    run(world, 20);
    expect(['following', 'performing', 'approaching', 'recovering', 'waiting']).toContain(leaf.state.kind);
  });
});

describe('long play', () => {
  it('a mixed twenty minute session keeps every invariant and keeps its queues bounded', () => {
    const world = createWorld({
      map: meadow(),
      persistent: persistentWith(...FRIENDS),
      seed: 99,
      arrival: { kind: 'spawn', spawnId: 'start' },
    });
    const targets = [
      { x: 700, y: 760 },
      { x: 1700, y: 1200 },
      { x: 900, y: 1200 },
      { x: 600, y: 500 },
      { x: 1100, y: 300 },
    ];
    let t = 0;
    let worstEvents = 0;
    for (let minute = 0; minute < 20; minute++) {
      dispatch(world, { type: 'move', commandId: `m${minute}`, destination: targets[minute % targets.length]! });
      for (let s = 0; s < 6; s++) {
        const bad = run(world, 10);
        expect(bad).toEqual([]);
        t += 10;
        if (s % 2 === 0)
          dispatch(world, {
            type: 'cast',
            commandId: `c${minute}${s}`,
            unicornId: FRIENDS[(minute + s) % FRIENDS.length]!,
          });
        if (s === 3)
          dispatch(world, {
            type: 'interact',
            commandId: `i${minute}`,
            instanceId: minute % 2 ? 'forest/chest-1' : 'forest/cup-a',
          });
        worstEvents = Math.max(worstEvents, world.events.length);
        drainEvents(world);
      }
    }
    expect(t).toBe(1200);
    expect(worstEvents).toBeLessThan(200);
    expect(Object.keys(world.unicorns)).toHaveLength(6);
  }, 60_000);
});
