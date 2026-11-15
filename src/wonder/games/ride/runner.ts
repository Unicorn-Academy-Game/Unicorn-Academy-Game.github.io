import { clamp } from '../../engine/ease';
import type { Track } from './track';

/**
 * The unicorn on the rainbow. On the rainbow she slides: a fall speeds her up and a rise slows her,
 * always toward a comfortable speed she is pulled back to, so she never stops and never runs wild.
 * When the top of a hill bends away faster than she can fall she leaves it, as a sled does, and
 * flies until the rainbow comes back up to meet her. A tap leaps, a second tap in the air steps off
 * a puff of light, and a ring makes her fast. There is nothing here that can go wrong for her: any
 * tap at any time is a leap, and the rainbow is always under her.
 *
 * Positions are of her body's middle, in the units of the track.
 */

/** How far above the middle of the rainbow the middle of her body is while she is on it. */
export const RIDE_HEIGHT = 68;

export const CRUISE = 250;
const SLOPE_PUSH = 560;
const PULL = 1.5;
export const SLOWEST = 150;
export const FASTEST = 560;
/** What a full boost adds to the speed she is pulled toward. */
const BOOST_SPEED = 190;
/** How fast a boost fades, as a share of a full one each second. */
const BOOST_FADE = 0.42;
export const MOST_BOOST = 1.6;

export const GRAVITY = 950;
export const LEAP = 440;
const STEP_UP = 380;
const AIR_PULL = 0.35;
/**
 * A tap that comes this soon after leaving the rainbow's top still leaps from it, and one this soon
 * before landing leaps on landing.
 */
const COYOTE = 0.11;
const BUFFER = 0.14;
/**
 * A step off the air waits this long after a leap, so the tap that leapt is not also the tap that
 * steps.
 */
const STEP_DELAY = 0.07;

/** What happened in a step, for the game to answer with light and sound. */
export interface Moments {
  /** 1 for a leap from the rainbow, 2 for a step off the air. 0 for neither. */
  leap: 0 | 1 | 2;
  /** How hard she came down, from 0 to 1, or 0 if she did not land. */
  landed: number;
  /** She left the top of a hill without leaping. */
  crest: boolean;
}

export class Runner {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  grounded = true;
  /** Speed along the rainbow while on it. */
  speed: number;
  /** Leaps used since she left the rainbow, 0 to 2. */
  leaps = 0;
  /** How much of a boost she has, 0 to `MOST_BOOST`. */
  boost = 0;
  /** Seconds since she left the rainbow, or 0 while on it. */
  air = 0;
  private sinceGround = 0;
  private wanted = 0;
  /**
   * The moments of the step just taken. The same object every time, so nothing is made while she
   * runs.
   */
  readonly moments: Moments = { leap: 0, landed: 0, crest: false };

  constructor(
    readonly track: Track,
    x: number,
    speed = CRUISE,
  ) {
    this.x = x;
    this.speed = speed;
    this.y = track.heightAt(x) - RIDE_HEIGHT;
    this.vx = speed;
  }

  /** The speed she is pulled toward. */
  get target(): number {
    return CRUISE + BOOST_SPEED * this.boost;
  }

  /**
   * How far she is above the rainbow's middle, which is `RIDE_HEIGHT` on it and more in the air.
   */
  get lift(): number {
    return this.track.heightAt(this.x) - this.y;
  }

  /**
   * A finger went down. She leaps now if she can, and if she cannot a moment ago or a moment from
   * now still counts.
   */
  tap(): void {
    this.wanted = BUFFER;
  }

  /** Gives her a boost of this much. */
  speedUp(amount: number): void {
    this.boost = clamp(this.boost + amount, 0, MOST_BOOST);
  }

  /** Puts her on the rainbow at `x`, as at the start. */
  place(x: number, speed = CRUISE): void {
    this.x = x;
    this.speed = speed;
    this.vx = speed;
    this.vy = 0;
    this.y = this.track.heightAt(x) - RIDE_HEIGHT;
    this.grounded = true;
    this.leaps = 0;
    this.air = 0;
    this.boost = 0;
    this.wanted = 0;
    this.sinceGround = 0;
  }

