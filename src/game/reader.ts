import { CHAPTERS, chapterAt, STAGES } from '../content/reading';
import { evenSpans, timesOf } from '../content/reading/times';
import type { ClipId } from '../learning';
import {
  approve,
  askAgain,
  askedAgain,
  attemptOf,
  begin,
  captionOf,
  courseState,
  currentStage,
  finishItem,
  glowing,
  hear,
  help,
  homeOpening,
  idOf,
  itemClip,
  itemOpening,
  joined,
  PROMPTS,
  planRound,
  praise,
  praiseCaption,
  prizeOf,
  type ReadItem,
  type Reading,
  type Reward,
  roundDone,
  roundOpening,
  show,
  tileClip,
  told,
  totals,
  touch,
  touchesOf,
  treasureOf,
} from '../learning/reading';
import type { LearningSettings } from '../shared/learning';
import type { LearnerProfile } from '../shared/profile';
import type { Started } from './desk';
import type { Rest } from './ports';
import type {
  Band,
  ChapterView,
  Cue,
  DoneView,
  Earned,
  Happening,
  HomeView,
  ItemView,
  MapView,
  Mark,
  ReadHandlers,
  ReadingSounds,
  ReadScreen,
  ReadView,
  ReadVoice,
  StageView,
} from './reading-ports';
import { piecesOf, stageView, wordsOfLine } from './reading-views';
import type { Book } from './teacher';

/**
 * The voice waits for the sound of the last piece to end, so what it says next is heard and not
 * talked over.
 */
export const JOIN_AFTER_MS = 650;
/**
 * The voice waits for the sound of finding it to begin, so the word is heard over it and not under
 * it.
 */
export const PRAISE_AFTER_MS = 450;
/**
 * A thing that is read stays this long before the next comes by itself, when the player has not
 * tapped to go on. That is long enough for the cheer and the word to be said.
 */
export const STAY_MS = 3200;
/**
 * A word the player now reads on their own, or a stage cleared, is made more of, and stays this
 * much longer.
 */
export const READS_EXTRA_MS = 1200;
export const CLEARED_EXTRA_MS = 1800;
/**
 * How far apart the pieces are lit for a demonstration with no voice, and how long each stays lit,
 * in seconds.
 */
const LIGHT_EVERY = 0.6;
const LIGHT_FOR = 0.5;

export interface ReaderDeps {
  /** What a parent has chosen, as it is now. */
  settings: () => LearningSettings;
  book: Book;
  now: () => number;
  /** A number from 0 up to but not including 1. */
  random: () => number;
  /** Runs `run` after `ms` and returns the way to stop it, so a test can hold the clock. */
  later: (ms: number, run: () => void) => () => void;
  /**
   * Makes the screen. It tells the reader what the player does through the handlers it is given.
   */
  makeScreen: (handlers: ReadHandlers) => ReadScreen;
  voice: ReadVoice;
  sounds: ReadingSounds;
  /** Holds the world still while the screen is up. */
  rest: Rest;
  /** Something went wrong in a way the player should never see. */
  report?: (error: unknown) => void;
}

/**
 * What came of each thing in a round that is done with. Only a thing that was read has a reward.
 */
interface Round {
  /** The stage the round is for: the one the player is on, or the one they picked from the map. */
  readonly stage: number;
  readonly items: readonly ReadItem[];
  readonly outcomes: readonly ('read' | 'skipped')[];
  readonly rewards: readonly Reward[];
}

/**
 * A thing is in front of the player. `joined` is whether its pieces have come together, which is
 * when they are asked to say it.
 */
interface Doing extends Round {
  readonly phase: 'reading';
  readonly reading: Reading;
  readonly joined: boolean;
}

/**
 * It is read, its reward is the last of the round's, and the book has it. `said` is what the voice
 * says about it.
 */
interface Celebrating extends Round {
  readonly phase: 'found';
  readonly reading: Reading;
  readonly reward: Reward;
  readonly said: readonly ClipId[];
}

interface Finished extends Round {
  readonly phase: 'done';
}

type Session = { readonly phase: 'home' } | { readonly phase: 'map' } | Doing | Celebrating | Finished;

type TimerName = 'join' | 'praise' | 'next';
const TIMERS: readonly TimerName[] = ['join', 'praise', 'next'];

