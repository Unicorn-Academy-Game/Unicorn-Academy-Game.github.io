import { describe, expect, it } from 'vitest';
import type { EffectId } from '../../src/content/activities';
import { PAGES, type SubjectId, unicornSubject, WORDS, type WordId, wordsOf } from '../../src/content/lexicon';
import type { Box, CardHandlers, CardOpening, CardPort, Kept, Place } from '../../src/game/ports';
import {
  AUTO_CONTINUE_MS,
  INVITE_AFTER_MS,
  LAND_MS,
  MEET_AFTER_MS,
  MEET_RETRY_MS,
  MEET_TRIES,
  PEEK_MS,
  SAY_AFTER_MS,
  Teacher,
  type TeacherDeps,
} from '../../src/game/teacher';
import {
  cardOf,
  emptyProfile,
  GAP,
  isDone,
  LEVELS,
  type LearnerProfile,
  MILESTONE_EVERY,
  nextLetter,
  type Outcome,
  occasionOf,
  type Reward,
  SNOOZE,
  type Spelling,
  tally,
  textOf,
  type Worth,
} from '../../src/learning';
import type { LearningSettings } from '../../src/shared/learning';
import { DAY, profileOf, seeded, settings, T0 } from '../learning/helpers';
import { Clock } from './clock';

/** A card that remembers what it was told, and is pressed by the test as a child would. */
class FakeCard implements CardPort {
  handlers!: CardHandlers;
  opening: CardOpening | null = null;
  latest: Spelling | null = null;
  open_ = false;
  readonly outcomes: Outcome[] = [];
  readonly helps: boolean[] = [];
  readonly renders: boolean[] = [];
  celebrated: { text: string; worth: Worth } | null = null;
  rect: Box | null = { left: 10, top: 20, width: 100, height: 100 };
  breaks = false;

  constructor(private readonly log: string[]) {}

  open(s: Spelling, opening: CardOpening): void {
    if (this.breaks) throw new Error('the card broke');
    this.open_ = true;
    this.latest = s;
    this.opening = opening;
    this.celebrated = null;
    this.outcomes.length = 0;
    this.helps.length = 0;
    this.renders.length = 0;
    this.log.push(`open:${s.word}`);
  }
  render(s: Spelling, peeking: boolean): void {
    this.latest = s;
    this.renders.push(peeking);
  }
  pressed(outcome: Outcome, s: Spelling): void {
    this.latest = s;
    this.outcomes.push(outcome);
  }
  helped(s: Spelling, peeking: boolean): void {
    this.latest = s;
    this.helps.push(peeking);
  }
  celebrate(text: string, worth: Worth): void {
    this.celebrated = { text, worth };
    this.log.push('celebrate-card');
  }
  pictureRect(): Box | null {
    return this.rect;
  }
  close(): void {
    this.open_ = false;
    this.log.push('close');
  }

  get isUp(): boolean {
    return this.open_;
  }
  /** Presses the keys the player needs, one after another, until the word is done. */
  spell(): void {
    while (this.latest && !isDone(this.latest)) this.handlers.key(nextLetter(this.latest)!);
  }
  /** Presses a key that is not the one the player needs and is one of the keys that work. */
  slip(): string {
    const s = this.latest!;
    const wrong = [...s.keys].find((key) => key !== nextLetter(s))!;
    this.handlers.key(wrong);
    return wrong;
  }
}

interface Rig {
  clock: Clock;
  card: FakeCard;
  teacher: Teacher;
  log: string[];
  spoken: string[];
  /** The letters whose names were said, in order. */
  letters: string[];
  stops: () => number;
  sounds: string[];
  keeps: Kept[];
  celebrations: { effect: EffectId; place: Place }[];
  reports: unknown[];
  book: () => LearnerProfile;
  writes: () => number;
  setSettings: (patch: Partial<LearningSettings>) => void;
  allow: (on: boolean) => void;
  voice: { available: boolean };
}

function rig(
  options: { settings?: Partial<LearningSettings>; profile?: LearnerProfile; throwing?: 'sound' | 'voice' } = {},
): Rig {
  const clock = new Clock();
  const log: string[] = [];
  const card = new FakeCard(log);
  const spoken: string[] = [];
  const letters: string[] = [];
  let stopped = 0;
  const sounds: string[] = [];
  const keeps: Rig['keeps'] = [];
  const celebrations: Rig['celebrations'] = [];
  const reports: unknown[] = [];
  let book = options.profile ?? emptyProfile();
  let writes = 0;
  let current = settings(options.settings);
  let open = true;
  const voice = { available: true };
  const note = (name: string): void => {
    if (options.throwing === 'sound') throw new Error('the sound broke');
    sounds.push(name);
  };
  const deps: TeacherDeps = {
    settings: () => current,
    book: {
      get: () => book,
      set: (next) => {
        book = next;
        writes += 1;
        log.push('book');
      },
    },
    now: () => clock.now,
    random: seeded(7),
    later: clock.later,
    canOpen: () => open,
    makeCard: (handlers) => {
      card.handlers = handlers;
      return card;
    },
    picture: (word) => `picture:${word}`,
    voice: {
      get available() {
        return voice.available;
      },
      say: (clips) => {
        if (options.throwing === 'voice') throw new Error('the voice broke');
        spoken.push(clips.map(textOf).join(' '));
      },
      letter: (letter) => {
        if (options.throwing === 'voice') throw new Error('the voice broke');
        letters.push(letter);
      },
      stop: () => {
        stopped += 1;
      },
    },
    sounds: {
      open: () => note('open'),
      letter: (index, last) => note(`letter:${index}${last ? ':last' : ''}`),
      miss: () => note('miss'),
      faded: () => note('faded'),
      hint: () => note('hint'),
      fly: () => note('fly'),
      done: (reward: Reward) => note(`done:${reward.stars.after}`),
    },
    rest: { freeze: () => void log.push('freeze'), thaw: () => void log.push('thaw') },
    celebrate: (effect, place) => {
      celebrations.push({ effect, place });
      log.push(`world:${effect}`);
    },
    keep: (kept) => {
      keeps.push(kept);
      log.push(`keep:${kept.word}`);
    },
    report: (error) => void reports.push(error),
  };
  const teacher = new Teacher(deps);
  return {
    clock,
    card,
    teacher,
    log,
    spoken,
    letters,
    stops: () => stopped,
    sounds,
    keeps,
    celebrations,
    reports,
    book: () => book,
    writes: () => writes,
    setSettings: (patch) => {
      current = { ...current, ...patch };
    },
    allow: (on) => {
      open = on;
    },
    voice,
  };
}

