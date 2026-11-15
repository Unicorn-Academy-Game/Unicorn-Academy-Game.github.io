import { describe, expect, it } from 'vitest';
import { Budget, type Held } from '../../src/audio/synth/budget';

interface Sound extends Held {
  readonly name: string;
}

interface Kind {
  vital?: boolean;
  loud?: number;
  end?: number;
}

/**
 * A sound of `cost` nodes that begins at `at` and, unless it says otherwise, is loud as can be, one
 * second long, and need not be heard.
 */
const sound = (
  name: string,
  cost: number,
  at: number,
  { vital = false, loud = 1, end = at + 1 }: Kind = {},
): Sound => ({ name, cost, at, loud, vital, end });
const names = (sounds: Sound[] | null): string[] | null => (sounds ? sounds.map((s) => s.name) : null);

const filled = (limit: number, ...sounds: Sound[]): Budget<Sound> => {
  const budget = new Budget<Sound>(limit);
  for (const s of sounds) budget.add(s);
  return budget;
};

describe('the budget of nodes a synth may keep sounding', () => {
  it('counts the sounds it holds and the nodes they are made of, and lets go of a sound once however often it is asked', () => {
    const a = sound('a', 10, 0);
    const b = sound('b', 25, 1);
    const budget = filled(100, a, b);
    expect([budget.count, budget.cost]).toEqual([2, 35]);
    budget.remove(a);
    budget.remove(a);
    expect([budget.count, budget.cost]).toEqual([1, 25]);
    budget.clear();
    expect([budget.count, budget.cost]).toEqual([0, 0]);
  });

  it('needs nobody to go while the new sound fits', () => {
    expect(names(filled(30, sound('a', 10, 0), sound('b', 10, 1)).room(10, false, 0))).toEqual([]);
    expect(names(new Budget<Sound>(30).room(30, false, 0))).toEqual([]);
  });

  it('lets go first of the sound with least left to go, and not of the one that was added first', () => {
    const budget = filled(
      30,
      sound('long', 10, 0, { end: 3 }),
      sound('short', 10, 0, { end: 1 }),
      sound('middle', 10, 0, { end: 2 }),
    );
    expect(names(budget.room(5, false, 0))).toEqual(['short']);
  });

  it('counts what is left from now, and not from when a sound began', () => {
    // At 9 seconds the first has had nine seconds of its ten and one is left. The second began
    // later and has two to go.
    const budget = filled(20, sound('old', 10, 0, { end: 10 }), sound('new', 10, 8, { end: 11 }));
    expect(names(budget.room(5, false, 9))).toEqual(['old']);
    expect(names(budget.room(5, false, 0))).toEqual(['new']);
  });

  it('lets a quiet sound go before a loud one that has as long to go', () => {
    const budget = filled(20, sound('loud', 10, 0), sound('quiet', 10, 0, { loud: 0.2 }));
    expect(names(budget.room(5, false, 0))).toEqual(['quiet']);
  });

  it('lets a sound made of many nodes go before a small one that has as much to say', () => {
    const budget = filled(50, sound('small', 10, 0), sound('big', 40, 0));
    expect(names(budget.room(5, false, 0))).toEqual(['big']);
  });

  it('keeps for last a sound that has not begun, because all of it is left', () => {
    const budget = filled(20, sound('ahead', 10, 5, { end: 6 }), sound('now', 10, 0, { end: 0.5 }));
    expect(names(budget.room(5, false, 0))).toEqual(['now']);
    expect(names(budget.room(15, false, 0))).toEqual(['now', 'ahead']);
  });

  it('lets go of as many as the new sound needs, and no more', () => {
    const budget = filled(
      30,
      sound('a', 10, 0, { end: 1 }),
      sound('b', 10, 0, { end: 2 }),
      sound('c', 10, 0, { end: 3 }),
    );
    expect(names(budget.room(5, false, 0))).toEqual(['a']);
    expect(names(budget.room(12, false, 0))).toEqual(['a', 'b']);
    expect(names(budget.room(30, false, 0))).toEqual(['a', 'b', 'c']);
  });

  it('gives a sound that is bigger than the whole budget the whole of it, and not less', () => {
    expect(names(new Budget<Sound>(30).room(50, false, 0))).toEqual([]);
    expect(names(filled(30, sound('a', 10, 0), sound('b', 10, 1)).room(50, false, 0))).toEqual(['a', 'b']);
  });

  it('lets a sound go for another that is bigger, which is as many as there is room for', () => {
    const budget = filled(60, sound('small', 10, 0, { end: 1 }), sound('big', 50, 0, { end: 6 }));
    expect(names(budget.room(40, false, 0))).toEqual(['small', 'big']);
    expect(names(budget.room(5, false, 0))).toEqual(['small']);
  });

  it('never lets go of a sound that must be heard for one that need not be, and then lets none go', () => {
    const budget = filled(30, sound('star', 20, 0, { vital: true, end: 0.1 }), sound('tap', 10, 0, { end: 5 }));
    expect(names(budget.room(10, false, 0))).toEqual(['tap']);
    expect(names(budget.room(15, false, 0))).toBeNull();
    expect(budget.count).toBe(2);
  });

  it('lets a sound that must be heard take the place of one that must be, after every one that need not be', () => {
    const budget = filled(
      30,
      sound('first star', 10, 0, { vital: true, end: 1 }),
      sound('tap', 10, 0, { end: 9 }),
      sound('second star', 10, 0, { vital: true, end: 2 }),
    );
    expect(names(budget.room(10, true, 0))).toEqual(['tap']);
    expect(names(budget.room(20, true, 0))).toEqual(['tap', 'first star']);
    expect(names(budget.room(30, true, 0))).toEqual(['tap', 'first star', 'second star']);
  });

  it('turns a sound away before it is built only when what must be heard fills the whole of it', () => {
    const budget = filled(30, sound('a', 20, 0, { vital: true }), sound('b', 5, 1));
    expect(budget.open(false)).toBe(true);
    expect(budget.open(true)).toBe(true);
    budget.add(sound('c', 10, 2, { vital: true }));
    expect(budget.open(false)).toBe(false);
    expect(budget.open(true)).toBe(true);
  });

  it('has room again for sounds that need not be heard once the ones that must be heard have gone', () => {
    const star = sound('star', 30, 0, { vital: true });
    const budget = filled(30, star);
    expect(budget.open(false)).toBe(false);
    budget.remove(star);
    expect(budget.open(false)).toBe(true);
    budget.add(star);
    expect(budget.open(false)).toBe(false);
    budget.clear();
    expect(budget.open(false)).toBe(true);
  });

  it('says which sounds the clock has ended, a while after they should have, and not before', () => {
    const budget = filled(100, sound('a', 10, 0), sound('b', 10, 4));
    expect(names(budget.ended(1.4, 0.5))).toEqual([]);
    expect(names(budget.ended(1.6, 0.5))).toEqual(['a']);
    expect(names(budget.ended(20, 0.5))).toEqual(['a', 'b']);
  });

  it('finds a sound that was cut short, as one that made way is, by the clock sooner', () => {
    const cut = sound('cut', 10, 0);
    const budget = filled(100, cut);
    cut.end = 0.05;
    expect(names(budget.ended(0.6, 0.5))).toEqual(['cut']);
  });
});