/** A round and nothing else, so what a session adds to it does not travel to the next. */
const roundOf = (s: Round): Round => ({ stage: s.stage, items: s.items, outcomes: s.outcomes, rewards: s.rewards });

/** The thing the player is on, or has just read. */
const itemOf = (s: Doing | Celebrating): ReadItem =>
  s.phase === 'found' ? s.reward.item : s.items[s.outcomes.length]!;

/**
 * Whether it is the first of its kind in the round to be explained: the first new word, or the
 * first sentence. A word the player knows is not explained, and nothing is said twice in a round.
 */
const explained = (round: Round, at: number): boolean => {
  const item = round.items[at]!;
  return !round.items
    .slice(0, at)
    .some((earlier) => (item.kind === 'line' ? earlier.kind === 'line' : earlier.kind === 'word' && !earlier.review));
};

/**
 * The reading computer. The player sits down at a home screen and starts a round of seven things to
 * read, words first and then sentences. A word is read by touching its tiles in order, each of
 * which says its sound, and then saying it out loud and tapping the tick. A sentence is read by
 * touching its words in order and then reading it all together. It runs what the player does while
 * the player does it, writes each thing the player reads to their book before anything is
 * celebrated, and ends with what they read.
 *
 * The game does not listen, so the tick is their word, and nobody has to hold or wait for anything.
 * The player chooses what they work on, from any of the levels and at any time, and nothing is shut
 * to them. The player can always get out, and they can always go on: closing the screen at any
 * moment loses nothing they have read, and skipping a thing leaves it as it was.
 */
export class Reader {
  private readonly screen: ReadScreen;
  private session: Session | null = null;
  private readonly timers = new Map<TimerName, () => void>();
  /**
   * Counts the things that have been dealt, so a word said late for one that has gone, which may be
   * the very word of the one that is up now, is known for what it is.
   */
  private turn = 0;
  /** Counts the cues, so each is shown once. */
  private cues = 0;
  /**
   * The player has never read anything, so the first thing they read is explained, and so is the
   * check. It is over when the first yes is.
   */
  private first = false;
  /**
   * The stage the player chose from the map, which every round is from until they choose another,
   * or nothing for the first one they have not cleared. `floor` is where a parent had started them
   * when they chose, so that a parent who starts them somewhere else is not argued with.
   */
  private focus: { readonly stage: number; readonly floor: number | undefined } | undefined;

  /**
   * How long a thing that is read stays before the next comes by itself. A browser test makes it
   * long, so a slow machine cannot take it away while the test is still looking.
   */
  stayMs = STAY_MS;

  constructor(private readonly deps: ReaderDeps) {
    this.screen = deps.makeScreen({
      start: () => this.start(),
      levels: () => this.levels(),
      home: () => this.home(),
      play: (stage) => this.play(stage),
      touch: (at) => this.touch(at),
      help: () => this.help(),
      hear: () => this.hear(),
      show: () => this.show(),
      approve: () => this.approved(),
      again: () => this.again(),
      skip: () => this.skip(),
      next: () => this.next(),
      another: () => this.start(),
      close: () => this.close(),
    });
  }

  /** Whether the screen is up. */
  get busy(): boolean {
    return this.session !== null;
  }

  /** Sits the player down at the home screen. It is never put over itself. */
  open(): Started {
    if (this.session) return 'busy';
    if (!this.deps.settings().on) return 'off';
    this.deps.rest.freeze();
    this.forgetStaleChoice();
    const read = totals(this.deps.book.get());
    this.first = read.words === 0 && read.lines === 0;
    this.session = { phase: 'home' };
    if (!this.render()) {
      this.end();
      return 'broke';
    }
    this.quietly(() => this.deps.sounds.open());
    this.say(homeOpening(this.first));
    return 'up';
  }

  /**
   * A parent changed something. With learning off the screen goes away, and what the player read
   * still counts.
   */
  settingsChanged(): void {
    if (this.session && !this.deps.settings().on) this.end();
  }

  /**
   * Takes the screen away and stops everything it was waiting for. For when the game is torn down.
   */
  dispose(): void {
    this.close();
  }

