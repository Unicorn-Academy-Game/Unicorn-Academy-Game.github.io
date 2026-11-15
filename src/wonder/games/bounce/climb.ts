import type { UnicornId } from '../../../shared/ids';
import { clamp } from '../../engine/ease';
import { type Arc, arcAt, arcBetween, newPose, type Pose } from './hop';
import { BODY, type Cloud, isSpecial, LIFT, type Pickup, ROWS, reachable, type World } from './world';

/**
 * Where the music is. A leap is timed so that it lands on a half beat, so that every landing is in
 * time.
 */
export interface Clock {
  /** Beats since the music began, with a fraction. */
  readonly beats: number;
  /** Seconds in one beat. */
  readonly seconds: number;
}

/** What each thing the player does is worth toward their stars, in points. */
export const WORTH = {
  /** A cloud she has not been on. */
  fresh: 1,
  /** A cloud higher than any she has been on. */
  height: 0.8,
  /** Whatever is special about a cloud, the first time. */
  special: 1.2,
  /** A third new cloud in a row, and each one after, while she keeps them coming. */
  combo: 0.4,
  /** A star out of the air. */
  star: 0.35,
  /** A friend found. */
  friend: 3,
} as const;

/** How long she has between one new cloud and the next for them to count as a run, in seconds. */
const COMBO_SECONDS = 2.6;
/**
 * How long a touch means "go there", in seconds. A finger that stays down means it for as long as
 * it stays.
 */
export const AIM_SECONDS = 7;
/** How near she must pass to a star to gather it. */
const COLLECT = 32;
/** How much closer a cloud must get her to where she was sent for it to be worth leaping to. */
const GAIN = 6;
/** How long the friend behind waits after the one in front, in beats. */
const FOLLOW_BEATS = 1;

/** One thing the climb says happened, for the game to show and sound. */
export type Event =
  | {
      readonly type: 'launch';
      readonly rider: number;
      readonly from: Cloud;
      readonly to: Cloud;
      readonly seconds: number;
      readonly far: boolean;
    }
  | {
      readonly type: 'land';
      readonly rider: number;
      readonly cloud: Cloud;
      readonly fresh: boolean;
      readonly combo: number;
      readonly worth: number;
      readonly height: boolean;
    }
  | { readonly type: 'star'; readonly pickup: Pickup; readonly worth: number }
  | {
      readonly type: 'join';
      readonly rider: number;
      readonly id: UnicornId;
      readonly cloud: Cloud;
      readonly worth: number;
    }
  | { readonly type: 'top' }
  /** She was sent somewhere there is no leap toward. */
  | { readonly type: 'stay' };

/** One unicorn on her way up. */
export class Rider {
  mode: 'stand' | 'hop' = 'stand';
  /** The cloud she stands on, or has just left. */
  from: Cloud;
  /** The cloud she is going to, or the one she stands on. */
  to: Cloud;
  /** Her hooves. */
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  arc: Arc | null = null;
  /** Seconds into the leap. */
  t = 0;
  /** Seconds since she came down, and since she began if she has not leapt yet. */
  since = 0;
  /** Which way she faces. */
  facing: 1 | -1 = 1;
  /** Whether this leap is a long one, which she turns over in. */
  far = false;
  /** How many leaps she has made, which keeps where she lands from being the same every time. */
  hops = 0;
  readonly pose = newPose();

  constructor(
    readonly index: number,
    readonly id: UnicornId,
    cloud: Cloud,
    x: number,
  ) {
    this.from = cloud;
    this.to = cloud;
    this.x = x;
    this.y = cloud.y;
  }
}

interface Pending {
  readonly cloud: Cloud;
  /** When she may go, on the climb's clock. */
  readonly at: number;
}

