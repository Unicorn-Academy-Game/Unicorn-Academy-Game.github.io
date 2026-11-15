import type { Rng } from '../../../domain/rng';
import { COLORS, type RGB } from '../../engine/color';
import { floorEdges, floorY, type Plan, rowDepths } from './layout';

/**
 * The tiles of the dance floor, each of which lights up. They are lit in a pattern that goes with
 * the beat, one of four that the mirror ball changes between, and under a friend who is dancing,
 * and in a ripple from where a touch lands. A tile is how bright it is and what colour, and it
 * fades; the picture of the floor is drawn from them.
 */

/** The colours a tile can be, in the order a pattern uses them. */
export const TILE_COLORS: readonly RGB[] = [
  COLORS.pink,
  COLORS.cyan,
  COLORS.gold,
  COLORS.mint,
  COLORS.violet,
  COLORS.orange,
  COLORS.blue,
];

export const SHOWS = ['rainbow', 'checker', 'rings', 'sparkle'] as const;
export type Show = (typeof SHOWS)[number];

/** How fast a lit tile fades, in a share of what is left each second. */
const FADE = 3.4;

export interface Tile {
  /** How bright it is, from 0 to 1. */
  glow: number;
  /** Which of `TILE_COLORS` it is. */
  color: number;
}

export class Tiles {
  cols: number;
  rows: number;
  list: Tile[];
  /** Ripples that are spreading from a touch: where they began, when, and in what colour. */
  private readonly ripples: { col: number; row: number; age: number; color: number }[] = [];
  show: Show = 'rainbow';

  constructor(
    private plan: Plan,
    private readonly rng: Rng,
  ) {
    this.cols = plan.floor.cols;
    this.rows = plan.floor.rows;
    this.list = Array.from({ length: this.cols * this.rows }, () => ({ glow: 0, color: 0 }));
  }

  /**
   * The floor has changed shape. If it has as many tiles as before they are the same tiles, in the
   * same pattern; if not they start dark.
   */
  place(plan: Plan): void {
    this.plan = plan;
    if (plan.floor.cols === this.cols && plan.floor.rows === this.rows) return;
    this.cols = plan.floor.cols;
    this.rows = plan.floor.rows;
    this.list = Array.from({ length: this.cols * this.rows }, () => ({ glow: 0, color: 0 }));
    this.ripples.length = 0;
  }

  reset(): void {
    for (const t of this.list) {
      t.glow = 0;
      t.color = 0;
    }
    this.ripples.length = 0;
    this.show = 'rainbow';
  }

  at(col: number, row: number): Tile {
    return this.list[row * this.cols + col]!;
  }

  /** The tile under a place on the floor, or nothing if it is off the floor. */
  find(x: number, y: number): { col: number; row: number } | null {
    const f = this.plan.floor;
    if (y < f.top || y > f.bottom) return null;
    const depth = (y - f.top) / (f.bottom - f.top);
    const edges = floorEdges(f, depth);
    if (x < edges.left || x > edges.right) return null;
    const bounds = rowDepths(this.rows);
    let row = this.rows - 1;
    for (let r = 0; r < this.rows; r++) {
      if (depth < bounds[r + 1]!) {
        row = r;
        break;
      }
    }
    const col = Math.min(this.cols - 1, Math.floor(((x - edges.left) / (edges.right - edges.left)) * this.cols));
    return { col, row };
  }

  /** The four corners of a tile, back left and right and then front right and left. */
  corners(col: number, row: number): readonly [number, number][] {
    const f = this.plan.floor;
    const bounds = rowDepths(this.rows);
    const back = bounds[row]!;
    const front = bounds[row + 1]!;
    const a = floorEdges(f, back);
    const b = floorEdges(f, front);
    const yBack = floorY(f, back);
    const yFront = floorY(f, front);
    const at = (e: { left: number; right: number }, c: number): number => e.left + ((e.right - e.left) * c) / this.cols;
    return [
      [at(a, col), yBack],
      [at(a, col + 1), yBack],
      [at(b, col + 1), yFront],
      [at(b, col), yFront],
    ];
  }

  /** Lights a tile at once, to this brightness and colour, if it is not already brighter. */
  light(col: number, row: number, glow: number, color: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const t = this.at(col, row);
    if (glow >= t.glow) {
      t.glow = Math.min(1, glow);
      t.color = ((color % TILE_COLORS.length) + TILE_COLORS.length) % TILE_COLORS.length;
    }
  }

  /** A touch on the floor at a place: the tile there and a ring of them after it. */
  tread(x: number, y: number, color: number): boolean {
    const at = this.find(x, y);
    if (!at) return false;
    this.light(at.col, at.row, 1, color);
    this.ripples.push({ col: at.col, row: at.row, age: 0, color });
    if (this.ripples.length > 6) this.ripples.shift();
    return true;
  }

  /**
   * The beat `index` of the music. The show lights the tiles as it does, as much as `level` (0 to
   * 1) of the floor.
   */
  beat(index: number, level: number): void {
    const { cols, rows } = this;
    const reach = 0.35 + 0.65 * Math.min(1, Math.max(0, level));
    const glow = 0.5 + 0.3 * reach;
    switch (this.show) {
      case 'rainbow':
        // A rainbow runs along the floor one tile at each beat, and the more is going on the more
        // of the floor is lit.
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) if (((c + index) % 7) / 7 < reach) this.light(c, r, glow, c + index);
        }
        break;
      case 'checker':
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++)
            if ((c + r + index) % 2 === 0) this.light(c, r, glow, (c + r) % 2 === 0 ? 0 : 1);
        }
        break;
      case 'rings': {
        // A ring goes out from the middle of the floor, the colour of the beat.
        const mid = (cols - 1) / 2;
        const ring = index % (Math.ceil(cols / 2) + 1);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const d = Math.max(Math.abs(c - mid), (rows - 1 - r) * 1.2);
            if (Math.abs(d - ring) < 0.8) this.light(c, r, glow, index);
          }
        }
        break;
      }
      case 'sparkle':
        for (let i = Math.round(5 + 14 * reach); i > 0; i--)
          this.light(
            this.rng.int(cols),
            this.rng.int(rows),
            0.5 + 0.5 * this.rng.next(),
            this.rng.int(TILE_COLORS.length),
          );
        break;
    }
  }

  /** Goes on to the next show. */
  next(): Show {
    this.show = SHOWS[(SHOWS.indexOf(this.show) + 1) % SHOWS.length]!;
    return this.show;
  }

  update(dt: number): void {
    const k = Math.exp(-FADE * dt);
    for (const t of this.list) t.glow *= k;
    // A ripple lights the tiles a step further out every tenth of a second, fainter as it goes.
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i]!;
      const before = Math.floor(ripple.age / 0.09);
      ripple.age += dt;
      const after = Math.floor(ripple.age / 0.09);
      for (let step = before + 1; step <= after; step++) {
        const strength = 1 - step * 0.14;
        if (strength <= 0.05) continue;
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if (Math.round(Math.max(Math.abs(c - ripple.col), Math.abs(r - ripple.row) * 1.4)) === step)
              this.light(c, r, strength, ripple.color + step);
          }
        }
      }
      if (ripple.age > 1.3) this.ripples.splice(i, 1);
    }
  }
}
