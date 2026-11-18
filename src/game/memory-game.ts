import { CHEERS, type ClipId, wordClip } from '../learning';
import { cheerClip } from '../learning/lines';
import { MEMORY_DONE_CLIP, MEMORY_START_CLIP } from '../learning/play/clips';
import {
  type Board,
  deal,
  finished,
  found,
  PAIR_SIZES,
  type Pairs,
  settle,
  starsFor,
  startSize,
  turn,
  withGame,
} from '../learning/play/memory';
import type { LearningSettings } from '../shared/learning';
import { type DeskDeps, DeskKit, type Started, WELCOME_GAMES } from './desk';
import type { MemoryHandlers, MemoryScreen, MemoryView, PlayLedger, PlaySounds, WonView } from './play-ports';
import type { Rest } from './ports';

/**
 * Two cards that are not the same stay up this long, which is long enough to see both and hear the
 * second one's word.
 */
export const MISS_STAYS_MS = 1500;
/** The last pair stays up this long, for the cheer, before the game says it is won. */
export const WON_AFTER_MS = 1800;
export interface MemoryDeps extends DeskDeps {
  /** What a parent has chosen, as it is now. */
  settings: () => LearningSettings;
  play: PlayLedger;
  /** A number from 0 up to but not including 1. */
  random: () => number;
  /** Makes the screen. It tells the game what the player does through the handlers it is given. */
  makeScreen: (handlers: MemoryHandlers) => MemoryScreen;
  sounds: PlaySounds;
  /** Holds the world still while the screen is up. */
  rest: Rest;
}

/**
 * A board is being played, or has been won. `streak` is the pairs found in a row, which the sound
 * climbs with.
 */
interface Game {
  readonly deal: number;
  readonly pairs: Pairs;
  readonly board: Board;
  readonly streak: number;
  readonly won: WonView | null;
}

type Timer = 'settle' | 'won';

/**
 * The memory game. The player sits down at the table, gets a board that is dealt at random from all
 * the pictures the game has, and turns two cards at a time. It never says that a try was wrong: two
 * cards that are not the same turn back down, and the voice has said what each one is, so the next
 * look knows more. A game won earns stars, and the next size is offered. It opens whether learning
 * is on or off: the voice is the part that belongs to learning.
 */
export class MemoryGame {
  private readonly screen: MemoryScreen;
  private readonly kit: DeskKit<Timer>;
  private game: Game | null = null;
  /**
   * Counts the boards that have been dealt, so a screen can tell a new board from the same one
   * drawn again.
   */
  private deals = 0;

  constructor(private readonly deps: MemoryDeps) {
    this.kit = new DeskKit(deps);
    this.screen = deps.makeScreen({
      turn: (at) => this.touch(at),
      size: (pairs) => this.size(pairs),
      again: () => this.again(),
      more: () => this.more(),
      hear: () => this.kit.say([MEMORY_START_CLIP]),
      close: () => this.close(),
    });
  }

  /** Whether the screen is up. */
  get busy(): boolean {
    return this.game !== null;
  }

  /**
   * Sits the player down at a board of the size they are ready for. It is never put over itself.
   */
  open(): Started {
    if (this.game) return 'busy';
    this.deps.rest.freeze();
    const record = this.deps.play.get();
    this.deal(startSize(record));
    if (!this.render()) {
      this.end();
      return 'broke';
    }
    this.kit.quietly(() => this.deps.sounds.open());
    if (record.memory.played < WELCOME_GAMES) this.kit.say([MEMORY_START_CLIP]);
    return 'up';
  }

  /** A parent changed something. A screen that is up shows the voice as it is now. */
  settingsChanged(): void {
    if (this.game) this.render();
  }

  /**
   * Takes the screen away and stops everything it was waiting for. For when the game is torn down.
   */
  dispose(): void {
    this.close();
  }