const AT: Place = { at: { x: 40, y: 50 }, lift: 0 };
const FROG = 'life.frog' as const;

/**
 * A book where every word of a thing is known and a day from due, but the ones named, so those are
 * all that is left to ask.
 */
const knownExcept = (subject: SubjectId, ...left: WordId[]): LearnerProfile =>
  profileOf(
    Object.fromEntries(
      wordsOf(subject)
        .filter((word) => !left.includes(word))
        .map((word) => [word, { level: 3, best: 3, due: T0 + DAY }]),
    ),
  );
/**
 * A book where one word of a thing is due at a level and every other word of it is known and a day
 * from due, so that word is the one asked for.
 */
const dueAt = (subject: SubjectId, word: WordId, level: number): LearnerProfile =>
  profileOf({
    ...Object.fromEntries(wordsOf(subject).map((other) => [other, { level: 3, best: 3, due: T0 + DAY }])),
    [word]: { level, best: level, due: T0 },
  });
const APPLE_TREE = 'prop.apple-tree' as const;

/** Spells the word on the card and waits for the card to say so. */
function spellAndCelebrate(r: Rig): void {
  r.card.spell();
  r.clock.advance(LAND_MS);
}

describe('with learning off', () => {
  it('does nothing at all: a tap is not held, nothing is invited, and a friend joins at once', () => {
    const r = rig({ settings: { on: false } });
    let released = 0;
    let joined = 0;
    expect(
      r.teacher.hold(APPLE_TREE, () => {
        released += 1;
      }),
    ).toBe(false);
    r.teacher.touched(FROG, () => AT);
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    expect(joined).toBe(1);
    r.clock.advance(60_000);
    expect(r.log).toEqual([]);
    expect(released).toBe(0);
    expect(r.teacher.busy).toBe(false);
    expect(r.clock.waiting).toBe(0);
  });
});

describe('a tap that gives something away', () => {
  it('is held, the world rests under the card, and the tap is carried out only after the word is spelled', () => {
    const r = rig();
    let released = 0;
    expect(
      r.teacher.hold(APPLE_TREE, () => {
        released += 1;
      }),
    ).toBe(true);
    expect(r.teacher.busy).toBe(true);
    expect(r.card.latest?.word).toBe('apple');
    expect(r.log).toEqual(['freeze', 'open:apple']);
    spellAndCelebrate(r);
    expect(released).toBe(0);
    r.card.handlers.collect();
    expect(released).toBe(1);
    expect(r.teacher.busy).toBe(false);
  });

  it('puts the card away and lets the world go before it carries the tap out, so the tap lands on a world that is moving', () => {
    const r = rig();
    const order: string[] = [];
    r.teacher.hold(APPLE_TREE, () => order.push(...r.log.slice(-3), 'release'));
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(order).toEqual(['close', 'thaw', 'keep:apple', 'release']);
  });

  it('is not carried out when the player closes the card, and they are asked again by the next tap', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.card.handlers.close();
    expect(released).toBe(0);
    expect(r.teacher.busy).toBe(false);
    expect(r.log.slice(-2)).toEqual(['close', 'thaw']);
    // A tree the player tapped is never held back by a card they closed.
    expect(
      r.teacher.hold(APPLE_TREE, () => {
        released += 1;
      }),
    ).toBe(true);
    expect(r.card.isUp).toBe(true);
  });

  it('goes through at once when no word is due, so the fruit falls as it always did', () => {
    const r = rig({ profile: profileOf({ apple: { level: 3, best: 3, due: T0 + DAY } }) });
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(false);
    expect(r.log).toEqual([]);
  });

  it('goes through at once when the card breaks, and the world is let go', () => {
    const r = rig();
    r.card.breaks = true;
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(false);
    expect(r.teacher.busy).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    expect(r.reports).toHaveLength(1);
  });

  it('goes through when something else has the screen', () => {
    const r = rig();
    r.allow(false);
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(false);
    expect(r.log).toEqual([]);
  });

  it('is not held a second time while a card is up', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    expect(r.teacher.hold('prop.carrot-bed', () => undefined)).toBe(false);
    expect(r.card.latest?.word).toBe('apple');
  });
});

