import type { GameController } from '../game/controller';
import type { SettingsModel } from '../persistence/settings';
import { beginAt, forgetBegun, forgetVisit, type Opening, type VisitKind } from '../persistence/visit';
import type { StartPlaceId } from '../shared/places';
import { choicesOf, type StartChoices } from '../ui/start-choices';
import type { TitleHandle, Ui } from '../ui/ui';
import type { TabStorage } from './browser';

interface TitleDeps {
  ui: Ui;
  controller: GameController;
  settings: SettingsModel;
  visit: VisitKind;
  opening: Opening;
  tab: TabStorage | null;
  /** Play was pressed and the place behind the title, if one was still coming in, has arrived. */
  begin: () => void;
}

/**
 * The title screen with its switches. The place chosen on it is the one drawn behind it, and Play
 * begins the game there. The start-from-scratch switch cannot change the world while the game is
 * up, so it reloads the page.
 */
export function showTitle({ ui, controller, settings, visit, opening, tab, begin }: TitleDeps): TitleHandle {
  // What the screen behind the title shows (`null` when it is the place the player stood), and the
  // one place at a time that is being brought in.
  let staged: StartPlaceId | null = opening.resumed ? null : settings.get().startPlace;
  let wanted = staged;
  // The place the switch last showed that is also the one on the screen, to go back to when a place
  // does not come in.
  let confirmed = settings.get().startPlace;
  let placing: Promise<void> | null = null;
  let leaving = false;
  // Once Play is pressed the title is going, and so are its choices.
  let started = false;
  const choices = (): StartChoices => ({ ...choicesOf(settings.get()), scratch: visit === 'fresh' });
  const choosePlace = (place: StartPlaceId): void => {
    if (started) return;
    settings.update({ startPlace: place });
    wanted = place;
    placing ??= (async () => {
      try {
        while (wanted !== staged && wanted !== null) {
          const target = wanted;
          try {
            await controller.restage(beginAt(opening.held, target));
            staged = target;
            confirmed = target;
          } catch {
            // The place that was on the screen still is, and the switch goes back to it.
            wanted = staged;
            settings.update({ startPlace: confirmed });
            if (!started)
              ui.showNotice('Hmm, that place did not open.', { label: 'Try again', run: () => choosePlace(target) });
          }
        }
      } finally {
        placing = null;
      }
    })();
  };
  // Starting from scratch changes which world is played and what is saved, and both are set up
  // before the game exists. So the choice is kept and the page opens again by it. A second tap
  // while that happens is ignored.
  const restartBy = async (scratch: boolean): Promise<void> => {
    if (leaving) return;
    leaving = true;
    title.lock();
    settings.update({ startFresh: scratch });
    await settings.flush();
    forgetVisit(tab);
    forgetBegun(tab);
    // An address that asked for a visit would keep asking for it, whatever the switch says now.
    const url = new URL(location.href);
    url.searchParams.delete('fresh');
    url.searchParams.delete('keep');
    history.replaceState(history.state, '', url);
    location.reload();
  };
  // The switches show what the settings hold, whoever changed them: a tap, a revert, or something
  // else.
  settings.subscribe(() => title.set(choices()));
  const title: TitleHandle = ui.showTitle({
    choices: choices(),
    offerScratch: visit !== 'incognito',
    onChange: (change) => {
      if (leaving) return;
      if (change.learning !== undefined)
        settings.update({ learning: { ...settings.get().learning, on: change.learning } });
      if (change.place !== undefined) choosePlace(change.place);
      if (change.season !== undefined) settings.update({ season: change.season });
      if (change.scratch !== undefined) void restartBy(change.scratch);
    },
    onPlay: () => {
      started = true;
      ui.dismissNotice();
      // Sound can only be woken inside the tap, so it is, whatever is waited for next.
      controller.unlockAudio();
      // A place that is still coming in is waited for, under the title as it fades.
      if (placing) void placing.then(begin);
      else begin();
    },
  });
  return title;
}
