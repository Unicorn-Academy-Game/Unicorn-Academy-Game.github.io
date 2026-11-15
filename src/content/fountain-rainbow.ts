/**
 * How the rainbow over the palace garden's fountain stands in time and what it is made of. The
 * simulation decides when it begins, when it is given more time and when it ends, and the picture
 * and the sparkles follow it, so all three read the times here.
 */
export const RAINBOW = {
  /** Seconds from the first cast to the end of the fade. */
  life: 6.5,
  /** Seconds the arch takes to paint on and settle. */
  form: 1.6,
  /** Seconds the arch takes to dissolve at the end of its life. */
  fade: 1.3,
  /** The most seconds it stands for from the first cast, however often she casts again. */
  cap: 8,
  /**
   * How far from one of the pads at the statues her light is found. The pads are at the foot of
   * each statue and in front of the basin, so this covers the whole court and the yard round it,
   * and a child who is anywhere near the fountain brings the rainbow up.
   */
  reach: 620,
} as const;

export type RainbowPhase = 'forming' | 'arched' | 'fading';

/**
 * What a rainbow that has stood `seconds` of its `total` is doing. The fade is the last stretch of
 * its life, whatever its length.
 */
export function rainbowPhase(seconds: number, total: number): RainbowPhase {
  if (seconds >= total - RAINBOW.fade) return 'fading';
  return seconds < RAINBOW.form ? 'forming' : 'arched';
}

/**
 * The arch is not one picture. It is cut along its length into pieces, and across it into the outer
 * bands and the inner ones, so that it can grow out of the horns, run with a wave of light and come
 * apart from the apex, from a few dozen small pictures where one picture for every moment would not
 * fit in the garden's share of graphics memory.
 */
export type ArchGroup = 'outer' | 'inner';
export type ArchSide = 'left' | 'right';

export interface ArchPiece {
  readonly group: ArchGroup;
  /**
   * Counted from the horn, which is 0, to the apex. A piece is drawn on both sides, which come and
   * go together.
   */
  readonly index: number;
}

/** The bands of each group, counting from the outermost, which is red. */
export const ARCH_GROUPS: Readonly<Record<ArchGroup, { first: number; last: number }>> = {
  outer: { first: 0, last: 3 },
  inner: { first: 4, last: 6 },
};

/** How many pieces make up one side, which are equal in angle. */
export const PIECES_PER_SIDE = 12;

export const ARCH_PIECES: readonly ArchPiece[] = (['outer', 'inner'] as const).flatMap((group) =>
  Array.from({ length: PIECES_PER_SIDE }, (_, index): ArchPiece => ({ group, index })),
);

/** The look of the prop that holds a piece, and what names it in the map. */
export const pieceId = (piece: ArchPiece): string => `${piece.group}-${piece.index}`;

export const pieceSprite = (piece: ArchPiece, side: ArchSide): string => `fountain-rainbow-${pieceId(piece)}-${side}`;

const BY_ID: ReadonlyMap<string, ArchPiece> = new Map(ARCH_PIECES.map((p) => [pieceId(p), p]));

export const pieceOf = (id: string | undefined): ArchPiece | undefined =>
  id === undefined ? undefined : BY_ID.get(id);

/**
 * The arch paints itself on from the horns to the apex, the outer bands first and the inner bands a
 * moment behind.
 */
export const PAINT = {
  /** Seconds after the first cast before the pieces at the horns begin to show. */
  begin: 0.15,
  /**
   * Seconds between the pieces at the horns beginning to show and the piece at the apex beginning.
   */
  span: 0.78,
  /** Seconds each piece takes to come in. */
  ramp: 0.3,
  /** Seconds the inner bands begin after the outer ones. */
  stagger: 0.12,
} as const;

/**
 * The arch comes apart from the apex to the horns, the inner bands first. Its last piece is gone as
 * the fade ends.
 */
export const DISSOLVE = {
  /** Seconds between the piece at the apex beginning to go and the piece at the horns beginning. */
  span: 0.7,
  /** Seconds each piece takes to go. */
  ramp: 0.4,
  /** Seconds the outer bands begin after the inner ones. */
  lead: 0.2,
} as const;

/** A soft wave of light runs along the arch from the horns to the apex while it stands. */
export const SHIMMER = {
  /** Seconds one wave takes from a horn to the apex. */
  period: 1.7,
  /** How much dimmer the arch is between waves, as a share of its brightness. */
  depth: 0.18,
  /** Seconds after it is painted that it takes to settle into the wave. */
  settle: 0.4,
} as const;

const last = PIECES_PER_SIDE - 1;

/** When the piece begins to show, in seconds after the first cast. */
export const paintStart = (piece: ArchPiece): number =>
  PAINT.begin + (piece.index / last) * PAINT.span + (piece.group === 'inner' ? PAINT.stagger : 0);

/**
 * When the piece begins to go, in seconds after the first cast, for a rainbow that lasts `total`.
 */
export const dissolveStart = (piece: ArchPiece, total: number): number =>
  total - RAINBOW.fade + ((last - piece.index) / last) * DISSOLVE.span + (piece.group === 'outer' ? DISSOLVE.lead : 0);

/** The moment the last piece has come in. */
export const PAINTED = PAINT.begin + PAINT.span + PAINT.stagger + PAINT.ramp;

/**
 * How bright the wave of light is at a place along a side, from 0 at a horn to 1 at the apex,
 * `seconds` after the first cast: 1 at its crest and 0 between waves.
 */
export const shimmerWave = (place: number, seconds: number): number =>
  0.5 + 0.5 * Math.sin(Math.PI * 2 * (seconds / SHIMMER.period - place));

/**
 * Where the crest of the wave is, as a place along a side. It runs from a horn to the apex once in
 * every period.
 */
export function shimmerCrest(seconds: number): number {
  const place = seconds / SHIMMER.period - 0.25;
  return place - Math.floor(place);
}

/**
 * How far along a side the outer bands have begun to show, from 0 at a horn to 1 at the apex, which
 * is where the sparkles that trail the paint are.
 */
export const paintFront = (seconds: number): number =>
  seconds < PAINT.begin ? 0 : Math.min(1, (((seconds - PAINT.begin) / PAINT.span) * last + 1) / PIECES_PER_SIDE);

/**
 * How far along a side the outer bands have not yet begun to go, from 1 at the apex to 0 at a horn,
 * for a rainbow that lasts `total`. The sparkles it sheds are there.
 */
export function dissolveFront(seconds: number, total: number): number {
  const gone = (seconds - (total - RAINBOW.fade) - DISSOLVE.lead) / DISSOLVE.span;
  return Math.min(1, Math.max(0, (last - gone * last) / PIECES_PER_SIDE));
}
