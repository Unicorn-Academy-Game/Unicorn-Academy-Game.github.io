import { smoother, unlerp } from '../../engine/ease';
import { FEET } from '../../engine/herd';
import type { Bend } from './ribbon';
import { RIDE_HEIGHT } from './runner';

/**
 * The finale's way, laid out once in front of her and walked along: a straight run through three
 * hoops, a loop the size of a house, a ramp, a leap across the sky with a somersault in the middle,
 * a splash in a pool of jewels and a glide to a stop. It is one line of points a few units apart,
 * with how she looks at each, so that she and every friend behind her is only ever "this far
 * along". Nothing here moves: where she is on it is the game's business.
 */

/** The numbers that shape it. */
export interface Plan {
  /** A straight run before the loop, with the hoops on it. */
  readonly runIn: number;
  /**
   * How big the loop is, and how far it carries her forward from where it starts to where it ends.
   */
  readonly loopRadius: number;
  readonly loopShift: number;
  /** A straight run between the loop and the ramp. */
  readonly exit: number;
  /** The ramp is a bend of this radius that turns her up to the angle she leaps at. */
  readonly rampRadius: number;
  /** In radians above the level, and in units a second. */
  readonly launchAngle: number;
  readonly launchSpeed: number;
  /** How fast she falls in the air: far less than a thing falls, so she hangs. */
  readonly gravity: number;
  /** How far lower than the ramp the water is. */
  readonly drop: number;
  /** How far her hooves go under the water when she lands. */
  readonly wade: number;
  /** The glide through the water, after the splash. */
  readonly glide: number;
  /** How wide the pool is past where she lands and where she stops. */
  readonly margin: number;
}

export const PLAN: Plan = {
  runIn: 560,
  loopRadius: 190,
  loopShift: 150,
  exit: 130,
  rampRadius: 300,
  launchAngle: 0.92,
  launchSpeed: 800,
  gravity: 520,
  drop: 130,
  wade: 16,
  glide: 540,
  margin: 300,
};

/** How far apart the points are, about. */
export const STEP = 6;

/** Where she is and how she looks at one place along the way. */
export interface Spot {
  /** The middle of her body. */
  x: number;
  y: number;
  /**
   * How far she is turned, in radians, turning clockwise. On the rainbow that is along it, upside
   * down in the loop. In the air it is a lean and then a somersault.
   */
  turn: number;
  /** Whether she is off the rainbow. */
  air: boolean;
  /** How far her legs have run. */
  dist: number;
}

export const newSpot = (): Spot => ({ x: 0, y: 0, turn: 0, air: false, dist: 0 });

/** The pool she lands in. */
export interface Pool {
  left: number;
  right: number;
  /** The surface of the water. */
  y: number;
  /** The middle, under the rainbow that grows over it. */
  centre: number;
}

/** The places along the way where something happens, in how far along she is. */
export interface Marks {
  /** The ring she rides through on the way in. */
  hoops: readonly number[];
  loopIn: number;
  loopTop: number;
  loopOut: number;
  /** Where she leaves the rainbow. */
  launch: number;
  /** Where she meets the water. */
  land: number;
  /** The stars she flies through, in the air. */
  stars: readonly number[];
}

const HOOPS = 3;
const STARS = 15;
const RAIL_STEP = 8;
/**
 * How much of her flight is the somersault, from when she has left the ramp to just before she
 * lands.
 */
const FLIP: readonly [number, number] = [0.16, 0.84];
/** How much she leans toward the way she is going while she flies. */
const LEAN = 0.4;

interface Dense {
  x: number;
  y: number;
  turn: number;
  air: boolean;
  pace: number;
}

