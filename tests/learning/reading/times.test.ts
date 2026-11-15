import { describe, expect, it, vi } from 'vitest';
import { evenSpans, timesOf } from '../../../src/content/reading/times';

vi.mock('../../../src/content/reading/line-times.json', () => ({
  default: {
    'the-cat-sat': [
      [0.1, 0.4],
      [0.5, 0.9],
      [1.0, 1.6],
    ],
    'two-words': [[0.0, 1.0]],
  },
}));

describe('when the words of a sentence are said', () => {
  it('gives the spans that were found when the clip was made, for a sentence that has them', () => {
    expect(timesOf('the-cat-sat', 3)).toEqual([
      [0.1, 0.4],
      [0.5, 0.9],
      [1.0, 1.6],
    ]);
  });

  it('gives nothing for a sentence with no times, or with times for a different number of words, so the screen falls back to an even pace', () => {
    expect(timesOf('a-sentence-with-none', 4)).toBeUndefined();
    expect(timesOf('two-words', 2)).toBeUndefined();
    expect(timesOf('the-cat-sat', 4)).toBeUndefined();
    for (const id of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
      expect(timesOf(id, 1), id).toBeUndefined();
  });
});

describe('an even pace over a clip', () => {
  it('gives each word a share of the seconds in proportion to its letters, one after another with no gaps, from the start to the end', () => {
    expect(evenSpans(['a', 'bbb'], 4)).toEqual([
      [0, 1],
      [1, 4],
    ]);
    const spans = evenSpans(['The', 'cat', 'sat.'], 2.6);
    expect(spans[0]![0]).toBe(0);
    expect(spans[2]![1]).toBeCloseTo(2.6, 10);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeCloseTo(spans[i - 1]![1], 10);
    expect(spans[2]![1] - spans[2]![0]).toBeGreaterThan(spans[0]![1] - spans[0]![0]);
  });

  it('gives a sentence of nothing nothing to light, and does not divide by zero', () => {
    expect(evenSpans([], 3)).toEqual([]);
    for (const [from, to] of evenSpans(['', ''], 3)) {
      expect(Number.isFinite(from)).toBe(true);
      expect(Number.isFinite(to)).toBe(true);
    }
  });
});
