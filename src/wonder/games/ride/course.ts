import type { Rng } from '../../../domain/rng';
import { TAU } from '../../engine/ease';
import { RIDE_HEIGHT, Runner } from './runner';
import type { Track } from './track';

/**
 * What hangs along the rainbow for her to gather: stars to ride through, arcs of stars to leap for,
 * hoops that make her fast, and shapes of stars high over the hills for a rider who steps off the
 * air. Each is a motif, placed where a rider could really get it, because the path of a leap is
 * worked out with the same rules she rides by.
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export type MotifName = 'trail' | 'arc' | 'hoop' | 'hoop-sky' | 'heart' | 'double' | 'crown';

export interface Star {
  /** Where it hangs. A star that is close to her is drawn in toward her, so these move. */
  x: number;
  y: number;
  readonly value: number;
  readonly group: number;
  /** A gem is worth more and is only up where it takes a step off the air to reach. */
  readonly gem: boolean;
  taken: boolean;
}

export interface Hoop {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly group: number;
  taken: boolean;
}

/** All the pieces of one motif, so that gathering every one of them can be a moment of its own. */
export interface Group {
  readonly id: number;
  readonly motif: MotifName;
  /** Where it begins and where it is, so it can be told where it is and what is before her. */
  readonly x: number;
  readonly size: number;
  got: number;
  /** What it is worth to gather every piece of it. */
  readonly bonus: number;
}

/** What each thing is worth, in points toward the player's five stars. */
export const WORTH = { star: 1, gem: 3, hoop: 4 } as const;

/** Spacing of stars along a trail, and along a path. */
const SPACING = 44;
const TABLE_STEP = 16;
/** The smallest and biggest space left between one motif and the next. */
const GAP: readonly [number, number] = [210, 330];

/**
 * The motifs in the order they are first allowed, with how common each is once it is. `from` is how
 * far into the ride, 0 to 1.
 */
const MOTIFS: readonly { readonly name: MotifName; readonly from: number; readonly weight: number }[] = [
  { name: 'trail', from: 0, weight: 3 },
  { name: 'arc', from: 0, weight: 4 },
  { name: 'hoop', from: 0, weight: 2 },
  { name: 'hoop-sky', from: 0.12, weight: 3 },
  { name: 'heart', from: 0.2, weight: 2.5 },
  { name: 'double', from: 0.35, weight: 2 },
  { name: 'crown', from: 0.5, weight: 2 },
];

/** How far along a ride, in units, the motifs have all been brought in. */
const FULL_RIDE = 5200;

export class Course {
  readonly stars: Star[] = [];
  readonly hoops: Hoop[] = [];
  readonly groups: Group[] = [];
  private cursor = 340;
  private nextGroup = 1;
  /** A rider who never taps, ridden ahead of her, so a motif knows how fast she will be there. */
  private readonly ghost: Runner;
  private ghostTime = 0;
  private readonly pace: number[] = [];
  private readonly flat: boolean[] = [];
  private paceFrom: number;
  private made: MotifName | null = null;

  constructor(
    private readonly track: Track,
    private readonly rng: Rng,
    start: number,
  ) {
    this.paceFrom = start;
    this.ghost = new Runner(track, start);
  }

  /** Where the next motif will begin. */
  get next(): number {
    return this.cursor;
  }

  /** Everything is placed as far as `to`. */
  fill(to: number): void {
    if (this.cursor === Infinity) return;
    this.track.extend(to + 900);
    while (this.cursor < to) {
      const motif = this.choose(this.cursor);
      this.cursor = this.place(motif, this.cursor) + this.rng.range(GAP[0], GAP[1]);
    }
  }

  /** Takes a star. Returns the group's bonus if that was the last of its group, and 0 if not. */
  take(star: Star): number {
    if (star.taken) return 0;
    star.taken = true;
    return this.got(star.group);
  }