  private home(): void {
    const s = this.session;
    if (!s || s.phase === 'home') return;
    // A round that is left is dropped. What the player read of it is in their book, and what they
    // did not is dealt again.
    this.leave();
    this.session = { phase: 'home' };
    this.render();
  }

  /** The levels, from the home screen or from the end of a round. */
  private levels(): void {
    const s = this.session;
    if (s?.phase !== 'home' && s?.phase !== 'done') return;
    this.leave();
    this.session = { phase: 'map' };
    this.render();
  }

  /**
   * A round from the stage the player is working on, or another of the one they have just played.
   */
  private start(): void {
    const s = this.session;
    if (!s || (s.phase !== 'home' && s.phase !== 'done')) return;
    this.deal(this.round());
  }

  /**
   * A round of the stage the player chose, from the map. Every stage is theirs to choose, and only
   * a number that is no stage is refused.
   */
  private play(n: number): void {
    if (this.session?.phase !== 'map') return;
    const stage = STAGES[n - 1];
    if (!stage) return;
    this.focus = { stage: stage.n, floor: this.deps.book.get().floor };
    this.deal(this.round());
  }

  /**
   * The stage the player is working on, which is the one they chose or else the first they have not
   * cleared.
   */
  private working(profile: LearnerProfile): number {
    return this.focus?.stage ?? currentStage(profile);
  }

  /**
   * A choice that was made when a parent had started the player somewhere else is let go of, so the
   * parent's change is what they see.
   */
  private forgetStaleChoice(): void {
    if (this.focus && this.focus.floor !== this.deps.book.get().floor) this.focus = undefined;
  }

  private round(): Round {
    const profile = this.deps.book.get();
    const stage = this.working(profile);
    return { stage, items: planRound(profile, this.deps.now(), stage), outcomes: [], rewards: [] };
  }

  /**
   * Puts the thing that is next in the round in front of the player, or ends the round when it is
   * all read.
   */
  private deal(round: Round): void {
    if (round.outcomes.length >= round.items.length) {
      this.finish(round);
      return;
    }
    this.leave();
    const at = round.outcomes.length;
    const item = round.items[at]!;
    const turn = ++this.turn;
    this.session = {
      ...roundOf(round),
      phase: 'reading',
      reading: begin(item.kind, touchesOf(item), item.level),
      joined: false,
    };
    if (!this.render()) {
      this.end();
      return;
    }
    const said = [...(at === 0 ? roundOpening() : []), ...itemOpening(item, explained(round, at))];
    this.say(said, this.follow(turn, item));
  }

  /** The last thing of a round is read or skipped. */
  private finish(round: Round): void {
    this.leave();
    this.session = { ...roundOf(round), phase: 'done' };
    this.render();
    const read = round.outcomes.filter((outcome) => outcome === 'read').length;
    this.quietly(() => this.deps.sounds.round(read));
    this.after('praise', PRAISE_AFTER_MS, () => this.say(roundDone()));
  }

  /**
   * What the voice is saying is turned into marks for the screen to light, and a voice that was for
   * a thing that has gone is ignored.
   */
  private follow(turn: number, item: ReadItem): (clip: ClipId, seconds: number, delay: number) => void {
    const tiles = item.kind === 'word' ? item.word.tiles.map(tileClip) : [];
    let cursor = 0;
    return (clip, seconds, delay) => {
      const s = this.session;
      if (turn !== this.turn || !s || (s.phase !== 'reading' && s.phase !== 'found')) return;
      if (clip === itemClip(item)) return this.cue({ kind: 'voiced', marks: this.marksOf(item, seconds, delay) });
      const at = tiles.indexOf(clip, cursor);
      if (at < 0) return;
      cursor = at + 1;
      this.cue({ kind: 'voiced', marks: [{ at, after: delay, seconds }] });
    };
  }

  /**
   * When each piece is lit while the whole is said: the whole at once for a word, and each word as
   * it is said for a sentence.
   */
  private marksOf(item: ReadItem, seconds: number, delay: number): Mark[] {
    if (item.kind === 'word') return [{ at: null, after: delay, seconds }];
    const spans = timesOf(idOf(item), item.line.words.length) ?? evenSpans(wordsOfLine(item.line.text), seconds);
    return spans.map(([from, to], at) => ({ at, after: delay + from, seconds: to - from }));
  }