describe('spelling on the card', () => {
  it('opens with what the player chose and what the word is, and says the word and how to begin on the first card they have seen', () => {
    const r = rig({ settings: { keyboard: 'qwerty', letters: 'lower' } });
    r.teacher.hold(APPLE_TREE, () => undefined);
    expect(r.card.opening).toEqual({
      picture: 'picture:apple',
      portrait: false,
      layout: 'qwerty',
      letters: 'lower',
      speech: true,
      firstEver: true,
    });
    expect(r.spoken).toEqual(["Let's spell apple. Press the shining letters."]);
    expect(r.sounds).toEqual(['open']);
  });

  it('does not explain the keys again once the player has spelled a word', () => {
    const r = rig({ profile: profileOf({ frog: { level: 3, best: 3, due: T0 + DAY } }) });
    r.teacher.hold(APPLE_TREE, () => undefined);
    expect(r.card.opening?.firstEver).toBe(false);
    expect(r.spoken).toEqual(["Let's spell apple."]);
  });

  it('shows the friend as a portrait, and a thing as a picture', () => {
    const r = rig();
    r.teacher.met('leaf', () => undefined);
    r.clock.advance(MEET_AFTER_MS);
    expect(r.card.opening?.portrait).toBe(true);
  });

  it('shows a speaker button only when there is a voice and a parent wants words said', () => {
    for (const [available, say, expected] of [
      [true, true, true],
      [true, false, false],
      [false, true, false],
    ] as const) {
      const r = rig({ settings: { say } });
      r.voice.available = available;
      r.teacher.hold(APPLE_TREE, () => undefined);
      expect(r.card.opening?.speech, `voice ${available}, say ${say}`).toBe(expected);
    }
  });

  it('gives every right letter a chime that climbs, and the last one its own', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.spell();
    expect(r.sounds).toEqual(['open', 'letter:0', 'letter:1', 'letter:2', 'letter:3', 'letter:4:last']);
  });

  it('takes a wrong key softly: it never places a letter and it is told so, and a key that is resting is told so too', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 1) });
    r.teacher.hold(FROG, () => undefined);
    // Frog is at the rung with decoys, so there are keys that rest.
    const rests = ['q', 'x', 'z', 'j', 'v', 'k'].find((key) => !r.card.latest!.keys.has(key))!;
    r.card.handlers.key(rests);
    expect(r.card.outcomes.at(-1)).toEqual({ kind: 'faded', letter: rests });
    expect(r.sounds.at(-1)).toBe('faded');
    const wrong = r.card.slip();
    expect(r.card.outcomes.at(-1)).toEqual({ kind: 'wrong', letter: wrong, lit: false });
    expect(r.sounds.at(-1)).toBe('miss');
    expect(r.card.latest?.placed).toBe(0);
  });

  it('lights the key the player needs after two wrong keys, and plays the hint', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 1) });
    r.teacher.hold(FROG, () => undefined);
    const first = r.card.slip();
    const second = [...r.card.latest!.keys].find((key) => key !== nextLetter(r.card.latest!) && key !== first)!;
    r.card.handlers.key(second);
    expect(r.card.outcomes.at(-1)).toMatchObject({ kind: 'wrong', lit: true });
    expect(r.sounds.slice(-2)).toEqual(['miss', 'hint']);
  });

  it('does not go on when the card says it is done before the word is spelled', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.card.handlers.key('a');
    r.card.handlers.collect();
    expect(released).toBe(0);
    expect(r.teacher.busy).toBe(true);
    expect(r.keeps).toEqual([]);
    expect(r.card.isUp).toBe(true);
  });

  it('ignores a key that is not a letter and every key once the word is done', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.handlers.key('7');
    r.card.handlers.key(' ');
    expect(r.card.outcomes).toEqual([]);
    r.card.spell();
    const count = r.card.outcomes.length;
    r.card.handlers.key('a');
    expect(r.card.outcomes).toHaveLength(count);
  });

  it('says the name of every key the player presses, the right one, the one that is not and the one that is resting, and nothing for a key that does nothing', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 1) });
    r.teacher.hold(FROG, () => undefined);
    const rests = ['q', 'x', 'z', 'j', 'v', 'k'].find((key) => !r.card.latest!.keys.has(key))!;
    r.card.handlers.key('7');
    r.card.handlers.key(rests);
    const wrong = r.card.slip();
    const right = nextLetter(r.card.latest!)!;
    r.card.handlers.key(right);
    expect(r.letters).toEqual([rests, wrong, right]);
    r.card.spell();
    const heard = r.letters.length;
    r.card.handlers.key('a');
    expect(r.letters, 'a key after the word is done is not said').toHaveLength(heard);
  });

  it('says the name of the last letter too, and the word comes after the chimes', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.spell();
    expect(r.letters).toEqual([...'apple']);
    const before = r.spoken.length;
    r.clock.advance(LAND_MS + SAY_AFTER_MS);
    expect(r.spoken).toHaveLength(before + 1);
  });

  it('says the word when the player asks to hear it, at any time', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.handlers.say();
    expect(r.spoken.at(-1)).toBe('apple.');
    spellAndCelebrate(r);
    r.card.handlers.say();
    expect(r.spoken.at(-1)).toBe('apple.');
  });

  it('counts a help once, lights the key, and shows the whole word for a moment only where the rung has a peek', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 2) });
    r.teacher.hold(FROG, () => undefined);
    r.card.handlers.help();
    r.card.handlers.help();
    expect(r.card.helps).toEqual([true]);
    expect(r.card.latest?.hints).toBe(1);
    expect(r.sounds.at(-1)).toBe('hint');
    r.clock.advance(PEEK_MS - 1);
    expect(r.card.renders).toEqual([]);
    r.clock.advance(1);
    expect(r.card.renders).toEqual([false]);
  });

  it('shows no peek where the rung has none', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 1) });
    r.teacher.hold(FROG, () => undefined);
    r.card.handlers.help();
    expect(r.card.helps).toEqual([false]);
    r.clock.advance(PEEK_MS * 2);
    expect(r.card.renders).toEqual([]);
  });

  it('gives no help at the rung that already lights the key', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.handlers.help();
    expect(r.card.helps).toEqual([]);
  });
});

