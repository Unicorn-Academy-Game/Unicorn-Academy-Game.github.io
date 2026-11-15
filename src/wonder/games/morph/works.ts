import type { Rng } from '../../../domain/rng';
import { clamp, damp } from '../../engine/ease';
import type { FruitId } from './recipes';
import { SURPRISE_EVERY } from './recipes';

/**
 * What the machine does with a fruit, as a timeline. A fruit is thrown from where it sat to the
 * mouth of the hopper, drops into the glass, is changed there, and comes out of the chute and lands
 * on the shelf. Several can be in the machine at once, each at its own place in the story, and the
 * busier the machine is the faster it works, so that feeding it fast is rewarded with a machine
 * that hums. This is only the clock of that story. Where each thing is, and how it looks, is for
 * the game to draw from it.
 */

/** Seconds, at a calm machine. */
export const FLY = 0.5;
export const FALL = 0.3;
export const BREW = 1;
export const OUT = 0.6;
/** How much faster a machine at full energy works than a calm one. */
const SPEED_UP = 0.75;
/** What each feeding adds to the energy, and how much of it is lost a second. */
const KICK = 0.26;
const COOL = 0.3;
/**
 * The most fruit the machine takes at once. Another waits on the rim of the hopper until there is
 * room.
 */
export const MOST_AT_ONCE = 8;

export type Phase = 'fly' | 'fall' | 'brew' | 'out';

export interface Pod {
  readonly id: number;
  readonly fruit: FruitId;
  /** Who threw it in: -1 for the player's own hand, or the number of the friend. */
  readonly by: number;
  /** Where it was thrown from. */
  readonly fromX: number;
  readonly fromY: number;
  /** A creature comes out instead of a stone or a flower. */
  readonly surprise: boolean;
  /**
   * 1 for an ordinary one, and more for the ones a friend throws, which are worth more and sparkle
   * more.
   */
  readonly power: number;
  /** The cell of the shelf it will land in. -1 for a surprise, which is not put on the shelf. */
  readonly cell: number;
  /** How far through the story it is, in seconds of a calm machine. */
  age: number;
  phase: Phase;
}

/** What happened in a step, for the game to give a sound and a sparkle to. */
export interface Happened {
  /** Went into the glass. */
  readonly dropped: Pod[];
  /** The change is done, and it is on its way out. */
  readonly finished: Pod[];
  /** Landed on the shelf, or flew off as a creature. */
  readonly landed: Pod[];
}

export const newHappened = (): Happened => ({ dropped: [], finished: [], landed: [] });

const ENDS: Readonly<Record<Phase, number>> = {
  fly: FLY,
  fall: FLY + FALL,
  brew: FLY + FALL + BREW,
  out: FLY + FALL + BREW + OUT,
};

/** Seconds of a calm machine's story that have gone by, for the phase it is in. */
export const phaseOf = (age: number): Phase =>
  age < ENDS.fly ? 'fly' : age < ENDS.fall ? 'fall' : age < ENDS.brew ? 'brew' : 'out';

/** How far through its phase a pod is, from 0 to 1. */
export function within(pod: Pick<Pod, 'age'>): number {
  const phase = phaseOf(pod.age);
  const start = phase === 'fly' ? 0 : phase === 'fall' ? ENDS.fly : phase === 'brew' ? ENDS.fall : ENDS.brew;
  return clamp((pod.age - start) / (ENDS[phase] - start));
}

export class Works {
  readonly pods: Pod[] = [];
  /** How busy the machine is, from 0 to 1. Feeding raises it and a rest lets it down. */
  energy = 0;
  /** How many fruit have been put in. */
  fed = 0;
  private nextId = 1;
  private untilSurprise: number;

  constructor(private readonly rng: Rng) {
    this.untilSurprise = this.drawSurprise();
  }

  private drawSurprise(): number {
    return SURPRISE_EVERY - 1 + this.rng.int(3);
  }

  reset(): void {
    this.pods.length = 0;
    this.energy = 0;
    this.fed = 0;
    this.nextId = 1;
    this.untilSurprise = this.drawSurprise();
  }

  /** How fast the story goes now, next to a calm machine's. */
  get rate(): number {
    return 1 + SPEED_UP * this.energy;
  }

  get full(): boolean {
    return this.pods.length >= MOST_AT_ONCE;
  }

  /** How many are in the glass now, being changed. */
  get brewing(): number {
    let n = 0;
    for (const p of this.pods) if (p.phase === 'brew') n++;
    return n;
  }

  /**
   * Feeds the machine, or says it cannot take another right now. `reserve` is asked for the cell of
   * the shelf the result is to go to, and only if there is a result to put on it: a surprise is a
   * creature, which has no cell.
   */
  feed(fruit: FruitId, from: { x: number; y: number }, by: number, power: number, reserve: () => number): Pod | null {
    if (this.full) return null;
    this.untilSurprise -= 1;
    const surprise = this.untilSurprise <= 0;
    if (surprise) this.untilSurprise = this.drawSurprise();
    this.fed += 1;
    this.energy = Math.min(1, this.energy + KICK * Math.min(2, power));
    const pod: Pod = {
      id: this.nextId++,
      fruit,
      by,
      fromX: from.x,
      fromY: from.y,
      surprise,
      power,
      cell: surprise ? -1 : reserve(),
      age: 0,
      phase: 'fly',
    };
    this.pods.push(pod);
    return pod;
  }

  /** Moves the story on by `dt` seconds and says what happened. */
  step(dt: number, out: Happened): Happened {
    out.dropped.length = 0;
    out.finished.length = 0;
    out.landed.length = 0;
    this.energy = Math.max(0, damp(this.energy, 0, COOL, dt) - COOL * 0.15 * dt);
    const advance = dt * this.rate;
    for (let i = this.pods.length - 1; i >= 0; i--) {
      const pod = this.pods[i]!;
      const before = pod.phase;
      pod.age += advance;
      pod.phase = phaseOf(pod.age);
      if (before === 'fly' && pod.phase !== 'fly') out.dropped.push(pod);
      if ((before === 'fly' || before === 'fall' || before === 'brew') && pod.phase === 'out') out.finished.push(pod);
      if (pod.age >= ENDS.out) {
        out.landed.push(pod);
        this.pods.splice(i, 1);
      }
    }
    // The story is told in order, whichever order the pods were found in.
    out.dropped.sort((a, b) => a.id - b.id);
    out.finished.sort((a, b) => a.id - b.id);
    out.landed.sort((a, b) => a.id - b.id);
    return out;
  }
}
