import { describe, expect, it } from 'vitest';
import {
  bounceScore,
  clearedScore,
  foundScore,
  hintScore,
  joinScore,
  openScore,
  ReadingSoundBank,
  roundScore,
  tileScore,
} from '../../src/audio/reading-sounds';
import { LADDER, lengthOf, play, type Score, type Sound } from '../../src/audio/spell-sounds';
import { TONIC } from '../../src/audio/synth/sfx';
import { WonderSynth } from '../../src/audio/synth/synth';
import { TRIMS } from '../../src/audio/synth/trims';
import { PENTATONIC } from '../../src/wonder/music';
import { FX_NAMES, recorder, VOICE_NAMES } from '../../src/wonder/sound';
import { fakeRig } from './web-audio-fake';

/**
 * Every score the reading computer can ask for, with a name to say which one a failure is about.
 */
function everyScore(): [string, Score][] {
  const scores: [string, Score][] = [
    ['open', openScore()],
    ['bounce', bounceScore()],
    ['join', joinScore()],
    ['hint', hintScore()],
  ];
  for (const of of [1, 2, 3, 9, 16])
    for (let at = 0; at < of; at++) scores.push([`tile ${at}/${of}`, tileScore(at, of)]);
  for (const clean of [false, true])
    for (const reads of [false, true])
      scores.push([`found ${clean ? 'clean' : 'helped'}${reads ? ' reads' : ''}`, foundScore(clean, reads)]);
  for (const chapter of [false, true]) scores.push([`cleared${chapter ? ' chapter' : ''}`, clearedScore(chapter)]);
  for (let read = 0; read <= 7; read++) scores.push([`round ${read}`, roundScore(read)]);
  return scores;
}

const notes = (score: Score): Extract<Sound, { voice: string }>[] =>
  score.filter((s): s is Extract<Sound, { voice: string }> => 'voice' in s);
const effects = (score: Score): Extract<Sound, { fx: string }>[] =>
  score.filter((s): s is Extract<Sound, { fx: string }> => 'fx' in s);