export class Journey {
  /** The rainbow part, to be drawn: the middle line of it with which way is up. */
  readonly rail: Bend[] = [];
  readonly marks: Marks;
  readonly pool: Pool;
  readonly length: number;
  /** How long she is in the air, in seconds, when she goes at the pace the leap sets. */
  readonly flightSeconds: number;
  /** The loop's middle and its half height, for a camera that wants to see all of it. */
  readonly loop: { x: number; y: number; radius: number };
  readonly landing: { x: number; y: number };
  private readonly step: number;
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly turns: Float32Array;
  private readonly dists: Float32Array;
  private readonly paces: Float32Array;
  private readonly airs: Uint8Array;

  /** Lays the way from where the rainbow ends: the middle line of its end point, running level. */
  constructor(
    origin: { x: number; y: number },
    readonly plan: Plan = PLAN,
  ) {
    const line: { x: number; y: number }[] = [{ x: origin.x, y: origin.y }];
    // Which way each point of the line is going, as a turn that is carried on rather than wrapped:
    // after a loop it is a whole turn round, and stays so.
    const heads: number[] = [0];
    const index = { land: 0, loopIn: 0, loopTop: 0, loopOut: 0, launch: 0 };
    const push = (x: number, y: number, heading: number): void => {
      line.push({ x, y });
      heads.push(heading);
    };
    const straight = (length: number, heading: number): void => {
      const last = line[line.length - 1]!;
      for (let d = 1; d <= length; d += 2)
        push(last.x + Math.cos(heading) * d, last.y + Math.sin(heading) * d, heading);
    };

    // The run-in, then the loop. A loop that comes back to where it started would cross itself, so
    // it is carried forward a little as it turns.
    straight(plan.runIn, 0);
    index.loopIn = line.length - 1;
    const base = line[line.length - 1]!;
    const { loopRadius: R, loopShift: d } = plan;
    const rounds = 360;
    let heading = 0;
    for (let i = 1; i <= rounds; i++) {
      const a = (i / rounds) * Math.PI * 2;
      const x = base.x + R * Math.sin(a) + (d * a) / (Math.PI * 2);
      const y = base.y - R * (1 - Math.cos(a));
      // Which way she is going: the slope of the curve there, carried on from the point before it
      // so that going over the top does not wrap.
      heading = unwrap(heading, Math.atan2(-R * Math.sin(a), R * Math.cos(a) + d / (Math.PI * 2)));
      push(x, y, heading);
      if (i === rounds / 2) index.loopTop = line.length - 1;
    }
    // She has gone a whole turn backward, and it is the same turn that every point after the loop
    // carries.
    const turned = -Math.PI * 2;
    heads[heads.length - 1] = turned;
    index.loopOut = line.length - 1;
    this.loop = { x: base.x + d / 2, y: base.y - R, radius: R };

    // Level again, then up the ramp: a bend that ends pointing the way she will leap.
    straight(plan.exit, turned);
    const rampFrom = line[line.length - 1]!;
    const R2 = plan.rampRadius;
    const bends = 60;
    for (let i = 1; i <= bends; i++) {
      const a = (i / bends) * plan.launchAngle;
      push(rampFrom.x + R2 * Math.sin(a), rampFrom.y - R2 * (1 - Math.cos(a)), turned - a);
    }
    index.launch = line.length - 1;

    // The rail is drawn from the middle line, resampled evenly, with which way is up at each place.
    this.rail = resample(line, RAIL_STEP).map((p, i, all) => {
      const next = all[Math.min(i + 1, all.length - 1)]!;
      const prev = all[Math.max(i - 1, 0)]!;
      const heading = Math.atan2(next.y - prev.y, next.x - prev.x);
      return { x: p.x, y: p.y, nx: Math.sin(heading), ny: -Math.cos(heading) };
    });

    // She rides on top of the rainbow, a body's height above its middle, on the side that is up
    // from it.
    const dense: Dense[] = line.map((p, i) => {
      const h = heads[i]!;
      return { x: p.x + Math.sin(h) * RIDE_HEIGHT, y: p.y - Math.cos(h) * RIDE_HEIGHT, turn: h, air: false, pace: 0 };
    });

    // The leap. It starts where the ramp ends, goes the way the ramp points, and comes down in the
    // water.
    const launch = dense[dense.length - 1]!;
    const vx = Math.cos(plan.launchAngle) * plan.launchSpeed;
    const vy = -Math.sin(plan.launchAngle) * plan.launchSpeed;
    const g = plan.gravity;
    const time = (-vy + Math.sqrt(vy * vy + 2 * g * plan.drop)) / g;
    this.flightSeconds = time;
    const frames = Math.ceil(time * 240);
    for (let i = 1; i <= frames; i++) {
      const t = (i / frames) * time;
      const u = t / time;
      const lean = Math.atan2(vy + g * t, vx) * LEAN;
      const flip = Math.PI * 2 * smoother(unlerp(FLIP[0], FLIP[1], u));
      // The ramp turns her up and the leap turns her to the sky: from the one to the other over a
      // moment, not at once.
      const blend = smoother(unlerp(0, 0.12, u));
      const turn = (1 - blend) * launch.turn + blend * (turned + lean + flip);
      dense.push({
        x: launch.x + vx * t,
        y: launch.y + vy * t + 0.5 * g * t * t,
        turn,
        air: true,
        pace: Math.hypot(vx, vy + g * t),
      });
    }
    index.land = dense.length - 1;
    const down = dense[dense.length - 1]!;
    // She comes down with the lean of the fall, a whole turn done, and straightens as she glides.
    const leanDown = down.turn;
    for (let d = 2; d <= plan.glide; d += 2) {
      dense.push({ x: down.x + d, y: down.y, turn: leanDown * Math.exp(-d / 70), air: false, pace: 0 });
    }
    this.landing = { x: down.x, y: down.y };

    // Along it evenly: the same few units between every point, whatever she is doing there.
    const cum = lengths(dense);
    const total = cum[cum.length - 1]!;
    const count = Math.ceil(total / STEP);
    this.step = total / count;
    this.length = total;
    const n = count + 1;
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.turns = new Float32Array(n);
    this.dists = new Float32Array(n);
    this.paces = new Float32Array(n);
    this.airs = new Uint8Array(n);
    let j = 0;
    let dist = 0;
    for (let k = 0; k < n; k++) {
      const s = k * this.step;
      while (j < dense.length - 2 && cum[j + 1]! < s) j++;
      const a = dense[j]!;
      const b = dense[Math.min(j + 1, dense.length - 1)]!;
      const span = cum[Math.min(j + 1, dense.length - 1)]! - cum[j]!;
      const u = span > 0 ? Math.min(1, Math.max(0, (s - cum[j]!) / span)) : 0;
      this.xs[k] = a.x + (b.x - a.x) * u;
      this.ys[k] = a.y + (b.y - a.y) * u;
      this.turns[k] = a.turn + (b.turn - a.turn) * u;
      this.paces[k] = a.pace + (b.pace - a.pace) * u;
      this.airs[k] = a.air ? 1 : 0;
      if (k > 0 && this.airs[k] === 0) dist += this.step;
      this.dists[k] = dist;
    }

    const landS = cum[index.land]!;
    const launchS = cum[index.launch]!;
    const hoops = Array.from({ length: HOOPS }, (_, i) => (plan.runIn * (i + 1.2)) / (HOOPS + 1.4));
    const stars = Array.from(
      { length: STARS },
      (_, i) => launchS + (landS - launchS) * (0.1 + (0.8 * i) / (STARS - 1)),
    );
    this.marks = {
      hoops,
      loopIn: cum[index.loopIn]!,
      loopTop: cum[index.loopTop]!,
      loopOut: cum[index.loopOut]!,
      launch: launchS,
      land: landS,
      stars,
    };
    const poolY = down.y + FEET - plan.wade;
    this.pool = {
      left: down.x - plan.margin,
      right: down.x + plan.glide + plan.margin,
      y: poolY,
      centre: down.x + plan.glide / 2,
    };
  }

