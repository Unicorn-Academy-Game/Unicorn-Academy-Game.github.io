import { describe, expect, it } from 'vitest';
import {
  AlbumSounds,
  drawnScore,
  keepScore,
  shutterScore,
  stampScore,
  stickerScore,
} from '../../src/audio/album-sounds';
import { lengthOf, type Score, type Sound } from '../../src/audio/spell-sounds';
import { TONIC } from '../../src/audio/synth/sfx';
import { PENTATONIC } from '../../src/wonder/music';
import { FX_NAMES, recorder, VOICE_NAMES } from '../../src/wonder/sound';

const scores: [string, Score][] = [
  ['sticker', stickerScore()],
  ['shutter', shutterScore()],
  ['keep', keepScore()],
  ['drawn', drawnScore()],
  ...[0, 1, 2, 3, 4, 5, 9].map((step): [string, Score] => [`stamp ${step}`, stampScore(step)]),
];
const notes = (score: Score): Extract<Sound, { voice: string }>[] =>
  score.filter((s): s is Extract<Sound, { voice: string }> => 'voice' in s);
const effects = (score: Score): Extract<Sound, { fx: string }>[] =>
  score.filter((s): s is Extract<Sound, { fx: string }> => 'fx' in s);

describe('the sounds of the sticker book and the camera', () => {
  it('are all in the key of the rest of the game, so nothing the player does can be out of tune', () => {
    for (const [name, score] of scores)
      for (const n of notes(score))
        expect(PENTATONIC, `${name}: ${n.voice} ${n.midi}`).toContain((((n.midi - TONIC) % 12) + 12) % 12);
  });

  it('never go higher than two octaves above the key, which a small ear is comfortable with', () => {
    for (const [name, score] of scores)
      for (const n of notes(score)) expect(n.midi, name).toBeLessThanOrEqual(TONIC + 24);
  });

  it('are instruments and sounds the synth has, neither too quiet to hear nor too loud', () => {
    for (const [name, score] of scores) {
      expect(score.length, name).toBeGreaterThan(0);
      for (const s of score) {
        if ('voice' in s) expect(VOICE_NAMES, name).toContain(s.voice);
        else expect(FX_NAMES, name).toContain(s.fx);
        expect(s.gain, name).toBeGreaterThanOrEqual(0.05);
        expect(s.gain, name).toBeLessThanOrEqual(1);
        expect(s.at, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('are gentle: nothing that bangs, cracks, rumbles or startles is ever used', () => {
    const friendly = new Set(['twinkle', 'star', 'cheer', 'swell', 'coin', 'whoosh', 'ding', 'tap']);
    for (const [name, score] of scores)
      for (const e of effects(score)) expect(friendly.has(e.fx), `${name}: ${e.fx}`).toBe(true);
  });

  it('are over within a couple of seconds, so a quick child is never waiting on them', () => {
    for (const [name, score] of scores) expect(lengthOf(score), name).toBeLessThanOrEqual(2);
  });

  it('climb up the scale for a sticker, one note after the next, and end on a chord', () => {
    const climb = notes(stickerScore()).filter((n) => n.voice === 'harp');
    expect(climb.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < climb.length; i++) {
      expect(climb[i]!.at).toBeGreaterThan(climb[i - 1]!.at);
      expect(climb[i]!.midi).toBeGreaterThan(climb[i - 1]!.midi);
    }
    const chord = notes(stickerScore()).filter((n) => n.voice === 'chime');
    expect(chord.length).toBeGreaterThanOrEqual(2);
    expect(new Set(chord.map((n) => n.at)).size).toBe(1);
  });

  it('go up for a picture, two bells, the second higher', () => {
    const [first, second, ...rest] = notes(shutterScore());
    expect(rest).toEqual([]);
    expect(second!.midi).toBeGreaterThan(first!.midi);
  });

  it('go up for a drawing, three bells each higher than the one before', () => {
    const bells = notes(drawnScore());
    expect(bells).toHaveLength(3);
    expect(bells[1]!.midi).toBeGreaterThan(bells[0]!.midi);
    expect(bells[2]!.midi).toBeGreaterThan(bells[1]!.midi);
  });

  it('give each stamp a note a little different from the last, and start again after five', () => {
    const pitch = (step: number): number => notes(stampScore(step))[0]!.midi;
    expect(new Set([0, 1, 2, 3, 4].map(pitch)).size).toBe(5);
    expect(pitch(5)).toBe(pitch(0));
    expect(pitch(-1)).toBe(pitch(4));
  });

  it('are played on whatever sound the game has when they are asked for', () => {
    const sound = recorder();
    const sounds = new AlbumSounds(() => sound);
    sounds.earned();
    sounds.fly();
    sounds.shutter();
    sounds.keep();
    sounds.stamped(2);
    sounds.drawn();
    expect(sound.played.length).toBe(
      stickerScore().length +
        2 +
        shutterScore().length +
        keepScore().length +
        stampScore(2).length +
        drawnScore().length,
    );
  });
});
