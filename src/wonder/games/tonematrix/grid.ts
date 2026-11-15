// SPDX-License-Identifier: GPL-3.0-only
// Adapted from ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under the GNU General Public License
// version 3 only. Translated to TypeScript and changed for this game on 31 October 2026. See `src/wonder/games/tonematrix/NOTICE.md`.

import { SIZE } from './scale';

/**
 * One tile of the grid: `x` is the step of the loop, from the left, and `y` is the row from the
 * top, so a high note has a small `y`.
 */
export interface Tile {
  readonly x: number;
  readonly y: number;
}

/** The tile that a point in a rectangle of `w` by `h` is on, or null for a point outside it. */
export function tileAt(px: number, py: number, w: number, h: number): Tile | null {
  const x = Math.floor((px / w) * SIZE);
  const y = Math.floor((py / h) * SIZE);
  return x < 0 || y < 0 || x >= SIZE || y >= SIZE || !Number.isFinite(x + y) ? null : { x, y };
}

/**
 * The tiles on the way from one tile to another, the first left out and the last in, so a finger
 * that moved fast leaves no gap.
 */
export function tilesBetween(from: Tile, to: Tile): Tile[] {
  const out: Tile[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++)
    out.push({ x: from.x + Math.round((dx * i) / steps), y: from.y + Math.round((dy * i) / steps) });
  return out;
}

/**
 * The tiles that are on. Kept in the order of the original, `x * SIZE + y`, which is also the order
 * of its share code. A grid that is `mono` is a line of one note at a time, like a voice: it has at
 * most one tile in a step, and a tile that goes on puts out the one that was there.
 */
export class Grid {
  private readonly lit = new Uint8Array(SIZE * SIZE);
  private readonly perStep = new Uint8Array(SIZE);
  private total = 0;

  constructor(readonly mono = false) {}

  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE && this.lit[x * SIZE + y] === 1;
  }

  /** Turns a tile on or off. Returns whether that changed anything. */
  set(x: number, y: number, on: boolean): boolean {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const at = x * SIZE + y;
    if ((this.lit[at] === 1) === on) return false;
    if (on && this.mono) this.put(x, this.rowOf(x), false);
    this.put(x, y, on);
    return true;
  }

  private put(x: number, y: number, on: boolean): void {
    if (y < 0 || this.lit[x * SIZE + y] === (on ? 1 : 0)) return;
    this.lit[x * SIZE + y] = on ? 1 : 0;
    this.perStep[x]! += on ? 1 : -1;
    this.total += on ? 1 : -1;
  }

  /**
   * The row, from the top, of the highest tile that is on in a step, or -1 for a step with none. In
   * a grid that is mono it is the only one.
   */
  rowOf(x: number): number {
    for (let y = 0; y < SIZE; y++) if (this.has(x, y)) return y;
    return -1;
  }

  /**
   * How many steps on from a step the next step with a tile is, going round the loop, from 1 to 16.
   * A step that is the only one with a tile has the whole loop.
   */
  gapAfter(x: number): number {
    for (let n = 1; n < SIZE; n++) if (this.perStep[(x + n) % SIZE]! > 0) return n;
    return SIZE;
  }

  /** Turns every tile off. Returns how many were on. */
  clear(): number {
    const was = this.total;
    this.lit.fill(0);
    this.perStep.fill(0);
    this.total = 0;
    return was;
  }

  /** How many tiles are on in a step. These are the notes that sound together. */
  inStep(x: number): number {
    return this.perStep[x] ?? 0;
  }

  /** How many tiles are on. */
  get count(): number {
    return this.total;
  }

  /** The rows, from the top, of the tiles that are on in a step. */
  rowsOf(x: number): number[] {
    const rows: number[] = [];
    for (let y = 0; y < SIZE; y++) if (this.has(x, y)) rows.push(y);
    return rows;
  }

  /** Every tile that is on, in step order. */
  tiles(): Tile[] {
    const out: Tile[] = [];
    for (let x = 0; x < SIZE; x++) for (const y of this.rowsOf(x)) out.push({ x, y });
    return out;
  }
}

/**
 * What one finger is doing on the grid. Whether it paints or rubs out is decided by the first tile
 * it touches, as in the original: a tile that is off is painted on, and the finger goes on painting
 * for as long as it is down, and a tile that is on is rubbed out, and so is every one that finger
 * crosses. So a stroke is never half one and half the other.
 */
export class Stroke {
  private last: Tile | null;
  /**
   * The tiles that painting put out because they were in the way, in a grid that has one note at a
   * time, not yet taken.
   */
  private displaced: Tile[] = [];
  /** How many tiles it has changed. */
  changed = 0;

  private constructor(
    /** True when the finger is painting tiles on, false when it is rubbing them out. */
    readonly arming: boolean,
    first: Tile,
  ) {
    this.last = first;
  }

  /** A finger goes down on a tile. Gives the stroke and the tile it changed, if it did. */
  static begin(grid: Grid, first: Tile): { stroke: Stroke; changed: Tile[] } {
    const stroke = new Stroke(!grid.has(first.x, first.y), first);
    return { stroke, changed: stroke.apply(grid, first) ? [first] : [] };
  }

  /**
   * The tiles the finger has just changed by being where it is now. The ones it passed over on the
   * way are included.
   */
  move(grid: Grid, to: Tile | null): Tile[] {
    if (!to) {
      // A finger that goes off the grid and comes back starts a line again where it comes back, so
      // it does not draw across what it skipped.
      this.last = null;
      return [];
    }
    const path = this.last ? tilesBetween(this.last, to) : [to];
    this.last = to;
    return path.filter((tile) => this.apply(grid, tile));
  }

  /**
   * The tiles that were put out to make room for the ones painted since this was last asked, and
   * then none.
   */
  takeDisplaced(): Tile[] {
    const out = this.displaced;
    this.displaced = [];
    return out;
  }

  private apply(grid: Grid, tile: Tile): boolean {
    const before = this.arming && grid.mono ? grid.rowOf(tile.x) : -1;
    const did = grid.set(tile.x, tile.y, this.arming);
    if (!did) return false;
    this.changed++;
    if (before >= 0 && before !== tile.y) this.displaced.push({ x: tile.x, y: before });
    return true;
  }
}
