import { describe, expect, it } from 'vitest';
import { type FitInput, fit, heightOf, layout, STEP } from './fit';

const input = (patch: Partial<FitInput> = {}): FitInput => ({
  widths: [1, 1, 1],
  spaces: [0, 0, 0],
  gap: 0.2,
  rowGap: 0.2,
  height: 1.5,
  room: { width: 300, height: 100 },
  floor: 12,
  ceiling: 200,
  comfort: Infinity,
  give: 0,
  ...patch,
});

/**
 * A second way of working out where the pieces fall, one piece at a time, to check the first
 * against.
 */
function rowsBySlowWay(i: FitInput, size: number): number {
  let rows = 1;
  let x = 0;
  for (let k = 0; k < i.widths.length; k++) {
    const w = i.widths[k]! * size;
    const need = x === 0 ? w : x + (i.gap + i.spaces[k]!) * size + w;
    if (x !== 0 && need > i.room.width + 0.01) {
      rows += 1;
      x = w;
    } else x = need;
  }
  return rows;
}

describe('the rows a size falls into', () => {
  it('puts the pieces in order on as many rows as the room asks for, and starts a row when the next piece would not fit', () => {
    const five = input({ widths: [1, 1, 1, 1, 1], spaces: [0, 0, 0, 0, 0], room: { width: 100, height: 200 } });
    expect(layout(five, 29).rows).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(layout(five, 40).rows).toEqual([[0, 1], [2, 3], [4]]);
    expect(layout(five, 10).rows).toEqual([[0, 1, 2, 3, 4]]);
  });

  it('counts the gap and the space before a piece, but not at the start of a row, where there is nothing to space it from', () => {
    const parts = input({ widths: [1, 1, 1], spaces: [0, 0, 1], room: { width: 220, height: 500 } });
    expect(layout(parts, 50).rows).toEqual([[0, 1, 2]]);
    expect(layout(parts, 50.1).rows).toEqual([[0, 1], [2]]);
    const alone = input({ widths: [1, 1], spaces: [0, 5], gap: 0.2, room: { width: 60, height: 500 } });
    expect(layout(alone, 40).rows, 'the space of a piece that starts a row is not used').toEqual([[0], [1]]);
    expect(layout(alone, 40).fits).toBe(true);
  });

  it('says it does not fit when one piece is wider than the room alone', () => {
    expect(layout(input({ widths: [1, 4], room: { width: 100, height: 500 } }), 30).fits).toBe(false);
    expect(layout(input({ widths: [1, 4], room: { width: 100, height: 500 } }), 25).fits).toBe(true);
  });

  it('allows a hair of rounding at the edge of the room', () => {
    // Three pieces with their two gaps are exactly 3.4 ems, and in a room of 93 the sum comes out
    // 1.4e-14 over it.
    const three = input({ widths: [1, 1, 1], room: { width: 93, height: 500 } });
    expect(layout(three, 93 / 3.4).rows).toHaveLength(1);
  });
});

describe('how tall the rows are', () => {
  it('is the rows and the gaps between them, times the size', () => {
    const i = input({ height: 1.5, rowGap: 0.2 });
    expect(heightOf(i, 1, 10)).toBe(15);
    expect(heightOf(i, 3, 10)).toBeCloseTo((3 * 1.5 + 2 * 0.2) * 10);
    expect(heightOf(i, 0, 10)).toBe(0);
  });
});

