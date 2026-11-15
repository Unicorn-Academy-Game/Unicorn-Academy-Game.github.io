import { emptyPlay, mergePlay, type PlayRecord, readPlay, samePlay } from '../shared/play';
import { realClock, type SaveClock } from './save-service';
import { WRITE_DELAY_MS } from './settings';
import type { LocalStore } from './store';

/**
 * What the tables need of the device: reading what the player has done, writing it, and clearing
 * it.
 */
export type PlayStore = Pick<LocalStore, 'play' | 'updatePlay' | 'clearPlay'>;

/**
 * What the player has done at the memory and maths tables, on this device. It holds the record in
 * memory and writes it shortly after it changes, the way the spell book does, and it never writes
 * what it should not:
 *
 * - A write is a merge with what is stored, in one transaction, so a second tab can never take a
 *   star away.
 * - A record that a newer version of the game wrote is never written over. The game goes on in
 *   memory.
 * - A device that cannot store it, or has no storage at all, holds the record until the page
 *   closes.
 *
 * It never leaves the device, and a copy made for a visit holds the same record and writes nothing.
 */
export class PlayModel {
  private current: PlayRecord;
  private dirty = false;
  private cancel: (() => void) | null = null;
  private writing: Promise<void> = Promise.resolve();
  private locked: boolean;

  constructor(
    initial: PlayRecord,
    private readonly store: PlayStore | null,
    private readonly clock: Pick<SaveClock, 'later'> = realClock,
    locked = false,
  ) {
    this.current = initial;
    this.locked = locked;
  }

  /**
   * Reads what is stored, or starts an empty record when there is no storage, nothing in it, or it
   * cannot be read.
   */
  static async load(store: PlayStore | null, clock?: Pick<SaveClock, 'later'>): Promise<PlayModel> {
    if (!store) return new PlayModel(emptyPlay(), null, clock);
    let raw: unknown;
    try {
      raw = await store.play();
    } catch {
      // What cannot be read cannot be told from a record that is there, so nothing is written over
      // it.
      return new PlayModel(emptyPlay(), store, clock, true);
    }
    const read = readPlay(raw);
    return new PlayModel(read.play, store, clock, read.newer);
  }

  get(): PlayRecord {
    return this.current;
  }

  /** Makes `next` the record. A record that says what it said before is not written. */
  set(next: PlayRecord): void {
    if (samePlay(next, this.current)) return;
    this.current = next;
    this.schedule();
  }

  /**
   * A copy that holds the same record and never writes it, for a visit that must leave the device
   * as it found it.
   */
  detached(): PlayModel {
    return new PlayModel(this.current, null, this.clock);
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
   * Starts again, as a parent chooses to. The answer is false when the clearing did not work or the
   * record is a newer version's, and the record is as it was.
   */
  reset(): Promise<boolean> {
    if (this.locked) return Promise.resolve(false);
    this.cancel?.();
    this.cancel = null;
    this.dirty = false;
    const done = this.writing.then(async () => {
      try {
        await this.store?.clearPlay();
      } catch {
        return false;
      }
      this.current = emptyPlay();
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

  private async write(store: PlayStore, mine: PlayRecord): Promise<void> {
    const stored = await store.updatePlay((raw) => {
      const read = readPlay(raw);
      return read.newer ? null : mergePlay(read.play, mine);
    });
    if (!stored) {
      // Another tab, running a newer version, wrote the record while this one was open.
      this.locked = true;
      return;
    }
    // Whatever the other tabs added is now part of this one.
    this.current = mergePlay(this.current, stored);
  }
}
