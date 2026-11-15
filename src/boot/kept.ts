import { Durability } from '../persistence/durable';
import { LearnerModel } from '../persistence/learner';
import { type LoadOutcome, loadWorld } from '../persistence/load';
import { PlayModel } from '../persistence/play';
import { SaveService } from '../persistence/save-service';
import { SettingsModel } from '../persistence/settings';
import { LocalStore, StoreError } from '../persistence/store';
import { chooseVisit, type VisitKind, VisitSink, visitOutcome } from '../persistence/visit';
import { MAP_IDS } from '../shared/ids';
import type { Manifest } from '../shared/manifest';
import type { Ui } from '../ui/ui';
import { type TabStorage, tabStorage } from './browser';

/**
 * What the loading screen says while the game waits for another window of it to let go of the saved
 * world.
 */
const OTHER_WINDOW = 'The game is open in another window. Close that one, and this one will wake up.';

export interface Stored {
  store: LocalStore | null;
  /** Why the store did not open. Undefined when it did, and when the browser gave no reason. */
  openError: StoreError | undefined;
  settings: SettingsModel;
}

async function openStore(
  onBlocked: () => void,
): Promise<{ store: LocalStore | null; openError: StoreError | undefined }> {
  try {
    return { store: await LocalStore.open(undefined, { blocked: onBlocked }), openError: undefined };
  } catch (error) {
    return { store: null, openError: error instanceof StoreError ? error : undefined };
  }
}

/**
 * Opens the device's storage and reads the settings. The stage is made once and cannot change how
 * it draws afterwards, so what a parent chose is read before it. A copy of the game from before
 * this release can still have the database open in another window, and the browser waits for it, so
 * the screen says so.
 */
export async function openStored(ui: Ui): Promise<Stored> {
  const { store, openError } = await openStore(() => ui.progress(0.04, OTHER_WINDOW));
  return { store, openError, settings: await SettingsModel.load(store) };
}

/** Everything the visit keeps on the device or reads from it, once the visit is known. */
export interface Kept {
  visit: VisitKind;
  tab: TabStorage | null;
  settings: SettingsModel;
  learner: LearnerModel;
  play: PlayModel;
  durable: Durability;
  saves: SaveService;
  /** What the saved world turned out to be, for the world to start from. */
  outcome: LoadOutcome;
}

export async function readKept({ store, openError, settings: stored }: Stored, manifest: Manifest): Promise<Kept> {
  // How this opening treats the saved world: carries on with it, or starts from the beginning and
  // leaves it alone.
  const visit = chooseVisit(location, stored.get().startFresh);
  // A look around reads what is kept, so the game looks as it does for the player, and never writes
  // it.
  const forVisit = <T extends { detached(): T }>(model: T): T => (visit === 'incognito' ? model.detached() : model);
  const settings = forVisit(stored);
  const learner = forVisit(await LearnerModel.load(store));
  const play = forVisit(await PlayModel.load(store));
  // What the browser says about keeping it, for the parent controls to tell. The game asks for that
  // once when it first saves.
  const durable = new Durability(navigator.storage);
  const tab = tabStorage();
  const saves = new SaveService(
    visit === 'kept' ? store : new VisitSink(visit === 'fresh' ? tab : null),
    undefined,
    undefined,
    visit === 'kept' ? openError : undefined,
  );

  const known = MAP_IDS.filter((id) => manifest.maps?.[id]);
  const outcome: LoadOutcome =
    visit !== 'kept'
      ? visitOutcome(visit === 'fresh' ? tab : null, known)
      : store
        ? await loadWorld(store, known, Date.now())
        : { kind: 'fresh', damaged: false };
  return { visit, tab, settings, learner, play, durable, saves, outcome };
}
