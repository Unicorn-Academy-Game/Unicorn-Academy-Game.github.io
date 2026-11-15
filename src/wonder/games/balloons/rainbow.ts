import type { Rng } from '../../../domain/rng';
import type { RGB } from '../../engine/color';
import { type Arch, columnOf, flight, RING_COLORS, type Slot, type Trip, tripOf } from './arch';
import { type Body, bodyOf } from './art';

/** One balloon of the rainbow: its place, when it flies there, and whether it has been popped. */
export interface Piece {
  readonly slot: Slot;
  readonly trip: Trip;
  readonly color: RGB;
  /** What makes it sway differently from the one beside it. */
  readonly phase: number;
  popped: boolean;
}

/**
 * The rainbow the finale builds. It owns the balloons of the rainbow: where each is at a moment,
 * which have arrived, which are popped, and which a finger is on. It draws the ones that are left,
 * and the game decides when to pop them.
 */
export class Rainbow {
  pieces: Piece[] = [];
  arch: Arch | null = null;
  /** The game's time when the build began, or -1 when there is no rainbow. */
  start = -1;
  private from = { x: 0, y: 0 };

  get standing(): boolean {
    return this.start >= 0;
  }

  /** How many balloons are still up. */
  get left(): number {
    let n = 0;
    for (const p of this.pieces) if (!p.popped) n++;
    return n;
  }

  /**
   * Puts the rainbow up: every balloon is let go from `from` at its own moment, outside ring first.
   */
  build(arch: Arch, from: { x: number; y: number }, now: number, rng: Rng): void {
    this.arch = arch;
    this.from = from;
    this.start = now;
    this.pieces = arch.slots.map((slot) => ({
      slot,
      trip: tripOf(slot, rng.next()),
      color: RING_COLORS[slot.ring]!,
      phase: rng.range(0, Math.PI * 2),
      popped: false,
    }));
  }

  clear(): void {
    this.pieces = [];
    this.arch = null;
    this.start = -1;
  }

  /** When ring `ring` has its first balloon in place, in seconds from the start of the build. */
  arrival(ring: number): number {
    let first = Infinity;
    for (const p of this.pieces) if (p.slot.ring === ring) first = Math.min(first, p.trip.arrives);
    return first;
  }

  /** When the last balloon is in place, in seconds from the start of the build. */
  get done(): number {
    let last = 0;
    for (const p of this.pieces) last = Math.max(last, p.trip.arrives);
    return last;
  }

  /** Where a balloon is at this time of the game, and whether it is still on its way. */
  place(p: Piece, now: number): { x: number; y: number; flying: boolean } {
    const at = flight(this.from, p.slot, now - this.start, p.trip);
    if (at.flying) return at;
    // Once it is in place it sways, with a slow wave that runs along the rainbow.
    const wave = Math.sin(now * 1.6 + p.slot.u * 5 + p.slot.ring * 0.5);
    return { x: p.slot.x + wave * 1.4, y: p.slot.y + Math.cos(now * 1.3 + p.phase) * 1.2, flying: false };
  }

  /** The balloon in place under this point, if any. A balloon still on its way cannot be popped. */
  hit(x: number, y: number, slack: number, now: number): Piece | null {
    const arch = this.arch;
    if (!arch) return null;
    let best: Piece | null = null;
    let nearest = Infinity;
    for (const p of this.pieces) {
      if (p.popped || now - this.start < p.trip.arrives) continue;
      const d = Math.hypot(x - p.slot.x, y - p.slot.y);
      if (d < arch.r + slack && d < nearest) {
        nearest = d;
        best = p;
      }
    }
    return best;
  }

  /** The balloons still up in one column of the rainbow, when it is cut into `columns`. */
  column(index: number, columns: number): Piece[] {
    return this.pieces.filter((p) => !p.popped && columnOf(p.slot.u, columns) === index);
  }

  /** Draws the balloons that are left. */
  paint(g: CanvasRenderingContext2D, now: number, k: number): void {
    const arch = this.arch;
    if (!arch) return;
    const bodies: Body[] = RING_COLORS.map((c) => bodyOf(c, arch.r, k));
    for (const p of this.pieces) {
      if (p.popped) continue;
      const at = this.place(p, now);
      if (at.flying && now - this.start < p.trip.leaves) continue;
      const body = bodies[p.slot.ring]!;
      if (at.flying) {
        const t = (now - this.start - p.trip.leaves) / (p.trip.arrives - p.trip.leaves);
        // A balloon in flight grows from the gift and turns a little as it climbs.
        const s = Math.min(1, t * 4);
        g.save();
        g.translate(at.x, at.y);
        g.rotate(Math.sin(t * 9 + p.phase) * 0.18);
        g.scale(s, s);
        g.drawImage(body.canvas, -body.ox, -body.oy, body.w, body.h);
        g.restore();
      } else {
        g.drawImage(body.canvas, at.x - body.ox, at.y - body.oy, body.w, body.h);
      }
    }
  }
}
