import { describe, expect, it } from 'vitest';
import { codeMatches, MANOR_CODE } from '../../src/content/manor';
import { PROP_DEFS } from '../../src/content/props';
import { checkInvariants } from '../../src/domain/invariants';
import type { DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { LogicMap } from '../../src/shared/map';
import { makeWorld, meadow, run } from './fixtures';

const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });
const at = (x: number, y: number, facing: 'north' | 'south' | 'east' | 'west' = 'north') => ({ pos: { x, y }, facing });

/**
 * The meadow with a manor door in its east fence, a lift door to the north that wants a clue, and
 * the clue. A real map id stands in for the manor, since the schema only knows the shipped ones.
 */
function manor(solo = false): LogicMap {
  const base = meadow();
  return LogicMap.parse({
    ...base,
    ...(solo ? { solo: true } : {}),
    portals: [
      {
        portalId: 'front-door',
        bounds: { x: 1900, y: 650, w: 100, h: 120 },
        approach: { x: 1840, y: 710 },
        door: 'forest/manor-1',
        to: { mapId: 'manor-hall', spawnId: 'from-forest' },
      },
      {
        portalId: 'lift',
        bounds: { x: 700, y: 120, w: 100, h: 60 },
        approach: { x: 750, y: 200 },
        door: 'forest/lift-1',
        to: { mapId: 'manor-upper', spawnId: 'from-hall' },
        ride: 'up',
      },
    ],
    interactables: [
      ...base.interactables.filter((i) => i.instanceId !== 'forest/door-1'),
      {
        instanceId: 'forest/manor-1',
        definitionId: 'manor-door',
        pos: { x: 1960, y: 700 },
        hit: box(1960, 690, 60),
        approach: [at(1840, 710, 'east')],
      },
      {
        instanceId: 'forest/lift-1',
        definitionId: 'elevator-door',
        pos: { x: 750, y: 150 },
        hit: box(750, 140, 60),
        approach: [at(750, 220)],
      },
      {
        instanceId: 'forest/clue-1',
        definitionId: 'elevator-clue',
        pos: { x: 1000, y: 160 },
        hit: box(1000, 150, 50),
        approach: [at(1000, 230)],
      },
    ],
  });
}

const world = (solo = false): World => makeWorld({ map: manor(solo), seed: 5, recruited: ['leaf', 'glacier'] });
const watch = (w: World, seconds: number): DomainEvent[] => {
  const seen: DomainEvent[] = [];
  run(w, seconds, (x) => seen.push(...drainEvents(x)));
  return seen;
};
const tap = (w: World, instanceId: string): void =>
  dispatch(w, { type: 'interact', commandId: `t-${instanceId}`, instanceId });
const type = (w: World, code: string): void =>
  dispatch(w, { type: 'enter-code', commandId: 'code', instanceId: 'forest/manor-1', code });
const kinds = (seen: DomainEvent[], t: DomainEvent['type']): DomainEvent[] => seen.filter((e) => e.type === t);

describe('the word for the manor door', () => {
  it('is her own unicorn, and capitals and spaces do not matter', () => {
    expect(MANOR_CODE).toBe('wildstar');
    for (const ok of ['wildstar', 'Wildstar', 'WILDSTAR', '  wildstar ', 'wild star', 'WiLdStAr\n'])
      expect(codeMatches(ok), JSON.stringify(ok)).toBe(true);
    for (const no of ['', 'wild', 'wildstars', 'wilds tar x', 'w1ldstar', 'leaf'])
      expect(codeMatches(no), JSON.stringify(no)).toBe(false);
  });
});

