import { EAST, type UnicornFacing, WEST } from '../shared/compass';
import type { Vec2 } from '../shared/ids';
import { clamp } from '../shared/math';

export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const normalize = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const copy = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const isFiniteVec = (a: Vec2): boolean => Number.isFinite(a.x) && Number.isFinite(a.y);

/**
 * Side facing (east or west) that points from `a` toward `b`, or `fallback` when `b` is straight
 * above or below. Used by clips that only exist in side views.
 */
export const sideToward = (a: Vec2, b: Vec2, fallback: UnicornFacing = EAST): UnicornFacing =>
  b.x > a.x + 0.5 ? EAST : b.x < a.x - 0.5 ? WEST : fallback;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (p: Vec2, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
