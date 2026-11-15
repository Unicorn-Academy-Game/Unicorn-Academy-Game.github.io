import { mix, type RGB } from '../../engine/color';
import { damp } from '../../engine/ease';

/**
 * The light that reaches one place: how much, and what colour. Filled in by `BurstLight.at`, and
 * reused so nothing is allocated.
 */
export interface Lit {
  level: number;
  r: number;
  g: number;
  b: number;
}

export const newLit = (): Lit => ({ level: 0, r: 255, g: 255, b: 255 });

interface Pool {
  x: number;
  y: number;
  age: number;
  color: RGB;
  /** How far across it is, in units. */
  size: number;
}

/** How long a burst lights the night, in seconds. */
const BURST_LIGHT_SECONDS = 1.1;

/**
 * The light the bursts throw on everything. Each burst is a pool of coloured light that spreads and
 * fades, and any object asks how much of it reaches the spot where it stands, so a shell on the
 * left lights the friends and the clouds on the left more.
 */
export class BurstLight {
  readonly pools: Pool[] = [];
  /** How bright the whole sky is just now, from 0 to 1. */
  ambient = 0;
  /** The colour of the sky's light, drifting to the colour of the last burst. */
  tint: RGB = [255, 255, 255];

  add(x: number, y: number, color: RGB, size: number, strength = 1): void {
    this.pools.push({ x, y, age: 0, color, size });
    this.ambient = Math.min(1, this.ambient + 0.45 * strength);
    this.tint = mix(this.tint, color, 0.65);
  }

  update(dt: number): void {
    this.ambient = damp(this.ambient, 0, 3.1, dt);
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i]!;
      pool.age += dt;
      if (pool.age > BURST_LIGHT_SECONDS) this.pools.splice(i, 1);
    }
  }

  clear(): void {
    this.pools.length = 0;
    this.ambient = 0;
  }

  /** How much of a pool's strength is left, from 1 down to 0. */
  static fade(pool: { age: number }): number {
    const left = 1 - pool.age / BURST_LIGHT_SECONDS;
    return left <= 0 ? 0 : left * left;
  }

  /** The light at a point. */
  at(x: number, y: number, out: Lit): Lit {
    let level = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const pool of this.pools) {
      const reach = pool.size * 0.3;
      const d = Math.hypot(x - pool.x, y - pool.y) / reach;
      const f = BurstLight.fade(pool) / (1 + d * d);
      level += f;
      r += pool.color[0] * f;
      g += pool.color[1] * f;
      b += pool.color[2] * f;
    }
    out.level = Math.min(1, level);
    if (level > 0.0001) {
      out.r = r / level;
      out.g = g / level;
      out.b = b / level;
    }
    return out;
  }
}
