import { type SeasonChoice, type SeasonId, seasonInQuery, seasonOfMonth } from '../shared/seasons';

/**
 * The season that shows: the one named in the address when there is one (a look at it for this
 * visit, never kept), else the one a parent or the player picked, else the calendar's. The calendar
 * is read here and not lower down, because only the client may read the clock.
 */
export const seasonShowing = (choice: SeasonChoice, now: Date, preview: SeasonId | null): SeasonId =>
  preview ?? (choice === 'auto' ? seasonOfMonth(now.getMonth()) : choice);

/**
 * The season an address asks to see, which is for that page alone and is never kept: one of the
 * four, or null to go by the settings and the calendar. A page under test (`?test`) is in summer
 * unless it asks for another, so that what a test measures does not change with the time of year.
 * `?season=auto` asks for the settings and the calendar there too.
 */
export const seasonPreview = (search: string, testing: boolean): SeasonId | null =>
  seasonInQuery(search) ?? (testing && !/[?&]season=auto(?:&|#|$)/.test(search) ? 'summer' : null);

export type SeasonListener = (season: SeasonId) => void;

/** Where the setting is read from, so a test can give it without a database. */
export interface SeasonSetting {
  choice(): SeasonChoice;
}

/**
 * The season the game is showing now, and who wants to hear when it changes. It changes when a
 * choice is made, and when the calendar turns over while the page is open, which is looked for
 * whenever the page comes back into view and whenever `refresh` is called.
 */
export class Seasons {
  private current: SeasonId;
  private readonly listeners = new Set<SeasonListener>();

  constructor(
    private readonly setting: SeasonSetting,
    private readonly preview: SeasonId | null,
    private readonly today: () => Date = () => new Date(),
  ) {
    this.current = seasonShowing(setting.choice(), today(), preview);
  }

  get showing(): SeasonId {
    return this.current;
  }

  /**
   * Calls `listener` when the season changes, and not for the one that is showing now. Returns a
   * way to stop.
   */
  subscribe(listener: SeasonListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Looks at the choice and the calendar again. */
  refresh(): void {
    const next = seasonShowing(this.setting.choice(), this.today(), this.preview);
    if (next === this.current) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }
}