  step(dt: number): Moments {
    const m = this.moments;
    m.leap = 0;
    m.landed = 0;
    m.crest = false;
    this.wanted = Math.max(0, this.wanted - dt);
    this.boost = Math.max(0, this.boost - BOOST_FADE * dt);

    if (this.grounded) this.slide(dt, m);
    else this.fly(dt, m);

    // A tap leaps from the rainbow, from just after she left it, or from the air: a leap if she has
    // not leapt, and then a step off a puff of light.
    if (this.wanted > 0) {
      if (this.grounded || (this.sinceGround < COYOTE && this.leaps === 0)) this.leapFromRainbow(m);
      else if (this.leaps < 2 && this.air > STEP_DELAY) this.leapInAir(m);
    }
    if (!this.grounded) this.sinceGround += dt;
    return m;
  }

  private leapFromRainbow(m: Moments): void {
    const s = this.track.slopeAt(this.x);
    const along = this.speed / Math.sqrt(1 + s * s);
    this.vx = along;
    this.vy = along * s - LEAP;
    this.grounded = false;
    this.leaps = 1;
    this.air = 0.0001;
    this.sinceGround = COYOTE;
    this.wanted = 0;
    m.leap = 1;
  }

  private leapInAir(m: Moments): void {
    // She has not leapt yet if she left the rainbow at a crest, and then this is her leap.
    // Otherwise it is the step.
    const first = this.leaps === 0;
    this.vy = first ? -LEAP * 0.9 : -STEP_UP;
    this.leaps = first ? 1 : 2;
    this.air = Math.max(this.air, 0.0001);
    this.wanted = 0;
    m.leap = first ? 1 : 2;
  }

  private slide(dt: number, m: Moments): void {
    const track = this.track;
    const s = track.slopeAt(this.x);
    const norm = Math.sqrt(1 + s * s);
    // The slope pushes her along it, and a pull toward the speed she wants takes the extra away
    // again.
    this.speed += ((SLOPE_PUSH * s) / norm - PULL * (this.speed - this.target)) * dt;
    this.speed = clamp(this.speed, SLOWEST, FASTEST);
    const vx = this.speed / norm;
    const vy = vx * s;
    const x = this.x + vx * dt;
    const ground = track.heightAt(x) - RIDE_HEIGHT;
    // Where she would be if nothing held her. If that is above the rainbow, the rainbow has fallen
    // away from her and she is flying.
    const free = this.y + vy * dt + 0.5 * GRAVITY * dt * dt;
    if (free < ground - 0.02) {
      this.x = x;
      this.y = free;
      this.vx = vx;
      this.vy = vy + GRAVITY * dt;
      this.grounded = false;
      this.leaps = 0;
      this.air = 0.0001;
      this.sinceGround = 0;
      m.crest = true;
      return;
    }
    this.x = x;
    this.y = ground;
    this.vx = vx;
    this.vy = vy;
    this.air = 0;
    this.leaps = 0;
    this.sinceGround = 0;
  }

  private fly(dt: number, m: Moments): void {
    const track = this.track;
    this.air += dt;
    // A little pull toward her speed, so a leap does not lose what a boost gave her and a boost
    // fades in the air too.
    this.vx += (this.target - this.vx) * AIR_PULL * dt;
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const ground = track.heightAt(this.x) - RIDE_HEIGHT;
    if (this.y >= ground) {
      const s = track.slopeAt(this.x);
      const norm = Math.sqrt(1 + s * s);
      const along = (this.vx + this.vy * s) / norm;
      m.landed = clamp((this.vy - 60) / 520);
      this.speed = clamp(along, SLOWEST, FASTEST);
      this.y = ground;
      this.vx = this.speed / norm;
      this.vy = this.vx * s;
      this.grounded = true;
      this.air = 0;
      this.leaps = 0;
      this.sinceGround = 0;
    }
  }
}
