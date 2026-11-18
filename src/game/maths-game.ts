import { CHEERS, type ClipId } from '../learning';
import { cheerClip } from '../learning/lines';
import { phraseClip } from '../learning/play/maths/clips';
import { NUMBER_TOP, numberClip } from '../learning/play/maths/numbers';
import {
  FAMILIES,
  type Family,
  familyOf,
  STRAND_IDS,
  type StrandId,
  strandsOf,
  typedAnswer,
} from '../learning/play/maths/question';
import {
  begin,
  choose,
  enter,
  familyReached,
  finished,
  hinted,
  levelOf,
  next,
  ROUND_LENGTH,
  type Round,
  starsFor,
  withRound,
} from '../learning/play/maths/round';
import { STRANDS } from '../learning/play/maths/strands';
import type { LearningSettings } from '../shared/learning';
import type { MathsLevel } from '../shared/play';
import { type DeskDeps, DeskKit, type Started, WELCOME_GAMES } from './desk';
import type { AskView, DoneView, KeypadView, MathsHandlers, MathsScreen, MathsView, PickView } from './maths-ports';
import type { PlayLedger, PlaySounds } from './play-ports';
import type { Rest } from './ports';

/**
 * A right answer stays on the screen this long when nothing is said, for the gap to fill in and the
 * glow, before the next question comes.
 */
export const NEXT_AFTER_MS = 1400;
/** The same when the voice is on, which says the answer and a cheer first. */
export const NEXT_AFTER_SPOKEN_MS = 2400;
/** The last right answer of a round stays this long before the round says it is done. */
export const DONE_AFTER_MS = 1800;

export interface MathsDeps extends DeskDeps {
  /** What a parent has chosen, as it is now, with the child's two switches at this table. */
  settings: () => LearningSettings;
  /** Changes the child's two switches, which are kept with the settings. */
  setSettings: (patch: Partial<Pick<LearningSettings, 'mathsSay' | 'mathsKeys'>>) => void;
  play: PlayLedger;
  /** A number from 0 up to but not including 1. */
  random: () => number;
  /** Makes the screen. It tells the game what the player does through the handlers it is given. */
  makeScreen: (handlers: MathsHandlers) => MathsScreen;
  sounds: PlaySounds;
  /** Holds the world still while the screen is up. */
  rest: Rest;
}

/**
 * Where the player is: choosing a kind of sum, in the middle of a round (with the right answers in
 * a row, which the sound climbs with), or at the end of one.
 */
type Stage =
  | { readonly at: 'pick' }
  | { readonly at: 'ask'; readonly round: Round; readonly serial: number; readonly streak: number }
  | {
      readonly at: 'done';
      readonly strand: StrandId;
      readonly level: MathsLevel;
      readonly next: MathsLevel;
      readonly clean: number;
      readonly stars: 1 | 2 | 3;
    };

type Timer = 'advance';

/**
 * The maths game. The player sits down at the table and chooses a kind of sum from the tiles, and
 * gets a round of five questions of it at the level they have reached. The tiles are those of one
 * family of levels at a time, Level 0 or Level 1, and they can switch between them. A choice that
 * is not the right one rests, and nothing is said about it: they touch another, and after two the
 * right one shines. The next question comes after the right one is found, and a round that is
 * finished earns stars and may take them up a level. It opens whether learning is on or off: the
 * voice is the part that belongs to learning.
 */
export class MathsGame {
  private readonly screen: MathsScreen;
  private readonly kit: DeskKit<Timer>;
  private stage: Stage | null = null;
  /**
   * The family of levels whose tiles the player is at, once they have sat down. It stays what they
   * chose for as long as the page is open.
   */
  private family: Family | null = null;
  /**
   * Counts the questions asked, so a screen can tell a new question from the same one drawn again.
   */
  private serial = 0;

  constructor(private readonly deps: MathsDeps) {
    this.kit = new DeskKit(deps);
    this.screen = deps.makeScreen({
      family: (level) => this.switchTo(level),
      pick: (strand) => this.pick(strand),
      choose: (at) => this.touch(at),
      enter: (value) => this.typeIn(value),
      tap: () => this.kit.quietly(() => this.deps.sounds.flip()),
      say: (on) => this.switchVoice(on),
      keys: (on) => this.switchKeys(on),
      hear: () => this.hear(),
      again: () => this.again(),
      menu: () => this.menu(),
      close: () => this.close(),
    });
  }

  /** Whether the screen is up. */
  get busy(): boolean {
    return this.stage !== null;
  }

  /** What the screen is showing, or nothing when it is not up. */
  get showing(): MathsView | null {
    return this.stage && this.view(this.stage);
  }