/** A number from 0 to 1 that is always the same for the same two numbers. */
function unit(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Where on a cloud a unicorn stands. The one who leads is near the middle, a little different each
 * time. The friends who follow stand to either side of her, each a little further out.
 */
export function standAt(index: number, cloud: Cloud, hops: number): number {
  const slack = cloud.width / 2 - 18;
  if (index === 0) return cloud.x + clamp((unit(cloud.id, hops) * 2 - 1) * cloud.width * 0.14, -slack, slack);
  const side = index % 2 === 1 ? -1 : 1;
  const out = 36 * Math.ceil(index / 2);
  return cloud.x + clamp(side * out + (unit(cloud.id + index * 31, hops) * 2 - 1) * 6, -slack, slack);
}

/**
 * How long a leap takes. It is as long as the leap needs, and then a little longer, to the next
 * half beat, so that she comes down exactly on one.
 */
export function flightTime(dx: number, up: number, clock: Clock): number {
  const reach = Math.hypot(dx, up * 1.2);
  const least = clamp(0.58 + reach * 0.0017, 0.62, 1.4);
  const beat = Math.max(0.2, clock.seconds);
  const landing = Math.ceil((clock.beats + least / beat) * 2 - 1e-9) / 2;
  return (landing - clock.beats) * beat;
}

/**
 * The cloud a leap from `from` would go to for her to get nearest to `aim`, or nothing if no leap
 * from here gets her any nearer. A touch on a cloud is that cloud, and a touch in the sky is the
 * cloud that gets her closest to it, so a tap that misses still goes somewhere good.
 */
export function choose(world: World, from: Cloud, aim: { readonly x: number; readonly y: number }): Cloud | null {
  const far = (c: Cloud): number => Math.hypot(c.x - aim.x, (c.y + 12 - aim.y) * 1.15);
  const here = far(from);
  let best: Cloud | null = null;
  let bestFar = Infinity;
  for (let r = Math.max(-1, from.row - 3); r <= Math.min(ROWS, from.row + 2); r++) {
    for (const c of world.row(r)) {
      if (c === from || !reachable(from, c)) continue;
      const d = far(c);
      if (d < bestFar) {
        bestFar = d;
        best = c;
      }
    }
  }
  return best && bestFar < here - GAIN ? best : null;
}

/**
 * Her climb through the sky and the rules of it, with nothing in it that draws or sounds. She
 * stands on a cloud until she is sent somewhere, leaps there along a curve that lands on a beat,
 * and does it again for as long as she is sent. The friends she has found do whatever she did, one
 * behind another. What happened is written to `events` for the game to show.
 */
export class Climb {
  readonly riders: Rider[] = [];
  readonly events: Event[] = [];
  /** Where she has been sent, in the sky's own units. */
  aim: { x: number; y: number } | null = null;
  /** The clouds she has stood on. */
  readonly visited = new Set<number>();
  /** The stars she has gathered. */
  readonly taken = new Set<number>();
  /** The friends who go with her. */
  readonly joined = new Set<UnicornId>();
  /** The highest row she has stood on. */
  bestRow = -1;
  /** How many new clouds in a row. */
  combo = 0;
  /** Seconds on the climb's own clock. */
  time = 0;
  private holding = false;
  private aimFor = 0;
  private comboLeft = 0;
  /** How long a beat is, as of the last time anyone was asked to move. */
  private beatSeconds = 0.6;
  private readonly pending: Pending[][] = [];

  constructor(
    readonly world: World,
    private readonly herd: readonly UnicornId[],
  ) {
    this.reset();
  }

  get leader(): Rider {
    return this.riders[0]!;
  }

  /** Puts everything back as it was at the start: she is on the mushroom, and nothing is found. */
  reset(): void {
    this.riders.length = 0;
    this.events.length = 0;
    this.pending.length = 0;
    this.aim = null;
    this.holding = false;
    this.aimFor = 0;
    this.visited.clear();
    this.taken.clear();
    this.joined.clear();
    this.bestRow = -1;
    this.combo = 0;
    this.comboLeft = 0;
    this.time = 0;
    const mushroom = this.world.mushroom;
    this.riders.push(new Rider(0, this.herd[0] ?? 'wildstar', mushroom, mushroom.x));
    this.visited.add(mushroom.id);
  }

  /**
   * A finger touches the sky. She is sent toward the place, and if there is no leap from where she
   * stands that gets her any nearer, the game is told, so it can answer the touch some other way.
   */
  touch(x: number, y: number): void {
    this.send(x, y, true);
    const lead = this.leader;
    if (lead.mode === 'stand' && choose(this.world, lead.to, this.aim!) === null) this.events.push({ type: 'stay' });
  }

  /**
   * She is sent toward a place. A finger that stays down keeps her going, and one that has lifted
   * lets her go on for a while.
   */
  send(x: number, y: number, held = false): void {
    this.aim = { x, y };
    this.aimFor = 0;
    this.holding = held;
  }

  /** The finger has lifted. */
  release(): void {
    this.holding = false;
  }

  /** Moves everyone on `dt` seconds. */
  step(dt: number, clock: Clock): void {
    this.time += dt;
    if (this.aim && !this.holding) {
      this.aimFor += dt;
      if (this.aimFor > AIM_SECONDS) this.aim = null;
    }
    if (this.comboLeft > 0) {
      this.comboLeft -= dt;
      if (this.comboLeft <= 0) this.combo = 0;
    }
    for (const r of this.riders) this.move(r, dt, clock);
  }

  private move(r: Rider, dt: number, clock: Clock): void {
    r.since += dt;
    if (r.mode === 'stand') {
      this.decide(r, clock, 0);
      return;
    }
    const arc = r.arc!;
    r.t += dt;
    if (r.t < arc.seconds) {
      this.fly(r);
      return;
    }
    const over = r.t - arc.seconds;
    this.land(r);
    this.decide(r, clock, over);
  }

  /** Puts her where the arc says, and gathers what she passes. */
  private fly(r: Rider): void {
    const p: Pose = arcAt(r.arc!, r.t, r.pose);
    r.x = p.x;
    r.y = p.y;
    r.vx = p.vx;
    r.vy = p.vy;
    if (r.index === 0) this.gather(r);
  }

  private gather(r: Rider): void {
    const lo = Math.min(r.from.row, r.to.row) - 1;
    const hi = Math.max(r.from.row, r.to.row) + 1;
    for (let row = lo; row <= hi; row++) {
      for (const s of this.world.starsOf(row)) {
        if (this.taken.has(s.id)) continue;
        if (Math.hypot(s.x - r.x, s.y - (r.y - BODY)) > COLLECT) continue;
        this.taken.add(s.id);
        this.events.push({ type: 'star', pickup: s, worth: WORTH.star });
      }
    }
  }

  private land(r: Rider): void {
    const cloud = r.to;
    const arc = r.arc!;
    r.mode = 'stand';
    r.from = cloud;
    r.x = arc.x1;
    r.y = arc.y1;
    r.vx = 0;
    r.vy = 0;
    r.arc = null;
    r.t = 0;
    r.since = 0;
    if (r.index !== 0) {
      this.events.push({ type: 'land', rider: r.index, cloud, fresh: false, combo: 0, worth: 0, height: false });
      return;
    }
    this.arrive(cloud);
  }

  /** The leader comes down on a cloud: what is new about it, and what that is worth. */
  private arrive(cloud: Cloud): void {
    const fresh = !this.visited.has(cloud.id);
    let worth = 0;
    let height = false;
    if (fresh) {
      this.visited.add(cloud.id);
      worth += WORTH.fresh;
      if (cloud.row > this.bestRow) {
        this.bestRow = cloud.row;
        height = true;
        worth += WORTH.height;
      }
      if (isSpecial(cloud.kind) && cloud.kind !== 'friend') worth += WORTH.special;
      this.combo = this.comboLeft > 0 ? this.combo + 1 : 1;
      this.comboLeft = COMBO_SECONDS;
      if (this.combo >= 3) worth += WORTH.combo;
    }
    this.events.push({ type: 'land', rider: 0, cloud, fresh, combo: this.combo, worth, height });
    for (let k = 1; k < this.riders.length; k++) {
      const queue = this.pending[k] ?? [];
      this.pending[k] = queue;
      queue.push({ cloud, at: this.time + k * FOLLOW_BEATS * this.beatSeconds });
    }
    if (cloud.friend && !this.joined.has(cloud.friend) && this.herd.includes(cloud.friend))
      this.recruit(cloud.friend, cloud);
    if (cloud.kind === 'gate') this.events.push({ type: 'top' });
  }

  private recruit(id: UnicornId, cloud: Cloud): void {
    this.joined.add(id);
    const index = this.riders.length;
    const rider = new Rider(index, id, cloud, standAt(index, cloud, 0));
    this.riders.push(rider);
    this.events.push({ type: 'join', rider: index, id, cloud, worth: WORTH.friend });
  }

  /**
   * A rider who is standing decides whether to go. `over` is how much of this moment is left after
   * she came down, so a leap that follows a leap is not late.
   */
  private decide(r: Rider, clock: Clock, over: number): void {
    this.beatSeconds = Math.max(0.2, clock.seconds);
    let to: Cloud | null = null;
    if (r.index === 0) {
      if (this.aim) {
        to = choose(this.world, r.to, this.aim);
        // Nowhere nearer to go: she has got there, or as near as the clouds let her.
        if (!to) this.aim = null;
      }
    } else {
      const queue = this.pending[r.index];
      while (queue && queue.length > 0 && queue[0]!.cloud === r.to) queue.shift();
      const head = queue?.[0];
      if (head && head.at <= this.time && reachable(r.to, head.cloud)) {
        to = head.cloud;
        queue!.shift();
      } else if (head && head.at <= this.time) {
        // It cannot be got to from here, which can only happen if the sky was changed under her.
        // She goes straight there.
        queue!.shift();
        this.place(r, head.cloud);
      }
    }
    if (!to) return;
    // A leap that follows a landing began at the landing, a little before the moment the clock
    // shows, and has to be timed from there.
    this.launch(
      r,
      to,
      over > 0 ? { beats: clock.beats - over / Math.max(0.2, clock.seconds), seconds: clock.seconds } : clock,
    );
    if (over > 0) {
      r.t = over;
      if (r.t < r.arc!.seconds) this.fly(r);
    }
  }

  /** Puts her on a cloud without a leap. */
  private place(r: Rider, cloud: Cloud): void {
    r.mode = 'stand';
    r.from = cloud;
    r.to = cloud;
    r.x = standAt(r.index, cloud, r.hops);
    r.y = cloud.y;
    r.arc = null;
    r.since = 0;
  }

  private launch(r: Rider, to: Cloud, clock: Clock): void {
    const x1 = standAt(r.index, to, r.hops + 1);
    const dx = x1 - r.x;
    const up = r.y - to.y;
    const seconds = flightTime(dx, up, clock);
    r.arc = arcBetween(r.x, r.y, x1, to.y, seconds, LIFT);
    r.mode = 'hop';
    r.from = r.to;
    r.to = to;
    r.t = 0;
    r.since = 0;
    r.hops++;
    r.far = Math.hypot(dx, up * 1.2) > 270;
    if (Math.abs(dx) > 8) r.facing = dx > 0 ? 1 : -1;
    this.events.push({ type: 'launch', rider: r.index, from: r.from, to, seconds, far: r.far });
  }
}
