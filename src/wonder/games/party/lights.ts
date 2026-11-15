import type { RGB } from '../../engine/color';
import { lerp } from '../../engine/ease';
import type { Lit } from '../sky/light';
import { floorEdges, floorY, type Plan } from './layout';
import { TILE_COLORS, type Tiles } from './tiles';

/**
 * The light on the floor, which falls on the friends. The mirror ball throws five spots that wander
 * over the floor, and each lit tile lights what stands near it. A friend is put in the dark and
 * then lit by what reaches her, so she is the colour of the party around her and keeps her own
 * colours.
 */

/** One spot of the mirror ball on the floor. */
export interface Spot {
  x: number;
  y: number;
  /** How far across it is, in units. */
  r: number;
  color: RGB;
  /** How bright it is, from 0 to 1. */
  level: number;
}

const SPOTS = 5;

export class Lights {
  readonly spots: Spot[] = Array.from({ length: SPOTS }, () => ({
    x: 0,
    y: 0,
    r: 40,
    color: TILE_COLORS[0]!,
    level: 0,
  }));
  /** How lively the party is, from 0 to 1: how bright the spots are and how fast they go. */
  lively = 0;
  /** A bright moment on top of everything, from 0 to 1, falling away. */
  surge = 0;
  /** Where each tile's middle is, worked out when the floor is laid out. */
  private centres: { x: number; y: number; reach: number }[] = [];

  place(plan: Plan, tiles: Tiles): void {
    this.centres = [];
    for (let row = 0; row < tiles.rows; row++) {
      for (let col = 0; col < tiles.cols; col++) {
        const c = tiles.corners(col, row);
        const x = (c[0]![0] + c[1]![0] + c[2]![0] + c[3]![0]) / 4;
        const y = (c[0]![1] + c[1]![1] + c[2]![1] + c[3]![1]) / 4;
        this.centres.push({ x, y, reach: (c[2]![0] - c[3]![0]) * 0.9 });
      }
    }
    this.moveSpots(0, 0, plan);
  }

  /** Moves the spots on to this moment. `beats` colours them, `time` moves them. */
  update(time: number, beats: number, plan: Plan, dt: number): void {
    this.surge = Math.max(0, this.surge - dt * 2.4);
    this.moveSpots(time * (0.55 + 0.7 * this.lively), beats, plan);
  }

  private moveSpots(t: number, beats: number, plan: Plan): void {
    const f = plan.floor;
    const share = Math.floor(beats / 2);
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i]!;
      const depth = 0.5 + 0.38 * Math.sin(t * (0.7 + 0.11 * i) + i * 1.7);
      const edges = floorEdges(f, depth);
      const across = 0.5 + 0.5 * Math.sin(t * (0.5 + 0.13 * i) + i * 2.3);
      s.x = lerp(edges.left + 20, edges.right - 20, across);
      s.y = floorY(f, depth);
      s.r = (26 + 40 * depth) * (plan.portrait ? 0.8 : 1);
      s.color = TILE_COLORS[(((share + i) % TILE_COLORS.length) + TILE_COLORS.length) % TILE_COLORS.length]!;
      // A spot is only there when the party has some life in it.
      s.level = Math.min(1, this.lively * 1.4) * (0.55 + 0.45 * Math.sin(t * 1.3 + i * 0.9) ** 2);
    }
  }

  /** The light that reaches a place on the floor. Fills in and returns `out`. */
  at(x: number, y: number, tiles: Tiles, out: Lit): Lit {
    let level = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < this.centres.length; i++) {
      const tile = tiles.list[i]!;
      if (tile.glow < 0.03) continue;
      const c = this.centres[i]!;
      const d = Math.hypot(x - c.x, (y - c.y) * 2) / c.reach;
      const f = (tile.glow * 0.8) / (1 + d * d);
      const color = TILE_COLORS[tile.color]!;
      level += f;
      r += color[0] * f;
      g += color[1] * f;
      b += color[2] * f;
    }
    for (const s of this.spots) {
      if (s.level < 0.02) continue;
      const d = Math.hypot(x - s.x, (y - s.y) * 1.8) / s.r;
      const f = (s.level * 0.7) / (1 + d * d * 1.5);
      level += f;
      r += s.color[0] * f;
      g += s.color[1] * f;
      b += s.color[2] * f;
    }
    level += this.surge * 0.5;
    r += 255 * this.surge * 0.5;
    g += 255 * this.surge * 0.5;
    b += 255 * this.surge * 0.5;
    out.level = Math.min(1, level);
    if (level > 0.0001) {
      out.r = r / level;
      out.g = g / level;
      out.b = b / level;
    }
    return out;
  }
}
