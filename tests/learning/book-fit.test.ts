import { describe, expect, it } from 'vitest';
import { CARD, CELL_LEAST, layOut, PICTURE, pictureIn } from '../../src/ui/learning/book-fit';

/** The room a page gets on the screens the game is played on, with the gap between its cards. */
const PHONE_SIDEWAYS = { width: 805, height: 211 };
const PHONE_UPRIGHT = { width: 317, height: 420 };
const DESKTOP = { width: 800, height: 395 };
const GAP = 5;

describe('the picture a cell makes', () => {
  it('is held back by whichever of the width and the height is smaller', () => {
    expect(pictureIn({ width: 80, height: 500 })).toBe(80 - CARD.beside);
    expect(pictureIn({ width: 500, height: 100 })).toBeCloseTo((100 - CARD.around) / CARD.tall, 9);
  });

  it('is never bigger than the biggest, however much room there is', () => {
    expect(pictureIn({ width: 2000, height: 2000 })).toBe(PICTURE.most);
  });

  it('is nothing in a cell with no room, not less than nothing', () => {
    expect(pictureIn({ width: 10, height: 3 })).toBe(0);
    expect(pictureIn({ width: -50, height: -50 })).toBe(0);
  });
});

describe('a page laid out in a room', () => {
  it('puts a page on a phone held sideways in one row, as many across as it has words', () => {
    for (const words of [3, 5, 6, 7]) {
      const shape = layOut(words, PHONE_SIDEWAYS, GAP);
      expect(shape, `${words} words`).toMatchObject({ cols: words, rows: 1, scrolls: false });
    }
  });

  it('gives each of seven words a card a thumb can find, on a phone held sideways', () => {
    const shape = layOut(7, PHONE_SIDEWAYS, GAP);
    expect(shape.picture).toBeGreaterThan(80);
    expect(shape.cell.width).toBeGreaterThan(100);
  });

  it('stands a page up in rows on a phone held upright, and does not leave one word alone on a row of its own when it can help it', () => {
    expect(layOut(7, PHONE_UPRIGHT, GAP)).toMatchObject({ cols: 3, rows: 3 });
    expect(layOut(5, PHONE_UPRIGHT, GAP)).toMatchObject({ cols: 3, rows: 2 });
    expect(layOut(6, PHONE_UPRIGHT, GAP)).toMatchObject({ cols: 3, rows: 2 });
    expect(layOut(3, PHONE_UPRIGHT, GAP).rows).toBeLessThanOrEqual(2);
  });

  it('takes two rows when two make the pictures bigger than one, as on a desktop with seven words', () => {
    const shape = layOut(7, DESKTOP, GAP);
    expect(shape).toMatchObject({ cols: 4, rows: 2 });
    expect(shape.picture).toBeGreaterThan(layOut(7, { width: DESKTOP.width, height: 140 }, GAP).picture);
  });

  it('keeps the words in one row when the pictures would come out as big anyway, and has no empty places when it can help it', () => {
    const roomy = { width: 1200, height: 800 };
    expect(layOut(4, roomy, GAP)).toMatchObject({ cols: 4, rows: 1 });
    expect(layOut(5, roomy, GAP)).toMatchObject({ cols: 5, rows: 1 });
    expect(layOut(6, roomy, GAP)).toMatchObject({ cols: 6, rows: 1 });
  });

  it('takes the shape with no empty place over one whose pictures are only a hair bigger', () => {
    // Five across makes pictures of 42.9 and three over two makes 43.5, and the second leaves a
    // place empty.
    expect(layOut(5, { width: 345, height: 165 }, GAP)).toMatchObject({ cols: 5, rows: 1 });
  });

  it('gives a page of one word the whole room, with its picture no bigger than the biggest', () => {
    const shape = layOut(1, PHONE_SIDEWAYS, GAP);
    expect(shape).toMatchObject({ cols: 1, rows: 1 });
    expect(shape.cell.width).toBeLessThanOrEqual(PHONE_SIDEWAYS.width);
    expect(shape.picture).toBeLessThanOrEqual(PICTURE.most);
  });

  it('keeps the cards of a page big enough to tap and scrolls the page when the words will not fit', () => {
    const cramped = layOut(12, { width: 420, height: 130 }, GAP);
    expect(cramped.scrolls).toBe(true);
    expect(cramped.cell.height).toBeGreaterThanOrEqual(CELL_LEAST);
    expect(cramped.picture).toBeGreaterThanOrEqual(PICTURE.least);
  });

  it('scrolls as little as it can: the fewest rows whose cards are wide enough', () => {
    expect(layOut(12, { width: 420, height: 130 }, GAP)).toMatchObject({ cols: 6, rows: 2 });
    expect(layOut(12, { width: 260, height: 100 }, GAP)).toMatchObject({ cols: 3, rows: 4 });
  });

  it('fits seven words on the smallest phone it is played on, held sideways, with one row and no scrolling', () => {
    const shape = layOut(7, { width: 470, height: 135 }, 4);
    expect(shape).toMatchObject({ cols: 7, rows: 1, scrolls: false });
    expect(shape.picture).toBeGreaterThanOrEqual(PICTURE.least);
  });

  it('does not scroll a page that fits', () => {
    expect(layOut(7, PHONE_SIDEWAYS, GAP).scrolls).toBe(false);
    expect(layOut(7, PHONE_UPRIGHT, GAP).scrolls).toBe(false);
    expect(layOut(12, DESKTOP, GAP).scrolls).toBe(false);
  });

  it('copes with a page that has no words, and with a room that has not been laid out yet', () => {
    expect(layOut(0, PHONE_SIDEWAYS, GAP)).toMatchObject({ cols: 1, rows: 1 });
    const unplaced = layOut(5, { width: 0, height: 0 }, GAP);
    expect(unplaced.cols * unplaced.rows).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(unplaced.picture)).toBe(true);
  });
});

