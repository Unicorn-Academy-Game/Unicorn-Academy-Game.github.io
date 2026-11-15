import type Phaser from 'phaser';

export interface CanopyBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Entry {
  image: Phaser.GameObjects.Image;
  box: CanopyBox;
  /** Ground y of the tree. A walker whose feet are farther up the map than this is behind it. */
  footY: number;
  alpha: number;
}

const CELL = 256;
const FADED = 0.34;
/** Fade speed in alpha per second. */
const RATE = 5;

/**
 * The box a walker covers on screen, relative to its feet. A side-on unicorn is 158 by 114 and N/S
 * views are taller.
 */
const WALKER_BOX = { left: 76, right: 76, up: 126, down: 6 } as const;

/**
 * Fades the tall foliage of a tree while someone stands behind it, so the player can always see the
 * unicorns. Trees go in a coarse grid once, and each frame only the trees near a walker are tested.
 */
export class CanopyFader {
  private readonly grid = new Map<number, Entry[]>();
  private readonly all: Entry[] = [];
  private readonly fading = new Set<Entry>();
  private readonly wanted = new Set<Entry>();

  add(image: Phaser.GameObjects.Image, box: CanopyBox, footY: number): void {
    const entry: Entry = { image, box, footY, alpha: 1 };
    this.all.push(entry);
    for (let cy = Math.floor(box.y / CELL); cy <= Math.floor((box.y + box.h) / CELL); cy++) {
      for (let cx = Math.floor(box.x / CELL); cx <= Math.floor((box.x + box.w) / CELL); cx++) {
        const key = cy * 4096 + cx;
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(entry);
        else this.grid.set(key, [entry]);
      }
    }
  }

  /** Marks the trees that hide the walker at (x, y). Call once per walker, then `apply`. */
  cover(x: number, y: number): void {
    const l = x - WALKER_BOX.left;
    const r = x + WALKER_BOX.right;
    const t = y - WALKER_BOX.up;
    const b = y + WALKER_BOX.down;
    for (let cy = Math.floor(t / CELL); cy <= Math.floor(b / CELL); cy++) {
      for (let cx = Math.floor(l / CELL); cx <= Math.floor(r / CELL); cx++) {
        for (const e of this.grid.get(cy * 4096 + cx) ?? []) {
          if (y >= e.footY) continue;
          const box = e.box;
          if (r > box.x && l < box.x + box.w && b > box.y && t < box.y + box.h) this.wanted.add(e);
        }
      }
    }
  }

  /** Eases every tree toward its target and forgets the ones that are fully back. */
  apply(dtSeconds: number): void {
    for (const e of this.wanted) this.fading.add(e);
    const step = RATE * dtSeconds;
    for (const e of this.fading) {
      const target = this.wanted.has(e) ? FADED : 1;
      e.alpha = e.alpha < target ? Math.min(target, e.alpha + step) : Math.max(target, e.alpha - step);
      e.image.setAlpha(e.alpha);
      if (e.alpha === 1 && !this.wanted.has(e)) this.fading.delete(e);
    }
    this.wanted.clear();
  }

  clear(): void {
    this.grid.clear();
    this.all.length = 0;
    this.fading.clear();
    this.wanted.clear();
  }

  get size(): number {
    return this.all.length;
  }
}
