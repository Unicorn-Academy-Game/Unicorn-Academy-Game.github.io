import { describe, expect, it } from 'vitest';
import { WORD_IDS } from '../../content/lexicon';
import { begin, type Outcome, press } from '../../learning';
import { MAX_LEVEL } from '../../shared/learning';
import type { KeyState } from './card-view';
import { announce, caption, dialogLabel, HELP_ANNOUNCEMENT, keyLabel, LABELS, slotLabel, starsLabel } from './text';

const random = (): number => 0.3;
/** Words that tell a child they were wrong, and that a young child should not meet on a card. */
const UNKIND = /\b(wrong|fail|failed|failure|bad|no|incorrect|mistakes?|errors?|oops|sorry|lose|lost|try again)\b/i;

/** What every card could say for a word, at every level. */
function everyLine(word: (typeof WORD_IDS)[number], level: number, firstEver: boolean): string[] {
  const s = begin(word, level, random);
  const outcomes: Outcome[] = [
    { kind: 'right', letter: word[0]!, index: 0, done: false },
    { kind: 'right', letter: word[0]!, index: 0, done: true },
    { kind: 'wrong', letter: 'z', lit: false },
    { kind: 'wrong', letter: 'z', lit: true },
    { kind: 'faded', letter: 'z' },
    { kind: 'ignored' },
  ];
  return [caption(s, firstEver), dialogLabel(s), ...outcomes.map((outcome) => announce(outcome, s))];
}

describe('the check for unkind words', () => {
  it('finds them and leaves alone the words that only contain them', () => {
    for (const line of ['That is wrong.', 'No.', 'Oops!', 'Try again', 'You lost', 'A bad try', 'It failed'])
      expect(line).toMatch(UNKIND);
    for (const line of [
      'Close',
      'Notes',
      'Another go',
      'Nothing',
      'Show me the next letter',
      'Hear the word',
      'Know it',
    ])
      expect(line).not.toMatch(UNKIND);
  });
});

describe('what the card says', () => {
  it('never says a try was wrong or a failure, for any word at any level', () => {
    for (const word of WORD_IDS)
      for (let level = 0; level <= MAX_LEVEL; level++)
        for (const firstEver of [false, true])
          for (const line of everyLine(word, level, firstEver)) expect(line, `${word} at ${level}`).not.toMatch(UNKIND);
  });

  it('never says it of a control, a key, a place or the stars either', () => {
    for (const label of Object.values(LABELS)) expect(label).not.toMatch(UNKIND);
    for (const state of ['on', 'off', 'lit'] as const satisfies readonly KeyState[])
      for (const letter of 'abcxyz') expect(keyLabel(letter, state)).not.toMatch(UNKIND);
    for (let i = 0; i < 4; i++) for (const letter of [null, 'f']) expect(slotLabel(i, 4, letter)).not.toMatch(UNKIND);
    for (let stars = 0; stars <= 5; stars++) expect(starsLabel(stars)).not.toMatch(UNKIND);
    expect(HELP_ANNOUNCEMENT).not.toMatch(UNKIND);
  });

  it('does not write the word where the rung asks the player to remember it, because then it would be the answer', () => {
    for (const word of WORD_IDS) {
      for (const level of [2, 3, 4, 5]) {
        const s = begin(word, level, random);
        for (const line of [caption(s, false), caption(s, true), dialogLabel(s)])
          expect(line.toLowerCase(), `${word} at ${level}`).not.toContain(word);
      }
    }
  });

  it('does write the word where the rung copies it, so the card says what to spell', () => {
    for (const level of [0, 1]) {
      const s = begin('frog', level, random);
      expect(caption(s, false)).toBe('Spell frog.');
      expect(dialogLabel(s)).toBe('Spell frog');
    }
    expect(caption(begin('frog', 0, random), true)).toBe('Spell frog. Press the shining letters.');
    expect(caption(begin('frog', 3, random), true)).toBe('Can you spell it?');
  });

  it('tells a screen reader the letter and how far the player has got, and nothing when the word is done, because the praise says that', () => {
    let s = begin('frog', 3, random);
    const first = press(s, 'f');
    expect(announce(first.outcome, first.spelling)).toBe('F. 1 of 4.');
    s = first.spelling;
    const second = press(s, 'r');
    expect(announce(second.outcome, second.spelling)).toBe('R. 2 of 4.');
    const last = press(press(second.spelling, 'o').spelling, 'g');
    expect(announce(last.outcome, last.spelling)).toBe('');
  });

  it('tells a screen reader that another key is worth a go, that help has come, and that a faded key is resting', () => {
    const s = begin('frog', 3, random);
    const one = press(s, 'z');
    expect(announce(one.outcome, one.spelling)).toBe('Have another go.');
    const two = press(one.spelling, 'x');
    expect(announce(two.outcome, two.spelling)).toBe('Have another go. A key is shining to help.');
    const faded = press(begin('frog', 0, random), 'z');
    expect(announce(faded.outcome, faded.spelling)).toBe('That letter is resting.');
    expect(announce({ kind: 'ignored' }, s)).toBe('');
  });

  it('names a key with how it looks, and a place with what is in it', () => {
    expect(keyLabel('f', 'on')).toBe('F');
    expect(keyLabel('f', 'lit')).toBe('F, shining');
    expect(keyLabel('f', 'off')).toBe('F, resting');
    expect(slotLabel(0, 4, 'f')).toBe('Letter 1 of 4: F');
    expect(slotLabel(3, 4, null)).toBe('Letter 4 of 4: empty');
    expect(starsLabel(2)).toBe('2 of 5 stars');
  });
});

describe('the longest things the card says', () => {
  it('are short enough to read at a glance', () => {
    for (const word of WORD_IDS)
      for (let level = 0; level <= MAX_LEVEL; level++)
        for (const line of everyLine(word, level, true)) expect(line.length, line).toBeLessThanOrEqual(60);
  });
});
