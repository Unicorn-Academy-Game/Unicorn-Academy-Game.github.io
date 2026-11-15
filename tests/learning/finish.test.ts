import { describe, expect, it } from 'vitest';
import { PAGES, WORD_IDS, type WordId } from '../../src/content/lexicon';
import {
  type Attempt,
  emptyProfile,
  finish,
  type LearnerProfile,
  MILESTONE_EVERY,
  type Occasion,
  occasionOf,
  practiceOffer,
  progressOf,
  STARS_PER_WORD,
  starsOf,
  tally,
} from '../../src/learning';
import { CLEAN, collect, context, DAY, HOUR, profileOf, T0 } from './helpers';

const spell = (profile: LearnerProfile, word: WordId, now: number = T0, attempt: Attempt = CLEAN) =>
  finish(profile, practiceOffer(word, context(profile, { now })), attempt, now);

describe('what a spell earns', () => {
  it('is a new card, every star and a first step up the ladder, the first time a word is spelled', () => {
    const { reward, profile } = spell(emptyProfile(), 'frog');
    expect(reward).toMatchObject({
      fresh: true,
      clean: true,
      collected: 1,
      milestone: null,
      pages: [],
      everything: false,
      stars: { before: 0, after: STARS_PER_WORD },
      level: { before: 0, after: 1 },
    });
    expect(reward.offer.word).toBe('frog');
    expect(progressOf(profile, 'frog', 'spell')).toMatchObject({ done: 1, level: 1 });
  });

  it('is nothing new in the book when a word the player has is spelled again, but the word still moves up', () => {
    let { profile } = spell(emptyProfile(), 'frog');
    const again = spell(profile, 'frog', T0 + HOUR);
    profile = again.profile;
    expect(again.reward).toMatchObject({
      fresh: false,
      collected: 1,
      milestone: null,
      pages: [],
      level: { before: 1, after: 1 },
    });
    const third = spell(profile, 'frog', T0 + 2 * HOUR);
    expect(third.reward.level).toEqual({ before: 1, after: 2 });
  });

  it('starts a word the player has never seen at the level the card was offered at, and says whether the spell was clean by that level', () => {
    const offer = { word: 'frog', skill: 'spell', level: 2, review: false } as const;
    const clean = finish(emptyProfile(), offer, { slips: 1, hints: 0 }, T0).reward;
    expect(clean.clean).toBe(true);
    expect(clean.level.before).toBe(2);
    const slipped = finish(emptyProfile(), offer, { slips: 2, hints: 0 }, T0).reward;
    expect(slipped.clean).toBe(false);
    expect(slipped.level).toEqual({ before: 2, after: 2 });
    // At the first level the card shows the key, so two slips are still a clean spell.
    expect(finish(emptyProfile(), { ...offer, level: 0 }, { slips: 2, hints: 0 }, T0).reward.clean).toBe(true);
  });

  it('is still a collected word when it was a bumpy spell, because the player finished it', () => {
    const { reward } = spell(emptyProfile(), 'frog', T0, { slips: 7, hints: 3 });
    expect(reward).toMatchObject({
      fresh: true,
      clean: false,
      collected: 1,
      stars: { before: 0, after: STARS_PER_WORD },
    });
  });

  it('counts a word as fresh again if a record of it exists but the player never finished it', () => {
    const profile = profileOf({ frog: { done: 0, clean: 0 } });
    expect(spell(profile, 'frog').reward.fresh).toBe(true);
    expect(spell(profile, 'frog').reward.collected).toBe(1);
  });

  it('takes stars up and never down', () => {
    let profile = profileOf({ frog: { level: 5, best: 5, due: T0 } });
    for (let i = 0; i < 10; i++) {
      const { reward, profile: next } = spell(profile, 'frog', T0 + i * DAY, { slips: 9, hints: 3 });
      expect(reward.stars.after).toBeGreaterThanOrEqual(reward.stars.before);
      profile = next;
    }
    expect(starsOf(progressOf(profile, 'frog', 'spell'))).toBe(STARS_PER_WORD);
  });

  it('does not change the profile it is given', () => {
    const before = collect(['frog', 'duck']);
    const frozen = JSON.stringify(before);
    spell(before, 'frog', T0 + HOUR);
    spell(before, 'bee');
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe('the round numbers', () => {
  it(`are a celebration for every ${MILESTONE_EVERY}th new word, and only for a new word`, () => {
    const order = WORD_IDS.slice(0, 3 * MILESTONE_EVERY + 2);
    let profile = emptyProfile();
    const milestones: Array<number | null> = [];
    for (const word of order) {
      const done = spell(profile, word);
      milestones.push(done.reward.milestone);
      profile = done.profile;
    }
    const expected = order.map((_, i) => ((i + 1) % MILESTONE_EVERY === 0 ? i + 1 : null));
    expect(milestones).toEqual(expected);
  });

  it('are not brought again by spelling a word the player already has when the count is a round number', () => {
    const round = collect(WORD_IDS.slice(0, MILESTONE_EVERY));
    expect(tally(round, T0).collected % MILESTONE_EVERY).toBe(0);
    expect(spell(round, WORD_IDS[0]!, T0 + DAY).reward).toMatchObject({
      fresh: false,
      collected: MILESTONE_EVERY,
      milestone: null,
    });
  });
});

describe('a finished page', () => {
  it('is marked once, by the word that finishes it', () => {
    const meadow = PAGES[0]!;
    let profile = emptyProfile();
    const pages: Array<readonly string[]> = [];
    for (const word of meadow.words) {
      const done = spell(profile, word);
      pages.push(done.reward.pages);
      profile = done.profile;
    }
    expect(pages.slice(0, -1).every((p) => p.length === 0)).toBe(true);
    expect(pages.at(-1)).toEqual([meadow.id]);
    const again = spell(profile, meadow.words[0]!, T0 + DAY);
    expect(again.reward.pages).toEqual([]);
  });

  it('is not marked when the last word of it was already there and nothing new was added', () => {
    const profile = collect(PAGES[0]!.words);
    for (const word of PAGES[0]!.words) expect(spell(profile, word, T0 + DAY).reward.pages).toEqual([]);
  });

  it('is marked whichever order the words were spelled in', () => {
    const words = [...PAGES[1]!.words].reverse();
    let profile = emptyProfile();
    let last: readonly string[] = [];
    for (const word of words) {
      const done = spell(profile, word);
      last = done.reward.pages;
      profile = done.profile;
    }
    expect(last).toEqual([PAGES[1]!.id]);
  });
});

describe('having every word', () => {
  it('is a celebration only the last new word brings', () => {
    const all = [...WORD_IDS];
    const last = all.pop()!;
    const profile = collect(all);
    const done = spell(profile, last);
    expect(done.reward.everything).toBe(true);
    expect(done.reward.collected).toBe(WORD_IDS.length);
    for (const word of all) expect(spell(done.profile, word, T0 + DAY).reward.everything).toBe(false);
    expect(spell(profile, all[0]!, T0 + DAY).reward.everything).toBe(false);
  });

  it('never happens with a word missing', () => {
    const profile = collect(WORD_IDS.slice(0, -2));
    for (const word of WORD_IDS.slice(-2)) expect(spell(profile, word).reward.everything).toBe(false);
  });
});

describe('a journey through the whole book', () => {
  it('collects every word, finishes every page once, and passes each round number once', () => {
    let profile = emptyProfile();
    const finished: string[] = [];
    const milestones: number[] = [];
    for (const word of WORD_IDS) {
      const done = spell(profile, word);
      finished.push(...done.reward.pages);
      if (done.reward.milestone !== null) milestones.push(done.reward.milestone);
      profile = done.profile;
    }
    expect(finished.sort()).toEqual(PAGES.map((p) => p.id).sort());
    expect(milestones).toEqual(
      Array.from({ length: Math.floor(WORD_IDS.length / MILESTONE_EVERY) }, (_, i) => (i + 1) * MILESTONE_EVERY),
    );
  });
});

describe('what a finished word is worth', () => {
  const plain = { everything: false, pages: [], milestone: null, stars: { before: 1, after: 1 } } as const;

  it('is the biggest thing about it: every word, then a page, then a round number, then a star, then just a word', () => {
    const all = { everything: true, pages: ['meadow'], milestone: 5, stars: { before: 0, after: 1 } } as const;
    expect(occasionOf(all)).toBe('everything');
    expect(occasionOf({ ...all, everything: false })).toBe('page');
    expect(occasionOf({ ...all, everything: false, pages: [] })).toBe('milestone');
    expect(occasionOf({ ...all, everything: false, pages: [], milestone: null })).toBe('star');
    expect(occasionOf(plain)).toBe('word');
  });

  it('is a star only when a star was gained, and a star lost or kept is just a word', () => {
    expect(occasionOf({ ...plain, stars: { before: 2, after: 3 } })).toBe('star');
    expect(occasionOf({ ...plain, stars: { before: 3, after: 3 } })).toBe('word');
    expect(occasionOf({ ...plain, stars: { before: 3, after: 2 } })).toBe('word');
  });

  it('follows what really happens as the player fills the book, from the first word to the last', () => {
    let profile = emptyProfile();
    const seen: Occasion[] = [];
    for (const word of WORD_IDS) {
      const done = spell(profile, word);
      seen.push(occasionOf(done.reward));
      profile = done.profile;
    }
    // Every fresh word is a first star at least, the fifth is a round number, the end of a page is
    // a page, and the last word is everything.
    expect(seen[0]).toBe('star');
    expect(seen[MILESTONE_EVERY - 1]).not.toBe('star');
    expect(seen.at(-1)).toBe('everything');
    expect(seen.filter((o) => o === 'everything')).toHaveLength(1);
    // Each page ends with its own celebration, at the last of its words to be spelled, unless that
    // word is the last one of all.
    const pageEnds = PAGES.map((page) => Math.max(...page.words.map((word) => WORD_IDS.indexOf(word))));
    for (const at of pageEnds) expect(['page', 'everything']).toContain(seen[at]);
    // Nothing is ever celebrated as more than it was: a word that is not new to the player is never
    // a page, a round number or everything.
    const again = spell(profile, WORD_IDS[0]!, T0 + DAY);
    expect(occasionOf(again.reward)).not.toMatch(/everything|page|milestone/);
  });
});
