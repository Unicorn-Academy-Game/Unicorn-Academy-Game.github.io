import { describe, expect, it } from 'vitest';
import { FAMILIES, STRAND_IDS } from '../../../src/learning/play/maths/question';
import {
  begin,
  CLEAN_TO_LEVEL_UP,
  choose,
  familyReached,
  finished,
  hinted,
  levelAfter,
  levelOf,
  next,
  RESTS_TO_HINT,
  ROUND_LENGTH,
  type Round,
  starsFor,
  withRound,
} from '../../../src/learning/play/maths/round';
import { emptyPlay, type MathsLevel } from '../../../src/shared/play';
import { seeded } from '../helpers';

const wrongPlace = (round: Round, skip: readonly number[] = []): number =>
  round.question.choices.findIndex((_, i) => i !== round.question.answer && !skip.includes(i));

/**
 * Plays a round to its end, getting the first `clean` questions right at the first touch and
 * slipping on the others once.
 */
function playOut(strand: (typeof STRAND_IDS)[number], level: MathsLevel, clean: number, seed = 1): Round {
  const random = seeded(seed);
  let round = begin(strand, level, random);
  for (let i = 0; i < ROUND_LENGTH; i++) {
    if (i >= clean) round = choose(round, wrongPlace(round)).round;
    round = choose(round, round.question.answer).round;
    if (!finished(round)) round = next(round, random);
  }
  return round;
}

describe('a question of a round', () => {
  it('starts on the first of five, with nothing touched', () => {
    const round = begin('add', 2, seeded(3));
    expect(round).toMatchObject({ strand: 'add', level: 2, index: 0, rested: [], solved: false, clean: 0 });
    expect(round.asked).toHaveLength(1);
    expect(round.question.strand).toBe('add');
    expect(ROUND_LENGTH).toBe(5);
  });

  it('is solved by the right choice, and counts as clean when that was the first one touched', () => {
    const round = begin('count', 1, seeded(5));
    const done = choose(round, round.question.answer);
    expect(done.result).toBe('right');
    expect(done.round).toMatchObject({ solved: true, clean: 1, rested: [] });
  });

  it('lets a choice that is not right rest, says nothing more about it, and does not count the question as clean', () => {
    const round = begin('count', 2, seeded(5));
    const wrong = wrongPlace(round);
    const slipped = choose(round, wrong);
    expect(slipped.result).toBe('rest');
    expect(slipped.round.rested).toEqual([wrong]);
    expect(slipped.round.solved).toBe(false);
    const done = choose(slipped.round, round.question.answer);
    expect(done.result).toBe('right');
    expect(done.round.clean).toBe(0);
    expect(done.round.solved).toBe(true);
  });

  it('ignores a choice that already rested, one that is not there, and every touch once the question is solved', () => {
    const round = begin('more', 2, seeded(8));
    const wrong = wrongPlace(round);
    const slipped = choose(round, wrong).round;
    expect(choose(slipped, wrong)).toEqual({ round: slipped, result: 'ignored' });
    for (const at of [-1, 9, 1.5, Number.NaN]) expect(choose(round, at)).toEqual({ round, result: 'ignored' });
    const solved = choose(round, round.question.answer).round;
    expect(choose(solved, wrong)).toEqual({ round: solved, result: 'ignored' });
    expect(choose(solved, round.question.answer)).toEqual({ round: solved, result: 'ignored' });
  });

  it('lights the right choice after two have rested, and not before, and not once it is solved', () => {
    expect(RESTS_TO_HINT).toBe(2);
    let round = begin('tens', 3, seeded(2));
    expect(hinted(round)).toBe(false);
    round = choose(round, wrongPlace(round)).round;
    expect(hinted(round)).toBe(false);
    round = choose(round, wrongPlace(round, round.rested)).round;
    expect(hinted(round)).toBe(true);
    round = choose(round, round.question.answer).round;
    expect(hinted(round)).toBe(false);
  });
});

