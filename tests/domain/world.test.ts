import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../src/domain/invariants';
import { arrivalFromSave, persistentFromSave, planLoad, toSave } from '../../src/domain/snapshot';
import { createWorld, dispatch, drainEvents, step } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { ALL, distance, leaderOf, makeWorld, meadow, persistentWith, run, teleport } from './fixtures';

const UUID = '00000000-0000-4000-8000-0000000000aa';

function subsets(ids: UnicornId[]): UnicornId[][] {
  const out: UnicornId[][] = [];
  for (let m = 0; m < 1 << ids.length; m++) out.push(ids.filter((_, i) => m & (1 << i)));
  return out;
}

describe('arrival', () => {
  it('reconstructs exactly the recruited subset on valid, separate standing places for every subset', () => {
    const friends = ALL.slice(1);
    for (const subset of subsets(friends)) {
      for (const spawnId of ['start', 'door']) {
        const world = createWorld({
          map: meadow(),
          persistent: persistentWith(...subset),
          seed: 1,
          arrival: { kind: 'spawn', spawnId },
        });
        const present = Object.keys(world.unicorns).filter((id) =>
          world.persistent.recruited.includes(id as UnicornId),
        );
        expect(new Set(present)).toEqual(new Set(['wildstar', ...subset]));
        expect(checkInvariants(world)).toEqual([]);
        // The only unrecruited unicorn present is the one the map hides, and only when it has not
        // been found.
        const unfound = Object.keys(world.unicorns).filter(
          (id) => !world.persistent.recruited.includes(id as UnicornId),
        );
        expect(unfound).toEqual(subset.includes('leaf') ? [] : ['leaf']);
        const spots = Object.values(world.unicorns).filter((u) => world.persistent.recruited.includes(u!.id));
        for (let i = 0; i < spots.length; i++)
          for (let j = i + 1; j < spots.length; j++)
            expect(distance(spots[i]!.pos, spots[j]!.pos)).toBeGreaterThanOrEqual(55);
      }
    }
  });

  it('puts followers at their slot distance along the authored line, so nobody shuffles on arrival', () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier', 'river'] });
    const before = ['leaf', 'glacier', 'river'].map((id) => ({ ...world.unicorns[id as UnicornId]!.pos }));
    run(world, 0.2);
    const after = ['leaf', 'glacier', 'river'].map((id) => world.unicorns[id as UnicornId]!.pos);
    for (let i = 0; i < before.length; i++) expect(distance(before[i]!, after[i]!)).toBeLessThan(25);
  });
});

describe('recruitment', () => {
  it('recruits a friend once, immediately saves, and never duplicates it', () => {
    const world = makeWorld();
    const friend = world.unicorns.leaf!;
    expect(world.persistent.recruited).toEqual(['wildstar']);
    // Walk Wildstar to the greeting point.
    dispatch(world, { type: 'greet', commandId: 'c1', unicornId: 'leaf' });
    const bad = run(world, 25);
    expect(bad).toEqual([]);
    expect(world.persistent.recruited).toEqual(['wildstar', 'leaf']);
    const events = drainEvents(world);
    expect(events.filter((e) => e.type === 'friend-recruited')).toHaveLength(1);
    expect(events.some((e) => e.type === 'save-needed' && e.reason === 'recruit')).toBe(true);
    expect(world.unicorns.leaf).toBe(friend);
    // Standing next to her again does not recruit twice.
    run(world, 10);
    expect(drainEvents(world).filter((e) => e.type === 'friend-recruited')).toHaveLength(0);
    expect(world.persistent.recruited.filter((id) => id === 'leaf')).toHaveLength(1);
  });

  it('survives a map reload: the recruit follows, and the encounter does not spawn a second one', () => {
    const world = makeWorld();
    dispatch(world, { type: 'greet', commandId: 'c1', unicornId: 'leaf' });
    run(world, 25);
    const save = toSave(world, UUID);
    const again = createWorld({
      map: meadow(),
      persistent: persistentFromSave(save),
      seed: save.rngState,
      arrival: arrivalFromSave(save),
    });
    expect(Object.keys(again.unicorns).sort()).toEqual(['leaf', 'wildstar']);
    expect(again.unicorns.leaf!.state.kind).toBe('following');
    expect(checkInvariants(again)).toEqual([]);
  });

  it('recruits when Wildstar walks near on her own, without a tap', () => {
    const world = makeWorld();
    dispatch(world, { type: 'move', commandId: 'c1', destination: { x: 1450, y: 1100 } });
    expect(run(world, 30)).toEqual([]);
    expect(world.persistent.recruited).toContain('leaf');
  });

  it('has a friend found with no trail behind Wildstar fall in beside her, not wait where the trail began', () => {
    const world = makeWorld();
    const leaf = world.unicorns.leaf!;
    // A load or a jump leaves a trail shorter than any follower's gap.
    teleport(world, 'wildstar', { x: leaf.pos.x - 40, y: leaf.pos.y + 100 });
    const seen = new Set<string>();
    expect(run(world, 14, (w) => seen.add(w.unicorns.leaf!.state.kind))).toEqual([]);
    expect(world.persistent.recruited).toContain('leaf');
    expect(seen.has('following')).toBe(true);
    expect(world.unicorns.leaf!.state.kind).not.toBe('recovering');
  });

  it('does not recruit through a wall', () => {
    const world = makeWorld();
    // Leaf stands east of the fence. Wildstar stands just west of it, within 160 units but blocked.
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
    expect(world.persistent.recruited).toEqual(['wildstar']);
  });
});

