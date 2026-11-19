import { describe, expect, it } from 'vitest';
import { boxOf, glyphOf, RULES, symbolsOf, WRITE_KINDS, type WriteKind } from '../../src/content/letters';
import {
  badgesFor,
  frameOf,
  hintSeconds,
  lengthOf,
  lineWidthsOf,
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

describe('where the numbers of the lines go', () => {
  const at = (x: number, y: number): [number, number] => [x, y];

  it('leaves a number at the start of its line when no other line begins there', () => {
    const badges = badgesFor([
      [at(0, 0), at(0, 50)],
      [at(100, 100), at(100, 150)],
    ]);
    expect(badges).toEqual([
      { start: [0, 0], aside: [0, 0] },
      { start: [100, 100], aside: [100, 100] },
    ]);
  });

  it('moves the number of a line that begins where another does along its own line, until its turn', () => {
    const [first, second] = badgesFor([
      [at(0, 0), at(0, 50)],
      [at(0, 0), at(50, 0)],
    ]);
    expect(first).toEqual({ start: [0, 0], aside: [0, 0] });
    expect(second?.start).toEqual([0, 0]);
    expect(second?.aside[1]).toBe(0);
    expect(second?.aside[0]).toBeGreaterThanOrEqual(17);
    expect(second?.aside[0]).toBeLessThan(20);
  });

  it('gives a third line from the same spot a place of its own', () => {
    const [, second, third] = badgesFor([
      [at(0, 0), at(0, 80)],
      [at(0, 0), at(80, 0)],
      [at(0, 0), at(0, -80)],
    ]);
    expect(Math.hypot(...third!.aside)).toBeGreaterThanOrEqual(17);
    expect(Math.hypot(second!.aside[0] - third!.aside[0], second!.aside[1] - third!.aside[1])).toBeGreaterThanOrEqual(
      17,
    );
  });

  it.each(every)(
    'keeps every number of $letter ($kase) clear of the others while it is waiting',
    ({ kase, letter }) => {
      const badges = badgesFor(found(letter, kase).strokes);
      // While the first line is the one to write, its number is at its start and every other waits aside.
      const shown = badges.map((badge, i) => (i === 0 ? badge.start : badge.aside));
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++)
          expect(
            Math.hypot(shown[i]![0] - shown[j]![0], shown[i]![1] - shown[j]![1]),
            `${i + 1} and ${j + 1}`,
          ).toBeGreaterThan(12);
    },
  );
});

describe('how wide the lines of a letter are drawn', () => {
  it('keeps a capital at the full width', () => {
    expect(lineWidthsOf(frameOf(found('a', 'upper')))).toEqual({ road: 16, ink: 11 });
  });

  it('draws the ink inside the road', () => {
    for (const { kase, letter } of every) {
      const { road, ink } = lineWidthsOf(frameOf(found(letter, kase)));
      expect(ink).toBeLessThan(road);
    }
  });

  it('thins a small letter that is drawn bigger, so that every letter has the same width on a page', () => {
    const onPage = ({ kase, letter }: { kase: WriteKind; letter: string }) => {
      const frame = frameOf(found(letter, kase));
      return lineWidthsOf(frame).road * (250 / Math.max(frame.w, frame.h));
    };
    const capital = onPage({ kase: 'upper', letter: 'a' });
    for (const each of every) {
      expect(onPage(each), `${each.letter} (${each.kase})`).toBeGreaterThan(capital * 0.8);
      expect(onPage(each), `${each.letter} (${each.kase})`).toBeLessThan(capital * 1.05);
    }
    const small = lineWidthsOf(frameOf(found('a', 'lower')));
    expect(small.road).toBeLessThan(16);
  });
});
