import type { Rng } from '../../../domain/rng';
import type { SpriteBank } from '../../engine/bank';
import { clamp, easeInQuad, hump, lerp, TAU } from '../../engine/ease';
import type { Painter } from '../../engine/painter';
import type { Prize } from './kinds';
import type { Plan, Slot } from './layout';

/**
 * What lives in the garden once its bubble has popped. A resident is a small machine with a few
 * moods: it comes out of its bubble, lands, and goes about its day. Residents draw themselves and
 * never make a sound or a sparkle of their own: they say what happened (`Heard`) and the game turns
 * it into light and music, so how they behave can be tested without a screen.
 */

/** Something a resident did that deserves a sound or a sparkle. */
export type Heard =
  /** It came out of its bubble and reached the ground (or the water, if `wet`). */
  | {
      readonly is: 'land';
      readonly prize: Prize;
      readonly x: number;
      readonly y: number;
      readonly look: number;
      readonly wet: boolean;
    }
  /** A touch on it. */
  | { readonly is: 'poke'; readonly prize: Prize; readonly x: number; readonly y: number; readonly look: number }
  /** A flower has finished growing. */
  | { readonly is: 'bloom'; readonly x: number; readonly y: number; readonly look: number }
  /** A bird sang. */
  | { readonly is: 'sing'; readonly x: number; readonly y: number; readonly look: number }
  /** A fish went up out of the water, or came back into it. */
  | { readonly is: 'leap'; readonly x: number; readonly y: number; readonly up: boolean }
  /** A trail of specks left behind something that glitters as it goes. */
  | { readonly is: 'dust'; readonly prize: Prize; readonly x: number; readonly y: number; readonly n: number }
  /** A bee took a sip from a flower. */
  | { readonly is: 'sip'; readonly x: number; readonly y: number }
  /** The fairy touched a flower with her light. */
  | { readonly is: 'bless'; readonly x: number; readonly y: number }
  /** It left the garden: flew off, swam down, or faded. */
  | { readonly is: 'leave'; readonly prize: Prize; readonly x: number; readonly y: number };

/** A flower that visitors can come to. `head` is where the petals are, which sways. */
export interface Bloom {
  readonly head: { x: number; y: number };
  /** Grown enough to land on. */
  readonly ready: boolean;
  /** Someone is on it or on the way. */
  taken: boolean;
  /** The glow of the fairy's blessing, 1 when it has just been given and fading. */
  glow: number;
}

/** What a resident can see of the garden, and how it speaks to it. */
export interface World {
  readonly rng: Rng;
  readonly plan: Plan;
  /** Seconds the garden has run. */
  readonly now: number;
  readonly blooms: readonly Bloom[];
  /** The place nearest to a point where a flower may still grow, if there is one. */
  slotNear(x: number, y: number): Slot | null;
  /**
   * Takes a perch no bird is on, other than `avoid`, and returns it, or nothing if every perch has
   * a bird.
   */
  claimPerch(avoid: number | null): number | null;
  releasePerch(perch: number): void;
  hear(e: Heard): void;
}

/**
 * Which draw layer a resident belongs to: under the lilies, on the meadow among the flowers, or in
 * the air.
 */
export type Layer = 'water' | 'ground' | 'air';

interface Drop {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly seconds: number;
  /**
   * How far it rises above the straight line from start to end at the top of its arc. A falling
   * thing has none.
   */
  readonly lift: number;
  t: number;
}

/** Seconds a resident takes to fade when the garden has no room for it any more. */
const FADE_SECONDS = 0.9;

export abstract class Resident {
  abstract readonly prize: Prize;
  abstract readonly layer: Layer;
  /** Where it stands: the point on the ground under it, or the point it floats at. */
  x: number;
  y: number;
  alpha = 1;
  /** Seconds since it came out of its bubble. */
  age = 0;
  /** It has been asked to go, and is on its way out. */
  leaving = false;
  /** It is out of the garden, and can be dropped. */
  gone = false;
  /** In the order they came: the oldest has the smallest. Set by the garden. */
  order = 0;
  protected drop: Drop | null = null;

  constructor(
    readonly look: number,
    x: number,
    y: number,
    /** A number of its own, so two of a kind do not move in step. */
    protected readonly phase: number,
  ) {
    this.x = x;
    this.y = y;
  }

  /**
   * It comes down from where its bubble burst to `(x1, y1)`: falling, or, with a `lift`, in an arc.
   */
  fall(x1: number, y1: number, seconds: number, lift = 0): void {
    this.drop = { x0: this.x, y0: this.y, x1, y1, seconds, lift, t: 0 };
  }

  /** Whether it is still coming down from its bubble. */
  get falling(): boolean {
    return this.drop !== null;
  }

  update(dt: number, w: World): void {
    this.age += dt;
    const d = this.drop;
    if (d) {
      d.t += dt;
      const u = clamp(d.t / d.seconds);
      this.x = lerp(d.x0, d.x1, u);
      this.y = lerp(d.y0, d.y1, d.lift > 0 ? u : easeInQuad(u)) - d.lift * hump(u);
      if (u >= 1) {
        this.drop = null;
        this.x = d.x1;
        this.y = d.y1;
        this.landed(w);
      }
      return;
    }
    if (this.leaving) this.depart(dt, w);
    else this.live(dt, w);
  }

  /** Asks it to go. It does so in its own way, over the next moments. */
  leave(w: World): void {
    if (this.leaving) return;
    this.leaving = true;
    this.drop = null;
    w.hear({ is: 'leave', prize: this.prize, x: this.x, y: this.y });
    this.parted(w);
  }

  /** What it does day to day. */
  protected abstract live(dt: number, w: World): void;

  /** What it does once it is on the ground or the water. */
  protected landed(_w: World): void {}

  /** What it does the moment it is asked to go. */
  protected parted(_w: World): void {}

  /** How it goes: by default it fades out. A flyer flies off instead. */
  protected depart(dt: number, _w: World): void {
    this.alpha -= dt / FADE_SECONDS;
    if (this.alpha <= 0) this.gone = true;
  }

  /** What it does when the player touches it. */
  abstract poke(w: World): void;

  /** Whether a touch at (x, y) is on it. */
  abstract hit(x: number, y: number): boolean;

  abstract paint(p: Painter, bank: SpriteBank | null): void;

  /** Moves it to the same place on a screen of another shape. */
  abstract fit(from: Plan, to: Plan, w: World): void;

  /** Where it is in the picture from front to back, for drawing the ones on the meadow in order. */
  get depth(): number {
    return this.y;
  }
}

/**
 * A point on a screen of another shape that is in the same place in the picture: across by the same
 * share of the width, down by the same share of the way from the horizon to the friends' feet.
 */
export function sameSpot(from: Plan, to: Plan, x: number, y: number): { x: number; y: number } {
  const down = (y - from.horizon) / Math.max(1, from.feet - from.horizon);
  return { x: (x / from.w) * to.w, y: to.horizon + down * (to.feet - to.horizon) };
}

/** The band of air above the meadow where butterflies and bees go, low among the flowers. */
export const lowAir = (plan: Plan): { readonly top: number; readonly bottom: number } => ({
  top: Math.max(plan.roam.top, plan.horizon - 84),
  bottom: plan.roam.bottom,
});

/**
 * An angle turned toward another by the short way round, at `rate` the same way at any frame rate.
 */
export function turnToward(a: number, b: number, rate: number, dt: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-rate * dt));
}