  private touch(at: number): void {
    const s = this.session;
    if (s?.phase !== 'reading') return;
    const { reading, result } = touch(s.reading, at);
    if (result === 'ignored') return;
    const item = itemOf(s);
    this.session = { ...s, reading };
    if (result === 'slip') {
      this.quietly(() => this.deps.sounds.bounce());
      if (reading.hints > s.reading.hints) this.quietly(() => this.deps.sounds.hint());
      this.cue({ kind: 'bounced', at });
      return;
    }
    // A tile says its sound, again when it is touched again. A word of a sentence only ticks, since
    // saying it would read the sentence for the player.
    const clip = item.kind === 'word' ? tileClip(item.word.tiles[at]!) : null;
    if (clip && this.deps.voice.audible) this.say([clip]);
    else this.quietly(() => this.deps.sounds.tile(at, reading.units));
    this.cue({ kind: result === 'again' ? 'again' : 'touched', at });
    if (result === 'last') this.after('join', JOIN_AFTER_MS, () => this.join());
  }

  /** The pieces come together, and the player is asked to say it. */
  private join(): void {
    const s = this.session;
    if (s?.phase !== 'reading') return;
    const item = itemOf(s);
    this.session = { ...s, joined: true };
    this.quietly(() => this.deps.sounds.join());
    this.cue({ kind: 'joined' });
    this.say(joined(s.reading, item, this.first), this.follow(this.turn, item));
  }

  private help(): void {
    const s = this.session;
    if (s?.phase !== 'reading') return;
    const reading = help(s.reading);
    if (reading === s.reading) return;
    this.session = { ...s, reading };
    this.quietly(() => this.deps.sounds.hint());
    this.render();
  }

  /**
   * The player asked to hear it. A word that was said already costs nothing, and anything else is
   * help.
   */
  private hear(): void {
    const s = this.session;
    if (s?.phase !== 'reading' || s.reading.phase !== 'saying' || !this.deps.voice.audible) return;
    const reading = hear(s.reading);
    const item = itemOf(s);
    if (reading !== s.reading) {
      this.session = { ...s, reading };
      this.quietly(() => this.deps.sounds.hint());
    }
    this.say([itemClip(item)], this.follow(this.turn, item));
  }

  /**
   * The player asked to be shown how a word sounds out: each tile says its sound, and then the
   * word.
   */
  private show(): void {
    const s = this.session;
    if (s?.phase !== 'reading') return;
    const reading = show(s.reading);
    if (reading === s.reading) return;
    this.session = { ...s, reading };
    this.quietly(() => this.deps.sounds.hint());
    this.demonstrate(itemOf(s), []);
  }

  /**
   * Shows how a thing is read, and asks the player to say it. A word is sounded out tile by tile
   * and then said, and a sentence is read to them word by word. Without a voice the tiles of a word
   * are lit in turn and make a note each, and a sentence has nothing to show. `before` is said
   * first.
   */
  private demonstrate(item: ReadItem, before: readonly ClipId[]): void {
    if (!this.deps.voice.audible) {
      item.kind === 'word' ? this.lightInTurn(item.word.tiles.length) : undefined;
      return;
    }
    const sounds =
      item.kind === 'word' ? item.word.tiles.map(tileClip).filter((clip): clip is ClipId => clip !== null) : [];
    const ask = item.kind === 'word' ? PROMPTS.say.id : PROMPTS.together.id;
    this.say([...before, ...sounds, itemClip(item), ask], this.follow(this.turn, item));
  }

  /**
   * A demonstration for when nothing can be heard: each tile is lit for a moment in turn, and then
   * the whole word.
   */
  private lightInTurn(tiles: number): void {
    const marks: Mark[] = Array.from({ length: tiles }, (_, at) => ({
      at,
      after: at * LIGHT_EVERY,
      seconds: LIGHT_FOR,
    }));
    marks.push({ at: null, after: tiles * LIGHT_EVERY + 0.1, seconds: LIGHT_FOR + 0.3 });
    this.cue({ kind: 'voiced', marks });
  }

