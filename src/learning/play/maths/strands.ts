import type { MathsLevel } from '../../../shared/play';
import type { Random } from '../random';
import { ARITHMETIC } from './arithmetic';
import type { StrandDef } from './ask';
import { COUNTING } from './counting';
import type { Question, StrandId } from './question';
import { STRAND_IDS } from './question';
import { SCHOOL } from './school';
import { SHAPE_STRANDS } from './shapes';

const ALL: readonly StrandDef[] = [...COUNTING, ...ARITHMETIC, ...SHAPE_STRANDS, ...SCHOOL];

/** Every kind of sum, in the order of the tiles. */
export const STRANDS: Readonly<Record<StrandId, StrandDef>> = Object.fromEntries(
  STRAND_IDS.map((id) => [id, ALL.find((def) => def.id === id)!]),
) as Record<StrandId, StrandDef>;

/** A question of this kind at this level. */
export const ask = (strand: StrandId, level: MathsLevel, random: Random): Question =>
  STRANDS[strand].ask(level, random);
