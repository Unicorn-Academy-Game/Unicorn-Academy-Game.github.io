import { clonePersistent, type LoadPlan, newPersistent, type Persistent, planLoad } from '../domain';
import type { MapId } from '../shared/ids';
import { START_PLACES, type StartPlaceId } from '../shared/places';
import type { WorldSaveV1 } from '../shared/save';
import type { LoadOutcome } from './load';

/**
 * How one opening of the game treats the world that is saved on the device.
 *
 * - `kept`: the world on the device is loaded and saved to as the player plays.
 * - `fresh`: the player starts from the beginning of the forest and finds the unicorns again. What
 *   happens is not saved, so the world on the device is exactly as it was. Reloading the same tab
 *   carries the visit on.
 * - `incognito`: the same, for a parent who is trying the game. Nothing is written to the device at
 *   all, not even the settings, and a reload starts again.
 */
export type VisitKind = 'kept' | 'fresh' | 'incognito';

/**
 * Where the address says the game is being opened, and what the setting says. The address wins, and
 * incognito wins over all. `?keep` and `?fresh` are for the first opening only: the start screen's
 * switch for starting from scratch changes the setting, and the page opens again by the setting.
 */
export function chooseVisit(where: { search: string }, startFresh: boolean): VisitKind {
  const query = new URLSearchParams(where.search);
  if (query.has('incognito')) return 'incognito';
  if (query.has('keep')) return 'kept';
  if (query.has('fresh')) return 'fresh';
  return startFresh ? 'fresh' : 'kept';
}

/**
 * The key the tab's note about the visit is kept under. The note lives as long as the tab and is
 * not shared with other tabs.
 */
export const VISIT_KEY = 'ua.visit';

/**
 * Where a visit's saves go. The tab remembers the latest, so a reload in the middle of a visit (an
 * update taking over, the browser giving the page back after it was put away) carries on and does
 * not send the player back to the start.
 */
export class VisitSink {
  /** Not on the disk, so there is nothing to ask the browser to keep. */
  readonly durable = false;

  constructor(private readonly tab: Pick<Storage, 'setItem'> | null) {}

  async commit(save: WorldSaveV1): Promise<void> {
    try {
      this.tab?.setItem(VISIT_KEY, JSON.stringify(save));
    } catch {
      // A tab that cannot remember costs a visit its reload, and nothing else.
    }
  }
}

/**
 * Forgets the visit this tab was in, so the next load starts a new one. An update does this, so the
 * new version begins a new game.
 */
export function forgetVisit(tab: Pick<Storage, 'removeItem'> | null): void {
  try {
    tab?.removeItem(VISIT_KEY);
  } catch {
    // A tab that cannot forget has nothing to start over from either, or it resumes the visit,
    // which does no harm.
  }
}

/**
 * The visit this tab was in, or what a new one starts from. A note that cannot be read or does not
 * pass the checks is ignored.
 */
export function visitOutcome(tab: Pick<Storage, 'getItem'> | null, knownMaps: readonly MapId[]): LoadOutcome {
  let raw: unknown = null;
  try {
    const text = tab?.getItem(VISIT_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (raw === null) return { kind: 'fresh', damaged: false };
  const planned = planLoad(raw, knownMaps);
  return planned.ok ? { kind: 'resume', plan: planned.plan, skipped: 0 } : { kind: 'fresh', damaged: false };
}

/**
 * The key of the tab's note that a game was begun in it. Like the visit's, it lives as long as the
 * tab.
 */
export const BEGUN_KEY = 'ua.begun';

/**
 * Notes that the player pressed Play in this tab. From then on a reload carries the game on where
 * the player stood, and does not begin it again at the start place.
 */
export function markBegun(tab: Pick<Storage, 'setItem'> | null): void {
  try {
    tab?.setItem(BEGUN_KEY, '1');
  } catch {
    // A tab that cannot remember sends a reload back to the start place, and nothing else.
  }
}

/**
 * Forgets that a game was begun here, so the next load begins one. Starting from scratch does this
 * with the visit's note.
 */
export function forgetBegun(tab: Pick<Storage, 'removeItem'> | null): void {
  try {
    tab?.removeItem(BEGUN_KEY);
  } catch {
    // A tab that cannot forget has nothing to carry on from either, or it carries on, which does no
    // harm.
  }
}

export function hasBegun(tab: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return tab?.getItem(BEGUN_KEY) === '1';
  } catch {
    return false;
  }
}

/** A world as it stands, with its herd, its changes and its chance, and nowhere to stand yet. */
export interface Held {
  persistent: Persistent;
  seed: number;
}

/**
 * What one opening has to put on the screen. `held` is the world as it stands, with its herd and
 * its changes, and nowhere to stand yet. `resumed` is where the player stood, and is there only
 * when this tab is carrying a game on.
 */
export interface Opening {
  held: Held;
  resumed: LoadPlan | null;
}

/**
 * What an opening holds. A world saved on the device is on it whether or not this tab has played
 * it, so only a tab that has begun carries on from where the player stood, and any other begins at
 * the start place with the herd that world has. A visit that starts from the beginning keeps its
 * note in the tab, so having one is carrying on. With nothing saved the world is new.
 */
export function openingOf(
  visit: VisitKind,
  outcome: Exclude<LoadOutcome, { kind: 'too-new' }>,
  begun: boolean,
  fresh: { worldGeneration: string; seed: number },
): Opening {
  if (outcome.kind !== 'resume')
    return { held: { persistent: newPersistent(fresh.worldGeneration), seed: fresh.seed }, resumed: null };
  const { persistent, seed } = outcome.plan;
  return { held: { persistent, seed }, resumed: visit === 'kept' && !begun ? null : outcome.plan };
}

/**
 * The world that begins at a start place: the herd and changes it holds, arriving at the place's
 * spawn. It is a copy, so making a world from one plan never changes what the next plan is made
 * from.
 */
export function beginAt(held: Held, place: StartPlaceId): LoadPlan {
  const { mapId, spawnId } = START_PLACES[place];
  return { mapId, persistent: clonePersistent(held.persistent), arrival: { kind: 'spawn', spawnId }, seed: held.seed };
}

/**
 * The world the page opens on: where the player stood if a game is being carried on, and otherwise
 * the start place.
 */
export function firstPlan(opening: Opening, place: StartPlaceId): LoadPlan {
  return opening.resumed
    ? { ...opening.resumed, persistent: clonePersistent(opening.resumed.persistent) }
    : beginAt(opening.held, place);
}
