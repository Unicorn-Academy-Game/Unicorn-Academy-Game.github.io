import { describe, expect, it } from 'vitest';
import { CHAPTERS, STAGES } from '../../src/content/reading';
import { buildStages, lineOf } from '../../src/content/reading/build';
import {
  COURSE_LIMITS,
  chapterDifficulties,
  checkCourse,
  countCourse,
  type Limits,
} from '../../src/content/reading/check';
import type { Chapter, Stage, StageSource } from '../../src/content/reading/types';

/** The checks that are about size are turned off, so each test is about one rule. */
const SMALL: Limits = {
  ...COURSE_LIMITS,
  minStages: 1,
  minWords: 0,
  minTricky: 0,
  minLines: 0,
  minStageWords: 1,
  minStageLines: 1,
  minStageItems: 0,
  growth: 1,
};
const ONE: Chapter[] = [{ id: 'meadow', title: 'The Meadow', from: 1, to: 1 }];
const TWO: Chapter[] = [
  { id: 'meadow', title: 'The Meadow', from: 1, to: 1 },
  { id: 'pond', title: 'The Pond', from: 2, to: 2 },
];

const CAT: StageSource = {
  title: 'Cat Nap',
  teaches: ['a'],
  words: 'cat sat mat',
  tricky: 'the',
  lines: ['The cat sat.'],
};

const problemsOf = (
  sources: readonly StageSource[],
  chapters: readonly Chapter[] = ONE,
  limits: Limits = SMALL,
): string[] => checkCourse(buildStages(sources, chapters), chapters, limits).map((problem) => problem.what);

/** A stage that was built and then changed, for what an author cannot write down. */
const changed = (change: (stage: Stage) => Stage): Stage[] => [change(buildStages([CAT], ONE)[0]!)];
const whatIsWrongWith = (stages: readonly Stage[]): string[] =>
  checkCourse(stages, ONE, SMALL).map((problem) => problem.what);

describe('lineOf', () => {
  it('reads a sentence into its words, with the marks left off', () => {
    expect(lineOf('Wow, the cat can jump!', 3)).toEqual({
      id: 'wow-the-cat-can-jump',
      text: 'Wow, the cat can jump!',
      words: ['wow', 'the', 'cat', 'can', 'jump'],
      stage: 3,
    });
  });

  it('refuses what is not a sentence for a beginner', () => {
    expect(() => lineOf('the cat sat.', 1)).toThrow('does not begin with a capital letter');
    expect(() => lineOf('The cat sat', 1)).toThrow('does not end with a mark');
    expect(() => lineOf("The cat's hat.", 1)).toThrow('is not a word with marks after it');
    expect(() => lineOf('The  cat sat.', 1)).toThrow('is not a word with marks after it');
    expect(() => lineOf('The cat 2 sat.', 1)).toThrow('is not a word with marks after it');
  });
});

describe('buildStages', () => {
  it('puts the sentences of a stage in order, shortest first, and keeps the order of the words the author wrote', () => {
    const [stage] = buildStages(
      [{ ...CAT, lines: ['The cat sat on the mat.', 'The cat sat.', 'The cat sat the mat.'] }],
      ONE,
    );
    expect(stage!.lines.map((line) => line.words.length)).toEqual([3, 5, 6]);
    expect(stage!.words.map((word) => word.id)).toEqual(['cat', 'sat', 'mat']);
  });

  it('names the stage and the word when one cannot be cut, so the author finds it', () => {
    expect(() => buildStages([{ ...CAT, words: 'cat dog' }], ONE)).toThrow(
      'stage 1 (Cat Nap): the word "dog": "o" is not taught yet',
    );
    expect(() => buildStages([{ ...CAT, lines: ['the cat sat.'] }], ONE)).toThrow(
      'stage 1 (Cat Nap): a sentence: "the cat sat." does not begin with a capital letter',
    );
    expect(() => buildStages([CAT, CAT], [{ id: 'meadow', title: 'The Meadow', from: 1, to: 1 }])).toThrow(
      'stage 2 is in no chapter',
    );
  });

  it('refuses a tricky word that cannot be asked', () => {
    expect(() => buildStages([{ ...CAT, tricky: 'the a' }], ONE)).toThrow(
      'the tricky word "a": it is not a word that can be asked',
    );
    expect(() => buildStages([{ ...CAT, tricky: 'The' }], ONE)).toThrow(
      'the tricky word "The": it is not a word that can be asked',
    );
    expect(buildStages([{ ...CAT, tricky: 'to the' }], ONE)[0]!.tricky.map((word) => word.id)).toEqual(['to', 'the']);
  });

  it('teaches as it goes, so a later stage may use what an earlier one taught and an earlier one may not use a later one', () => {
    const IN: StageSource = { title: 'Big Pig', teaches: ['i'], words: 'sit pit', lines: ['The pit.'] };
    expect(buildStages([CAT, IN], TWO)).toHaveLength(2);
    expect(() => buildStages([IN, CAT], TWO)).not.toThrow();
    expect(() => buildStages([{ ...CAT, words: 'cat sit' }, IN], TWO)).toThrow('"i" is not taught yet');
  });
});

