import { describe, expect, it } from 'vitest';
import {
  ALPHABET,
  asLetter,
  attemptOf,
  bankFor,
  begin,
  DECOYS,
  HELP_AFTER,
  help,
  isClean,
  isDone,
  keysFor,
  LAYOUTS,
  litKey,
  nextLetter,
  press,
  type Spelling,
} from '../../src/learning';
import { KEYBOARD_LAYOUTS, MAX_LEVEL } from '../../src/shared/learning';
import { ALL_WORDS, seeded } from './helpers';

const random = seeded(11);

/** Presses each key in turn and returns where that left the spelling. */
const typed = (start: Spelling, keys: string): Spelling => [...keys].reduce((s, key) => press(s, key).spelling, start);

describe('the keyboard', () => {
  it('has every letter once, in both layouts, and ABC is in the order of the alphabet', () => {
    for (const layout of KEYBOARD_LAYOUTS) expect([...LAYOUTS[layout].join('')].sort().join('')).toBe(ALPHABET);
    expect(LAYOUTS.abc.join('')).toBe(ALPHABET);
    expect(LAYOUTS.qwerty[0]).toBe('qwertyuiop');
  });

  it('knows a letter from a key press, whatever its case, and nothing else', () => {
    expect(asLetter('F')).toBe('f');
    expect(asLetter('f')).toBe('f');
    for (const other of ['', '1', ' ', 'Enter', 'ab', 'é', 'Backspace', '-']) expect(asLetter(other), other).toBeNull();
  });
});

describe('the keys that work', () => {
  it('are only the letters of the word where the keys are lit for the player', () => {
    expect([...keysFor('word', 'frog', random)].sort().join('')).toBe('fgor');
  });

  it('are the letters of the word and four others in the bank', () => {
    for (let seed = 0; seed < 200; seed++) {
      const bank = bankFor('frog', seeded(seed));
      expect(bank.size).toBe(new Set('frog').size + DECOYS);
      for (const letter of 'frog') expect(bank.has(letter)).toBe(true);
    }
  });

  it('never include the mirror twin of a letter in the word, so a child who mixes up b and d is not made to tell them apart by a decoy', () => {
    // m, u and d have the twins w, n and b. p has q.
    for (const [word, twins] of [
      ['mud', 'wnb'],
      ['pig', 'q'],
      ['bat', 'd'],
      ['new', 'um'],
    ] as const) {
      const decoys = new Set<string>();
      for (let seed = 0; seed < 400; seed++)
        for (const letter of bankFor(word, seeded(seed))) if (!word.includes(letter)) decoys.add(letter);
      for (const twin of twins)
        if (!word.includes(twin)) expect(decoys.has(twin), `${twin} beside ${word}`).toBe(false);
      // Chance does reach the other letters, so the bank is not just always the same four.
      expect(decoys.size).toBeGreaterThan(8);
    }
  });

  it('are the same bank for the same chance, so a card does not shuffle itself', () => {
    expect([...bankFor('apple', seeded(5))].sort()).toEqual([...bankFor('apple', seeded(5))].sort());
  });

  it('still fit when the word uses most of the alphabet', () => {
    const bank = bankFor('abcdefghijklmnopqrstuvwxy', seeded(1));
    expect(bank.size).toBeGreaterThanOrEqual(25);
    expect(bank.size).toBeLessThanOrEqual(26);
  });

  it('are every letter at the rungs that ask the player to remember', () => {
    expect(keysFor('all', 'frog', random).size).toBe(26);
  });
});