  /**
   * The player said it out loud and tapped the tick. It counts once the pieces have joined and they
   * have been asked to say it, and not before.
   */
  private approved(): void {
    const s = this.session;
    if (s?.phase !== 'reading' || s.reading.phase !== 'saying' || !s.joined) return;
    this.complete(s, approve(s.reading));
  }

  /**
   * The player asked for once more. The first time it is shown to them, and the second time it is
   * told to them.
   */
  private again(): void {
    const s = this.session;
    if (s?.phase !== 'reading' || s.reading.phase !== 'saying' || !s.joined) return;
    const reading = askAgain(s.reading);
    if (reading.phase === 'done') {
      this.complete(s, reading);
      return;
    }
    this.session = { ...s, reading };
    this.quietly(() => this.deps.sounds.hint());
    this.cue({ kind: 'asked' });
    this.demonstrate(itemOf(s), askedAgain());
  }

  /**
   * The player goes on without reading this one. It is left as it was in their book, and it will
   * come round again.
   */
  private skip(): void {
    const s = this.session;
    if (s?.phase === 'found') {
      this.next();
      return;
    }
    if (s?.phase !== 'reading') return;
    this.deal({ ...roundOf(s), outcomes: [...s.outcomes, 'skipped'] });
  }

  /**
   * The thing is read, or told to the player. The book has it at once, and the screen celebrates
   * it.
   */
  private complete(s: Doing, reading: Reading): void {
    const item = itemOf(s);
    const { profile, reward } = finishItem(this.deps.book.get(), item, attemptOf(reading), this.deps.now());
    this.deps.book.set(profile);
    this.first = false;
    this.stop('join');
    const said = reading.ending === 'told' ? told(item) : praise(reward, this.deps.random);
    this.session = {
      ...roundOf(s),
      outcomes: [...s.outcomes, 'read'],
      rewards: [...s.rewards, reward],
      phase: 'found',
      reading,
      reward,
      said,
    };
    this.render();
    this.quietly(() => this.deps.sounds.found(reward.clean, reward.reads));
    if (reward.cleared !== null) this.quietly(() => this.deps.sounds.cleared(reward.chapter !== null));
    const turn = this.turn;
    this.after('praise', PRAISE_AFTER_MS, () => this.say(said, this.follow(turn, item)));
    const extra = (reward.reads ? READS_EXTRA_MS : 0) + (reward.cleared !== null ? CLEARED_EXTRA_MS : 0);
    this.after('next', this.stayMs + extra, () => this.next());
  }

  /** The thing is read and the player is ready to go on, or the time to stay on it is up. */
  private next(): void {
    const s = this.session;
    if (s?.phase !== 'found') return;
    this.deal(roundOf(s));
  }

  /**
   * The player closed the screen. The thing they were on is left as it was, and what they read
   * stays read.
   */
  private close(): void {
    if (this.session) this.end();
  }

  /** Takes the screen away and lets the world go. */
  private end(): void {
    this.leave();
    this.session = null;
    this.quietly(() => this.screen.close());
    this.deps.rest.thaw();
  }

  /** Whatever was being said or waited for belongs to a thing that is over. */
  private leave(): void {
    for (const name of TIMERS) this.stop(name);
    this.quietly(() => this.deps.voice.stop());
  }

  private cue(happening: Happening): void {
    this.render({ ...happening, n: ++this.cues });
  }

  /** Draws the view, with a cue that is shown once. False when the screen would not draw it. */
  private render(cue: Cue | null = null): boolean {
    const view = this.view(cue);
    if (view === null) return true;
    try {
      this.screen.show(view);
      return true;
    } catch (error) {
      this.deps.report?.(error);
      return false;
    }
  }

