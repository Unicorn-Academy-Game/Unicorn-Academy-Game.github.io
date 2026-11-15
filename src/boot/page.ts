import type { GameAudio } from '../audio/service';
import type { VoiceBank } from '../audio/voice-bank';
import type { OfflineService } from '../offline/service';
import type { LearnerModel } from '../persistence/learner';
import type { PlayModel } from '../persistence/play';
import type { SaveService } from '../persistence/save-service';
import type { SettingsModel } from '../persistence/settings';
import { forgetVisit, type VisitKind } from '../persistence/visit';
import type { Ui } from '../ui/ui';
import { type TabStorage, tabStorage } from './browser';
import type { Session } from './session';

/** How long the start of a visit waits to hear whether a newer version exists. */
const LOOK_AT_START_MS = 3_000;
/**
 * How long the start of a visit waits for a newer version to download before it plays the one it
 * has.
 */
const DOWNLOAD_AT_START_MS = 60_000;
/** How often a page that stays open looks for a newer version, at most. */
const LOOK_AGAIN_MS = 5 * 60_000;

/**
 * A newer version takes over now, before there is a game to interrupt. If it has not finished
 * downloading, the start waits for it. The new version begins a new game, so the note about the old
 * visit is dropped. Resolves true when the page is reloading.
 */
export async function takeNewestVersion(offline: OfflineService, ui: Ui): Promise<boolean> {
  await offline.start();
  const switched = await offline.switchToNewest({
    lookMs: LOOK_AT_START_MS,
    downloadMs: DOWNLOAD_AT_START_MS,
    found: () => ui.progress(0.02, 'Getting the newest version'),
  });
  if (!switched) return false;
  ui.progress(0.02, 'Getting the newest version');
  forgetVisit(tabStorage());
  location.reload();
  return true;
}

interface PageDeps {
  offline: OfflineService | null;
  session: Session;
  saves: SaveService;
  settings: SettingsModel;
  learner: LearnerModel;
  play: PlayModel;
  audio: GameAudio | null;
  voice: VoiceBank;
  visit: VisitKind;
  tab: TabStorage | null;
}

/**
 * What is written, and who is told, when the page goes out of sight. Sound sleeps with the page and
 * wakes with it. A newer version that finished downloading during play takes over when the page is
 * away or comes back, and begins a new game.
 */
export function watchPage({
  offline,
  session,
  saves,
  settings,
  learner,
  play,
  audio,
  voice,
  visit,
  tab,
}: PageDeps): void {
  const goAway = (): void => {
    void saves.hide();
    void settings.flush();
    void learner.flush();
    void play.flush();
  };
  // The visit is written first, and the note of it is dropped only once the new version has really
  // taken over.
  const switchWhenAway = async (): Promise<void> => {
    if (!offline?.readyToSwitch || session.restarting) return;
    await session.flush();
    if (!(await offline.switchIfWaiting())) return;
    saves.retire();
    if (visit === 'fresh') forgetVisit(tab);
    session.restart();
  };
  offline?.subscribe((status) => {
    if (status.kind === 'update-ready' && document.visibilityState === 'hidden') void switchWhenAway();
  });
  let lastLook = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      goAway();
      audio?.suspend();
      voice.stop();
    } else {
      void switchWhenAway();
      audio?.resume();
      if (Date.now() - lastLook > LOOK_AGAIN_MS) {
        lastLook = Date.now();
        offline?.checkForUpdate();
      }
    }
  });
  addEventListener('pagehide', goAway);
  addEventListener('online', () => offline?.online());
}
