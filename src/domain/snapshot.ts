import { cardinalOf } from '../shared/compass';
import type { MapId } from '../shared/ids';
import { WorldSaveV1 } from '../shared/save';
import { CONTENT_VERSION } from '../shared/version';
import { copy, inRect } from './geometry';
import type { Persistent, World } from './types';
import type { Arrival } from './world';

/** A fresh world's membership: Wildstar alone, nothing visited, no saved props. */
export function newPersistent(worldGeneration: string): Persistent {
  return { worldGeneration, contentVersion: CONTENT_VERSION, recruited: ['wildstar'], visitedMaps: [], props: {} };
}

/**
 * A copy that shares nothing with `persistent`, so a world made from it cannot change the one it
 * was taken from.
 */
export function clonePersistent(persistent: Persistent): Persistent {
  return {
    ...persistent,
    recruited: [...persistent.recruited],
    visitedMaps: [...persistent.visitedMaps],
    props: Object.fromEntries(Object.entries(persistent.props).map(([id, state]) => [id, { ...state }])),
  };
}

/** The part of a save that belongs to the whole world rather than the map it was taken in. */
export function persistentFromSave(save: WorldSaveV1): Persistent {
  return {
    worldGeneration: save.worldGeneration,
    contentVersion: save.contentVersion,
    recruited: [...save.recruited],
    visitedMaps: [...save.visitedMaps],
    props: { ...save.props },
  };
}

export function arrivalFromSave(save: WorldSaveV1): Arrival {
  return { kind: 'saved', position: copy(save.wildstar.position), facing: save.wildstar.facing };
}

/**
 * The save for a world as it stands. If Wildstar is inside a portal that is about to take the herd
 * away, the save puts her at the portal's approach point instead, so loading it does not start by
 * walking through the door again.
 */
export function toSave(world: World, snapshotId: string): WorldSaveV1 {
  const leader = world.unicorns.wildstar!;
  let position = copy(leader.pos);
  for (const p of world.map.portals) if (inRect(position, p.bounds)) position = copy(p.approach);
  const save: WorldSaveV1 = {
    schemaVersion: 1,
    contentVersion: world.persistent.contentVersion,
    worldGeneration: world.persistent.worldGeneration,
    snapshotId,
    mapId: world.map.id,
    wildstar: { position, facing: cardinalOf(leader.facing) },
    recruited: [...world.persistent.recruited],
    visitedMaps: [...world.persistent.visitedMaps],
    props: { ...world.persistent.props },
    rngState: world.rng.state,
  };
  return save;
}

/** What a loader needs from a save once it has been validated against the maps this build knows. */
export interface LoadPlan {
  mapId: MapId;
  persistent: Persistent;
  arrival: Arrival;
  seed: number;
}

/**
 * Validates untrusted save data and turns it into a plan for `createWorld`. A save that fails
 * validation is rejected whole; callers keep the previous good snapshot instead of loading half of
 * one.
 */
export function planLoad(
  raw: unknown,
  knownMaps: readonly MapId[],
): { ok: true; plan: LoadPlan } | { ok: false; reason: string } {
  const parsed = WorldSaveV1.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? 'invalid save' };
  const save = parsed.data;
  if (!knownMaps.includes(save.mapId)) return { ok: false, reason: `unknown map ${save.mapId}` };
  return {
    ok: true,
    plan: {
      mapId: save.mapId,
      persistent: persistentFromSave(save),
      arrival: arrivalFromSave(save),
      seed: save.rngState,
    },
  };
}
