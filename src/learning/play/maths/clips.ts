import type { Clip, ClipId } from '../../lines';
import { numberClip, SAID_NUMBERS, wordsOfNumber } from './numbers';
import type { Op } from './question';

/**
 * What the voice says at the maths table, apart from the cheers the game already says. A question
 * is said by joining these: the parts of a sentence, and the numbers and the names of shapes that
 * go in it, one clip after the other. The written question is made from the same parts, so the card
 * says what the voice says.
 *
 * A part of a sentence is not spoken by itself. Said alone, a number falls as the end of a sentence
 * does, and a question joined from words that each fall sounds like a list. So a part is cut out of
 * a whole sentence, in the place it is said (`frame`), and the parts are laid end to end. The
 * `lead` ones have a part after them and the `last` one ends the sentence.
 */

/** A word or two said in the middle of a question. */
export const TERMS = {
  plus: 'plus',
  times: 'times',
  'divided-by': 'divided by',
  double: 'double',
  tens: 'tens',
  ones: 'ones',
  and: 'and',
  oclock: "o'clock",
  circle: 'circle',
  square: 'square',
  triangle: 'triangle',
  rectangle: 'rectangle',
  star: 'star',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
} as const;
export type TermId = keyof typeof TERMS;

/**
 * What is said to ask or to answer, whole or in the part of a sentence that comes before a number.
 */
export const PHRASES = {
  pick: 'What shall we play?',
  'how-many': 'How many?',
  'what-next': 'What comes next?',
  'which-more': 'Which has more?',
  'which-fewer': 'Which has fewer?',
  'which-bigger': 'Which number is bigger?',
  'which-smaller': 'Which number is smaller?',
  'what-is': 'What is',
  'take-away': 'take away',
  'half-of': 'half of',
  'in-all': 'How many in all?',
  'which-number': 'Which number is',
  'which-shape': 'Which one is the',
  sides: 'How many sides?',
  corners: 'How many corners?',
  'what-time': 'What time is it?',
  'half-past': 'half past',
  'which-clock': 'Which clock shows',
  'look-again': 'Have another look.',
  done: 'Well done!',
} as const;
export type PhraseId = keyof typeof PHRASES;

/**
 * The sentence each piece of a question is cut out of, with the piece in square brackets. A piece
 * said in the middle of a sentence sounds as it does there and joins the pieces beside it, which a
 * word said alone does not, so a question is said by laying pieces end to end and not by reading
 * each word out in turn. The numbers in these sentences are not the piece, and any will do.
 */
const shapeFrame = (shape: TermId): string => `Which one is the [${TERMS[shape]}]?`;
const TERM_FRAMES: Readonly<Record<TermId, string>> = {
  plus: `What is five [${TERMS.plus}] six?`,
  times: `What is five [${TERMS.times}] six?`,
  'divided-by': `What is twelve [${TERMS['divided-by']}] six?`,
  double: `What is [${TERMS.double}] five?`,
  tens: `Which number is five [${TERMS.tens}] and six ones?`,
  ones: `Which number is five tens and six [${TERMS.ones}]?`,
  and: `Which number is five tens [${TERMS.and}] six ones?`,
  oclock: `Which clock shows five [${TERMS.oclock}]?`,
  circle: shapeFrame('circle'),
  square: shapeFrame('square'),
  triangle: shapeFrame('triangle'),
  rectangle: shapeFrame('rectangle'),
  star: shapeFrame('star'),
  pentagon: shapeFrame('pentagon'),
  hexagon: shapeFrame('hexagon'),
};
/**
 * The phrases that are cut out of a longer sentence. Most are the part of a question that comes before a number. `how-many` and `in-all` are whole
 * questions, cut from the end of a sentence that asks them as a person would, because the model says two or three words said alone flatly. The
 * others are made on their own.
 */
const PHRASE_FRAMES: Readonly<Partial<Record<PhraseId, string>>> = {
  'how-many': `Count them. [${PHRASES['how-many']}]`,
  'in-all': `Count them all. [${PHRASES['in-all']}]`,
  'what-is': `[${PHRASES['what-is']}] five plus six?`,
  'take-away': `What is eight [${PHRASES['take-away']}] six?`,
  'half-of': `What is [${PHRASES['half-of']}] six?`,
  'which-number': `[${PHRASES['which-number']}] five tens and six ones?`,
  'which-shape': `[${PHRASES['which-shape']}] circle?`,
  'half-past': `Which clock shows [${PHRASES['half-past']}] five?`,
  'which-clock': `[${PHRASES['which-clock']}] half past five?`,
};

/**
 * The kind of a clip: `lead` when it is a piece with more of its sentence after it, so it runs on
 * into the next clip, `last` when it is a piece that ends a sentence, and `maths` when it is a
 * whole sentence, whether it is said from nothing or cut from the end of another that comes before
 * it (`Count them. [How many?]`). Only a piece has to keep the level it had in its sentence, since
 * only a piece is heard next to other clips.
 */
const kindOf = (frame: string | undefined): 'lead' | 'last' | 'maths' => {
  if (frame === undefined || /(^|[.?!]\s+)\[[^\]]+\]$/.test(frame)) return 'maths';
  return /\]\s*[.?!]?$/.test(frame) ? 'last' : 'lead';
};

export const termClip = (term: TermId): ClipId => `${kindOf(TERM_FRAMES[term])}.${term}`;
export const phraseClip = (phrase: PhraseId): ClipId => `${kindOf(PHRASE_FRAMES[phrase])}.${phrase}`;

/** How each operation is written in a question and said, so the card and the voice agree. */
export const OPERATION: Readonly<Record<Op, { readonly text: string; readonly clip: ClipId }>> = {
  '+': { text: TERMS.plus, clip: termClip('plus') },
  '-': { text: PHRASES['take-away'], clip: phraseClip('take-away') },
  '*': { text: TERMS.times, clip: termClip('times') },
  '/': { text: TERMS['divided-by'], clip: termClip('divided-by') },
};

export const MATHS_CLIPS: readonly Clip[] = [
  ...SAID_NUMBERS.flatMap((n): Clip[] => {
    const words = wordsOfNumber(n);
    return [
      { id: numberClip(n), text: String(n), say: words },
      { id: numberClip(n, 'lead'), text: String(n), say: words, frame: `What is [${words}] plus five?` },
      { id: numberClip(n, 'last'), text: String(n), say: words, frame: `What is five plus [${words}]?` },
    ];
  }),
  ...(Object.keys(TERMS) as TermId[]).map(
    (term): Clip => ({ id: termClip(term), text: TERMS[term], frame: TERM_FRAMES[term] }),
  ),
  ...(Object.keys(PHRASES) as PhraseId[]).map((phrase): Clip => {
    const frame = PHRASE_FRAMES[phrase];
    return { id: phraseClip(phrase), text: PHRASES[phrase], ...(frame ? { frame } : {}) };
  }),
];