  takeHoop(hoop: Hoop): number {
    if (hoop.taken) return 0;
    hoop.taken = true;
    return this.got(hoop.group);
  }

  private got(id: number): number {
    const group = this.groups.find((g) => g.id === id);
    if (!group) return 0;
    group.got++;
    return group.got === group.size ? group.bonus : 0;
  }

  /** Lets go of what is well behind `x`. */
  forget(x: number): void {
    retain(this.stars, (s) => s.x >= x - 500);
    retain(this.hoops, (h) => h.x >= x - 500);
    retain(this.groups, (g) => g.x >= x - 1400);
    // The ghost's table is kept only as far back as a motif could still ask.
    const behind = Math.floor((x - 900 - this.paceFrom) / TABLE_STEP);
    if (behind > 64) {
      this.pace.splice(0, behind);
      this.flat.splice(0, behind);
      this.paceFrom += behind * TABLE_STEP;
    }
  }

  /**
   * Takes away everything past `x`, and stops placing more. The finale does not want a motif where
   * its rail begins.
   */
  cut(x: number): void {
    retain(this.stars, (s) => s.x <= x);
    retain(this.hoops, (h) => h.x <= x);
    this.cursor = Infinity;
  }

  /** Starts over on the same track from `start`. */
  clear(start: number): void {
    this.stars.length = 0;
    this.hoops.length = 0;
    this.groups.length = 0;
    this.cursor = start + 340;
    this.pace.length = 0;
    this.flat.length = 0;
    this.paceFrom = start;
    this.ghost.place(start);
    this.ghostTime = 0;
    this.made = null;
  }

  /** How fast a rider who does not tap is going at `x`, and whether she is on the rainbow there. */
  private ride(x: number): { speed: number; flat: boolean } {
    const ghost = this.ghost;
    const i = Math.max(0, Math.floor((x - this.paceFrom) / TABLE_STEP));
    while (this.pace.length <= i + 1 && this.ghostTime < 240) {
      const before = ghost.x;
      ghost.step(1 / 60);
      this.ghostTime += 1 / 60;
      // She rides through a hoop that is at her height, so what comes after it is placed for the
      // speed she will have.
      for (const h of this.hoops)
        if (before < h.x && h.x <= ghost.x && Math.abs(h.y - ghost.y) < h.radius) ghost.speedUp(1);
      while (this.paceFrom + this.pace.length * TABLE_STEP <= ghost.x) {
        this.pace.push(ghost.vx);
        this.flat.push(ghost.grounded);
      }
    }
    const k = Math.min(i, this.pace.length - 1);
    return { speed: this.pace[k] ?? ghost.vx, flat: this.flat[k] ?? true };
  }

  /**
   * The first place at or after `x` where a rider who does not tap is on the rainbow, which is
   * where a leap would begin.
   */
  private groundAt(x: number): number {
    for (let at = x; at < x + 400; at += TABLE_STEP) if (this.ride(at).flat) return at;
    return x;
  }

  /** The next motif, never the one just made, and only those a rider this far along should meet. */
  private choose(x: number): MotifName {
    const level = Math.min(1, Math.max(0, x / FULL_RIDE));
    // The first three are always the gentlest, so the first thing she meets is stars to ride
    // through.
    if (this.made === null) return this.remember('trail');
    const open = MOTIFS.filter((m) => m.from <= level && m.name !== this.made);
    const picked = this.rng.weighted(open, (m) => m.weight) ?? open[0]!;
    return this.remember(picked.name);
  }

  private remember(name: MotifName): MotifName {
    this.made = name;
    return name;
  }

  /** Places a motif from `x`. Returns where it ends. */
  private place(motif: MotifName, x: number): number {
    const group = this.nextGroup++;
    switch (motif) {
      case 'trail':
        return this.trail(group, x);
      case 'arc':
        return this.arc(group, x, 9, false);
      case 'hoop':
        return this.hoop(group, x);
      case 'hoop-sky':
        return this.hoopSky(group, x);
      case 'heart':
        return this.heart(group, x);
      case 'double':
        return this.arc(group, x, 12, true);
      case 'crown':
        return this.crown(group, x);
    }
  }

