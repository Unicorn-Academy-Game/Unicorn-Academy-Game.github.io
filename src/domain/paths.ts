import type { Vec2 } from '../shared/ids';
import { CONFIG } from './config';
import type { Nav } from './nav/nav';

interface Request {
  from: Vec2;
  to: Vec2;
  /**
   * Called with the path, or null when there is none. The caller decides whether the result is
   * still wanted.
   */
  done: (path: Vec2[] | null) => void;
  /**
   * Searched before any request that is not urgent, whatever the order. A finger on the screen is
   * waiting for this one.
   */
  urgent: boolean;
}

/**
 * Path requests, at most one outstanding per requester. A newer request from the same requester
 * replaces the older one, so a stale search is never run. A bounded number of searches run per
 * simulation step.
 *
 * A search that finishes after its requester has moved on is still delivered: the requester's
 * callback checks its own generation counter and drops the result. That is what keeps a canceled
 * route from coming back to life.
 */
export class PathQueue {
  /** Searches per step. Tests lower this to hold requests back. */
  budget: number = CONFIG.nav.pathBudget;
  private readonly pending = new Map<string, Request>();

  constructor(private readonly nav: Nav) {}

  get size(): number {
    return this.pending.size;
  }

  request(requester: string, from: Vec2, to: Vec2, done: Request['done'], urgent = false): void {
    // Re-inserting moves the requester to the back of the line, which is fine: its old request no
    // longer matters.
    this.pending.delete(requester);
    this.pending.set(requester, { from, to, done, urgent });
  }

  cancel(requester: string): void {
    this.pending.delete(requester);
  }

  clear(): void {
    this.pending.clear();
  }

  /** Runs up to `budget` searches: urgent requests first, then the rest, oldest requester first. */
  process(): void {
    let n = this.budget;
    for (const wantUrgent of [true, false]) {
      for (const [key, req] of this.pending) {
        if (req.urgent !== wantUrgent) continue;
        if (n-- <= 0) return;
        this.pending.delete(key);
        req.done(this.nav.findPath(req.from, req.to));
      }
    }
  }
}
