import { describe, expect, it } from 'vitest';
import { headline, scoreLabel } from './words';

describe('what the treasure game says', () => {
  it('says nothing was caught yet, and then each kind with the right word for one and for more', () => {
    expect(scoreLabel({ gem: 0, gold: 0, money: 0 })).toBe('Nothing caught yet');
    expect(scoreLabel({ gem: 1, gold: 0, money: 0 })).toBe('1 gem');
    expect(scoreLabel({ gem: 4, gold: 1, money: 2 })).toBe('4 gems, 1 gold piece, 2 banknotes');
  });

  it('is never unkind: with nothing caught it says how to catch some, and the rest cheer', () => {
    expect(headline(0).title).toBe('Nice try!');
    expect(headline(0).detail).toMatch(/swipe/i);
    for (const n of [1, 14, 15, 34, 35, 90]) {
      const say = headline(n);
      expect(say.title).toBe(`You caught ${n}!`);
      expect(say.detail.length).toBeGreaterThan(0);
    }
  });
});
