/**
 * A number from 0 up to but not including 1, which is all the games ask of chance, so a test can
 * hand them a sequence it chose.
 */
export type Random = () => number;

/**
 * A whole number from 0 up to but not including `n`. A `random` of exactly 1, which it never gives,
 * still lands inside.
 */
const below = (n: number, random: Random): number => Math.min(n - 1, Math.floor(random() * n));

/** A whole number from `low` to `high`, both included. */
export const between = (low: number, high: number, random: Random): number => low + below(high - low + 1, random);

/** One of `items`, each as likely as any other. */
export const pick = <T>(items: readonly T[], random: Random): T => items[below(items.length, random)]!;

/**
 * A copy of `items` in an order the numbers from `random` choose, each order as likely as any
 * other.
 */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1, random);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
