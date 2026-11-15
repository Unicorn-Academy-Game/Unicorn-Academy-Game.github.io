/**
 * How much sound the games may keep going at once, and who makes way when there is no more room.
 *
 * What a sound costs is the nodes it is made of. The audio thread visits every node that is
 * sounding in each 128 samples, whatever its level, so a sound that has faded to nothing but has
 * not ended costs as much as a loud one. Measured in Chromium on a fast laptop, long notes of 300,
 * 600, 1,200 and 2,400 nodes took 5, 10, 19 and 42 percent of the time the audio is for. A tablet
 * several times slower has that many times less room. A count of sounds would not do, because a
 * sound is 4 nodes (a tap) or 72 (a star), so 64 of them are anything from a few hundred nodes to
 * four and a half thousand.
 *
 * A sound is not refused because the room is full. Whatever has least left to be heard for the
 * nodes it holds makes way, so what the player has just done and what the band is playing now are
 * always heard. Only a sound that must be heard (a star being won) is kept against one that need
 * not be.
 */

export interface Held {
  /** The nodes the sound is made of. */
  readonly cost: number;
  /**
   * When it begins, on the clock of the context. A sound that has not begun has all of itself left.
   */
  readonly at: number;
  /** How loud it is, as the level it is played at. */
  readonly loud: number;
  /** A sound that must be heard, which only another that must be heard may displace. */
  readonly vital: boolean;
  end: number;
}

/**
 * How much of a sound is left to be heard, for each node it holds: its level squared, for as long
 * as it has to go. A sound that is nearly over, or quiet, or made of many nodes for what it says,
 * is worth the least.
 */
const leftToHear = (held: Held, now: number): number =>
  (held.loud * held.loud * Math.max(0, held.end - Math.max(now, held.at))) / Math.max(1, held.cost);

export class Budget<T extends Held> {
  private held: T[] = [];
  private spent = 0;
  private vitalSpent = 0;

  constructor(
    /** The most nodes that may be sounding. A sound bigger than this has it to itself. */
    readonly limit: number,
  ) {}

  get count(): number {
    return this.held.length;
  }

  /** How many nodes they are made of. */
  get cost(): number {
    return this.spent;
  }

  /**
   * Whether a sound of this kind could have any room, asked before it is built. Sounds that must be
   * heard may fill all of it.
   */
  open(vital: boolean): boolean {
    return vital || this.vitalSpent < this.limit;
  }

  /**
   * The sounds that must go for one of `cost` to be held at `now`, the ones with least left to be
   * heard first, or null when it cannot be made to fit, in which case none is let go. Sounds that
   * need not be heard go first. One that must be heard may then take the place of another that must
   * be, and one that need not be never takes theirs.
   */
  room(cost: number, vital: boolean, now: number): T[] | null {
    const need = this.spent + cost - Math.max(this.limit, cost);
    if (need <= 0) return [];
    const quietest = [...this.held].sort((a, b) => leftToHear(a, now) - leftToHear(b, now));
    const order = vital
      ? [...quietest.filter((h) => !h.vital), ...quietest.filter((h) => h.vital)]
      : quietest.filter((h) => !h.vital);
    const going: T[] = [];
    let freed = 0;
    for (const h of order) {
      if (freed >= need) break;
      going.push(h);
      freed += h.cost;
    }
    return freed >= need ? going : null;
  }

  add(held: T): void {
    this.held.push(held);
    this.spent += held.cost;
    if (held.vital) this.vitalSpent += held.cost;
  }

  /**
   * Lets a sound go. It may be asked twice, because the browser's word that a sound has ended can
   * come after the clock has let it go.
   */
  remove(held: T): void {
    const at = this.held.indexOf(held);
    if (at < 0) return;
    this.held.splice(at, 1);
    this.spent -= held.cost;
    if (held.vital) this.vitalSpent -= held.cost;
  }

  /**
   * The sounds that the clock says ended more than `grace` ago. When a sound ends is known as it is
   * made, so it is let go by the clock and does not wait for the browser to say it has ended, which
   * a browser may never do.
   */
  ended(now: number, grace: number): T[] {
    return this.held.filter((h) => h.end + grace < now);
  }

  /** Forgets every sound, for a new context in which none of them is sounding. */
  clear(): void {
    this.held = [];
    this.spent = 0;
    this.vitalSpent = 0;
  }
}
