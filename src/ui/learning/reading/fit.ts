/**
 * How big a word or a sentence is written on the reading screen, and where its rows break. Its
 * pieces (the tiles of a word, the words of a sentence) sit in rows, and the size is the biggest
 * one at which they all fit in the room there is, so a short word is written large and a long one
 * is written as large as its room lets it, in as many rows as it takes. A word is kept on one row
 * as long as that is a size that is comfortable to read and to touch, and a sentence is given as
 * few rows as costs it little size. Everything about a piece is measured in ems, so its width at
 * any size is its width at one em times the size, and a layout can be worked out without drawing
 * it.
 */

export interface FitInput {
  /** How wide each piece is at one em, in ems, in the order they are read. */
  readonly widths: readonly number[];
  /**
   * Space before each piece, apart from the gap every piece has, in ems. A word of two parts has
   * some before its second part. Not used before the first piece of a row.
   */
  readonly spaces: readonly number[];
  /** The gap between two pieces on a row, in ems. */
  readonly gap: number;
  /** The gap between two rows, in ems. */
  readonly rowGap: number;
  /** How tall a row is, in ems. */
  readonly height: number;
  /** The room there is, in pixels. */
  readonly room: { readonly width: number; readonly height: number };
  /** The smallest size to write at, in pixels, and the biggest. */
  readonly floor: number;
  readonly ceiling: number;
  /**
   * The size, in pixels, at which a piece is comfortable to read and to touch. Once a layout
   * reaches it, fewer rows win over a bigger size. `Infinity` for a bigger size to win always.
   */
  readonly comfort: number;
  /** How much smaller than the best a size may be, as a share of it, to save a row. */
  readonly give: number;
}

export interface Fitted {
  /** The size in pixels. */
  readonly size: number;
  /** The rows the pieces are written in: each row is the indexes of the pieces on it, in order. */
  readonly rows: readonly (readonly number[])[];
  /**
   * Whether it all fits in the room at that size. It does not when even the smallest size is too
   * big for the room.
   */
  readonly fits: boolean;
}

/** How fine the sizes are told apart, in pixels. */
export const STEP = 0.25;
/**
 * A row may be this much wider than the room, so that a sum that is out by the last digit of a
 * float does not send a piece to the next row.
 */
const SLACK = 0.01;
/**
 * What a row break at a space of the word, between its parts, is worth, as a share of the width of
 * the room.
 */
const PART_BREAK = 0.15;

/**
 * The rows the pieces fall into at `size` when each row is filled as far as it goes. A piece that
 * is wider than the room alone is on a row of its own, and `fits` is false.
 */
export function layout(input: FitInput, size: number): { rows: number[][]; fits: boolean } {
  const { widths, spaces, gap, room } = input;
  const rows: number[][] = [];
  let used = 0;
  let fits = true;
  widths.forEach((em, i) => {
    const width = em * size;
    if (width > room.width + SLACK) fits = false;
    const before = (gap + (spaces[i] ?? 0)) * size;
    const row = rows.at(-1);
    if (row && used + before + width <= room.width + SLACK) {
      row.push(i);
      used += before + width;
    } else {
      rows.push([i]);
      used = width;
    }
  });
  return { rows, fits };
}

/** How tall the rows are, in pixels, at a size. */
export const heightOf = (input: FitInput, rows: number, size: number): number =>
  (rows * input.height + Math.max(0, rows - 1) * input.rowGap) * size;

function fitsAt(input: FitInput, size: number): { fits: boolean; rows: number } {
  const { rows, fits } = layout(input, size);
  return { fits: fits && heightOf(input, rows.length, size) <= input.room.height + SLACK, rows: rows.length };
}

/**
 * The biggest size, in whole steps, between the floor and the ceiling, at which the pieces fit in
 * the room in at most `most` rows, or null when not even the floor does.
 */
function biggest(input: FitInput, most: number): number | null {
  const at = (size: number): boolean => {
    const { fits, rows } = fitsAt(input, size);
    return fits && rows <= most;
  };
  if (at(input.ceiling)) return input.ceiling;
  if (!at(input.floor)) return null;
  // What fits at a size fits at every smaller one, since a piece only gets narrower and the rows
  // only fewer, so the biggest is found by halving.
  let low = Math.ceil(input.floor / STEP);
  let high = Math.floor(input.ceiling / STEP);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (at(middle * STEP)) low = middle;
    else high = middle - 1;
  }
  return low * STEP;
}

/**
 * Splits the pieces into exactly `count` rows so that the rows are as even as they can be, and a
 * break falls between the parts of a word where there is one. A sentence that takes two rows is two
 * halves, and does not leave a word on a row of its own.
 */
function balance(input: FitInput, size: number, count: number): number[][] {
  const { widths, spaces, gap, room } = input;
  const n = widths.length;
  const reach = (from: number, to: number): number => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += widths[i]! * size + (i > from ? (gap + (spaces[i] ?? 0)) * size : 0);
    return sum;
  };
  const bonus = (PART_BREAK * room.width) ** 2;
  // best[r][j]: the least cost of the first j pieces in r rows; cut[r][j]: where the last of those
  // rows starts.
  const best = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0]![0] = 0;
  for (let r = 1; r <= count; r++) {
    for (let j = r; j <= n; j++) {
      for (let i = r - 1; i < j; i++) {
        const width = reach(i, j);
        if (width > room.width + SLACK && j - i > 1) continue;
        const before = best[r - 1]![i]!;
        if (before === Infinity) continue;
        const slack = Math.max(0, room.width - width);
        const cost = before + slack * slack - (i > 0 && (spaces[i] ?? 0) > 0 ? bonus : 0);
        if (cost < best[r]![j]!) {
          best[r]![j] = cost;
          cut[r]![j] = i;
        }
      }
    }
  }
  const rows: number[][] = [];
  let end = n;
  for (let r = count; r >= 1; r--) {
    const start = cut[r]![end]!;
    rows.unshift(Array.from({ length: end - start }, (_, k) => start + k));
    end = start;
  }
  return rows;
}

/**
 * The size to write at and the rows to break into. The biggest size at which the pieces fit is
 * worked out for one row, for two and so on, and the fewest rows are taken that come within `give`
 * of what is best, or of `comfort` if that is less. So a word is kept whole as long as it is
 * written large enough, and a sentence is not broken into more rows for a size that is hardly
 * bigger.
 */
export function fit(input: FitInput): Fitted {
  const n = input.widths.length;
  if (n === 0) return { size: input.ceiling, rows: [], fits: true };
  const sizes = Array.from({ length: n }, (_, k) => biggest(input, k + 1));
  const top = sizes[n - 1] ?? null;
  if (top === null) {
    const { rows } = layout(input, input.floor);
    return { size: input.floor, rows: balance(input, input.floor, rows.length), fits: false };
  }
  const wanted = Math.min(input.comfort, top) * (1 - input.give);
  const most = sizes.findIndex((size) => size !== null && size >= wanted) + 1;
  const size = sizes[most - 1]!;
  return { size, rows: balance(input, size, layout(input, size).rows.length), fits: true };
}