describe('a finished word', () => {
  it("is in the player's book at the letter that finished it, before the card says so, so nothing they do next can lose it", () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.spell();
    expect(r.writes()).toBe(1);
    expect(cardOf(r.book(), 'apple', r.clock.now).collected).toBe(true);
    expect(r.card.celebrated).toBeNull();
    r.clock.advance(LAND_MS);
    expect(r.card.celebrated).not.toBeNull();
    expect(r.writes()).toBe(1);
  });

  it('is kept, and the tap goes on, when the player closes the card as the last letter lands', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.card.spell();
    r.card.handlers.close();
    expect(released).toBe(1);
    expect(cardOf(r.book(), 'apple', r.clock.now).collected).toBe(true);
    expect(r.teacher.busy).toBe(false);
    r.clock.advance(AUTO_CONTINUE_MS * 2);
    expect(released).toBe(1);
  });

  it('is kept, and the tap goes on, when the player closes the card after the celebration', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    spellAndCelebrate(r);
    r.card.handlers.close();
    expect(released).toBe(1);
  });

  it('says what the player earned: every star for a new word, with the stars they had before', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(r);
    expect(r.card.celebrated?.worth.stars).toEqual({ before: 0, after: 5 });
    expect(r.card.celebrated?.text).toContain('apple');
    expect(r.sounds.at(-1)).toBe('done:5');
  });

  it('tells the card how big the moment was, so a finished page and a round number are not shown as any other word', () => {
    const four = ['frog', 'duck', 'apple', 'ruby'] as const;
    const round = rig({ profile: profileOf(Object.fromEntries(four.map((word) => [word, { level: 1 }]))) });
    expect(round.teacher.practice('gold')).toBe(true);
    spellAndCelebrate(round);
    expect(round.card.celebrated?.worth).toMatchObject({ milestone: MILESTONE_EVERY, pages: [], everything: false });
    expect(occasionOf(round.card.celebrated!.worth)).toBe('milestone');

    const meadow = rig({
      profile: profileOf(
        Object.fromEntries(PAGES[0]!.words.filter((word) => word !== 'ladybug').map((word) => [word, { level: 1 }])),
      ),
    });
    expect(meadow.teacher.practice('ladybug')).toBe(true);
    spellAndCelebrate(meadow);
    expect(meadow.card.celebrated?.worth.pages).toEqual(['meadow']);
    expect(occasionOf(meadow.card.celebrated!.worth)).toBe('page');
    expect(meadow.card.celebrated?.text).toBe('ladybug! You finished The Meadow!');
    expect(meadow.sounds.at(-1)).toBe('done:5');

    const plain = rig();
    plain.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(plain);
    expect(occasionOf(plain.card.celebrated!.worth)).toBe('star');
  });

  it('says the praise after the chimes have begun, and does not repeat it', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(r);
    const before = r.spoken.length;
    r.clock.advance(SAY_AFTER_MS - 1);
    expect(r.spoken).toHaveLength(before);
    r.clock.advance(1);
    expect(r.spoken).toHaveLength(before + 1);
    expect(r.spoken.at(-1)).toBe(r.card.celebrated?.text);
    r.clock.advance(AUTO_CONTINUE_MS);
    expect(r.spoken).toHaveLength(before + 1);
  });

  it('is not praised aloud once the player has gone on, and leaves nothing waiting', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(r);
    const before = r.spoken.length;
    r.card.handlers.collect();
    r.clock.advance(SAY_AFTER_MS + AUTO_CONTINUE_MS);
    expect(r.spoken).toHaveLength(before);
    expect(r.clock.waiting).toBe(0);
  });

  it('sends the picture to the book from where it was on the card, and flies it with a sound', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.keeps).toEqual([
      {
        word: 'apple',
        picture: 'picture:apple',
        portrait: false,
        from: { left: 10, top: 20, width: 100, height: 100 },
        fresh: true,
        collected: 1,
        stars: { before: 0, after: 5 },
      },
    ]);
    expect(r.sounds.at(-1)).toBe('fly');
  });

  it('says whether the word is new to the book, how many words the book has now and how many stars it has gained', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    const first = r.keeps.at(-1)!;
    expect([first.word, first.fresh, first.collected]).toEqual(['frog', true, 1]);
    // The same word again, picked from the book: nothing is new, and the book still has one word.
    expect(r.teacher.practice('frog')).toBe(true);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    const again = r.keeps.at(-1)!;
    expect([again.word, again.fresh, again.collected]).toEqual(['frog', false, 1]);
    expect(again.stars.after).toBeGreaterThanOrEqual(again.stars.before);
  });

  it("calls a friend's picture a portrait, so it can be drawn in its round frame", () => {
    const r = rig();
    expect(r.teacher.practice('leaf')).toBe(true);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.keeps.at(-1)).toMatchObject({ word: 'leaf', portrait: true });
  });

  it('goes on by itself when the player does not tap, once, and not before', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    spellAndCelebrate(r);
    r.clock.advance(AUTO_CONTINUE_MS - 1);
    expect(released).toBe(0);
    r.clock.advance(1);
    expect(released).toBe(1);
    r.card.handlers.collect();
    expect(released).toBe(1);
  });

  it('waits as long as it is told to before it goes on by itself, so a browser test can look at a card for as long as it needs', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.teacher.autoContinueMs = 3 * AUTO_CONTINUE_MS;
    spellAndCelebrate(r);
    r.clock.advance(3 * AUTO_CONTINUE_MS - 1);
    expect(r.card.isUp).toBe(true);
    expect(released).toBe(0);
    r.clock.advance(1);
    expect(r.card.isUp).toBe(false);
    expect(released).toBe(1);
  });

  it('goes on once however many times the player taps', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    spellAndCelebrate(r);
    r.card.handlers.collect();
    r.card.handlers.collect();
    r.card.handlers.close();
    expect(released).toBe(1);
  });

  it('is a review the next time it is due, at the level it earned', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    // The word is written to the player's book at its last letter, and its time is counted from
    // then.
    const spelled = r.clock.now;
    spellAndCelebrate(r);
    r.card.handlers.collect();
    // Spelled cleanly at the first level, it moves up one, and is not asked for again until the
    // time that level leaves it.
    expect(tally(r.book(), r.clock.now).collected).toBe(1);
    r.clock.advance(spelled + LEVELS[1]!.due - 1 - r.clock.now);
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(false);
    r.clock.advance(1);
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(true);
    expect(r.card.latest?.level).toBe(1);
    expect(r.card.opening?.firstEver).toBe(false);
  });
});

