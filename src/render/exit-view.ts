import Phaser from 'phaser';
import { EXIT_ARROW_HEIGHT, EXIT_LOOKS, EXIT_SPRITE } from '../content/exits';
import { type Portal, portalMark } from '../shared/map';
import { DEPTH } from './depth';
import type { SpriteSet } from './sprites';

/**
 * The beam and the arrow stand above everyone on the ground and under the spell effects and the
 * tops of trees.
 */
const SKY_DEPTH = DEPTH.effects - 40_000;
/**
 * How wide the glowing place is, relative to the way out it marks, and the least and most of it, in
 * world units.
 */
const PAD_PER_WIDTH = 1.15;
const PAD_MIN = 128;
const PAD_MAX = 232;
const PAD_ART_WIDTH = 192;
/** The arrow hops this high, and how fast, for a child's eye that is drawn to movement. */
const HOP = 16;
const HOP_RATE = 3.1;
const BREATH_RATE = 2.2;

interface Beacon {
  pad: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Image;
  arrow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** A number of its own so neighbouring exits do not hop in step. */
  phase: number;
}

/**
 * Marks every way out of a map so a child can find it by looking: a glowing place on the ground, a
 * column of light standing on it that can be seen from far across a garden, and a big arrow that
 * hops over it, all in the colour of where it leads. It only looks. Where the exits are comes from
 * the map, and what happens when the herd steps on one is the simulation's business.
 */
export class ExitView {
  private readonly beacons: Beacon[] = [];

  constructor(scene: Phaser.Scene, sprites: SpriteSet, portals: readonly Portal[]) {
    portals.forEach((portal, n) => {
      const look = EXIT_LOOKS[portal.to.mapId];
      const { x, y } = portalMark(portal);
      const width = Math.max(PAD_MIN, Math.min(PAD_MAX, portal.bounds.w * PAD_PER_WIDTH));
      const spread = width / PAD_ART_WIDTH;
      const pad = sprites
        .make(scene, EXIT_SPRITE.pad, x, y)
        .setDepth(DEPTH.groundDetail - 1)
        .setTint(look.tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(spread);
      const beam = sprites
        .make(scene, EXIT_SPRITE.beam, x, y)
        .setDepth(SKY_DEPTH)
        .setTint(look.tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Math.max(0.7, spread * 0.8), 1);
      const arrow = sprites
        .make(scene, EXIT_SPRITE.arrow, x, y - EXIT_ARROW_HEIGHT)
        .setDepth(SKY_DEPTH + 1)
        .setTint(mixWithWhite(look.tint, 0.4));
      this.beacons.push({ pad, beam, arrow, x, y, phase: n * 1.7 });
    });
  }

  /**
   * Moves them for this frame. With `calm` they hold still and glow evenly, for a parent who asked
   * for fewer effects.
   */
  update(nowMs: number, calm: boolean): void {
    const t = nowMs / 1000;
    for (const b of this.beacons) {
      if (calm) {
        b.pad.setAlpha(0.7);
        b.beam.setAlpha(0.4);
        b.arrow.setPosition(b.x, b.y - EXIT_ARROW_HEIGHT - HOP / 2);
        continue;
      }
      const breath = Math.sin(t * BREATH_RATE + b.phase);
      b.pad.setAlpha(0.66 + 0.22 * breath);
      b.beam.setAlpha(0.4 + 0.1 * Math.sin(t * 3 + b.phase * 2)).setScale(b.beam.scaleX, 1);
      // A hop is the top of a sine, so the arrow lingers in the air and then drops back to a stop
      // before it springs up again.
      const hop = Math.abs(Math.sin(t * HOP_RATE + b.phase));
      b.arrow.setPosition(b.x, b.y - EXIT_ARROW_HEIGHT - hop * HOP);
    }
  }

  get objectCount(): number {
    return this.beacons.length * 3;
  }

  destroy(): void {
    for (const b of this.beacons) {
      b.pad.destroy();
      b.beam.destroy();
      b.arrow.destroy();
    }
    this.beacons.length = 0;
  }
}

/**
 * A colour part of the way toward white, so the arrow is a lighter shade of the glow beneath it.
 */
function mixWithWhite(rgb: number, k: number): number {
  const r = (rgb >> 16) & 255,
    g = (rgb >> 8) & 255,
    b = rgb & 255;
  const lift = (c: number): number => Math.round(c + (255 - c) * k);
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}
