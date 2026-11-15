import type { Rng } from '../../../domain/rng';
import type { SpriteBank } from '../../engine/bank';
import { clamp, damp, lerp, TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { Bubble, Field } from './field';
import type { Film } from './film';
import { paintPrize } from './icons';
import type { Prize } from './kinds';

/**
 * The great bubble of the finale. It opens as a speck in the top of the sky, takes in every bubble
 * that floats up to it and grows with each, and shows what they held, turning round inside it like
 * the snow in a snow globe. Then it is blown up to its full size, shivers, and bursts. It only
 * knows how big it is and what is in it, and how to draw itself.
 */

/**
 * How big it is when it opens and the biggest it may be, as shares of the room it has, which is the
 * radius of the biggest bubble that fits.
 */
export const START = 0.42;
export const FULL = 0.94;
/**
 * The most prizes it shows turning inside it. A bubble that comes after that makes it bigger and
 * shows no more.
 */
export const GUESTS_MOST = 14;

export interface Guest {
  readonly prize: Prize;
  readonly look: number;
  /**
   * Where it is in its turn round the middle, in radians, and how far from the middle it is, as a
   * share of the radius.
   */
  a: number;
  orbit: number;
  /** The share of the radius it settles to, and how fast it turns. */
  readonly settle: number;
  readonly rate: number;
  /** When it came in, in seconds since the giant opened. */
  readonly born: number;
}

/** What it takes to be taken in: where a bubble is, how big, and what is in it. */
export interface Taken {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly prizes: readonly Prize[];
  readonly looks: readonly number[];
}

export class Giant {
  x = 0;
  y = 0;
  r = 0;
  rTo = 0;
  /**
   * The skin wobbles like a bubble's: how far squashed (0 is round) and how fast that is changing.
   */
  squash = 0;
  squashV = 0;
  squashAt = 0;
  /** How hard it shivers, from 0 to 1, as it is about to go. */
  shiver = 0;
  /** How bright it is inside, from 0 to 1. */
  glow = 0;
  readonly guests: Guest[] = [];
  readonly hue: number;
  private room = 1;
  private age = 0;
  private shown = false;

  constructor(
    private readonly rng: Rng,
    at: { readonly x: number; readonly y: number; readonly r: number },
  ) {
    this.hue = rng.next();
    this.place(at);
  }

  /** Whether it has opened and not gone. */
  get opened(): boolean {
    return this.shown;
  }

  /**
   * The giant's place and room, which change when the screen does. Whatever size it has grown to is
   * kept, as a share of the room.
   */
  place(at: { readonly x: number; readonly y: number; readonly r: number }): void {
    const k = this.room > 0 ? at.r / this.room : 1;
    this.x = at.x;
    this.y = at.y;
    this.r *= k;
    this.rTo *= k;
    this.room = at.r;
  }

  /** It opens as a speck that swells to its first size. */
  open(): void {
    this.shown = true;
    this.age = 0;
    this.r = this.room * 0.03;
    this.rTo = this.room * START;
    this.guests.length = 0;
    this.squash = 0;
    this.squashV = 0;
    this.shiver = 0;
    this.glow = 0.2;
  }

  /** The share of the room it has swelled to, 0 to 1. */
  get size(): number {
    return this.room > 0 ? this.r / this.room : 0;
  }

  /**
   * A bubble comes into it and is part of it: it grows by the area of a good part of the bubble,
   * wobbles where it came in, and its prizes turn inside.
   */
  take(b: Taken): void {
    this.rTo = Math.min(this.room * FULL, Math.hypot(this.rTo, b.r * 0.5));
    this.squashAt = Math.atan2(b.y - this.y, b.x - this.x);
    this.squashV += 5;
    this.glow = Math.min(1, this.glow + 0.12);
    const from = this.squashAt;
    b.prizes.forEach((prize, i) => {
      if (this.guests.length >= GUESTS_MOST) return;
      this.guests.push({
        prize,
        look: b.looks[i] ?? 0,
        a: from + i * 0.5,
        orbit: 1,
        settle: this.rng.range(0.18, 0.6),
        rate: this.rng.range(0.25, 0.6) * (this.rng.next() < 0.5 ? -1 : 1),
        born: this.age,
      });
    });
  }

  /** Whether a point is inside it. */
  has(x: number, y: number): boolean {
    return this.shown && Math.hypot(x - this.x, y - this.y) < this.r;
  }

  /** A touch on it: the skin gives where it was touched, and it brightens for a moment. */
  poke(x: number, y: number): void {
    this.squashAt = Math.atan2(y - this.y, x - this.x);
    this.squashV += 6;
    this.glow = Math.min(1, this.glow + 0.25);
  }

  /** It is blown up to this share of its room. */
  inflate(share: number): void {
    this.rTo = this.room * clamp(share, START, FULL);
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.age += dt;
    this.r = damp(this.r, this.rTo, 3.2, dt);
    this.squashV += (-90 * this.squash - 7 * this.squashV) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.3, 0.3);
    this.glow = damp(this.glow, 0.25 + 0.6 * this.shiver, 1.5, dt);
    for (const g of this.guests) {
      g.a += g.rate * dt;
      g.orbit = damp(g.orbit, g.settle, 2.4, dt);
    }
  }

  /** It bursts. What was in it is handed over, to fly out, and it is gone. */
  burst(): Guest[] {
    const out = [...this.guests];
    this.guests.length = 0;
    this.shown = false;
    this.r = 0;
    this.rTo = 0;
    this.shiver = 0;
    return out;
  }

  /** Where a guest is now, in units. */
  guestAt(g: Guest): { readonly x: number; readonly y: number } {
    return { x: this.x + Math.cos(g.a) * g.orbit * this.r, y: this.y + Math.sin(g.a) * g.orbit * this.r * 0.85 };
  }

  /** Where the skin is, along a direction from the middle: for a spark where something came in. */
  skinAt(angle: number): { readonly x: number; readonly y: number } {
    return { x: this.x + Math.cos(angle) * this.r, y: this.y + Math.sin(angle) * this.r };
  }

  paint(p: Painter, film: Film, bank: SpriteBank | null): void {
    if (!this.shown || this.r < 1) return;
    const g = p.ctx;
    glowAt(p.light, this.x, this.y, this.r * 2.4, [255, 232, 255], 0.14 + 0.3 * this.glow);
    for (const guest of this.guests) {
      const at = this.guestAt(guest);
      // A prize that has just come in grows to its size.
      const grow = clamp((this.age - guest.born) / 0.5);
      const fit = this.r * 0.17 * lerp(0.4, 1, grow);
      const t = p.t + guest.a;
      paintPrize(
        g,
        p.light,
        bank,
        guest.prize,
        { x: at.x, y: at.y, fit, t, look: guest.look, turn: Math.sin(t * 1.1) * 0.12, alpha: clamp(grow * 1.5) },
        0.6,
      );
    }
    // A faint milk in it, a little paler toward the middle, so it reads against a bright sky.
    const body = g.createRadialGradient(this.x, this.y, this.r * 0.2, this.x, this.y, this.r);
    body.addColorStop(0, 'rgba(255,255,255,0.0)');
    body.addColorStop(1, 'rgba(255,240,255,0.16)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(this.x, this.y, this.r, 0, TAU);
    g.fill();
    const shiver = this.shiver * 0.035 * Math.sin(this.age * 41);
    film.draw(
      g,
      {
        x: this.x,
        y: this.y,
        r: this.r,
        squash: this.squash + shiver,
        squashAt: this.squashAt,
        hue: this.hue,
        phase: this.age * 0.4,
      },
      p.t,
    );
  }
}

/**
 * The small bubbles the great bubble leaves when it bursts: `n` of them fly out from the middle in
 * every direction at different speeds, drift on, and each goes off by itself a little later, one
 * after another.
 */
export function storm(field: Field, rng: Rng, x: number, y: number, n: number): Bubble[] {
  const made: Bubble[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU);
    const speed = rng.range(70, 230);
    made.push(
      field.add({
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 8,
        r: rng.range(8, 17),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 24,
        prizes: [],
        life: rng.range(1.4, 3.8),
      }),
    );
  }
  return made;
}