describe('going on', () => {
  it('waits for the right choice, then asks another thing of the same kind and level, with nothing rested', () => {
    const random = seeded(4);
    const round = begin('take', 1, random);
    expect(next(round, random)).toBe(round);
    const solved = choose(round, round.question.answer).round;
    const on = next(solved, random);
    expect(on).toMatchObject({ strand: 'take', level: 1, index: 1, rested: [], solved: false, clean: 1 });
    expect(on.asked).toHaveLength(2);
  });

  it('never asks the same question twice in a round, whatever the kind and level', () => {
    for (const strand of STRAND_IDS) {
      for (const level of [1, 2, 3] as const) {
        for (let seed = 1; seed <= 40; seed++) {
          const done = playOut(strand, level, ROUND_LENGTH, seed);
          expect(new Set(done.asked).size, `${strand} at level ${level} with seed ${seed}`).toBe(ROUND_LENGTH);
        }
      }
    }
  });

  it('stops going on at the last question, which finishes the round once it is solved', () => {
    const random = seeded(6);
    let round = begin('next', 2, random);
    for (let i = 0; i < ROUND_LENGTH - 1; i++) {
      expect(finished(round)).toBe(false);
      round = next(choose(round, round.question.answer).round, random);
    }
    expect(round.index).toBe(ROUND_LENGTH - 1);
    expect(finished(round)).toBe(false);
    const last = choose(round, round.question.answer).round;
    expect(finished(last)).toBe(true);
    expect(next(last, random)).toBe(last);
  });
});

describe('what a finished round earns', () => {
  it('is three stars for five clean, two for three or four, and one for fewer, so that a round finished is never nothing', () => {
    expect([5, 4, 3, 2, 1, 0].map(starsFor)).toEqual([3, 2, 2, 1, 1, 1]);
  });

  it('is the next level for four clean or more, never a lower level, and no level past the third', () => {
    expect(CLEAN_TO_LEVEL_UP).toBe(4);
    for (const level of [1, 2, 3] as const) {
      expect(levelAfter(level, 5)).toBe(Math.min(3, level + 1));
      expect(levelAfter(level, 4)).toBe(Math.min(3, level + 1));
      for (const clean of [3, 2, 1, 0]) expect(levelAfter(level, clean)).toBe(level);
    }
  });

  it('is written to the record: the round counted, the level kept, and the flawless rounds counted apart', () => {
    let play = emptyPlay();
    expect(levelOf(play, 'add')).toBe(1);
    play = withRound(play, 'add', 1, 5);
    expect(play.maths.played).toBe(1);
    expect(play.maths.strands.add).toEqual({ level: 2, rounds: 1, flawless: 1 });
    play = withRound(play, 'add', 2, 2);
    expect(play.maths.strands.add).toEqual({ level: 2, rounds: 2, flawless: 1 });
    play = withRound(play, 'take', 1, 4);
    expect(play.maths.played).toBe(3);
    expect(play.maths.strands.take).toEqual({ level: 2, rounds: 1, flawless: 0 });
    expect(levelOf(play, 'add')).toBe(2);
    expect(levelOf(play, 'count')).toBe(1);
  });

  it('never lowers a level the record has, even when a round is finished at a lower one', () => {
    const play = withRound(withRound(emptyPlay(), 'add', 1, 5), 'add', 2, 5);
    expect(levelOf(play, 'add')).toBe(3);
    expect(levelOf(withRound(play, 'add', 1, 0), 'add')).toBe(3);
  });

  it('is the same record a round played out from the start comes to', () => {
    const round = playOut('double', 2, 4);
    expect(round.clean).toBe(4);
    expect(levelOf(withRound(emptyPlay(), 'double', 2, round.clean), 'double')).toBe(3);
    expect(playOut('double', 2, 2).clean).toBe(2);
  });
});

describe('which level of tiles the player opens at', () => {
  it('is Level 0 until the player has finished a round of a kind of sum in Level 1, and Level 1 from then on', () => {
    expect(familyReached(emptyPlay())).toBe(0);
    for (const strand of FAMILIES[0].strands)
      expect(familyReached(withRound(emptyPlay(), strand, 1, 5)), strand).toBe(0);
    for (const strand of FAMILIES[1].strands)
      expect(familyReached(withRound(emptyPlay(), strand, 1, 0)), strand).toBe(1);
  });

  it('is the furthest the player has got, so a round of Level 0 played after one of Level 1 does not take them back', () => {
    const play = withRound(withRound(emptyPlay(), 'plus', 1, 5), 'count', 1, 5);
    expect(familyReached(play)).toBe(1);
  });

  it('does not count a kind of sum that is in the record with no rounds', () => {
    const play = {
      ...emptyPlay(),
      maths: { played: 0, strands: { times: { level: 1 as const, rounds: 0, flawless: 0 } } },
    };
    expect(familyReached(play)).toBe(0);
  });
});