describe('spelling a word', () => {
  it('puts each right letter in its place, and says when the word is done', () => {
    let s = begin('frog', 0, random);
    const outcomes = [...'frog'].map((key) => {
      const moved = press(s, key);
      s = moved.spelling;
      return moved.outcome;
    });
    expect(outcomes).toEqual([
      { kind: 'right', letter: 'f', index: 0, done: false },
      { kind: 'right', letter: 'r', index: 1, done: false },
      { kind: 'right', letter: 'o', index: 2, done: false },
      { kind: 'right', letter: 'g', index: 3, done: true },
    ]);
    expect(isDone(s)).toBe(true);
    expect(litKey(s)).toBeNull();
    expect(nextLetter(s)).toBeNull();
    expect(attemptOf(s)).toEqual({ slips: 0, hints: 0 });
  });

  it('takes capital letters from a physical keyboard as the same letters', () => {
    expect(isDone(typed(begin('frog', 0, random), 'FROG'))).toBe(true);
  });

  it('never places a wrong letter, so the word the player sees is right so far, whatever they press', () => {
    for (const word of ALL_WORDS) {
      for (let level = 0; level <= MAX_LEVEL; level++) {
        let s = begin(word, level, seeded(level));
        const keys = seeded(level * 31 + word.length);
        for (let i = 0; i < 80; i++) {
          s = press(s, ALPHABET[Math.floor(keys() * 26)]!).spelling;
          expect(word.startsWith(s.letters.slice(0, s.placed).join('')), `${word} at ${level}`).toBe(true);
        }
      }
    }
  });

  it('counts a wrong key as one slip, and a hammered key as one', () => {
    let s = begin('frog', 3, random);
    s = typed(s, 'z');
    expect(s.slips).toBe(1);
    s = typed(s, 'zzz');
    expect(s.slips).toBe(1);
    s = typed(s, 'x');
    expect(s.slips).toBe(2);
    s = typed(s, 'f');
    expect(s.placed).toBe(1);
    s = typed(s, 'x');
    expect(s.slips).toBe(3);
  });

  it('ignores what is not a letter, and everything once the word is done', () => {
    const s = begin('bee', 0, random);
    for (const key of ['1', ' ', 'Enter', 'Escape', '']) {
      const moved = press(s, key);
      expect(moved.outcome).toEqual({ kind: 'ignored' });
      expect(moved.spelling).toBe(s);
    }
    const done = typed(s, 'bee');
    expect(press(done, 'z').outcome).toEqual({ kind: 'ignored' });
    expect(press(done, 'z').spelling).toBe(done);
  });

  it('does nothing when a key is faded, because the rung does not use it, and counts nothing against the player', () => {
    for (const word of ALL_WORDS) {
      for (let level = 0; level <= MAX_LEVEL; level++) {
        const s = begin(word, level, seeded(level + 7));
        for (const letter of ALPHABET) {
          if (s.keys.has(letter)) continue;
          const moved = press(s, letter.toUpperCase());
          expect(moved.outcome, `${letter} in ${word} at ${level}`).toEqual({ kind: 'faded', letter });
          expect(moved.spelling).toBe(s);
        }
      }
    }
  });

  it('fades keys at the rungs that give fewer, and none at the rungs that give them all', () => {
    expect(begin('frog', 0, random).keys.size).toBe(4);
    expect(begin('frog', 1, random).keys.size).toBe(4 + DECOYS);
    for (const level of [2, 3, 4, 5]) expect(begin('frog', level, random).keys.size).toBe(26);
  });

  it('never lets pressing faded keys over and over start the glow or cost a slip, and the keys that work still do', () => {
    let s = begin('frog', 1, seeded(2));
    const faded = [...ALPHABET].filter((letter) => !s.keys.has(letter));
    expect(faded.length).toBe(26 - 4 - DECOYS);
    for (let i = 0; i < 40; i++) s = press(s, faded[i % faded.length]!).spelling;
    expect(s).toEqual(begin('frog', 1, seeded(2)));
    expect(litKey(s)).toBeNull();
    s = typed(s, 'f');
    expect(s.placed).toBe(1);
  });

  it('does not change the spelling it is given', () => {
    const s = begin('frog', 1, random);
    const copy = { ...s };
    press(s, 'f');
    press(s, 'q');
    help(s);
    expect(s).toEqual(copy);
  });
});

