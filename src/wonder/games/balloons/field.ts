import type { Rng } from '../../../domain/rng';
import type { UnicornId } from '../../../shared/ids';
import { Bag } from '../../engine/bag';
import { clamp, damp, lerp, Spring } from '../../engine/ease';
import { DEGREES, type Degree } from './notes';

/**
 * The balloons of the game and how they move: where they come from, how they float, which one a
 * finger has found. Nothing in here draws or makes a sound, so the way balloons are placed and
 * found can be tested without a screen.
 */

export type Kind = 'note' | 'star' | 'heart' | 'gift';

/** The size of a big balloon, a small one, and a special one, as a radius in units. */
export const R_LOW = 30;
export const R_HIGH = 23;
export const R_SPECIAL = 36;
/**
 * A balloon of the bouquet, a little smaller than a free one so that five of them fit side by side
 * on a fan of strings.
 */
export const R_BOUQUET = 29;

/** The most balloons there may be at once, which keeps a long play from piling them up. */
const MOST = 44;

/**
 * Which of three layers a balloon is drawn in: the free ones that sing, the special ones, and the
 * bouquet in front of all.
 */
const layerOf = (b: Balloon): number => (b.tie ? 2 : b.kind === 'note' ? 0 : 1);

/**
 * A balloon of the bouquet is tied to the gift by a string. The angle is from straight up, in
 * radians.
 */
export interface Tie {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly angle: number;
}

export interface Balloon {
  readonly id: number;
  readonly kind: Kind;
  /** The note it sings. A special balloon has none of its own. */
  readonly degree: Degree;
  /** A small balloon sings the note an octave up. */
  readonly high: boolean;
  /** Whose magic a gift is. */
  readonly gift: UnicornId | null;
  /** How big it is, from its middle to its edge. */
  readonly r: number;
  /** The middle of the balloon. */
  x: number;
  y: number;
  /** Sideways speed from a push, which dies away. */
  vx: number;
  /** How fast it floats up, in units a second. */
  readonly rise: number;
  readonly sway: number;
  readonly rate: number;
  readonly phase: number;
  age: number;
  /** Where its string is tied, for a balloon of the bouquet. */
  readonly tie: Tie | null;
  /** From 0 as it is blown up to 1, with a spring in it. */
  readonly grow: Spring;
  /** A knock to its shape, from a push or a pop next to it. */
  readonly bump: Spring;
  /** How far a tied balloon has swung on its string. */
  readonly swing: Spring;
  /** How hard the song is asking for this balloon now, from 0 to 1. The game moves it. */
  call: number;
  /** How far it leans, and how far the end of its string trails behind. */
  tilt: number;
  tail: number;
  /** Floating away fast, to clear the sky. */
  leaving: boolean;
}

/** Where balloons live on the screen. */
export interface Area {
  readonly w: number;
  /** The height a balloon has gone from the top of the screen at. */
  readonly top: number;
  /** The line balloons rise from, hidden behind the hills. */
  readonly floor: number;
  /** How near the sides the middle of a balloon may come. */
  readonly edge: number;
}

export interface Launch {
  x?: number;
  y?: number;
  degree?: Degree;
  high?: boolean;
  kind?: Kind;
  gift?: UnicornId;
  rise?: number;
  /**
   * Whether it is already as big as it gets, which is so unless it is said otherwise. A balloon
   * that is not is blown up from nothing.
   */
  grown?: boolean;
}

export class Field {
  readonly balloons: Balloon[] = [];
  private nextId = 1;
  private readonly bag: Bag<Degree>;

  constructor(private readonly rng: Rng) {
    this.bag = new Bag(DEGREES, rng);
  }

  /** The balloons that float on their own. */
  get free(): number {
    let n = 0;
    for (const b of this.balloons) if (!b.tie && !b.leaving) n++;
    return n;
  }

  clear(): void {
    this.balloons.length = 0;
  }

  private make(o: {
    kind: Kind;
    degree: Degree;
    high: boolean;
    gift: UnicornId | null;
    r: number;
    x: number;
    y: number;
    rise: number;
    tie: Tie | null;
    grown: boolean;
  }): Balloon {
    const rng = this.rng;
    const b: Balloon = {
      id: this.nextId++,
      kind: o.kind,
      degree: o.degree,
      high: o.high,
      gift: o.gift,
      r: o.r,
      x: o.x,
      y: o.y,
      vx: 0,
      rise: o.rise,
      sway: rng.range(6, 15),
      rate: rng.range(0.7, 1.3),
      phase: rng.range(0, Math.PI * 2),
      age: rng.range(0, 3),
      tie: o.tie,
      grow: new Spring(o.grown ? 1 : 0, 1, 150, 9),
      bump: new Spring(0, 0, 260, 11),
      swing: new Spring(0, 0, 40, 3.2),
      call: 0,
      tilt: 0,
      tail: 0,
      leaving: false,
    };
    this.balloons.push(b);
    // A long play never piles them up: the oldest that floats free is let go first, and a tied one
    // never is.
    if (this.balloons.length > MOST) {
      const old = this.balloons.findIndex((x) => !x.tie);
      if (old >= 0) this.balloons.splice(old, 1);
    }
    return b;
  }

