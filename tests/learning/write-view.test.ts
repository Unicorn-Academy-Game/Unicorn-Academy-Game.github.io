import { describe, expect, it } from 'vitest';
import { boxOf, glyphOf, RULES, symbolsOf, WRITE_KINDS, type WriteKind } from '../../src/content/letters';
import {
  frameOf,
  hintSeconds,
  lengthOf,
  pathOf,
  reachFor,
  rulesOf,
  startOf,
  tilesFor,
} from '../../src/ui/learning/write-view';

const found = (letter: string, kase: WriteKind) => {
  const glyph = glyphOf(letter, kase);
  if (!glyph) throw new Error(`no ${letter}`);
  return glyph;
};
const every = WRITE_KINDS.flatMap((kase) => symbolsOf(kase).map((letter) => ({ kase, letter })));

describe('the page a letter is on', () => {
  it.each(every)('holds all of $letter in $kase with room round it', ({ letter, kase }) => {
    const glyph = found(letter, kase);
    const box = boxOf(glyph);
    const frame = frameOf(glyph);
    expect(frame.x).toBeLessThan(box.x0 - 10);
    expect(frame.x + frame.w).toBeGreaterThan(box.x1 + 10);
    expect(frame.y).toBeLessThan(box.y0 - 10);
    expect(frame.y + frame.h).toBeGreaterThan(Math.max(box.y1, RULES.base) + 10);
  });

  it('puts the letter in the middle of the page', () => {
    for (const { letter, kase } of every) {
      const glyph = found(letter, kase);
      const box = boxOf(glyph);
      const frame = frameOf(glyph);
      expect(frame.x + frame.w / 2).toBeCloseTo((box.x0 + box.x1) / 2, 5);
    }
  });

  it('is not made thin for a thin letter', () => {
    const frame = frameOf(found('i', 'upper'));
    expect(frame.w / frame.h).toBeGreaterThanOrEqual(0.79);
  });

  it('makes a small letter with no tail or tall part a short page, so the letter is as big as can be', () => {
    expect(frameOf(found('a', 'lower')).h).toBeLessThan(frameOf(found('b', 'lower')).h);
    expect(frameOf(found('a', 'lower')).h).toBeLessThan(frameOf(found('g', 'lower')).h);
  });
});

describe('the lines a letter is written between', () => {
  it('are a top and a line to stand on for a capital', () => {
    expect(rulesOf(found('h', 'upper'), 'upper')).toEqual([
      { y: RULES.top, dashed: false },
      { y: RULES.base, dashed: false },
    ]);
  });

  it('are a top and a line to stand on for a numeral, as for a capital', () => {
    expect(rulesOf(found('7', 'digits'), 'digits')).toEqual([
      { y: RULES.top, dashed: false },
      { y: RULES.base, dashed: false },
    ]);
  });

  it('add the line the body fits under for a small letter, and the lines a tall or tailed one reaches', () => {
    const ys = (letter: string) => rulesOf(found(letter, 'lower'), 'lower').map((rule) => rule.y);
    expect(ys('a')).toEqual([RULES.body, RULES.base]);
    expect(ys('b')).toEqual([RULES.top, RULES.body, RULES.base]);
    expect(ys('g')).toEqual([RULES.body, RULES.base, RULES.tail]);
  });

  it('keep the line the letter stands on whole and the rest dashed', () => {
    for (const rule of rulesOf(found('b', 'lower'), 'lower')) expect(rule.dashed).toBe(rule.y !== RULES.base);
  });

  it('all fall on the page', () => {
    for (const { letter, kase } of every) {
      const glyph = found(letter, kase);
      const frame = frameOf(glyph);
      for (const rule of rulesOf(glyph, kase)) {
        expect(rule.y).toBeGreaterThanOrEqual(frame.y);
        expect(rule.y).toBeLessThanOrEqual(frame.y + frame.h);
      }
    }
  });
});

describe('a stroke as a path', () => {
  it('moves to the first point and goes line by line to the rest, to a tenth', () => {
    expect(
      pathOf([
        [0, 0],
        [10.04, 5.06],
        [20, 5],
      ]),
    ).toBe('M0 0 L10 5.1 L20 5');
  });

  it('says where a stroke starts', () => {
    expect(
      startOf([
        [3, 4],
        [5, 6],
      ]),
    ).toEqual([3, 4]);
  });

  it('measures the length of a run of points', () => {
    expect(
      lengthOf([
        [0, 0],
        [3, 4],
        [3, 14],
      ]),
    ).toBe(15);
    expect(lengthOf([])).toBe(0);
  });
});

describe('how near the line a finger has to be', () => {
  it('is a fingertip however big the letter is drawn', () => {
    const unitsAt = (unitPx: number) => reachFor(unitPx) * unitPx;
    expect(unitsAt(2)).toBeCloseTo(40, 5);
    expect(unitsAt(1.7)).toBeCloseTo(40, 5);
  });

  it('is not made so small a finger cannot find the line, nor so wide it lets the finger stray', () => {
    expect(reachFor(8)).toBe(14);
    expect(reachFor(0.5)).toBe(26);
    expect(reachFor(0)).toBe(26);
  });
});

describe('how long the dot takes to go along a line', () => {
  it('is longer for a longer line, and never too quick to follow nor so slow it is boring', () => {
    expect(hintSeconds(10)).toBe(0.9);
    expect(hintSeconds(140)).toBe(2);
    expect(hintSeconds(10_000)).toBe(2.6);
  });
});

describe('the letters on the grid', () => {
  it('go across in the shape that gives each the most room', () => {
    expect(tilesFor(26, 780, 250, 8, 44)).toEqual({ columns: 9, tile: 78 });
    expect(tilesFor(26, 290, 420, 8, 44).columns).toBe(4);
  });

  it('never give the letters more room than there is, unless they are at their least', () => {
    for (const [width, height] of [
      [300, 200],
      [700, 220],
      [250, 500],
      [1000, 600],
    ] as const) {
      const { columns, tile } = tilesFor(26, width, height, 8, 44);
      const rows = Math.ceil(26 / columns);
      expect(columns * tile + (columns - 1) * 8).toBeLessThanOrEqual(width);
      if (tile > 44) expect(rows * tile + (rows - 1) * 8).toBeLessThanOrEqual(height);
    }
  });

  it('keep the least size, and as many across as the width holds, when they do not all fit', () => {
    expect(tilesFor(26, 200, 120, 8, 44)).toEqual({ columns: 4, tile: 44 });
    expect(tilesFor(26, 10, 10, 8, 44)).toEqual({ columns: 1, tile: 44 });
  });
});
