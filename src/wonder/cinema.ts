import { Meter, UNEARNED } from './engine/meter';
import type { Pointer } from './engine/stage';
import { Wonder } from './wonder';

/**
 * A scene the player watches and does not play: the word going into the door, a postcard from a
 * statue, the whole herd together. It opens over the world, plays for a few seconds on the engine
 * like any game, and then says it is over, and the screen around it gives the screen back.
 *
 * A cinema has the engine's finale and nothing else of a game. It starts at once, with no play to
 * wait for, so the picture that opens is already moving. A touch is a small sparkle and never
 * changes how it goes: there is no way to lose it, to miss it or to end it by accident, and the way
 * out is always there.
 */
export abstract class Cinema extends Wonder {
  protected readonly meter = new Meter(UNEARNED);
  private began = 0;

  /** What the show does. Cue it with `cue` from 0 and call `endFinale` when it is over. */
  protected abstract show(): void;
  /** A touch on the picture. */
  protected abstract touch(x: number, y: number): void;

  protected finale(): void {
    this.began = this.script.now;
    this.show();
  }

  /** Runs `run` this many seconds into the show. */
  protected cue(seconds: number, run: () => void): void {
    this.script.at(this.began + seconds, run);
  }

  /** The seconds the show has run: nothing before it begins. */
  get shown(): number {
    return this.phase === 'play' ? 0 : this.script.now - this.began;
  }

  /** Begins the show. There are no stars to fill, so nothing but this begins it. */
  override celebrate(): void {
    if (this.phase !== 'play') return;
    this.beginFinale();
  }

  protected press(p: Pointer): void {
    this.touch(p.x, p.y);
  }

  protected hint(): null {
    return null;
  }
}