  private open(id: number, motif: MotifName, x: number, size: number, bonus: number): void {
    this.groups.push({ id, motif, x, size, got: 0, bonus });
  }

  private addStar(group: number, x: number, y: number, gem = false): void {
    this.stars.push({ x, y, value: gem ? WORTH.gem : WORTH.star, group, gem, taken: false });
  }

  /** Stars in a row along the rainbow, at the height of her body: gathered by riding. */
  private trail(group: number, x: number, count = 7): number {
    this.open(group, 'trail', x, count, 2);
    for (let i = 0; i < count; i++) {
      const sx = x + i * SPACING;
      this.addStar(group, sx, this.track.heightAt(sx) - RIDE_HEIGHT);
    }
    return x + (count - 1) * SPACING;
  }

  /**
   * The path of a rider who leaps at `x`, and steps off the air `stepAt` seconds into it if that is
   * given. Found by riding it.
   */
  private leap(x: number, stepAt?: number): Pt[] {
    const { speed } = this.ride(x);
    const rider = new Runner(this.track, x, speed);
    const path: Pt[] = [{ x: rider.x, y: rider.y }];
    rider.tap();
    let stepped = stepAt === undefined;
    for (let t = 0; t < 3.5; t += 1 / 60) {
      if (!stepped && rider.air >= (stepAt ?? 0)) {
        rider.tap();
        stepped = true;
      }
      rider.step(1 / 60);
      path.push({ x: rider.x, y: rider.y });
      if (rider.grounded && t > 0.1) break;
    }
    return path;
  }

  /**
   * The points on a path, `count` of them, evenly along it between `from` and `to` of its length,
   * as shares.
   */
  private along(path: readonly Pt[], count: number, from = 0.07, to = 0.93): Pt[] {
    if (path.length < 2) return [];
    const lengths: number[] = [0];
    for (let i = 1; i < path.length; i++)
      lengths.push(lengths[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y));
    const total = lengths[lengths.length - 1]!;
    const out: Pt[] = [];
    for (let k = 0; k < count; k++) {
      const want = total * (from + ((to - from) * k) / Math.max(1, count - 1));
      let i = 1;
      while (i < lengths.length - 1 && lengths[i]! < want) i++;
      const span = lengths[i]! - lengths[i - 1]! || 1;
      const u = (want - lengths[i - 1]!) / span;
      out.push({
        x: path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * u,
        y: path[i - 1]!.y + (path[i]!.y - path[i - 1]!.y) * u,
      });
    }
    return out;
  }

  /**
   * Stars in the arc of a leap, up and over and down. With `double`, a step off the air at the top
   * carries them higher, and the highest are gems.
   */
  private arc(group: number, from: number, count: number, double: boolean): number {
    const x = this.groundAt(from);
    const path = this.leap(x, double ? 0.36 : undefined);
    const points = this.along(path, count);
    // An arc that would run into the rainbow is stopped short of it.
    const kept = points.filter((p) => p.y < this.track.heightAt(p.x) - RIDE_HEIGHT + 4);
    this.open(group, double ? 'double' : 'arc', x, kept.length, double ? 6 : 4);
    const top = kept.reduce((m, p) => Math.min(m, p.y), Infinity);
    for (const p of kept) this.addStar(group, p.x, p.y, double && p.y < top + 26);
    return kept.length > 0 ? kept[kept.length - 1]!.x : x + 200;
  }

  /** A hoop she rides through on the rainbow, with a trail of stars past it to ride on in. */
  private hoop(group: number, x: number): number {
    this.open(group, 'hoop', x, 1 + 4, 3);
    this.hoops.push({ x, y: this.track.heightAt(x) - RIDE_HEIGHT, radius: 46, group, taken: false });
    for (let i = 1; i <= 4; i++) {
      const sx = x + 90 + i * SPACING;
      this.addStar(group, sx, this.track.heightAt(sx) - RIDE_HEIGHT);
    }
    return x + 90 + 4 * SPACING;
  }

