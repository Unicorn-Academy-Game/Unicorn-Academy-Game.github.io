/** What the browser game, and the tests that drive it the same way, may use of the simulation. */
export { CONFIG } from './config';
export { checkInvariants } from './invariants';
export type { LoadPlan } from './snapshot';
export { clonePersistent, newPersistent, planLoad, toSave } from './snapshot';
export type {
  Command,
  Critter,
  Crown,
  DomainEvent,
  NpcActor,
  Persistent,
  PropActivity,
  Rules,
  SaveReason,
  UnicornActor,
  World,
} from './types';
export { createWorld, dispatch, drainEvents, navFor, step } from './world';
