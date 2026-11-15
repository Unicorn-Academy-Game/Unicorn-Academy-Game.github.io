import { MAX_LEVEL, type Skill } from '../shared/learning';
import { LEVELS, readRungAt, rungAt } from './levels';

/**
 * What mastery asks of a word at one level, whatever the skill is: its name for a parent, how many
 * clean tries in a row move it up, how long until it is due again, and how many wrong tries still
 * count as clean. Each skill's own table says what the level looks like on the card, and this is
 * the part that `learn` reads, so a new skill is a new row here and nothing else in the arithmetic.
 * The type of the table makes a skill without a row a mistake the compiler reports.
 */
export interface Step {
  name: string;
  needs: number;
  due: number;
  allow: number;
}

const steps = (
  levels: readonly { name: string; needs: number; due: number }[],
  allow: (level: number) => number,
): readonly Step[] =>
  levels.map((level, at) => ({ name: level.name, needs: level.needs, due: level.due, allow: allow(at) }));

export const LADDERS: Readonly<Record<Skill, readonly Step[]>> = {
  spell: steps(LEVELS, (level) => rungAt(level).allow),
  // Reading has the same levels and the same waits. A try of reading is clean when it had no help
  // and few wrong touches, and how few, and how many clean ones climb a level, are rows of its own
  // table.
  read: LEVELS.map((level, at) => ({
    name: level.name,
    needs: readRungAt(at).needs,
    due: level.due,
    allow: readRungAt(at).allow,
  })),
};

/**
 * The step a number stands for. A level from somewhere else lands on the nearest one that exists.
 */
export const stepOf = (skill: Skill, level: number): Step =>
  LADDERS[skill][Math.min(MAX_LEVEL, Math.max(0, Math.trunc(Number.isFinite(level) ? level : 0)))]!;
