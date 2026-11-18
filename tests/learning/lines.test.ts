import { describe, expect, it } from 'vitest';
import { PAGES, WORD_IDS, type WordId } from '../../src/content/lexicon';
import {
  ALPHABET,
  CHEERS,
  CLIPS,
  type ClipId,
  emptyProfile,
  finish,
  letterClip,
  MILESTONE_EVERY,
  MILESTONES,
  numberWords,
  opening,
  practiceOffer,
  praise,
  type Reward,
  readDone,
  readPraise,
  readStart,
  saysWord,
  soundClip,
  textOf,
  wordSaid,
} from '../../src/learning';
import { CLEAN, context, T0 } from './helpers';

/**
 * An ordinary spell of a word the player already has, with whatever the test says is special about
 * it.
 */
const reward = (word: WordId, patch: Partial<Reward> = {}): Reward => ({
  offer: { word, skill: 'spell', level: 1, review: true },
  fresh: false,
  clean: true,
  stars: { before: 1, after: 1 },
  level: { before: 1, after: 1 },
  collected: 1,
  milestone: null,
  pages: [],
  everything: false,
  ...patch,
});

/**
 * Words that tell a child they were wrong, and that a young child should not hear. The same list is
 * in `src/ui/learning/text.test.ts`.
 */
const UNKIND = /\b(wrong|fail|failed|failure|bad|no|incorrect|mistakes?|errors?|oops|sorry|lose|lost|try again)\b/i;

/** Every number a chance can be, from nothing up to and including the edge it is never given. */
const CHANCES = [...Array.from({ length: 101 }, (_, i) => i / 100), 0.999999];

/**
 * Every clip that the lesson can ask the voice for: what it opens with, what it praises with, and
 * the word on its own.
 */
function asked(): Set<ClipId> {
  const found = new Set<ClipId>();
  const note = (clips: readonly ClipId[]): void =>
    clips.forEach((id) => {
      found.add(id);
    });
  note(readStart().clips);
  note(readDone().clips);
  for (const word of WORD_IDS) {
    note(wordSaid(word).clips);
    const page = PAGES.find((p) => (p.words as readonly string[]).includes(word))!.id;
    for (const chance of CHANCES) {
      for (const reads of [false, true]) note(readPraise(word, reads, () => chance).clips);
      for (const review of [false, true])
        for (const first of [false, true])
          note(opening({ word, skill: 'spell', level: 1, review }, first, () => chance).clips);
      note(praise(reward(word), () => chance).clips);
      note(praise(reward(word, { stars: { before: 0, after: 1 } }), () => chance).clips);
      note(praise(reward(word, { pages: [page] }), () => chance).clips);
      note(praise(reward(word, { everything: true }), () => chance).clips);
      for (const count of MILESTONES) note(praise(reward(word, { milestone: count }), () => chance).clips);
    }
  }
  return found;
}

describe('the clips the voice has', () => {
  it('each have a name of their own and something to say', () => {
    const ids = CLIPS.map((clip) => clip.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const clip of CLIPS) {
      expect(clip.id, clip.id).toMatch(/^[a-z]+(\.[a-z0-9-]+)?$/);
      expect(clip.text.trim(), clip.id).not.toBe('');
      expect(clip.text, clip.id).not.toMatch(/[^\x20-\x7e]/);
    }
  });

  it('are exactly what the lesson asks for, with the names and the sounds of the letters, and nothing is said that has no clip or has a clip that is never said', () => {
    const wanted = asked();
    for (const letter of ALPHABET) wanted.add(letterClip(letter)).add(soundClip(letter));
    expect([...wanted].sort()).toEqual(CLIPS.map((clip) => clip.id).sort());
  });

  it('have a name and a sound for every letter of the alphabet, and for nothing else that is one letter', () => {
    for (const kind of ['letter', 'sound']) {
      expect(
        CLIPS.filter((clip) => clip.id.startsWith(`${kind}.`))
          .map((clip) => clip.id.slice(kind.length + 1))
          .join(''),
        kind,
      ).toBe(ALPHABET);
    }
  });

  it('say the words the card writes, because the card writes what the clips say', () => {
    for (const word of WORD_IDS) {
      expect(textOf(`word.${word}`)).toBe(`${word}.`);
      expect(textOf(`open.${word}`)).toBe(`Let's spell ${word}.`);
      expect(textOf(`can.${word}`)).toBe(`Can you spell ${word}?`);
    }
    expect(
      CHEERS.map((cheer) =>
        textOf(
          `cheer.${cheer
            .toLowerCase()
            .replace(/[^a-z]+/g, '-')
            .replace(/-$/, '')}`,
        ),
      ),
    ).toEqual([...CHEERS]);
  });

  it('read a round number of words aloud in words, and have one for each round number the book can reach and not the whole book', () => {
    const milestones = CLIPS.filter((clip) => clip.id.startsWith('milestone.'));
    expect(milestones.map((clip) => clip.id)).toEqual(MILESTONES.map((count) => `milestone.${count}`));
    for (const clip of milestones) {
      const count = Number(clip.id.slice('milestone.'.length));
      expect(clip.text).toBe(`That is ${count} words!`);
      expect(clip.say).toBe(`That is ${numberWords(count)} words!`);
    }
    expect(MILESTONES.every((count) => count % MILESTONE_EVERY === 0 && count < WORD_IDS.length)).toBe(true);
    expect(MILESTONES.at(-1)! + MILESTONE_EVERY).toBeGreaterThanOrEqual(WORD_IDS.length);
  });

  it('are asked for by every round number that spelling the book from the start brings, which is the proof that a reward can always be said', () => {
    let profile = emptyProfile();
    const brought: number[] = [];
    for (const word of WORD_IDS) {
      const offer = practiceOffer(word, context(profile, { now: T0 }));
      const done = finish(profile, offer, CLEAN, T0);
      profile = done.profile;
      const said = praise(done.reward, () => 0.5);
      for (const id of said.clips)
        expect(
          CLIPS.some((clip) => clip.id === id),
          id,
        ).toBe(true);
      if (done.reward.milestone !== null && !done.reward.everything && done.reward.pages.length === 0)
        brought.push(done.reward.milestone);
    }
    expect(brought.length).toBeGreaterThan(0);
    for (const count of brought) expect(MILESTONES).toContain(count);
  });
});

