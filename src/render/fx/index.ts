import type Phaser from 'phaser';
import type { Vec2 } from '../../shared/ids';
import type { Profile } from '../profile';
import type { SpriteSet } from '../sprites';
import { Hint } from './hint';
import { type EffectCall, playEffect } from './library';
import { SteerMark } from './steer-mark';
import { Fx } from './system';

export type { EffectCall } from './library';

/**
 * Short-lived visuals that the simulation asks for by id. They live only on screen and never in the
 * world, so a map change clears whatever is playing.
 */
export class EffectsLayer {
  private readonly fx: Fx;
  private readonly marker: Hint;
  private readonly steerMark: SteerMark;
  private reduced = false;
  private readonly sparkles: number;

  constructor(scene: Phaser.Scene, sprites: SpriteSet, profile: Profile) {
    this.sparkles = profile.sparkles;
    this.fx = new Fx(scene, sprites, Math.random, profile.glowsLast);
    this.marker = new Hint(scene, sprites);
    this.steerMark = new SteerMark(scene, sprites);
  }

  /** Parents can ask for calmer effects: no flashes, fewer particles. */
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  setSnap(framebufferPixelsPerUnit: number): void {
    this.fx.setSnap(framebufferPixelsPerUnit);
  }

  play(call: EffectCall): void {
    playEffect(this.fx, call, this.reduced, this.sparkles);
  }

  hint(at: Vec2 | null): void {
    this.marker.show(at);
  }

  /** The mark under a held finger, at a world point, or none with null. */
  steer(at: Vec2 | null): void {
    this.steerMark.show(at);
  }

  update(dtMs: number): void {
    this.fx.update(dtMs);
    this.marker.update(dtMs);
    this.steerMark.update(dtMs);
  }

  get live(): number {
    return this.fx.liveCount;
  }

  clear(): void {
    this.fx.clear();
    this.marker.clear();
    this.steerMark.clear();
  }

  destroy(): void {
    this.fx.destroy();
    this.marker.clear();
    this.steerMark.clear();
  }
}
