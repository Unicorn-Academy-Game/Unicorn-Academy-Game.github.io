// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { Grid, Stroke, type Tile, tileAt, tilesBetween } from './grid';
import { SIZE } from './scale';

const key = (t: Tile): string => `${t.x},${t.y}`;

describe('which tile a point is on', () => {
  it('is the one whose sixteenth of the width and of the height the point falls in', () => {
    expect(tileAt(0, 0, 320, 160)).toEqual({ x: 0, y: 0 });
    expect(tileAt(19.9, 9.9, 320, 160)).toEqual({ x: 0, y: 0 });
    expect(tileAt(20, 10, 320, 160)).toEqual({ x: 1, y: 1 });
    expect(tileAt(319.9, 159.9, 320, 160)).toEqual({ x: SIZE - 1, y: SIZE - 1 });
  });

  it('is none for a point outside the grid or not a point at all', () => {
    expect(tileAt(320, 80, 320, 160)).toBeNull();
    expect(tileAt(-0.1, 80, 320, 160)).toBeNull();
    expect(tileAt(160, -5, 320, 160)).toBeNull();
    expect(tileAt(160, 160, 320, 160)).toBeNull();
    expect(tileAt(Number.NaN, 80, 320, 160)).toBeNull();
    expect(tileAt(Infinity, 80, 320, 160)).toBeNull();
  });
});

describe('the tiles on the way from one to another', () => {
  it('leave out the first and have the last, with no gap between, however the finger went', () => {
    const cases: [Tile, Tile][] = [
      [
        { x: 0, y: 0 },
        { x: 15, y: 15 },
      ],
      [
        { x: 3, y: 12 },
        { x: 14, y: 2 },
      ],
      [
        { x: 7, y: 7 },
        { x: 8, y: 7 },
      ],
      [
        { x: 15, y: 0 },
        { x: 0, y: 3 },
      ],
      [
        { x: 4, y: 9 },
        { x: 4, y: 1 },
      ],
    ];
    for (const [from, to] of cases) {
      const path = tilesBetween(from, to);
      expect(path.at(-1), `${key(from)} to ${key(to)}`).toEqual(to);
      expect(path.map(key)).not.toContain(key(from));
      let before = from;
      for (const tile of path) {
        expect(
          Math.max(Math.abs(tile.x - before.x), Math.abs(tile.y - before.y)),
          `from ${key(before)} to ${key(tile)}`,
        ).toBe(1);
        before = tile;
      }
    }
  });

  it('are none when the finger has not left its tile', () => {
    expect(tilesBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([]);
  });
});

describe('the tiles that are on', () => {
  it('say whether setting one changed it, and count the tiles and the notes in each step', () => {
    const g = new Grid();
    expect(g.set(3, 4, true)).toBe(true);
    expect(g.set(3, 4, true), 'already on').toBe(false);
    expect(g.set(3, 9, true)).toBe(true);
    expect(g.set(8, 0, true)).toBe(true);
    expect([g.count, g.inStep(3), g.inStep(8), g.inStep(0)]).toEqual([3, 2, 1, 0]);
    expect(g.set(3, 4, false)).toBe(true);
    expect(g.set(3, 4, false), 'already off').toBe(false);
    expect([g.count, g.inStep(3)]).toEqual([2, 1]);
  });

  it('keep the notes of a step in order from the top, and every tile in order of step', () => {
    const g = new Grid();
    g.set(2, 9, true);
    g.set(2, 1, true);
    g.set(0, 15, true);
    expect(g.rowsOf(2)).toEqual([1, 9]);
    expect(g.tiles()).toEqual([
      { x: 0, y: 15 },
      { x: 2, y: 1 },
      { x: 2, y: 9 },
    ]);
  });

  it('ignore tiles that are not on the grid, and do not count them', () => {
    const g = new Grid();
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [SIZE, 0],
      [0, SIZE],
      [-1, SIZE],
      [-1, 5],
      [3, SIZE + 4],
    ] as const) {
      expect(g.set(x, y, true), `${x},${y}`).toBe(false);
      expect(g.has(x, y), `${x},${y}`).toBe(false);
    }
    expect([g.count, g.tiles()]).toEqual([0, []]);
    expect(g.inStep(-1)).toBe(0);
    expect(g.inStep(SIZE)).toBe(0);
  });

  it('are all taken off by clear, which says how many there were, and the counts are right after it', () => {
    const g = new Grid();
    for (let i = 0; i < 10; i++) g.set(i, i, true);
    expect(g.clear()).toBe(10);
    expect([g.count, g.inStep(4), g.tiles().length]).toEqual([0, 0, 0]);
    g.set(4, 4, true);
    expect([g.count, g.inStep(4)], 'the counts of a step are not left over from before').toEqual([1, 1]);
    expect(g.clear()).toBe(1);
    expect(g.clear()).toBe(0);
  });
});

