import { describe, expect, it } from 'vitest';
import { CHAPTERS, READ_LINES, READ_WORDS, readWord, STAGES } from '../../../src/content/reading';
import { ALL_CLIPS } from '../../../src/learning/course-clips';
import { CHEERS, cheerClip, READ_DONE_CLIP, READ_START_CLIP, READS_CLIP } from '../../../src/learning/lines';
import {
  ALL_PROMPTS,
  askedAgain,
  begin,
  captionOf,
  chapterPrompt,
  homeOpening,
  itemClip,
  itemOpening,
  joined,
  lineItem,
  PROMPTS,
  praise,
  praiseCaption,
  type Reading,
  type Reward,
  roundDone,
  roundOpening,
  tileClip,
  told,
  touch,
  wordItem,
} from '../../../src/learning/reading';
import { seeded } from '../helpers';

const CLIP_IDS: ReadonlySet<string> = new Set(ALL_CLIPS.map((clip) => clip.id));

/**
 * Words that tell a child they were wrong, and that a young child should not hear. The same list is
 * in `tests/learning/lines.test.ts`.
 */
const UNKIND = /\b(wrong|fail|failed|failure|bad|no|incorrect|mistakes?|errors?|oops|sorry|lose|lost|try again)\b/i;

const cat = wordItem(readWord('cat')!, undefined);
const sentence = lineItem(STAGES[0]!.lines[0]!, undefined);
const reward = (patch: Partial<Reward> = {}): Reward => ({
  item: cat,
  fresh: true,
  clean: true,
  level: { before: 0, after: 1 },
  reads: false,
  cleared: null,
  chapter: null,
  everything: false,
  ...patch,
});
const first = (): (() => number) => () => 0;

/** A reading whose tiles have just been joined. */
function readyAt(level: number, item: typeof cat | typeof sentence): Reading {
  const units = item.kind === 'word' ? item.word.tiles.length : item.line.words.length;
  let r = begin(item.kind, units, level);
  for (let at = 0; at < units; at++) r = touch(r, at).reading;
  return r;
}

