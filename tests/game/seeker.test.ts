import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXIT_ARROW_HEIGHT } from '../../src/content/exits';
import { WORDS, type WordId } from '../../src/content/lexicon';
import { PROP_DEFS } from '../../src/content/props';
import type { World } from '../../src/domain';
import { newPersistent } from '../../src/domain/snapshot';
import { createWorld } from '../../src/domain/world';
import { type Goal, goalFor } from '../../src/game/seeker';
import { chartOf } from '../../src/learning';
import { CompiledMap } from '../../src/shared/compiled-map';
import type { MapId, UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { portalMark } from '../../src/shared/map';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const chart = chartOf(manifest.maps);
const compiled = (id: MapId): CompiledMap =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8')));

const worldIn = (mapId: MapId, recruited: readonly UnicornId[] = ['wildstar']): World => {
  const map = compiled(mapId).logic;
  const persistent = { ...newPersistent('00000000-0000-4000-8000-000000000001'), recruited: [...recruited] };
  return createWorld({ map, persistent, seed: 3, arrival: { kind: 'spawn', spawnId: map.spawns[0]!.spawnId } });
};

const exitTo = (world: World, goal: Goal | null): MapId => {
  expect(goal?.kind).toBe('exit');
  if (goal?.kind !== 'exit') throw new Error('not an exit');
  return world.map.portals.find((p) => p.portalId === goal.portalId)!.to.mapId;
};

const thing = (goal: Goal | null) => {
  expect(goal?.kind).toBe('thing');
  if (goal?.kind !== 'thing') throw new Error('not a thing');
  return goal;
};

describe('where to go to find a word', () => {
  it('is the table of a gem when she is in the treasure house, with the bubble above the table', () => {
    const world = worldIn('treasure-house');
    const table = world.map.interactables.find((i) => i.definitionId === 'ruby-table')!;
    const goal = thing(goalFor(world, chart, 'ruby'));
    expect(goal.target).toEqual({ kind: 'prop', instanceId: table.instanceId });
    expect(goal.at.x).toBeCloseTo(table.hit.x + table.hit.w / 2);
    expect(goal.at.y).toBeLessThanOrEqual(table.pos.y);
  });

  it('is a way out, the one the road begins with, when the word is in another place', () => {
    expect(exitTo(worldIn('treasure-house'), goalFor(worldIn('treasure-house'), chart, 'apple'))).toBe('palace-garden');
    const garden = worldIn('palace-garden');
    expect(exitTo(garden, goalFor(garden, chart, 'ruby'))).toBe('treasure-house');
    const forest = worldIn('forest');
    expect(exitTo(forest, goalFor(forest, chart, 'ruby'))).toBe('crystal-cave');
    expect(exitTo(forest, goalFor(forest, chart, 'apple'))).toBe('palace-garden');
  });

  it('puts the bubble for a way out where the way out hovers its own arrow', () => {
    const garden = worldIn('palace-garden');
    const goal = goalFor(garden, chart, 'ruby');
    const portal = garden.map.portals.find((p) => p.portalId === (goal as { portalId: string }).portalId)!;
    expect(goal!.at).toEqual({ x: portalMark(portal).x, y: portalMark(portal).y - EXIT_ARROW_HEIGHT });
  });

  it('is the nearest of the things that give it, wherever she stands', () => {
    const world = worldIn('palace-garden');
    const trees = world.map.interactables.filter((i) => i.definitionId === 'apple-tree');
    expect(trees.length).toBeGreaterThan(1);
    for (const tree of trees) {
      world.unicorns.wildstar!.pos = { x: tree.pos.x + 10, y: tree.pos.y + 90 };
      expect(thing(goalFor(world, chart, 'apple')).target, tree.instanceId).toEqual({
        kind: 'prop',
        instanceId: tree.instanceId,
      });
    }
  });

  it('is a creature that is out, the nearest one, when the word is an animal', () => {
    const world = worldIn('forest');
    const frogs = world.life.critters.filter((c) => c.kind === 'frog');
    expect(frogs.length).toBeGreaterThan(1);
    for (const frog of frogs) {
      world.unicorns.wildstar!.pos = { x: frog.pos.x, y: frog.pos.y + 20 };
      expect(thing(goalFor(world, chart, 'frog')).target).toEqual({ kind: 'critter', id: frog.id });
    }
  });

  it('is a friend where she waits, and is her own name wherever she stands', () => {
    const forest = worldIn('forest');
    expect(thing(goalFor(forest, chart, 'leaf')).target).toEqual({ kind: 'unicorn', id: 'leaf' });
    for (const id of ['forest', 'treasure-house', 'manor-hall'] as const) {
      expect(thing(goalFor(worldIn(id), chart, 'wildstar')).target, id).toEqual({ kind: 'unicorn', id: 'wildstar' });
    }
  });

  it('is the friend who walks with her, when she is already in the herd, and a way out where she cannot come', () => {
    const herd: UnicornId[] = ['wildstar', 'leaf'];
    expect(thing(goalFor(worldIn('treasure-house', herd), chart, 'leaf')).target).toEqual({
      kind: 'unicorn',
      id: 'leaf',
    });
    // Only Wildstar goes into the manor, so the friend is not there, and the way to her is back
    // out.
    const manor = worldIn('manor-hall', herd);
    expect(manor.unicorns.leaf).toBeUndefined();
    expect(exitTo(manor, goalFor(manor, chart, 'leaf'))).not.toBe('manor-hall');
  });

  it('starts the way through a door that wants a clue with the clue, and goes to the door once it is open', () => {
    const hall = worldIn('manor-hall');
    const clue = hall.map.interactables.find((i) => PROP_DEFS[i.definitionId]?.opens === 'elevator-door')!;
    expect(thing(goalFor(hall, chart, 'moon')).target).toEqual({ kind: 'prop', instanceId: clue.instanceId });
    hall.unlocked.add(hall.map.interactables.find((i) => i.definitionId === 'elevator-door')!.instanceId);
    expect(exitTo(hall, goalFor(hall, chart, 'moon'))).toBe('manor-upper');
  });

  it('goes to a door that wants a word, which asks for it when she gets there', () => {
    const forest = worldIn('forest');
    expect(exitTo(forest, goalFor(forest, chart, 'rose'))).toBe('manor-hall');
  });

  it('is somewhere for every word, from every place she can stand', () => {
    const missing: string[] = [];
    for (const id of Object.keys(manifest.maps) as MapId[]) {
      const world = worldIn(id, ['wildstar']);
      for (const word of Object.keys(WORDS) as WordId[]) {
        if (goalFor(world, chart, word) === null) missing.push(`${word} from ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
