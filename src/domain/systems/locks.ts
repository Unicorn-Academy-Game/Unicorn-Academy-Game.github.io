import { DOOR_REVEAL_SECONDS, PROP_DEFS } from '../../content/props';
import { effect, emit, startTransient } from '../ops';
import type { World } from '../types';

/**
 * The door is open for good, for as long as the game is. Telling the screen lets it draw the door
 * open and stop asking.
 */
export function unlock(world: World, doorInstanceId: string): void {
  if (world.unlocked.has(doorInstanceId)) return;
  world.unlocked.add(doorInstanceId);
  emit(world, { type: 'unlocked', instanceId: doorInstanceId });
}

/** A clue was found: every door in the room that it opens slides open and stays that way. */
export function foundClue(world: World, clueInstanceId: string): void {
  const opens = PROP_DEFS[world.interactables.get(clueInstanceId)?.definitionId ?? '']?.opens;
  if (!opens) return;
  for (const door of world.interactables.values()) {
    if (door.definitionId !== opens || world.unlocked.has(door.instanceId)) continue;
    unlock(world, door.instanceId);
    startTransient(world, door.instanceId, 'door-opening', DOOR_REVEAL_SECONDS);
    emit(world, {
      type: 'prop-activity',
      instanceId: door.instanceId,
      activity: 'door-opening',
      seconds: DOOR_REVEAL_SECONDS,
    });
    effect(world, 'door-glow', door.pos, 1.6);
  }
}
