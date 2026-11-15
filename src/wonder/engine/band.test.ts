import { describe, expect, it } from 'vitest';
import { Rng } from '../../domain/rng';
import { PENTATONIC } from '../music';
import { type Played, recorder } from '../sound';
import {
  arpeggio,
  Band,
  bass,
  CHORDS,
  chimes,
  drum,
  type Layer,
  pad,
  rhythm,
  rootAbove,
  type Style,
  voicing,
} from './band';

/**
 * A style with one of everything, at 120 beats a minute so a sixteenth lasts an eighth of a second.
 */
const STYLE: Style = {
  name: 'test',
  tempo: 120,
  progression: [CHORDS.C, CHORDS.Am, CHORDS.G, CHORDS.Csus],
  layers: [
    pad({ joins: 0, gain: 0.5 }),
    drum('kick', 'x...x...x...x...', { joins: 0.2, gain: 0.8 }),
    drum('hat', '..x...x...x...x.', { joins: 0.4, gain: 0.5 }),
    bass('x.......x.......', { joins: 0.6, gain: 0.7 }),
    arpeggio('harp', 'x.x.x.x.x.x.x.x.', { joins: 0.8, gain: 0.5, run: 'updown' }),
    chimes('bell', 'x...x...x...x...', 0.6, { joins: 0.9, gain: 0.4 }),
  ],
};

const PITCHED = new Set(['pad', 'bass', 'harp', 'bell']);

/**
 * Runs a band for `seconds` of game time at 60 frames a second, the sound's clock moving with it.
 */
function play(style = STYLE, seconds = 8, setup?: (band: Band) => void, seed = 3) {
  const sound = recorder();
  const band = new Band(sound, new Rng(seed), style);
  setup?.(band);
  band.start();
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    sound.advance(dt);
    band.update(dt);
  }
  return { sound, band };
}

const voiceOf = (p: Played): string => ('voice' in p ? p.voice : p.fx);

describe('writing a rhythm', () => {
  it('reads sixteen marks, and ignores the spaces and bars between them', () => {
    expect(rhythm('x... X... o... ....')).toEqual([1, 0, 0, 0, 1.3, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0]);
    expect(rhythm('x...|x...|x...|x...')).toHaveLength(16);
  });

  it('refuses a bar of the wrong length or a mark it does not know, so a slip is found when the page loads', () => {
    expect(() => rhythm('x...x...')).toThrow(/16/);
    expect(() => rhythm('x...x...x...x..?')).toThrow(/not a mark/);
  });
});

describe('chords', () => {
  it('are all of the one pentatonic scale of C, which is why nothing the player plays over them can clash', () => {
    for (const chord of Object.values(CHORDS)) for (const pc of chord.pcs) expect(PENTATONIC, chord.name).toContain(pc);
  });

  it('are voiced upward from the note asked for, in order, each at or above it', () => {
    expect(voicing(CHORDS.C, 55)).toEqual([55, 60, 64]);
    expect(voicing(CHORDS.Am, 55)).toEqual([57, 60, 64]);
    for (const chord of Object.values(CHORDS)) {
      const notes = voicing(chord, 48);
      expect(notes).toEqual([...notes].sort((a, b) => a - b));
      for (const n of notes) {
        expect(n).toBeGreaterThanOrEqual(48);
        expect(n).toBeLessThan(60);
      }
    }
  });

  it('have a root that is the nearest one at or above the floor', () => {
    expect(rootAbove(CHORDS.C, 36)).toBe(36);
    expect(rootAbove(CHORDS.Am, 36)).toBe(45);
    expect(rootAbove(CHORDS.G, 36)).toBe(43);
    expect(rootAbove(CHORDS.C, 37)).toBe(48);
  });
});

