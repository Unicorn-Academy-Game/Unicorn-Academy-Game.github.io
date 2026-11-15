import type { Rng } from '../../../domain/rng';
import type { RGB } from '../../engine/color';

/**
 * What can be inside a bubble. Every prize is the picture of something the player knows, and every
 * one has a place to go when the bubble pops. The ones that stay (a butterfly, a flower, a fish)
 * make the garden fuller, and the ones that do not (a star, a note) are a moment and then gone.
 */
export const PRIZES = [
  'butterfly',
  'flower',
  'fish',
  'bird',
  'ladybug',
  'bee',
  'snail',
  'note',
  'star',
  'heart',
  'gem',
  'fairy',
  'rainbow',
] as const;
export type Prize = (typeof PRIZES)[number];

/** Where a freed prize stays. `none` is gone after its moment. */
type Home = 'air' | 'meadow' | 'pond' | 'none';

export interface PrizeDef {
  /** How often it turns up next to the others. */
  readonly weight: number;
  /** What freeing one is worth toward the stars. */
  readonly points: number;
  readonly home: Home;
  /** How many may stay in the garden at once. The oldest leaves when one more comes. */
  readonly cap: number;
  /** The colour of its glow in the bubble and of the burst when it comes out. */
  readonly color: RGB;
  /** Rare ones wait until the player has played a little, and are worth more. */
  readonly rare: boolean;
}

export const PRIZE: Readonly<Record<Prize, PrizeDef>> = {
  butterfly: { weight: 1.5, points: 1, home: 'air', cap: 9, color: [255, 168, 64], rare: false },
  flower: { weight: 1.5, points: 1, home: 'meadow', cap: 14, color: [255, 128, 176], rare: false },
  fish: { weight: 1, points: 1, home: 'pond', cap: 5, color: [92, 196, 255], rare: false },
  bird: { weight: 0.9, points: 1.2, home: 'air', cap: 3, color: [112, 176, 255], rare: false },
  ladybug: { weight: 0.8, points: 1, home: 'meadow', cap: 4, color: [255, 84, 84], rare: false },
  bee: { weight: 0.8, points: 1, home: 'air', cap: 3, color: [255, 214, 64], rare: false },
  snail: { weight: 0.6, points: 1, home: 'meadow', cap: 2, color: [255, 176, 140], rare: false },
  note: { weight: 1, points: 0.8, home: 'none', cap: 0, color: [128, 232, 188], rare: false },
  star: { weight: 0.8, points: 1.4, home: 'none', cap: 0, color: [255, 224, 96], rare: false },
  heart: { weight: 0.9, points: 1, home: 'none', cap: 0, color: [255, 112, 148], rare: false },
  gem: { weight: 0.8, points: 1.2, home: 'none', cap: 0, color: [190, 128, 255], rare: false },
  fairy: { weight: 0.36, points: 3, home: 'air', cap: 2, color: [255, 150, 214], rare: true },
  rainbow: { weight: 0.3, points: 3, home: 'none', cap: 0, color: [255, 236, 160], rare: true },
};

/**
 * How many prizes of the common kinds a bubble blown by the machine has gone by before a rare one
 * may come.
 */
const RARE_AFTER = 5;
/**
 * How much more likely a prize the player has not seen yet is, so the first minute shows the player
 * all of them.
 */
const NEW_BONUS = 1.8;
/**
 * How likely one the player has seen is, next to its usual, while there is still a common one they
 * have not seen.
 */
const SEEN_WHILE_NEW_LEFT = 0.1;
/** How likely one of the last few is, next to its usual, once the player has seen them all. */
const RECENT = 0.4;
/** How much less likely a kind is while the garden has all it can hold of it. */
const CROWDED = 0.3;
/** The last few prizes, which come again less. The very last one does not come again at all. */
const MEMORY = 3;

/**
 * Chooses what is in the next bubble. It likes a kind the player has not seen, dislikes the one it
 * just gave and the ones before it, and gives a kind the garden is full of less often, so what the
 * player pops is always a surprise and always something new.
 */
export class PrizeBag {
  private readonly recent: Prize[] = [];
  private readonly seen = new Set<Prize>();
  private given = 0;

  constructor(private readonly rng: Rng) {}

  next(crowded: (p: Prize) => boolean = () => false): Prize {
    const choice = this.rng.weighted(PRIZES, (p) => this.weightOf(p, crowded(p))) ?? PRIZES[0];
    this.recent.push(choice);
    if (this.recent.length > MEMORY) this.recent.shift();
    this.seen.add(choice);
    this.given++;
    return choice;
  }

  /** Whether a prize has been given yet in this game. */
  hasGiven(p: Prize): boolean {
    return this.seen.has(p);
  }

  reset(): void {
    this.recent.length = 0;
    this.seen.clear();
    this.given = 0;
  }

  private weightOf(p: Prize, crowded: boolean): number {
    const def = PRIZE[p];
    if (def.rare && this.given < RARE_AFTER) return 0;
    const at = this.recent.lastIndexOf(p);
    if (at === this.recent.length - 1 && at >= 0) return 0;
    let w = def.weight;
    if (this.seen.has(p)) w *= this.newLeft() ? SEEN_WHILE_NEW_LEFT : at >= 0 ? RECENT : 1;
    else if (!def.rare) w *= NEW_BONUS;
    if (crowded) w *= CROWDED;
    return w;
  }

  /** Whether there is a common prize the player has not been given yet. */
  private newLeft(): boolean {
    return PRIZES.some((p) => !PRIZE[p].rare && !this.seen.has(p));
  }
}
