import type { Rng } from '../../../domain/rng';
import { easeOutCubic, TAU } from '../../engine/ease';
import { type Plan, wireAt } from './layout';

/**
 * The other guests: a frog, a bunny and a bird at the edge of the floor, and later fairies and
 * butterflies above it. They come as the party gets going, one after another, hopping in from the
 * sides or flying in, and then hop on the beat and cheer when something goes off. They do not
 * dance; the friends do. They are the crowd, and a crowd is how a party looks as if it is going
 * well.
 */

export type Kind = 'frog' | 'bunny' | 'bird' | 'fairy' | 'butterfly';

/** Who comes, in the order they come: a kind and the colour of its picture. */
export const ARRIVALS: readonly (readonly [Kind, string])[] = [
  ['frog', 'green'],
  ['bunny', 'white'],
  ['bird', 'blue'],
  ['bird', 'robin'],
  ['frog', 'sunny'],
  ['bunny', 'caramel'],
  ['fairy', 'pink'],
  ['bird', 'canary'],
  ['butterfly', 'monarch'],
  ['fairy', 'mint'],
  ['frog', 'teal'],
  ['butterfly', 'lilac'],
];

/**
 * The points of play at which each guest comes: the first early, so the floor is not bare, and the
 * rest further apart.
 */
export const WHEN: readonly number[] = [2, 5, 9, 13, 18, 23, 29, 35, 41, 47, 53, 59];

/** How many guests there are for this many points of play. */
export function guestsFor(points: number): number {
  let n = 0;
  while (n < WHEN.length && points >= WHEN[n]!) n++;
  return n;
}

/**
 * Which way each kind's picture faces as it is drawn: 1 right, -1 left, and 0 for one that faces
 * you.
 */
const NATIVE: Readonly<Record<Kind, 1 | 0 | -1>> = { frog: 0, bunny: 1, bird: -1, fairy: 1, butterfly: 0 };

export interface Guest {
  readonly id: number;
  readonly kind: Kind;
  readonly tone: string;
  /** Where it stands, or for a flier where it circles. */
  home: { x: number; y: number };
  /** Where it comes in from. */
  from: { x: number; y: number };
  /** Looking to the left, for a guest that stands. */
  faceLeft: boolean;
  /** When it arrived, in seconds of the game's clock. */
  readonly arrivedAt: number;
  hopAt: number;
  hopPower: number;
  /** Which beat of four it hops on, so the crowd does not all go up at once. */
  readonly beat: number;
  /** A number of its own, so no two flutter the same way. */
  readonly phase: number;
  /** How wide and tall its circle is, and how fast it goes round, for a flier. */
  readonly reach: { readonly x: number; readonly y: number; readonly speed: number };
}

/** How a guest looks at one moment. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Draw the picture turned over. */
  readonly flip: boolean;
  /** The name of the picture, in the bundle of the world's life. */
  readonly sprite: string;
  /** How far into the picture's own animation it is, in seconds. */
  readonly seconds: number;
  /** How high it is held in a hop, in units. */
  readonly lift: number;
}

/** Seconds a guest takes to come in. */
export const COMING = 1.1;

const HOP_SECONDS = 0.46;

const flies = (kind: Kind): boolean => kind === 'fairy' || kind === 'butterfly';

const SCALE: Readonly<Record<Kind, number>> = { frog: 1.25, bunny: 1.15, bird: 1.1, fairy: 0.62, butterfly: 1.15 };

