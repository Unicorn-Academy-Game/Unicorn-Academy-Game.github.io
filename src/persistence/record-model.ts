import { realClock, type SaveClock } from './save-service';
import { WRITE_DELAY_MS } from './settings';

/**
 * What a record that lives on its own on the device needs to know about itself, so that one model
 * can keep any of them: what an empty one is, how to read what is stored, how to put two together
 * and how to tell that two say the same.
 */
export interface RecordKind<T> {
  empty(): T;
  /**
   * Reads what is stored. `newer` says that a newer version of the game wrote it, which is read as
   * an empty record and is never written over.
   */
  read(raw: unknown): { value: T; newer: boolean };
  merge(a: T, b: T): T;
  same(a: T, b: T): boolean;
}

/** What the model asks of the device for its one record. */
export interface RecordDevice<T> {
  read(): Promise<unknown>;
  /**
   * Reads what is stored, hands it to `change`, and stores what `change` gives back, in one
   * transaction. `change` answers null to leave the record as it is. The answer is what was stored,
   * or null when nothing was.
   */
  update(change: (stored: unknown) => T | null): Promise<T | null>;
  clear(): Promise<void>;
}

/**
 * One record the player keeps on this device, held in memory and written shortly after it changes,
 * the way the spell book is. It never writes what it should not:
 *
 * - A write is a merge with what is stored, in one transaction, so a second tab can never take
 *   something away.
 * - A record that a newer version of the game wrote is never written over. The game goes on in
 *   memory.
 * - A device that cannot store it, or has no storage at all, holds the record until the page
 *   closes.
 *
 * It never leaves the device, and a copy made for a visit holds the same record and writes nothing.
 */
export class RecordModel<T> {
  private current: T;
  private dirty = false;
  private cancel: (() => void) | null = null;
  private writing: Promise<void> = Promise.resolve();
  private locked: boolean;
  private readonly listeners = new Set<(value: T) => void>();

  constructor(
    protected readonly kind: RecordKind<T>,
    initial: T,
    private readonly device: RecordDevice<T> | null,
    protected readonly clock: Pick<SaveClock, 'later'> = realClock,
    locked = false,
    /** Nothing at all was stored, which is not the same as an empty record that was. */
    readonly untouched = false,
  ) {
    this.current = initial;
    this.locked = locked;
  }

  /**
   * Reads what is stored, for a model to start from: an empty record when there is no storage,
   * nothing in it, or it cannot be read. A record that cannot be read cannot be told from one that
   * is there, so it is locked, and nothing is written over it.
   */
  static async fetch<T>(
    kind: RecordKind<T>,
    device: RecordDevice<T> | null,
  ): Promise<{ value: T; locked: boolean; untouched: boolean }> {
    if (!device) return { value: kind.empty(), locked: false, untouched: false };
    let raw: unknown;
    try {
      raw = await device.read();
    } catch {
      return { value: kind.empty(), locked: true, untouched: false };
    }
    const read = kind.read(raw);
    return { value: read.value, locked: read.newer, untouched: raw === undefined };
  }

  get(): T {
    return this.current;
  }

  /** Makes `next` the record. A record that says what it said before is not written. */
  set(next: T): void {
    if (this.kind.same(next, this.current)) return;
    this.current = next;
    this.schedule();
    this.tell();
  }

  /** Calls `listener` whenever the record changes, and says how to stop. */
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Writes any change that is waiting, now. For when the page is about to go away. Resolves when
   * the write has finished.
   */
  flush(): Promise<void> {
    this.cancel?.();
    this.cancel = null;
    const device = this.device;
    if (!this.dirty || !device || this.locked) return this.writing;
    this.dirty = false;
    const mine = this.current;
    this.writing = this.writing
      .then(() => this.write(device, mine))
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
        await this.device?.clear();
      } catch {
        return false;
      }
      this.current = this.kind.empty();
      this.tell();
      return true;
    });
    this.writing = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  }

  private tell(): void {
    for (const listener of [...this.listeners]) listener(this.current);
  }

  private schedule(): void {
    if (!this.device || this.locked) return;
    this.dirty = true;
    this.cancel?.();
    this.cancel = this.clock.later(WRITE_DELAY_MS, () => void this.flush());
  }

  private async write(device: RecordDevice<T>, mine: T): Promise<void> {
    const { kind } = this;
    const stored = await device.update((raw) => {
      const read = kind.read(raw);
      return read.newer ? null : kind.merge(read.value, mine);
    });
    if (!stored) {
      // Another tab, running a newer version, wrote the record while this one was open.
      this.locked = true;
      return;
    }
    // Whatever the other tabs added is now part of this one.
    const joined = kind.merge(this.current, stored);
    if (!kind.same(joined, this.current)) {
      this.current = joined;
      this.tell();
    }
  }
}
