import { describe, expect, it } from 'vitest';
import { isClean } from '../../../src/learning';
import {
  approve,
  askAgain,
  attemptOf,
  begin,
  glowing,
  HELP_AFTER,
  hear,
  help,
  isDone,
  type Reading,
  show,
  touch,
} from '../../../src/learning/reading/item';
import { seeded } from '../helpers';

/** Touches each of the first `count` tiles in order. */
const through = (start: Reading, count: number): Reading => {
  let r = start;
  for (let at = 0; at < count; at++) r = touch(r, at).reading;
  return r;
};

/** A word of three tiles that has been touched through, at a level. */
const joined = (level: number, kind: 'word' | 'line' = 'word'): Reading => through(begin(kind, 3, level), 3);

describe('one word or sentence being read', () => {
  it('starts with nothing touched and nothing counted', () => {
    const r = begin('word', 3, 0);
    expect(r).toMatchObject({
      phase: 'touching',
      next: 0,
      slips: 0,
      hints: 0,
      misses: 0,
      asked: 0,
      ending: null,
      heard: false,
      units: 3,
    });
    expect(isDone(r)).toBe(false);
  });

  it('refuses a thing that has nothing to touch, which is a mistake in the game', () => {
    for (const units of [0, -1, 1.5, Number.NaN])
      expect(() => begin('word', units, 0), String(units)).toThrow(RangeError);
  });

  it('goes through the tiles in order, and the last one joins them', () => {
    let r = begin('word', 3, 1);
    const first = touch(r, 0);
    expect([first.result, first.reading.next, first.reading.phase]).toEqual(['right', 1, 'touching']);
    r = touch(first.reading, 1).reading;
    const last = touch(r, 2);
    expect([last.result, last.reading.next, last.reading.phase]).toEqual(['last', 3, 'saying']);
  });

  it('is one touch for a word of one tile, which is then at once ready to be said', () => {
    const only = touch(begin('word', 1, 1), 0);
    expect([only.result, only.reading.phase]).toEqual(['last', 'saying']);
  });

  it('bounces a touch out of order, which costs a slip and moves nothing', () => {
    const r = begin('word', 3, 1);
    const wrong = touch(r, 2);
    expect(wrong.result).toBe('slip');
    expect(wrong.reading).toMatchObject({ next: 0, slips: 1, misses: 1, lastSlip: 2, phase: 'touching' });
    expect(r.slips).toBe(0);
  });

  it('plays a tile the player touched already again, and that costs nothing', () => {
    const r = through(begin('word', 3, 1), 2);
    const again = touch(r, 0);
    expect(again.result).toBe('again');
    expect(again.reading).toEqual(r);
  });

  it('counts a hammered tile once, a different wrong tile as another slip, and starts again after a right touch', () => {
    let r = begin('word', 4, 1);
    r = touch(r, 3).reading;
    r = touch(r, 3).reading;
    expect(r.slips).toBe(1);
    r = touch(r, 2).reading;
    expect(r.slips).toBe(2);
    r = touch(r, 0).reading;
    expect(r.lastSlip).toBeNull();
    r = touch(r, 3).reading;
    expect(r.slips).toBe(3);
  });

  it('ignores a touch that is not on anything, or one that comes when the touching is over', () => {
    const r = begin('word', 3, 1);
    for (const at of [-1, 3, 1.5, Number.NaN])
      expect(touch(r, at), String(at)).toEqual({ reading: r, result: 'ignored' });
    const joinedAlready = joined(1);
    expect(touch(joinedAlready, 0)).toEqual({ reading: joinedAlready, result: 'ignored' });
  });

  describe('the tile that shines', () => {
    it('comes with a level that lights it, moves on with each right touch, and is not help', () => {
      let r = begin('word', 3, 0);
      expect(glowing(r)).toBe(0);
      r = touch(r, 0).reading;
      expect(glowing(r)).toBe(1);
      r = touch(r, 2).reading;
      r = touch(r, 2).reading;
      r = touch(r, 2).reading;
      r = touch(r, 2).reading;
      expect(r.hints, 'a level that lights the tile has nothing to add').toBe(0);
      expect(glowing(r)).toBe(1);
    });

    it('is not there at a level that does not light it, until the player has been missing for a while, and then it is help, once', () => {
      let r = begin('word', 3, 2);
      expect(glowing(r)).toBeNull();
      for (let miss = 1; miss < HELP_AFTER; miss++) {
        r = touch(r, 2).reading;
        expect(glowing(r), `after ${miss} misses`).toBeNull();
        expect(r.hints).toBe(0);
      }
      r = touch(r, 2).reading;
      expect(glowing(r)).toBe(0);
      expect(r.hints).toBe(1);
      r = touch(r, 1).reading;
      r = touch(r, 1).reading;
      expect(r.hints, 'a tile that is shining already is helped once').toBe(1);
      r = touch(r, 0).reading;
      expect(glowing(r), "the next tile is the player's to find again").toBeNull();
      expect(r.misses).toBe(0);
    });

    it('is shown when the player asks, at a level that does not light it, and asking twice for one tile counts once', () => {
      let r = begin('word', 3, 3);
      r = help(r);
      r = help(r);
      expect(glowing(r)).toBe(0);
      expect(r.hints).toBe(1);
      r = touch(r, 0).reading;
      expect(glowing(r)).toBeNull();
      r = help(r);
      expect(glowing(r)).toBe(1);
      expect(r.hints).toBe(2);
    });

    it('is not something to ask for at a level that lights it, once the touching is over, or when the item is done', () => {
      const lit = begin('word', 3, 0);
      expect(help(lit)).toBe(lit);
      const over = joined(2);
      expect(help(over)).toBe(over);
      expect(glowing(over)).toBeNull();
      const done = approve(over);
      expect(help(done)).toBe(done);
    });
  });

  describe('saying it out loud', () => {
    it('is said by the voice on its own when the tiles of a new word join, and never for a sentence', () => {
      expect(joined(0).heard).toBe(true);
      expect(joined(1).heard).toBe(false);
      expect(joined(0, 'line').heard).toBe(false);
    });

    it('lets the player hear a word again for nothing when the voice said it already, and counts it as help when it did not', () => {
      const said = hear(joined(0));
      expect(said.hints).toBe(0);
      const told = hear(joined(1));
      expect(told).toMatchObject({ heard: true, hints: 1 });
      expect(hear(told).hints, 'hearing it again is not more help').toBe(1);
      expect(hear(joined(0, 'line')).hints, 'a sentence read to the player is help').toBe(1);
    });

    it('counts a demonstration of a word as help every time, and has none for a sentence', () => {
      const shown = show(joined(0));
      expect(shown.hints).toBe(1);
      expect(show(shown).hints).toBe(2);
      const line = joined(2, 'line');
      expect(show(line)).toBe(line);
    });

    it('can be heard and shown only once the tiles have joined', () => {
      const r = begin('word', 3, 2);
      expect(hear(r)).toBe(r);
      expect(show(r)).toBe(r);
    });

    it("ends only with a yes, which is the player's reading it", () => {
      const early = begin('word', 3, 1);
      expect(approve(early)).toBe(early);
      const r = joined(1);
      expect(touch(r, 1).result).toBe('ignored');
      const done = approve(r);
      expect(done).toMatchObject({ phase: 'done', ending: 'read' });
      expect(isDone(done)).toBe(true);
      expect(approve(done)).toBe(done);
    });

    it('shows it once more when a grown-up asks, and tells it when the player asks twice, so that they are never held', () => {
      const once = askAgain(joined(2));
      expect(once).toMatchObject({ phase: 'saying', asked: 1, hints: 1, heard: true, ending: null });
      const twice = askAgain(once);
      expect(twice).toMatchObject({ phase: 'done', asked: 2, hints: 2, ending: 'told' });
      expect(askAgain(twice)).toBe(twice);
      expect(askAgain(begin('word', 3, 1)).asked, 'there is nothing to say again before it is said').toBe(0);
    });

    it('can still be approved after one more go', () => {
      expect(approve(askAgain(joined(2)))).toMatchObject({ phase: 'done', ending: 'read', hints: 1 });
    });
  });

  it('says what a read was in two numbers', () => {
    let r = begin('word', 3, 2);
    r = touch(r, 2).reading;
    r = help(r);
    expect(attemptOf(r)).toEqual({ slips: 1, hints: 1 });
  });

  it('is clean by what the level allows: a slip of a small finger is not a failure, help is', () => {
    expect(isClean('read', 0, { slips: 2, hints: 0 })).toBe(true);
    expect(isClean('read', 0, { slips: 3, hints: 0 })).toBe(false);
    expect(isClean('read', 1, { slips: 2, hints: 0 })).toBe(true);
    expect(isClean('read', 2, { slips: 1, hints: 0 })).toBe(true);
    expect(isClean('read', 2, { slips: 2, hints: 0 })).toBe(false);
    for (const level of [0, 1, 2, 3, 4, 5])
      expect(isClean('read', level, { slips: 0, hints: 1 }), `level ${level}`).toBe(false);
  });

  it('never misbehaves, whatever is touched and in whatever order', () => {
    const random = seeded(4242);
    for (let game = 0; game < 400; game++) {
      const kind = random() < 0.5 ? 'word' : 'line';
      const units = 1 + Math.floor(random() * 9);
      let r = begin(kind, units, Math.floor(random() * 6));
      const order = { touching: 0, saying: 1, done: 2 } as const;
      for (let step = 0; step < 80; step++) {
        const before = r;
        const pick = random();
        if (pick < 0.5) r = touch(r, Math.floor(random() * (units + 2)) - 1).reading;
        else if (pick < 0.62) r = help(r);
        else if (pick < 0.72) r = hear(r);
        else if (pick < 0.8) r = show(r);
        else if (pick < 0.9) r = approve(r);
        else r = askAgain(r);
        expect(order[r.phase], 'the phase never goes back').toBeGreaterThanOrEqual(order[before.phase]);
        expect(r.slips).toBeGreaterThanOrEqual(before.slips);
        expect(r.hints).toBeGreaterThanOrEqual(before.hints);
        expect(r.next).toBeGreaterThanOrEqual(before.next);
        expect(r.next).toBeLessThanOrEqual(units);
        expect(r.next === units, 'the touching is over exactly when every one is touched').toBe(r.phase !== 'touching');
        expect(r.ending !== null).toBe(r.phase === 'done');
        if (before.phase === 'done') expect(r).toBe(before);
        const lit = glowing(r);
        expect(lit === null || (lit >= 0 && lit < units)).toBe(true);
      }
    }
  });
});
