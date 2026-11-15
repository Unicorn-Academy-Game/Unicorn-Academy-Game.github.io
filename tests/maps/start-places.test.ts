import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../src/domain/invariants';
import { newPersistent } from '../../src/domain/snapshot';
import { createWorld, step } from '../../src/domain/world';
import { facingOfCardinal } from '../../src/shared/compass';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, UNICORN_IDS } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { DEFAULT_START_PLACE, START_PLACE_IDS, START_PLACES } from '../../src/shared/places';
import { NEW_WORLD_START } from '../../src/shared/start';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const compiled = (id: (typeof MAP_IDS)[number]): CompiledMap =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps![id]!.file}`, 'utf8')));

const WHOLE_HERD = [...UNICORN_IDS];

describe('the places a visit can begin', () => {
  it('are in maps the game has, at a spawn that map has', () => {
    for (const id of START_PLACE_IDS) {
      const place = START_PLACES[id];
      expect(MAP_IDS, id).toContain(place.mapId);
      expect(
        compiled(place.mapId).logic.spawns.map((s) => s.spawnId),
        id,
      ).toContain(place.spawnId);
    }
  });

  it('start with the forest, which is where a new world has always begun and what a parent reset builds', () => {
    expect(DEFAULT_START_PLACE).toBe('forest');
    expect(START_PLACES.forest).toMatchObject({ mapId: NEW_WORLD_START.mapId, spawnId: 'start' });
    const spawn = compiled('forest').logic.spawns.find((s) => s.spawnId === START_PLACES.forest.spawnId)!;
    expect(spawn.points[0]).toEqual(NEW_WORLD_START.position);
    expect(spawn.facing).toBe(NEW_WORLD_START.facing);
  });

  it('put Wildstar at the head of the spawn, alone or with the whole herd behind her, and leave nobody stuck', () => {
    for (const id of START_PLACE_IDS) {
      const place = START_PLACES[id];
      const map = compiled(place.mapId).logic;
      const spawn = map.spawns.find((s) => s.spawnId === place.spawnId)!;
      for (const herd of [['wildstar'], WHOLE_HERD] as const) {
        const persistent = { ...newPersistent('00000000-0000-4000-8000-000000000001'), recruited: [...herd] };
        const world = createWorld({ map, persistent, seed: 7, arrival: { kind: 'spawn', spawnId: place.spawnId } });
        const leader = world.unicorns.wildstar!;
        expect(leader.pos, `${id} with ${herd.length}`).toEqual(spawn.points[0]);
        expect(leader.facing, id).toBe(facingOfCardinal(spawn.facing));
        expect(world.persistent.visitedMaps, id).toEqual([place.mapId]);
        expect(checkInvariants(world), `${id} with ${herd.length}`).toEqual([]);
        for (let i = 0; i < 120; i++) step(world);
        expect(checkInvariants(world), `${id} with ${herd.length} after 4 seconds`).toEqual([]);
      }
    }
  });
});