describe('the clip each tile plays', () => {
  it('is the sound of a letter, the sound of a group of letters, the name of a long vowel, or the name of the letter in a word that cannot be sounded out', () => {
    expect(readWord('ship')!.tiles.map(tileClip)).toEqual(['sound.sh', 'sound.i', 'sound.p']);
    expect(readWord('cat')!.tiles.map(tileClip)).toEqual(['sound.c', 'sound.a', 'sound.t']);
    expect(readWord('the')!.tiles.map(tileClip)).toEqual(['letter.t', 'letter.h', 'letter.e']);
  });

  it('is the name of the letter for a long vowel, and nothing for the e that only makes the vowel before it long', () => {
    const make = readWord('make')!;
    expect(make.tiles.map((tile) => tile.letters)).toEqual(['m', 'a', 'k', 'e']);
    expect(make.tiles.map(tileClip)).toEqual(['sound.m', 'letter.a', 'sound.k', null]);
  });

  it('is a clip that the voice makes, for every tile of every word of the course, and nothing only for a letter that makes no sound', () => {
    let seen = 0;
    for (const word of READ_WORDS) {
      for (const tile of word.tiles) {
        const clip = tileClip(tile);
        seen += 1;
        if (clip === null) expect(tile.sound === null && !tile.name, `${word.id}: the tile ${tile.letters}`).toBe(true);
        else expect(CLIP_IDS.has(clip), `${word.id}: the tile ${tile.letters} plays ${clip}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(3000);
  });
});

describe('what the voice says while the player reads', () => {
  it('says its own name for a word or a sentence, in a clip the voice makes', () => {
    expect(itemClip(cat)).toBe('word.cat');
    expect(itemClip(sentence)).toBe(`line.${sentence.line.id}`);
    for (const word of READ_WORDS) expect(CLIP_IDS.has(itemClip(wordItem(word, undefined))), word.id).toBe(true);
    for (const line of READ_LINES) expect(CLIP_IDS.has(itemClip(lineItem(line, undefined))), line.id).toBe(true);
  });

  it('says hello at the home screen the first time the player ever comes, and that it is time to read when a round begins', () => {
    expect(homeOpening(true)).toEqual([PROMPTS.welcome.id]);
    expect(homeOpening(false)).toEqual([]);
    expect(roundOpening()).toEqual([READ_START_CLIP]);
  });

  it('says what to do with a new word first in a round and with the first sentence of one, and nothing for a word the player has met', () => {
    expect(itemOpening(cat, true)).toEqual([PROMPTS.touch.id]);
    expect(itemOpening(cat, false)).toEqual([]);
    expect(itemOpening({ ...cat, review: true, level: 1 }, true)).toEqual([]);
    expect(itemOpening(sentence, true)).toEqual([PROMPTS.words.id]);
    expect(itemOpening(sentence, false)).toEqual([]);
  });

  it('says the word and then to say it, for a new word, and only to say it for a word the player knows, and to read it together for a sentence', () => {
    expect(joined(readyAt(0, cat), cat, false)).toEqual(['word.cat', PROMPTS.say.id]);
    expect(joined(readyAt(2, cat), cat, false)).toEqual([PROMPTS.say.id]);
    expect(joined(readyAt(0, sentence), sentence, false)).toEqual([PROMPTS.together.id]);
  });

  it('tells the player what to tap the first time ever, and not after', () => {
    expect(joined(readyAt(2, cat), cat, true)).toEqual([PROMPTS.say.id, PROMPTS.tick.id]);
    expect(joined(readyAt(2, sentence), sentence, true)).toEqual([PROMPTS.together.id, PROMPTS.tick.id]);
  });

  it('says it will try once more, and tells the word before saying it when it is told', () => {
    expect(askedAgain()).toEqual([PROMPTS.again.id]);
    expect(told(cat)).toEqual([PROMPTS.told.id, 'word.cat']);
    expect(told(sentence)).toEqual([PROMPTS.told.id, itemClip(sentence)]);
  });

  it('cheers, and says the word or the sentence back', () => {
    expect(praise(reward(), first())).toEqual([cheerClip(CHEERS[0]), 'word.cat']);
    expect(praise(reward({ item: sentence }), first())).toEqual([cheerClip(CHEERS[0]), itemClip(sentence)]);
  });

  it('says a word the player now reads on their own is one they can read, in place of the cheer', () => {
    expect(praise(reward({ reads: true }), first())).toEqual(['word.cat', READS_CLIP]);
  });

  it('says what was earned after the word: the level, the chapter it ended, the whole course', () => {
    expect(praise(reward({ cleared: 3 }), first()).slice(-1)).toEqual([PROMPTS.level.id]);
    const tiny = CHAPTERS[0]!;
    expect(praise(reward({ cleared: tiny.to, chapter: tiny }), first()).slice(-1)).toEqual([chapterPrompt('tiny').id]);
    const last = CHAPTERS[CHAPTERS.length - 1]!;
    expect(praise(reward({ cleared: last.to, chapter: last, everything: true }), first()).slice(-1)).toEqual([
      PROMPTS.course.id,
    ]);
    expect(praise(reward({ cleared: 3 }), first())).toHaveLength(3);
  });

  it('writes what was said as the cheer and the prompts, and leaves out the word and the sentence that are on the screen already', () => {
    expect(captionOf(praise(reward(), first()))).toBe(CHEERS[0]);
    expect(captionOf(praise(reward({ reads: true }), first()))).toBe('You can read it!');
    expect(captionOf(praise(reward({ cleared: 3 }), first()))).toBe(`${CHEERS[0]} ${PROMPTS.level.text}`);
    expect(captionOf(joined(readyAt(0, cat), cat, true))).toBe(`${PROMPTS.say.text} ${PROMPTS.tick.text}`);
    expect(captionOf(told(cat))).toBe(PROMPTS.told.text);
    expect(captionOf(roundDone())).toBe('You are a reader!');
    expect(captionOf([itemClip(cat), itemClip(sentence)])).toBe('');
  });

  it('writes the praise under a word as the cheer alone, since the level, the chapter and the course are banners of their own', () => {
    expect(praiseCaption(praise(reward(), first()))).toBe(CHEERS[0]);
    expect(praiseCaption(praise(reward({ cleared: 3 }), first())), 'the level').toBe(CHEERS[0]);
    for (const chapter of CHAPTERS)
      expect(praiseCaption(praise(reward({ cleared: chapter.to, chapter }), first())), `the end of ${chapter.id}`).toBe(
        CHEERS[0],
      );
    expect(
      praiseCaption(praise(reward({ cleared: 40, chapter: CHAPTERS[5]!, everything: true }), first())),
      'the course',
    ).toBe(CHEERS[0]);
    expect(praiseCaption(praise(reward({ reads: true, cleared: 3 }), first()))).toBe('You can read it!');
    expect(captionOf(praise(reward({ cleared: 3 }), first())), 'the banner is in what is said').toContain(
      PROMPTS.level.text,
    );
  });

  it('writes every line it can say in words that never tell a child they were wrong', () => {
    const random = seeded(8);
    for (const word of READ_WORDS.slice(0, 120)) {
      const item = wordItem(word, undefined);
      for (const clips of [
        itemOpening(item, true),
        told(item),
        joined(readyAt(0, item), item, true),
        joined(readyAt(3, item), item, false),
        praise(reward({ item, reads: true }), random),
        praise(reward({ item, cleared: 40, chapter: CHAPTERS[5]!, everything: true }), random),
      ]) {
        expect(captionOf(clips)).not.toMatch(UNKIND);
      }
    }
    for (const id of [...homeOpening(true), ...roundOpening(), ...askedAgain(), ...roundDone()])
      expect(captionOf([id]), id).not.toMatch(UNKIND);
  });

  it('says it is done when a round is', () => {
    expect(roundDone()).toEqual([READ_DONE_CLIP]);
  });

  it('only ever says clips that the voice makes, whatever chance picks', () => {
    const random = seeded(5);
    const all = [
      ...homeOpening(true),
      ...roundOpening(),
      ...askedAgain(),
      ...roundDone(),
      ...ALL_PROMPTS.map((prompt) => prompt.id),
    ];
    for (const word of READ_WORDS.slice(0, 80)) {
      const item = wordItem(word, undefined);
      all.push(
        ...itemOpening(item, true),
        ...told(item),
        ...joined(readyAt(0, item), item, true),
        ...joined(readyAt(3, item), item, false),
      );
      for (const patch of [
        {},
        { reads: true },
        { cleared: 4 },
        { cleared: 6, chapter: CHAPTERS[0]! },
        { cleared: 40, chapter: CHAPTERS[5]!, everything: true },
      ])
        all.push(...praise(reward({ item, ...patch }), random));
    }
    for (const line of READ_LINES.slice(0, 30)) {
      const item = lineItem(line, undefined);
      all.push(
        ...itemOpening(item, true),
        ...told(item),
        ...joined(readyAt(1, item), item, true),
        ...praise(reward({ item }), random),
      );
    }
    for (const clip of all) expect(CLIP_IDS.has(clip), clip).toBe(true);
  });

  it('has a prompt for each thing it says that is not a word, each with a clip of its own, and nothing in them tells a child they were wrong', () => {
    const ids = ALL_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(Object.keys(PROMPTS).length + CHAPTERS.length);
    for (const prompt of ALL_PROMPTS) {
      expect(prompt.text, prompt.id).not.toMatch(UNKIND);
      expect(prompt.id).toMatch(/^read\.[a-z]+$/);
      expect(CLIP_IDS.has(prompt.id), prompt.id).toBe(true);
    }
    expect(chapterPrompt('meadow').text).toBe('You finished the Meadow!');
  });
});