  /** Sits the player down at the tiles. It is never put over itself. */
  open(): Started {
    if (this.stage) return 'busy';
    this.deps.rest.freeze();
    this.stage = { at: 'pick' };
    if (!this.render()) {
      this.end();
      return 'broke';
    }
    this.kit.quietly(() => this.deps.sounds.open());
    if (this.deps.play.get().maths.played < WELCOME_GAMES) this.say([phraseClip('pick')]);
    return 'up';
  }

  /** A parent changed something. A screen that is up shows the voice as it is now. */
  settingsChanged(): void {
    if (this.stage) this.render();
  }

  /**
   * Takes the screen away and stops everything it was waiting for. For when the game is torn down.
   */
  dispose(): void {
    this.close();
  }

  private switchTo(level: Family): void {
    if (this.stage?.at !== 'pick' || !FAMILIES.some((family) => family.level === level) || level === this.inFamily())
      return;
    this.family = level;
    this.render();
  }

  private pick(strand: StrandId): void {
    if (this.stage?.at !== 'pick' || !STRAND_IDS.includes(strand)) return;
    this.start(strand);
  }

  private touch(at: number): void {
    const s = this.stage;
    if (s?.at !== 'ask') return;
    const { round, result } = choose(s.round, at);
    if (result === 'ignored') return;
    this.answered(s, round, result, round.question.choices[at]!.clips);
  }

  /**
   * A number was typed in and sent. It says the number, as a touched choice says its own, and is
   * the answer or rests the same way.
   */
  private typeIn(value: number): void {
    const s = this.stage;
    if (s?.at !== 'ask') return;
    const { round, result } = enter(s.round, value);
    if (result === 'ignored') return;
    this.answered(s, round, result, value <= NUMBER_TOP ? [numberClip(value)] : []);
  }

  /** What happens once an answer, touched or typed, was the right one or one that rests. */
  private answered(
    s: Extract<Stage, { at: 'ask' }>,
    round: Round,
    result: 'right' | 'rest',
    said: readonly ClipId[],
  ): void {
    this.kit.quietly(() => this.deps.sounds.flip());
    if (result === 'rest') {
      this.stage = { ...s, round, streak: 0 };
      this.kit.quietly(() => this.deps.sounds.nudge());
      this.say([...said, ...(hinted(round) ? [phraseClip('look-again')] : [])]);
    } else {
      const streak = s.streak + 1;
      this.stage = { ...s, round, streak };
      this.kit.quietly(() => this.deps.sounds.pair(streak));
      this.say([...round.question.choices[round.question.answer]!.clips, this.cheer()]);
      const wait = finished(round) ? DONE_AFTER_MS : this.speaking() ? NEXT_AFTER_SPOKEN_MS : NEXT_AFTER_MS;
      this.kit.after('advance', wait, () => this.advance());
    }
    this.render();
  }

  /**
   * The next question, or the end of the round, once the right choice has been found and has had
   * its moment.
   */
  private advance(): void {
    const s = this.stage;
    if (s?.at !== 'ask' || !s.round.solved) return;
    if (finished(s.round)) {
      this.finish(s.round);
      return;
    }
    this.serial += 1;
    const round = next(s.round, this.deps.random);
    this.stage = { ...s, round, serial: this.serial };
    this.render();
    this.say(round.question.say);
  }

  private finish(round: Round): void {
    const { strand, level, clean } = round;
    const stars = starsFor(clean);
    const record = withRound(this.deps.play.get(), strand, level, clean);
    this.deps.play.set(record);
    this.stage = { at: 'done', strand, level, next: levelOf(record, strand), clean, stars };
    this.render();
    this.kit.quietly(() => this.deps.sounds.finish(stars));
    this.say([phraseClip('done')]);
  }

  /** Another round of the kind of sum the player just finished, at the level they are at now. */
  private again(): void {
    if (this.stage?.at === 'done') this.start(this.stage.strand);
  }

  private menu(): void {
    if (!this.stage || this.stage.at === 'pick') return;
    this.kit.leave();
    this.stage = { at: 'pick' };
    this.render();
  }

  /** Says clips, unless the child has the voice off at this table. */
  private say(clips: readonly ClipId[]): void {
    if (this.deps.settings().mathsSay) this.kit.say(clips);
  }

  /** The child's switch for the voice: what is being said stops when it is turned off. */
  private switchVoice(on: boolean): void {
    if (!this.stage || this.deps.settings().mathsSay === on) return;
    this.deps.setSettings({ mathsSay: on });
    if (!on) this.kit.quietly(() => this.deps.voice.stop());
    this.render();
  }

