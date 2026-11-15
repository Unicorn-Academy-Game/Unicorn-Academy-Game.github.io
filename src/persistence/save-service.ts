import { type SaveReason, toSave, type World } from '../domain';
import type { SavePort } from '../game/ports';
import type { WorldSaveV1 } from '../shared/save';
import { type LocalStore, requestPersistence, StoreError } from './store';

/**
 * Where a commit goes: the device's store, or the note a visit keeps in its tab. A sink that is not
 * on the disk says so, and then the browser is not asked to protect it.
 */
export type SaveSink =
  | Pick<LocalStore, 'commit'>
  | { commit(save: WorldSaveV1, reason: string, now: number): Promise<void>; readonly durable: false };

export type SaveStatus =
  /** Nothing to write yet. */
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: number }
  /** The last write failed. The game keeps going from memory and the parent is told. */
  | { state: 'failed'; kind: 'quota' | 'unavailable' | 'error'; message: string };

export interface SaveClock {
  now(): number;
  /** Runs `fn` after `ms`, returns a way to cancel. */
  later(ms: number, fn: () => void): () => void;
}

export const realClock: SaveClock = {
  now: () => Date.now(),
  later: (ms, fn) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

/** Waits before trying again after a failed write, longer each time, with a little spread. */
const RETRY_MS = [3_000, 8_000, 20_000, 60_000] as const;

/**
 * How long a write may take, in milliseconds, before it is called failed. A write takes a few. A
 * device that has not answered in this time has stopped, and a loop that went on waiting would hold
 * every later save, and every change of place that waits for one, behind it for ever.
 */
export const COMMIT_PATIENCE_MS = 15_000;

/**
 * Turns the game's "something worth saving happened" requests into local commits. It coalesces
 * bursts, never blocks the game, and reports honestly: the status only says `saved` after the
 * transaction finished.
 *
 * `store` may be null when the browser has no usable storage. The game still runs from memory and
 * the status says so.
 */
export class SaveService implements SavePort {
  private latest: World | null = null;
  private dirty = false;
  private reason: SaveReason | 'flush' = 'position';
  private running: Promise<void> | null = null;
  private cancelRetry: (() => void) | null = null;
  private failures = 0;
  private persistAsked = false;
  private listeners = new Set<(status: SaveStatus) => void>();
  private retired = false;
  private current: SaveStatus;

  constructor(
    private readonly store: SaveSink | null,
    private readonly clock: SaveClock = realClock,
    private readonly newId: () => string = () => crypto.randomUUID(),
    unavailable?: StoreError,
  ) {
    this.current = store
      ? { state: 'idle' }
      : {
          state: 'failed',
          kind: 'unavailable',
          message: unavailable?.message ?? 'This browser has no storage for saves.',
        };
  }

  get status(): SaveStatus {
    return this.current;
  }

  subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /**
   * Stops writing for good. A parent action that replaces the world uses this just before the page
   * restarts onto the new one, so the game's memory cannot be written over what was installed.
   */
  retire(): void {
    this.retired = true;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  request(reason: SaveReason, world: World): void {
    if (this.retired) return;
    this.latest = world;
    this.dirty = true;
    if (reason !== 'position' || this.reason === 'position') this.reason = reason;
    // After a failure the retry timer owns the next attempt, so a moving unicorn does not hammer a
    // full disk.
    if (!this.cancelRetry) void this.kick();
  }

  /** Writes now and resolves once the newest state is on disk, or has failed. Never rejects. */
  async flush(world: World): Promise<void> {
    if (this.retired) return;
    this.latest = world;
    this.dirty = true;
    this.reason = 'flush';
    this.cancelRetry?.();
    this.cancelRetry = null;
    await this.kick();
  }

  /**
   * Called when the page is about to be hidden. The write may not finish, but starting it is cheap.
   */
  hide(): Promise<void> {
    return this.latest ? this.flush(this.latest) : Promise.resolve();
  }

  /**
   * Resolves once whatever is being written has been written, without asking for anything new to
   * be.
   */
  async idle(): Promise<void> {
    await this.running;
  }

  /**
   * Starts the write loop unless one is running, and resolves when the loop that holds the newest
   * state ends.
   */
  private async kick(): Promise<void> {
    if (!this.running) {
      if (this.retired || !this.dirty || !this.latest || !this.store) return;
      this.running = this.writeLoop(this.store).finally(() => {
        this.running = null;
      });
    }
    await this.running;
  }

  private async writeLoop(store: SaveSink): Promise<void> {
    while (this.dirty && this.latest && !this.retired) {
      this.dirty = false;
      const save = toSave(this.latest, this.newId());
      const reason = this.reason;
      this.reason = 'position';
      this.set({ state: 'saving' });
      try {
        await this.answered(store.commit(save, reason, this.clock.now()));
        this.failures = 0;
        this.set({ state: 'saved', at: this.clock.now() });
        if (!this.persistAsked && !('durable' in store)) {
          this.persistAsked = true;
          void requestPersistence();
        }
      } catch (error) {
        this.dirty = true;
        const failure =
          error instanceof StoreError ? error : new StoreError('error', 'The save did not finish.', { cause: error });
        this.set({ state: 'failed', kind: failure.kind, message: failure.message });
        this.scheduleRetry();
        return;
      }
    }
  }

  /** The write's own answer, or a failure if the device has not given one in time. */
  private answered(write: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const cancel = this.clock.later(COMMIT_PATIENCE_MS, () =>
        reject(new StoreError('error', 'The device did not answer the save.')),
      );
      write.then(
        () => {
          cancel();
          resolve();
        },
        (error: unknown) => {
          cancel();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private scheduleRetry(): void {
    const base = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)]!;
    this.failures += 1;
    this.cancelRetry = this.clock.later(base * (0.8 + Math.random() * 0.4), () => {
      this.cancelRetry = null;
      void this.kick();
    });
  }

  private set(status: SaveStatus): void {
    this.current = status;
    for (const listener of this.listeners) listener(status);
  }

  dispose(): void {
    this.cancelRetry?.();
    this.listeners.clear();
  }
}