describe('closing the card', () => {
  it('changes nothing about the word, stops the voice and lets the world go', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.slip();
    r.card.handlers.close();
    expect(r.writes()).toBe(0);
    expect(r.book()).toEqual(emptyProfile());
    expect(r.stops()).toBeGreaterThan(0);
    expect(r.log.slice(-2)).toEqual(['close', 'thaw']);
    expect(r.teacher.busy).toBe(false);
  });

  it('does nothing when no card is up', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.handlers.close();
    const log = [...r.log];
    r.card.handlers.close();
    r.card.handlers.collect();
    r.card.handlers.key('a');
    r.card.handlers.help();
    r.card.handlers.say();
    expect(r.log).toEqual(log);
  });

  it('drops a peek that was running', () => {
    const r = rig({ profile: dueAt(FROG, 'frog', 2) });
    r.teacher.hold(FROG, () => undefined);
    r.card.handlers.help();
    r.card.handlers.close();
    r.clock.advance(PEEK_MS * 2);
    expect(r.card.renders).toEqual([]);
    expect(r.clock.waiting).toBe(0);
  });
});

describe('a thing the player touched', () => {
  it('is asked about after the world has answered, and not at once', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(INVITE_AFTER_MS - 1);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(1);
    expect(r.card.isUp).toBe(true);
    expect(r.card.latest?.word).toBe('frog');
  });

  it('is answered by the world at the thing when the player has spelled it, where it is then and not where it was', () => {
    const r = rig();
    let place = AT;
    r.teacher.touched(FROG, () => place);
    r.clock.advance(INVITE_AFTER_MS);
    place = { at: { x: 400, y: 90 }, lift: 12 };
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.celebrations).toEqual([{ effect: WORDS.frog.celebrate, place: { at: { x: 400, y: 90 }, lift: 12 } }]);
    expect(r.log.slice(-2)).toEqual(['keep:frog', `world:${WORDS.frog.celebrate}`]);
  });

  it('is answered with the shimmer of the word the player spelled, whichever word it was', () => {
    for (const [subject, word] of [
      ['life.frog', 'frog'],
      ['life.bird', 'bird'],
      ['life.fish', 'fish'],
      ['unicorn.leaf', 'leaf'],
    ] as const) {
      const r = rig();
      r.teacher.touched(subject, () => AT);
      r.clock.advance(INVITE_AFTER_MS);
      spellAndCelebrate(r);
      r.card.handlers.collect();
      expect(
        r.celebrations.map((c) => c.effect),
        word,
      ).toEqual([WORDS[word].celebrate]);
    }
  });

  it('is not answered when the player closes the card, and the world has nothing to celebrate', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.handlers.close();
    expect(r.celebrations).toEqual([]);
  });

  it('is left alone while a card is up, and nothing is queued behind it', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.teacher.touched(FROG, () => AT);
    expect(r.clock.waiting).toBe(0);
    r.clock.advance(INVITE_AFTER_MS * 2);
    expect(r.card.latest?.word).toBe('apple');
  });

  it('is dropped when something else has the screen by the time the world has answered', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.allow(false);
    r.clock.advance(INVITE_AFTER_MS);
    r.allow(true);
    r.clock.advance(60_000);
    expect(r.log).toEqual([]);
  });

  it('is replaced by the next thing the player touched when they touch another straight away', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(300);
    r.teacher.touched('life.duck', () => AT);
    r.clock.advance(INVITE_AFTER_MS - 1);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(1);
    expect(r.card.latest?.word).toBe('duck');
  });

  it('is asked about only when a word is due', () => {
    const r = rig({ profile: knownExcept(FROG) });
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.isUp).toBe(false);
  });

  it('keeps its distance: after a card, the next invitation waits for the gap a parent chose', () => {
    for (const ask of ['often', 'sometimes', 'rarely'] as const) {
      const r = rig({ settings: { ask } });
      r.teacher.touched(FROG, () => AT);
      r.clock.advance(INVITE_AFTER_MS);
      spellAndCelebrate(r);
      r.card.handlers.collect();
      const done = r.clock.now;
      r.teacher.touched('life.duck', () => AT);
      r.clock.advance(INVITE_AFTER_MS);
      expect(r.card.isUp, `${ask} right after`).toBe(false);
      r.clock.advance(done + GAP[ask] - r.clock.now);
      r.teacher.touched('life.duck', () => AT);
      r.clock.advance(INVITE_AFTER_MS);
      expect(r.card.isUp, `${ask} after the gap`).toBe(true);
    }
  });

  it('leaves a word alone for a while after the player closed it, but asks again once the time is over', () => {
    const r = rig({ profile: knownExcept(FROG, 'frog') });
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.handlers.close();
    r.clock.advance(SNOOZE.sometimes - 1_000);
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(2_000);
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('frog');
  });

  it('is no longer left alone once the player has spelled the word they closed, and only the gap holds it back', () => {
    const r = rig({ profile: knownExcept(FROG, 'frog') });
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.handlers.close();
    // The player picks the frog from their book and spells it with some trouble, so it is due again
    // at once.
    r.clock.advance(1_000);
    expect(r.teacher.practice('frog')).toBe(true);
    // Three different wrong keys are more slips than the first rung forgives.
    const spelling = r.card.latest!;
    for (const key of [...spelling.keys].filter((k) => k !== nextLetter(spelling)).slice(0, 3))
      r.card.handlers.key(key);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.book().words.frog?.spell?.level).toBe(0);
    r.clock.advance(GAP.sometimes);
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.isUp).toBe(true);
    expect(r.card.latest?.word).toBe('frog');
  });

  it('is not held back by a card the player closed when they tap something that gives something away', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.handlers.close();
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(true);
  });
});

