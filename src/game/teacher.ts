import type { EffectId } from '../content/activities';
import { isPortrait, type SubjectId, WORDS, type WordId } from '../content/lexicon';
import {
  attemptOf,
  begin,
  type ClipId,
  type Context,
  ended,
  finish,
  help,
  isNew,
  type LearnerProfile,
  NO_PACE,
  offerFor,
  offerForWord,
  opening,
  type Pace,
  practiceOffer,
  praise,
  press,
  progressOf,
  type Reward,
  type Spelling,
  type SpellOffer,
  tally,
  wordSaid,
} from '../learning';
import type { UnicornId } from '../shared/ids';
import type { LearningSettings } from '../shared/learning';
import type { CardHandlers, CardPort, Kept, LessonPort, Place, Rest } from './ports';

/** How long the world's own answer to a tap has to show before a card is offered over it. */
export const INVITE_AFTER_MS = 800;
/** How long a friend who has just stopped has to turn and say hello before her name is asked. */
export const MEET_AFTER_MS = 700;
/**
 * When a card is up already, a friend is asked again after this, and for this many tries. She can
 * always be tapped to ask again.
 */
export const MEET_RETRY_MS = 900;
export const MEET_TRIES = 8;
/** How long the whole word is shown for when the player asks for a peek. */
export const PEEK_MS = 1800;
/** After the last letter lands, the word's celebration begins. */
export const LAND_MS = 320;
/** The voice waits for the chimes to begin, so the word is heard over them and not under them. */
export const SAY_AFTER_MS = 450;
/** A word that is done goes on by itself after this, when the player has not tapped to. */
export const AUTO_CONTINUE_MS = 9000;

/**
 * What the lesson says aloud. The voice is made of clips that ship with the game, so it is the same
 * on every device.
 */
interface Voice {
  /** Whether the game can speak at all here, which is what the speaker button needs. */
  readonly available: boolean;
  /** Says the clips one after another, and cuts off what was being said. */
  say(clips: readonly ClipId[]): void;
  /** Says the sound of a letter the player pressed ("buh"), and cuts off what was being said. */
  letter(letter: string): void;
  stop(): void;
}

/** What the lesson sounds like, apart from the voice. */
interface Sounds {
  open(): void;
  letter(index: number, last: boolean): void;
  miss(): void;
  faded(): void;
  hint(): void;
  fly(): void;
  done(reward: Reward): void;
}

/**
 * The player's book as the lesson needs it: what is in it now, and a way to put in what they have
 * just learned.
 */
export interface Book {
  get(): LearnerProfile;
  set(next: LearnerProfile): void;
}

export interface TeacherDeps {
  /** What a parent has chosen, as it is now. */
  settings: () => LearningSettings;
  book: Book;
  now: () => number;
  /** A number from 0 up to but not including 1. */
  random: () => number;
  /** Runs `run` after `ms` and returns the way to stop it, so a test can hold the clock. */
  later: (ms: number, run: () => void) => () => void;
  /**
   * Whether a card may go up now: the game is being played and nothing else has the screen. A word
   * picked from the book goes up over the book, so this is not asked for that.
   */
  canOpen: () => boolean;
  /** Makes the card. It tells the lesson what the player does through the handlers it is given. */
  makeCard: (handlers: CardHandlers) => CardPort;
  picture: (word: WordId) => string;
  voice: Voice;
  sounds: Sounds;
  /** Holds the world still while a card is up. */
  rest: Rest;
  /** The world's own answer where the thing the player spelled is. */
  celebrate: (effect: EffectId, place: Place) => void;
  /**
   * A word has gone into the player's book, or has been spelled again. It is called after the card
   * has gone.
   */
  keep?: (kept: Kept) => void;
  /** Something went wrong in a way the player should never see. */
  report?: (error: unknown) => void;
}

/**
 * What the world does when the card is done. It is never done when the player closes the card
 * before the word is spelled.
 */
type OnDone =
  /** A tap was held back. It is carried out now. */
  | { kind: 'hold'; release: () => void }
  /** A thing the player touched. The world answers where it is. */
  | { kind: 'touched'; where: () => Place }
  /** A friend who was waiting joins. */
  | { kind: 'meet'; join: () => void }
  /** A word the player picked from the book. Nothing follows. */
  | { kind: 'practice' };

