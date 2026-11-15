import type Phaser from 'phaser';
import type { Bundle, Sprite } from '../shared/manifest';
import type { Bounds } from './cull';
import { pageTexture } from './keys';

/** One bundle's scenery, props and effects, drawn as images from its pages. */
export class SpriteSet {
  constructor(
    readonly bundleId: string,
    readonly bundle: Bundle,
  ) {}

  has(id: string): boolean {
    return this.bundle.sprites[id] !== undefined;
  }

  get(id: string): Sprite {
    const s = this.bundle.sprites[id];
    if (!s) throw new Error(`bundle ${this.bundleId} has no sprite ${id}`);
    return s;
  }

  /**
   * The texture and frame names of one frame of a sprite, and the origin as a fraction of its
   * source canvas.
   */
  frame(id: string, index: number): { texture: string; frame: string; originX: number; originY: number } {
    const s = this.get(id);
    const f = s.frames[index % s.frames.length]!;
    const rect = this.bundle.pages[f.page]!.rects[f.rect]!;
    return {
      texture: pageTexture(this.bundleId, f.page),
      frame: String(f.rect),
      originX: s.origin[0] / rect.sw,
      originY: s.origin[1] / rect.sh,
    };
  }

  /** An image of a sprite's first frame, anchored at its ground point. */
  make(scene: Phaser.Scene, id: string, x: number, y: number): Phaser.GameObjects.Image {
    const f = this.frame(id, 0);
    return scene.add.image(x, y, f.texture, f.frame).setOrigin(f.originX, f.originY);
  }

  /**
   * Shows a frame of a sprite on an image, changing its texture and anchor only when they differ.
   */
  show(image: Phaser.GameObjects.Image, id: string, index: number): void {
    const f = this.frame(id, index);
    if (image.frame.name !== f.frame || image.texture.key !== f.texture) image.setTexture(f.texture, f.frame);
    if (image.originX !== f.originX || image.originY !== f.originY) image.setOrigin(f.originX, f.originY);
  }

  /** The world area a sprite anchored at (x, y) can cover, taking the biggest of its frames. */
  reach(id: string, x: number, y: number): Bounds {
    const s = this.get(id);
    let w = 0;
    let h = 0;
    for (const f of s.frames) {
      const rect = this.bundle.pages[f.page]!.rects[f.rect]!;
      w = Math.max(w, rect.sw);
      h = Math.max(h, rect.sh);
    }
    return { left: x - s.origin[0], top: y - s.origin[1], right: x + w - s.origin[0], bottom: y + h - s.origin[1] };
  }

  /** Total length of a sprite's frames in milliseconds. */
  durationMs(id: string): number {
    return this.get(id).frames.reduce((sum, f) => sum + f.ms, 0);
  }

  /** The frame index shown `elapsedMs` into a sprite's animation. */
  indexAt(id: string, elapsedMs: number): number {
    const s = this.get(id);
    if (s.frames.length === 1) return 0;
    const total = this.durationMs(id);
    let t = s.loop ? ((elapsedMs % total) + total) % total : Math.min(Math.max(0, elapsedMs), total - 1);
    for (let i = 0; i < s.frames.length; i++) {
      t -= s.frames[i]!.ms;
      if (t < 0) return i;
    }
    return s.frames.length - 1;
  }
}
