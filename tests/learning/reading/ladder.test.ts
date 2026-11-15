import { describe, expect, it } from 'vitest';
import { LADDERS, LEVELS, READ_RUNGS, readRungAt, stepOf } from '../../../src/learning';
import { MAX_LEVEL } from '../../../src/shared/learning';

describe('the help that reading gives at each level', () => {
  it('has a row for every level of the ladder', () => {
    expect(READ_RUNGS).toHaveLength(LEVELS.length);
    expect(READ_RUNGS).toHaveLength(MAX_LEVEL + 1);
  });

  it('lights the tile and says a word the player has just met, lights the tile the player is learning, and leaves everything after that to them', () => {
    expect(READ_RUNGS.map((rung) => rung.lights)).toEqual([true, true, false, false, false, false]);
    expect(READ_RUNGS.map((rung) => rung.says)).toEqual([true, false, false, false, false, false]);
  });

  it('forgives two wrong touches while the player is being helped, and one after, and climbs a level at every clean read', () => {
    expect(READ_RUNGS.map((rung) => rung.allow)).toEqual([2, 2, 1, 1, 1, 1]);
    expect(READ_RUNGS.every((rung) => rung.needs === 1)).toBe(true);
  });

  it('is the table that the read ladder is made from, with the names and the waits of the levels', () => {
    LEVELS.forEach((level, at) => {
      expect(LADDERS.read[at]).toEqual({
        name: level.name,
        needs: READ_RUNGS[at]!.needs,
        due: level.due,
        allow: READ_RUNGS[at]!.allow,
      });
      expect(stepOf('read', at)).toBe(LADDERS.read[at]);
    });
  });

  it('lands on the nearest level for a level from somewhere else', () => {
    expect(readRungAt(-3)).toBe(READ_RUNGS[0]);
    expect(readRungAt(99)).toBe(READ_RUNGS[MAX_LEVEL]);
    expect(readRungAt(2.9)).toBe(READ_RUNGS[2]);
    expect(readRungAt(Number.NaN)).toBe(READ_RUNGS[0]);
  });
});