const MAPS = ['forest', 'palace-garden', 'treasure-house', 'palace-hall', 'stable', 'playground'] as const;

describe('snapshots', () => {
  it('round trips: save, parse, load gives the same membership, props and position', () => {
    const world = makeWorld({ recruited: ['leaf', 'storm'] });
    dispatch(world, { type: 'interact', commandId: 'c1', instanceId: 'forest/chest-1' });
    run(world, 12);
    const save = toSave(world, UUID);
    const plan = planLoad(JSON.parse(JSON.stringify(save)), MAPS);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const again = createWorld({
      map: world.map,
      persistent: plan.plan.persistent,
      seed: plan.plan.seed,
      arrival: plan.plan.arrival,
    });
    expect(again.persistent.recruited).toEqual(world.persistent.recruited);
    expect(again.persistent.props).toEqual(world.persistent.props);
    expect(distance(leaderOf(again).pos, leaderOf(world).pos)).toBeLessThan(0.001);
    expect(again.rng.state).toBe(world.rng.state);
  });

  it('rejects invalid data whole', () => {
    const world = makeWorld();
    const save = toSave(world, UUID);
    const bad: unknown[] = [
      null,
      'nope',
      { ...save, schemaVersion: 2 },
      { ...save, recruited: ['leaf'] },
      { ...save, recruited: ['wildstar', 'wildstar'] },
      { ...save, recruited: ['wildstar', 'dragon'] },
      { ...save, mapId: 'moon' },
      { ...save, wildstar: { position: { x: NaN, y: 0 }, facing: 'east' } },
      { ...save, wildstar: { position: { x: 1, y: 1 }, facing: 'up' } },
      { ...save, worldGeneration: 'not-a-uuid' },
      { ...save, visitedMaps: ['stable'] },
      { ...save, props: { 'forest/chest-1': { kind: 'chest', open: 'yes' } } },
      { ...save, rngState: -1 },
    ];
    for (const b of bad) expect(planLoad(b, MAPS).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
    expect(planLoad(save, MAPS).ok).toBe(true);
  });

  it('repairs a saved position that is inside a tree or a wall', () => {
    const world = makeWorld();
    const save = toSave(world, UUID);
    for (const position of [
      { x: 1100, y: 500 },
      { x: 1230, y: 300 },
      { x: 5, y: 5 },
      { x: 450, y: 1250 },
      { x: 9000, y: 9000 },
    ]) {
      const broken = {
        ...save,
        wildstar: { ...save.wildstar, position: { x: Math.min(position.x, 8000), y: Math.min(position.y, 8000) } },
      };
      const plan = planLoad(broken, MAPS);
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      const again = createWorld({
        map: world.map,
        persistent: plan.plan.persistent,
        seed: plan.plan.seed,
        arrival: plan.plan.arrival,
      });
      expect(checkInvariants(again)).toEqual([]);
      expect(again.nav.isWalkable(leaderOf(again).pos)).toBe(true);
    }
  });

  it('saves the approach point instead of a position inside a portal that is about to fire', () => {
    const world = makeWorld();
    leaderOf(world).pos = { x: 1950, y: 700 };
    const save = toSave(world, UUID);
    expect(save.wildstar.position).toEqual({ x: 1840, y: 710 });
  });
});

describe('determinism', () => {
  it('same seed and same commands give the same world', () => {
    const play = (): string => {
      const world = makeWorld({ recruited: ['leaf', 'glacier', 'river'], seed: 77 });
      dispatch(world, { type: 'move', commandId: 'a', destination: { x: 1700, y: 1300 } });
      run(world, 8);
      dispatch(world, { type: 'cast', commandId: 'b', unicornId: 'river' });
      run(world, 14);
      return JSON.stringify(Object.values(world.unicorns).map((u) => [u!.id, u!.pos, u!.state.kind]));
    };
    expect(play()).toBe(play());
  });

  it('stepping with no commands for a long time stays valid', () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'] });
    expect(run(world, 60)).toEqual([]);
    step(world);
  });
});