describe('a finger on the grid', () => {
  it('paints tiles on when it goes down on one that is off, and the whole stroke paints', () => {
    const g = new Grid();
    g.set(5, 5, true);
    const { stroke, changed } = Stroke.begin(g, { x: 2, y: 5 });
    expect(stroke.arming).toBe(true);
    expect(changed).toEqual([{ x: 2, y: 5 }]);
    const moved = stroke.move(g, { x: 8, y: 5 });
    expect(moved.map(key), 'the one that was on already is not reported').toEqual(['3,5', '4,5', '6,5', '7,5', '8,5']);
    for (let x = 2; x <= 8; x++) expect(g.has(x, 5), `step ${x}`).toBe(true);
    expect(stroke.changed).toBe(6);
  });

  it('rubs tiles out when it goes down on one that is on, and the whole stroke rubs out', () => {
    const g = new Grid();
    for (const x of [1, 2, 4, 5]) g.set(x, 3, true);
    const { stroke, changed } = Stroke.begin(g, { x: 1, y: 3 });
    expect(stroke.arming).toBe(false);
    expect(changed).toEqual([{ x: 1, y: 3 }]);
    stroke.move(g, { x: 6, y: 3 });
    expect(g.count, 'a tile that was off is not painted by a stroke that is rubbing out').toBe(0);
  });

  it('does not leave a gap when it moves fast, and it can go down and diagonal', () => {
    const g = new Grid();
    const { stroke } = Stroke.begin(g, { x: 0, y: 0 });
    stroke.move(g, { x: 15, y: 15 });
    for (let i = 0; i < SIZE; i++) expect(g.has(i, i), `tile ${i}`).toBe(true);
    expect(g.count).toBe(SIZE);
  });

  it('starts a new line where it comes back after it left the grid, not a line across what it skipped', () => {
    const g = new Grid();
    const { stroke } = Stroke.begin(g, { x: 1, y: 1 });
    expect(stroke.move(g, null)).toEqual([]);
    expect(stroke.move(g, { x: 9, y: 1 }).map(key), 'only the tile it came back to').toEqual(['9,1']);
    expect(g.has(5, 1)).toBe(false);
    expect(stroke.move(g, { x: 11, y: 1 }).map(key)).toEqual(['10,1', '11,1']);
  });

  it('changes nothing when it stays on a tile', () => {
    const g = new Grid();
    const { stroke } = Stroke.begin(g, { x: 6, y: 6 });
    expect(stroke.move(g, { x: 6, y: 6 })).toEqual([]);
    expect(g.count).toBe(1);
  });

  it('is its own as two fingers are down at once: one paints and the other rubs out', () => {
    const g = new Grid();
    g.set(10, 2, true);
    const a = Stroke.begin(g, { x: 0, y: 8 }).stroke;
    const b = Stroke.begin(g, { x: 10, y: 2 }).stroke;
    expect([a.arming, b.arming]).toEqual([true, false]);
    a.move(g, { x: 4, y: 8 });
    b.move(g, { x: 10, y: 2 });
    expect(g.has(10, 2)).toBe(false);
    expect([0, 1, 2, 3, 4].every((x) => g.has(x, 8))).toBe(true);
  });
});