  /**
   * Where she is, and how she looks, when she has come `s` along. Before the start and past the end
   * she is at the start and the end.
   */
  at(s: number, out: Spot = newSpot()): Spot {
    const f = Math.min(Math.max(s / this.step, 0), this.xs.length - 1);
    const i = Math.min(Math.floor(f), this.xs.length - 2);
    const u = f - i;
    out.x = this.xs[i]! + (this.xs[i + 1]! - this.xs[i]!) * u;
    out.y = this.ys[i]! + (this.ys[i + 1]! - this.ys[i]!) * u;
    out.turn = this.turns[i]! + (this.turns[i + 1]! - this.turns[i]!) * u;
    out.dist = this.dists[i]! + (this.dists[i + 1]! - this.dists[i]!) * u;
    out.air = this.airs[i] === 1;
    return out;
  }

  /**
   * How fast she goes along the way where the leap decides it, and 0 where she decides it herself.
   */
  paceAt(s: number): number {
    const f = Math.min(Math.max(s / this.step, 0), this.paces.length - 1);
    const i = Math.min(Math.floor(f), this.paces.length - 2);
    return this.paces[i]! + (this.paces[i + 1]! - this.paces[i]!) * (f - i);
  }

  /**
   * How far along friend `i` is when she is `s` along (`0` is she). They are a gap apart on the way
   * to the leap, and spread out while they fly, so they come down into the water one after another
   * and not all at once.
   */
  place(s: number, i: number): number {
    const m = this.marks;
    const spread = 1 + (SPREAD - 1) * smoother(unlerp(m.launch, m.land, s));
    return s - SPACING * i * spread;
  }

