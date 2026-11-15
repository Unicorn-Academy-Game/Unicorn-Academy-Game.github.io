import { describe, expect, it } from 'vitest';
import { Rng } from '../../../domain/rng';
import { Band, CHORDS, STEPS } from '../../engine/band';
import { PENTATONIC } from '../../music';
import { type Played, recorder, VOICE_NAMES } from '../../sound';
import { DISCO, flourishOf, Groove, PART_COUNT, PARTS, partsOf, sounds, TEMPO } from './groove';

/** Plays the party's band for some seconds, with some parts brought in at some moments. */
function play(seconds: number, join: readonly (readonly [number, number])[] = [], march = false) {
  const sound = recorder();
  const groove = new Groove();
  const band = new Band(sound, new Rng(5), groove.style);
  band.energy = 1;
  band.start();
  if (march) groove.march = true;
  const pending = [...join];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    while (pending.length > 0 && pending[0]![0] <= t) groove.join(pending.shift()![1]);
    sound.advance(dt);
    band.update(dt);
  }
  return { sound, groove, band };
}

const voices = (played: readonly Played[]): Set<string> => new Set(played.map((p) => ('voice' in p ? p.voice : p.fx)));
const pitched = (p: Played): p is Extract<Played, { voice: string }> =>
  'voice' in p && !['kick', 'snare', 'hat'].includes(p.voice);

describe('who brings what', () => {
  it('gives every part to exactly one friend, whatever the size of the herd', () => {
    for (let friends = 1; friends <= PART_COUNT; friends++) {
      const each = partsOf(friends);
      expect(each).toHaveLength(friends);
      expect(each.flat().sort()).toEqual([0, 1, 2, 3, 4, 5]);
      // Nobody has two more than another.
      const sizes = each.map((parts) => parts.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      for (const parts of each) expect(parts).toEqual([...parts].sort((a, b) => a - b));
    }
  });

  it('has the leader bring the beat first, and a lone friend bring the whole band one touch at a time', () => {
    for (let friends = 1; friends <= PART_COUNT; friends++) expect(partsOf(friends)[0]![0]).toBe(0);
    expect(partsOf(1)[0]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(partsOf(6).map((p) => p.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('the party song', () => {
  it('is only a hum and a glass note until somebody dances', () => {
    const { sound } = play(10);
    expect([...voices(sound.played)].sort()).toEqual(['glass', 'pad']);
  });

  it('brings in a part when a friend is touched, and only that part', () => {
    const { sound } = play(10, [[0, 0]]);
    const heard = voices(sound.played);
    expect(heard.has('kick')).toBe(true);
    expect(heard.has('bass')).toBe(true);
    for (const other of ['marimba', 'snare', 'hat', 'harp', 'pluck', 'flute'])
      expect(heard.has(other), other).toBe(false);
  });

  it('plays the beat on the four beats of the bar and the bass between', () => {
    const { sound } = play(12, [[0, 0]]);
    const sixteenth = 60 / TEMPO / 4;
    const kicks = sound.played.filter((p) => 'voice' in p && p.voice === 'kick');
    expect(kicks.length).toBeGreaterThan(10);
    for (const k of kicks) {
      // Every kick is on a beat of the song, which is four sixteenths apart, from its first beat a
      // moment after it starts.
      const steps = (k.at - 0.12) / sixteenth;
      expect(Math.abs(steps / 4 - Math.round(steps / 4)), `a kick at ${k.at}`).toBeLessThan(0.08);
    }
  });

  it('has every part sound where the marks of the part say, so what dances to it dances to what is heard', () => {
    for (let part = 0; part < PART_COUNT; part++) {
      const info = PARTS[part]!;
      const { sound } = play(9, [[0, part]]);
      const sixteenth = 60 / TEMPO / 4;
      const mine = sound.played.filter(
        (p): p is Extract<Played, { voice: string }> => 'voice' in p && p.voice === info.voice,
      );
      expect(mine.length, info.name).toBeGreaterThan(0);
      for (const p of mine) {
        const step = Math.round((p.at - 0.12) / sixteenth);
        // Swing moves a note a little, but never off its sixteenth.
        expect(sounds(part, ((step % STEPS) + STEPS) % STEPS), `${info.name} at step ${step}`).toBe(true);
      }
    }
  });

  it('is all in the one key, whichever parts are playing', () => {
    const everyone = DISCO.layers.length;
    expect(everyone).toBeGreaterThan(10);
    const { sound } = play(
      24,
      [0, 1, 2, 3, 4, 5].map((part) => [0, part] as const),
      true,
    );
    const notes = sound.played.filter(pitched);
    expect(notes.length).toBeGreaterThan(100);
    for (const n of notes) expect(PENTATONIC, `${n.voice} ${n.midi}`).toContain(n.midi % 12);
  });

  it('starts over when it is asked to', () => {
    const { groove } = play(2, [
      [0, 0],
      [0, 3],
    ]);
    expect(groove.playing).toBe(2);
    groove.march = true;
    groove.reset();
    expect(groove.playing).toBe(0);
    expect(groove.march).toBe(false);
  });

  it('gets a drum roll and a doubled beat in the parade, and not before', () => {
    const quiet = play(12, [[0, 0]]);
    const marching = play(12, [[0, 0]], true);
    const rolls = (played: readonly Played[]): number =>
      played.filter((p) => 'voice' in p && p.voice === 'snare').length;
    expect(rolls(quiet.sound.played)).toBe(0);
    expect(rolls(marching.sound.played)).toBeGreaterThan(40);
  });

  it('never asks for a voice the synth does not have', () => {
    const { sound } = play(
      12,
      [0, 1, 2, 3, 4, 5].map((part) => [0, part] as const),
      true,
    );
    for (const p of sound.played) if ('voice' in p) expect(VOICE_NAMES).toContain(p.voice);
  });
});

describe('what a friend plays the moment she is touched', () => {
  it('is a run of her own part on the chord that is playing, in order', () => {
    for (let part = 0; part < PART_COUNT; part++) {
      for (const chord of Object.values(CHORDS)) {
        const run = flourishOf(part, chord);
        expect(run.length, PARTS[part]!.name).toBeGreaterThanOrEqual(3);
        expect(run[0]!.after).toBe(0);
        for (let i = 1; i < run.length; i++) expect(run[i]!.after).toBeGreaterThan(run[i - 1]!.after);
        for (const note of run) {
          expect(VOICE_NAMES).toContain(note.voice);
          expect(note.gain).toBeGreaterThan(0);
          expect(note.gain).toBeLessThanOrEqual(1);
          if (note.voice !== 'kick' && note.voice !== 'snare' && note.voice !== 'hat')
            expect(chord.pcs as readonly number[]).toContain(note.midi % 12);
        }
      }
    }
  });
});
