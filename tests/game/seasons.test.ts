import { describe, expect, it, vi } from 'vitest';
import { OPEN_AIR, SEASON_FEEL } from '../../src/content/seasons';
import { Seasons, seasonPreview, seasonShowing } from '../../src/game/seasons';
import { MAP_IDS } from '../../src/shared/ids';
import { LIFE_KINDS } from '../../src/shared/life';
import { SEASON_CHOICES, SEASON_IDS, type SeasonChoice, seasonInQuery, seasonOfMonth } from '../../src/shared/seasons';

const on = (year: number, month: number, day: number): Date => new Date(year, month, day, 12);

describe('the calendar', () => {
  it('has winter from December to February, spring from March to May, summer from June to August and autumn from September to November', () => {
    const names = Array.from({ length: 12 }, (_, month) => seasonOfMonth(month));
    expect(names).toEqual([
      'winter',
      'winter',
      'spring',
      'spring',
      'spring',
      'summer',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'autumn',
      'winter',
    ]);
  });

  it('gives every season some months, and reads a month outside the year as the year going round', () => {
    expect(new Set(Array.from({ length: 12 }, (_, month) => seasonOfMonth(month)))).toEqual(new Set(SEASON_IDS));
    expect(seasonOfMonth(12)).toBe('winter');
    expect(seasonOfMonth(-1)).toBe('winter');
    expect(seasonOfMonth(17)).toBe('summer');
  });

  it('puts the day this was written, the tenth of November, in autumn, and the first of December in winter', () => {
    expect(seasonShowing('auto', on(2026, 10, 10), null)).toBe('autumn');
    expect(seasonShowing('auto', on(2026, 10, 30), null)).toBe('autumn');
    expect(seasonShowing('auto', on(2026, 11, 1), null)).toBe('winter');
  });
});

describe('which season shows', () => {
  it('is the calendar by default, a picked season when there is one, and the address before either', () => {
    const now = on(2026, 10, 10);
    expect(seasonShowing('auto', now, null)).toBe('autumn');
    expect(seasonShowing('spring', now, null)).toBe('spring');
    expect(seasonShowing('auto', now, 'winter')).toBe('winter');
    expect(seasonShowing('summer', now, 'winter')).toBe('winter');
  });

  it('reads a season out of an address, and nothing out of one that is not a season', () => {
    expect(seasonInQuery('?test&season=winter')).toBe('winter');
    expect(seasonInQuery('?season=autumn')).toBe('autumn');
    expect(seasonInQuery('?season=auto')).toBeNull();
    expect(seasonInQuery('?season=monsoon')).toBeNull();
    expect(seasonInQuery('?season=')).toBeNull();
    expect(seasonInQuery('')).toBeNull();
  });
});

describe('the season an address asks for', () => {
  it('is the one it names, in a game the player plays and in one that is under test', () => {
    expect(seasonPreview('?season=winter', false)).toBe('winter');
    expect(seasonPreview('?test&season=spring', true)).toBe('spring');
  });

  it('is nothing for a game the player plays, which goes by the settings and the calendar', () => {
    expect(seasonPreview('', false)).toBeNull();
    expect(seasonPreview('?keep', false)).toBeNull();
    expect(seasonPreview('?season=monsoon', false)).toBeNull();
  });

  it('is summer for a game under test, so that what a test measures does not change with the date, unless it asks for the real thing', () => {
    expect(seasonPreview('?test&keep', true)).toBe('summer');
    expect(seasonPreview('?test&season=monsoon', true)).toBe('summer');
    expect(seasonPreview('?test&season=auto', true)).toBeNull();
    expect(seasonPreview('?test&season=auto&keep', true)).toBeNull();
    expect(seasonPreview('?season=auto&test', true)).toBeNull();
  });
});

describe('the season the game is showing', () => {
  const held = (
    initial: SeasonChoice,
    preview = null as Parameters<typeof seasonShowing>[2],
    start = on(2026, 10, 10),
  ) => {
    const state = { choice: initial, now: start };
    const seasons = new Seasons({ choice: () => state.choice }, preview, () => state.now);
    return { state, seasons };
  };

  it('starts on the one that shows, and says nothing about it', () => {
    const { seasons } = held('auto');
    const heard = vi.fn();
    seasons.subscribe(heard);
    expect(seasons.showing).toBe('autumn');
    seasons.refresh();
    expect(heard).not.toHaveBeenCalled();
  });

  it('tells everyone once when a pick changes it, and not when the pick lands on the one that is showing', () => {
    const { state, seasons } = held('auto');
    const heard = vi.fn();
    seasons.subscribe(heard);
    state.choice = 'winter';
    seasons.refresh();
    expect(heard).toHaveBeenCalledExactlyOnceWith('winter');
    state.choice = 'winter';
    seasons.refresh();
    expect(heard).toHaveBeenCalledTimes(1);
    state.choice = 'auto';
    seasons.refresh();
    expect(heard).toHaveBeenLastCalledWith('autumn');
  });

  it('turns over with the calendar while the page is open, on automatic', () => {
    const { state, seasons } = held('auto', null, on(2026, 10, 30));
    const heard = vi.fn();
    seasons.subscribe(heard);
    state.now = on(2026, 11, 1);
    seasons.refresh();
    expect(seasons.showing).toBe('winter');
    expect(heard).toHaveBeenCalledExactlyOnceWith('winter');
  });

  it('does not turn over with the calendar once a season is picked, or while the address names one', () => {
    const picked = held('spring', null, on(2026, 10, 30));
    picked.state.now = on(2026, 11, 1);
    picked.seasons.refresh();
    expect(picked.seasons.showing).toBe('spring');
    const previewed = held('auto', 'summer', on(2026, 10, 30));
    previewed.state.choice = 'winter';
    previewed.seasons.refresh();
    expect(previewed.seasons.showing).toBe('summer');
  });

  it('stops telling one that has gone', () => {
    const { state, seasons } = held('auto');
    const heard = vi.fn();
    const stop = seasons.subscribe(heard);
    stop();
    state.choice = 'winter';
    seasons.refresh();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('what the seasons do to the world', () => {
  it('has a choice for each season and the calendar', () => {
    expect(SEASON_CHOICES).toEqual(['auto', ...SEASON_IDS]);
  });

  it('leaves summer as it was drawn: nothing falls, no haze, everyone is out', () => {
    expect(SEASON_FEEL.summer).toEqual({ fall: null, haze: null, away: [] });
  });

  it('has snow in winter, leaves in autumn and petals in spring', () => {
    expect([SEASON_FEEL.winter.fall, SEASON_FEEL.autumn.fall, SEASON_FEEL.spring.fall]).toEqual([
      'snow',
      'leaves',
      'petals',
    ]);
  });

  it('keeps the unicorn friends who are always about, the birds, bunnies and fairies, out in every season', () => {
    for (const id of SEASON_IDS)
      for (const kind of ['bird', 'bunny', 'fairy', 'duck'] as const)
        expect(SEASON_FEEL[id].away, `${kind} in ${id}`).not.toContain(kind);
  });

  it('names only creatures that exist', () => {
    for (const id of SEASON_IDS) for (const kind of SEASON_FEEL[id].away) expect(LIFE_KINDS).toContain(kind);
  });

  it('says for every map whether the sky is over it, and has the open air under the sky and nothing roofed', () => {
    expect(Object.keys(OPEN_AIR).sort()).toEqual([...MAP_IDS].sort());
    expect(MAP_IDS.filter((id) => OPEN_AIR[id])).toEqual(['forest', 'palace-garden', 'playground', 'river', 'beach']);
  });
});
