/**
 * How a page of the Spell Book is laid out. A page has a handful of words, each a card with its
 * picture, and the room for them is whatever the screen gives: a wide strip on a phone held
 * sideways, a tall one on a phone held up. Every card on a page is the same size, so the one
 * question is how many go across. The answer is the shape that gives the pictures the most room,
 * and a page that cannot be given enough keeps its cards big enough to tap and scrolls instead of
 * shrinking them.
 */

export interface Room {
  readonly width: number;
  readonly height: number;
}

/** How many cards go across, and how many rows that makes. */
interface Shape {
  readonly cols: number;
  readonly rows: number;
}

export interface Layout extends Shape {
  /** The room each card is given: as wide as the room allows, and no taller than the card. */
  readonly cell: Room;
  /** The picture that room makes, in pixels. */
  readonly picture: number;
  /** Whether the rows add up to more than the room, so the page scrolls. */
  readonly scrolls: boolean;
}

/**
 * What a card is made of: its picture, a little beside it, a little above and below, and the name
 * and stars under it. These are the measures `.book-card` is drawn by in book.css, and a page is
 * laid out from them, so the two change together.
 */
export const CARD = { beside: 22, around: 6, tall: 1.7 } as const;

/**
 * The biggest a picture is drawn, however much room there is, and the smallest a card is made for.
 */
export const PICTURE = { most: 124, least: 40 } as const;

/** The shortest a cell can be and still hold a card at its smallest. */
export const CELL_LEAST = PICTURE.least * CARD.tall + CARD.around;

/**
 * Pictures within this many pixels of the biggest are as good, and the tidier shape among them
 * wins.
 */
const ALIKE = 2;

/**
 * A cell is cut a tenth of a pixel short of its share of the room. Browsers round each cell to
 * their own grid of a fraction of a pixel, and a row of cells that comes to a hair more than the
 * room wraps its last card onto a row of its own.
 */
const LEAVE = 0.1;

const down = (n: number): number => Math.floor(n * 10) / 10 - LEAVE;

/**
 * The picture a cell makes, as book.css draws it: held back by the cell's width, by its height, and
 * by the biggest there is.
 */
export function pictureIn(cell: Room): number {
  return Math.max(0, Math.min(cell.width - CARD.beside, (cell.height - CARD.around) / CARD.tall, PICTURE.most));
}

/**
 * Chooses how the words of a page sit in a room, with `gap` between cards.
 *
 * When some shape gives every picture at least the least, the shape with the biggest pictures wins,
 * and among pictures that are as big, the one with the fewest empty places, then the one with the
 * fewest rows. When none does, the page is going to scroll, so the shape with the fewest rows wins
 * that still has cards wide enough, and its cells are kept as tall as a card at its smallest needs.
 */
export function layOut(count: number, room: Room, gap: number): Layout {
  const words = Math.max(1, Math.floor(count));
  const shapes = Array.from({ length: words }, (_, i) => {
    const cols = words - i;
    const rows = Math.ceil(words / cols);
    const width = down((room.width - gap * (cols - 1)) / cols);
    const height = down((room.height - gap * (rows - 1)) / rows);
    return {
      cols,
      rows,
      width,
      height,
      picture: pictureIn({ width, height }),
      across: pictureIn({ width, height: Infinity }),
      empty: cols * rows - words,
    };
  });
  const fits = shapes.filter((s) => s.picture >= PICTURE.least);
  const [best] =
    fits.length > 0
      ? tidiest(fits)
      : [...shapes].sort(
          (a, b) =>
            Number(b.across >= PICTURE.least) - Number(a.across >= PICTURE.least) ||
            a.rows - b.rows ||
            a.empty - b.empty,
        );
  const { cols, rows, width } = best!;
  const picture = pictureIn({ width, height: Math.max(CELL_LEAST, best!.height) });
  // A cell is no taller than the card in it, so the rows sit together, and a page with room to
  // spare is centred.
  const cell = { width, height: Math.min(Math.max(CELL_LEAST, best!.height), picture * CARD.tall + CARD.around) };
  return { cols, rows, cell, picture, scrolls: rows * cell.height + gap * (rows - 1) > room.height + 1 };
}

/**
 * Of the shapes that fit, the ones with the biggest pictures, tidiest first. A sort keeps equals as
 * they were, which is widest first.
 */
function tidiest<T extends { picture: number; empty: number }>(fits: T[]): T[] {
  const biggest = Math.max(...fits.map((s) => s.picture));
  return fits.filter((s) => s.picture >= biggest - ALIKE).sort((a, b) => a.empty - b.empty);
}
