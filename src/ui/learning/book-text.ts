import type { TabView, WordView } from './book-view';
import { starsLabel } from './text';

/**
 * Every word the Spell Book gives to a screen reader. Like the card, it never says anything is lost
 * or missing: a word the player has not found is waiting to be found. A word is only named once
 * they have spelled it, because until then its name is the answer, and a word that is waiting
 * offers to show them where it is.
 */

export const BOOK_LABELS = {
  title: 'My Spell Book',
  open: 'Open my Spell Book',
  close: 'Close the Spell Book',
  pages: 'Pages of the book',
  words: 'The words on this page',
  stopLooking: 'Stop looking for this word',
} as const;

/**
 * The bubble in the world that takes the player to a word they asked to be shown. It does not name
 * the word, since the name is the answer.
 */
export const seekLabel = (letters: number): string => `Show me the way to the word with ${letters} letters`;

/** The button in the corner that opens the book. */
export const chipLabel = (collected: number, total: number): string =>
  `${BOOK_LABELS.open}. ${collected} of ${total} words.`;

/** How much of the book is full, for the top of it. */
export const totalLabel = (collected: number, total: number, stars: number): string =>
  `${collected} of ${total} words, ${stars} ${stars === 1 ? 'star' : 'stars'}`;

export const tabLabel = (tab: TabView): string =>
  `${tab.title}. ${tab.collected} of ${tab.total} found${tab.complete ? '. Every word found' : ''}`;

/**
 * A place on a page. It is a word that has been found, which can be spelled again, or one that is
 * still waiting, which can be shown the way to.
 */
export function wordLabel(word: WordView): string {
  if (!word.found) return `A word with ${word.letters} letters, waiting to be found. Show me where`;
  return `${word.word}. ${starsLabel(word.stars)}.${word.newest ? ' The newest word.' : ''}${word.due ? ' Ready to spell again.' : ''}${word.reads ? ' Read on its own.' : ''} Spell it again`;
}