  private touch(at: number): void {
    const g = this.game;
    if (!g || g.won) return;
    const { board, result } = turn(g.board, at);
    if (result === 'ignored') return;
    this.kit.stop('settle');
    const word = board.faces[at]!;
    this.kit.quietly(() => this.deps.sounds.flip());
    if (result === 'first') {
      this.game = { ...g, board };
      this.kit.say([wordClip(word)]);
    } else if (result === 'missed') {
      this.game = { ...g, board, streak: 0 };
      this.kit.quietly(() => this.deps.sounds.nudge());
      this.kit.say([wordClip(word)]);
      this.kit.after('settle', MISS_STAYS_MS, () => this.settle());
    } else {
      const streak = g.streak + 1;
      this.game = { ...g, board, streak };
      this.kit.quietly(() => this.deps.sounds.pair(streak));
      this.kit.say([wordClip(word), this.cheer()]);
      if (finished(board)) this.kit.after('won', WON_AFTER_MS, () => this.win());
    }
    this.render();
  }

  /** The two cards that were not the same turn back down. */
  private settle(): void {
    const g = this.game;
    if (!g) return;
    this.game = { ...g, board: settle(g.board) };
    this.render();
  }

  private win(): void {
    const g = this.game;
    if (!g || g.won || !finished(g.board)) return;
    const record = this.deps.play.get();
    const before = record.memory.sizes[String(g.pairs)];
    const turns = g.board.turns;
    const stars = starsFor(g.pairs, turns);
    const won: WonView = {
      turns,
      stars,
      best: before !== undefined && turns < before.best,
      next: PAIR_SIZES[PAIR_SIZES.indexOf(g.pairs) + 1] ?? null,
    };
    this.deps.play.set(withGame(record, g.pairs, turns));
    this.game = { ...g, won };
    this.render();
    this.kit.quietly(() => this.deps.sounds.finish(stars));
    this.kit.say([MEMORY_DONE_CLIP]);
  }

  /** A new board of this size, from the sizes the player can choose between. */
  private size(pairs: number): void {
    const size = PAIR_SIZES.find((n) => n === pairs);
    if (!this.game || size === undefined) return;
    this.deal(size);
    this.render();
  }

  private again(): void {
    if (this.game?.won) this.size(this.game.pairs);
  }

  private more(): void {
    const next = this.game?.won?.next;
    if (next) this.size(next);
  }

  private close(): void {
    if (this.game) this.end();
  }

  /** Takes the screen away and lets the world go. */
  private end(): void {
    this.kit.leave();
    this.game = null;
    this.kit.quietly(() => this.screen.close());
    this.deps.rest.thaw();
  }

  private deal(pairs: Pairs): void {
    this.kit.leave();
    this.deals += 1;
    this.game = { deal: this.deals, pairs, board: deal(pairs, this.deps.random), streak: 0, won: null };
  }

  private cheer(): ClipId {
    return cheerClip(CHEERS[Math.min(CHEERS.length - 1, Math.floor(this.deps.random() * CHEERS.length))]!);
  }

  /** Draws the view. False when the screen would not draw it. */
  private render(): boolean {
    const g = this.game;
    if (!g) return true;
    const record = this.deps.play.get();
    const view: MemoryView = {
      deal: g.deal,
      pairs: g.pairs,
      cards: g.board.faces.map((word, place) => ({
        word,
        state: g.board.paired[place] ? 'paired' : g.board.up.includes(place) ? 'up' : 'down',
      })),
      sizes: PAIR_SIZES.map((pairs) => ({
        pairs,
        stars: record.memory.sizes[String(pairs)]?.stars ?? 0,
        chosen: pairs === g.pairs,
      })),
      found: found(g.board),
      caption: g.won ? `You found every pair in ${g.won.turns} turns.` : `${found(g.board)} of ${g.pairs} pairs found.`,
      won: g.won,
      speech: this.deps.settings().say && this.deps.voice.audible,
    };
    try {
      this.screen.show(view);
      return true;
    } catch (error) {
      this.deps.report?.(error);
      return false;
    }
  }
}
