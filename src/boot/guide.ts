import { isPortrait, type WordId } from '../content/lexicon';
import type { GameController } from '../game/controller';
import { faults } from '../game/faults';
import type { PointerInput } from '../input/pointer';
import { Guide } from '../ui/guide';
import type { Ui } from '../ui/ui';
import type { Graphics } from './graphics';

/**
 * The word the player asked to be shown the way to, if any. The lessons are made after the first
 * frame can run, so the guide asks through this, and the lessons fill it in when they exist.
 */
export interface Seeking {
  word(): WordId | null;
  picture(word: WordId): string;
  stop(): void;
}

export function noSeeking(): Seeking {
  return { word: () => null, picture: () => '', stop: () => undefined };
}

interface GuideDeps {
  ui: Ui;
  scene: Graphics['scene'];
  controller: GameController;
  pointer: PointerInput;
  seeking: Seeking;
}

/**
 * The way out of anywhere is never far: a bubble on the screen's edge for each exit out of sight, a
 * button to see the whole of a big place, and a bubble that goes with the player to a word they
 * asked to be shown. This is also where the frame is stepped.
 */
export function showGuide({ ui, scene, controller, pointer, seeking }: GuideDeps): void {
  const guide = new Guide({
    corner: ui.cornerNode,
    onExit: (portalId) => controller.goToExit(portalId),
    onSurvey: () => controller.toggleSurvey(),
    onSeek: () => {
      const word = seeking.word();
      if (word !== null) controller.seekGo(word);
    },
    onSeekStop: () => seeking.stop(),
  });
  ui.underlay(guide.node);
  // Each part of a frame carries on when another fails: the herd has to be stepped whatever the
  // guide or the finger's clock does.
  scene.frame = (dt, now) => {
    faults.carry('finger', () => pointer.update(now));
    controller.frame(dt, now);
    faults.carry('guide', () => {
      const { screen, inset } = guide.layout();
      const word = seeking.word();
      const seek = word === null ? null : controller.seekBubble(word, screen, inset);
      const view =
        word !== null && seek
          ? { ...seek.bubble, word, picture: seeking.picture(word), portrait: isPortrait(word), letters: word.length }
          : null;
      guide.update(controller.exitArrows(screen, inset, seek ?? undefined), controller.surveyOffer(), view);
    });
  };
}
