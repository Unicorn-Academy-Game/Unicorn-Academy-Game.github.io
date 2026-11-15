import { describe, expect, it } from 'vitest';
import { decide, LIMITS, VariantPicker, type Voice } from '../../src/audio/voices';
import { SOUND_FAMILIES, type SoundFamilyId } from '../../src/shared/audio';

/**
 * A sound that began at `startedAt` and lasts a second, in a world where the clock stands at
 * `startedAt`.
 */
const playing = (family: SoundFamilyId, startedAt = 0, seconds = 1): Voice<string> => ({
  handle: `${family}@${startedAt}`,
  family,
  group: SOUND_FAMILIES[family].group,
  startedAt,
  endsAt: startedAt + seconds,
});

const ask = (voices: Voice<string>[], family: SoundFamilyId, now = 0.5) =>
  decide(voices, family, SOUND_FAMILIES[family].group, now);
const stopped = (d: ReturnType<typeof ask>): string[] => (d.play ? d.stop.map((v) => v.handle) : []);

describe('which sounds get to play', () => {
  it('plays anything into silence', () => {
    for (const family of Object.keys(SOUND_FAMILIES) as SoundFamilyId[])
      expect(ask([], family)).toEqual({ play: true, stop: [] });
  });

  it('ignores sounds that have already ended', () => {
    const over = [playing('hoof-grass', 0, 0.1), playing('hoof-grass', 0.01, 0.1)];
    expect(ask(over, 'hoof-grass', 0.5)).toEqual({ play: true, stop: [] });
  });

  it('skips a footstep rather than stack a third of the same sound', () => {
    const two = [playing('hoof-grass', 0.1), playing('hoof-grass', 0.2)];
    expect(ask(two, 'hoof-grass')).toEqual({ play: false });
  });

  it('lets a repeated spell take over from the oldest copy of itself', () => {
    const two = [playing('spell-light', 0.1), playing('spell-light', 0.2)];
    expect(stopped(ask(two, 'spell-light'))).toEqual(['spell-light@0.1']);
  });

  it('keeps at most three spells going, and a new spell replaces the oldest', () => {
    const three = [playing('spell-light', 0.1), playing('spell-nature', 0.2), playing('spell-ice', 0.3)];
    expect(stopped(ask(three, 'spell-water'))).toEqual(['spell-light@0.1']);
  });

  it('skips a tap sound when two are already playing, but never skips a spell', () => {
    const taps = [playing('tap', 0.1), playing('confirm', 0.2)];
    expect(ask(taps, 'refusal')).toEqual({ play: false });
    expect(ask(taps, 'spell-fire').play).toBe(true);
  });
});

describe('a crowded mix', () => {
  // Eight sounds, none of them meaningful: three footsteps, three voices and two interface sounds.
  const crowd = (): Voice<string>[] => [
    playing('hoof-grass', 0.1),
    playing('hoof-hard', 0.2),
    playing('hoof-grass', 0.25),
    playing('voice-leaf', 0.3),
    playing('voice-river', 0.35),
    playing('voice-storm', 0.4),
    playing('tap', 0.45),
    playing('refusal', 0.5),
  ];

  it('is a full eight sounds in this test, as the limit says', () => {
    expect(crowd().length).toBe(LIMITS.total);
  });

  it('refuses another footstep', () => {
    expect(ask(crowd(), 'hoof-hard', 0.6)).toEqual({ play: false });
  });

  it('makes room for magic by letting the oldest quiet sound go', () => {
    expect(stopped(ask(crowd(), 'spell-lightning', 0.6))).toEqual(['hoof-grass@0.1']);
  });

  it('plays a unicorn voice when there is room, and the fourth voice replaces the oldest voice, not a footstep', () => {
    const d = ask(
      crowd().filter((v) => v.family !== 'voice-storm'),
      'voice-wildstar',
      0.6,
    );
    expect(d).toEqual({ play: true, stop: [] });
    expect(stopped(ask(crowd(), 'nicker-leaf', 0.6))).toEqual(['voice-leaf@0.3']);
  });

  const meaningful = (): Voice<string>[] => [
    playing('spell-light', 0.1),
    playing('spell-nature', 0.2),
    playing('spell-ice', 0.3),
    playing('door-open', 0.4),
    playing('chest-open', 0.45),
    playing('gem', 0.5),
    playing('recruit', 0.55),
    playing('hello', 0.6),
  ];

  it('lets a moment that matters play over the limit when only meaningful sounds are playing', () => {
    expect(meaningful().length).toBe(LIMITS.total);
    expect(ask(meaningful(), 'hearts', 0.7)).toEqual({ play: true, stop: [] });
    expect(ask(meaningful(), 'voice-glacier', 0.7)).toEqual({ play: true, stop: [] });
  });

  it('never stops a meaningful sound to make room for a quieter one', () => {
    const mix = [...meaningful(), playing('hearts', 0.65), playing('hoof-grass', 0.75)];
    for (const quieter of ['hoof-hard', 'tap', 'voice-leaf'] as const) {
      for (const handle of stopped(ask(mix, quieter, 0.8))) expect(handle).toBe('hoof-grass@0.75');
    }
  });

  describe('with room in every group, so only the whole mix is limiting', () => {
    const roomy = {
      ...LIMITS,
      perFamily: 9,
      perGroup: { step: 9, voice: 9, character: 9, magic: 9, object: 9, ui: 9 },
    };
    const full = (): Voice<string>[] => [...meaningful(), playing('hearts', 0.65), playing('splash', 0.7)];
    const askRoomy = (voices: Voice<string>[], family: SoundFamilyId) =>
      decide(voices, family, SOUND_FAMILIES[family].group, 0.8, roomy);

    it('is as full as the limit and its overflow allow', () => {
      expect(full().length).toBe(LIMITS.total + LIMITS.overflow);
    });

    it('lets a new meaningful sound take the place of the oldest meaningful one', () => {
      const d = askRoomy(full(), 'drink');
      expect(d.play ? d.stop.map((v) => v.handle) : []).toEqual(['spell-light@0.1']);
    });

    it('refuses a unicorn voice rather than cut off anything that matters', () => {
      expect(askRoomy(full(), 'voice-storm')).toEqual({ play: false });
    });
  });
});

describe('choosing a take', () => {
  /** A small deterministic generator, so the test is the same on every run. */
  const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it('never plays the same take twice in a row, and uses every take', () => {
    const picker = new VariantPicker(lcg(7));
    const seen = new Set<number>();
    let last = -1;
    for (let i = 0; i < 400; i++) {
      const v = picker.pick('hoof-grass', 4);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
  });

  it('holds even when chance always says the same thing', () => {
    const picker = new VariantPicker(() => 0);
    const picks = Array.from({ length: 6 }, () => picker.pick('gem', 3));
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
  });

  it('keeps each sound separate and picks the only take when there is one', () => {
    const picker = new VariantPicker(lcg(3));
    expect(picker.pick('door-open', 1)).toBe(0);
    expect(picker.pick('door-open', 1)).toBe(0);
  });
});