  /** The child's switch for the keypad, which takes the choices' place where an answer is a number. */
  private switchKeys(on: boolean): void {
    if (!this.stage || this.deps.settings().mathsKeys === on) return;
    this.deps.setSettings({ mathsKeys: on });
    this.render();
  }

  private hear(): void {
    const s = this.stage;
    if (s?.at === 'ask') this.say(s.round.question.say);
    else if (s?.at === 'pick') this.say([phraseClip('pick')]);
  }

  private close(): void {
    if (this.stage) this.end();
  }

  /** Takes the screen away and lets the world go. */
  private end(): void {
    this.kit.leave();
    this.stage = null;
    this.kit.quietly(() => this.screen.close());
    this.deps.rest.thaw();
  }

  /**
   * The family of levels the player is in: the one they chose, or on their first visit the one they
   * have got furthest in.
   */
  private inFamily(): Family {
    this.family ??= familyReached(this.deps.play.get());
    return this.family;
  }

  private start(strand: StrandId): void {
    this.kit.leave();
    this.family = familyOf(strand);
    this.serial += 1;
    const round = begin(strand, levelOf(this.deps.play.get(), strand), this.deps.random);
    this.stage = { at: 'ask', round, serial: this.serial, streak: 0 };
    this.render();
    this.say(round.question.say);
  }

  private cheer(): ClipId {
    return cheerClip(CHEERS[Math.min(CHEERS.length - 1, Math.floor(this.deps.random() * CHEERS.length))]!);
  }

  /** Whether a parent has the voice on and it can be heard, so that there is a voice to switch. */
  private hasVoice(): boolean {
    return this.deps.settings().say && this.deps.voice.audible;
  }

  /**
   * Whether the voice is on and can be heard, and the child has not turned it off at this table,
   * which is when the screen need not say it all in words and the game waits for the voice.
   */
  private speaking(): boolean {
    return this.hasVoice() && this.deps.settings().mathsSay;
  }

  /** What every view shows of the voice and the keypad. */
  private switches(caption: string): Pick<PickView, 'speech' | 'voice' | 'say' | 'keys' | 'caption'> {
    const { mathsSay, mathsKeys } = this.deps.settings();
    return { speech: this.speaking(), voice: this.hasVoice(), say: mathsSay, keys: mathsKeys, caption };
  }

  /** Draws the view. False when the screen would not draw it. */
  private render(): boolean {
    const view = this.showing;
    if (!view) return true;
    try {
      this.screen.show(view);
      return true;
    } catch (error) {
      this.deps.report?.(error);
      return false;
    }
  }

  private view(s: Stage): MathsView {
    if (s.at === 'pick') return this.pickView();
    if (s.at === 'ask') return this.askView(s.round, s.serial);
    return this.doneView(s);
  }

  private pickView(): PickView {
    const record = this.deps.play.get();
    const family = this.inFamily();
    return {
      kind: 'pick',
      families: FAMILIES.map(({ level, about }) => ({
        level,
        name: `Level ${level}`,
        about,
        chosen: level === family,
      })),
      strands: strandsOf(family).map((id) => ({
        id,
        name: STRANDS[id].name,
        level: levelOf(record, id),
        rounds: record.maths.strands[id]?.rounds ?? 0,
      })),
      ...this.switches('What shall we play?'),
    };
  }

  private askView(round: Round, serial: number): AskView {
    const { question } = round;
    const right = question.choices[question.answer]!;
    const answer = typedAnswer(question);
    const keypad: KeypadView | null =
      answer !== null && this.deps.settings().mathsKeys ? { answer: String(answer), misses: round.typed } : null;
    return {
      kind: 'ask',
      strand: round.strand,
      name: STRANDS[round.strand].name,
      level: round.level,
      serial,
      index: round.index,
      length: ROUND_LENGTH,
      question,
      rested: round.rested,
      solved: round.solved,
      hint: hinted(round),
      keypad,
      ...this.switches(
        round.solved ? `Yes, ${right.label}.` : `Question ${round.index + 1} of ${ROUND_LENGTH}. ${question.prompt}`,
      ),
    };
  }

  private doneView(s: Extract<Stage, { at: 'done' }>): DoneView {
    return {
      kind: 'done',
      strand: s.strand,
      name: STRANDS[s.strand].name,
      level: s.level,
      next: s.next,
      clean: s.clean,
      length: ROUND_LENGTH,
      stars: s.stars,
      ...this.switches(
        `Well done! ${s.clean} of ${ROUND_LENGTH} at the first touch, ${s.stars} ${s.stars === 1 ? 'star' : 'stars'}.`,
      ),
    };
  }
}