describe('what the voice says in reading', () => {
  it('cheers the word the player read, whichever cheer chance picks, and says the word after it', () => {
    const cheers = new Set<string>();
    for (const chance of CHANCES) {
      const said = readPraise('frog', false, () => chance);
      expect(said.clips).toHaveLength(2);
      expect(said.clips[1]).toBe('word.frog');
      cheers.add(said.clips[0]!);
    }
    expect([...cheers].sort()).toEqual(
      CHEERS.map(
        (cheer) =>
          `cheer.${cheer
            .toLowerCase()
            .replace(/[^a-z]+/g, '-')
            .replace(/-$/, '')}`,
      ).sort(),
    );
  });

  it('shouts the word the player now reads on their own, and says they can read it', () => {
    for (const chance of [0, 0.5, 0.999])
      expect(readPraise('frog', true, () => chance)).toEqual({
        text: 'frog! You can read it!',
        clips: ['shout.frog', 'read.reads'],
      });
  });

  it('knows which clips say a word on its own, the word and the word shouted, and no other word and no other line', () => {
    for (const word of WORD_IDS) {
      const clips = CLIPS.map((clip) => clip.id).filter((id) => saysWord(id, word));
      expect(clips.sort(), word).toEqual([`shout.${word}`, `word.${word}`]);
    }
    expect(saysWord('read.reads', 'frog')).toBe(false);
    expect(saysWord('word.cat', 'frog')).toBe(false);
    expect(saysWord('open.frog', 'frog')).toBe(false);
    expect(readPraise('frog', true, () => 0).clips.filter((id) => saysWord(id, 'frog'))).toEqual(['shout.frog']);
    expect(readPraise('frog', false, () => 0).clips.filter((id) => saysWord(id, 'frog'))).toEqual(['word.frog']);
  });

  it('begins and ends a round with a line of its own', () => {
    expect(readStart()).toEqual({ text: "Let's read!", clips: ['read.start'] });
    expect(readDone()).toEqual({ text: 'You are a reader!', clips: ['read.done'] });
  });

  it('never says a try was wrong, in any clip', () => {
    for (const clip of CLIPS) expect(clip.text, clip.id).not.toMatch(UNKIND);
  });

  it('is made only from clips that exist, for every word', () => {
    const known = new Set(CLIPS.map((clip) => clip.id));
    for (const word of WORD_IDS)
      for (const reads of [false, true])
        for (const id of readPraise(word, reads, () => 0.5).clips) expect(known.has(id), id).toBe(true);
  });
});

describe('numbers in words', () => {
  it('reads every number from nought to nine hundred and ninety-nine, and refuses anything else', () => {
    expect([0, 5, 10, 13, 20, 21, 30, 45, 99].map(numberWords)).toEqual([
      'zero',
      'five',
      'ten',
      'thirteen',
      'twenty',
      'twenty-one',
      'thirty',
      'forty-five',
      'ninety-nine',
    ]);
    expect([100, 110, 145, 200, 290, 999].map(numberWords)).toEqual([
      'one hundred',
      'one hundred ten',
      'one hundred forty-five',
      'two hundred',
      'two hundred ninety',
      'nine hundred ninety-nine',
    ]);
    for (const n of [-1, 1000, 2.5, Number.NaN]) expect(() => numberWords(n)).toThrow(RangeError);
  });
});
