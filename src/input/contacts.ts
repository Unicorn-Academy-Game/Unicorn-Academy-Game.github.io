import type { Vec2 } from '../shared/ids';
import { PointerGesture } from './gesture';

/** What the pointer needs from the game. */
export interface PointerSink {
  /** True when a press at this world point lands on something to tap, and not on open ground. */
  thingAt(world: Vec2): boolean;
  /** A tap at a world point. One tap makes at most one command. */
  tap(world: Vec2): void;
  /**
   * The finger is leading Wildstar and is here on the screen, in CSS pixels. Said again whenever it
   * moves.
   */
  lead(css: Vec2): void;
  /** The finger that was leading has lifted, or been lost. */
  release(): void;
  /**
   * A press the game was holding was found to have ended long before, with no lift ever heard. Said
   * once for each.
   */
  found?(): void;
}

/** What touched the screen: a finger, a stylus, or a mouse. */
export type Kind = 'mouse' | 'touch' | 'pen';

/** One thing touching the screen, as the browser describes it. */
export interface Contact {
  /** Its number for as long as it is down. */
  id: number;
  kind: Kind;
  /**
   * The browser's word that no other contact of this kind is down. The browser knows what is on the
   * glass, and the game only knows what it was told, so this is what says that a press the game
   * still holds is one whose lift it never heard.
   */
  primary: boolean;
  /** Where it is on the screen, in CSS pixels. */
  css: Vec2;
}

/** What the game holds about a press, for tests and for looking at it. */
export interface PressState {
  pressed: boolean;
  leading: boolean;
  id: number | null;
  kind: Kind | null;
}

/**
 * Who is touching the screen, and what that means. This is `PointerGesture`, which says what one
 * finger means, with the three things a real screen adds: contacts that come with a number and a
 * kind, a lift that is sometimes never heard, and a second finger. The answers go to the sink.
 *
 * A press that was never lifted is the way Wildstar stops answering: the game goes on leading her
 * toward a finger that has long gone, and every tap is dropped as the second finger of a press that
 * is not there. So the game never trusts that a press it holds is still down. A contact that is the
 * browser's primary one of its kind proves it is not, and the old press is dropped. A mouse that
 * moves with no button down has been let go. And when the first finger has only been resting, a
 * quick tap from another one goes through.
 */
export class Contacts {
  private readonly gesture = new PointerGesture();
  private kind: Kind | null = null;

  constructor(private readonly sink: PointerSink) {}

  down(c: Contact, world: Vec2, now: number): void {
    if (this.gesture.active) {
      // The same kind of contact, and the browser's only one: the lift of the one held was lost.
      if (c.primary && c.kind === this.kind) {
        this.sink.found?.();
        this.drop();
      } else {
        this.gesture.other(c.id, c.css.x, c.css.y, now);
        return;
      }
    }
    this.kind = c.kind;
    if (this.gesture.down(c.id, c.css.x, c.css.y, now, this.sink.thingAt(world) ? 'thing' : 'ground'))
      this.sink.lead(c.css);
  }

  move(c: Contact, now: number): void {
    if (!this.gesture.isPrimary(c.id)) {
      this.gesture.otherMove(c.id, c.css.x, c.css.y);
      return;
    }
    this.gesture.move(c.id, c.css.x, c.css.y, now);
    if (this.gesture.leading) this.sink.lead(c.css);
  }

  up(c: Contact, world: Vec2, now: number): void {
    if (this.gesture.isPrimary(c.id)) {
      const release = this.gesture.up(c.id, c.css.x, c.css.y, now);
      this.kind = null;
      if (release.led) this.sink.release();
      if (release.tap) this.sink.tap(world);
    } else if (this.gesture.otherUp(c.id, c.css.x, c.css.y, now)) {
      this.drop();
      this.sink.tap(world);
    }
  }

  /** The browser took a contact away, or the game found it gone. Nothing it did is a tap. */
  lost(id: number): void {
    if (this.gesture.isPrimary(id)) this.drop();
    else this.gesture.otherLost(id);
  }

  /**
   * The browser shows that a contact is no longer down, though no lift was heard for it: a mouse
   * button let go outside the page.
   */
  lifted(id: number): void {
    if (this.gesture.isPrimary(id)) this.sink.found?.();
    this.lost(id);
  }

  /**
   * Called as time passes, so a press that stays on something turns into a lead without anyone
   * moving.
   */
  hold(now: number): void {
    if (!this.gesture.hold(now)) return;
    const at = this.gesture.at;
    if (at) this.sink.lead(at);
  }

  /** Forgets every contact, for something put over the game or a page that went out of sight. */
  clear(): void {
    this.drop();
  }

  /** Whether any contact is down as far as the game knows. */
  get active(): boolean {
    return this.gesture.active;
  }

  state(): PressState {
    return { pressed: this.gesture.active, leading: this.gesture.leading, id: this.gesture.id, kind: this.kind };
  }

  private drop(): void {
    const led = this.gesture.cancel();
    this.kind = null;
    if (led) this.sink.release();
  }
}