  private view(cue: Cue | null): ReadView | null {
    const s = this.session;
    if (!s) return null;
    const profile = this.deps.book.get();
    const states = courseState(profile);
    const current = currentStage(profile);
    const working = this.working(profile);
    const speech = this.deps.voice.audible;
    const stageAt = (n: number): StageView => stageView(states[n - 1]!, current);
    if (s.phase === 'home') {
      const read = totals(profile);
      const home: HomeView = {
        screen: 'home',
        stage: stageAt(working),
        chosen: working !== current,
        chapter: chapterAt(working).title,
        words: read.words,
        reads: read.reads,
        lines: read.lines,
        treasure: treasureOf(states.filter((state) => state.won).map((state) => state.stage.n)),
        firstEver: this.first,
        caption: captionOf(homeOpening(this.first)),
        speech,
      };
      return home;
    }
    if (s.phase === 'map') {
      const chapters: ChapterView[] = CHAPTERS.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        stages: states.filter((state) => state.stage.chapter === chapter.id).map((state) => stageView(state, current)),
      }));
      const map: MapView = { screen: 'map', chapters, current, picked: working };
      return map;
    }
    return s.phase === 'done'
      ? this.doneView(s, stageAt(s.stage), speech)
      : this.itemView(s, stageAt(s.stage), speech, cue);
  }

  private doneView(s: Finished, stage: StageView, speech: boolean): DoneView {
    const chapter = [...s.rewards].reverse().find((reward) => reward.chapter !== null)?.chapter;
    const cleared = s.rewards.reduce<number | null>((last, reward) => reward.cleared ?? last, null);
    return {
      screen: 'done',
      bands: this.bands(s),
      read: s.outcomes.filter((outcome) => outcome === 'read').length,
      fresh: s.rewards.filter((reward) => reward.fresh).length,
      caption: captionOf(roundDone()),
      stage,
      cleared,
      prize: cleared === null ? null : prizeOf(cleared),
      chapter: chapter ? chapter.title : null,
      everything: s.rewards.some((reward) => reward.everything),
      speech,
    };
  }

  private itemView(s: Doing | Celebrating, stage: StageView, speech: boolean, cue: Cue | null): ItemView {
    const item = itemOf(s);
    const word = item.kind === 'word';
    const { reading } = s;
    const found = s.phase === 'found';
    const saying = !found && reading.phase === 'saying';
    const joinedUp = s.phase === 'reading' && s.joined;
    const caption = found
      ? praiseCaption(s.said)
      : saying
        ? captionOf(joined(reading, item, false))
        : captionOf([word ? PROMPTS.touch.id : PROMPTS.words.id]);
    return {
      screen: 'item',
      deal: this.turn,
      kind: item.kind,
      pieces: piecesOf(item),
      touched: reading.next,
      glowing: found ? null : glowing(reading),
      phase: found ? 'found' : saying ? 'saying' : 'touching',
      caption,
      bands: this.bands(s),
      stage,
      chapter: chapterAt(stage.n).title,
      canHelp: !found && reading.phase === 'touching' && !reading.rung.lights && !reading.helped,
      canHear: saying && speech,
      canShow: saying && word,
      canApprove: saying && joinedUp,
      canAskAgain: saying && joinedUp,
      speech,
      hint: saying && this.first ? PROMPTS.tick.text : null,
      earned: s.phase === 'found' ? this.earned(s) : null,
      cue,
    };
  }

  private earned(s: Celebrating): Earned {
    const { reward } = s;
    return {
      text: praiseCaption(s.said),
      told: s.reading.ending === 'told',
      clean: reward.clean,
      reads: reward.reads,
      cleared: reward.cleared,
      prize: reward.cleared === null ? null : prizeOf(reward.cleared),
      chapter: reward.chapter ? reward.chapter.title : null,
      everything: reward.everything,
    };
  }

  /** The seven bands of the round: what each was, and which is the one the player is on. */
  private bands(s: Round & { readonly phase: Session['phase'] }): Band[] {
    return s.items.map((_, at): Band => {
      const outcome = s.outcomes[at];
      if (outcome === 'read') return 'read';
      if (outcome === 'skipped') return 'skipped';
      return s.phase === 'reading' && at === s.outcomes.length ? 'now' : 'ahead';
    });
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

  /**
   * Says clips. A list with nothing in it says nothing, and does not cut off what is being said.
   */
  private say(clips: readonly ClipId[], began?: (clip: ClipId, seconds: number, delay: number) => void): void {
    if (clips.length > 0) this.quietly(() => this.deps.voice.say(clips, began));
  }

  /**
   * Sound, voice and the screen's own drawing sit outside the reading, and none of them can stop
   * it.
   */
  private quietly(run: () => void): void {
    try {
      run();
    } catch (error) {
      this.deps.report?.(error);
    }
  }
}
