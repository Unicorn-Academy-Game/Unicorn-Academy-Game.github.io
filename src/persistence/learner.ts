import { emptyProfile, type LearnerProfile, mergeProfiles, readProfile, sameProfile } from '../learning';
import { realClock, type SaveClock } from './save-service';
import { WRITE_DELAY_MS } from './settings';
import type { LocalStore } from './store';

/**
 * What the book needs of the device: reading it, writing it, clearing it, and keeping a copy of
 * what could not be read.
 */
export type LearnerStore = Pick<LocalStore, 'learner' | 'updateLearner' | 'clearLearner' | 'quarantine'>;

export type LearnerListener = (profile: LearnerProfile) => void;

/** Told that where the book is going may have changed. What it changed to is `keeping()`. */
export type KeepingListener = () => void;

/**
 * Why the book is not being written to the device. A newer version of the game wrote what is there,
 * or the device would not give it up.
 */
export type Locked = 'newer' | 'unreadable';

/**
 * Where what the player learns is going: onto the device, no further than this page, or nowhere
 * because the record is locked.
 */
export type Keeping = 'device' | 'page' | Locked;

/** A stored record that could not be read whole. It is kept before anything is written over it. */
interface Damage {
  raw: unknown;
  /** How many things in it were left out. */
  dropped: number;
}

/** What a load found besides the profile. */
interface Found {
  locked?: Locked;
  damage?: Damage;
}

/**
 * What the player has learned, on this device. It holds the book in memory, tells whoever is
 * watching when it changes, and writes it shortly after. It never writes what it should not:
 *
 * - A write is a merge with what is stored, in one transaction, so a second tab or a stale copy can
 *   never take a word or a star away. Putting two books together loses nothing and gives the same
 *   book whichever comes first.
 * - A record that a newer version of the game wrote is never written over, and neither is one the
 *   device would not give up. The game goes on in memory and says why nothing is kept.
 * - Entries that could not be read are put in the quarantine before the first write replaces the
 *   record.
 * - A device that cannot store it, or has no storage at all, holds the book until the page closes.
 */
export class LearnerModel {
  private current: LearnerProfile;
  private dirty = false;
  private cancel: (() => void) | null = null;
  private writing: Promise<void> = Promise.resolve();
  private locked: Locked | null;
  private damage: Damage | null;
  private readonly listeners = new Set<LearnerListener>();
  private readonly watchers = new Set<KeepingListener>();

  constructor(
    initial: LearnerProfile,
    private readonly store: LearnerStore | null,
    private readonly clock: Pick<SaveClock, 'later' | 'now'> = realClock,
    found: Found = {},
  ) {
    this.current = initial;
    this.locked = found.locked ?? null;
    this.damage = found.damage ?? null;
  }

  /** Reads what is stored, or starts an empty book when there is no storage or nothing in it. */
  static async load(store: LearnerStore | null, clock?: Pick<SaveClock, 'later' | 'now'>): Promise<LearnerModel> {
    if (!store) return new LearnerModel(emptyProfile(), null, clock);
    let raw: unknown;
    try {
      raw = await store.learner();
    } catch {
      // What cannot be read cannot be told from a book that is there, so nothing is written over
      // it.
      return new LearnerModel(emptyProfile(), store, clock, { locked: 'unreadable' });
    }
    const read = readProfile(raw);
    if (read.newer) return new LearnerModel(emptyProfile(), store, clock, { locked: 'newer' });
    return new LearnerModel(
      read.profile,
      store,
      clock,
      read.dropped > 0 ? { damage: { raw, dropped: read.dropped } } : {},
    );
  }

  get(): LearnerProfile {
    return this.current;
  }

  /**
   * Where the book is going now. A device that cannot store it, and a copy made for a visit, hold
   * it until the page closes. A locked book can change at any moment, since a write can find a
   * newer record, so this is read when it is needed.
   */
  keeping(): Keeping {
    return this.locked ?? (this.store ? 'device' : 'page');
  }

