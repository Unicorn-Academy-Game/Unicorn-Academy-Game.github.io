import { describe, expect, it } from 'vitest';
import { PRODUCE_IDS } from '../../src/content/produce';
import { PROP_DEFS } from '../../src/content/props';
import { CONFIG } from '../../src/domain/config';
import { dropProduce } from '../../src/domain/systems/pickups';
import type { DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents, step } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { LogicMap } from '../../src/shared/map';
import { leaderOf, makeWorld, meadow, run, teleport } from './fixtures';

const FARM_DEFS = Object.values(PROP_DEFS).filter((d) => d.tap === 'harvest');

/**
 * The meadow with an apple tree and a carrot bed in the open ground below the herd's starting line.
 */
function orchard(): LogicMap {
  const base = meadow();
  const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });
  return LogicMap.parse({
    ...base,
    interactables: [
      ...base.interactables,
      {
        instanceId: 'forest/apple-1',
        definitionId: 'apple-tree',
        pos: { x: 700, y: 1200 },
        hit: box(700, 1120, 80),
        approach: [{ pos: { x: 700, y: 1290 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/carrots-1',
        definitionId: 'carrot-bed',
        pos: { x: 950, y: 1250 },
        hit: box(950, 1230, 90),
        approach: [{ pos: { x: 950, y: 1340 }, facing: 'north' }],
      },
    ],
  });
}

const world = (seed = 12345, recruited: UnicornId[] = []): World => makeWorld({ map: orchard(), seed, recruited });
const harvest = (w: World, instanceId: string): void =>
  dispatch(w, { type: 'interact', commandId: `h-${instanceId}`, instanceId });
const eventsOf = <T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] => events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);

describe('fruit and vegetables', () => {
  it('only name produce that has a picture, and every harvest prop gives something', () => {
    expect(FARM_DEFS.length).toBeGreaterThan(0);
    for (const def of FARM_DEFS) {
      expect(def.tap).toBe('harvest');
      expect(def.harvest, `${def.id} says what it gives`).toBeDefined();
      for (const p of def.harvest!.produce) expect(PRODUCE_IDS, `${def.id} gives ${p}`).toContain(p);
      expect(def.harvest!.count[0]).toBeGreaterThan(0);
      expect(def.harvest!.count[1]).toBeGreaterThanOrEqual(def.harvest!.count[0]);
    }
  });

  it('fall around where she stands when a tree is tapped, and lie where a unicorn can stand', () => {
    const w = world();
    const seen: DomainEvent[] = [];
    harvest(w, 'forest/apple-1');
    run(w, 14, (x) => seen.push(...drainEvents(x)));
    const dropped = eventsOf(seen, 'produce-dropped');
    const [lo, hi] = PROP_DEFS['apple-tree']!.harvest!.count;
    expect(dropped.length).toBeGreaterThanOrEqual(lo);
    expect(dropped.length).toBeLessThanOrEqual(hi);
    for (const d of dropped) {
      expect(d.produce).toBe('apple');
      expect(Math.hypot(d.to.x - 700, d.to.y - 1290)).toBeLessThanOrEqual(CONFIG.pickups.reachMax + 2);
      expect(w.nav.isWalkable(d.to, 0)).toBe(true);
    }
  });

  it('are gathered by whoever walks over them, and by no one who stands away', () => {
    const w = world();
    const inst = w.interactables.get('forest/apple-1')!;
    dropProduce(w, inst, PROP_DEFS['apple-tree']!);
    const [first] = w.pickups.list;
    expect(first).toBeDefined();
    // Nothing is gathered while it is still falling, even by someone standing right under it.
    teleport(w, 'wildstar', first!.to);
    run(w, 0.2);
    expect(w.pickups.list).toContain(first);
    run(w, 1);
    expect(w.pickups.list).not.toContain(first);
    const gathered = eventsOf(drainEvents(w), 'produce-collected');
    expect(gathered.some((g) => g.pickupId === first!.id && g.by === 'wildstar')).toBe(true);
    // The others are still there, because she was not near them.
    expect(w.pickups.list.length).toBeGreaterThan(0);
  });

  it('are gathered by any unicorn of the herd, the one standing nearest', () => {
    const w = world(7, ['leaf', 'river']);
    teleport(w, 'wildstar', { x: 800, y: 900 });
    run(w, 3);
    drainEvents(w);
    const river = w.unicorns.river!;
    const lands = { x: river.pos.x + 8, y: river.pos.y };
    w.pickups.list.push({ id: 'pickup-test', produce: 'carrot', from: lands, lift: 0, to: lands, born: w.time - 5 });
    step(w);
    const gathered = eventsOf(drainEvents(w), 'produce-collected').find((g) => g.pickupId === 'pickup-test');
    expect(gathered?.by).toBe('river');
    expect(w.pickups.list).toHaveLength(0);
  });

  it('never lie about in greater number than the cap, and the oldest is gathered by magic to make room', () => {
    const w = world();
    const inst = w.interactables.get('forest/apple-1')!;
    const def = PROP_DEFS['apple-tree']!;
    let made = 0;
    for (let i = 0; i < 20; i++) {
      dropProduce(w, inst, def);
      expect(w.pickups.list.length).toBeLessThanOrEqual(CONFIG.pickups.cap);
    }
    made = w.pickups.made;
    const collected = eventsOf(drainEvents(w), 'produce-collected');
    expect(made).toBeGreaterThan(CONFIG.pickups.cap);
    expect(collected.length).toBe(made - w.pickups.list.length);
    for (const c of collected) expect(c.by).toBe('wildstar');
    // The ones that went are the oldest.
    expect(collected[0]!.pickupId).toBe('pickup-1');
  });

  it('land in the same places in the same world, and in other places in another', () => {
    const where = (seed: number): string => {
      const w = world(seed);
      dropProduce(w, w.interactables.get('forest/apple-1')!, PROP_DEFS['apple-tree']!);
      return JSON.stringify(w.pickups.list.map((p) => p.to));
    };
    expect(where(5)).toBe(where(5));
    expect(where(5)).not.toBe(where(6));
  });

  it('never change what the herd does, because they draw from a stream of their own', () => {
    const quiet = world(21, ['leaf', 'glacier', 'river']);
    const busy = world(21, ['leaf', 'glacier', 'river']);
    for (let i = 0; i < 4; i++) dropProduce(busy, busy.interactables.get('forest/apple-1')!, PROP_DEFS['apple-tree']!);
    run(quiet, 20);
    run(busy, 20);
    expect(busy.rng.state).toBe(quiet.rng.state);
    for (const id of ['wildstar', 'leaf', 'glacier', 'river'] as const)
      expect(busy.unicorns[id]!.pos).toEqual(quiet.unicorns[id]!.pos);
  });

  it('leave her free to walk on afterwards', () => {
    const w = world();
    harvest(w, 'forest/apple-1');
    run(w, 8);
    expect(w.pickups.made, 'the spell was cast').toBeGreaterThan(0);
    run(w, 2);
    const before = { ...leaderOf(w).pos };
    dispatch(w, { type: 'steer', commandId: 'on', heading: { x: 1, y: 0 } });
    run(w, 1);
    expect(leaderOf(w).pos.x).toBeGreaterThan(before.x + 30);
  });
});
