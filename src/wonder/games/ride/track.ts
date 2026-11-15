import type { Rng } from '../../../domain/rng';

/**
 * The rainbow she rides. It is one height for every place along it, made of hills that join where
 * the rainbow is flat, so the top of a hill and the bottom of a valley are the only flat places and
 * every slope in between is smooth. A hill is a fall or a rise from one flat place to the next. The
 * track is made as it is needed, a little ahead of where she is, so it never ends, and it is made
 * from the game's random numbers, so a seed always gives the same rainbow.
 */

/**
 * One fall or rise, from the flat place at `x0` to the one at `x1`. Heights are screen heights, so
 * a smaller one is higher.
 */
export interface Hill {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly kind: HillKind;
}

/**
 * How a hill feels. A bump is short and steep, so a rider who is fast leaves the ground at its top.
 * A swell is long and carries speed.
 */
export type HillKind = 'roll' | 'swell' | 'bump' | 'ramp' | 'drop' | 'start';

interface Shape {
  readonly kind: HillKind;
  readonly length: readonly [number, number];
  readonly change: readonly [number, number];
}

/** The hills that follow a rise, which fall, and the ones that follow a fall, which rise. */
const FALLS: readonly Shape[] = [
  { kind: 'roll', length: [340, 460], change: [70, 120] },
  { kind: 'swell', length: [560, 700], change: [150, 220] },
  { kind: 'drop', length: [300, 380], change: [150, 200] },
];
const RISES: readonly Shape[] = [
  { kind: 'roll', length: [340, 460], change: [60, 110] },
  { kind: 'bump', length: [240, 300], change: [100, 140] },
  { kind: 'ramp', length: [210, 250], change: [80, 120] },
];

/**
 * The highest and the lowest the rainbow wanders from where it began, in units. The track always
 * turns back before them.
 */
export const HIGHEST = -320;
export const LOWEST = 170;
/** How far the flat start reaches behind where she begins. */
const RUNWAY = 420;

export class Track {
  private readonly hills: Hill[] = [];
  /** The hill the last question was in, since questions come in nearly in order. */
  private at = 0;

  constructor(private readonly rng: Rng) {
    this.hills.push({ x0: -RUNWAY, x1: 0, y0: 0, y1: 0, kind: 'start' });
  }

  /** Where the track has been made to, so far. */
  get end(): number {
    return this.hills[this.hills.length - 1]!.x1;
  }

  /** Where it begins. */
  get start(): number {
    return this.hills[0]!.x0;
  }

  get all(): readonly Hill[] {
    return this.hills;
  }

  /** Makes the track as far as `x`, and a little beyond. */
  extend(x: number): void {
    while (this.end < x) this.grow();
  }

  /**
   * Lets go of the hills that are well behind `x`. The one under `x` and the one before it always
   * stay.
   */
  forget(x: number): void {
    let drop = 0;
    while (drop < this.hills.length - 2 && this.hills[drop + 1]!.x1 < x) drop++;
    if (drop > 0) {
      this.hills.splice(0, drop);
      this.at = Math.max(0, this.at - drop);
    }
  }

  private grow(): void {
    const last = this.hills[this.hills.length - 1]!;
    // After a fall it rises, and after a rise it falls. The first hill, after the flat start,
    // falls, since a ride begins with a slide. A track that has wandered too high or too low is
    // turned back, so a long ride never runs out of sky or into the sea.
    let rises = last.y1 > last.y0;
    if (last.y1 < HIGHEST * 0.5) rises = false;
    else if (last.y1 > LOWEST * 0.5) rises = true;
    const options = rises ? RISES : FALLS;
    const pick = this.pickShape(options, last.kind);
    const length = this.rng.range(pick.length[0], pick.length[1]);
    let change = this.rng.range(pick.change[0], pick.change[1]);
    // Never past the limits, however big the hill wanted to be.
    const to = rises ? last.y1 - change : last.y1 + change;
    if (to < HIGHEST) change = last.y1 - HIGHEST;
    else if (to > LOWEST) change = LOWEST - last.y1;
    this.hills.push({
      x0: last.x1,
      x1: last.x1 + length,
      y0: last.y1,
      y1: rises ? last.y1 - change : last.y1 + change,
      kind: pick.kind,
    });
  }

  /** A shape of the list, not the same as the last hill's kind unless there is no other. */
  private pickShape(options: readonly Shape[], not: HillKind): Shape {
    const others = options.filter((s) => s.kind !== not);
    const from = others.length > 0 ? others : options;
    return from[this.rng.int(from.length)]!;
  }

  private hillAt(x: number): Hill {
    const hills = this.hills;
    let i = Math.min(this.at, hills.length - 1);
    while (i > 0 && x < hills[i]!.x0) i--;
    while (i < hills.length - 1 && x >= hills[i]!.x1) i++;
    this.at = i;
    return hills[i]!;
  }

  /** The height of the rainbow's middle at `x`. Past either end it is the height of that end. */
  heightAt(x: number): number {
    const h = this.hillAt(x);
    if (x <= h.x0) return h.y0;
    if (x >= h.x1) return h.y1;
    const u = (x - h.x0) / (h.x1 - h.x0);
    return h.y0 + (h.y1 - h.y0) * 0.5 * (1 - Math.cos(Math.PI * u));
  }

  /** How steep it is at `x`: the change in height for each unit along. Positive is a fall. */
  slopeAt(x: number): number {
    const h = this.hillAt(x);
    if (x <= h.x0 || x >= h.x1) return 0;
    const len = h.x1 - h.x0;
    return ((h.y1 - h.y0) * Math.PI * 0.5 * Math.sin((Math.PI * (x - h.x0)) / len)) / len;
  }

  /**
   * How sharply it bends at `x`, in height per unit squared. Positive at the top of a hill and
   * negative at the bottom of a valley.
   */
  bendAt(x: number): number {
    const h = this.hillAt(x);
    if (x <= h.x0 || x >= h.x1) return 0;
    const len = h.x1 - h.x0;
    const k = Math.PI / len;
    return (h.y1 - h.y0) * 0.5 * k * k * Math.cos(k * (x - h.x0));
  }

  /**
   * The end of the first fall that finishes at least `ahead` after `x`: a valley, where the rainbow
   * is flat, which is where a part of it can be swapped for another without a bend showing. The
   * track is made as far as it needs.
   */
  valleyAfter(x: number, ahead: number): { x: number; y: number } {
    for (let guard = 0; guard < 200; guard++) {
      this.extend(x + ahead + 1600);
      for (const h of this.hills) {
        if (h.x1 >= x + ahead && h.y1 > h.y0) return { x: h.x1, y: h.y1 };
      }
      this.grow();
    }
    throw new Error('no valley found');
  }

  /** Ends the track where a hill ends, so something else can carry on from the flat place there. */
  cut(x: number): void {
    while (this.hills.length > 1 && this.hills[this.hills.length - 1]!.x0 >= x - 0.001) this.hills.pop();
    if (Math.abs(this.end - x) > 0.001)
      throw new Error(`the track can only be cut where a hill ends, and none ends at ${x}`);
    this.at = Math.min(this.at, this.hills.length - 1);
  }
}
