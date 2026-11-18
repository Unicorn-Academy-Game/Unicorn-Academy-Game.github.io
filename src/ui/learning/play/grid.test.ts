import { describe, expect, it } from 'vitest';
import { PAIR_SIZES } from '../../../learning/play/memory';
import { CARD_SHAPE, fitGrid } from './grid';

const ROOMS = {
  'a phone held sideways': { width: 850, height: 300 },
  'a phone held upright': { width: 366, height: 520 },
  'a tablet': { width: 940, height: 520 },
  'a wide desktop': { width: 1300, height: 560 },
  'a small window': { width: 420, height: 260 },
} as const;
const GAP = 8;

/** How wide a card is in an arrangement of the room. */
const cardOf = (cols: number, rows: number, room: { width: number; height: number }): number =>
  Math.min((room.width - (cols - 1) * GAP) / cols, ((room.height - (rows - 1) * GAP) / rows) * CARD_SHAPE);

describe('the layout of a board', () => {
  it('has a place for every card, in every size and every room, and never one row of a board of any size', () => {
    for (const pairs of PAIR_SIZES) {
      for (const [name, room] of Object.entries(ROOMS)) {
        const { cols, rows } = fitGrid(pairs * 2, room.width, room.height, GAP);
        expect(cols * rows, `${pairs * 2} cards in ${name}`).toBeGreaterThanOrEqual(pairs * 2);
        expect(cols * rows - pairs * 2, `${pairs * 2} cards in ${name} leave less than a row empty`).toBeLessThan(cols);
        expect(rows, `${pairs * 2} cards in ${name}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('gives the cards at least four fifths of the width that the best arrangement could', () => {
    for (const pairs of PAIR_SIZES) {
      for (const [name, room] of Object.entries(ROOMS)) {
        const count = pairs * 2;
        const chosen = fitGrid(count, room.width, room.height, GAP);
        let best = 0;
        for (let cols = 1; cols <= count; cols++) {
          const rows = Math.ceil(count / cols);
          if (rows >= 2) best = Math.max(best, cardOf(cols, rows, room));
        }
        expect(cardOf(chosen.cols, chosen.rows, room), `${count} cards in ${name}`).toBeGreaterThanOrEqual(best * 0.8);
      }
    }
  });

  it('keeps the boards the game has always had: two rows of cards held sideways, and fewer across held upright', () => {
    const wide = ROOMS['a phone held sideways'];
    expect(fitGrid(6, wide.width, wide.height, GAP)).toEqual({ cols: 3, rows: 2 });
    expect(fitGrid(8, wide.width, wide.height, GAP)).toEqual({ cols: 4, rows: 2 });
    expect(fitGrid(12, wide.width, wide.height, GAP)).toEqual({ cols: 6, rows: 2 });
    expect(fitGrid(16, wide.width, wide.height, GAP)).toEqual({ cols: 8, rows: 2 });
    const tall = ROOMS['a phone held upright'];
    expect(fitGrid(6, tall.width, tall.height, GAP)).toEqual({ cols: 2, rows: 3 });
    expect(fitGrid(8, tall.width, tall.height, GAP)).toEqual({ cols: 2, rows: 4 });
    expect(fitGrid(12, tall.width, tall.height, GAP)).toEqual({ cols: 3, rows: 4 });
    expect(fitGrid(16, tall.width, tall.height, GAP)).toEqual({ cols: 4, rows: 4 });
  });

  it('lays thirty-two cards and sixty-four cards out with every place filled on a phone held sideways', () => {
    const room = ROOMS['a phone held sideways'];
    const thirtyTwo = fitGrid(32, room.width, room.height, GAP);
    const sixtyFour = fitGrid(64, room.width, room.height, GAP);
    expect(thirtyTwo.cols * thirtyTwo.rows).toBe(32);
    expect(sixtyFour.cols * sixtyFour.rows).toBe(64);
  });

  it('turns with the phone: the same cards have more columns in a wide room than in a tall one', () => {
    const wide = ROOMS['a phone held sideways'];
    const tall = ROOMS['a phone held upright'];
    for (const pairs of PAIR_SIZES) {
      const across = fitGrid(pairs * 2, wide.width, wide.height, GAP).cols;
      const upright = fitGrid(pairs * 2, tall.width, tall.height, GAP).cols;
      expect(across, `${pairs * 2} cards`).toBeGreaterThanOrEqual(upright);
    }
  });

  it('copes with a room that has no size yet, and refuses a board with no cards', () => {
    expect(fitGrid(6, 0, 0, GAP).cols).toBeGreaterThan(0);
    expect(() => fitGrid(0, 100, 100, GAP)).toThrow(RangeError);
    expect(() => fitGrid(2.5, 100, 100, GAP)).toThrow(RangeError);
  });
});
