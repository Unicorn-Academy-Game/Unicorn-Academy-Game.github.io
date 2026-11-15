import { describe, expect, it } from 'vitest';
import { type SubjectId, type WordId, wordsOf } from '../../src/content/lexicon';
import {
  type Attempt,
  type Context,
  emptyProfile,
  ended,
  finish,
  GAP,
  NO_PACE,
  offerFor,
  offerForWord,
  type Pace,
  practiceOffer,
  SNOOZE,
  START_LEVEL,
} from '../../src/learning';
import { ASK_RATES, START_HELP } from '../../src/shared/learning';
import { collect, context, DAY, MINUTE, profileOf, settings, spellCleanly, T0 } from './helpers';

const FROG: SubjectId = 'life.frog';
const APPLE_TREE: SubjectId = 'prop.apple-tree';
const FAIRY: SubjectId = 'life.fairy';
const LEAF: SubjectId = 'unicorn.leaf';

describe('what the world asks for', () => {
  it('offers the word for the thing the player touched, as a first time, at the level a parent chose', () => {
    expect(offerFor(FROG, 'hold', context())).toEqual({ word: 'frog', skill: 'spell', level: 0, review: false });
    for (const help of START_HELP) {
      expect(offerFor(FROG, 'hold', context(undefined, { settings: settings({ help }) }))?.level).toBe(
        START_LEVEL[help],
      );
    }
  });

  it('offers nothing at all while learning is off, whatever the player touches and however they ask', () => {
    const off = context(undefined, { settings: settings({ on: false }) });
    for (const subject of [FROG, FAIRY, LEAF, 'prop.apple-tree'] as const) {
      expect(offerFor(subject, 'hold', off)).toBeNull();
      expect(offerFor(subject, 'invite', off)).toBeNull();
    }
  });

  it('offers nothing for a thing that has no word', () => {
    expect(offerFor('prop.lamp-post', 'hold', context())).toBeNull();
    expect(offerFor('prop.lamp-post', 'invite', context())).toBeNull();
  });

  it('leaves a word alone until it is due, and then asks for it again as a review at the level it has', () => {
    const profile = profileOf({ apple: { level: 2, best: 2, due: T0 + 1000 } });
    expect(offerFor(APPLE_TREE, 'hold', context(profile))).toBeNull();
    expect(offerFor(APPLE_TREE, 'hold', context(profile, { now: T0 + 999 }))).toBeNull();
    expect(offerFor(APPLE_TREE, 'hold', context(profile, { now: T0 + 1000 }))).toEqual({
      word: 'apple',
      skill: 'spell',
      level: 2,
      review: true,
    });
  });

  it('keeps the level a word has even when a parent changes the help, which only starts words that are new', () => {
    const profile = profileOf(Object.fromEntries(wordsOf(FROG).map((word) => [word, { level: 3, best: 3, due: T0 }])));
    expect(offerFor(FROG, 'hold', context(profile, { settings: settings({ help: 'full' }) }))?.level).toBe(3);
    expect(offerFor(LEAF, 'hold', context(profile, { settings: settings({ help: 'full' }) }))?.level).toBe(0);
  });

  it('teaches the words of a thing that gives several one at a time, easiest first, and then stops until they are due', () => {
    let profile = context().profile;
    const taught: string[] = [];
    for (let i = 0; i <= wordsOf(FAIRY).length; i++) {
      const offer = offerFor(FAIRY, 'hold', context(profile));
      if (!offer) break;
      taught.push(offer.word);
      profile = spellCleanly(profile, offer.word, T0).profile;
    }
    expect(taught).toEqual(wordsOf(FAIRY));
    expect(taught[0]).toBe('wand');
    expect(offerFor(FAIRY, 'hold', context(profile))).toBeNull();
    // Each is a new word at the start level, so each is due again when its time comes and not
    // before.
    expect(offerFor(FAIRY, 'hold', context(profile, { now: T0 + DAY }))).not.toBeNull();
  });

  describe('which word of a thing comes first', () => {
    const SPELLED_WITH_HELP: Attempt = { slips: 0, hints: 1 };

    it('is one the player has not spelled, before one they are to review, however easy the one to review and however soon it is due', () => {
      // "wand" is the easiest word of a fairy. The player spelled it with help, so it stays due,
      // and the other four are new.
      const profile = profileOf({ wand: { level: 0, due: T0 } });
      expect(offerFor(FAIRY, 'hold', context(profile))).toEqual({
        word: 'dust',
        skill: 'spell',
        level: 0,
        review: false,
      });
      expect(offerFor(FAIRY, 'invite', context(profile))).toEqual({
        word: 'dust',
        skill: 'spell',
        level: 0,
        review: false,
      });
    });

    it('goes through every new word of a thing before it asks for any word again, even when each was spelled with help and is due at once', () => {
      let profile = emptyProfile();
      const asked: string[] = [];
      for (let i = 0; i < wordsOf(FAIRY).length; i++) {
        const offer = offerFor(FAIRY, 'hold', context(profile, { now: T0 + i }))!;
        asked.push(offer.word);
        profile = finish(profile, offer, SPELLED_WITH_HELP, T0 + i).profile;
      }
      expect(asked).toEqual(wordsOf(FAIRY));
      expect(new Set(asked).size).toBe(asked.length);
    });

    it('goes round the words the player has spelled once none is new, the one they saw longest ago first, so no word is asked for twice running', () => {
      // All five are due. "dust" was seen longest ago and "wish" most lately, which is not the
      // order the fairy gives them.
      let profile = profileOf({
        wand: { due: T0, last: T0 - 2 * MINUTE },
        dust: { due: T0, last: T0 - 5 * MINUTE },
        wish: { due: T0, last: T0 - MINUTE },
        fairy: { due: T0, last: T0 - 4 * MINUTE },
        potion: { due: T0, last: T0 - 3 * MINUTE },
      });
      const asked: string[] = [];
      for (let i = 0; i < 5; i++) {
        const offer = offerFor(FAIRY, 'hold', context(profile, { now: T0 + i }))!;
        expect(offer.review, offer.word).toBe(true);
        asked.push(offer.word);
        profile = finish(profile, offer, SPELLED_WITH_HELP, T0 + i).profile;
      }
      expect(asked).toEqual(['dust', 'fairy', 'potion', 'wand', 'wish']);
    });

    it('is the next new word when the first was closed without being finished, so the player is never held to one word that they put down', () => {
      const closed = ended(NO_PACE, T0 - GAP.sometimes - 1, 'wand', false, 'sometimes');
      expect(offerFor(FAIRY, 'invite', context(undefined, { pace: closed }))?.word).toBe('dust');
    });
  });

  it('puts the easy word of a friend first and the long one second, and goes back to the first only when the second is spelled', () => {
    expect(offerFor(LEAF, 'hold', context())?.word).toBe('leaf');
    const afterLeaf = collect(['leaf']);
    // "leaf" is due again after a day, but "unicorn" is new to the player, so it comes first.
    expect(offerFor(LEAF, 'hold', context(afterLeaf, { now: T0 + DAY }))?.word).toBe('unicorn');
    expect(offerFor(LEAF, 'hold', context(collect(['leaf', 'unicorn']), { now: T0 + DAY }))?.word).toBe('leaf');
    const leafKnown = profileOf({ leaf: { level: 5, best: 5, due: T0 + 14 * DAY } });
    expect(offerFor(LEAF, 'hold', context(leafKnown))?.word).toBe('unicorn');
  });
});

