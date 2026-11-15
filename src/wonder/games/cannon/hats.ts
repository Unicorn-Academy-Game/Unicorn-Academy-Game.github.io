import type { RGB } from '../../engine/color';
import { clamp } from '../../engine/ease';
import { paintCap } from './figures';

interface Hat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  age: number;
  readonly color: RGB;
  readonly size: number;
}

const GRAVITY = 430;
/** How long a nightcap stays in the air before it is gone, in seconds. */
const HAT_SECONDS = 2.3;
const FADE = 0.5;

/**
 * The nightcaps that fly off the stars as they wake: thrown up and sideways, tumbling, and falling
 * away out of the picture.
 */
export class Hats {
  private readonly hats: Hat[] = [];

  get count(): number {
    return this.hats.length;
  }

  toss(x: number, y: number, rot: number, color: RGB, size: number, vx: number, vy: number, spin: number): void {
    if (this.hats.length > 48) this.hats.shift();
    this.hats.push({ x, y, vx, vy, rot, spin, age: 0, color, size });
  }

  update(dt: number): void {
    for (let i = this.hats.length - 1; i >= 0; i--) {
      const h = this.hats[i]!;
      h.age += dt;
      if (h.age >= HAT_SECONDS) {
        this.hats.splice(i, 1);
        continue;
      }
      h.vy += GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.spin * dt;
    }
  }

  paint(g: CanvasRenderingContext2D): void {
    for (const h of this.hats) {
      g.save();
      g.translate(h.x, h.y);
      g.rotate(h.rot);
      paintCap(g, h.color, h.size, clamp((HAT_SECONDS - h.age) / FADE));
      g.restore();
    }
  }

  clear(): void {
    this.hats.length = 0;
  }
}
