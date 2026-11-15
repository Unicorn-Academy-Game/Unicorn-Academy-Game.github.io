import { readFileSync } from 'node:fs';
import { decodePng } from '../../lib/png';
import { blit, createRgba, type Rgba } from '../core/image';
import { type EdgeKind, pickTile, TILE_PX, type Tileset } from './terrain';

export const readImage = (path: string): Rgba => {
  const png = decodePng(new Uint8Array(readFileSync(path)));
  return { width: png.width, height: png.height, data: png.data };
};

export type Corner = 'grass' | EdgeKind;

/** A throwaway canvas for judging how art sits together. Sprites are depth-sorted by their feet. */
export class Stage {
  readonly image: Rgba;
  private readonly queue: { y: number; draw: () => void }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.image = createRgba(width, height, [0, 0, 0, 255]);
  }

  /**
   * `corners(cx, cy)` classifies the vertex at tile corner (cx, cy); a tile reads its four corners.
   */
  terrain(set: Tileset, corners: (cx: number, cy: number) => Corner, frame = 0): void {
    const cols = Math.ceil(this.width / TILE_PX),
      rows = Math.ceil(this.height / TILE_PX);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pick = pickTile(
          set,
          [corners(c, r), corners(c + 1, r), corners(c, r + 1), corners(c + 1, r + 1)],
          c,
          r,
          frame,
        );
        if (!pick) throw new Error(`stage: no tile at ${c},${r}`);
        blit(this.image, set.tiles[pick.id]!, c * TILE_PX, r * TILE_PX);
      }
    }
  }

  /**
   * Soft elliptical contact shadow, darkening whatever is below. Drawn immediately, so call before
   * sprites.
   */
  shadow(x: number, y: number, rx: number, ry: number, alpha = 0.3): void {
    const x0 = Math.floor(x - rx - 2),
      x1 = Math.ceil(x + rx + 2),
      y0 = Math.floor(y - ry - 2),
      y1 = Math.ceil(y + ry + 2);
    for (let py = Math.max(0, y0); py < Math.min(this.height, y1); py++) {
      for (let px = Math.max(0, x0); px < Math.min(this.width, x1); px++) {
        const d = Math.hypot((px - x) / rx, (py - y) / ry);
        if (d >= 1) continue;
        const a = alpha * Math.min(1, (1 - d) * 3.2);
        const i = (py * this.width + px) * 4;
        // Multiply toward a cool dark so shadows keep the scene's lavender cast.
        this.image.data[i] = Math.round(this.image.data[i]! * (1 - a) + 38 * a);
        this.image.data[i + 1] = Math.round(this.image.data[i + 1]! * (1 - a) + 44 * a);
        this.image.data[i + 2] = Math.round(this.image.data[i + 2]! * (1 - a) + 78 * a);
      }
    }
  }

  /**
   * Queues a sprite whose ground point sits at (x, y); `ox`/`oy` is that point inside the sprite.
   */
  sprite(img: Rgba, x: number, y: number, ox: number, oy: number): void {
    this.queue.push({ y, draw: () => blit(this.image, img, Math.round(x - ox), Math.round(y - oy)) });
  }

  flush(): Rgba {
    this.queue.sort((a, b) => a.y - b.y);
    for (const q of this.queue) q.draw();
    this.queue.length = 0;
    return this.image;
  }
}
