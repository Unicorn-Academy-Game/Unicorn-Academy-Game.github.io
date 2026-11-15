/**
 * How good the party is, and so how many stars. Each thing the player does is worth something, and
 * the same thing again and again is worth less each time, because it is the same, while a different
 * thing is worth its full price again. A party where the player has a friend dancing, a cannon
 * going off, the pinata swinging and the lights changing is a better party than one where they fire
 * one cannon forty times, and they are told so by the stars. The dancers also bring a little by
 * themselves, because a floor that is full is a party whether the player is touching it or not.
 */

export type Thing = 'join' | 'move' | 'cannon' | 'knock' | 'burst' | 'ball' | 'floor' | 'guest' | 'speaker' | 'trail';

/**
 * What each star costs, for a herd this big. A lone Wildstar has only herself to touch, so for her
 * the party is shorter than for a floor of six, where there is more to touch and more to hear. Six
 * is the price as written.
 */
export function starCosts(full: readonly number[], dancers: number): number[] {
  const share = 0.7 + 0.06 * (Math.min(6, Math.max(1, dancers)) - 1);
  return full.map((cost) => Math.round(cost * share));
}

/** What each is worth the first time, in points. */
export const WORTH: Readonly<Record<Thing, number>> = {
  join: 3.4,
  move: 1.7,
  cannon: 1.4,
  knock: 0.9,
  burst: 5.5,
  ball: 1.6,
  floor: 0.45,
  guest: 0.7,
  speaker: 1.2,
  trail: 0.14,
};

/** Seconds for what has been done to be half forgotten. */
const HALF_LIFE = 5;
/**
 * What is left of the price at the very least, so a child who only ever does one thing still gets
 * there.
 */
const AT_LEAST = 0.2;
/** How many seconds back a different thing still counts toward the variety of the party. */
const WINDOW = 10;
/** Points a second for each friend who is dancing. */
const BY_THEMSELVES = 0.05;

interface Heat {
  amount: number;
  at: number;
}

export class Vibe {
  private readonly heat = new Map<string, Heat>();
  private readonly recent: { thing: Thing; at: number }[] = [];

  reset(): void {
    this.heat.clear();
    this.recent.length = 0;
  }

  /** How hot a name is at a time, which is how much it has been done lately. */
  private heatOf(name: string, now: number): number {
    const h = this.heat.get(name);
    if (!h) return 0;
    return h.amount * 0.5 ** ((now - h.at) / HALF_LIFE);
  }

  private warm(name: string, now: number): void {
    this.heat.set(name, { amount: this.heatOf(name, now) + 1, at: now });
  }

  /** How many different things have been done lately, which makes a party livelier. */
  variety(now: number): number {
    const kinds = new Set<Thing>();
    for (const r of this.recent) if (now - r.at <= WINDOW) kinds.add(r.thing);
    return kinds.size;
  }

  /**
   * What the player gets for doing a thing at a time. `which` is which one of its kind: the same
   * friend, or the same cannon, is the same thing, and another friend or the other cannon is
   * another.
   */
  worth(thing: Thing, which: string | number, now: number): number {
    const own = this.heatOf(`${thing}:${which}`, now);
    const kind = this.heatOf(thing, now);
    const fresh = Math.max(AT_LEAST, 1 / (1 + 0.9 * own)) * Math.max(0.55, 1 / (1 + 0.12 * kind));
    const lively = 1 + 0.12 * Math.min(4, Math.max(0, this.variety(now) - 1));
    this.warm(`${thing}:${which}`, now);
    this.warm(thing, now);
    this.recent.push({ thing, at: now });
    while (this.recent.length > 40 || (this.recent.length > 0 && now - this.recent[0]!.at > WINDOW * 2))
      this.recent.shift();
    return WORTH[thing] * fresh * lively;
  }

  /** What a floor with this many friends dancing on it brings in a stretch of time. */
  static byThemselves(dancing: number, dt: number): number {
    return BY_THEMSELVES * Math.max(0, dancing) * dt;
  }
}