describe('the biggest size that fits', () => {
  it('is the ceiling for a piece that fits at it, and says there are no rows for nothing to write', () => {
    expect(fit(input({ widths: [0.1], spaces: [0], ceiling: 40 }))).toEqual({ size: 40, rows: [[0]], fits: true });
    expect(fit(input({ widths: [], spaces: [] }))).toEqual({ size: 200, rows: [], fits: true });
  });

  it('is held back by the height of the room when the width would allow more', () => {
    // One row of three pieces is 3.4 ems wide, which is room for 88.2 pixels, and 1.5 ems tall,
    // which is room for 66.67.
    expect(fit(input())).toEqual({ size: 66.5, rows: [[0, 1, 2]], fits: true });
  });

  it('is held back by the width, with the pieces on more rows when that makes it bigger', () => {
    const five = input({
      widths: [1, 1, 1, 1, 1],
      spaces: [0, 0, 0, 0, 0],
      height: 1,
      room: { width: 100, height: 200 },
    });
    // Two to a row (45.25 pixels) is as big as it can go, in three rows. At 45.5 it is one to a
    // row, which is five rows and too tall.
    const got = fit(five);
    expect(got).toMatchObject({ size: 45.25, fits: true });
    expect(got.rows.map((row) => row.length).sort()).toEqual([1, 2, 2]);
    expect(got.rows.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  it('writes a long word smaller than a short one in the same room, and never bigger', () => {
    const wide = (n: number): FitInput =>
      input({
        widths: Array.from({ length: n }, () => 1.2),
        spaces: Array.from({ length: n }, () => 0),
        room: { width: 400, height: 150 },
      });
    let before = Infinity;
    for (let n = 1; n <= 12; n++) {
      const { size } = fit(wide(n));
      expect(size, `${n} pieces`).toBeLessThanOrEqual(before);
      before = size;
    }
  });

  it('gives up at the floor and says so when the room is too small for even that', () => {
    const tight = input({ room: { width: 20, height: 20 } });
    expect(fit(tight)).toMatchObject({ size: 12, fits: false });
    const narrow = input({ widths: [1, 6], room: { width: 60, height: 500 }, floor: 20 });
    expect(fit(narrow)).toMatchObject({ size: 20, fits: false });
    expect(
      fit(narrow).rows,
      'the piece that is too wide still has a row of its own, so every piece is written',
    ).toEqual([[0], [1]]);
  });

  it('is a whole number of quarter pixels', () => {
    for (const width of [233, 281, 317, 402, 555]) {
      const { size } = fit(input({ room: { width, height: 90 } }));
      expect(Math.round(size / STEP) * STEP).toBe(size);
    }
  });

  it('agrees with writing out every size from the top down, for pieces and rooms of every kind', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(random() * 14);
      const i = input({
        widths: Array.from({ length: n }, () => 0.5 + random() * 3),
        spaces: Array.from({ length: n }, () => (random() < 0.2 ? random() : 0)),
        gap: 0.1 + random() * 0.4,
        rowGap: random() * 0.4,
        height: 1 + random(),
        room: { width: 150 + random() * 600, height: 60 + random() * 300 },
        floor: 14,
        ceiling: 120,
      });
      const got = fit(i);
      let best = i.floor;
      let found = false;
      for (let size = Math.floor(i.ceiling / STEP) * STEP; size >= i.floor; size -= STEP) {
        const { rows, fits } = layout(i, size);
        if (fits && heightOf(i, rows.length, size) <= i.room.height + 0.01) {
          best = size;
          found = true;
          break;
        }
      }
      expect(got.fits, `trial ${trial}`).toBe(found);
      expect(got.size, `trial ${trial}`).toBe(found ? best : i.floor);
      expect(got.rows, `trial ${trial}`).toHaveLength(rowsBySlowWay(i, got.size));
      if (found && got.size + STEP <= i.ceiling) {
        const { rows, fits } = layout(i, got.size + STEP);
        expect(
          fits && heightOf(i, rows.length, got.size + STEP) <= i.room.height + 0.01,
          `a quarter pixel more would fit in trial ${trial}`,
        ).toBe(false);
      }
    }
  });
});

describe('how many rows it takes', () => {
  /**
   * Five tiles of a word, 1.3 ems each, on a phone held upright: one row is 7.3 ems, which is 49
   * pixels in 358.
   */
  const word = (patch: Partial<FitInput> = {}): FitInput =>
    input({
      widths: [1.3, 1.3, 1.3, 1.3, 1.3],
      spaces: [0, 0, 0, 0, 0],
      room: { width: 358, height: 500 },
      floor: 30,
      ceiling: 228,
      comfort: 44,
      give: 0.1,
      ...patch,
    });

  it('keeps a word on one row while that is a size that is comfortable, though two rows would be much bigger', () => {
    const kept = fit(word());
    expect(kept.rows).toEqual([[0, 1, 2, 3, 4]]);
    expect(kept.size).toBeCloseTo(358 / 7.3, 0);
    const bigger = fit(word({ comfort: Infinity, give: 0 }));
    expect(bigger.rows.length).toBeGreaterThan(1);
    expect(bigger.size).toBeGreaterThan(kept.size * 1.5);
  });

  it('breaks a word into rows when one row would be too small to be comfortable', () => {
    const eight = word({ widths: Array.from({ length: 8 }, () => 1.3), spaces: Array.from({ length: 8 }, () => 0) });
    const got = fit(eight);
    expect(got.rows.length).toBeGreaterThan(1);
    expect(got.size).toBeGreaterThanOrEqual(44 * 0.9);
  });

  it('takes the biggest size it can when no layout is comfortable', () => {
    const tiny = word({ room: { width: 120, height: 500 }, comfort: 500 });
    const most = fit({ ...tiny, comfort: Infinity, give: 0 });
    expect(fit(tiny).size).toBeGreaterThanOrEqual(most.size * 0.9);
  });

  it('saves a row when that costs less than the give, and does not when it costs more', () => {
    // Two pieces of 4 ems. On one row they are 8.3 ems wide, so 36.1 pixels in 300. On two rows the
    // ceiling is the limit.
    const two = input({
      widths: [4, 4],
      spaces: [0, 0],
      gap: 0.3,
      rowGap: 0.3,
      height: 1.5,
      room: { width: 300, height: 400 },
      floor: 10,
      ceiling: 40,
      comfort: Infinity,
      give: 0,
    });
    expect(fit(two)).toMatchObject({ size: 40, rows: [[0], [1]] });
    expect(fit({ ...two, give: 0.1 })).toMatchObject({ size: 36, rows: [[0, 1]] });
    expect(fit({ ...two, give: 0.09 }).rows, 'a tenth of 40 is 4 pixels, and one row is 3.9 short').toHaveLength(2);
    expect(
      fit({ ...two, give: 0.1, ceiling: 60 }).rows,
      'a row costs 40 percent of the size at a ceiling of 60',
    ).toHaveLength(2);
  });

  it('does not leave a word of a sentence on a row of its own when the rows can be even', () => {
    // "I see a cat." is wide enough for two rows at the size that suits it. Filling the first row
    // gives I see, a, cat.
    const line = input({
      widths: [1.1, 2.3, 1.2, 2.5],
      spaces: [0, 0, 0, 0],
      gap: 0.3,
      rowGap: 0.3,
      height: 1.7,
      room: { width: 358, height: 640 },
      floor: 22,
      ceiling: 93,
      comfort: Infinity,
      give: 0.1,
    });
    expect(fit(line).rows).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(layout(line, fit({ ...line, give: 0 }).size).rows, 'filling each row as far as it goes would').toEqual([
      [0, 1],
      [2],
      [3],
    ]);
  });

  it('breaks a long word between its parts when it has to be broken', () => {
    // Seven tiles with a space before the fourth, in a room for four to a row. Even rows would be
    // three and four, or four and three, and the space decides.
    const parts = input({
      widths: Array.from({ length: 7 }, () => 1),
      spaces: [0, 0, 0, 0.45, 0, 0, 0],
      room: { width: 330, height: 500 },
      ceiling: 70,
      comfort: Infinity,
      give: 0,
    });
    const got = fit(parts);
    expect(got.rows).toEqual([
      [0, 1, 2],
      [3, 4, 5, 6],
    ]);
  });

  it('makes the rows as even as it can, though filling the first one as far as it goes would also fit', () => {
    // Six pieces, and a ceiling that leaves room for four to a row. Four and two is as many rows as
    // three and three, and it is lopsided.
    const six = input({
      widths: Array.from({ length: 6 }, () => 1),
      spaces: Array.from({ length: 6 }, () => 0),
      room: { width: 100, height: 500 },
      ceiling: 21,
    });
    expect(layout(six, 21).rows).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
    expect(fit(six).rows).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  describe('a gap between the parts of a word, which is where it is best to break', () => {
    // Seven tiles in the same room each time, and the gap before the tile that is named.
    const word = (gapBefore: number, width: number): FitInput =>
      input({
        widths: Array.from({ length: 7 }, () => 1),
        spaces: Array.from({ length: 7 }, (_, k) => (k === gapBefore ? 0.45 : 0)),
        room: { width, height: 600 },
        floor: 30,
        ceiling: 240,
        comfort: 46,
        give: 0.1,
      });

    it('starts a row at the gap when the rows are about as even either way', () => {
      expect(fit(word(2, 183)).rows).toEqual([
        [0, 1],
        [2, 3, 4],
        [5, 6],
      ]);
    });

    it('does not leave a tile alone on a row to keep to a gap', () => {
      expect(fit(word(1, 156)).rows).toEqual([
        [0, 1],
        [2, 3],
        [4, 5, 6],
      ]);
    });
  });

  it('keeps the rows in order and every piece once, each row inside the room, and the count the rows of the size', () => {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 400; trial++) {
      const n = 1 + Math.floor(random() * 15);
      const i = input({
        widths: Array.from({ length: n }, () => 0.6 + random() * 2.6),
        spaces: Array.from({ length: n }, () => (random() < 0.25 ? random() * 0.6 : 0)),
        gap: 0.15 + random() * 0.2,
        rowGap: random() * 0.35,
        height: 1.2 + random() * 0.6,
        room: { width: 200 + random() * 700, height: 120 + random() * 500 },
        floor: 22,
        ceiling: 120,
        comfort: random() < 0.5 ? Infinity : 30 + random() * 40,
        give: random() < 0.5 ? 0 : 0.1,
      });
      const got = fit(i);
      expect(got.rows.flat(), `order in trial ${trial}`).toEqual(Array.from({ length: n }, (_, k) => k));
      expect(
        got.rows.every((row) => row.length > 0),
        `no empty row in trial ${trial}`,
      ).toBe(true);
      expect(got.rows, `rows in trial ${trial}`).toHaveLength(layout(i, got.size).rows.length);
      expect(got.size).toBeGreaterThanOrEqual(i.floor);
      expect(got.size).toBeLessThanOrEqual(i.ceiling);
      if (got.fits) {
        for (const row of got.rows) {
          const width = row.reduce(
            (sum, k, at) => sum + i.widths[k]! * got.size + (at > 0 ? (i.gap + i.spaces[k]!) * got.size : 0),
            0,
          );
          expect(width, `a row of trial ${trial} is in the room`).toBeLessThanOrEqual(i.room.width + 0.01);
        }
        expect(heightOf(i, got.rows.length, got.size), `height of trial ${trial}`).toBeLessThanOrEqual(
          i.room.height + 0.01,
        );
        const best = fit({ ...i, comfort: Infinity, give: 0 }).size;
        expect(got.size, `trial ${trial} is no bigger than the best`).toBeLessThanOrEqual(best);
        expect(got.size, `trial ${trial} is not much smaller than the best or the comfort`).toBeGreaterThanOrEqual(
          Math.min(i.comfort, best) * (1 - i.give) - STEP,
        );
      }
    }
  });
});
