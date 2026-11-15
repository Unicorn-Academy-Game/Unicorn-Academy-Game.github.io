import { START_PLACE_IDS, START_PLACES } from '../../../shared/places';
import { type LowEndChoice, ZOOM_STEPS } from '../../../shared/save';
import { SEASON_CHOICES, SEASON_LABELS } from '../../../shared/seasons';
import { h } from '../../dom';
import type { Page } from '../panel';
import { button, card, choice, note, pageTitle, toggle } from '../widgets';

const ZOOMS = ZOOM_STEPS.map((value) => ({ value, label: `${Math.round(value * 100)}%` }));

const PLACES = START_PLACE_IDS.map((value) => ({ value, label: START_PLACES[value].label }));

const SEASONS = SEASON_CHOICES.map((value) => ({ value, label: SEASON_LABELS[value] }));

const LOW_END: readonly { value: LowEndChoice; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const FULLSCREEN_LABEL = { on: 'Leave full screen', off: 'Go full screen' };

/** How the player plays: how each opening begins, and how the world is shown on this screen. */
export const play: Page = (ctx) => {
  const { settings, visit, fullscreen, profile } = ctx.services;
  const now = settings.get();

  const fresh = toggle(
    'Start from scratch each time',
    'Every time the game is opened the unicorn friends are found again, as if for the first time. What happens in a visit is not saved, so the world on this device is left as it was. Your child can also change this on the start screen.',
    now.startFresh,
    (value) => settings.update({ startFresh: value }),
  );

  const place = choice(
    'Start at',
    'Where the game begins each time it is opened. A world that is carried on from before begins here too, with the friends already found. Your child can also change this on the start screen.',
    PLACES,
    now.startPlace,
    (value) => settings.update({ startPlace: value }),
  );

  const season = choice(
    'Season',
    'Which season the world shows. Automatic follows the calendar: spring from March, summer from June, autumn from September and winter from December. Snow, falling leaves and blossom are out of doors only, so a hall or a house looks the same all year. Pick Winter to have the snow now, before December. Your child can also pick it on the start screen.',
    SEASONS,
    now.season,
    (value) => settings.update({ season: value }),
  );

  const zoom = choice(
    'Zoom',
    'How big everything looks. A bigger number makes everything larger and shows less of the world.',
    ZOOMS,
    now.zoom,
    (value) => settings.update({ zoom: value }),
  );

  const screen = [zoom.node];
  if (fullscreen) {
    const toggleScreen = button(
      fullscreen.active ? FULLSCREEN_LABEL.on : FULLSCREEN_LABEL.off,
      () => void fullscreen.toggle(),
    );
    ctx.onLeave(
      fullscreen.subscribe(
        (active) => (toggleScreen.textContent = active ? FULLSCREEN_LABEL.on : FULLSCREEN_LABEL.off),
      ),
    );
    screen.push(
      h(
        'div',
        { class: 'row' },
        h(
          'div',
          { class: 'row-text' },
          h('strong', {}, 'Full screen'),
          h('span', {}, 'Hides the browser, so the game fills the whole screen. Pressing F does the same.'),
        ),
        toggleScreen,
      ),
    );
  } else {
    screen.push(
      note(
        'This browser cannot show the game full screen. On an iPhone or iPad, adding the game to the Home Screen opens it with no browser around it.',
      ),
    );
  }

  const lowEnd = choice(
    'Low-end mode',
    'Draws the game lighter so it runs more smoothly on an older tablet or phone, such as a Kindle Fire. The picture is a little softer and a little closer, and there are fewer sparkles. Automatic turns it on for a Kindle Fire and leaves it off everywhere else.',
    LOW_END,
    now.lowEnd,
    (value) => settings.update({ lowEnd: value }),
  );
  const using =
    profile === 'low' ? 'Right now the game is in low-end mode.' : 'Right now the game is not in low-end mode.';

  const page = h(
    'div',
    { class: 'page' },
    pageTitle('How your child plays', 'These stay on this device.'),
    card(
      'Each time the game opens',
      fresh.node,
      place.node,
      note(
        visit === 'incognito'
          ? 'You are in an incognito visit, so this choice is not remembered.'
          : 'A change takes effect the next time the game is opened.',
      ),
    ),
    card('The seasons', season.node, note('A change shows at once.')),
    card('The screen', ...screen),
    card(
      'On an older device',
      lowEnd.node,
      note(
        `${using} ${visit === 'incognito' ? 'You are in an incognito visit, so this choice is not remembered.' : 'A change takes effect the next time the game is opened.'}`,
      ),
    ),
  );

  ctx.onLeave(
    settings.subscribe((s) => {
      fresh.set(s.startFresh);
      place.set(s.startPlace);
      season.set(s.season);
      zoom.set(s.zoom);
      lowEnd.set(s.lowEnd);
    }),
  );
  return page;
};