describe('the notes of reading', () => {
  it('are all in the key of the rest of the game, on its pentatonic scale, so nothing the player does can be out of tune', () => {
    for (const [name, score] of everyScore()) {
      for (const n of notes(score))
        expect(PENTATONIC, `${name}: ${n.voice} ${n.midi}`).toContain((((n.midi - TONIC) % 12) + 12) % 12);
    }
  });

  it('never go higher than two octaves above the key, which is as high as a small ear is comfortable with', () => {
    for (const [name, score] of everyScore())
      for (const n of notes(score)) expect(n.midi, name).toBeLessThanOrEqual(TONIC + 24);
  });

  it('are an instrument or a sound the synth has, never louder than it makes it and never too quiet to hear', () => {
    for (const [name, score] of everyScore()) {
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
    for (const [name, score] of everyScore())
      for (const e of effects(score)) expect(friendly.has(e.fx), `${name}: ${e.fx}`).toBe(true);
  });

  it('are over within a couple of seconds of starting, so a quick child is never waiting on them', () => {
    for (const [name, score] of everyScore()) expect(lengthOf(score), name).toBeLessThanOrEqual(2.5);
  });
});

describe('touching a tile', () => {
  const marimba = (at: number, of = 20): number => notes(tileScore(at, of))[0]!.midi;

  it('rings a step higher than the last tile, and starts again from the bottom after a few, so a long word never goes shrill', () => {
    for (let i = 1; i < LADDER; i++) expect(marimba(i), `tile ${i}`).toBeGreaterThan(marimba(i - 1));
    expect(marimba(LADDER)).toBe(marimba(0));
    expect(marimba(LADDER + 3)).toBe(marimba(3));
    expect(marimba(0)).toBe(TONIC);
  });

  it('puts a sparkle on the last of the word, on the same note, and on no other', () => {
    for (let at = 0; at < 4; at++) expect(notes(tileScore(at, 5))).toHaveLength(1);
    const last = notes(tileScore(4, 5));
    expect(last).toHaveLength(2);
    expect(new Set(last.map((n) => n.midi)).size).toBe(1);
    expect(notes(tileScore(0, 1))).toHaveLength(2);
  });
});

describe('touching the one that was not next', () => {
  it('is a soft low note, lower and much quieter than any tile, and nothing else', () => {
    const tiles = Array.from({ length: LADDER }, (_, i) => notes(tileScore(i, 20))[0]!);
    const [miss, ...rest] = notes(bounceScore());
    expect(rest).toEqual([]);
    expect(effects(bounceScore())).toEqual([]);
    expect(miss!.midi).toBeLessThan(Math.min(...tiles.map((t) => t.midi)));
    expect(miss!.gain).toBeLessThan(Math.min(...tiles.map((t) => t.gain)) / 2);
  });
});

describe('the tiles joining', () => {
  it('sweeps and then rings a chord that goes up, a note after another', () => {
    const [sweep, ...rest] = effects(joinScore());
    expect(sweep!.fx).toBe('whoosh');
    expect(rest).toEqual([]);
    const chord = notes(joinScore());
    expect(chord.length).toBe(3);
    for (let i = 1; i < chord.length; i++) {
      expect(chord[i]!.at).toBeGreaterThan(chord[i - 1]!.at);
      expect(chord[i]!.midi).toBeGreaterThan(chord[i - 1]!.midi);
    }
    expect(chord[0]!.at).toBeGreaterThan(sweep!.at);
  });
});

describe('the computer waking up', () => {
  it('is three small bells, each after the last and each higher', () => {
    const bells = notes(openScore());
    expect(bells).toHaveLength(3);
    for (let i = 1; i < bells.length; i++) {
      expect(bells[i]!.at).toBeGreaterThan(bells[i - 1]!.at);
      expect(bells[i]!.midi).toBeGreaterThan(bells[i - 1]!.midi);
    }
  });
});

describe('reading a thing', () => {
  const size = (clean: boolean, reads: boolean): [number, number] => [
    foundScore(clean, reads).length,
    lengthOf(foundScore(clean, reads)),
  ];
  const stars = (score: Score): number => effects(score).filter((e) => e.fx === 'star').length;

  it('grows with what the player did: with help, with none, and a word they now read on their own', () => {
    const [helped, clean, reads] = [size(false, false), size(true, false), size(true, true)];
    expect(clean[0]).toBeGreaterThan(helped[0]);
    expect(reads[0]).toBeGreaterThan(clean[0]);
    expect(reads[1]).toBeGreaterThan(clean[1]);
  });

  it('has a star for a read that took no help, two for a word the player now reads on their own, and none for one that took help', () => {
    expect(stars(foundScore(false, false))).toBe(0);
    expect(stars(foundScore(true, false))).toBe(1);
    expect(stars(foundScore(true, true))).toBe(2);
  });

  it('has no cheer for a read that took help, since it is a gentle thing and is not made more of than it was', () => {
    expect(effects(foundScore(false, false)).filter((e) => e.fx === 'cheer')).toEqual([]);
    expect(effects(foundScore(true, false)).filter((e) => e.fx === 'cheer')).toHaveLength(1);
  });

  it('climbs the scale one note after another, and never bunches the notes into a clump', () => {
    for (const [clean, reads] of [
      [false, false],
      [true, false],
      [true, true],
    ] as const) {
      const climb = notes(foundScore(clean, reads)).filter((n) => n.voice === 'harp');
      expect(climb.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < climb.length; i++) {
        expect(climb[i]!.at).toBeGreaterThan(climb[i - 1]!.at);
        expect(climb[i]!.midi).toBeGreaterThan(climb[i - 1]!.midi);
      }
    }
  });

  it('rings the stars once the chord has been heard for a moment, so a star is never lost under the fanfare', () => {
    for (const [clean, reads] of [
      [true, false],
      [true, true],
    ] as const) {
      const score = foundScore(clean, reads);
      const chord = notes(score).find((n) => n.voice === 'chime')!;
      for (const star of effects(score).filter((e) => e.fx === 'star'))
        expect(star.at).toBeGreaterThanOrEqual(chord.at + 0.25);
    }
  });
});

describe('clearing a stage', () => {
  it('is a fanfare, and the end of a chapter is a bigger one', () => {
    expect(clearedScore(true).length).toBeGreaterThan(clearedScore(false).length);
    expect(lengthOf(clearedScore(true))).toBeGreaterThan(lengthOf(clearedScore(false)));
    expect(clearedScore(false).length).toBeGreaterThan(foundScore(true, false).length);
  });
});

describe('the end of a round', () => {
  it('has a note for each of the things the player read, each higher than the last', () => {
    for (let read = 1; read <= 7; read++) {
      const climb = notes(roundScore(read)).filter((n) => n.voice === 'harp');
      expect(climb, `${read} read`).toHaveLength(read);
      for (let i = 1; i < climb.length; i++) expect(climb[i]!.midi).toBeGreaterThan(climb[i - 1]!.midi);
    }
  });

  it('is one soft bell when the player read none of the seven, which is not a thing to make a noise about either way', () => {
    expect(roundScore(0)).toHaveLength(1);
    expect(effects(roundScore(0))).toEqual([]);
  });

  it('takes a number that is out of range as the nearest one that is in it', () => {
    expect(roundScore(-3)).toEqual(roundScore(0));
    expect(roundScore(9)).toEqual(roundScore(7));
    expect(roundScore(2.9)).toEqual(roundScore(2));
  });

  it('cheers louder for more, and the chord has a third note once the player read most of them', () => {
    const cheer = (read: number): number => effects(roundScore(read)).find((e) => e.fx === 'cheer')!.gain;
    for (let read = 2; read <= 7; read++) expect(cheer(read)).toBeGreaterThan(cheer(read - 1));
    const chimes = (read: number): number => notes(roundScore(read)).filter((n) => n.voice === 'chime').length;
    expect(chimes(4)).toBe(2);
    expect(chimes(5)).toBe(3);
  });

  it('starts the chord after the last of the climb', () => {
    for (let read = 1; read <= 7; read++) {
      const score = roundScore(read);
      const climb = notes(score).filter((n) => n.voice === 'harp');
      const chord = notes(score).find((n) => n.voice === 'chime')!;
      expect(chord.at).toBeGreaterThan(climb.at(-1)!.at);
    }
  });
});

describe('playing it', () => {
  it("is what each thing the player does asks for, played on the game's sound", () => {
    const sound = recorder();
    const bank = new ReadingSoundBank(() => sound);
    const asked: [string, () => void, Score][] = [
      ['open', () => bank.open(), openScore()],
      ['tile', () => bank.tile(2, 5), tileScore(2, 5)],
      ['bounce', () => bank.bounce(), bounceScore()],
      ['join', () => bank.join(), joinScore()],
      ['hint', () => bank.hint(), hintScore()],
      ['found', () => bank.found(true, false), foundScore(true, false)],
      ['found, reads', () => bank.found(true, true), foundScore(true, true)],
      ['cleared', () => bank.cleared(false), clearedScore(false)],
      ['cleared, chapter', () => bank.cleared(true), clearedScore(true)],
      ['round', () => bank.round(6), roundScore(6)],
    ];
    for (const [name, ask, score] of asked) {
      sound.clear();
      ask();
      expect(sound.played, name).toHaveLength(score.length);
    }
    sound.clear();
    bank.tile(2, 5);
    expect(sound.log).toEqual([`note:marimba:${TONIC + 4}`]);
    sound.clear();
    bank.bounce();
    expect(sound.log).toEqual([`note:pluck:${TONIC - 10}`]);
  });

  it("asks for the game's sound each time, so it is whatever the game has when it is needed", () => {
    const first = recorder();
    const second = recorder();
    let current = first;
    const bank = new ReadingSoundBank(() => current);
    bank.bounce();
    current = second;
    bank.bounce();
    expect(first.log).toHaveLength(1);
    expect(second.log).toHaveLength(1);
  });
});

describe('on the real synth', () => {
  it('can make every one, and lets every node go when they have ended', () => {
    const rig = fakeRig();
    const synth = new WonderSynth(
      () => rig.graph(),
      () => 0.5,
      TRIMS,
    );
    for (const [name, score] of everyScore()) {
      play(synth, score);
      expect(synth.busy, name).toBeGreaterThan(0);
      rig.ctx.currentTime += 20;
      rig.ctx.finish();
      expect(synth.busy, `${name} after it ended`).toBe(0);
    }
    const kept = new Set(['destination', 'bus-effects', 'bus-music', 'convolver', 'shaper']);
    expect(rig.ctx.nodes.filter((n) => !kept.has(n.kind) && !n.disconnected).map((n) => n.kind)).toEqual([]);
  });

  it('makes nothing, and does not throw, before the sound is awake', () => {
    const rig = fakeRig();
    rig.hear(false);
    const synth = new WonderSynth(() => rig.graph());
    for (const [, score] of everyScore()) expect(() => play(synth, score)).not.toThrow();
    expect(synth.busy).toBe(0);
  });
});