export class Guests {
  list: Guest[] = [];
  private plan: Plan | null = null;

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.list = [];
  }

  /** Makes sure the first `count` guests are here. Returns the ones that have just come. */
  ensure(count: number, now: number): Guest[] {
    const added: Guest[] = [];
    const plan = this.plan;
    while (plan && this.list.length < Math.min(count, ARRIVALS.length)) {
      const id = this.list.length;
      const [kind, tone] = ARRIVALS[id]!;
      const home = this.homeOf(plan, id, kind);
      const guest: Guest = {
        id,
        kind,
        tone,
        home,
        from: this.fromOf(plan, home, kind),
        faceLeft: home.x > plan.w / 2,
        arrivedAt: now,
        hopAt: -10,
        hopPower: 0,
        beat: id % 4,
        phase: this.rng.range(0, TAU),
        reach: { x: this.rng.range(50, 110), y: this.rng.range(14, 34), speed: this.rng.range(0.45, 0.8) },
      };
      this.list.push(guest);
      added.push(guest);
    }
    return added;
  }

  /** Puts everyone where the layout says, for a screen that has changed. */
  place(plan: Plan): void {
    this.plan = plan;
    for (const g of this.list) {
      g.home = this.homeOf(plan, g.id, g.kind);
      g.from = this.fromOf(plan, g.home, g.kind);
      g.faceLeft = g.home.x > plan.w / 2;
    }
  }

  /**
   * Where guest number `id` of a kind is. Those that stand are along the front of the stage on one
   * side or the other, nearer the middle for each that follows. A bird sits on a speaker, or if it
   * is a later one on the string of lights. Those that fly circle above the floor.
   */
  private homeOf(plan: Plan, id: number, kind: Kind): { x: number; y: number } {
    const right = id % 2 === 1;
    const side = right ? 1 : -1;
    if (kind === 'bird') {
      if (id < 6) {
        const speaker = plan.speakers[right ? 1 : 0];
        return { x: speaker.x - side * speaker.w * 0.18, y: speaker.y - speaker.h + 2 };
      }
      const x = plan.wire.left + (plan.wire.right - plan.wire.left) * (right ? 0.78 : 0.22);
      return { x, y: wireAt(plan, x) + 1 };
    }
    if (flies(kind)) {
      const across = ((id * 0.37) % 1) * 0.5 + 0.2;
      return { x: plan.w * (right ? 1 - across : across), y: plan.h * (kind === 'fairy' ? 0.38 : 0.29) };
    }
    const cannon = plan.cannons[right ? 1 : 0];
    // The ones that stand are on a side by turns, so how many are before it on its side is where
    // along it.
    let nth = 0;
    for (let i = id % 2; i < id; i += 2) if (!flies(ARRIVALS[i]![0]) && ARRIVALS[i]![0] !== 'bird') nth++;
    const away = (56 + nth * 52) * (plan.portrait ? 0.9 : 1);
    return { x: cannon.x - side * away, y: Math.min(plan.h - 5, plan.ground + 8) };
  }

  private fromOf(plan: Plan, home: { x: number; y: number }, kind: Kind): { x: number; y: number } {
    const right = home.x > plan.w / 2;
    if (flies(kind) || kind === 'bird') return { x: right ? plan.w + 60 : -60, y: Math.max(20, home.y - 70) };
    return { x: right ? plan.w + 50 : -50, y: home.y };
  }

  /**
   * The guests that stand, each on its own beat of four, hop. Call as each beat of the music
   * passes.
   */
  onBeat(beat: number, now: number): void {
    for (const g of this.list) {
      if (flies(g.kind) || now - g.arrivedAt < COMING + 0.2) continue;
      if (beat % 4 === g.beat && now - g.hopAt > HOP_SECONDS) {
        g.hopAt = now;
        g.hopPower = g.kind === 'bird' ? 0.5 : 0.8;
      }
    }
  }

  /** All of the guests that stand hop at once, as they do on every beat of the parade. */
  hopAll(now: number, power = 0.8): void {
    for (const g of this.list) {
      if (flies(g.kind) || now - g.arrivedAt < COMING) continue;
      g.hopAt = now + (g.beat % 2) * 0.05;
      g.hopPower = g.kind === 'bird' ? power * 0.6 : power;
    }
  }

  /** Something went off at a place: the guests nearer to it hop higher, and all of them hop. */
  cheer(x: number, power: number, now: number): void {
    const width = this.plan?.w ?? 800;
    for (const g of this.list) {
      if (flies(g.kind) || now - g.arrivedAt < COMING) continue;
      const near = 1 - Math.min(1, Math.abs(g.home.x - x) / width);
      g.hopAt = now + this.rng.range(0, 0.12);
      g.hopPower = Math.min(1.6, (0.7 + near * 0.6) * power);
    }
  }

  /** The guest under a touch, if there is one. */
  at(x: number, y: number, now: number): Guest | null {
    for (const g of this.list) {
      const p = this.pose(g, now);
      if (Math.hypot(x - p.x, y - (p.y - p.lift - 16 * p.scale)) < 26 * p.scale + 12) return g;
    }
    return null;
  }

  /** A touch on a guest makes it hop, a big one. */
  poke(g: Guest, now: number): void {
    if (flies(g.kind)) return;
    g.hopAt = now;
    g.hopPower = 1.4;
  }

  /**
   * How a guest looks at a moment: which picture, how far into it, and where. In the parade (
   * `marching` ) the ones that stand face the way it goes and the birds fly along with it instead
   * of sitting.
   */
  pose(g: Guest, now: number, marching = false): Pose {
    const since = now - g.arrivedAt;
    const flying = flies(g.kind);
    const scale = SCALE[g.kind];
    let x = g.home.x;
    let y = g.home.y;
    let left = g.faceLeft;
    if (flying) {
      const t = now * g.reach.speed + g.phase;
      const rx = Math.min(g.reach.x, (this.plan?.w ?? 800) * 0.2);
      x = g.home.x + Math.sin(t) * rx;
      y = g.home.y + Math.sin(t * 1.7 + 1) * g.reach.y;
      left = Math.cos(t) < 0;
    }
    if (marching && g.kind === 'bird') {
      // Along with the others, a little above where it sat, going the way they go.
      const bx = g.home.x + Math.sin(now * 1.3 + g.phase) * 34;
      const by = g.home.y - 26 + Math.sin(now * 2.6 + g.phase) * 7;
      return {
        x: bx,
        y: by,
        scale,
        flip: NATIVE.bird === -1,
        sprite: this.sprite(g, 'fly', since),
        seconds: since + g.phase,
        lift: 0,
      };
    }
    if (marching) left = false;
    const flip = NATIVE[g.kind] === 0 ? false : left !== (NATIVE[g.kind] === -1);
    if (since < COMING && !marching) {
      // Coming in: along an arc, quickly at first and then settling.
      const e = easeOutCubic(since / COMING);
      const arc = flying ? 0 : Math.sin(Math.PI * Math.min(1, since / COMING)) * 38;
      const nx = g.from.x + (x - g.from.x) * e;
      const ny = g.from.y + (y - g.from.y) * e - arc;
      const towardLeft = x < g.from.x;
      const arrivalFlip = NATIVE[g.kind] === 0 ? false : towardLeft !== (NATIVE[g.kind] === -1);
      return {
        x: nx,
        y: ny,
        scale,
        flip: arrivalFlip,
        sprite: this.sprite(g, flying ? 'fly' : 'air', since),
        seconds: since,
        lift: 0,
      };
    }
    const hopping = now - g.hopAt;
    if (!flying && hopping >= 0 && hopping < HOP_SECONDS) {
      return {
        x,
        y,
        scale,
        flip,
        sprite: this.sprite(g, 'air', since),
        seconds: since,
        lift: Math.sin((Math.PI * hopping) / HOP_SECONDS) * 15 * g.hopPower,
      };
    }
    const crouching = !flying && hopping >= HOP_SECONDS && hopping < HOP_SECONDS + 0.12;
    return {
      x,
      y,
      scale,
      flip,
      sprite: this.sprite(g, crouching ? 'crouch' : flying ? 'fly' : 'sit', since),
      seconds: since + g.phase,
      lift: 0,
    };
  }

  /** The name of the picture of a guest doing something, in the pictures of the world's life. */
  private sprite(g: Guest, doing: 'air' | 'crouch' | 'sit' | 'fly', since: number): string {
    switch (g.kind) {
      case 'frog':
        return `frog-${g.tone}-${doing === 'air' ? 'air' : doing === 'crouch' ? 'crouch' : 'sit'}`;
      case 'bunny':
        return `bunny-${g.tone}-${doing === 'air' ? 'hop' : 'sit'}`;
      case 'bird':
        // A bird now and then pecks at where it sits.
        if (doing === 'air' || doing === 'fly') return `bird-${g.tone}-fly`;
        return `bird-${g.tone}-${Math.floor((since + g.phase * 3) / 2.6) % 3 === 2 ? 'peck' : 'idle'}`;
      case 'fairy':
        return `fairy-${g.tone}-fly`;
      case 'butterfly':
        return `butterfly-${g.tone}-flutter`;
    }
  }
}
