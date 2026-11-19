import {
  type Facts,
  factsOf,
  NOTHING_YET,
  newlyEarned,
  STICKERS,
  type Standing,
  type StickerDef,
  TAPPED,
} from '../content/stickers';
import { UNICORN_DEFS } from '../content/unicorns';
import { isWonder } from '../content/wonders';
import type { DomainEvent, World } from '../domain';
import { type LearnerProfile, tally } from '../learning';
import type { AlbumModel } from '../persistence/album';
import { dayOf, earned, noted } from '../shared/album';
import type { PlayRecord } from '../shared/play';
import type { AlbumPort } from './ports';

/** What the learner's books say, which is the part of `Standing` that is not about the world. */
export type LearnerStanding = Pick<
  Standing,
  'words' | 'allWords' | 'sentences' | 'mathsRounds' | 'memoryGames' | 'memoryPairs'
>;

export const NO_LEARNING: LearnerStanding = {
  words: NOTHING_YET.words,
  allWords: NOTHING_YET.allWords,
  sentences: NOTHING_YET.sentences,
  mathsRounds: NOTHING_YET.mathsRounds,
  memoryGames: NOTHING_YET.memoryGames,
  memoryPairs: NOTHING_YET.memoryPairs,
};

/** How far the player has come in the spell book, the reading table and the two games. */
export function learnerStanding(profile: LearnerProfile, play: PlayRecord, now: number): LearnerStanding {
  const book = tally(profile, now);
  const won = Object.entries(play.memory.sizes).filter(([, size]) => size.wins > 0);
  return {
    words: book.collected,
    allWords: book.total > 0 && book.collected === book.total,
    sentences: Object.keys(profile.sentences ?? {}).length,
    mathsRounds: play.maths.played,
    memoryGames: play.memory.played,
    memoryPairs: Math.max(0, ...won.map(([pairs]) => Number(pairs))),
  };
}

/** Counts that only say that a thing has happened, so a second time adds nothing. */
const ONCE: ReadonlySet<string> = new Set(['swim', 'castle-grand']);

/**
 * What an event in the world is worth a count of, if anything. The counts are the ones `COUNTED`
 * lists, which the sticker rules wait on.
 */
function countOf(e: DomainEvent, world: World): string | null {
  switch (e.type) {
    case 'cast-released':
      return `cast:${UNICORN_DEFS[e.unicornId].magic}`;
    case 'produce-collected':
      return `produce:${e.produce}`;
    case 'critter-poked':
      return `poke:${e.kind}`;
    // A unicorn going into water throws a dive of spray, which is what a splash is.
    case 'effect':
      return e.effect === 'dive' ? 'swim' : null;
    case 'prop-changed': {
      const saved = world.persistent.props[e.instanceId];
      return saved?.kind === 'castle' && saved.stage === 3 ? 'castle-grand' : null;
    }
    case 'prop-activity': {
      const toy = e.activity === 'delight' ? world.interactables.get(e.instanceId)?.definitionId : undefined;
      if (toy === undefined) return null;
      return toy === 'present' ? 'presents' : TAPPED.includes(toy) ? `tap:${toy}` : null;
    }
    case 'minigame-started':
      return isWonder(e.game) ? `wonder:${e.game}` : null;
    default:
      return null;
  }
}

/** What else can earn a sticker without being counted: a place entered, or a friend found. */
const changesStanding = (e: DomainEvent): boolean => e.type === 'map-entered' || e.type === 'friend-recruited';

export interface AlbumDeps {
  model: AlbumModel;
  /** The world on the screen now. */
  world: () => World;
  now: () => number;
  /**
   * The player already has a game on this device. What the book finds the first time it looks is
   * not news to them, so it is put in without a fuss.
   */
  settled: boolean;
}

type Hearer = (stickers: readonly StickerDef[]) => void;

/**
 * Where what the player does becomes stickers. It counts what the world says happened, looks at
 * what the world and the learner's books say, and when a sticker's facts have all been reached it
 * goes into the album and whoever listens is told. Nothing is ever taken away, and nothing here can
 * fail the player: a sticker comes by itself.
 */
export class AlbumSession implements AlbumPort {
  private learner: LearnerStanding = NO_LEARNING;
  private begun = false;
  private readonly hearers = new Set<Hearer>();
  private readonly news = new Set<string>();

  constructor(private readonly deps: AlbumDeps) {}

  /** The learner's books, as they are now, once the game is up. The first look is made here. */
  begin(learner: LearnerStanding): void {
    this.learner = learner;
    const first = !this.begun;
    this.begun = true;
    this.look(this.deps.world(), null, first && this.deps.settled && this.deps.model.untouched);
  }

  /** The learner's books changed. */
  learned(learner: LearnerStanding): void {
    this.learner = learner;
    if (this.begun) this.look(this.deps.world(), null, false);
  }

  event(e: DomainEvent, world: World): void {
    if (!this.begun) return;
    const name = countOf(e, world);
    if (name === null && !changesStanding(e)) return;
    this.look(world, name, false);
  }

  /** Something happened that the world does not say, such as a game seen through to its finale. */
  note(name: string): void {
    if (this.begun) this.look(this.deps.world(), name, false);
  }

  /** Calls `hearer` with the stickers just earned, and says how to stop. */
  onEarned(hearer: Hearer): () => void {
    this.hearers.add(hearer);
    return () => this.hearers.delete(hearer);
  }

  /** The days the stickers the player has were earned, by id. */
  got(): Readonly<Record<string, number>> {
    return this.deps.model.get().got;
  }

  /** The stickers earned this visit that the book has not shown the player yet. */
  unseen(): ReadonlySet<string> {
    return this.news;
  }

  /** The book showed these stickers to the player. */
  seen(ids: readonly string[]): void {
    for (const id of ids) this.news.delete(id);
  }

  /** How many of the stickers there are the player has. */
  have(): number {
    return STICKERS.filter((s) => Object.hasOwn(this.got(), s.id)).length;
  }

  /** Every fact there is, as it stands, for the book to say how far the player is to a sticker. */
  facts(): Facts {
    return this.factsIn(this.deps.world(), this.deps.model.get().counts);
  }

  private factsIn(world: World, counts: Facts): Facts {
    const { recruited, visitedMaps } = world.persistent;
    return factsOf(counts, { ...this.learner, recruited, visited: visitedMaps });
  }

  private look(world: World, name: string | null, quiet: boolean): void {
    const { model } = this.deps;
    let record = model.get();
    if (name !== null && !(ONCE.has(name) && (record.counts[name] ?? 0) > 0)) record = noted(record, name);
    const fresh = newlyEarned(this.factsIn(world, record.counts), record.got);
    if (fresh.length > 0)
      record = earned(
        record,
        fresh.map((s) => s.id),
        dayOf(this.deps.now()),
      );
    model.set(record);
    if (fresh.length === 0 || quiet) return;
    for (const sticker of fresh) this.news.add(sticker.id);
    for (const hearer of [...this.hearers]) hearer(fresh);
  }
}