  /** A leap that goes through a hoop at its top: stars up to it, the hoop, and stars down. */
  private hoopSky(group: number, from: number): number {
    const x = this.groundAt(from);
    const path = this.leap(x);
    let top = path[0]!;
    for (const p of path) if (p.y < top.y) top = p;
    const before = this.along(
      path.filter((p) => p.x < top.x - 18),
      3,
      0.12,
      0.92,
    );
    const after = this.along(
      path.filter((p) => p.x > top.x + 18),
      3,
      0.08,
      0.88,
    );
    const ok = (p: Pt): boolean => p.y < this.track.heightAt(p.x) - RIDE_HEIGHT + 4;
    const stars = [...before, ...after].filter(ok);
    this.open(group, 'hoop-sky', x, stars.length + 1, 4);
    for (const p of stars) this.addStar(group, p.x, p.y);
    this.hoops.push({ x: top.x, y: top.y, radius: 48, group, taken: false });
    return Math.max(top.x + 120, ...stars.map((s) => s.x));
  }

  /**
   * A heart of stars over a hill, just where the top of a leap reaches, with stars on the way up to
   * it.
   */
  private heart(group: number, from: number): number {
    const x = this.groundAt(from);
    const path = this.leap(x);
    let top = path[0]!;
    for (const p of path) if (p.y < top.y) top = p;
    const lead = this.along(
      path.filter((p) => p.x < top.x - 40),
      3,
      0.1,
      0.8,
    );
    const radius = 30;
    const points: Pt[] = [];
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      points.push({
        x: 16 * Math.sin(t) ** 3,
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      });
    }
    // The tip of the heart is its lowest point. It is put where a leap reaches, so the lower half
    // is for a leap and the rest for a step off the air.
    const tip = points.reduce((m, p) => Math.max(m, p.y), -Infinity);
    const cx = top.x + 36;
    const cy = top.y + 6 - tip * (radius / 16);
    const cluster = points.map((p) => ({ x: cx + p.x * (radius / 16), y: cy + p.y * (radius / 16) }));
    const kept = [...lead, ...cluster].filter((p) => p.y < this.track.heightAt(p.x) - RIDE_HEIGHT - 6);
    this.open(group, 'heart', x, kept.length, 6);
    for (const p of kept) this.addStar(group, p.x, p.y);
    return cx + radius + 30;
  }

  /**
   * Three hoops one after another, each higher than the last, with a gem at the end: a boost that
   * carries her up a staircase of light.
   */
  private crown(group: number, from: number): number {
    const x = this.groundAt(from);
    const path = this.leap(x, 0.34);
    const picks = this.along(path, 6, 0.1, 0.9);
    const rings = [picks[1]!, picks[3]!, picks[5]!].filter((p) => p.y < this.track.heightAt(p.x) - RIDE_HEIGHT);
    const stars = [picks[0]!, picks[2]!, picks[4]!].filter((p) => p.y < this.track.heightAt(p.x) - RIDE_HEIGHT + 4);
    this.open(group, 'crown', x, rings.length + stars.length, 7);
    for (const r of rings) this.hoops.push({ x: r.x, y: r.y, radius: 44, group, taken: false });
    for (const s of stars) this.addStar(group, s.x, s.y, true);
    const last = path[path.length - 1]!;
    return Math.max(last.x, ...rings.map((r) => r.x)) + 40;
  }
}

/** Keeps only what `keep` says to keep, in place and in order. */
function retain<T>(list: T[], keep: (item: T) => boolean): void {
  let n = 0;
  for (const item of list) if (keep(item)) list[n++] = item;
  list.length = n;
}
