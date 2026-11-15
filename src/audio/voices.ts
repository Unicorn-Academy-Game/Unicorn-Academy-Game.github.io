import type { SoundFamilyId, SoundGroup } from '../shared/audio';

/**
 * Keeps a crowded mix tidy without ever cutting off what the child just did. Every sound is ambient
 * (footsteps and taps, which can be skipped), normal (a unicorn's voice) or meaningful (magic, a
 * new friend, a door, a chest). When limits are reached the lowest-ranked, oldest sounds go first.
 * Ambient sounds are skipped when there is no room. A normal or meaningful sound plays over the
 * limit by a little, and is cut off only by a newer sound of its own rank or higher.
 */

type Priority = 'ambient' | 'normal' | 'meaningful';

const PRIORITY: Record<SoundGroup, Priority> = {
  step: 'ambient',
  ui: 'ambient',
  voice: 'normal',
  character: 'meaningful',
  magic: 'meaningful',
  object: 'meaningful',
};

const RANK: Record<Priority, number> = { ambient: 0, normal: 1, meaningful: 2 };

export interface Limits {
  /** Sounds playing at once before new ones start to displace old ones (about eight). */
  total: number;
  /** Room for a meaningful sound beyond `total`, so one is never refused. */
  overflow: number;
  perGroup: Record<SoundGroup, number>;
  /** The same sound playing over itself. */
  perFamily: number;
}

export const LIMITS: Limits = {
  total: 8,
  overflow: 2,
  // Two or three spells at once; the rest are generous but bounded.
  perGroup: { step: 3, voice: 3, character: 3, magic: 3, object: 3, ui: 2 },
  perFamily: 2,
};

export interface Voice<H> {
  handle: H;
  family: SoundFamilyId;
  group: SoundGroup;
  startedAt: number;
  endsAt: number;
}

export type Decision<H> = { play: false } | { play: true; stop: Voice<H>[] };

/**
 * The decision a new sound gets given who is playing now. Pure: it neither plays nor stops
 * anything.
 */
export function decide<H>(
  voices: readonly Voice<H>[],
  family: SoundFamilyId,
  group: SoundGroup,
  now: number,
  limits: Limits = LIMITS,
): Decision<H> {
  const live = voices.filter((v) => v.endsAt > now);
  const priority = RANK[PRIORITY[group]];
  const stop: Voice<H>[] = [];
  const oldest = (list: readonly Voice<H>[]): Voice<H> | undefined =>
    [...list].filter((v) => !stop.includes(v)).sort((a, b) => a.startedAt - b.startedAt)[0];
  const remaining = (): Voice<H>[] => live.filter((v) => !stop.includes(v));

  // The same sound over itself: the newest take wins, unless it is the kind of sound that can be
  // skipped.
  const sameFamily = remaining().filter((v) => v.family === family);
  if (sameFamily.length >= limits.perFamily) {
    if (priority === 0) return { play: false };
    stop.push(oldest(sameFamily)!);
  }

  // A crowded group: displace the oldest voice in it of the same or lower rank, or skip an ambient
  // sound.
  const inGroup = remaining().filter((v) => v.group === group);
  if (inGroup.length >= limits.perGroup[group]) {
    const victim = oldest(inGroup.filter((v) => RANK[PRIORITY[v.group]] <= priority));
    if (!victim || priority === 0) return { play: false };
    stop.push(victim);
  }

  // A crowded mix: a sound displaces the oldest one ranked below it. With none to displace, a sound
  // that matters plays over the limit by a little, and past that it takes the place of the oldest
  // one of its own rank.
  if (remaining().length >= limits.total) {
    const lower = oldest(remaining().filter((v) => RANK[PRIORITY[v.group]] < priority));
    if (lower) stop.push(lower);
    else if (priority === 0) return { play: false };
    else if (remaining().length >= limits.total + limits.overflow) {
      const equal = oldest(remaining().filter((v) => RANK[PRIORITY[v.group]] === priority));
      if (!equal) return { play: false };
      stop.push(equal);
    }
  }
  return { play: true, stop };
}

/**
 * Never plays the same take twice in a row, so repeated footsteps and sparkles do not sound
 * mechanical.
 */
export class VariantPicker {
  private readonly last = new Map<SoundFamilyId, number>();

  constructor(private readonly random: () => number) {}

  pick(family: SoundFamilyId, variants: number): number {
    if (variants <= 1) return 0;
    const last = this.last.get(family);
    let v = Math.floor(this.random() * variants);
    if (v === last) v = (v + 1 + Math.floor(this.random() * (variants - 1))) % variants;
    this.last.set(family, v);
    return v;
  }
}

/**
 * How much a sound's pitch and level wander from take to take, so a repeat is never an exact copy.
 */
export const JITTER: Record<SoundGroup, { rate: number; gain: number }> = {
  step: { rate: 0.05, gain: 0.18 },
  voice: { rate: 0, gain: 0.08 },
  character: { rate: 0.015, gain: 0.08 },
  magic: { rate: 0.01, gain: 0.06 },
  object: { rate: 0.02, gain: 0.08 },
  ui: { rate: 0.02, gain: 0.1 },
};
