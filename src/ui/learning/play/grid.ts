/**
 * How a board of cards is laid out in the room it has. A card is as wide as it is tall by 5 to 6,
 * so the same cards fill a wide strip with long rows and a tall room with long columns, and the
 * screen is asked which, since the room changes when a phone is turned over.
 */

/** A card's width over its height. */
export const CARD_SHAPE = 5 / 6;

/** What a board is laid out in. */
export interface Grid {
  readonly cols: number;
  readonly rows: number;
}

/** A card of an arrangement is as wide as the room across and the room down both allow. */
const widthOf = (cols: number, rows: number, width: number, height: number, gap: number): number =>
  Math.min((width - (cols - 1) * gap) / cols, ((height - (rows - 1) * gap) / rows) * CARD_SHAPE);

/**
 * A row of cards that is the whole of a small board would be a few big cards in a line, and the
 * boards of the game have always been two rows at least, so no board of four or more cards is a
 * single row.
 */
const MOST_CARDS_IN_ONE_ROW = 3;

/**
 * Whether an arrangement with an empty place in its last row is worth it. An arrangement that
 * fills every place is the one that is picked unless it makes the cards this much smaller than the
 * best arrangement with a gap.
 */
const FULL_IS_WORTH = 0.8;

/**
 * The columns and rows that give `count` cards the biggest cards in a room `width` by `height`,
 * with `gap` between them. A board with no empty place is kept unless it costs more than a fifth of
 * the width of a card.
 */
export function fitGrid(count: number, width: number, height: number, gap: number): Grid {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`${count} cards cannot be laid out`);
  const room = { width: Math.max(1, width), height: Math.max(1, height) };
  const all: { grid: Grid; card: number }[] = [];
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    if (rows === 1 && count > MOST_CARDS_IN_ONE_ROW) continue;
    all.push({ grid: { cols, rows }, card: widthOf(cols, rows, room.width, room.height, gap) });
  }
  const best = all.reduce((a, b) => (b.card > a.card ? b : a));
  const full = all
    .filter(({ grid }) => grid.cols * grid.rows === count)
    .reduce<{ grid: Grid; card: number } | null>((a, b) => (a === null || b.card > a.card ? b : a), null);
  return (full !== null && full.card >= best.card * FULL_IS_WORTH ? full : best).grid;
}
