import type { Facing, UnicornId } from '../../../shared/ids';
import { damp, lerp } from '../../engine/ease';
import type { Slot } from './layout';
import { type Clip, type Look, listen, lookOf, type Move, newLook, nextMove } from './moves';

/**
 * The friends on the floor. Each one listens to the music until she is touched, and then she
 * dances: a move, and the next move each time she is touched again. A move always begins on a beat,
 * so everybody who is dancing is dancing together, and she shows she has heard the touch at once by
 * crouching a little before the beat she begins on.
 */

/**
 * How the parade has her walk, in place of dancing. Before her turn she cheers where she stands,
 * with her cast.
 */
interface Walk {
  x: number;
  y: number;
  facing: Facing;
  clip: Clip | 'cast';
  /** Seconds into the clip. */
  seconds: number;
  /** Units off the ground, at full size. */
  lift: number;
}

export interface Dancer {
  readonly id: UnicornId;
  /** Her place in the herd, with Wildstar first. */
  readonly index: number;
  slot: Slot;
  /** The move she is doing, or nothing while she is listening. */
  move: Move | null;
  /** How many times she has been touched. */
  taps: number;
  /** The beat of the music her move began on. */
  began: number;
  /**
   * How much of a dancer she is, from 0 (listening) to 1 (in her move), so that she does not jump
   * from one to the other.
   */
  into: number;
  look: Look;
  /** Where her hooves are. */
  x: number;
  y: number;
  /** Set while the parade has her walking. */
  walk: Walk | null;
  /** Seconds since she was touched. */
  touched: number;
  /** When her last hop of joy began, on the dancers' own clock, and how high it goes. */
  hopAt: number;
  hopPower: number;
}

/** How long a hop of joy takes. */
const HOP = 0.5;

/**
 * The way a friend faces for one of the four views of a twirl: her own, toward you, the other way,
 * and away.
 */
export function facingOf(home: 1 | -1, turn: 0 | 1 | 2 | 3): Facing {
  switch (turn) {
    case 0:
      return home > 0 ? 'east' : 'west';
    case 1:
      return 'south';
    case 2:
      return home > 0 ? 'west' : 'east';
    case 3:
      return 'north';
  }
}

/** What a touch did. */
export interface Tap {
  readonly move: Move;
  /** It was her first touch, so she has begun to dance. */
  readonly first: boolean;
  /** Her move is the one she came round to again, after all of them. */
  readonly again: boolean;
}

export class Dancers {
  list: Dancer[] = [];
  private readonly spare: Look = newLook();
  private clock = 0;

  /**
   * Puts the friends on the floor in their places. Those who are already there keep what they were
   * doing.
   */
  stand(ids: readonly UnicornId[], slots: readonly Slot[]): void {
    this.list = ids.slice(0, slots.length).map((id, index) => {
      const slot = slots[index]!;
      const old = this.list.find((d) => d.id === id);
      if (old) {
        old.slot = slot;
        return Object.assign(old, { index });
      }
      return {
        id,
        index,
        slot,
        move: null,
        taps: 0,
        began: 0,
        into: 0,
        look: newLook(),
        x: slot.x,
        y: slot.y,
        walk: null,
        touched: 99,
        hopAt: -9,
        hopPower: 0,
      };
    });
  }

  reset(): void {
    for (const d of this.list) {
      d.move = null;
      d.taps = 0;
      d.began = 0;
      d.into = 0;
      d.walk = null;
      d.touched = 99;
      d.hopAt = -9;
      d.x = d.slot.x;
      d.y = d.slot.y;
    }
  }

  /** She hops for joy, on top of whatever she is doing. `power` is 1 for a usual hop. */
  cheer(d: Dancer, power = 1): void {
    d.hopAt = this.clock;
    d.hopPower = power;
  }

  get dancing(): number {
    return this.list.reduce((n, d) => n + (d.move ? 1 : 0), 0);
  }

  /** Touched: she begins to dance on the next beat, or goes on to her next move. */
  tap(d: Dancer, beats: number): Tap {
    const first = d.move === null;
    const before = d.move;
    d.move = nextMove(d.move);
    d.taps++;
    d.touched = 0;
    // The next beat, unless it is so near that it would be on her before she has bent her knees.
    const next = Math.ceil(beats);
    d.began = next - beats < 0.12 ? next + 1 : next;
    return { move: d.move, first, again: !first && before !== null && d.move === nextMove(null) };
  }

  /** Where the friends are and how they look, on to this moment. `beats` is where the music is. */
  update(dt: number, beats: number): void {
    this.clock += dt;
    for (const d of this.list) {
      d.touched += dt;
      d.into = damp(d.into, d.move ? 1 : 0, 6, dt);
      if (d.walk) {
        d.x = d.walk.x;
        d.y = d.walk.y;
        continue;
      }
      // She listens a little differently from the next one, so that a floor of friends who are not
      // dancing yet is not marching.
      const calm = listen(beats + d.index * 0.09, d.look);
      if (d.move) {
        const move = lookOf(d.move, Math.max(0, beats - d.began), d.slot.home, d.index % 2 === 0 ? 1 : -1, this.spare);
        const t = d.into;
        const started = beats >= d.began;
        // Her pictures change on her beat; the way she is held changes smoothly.
        calm.clip = started ? move.clip : 'idle';
        calm.phase = started ? move.phase : calm.phase;
        calm.turn = started ? move.turn : 0;
        calm.lift = lerp(calm.lift, move.lift, t);
        calm.sx = lerp(calm.sx, move.sx, t);
        calm.sy = lerp(calm.sy, move.sy, t);
        calm.tilt = lerp(calm.tilt, move.tilt, t);
        calm.spin = move.spin * t;
        calm.shift = lerp(calm.shift, move.shift, t);
      }
      // A hop of joy: up and down once, and a little flat on landing.
      const u = (this.clock - d.hopAt) / HOP;
      if (u >= 0 && u < 1) {
        calm.lift += 26 * d.hopPower * Math.sin(Math.PI * u);
        calm.sy += 0.06 * d.hopPower * Math.sin(Math.PI * u);
      } else if (u >= 1 && u < 1.3) {
        calm.sy -= 0.1 * d.hopPower * Math.sin((Math.PI * (u - 1)) / 0.3);
      }
      if (calm.sy !== 1) calm.sx = 1 - (calm.sy - 1) * 0.6;
      d.x = d.slot.x + calm.shift * d.slot.scale;
      d.y = d.slot.y;
    }
  }

  /**
   * The friend under a touch. A touch has room for a finger around her, and where two friends' room
   * is the same the touch is for the one whose middle is nearer, so that a friend who stands behind
   * another can still be touched on her own body and not only above it.
   */
  at(x: number, y: number): Dancer | null {
    let best: Dancer | null = null;
    let nearest = Infinity;
    for (const d of this.list) {
      if (d.walk) continue;
      const s = d.slot.scale;
      const across = Math.abs(x - d.x) / (56 * s + 12);
      const up = Math.abs(y - (d.y - 59 * s)) / (59 * s + 14);
      const far = Math.max(across, up);
      // The one in front, if it is as near as the one behind.
      if (
        far < 1 &&
        (far < nearest - 0.02 || (far < nearest + 0.02 && best !== null && d.slot.depth > best.slot.depth))
      ) {
        best = d;
        nearest = far;
      }
    }
    return best;
  }
}
