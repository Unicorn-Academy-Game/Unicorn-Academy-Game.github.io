import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALACE_ROOMS, WAY_OUT } from '../../src/content/way-out';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const compiled = (id: (typeof MAP_IDS)[number]): CompiledMap =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps![id]!.file}`, 'utf8')));

describe('the way out of a place in one tap', () => {
  it('leads to a spawn that the map it names has', () => {
    for (const [from, out] of Object.entries(WAY_OUT)) {
      expect(MAP_IDS, `${from} leads to a map`).toContain(out.to.mapId);
      expect(
        compiled(out.to.mapId).logic.spawns.map((s) => s.spawnId),
        `${from} leads to a spawn`,
      ).toContain(out.to.spawnId);
    }
  });

  it('is in every room of the palace, and takes the herd to the lawn in front of the palace door', () => {
    expect(PALACE_ROOMS).toContain('palace-hall');
    expect(PALACE_ROOMS).toHaveLength(10);
    for (const room of PALACE_ROOMS) expect(WAY_OUT[room], room).toMatchObject({ to: { mapId: 'palace-garden' } });
  });

  it('is in every map whose name says it is a room of the palace, so a new room cannot be left without one', () => {
    for (const id of MAP_IDS.filter((map) => map.startsWith('palace-') && map !== 'palace-garden'))
      expect(WAY_OUT[id], id).toBeDefined();
  });

  it('is not in the open air, where the child can walk where they like', () => {
    for (const id of ['forest', 'palace-garden', 'playground'] as const) expect(WAY_OUT[id], id).toBeUndefined();
  });

  it('does not lead from a place to the place it is in', () => {
    for (const [from, out] of Object.entries(WAY_OUT)) expect(out.to.mapId, from).not.toBe(from);
  });
});
