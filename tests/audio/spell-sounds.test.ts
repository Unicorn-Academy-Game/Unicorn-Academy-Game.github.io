import { describe, expect, it } from 'vitest';
import {
  doneScore,
  fadedScore,
  flyScore,
  hintScore,
  LADDER,
  lengthOf,
  letterScore,
  missScore,
  openScore,
  play,
  type Score,
  type Sound,
  SpellSounds,
  turnScore,
} from '../../src/audio/spell-sounds';
import { TONIC } from '../../src/audio/synth/sfx';
import { WonderSynth } from '../../src/audio/synth/synth';
import { TRIMS } from '../../src/audio/synth/trims';
import { PENTATONIC } from '../../src/wonder/music';
import { FX_NAMES, recorder, VOICE_NAMES } from '../../src/wonder/sound';
import { fakeRig } from './web-audio-fake';

type Done = Parameters<typeof doneScore>[0];

const plain: Done = { stars: { before: 1, after: 1 }, milestone: null, pages: [], everything: false };
const stars = (before: 0 | 1 | 2, after: 1 | 2 | 3): Done => ({ ...plain, stars: { before, after } });

/** Every score the game can ask for, with a name to say which one a failure is about. */
function everyScore(): [string, Score][] {
  const scores: [string, Score][] = [
    ['open', openScore()],
    ['turn', turnScore()],
    ['miss', missScore()],
    ['faded', fadedScore()],
    ['hint', hintScore()],
    ['fly', flyScore()],
  ];
  for (let i = 0; i < 24; i++)
    for (const last of [false, true]) scores.push([`letter ${i}${last ? ' last' : ''}`, letterScore(i, last)]);
  const rewards: [string, Done][] = [
    ['done', plain],
    ['done, first star', stars(0, 1)],
    ['done, second star', stars(1, 2)],
    ['done, third star', stars(2, 3)],
    ['done, two stars at once', stars(0, 2)],
    ['done, all three at once', stars(0, 3)],
    ['milestone', { ...plain, milestone: 10 }],
    ['page', { ...plain, pages: ['meadow'] }],
    ['two pages', { ...plain, pages: ['meadow', 'gold'] }],
    ['everything', { ...plain, pages: ['friends'], milestone: 35, everything: true }],
    ['everything and a star', { ...stars(0, 1), pages: ['friends'], everything: true }],
  ];
  for (const [name, reward] of rewards) scores.push([name, doneScore(reward)]);
  return scores;
}

const notes = (score: Score): Extract<Sound, { voice: string }>[] =>
  score.filter((s): s is Extract<Sound, { voice: string }> => 'voice' in s);
const effects = (score: Score): Extract<Sound, { fx: string }>[] =>
  score.filter((s): s is Extract<Sound, { fx: string }> => 'fx' in s);

describe('the notes of spelling', () => {
  it('open the card with two small bells, one after the other and the second higher', () => {
    const [first, second, ...rest] = notes(openScore());
    expect(rest).toEqual([]);
    expect(second!.at).toBeGreaterThan(first!.at);
    expect(second!.midi).toBeGreaterThan(first!.midi);
  });

  it('are all in the key of the rest of the game, on its pentatonic scale, so nothing the player does can be out of tune', () => {
    for (const [name, score] of everyScore()) {
      for (const n of notes(score))
        expect(PENTATONIC, `${name}: ${n.voice} ${n.midi}`).toContain((((n.midi - TONIC) % 12) + 12) % 12);
    }
  });

  it('climb a step with each letter, and start from the bottom again after a few, so a long word never goes shrill', () => {
    const marimba = (i: number): number => notes(letterScore(i, false))[0]!.midi;
    for (let i = 1; i < LADDER; i++) expect(marimba(i), `letter ${i}`).toBeGreaterThan(marimba(i - 1));
    expect(marimba(LADDER)).toBe(marimba(0));
    expect(marimba(LADDER + 3)).toBe(marimba(3));
    expect(marimba(0)).toBe(TONIC);
  });

  it('never go higher than two octaves above the key, which is as high as a small ear is comfortable with', () => {
    for (const [name, score] of everyScore())
      for (const n of notes(score)) expect(n.midi, name).toBeLessThanOrEqual(TONIC + 24);
  });

  it('give a key that is not the next letter a soft low note, lower and quieter than any letter', () => {
    const letters = Array.from({ length: LADDER }, (_, i) => notes(letterScore(i, false))[0]!);
    const miss = notes(missScore())[0]!;
    expect(miss.midi).toBeLessThan(Math.min(...letters.map((l) => l.midi)));
    expect(miss.gain).toBeLessThan(Math.min(...letters.map((l) => l.gain)) / 2);
    expect(notes(missScore())).toHaveLength(1);
    expect(effects(missScore())).toEqual([]);
  });

  it('touch a faded key so softly that it is only a sign the player was heard, quieter than a letter or a miss', () => {
    const [tap, ...rest] = effects(fadedScore());
    expect(rest).toEqual([]);
    expect(notes(fadedScore())).toEqual([]);
    expect(tap!.gain).toBeLessThanOrEqual(notes(missScore())[0]!.gain + 0.05);
    expect(tap!.gain).toBeLessThan(notes(letterScore(0, false))[0]!.gain / 2);
  });

  it('put a sparkle with the last letter of a word, on the same note', () => {
    const plainLetter = notes(letterScore(3, false));
    const last = notes(letterScore(3, true));
    expect(plainLetter).toHaveLength(1);
    expect(last).toHaveLength(2);
    expect(new Set(last.map((n) => n.midi)).size).toBe(1);
  });
});

