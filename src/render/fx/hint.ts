import type Phaser from 'phaser';
import type { Vec2 } from '../../shared/ids';
import { DEPTH } from '../depth';
import type { SpriteSet } from '../sprites';

const CYCLE = 1.5;
const RING_SECONDS = 0.36;

/**
 * The marker that shows a first-time player where to tap: a ring that spreads on the ground every
 * moment and a small gold twinkle hovering above it. It stays until cleared, so it never times out
 * under a child who is still looking.
 */
export class Hint {
  private ring: Phaser.GameObjects.Image | null = null;
  private spark: Phaser.GameObjects.Image | null = null;
  private at: Vec2 | null = null;
  private age = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: SpriteSet,
  ) {}

  show(at: Vec2 | null): void {
    this.clear();
    if (!at) return;
    this.at = at;
    this.age = 0;
    this.ring = this.sprites
      .make(this.scene, 'fx-ring', at.x, at.y)
      .setDepth(DEPTH.groundDetail + 12)
      .setVisible(false);
    this.spark = this.sprites
      .make(this.scene, 'fx-spark-gold', at.x, at.y - 46)
      .setDepth(DEPTH.effects + at.y / 100_000);
  }

  update(dtMs: number): void {
    if (!this.at || !this.ring || !this.spark) return;
    this.age += dtMs / 1000;
    const phase = this.age % CYCLE;
    const growing = phase < RING_SECONDS;
    this.ring.setVisible(growing);
    if (growing) this.sprites.show(this.ring, 'fx-ring', Math.min(7, Math.floor((phase / RING_SECONDS) * 8)));
    this.sprites.show(this.spark, 'fx-spark-gold', Math.floor(this.age * 9) % 4);
    this.spark.setY(this.at.y - 46 - Math.sin(this.age * 3.2) * 5).setAlpha(0.75 + 0.25 * Math.sin(this.age * 5));
  }

  clear(): void {
    this.ring?.destroy();
    this.spark?.destroy();
    this.ring = null;
    this.spark = null;
    this.at = null;
  }
}