describe('a friend the player has met', () => {
  it('is asked her name, and joins only when it is spelled', () => {
    const r = rig();
    let joined = 0;
    r.teacher.met('glacier', () => {
      joined += 1;
    });
    expect(r.card.isUp).toBe(false);
    r.clock.advance(MEET_AFTER_MS);
    // Her own name, and not "unicorn", which her portrait would also give.
    expect(r.card.latest?.word).toBe('glacier');
    expect(joined).toBe(0);
    spellAndCelebrate(r);
    expect(joined).toBe(0);
    r.card.handlers.collect();
    expect(joined).toBe(1);
  });

  it('joins at once when her name is not due, with no card', () => {
    const r = rig({ profile: profileOf({ leaf: { level: 4, best: 4, due: T0 + DAY } }) });
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    expect(joined).toBe(1);
    r.clock.advance(60_000);
    expect(r.log).toEqual([]);
  });

  it('is left waiting when the player closes the card, and is asked again when she is tapped', () => {
    const r = rig();
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.clock.advance(MEET_AFTER_MS);
    r.card.handlers.close();
    expect(joined).toBe(0);
    r.clock.advance(60_000);
    expect(r.card.isUp).toBe(false);
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.clock.advance(MEET_AFTER_MS);
    expect(r.card.latest?.word).toBe('leaf');
  });

  it('is not asked when Wildstar has already walked away', () => {
    const r = rig();
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.clock.advance(MEET_AFTER_MS - 100);
    r.teacher.away('leaf');
    r.clock.advance(60_000);
    expect(r.card.isUp).toBe(false);
    expect(joined).toBe(0);
  });

  it('is asked once when she is tapped twice before the card comes up', () => {
    const r = rig();
    r.teacher.met('leaf', () => undefined);
    r.clock.advance(300);
    r.teacher.met('leaf', () => undefined);
    r.clock.advance(MEET_AFTER_MS - 1);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(1);
    expect(r.card.isUp).toBe(true);
    expect(r.log.filter((entry) => entry.startsWith('open:'))).toHaveLength(1);
  });

  it('joins when the card cannot be shown, so a friend is never left unfound', () => {
    const r = rig();
    r.card.breaks = true;
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.clock.advance(MEET_AFTER_MS);
    expect(joined).toBe(1);
    expect(r.teacher.busy).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
  });

  it('is asked again a little later when another card is in the way, and joins once it is spelled', () => {
    const r = rig();
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.allow(false);
    r.clock.advance(MEET_AFTER_MS);
    expect(r.card.isUp).toBe(false);
    r.allow(true);
    r.clock.advance(MEET_RETRY_MS);
    expect(r.card.latest?.word).toBe('leaf');
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(joined).toBe(1);
  });

  it('stops trying after a while, and leaves her waiting to be tapped', () => {
    const r = rig();
    r.teacher.met('leaf', () => undefined);
    r.allow(false);
    r.clock.advance(MEET_AFTER_MS + MEET_RETRY_MS * (MEET_TRIES + 2));
    expect(r.clock.waiting).toBe(0);
    r.allow(true);
    r.clock.advance(60_000);
    expect(r.card.isUp).toBe(false);
  });

  it('comes before something the player merely touched, which is dropped', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(500);
    r.teacher.met('leaf', () => undefined);
    r.clock.advance(INVITE_AFTER_MS - 500);
    expect(r.card.isUp).toBe(false);
    r.clock.advance(MEET_AFTER_MS);
    expect(r.card.latest?.word).toBe('leaf');
  });

  it('joins at once, with no card, when a parent turned learning off before the player was asked', () => {
    const r = rig();
    let joined = 0;
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.setSettings({ on: false });
    r.clock.advance(MEET_AFTER_MS);
    expect(joined).toBe(1);
    expect(r.card.isUp).toBe(false);
  });
});

describe('a word the player picked from the book', () => {
  it('opens at the level the word has, whenever it is, and nothing follows', () => {
    const r = rig({ profile: profileOf({ frog: { level: 4, best: 4, due: T0 + 10 * DAY } }) });
    expect(r.teacher.practice('frog')).toBe(true);
    expect(r.card.latest?.level).toBe(4);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.celebrations).toEqual([]);
    expect(r.teacher.busy).toBe(false);
  });

  it('goes up over the book, which has the screen, where a question the world asked would have to wait', () => {
    const r = rig();
    r.allow(false);
    expect(r.teacher.hold(APPLE_TREE, () => undefined)).toBe(false);
    expect(r.card.isUp).toBe(false);
    expect(r.teacher.practice('frog')).toBe(true);
    expect(r.card.isUp).toBe(true);
    expect(r.log).toEqual(['freeze', 'open:frog']);
  });

  it('is not opened while learning is off or while another card is up', () => {
    const off = rig({ settings: { on: false } });
    expect(off.teacher.practice('frog')).toBe(false);
    const busy = rig();
    busy.teacher.hold(APPLE_TREE, () => undefined);
    expect(busy.teacher.practice('frog')).toBe(false);
  });
});

describe('a word the player is looking for', () => {
  const FAIRY = 'life.fairy' as const;

  it('is asked for when the player touches a thing that gives it, and not the easier word that thing would have asked for', () => {
    const r = rig();
    expect(r.teacher.seek('potion')).toBe(true);
    expect(r.teacher.seeking).toBe('potion');
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('potion');
  });

  it('is asked for however soon the last card was, where an invitation would have kept its distance', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.isUp).toBe(false);
    r.teacher.seek('wish');
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('wish');
  });

  it('is not what a thing that does not give it asks for', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('frog');
    expect(r.teacher.seeking).toBe('potion');
  });

  it('is asked for when the player taps a tree that gives fruit, as a word of the tree would be', () => {
    const r = rig();
    expect(r.teacher.seek('berry')).toBe(true);
    expect(r.teacher.hold('prop.berry-tree', () => undefined)).toBe(true);
    expect(r.card.latest?.word).toBe('berry');
  });

  it('is not looked for any more once the player has spelled it, by whatever road they came to it', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.spell();
    expect(r.teacher.seeking).toBeNull();
  });

  it('is not looked for any more once the player has spelled it as the word of something they were not heading for', () => {
    const r = rig();
    r.teacher.seek('wand');
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.spell();
    r.card.handlers.collect();
    expect(r.teacher.seeking).toBeNull();
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(60_000);
    expect(r.card.isUp).toBe(false);
  });

  it('is put down when the player closes the card for it, which says they do not want it now, and the thing is then asked as usual', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    r.card.handlers.close();
    expect(r.teacher.seeking).toBeNull();
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.isUp).toBe(false);
  });

  it('is kept when the player closes the card of another word', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.card.handlers.close();
    expect(r.teacher.seeking).toBe('potion');
  });

  it('can be put down by the player, and then a touch is asked as it always was', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.stopSeeking();
    expect(r.teacher.seeking).toBeNull();
    r.teacher.touched(FAIRY, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('wand');
  });

  it('is replaced by the next word the player asks to be taken to', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.seek('wish');
    expect(r.teacher.seeking).toBe('wish');
  });

  it('is turned down for a word the player has spelled, and while learning is off, and leaves what they were looking for alone', () => {
    const spelled = rig({ profile: profileOf({ wand: { level: 3, best: 3, due: T0 + DAY } }) });
    spelled.teacher.seek('potion');
    expect(spelled.teacher.seek('wand')).toBe(false);
    expect(spelled.teacher.seeking).toBe('potion');
    const off = rig({ settings: { on: false } });
    expect(off.teacher.seek('potion')).toBe(false);
    expect(off.teacher.seeking).toBeNull();
  });

  it('is forgotten when learning goes off, and goes on when the player goes to another place', () => {
    const r = rig();
    r.teacher.seek('potion');
    r.teacher.newPlace();
    expect(r.teacher.seeking).toBe('potion');
    r.setSettings({ on: false });
    r.teacher.settingsChanged();
    expect(r.teacher.seeking).toBeNull();
  });
});