describe('every sound of spelling', () => {
  it('is an instrument or a sound the synth has, at a level that is never louder than the synth makes it', () => {
    for (const [name, score] of everyScore()) {
      expect(score.length, name).toBeGreaterThan(0);
      for (const s of score) {
        if ('voice' in s) expect(VOICE_NAMES, name).toContain(s.voice);
        else expect(FX_NAMES, name).toContain(s.fx);
        expect(s.gain, name).toBeGreaterThan(0);
        expect(s.gain, name).toBeLessThanOrEqual(1);
        expect(s.at, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is gentle: nothing that bangs, cracks, rumbles or startles is ever used', () => {
    const friendly = new Set(['twinkle', 'star', 'cheer', 'swell', 'coin', 'whoosh', 'ding', 'tap']);
    for (const [name, score] of everyScore())
      for (const e of effects(score)) expect(friendly.has(e.fx), `${name}: ${e.fx}`).toBe(true);
  });

  it('is over within a couple of seconds of starting, so a quick child is never waiting on it', () => {
    for (const [name, score] of everyScore()) expect(lengthOf(score), name).toBeLessThanOrEqual(2.5);
  });

  it('has no sound too quiet to hear', () => {
    for (const [name, score] of everyScore()) for (const s of score) expect(s.gain, name).toBeGreaterThanOrEqual(0.05);
  });
});

describe('turning a page of the book', () => {
  it('is one soft bell, quieter than the card opening, and in the key', () => {
    const [bell, ...rest] = notes(turnScore());
    expect(rest).toEqual([]);
    expect(effects(turnScore())).toEqual([]);
    expect(bell!.voice).toBe('bell');
    expect(bell!.gain).toBeLessThan(notes(openScore())[0]!.gain);
  });
});

describe('the picture flying to the book', () => {
  it('whooshes as it sets off and rings when it arrives, a moment later', () => {
    const [off, arrive, ...rest] = effects(flyScore());
    expect(rest).toEqual([]);
    expect(off!.fx).toBe('whoosh');
    expect(arrive!.fx).toBe('coin');
    expect(arrive!.at - off!.at).toBeGreaterThanOrEqual(0.4);
  });
});

describe('the little fanfare', () => {
  const starsIn = (score: Score) => effects(score).filter((e) => e.fx === 'star');

  it('has a jingle for each star the player has just earned, each higher than the one before, and none for a word that earned none', () => {
    expect(starsIn(doneScore(plain))).toEqual([]);
    for (const [before, after] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 2],
      [0, 3],
      [1, 3],
    ] as const) {
      const jingles = starsIn(doneScore({ ...plain, stars: { before, after } }));
      expect(jingles, `${before} to ${after}`).toHaveLength(after - before);
      expect(jingles.map((j) => j.step)).toEqual(Array.from({ length: after - before }, (_, k) => 2 * (before + k)));
      for (let k = 1; k < jingles.length; k++) expect(jingles[k]!.at).toBeGreaterThan(jingles[k - 1]!.at);
    }
  });

  it('plays the jingle after the climb has begun, and the second star is higher than the first', () => {
    const second = starsIn(doneScore(stars(1, 2)))[0]!;
    const first = starsIn(doneScore(stars(0, 1)))[0]!;
    expect(second.step).toBeGreaterThan(first.step!);
    expect(first.at).toBeGreaterThan(0.3);
  });

  it('grows with what the player did: a word, a round number of words, a finished page, the whole book', () => {
    const size = (reward: Done): [number, number] => [doneScore(reward).length, lengthOf(doneScore(reward))];
    const word = size(plain);
    const round = size({ ...plain, milestone: 5 });
    const page = size({ ...plain, pages: ['meadow'] });
    const everything = size({ ...plain, pages: ['friends'], everything: true });
    expect(round[0]).toBeGreaterThan(word[0]);
    expect(page[0]).toBeGreaterThan(round[0]);
    expect(everything[0]).toBeGreaterThan(page[0]);
    expect(round[1]).toBeGreaterThan(word[1]);
    expect(everything[1]).toBeGreaterThan(page[1]);
  });

  it('climbs the scale one note after another, and never bunches the notes into a clump', () => {
    const rewards: Done[] = [
      plain,
      { ...plain, milestone: 5 },
      { ...plain, pages: ['meadow'] },
      { ...plain, pages: ['friends'], everything: true },
    ];
    for (const reward of rewards) {
      const climb = notes(doneScore(reward)).filter((n) => n.voice === 'harp');
      expect(climb.length).toBeGreaterThanOrEqual(6);
      for (let i = 1; i < climb.length; i++) {
        expect(climb[i]!.at).toBeGreaterThan(climb[i - 1]!.at);
        expect(climb[i]!.midi).toBeGreaterThan(climb[i - 1]!.midi);
      }
    }
  });

  it('lands its chord all at once, after the climb has got going', () => {
    const rewards: Done[] = [plain, { ...plain, milestone: 5 }, { ...plain, pages: ['meadow'] }];
    for (const reward of rewards) {
      const chord = notes(doneScore(reward)).filter((n) => n.voice === 'chime');
      expect(chord.length).toBeGreaterThanOrEqual(2);
      expect(new Set(chord.map((n) => n.at)).size).toBe(1);
      expect(chord[0]!.at).toBeGreaterThan(0.3);
    }
  });

  it('rings the stars once the chord has been heard for a moment, so a star is never lost under the fanfare', () => {
    const rewards: Done[] = [
      stars(0, 1),
      { ...stars(0, 3), milestone: 5 },
      { ...stars(1, 2), pages: ['meadow'] },
      { ...stars(0, 1), pages: ['friends'], everything: true },
    ];
    for (const reward of rewards) {
      const score = doneScore(reward);
      const chord = notes(score).find((n) => n.voice === 'chime')!;
      for (const star of starsIn(score)) expect(star.at).toBeGreaterThanOrEqual(chord.at + 0.25);
    }
  });

  it('rings the same whether one page or two were finished', () => {
    expect(doneScore({ ...plain, pages: ['meadow', 'gold'] })).toEqual(doneScore({ ...plain, pages: ['meadow'] }));
  });
});

describe('playing a score', () => {
  it('asks the sound for each note and each effect, when each is to start, and leaves out what it was not given', () => {
    const sound = recorder();
    play(sound, [
      { at: 0, voice: 'marimba', midi: 72, gain: 0.9 },
      { at: 0.25, voice: 'harp', midi: 76, gain: 0.5, seconds: 0.8 },
      { at: 0.5, fx: 'star', gain: 0.8, size: 0.5, step: 2 },
      { at: 0.75, fx: 'coin', gain: 0.6 },
    ]);
    expect(sound.log).toEqual(['note:marimba:72', 'note:harp:76', 'fx:star:0.5', 'fx:coin']);
    expect(sound.played.map((p) => p.options)).toEqual([
      { gain: 0.9, delay: 0 },
      { gain: 0.5, delay: 0.25, seconds: 0.8 },
      { gain: 0.8, delay: 0.5, size: 0.5, step: 2 },
      { gain: 0.6, delay: 0.75 },
    ]);
  });

  it('is what each thing the player does asks for', () => {
    const sound = recorder();
    const sounds = new SpellSounds(() => sound);
    sounds.open();
    expect(sound.played).toHaveLength(openScore().length);
    sound.clear();
    sounds.turn();
    expect(sound.log).toEqual([`note:bell:${notes(turnScore())[0]!.midi}`]);
    sound.clear();
    sounds.letter(2, false);
    expect(sound.log).toEqual([`note:marimba:${TONIC + 4}`]);
    sound.clear();
    sounds.letter(2, true);
    expect(sound.log).toEqual([`note:marimba:${TONIC + 4}`, `note:glass:${TONIC + 4}`]);
    sound.clear();
    sounds.miss();
    expect(sound.log).toEqual([`note:pluck:${TONIC - 10}`]);
    sound.clear();
    sounds.faded();
    expect(sound.log).toEqual(['fx:tap']);
    sound.clear();
    sounds.hint();
    expect(sound.log).toEqual(['fx:twinkle:0.2']);
    sound.clear();
    sounds.fly();
    expect(sound.log).toEqual(['fx:whoosh:0.3', 'fx:coin']);
    sound.clear();
    sounds.done(stars(0, 1));
    expect(sound.log.filter((l) => l.startsWith('fx:star'))).toHaveLength(1);
  });

  it("asks for the game's sound each time, so it is whatever the game has when it is needed", () => {
    const first = recorder();
    const second = recorder();
    let current = first;
    const sounds = new SpellSounds(() => current);
    sounds.miss();
    current = second;
    sounds.miss();
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
