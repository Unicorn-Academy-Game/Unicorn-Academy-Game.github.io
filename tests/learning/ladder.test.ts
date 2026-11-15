import { describe, expect, it } from 'vitest';
import {
  isClean,
  isDue,
  LEVELS,
  learn,
  levelOf,
  RUNGS,
  type RungId,
  rungAt,
  STARS_PER_WORD,
  START_LEVEL,
  starsOf,
} from '../../src/learning';
import { COUNT_MAX, MAX_LEVEL, Progress, START_HELP } from '../../src/shared/learning';
import { CLEAN, DAY, HOUR, MINUTE, progress, seeded, T0 } from './helpers';

const RUNG_ORDER: RungId[] = ['copy', 'follow', 'peek', 'recall'];

describe('the ladder', () => {
  it('has a level for every number from zero to the top, and each level uses a rung that exists', () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL + 1);
    for (const level of LEVELS) expect(RUNGS[level.rung]).toBeDefined();
  });

  it('only ever takes help away as a word is learned, and asks again later and later', () => {
    const rungs = LEVELS.map((l) => RUNG_ORDER.indexOf(l.rung));
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
    const waits = LEVELS.map((l) => l.due);
    expect(waits).toEqual([...waits].sort((a, b) => a - b));
    expect(waits[0]).toBe(0);
    for (const level of LEVELS) expect(level.needs).toBeGreaterThanOrEqual(1);
  });

  it('gives a word the player has never seen the most help, and a parent can start them higher', () => {
    expect(rungAt(START_LEVEL.full).id).toBe('copy');
    expect(rungAt(START_LEVEL.some).id).toBe('follow');
    expect(rungAt(START_LEVEL.little).id).toBe('peek');
    for (const help of START_HELP) expect(START_LEVEL[help]).toBeLessThanOrEqual(MAX_LEVEL);
  });

  it('reads a level from somewhere else as the nearest one that exists', () => {
    expect(levelOf(-3)).toBe(LEVELS[0]);
    expect(levelOf(99)).toBe(LEVELS[MAX_LEVEL]);
    expect(levelOf(2.9)).toBe(LEVELS[2]);
    expect(levelOf(Number.NaN)).toBe(LEVELS[0]);
  });
});

describe('what counts as a clean spell', () => {
  it('forgives the slips of a small finger, a few more where the keys are lit for the player, and never help', () => {
    expect(isClean('spell', 0, { slips: 2, hints: 0 })).toBe(true);
    expect(isClean('spell', 0, { slips: 3, hints: 0 })).toBe(false);
    expect(isClean('spell', 1, { slips: 1, hints: 0 })).toBe(true);
    expect(isClean('spell', 1, { slips: 2, hints: 0 })).toBe(false);
    expect(isClean('spell', 4, { slips: 1, hints: 0 })).toBe(true);
    for (let level = 0; level <= MAX_LEVEL; level++)
      expect(isClean('spell', level, { slips: 0, hints: 1 })).toBe(false);
  });
});

