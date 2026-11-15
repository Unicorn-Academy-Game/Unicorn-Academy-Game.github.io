import { exportBook, mergeProfiles } from '../../learning';
import type { Durability } from '../../persistence/durable';
import { type SetAside, setAside, type WorldKeeper } from '../../persistence/keeper';
import type { LearnerModel } from '../../persistence/learner';
import type { PlayModel } from '../../persistence/play';
import type { SaveService } from '../../persistence/save-service';
import type { SettingsModel } from '../../persistence/settings';
import type { LocalStore } from '../../persistence/store';
import type { VisitKind } from '../../persistence/visit';
import type { ProfileId } from '../../render/profile';
import { exportFile, summarize } from '../../shared/exchange';
import type { WorldSaveV1 } from '../../shared/save';
import type { Fullscreen } from '../fullscreen';
import { deliver } from './download';
import type { AboutInfo, OfflineControls, ParentServices, StartNewResult, WorldControls } from './services';

/** The game's real services, which the parent controls are wired to. */
export interface RealParts {
  settings: SettingsModel;
  visit: VisitKind;
  /** How the game is drawing this opening. */
  profile: ProfileId;
  saves: SaveService;
  /**
   * What the player has learned, as the game holds it. In a private visit it is a copy that is
   * never written.
   */
  learner: LearnerModel;
  /** What the player has done at the tables, which is the book's own and starts again with it. */
  play: Pick<PlayModel, 'reset'>;
  /** What the browser has promised about keeping it. */
  durable: Durability;
  /** Null where this browser cannot show the page full screen. */
  fullscreen: Fullscreen | null;
  /** Null on a device whose browser has no storage to keep worlds in. */
  keeper: WorldKeeper | null;
  /**
   * What this device keeps, for finding what was put aside. Null when the browser has no storage.
   */
  store: Pick<LocalStore, 'quarantined'> | null;
  /** The running game's world as a save. */
  live: () => WorldSaveV1 | null;
  /** Writes the game's newest state to the device, now. */
  flush: () => Promise<void>;
  confirmSound: () => void;
  offline: OfflineControls | null;
  about: AboutInfo;
  now: () => number;
}

const NO_STORAGE = 'This browser cannot keep saved worlds, so a world cannot be swapped here.';
const VISITING =
  'The saved world is left alone while the game starts from the beginning each time, so it cannot be swapped now. Turn that off under Play and open the game again.';

/**
 * What was put aside, in every visit. A Spell Book put away is kept whether or not the saved world
 * is being used.
 */
const damaged = (parts: RealParts): Promise<SetAside[]> => (parts.store ? setAside(parts.store) : Promise.resolve([]));

/**
 * Without a saved world to work on there is only the world on screen: it can be downloaded and
 * nothing else.
 */
function liveWorldOnly(parts: RealParts, refusal: string): WorldControls {
  const live = (): WorldSaveV1 | null => parts.live();
  return {
    current: async () => {
      const world = live();
      return world ? summarize(world) : null;
    },
    exportWorld: async () => {
      const world = live();
      return world ? exportFile(world, new Date(parts.now()).toISOString()) : null;
    },
    shelf: async () => [],
    preview: async () => null,
    replace: async () => ({ ok: false, reason: refusal }),
    damagedData: () => damaged(parts),
  };
}

function worldControls(parts: RealParts): WorldControls {
  const { keeper } = parts;
  if (parts.visit !== 'kept') return liveWorldOnly(parts, VISITING);
  if (!keeper) return liveWorldOnly(parts, NO_STORAGE);
  return {
    current: async () => {
      const world = parts.live() ?? (await keeper.current());
      return world ? summarize(world) : null;
    },
    exportWorld: () => keeper.exportWorld(),
    shelf: () => keeper.shelf(),
    preview: (source) => keeper.preview(source),
    replace: (source) => keeper.replace(source),
    damagedData: () => damaged(parts),
  };
}

/**
 * What the player did at the tables goes with the book it belongs to, once the book is put away.
 */
async function startNew(parts: RealParts): Promise<StartNewResult> {
  if (!(await parts.learner.reset())) return 'refused';
  await parts.play.reset();
  return 'started';
}

export function parentServices(parts: RealParts): ParentServices {
  const { settings, saves } = parts;
  return {
    settings: {
      get: () => settings.get(),
      subscribe: (listener) => settings.subscribe(listener),
      update: (patch) => settings.update(patch),
    },
    visit: parts.visit,
    profile: parts.profile,
    saves: { get: () => saves.status, subscribe: (listener) => saves.subscribe(listener) },
    fullscreen: parts.fullscreen,
    world: worldControls(parts),
    learning: {
      book: { get: () => parts.learner.get(), subscribe: (listener) => parts.learner.subscribe(listener) },
      keeping: () => parts.learner.keeping(),
      durable: parts.durable,
      startNew: () => startNew(parts),
      save: () => exportBook(parts.learner.get(), new Date(parts.now()).toISOString()),
      add: (book) => parts.learner.set(mergeProfiles(parts.learner.get(), book)),
      change: (update) => parts.learner.set(update(parts.learner.get())),
    },
    offline: parts.offline,
    about: parts.about,
    now: parts.now,
    confirmSound: parts.confirmSound,
    download: (file) => void deliver(file),
  };
}
