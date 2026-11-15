import type { RGB } from '../../engine/color';
import { Spring } from '../../engine/ease';
import type { CannonSpot } from './layout';

/**
 * The two confetti cannons, one each side of the floor and leaning in. A touch fires one: it kicks
 * back, throws confetti and streamers across the floor, and has to be loaded again for a moment
 * before it will go off. The left throws warm colours and the right cool ones, and they strum their
 * chord the other way round, so two of them in turn make a little tune.
 */

/** How tall a cannon is at full size, in units. */
export const HEIGHT = 108;
/** How wide its mouth is at full size. */
export const MOUTH = 54;
/** Seconds before it can be fired again. */
export const RELOAD = 0.9;

const WARM: readonly RGB[] = [
  [255, 82, 96],
  [255, 150, 60],
  [255, 213, 94],
  [255, 140, 200],
];
const COOL: readonly RGB[] = [
  [70, 150, 255],
  [95, 227, 215],
  [150, 120, 255],
  [124, 236, 176],
];

/** One cannon: where it stands, how it is kicking back, and how long till it is ready. */
export interface Cannon extends CannonSpot {
  readonly colors: readonly RGB[];
  /**
   * How far it has been pushed down by its own kick, as a share of its height, springing back to 0.
   */
  readonly kick: Spring;
  /** Seconds until it can fire. */
  wait: number;
  /** How many times it has gone off. */
  shots: number;
  /** How bright its mouth is, for the flash of the shot, falling away to 0. */
  flare: number;
}

/** Where a cannon's mouth is, which way it points, and how wide it is open. */
export interface Mouth {
  readonly x: number;
  readonly y: number;
  /** The direction a shot goes, in radians, with 0 to the right and straight up being -PI/2. */
  readonly angle: number;
  readonly width: number;
}

export class Cannons {
  list: Cannon[] = [];

  /**
   * Puts the cannons where the layout says, keeping how much each has been fired when the screen
   * turns.
   */
  place(spots: readonly [CannonSpot, CannonSpot]): void {
    const was = this.list;
    this.list = spots.map((spot, i) => {
      const old = was[i];
      return {
        ...spot,
        colors: spot.side < 0 ? WARM : COOL,
        kick: old?.kick ?? new Spring(0, 0, 260, 15),
        wait: old?.wait ?? 0,
        shots: old?.shots ?? 0,
        flare: old?.flare ?? 0,
      };
    });
  }

  reset(): void {
    for (const c of this.list) {
      c.kick.x = 0;
      c.kick.v = 0;
      c.wait = 0;
      c.shots = 0;
      c.flare = 0;
    }
  }

  update(dt: number): void {
    for (const c of this.list) {
      c.wait = Math.max(0, c.wait - dt);
      c.flare = Math.max(0, c.flare - dt * 3.2);
      c.kick.step(dt);
    }
  }

  /** The cannon under a touch, with a little to spare for a finger. */
  at(x: number, y: number): Cannon | null {
    for (const c of this.list) {
      const m = this.mouthOf(c);
      // Along the barrel from its foot to its mouth, and a little way each side of it.
      const ax = m.x - c.x;
      const ay = m.y - c.y;
      const len = Math.hypot(ax, ay) || 1;
      const t = Math.max(0, Math.min(1, ((x - c.x) * ax + (y - c.y) * ay) / (len * len)));
      const reach = Math.hypot(x - (c.x + ax * t), y - (c.y + ay * t));
      const half = MOUTH * 0.5 * (0.35 + 0.65 * t) * c.scale + 12;
      if (reach <= half) return c;
    }
    return null;
  }

  mouthOf(c: Cannon): Mouth {
    const h = HEIGHT * c.scale;
    return {
      x: c.x + Math.sin(c.lean) * h,
      y: c.y - Math.cos(c.lean) * h,
      angle: c.lean - Math.PI / 2,
      width: MOUTH * c.scale,
    };
  }

  /**
   * Fires a cannon, if it is loaded. Returns where the shot starts, or nothing if it was not ready.
   */
  fire(c: Cannon): Mouth | null {
    if (c.wait > 0) return null;
    c.wait = RELOAD;
    c.shots++;
    c.flare = 1;
    c.kick.kick(2.6);
    return this.mouthOf(c);
  }

  /** The cannon on a side, -1 for the left. */
  side(side: -1 | 1): Cannon | undefined {
    return this.list.find((c) => c.side === side);
  }
}
