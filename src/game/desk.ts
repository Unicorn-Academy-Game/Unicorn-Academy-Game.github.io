import type { ClipId } from '../learning';
import type { PlayVoice } from './play-ports';

/**
 * What the session of a table needs of the game around it to wait, speak, and tell of what goes
 * wrong.
 */
export interface DeskDeps {
  /** Runs `run` after `ms` and returns the way to stop it, so a test can hold the clock. */
  later: (ms: number, run: () => void) => () => void;
  voice: PlayVoice;
  /** Something went wrong in a way the player should never see. */
  report?: (error: unknown) => void;
}

/**
 * A table says what to do when the player sits down until they have played this many games there,
 * and not after.
 */
export const WELCOME_GAMES = 2;

/** Whether the screen went up, is in the way of itself, or broke. */
export type Started = 'up' | 'busy' | 'broke';

/** What the game around a table asks of the session at it. */
export interface Desk {
  /** Whether the screen is up, or a round is being played. */
  readonly busy: boolean;
  open(): Started;
  /** A parent changed the settings, and a screen that is up shows them as they are now. */
  settingsChanged(): void;
}

/**
 * The small things every table's session does the same way: wait for a moment under a name, so that
 * waiting again for the same thing replaces it, say clips, and keep sound, voice and drawing from
 * ever stopping the game. The sessions keep their own rules.
 */
export class DeskKit<Timer extends string> {
  private readonly timers = new Map<Timer, () => void>();

  constructor(private readonly deps: DeskDeps) {}

  after(name: Timer, ms: number, run: () => void): void {
    this.stop(name);
    this.timers.set(
      name,
      this.deps.later(ms, () => {
        this.timers.delete(name);
        run();
      }),
    );
  }

  stop(name: Timer): void {
    this.timers.get(name)?.();
    this.timers.delete(name);
  }

  /** Whatever was being said or waited for belongs to something that is over. */
  leave(): void {
    for (const name of [...this.timers.keys()]) this.stop(name);
    this.quietly(() => this.deps.voice.stop());
  }

  /**
   * Says clips. A list with nothing in it says nothing, and does not cut off what is being said.
   */
  say(clips: readonly ClipId[]): void {
    if (clips.length > 0) this.quietly(() => this.deps.voice.say(clips));
  }

  /**
   * Sound, voice and the screen's own drawing sit outside the game, and none of them can stop it.
   */
  quietly(run: () => void): void {
    try {
      run();
    } catch (error) {
      this.deps.report?.(error);
    }
  }
}
