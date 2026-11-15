import type { Vec2 } from '../shared/ids';

/**
 * The keys that lead Wildstar, by physical position, so WASD is a block on a keyboard of any
 * layout.
 */
const POINTS: Readonly<Record<string, Vec2>> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * The direction the held keys point. Two opposite keys cancel, and two that are at a right angle
 * point between them.
 */
export class SteerKeys {
  private readonly held = new Set<string>();

  /** True if the key is one of these, whether or not it changed anything. */
  down(code: string): boolean {
    if (!(code in POINTS)) return false;
    this.held.add(code);
    return true;
  }

  up(code: string): boolean {
    if (!(code in POINTS)) return false;
    this.held.delete(code);
    return true;
  }

  /**
   * Lets go of everything, for a window that lost focus: a key lifted over there is never heard
   * here.
   */
  clear(): void {
    this.held.clear();
  }

  /** A direction of length one, or null when nothing points anywhere. */
  heading(): Vec2 | null {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const p = POINTS[code]!;
      x += p.x;
      y += p.y;
    }
    const length = Math.hypot(x, y);
    return length < 1e-9 ? null : { x: x / length, y: y / length };
  }
}
