import type { WriteKind } from '../../content/letters';
import { numberWords } from '../../learning';

/**
 * Everything the writing desk says to a screen reader. Like the rest of the game it never says that
 * anything is wrong or missing: a letter that has not been written yet is waiting to be written,
 * and a stroke that was missed is only waiting to be followed.
 */

export const WRITE_LABELS = {
  open: 'Write the letters and numbers',
  title: 'Write the letters and numbers',
  close: 'Back to the book',
  back: 'Back to the page of them all',
  letters: 'The letters',
  numbers: 'The numbers',
  paper: 'The page to write on',
  say: 'Hear it',
  again: 'Write it again',
  next: 'The next one',
  previous: 'The one before',
  help: 'Write the next line for me',
} as const;

/** The letter or numeral as the page shows it: a capital, a small one, or the numeral itself. */
export const shown = (symbol: string, kind: WriteKind): string =>
  kind === 'upper' ? symbol.toUpperCase() : symbol.toLowerCase();

/** The switch between the three pages, which says what it will show next. */
export const caseLabel = (kind: WriteKind): string =>
  kind === 'upper' ? 'Show the small letters' : kind === 'lower' ? 'Show the numbers' : 'Show the capital letters';

/** What the kind is called, for the title of the desk. */
const kindName = (kind: WriteKind): string =>
  kind === 'upper' ? 'capital letter' : kind === 'lower' ? 'small letter' : 'number';

/** The word for a numeral, which goes beside it on the page of its own. */
export const wordOf = (symbol: string): string => numberWords(Number(symbol));

export const tileLabel = (symbol: string, kind: WriteKind, written: boolean): string =>
  `${kindName(kind)} ${shown(symbol, kind)}${written ? ', written' : ''}. Write it`;

export const writtenCount = (count: number, total: number, kind: WriteKind): string =>
  `${count} of ${total} ${kind === 'digits' ? 'numbers' : 'letters'} written`;

export const traceTitle = (symbol: string, kind: WriteKind): string =>
  `Write the ${kindName(kind)} ${shown(symbol, kind)}`;

/** What is said when a line of the letter has been written, and the letter is not. */
export const strokeDone = (done: number, of: number): string => `Line ${done} of ${of} written`;

export const letterDone = (symbol: string, kind: WriteKind): string =>
  `You wrote the ${kindName(kind)} ${shown(symbol, kind)}`;
