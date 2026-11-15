import type { UnicornId } from '../../shared/ids';
import type { SpriteBank } from './bank';
import { damp, Spring } from './ease';
import { drawRider, FEET, type Look, type Mode, newLook } from './herd';

/**
 * The unicorns of a game: how each looks this frame, and the small animations that make her alive
 * between one frame and the next. She is squashed and stretched by a spring, turns to face the way
 * she goes instead of jumping round, and cheers when something good has happened. What she does,
 * and where, is for the game to decide; this says how it looks.
 */

/** The most there can be: Wildstar and five friends. */
export const MAX_HERD = 6;

/** How one unicorn is to look this frame. */
export interface Pose {
  /** Where her hooves are. */
  x: number;
  y: number;
  mode: Mode;
  /** Which way she faces, 1 for right and -1 for left. She turns to it. */
  face: number;
  /** How far her nose is up, in radians. */
  pitch?: number;
  /** How far she has gone over, in radians, for a somersault. */
  spin?: number;
  /** Where in her clip she is, for the modes that play one. */
  clock?: number;
  /** Squash and stretch on top of her own spring: more than 0 is taller. */
  stretch?: number;
}

/** How fast she turns to face the other way, per second. */
const TURN_RATE = 16;

export class Cast {
  readonly looks: Look[] = Array.from({ length: MAX_HERD }, newLook);
  private readonly springs = Array.from({ length: MAX_HERD }, () => new Spring(0, 0, 230, 17));
  private readonly turns: number[] = Array.from({ length: MAX_HERD }, () => 1);
  private readonly cheered: number[] = Array.from({ length: MAX_HERD }, () => -9);
  private clock = 0;

  /** Everyone back to standing still facing right. */
  reset(): void {
    this.clock = 0;
    for (let i = 0; i < MAX_HERD; i++) {
      const s = this.springs[i]!;
      s.x = 0;
      s.v = 0;
      s.target = 0;
      this.turns[i] = 1;
      this.cheered[i] = -9;
    }
  }

  tick(dt: number): void {
    this.clock += dt;
  }

  /**
   * A push to her shape: more than 0 stretches her tall, less than 0 squashes her flat, and she
   * springs back.
   */
  kick(i: number, v: number): void {
    this.springs[i]!.kick(v);
  }

  /** Holds her squashed (more than 0) or stretched (less than 0) until she is let go with 0. */
  hold(i: number, squash: number): void {
    this.springs[i]!.target = -squash;
  }

  /** How squashed she is held, which is how far she has gathered herself. */
  get held(): number {
    return -this.springs[0]!.target;
  }

  /** She cheers for joy, and for how long it is a gesture. */
  cheer(i: number): void {
    this.cheered[i] = this.clock;
  }

  /** Seconds since she last cheered. */
  sinceCheer(i: number): number {
    return this.clock - this.cheered[i]!;
  }

  /** She is already facing this way, with no turn to make. */
  face(i: number, face: number): void {
    this.turns[i] = face;
  }

  /** How she is turned now: 1 is facing right and -1 facing left, and in between she is turning. */
  turn(i: number): number {
    return this.turns[i]!;
  }

  /** Where her hooves are now. */
  hooves(i: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    const look = this.looks[i]!;
    out.x = look.x;
    out.y = look.y + FEET;
    return out;
  }

  /** Sets how she looks, and moves her spring and her turn on by `dt`. */
  set(i: number, pose: Pose, dt: number): Look {
    const look = this.looks[i]!;
    const stretch = this.springs[i]!.step(dt) + (pose.stretch ?? 0);
    const turn = damp(this.turns[i]!, pose.face, TURN_RATE, dt);
    this.turns[i] = turn;
    look.x = pose.x;
    look.y = pose.y - FEET;
    look.mode = pose.mode;
    look.clock = pose.clock ?? 0;
    // Nose up is anticlockwise for a unicorn facing right, and clockwise for one facing left.
    // Mid-turn she has no pitch to speak of.
    look.rot = -turn * ((pose.pitch ?? 0) + (pose.spin ?? 0));
    look.sx = turn * (1 - stretch * 0.55);
    look.sy = 1 + stretch;
    return look;
  }

  draw(g: CanvasRenderingContext2D, bank: SpriteBank | null, i: number, id: UnicornId, scale: number): void {
    drawRider(g, bank, id, this.looks[i]!, scale);
  }
}
