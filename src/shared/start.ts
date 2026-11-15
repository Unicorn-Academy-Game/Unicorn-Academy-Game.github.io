import type { WorldSaveV1 } from './save';
import { CONTENT_VERSION } from './version';

/**
 * Where a brand-new world begins: Wildstar at the head of the forest's `start` spawn. The Worker
 * uses it to build the world a parent reset installs, so it has to agree with the forest map.
 * tests/maps checks that it does.
 */
export const NEW_WORLD_START = { mapId: 'forest', position: { x: 858, y: 2342 }, facing: 'east' } as const;

/**
 * The world a parent reset starts from: Wildstar alone in the forest, nothing visited but the
 * forest, no prop changes.
 */
export function initialWorld(fresh: { worldGeneration: string; snapshotId: string; rngState: number }): WorldSaveV1 {
  return {
    schemaVersion: 1,
    contentVersion: CONTENT_VERSION,
    worldGeneration: fresh.worldGeneration,
    snapshotId: fresh.snapshotId,
    mapId: NEW_WORLD_START.mapId,
    wildstar: { position: { ...NEW_WORLD_START.position }, facing: NEW_WORLD_START.facing },
    recruited: ['wildstar'],
    visitedMaps: [NEW_WORLD_START.mapId],
    props: {},
    rngState: fresh.rngState,
  };
}