type Session =
  | { phase: 'spelling'; offer: SpellOffer; spelling: Spelling; peeking: boolean; onDone: OnDone }
  /**
   * The last letter is in. `landing` is while it flies to its place, and `celebrating` is the card
   * saying so.
   */
  | { phase: 'landing' | 'celebrating'; offer: SpellOffer; reward: Reward; onDone: OnDone };

type TimerName = 'peek' | 'land' | 'say' | 'auto' | 'invite' | `meet-${UnicornId}`;

/** Whether the card went up, was in the way of another, or broke. */
type Started = 'up' | 'busy' | 'broke';

/**
 * The lesson. The world tells it what the player touched, and it decides whether to ask for a word,
 * runs the card while the player spells it, keeps what the player learned in their book, and tells
 * the world what to do when they are done. It keeps the rules that are about them and the world and
 * the card keep the rules that are about themselves, so every decision is in one place.
 *
 * The player can always get out: closing the card at any moment changes nothing about the word, and
 * a word that is spelled is written to their book at the letter that finished it, before anything
 * is celebrated. A card that cannot be shown never stands between them and what they tapped.
 */
export class Teacher implements LessonPort {
  private readonly card: CardPort;
  private session: Session | null = null;
  private pace: Pace = NO_PACE;
  /**
   * The word the player asked to be taken to, until they have spelled it, closed its card or asked
   * for another.
   */
  private want: WordId | null = null;
  private readonly timers = new Map<TimerName, () => void>();

  /**
   * How long a finished word waits before it goes on by itself. A browser test makes it long, so a
   * slow machine cannot take the card away while the test is still looking at it.
   */
  autoContinueMs = AUTO_CONTINUE_MS;

  constructor(private readonly deps: TeacherDeps) {
    this.card = deps.makeCard({
      key: (letter) => this.key(letter),
      help: () => this.helpMe(),
      say: () => this.say(),
      close: () => this.close(),
      collect: () => this.proceed(),
    });
  }

  /** Whether a card is up. */
  get busy(): boolean {
    return this.session !== null;
  }

  /** The word the player asked to be taken to, or nothing. */
  get seeking(): WordId | null {
    return this.want;
  }

  hold(subject: SubjectId, release: () => void): boolean {
    const offer = offerFor(subject, 'hold', this.context());
    return offer !== null && this.start(offer, { kind: 'hold', release }) === 'up';
  }

  touched(subject: SubjectId, where: () => Place): void {
    if (this.session) return;
    this.after('invite', INVITE_AFTER_MS, () => {
      // A friend who is waiting comes before anything the player merely touched.
      if (this.meeting()) return;
      const offer = offerFor(subject, 'invite', this.context());
      if (offer) this.start(offer, { kind: 'touched', where });
    });
  }

  met(unicorn: UnicornId, join: () => void): void {
    // Nothing to ask: learning is off, or this name is not due. She joins, and a friend is never
    // kept waiting for no reason.
    if (!offerForWord(unicorn, this.context())) {
      this.quietly(join);
      return;
    }
    this.askFriend(unicorn, join, 0, MEET_AFTER_MS);
  }

  away(unicorn: UnicornId): void {
    this.stop(`meet-${unicorn}`);
  }

  newPlace(): void {
    this.dropWaiting();
  }

  /** A word the player picked from the book. False when it could not go up. */
  practice(word: WordId): boolean {
    if (!this.deps.settings().on) return false;
    return this.start(practiceOffer(word, this.context()), { kind: 'practice' }) === 'up';
  }

  /**
   * The player asked to be taken to a word they have not spelled. From now on the thing that gives
   * it asks for it the moment they touch it. False when learning is off or the word is already in
   * their book.
   */
  seek(word: WordId): boolean {
    if (!this.deps.settings().on || !isNew(progressOf(this.deps.book.get(), word, 'spell'))) return false;
    this.want = word;
    return true;
  }

  stopSeeking(): void {
    this.want = null;
  }

  /**
   * A parent changed something. With learning off the card goes away, and a word already spelled
   * still counts.
   */
  settingsChanged(): void {
    if (this.deps.settings().on) return;
    this.want = null;
    this.dropWaiting();
    const s = this.session;
    if (!s) return;
    if (s.phase === 'spelling') this.end();
    else this.proceed();
  }

