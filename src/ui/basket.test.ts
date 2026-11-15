import { describe, expect, it } from 'vitest';
import { PRODUCE, PRODUCE_IDS } from '../content/produce';
import { basketLabel, total } from './basket';

describe('the basket', () => {
  it('says it is empty until something is gathered', () => {
    expect(basketLabel({})).toBe('Basket, empty');
    expect(basketLabel({ apple: 0 })).toBe('Basket, empty');
    expect(total({})).toBe(0);
  });

  it('counts each kind with the right word for one and for more, in the order the kinds are listed', () => {
    expect(basketLabel({ carrot: 2, apple: 1 })).toBe('Basket, 1 apple, 2 carrots');
    expect(basketLabel({ 'sky-berry': 1 })).toBe('Basket, 1 sky berry');
    expect(basketLabel({ 'sky-berry': 3, strawberry: 2, tomato: 4 })).toBe(
      'Basket, 3 sky berries, 4 tomatoes, 2 strawberries',
    );
  });

  it('adds up every kind', () => {
    expect(total({ apple: 3, carrot: 2, cabbage: 1 })).toBe(6);
  });

  it('has two words for every kind, and a plural that is not the same as the word', () => {
    for (const id of PRODUCE_IDS) {
      expect(PRODUCE[id].word.length).toBeGreaterThan(2);
      expect(PRODUCE[id].plural).not.toBe(PRODUCE[id].word);
      expect(PRODUCE[id].plural.startsWith(PRODUCE[id].word.slice(0, -1))).toBe(true);
    }
  });
});
