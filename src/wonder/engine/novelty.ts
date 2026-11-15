/**
 * How much a thing the player does is worth to the star meter. Each kind of thing has a price, and
 * the same thing again and again is worth less each time while a different thing is worth its full
 * price again, so a game where they try everything fills its stars faster than one where they do
 * one thing forty times, and they are told so by the stars. A game says its prices and the kinds of
 * thing it has, and this keeps the memory of what has been done lately.
 */

/** Seconds for what has been done to be half forgotten. */
const HALF_LIFE = 5;
/**
 * What is left of the price at the very least, so a child who only ever does one thing still gets
 * there.
 */
const AT_LEAST = 0.2;
/** How many seconds back a different kind of thing still counts toward the variety of play. */
const WINDOW = 10;

interface Heat {
  amount: number;
  at: number;
}

export class Novelty<Kind extends string> {
  private readonly heat = new Map<string, Heat>();
  private readonly recent: { kind: Kind; at: number }[] = [];

  /** `prices` is what each kind of thing is worth the first time, in points. */
  constructor(private readonly prices: Readonly<Record<Kind, number>>) {}

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

  /** How many different kinds of thing have been done lately. */
  variety(now: number): number {
    const kinds = new Set<Kind>();
    for (const r of this.recent) if (now - r.at <= WINDOW) kinds.add(r.kind);
    return kinds.size;
  }

  /**
   * What the player gets for doing a thing at a time. `which` says which one of its kind it was, as
   * the same fruit or the same jet is the same thing and another fruit or another jet is another.
   */
  worth(kind: Kind, which: string | number, now: number): number {
    const own = this.heatOf(`${kind}:${which}`, now);
    const sameKind = this.heatOf(kind, now);
    const fresh = Math.max(AT_LEAST, 1 / (1 + 0.9 * own)) * Math.max(0.55, 1 / (1 + 0.12 * sameKind));
    const lively = 1 + 0.12 * Math.min(4, Math.max(0, this.variety(now) - 1));
    this.warm(`${kind}:${which}`, now);
    this.warm(kind, now);
    this.recent.push({ kind, at: now });
    while (this.recent.length > 40 || (this.recent.length > 0 && now - this.recent[0]!.at > WINDOW * 2))
      this.recent.shift();
    return this.prices[kind] * fresh * lively;
  }
}

/**
 * What each star costs for a herd this big. A lone Wildstar has only herself to bring, so for her a
 * game is shorter than for a herd of six, who have more to do and more to hear. Six is the price as
 * written.
 */
export function scaledCosts(full: readonly number[], herd: number): number[] {
  const share = 0.7 + 0.06 * (Math.min(6, Math.max(1, herd)) - 1);
  return full.map((cost) => Math.round(cost * share));
}