  /**
   * Stops everything it was waiting for and takes the card away. For when the game is torn down.
   */
  dispose(): void {
    for (const name of [...this.timers.keys()]) this.stop(name);
    if (this.session) this.end();
  }

  private context(): Context {
    return {
      profile: this.deps.book.get(),
      settings: this.deps.settings(),
      now: this.deps.now(),
      pace: this.pace,
      ...(this.want === null ? {} : { want: this.want }),
    };
  }

  /** The names of the friends who are waiting for the card to come up. */
  private waitingFriends(): TimerName[] {
    return [...this.timers.keys()].filter((name) => name.startsWith('meet-'));
  }

  /** Whether a friend is waiting for the card to come up. */
  private meeting(): boolean {
    return this.waitingFriends().length > 0;
  }

  /**
   * Forgets a thing the player touched and every friend who was waiting. A card that is up is left
   * alone.
   */
  private dropWaiting(): void {
    this.stop('invite');
    for (const name of this.waitingFriends()) this.stop(name);
  }

  /**
   * Puts the friend's name to the player after `wait`, trying again a few times if another card is
   * in the way.
   */
  private askFriend(unicorn: UnicornId, join: () => void, tries: number, wait: number): void {
    this.after(`meet-${unicorn}`, wait, () => {
      const offer = offerForWord(unicorn, this.context());
      if (!offer) return this.quietly(join);
      const started = this.start(offer, { kind: 'meet', join });
      // A card that will not go up never leaves a friend unfound.
      if (started === 'broke') return this.quietly(join);
      if (started === 'busy' && tries < MEET_TRIES) this.askFriend(unicorn, join, tries + 1, MEET_RETRY_MS);
    });
  }

  private start(offer: SpellOffer, onDone: OnDone): Started {
    // A word the player picked themselves is their own doing and goes up over the book, which is
    // what would otherwise be in the way.
    if (this.session || (onDone.kind !== 'practice' && !this.deps.canOpen())) return 'busy';
    const settings = this.deps.settings();
    const spelling = begin(offer.word, offer.level, this.deps.random);
    const firstEver = tally(this.deps.book.get(), this.deps.now()).collected === 0;
    this.deps.rest.freeze();
    try {
      this.card.open(spelling, {
        picture: this.deps.picture(offer.word),
        portrait: isPortrait(offer.word),
        layout: settings.keyboard,
        letters: settings.letters,
        speech: this.deps.voice.available && settings.say,
        firstEver,
      });
    } catch (error) {
      this.deps.report?.(error);
      this.quietly(() => this.card.close());
      this.deps.rest.thaw();
      return 'broke';
    }
    this.session = { phase: 'spelling', offer, spelling, peeking: false, onDone };
    this.quietly(() => this.deps.sounds.open());
    this.quietly(() => this.deps.voice.say(opening(offer, firstEver, this.deps.random).clips));
    return 'up';
  }

  private key(letter: string): void {
    const s = this.session;
    if (s?.phase !== 'spelling') return;
    const { spelling, outcome } = press(s.spelling, letter);
    if (outcome.kind === 'ignored') return;
    this.session = { ...s, spelling };
    this.card.pressed(outcome, spelling, s.peeking);
    switch (outcome.kind) {
      case 'right':
        this.quietly(() => this.deps.sounds.letter(outcome.index, outcome.done));
        break;
      case 'wrong':
        this.quietly(() => {
          this.deps.sounds.miss();
          if (outcome.lit) this.deps.sounds.hint();
        });
        break;
      case 'faded':
        this.quietly(() => this.deps.sounds.faded());
        break;
    }
    // Every key the player presses says its sound, the right one, the one that is not and the faded
    // one, so they hear what they touched.
    this.quietly(() => this.deps.voice.letter(outcome.letter));
    if (outcome.kind === 'right' && outcome.done) this.complete({ ...s, spelling });
  }

  private helpMe(): void {
    const s = this.session;
    if (s?.phase !== 'spelling') return;
    const spelling = help(s.spelling);
    if (spelling === s.spelling) return;
    const peeking = spelling.rung.peek;
    this.session = { ...s, spelling, peeking };
    this.card.helped(spelling, peeking);
    this.quietly(() => this.deps.sounds.hint());
    if (peeking) this.after('peek', PEEK_MS, () => this.stopPeeking());
  }

