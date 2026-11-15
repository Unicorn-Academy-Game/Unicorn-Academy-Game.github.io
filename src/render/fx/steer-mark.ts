import Phaser from 'phaser';
import type { Vec2 } from '../../shared/ids';
import { DEPTH } from '../depth';
import type { SpriteSet } from '../sprites';

/** Seconds one ripple takes to spread. */
const RIPPLE = 0.8;
const RINGS = 2;
const FRAMES = 8;
/** A finger covers about 40 pixels of the ground, so the glow and the rings reach well past it. */
const GLOW_SCALE = 1.15;
const RING_SCALE = 1.3;
const TINT = 0xfff6cf;

/**
 * What a held finger leaves on the ground: a soft glow where it is, and rings that spread from it
 * one after another. It shows that the game can feel the finger, and where it will lead Wildstar,
 * and it follows the finger for as long as the finger is down.
 */
export class SteerMark {
  private rings: Phaser.GameObjects.Image[] = [];
  private glow: Phaser.GameObjects.Image | null = null;
  private at: Vec2 | null = null;
  private age = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: SpriteSet,
  ) {}

  /** Puts the mark at a world point, or takes it away with null. */
  show(at: Vec2 | null): void {
    if (!at) {
      this.clear();
      return;
    }
    if (!this.glow) {
      this.age = 0;
      this.glow = this.sprites
        .make(this.scene, 'fx-glow', at.x, at.y)
        .setDepth(DEPTH.groundDetail + 11)
        .setTint(TINT)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(GLOW_SCALE)
        .setAlpha(0.45);
      for (let i = 0; i < RINGS; i++) {
        this.rings.push(
          this.sprites
            .make(this.scene, 'fx-ring', at.x, at.y)
            .setDepth(DEPTH.groundDetail + 12)
            .setTint(TINT)
            .setScale(RING_SCALE),
        );
      }
    }
    this.at = at;
    this.glow.setPosition(at.x, at.y);
    for (const ring of this.rings) ring.setPosition(at.x, at.y);
  }

  update(dtMs: number): void {
    if (!this.at || !this.glow) return;
    this.age += dtMs / 1000;
    const beat = Math.sin(this.age * 6);
    this.glow.setAlpha(0.42 + 0.1 * beat).setScale(GLOW_SCALE * (1 + 0.05 * beat));
    this.rings.forEach((ring, i) => {
      const phase = (this.age / RIPPLE + i / RINGS) % 1;
      this.sprites.show(ring, 'fx-ring', Math.min(FRAMES - 1, Math.floor(phase * FRAMES)));
      ring.setAlpha(0.95 - 0.55 * phase);
    });
  }

  clear(): void {
    this.glow?.destroy();
    for (const ring of this.rings) ring.destroy();
    this.glow = null;
    this.rings = [];
    this.at = null;
  }
}