describe('a door that wants a word', () => {
  it('asks for it when she gets to the door, and does not open', () => {
    const w = world();
    tap(w, 'forest/manor-1');
    const seen = watch(w, 12);
    expect(kinds(seen, 'code-wanted')).toEqual([{ type: 'code-wanted', instanceId: 'forest/manor-1' }]);
    expect(kinds(seen, 'portal-entered')).toEqual([]);
    expect(kinds(seen, 'prop-activity').filter((e) => (e as { activity: string }).activity === 'door-opening')).toEqual(
      [],
    );
  });

  it('asks once when she walks into the doorway and stands there, and again after she steps out and back', () => {
    const w = world();
    dispatch(w, { type: 'move', commandId: 'm1', destination: { x: 1950, y: 710 } });
    expect(kinds(watch(w, 14), 'code-wanted')).toHaveLength(1);
    dispatch(w, { type: 'move', commandId: 'm2', destination: { x: 1780, y: 710 } });
    watch(w, 8);
    dispatch(w, { type: 'move', commandId: 'm3', destination: { x: 1950, y: 710 } });
    expect(kinds(watch(w, 14), 'code-wanted')).toHaveLength(1);
  });

  it('says a gentle no to a wrong word, and nothing is saved or changed', () => {
    const w = world();
    type(w, 'leaf');
    const seen = watch(w, 1);
    expect(kinds(seen, 'code-refused')).toHaveLength(1);
    expect(w.unlocked.size).toBe(0);
    expect(kinds(seen, 'portal-entered')).toEqual([]);
  });

  it('opens for the right word and takes her through, once', () => {
    const w = world();
    tap(w, 'forest/manor-1');
    watch(w, 12);
    type(w, 'Wildstar');
    const seen = watch(w, 6);
    expect(kinds(seen, 'unlocked')).toEqual([{ type: 'unlocked', instanceId: 'forest/manor-1' }]);
    expect(kinds(seen, 'portal-entered')).toHaveLength(1);
    expect((kinds(seen, 'portal-entered')[0] as { to: { mapId: string } }).to.mapId).toBe('manor-hall');
    expect(w.unlocked.has('forest/manor-1')).toBe(true);
  });

  it('stays open for the game: a later world shares the set and the door opens at a touch', () => {
    const first = world();
    type(first, 'wildstar');
    const later = makeWorld({ map: manor(), seed: 6, recruited: ['leaf', 'glacier'], unlocked: first.unlocked });
    tap(later, 'forest/manor-1');
    const seen = watch(later, 12);
    expect(kinds(seen, 'code-wanted')).toEqual([]);
    expect(kinds(seen, 'portal-entered')).toHaveLength(1);
  });

  it('never writes the unlocking to the save', () => {
    const w = world();
    type(w, 'wildstar');
    expect(JSON.stringify(w.persistent)).not.toContain('manor');
  });

  it('ignores a word for a door that wants none', () => {
    const w = world();
    dispatch(w, { type: 'enter-code', commandId: 'x', instanceId: 'forest/lift-1', code: 'wildstar' });
    dispatch(w, { type: 'enter-code', commandId: 'y', instanceId: 'forest/nothing', code: 'wildstar' });
    expect(drainEvents(w).filter((e) => e.type === 'unlocked' || e.type === 'code-refused')).toEqual([]);
  });
});

describe('a door that wants a clue', () => {
  it('shows where the clue is, and stays shut', () => {
    const w = world();
    tap(w, 'forest/lift-1');
    const seen = watch(w, 10);
    const hint = seen.find((e) => e.type === 'effect' && e.effect === 'pip-sparkle') as
      | { at: { x: number; y: number } }
      | undefined;
    expect(hint, 'a sparkle points at the clue').toBeDefined();
    expect(Math.abs(hint!.at.x - 1000)).toBeLessThan(2);
    expect(kinds(seen, 'portal-entered')).toEqual([]);
    expect(kinds(seen, 'code-wanted')).toEqual([]);
  });

  it('opens when the clue is touched, and the lift then takes her up, with a ride', () => {
    const w = world();
    tap(w, 'forest/clue-1');
    const found = watch(w, 6);
    expect(kinds(found, 'unlocked')).toEqual([{ type: 'unlocked', instanceId: 'forest/lift-1' }]);
    expect(
      found.some(
        (e) => e.type === 'prop-activity' && e.instanceId === 'forest/lift-1' && e.activity === 'door-opening',
      ),
    ).toBe(true);
    tap(w, 'forest/lift-1');
    const seen = watch(w, 12);
    const went = kinds(seen, 'portal-entered');
    expect(went).toHaveLength(1);
    expect(went[0]).toMatchObject({ to: { mapId: 'manor-upper' }, ride: 'up' });
  });

  it('is a pleasure to find: the clue sparkles like a delight, every time, and the door is opened only once', () => {
    const w = world();
    for (let i = 0; i < 2; i++) {
      tap(w, 'forest/clue-1');
      const seen = watch(w, 6);
      expect(
        seen.filter((e) => e.type === 'prop-activity' && e.instanceId === 'forest/clue-1'),
        `tap ${i + 1}`,
      ).toHaveLength(1);
      expect(kinds(seen, 'unlocked'), `tap ${i + 1}`).toHaveLength(i === 0 ? 1 : 0);
    }
  });

  it('is described by the definitions: one clue per kind of lift, and the lift on the way down wants none', () => {
    expect(PROP_DEFS['elevator-clue']!.opens).toBe('elevator-door');
    expect(PROP_DEFS['elevator-door']!.lock).toBe('clue');
    expect(PROP_DEFS['lift-door']!.lock).toBeUndefined();
    expect(PROP_DEFS['manor-door']!.lock).toBe('code');
  });
});

describe('a place only Wildstar may go', () => {
  it('has her alone, however many friends were found, and every rule about the herd still holds', () => {
    const herd = world();
    const solo = world(true);
    expect(Object.keys(herd.unicorns).length).toBeGreaterThan(1);
    expect(Object.keys(solo.unicorns).filter((id) => solo.persistent.recruited.includes(id as 'wildstar'))).toEqual([
      'wildstar',
    ]);
    expect(solo.order).toEqual([]);
    expect(solo.persistent.recruited.length).toBeGreaterThan(1);
    run(solo, 20, (x) => expect(checkInvariants(x)).toEqual([]));
    expect(solo.persistent.recruited).toEqual(herd.persistent.recruited);
  });
});
