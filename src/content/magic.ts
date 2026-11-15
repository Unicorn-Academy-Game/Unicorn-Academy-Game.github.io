import type { MagicKind, UnicornId } from '../shared/ids';
import type { SavedPropState } from '../shared/save';
import type { EffectId } from './activities';
import { RAINBOW } from './fountain-rainbow';

export interface SpellDef {
  kind: MagicKind;
  caster: UnicornId;
  /** The base spectacle, which always plays. */
  burst: EffectId;
}

export const SPELLS: Record<MagicKind, SpellDef> = {
  light: { kind: 'light', caster: 'wildstar', burst: 'light-burst' },
  nature: { kind: 'nature', caster: 'leaf', burst: 'leaf-burst' },
  ice: { kind: 'ice', caster: 'glacier', burst: 'ice-burst' },
  water: { kind: 'water', caster: 'river', burst: 'water-burst' },
  fire: { kind: 'fire', caster: 'cinder', burst: 'fire-burst' },
  lightning: { kind: 'lightning', caster: 'storm', burst: 'lightning-burst' },
};

/**
 * The colour each friend's magic shines in, as 0xRRGGBB, for the crystals of the cave that take on
 * the colour of the spell cast at them.
 */
export const MAGIC_COLOR: Readonly<Record<MagicKind, number>> = {
  light: 0xffe27a,
  nature: 0x6bf08a,
  ice: 0x8be6ff,
  water: 0x4f93ff,
  fire: 0xff8036,
  lightning: 0xc79cff,
};

export const MAGICS = Object.keys(SPELLS) as readonly MagicKind[];

/**
 * What a spell does to a compatible prop. Reactions are repeatable, harmless and never change
 * walkability.
 */
export interface Reaction {
  id: string;
  magic: MagicKind;
  /** Definition ids this reaction applies to. */
  targets: readonly string[];
  /** Saved state the prop takes on, for persistent reactions. */
  persist?: SavedPropState;
  /** Seconds a transient reaction lasts, for reactions with no saved state. */
  seconds?: number;
  effect: EffectId;
  /**
   * The definition of the prop that holds what this brings up, when that is not the target itself,
   * which is then only a place the magic is found from.
   */
  host?: string;
  /** How far from the caster a target may stand, when that is not the usual reach of a spell. */
  reach?: number;
  /**
   * How many targets one cast touches, when that is not the usual number. A reaction that brings up
   * one thing from several places is 1.
   */
  each?: number;
}

/** What rises from the sleeping crystals of the cave as each friend's magic wakes them. */
const WAKE_EFFECT: Readonly<Record<MagicKind, EffectId>> = {
  light: 'sparkle',
  nature: 'bloom',
  ice: 'ice-flower',
  water: 'water-spray',
  fire: 'embers',
  lightning: 'sparkle',
};

/** The id of the reaction a thing has to one friend's magic. */
export const reactionOf = (prefix: string, magic: MagicKind): string => `${prefix}-${magic}`;

/** The magic a reaction named by `reactionOf` was for, if it was one. */
export const magicOfReaction = (prefix: string, id: string | undefined): MagicKind | undefined =>
  MAGICS.find((magic) => reactionOf(prefix, magic) === id);

/** A reaction for each friend's magic, for a thing that shows which magic was cast at it. */
const eachMagic = (
  prefix: string,
  targets: readonly string[],
  seconds: number,
  effect: (magic: MagicKind) => EffectId,
): Reaction[] =>
  MAGICS.map((magic) => ({ id: reactionOf(prefix, magic), magic, targets, seconds, effect: effect(magic) }));

export const REACTIONS: readonly Reaction[] = [
  {
    id: 'light-lantern',
    magic: 'light',
    targets: ['lantern', 'crystal'],
    persist: { kind: 'lantern', lit: true },
    effect: 'light-burst',
  },
  {
    id: 'bloom-bed',
    magic: 'nature',
    targets: ['flowerbed', 'cave-bed'],
    persist: { kind: 'flowerbed', state: 'flowering' },
    effect: 'bloom',
  },
  { id: 'ice-ornament', magic: 'ice', targets: ['ice-display'], seconds: 9, effect: 'ice-flower' },
  { id: 'spout', magic: 'water', targets: ['fountain-spout'], seconds: 6, effect: 'water-spray' },
  { id: 'water-bed', magic: 'water', targets: ['flowerbed', 'cave-bed'], seconds: 3, effect: 'water-burst' },
  {
    id: 'light-brazier',
    magic: 'fire',
    targets: ['brazier'],
    persist: { kind: 'brazier', lit: true },
    effect: 'fire-burst',
  },
  { id: 'spin-pinwheel', magic: 'lightning', targets: ['pinwheel'], seconds: 7, effect: 'lightning-burst' },
  { id: 'glow-ornament', magic: 'lightning', targets: ['weather-ornament'], seconds: 5, effect: 'sparkle' },
  // One rainbow comes up whichever pad, or piece of the arch, found her light, from anywhere near
  // the fountain.
  {
    id: 'light-rainbow',
    magic: 'light',
    targets: ['fountain-pad', 'fountain-rainbow'],
    effect: 'sparkle',
    host: 'fountain-rainbow',
    reach: RAINBOW.reach,
    each: 1,
  },
  // The crystal cave. The sleeping crystals wake in the colour of whichever friend's magic reached
  // them, and so does the Heart Crystal.
  ...eachMagic('wake', ['sleeping-crystals'], 8, (magic) => WAKE_EFFECT[magic]),
  ...eachMagic('heart', ['heart-crystal'], 7, () => 'sparkle'),
  { id: 'freeze-pool', magic: 'ice', targets: ['glow-pool'], seconds: 9, effect: 'ice-flower' },
  { id: 'ripple-pool', magic: 'water', targets: ['glow-pool'], seconds: 4, effect: 'water-spray' },
  { id: 'stoke-cauldron', magic: 'fire', targets: ['witch-cauldron'], seconds: 6, effect: 'fire-burst' },
  { id: 'charge-pillar', magic: 'lightning', targets: ['storm-pillar'], seconds: 7, effect: 'lightning-burst' },
  { id: 'ring-chimes', magic: 'lightning', targets: ['cave-chimes'], seconds: 4, effect: 'sparkle' },
];