  /**
   * Where friend `i` of `friends` stops in the water: they stand in a row, the leader at the front,
   * the whole row under the middle of the rainbow.
   */
  rest(i: number, friends: number): number {
    return this.marks.land + this.plan.glide / 2 + (RESTING_GAP * friends) / 2 - RESTING_GAP * i;
  }
}

/**
 * How far apart friends are along the way while they follow her. Five of them in a line are five of
 * these behind her, and that has to be less than from one end of the loop's crossing to the other,
 * so the one at the back is never where she is.
 */
export const SPACING = 110;

/** How many times that gap is the gap by the time they come down. */
export const SPREAD = 1.9;

/** How far apart they stand when they have stopped. */
export const RESTING_GAP = 98;

/** How far from where it stops something in the water starts to slow. */
export const RESTING_EASE = 90;

/**
 * Where something that wants to go on to `s` but has to stop at `rest` has got to. It keeps its
 * pace until it is `ease` from the stop and then slows the way something slows in water, and is as
 * good as there.
 */
export function settle(s: number, rest: number, ease: number = RESTING_EASE): number {
  const start = rest - ease;
  return s <= start ? s : rest - ease * Math.exp(-(s - start) / ease);
}

/**
 * The angle `next`, made to be within half a turn of `last` by adding or taking away whole turns.
 */
function unwrap(last: number, next: number): number {
  let a = next;
  while (a - last > Math.PI) a -= Math.PI * 2;
  while (a - last < -Math.PI) a += Math.PI * 2;
  return a;
}

function lengths(points: readonly { x: number; y: number }[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++)
    out.push(out[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  return out;
}

/** The same line with a point every `step` units along it. */
function resample(points: readonly { x: number; y: number }[], step: number): { x: number; y: number }[] {
  const cum = lengths(points);
  const total = cum[cum.length - 1]!;
  const count = Math.max(1, Math.ceil(total / step));
  const out: { x: number; y: number }[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const s = (k / count) * total;
    while (j < points.length - 2 && cum[j + 1]! < s) j++;
    const a = points[j]!;
    const b = points[j + 1]!;
    const span = cum[j + 1]! - cum[j]!;
    const u = span > 0 ? Math.min(1, Math.max(0, (s - cum[j]!) / span)) : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}
