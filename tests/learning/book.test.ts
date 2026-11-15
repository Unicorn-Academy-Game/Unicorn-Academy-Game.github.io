import { describe, expect, it } from 'vitest';
import { PAGES, WORD_IDS, type WordId } from '../../src/content/lexicon';
import {
  cardOf,
  chapters,
  emptyProfile,
  opening,
  praise,
  READS_FROM,
  type Reward,
  readsWord,
  STARS_PER_WORD,
  tally,
  tricky,
  withProgress,
} from '../../src/learning';
import { collect, DAY, HOUR, profileOf, progress, seeded, T0, withRead } from './helpers';

describe('the book', () => {
  it('has a page for every page of words, in order, with a card for every word, all of them silhouettes at first', () => {
    const book = chapters(emptyProfile(), T0);
    expect(book.map((c) => c.page.id)).toEqual(PAGES.map((p) => p.id));
    for (const chapter of book) {
      expect(chapter.cards.map((c) => c.word)).toEqual([...chapter.page.words]);
      expect(chapter.collected).toBe(0);
      expect(chapter.complete).toBe(false);
      for (const card of chapter.cards)
        expect(card).toEqual({
          word: card.word,
          collected: false,
          stars: 0,
          level: null,
          due: false,
          slips: 0,
          done: 0,
        });
    }
  });

  it('shows a word in colour once the player has spelled it, with its stars and level, and the page complete when all of it is', () => {
    const meadow = PAGES[0]!;
    const part = collect(meadow.words.slice(0, 3));
    const half = chapters(part, T0)[0]!;
    expect(half).toMatchObject({ collected: 3, complete: false });
    expect(half.cards.map((c) => c.collected)).toEqual(meadow.words.map((_, i) => i < 3));
    expect(half.cards[0]).toMatchObject({ collected: true, stars: STARS_PER_WORD, level: 1, done: 1, slips: 0 });
    const whole = chapters(collect(meadow.words), T0)[0]!;
    expect(whole).toMatchObject({ collected: meadow.words.length, complete: true });
  });

  it('says which words are ready to spell again, once their time has come', () => {
    const profile = collect(['frog', 'duck']);
    expect(cardOf(profile, 'frog', T0).due).toBe(false);
    expect(cardOf(profile, 'frog', T0 + HOUR).due).toBe(true);
    expect(cardOf(profile, 'bee', T0 + DAY).due).toBe(false);
  });

  it('keeps every star of a word that has slipped back down the ladder', () => {
    const profile = profileOf({ frog: { level: 1, best: 5 } });
    expect(cardOf(profile, 'frog', T0)).toMatchObject({ stars: STARS_PER_WORD, level: 1 });
  });
});

describe('how the player is doing', () => {
  it('starts at nothing out of every word there is', () => {
    expect(tally(emptyProfile(), T0)).toEqual({ collected: 0, total: WORD_IDS.length, stars: 0, due: 0 });
  });

  it('adds up words, stars and words ready again', () => {
    const profile = profileOf({
      frog: { level: 5, best: 5, due: T0 + 14 * DAY },
      duck: { level: 4, best: 4, due: T0 - 1 },
      bee: { level: 1, best: 1, due: T0 + HOUR },
    });
    expect(tally(profile, T0)).toEqual({ collected: 3, total: WORD_IDS.length, stars: 3 * STARS_PER_WORD, due: 1 });
  });

  it('does not count a word the book has not got, and does not lose it either', () => {
    const profile = withProgress(profileOf({ frog: {} }), 'zebra', 'spell', progress({ level: 5, best: 5 }));
    expect(tally(profile, T0)).toMatchObject({ collected: 1, stars: STARS_PER_WORD });
    expect(profile.words.zebra).toBeDefined();
  });
});

describe('the tricky words, for a parent', () => {
  const slippy = (done: number, slips: number) => ({ done, slips, clean: done });

  it('are the words that cost the player the most slips for each time they spelled them, worst first', () => {
    // Slips for each spell: bee 2, duck 1.5, bird 1, frog 0.5. Bird has more slips than duck in
    // all, but fewer for each spell.
    const profile = profileOf({ frog: slippy(4, 2), duck: slippy(2, 3), bee: slippy(5, 10), bird: slippy(3, 3) });
    expect(tricky(profile, 10).map((c) => c.word)).toEqual(['bee', 'duck', 'bird', 'frog']);
  });

  it('leave out a word the player has only spelled once, since one bad try is not a pattern, and a word with no slips', () => {
    const profile = profileOf({ frog: slippy(1, 9), duck: slippy(5, 0), bee: slippy(2, 1) });
    expect(tricky(profile, 10).map((c) => c.word)).toEqual(['bee']);
  });

  it('are as many as asked for, and break ties by the word so the list does not shuffle', () => {
    const profile = profileOf({ frog: slippy(2, 2), duck: slippy(2, 2), bee: slippy(2, 2), bird: slippy(2, 2) });
    expect(tricky(profile, 3).map((c) => c.word)).toEqual(['bee', 'bird', 'duck']);
    expect(tricky(profile, 0)).toEqual([]);
  });
});