describe('checkCourse on a course of one small stage', () => {
  it('finds nothing wrong with a stage that is right', () => {
    expect(problemsOf([CAT])).toEqual([]);
  });

  it('says a sentence has a word that has not been met, and that a sentence has to use a word of its own stage', () => {
    expect(problemsOf([{ ...CAT, lines: ['The dog sat.'] }])).toContain(
      '"The dog sat." has "dog", which has not been met by this stage',
    );
    const next: StageSource = {
      title: 'Big Pig',
      teaches: ['i'],
      words: 'sit pit',
      tricky: 'is',
      lines: ['The cat sat a mat.', 'The pit is a sit.'],
    };
    const about = problemsOf([CAT, next], TWO);
    expect(about).toContain('"The cat sat a mat." has no word of this stage');
    expect(about).not.toContain('"The pit is a sit." has no word of this stage');
  });

  it('lets a sentence use a and I, which are letters and not words to spell', () => {
    expect(problemsOf([{ ...CAT, lines: ['I sat a mat.', 'A cat sat.'] }])).toEqual([]);
  });

  it('keeps out words that are not for young children, names, and words that are said two ways', () => {
    expect(problemsOf([{ ...CAT, words: 'cat sat mat bad' }])).toContain('"bad" has no place in this game');
    expect(problemsOf([{ ...CAT, words: 'cat sat mat sam' }])).toContain('"sam" is a name');
    expect(problemsOf([{ ...CAT, teaches: ['a', 'i'], words: 'cat sat mat wind' }])).toContain(
      '"wind" is said two ways and the clip says one',
    );
    expect(problemsOf([{ ...CAT, words: 'cat sat mat bad', lines: ['The cat sat a bad mat.'] }])).toContain(
      '"The cat sat a bad mat." has "bad", which has no place in this game',
    );
    expect(problemsOf([{ ...CAT, words: 'cat sat mat sam', lines: ['The cat sat sam.'] }])).toContain(
      '"The cat sat sam." has "sam", which is a name',
    );
    expect(
      problemsOf([{ ...CAT, teaches: ['a', 'i'], words: 'cat sat mat wind', lines: ['The cat sat wind.'] }]),
    ).toContain('"The cat sat wind." has "wind", which is said two ways');
  });

  it('says a word that is listed twice, and a sentence that is the same as another', () => {
    expect(problemsOf([{ ...CAT, words: 'cat sat mat cat' }])).toContain(
      '"cat" is already in an earlier stage or twice in this one',
    );
    expect(problemsOf([{ ...CAT, lines: ['The cat sat.', 'The cat sat!'] }])).toContain(
      '"The cat sat!" is the same sentence as one before it',
    );
  });

  it('says a word that is spelled one way and said another has to be tricky or written out', () => {
    expect(problemsOf([{ ...CAT, words: 'cat sat mat was' }])).toContain(
      '"was" does not sound the way it is spelled, so it is a tricky word or its tiles are written out',
    );
    expect(problemsOf([{ ...CAT, words: 'cat sat mat was=w.a.s' }]).filter((what) => what.includes('"was"'))).toEqual(
      [],
    );
    expect(problemsOf([{ ...CAT, tricky: 'the was' }]).filter((what) => what.includes('"was"'))).toEqual([]);
  });

  it('says a sentence is too short or too long for its chapter, and too wide for the screen', () => {
    expect(problemsOf([{ ...CAT, lines: ['The cat sat.', 'Cat sat.'] }])).toContain(
      '"Cat sat." has 2 words, and a meadow sentence has 3 to 8',
    );
    expect(
      problemsOf([{ ...CAT, lines: ['The cat sat on the mat and the cat sat on the mat.'] }]).some((what) =>
        what.includes('has 13 words, and a meadow sentence has 3 to 8'),
      ),
    ).toBe(true);
    expect(problemsOf([CAT], ONE, { ...SMALL, maxLineChars: 8 })).toContain(
      '"The cat sat." is 12 letters and the screen has room for 8',
    );
  });

  it('lets a sentence have as many words as its chapter allows, and as many letters as the screen has room for', () => {
    expect(problemsOf([{ ...CAT, lines: ['The cat sat a mat the cat sat.'] }])).toEqual([]);
    expect(problemsOf([CAT], ONE, { ...SMALL, maxLineChars: 12 })).toEqual([]);
  });

  it('says a word has more tiles than the screen has room for, and not a word that has exactly as many', () => {
    expect(problemsOf([CAT], ONE, { ...SMALL, maxTiles: 2 })).toContain(
      '"cat" has 3 tiles and the screen has room for 2',
    );
    expect(problemsOf([CAT], ONE, { ...SMALL, maxTiles: 3 })).toEqual([]);
  });

  it('says a stage is short of words or sentences', () => {
    expect(problemsOf([CAT], ONE, { ...SMALL, minStageWords: 4 })).toContain(
      'it has 3 words to sound out and at least 4 are wanted',
    );
    expect(problemsOf([CAT], ONE, { ...SMALL, minStageLines: 2 })).toContain(
      'it has 1 sentences and at least 2 are wanted',
    );
  });

  it('says a stage has too little to fill a round, counting words and sentences together', () => {
    expect(problemsOf([CAT], ONE, { ...SMALL, minStageItems: 5 })).toContain(
      'it has 4 words and sentences and at least 5 are wanted, to fill a round',
    );
    expect(
      problemsOf([CAT], ONE, { ...SMALL, minStageItems: 4 }).filter((what) => what.includes('to fill a round')),
    ).toEqual([]);
  });

  it('reads a word that is put together out of parts a part at a time, so a long compound is not too long for the map', () => {
    const compound: StageSource = {
      title: 'Compound',
      teaches: ['u', 'e'],
      words: 'sun|set',
      tricky: 'the',
      lines: ['The sunset sunset.'],
    };
    expect(buildStages([compound], ONE)[0]!.words[0]!.tiles).toHaveLength(6);
    expect(problemsOf([compound]).filter((what) => what.includes('level map'))).toEqual([]);
  });

  it('says that one of the three words the level map shows is too long for its tiles', () => {
    const long: StageSource = {
      title: 'Long',
      teaches: ['i'],
      words: 'sprint',
      tricky: 'the',
      lines: ['The sprint sprint.'],
    };
    expect(problemsOf([long])).toContain(
      '"sprint" is one of the three words the level map shows and it has 6 tiles in a row',
    );
    expect(problemsOf([{ ...long, words: 'sprint' }]).filter((what) => what.includes('level map'))).toHaveLength(1);
    expect(
      problemsOf([
        { title: 'Five', teaches: ['a'], words: 'stand', tricky: 'the', lines: ['The stand stand.'] },
      ]).filter((what) => what.includes('level map')),
    ).toEqual([]);
    expect(
      problemsOf([
        { title: 'Third', teaches: ['i'], words: 'sit pit sprint', tricky: 'the', lines: ['The sprint sprint.'] },
      ]),
    ).toContain('"sprint" is one of the three words the level map shows and it has 6 tiles in a row');
    // only the first three are shown, so a long word after them is not a problem for the map
    expect(
      problemsOf([
        {
          title: 'Late',
          teaches: ['i'],
          words: 'sit pit bit sprint',
          tricky: 'the',
          lines: ['The sprint sprint.'],
        },
      ]).filter((what) => what.includes('level map')),
    ).toEqual([]);
  });

  it('says what is wrong with the tiles of a word that was changed by hand', () => {
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          words: [{ ...stage.words[0]!, tiles: stage.words[0]!.tiles.slice(1) }, ...stage.words.slice(1)],
        })),
      ),
    ).toContain('the tiles of "cat" spell "at"');
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          words: [
            {
              ...stage.words[0]!,
              tiles: [{ ...stage.words[0]!.tiles[0]!, name: true as const }, ...stage.words[0]!.tiles.slice(1)],
            },
            ...stage.words.slice(1),
          ],
        })),
      ),
    ).toContain('the word "cat" is sounded out and has a tile that says a letter name');
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          words: [
            {
              ...stage.words[0]!,
              tiles: [{ ...stage.words[0]!.tiles[0]!, sound: null }, ...stage.words[0]!.tiles.slice(1)],
            },
            ...stage.words.slice(1),
          ],
        })),
      ),
    ).toContain('the word "cat" has a tile with no sound that is not a silent e');
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          tricky: [
            { ...stage.tricky[0]!, tiles: [{ letters: 't', sound: 't' as const }, ...stage.tricky[0]!.tiles.slice(1)] },
          ],
        })),
      ),
    ).toContain('the tricky word "the" has a tile that is not a letter name');
  });

  it('says a word whose name is not one the book can keep', () => {
    expect(
      whatIsWrongWith(
        changed((stage) => ({ ...stage, words: [{ ...stage.words[0]!, id: 'Cat' }, ...stage.words.slice(1)] })),
      ),
    ).toContain('"Cat" is not a word the book can keep');
  });

  it('says a tricky tile that has a sound even when it also has a name, and one that has neither', () => {
    const named = { letters: 't', sound: 't' as const, name: true as const };
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          tricky: [{ ...stage.tricky[0]!, tiles: [named, ...stage.tricky[0]!.tiles.slice(1)] }],
        })),
      ),
    ).toContain('the tricky word "the" has a tile that is not a letter name');
    const silentTile = { letters: 't', sound: null };
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          tricky: [{ ...stage.tricky[0]!, tiles: [silentTile, ...stage.tricky[0]!.tiles.slice(1)] }],
        })),
      ),
    ).toContain('the tricky word "the" has a tile that is not a letter name');
  });

  it('lets the e of a vowel and its magic e have a letter after it, as in the s of lakes', () => {
    const tiles = [
      { letters: 'c', sound: 'k' as const },
      { letters: 'a', sound: 'ay' as const, split: 'start' as const },
      { letters: 't', sound: 't' as const },
      { letters: 'e', sound: null, split: 'end' as const },
      { letters: 's', sound: 's' as const, gap: true as const },
    ];
    const stages = changed((stage) => ({
      ...stage,
      words: [{ id: 'cates', tiles, tricky: false, stage: 1 }, ...stage.words.slice(1)],
      lines: [{ id: 'the-cates-sat', text: 'The cates sat.', words: ['the', 'cates', 'sat'], stage: 1 }],
    }));
    expect(whatIsWrongWith(stages)).toEqual([]);
    const noMagic = [
      { ...tiles[0]! },
      { letters: 'a', sound: 'ay' as const },
      { ...tiles[2]! },
      { letters: 'e', sound: null },
      { ...tiles[4]! },
    ];
    expect(
      whatIsWrongWith(
        changed((stage) => ({
          ...stage,
          words: [{ id: 'cates', tiles: noMagic, tricky: false, stage: 1 }, ...stage.words.slice(1)],
          lines: [{ id: 'the-cates-sat', text: 'The cates sat.', words: ['the', 'cates', 'sat'], stage: 1 }],
        })),
      ),
    ).toContain('the word "cates" has a tile with no sound that is not a silent e');
  });

  it('says a stage, a word or a sentence that is in the wrong place in the list', () => {
    expect(whatIsWrongWith(changed((stage) => ({ ...stage, n: 4 })))).toContain(
      'it says it is stage 4 and is number 1 in the list',
    );
    expect(
      whatIsWrongWith(
        changed((stage) => ({ ...stage, words: [{ ...stage.words[0]!, stage: 9 }, ...stage.words.slice(1)] })),
      ),
    ).toContain('"cat" says it is in stage 9');
    expect(whatIsWrongWith(changed((stage) => ({ ...stage, lines: [{ ...stage.lines[0]!, stage: 9 }] })))).toContain(
      '"The cat sat." says it is in stage 9',
    );
  });

  it('says a title that is missing or is the title of another stage', () => {
    expect(problemsOf([{ ...CAT, title: ' ' }])).toContain('it has no title');
    expect(problemsOf([{ ...CAT, title: 'Ox' }])).toContain('it has no title');
    expect(problemsOf([{ ...CAT, title: 'Cat' }])).not.toContain('it has no title');
    const next: StageSource = {
      title: 'Cat Nap',
      teaches: ['i'],
      words: 'sit pit',
      tricky: 'is',
      lines: ['The pit is a sit.'],
    };
    expect(problemsOf([CAT, next], TWO)).toContain('its title "Cat Nap" is the title of another stage');
  });

  it('says chapters that leave a gap or that stop short of the stages', () => {
    const gap: Chapter[] = [
      { id: 'meadow', title: 'The Meadow', from: 1, to: 1 },
      { id: 'pond', title: 'The Pond', from: 3, to: 3 },
    ];
    expect(problemsOf([CAT], gap)).toContain(
      'chapter pond runs from stage 3 to 3, and the one before it ended at stage 1',
    );
    const backwards: Chapter[] = [{ id: 'meadow', title: 'The Meadow', from: 1, to: 0 }];
    expect(checkCourse(buildStages([CAT], ONE), backwards, SMALL).map((problem) => problem.what)).toContain(
      'chapter meadow runs from stage 1 to 0, and the one before it ended at stage 0',
    );
    expect(problemsOf([CAT], [{ id: 'meadow', title: 'The Meadow', from: 1, to: 2 }])).toContain(
      'the chapters end at stage 2 and there are 1 stages',
    );
  });
});