describe('a grid that is one note at a time, like the bass', () => {
  const mono = (): Grid => new Grid(true);

  it('has one tile in a step at most, because the one that goes on puts out the one that was there', () => {
    const g = mono();
    expect(g.set(3, 10, true)).toBe(true);
    expect(g.set(3, 4, true), 'the new one goes on').toBe(true);
    expect([g.has(3, 10), g.has(3, 4)], 'and the old one is out').toEqual([false, true]);
    expect([g.count, g.inStep(3)]).toEqual([1, 1]);
    expect(g.set(3, 4, true), 'the same one again changes nothing').toBe(false);
    expect([g.has(3, 4), g.count]).toEqual([true, 1]);
  });

  it('does not touch the other steps, and a tile that is put out can be put on again', () => {
    const g = mono();
    g.set(1, 5, true);
    g.set(2, 5, true);
    g.set(2, 6, true);
    expect([g.has(1, 5), g.has(2, 5), g.has(2, 6)]).toEqual([true, false, true]);
    g.set(2, 5, true);
    expect([g.has(2, 5), g.has(2, 6), g.count]).toEqual([true, false, 2]);
  });

  it('says which row is on in a step and which is next on, going round the loop', () => {
    const g = mono();
    g.set(2, 9, true);
    g.set(6, 3, true);
    g.set(13, 8, true);
    expect([g.rowOf(2), g.rowOf(3), g.rowOf(6)]).toEqual([9, -1, 3]);
    expect([g.gapAfter(2), g.gapAfter(6), g.gapAfter(13)], 'the last goes round to the first').toEqual([4, 7, 5]);
    const alone = mono();
    alone.set(8, 8, true);
    expect(alone.gapAfter(8), 'the only one has the whole loop').toBe(SIZE);
    expect(mono().gapAfter(3), 'and with none the gap is the loop too').toBe(SIZE);
  });

  it('is the same as any other grid when it is rubbed out, and when it is cleared', () => {
    const g = mono();
    g.set(5, 5, true);
    expect(g.set(5, 5, false)).toBe(true);
    expect([g.count, g.inStep(5)]).toEqual([0, 0]);
    g.set(1, 1, true);
    g.set(2, 2, true);
    expect(g.clear()).toBe(2);
  });

  it('is told by a stroke which tiles it put out, so that the picture can say goodbye to them, and only once', () => {
    const g = mono();
    g.set(3, 10, true);
    g.set(5, 2, true);
    const { stroke, changed } = Stroke.begin(g, { x: 3, y: 4 });
    expect(changed).toEqual([{ x: 3, y: 4 }]);
    expect(stroke.takeDisplaced()).toEqual([{ x: 3, y: 10 }]);
    expect(stroke.takeDisplaced()).toEqual([]);
    stroke.move(g, { x: 5, y: 4 });
    expect(stroke.takeDisplaced(), 'the finger went through the step of the tile that was at 5,2').toEqual([
      { x: 5, y: 2 },
    ]);
    expect([g.has(4, 4), g.has(5, 4), g.has(5, 2), g.count]).toEqual([true, true, false, 3]);
  });

  it('is told of nothing put out by a stroke that is rubbing out, or one that lands on an empty step', () => {
    const g = mono();
    g.set(3, 10, true);
    const rub = Stroke.begin(g, { x: 3, y: 10 }).stroke;
    rub.move(g, { x: 6, y: 10 });
    expect(rub.takeDisplaced()).toEqual([]);
    const paint = Stroke.begin(g, { x: 8, y: 3 }).stroke;
    expect(paint.takeDisplaced()).toEqual([]);
  });

  it('is told of nothing put out in a grid that has many notes in a step', () => {
    const g = new Grid();
    g.set(3, 10, true);
    const { stroke } = Stroke.begin(g, { x: 3, y: 4 });
    expect(stroke.takeDisplaced()).toEqual([]);
    expect(g.inStep(3)).toBe(2);
  });
});
