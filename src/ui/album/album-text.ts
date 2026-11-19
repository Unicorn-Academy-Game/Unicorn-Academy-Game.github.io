import type { StickerView, TabView } from './album-view';

/**
 * Every word the sticker book gives to a screen reader. Like the Spell Book it never says anything
 * is lost or missing: a sticker the player does not have yet is waiting for them, and the book
 * says what to do for it.
 */

export const ALBUM_LABELS = {
  title: 'My Sticker Book',
  open: 'Open my Sticker Book',
  close: 'Close the Sticker Book',
  pages: 'Pages of the book',
  stickers: 'The stickers on this page',
  newOne: 'A new sticker!',
} as const;

/** The button in the corner that opens the book. */
export const chipLabel = (have: number, total: number): string => `${ALBUM_LABELS.open}. ${have} of ${total} stickers.`;

/** How much of the book is full, for the top of it. */
export const totalLabel = (have: number, total: number): string => `${have} of ${total} stickers`;

export const tabLabel = (tab: TabView): string =>
  `${tab.title}. ${tab.have} of ${tab.total} stickers${tab.complete ? '. Every sticker on this page' : ''}`;

/** The words of how far the player is to a sticker. */
export const progressLabel = (progress: { have: number; of: number }): string => `${progress.have} of ${progress.of}`;

/** A sentence that stops once, whether or not the words already end in a mark. */
const stop = (words: string): string => (/[.!?]$/.test(words) ? words : `${words}.`);

/** A place on a page: the sticker, or the sticker that is waiting and what to do for it. */
export function stickerLabel(sticker: StickerView): string {
  if (sticker.found) return [stop(sticker.name), sticker.fresh ? 'A new sticker.' : ''].filter(Boolean).join(' ');
  return [
    'A sticker waiting for you.',
    stop(sticker.hint),
    sticker.progress ? `${progressLabel(sticker.progress)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
