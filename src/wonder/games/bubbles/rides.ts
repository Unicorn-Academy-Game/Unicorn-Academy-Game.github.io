import type { Rng } from '../../../domain/rng';
import type { Facing } from '../../../shared/ids';
import { clamp, lerp, smooth } from '../../engine/ease';
import type { Member } from '../sky/audience';
import type { Bubble, Field } from './field';
import { FRIEND, type Plan } from './layout';

/**
 * A friend in a bubble. A touch on a friend blows a great bubble round her, it carries her up over
 * the garden where she trots on the air, and when it bursts she floats down to where she stood.
 * Nothing here makes a sound or a light: it moves the friend and her bubble, and says what
 * happened, so the game can answer with the colour and the music.
 */

/**
 * Seconds the bubble takes to swell round her, before it begins to lift her, and how much quicker
 * it all is for a ride that is part of a show.
 */
const SWELL = 0.7;
const QUICK_SWELL = 0.4;
const QUICK_SPEED = 170;
/** The longest she is left up in it before it comes down by itself, in seconds. */
const HOVER_MAX = 15;
/** How fast a bubble that is coming down goes, units per second. */
const SINK = 38;
/**
 * How far the middle of the bubble is above her hooves, as a share of how tall she is, and how big
 * it is next to her.
 */
const FOOT = 0.42;
const WIDTH = 0.72;
/**
 * The speed, in units per second, that a bubble must be going sideways before she turns to face the
 * way she goes.
 */
const TURN_SPEED = 7;
/**
 * How much bigger she and her bubble are, as a share, once she is high in the sky: she comes toward
 * you as she rises, so she is a good deal easier to see.
 */
const GROW = 0.3;
/** How high she has risen, in units, by the time she has grown the whole way. */
const GROWN_AT = 80;

export type Phase = 'swell' | 'rise' | 'hover' | 'sink' | 'fall';

export interface Ride {
  readonly friend: Member;
  /** The bubble she is in, until it bursts. */
  bubble: Bubble | null;
  readonly home: { readonly x: number; readonly y: number; readonly facing: Facing; readonly scale: number };
  /** A ride in a hurry: the bubble swells and rises faster. */
  readonly quick: boolean;
  phase: Phase;
  /** Seconds in this phase. */
  since: number;
  /** Where the bubble is taking her to, and where she was when it burst. */
  spot: { x: number; y: number };
  from: { x: number; lift: number; grown: number };
  /** How long she has been in the air, which sets the sway of her bob. */
  age: number;
}

/**
 * What happened to a ride in a step. `drifted` is a bubble that came down by itself and burst;
 * `landed` is a friend who is on the ground again.
 */
export type Happened =
  | { readonly is: 'drifted'; readonly ride: Ride; readonly x: number; readonly y: number }
  | { readonly is: 'landed'; readonly ride: Ride };

/** How big the bubble round a friend is, from how big she is drawn. */
export const bubbleFor = (scale: number): number => FRIEND * scale * WIDTH;

export class Rides {
  readonly list: Ride[] = [];

  constructor(
    private readonly field: Field,
    private readonly rng: Rng,
  ) {}

  /** Whether this friend is in a bubble, or floating down from one. */
  riding(friend: Member): boolean {
    return this.list.some((r) => r.friend === friend);
  }

  /** The ride whose bubble this is. */
  of(bubble: Bubble): Ride | null {
    return this.list.find((r) => r.bubble === bubble) ?? null;
  }

  /**
   * A bubble swells round a friend. Nothing happens if she is already in one, or is still floating
   * down from it.
   */
  start(friend: Member, plan: Plan, now: number, quick = false): Ride | null {
    if (this.riding(friend)) return null;
    const r = bubbleFor(friend.scale);
    const foot = FRIEND * friend.scale * FOOT;
    const bubble = this.field.add({ x: friend.x, y: friend.y - foot, r, prizes: [], rider: friend.id, swell: true });
    if (quick) bubble.speed = QUICK_SPEED;
    const ride: Ride = {
      friend,
      bubble,
      quick,
      home: { x: friend.x, y: friend.y, facing: friend.facing, scale: friend.scale },
      phase: 'swell',
      since: 0,
      spot: this.spotFor(friend, plan, r * (1 + GROW)),
      from: { x: friend.x, lift: 0, grown: 0 },
      age: 0,
    };
    this.list.push(ride);
    // She is excited: she trots on the spot, and keeps trotting all the way up.
    friend.clip = 'walk';
    friend.since = now;
    return ride;
  }

  /** The bubble burst, by a touch. She floats down. */
  burst(ride: Ride, now: number): void {
    if (ride.phase === 'fall') return;
    this.fall(ride, now);
  }

  /**
   * Every friend is put down where she stood, and every ride bubble goes: for when the game begins
   * again.
   */
  clear(): void {
    for (const r of this.list) {
      if (r.bubble) this.field.remove(r.bubble);
      this.put(r, 0);
    }
    this.list.length = 0;
  }

