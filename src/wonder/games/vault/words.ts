import { RAIN_KIND, RAIN_KINDS } from '../../../content/rain';
import { type Counts, totalOf } from '../../../game/rain';

/**
 * What the treasure game says. It is never unkind: with nothing caught it says how to catch some,
 * and the rest cheer.
 */

export function scoreLabel(counts: Counts): string {
  const parts = RAIN_KINDS.filter((k) => counts[k] > 0).map(
    (k) => `${counts[k]} ${counts[k] === 1 ? RAIN_KIND[k].word : RAIN_KIND[k].plural}`,
  );
  return parts.length === 0 ? 'Nothing caught yet' : parts.join(', ');
}

export function headline(total: number): { title: string; detail: string } {
  if (total === 0) return { title: 'Nice try!', detail: 'Touch the treasure, or swipe through it, to catch it.' };
  if (total < 15) return { title: `You caught ${total}!`, detail: 'Shiny!' };
  if (total < 35) return { title: `You caught ${total}!`, detail: 'What a catch!' };
  return { title: `You caught ${total}!`, detail: 'A whole treasure house!' };
}

export const headlineOf = (counts: Counts): { title: string; detail: string } => headline(totalOf(counts));
