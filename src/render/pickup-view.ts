import type Phaser from 'phaser';
import { PRODUCE, type ProduceId, produceSprite } from '../content/produce';
import { CONFIG, type World } from '../domain';
import type { ShadowSpec } from '../shared/manifest';
import { DEPTH, standingDepth } from './depth';
import { poseAt } from './pickup-pose';
import { makeShadow, placeShadow } from './shadow';
import type { SpriteSet } from './sprites';

/**
 * Above this a piece is drawn in front of the tree it fell from, and below it sorts with the ground
 * like anything standing there.
 */
const OVERHEAD = 40;

/** The shadow of a gem, which hangs above the floor and has none drawn with it. */
const HOVER_SHADOW: ShadowSpec = { rx: 11, ry: 4, dx: 0, dy: 2, a: 0.3 };

interface OnScreen {
  produce: ProduceId;
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  /** A number of its own, so pieces lying side by side do not bob in step. */
  phase: number;
}

const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h % 628) / 100;
};

/**
 * The fruit and vegetables that have fallen, drawn from the simulation. Unlike the creatures,
 * pieces are gathered all the time, so a picture is dropped the moment its piece is gone. Each is a
 * picture and a soft shadow that stays on the ground.
 */
export class PickupView {
  private readonly shown = new Map<string, OnScreen>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: SpriteSet,
  ) {}

  update(world: World, alpha: number): void {
    const seconds = world.time + alpha * CONFIG.step;
    const live = new Set<string>();
    for (const p of world.pickups.list) {
      live.add(p.id);
      const view = this.shown.get(p.id) ?? this.make(p.id, p.produce, p.from);
      const pose = poseAt(p, seconds, CONFIG.pickups.fall, view.phase);
      view.image.setVisible(pose.shown);
      if (!pose.shown) {
        view.shadow?.setVisible(false);
        continue;
      }
      // A gem that changes colour plays its frames as it lies there, each a little out of step with
      // the next.
      const sprite = produceSprite(p.produce);
      this.sprites.show(view.image, sprite, this.sprites.indexAt(sprite, (seconds + view.phase) * 1000));
      view.image
        .setPosition(pose.at.x, pose.at.y - pose.z - PRODUCE[p.produce].rest)
        .setDepth(pose.z > OVERHEAD ? DEPTH.effects - 20_000 + pose.at.y : standingDepth(pose.at.y));
      this.castShadow(view, p.produce, pose.at.x, pose.at.y, pose.z);
    }
    for (const [id, view] of this.shown) {
      if (live.has(id)) continue;
      view.image.destroy();
      view.shadow?.destroy();
      this.shown.delete(id);
    }
  }

  private make(id: string, produce: ProduceId, at: { x: number; y: number }): OnScreen {
    const view: OnScreen = {
      produce,
      image: this.sprites.make(this.scene, produceSprite(produce), at.x, at.y).setVisible(false),
      shadow: null,
      phase: phaseOf(id),
    };
    this.shown.set(id, view);
    return view;
  }

  /**
   * The shadow stays on the ground below a piece in the air, smaller and fainter the higher it is.
   */
  private castShadow(view: OnScreen, produce: ProduceId, x: number, y: number, z: number): void {
    const spec =
      this.sprites.get(produceSprite(produce)).shadow ?? (PRODUCE[produce].rest > 0 ? HOVER_SHADOW : undefined);
    if (!spec) return;
    const lift = 1 / (1 + z / 70);
    const scaled = { ...spec, rx: spec.rx * lift, ry: spec.ry * lift, a: spec.a * lift };
    if (!view.shadow) view.shadow = makeShadow(this.scene, scaled, x, y);
    else placeShadow(view.shadow, scaled, x, y);
    view.shadow.setVisible(true);
  }

  /**
   * Where the middle of a piece is drawn now, for a test that wants to see it. Undefined for one
   * not drawn.
   */
  centreOf(id: string): { x: number; y: number } | undefined {
    const v = this.shown.get(id);
    // Food stands on its anchor, so its middle is above it. A gem is drawn round its middle
    // already.
    return v?.image.visible ? { x: v.image.x, y: v.image.y - (PRODUCE[v.produce].rest > 0 ? 0 : 20) } : undefined;
  }

  /** How many display objects this holds, for the performance report. */
  get objectCount(): number {
    return this.shown.size * 2;
  }

  destroy(): void {
    for (const v of this.shown.values()) {
      v.image.destroy();
      v.shadow?.destroy();
    }
    this.shown.clear();
  }
}