  /**
   * Calls `listener` when a write finds the record locked, which is the one way `keeping()` changes
   * after the book is loaded. Returns a way to stop.
   */
  watchKeeping(listener: KeepingListener): () => void {
    this.watchers.add(listener);
    return () => void this.watchers.delete(listener);
  }

  /**
   * A copy that holds the same book and never writes it, for a visit that must leave the device as
   * it found it.
   */
  detached(): LearnerModel {
    return new LearnerModel(this.current, null, this.clock);
  }

  /**
   * Calls `listener` after every change to the book, not for the book that is already there.
   * Returns a way to stop.
   */
  subscribe(listener: LearnerListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /**
   * Makes `next` the book. The engine builds it from `get()`, so it is the book the player had with
   * what they just did added.
   */
  set(next: LearnerProfile): void {
    if (sameProfile(next, this.current)) return;
    this.current = next;
    this.tell();
    this.schedule();
  }

  /**
   * Writes any change that is waiting, now. For when the page is about to go away. Resolves when
   * the write has finished.
   */
  flush(): Promise<void> {
    this.cancel?.();
    this.cancel = null;
    const store = this.store;
    if (!this.dirty || !store || this.locked) return this.writing;
    this.dirty = false;
    const mine = this.current;
    this.writing = this.writing
      .then(() => this.write(store, mine))
      // A failed write leaves the change waiting, so the next change or the next flush tries again.
      .catch(() => {
        this.dirty = true;
      });
    return this.writing;
  }

  /**
   * Starts a new book, as a parent chooses to. The old one is put in the quarantine first, where it
   * can be exported, and the answer is false when that or the clearing did not work, with the book
   * as it was. A book that a newer version wrote is left alone, so the answer is false for it too.
   * `why` is what the parent is told about the old book under Recovery.
   */
  reset(why = 'the spell book, put aside before it was cleared'): Promise<boolean> {
    if (this.locked) return Promise.resolve(false);
    const waiting = this.dirty;
    this.cancel?.();
    this.cancel = null;
    this.dirty = false;
    const done = this.writing.then(async () => {
      if (this.store) {
        try {
          const nothing = !this.damage && sameProfile(this.current, emptyProfile());
          if (!nothing) await this.store.quarantine(this.damage?.raw ?? this.current, why, this.clock.now());
          await this.store.clearLearner();
        } catch {
          if (waiting) this.schedule();
          return false;
        }
      }
      this.damage = null;
      this.current = emptyProfile();
      this.tell();
      return true;
    });
    this.writing = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  }

  private schedule(): void {
    if (!this.store || this.locked) return;
    this.dirty = true;
    this.cancel?.();
    this.cancel = this.clock.later(WRITE_DELAY_MS, () => void this.flush());
  }

  private tell(): void {
    for (const listener of this.listeners) listener(this.current);
  }

  private async write(store: LearnerStore, mine: LearnerProfile): Promise<void> {
    // What could not be read is kept before the record it came from is replaced. If it cannot be
    // kept, nothing is replaced.
    if (this.damage) {
      await store.quarantine(
        this.damage.raw,
        `${this.damage.dropped} things in the spell book could not be read`,
        this.clock.now(),
      );
      this.damage = null;
    }
    // What is written is read back through the same gate that reads the record, so one entry that
    // is not valid costs the player that entry and not the whole write.
    const ours = readProfile(mine).profile;
    const stored = await store.updateLearner((raw) => {
      const read = readProfile(raw);
      return read.newer ? null : mergeProfiles(read.profile, ours);
    });
    if (!stored) {
      // Another tab, running a newer version, wrote the record while this one was open.
      this.locked = 'newer';
      for (const watcher of this.watchers) watcher();
      return;
    }
    // Whatever the other tabs added is now part of this one.
    const together = mergeProfiles(this.current, stored);
    if (sameProfile(together, this.current)) return;
    this.current = together;
    this.tell();
  }
}
