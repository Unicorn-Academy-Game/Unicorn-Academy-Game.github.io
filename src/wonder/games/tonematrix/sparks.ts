// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under the GNU General Public License
// version 3 only. Translated to TypeScript and changed for this game on 31 October 2026. See `src/wonder/games/tonematrix/NOTICE.md`.

import { SIZE } from './scale';

/**
 * How many sparks there can be at once. The oldest gives up its place when there are more, as in
 * the original.
 */
export const POOL = 2000;
/** How long a spark lives, in frames of a sixtieth of a second. */
export const LIFE = 40;
/**
 * How fast a spark leaves a tile, in tiles a frame. The original gives 8 pixels, which on its 32
 * pixel tiles is a quarter of a tile.
 */
export const SPEED = 0.25;
/** How many sparks a tile that is struck throws. */
export const PER_BURST = 20;

/**
 * What each frame of a spark's life adds to the heat of the tile it is over: the original's
 * brightness of 0.05, and the 204 of the 255 steps it has between a dim tile and a bright one.
 */
const WARMTH = (0.05 * (204 / 255)) / LIFE;
/** How bright a tile that nothing has touched is, which is the original's 51 of 255. */
export const DIM = 51 / 255;

/**
 * The sparks that a struck tile throws and the glow they leave on the tiles they cross. They are
 * never drawn themselves, as in the original: what shows is how many of them, and how fresh, are
 * over each tile, so a burst is a light that spreads over the grid and fades. Positions are in
 * tiles, and a spark that reaches the edge of the grid bounces off it.
 */
export class Sparks {
  private readonly x = new Float32Array(POOL);
  private readonly y = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private oldest = 0;
  private alive = 0;

  /** How many sparks are in the air. */
  get count(): number {
    return this.alive;
  }

  clear(): void {
    this.life.fill(0);
    this.alive = 0;
  }

  /**
   * `n` sparks leave a point in a ring, from a start that is chosen at random so one burst is not
   * the same as the last.
   */
  burst(x: number, y: number, random: () => number, speed = SPEED, n = PER_BURST): void {
    const turn = random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const angle = turn + (i / n) * Math.PI * 2;
      const at = this.oldest;
      this.x[at] = x;
      this.y[at] = y;
      this.vx[at] = Math.cos(angle) * speed;
      this.vy[at] = Math.sin(angle) * speed;
      if (this.life[at]! <= 0) this.alive++;
      this.life[at] = LIFE;
      this.oldest = (at + 1) % POOL;
    }
  }

  /** Moves every spark on by `seconds`. */
  update(seconds: number): void {
    const frames = seconds * 60;
    let alive = 0;
    for (let i = 0; i < POOL; i++) {
      if (this.life[i]! <= 0) continue;
      let x = this.x[i]! + this.vx[i]! * frames;
      let y = this.y[i]! + this.vy[i]! * frames;
      if (x < 0 || x > SIZE) {
        this.vx[i] = -this.vx[i]!;
        x = x < 0 ? -x : 2 * SIZE - x;
      }
      if (y < 0 || y > SIZE) {
        this.vy[i] = -this.vy[i]!;
        y = y < 0 ? -y : 2 * SIZE - y;
      }
      this.x[i] = x;
      this.y[i] = y;
      this.life[i] = this.life[i]! - frames;
      if (this.life[i]! > 0) alive++;
    }
    this.alive = alive;
  }

  /**
   * How much light the sparks put on each tile, from 0 (none over it) and up, indexed `x * SIZE +
   * y`. Each spark adds what it has left to live, so a tile a fresh burst is on is bright and one
   * the burst has crossed is dim.
   */
  heat(into: Float32Array): Float32Array {
    into.fill(0);
    for (let i = 0; i < POOL; i++) {
      const life = this.life[i]!;
      if (life <= 0) continue;
      const x = Math.floor(this.x[i]!);
      const y = Math.floor(this.y[i]!);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) into[x * SIZE + y]! += life;
    }
    return into;
  }
}

/** How bright a tile that is off is, from 0 to 1, for the heat sparks have put on it. */
export const glowOf = (heat: number): number => Math.min(1, DIM + heat * WARMTH);
