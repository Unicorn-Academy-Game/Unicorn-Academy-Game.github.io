import { describe, expect, it } from 'vitest';
import type { DomainEvent, World } from '../../src/domain';
import { CONFIG } from '../../src/domain/config';
import { createWorld, dispatch, drainEvents } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { makeWorld, meadow, run, teleport } from './fixtures';

const eventsOf = <T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] => events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);

/** Casts the spell of `caster` at a prop of the fixture map and waits for the cast to land. */
function light(world: World, caster: UnicornId, instance: string): void {
  const prop = world.interactables.get(instance)!;
  teleport(world, 'wildstar', { x: prop.pos.x, y: prop.pos.y + 110 });
  dispatch(world, { type: 'cast', commandId: `c-${world.tick}`, unicornId: caster });
  run(world, 1.2);
}

describe('magic that wears off', () => {
  const cases: [UnicornId, string, string][] = [
    ['wildstar', 'forest/lantern-1', 'lantern'],
    ['leaf', 'forest/bed-1', 'flowerbed'],
    ['cinder', 'forest/brazier-1', 'brazier'],
  ];

  it('puts a lantern, a flower bed and a brazier back after ten seconds', () => {
    expect(CONFIG.magic.hold).toBe(10);
    for (const [caster, instance, kind] of cases) {
      const world = makeWorld({ recruited: ['leaf', 'cinder'], seed: 2 });
      const start = JSON.stringify(world.persistent.props[instance]);
      light(world, caster, instance);
      expect(world.persistent.props[instance]?.kind, `${instance} changed`).toBe(kind);
      expect(JSON.stringify(world.persistent.props[instance]), `${instance} is different while it glows`).not.toBe(
        start,
      );
      run(world, CONFIG.magic.hold - 2);
      expect(
        JSON.stringify(world.persistent.props[instance]),
        `${instance} still glows before the time is up`,
      ).not.toBe(start);
      run(world, 3);
      expect(JSON.stringify(world.persistent.props[instance]), `${instance} is back`).toBe(start);
    }
  });

  it('tells the picture and the save that it changed back', () => {
    const world = makeWorld({ seed: 2 });
    light(world, 'wildstar', 'forest/lantern-1');
    drainEvents(world);
    run(world, CONFIG.magic.hold + 1);
    const events = drainEvents(world);
    expect(eventsOf(events, 'prop-changed').map((e) => e.instanceId)).toContain('forest/lantern-1');
    expect(eventsOf(events, 'save-needed').some((e) => e.reason === 'prop')).toBe(true);
  });

  it('can be lit again as soon as it is out', () => {
    const world = makeWorld({ seed: 2 });
    light(world, 'wildstar', 'forest/lantern-1');
    run(world, CONFIG.magic.hold + 1);
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: false });
    light(world, 'wildstar', 'forest/lantern-1');
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: true });
  });

  it('starts the count again when it is cast on while still lit', () => {
    const world = makeWorld({ seed: 2 });
    light(world, 'wildstar', 'forest/lantern-1');
    run(world, 6);
    light(world, 'wildstar', 'forest/lantern-1');
    run(world, 6);
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: true });
    run(world, 6);
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: false });
  });

  it('puts out a lantern that a saved game remembers as lit, ten seconds after the world starts', () => {
    const first = makeWorld({ seed: 2 });
    first.persistent.props['forest/lantern-1'] = { kind: 'lantern', lit: true };
    const world = createWorld({
      map: meadow(),
      persistent: first.persistent,
      seed: 2,
      arrival: { kind: 'spawn', spawnId: 'start' },
    });
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: true });
    run(world, CONFIG.magic.hold - 1);
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: true });
    run(world, 2);
    expect(world.persistent.props['forest/lantern-1']).toEqual({ kind: 'lantern', lit: false });
  });

  it('leaves a chest as it was left, because a chest is opened by hand and not by a spell', () => {
    const world = makeWorld({ seed: 2 });
    const chests = [...world.interactables.values()].filter((i) => i.definitionId === 'chest').map((i) => i.instanceId);
    expect(chests.length).toBeGreaterThan(0);
    for (const id of chests) world.persistent.props[id] = { kind: 'chest', open: true };
    run(world, CONFIG.magic.hold * 2);
    for (const id of chests) expect(world.persistent.props[id]).toEqual({ kind: 'chest', open: true });
  });
});
