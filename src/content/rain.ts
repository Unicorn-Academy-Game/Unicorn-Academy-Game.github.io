/**
 * What falls in the treasure game. Every piece is one picture and belongs to one of three kinds,
 * and the result screen counts the kinds, not the pieces, so a child sees gems, gold and money.
 * Nothing here can be missed or lost: a piece that is not caught falls away and another is on its
 * way.
 */
export const RAIN_KINDS = ['gem', 'gold', 'money'] as const;
export type RainKind = (typeof RAIN_KINDS)[number];

export const RAIN_PIECE_IDS = [
  'ruby',
  'sapphire',
  'emerald',
  'amethyst',
  'topaz',
  'diamond',
  'coin',
  'bar',
  'note-mint',
  'note-lilac',
  'note-peach',
] as const;
export type RainPieceId = (typeof RAIN_PIECE_IDS)[number];

export interface RainPieceDef {
  /** A content id, so the word can be read out and spelled later. */
  id: string;
  kind: RainKind;
  word: string;
}

export const RAIN_PIECES: Readonly<Record<RainPieceId, RainPieceDef>> = {
  ruby: { id: 'rain.ruby', kind: 'gem', word: 'ruby' },
  sapphire: { id: 'rain.sapphire', kind: 'gem', word: 'sapphire' },
  emerald: { id: 'rain.emerald', kind: 'gem', word: 'emerald' },
  amethyst: { id: 'rain.amethyst', kind: 'gem', word: 'amethyst' },
  topaz: { id: 'rain.topaz', kind: 'gem', word: 'topaz' },
  diamond: { id: 'rain.diamond', kind: 'gem', word: 'diamond' },
  coin: { id: 'rain.coin', kind: 'gold', word: 'gold coin' },
  bar: { id: 'rain.bar', kind: 'gold', word: 'gold bar' },
  'note-mint': { id: 'rain.note-mint', kind: 'money', word: 'banknote' },
  'note-lilac': { id: 'rain.note-lilac', kind: 'money', word: 'banknote' },
  'note-peach': { id: 'rain.note-peach', kind: 'money', word: 'banknote' },
};

export interface RainKindDef {
  id: string;
  word: string;
  plural: string;
  /** The piece that stands for the kind in the counters and on the result screen. */
  icon: RainPieceId;
}

export const RAIN_KIND: Readonly<Record<RainKind, RainKindDef>> = {
  gem: { id: 'rain.kind.gem', word: 'gem', plural: 'gems', icon: 'diamond' },
  gold: { id: 'rain.kind.gold', word: 'gold piece', plural: 'gold pieces', icon: 'coin' },
  money: { id: 'rain.kind.money', word: 'banknote', plural: 'banknotes', icon: 'note-mint' },
};

/** The pieces of one kind. */
export const piecesOf = (kind: RainKind): readonly RainPieceId[] =>
  RAIN_PIECE_IDS.filter((id) => RAIN_PIECES[id].kind === kind);

/**
 * How long a round lasts. It ends when the time is up, and nothing the player does can end it
 * sooner or later.
 */
export const RAIN_SECONDS = 60;

/** The picture of one piece, in the produce bundle, which loads with the unicorns. */
export const rainSprite = (id: RainPieceId): string => `rain-${id}`;