describe('how often the world asks', () => {
  const recently = (ago: number): Pace => ({ last: T0 - ago, snoozed: new Map() });

  it('never holds something back from the player because a card was just shown, as a tree they tapped gives its fruit only after a spell', () => {
    for (const rate of ASK_RATES) {
      expect(
        offerFor(
          'prop.apple-tree',
          'hold',
          context(undefined, { settings: settings({ ask: rate }), pace: recently(1) }),
        )?.word,
      ).toBe('apple');
    }
  });

  it('leaves a quiet gap after a card before it invites the player to another, longer where a parent asked for fewer', () => {
    expect(GAP.often).toBeLessThan(GAP.sometimes);
    expect(GAP.sometimes).toBeLessThan(GAP.rarely);
    for (const rate of ASK_RATES) {
      const ask = (ago: number) =>
        offerFor(FROG, 'invite', context(undefined, { settings: settings({ ask: rate }), pace: recently(ago) }));
      expect(ask(GAP[rate] - 1), `${rate} just before`).toBeNull();
      expect(ask(GAP[rate]), `${rate} at the gap`).not.toBeNull();
    }
  });

  it('invites freely when no card has been shown yet', () => {
    expect(offerFor(FROG, 'invite', context())?.word).toBe('frog');
  });

  it('does not invite the player again to a word the player just closed, until its time away is over, but offers another word of the same thing', () => {
    const closed = ended(NO_PACE, T0 - GAP.sometimes - 1, 'leaf', false, 'sometimes');
    expect(offerFor(LEAF, 'invite', context(undefined, { pace: closed }))?.word).toBe('unicorn');
    const stillSnoozed = context(undefined, { pace: closed, now: T0 + SNOOZE.sometimes - GAP.sometimes - 10 });
    expect(offerFor(LEAF, 'invite', stillSnoozed)?.word).toBe('unicorn');
    const over = context(undefined, { pace: closed, now: T0 - GAP.sometimes - 1 + SNOOZE.sometimes });
    expect(offerFor(LEAF, 'invite', over)?.word).toBe('leaf');
  });

  it('does not let a word the player closed be held back when they tap the thing that gives it', () => {
    const closed = ended(NO_PACE, T0, 'apple', false, 'sometimes');
    expect(offerFor('prop.apple-tree', 'hold', context(undefined, { pace: closed }))?.word).toBe('apple');
  });
});