describe('when a parent changes something', () => {
  it('takes away a card that is not finished when learning goes off, and holds nothing', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.setSettings({ on: false });
    r.teacher.settingsChanged();
    expect(r.teacher.busy).toBe(false);
    expect(released).toBe(0);
    expect(r.log.slice(-2)).toEqual(['close', 'thaw']);
  });

  it('lets a word that is spelled go on when learning goes off', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    spellAndCelebrate(r);
    r.setSettings({ on: false });
    r.teacher.settingsChanged();
    expect(released).toBe(1);
    expect(cardOf(r.book(), 'apple', r.clock.now).collected).toBe(true);
  });

  it('forgets what it was about to ask when learning goes off', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.teacher.met('leaf', () => undefined);
    r.setSettings({ on: false });
    r.teacher.settingsChanged();
    expect(r.clock.waiting).toBe(0);
  });

  it('changes nothing when learning stays on', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.setSettings({ ask: 'rarely' });
    r.teacher.settingsChanged();
    expect(r.teacher.busy).toBe(true);
  });
});

describe('when the player goes to another place', () => {
  it('forgets what the player touched and the friends who were waiting, and asks about none of them', () => {
    const r = rig();
    let joined = 0;
    r.teacher.touched(FROG, () => AT);
    r.teacher.met('leaf', () => {
      joined += 1;
    });
    r.teacher.newPlace();
    expect(r.clock.waiting).toBe(0);
    r.clock.advance(60_000);
    expect(r.card.isUp).toBe(false);
    expect(joined).toBe(0);
  });

  it('asks about what the player touches there', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.teacher.newPlace();
    r.teacher.touched(FROG, () => AT);
    r.clock.advance(INVITE_AFTER_MS);
    expect(r.card.latest?.word).toBe('frog');
  });

  it('leaves a card that is up alone', () => {
    const r = rig();
    let released = 0;
    r.teacher.hold(APPLE_TREE, () => {
      released += 1;
    });
    r.teacher.newPlace();
    expect(r.teacher.busy).toBe(true);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(released).toBe(1);
  });
});

describe('what cannot stop the lesson', () => {
  it('goes on when a sound breaks', () => {
    const r = rig({ throwing: 'sound' });
    let released = 0;
    expect(
      r.teacher.hold(APPLE_TREE, () => {
        released += 1;
      }),
    ).toBe(true);
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(released).toBe(1);
    expect(cardOf(r.book(), 'apple', r.clock.now).collected).toBe(true);
    expect(r.reports.length).toBeGreaterThan(0);
  });

  it('goes on when the voice breaks', () => {
    const r = rig({ throwing: 'voice' });
    let released = 0;
    expect(
      r.teacher.hold(APPLE_TREE, () => {
        released += 1;
      }),
    ).toBe(true);
    spellAndCelebrate(r);
    r.clock.advance(SAY_AFTER_MS);
    r.card.handlers.collect();
    expect(released).toBe(1);
  });

  it('lets the world go and does not stop when what the world was waiting to do breaks', () => {
    const r = rig();
    r.teacher.hold(APPLE_TREE, () => {
      throw new Error('the tap broke');
    });
    spellAndCelebrate(r);
    r.card.handlers.collect();
    expect(r.teacher.busy).toBe(false);
    expect(r.log.slice(-3)).toContain('thaw');
    expect(r.reports).toHaveLength(1);
  });

  it('puts everything away when it is torn down', () => {
    const r = rig();
    r.teacher.touched(FROG, () => AT);
    r.teacher.met('leaf', () => undefined);
    r.teacher.dispose();
    expect(r.clock.waiting).toBe(0);
    r.teacher.hold(APPLE_TREE, () => undefined);
    r.teacher.dispose();
    expect(r.teacher.busy).toBe(false);
    expect(r.card.isUp).toBe(false);
  });
});

