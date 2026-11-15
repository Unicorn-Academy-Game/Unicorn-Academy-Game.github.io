import type { GameAudio } from '../audio/service';
import { faults } from '../game/faults';
import type { OfflineService } from '../offline/service';
import type { Durability } from '../persistence/durable';
import { WorldKeeper } from '../persistence/keeper';
import type { LearnerModel } from '../persistence/learner';
import type { PlayModel } from '../persistence/play';
import { realClock, type SaveService } from '../persistence/save-service';
import type { SettingsModel } from '../persistence/settings';
import type { LocalStore } from '../persistence/store';
import type { VisitKind } from '../persistence/visit';
import { GAME_NAME } from '../shared/brand';
import { CONTENT_VERSION } from '../shared/version';
import { ParentPanel } from '../ui/parent/panel';
import { parentServices } from '../ui/parent/real';
import { bookNeedsAttention, needsAttention } from '../ui/parent/text';
import type { Ui } from '../ui/ui';
import { newId, randomSeed } from './browser';
import type { Graphics } from './graphics';
import type { Input } from './input';
import type { Session } from './session';

interface ParentDeps {
  ui: Ui;
  profile: Graphics['profile'];
  visit: VisitKind;
  store: LocalStore | null;
  session: Session;
  saves: SaveService;
  settings: SettingsModel;
  learner: LearnerModel;
  play: PlayModel;
  durable: Durability;
  audio: GameAudio | null;
  offline: OfflineService | null;
  input: Input;
}

/**
 * The controls behind the parent button, and what they can do to the device, the saved world and
 * the offline copy.
 */
export function makeParentPanel({
  ui,
  profile,
  visit,
  store,
  session,
  saves,
  settings,
  learner,
  play,
  durable,
  audio,
  offline,
  input,
}: ParentDeps): { panel: ParentPanel; keeper: WorldKeeper | null } {
  const { fullscreen, gate } = input;
  const { flush, live, restart } = session;
  const keeper =
    visit === 'kept' && store
      ? new WorldKeeper({
          store,
          clock: realClock,
          newId,
          seed: randomSeed,
          live,
          flush,
          retire: () => saves.retire(),
          restart,
        })
      : null;
  const services = parentServices({
    settings,
    visit,
    profile: profile.id,
    saves,
    learner,
    play,
    durable,
    fullscreen: fullscreen.supported ? fullscreen : null,
    keeper,
    store,
    live,
    flush,
    confirmSound: () => audio?.preview(),
    offline: offline && {
      status: { get: () => offline.status, subscribe: (listener) => offline.subscribe(listener) },
      // The game is written to the device first. Then the newer version takes over and the page
      // starts again on it.
      update: async () => {
        await flush();
        await offline.activate();
        restart();
      },
      retry: () => void offline.retry(),
      keepSpoken: () => offline.keepSpoken(),
      repair: async () => {
        await flush();
        await offline.repair();
        restart();
      },
    },
    about: {
      name: GAME_NAME,
      version: __APP_VERSION__,
      contentVersion: CONTENT_VERSION,
      source: __SOURCE_URL__ === '' ? null : __SOURCE_URL__,
      caught: () => ({ touches: faults.repaired.touch, freed: faults.repaired.freed, errors: faults.total }),
    },
    now: () => Date.now(),
  });
  // The controls sit over the game, and the game must not take taps meant for them.
  const panel = new ParentPanel(ui.host, services, { onOpen: gate.take, onClose: gate.give });
  return { panel, keeper };
}

/**
 * The parent button says when something wants a parent's eye: a save that is failing, or a book
 * that is not being kept.
 */
export function watchAttention({
  ui,
  saves,
  settings,
  learner,
  visit,
}: Pick<ParentDeps, 'ui' | 'saves' | 'settings' | 'learner' | 'visit'>): void {
  const attention = (): void => {
    ui.setAttention(
      needsAttention(saves.status) || bookNeedsAttention(learner.keeping(), visit, settings.get().learning.on),
    );
  };
  saves.subscribe(attention);
  settings.subscribe(attention);
  learner.watchKeeping(attention);
}