describe('a word the player is looking for', () => {
  const wanting = (word: WordId, profile = context().profile, patch: Partial<Context> = {}): Context =>
    context(profile, { want: word, ...patch });

  it('is the word a thing asks for, ahead of the other new words it gives and however hard it is', () => {
    expect(offerFor(FAIRY, 'hold', context())?.word).toBe('wand');
    expect(offerFor(FAIRY, 'hold', wanting('potion'))).toEqual({
      word: 'potion',
      skill: 'spell',
      level: 0,
      review: false,
    });
    expect(offerFor(FAIRY, 'invite', wanting('potion'))?.word).toBe('potion');
  });

  it('is asked for at once when the player touches the thing, however soon the last card was, and even when they put the word aside', () => {
    const justNow: Pace = { last: T0 - 1, snoozed: new Map() };
    expect(offerFor(FAIRY, 'invite', context(undefined, { pace: justNow }))).toBeNull();
    expect(offerFor(FAIRY, 'invite', wanting('wand', undefined, { pace: justNow }))?.word).toBe('wand');
    const closed = ended(NO_PACE, T0, 'wand', false, 'sometimes');
    expect(offerFor(FAIRY, 'invite', wanting('wand', undefined, { pace: closed }))?.word).toBe('wand');
  });

  it('does not change what a thing gives that has not got the word, so a tap on anything else is asked as it always was', () => {
    expect(offerFor(FROG, 'hold', wanting('potion'))).toEqual(offerFor(FROG, 'hold', context()));
    const justNow: Pace = { last: T0 - 1, snoozed: new Map() };
    expect(offerFor(FROG, 'invite', wanting('potion', undefined, { pace: justNow }))).toBeNull();
  });

  it('goes back to the way things are asked once the player has spelled it, whatever it was they were looking for', () => {
    const profile = profileOf({ wand: { due: T0 + DAY } });
    expect(offerFor(FAIRY, 'hold', wanting('wand', profile))?.word).toBe('dust');
    const justNow: Pace = { last: T0 - 1, snoozed: new Map() };
    expect(offerFor(FAIRY, 'invite', wanting('wand', profile, { pace: justNow }))).toBeNull();
  });

  it('is nothing while learning is off, as every offer is', () => {
    expect(offerFor(FAIRY, 'hold', wanting('wand', undefined, { settings: settings({ on: false }) }))).toBeNull();
    expect(offerFor(FAIRY, 'invite', wanting('wand', undefined, { settings: settings({ on: false }) }))).toBeNull();
  });

  it('is asked at the level the player starts new words at, as any word they have not tried', () => {
    for (const help of START_HELP)
      expect(offerFor(FAIRY, 'hold', wanting('potion', undefined, { settings: settings({ help }) }))?.level).toBe(
        START_LEVEL[help],
      );
  });
});