describe('what a spell does to a word', () => {
  it('moves a word the player has never spelled up from just met after one clean spell, and asks again in ten minutes', () => {
    const after = learn('spell', undefined, CLEAN, T0, 0);
    expect(after).toMatchObject({
      level: 1,
      best: 1,
      streak: 0,
      struggles: 0,
      due: T0 + 10 * MINUTE,
      done: 1,
      clean: 1,
      slips: 0,
      first: T0,
      last: T0,
    });
  });

  it('needs two clean spells in a row at learning, and one that went badly in between starts the count again', () => {
    let p = learn('spell', undefined, CLEAN, T0, 0);
    p = learn('spell', p, CLEAN, T0 + 11 * MINUTE, 0);
    expect(p).toMatchObject({ level: 1, streak: 1 });
    p = learn('spell', p, { slips: 0, hints: 1 }, T0 + 22 * MINUTE, 0);
    expect(p).toMatchObject({ level: 1, streak: 0, struggles: 1 });
    p = learn('spell', p, CLEAN, T0 + 33 * MINUTE, 0);
    expect(p).toMatchObject({ level: 1, streak: 1, struggles: 0 });
    p = learn('spell', p, CLEAN, T0 + 44 * MINUTE, 0);
    expect(p).toMatchObject({ level: 2, streak: 0, due: T0 + 44 * MINUTE + HOUR });
  });

  it('holds a word after one struggle and moves it down after two in a row, but never below the start', () => {
    let p = progress({ level: 3, best: 3 });
    p = learn('spell', p, { slips: 4, hints: 0 }, T0, 0);
    expect(p).toMatchObject({ level: 3, struggles: 1, streak: 0 });
    p = learn('spell', p, { slips: 0, hints: 2 }, T0, 0);
    expect(p).toMatchObject({ level: 2, struggles: 0 });
    let bottom = progress({ level: 0 });
    for (let i = 0; i < 6; i++) bottom = learn('spell', bottom, { slips: 9, hints: 3 }, T0, 0);
    expect(bottom).toMatchObject({ level: 0, done: 7 });
    expect(bottom.struggles).toBeLessThan(2);
  });

  it('asks again soon for a word that went badly, and later for one that is better known', () => {
    const due = (level: number, attempt = CLEAN) =>
      learn('spell', progress({ level, best: level }), attempt, T0, 0).due - T0;
    expect(due(0, { slips: 9, hints: 0 })).toBe(0);
    expect(due(1)).toBe(LEVELS[1]!.due);
    expect(due(2)).toBe(LEVELS[2]!.due);
    expect(due(3)).toBe(LEVELS[4]!.due);
    expect(due(4)).toBe(LEVELS[MAX_LEVEL]!.due);
    expect(due(MAX_LEVEL)).toBe(14 * DAY);
  });

  it('stays at the top and keeps counting, with a streak that cannot run away', () => {
    let p = progress({ level: MAX_LEVEL, best: MAX_LEVEL });
    for (let i = 0; i < 300; i++) p = learn('spell', p, CLEAN, T0 + i * DAY, 0);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.streak).toBeLessThanOrEqual(100);
    expect(p.done).toBe(301);
    expect(() => Progress.parse(p)).not.toThrow();
  });

  it('stops counting where the store stops, so a record is never one that cannot be read back', () => {
    const full = learn(
      'spell',
      progress({ done: COUNT_MAX, clean: COUNT_MAX, slips: COUNT_MAX - 1 }),
      { slips: 9, hints: 0 },
      T0,
      0,
    );
    expect(full).toMatchObject({ done: COUNT_MAX, clean: COUNT_MAX, slips: COUNT_MAX });
    expect(() => Progress.parse(full)).not.toThrow();
  });

  it('starts a new word where a parent chose, and ignores that for a word the player already has', () => {
    expect(learn('spell', undefined, CLEAN, T0, START_LEVEL.little)).toMatchObject({ level: 2, streak: 1, best: 2 });
    expect(learn('spell', undefined, CLEAN, T0, 99).level).toBeLessThanOrEqual(MAX_LEVEL);
    expect(learn('spell', progress({ level: 1 }), CLEAN, T0, START_LEVEL.little)).toMatchObject({
      level: 1,
      streak: 1,
    });
  });

  it('counts the slips over every spell, so the tricky words can be found', () => {
    let p = learn('spell', undefined, { slips: 2, hints: 0 }, T0, 0);
    p = learn('spell', p, { slips: 1, hints: 0 }, T0, 0);
    expect(p.slips).toBe(3);
    expect(p.done).toBe(2);
  });

  it('never moves the last time back, even when the clock was set back', () => {
    const p = learn('spell', progress({ last: T0 + DAY }), CLEAN, T0, 0);
    expect(p.last).toBe(T0 + DAY);
    expect(p.first).toBe(T0);
  });

  it('does not change the record it is given', () => {
    const before = Object.freeze(progress({ level: 2 }));
    expect(() => learn('spell', before, CLEAN, T0, 0)).not.toThrow();
    expect(before.level).toBe(2);
  });

  it('takes a perfect child to the top in seven spells, spread over days', () => {
    let p = learn('spell', undefined, CLEAN, T0, 0);
    let now = T0;
    const spells = [p.level];
    while (p.level < MAX_LEVEL) {
      now = p.due;
      p = learn('spell', p, CLEAN, now, 0);
      spells.push(p.level);
    }
    expect(spells).toEqual([1, 1, 2, 2, 3, 4, 5]);
    expect(now - T0).toBe(10 * MINUTE + 10 * MINUTE + HOUR + HOUR + DAY + 3 * DAY);
  });
});

describe('when a word is due', () => {
  it('is due when the player has never spelled it, and when its time has come', () => {
    expect(isDue(undefined, T0)).toBe(true);
    expect(isDue(progress({ due: T0 + 1 }), T0)).toBe(false);
    expect(isDue(progress({ due: T0 }), T0)).toBe(true);
    expect(isDue(progress({ due: T0 - 1 }), T0)).toBe(true);
  });
});

describe('the stars', () => {
  it('are none for a word the player has not spelled, and all five the moment it is theirs, whatever level it is at', () => {
    expect(STARS_PER_WORD).toBe(5);
    expect(starsOf(undefined)).toBe(0);
    expect(starsOf(progress({ done: 0 }))).toBe(0);
    for (let best = 0; best <= MAX_LEVEL; best++) expect(starsOf(progress({ best }))).toBe(STARS_PER_WORD);
  });

  it('are never taken away when a word slips back down the ladder', () => {
    let p = progress({ level: 5, best: 5 });
    let stars = starsOf(p);
    for (let i = 0; i < 12; i++) {
      p = learn('spell', p, { slips: 9, hints: 2 }, T0 + i, 0);
      expect(starsOf(p)).toBeGreaterThanOrEqual(stars);
      stars = starsOf(p);
    }
    expect(p.level).toBeLessThan(MAX_LEVEL);
    expect(p.best).toBe(MAX_LEVEL);
    expect(starsOf(p)).toBe(STARS_PER_WORD);
  });
});

describe('whatever happens, a record stays one the store will accept', () => {
  it('holds for thousands of spells with every mix of slips and help', () => {
    const random = seeded(7);
    let p: ReturnType<typeof learn> | undefined;
    let now = T0;
    for (let i = 0; i < 5000; i++) {
      now += Math.floor(random() * 3 * DAY);
      p = learn(
        'spell',
        p,
        { slips: Math.floor(random() * 5), hints: random() < 0.25 ? 1 : 0 },
        now,
        Math.floor(random() * 3),
      );
      expect(() => Progress.parse(p)).not.toThrow();
      expect(p.best).toBeGreaterThanOrEqual(p.level);
      expect(p.clean).toBeLessThanOrEqual(p.done);
      expect(p.done).toBe(i + 1);
    }
  });
});
