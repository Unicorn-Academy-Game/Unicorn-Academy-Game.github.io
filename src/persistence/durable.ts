/**
 * What the browser has said about keeping what the game stores on this device. `unknown` is a
 * browser that has no way to say, or has not been looked at yet.
 */
export type Durable = 'promised' | 'not-promised' | 'unknown';

export type DurableListener = (durable: Durable) => void;

/**
 * The part of a browser's storage manager the game looks at. A browser that has none is `unknown`.
 */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>;
}

/**
 * What the browser says about keeping what is stored here. The game asks the browser for that once,
 * when it first saves (`requestPersistence` in `store.ts`), and a browser decides for itself, some
 * of them without asking anyone. This only reads the answer, so that the parent controls can say
 * it. It never asks, and so it never puts a question to whoever is at the screen. The answer is
 * something to show and not something to rely on: the player's Spell Book can also be saved as a
 * file.
 */
export class Durability {
  private current: Durable = 'unknown';
  private looking: Promise<Durable> | null = null;
  private readonly listeners = new Set<DurableListener>();

  constructor(private readonly storage: StorageManagerLike | undefined) {}

  get(): Durable {
    return this.current;
  }

  /**
   * Calls `listener` with each answer that is different from the one before, not for the one there
   * is. Returns a way to stop.
   */
  subscribe(listener: DurableListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /**
   * Reads what the browser says now. It never throws, and a second call while the first is waiting
   * gets the same answer.
   */
  check(): Promise<Durable> {
    this.looking ??= this.read().finally(() => {
      this.looking = null;
    });
    return this.looking;
  }

  private async read(): Promise<Durable> {
    const storage = this.storage;
    let answer: Durable = 'unknown';
    if (typeof storage?.persisted === 'function') {
      try {
        answer = (await storage.persisted()) ? 'promised' : 'not-promised';
      } catch {
        // A browser that will not answer has not promised anything, and has not refused either.
        answer = 'unknown';
      }
    }
    if (answer !== this.current) {
      this.current = answer;
      for (const listener of this.listeners) listener(answer);
    }
    return answer;
  }
}