describe('whatever the player and the world do, in any order', () => {
  const FRIENDS = ['leaf', 'glacier', 'river', 'cinder', 'storm'] as const;
  const EVERY_WORD = Object.keys(WORDS) as WordId[];
  const GAPS = [30, 400, 700, 800, 1000, 3000, 9000] as const;

  /**
   * A long run of things the world and a child can do, in an order nobody planned, with the
   * promises the lesson makes checked after every one. The same seed is the same run, so a failure
   * can be replayed.
   */
  function run(seed: number, moves: number, cardBreaks: boolean): void {
    const dice = seeded(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(dice() * items.length)]!;
    const r = rig();
    /**
     * Everything the world gave the lesson to call, with how many times it was called, and whether
     * it was called when it should not have been.
     */
    const given: { count: number; bad: boolean }[] = [];
    const callback = (): (() => void) => {
      const entry = { count: 0, bad: false };
      given.push(entry);
      return () => {
        entry.count += 1;
      };
    };
    const place = (): (() => Place) => {
      const entry = { count: 0, bad: false };
      given.push(entry);
      return () => {
        entry.count += 1;
        return AT;
      };
    };
    const timesApple = (): number => r.book().words.apple?.spell?.done ?? 0;
    /**
     * What the tree is waiting to do. It may only be done once the player's word is spelled: a card
     * they closed holds nothing back, and gives nothing away.
     */
    const fruit = (): (() => void) => {
      const entry = { count: 0, bad: false };
      given.push(entry);
      const before = timesApple();
      return () => {
        entry.count += 1;
        if (timesApple() <= before) entry.bad = true;
      };
    };
    const trail: string[] = [];
    let freezes = 0;
    let thaws = 0;
    let logged = 0;
    let collected = 0;

    const check = (): void => {
      for (; logged < r.log.length; logged++) {
        if (r.log[logged] === 'freeze') freezes++;
        if (r.log[logged] === 'thaw') thaws++;
      }
      const why = `seed ${seed}, after ${trail.length} moves, the last of them: ${trail.slice(-8).join(', ')}`;
      expect(r.card.isUp, `a card is up exactly when a lesson is on. ${why}`).toBe(r.teacher.busy);
      expect(freezes - thaws, `the world rests exactly while a card is up. ${why}`).toBe(r.teacher.busy ? 1 : 0);
      expect(given.filter((c) => c.count > 1).length, `nothing the world asked for is done twice. ${why}`).toBe(0);
      expect(
        given.filter((c) => c.bad).length,
        `the tree gives its fruit only for a word that was spelled. ${why}`,
      ).toBe(0);
      const now = tally(r.book(), r.clock.now).collected;
      expect(now, `a word she has collected is never lost. ${why}`).toBeGreaterThanOrEqual(collected);
      collected = now;
      const looking = r.teacher.seeking;
      if (looking !== null)
        expect(
          r.book().words[looking]?.spell?.done ?? 0,
          `she is only ever looking for a word that is not in her book yet. ${why}`,
        ).toBe(0);
      if (!cardBreaks) expect(r.reports, `nothing broke. ${why}`).toEqual([]);
    };

    const things: { name: string; weight: number; go: () => void }[] = [
      { name: 'time passes', weight: 5, go: () => r.clock.advance(pick(GAPS)) },
      { name: 'a tap on the tree', weight: 2, go: () => void r.teacher.hold(APPLE_TREE, fruit()) },
      {
        name: 'a tap on a creature',
        weight: 2,
        go: () => r.teacher.touched(pick([FROG, 'life.fairy', unicornSubject('leaf'), APPLE_TREE]), place()),
      },
      { name: 'she asks to be taken to a word', weight: 1, go: () => void r.teacher.seek(pick(EVERY_WORD)) },
      { name: 'she stops looking', weight: 1, go: () => r.teacher.stopSeeking() },
      { name: 'a friend is met', weight: 2, go: () => r.teacher.met(pick(FRIENDS), callback()) },
      { name: 'a friend is left', weight: 1, go: () => r.teacher.away(pick(FRIENDS)) },
      { name: 'she goes to another place', weight: 1, go: () => r.teacher.newPlace() },
      { name: 'she picks a word from the book', weight: 1, go: () => void r.teacher.practice(pick(EVERY_WORD)) },
      {
        name: 'a parent turns learning off or on',
        weight: 1,
        go: () => {
          r.setSettings({ on: dice() < 0.6 });
          r.teacher.settingsChanged();
        },
      },
      { name: 'something else takes the screen, or gives it back', weight: 1, go: () => r.allow(dice() < 0.6) },
      {
        name: 'the key she needs',
        weight: 4,
        go: () => {
          const spelling = r.card.latest;
          if (spelling && !isDone(spelling)) r.card.handlers.key(nextLetter(spelling)!);
        },
      },
      {
        name: 'a key she does not need',
        weight: 2,
        go: () => {
          const spelling = r.card.latest;
          const wrong = spelling && [...spelling.keys].find((key) => key !== nextLetter(spelling));
          if (wrong) r.card.handlers.key(wrong);
        },
      },
      { name: 'a key that is not on the card', weight: 1, go: () => r.card.handlers.key('#') },
      { name: 'help', weight: 1, go: () => r.card.handlers.help() },
      { name: 'the voice button', weight: 1, go: () => r.card.handlers.say() },
      { name: 'she closes the card', weight: 1, go: () => r.card.handlers.close() },
      { name: 'she taps to go on', weight: 2, go: () => r.card.handlers.collect() },
    ];
    if (cardBreaks)
      things.push({
        name: 'the card breaks or mends',
        weight: 1,
        go: () => {
          r.card.breaks = dice() < 0.4;
        },
      });
    const bag = things.flatMap((thing) => Array<typeof thing>(thing.weight).fill(thing));

    for (let i = 0; i < moves; i++) {
      const thing = pick(bag);
      trail.push(thing.name);
      thing.go();
      check();
    }

    // The parent turns it off, and the lesson lets everything go: no card, no friend kept waiting,
    // no timer left.
    trail.push('the end: learning off, and a long time');
    r.card.breaks = false;
    r.setSettings({ on: false });
    r.teacher.settingsChanged();
    r.clock.advance(120_000);
    check();
    expect(r.teacher.busy, `no card is left up. seed ${seed}`).toBe(false);
    expect(r.clock.waiting, `no timer is left running. seed ${seed}`).toBe(0);
    expect(r.teacher.seeking, `she is not looking for anything once learning is off. seed ${seed}`).toBeNull();
  }

  for (let seed = 1; seed <= 40; seed++) {
    it(`keeps its promises through 400 moves (seed ${seed})`, () => run(seed, 400, false));
  }

  for (let seed = 101; seed <= 120; seed++) {
    it(`keeps them when the card breaks and mends in the middle of it (seed ${seed})`, () => run(seed, 400, true));
  }
});
