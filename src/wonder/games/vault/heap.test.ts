import { describe, expect, it } from 'vitest';
import { drawn, fullness, HEAP_CAP, heapOf, spotOf } from './heap';

describe('a heap of treasure in the chest', () => {
  it('has no pieces when nothing has landed, and never more than it can draw', () => {
    expect(heapOf(0)).toHaveLength(0);
    expect(heapOf(7)).toHaveLength(7);
    expect(heapOf(500)).toHaveLength(HEAP_CAP);
    expect(drawn(-3)).toBe(0);
  });

  it('keeps every piece across the bay and above the rim', () => {
    for (const total of [1, 4, 12, 30, 90]) {
      for (const s of heapOf(total)) {
        expect(Math.abs(s.u)).toBeLessThanOrEqual(1);
        expect(s.rise).toBeGreaterThanOrEqual(0);
        expect(s.rise).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is a mound: the pieces at the edges lie lower than those in the middle', () => {
    const spots = heapOf(60);
    const edge = spots.filter((s) => Math.abs(s.u) > 0.8);
    const middle = spots.filter((s) => Math.abs(s.u) < 0.3);
    const mean = (xs: readonly { rise: number }[]): number => xs.reduce((sum, s) => sum + s.rise, 0) / xs.length;
    expect(edge.length).toBeGreaterThan(0);
    expect(middle.length).toBeGreaterThan(0);
    expect(mean(middle)).toBeGreaterThan(mean(edge) * 2);
  });

  it('grows taller as more land, and quickly at first', () => {
    const top = (total: number): number => Math.max(...heapOf(total).map((s) => s.rise));
    expect(top(3)).toBeLessThan(top(12));
    expect(top(12)).toBeLessThan(top(40));
    expect(fullness(5) - fullness(0)).toBeGreaterThan(fullness(60) - fullness(55));
  });

  it('puts a piece in the same place every time it is asked, so that a heap never shuffles', () => {
    expect(spotOf(5, 12)).toEqual(spotOf(5, 12));
    // The same piece keeps its place across the bay as the heap grows, and only rises.
    expect(spotOf(5, 20).u).toBe(spotOf(5, 12).u);
    expect(spotOf(5, 20).rise).toBeGreaterThanOrEqual(spotOf(5, 12).rise - 0.05);
  });

  it('does not put two pieces on the same place', () => {
    const spots = heapOf(30);
    const seen = new Set(spots.map((s) => `${s.u.toFixed(2)}:${s.rise.toFixed(2)}`));
    expect(seen.size).toBe(spots.length);
  });
});