describe('the difficulty of a chapter', () => {
  it('is the mean tiles of a word plus half the words of a sentence, with nothing added for a tile that is new in the first stage', () => {
    expect(chapterDifficulties(buildStages([CAT], ONE), ONE)).toEqual([4.5]);
    const longer: StageSource = {
      title: 'Long',
      teaches: ['i'],
      words: 'sprint',
      tricky: 'the',
      lines: ['The sprint sprint.'],
    };
    expect(chapterDifficulties(buildStages([longer], ONE), ONE)).toEqual([6]);
    const longLine: StageSource = { ...CAT, lines: ['The cat sat a mat the cat sat.'] };
    expect(chapterDifficulties(buildStages([longLine], ONE), ONE)).toEqual([7]);
  });

  it('is higher for a stage whose tiles came late in the course', () => {
    const first = buildStages(
      [CAT, { title: 'Big Pig', teaches: ['i'], words: 'sit pit', tricky: 'is', lines: ['The pit is a sit.'] }],
      TWO,
    );
    const [early, late] = chapterDifficulties(first, TWO);
    expect(late!).toBeGreaterThan(early!);
  });
});

describe('checkCourse on the whole course', () => {
  it('says the course is smaller than the limits ask for', () => {
    const about = checkCourse(STAGES.slice(0, 1), [{ id: 'meadow', title: 'The Meadow', from: 1, to: 1 }]).map(
      (problem) => problem.what,
    );
    expect(about.some((what) => what.startsWith('there are 1 stages and at least'))).toBe(true);
    expect(about.some((what) => what.includes('words to sound out and at least 500 are wanted'))).toBe(true);
    expect(about.some((what) => what.includes('tricky words and at least 50 are wanted'))).toBe(true);
    expect(about.some((what) => what.includes('sentences and at least 200 are wanted'))).toBe(true);
  });

  it('asks for exactly as many words, tricky words and sentences as the limits say', () => {
    const counts = countCourse(STAGES);
    const about = (limits: Partial<Limits>): string[] =>
      checkCourse(STAGES, CHAPTERS, { ...COURSE_LIMITS, ...limits }).map((problem) => problem.what);
    expect(
      about({ minWords: counts.words, minTricky: counts.tricky, minLines: counts.lines, minStages: counts.stages }),
    ).toEqual([]);
    expect(about({ minWords: counts.words + 1 })).toEqual([
      `there are ${counts.words} words to sound out and at least ${counts.words + 1} are wanted`,
    ]);
    expect(about({ minTricky: counts.tricky + 1 })).toEqual([
      `there are ${counts.tricky} tricky words and at least ${counts.tricky + 1} are wanted`,
    ]);
    expect(about({ minLines: counts.lines + 1 })).toEqual([
      `there are ${counts.lines} sentences and at least ${counts.lines + 1} are wanted`,
    ]);
    expect(about({ minStages: counts.stages + 1 })).toEqual([
      `there are ${counts.stages} stages and at least ${counts.stages + 1} are wanted`,
    ]);
  });

  it('says the last chapter is not as many times harder than the first as the limit asks', () => {
    const strict = checkCourse(STAGES, CHAPTERS, { ...COURSE_LIMITS, growth: 3 }).map((problem) => problem.what);
    expect(strict.some((what) => /is not 3 times as hard as the first/.test(what))).toBe(true);
    expect(checkCourse(STAGES, CHAPTERS, { ...COURSE_LIMITS, growth: 2 })).toEqual([]);
  });

  it('says a chapter that is easier than the one before it', () => {
    // the easy end of the course called the second chapter, and the hard end the first
    const upside: Chapter[] = [
      { id: 'meadow', title: 'The Meadow', from: 19, to: 40 },
      { id: 'pond', title: 'The Pond', from: 1, to: 18 },
    ];
    const about = checkCourse(STAGES, upside, SMALL).map((problem) => problem.what);
    expect(
      about.some((what) => /^chapter pond is easier \(\d+\.\d+\) than the one before it \(\d+\.\d+\)$/.test(what)),
    ).toBe(true);
  });
});
