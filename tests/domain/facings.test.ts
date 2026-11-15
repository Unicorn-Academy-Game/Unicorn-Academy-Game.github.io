import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../src/domain/invariants';
import { arrivalFromSave, planLoad, toSave } from '../../src/domain/snapshot';
import { createWorld, dispatch } from '../../src/domain/world';
import {
  cardinalOf,
  facingLabel,
  facingOfCardinal,
  NORTHEAST,
  NORTHWEST,
  SOUTHEAST,
  SOUTHWEST,
  UNICORN_FACINGS,
  type UnicornFacing,
  vecOf,
} from '../../src/shared/compass';
import { FACINGS } from '../../src/shared/ids';
import { distance, halt, hold, leaderOf, makeWorld, meadow, run, teleport } from './fixtures';

const DIAGONALS = [NORTHEAST, SOUTHEAST, SOUTHWEST, NORTHWEST] as const;
const labelled = DIAGONALS.map((f) => [facingLabel(f), f] as const);
const everyFacing = UNICORN_FACINGS.map((f) => [facingLabel(f), f] as const);

/**
 * Wildstar walks `facing` for a moment in open ground, well away from anything her light would turn
 * her toward, and stops, so she stands facing it.
 */
function standing(facing: UnicornFacing) {
  const world = makeWorld({ recruited: [] });
  teleport(world, 'wildstar', { x: 700, y: 1300 });
  hold(world, vecOf(facing), 0.6);
  halt(world);
  run(world, 1);
  return world;
}

describe('a unicorn led toward one of her facings', () => {
  it.each(everyFacing)(
    'is drawn walking %s while the finger points that way, and standing %s when it lifts',
    (_label, facing) => {
      const world = makeWorld({ recruited: [] });
      teleport(world, 'wildstar', { x: 700, y: 800 });
      const start = { ...leaderOf(world).pos };
      hold(world, vecOf(facing), 0.8);
      const a = leaderOf(world);
      expect(distance(a.pos, start)).toBeGreaterThan(100);
      expect(a.anim).toMatchObject({ clip: 'walk', facing });
      expect(a.facing).toBe(facing);
      halt(world);
      run(world, 1);
      expect(a.anim).toMatchObject({ clip: 'idle', facing });
    },
  );

  it('is followed by the herd, each drawn walking the same diagonal', () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier'] });
    teleport(world, 'wildstar', { x: 1100, y: 1400 });
    // The herd starts on a trail that has no length yet, so the followers settle in behind her
    // before they all show it.
    hold(world, vecOf(NORTHWEST), 4.5);
    for (const id of ['wildstar', 'leaf', 'glacier'] as const)
      expect(world.unicorns[id]!.anim, id).toMatchObject({ clip: 'walk', facing: NORTHWEST });
  });

  it('goes to a place across the map facing the way the straight path runs', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 600, y: 900 });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 900, y: 600 } });
    run(world, 0.8);
    expect(leaderOf(world).anim).toMatchObject({ clip: 'walk', facing: NORTHEAST });
    run(world, 4);
    expect(leaderOf(world).anim).toMatchObject({ clip: 'idle', facing: NORTHEAST });
  });

  it('has a herd left to itself face every one of the 32 ways as it wanders and looks about', () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'], seed: 5 });
    const seen = new Set<UnicornFacing>();
    // Every step of the run checks that nobody is drawn in a facing her clip lacks.
    run(world, 400, (w) => {
      for (const u of Object.values(w.unicorns)) if (u) seen.add(u.anim.facing);
    });
    expect(UNICORN_FACINGS.filter((f) => !seen.has(f))).toEqual([]);
  });
});

describe('saving a unicorn who faces a diagonal', () => {
  const UUID = '00000000-0000-4000-8000-0000000000bb';

  it('records the side she leans to, so that a build that knows four facings reads the save, and loads her facing it', () => {
    for (const facing of UNICORN_FACINGS) {
      const world = makeWorld({ recruited: [] });
      leaderOf(world).facing = facing;
      const save = toSave(world, UUID);
      expect(save.wildstar.facing, String(facing)).toBe(cardinalOf(facing));
      expect(FACINGS).toContain(save.wildstar.facing);
      const plan = planLoad(JSON.parse(JSON.stringify(save)), ['forest']);
      expect(plan.ok, String(facing)).toBe(true);
      if (!plan.ok) continue;
      expect(arrivalFromSave(save)).toMatchObject({ kind: 'saved', facing: cardinalOf(facing) });
      const again = createWorld({
        map: meadow(),
        persistent: plan.plan.persistent,
        seed: plan.plan.seed,
        arrival: plan.plan.arrival,
      });
      expect(leaderOf(again).facing).toBe(facingOfCardinal(cardinalOf(facing)));
      expect(checkInvariants(again)).toEqual([]);
    }
  });

  it('saves a unicorn who walked northeast and stopped as facing east', () => {
    expect(toSave(standing(NORTHEAST), UUID).wildstar.facing).toBe('east');
    expect(toSave(standing(SOUTHWEST), UUID).wildstar.facing).toBe('west');
  });
});

describe('a clip that was not drawn in every facing', () => {
  it.each(labelled)('has her cast facing the side she leaned to when she stood %s', (_label, facing) => {
    const world = standing(facing);
    dispatch(world, { type: 'cast', commandId: 'c1', unicornId: 'wildstar' });
    run(world, 0.2);
    const a = leaderOf(world);
    expect(a.state.kind).toBe('casting');
    expect(a.anim).toMatchObject({ clip: 'cast', facing: facingOfCardinal(cardinalOf(facing)) });
    expect(a.facing).toBe(facingOfCardinal(cardinalOf(facing)));
  });

  it('is an invariant: no unicorn is drawn in a facing her clip does not have', () => {
    const world = makeWorld({ recruited: [] });
    expect(checkInvariants(world)).toEqual([]);
    leaderOf(world).anim = { clip: 'cast', facing: NORTHWEST, startedAt: 0 };
    expect(checkInvariants(world)).toContain(
      'wildstar is drawn cast facing 20 (northwest), which that clip does not have',
    );
    leaderOf(world).anim = { clip: 'walk', facing: NORTHEAST, startedAt: 0 };
    expect(checkInvariants(world)).toEqual([]);
  });
});