describe('a page laid out in every room', () => {
  const rooms: { width: number; height: number }[] = [];
  for (const width of [140, 260, 317, 420, 500, 640, 805, 940, 1200])
    for (const height of [60, 120, 211, 300, 420, 600]) rooms.push({ width, height });

  it('always has a place for every word, with no column or row left empty', () => {
    for (const room of rooms) {
      for (let words = 1; words <= 24; words++) {
        const { cols, rows } = layOut(words, room, GAP);
        const where = `${words} words in ${room.width}x${room.height}`;
        expect(cols * rows, where).toBeGreaterThanOrEqual(words);
        expect((rows - 1) * cols, where).toBeLessThan(words);
        expect(cols, where).toBeLessThanOrEqual(words);
        expect((cols - 1) * rows, where).toBeLessThan(words);
      }
    }
  });

  it('leaves a twentieth of a pixel of the room for every card in a row, so a browser that rounds a card up does not wrap the last one', () => {
    for (const room of rooms) {
      for (let words = 1; words <= 24; words++) {
        const { cols, cell } = layOut(words, room, GAP);
        expect(
          cols * cell.width + (cols - 1) * GAP,
          `${words} words in ${room.width}x${room.height}`,
        ).toBeLessThanOrEqual(room.width - cols * 0.05);
      }
    }
  });

  it('gives every card a cell as tall as it is, and no taller, so the rows sit together', () => {
    for (const room of rooms) {
      for (let words = 1; words <= 24; words++) {
        const { cell, picture } = layOut(words, room, GAP);
        expect(cell.height, `${words} words in ${room.width}x${room.height}`).toBeCloseTo(
          picture * CARD.tall + CARD.around,
          6,
        );
      }
    }
  });

  it('says a page scrolls exactly when its rows are taller than the room', () => {
    for (const room of rooms) {
      for (let words = 1; words <= 24; words++) {
        const { rows, cell, scrolls } = layOut(words, room, GAP);
        const tall = rows * cell.height + (rows - 1) * GAP;
        expect(scrolls, `${words} words in ${room.width}x${room.height}`).toBe(tall > room.height + 1);
      }
    }
  });

  it('keeps its pictures from the biggest down to a size a thumb can find, whatever the room', () => {
    for (const room of rooms) {
      for (let words = 1; words <= 24; words++) {
        const { picture } = layOut(words, room, GAP);
        const where = `${words} words in ${room.width}x${room.height}`;
        expect(picture, where).toBeLessThanOrEqual(PICTURE.most);
        if (room.width >= 140)
          expect(picture, where).toBeGreaterThanOrEqual(Math.min(PICTURE.least, room.width - CARD.beside) - 2);
      }
    }
  });

  it('never makes the pictures smaller when the room is bigger', () => {
    for (let words = 1; words <= 12; words++) {
      for (const base of rooms) {
        const small = layOut(words, base, GAP).picture;
        const bigger = layOut(words, { width: base.width + 60, height: base.height + 60 }, GAP).picture;
        expect(bigger, `${words} words in ${base.width}x${base.height}`).toBeGreaterThanOrEqual(small - 2.5);
      }
    }
  });
});
