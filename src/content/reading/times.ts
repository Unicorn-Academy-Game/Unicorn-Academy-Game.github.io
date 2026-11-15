import raw from './line-times.json';

/**
 * When each word of a sentence starts and ends in the clip that reads it, in seconds from the start
 * of the clip. A recogniser gives the times when the clips are made
 * (`tools/voice/export-times.ts`), and the screen lights each word as it is said. A sentence that
 * has no times is lit at an even pace by the length of its words.
 */
export type Span = readonly [from: number, to: number];

// The file's own type is lists of lists of numbers. That every pair has two, in order, and that
// there is one for each word of its sentence is checked over the whole course by
// `tests/tools/voice-times.test.ts`, so what is read here is the shape that test has seen.
const TIMES = raw as unknown as Readonly<Record<string, readonly Span[]>>;

/**
 * The spans of the words of a sentence, or nothing when there are none or they are not one for each
 * word.
 */
export function timesOf(id: string, words: number): readonly Span[] | undefined {
  const spans = Object.hasOwn(TIMES, id) ? TIMES[id] : undefined;
  return spans !== undefined && spans.length === words ? spans : undefined;
}

/**
 * The spans of a sentence's words laid out evenly over a clip `seconds` long, in proportion to the
 * length of each word.
 */
export function evenSpans(tokens: readonly string[], seconds: number): Span[] {
  const total = tokens.reduce((sum, token) => sum + token.length, 0) || 1;
  let at = 0;
  return tokens.map((token): Span => {
    const from = (at / total) * seconds;
    at += token.length;
    return [from, (at / total) * seconds];
  });
}
