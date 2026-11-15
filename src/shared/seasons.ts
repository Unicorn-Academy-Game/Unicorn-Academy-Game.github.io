/**
 * The four seasons the world goes through. Which one is showing is a device setting: automatic
 * follows the calendar, and a parent (or the player, on the start screen) can pick one to see it
 * now. The picture of each is in `src/render/season`, and what each does to the world is in
 * `src/content/seasons.ts`.
 */
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonId = (typeof SEASON_IDS)[number];

/** What the setting can hold: the calendar's own season, or one picked by hand. */
export const SEASON_CHOICES = ['auto', ...SEASON_IDS] as const;
export type SeasonChoice = (typeof SEASON_CHOICES)[number];

export const SEASON_LABELS: Readonly<Record<SeasonChoice, string>> = {
  auto: 'Automatic',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/**
 * The season of a month, counted from 0 for January, by the meteorological seasons of the north:
 * winter is December to February, spring March to May, summer June to August and autumn September
 * to November. The calendar is read in the client, because the layers under it never read the
 * clock.
 */
export function seasonOfMonth(month: number): SeasonId {
  const m = ((Math.floor(month) % 12) + 12) % 12;
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/**
 * A season named in an address, such as `?season=winter`, or null when there is none or it is not
 * one of the four.
 */
export function seasonInQuery(search: string): SeasonId | null {
  const asked = /[?&]season=([a-z]*)(?:&|#|$)/.exec(search)?.[1];
  return SEASON_IDS.find((id) => id === asked) ?? null;
}
