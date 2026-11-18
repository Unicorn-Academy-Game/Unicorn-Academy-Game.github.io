import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ISLAND_PINS, PALACE_SPOTS, pinFor } from '../../src/content/world-map';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId } from '../../src/shared/ids';
import { mapContext } from '../../tools/maps/build-maps';
import { compileAll } from '../../tools/maps/compile';

let maps: Record<MapId, CompiledMap['logic']>;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'unicorn-world-map-'));
  const out = compileAll('assets/maps', dir, mapContext());
  maps = Object.fromEntries(
    out.map((o) => [
      o.id,
      CompiledMap.parse(JSON.parse(readFileSync(join(dir, o.file.replace(/^maps\//, '')), 'utf8'))).logic,
    ]),
  ) as Record<MapId, CompiledMap['logic']>;
}, 300_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const everySpot = [...ISLAND_PINS, ...PALACE_SPOTS];

describe('the map of the island', () => {
  it('takes the herd to a place that exists, and comes out at a spawn that exists there', () => {
    for (const spot of everySpot) {
      const map = maps[spot.to.mapId];
      expect(map, `${spot.id}: no map ${spot.to.mapId}`).toBeDefined();
      expect(
        map.spawns.map((s) => s.spawnId),
        `${spot.id} comes out at ${spot.to.spawnId}`,
      ).toContain(spot.to.spawnId);
    }
  });

  it('has a way to every place in the world, so a child can go anywhere', () => {
    const reachable = new Set<MapId>(everySpot.map((s) => s.to.mapId));
    for (const id of MAP_IDS) expect(reachable.has(id), `${id} is on the map`).toBe(true);
  });

  it('puts every place on the picture once, with its button inside the picture and apart from the rest', () => {
    const seen = new Set<string>();
    for (const pin of ISLAND_PINS) {
      expect(seen.has(pin.id), `${pin.id} is listed twice`).toBe(false);
      seen.add(pin.id);
      expect(pin.at.x).toBeGreaterThan(60);
      expect(pin.at.x).toBeLessThan(940);
      expect(pin.at.y).toBeGreaterThan(120);
      expect(pin.at.y).toBeLessThan(900);
    }
    for (const a of ISLAND_PINS)
      for (const b of ISLAND_PINS) {
        if (a.id >= b.id) continue;
        // Buttons are 1.6 wide for every 1 high, so a gap along the width counts for less.
        const gap = Math.hypot((a.at.x - b.at.x) / 1.6, a.at.y - b.at.y);
        expect(gap, `${a.id} and ${b.id} are too close to tap apart`).toBeGreaterThan(95);
      }
  });

  it('says where the herd is, and a palace room counts as the palace', () => {
    expect(pinFor('beach')).toBe('beach');
    expect(pinFor('palace-garden')).toBe('garden');
    for (const room of PALACE_SPOTS) expect(pinFor(room.to.mapId)).toBe('palace');
    for (const id of MAP_IDS) expect(pinFor(id), `${id} has a pin`).not.toBeNull();
  });

  it('names every place in words a child can read', () => {
    for (const spot of everySpot) {
      expect(spot.label.length).toBeLessThanOrEqual(16);
      expect(spot.label).toMatch(/^[A-Z][A-Za-z ]+$/);
    }
  });
});