  /** Lets a balloon go from the hills. Anything left out is chosen: where, which note, how big. */
  launch(area: Area, o: Launch = {}): Balloon {
    const rng = this.rng;
    const kind = o.kind ?? 'note';
    const high = kind === 'note' && (o.high ?? rng.next() < 0.3);
    const r = kind !== 'note' ? R_SPECIAL : high ? R_HIGH : R_LOW;
    const y = o.y ?? area.floor + r + 14;
    const x = o.x ?? this.openSpot(area, y, r);
    const rise = o.rise ?? (kind === 'note' ? rng.range(24, 36) * (high ? 1.15 : 1) : rng.range(17, 22));
    return this.make({
      kind,
      degree: o.degree ?? this.bag.next(),
      high,
      gift: o.gift ?? null,
      r,
      x,
      y,
      rise,
      tie: null,
      grown: o.grown ?? true,
    });
  }

  /** A balloon on a string. It is blown up from nothing unless it is `grown`. */
  tie(on: Tie, degree: Degree, grown = false): Balloon {
    const x = on.x + Math.sin(on.angle) * on.length;
    const y = on.y - Math.cos(on.angle) * on.length;
    return this.make({ kind: 'note', degree, high: false, gift: null, r: R_BOUQUET, x, y, rise: 0, tie: on, grown });
  }

  /**
   * Fills the sky with balloons already on their way, at all heights, so a game never opens on an
   * empty one.
   */
  seed(area: Area, count: number): void {
    for (let i = 0; i < count; i++) {
      const y = lerp(area.top + 70, area.floor - 30, (i + this.rng.next()) / count);
      this.launch(area, { y });
    }
  }

  /**
   * The five notes of the scale, one after another, as a row of balloons the player can sweep a
   * finger across.
   */
  wave(area: Area, up: boolean): Balloon[] {
    const rows = DEGREES.map((d) => (up ? d : ((4 - d) as Degree)));
    const from = Math.max(area.edge + R_LOW, area.w * 0.14);
    const to = Math.min(area.w - area.edge - R_LOW, area.w * 0.86);
    const rise = this.rng.range(28, 32);
    return rows.map((degree, i) =>
      this.launch(area, {
        x: lerp(from, to, i / (rows.length - 1)),
        y: area.floor + R_LOW + 14 + i * 22,
        degree,
        high: false,
        rise,
      }),
    );
  }

