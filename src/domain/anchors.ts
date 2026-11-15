import type { UnicornId } from '../shared/ids';
import type { ActivityAnchor } from '../shared/map';

export type ReservePriority = 'idle' | 'player';

interface Hold {
  holder: UnicornId;
  slot: number;
  priority: ReservePriority;
}

export interface Reservation {
  slot: number;
  /** The idle holder this reservation displaced, who must yield. */
  displaced: UnicornId | null;
}

/**
 * Who stands where at each activity anchor. An anchor has one slot per unit of capacity. A
 * player-directed use may take a slot from an idle companion, who is told to yield; two player uses
 * never displace each other.
 */
export class AnchorBook {
  private readonly holds = new Map<string, Hold[]>();
  private readonly capacity = new Map<string, number>();

  constructor(anchors: readonly ActivityAnchor[]) {
    for (const a of anchors) {
      this.holds.set(a.anchorId, []);
      this.capacity.set(a.anchorId, a.capacity);
    }
  }

  has(anchorId: string): boolean {
    return this.holds.has(anchorId);
  }

  /** Free slots. */
  free(anchorId: string): number {
    return (this.capacity.get(anchorId) ?? 0) - (this.holds.get(anchorId)?.length ?? 0);
  }

  /** True when `priority` could get a slot, possibly by displacing an idle holder. */
  available(anchorId: string, priority: ReservePriority): boolean {
    if (this.free(anchorId) > 0) return true;
    return priority === 'player' && (this.holds.get(anchorId) ?? []).some((h) => h.priority === 'idle');
  }

  /**
   * The slot a new idle reservation would take, which is the lowest one nobody holds. Null when
   * every slot is held.
   */
  nextFree(anchorId: string): number | null {
    const list = this.holds.get(anchorId);
    const cap = this.capacity.get(anchorId);
    if (!list || cap === undefined) return null;
    for (let s = 0; s < cap; s++) if (!list.some((h) => h.slot === s)) return s;
    return null;
  }

  reserve(anchorId: string, holder: UnicornId, priority: ReservePriority): Reservation | null {
    const list = this.holds.get(anchorId);
    const cap = this.capacity.get(anchorId);
    if (!list || cap === undefined) return null;
    const mine = list.find((h) => h.holder === holder);
    if (mine) {
      mine.priority = priority === 'player' ? 'player' : mine.priority;
      return { slot: mine.slot, displaced: null };
    }
    let displaced: UnicornId | null = null;
    let slot = -1;
    if (list.length < cap) {
      for (let s = 0; s < cap; s++) {
        if (!list.some((h) => h.slot === s)) {
          slot = s;
          break;
        }
      }
    } else if (priority === 'player') {
      const victim = list.find((h) => h.priority === 'idle');
      if (!victim) return null;
      displaced = victim.holder;
      slot = victim.slot;
      list.splice(list.indexOf(victim), 1);
    } else return null;
    list.push({ holder, slot, priority });
    return { slot, displaced };
  }

  release(anchorId: string, holder: UnicornId): void {
    const list = this.holds.get(anchorId);
    if (!list) return;
    const i = list.findIndex((h) => h.holder === holder);
    if (i >= 0) list.splice(i, 1);
  }

  /** Releases everything `holder` holds and returns the anchors it released. */
  releaseAll(holder: UnicornId): string[] {
    const out: string[] = [];
    for (const [id, list] of this.holds) {
      const i = list.findIndex((h) => h.holder === holder);
      if (i >= 0) {
        list.splice(i, 1);
        out.push(id);
      }
    }
    return out;
  }

  holdersOf(anchorId: string): readonly { holder: UnicornId; slot: number; priority: ReservePriority }[] {
    return this.holds.get(anchorId) ?? [];
  }

  heldBy(holder: UnicornId): string[] {
    const out: string[] = [];
    for (const [id, list] of this.holds) if (list.some((h) => h.holder === holder)) out.push(id);
    return out;
  }

  /** For invariant checks: every anchor and its holders. */
  snapshot(): { anchorId: string; capacity: number; holders: UnicornId[] }[] {
    return [...this.holds].map(([anchorId, list]) => ({
      anchorId,
      capacity: this.capacity.get(anchorId)!,
      holders: list.map((h) => h.holder),
    }));
  }
}
