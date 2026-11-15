import type Phaser from 'phaser';
import { LIFE, lifeSprite } from '../content/life';
import { CONFIG, type Critter, type World } from '../domain';
import { DEPTH, standingDepth } from './depth';
import { makeShadow, placeShadow } from './shadow';
import type { SpriteSet } from './sprites';

/**
 * A creature higher than this is drawn in front of every tree it flies over, and lower it sorts
 * with the ground like anyone else.
 */
const OVERHEAD = 26;
/** How far outside the camera a creature is still drawn, in world units. */
const MARGIN = 160;
/** A flyer's little bob, which is only for the picture: how far, and how fast. */
const BOB = 2.4;
const BOB_RATE = 5;
/** Fish swim under the water, so they are drawn a little see-through and just above it. */
const SHADE_ALPHA = 0.88;

interface OnScreen {
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  /** A number of its own, so neighbours do not bob in step. */
  phase: number;
  /** Where the middle of it was drawn last frame, for a test that wants to tap it. */
  centre: { x: number; y: number };
}

const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h % 628) / 100;
};

/**
 * Everyone who lives in the world, drawn from the simulation: each one a picture and a soft shadow
 * on the ground under it. The simulation says where, how high and in which clip. This only looks,
 * so it can be thrown away and rebuilt with the map.
 */
export class LifeView {
  private readonly shown = new Map<string, OnScreen>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: SpriteSet,
  ) {}

  update(world: World, alpha: number): void {
    const camera = this.scene.cameras.main.worldView;
    const seconds = world.time + alpha * CONFIG.step;
    for (const c of world.life.critters) {
      const x = c.prev.x + (c.pos.x - c.prev.x) * alpha;
      const y = c.prev.y + (c.pos.y - c.prev.y) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      const near =
        x > camera.x - MARGIN &&
        x < camera.right + MARGIN &&
        y - z > camera.y - MARGIN &&
        y < camera.bottom + MARGIN + 200;
      const view = this.shown.get(c.id);
      if (!near) {
        view?.image.setVisible(false);
        view?.shadow?.setVisible(false);
        continue;
      }
      // Pictures are made the first time someone is about to be seen, so a map full of creatures
      // costs nothing until the child gets there.
      this.draw(view ?? this.make(c, x, y), c, x, y, z, seconds);
    }
  }

  private make(c: Critter, x: number, y: number): OnScreen {
    const id = lifeSprite(c.kind, c.look, c.anim.clip);
    const view: OnScreen = {
      image: this.sprites.make(this.scene, id, x, y),
      shadow: null,
      phase: phaseOf(c.id),
      centre: { x, y },
    };
    this.shown.set(c.id, view);
    return view;
  }

  private draw(view: OnScreen, c: Critter, x: number, y: number, z: number, seconds: number): void {
    const def = LIFE[c.kind];
    const id = lifeSprite(c.kind, c.look, c.anim.clip);
    view.image.setVisible(true);
    this.sprites.show(view.image, id, this.sprites.indexAt(id, (seconds - c.anim.startedAt) * 1000));
    const bob = def.home === 'air' ? Math.sin(seconds * BOB_RATE + view.phase) * BOB : 0;
    const under = c.kind === 'fish' && c.anim.clip === 'swim';
    view.image
      .setPosition(x, y - z - bob)
      .setFlipX(c.anim.facing === 'west')
      .setAlpha(under ? SHADE_ALPHA : 1)
      .setDepth(under ? DEPTH.water + 0.5 : z > OVERHEAD ? DEPTH.effects - 20_000 + y : standingDepth(y));
    view.centre.x = x;
    view.centre.y = y - z - def.body.cy;
    this.castShadow(view, id, x, y, z);
  }

  /**
   * The shadow stays on the ground below a creature in the air, smaller and fainter the higher it
   * flies.
   */
  private castShadow(view: OnScreen, id: string, x: number, y: number, z: number): void {
    const spec = this.sprites.get(id).shadow;
    if (!spec) {
      view.shadow?.setVisible(false);
      return;
    }
    const lift = 1 / (1 + z / 90);
    const scaled = { ...spec, rx: spec.rx * lift, ry: spec.ry * lift, a: spec.a * lift };
    if (!view.shadow) view.shadow = makeShadow(this.scene, scaled, x, y);
    else placeShadow(view.shadow, scaled, x, y);
    view.shadow.setVisible(true);
  }

  /**
   * Where the middle of a creature was drawn last frame. Undefined for one that has never been
   * drawn.
   */
  centreOf(id: string): { x: number; y: number } | undefined {
    return this.shown.get(id)?.centre;
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