describe('the band', () => {
  it('plays nothing until it is started, and nothing again once it is stopped', () => {
    const sound = recorder();
    const band = new Band(sound, new Rng(1), STYLE);
    band.energy = 1;
    for (let i = 0; i < 120; i++) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    expect(sound.played).toHaveLength(0);
    band.start();
    for (let i = 0; i < 60; i++) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    expect(sound.played.length).toBeGreaterThan(0);
    band.stop();
    const heard = sound.played.length;
    for (let i = 0; i < 120; i++) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    // What was handed over a moment ahead is the most that can follow a stop.
    expect(sound.played.length).toBe(heard);
    expect(band.playing).toBe(false);
  });

  it('puts the kick on every beat at the tempo of the style, to the millisecond', () => {
    const { sound } = play(STYLE, 6, (band) => (band.energy = 1));
    const kicks = sound.played.filter((p) => voiceOf(p) === 'kick').map((p) => p.at);
    expect(kicks.length).toBeGreaterThanOrEqual(8);
    // 120 a minute is a beat every half second. The kicks are placed by hand, loosely, by a few
    // thousandths.
    for (let i = 1; i < kicks.length; i++) expect(kicks[i]! - kicks[i - 1]!).toBeCloseTo(0.5, 1);
    const first = kicks[0]!;
    kicks.forEach((at, i) => {
      expect(Math.abs(at - (first + i * 0.5))).toBeLessThan(0.012);
    });
  });

  it('adds its layers one by one as the music rises, and takes them away as it falls', () => {
    const heardAt = (energy: number): Set<string> => {
      const { sound } = play(STYLE, 10, (band) => {
        band.energy = energy;
      });
      return new Set(sound.played.map(voiceOf));
    };
    expect([...heardAt(0)]).toEqual(['pad']);
    expect(heardAt(0.3)).toEqual(new Set(['pad', 'kick']));
    expect(heardAt(0.5)).toEqual(new Set(['pad', 'kick', 'hat']));
    expect(heardAt(0.7)).toEqual(new Set(['pad', 'kick', 'hat', 'bass']));
    expect(heardAt(1)).toEqual(new Set(['pad', 'kick', 'hat', 'bass', 'harp', 'bell']));
    // And back down: the music is eased, so after a few seconds of quiet only the first layer is
    // left.
    const sound = recorder();
    const band = new Band(sound, new Rng(1), STYLE);
    band.energy = 1;
    band.start();
    const run = (seconds: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        sound.advance(1 / 60);
        band.update(1 / 60);
      }
    };
    run(5);
    band.energy = 0;
    run(6);
    sound.clear();
    run(4);
    expect(new Set(sound.played.map(voiceOf))).toEqual(new Set(['pad']));
  });

  it('eases a layer in rather than starting it at full level', () => {
    const { sound } = play(STYLE, 3, (band) => (band.energy = 1));
    const kicks = sound.played.filter(
      (p): p is Extract<Played, { voice: string }> => 'voice' in p && p.voice === 'kick',
    );
    const levels = kicks.map((k) => k.options.gain ?? 0);
    expect(levels.length).toBeGreaterThan(2);
    expect(levels[levels.length - 1]!).toBeGreaterThan(levels[0]!);
    for (const g of levels) expect(g).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  it('plays only notes of the key, and every one on the music level', () => {
    const { sound } = play(STYLE, 20, (band) => (band.energy = 1));
    const notes = sound.played.filter((p): p is Extract<Played, { voice: string }> => 'voice' in p);
    expect(notes.length).toBeGreaterThan(100);
    for (const n of notes) {
      expect(n.options.bus).toBe('music');
      if (PITCHED.has(n.voice)) expect(PENTATONIC, `${n.voice} ${n.midi}`).toContain(n.midi % 12);
    }
  });

  it('follows the chords of the progression, a bar for each, and goes round', () => {
    const { sound } = play(STYLE, 17, (band) => (band.energy = 1));
    const roots = sound.played.filter((p) => voiceOf(p) === 'bass').map((p) => ('midi' in p ? p.midi % 12 : -1));
    // Two bass notes in a bar, which stands on the root of the chord and then its octave: C, A, G,
    // C, and round again.
    const perBar = roots.filter((_, i) => i % 2 === 0).slice(0, 5);
    expect(perBar).toEqual([0, 9, 7, 0, 0]);
  });

  it('plays the same music for the same seed, and not the same for another', () => {
    const run = (seed: number): string =>
      JSON.stringify(
        play(STYLE, 12, (band) => (band.energy = 1), seed).sound.played.map((p) => [
          voiceOf(p),
          'midi' in p ? p.midi : 0,
          Math.round(p.at * 1000),
          Math.round((p.options.gain ?? 1) * 1000),
        ]),
      );
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('tells the game each sixteenth as it is reached, in order, once, with the bar it is in', () => {
    const seen: [number, number][] = [];
    play(STYLE, 9, (band) => {
      band.onStep = (step, bar) => seen.push([step, bar]);
    });
    expect(seen.length).toBeGreaterThanOrEqual(64);
    seen.forEach(([step, bar], i) => {
      expect(step).toBe(i % 16);
      expect(bar).toBe(Math.floor(i / 16));
    });
  });

  it('counts beats as it plays, with a pulse that is full on a beat and fades until the next', () => {
    const sound = recorder();
    const band = new Band(sound, new Rng(1), STYLE);
    band.start();
    expect(band.beats).toBe(0);
    const pulses: number[] = [];
    const beats: number[] = [];
    for (let t = 0; t < 4; t += 1 / 60) {
      sound.advance(1 / 60);
      band.update(1 / 60);
      pulses.push(band.pulse());
      beats.push(band.beats);
    }
    expect(beats[beats.length - 1]!).toBeGreaterThan(5);
    expect(beats[beats.length - 1]!).toBeLessThan(8);
    for (let i = 1; i < beats.length; i++) expect(beats[i]!).toBeGreaterThanOrEqual(beats[i - 1]!);
    expect(Math.max(...pulses)).toBeGreaterThan(0.95);
    expect(Math.min(...pulses.slice(30))).toBeLessThan(0.2);
  });

  it('quickens when the game asks, from the next sixteenth on', () => {
    const slow = play(STYLE, 8, (band) => (band.energy = 1)).sound.played.filter((p) => voiceOf(p) === 'kick').length;
    const fast = play(STYLE, 8, (band) => {
      band.energy = 1;
      band.tempoScale = 1.5;
    }).sound.played.filter((p) => voiceOf(p) === 'kick').length;
    expect(fast).toBeGreaterThan(slow * 1.35);
  });

  it('plays every note it should whatever the frame rate is, because it hands them over ahead of the clock', () => {
    const counts = [1 / 144, 1 / 60, 1 / 30, 1 / 15].map((dt) => {
      const sound = recorder();
      const band = new Band(sound, new Rng(2), STYLE);
      band.energy = 1;
      band.start();
      for (let t = 0; t < 8; t += dt) {
        sound.advance(dt);
        band.update(dt);
      }
      return sound.played.length;
    });
    expect(counts[0]!).toBeGreaterThan(80);
    for (const n of counts) expect(Math.abs(n - counts[1]!)).toBeLessThanOrEqual(6);
  });

  it('keeps the same beat at any frame rate: a kick is on every half second whether frames are 7 ms or 66 ms', () => {
    for (const dt of [1 / 144, 1 / 15]) {
      const sound = recorder();
      const band = new Band(sound, new Rng(2), STYLE);
      band.energy = 1;
      band.start();
      for (let t = 0; t < 8; t += dt) {
        sound.advance(dt);
        band.update(dt);
      }
      const kicks = sound.played.filter((p) => voiceOf(p) === 'kick').map((p) => p.at);
      for (let i = 1; i < kicks.length; i++)
        expect(Math.abs(kicks[i]! - kicks[i - 1]! - 0.5), `at ${dt}`).toBeLessThan(0.012);
    }
  });

  it('does not flood the sound with the notes it missed when the page was asleep, but picks up on a bar', () => {
    const sound = recorder();
    const band = new Band(sound, new Rng(2), STYLE);
    band.energy = 1;
    band.start();
    for (let t = 0; t < 3; t += 1 / 60) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    const before = sound.played.length;
    // The page is asleep for two minutes: the sound's clock goes on and the game's does not.
    sound.advance(120);
    band.update(1 / 60);
    for (let i = 0; i < 6; i++) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    expect(sound.played.length - before).toBeLessThan(40);
    const after = sound.played.slice(before);
    for (const p of after) expect(p.at).toBeGreaterThanOrEqual(sound.now() - 0.1);
  });

  it('carries on by the frame clock when the sound is not moving, as when it is locked, and picks up the beat when it moves again', () => {
    const sound = recorder();
    const band = new Band(sound, new Rng(2), STYLE);
    band.energy = 1;
    const steps: number[] = [];
    band.onStep = (step) => steps.push(step);
    band.start();
    // Two seconds with the sound's clock stopped: the picture still follows the beat.
    for (let t = 0; t < 2; t += 1 / 60) band.update(1 / 60);
    expect(steps.length).toBeGreaterThanOrEqual(14);
    const heard = steps.length;
    for (let t = 0; t < 2; t += 1 / 60) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    expect(steps.length).toBeGreaterThan(heard + 14);
    expect(sound.played.length).toBeGreaterThan(0);
  });

  it('makes no sound at all of a sound that is not there, and goes on counting', () => {
    const silent = { fx: () => undefined, note: () => undefined, now: () => 0 };
    const band = new Band(silent, new Rng(1), STYLE);
    band.energy = 1;
    band.start();
    for (let t = 0; t < 4; t += 1 / 60) band.update(1 / 60);
    expect(band.beats).toBeGreaterThan(5);
  });

  it('is louder or quieter all together by its own gain', () => {
    const loud = play(STYLE, 6, (band) => (band.energy = 1)).sound.played;
    const quiet = play(STYLE, 6, (band) => {
      band.energy = 1;
      band.gain = 0.5;
    }).sound.played;
    const top = (list: readonly Played[]): number => Math.max(...list.map((p) => p.options.gain ?? 1));
    expect(top(quiet)).toBeCloseTo(top(loud) * 0.5, 6);
  });

  it('refuses a style with no chords, since there would be no music to play', () => {
    expect(() => new Band(recorder(), new Rng(1), { ...STYLE, progression: [] })).toThrow();
  });

  it('swings the second sixteenth of each pair late, by the share asked for, and leaves the beat where it is', () => {
    const { sound } = play(
      { ...STYLE, swing: 0.3, layers: [drum('hat', 'xxxxxxxxxxxxxxxx', { joins: 0, gain: 1 })] },
      6,
    );
    const hats = sound.played.map((p) => p.at);
    const gaps = hats
      .slice(8, 40)
      .map((at, i) => at - hats[8 + i - 1]!)
      .slice(1);
    // A pair is a long and a short: an eighth of a second each at 120, so 0.125 + 0.0375 and then
    // 0.125 - 0.0375.
    const longs = gaps.filter((_, i) => i % 2 === 0);
    const shorts = gaps.filter((_, i) => i % 2 === 1);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean(longs) - mean(shorts))).toBeGreaterThan(0.05);
    expect(mean([...longs, ...shorts])).toBeCloseTo(0.125, 2);
  });
});

describe('a band that is an instrument', () => {
  /**
   * What an instrument asks of the band: every note exactly on its sixteenth, on the level she
   * plays on, a short way ahead.
   */
  const LAYER: Layer = { voice: 'bell', joins: 0, gain: 1, bus: 'effects', play: ({ step }) => ({ midi: 60 + step }) };
  const MUSIC: Style = { name: 'instrument', tempo: 120, progression: [CHORDS.C], layers: [LAYER] };
  const INSTRUMENT: Style = { ...MUSIC, human: 0, lookahead: 0.1 };

  it('places every note on its sixteenth to the thousandth, where music is placed loosely', () => {
    const { sound } = play(INSTRUMENT, 5);
    const times = sound.played.map((p) => p.at);
    expect(times.length).toBeGreaterThan(30);
    const first = times[0]!;
    times.forEach((at, i) => {
      expect(at - (first + i * 0.125)).toBeCloseTo(0, 6);
    });
    const loose = play(MUSIC, 5).sound.played.map((p) => p.at);
    expect(loose.some((at, i) => Math.abs(at - (loose[0]! + i * 0.125)) > 0.0005)).toBe(true);
  });

  it('plays on the level the layer names, and on the music level when it names none', () => {
    const { sound } = play(INSTRUMENT, 2);
    for (const p of sound.played) expect(p.options).toMatchObject({ bus: 'effects' });
    const { bus: _named, ...unnamed } = LAYER;
    const plain = play({ ...INSTRUMENT, layers: [unnamed] }, 2).sound.played;
    for (const p of plain) expect(p.options).toMatchObject({ bus: 'music' });
  });

  it('puts a note where the hit says, and where the layer says when the hit says nothing', () => {
    const style = (play: Layer['play'], pan?: number): Style => ({
      ...INSTRUMENT,
      layers: [{ ...LAYER, ...(pan === undefined ? {} : { pan }), play }],
    });
    const own = play(
      style(({ step }) => ({ midi: 60, pan: step === 0 ? -0.5 : 0.25 }), 0.9),
      1,
    ).sound.played;
    expect(own.slice(0, 2).map((p) => ('midi' in p ? p.options.pan : null))).toEqual([-0.5, 0.25]);
    const layered = play(
      style(() => ({ midi: 60 }), 0.9),
      1,
    ).sound.played;
    for (const p of layered) expect('midi' in p && p.options.pan).toBe(0.9);
    const none = play(
      style(() => ({ midi: 60 })),
      1,
    ).sound.played;
    for (const p of none) expect('midi' in p && 'pan' in p.options).toBe(false);
  });

  it('hands notes over no further ahead than the style says, so what the player changes is heard that soon after', () => {
    const reach = (style: Style): number => {
      const sound = recorder();
      const band = new Band(sound, new Rng(1), style);
      band.start();
      let furthest = 0;
      let seen = 0;
      for (let t = 0; t < 4; t += 1 / 60) {
        sound.advance(1 / 60);
        band.update(1 / 60);
        for (const p of sound.played.slice(seen)) furthest = Math.max(furthest, p.at - sound.now());
        seen = sound.played.length;
      }
      return furthest;
    };
    expect(reach(INSTRUMENT)).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(reach(INSTRUMENT)).toBeGreaterThan(0.05);
    expect(reach(MUSIC)).toBeGreaterThan(0.2);
  });

  it('reads what it plays when it is time to play it, so a note the player adds a moment before is heard and one they take away is not', () => {
    const sound = recorder();
    const lit = new Set<number>([0, 8]);
    const style: Style = {
      ...INSTRUMENT,
      layers: [{ ...LAYER, play: ({ step }) => (lit.has(step) ? { midi: 60 + step } : null) }],
    };
    const band = new Band(sound, new Rng(1), style);
    band.start();
    const run = (seconds: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        sound.advance(1 / 60);
        band.update(1 / 60);
      }
    };
    run(1.2);
    const before = sound.played.length;
    lit.delete(8);
    lit.add(12);
    run(2);
    const later = sound.played.slice(before).map((p) => ('midi' in p ? p.midi - 60 : -1));
    expect(later).toContain(12);
    expect(later).not.toContain(8);
  });
});