  private stopPeeking(): void {
    const s = this.session;
    if (s?.phase !== 'spelling' || !s.peeking) return;
    this.session = { ...s, peeking: false };
    this.card.render(s.spelling, false);
  }

  private say(): void {
    const s = this.session;
    if (s) this.quietly(() => this.deps.voice.say(wordSaid(s.offer.word).clips));
  }

  /**
   * The last letter is in. The book has it at once, and the card celebrates when the letter has
   * landed.
   */
  private complete(s: Extract<Session, { phase: 'spelling' }>): void {
    const now = this.deps.now();
    const { profile, reward } = finish(this.deps.book.get(), s.offer, attemptOf(s.spelling), now);
    this.deps.book.set(profile);
    this.pace = ended(this.pace, now, s.offer.word, true, this.deps.settings().ask);
    if (this.want === s.offer.word) this.want = null;
    this.session = { phase: 'landing', offer: s.offer, reward, onDone: s.onDone };
    this.after('land', LAND_MS, () => this.celebrate());
  }

  private celebrate(): void {
    const s = this.session;
    if (s?.phase !== 'landing') return;
    const praised = praise(s.reward, this.deps.random);
    this.session = { ...s, phase: 'celebrating' };
    this.card.celebrate(praised.text, s.reward);
    this.quietly(() => this.deps.sounds.done(s.reward));
    this.after('say', SAY_AFTER_MS, () => this.quietly(() => this.deps.voice.say(praised.clips)));
    this.after('auto', this.autoContinueMs, () => this.proceed());
  }

  /**
   * The player closed the card. A word that is not spelled yet is left as it was, and put aside for
   * a while. A word that is, goes on.
   */
  private close(): void {
    const s = this.session;
    if (!s) return;
    if (s.phase !== 'spelling') {
      this.proceed();
      return;
    }
    this.pace = ended(this.pace, this.deps.now(), s.offer.word, false, this.deps.settings().ask);
    // Closing the card for the word the player came to find says they do not want it now.
    if (this.want === s.offer.word) this.want = null;
    this.end();
  }

  /**
   * The word is spelled and the player is ready to go on: the picture goes to their book, and the
   * world does what it was waiting to.
   */
  private proceed(): void {
    const s = this.session;
    if (!s || s.phase === 'spelling') return;
    const word = s.offer.word;
    const from = this.card.pictureRect();
    this.quietly(() => this.deps.sounds.fly());
    this.end();
    this.quietly(() =>
      this.deps.keep?.({
        word,
        picture: this.deps.picture(word),
        portrait: isPortrait(word),
        from,
        fresh: s.reward.fresh,
        collected: s.reward.collected,
        stars: s.reward.stars,
      }),
    );
    this.quietly(() => this.carryOut(s.onDone, word));
  }

  private carryOut(onDone: OnDone, word: WordId): void {
    switch (onDone.kind) {
      case 'hold':
        onDone.release();
        return;
      case 'meet':
        onDone.join();
        return;
      case 'touched':
        this.deps.celebrate(WORDS[word].celebrate, onDone.where());
        return;
      case 'practice':
        return;
      default:
        onDone satisfies never;
        return;
    }
  }

  /** Takes the card away and lets the world go. What it was waiting to do is not done here. */
  private end(): void {
    for (const name of ['peek', 'land', 'say', 'auto'] as const) this.stop(name);
    this.quietly(() => this.deps.voice.stop());
    this.session = null;
    this.quietly(() => this.card.close());
    this.deps.rest.thaw();
  }

  private after(name: TimerName, ms: number, run: () => void): void {
    this.stop(name);
    this.timers.set(
      name,
      this.deps.later(ms, () => {
        this.timers.delete(name);
        run();
      }),
    );
  }

  private stop(name: TimerName): void {
    this.timers.get(name)?.();
    this.timers.delete(name);
  }

  /** Sound, voice and the world's answers sit outside the lesson, and none of them can stop it. */
  private quietly(run: () => void): void {
    try {
      run();
    } catch (error) {
      this.deps.report?.(error);
    }
  }
}