  /**
   * The middle of a gap in the balloons at this height, as far as can be had from the ones already
   * there.
   */
  private openSpot(area: Area, y: number, r: number): number {
    const lo = area.edge + r;
    const hi = Math.max(lo, area.w - area.edge - r);
    let best = (lo + hi) / 2;
    let bestGap = -1;
    for (let k = 0; k < 10; k++) {
      const x = this.rng.range(lo, hi);
      let gap = Infinity;
      for (const b of this.balloons) {
        if (b.tie) continue;
        // Balloons are far taller than wide to a finger, so height counts for less than the
        // distance sideways.
        gap = Math.min(gap, Math.hypot(b.x - x, (b.y - y) * 0.6) - b.r);
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }

  update(dt: number, area: Area): void {
    for (const b of this.balloons) {
      b.age += dt;
      b.grow.step(dt);
      b.bump.step(dt);
      if (b.tie) this.hang(b, dt);
      else this.float(b, dt, area);
    }
    this.apart(dt);
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      if (this.balloons[i]!.y < area.top - this.balloons[i]!.r) this.balloons.splice(i, 1);
    }
  }

  /** A balloon on its string sways, swings when it is knocked, and bobs a little. */
  private hang(b: Balloon, dt: number): void {
    const t = b.tie!;
    b.swing.kick(b.vx * 0.003);
    b.vx = 0;
    const angle = t.angle + 0.05 * Math.sin(b.rate * b.age + b.phase) + b.swing.step(dt);
    b.x = t.x + Math.sin(angle) * t.length;
    b.y = t.y - Math.cos(angle) * t.length + 2.6 * Math.sin(1.3 * b.rate * b.age + b.phase);
    b.tilt = damp(b.tilt, angle * 0.8, 8, dt);
    b.tail = 0;
  }

  private float(b: Balloon, dt: number, area: Area): void {
    const sideways = b.sway * b.rate * Math.cos(b.rate * b.age + b.phase) + b.vx;
    b.vx *= Math.exp(-1.6 * dt);
    b.x += sideways * dt;
    b.y -= (b.leaving ? b.rise * 4.5 : b.rise) * dt;
    const lo = area.edge;
    const hi = area.w - area.edge;
    if (b.x < lo) b.vx += (lo - b.x) * 9 * dt;
    else if (b.x > hi) b.vx -= (b.x - hi) * 9 * dt;
    b.tilt = damp(b.tilt, clamp(sideways * 0.012, -0.35, 0.35), 6, dt);
    b.tail = damp(b.tail, -sideways * 0.12, 3, dt);
  }

  /** Balloons that float into each other slide round each other. */
  private apart(dt: number): void {
    const k = 1 - Math.exp(-8 * dt);
    const all = this.balloons;
    for (let i = 0; i < all.length; i++) {
      const a = all[i]!;
      if (a.tie || a.leaving) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]!;
        if (b.tie || b.leaving) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const reach = (a.r + b.r) * 0.9;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        const d = Math.hypot(dx, dy);
        if (d >= reach) continue;
        const nx = d > 0.001 ? dx / d : 1;
        const ny = d > 0.001 ? dy / d : 0;
        const move = (reach - d) * 0.5 * k;
        a.x -= nx * move;
        b.x += nx * move;
        a.y -= ny * move * 0.3;
        b.y += ny * move * 0.3;
      }
    }
  }

  /**
   * The balloon a finger at this point has found, if any. `slack` is how far from the edge of a
   * balloon counts as touching it.
   */
  at(x: number, y: number, slack: number, which: 'any' | 'tied' | 'free' = 'any'): Balloon | null {
    let top: Balloon | null = null;
    let topRank = -1;
    let near: Balloon | null = null;
    let nearScore = Infinity;
    for (let i = 0; i < this.balloons.length; i++) {
      const b = this.balloons[i]!;
      if (b.leaving || b.grow.x < 0.5) continue;
      if (which !== 'any' && (which === 'tied') !== (b.tie !== null)) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d > b.r + slack) continue;
      if (d <= b.r) {
        // A touch on the body of a balloon finds the one that is drawn on top there.
        const rank = layerOf(b) * 1000 + i;
        if (rank > topRank) {
          topRank = rank;
          top = b;
        }
        continue;
      }
      // A touch just beside balloons finds the nearest in proportion to its size, so a small one
      // beside a big one can still be touched.
      const score = d / (b.r + slack);
      if (score < nearScore) {
        nearScore = score;
        near = b;
      }
    }
    return top ?? near;
  }

  /**
   * The balloons a finger passed through going from one point to another, in the order it met them.
   */
  along(x0: number, y0: number, x1: number, y1: number, slack: number): Balloon[] {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length2 = dx * dx + dy * dy;
    const met: { b: Balloon; t: number }[] = [];
    for (const b of this.balloons) {
      if (b.leaving || b.grow.x < 0.5) continue;
      const t = length2 < 1e-6 ? 0 : clamp(((b.x - x0) * dx + (b.y - y0) * dy) / length2);
      if (Math.hypot(b.x - (x0 + dx * t), b.y - (y0 + dy * t)) <= b.r + slack) met.push({ b, t });
    }
    return met.sort((a, b) => a.t - b.t).map((m) => m.b);
  }

  /** Pushes the balloons near a point away from it, the way a breath would. */
  push(x: number, y: number, reach: number, speed: number): void {
    for (const b of this.balloons) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d > reach + b.r || b.leaving) continue;
      const fall = 1 - d / (reach + b.r);
      const away = b.x >= x ? 1 : -1;
      b.vx += away * speed * fall;
      b.bump.kick(2.2 * fall);
    }
  }

  remove(b: Balloon): void {
    const i = this.balloons.indexOf(b);
    if (i >= 0) this.balloons.splice(i, 1);
  }

  /**
   * How many big balloons of this note can be seen, which the song wants to be at least one. With
   * `onlyFree` the bouquet is not counted.
   */
  visible(degree: Degree, area: Area, onlyFree = false): number {
    let n = 0;
    for (const b of this.balloons) {
      if (onlyFree && b.tie) continue;
      if (b.kind === 'note' && !b.high && !b.leaving && b.degree === degree && b.y > area.top + b.r && b.grow.x > 0.5)
        n++;
    }
    return n;
  }
}
