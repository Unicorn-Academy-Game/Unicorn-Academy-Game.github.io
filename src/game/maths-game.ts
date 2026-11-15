import { CHEERS, type ClipId } from '../learning';
import { cheerClip } from '../learning/lines';
import { phraseClip } from '../learning/play/maths/clips';
import { FAMILIES, type Family, familyOf, STRAND_IDS, type StrandId, strandsOf } from '../learning/play/maths/question';
import {
  begin,
  choose,
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
import type { AskView, DoneView, MathsHandlers, MathsScreen, MathsView, PickView } from './maths-ports';
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
  /** What a parent has chosen, as it is now. */
  settings: () => LearningSettings;
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
 * finished earns stars and may take them up a level. It is only ever opened with learning on, and
 * learning turned off takes it away.
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
    if (!this.deps.settings().on) return 'off';
    this.deps.rest.freeze();
    this.stage = { at: 'pick' };
    if (!this.render()) {
      this.end();
      return 'broke';
    }
    this.kit.quietly(() => this.deps.sounds.open());
    if (this.deps.play.get().maths.played < WELCOME_GAMES) this.kit.say([phraseClip('pick')]);
    return 'up';
  }

  /**
   * A parent changed something. With learning off the screen goes away, and what the player earned
   * is kept.
   */
  settingsChanged(): void {
    if (this.stage && !this.deps.settings().on) this.end();
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
    const picked = round.question.choices[at]!;
    this.kit.quietly(() => this.deps.sounds.flip());
    if (result === 'rest') {
      this.stage = { ...s, round, streak: 0 };
      this.kit.quietly(() => this.deps.sounds.nudge());
      this.kit.say([...picked.clips, ...(hinted(round) ? [phraseClip('look-again')] : [])]);
    } else {
      const streak = s.streak + 1;
      this.stage = { ...s, round, streak };
      this.kit.quietly(() => this.deps.sounds.pair(streak));
      this.kit.say([...picked.clips, this.cheer()]);
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
    this.kit.say(round.question.say);
  }

  private finish(round: Round): void {
    const { strand, level, clean } = round;
    const stars = starsFor(clean);
    const record = withRound(this.deps.play.get(), strand, level, clean);
    this.deps.play.set(record);
    this.stage = { at: 'done', strand, level, next: levelOf(record, strand), clean, stars };
    this.render();
    this.kit.quietly(() => this.deps.sounds.finish(stars));
    this.kit.say([phraseClip('done')]);
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

  private hear(): void {
    const s = this.stage;
    if (s?.at === 'ask') this.kit.say(s.round.question.say);
    else if (s?.at === 'pick') this.kit.say([phraseClip('pick')]);
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
    this.kit.say(round.question.say);
  }

  private cheer(): ClipId {
    return cheerClip(CHEERS[Math.min(CHEERS.length - 1, Math.floor(this.deps.random() * CHEERS.length))]!);
  }

  /**
   * Whether the voice is on and can be heard, which is when the screen need not say it all in words
   * and the game waits for the voice.
   */
  private speaking(): boolean {
    return this.deps.settings().say && this.deps.voice.audible;
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
    const speech = this.speaking();
    if (s.at === 'pick') return this.pickView(speech);
    if (s.at === 'ask') return this.askView(s.round, s.serial, speech);
    return this.doneView(s, speech);
  }

  private pickView(speech: boolean): PickView {
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
      speech,
      caption: 'What shall we play?',
    };
  }

  private askView(round: Round, serial: number, speech: boolean): AskView {
    const { question } = round;
    const right = question.choices[question.answer]!;
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
      speech,
      caption: round.solved
        ? `Yes, ${right.label}.`
        : `Question ${round.index + 1} of ${ROUND_LENGTH}. ${question.prompt}`,
    };
  }

  private doneView(s: Extract<Stage, { at: 'done' }>, speech: boolean): DoneView {
    return {
      kind: 'done',
      strand: s.strand,
      name: STRANDS[s.strand].name,
      level: s.level,
      next: s.next,
      clean: s.clean,
      length: ROUND_LENGTH,
      stars: s.stars,
      speech,
      caption: `Well done! ${s.clean} of ${ROUND_LENGTH} at the first touch, ${s.stars} ${s.stars === 1 ? 'star' : 'stars'}.`,
    };
  }
}
