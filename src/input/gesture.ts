/** How far a finger may drift and still count as staying put, in CSS pixels. */
export const TAP_SLOP = 12;
/**
 * A press on open ground that lets go this soon, in milliseconds, and in place, is a tap as well as
 * a short walk of the finger's way.
 */
export const TAP_MS = 220;
/**
 * A press on something that is held this long, in milliseconds, is no longer a tap: it is leading
 * Wildstar.
 */
export const HOLD_MS = 320;
/**
 * A finger that has stayed where it landed, or where it last moved to, this long in milliseconds is
 * resting: a thumb on the glass while the other hand taps, and not a child steering. A quick tap
 * from another finger then takes over from it, because a finger that only rests must never be what
 * stops the screen from answering.
 */
export const REST_MS = 900;

/**
 * What a press landed on. Open ground starts leading at once. A thing waits to see whether it was a
 * tap.
 */
export type PressedOn = 'ground' | 'thing';

/**
 * What a release means. Both can be true at once: a quick press on the ground led for a moment and
 * is also a tap.
 */
export interface Release {
  /** The finger had been leading Wildstar, so she must be told to stop. */
  led: boolean;
  /** The press and release add up to a tap where the finger landed. */
  tap: boolean;
}

const NOTHING: Release = { led: false, tap: false };

interface Press {
  id: number;
  x: number;
  y: number;
  at: number;
  on: PressedOn;
  drifted: boolean;
  leading: boolean;
  /** Where the finger is now. */
  now: { x: number; y: number };
  /**
   * Where it last moved to, and when it got there. How long it has been still is measured from
   * here.
   */
  still: { x: number; y: number; at: number };
}

/** A finger that landed while the first was down, watched in case it turns out to be a tap. */
interface Other {
  id: number;
  x: number;
  y: number;
  at: number;
  drifted: boolean;
}

/**
 * Decides what a finger means. A press on open ground leads Wildstar toward the finger from the
 * moment it lands, and she goes on until it lifts. A press on something to tap (a unicorn, a prop,
 * a worker) is a tap that waits: it becomes a lead if the finger drifts away from where it landed
 * or stays down for a moment, and is a tap if it lifts before either.
 *
 * Only the first finger leads: a second finger that lands while the first is down never leads, and
 * nothing it does makes a command, so a resting palm or a pinch never makes a second command. The
 * one thing it may do is tap, and only when the first finger has been resting for a while, so a
 * thumb on the glass cannot make every other tap in the game useless. The clock is passed in, so
 * the rules can be tested with no waiting. Positions are in CSS pixels.
 */
export class PointerGesture {
  private press: Press | null = null;
  private second: Other | null = null;

  /** Returns true when this press leads Wildstar from the start. */
  down(id: number, x: number, y: number, now: number, on: PressedOn): boolean {
    if (this.press) return false;
    this.press = {
      id,
      x,
      y,
      at: now,
      on,
      drifted: false,
      leading: on === 'ground',
      now: { x, y },
      still: { x, y, at: now },
    };
    return this.press.leading;
  }

  /** Returns true when this move is the one that turns a waiting press into a lead. */
  move(id: number, x: number, y: number, now: number): boolean {
    const p = this.press;
    if (!p || p.id !== id) return false;
    p.now = { x, y };
    if (Math.hypot(x - p.still.x, y - p.still.y) > TAP_SLOP) p.still = { x, y, at: now };
    if (!p.drifted && Math.hypot(x - p.x, y - p.y) > TAP_SLOP) p.drifted = true;
    if (p.drifted && !p.leading) {
      p.leading = true;
      return true;
    }
    return false;
  }

  /**
   * Called as time passes. Returns true when a press has been held on something for long enough to
   * turn into a lead.
   */
  hold(now: number): boolean {
    const p = this.press;
    if (!p || p.leading || now - p.at < HOLD_MS) return false;
    p.leading = true;
    return true;
  }

  up(id: number, x: number, y: number, now: number): Release {
    const p = this.press;
    if (!p || p.id !== id) return NOTHING;
    this.press = null;
    this.second = null;
    const inPlace = !p.drifted && Math.hypot(x - p.x, y - p.y) <= TAP_SLOP;
    // A press on a thing that never started leading is a tap however long it took to decide, up to
    // the hold.
    if (p.on === 'thing') return { led: p.leading, tap: inPlace && !p.leading };
    return { led: true, tap: inPlace && now - p.at <= TAP_MS };
  }

  /**
   * Forgets every finger, for a lost focus or a system gesture. Returns true if the first had been
   * leading.
   */
  cancel(): boolean {
    const led = this.press?.leading ?? false;
    this.press = null;
    this.second = null;
    return led;
  }

  /**
   * Whether the first finger has stayed where it was for long enough to be a hand resting on the
   * glass.
   */
  resting(now: number): boolean {
    const p = this.press;
    return p !== null && now - p.still.at >= REST_MS;
  }

  /**
   * Another finger lands while the first is down. It leads no one and is only watched, to see
   * whether it is a tap.
   */
  other(id: number, x: number, y: number, now: number): void {
    if (this.press) this.second = { id, x, y, at: now, drifted: false };
  }

  /** The watched finger moves. One that wanders is a pinch or a palm, and no tap. */
  otherMove(id: number, x: number, y: number): void {
    const s = this.second;
    if (s && s.id === id && Math.hypot(x - s.x, y - s.y) > TAP_SLOP) s.drifted = true;
  }

  /**
   * The watched finger lifts. True when it was a quick tap in place and the first finger had been
   * resting when it landed: the tap is a command, and the first finger no longer is one. The caller
   * drops the first with `cancel`.
   */
  otherUp(id: number, x: number, y: number, now: number): boolean {
    const s = this.second;
    if (!s || s.id !== id) return false;
    this.second = null;
    const p = this.press;
    if (!p) return false;
    const quick = !s.drifted && Math.hypot(x - s.x, y - s.y) <= TAP_SLOP && now - s.at <= TAP_MS;
    return quick && s.at - p.still.at >= REST_MS;
  }

  /** The watched finger was taken away. */
  otherLost(id: number): void {
    if (this.second?.id === id) this.second = null;
  }

  /** Whether this is the finger that counts. */
  isPrimary(id: number): boolean {
    return this.press?.id === id;
  }

  /** True while a finger is leading Wildstar. */
  get leading(): boolean {
    return this.press?.leading === true;
  }

  /** Where the first finger is, or null when none is down. */
  get at(): { x: number; y: number } | null {
    return this.press ? this.press.now : null;
  }

  get active(): boolean {
    return this.press !== null;
  }

  /** The number of the first finger, or null when none is down. */
  get id(): number | null {
    return this.press?.id ?? null;
  }
}
