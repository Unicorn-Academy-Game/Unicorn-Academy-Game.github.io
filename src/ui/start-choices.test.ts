import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/save';
import { choicesOf, settingsFor } from './start-choices';

describe('the choices of the start screen', () => {
  it('begin as not from scratch, learning mode, in the forest, in the season of the calendar', () => {
    expect(choicesOf(DEFAULT_SETTINGS)).toEqual({ scratch: false, learning: true, place: 'forest', season: 'auto' });
  });

  it('read the settings they stand for', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      startFresh: true,
      startPlace: 'palace' as const,
      season: 'winter' as const,
      learning: { ...DEFAULT_SETTINGS.learning, on: false },
    };
    expect(choicesOf(s)).toEqual({ scratch: true, learning: false, place: 'palace', season: 'winter' });
  });

  it('change the setting each stands for and nothing else', () => {
    expect(settingsFor({ scratch: true }, DEFAULT_SETTINGS)).toEqual({ startFresh: true });
    expect(settingsFor({ place: 'palace' }, DEFAULT_SETTINGS)).toEqual({ startPlace: 'palace' });
    expect(settingsFor({ season: 'winter' }, DEFAULT_SETTINGS)).toEqual({ season: 'winter' });
    expect(settingsFor({}, DEFAULT_SETTINGS)).toEqual({});
  });

  it('keep every other learning choice when learning is switched', () => {
    const current = {
      ...DEFAULT_SETTINGS,
      learning: { ...DEFAULT_SETTINGS.learning, keyboard: 'qwerty' as const, ask: 'rarely' as const, say: false },
    };
    expect(settingsFor({ learning: false }, current)).toEqual({ learning: { ...current.learning, on: false } });
  });
});