describe('reading, in the book', () => {
  const spelled = profileOf({ frog: {}, duck: {}, bee: {}, bird: {}, apple: {} });

  it('says the player reads a word once it has reached the level from which it counts, and keeps that when the word slips back', () => {
    expect(readsWord(spelled, 'frog'), 'a word the player has not read').toBe(false);
    expect(readsWord(withRead(spelled, { frog: { level: READS_FROM - 1 } }), 'frog')).toBe(false);
    expect(readsWord(withRead(spelled, { frog: { level: READS_FROM } }), 'frog')).toBe(true);
    expect(readsWord(withRead(spelled, { frog: { level: 1, best: READS_FROM } }), 'frog'), 'slipped back a level').toBe(
      true,
    );
  });

  it('does not make a word tricky to spell, whatever its slips in reading were', () => {
    const slippy = (done: number, slips: number) => ({ done, slips, clean: done });
    const profile = withRead(profileOf({ frog: { slips: 40, done: 4 }, duck: {}, bee: {} }), {
      frog: slippy(1, 9),
      duck: slippy(4, 2),
      bee: slippy(2, 3),
    });
    expect(
      tricky(profile, 10).map((c) => c.word),
      'what is tricky to spell is not changed by reading',
    ).toEqual(['frog']);
  });
});

describe('what the voice says', () => {
  /**
   * An ordinary spell of a word the player already has: nothing to celebrate beyond the word
   * itself.
   */
  const reward = (patch: Partial<Reward> = {}, word: WordId = 'frog'): Reward => ({
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

  const unkind = /\b(no|not|wrong|fail|failed|bad|oops|mistake|sorry|incorrect|try again|never)\b/i;

  it('says the word at the start, and says how to use the card only the first time the player ever sees one', () => {
    const fresh = { word: 'frog', skill: 'spell', level: 0, review: false } as const;
    expect(opening(fresh, false, seeded(1)).text).toBe("Let's spell frog.");
    expect(opening(fresh, true, seeded(1)).text).toBe("Let's spell frog. Press the shining letters.");
    expect(opening({ ...fresh, review: true }, true, seeded(1)).text).toMatch(/frog/);
    expect(opening({ ...fresh, review: true }, true, seeded(1)).text).not.toMatch(/shining/);
  });

  it('praises the biggest thing first: every word, then a page, then a round number, then a star, then a cheer', () => {
    expect(praise(reward({ everything: true, pages: ['meadow'], milestone: 5 }), seeded(1)).text).toMatch(/every word/);
    expect(praise(reward({ pages: ['orchard'], milestone: 5 }), seeded(1)).text).toBe(
      'frog! You finished The Orchard!',
    );
    expect(praise(reward({ milestone: 10 }), seeded(1)).text).toBe('frog! That is 10 words!');
    expect(praise(reward({ stars: { before: 1, after: 2 } }), seeded(1)).text).toBe('frog! A new star!');
    expect(praise(reward(), seeded(1)).text).toMatch(/^[A-Z][A-Za-z' ]+! frog\.$/);
  });

  it('never says a try was wrong, in anything it can say, for any word', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const word of WORD_IDS) {
        const offer = { word, skill: 'spell', level: seed % 6, review: seed % 2 === 0 } as const;
        const lines = [
          opening(offer, seed % 3 === 0, seeded(seed)),
          praise(reward({}, word), seeded(seed)),
          praise(reward({ milestone: 5 }, word), seeded(seed)),
          praise(reward({ stars: { before: 0, after: 1 } }, word), seeded(seed)),
          praise(
            reward({ pages: [PAGES.find((p) => (p.words as readonly string[]).includes(word))!.id] }, word),
            seeded(seed),
          ),
          praise(reward({ everything: true }, word), seeded(seed)),
        ].map((said) => said.text);
        for (const line of lines) {
          expect(line, line).toContain(word);
          expect(line, line).not.toMatch(unkind);
        }
      }
    }
  });

  it('chooses between kind words by chance, and a chance at either edge still gives a whole sentence', () => {
    const heard = new Set<string>();
    for (let i = 0; i < 7; i++) heard.add(praise(reward(), () => (i + 0.5) / 7).text);
    expect(heard.size).toBeGreaterThanOrEqual(5);
    for (const line of [...heard, praise(reward(), () => 0).text, praise(reward(), () => 1).text])
      expect(line).toMatch(/^[A-Z][A-Za-z' ]+! frog\.$/);
  });

  it('is the same for the same chance, so a card does not say something new each time it is drawn', () => {
    expect(praise(reward(), seeded(4))).toEqual(praise(reward(), seeded(4)));
    expect(opening(reward().offer, false, seeded(4))).toEqual(opening(reward().offer, false, seeded(4)));
  });
});