describe('the rungs of help', () => {
  it('lights the key the player needs on the rung that copies, whatever the player does, and does not count it as help', () => {
    let s = begin('frog', 0, random);
    expect(litKey(s)).toBe('f');
    s = typed(s, 'zzzz');
    expect(litKey(s)).toBe('f');
    expect(s.hints).toBe(0);
    s = typed(s, 'f');
    expect(litKey(s)).toBe('r');
  });

  it('lights nothing at first on the rungs that follow, and the key the player needs begins to glow after two wrong presses on a letter', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      let s = begin('frog', level, random);
      const first = s.placed;
      const letter = nextLetter(s)!;
      expect(litKey(s)).toBeNull();
      const wrong = ALPHABET.split('').filter((l) => l !== letter && s.keys.has(l));
      const one = press(s, wrong[0]!);
      expect(one.outcome).toEqual({ kind: 'wrong', letter: wrong[0], lit: false });
      expect(litKey(one.spelling)).toBeNull();
      const two = press(one.spelling, wrong[1]!);
      expect(two.outcome).toEqual({ kind: 'wrong', letter: wrong[1], lit: true });
      expect(HELP_AFTER).toBe(2);
      expect(litKey(two.spelling)).toBe(letter);
      expect(two.spelling.hints).toBe(1);
      // It was needed once for this letter, and a third miss does not count again.
      expect(press(two.spelling, wrong[2]!).spelling.hints).toBe(1);
      s = press(two.spelling, letter).spelling;
      expect(s.placed).toBe(first + 1);
      expect(litKey(s)).toBeNull();
      expect(s.hints).toBe(1);
    }
  });

  it('counts help for each letter that needed it', () => {
    let s = begin('frog', 3, random);
    s = typed(s, 'zz');
    s = typed(s, 'f');
    s = typed(s, 'xx');
    s = typed(s, 'r');
    expect(s.hints).toBe(2);
    expect(isClean('spell', s.level, attemptOf(s))).toBe(false);
  });

  it('gives the first letter on the rung that hides the rest', () => {
    const peek = begin('frog', 2, random);
    expect(peek.placed).toBe(1);
    expect(peek.rung.id).toBe('peek');
    expect(nextLetter(peek)).toBe('r');
    expect(isDone(typed(peek, 'rog'))).toBe(true);
    expect(begin('frog', 3, random).placed).toBe(0);
    expect(begin('frog', 0, random).placed).toBe(0);
  });

  it('lights the key when the player asks for help, once for each letter, and not at all where it is lit already or the word is done', () => {
    let s = begin('frog', 3, random);
    s = help(s);
    expect(litKey(s)).toBe('f');
    expect(s.hints).toBe(1);
    expect(help(s)).toBe(s);
    s = typed(s, 'f');
    expect(litKey(s)).toBeNull();
    s = help(s);
    expect(s.hints).toBe(2);
    const copy = begin('frog', 0, random);
    expect(help(copy)).toBe(copy);
    const done = typed(begin('bee', 2, random), 'ee');
    expect(help(done)).toBe(done);
  });
});

describe('every word can be finished by anyone', () => {
  it('using only the keys that are in play, at every level, cleanly and without help', () => {
    for (const word of ALL_WORDS) {
      for (let level = 0; level <= MAX_LEVEL; level++) {
        let s = begin(word, level, seeded(level + 100));
        for (const letter of word.slice(s.placed)) {
          expect(s.keys.has(letter), `${word} at level ${level} needs ${letter}`).toBe(true);
          s = press(s, letter).spelling;
        }
        expect(isDone(s), `${word} at level ${level}`).toBe(true);
        expect(isClean('spell', level, attemptOf(s))).toBe(true);
      }
    }
  });

  it('even a child who only ever follows the glow gets there, on the rung that copies', () => {
    for (const word of ALL_WORDS) {
      let s = begin(word, 0, random);
      let presses = 0;
      while (!isDone(s)) {
        const lit = litKey(s);
        expect(lit).not.toBeNull();
        s = press(s, lit!).spelling;
        presses += 1;
      }
      expect(presses).toBe(word.length);
    }
  });

  it('and a child who guesses until the key glows is never stuck either, on any rung', () => {
    for (const word of ALL_WORDS) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        let s = begin(word, level, seeded(3));
        let guard = 0;
        while (!isDone(s) && guard++ < 400) {
          const lit = litKey(s);
          const wrong = [...s.keys].find((key) => key !== nextLetter(s));
          s = press(s, lit ?? wrong ?? nextLetter(s)!).spelling;
        }
        expect(isDone(s), `${word} at ${level}`).toBe(true);
      }
    }
  });
});