describe('what ends a card', () => {
  it('notes when it ended, and puts a card the player closed aside for longer where a parent asked for fewer', () => {
    for (const rate of ASK_RATES) {
      const pace = ended(NO_PACE, T0, 'frog', false, rate);
      expect(pace.last).toBe(T0);
      expect(pace.snoozed.get('frog')).toBe(T0 + SNOOZE[rate]);
    }
    expect(SNOOZE.often).toBeLessThan(SNOOZE.sometimes);
    expect(SNOOZE.sometimes).toBeLessThan(SNOOZE.rarely);
  });

  it('forgets that a word was put aside once the player spells it, and keeps what else was put aside', () => {
    let pace = ended(NO_PACE, T0, 'frog', false, 'sometimes');
    pace = ended(pace, T0 + 1000, 'duck', false, 'sometimes');
    pace = ended(pace, T0 + 2000, 'frog', true, 'sometimes');
    expect(pace.snoozed.has('frog')).toBe(false);
    expect(pace.snoozed.has('duck')).toBe(true);
    expect(pace.last).toBe(T0 + 2000);
  });

  it('does not change the pace it is given', () => {
    const before = ended(NO_PACE, T0, 'frog', false, 'often');
    const copy = new Map(before.snoozed);
    ended(before, T0 + 5, 'duck', false, 'often');
    ended(before, T0 + 5, 'frog', true, 'often');
    expect(new Map(before.snoozed)).toEqual(copy);
    expect(before.last).toBe(T0);
    expect(NO_PACE.snoozed.size).toBe(0);
  });
});

describe('the name of a friend the player has just met', () => {
  it('is that word, as a first time at the level a parent chose, and never the other word the friend gives', () => {
    expect(offerForWord('glacier', context())).toEqual({ word: 'glacier', skill: 'spell', level: 0, review: false });
    for (const help of START_HELP)
      expect(offerForWord('glacier', context(undefined, { settings: settings({ help }) }))?.level).toBe(
        START_LEVEL[help],
      );
  });

  it('is nothing while learning is off, and nothing while the word is not due, and then a review at the level it has', () => {
    expect(offerForWord('leaf', context(undefined, { settings: settings({ on: false }) }))).toBeNull();
    const profile = profileOf({ leaf: { level: 3, best: 3, due: T0 + 1000 } });
    expect(offerForWord('leaf', context(profile))).toBeNull();
    expect(offerForWord('leaf', context(profile, { now: T0 + 1000 }))).toEqual({
      word: 'leaf',
      skill: 'spell',
      level: 3,
      review: true,
    });
  });

  it('is not held back by a card that was just shown or by a card the player closed, since they walked up to be asked', () => {
    const closed = ended(NO_PACE, T0, 'leaf', false, 'rarely');
    expect(offerForWord('leaf', context(undefined, { pace: closed }))?.word).toBe('leaf');
  });
});

describe('a card the player picked from the book', () => {
  it('is always offered, whenever it is, whatever the pace, and at the level the word is at', () => {
    const profile = profileOf({ frog: { level: 4, best: 4, due: T0 + 10 * DAY } });
    const pace = ended(NO_PACE, T0, 'frog', false, 'rarely');
    expect(practiceOffer('frog', context(profile, { pace }))).toEqual({
      word: 'frog',
      skill: 'spell',
      level: 4,
      review: true,
    });
    expect(practiceOffer('duck', context(profile, { pace }))).toEqual({
      word: 'duck',
      skill: 'spell',
      level: 0,
      review: false,
    });
  });
});
