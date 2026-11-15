import { START_PLACE_IDS, START_PLACES, type StartPlaceId } from '../shared/places';
import { SEASON_CHOICES, SEASON_LABELS, type SeasonChoice } from '../shared/seasons';
import { h } from './dom';
import { Segmented } from './segmented';
import type { StartChoices } from './start-choices';
import './start-options.css';

/**
 * Drawn with the strokes of the other buttons: a round line and no fill. Each is a thing the player
 * can name, since they do not read yet.
 */
const SVG_SPARKLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5c.4 3.6 1.6 5.4 5.5 6.5-3.9 1.1-5.1 2.9-5.5 6.5-.4-3.6-1.6-5.4-5.5-6.5C8.4 8.9 9.6 7.1 10 3.5zM18.5 14.5c.2 1.8.8 2.7 2.8 3.2-2 .5-2.6 1.4-2.8 3.2-.2-1.8-.8-2.7-2.8-3.2 2-.5 2.6-1.4 2.8-3.2z"/></svg>';
const SVG_BOOK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.8C6.2 4.3 9.6 4.5 12 6.6c2.4-2.1 5.8-2.3 9-.8v12.7c-3.2-1.5-6.6-1.3-9 .8-2.4-2.1-5.8-2.3-9-.8z"/><path d="M12 6.6v12.7"/></svg>';
const SVG_TREE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 7.2 9.5h2.5L5.5 15.5h5.2V21h2.6v-5.5h5.2l-4.2-6h2.5z"/></svg>';
const SVG_PALACE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V10l2-2 2 2v11M17 21V10l2-2 2 2v11M7 21V7l5-4 5 4v14M10.2 21v-3.5a1.8 1.8 0 0 1 3.6 0V21M3 21h18"/></svg>';

const SVG_FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3.5M6 4.5h11.5l-2.8 4 2.8 4H6"/></svg>';

const PLACE_ICONS: Record<StartPlaceId, string> = { forest: SVG_TREE, palace: SVG_PALACE };

const SVG_CLOUD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.2a4.7 4.7 0 0 0 0 9.3z"/></svg>';
const SVG_CALENDAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6.5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2zM3.5 10.5h17M8 3.8v4M16 3.8v4"/></svg>';
const SVG_BLOSSOM =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="6.4" r="2.6"/><circle cx="17.3" cy="10.2" r="2.6"/><circle cx="15.3" cy="16.5" r="2.6"/><circle cx="8.7" cy="16.5" r="2.6"/><circle cx="6.7" cy="10.2" r="2.6"/></svg>';
const SVG_SUN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg>';
const SVG_LEAF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5C4.5 10.5 10 5 19.5 4.5 19.5 14 14 19.5 4.5 19.5zM4.5 19.5 15 9"/></svg>';
const SVG_SNOWFLAKE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4l-16 9.2M9.6 4.6 12 6.8l2.4-2.2M9.6 19.4 12 17.2l2.4 2.2M4.4 11.3l3.1.8-.8 3.1M19.6 12.7l-3.1-.8.8-3.1M4.4 12.7l3.1-.8-.8-3.1M19.6 11.3l-3.1.8.8 3.1"/></svg>';

const SEASON_ICONS: Record<SeasonChoice, string> = {
  auto: SVG_CALENDAR,
  spring: SVG_BLOSSOM,
  summer: SVG_SUN,
  autumn: SVG_LEAF,
  winter: SVG_SNOWFLAKE,
};

const YES_NO = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
];

export interface StartOptionsDeps {
  choices: StartChoices;
  /**
   * Whether starting from scratch is offered. A look around always starts from scratch, so it has
   * nothing to choose.
   */
  offerScratch: boolean;
  onChange: (change: Partial<StartChoices>) => void;
}

let serial = 0;

/** A name with its picture, and the switch it names. */
function row(id: string, name: string, icon: string, control: HTMLElement): HTMLElement {
  const picture = h('span', { class: 'start-icon', 'aria-hidden': 'true' });
  picture.innerHTML = icon;
  return h(
    'div',
    { class: 'start-row' },
    h('span', { class: 'start-name', id }, picture, h('span', {}, name)),
    control,
  );
}

/**
 * The switches on the start screen, each a name with a switch that has a word on both sides:
 * starting from scratch, learning more, where to begin, and which season it is. They sit between
 * the logo and Play and look like the other glass on the screen.
 */
export class StartOptions {
  readonly node: HTMLElement;
  private readonly scratch: Segmented<boolean> | null;
  private readonly learning: Segmented<boolean>;
  private readonly place: Segmented<StartPlaceId>;
  private readonly season: Segmented<SeasonChoice>;

  constructor({ choices, offerScratch, onChange }: StartOptionsDeps) {
    const id = `start-name-${++serial}`;
    this.scratch = offerScratch
      ? new Segmented(YES_NO, `${id}-scratch`, choices.scratch, (scratch) => onChange({ scratch }))
      : null;
    this.learning = new Segmented(YES_NO, `${id}-learning`, choices.learning, (learning) => onChange({ learning }));
    this.place = new Segmented(
      START_PLACE_IDS.map((place) => ({ value: place, label: START_PLACES[place].label, icon: PLACE_ICONS[place] })),
      `${id}-place`,
      choices.place,
      (place) => onChange({ place }),
    );
    // Five pictures and no words, since the room is for the sides and the player knows a snowflake
    // when they see one. The calendar is first.
    this.season = new Segmented(
      SEASON_CHOICES.map((value) => ({ value, label: SEASON_LABELS[value], icon: SEASON_ICONS[value] })),
      `${id}-season`,
      choices.season,
      (season) => onChange({ season }),
      { iconsOnly: true },
    );
    this.node = h(
      'div',
      { class: 'start-options', role: 'group', 'aria-label': 'How to begin' },
      this.scratch && row(`${id}-scratch`, 'Start from scratch', SVG_SPARKLE, this.scratch.node),
      row(`${id}-learning`, 'Learning mode', SVG_BOOK, this.learning.node),
      row(`${id}-place`, 'Start at', SVG_FLAG, this.place.node),
      row(`${id}-season`, 'Season and snow', SVG_CLOUD, this.season.node),
    );
  }

  /** Shows choices that were made somewhere else, without telling anyone. */
  set(choices: StartChoices): void {
    this.scratch?.set(choices.scratch);
    this.learning.set(choices.learning);
    this.place.set(choices.place);
    this.season.set(choices.season);
  }
}