  /** Moves the rides on by `dt` seconds at time `now`, and says what happened. */
  update(dt: number, now: number, plan: Plan): Happened[] {
    const happened: Happened[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ride = this.list[i]!;
      ride.since += dt;
      ride.age += dt;
      const f = ride.friend;
      let b = ride.bubble;
      // If the air has lost her bubble some other way, she floats down all the same.
      if (b && !this.field.bubbles.includes(b)) {
        this.fall(ride, now);
        b = null;
      }
      if (b) {
        // She is wherever the bubble is, and the bubble is what the air does with it. The higher it
        // takes her the bigger she and it are.
        const foot0 = FRIEND * ride.home.scale * FOOT;
        const grown = smooth(clamp((ride.home.y - (b.y + foot0)) / GROWN_AT));
        this.size(ride, b, grown);
        const foot = FRIEND * f.scale * FOOT;
        f.x = b.x;
        f.lift =
          Math.max(0, ride.home.y - (b.y + foot)) + (ride.phase === 'swell' ? 0 : Math.sin(ride.age * 2.3) * 2.2);
        if (Math.abs(b.vx) > TURN_SPEED) f.facing = b.vx > 0 ? 'east' : 'west';
        if (ride.phase === 'swell') {
          // It grows round her and does not move her.
          b.x = ride.home.x;
          b.y = ride.home.y - foot0;
          b.vx = 0;
          b.vy = 0;
          f.x = b.x;
          f.lift = 0;
          if (ride.since >= (ride.quick ? QUICK_SWELL : SWELL)) this.go(ride, 'rise');
        } else if (ride.phase === 'rise') {
          b.aim = { x: ride.spot.x, y: ride.spot.y };
          if (Math.hypot(b.x - ride.spot.x, b.y - ride.spot.y) < 12) this.go(ride, 'hover');
        } else if (ride.phase === 'hover') {
          // It hangs there, and drifts a little round the place, as a bubble does.
          b.aim = {
            x: ride.spot.x + Math.sin(ride.since * 0.8) * 16,
            y: ride.spot.y + Math.sin(ride.since * 1.2 + 1) * 9,
          };
          if (ride.since >= HOVER_MAX) this.go(ride, 'sink');
        } else if (ride.phase === 'sink') {
          b.aim = { x: b.x, y: b.y + SINK };
          // The air will not take it lower than this, so this is where it ends.
          if (b.y >= plan.air.floor - b.r - 2) {
            const at = { x: b.x, y: b.y };
            this.field.remove(b);
            this.fall(ride, now);
            happened.push({ is: 'drifted', ride, x: at.x, y: at.y });
          }
        }
        continue;
      }
      // Her bubble has burst. She floats down, easing to a stop, and drifts back over the place she
      // stood.
      const length = fallSeconds(ride.from.lift);
      const u = clamp(ride.since / length);
      const down = smooth(u);
      f.lift = ride.from.lift * (1 - down) + (u < 1 ? Math.sin(u * Math.PI * 3) * 1.6 * (1 - u) : 0);
      f.scale = ride.home.scale * (1 + GROW * ride.from.grown * (1 - down));
      f.x = lerp(ride.from.x, ride.home.x, down);
      if (Math.abs(ride.home.x - f.x) > 0.5) f.facing = ride.home.x > f.x ? 'east' : 'west';
      if (u >= 1) {
        this.put(ride, now);
        this.list.splice(i, 1);
        happened.push({ is: 'landed', ride });
      }
    }
    return happened;
  }

  /** She and her bubble are this much grown, from 0 to 1. */
  private size(ride: Ride, b: Bubble, grown: number): void {
    const f = ride.friend;
    f.scale = ride.home.scale * (1 + GROW * grown);
    b.rTo = bubbleFor(f.scale);
  }

  private go(ride: Ride, phase: Phase): void {
    ride.phase = phase;
    ride.since = 0;
  }

  /** The bubble is gone and she begins to float down from where she is. */
  private fall(ride: Ride, now: number): void {
    const f = ride.friend;
    ride.bubble = null;
    ride.from = { x: f.x, lift: f.lift, grown: (f.scale / ride.home.scale - 1) / GROW };
    this.go(ride, 'fall');
    // In the air without a bubble, she stands still.
    f.clip = 'idle';
    f.since = now;
  }

  /** She is on the ground again, as she was before. */
  private put(ride: Ride, now: number): void {
    const f = ride.friend;
    f.x = ride.home.x;
    f.lift = 0;
    f.scale = ride.home.scale;
    f.facing = ride.home.facing;
    f.clip = 'idle';
    f.since = now;
    // She stands a moment before she does something of her own again.
    f.nextOwn = now + this.rng.range(3, 8);
  }

  /**
   * Where a bubble takes a friend: over where she stands, in the middle of the sky below the meter,
   * and as far from the other bubbles of friends as it can be.
   */
  private spotFor(friend: Member, plan: Plan, r: number): { x: number; y: number } {
    const others = this.list.filter((o) => o.bubble).map((o) => o.spot);
    const top = plan.roam.top + r + 6;
    const bottom = Math.max(top, plan.air.floor - r - 40);
    let best = { x: friend.x, y: lerp(top, bottom, 0.45) };
    let bestRoom = -1;
    for (let i = 0; i < 14; i++) {
      const spot = {
        x: clamp(friend.x + this.rng.range(-110, 110), r + 14, plan.w - r - 14),
        y: lerp(top, bottom, this.rng.range(0.2, 0.75)),
      };
      const room = others.length === 0 ? 1 : Math.min(...others.map((o) => Math.hypot(o.x - spot.x, o.y - spot.y)));
      if (room > bestRoom) {
        best = spot;
        bestRoom = room;
      }
    }
    return best;
  }
}

/**
 * How long a friend takes to float down from this high: not less than a moment, and slow for a long
 * way.
 */
export const fallSeconds = (lift: number): number => clamp(0.7 + lift / 220, 0.7, 1.7);
