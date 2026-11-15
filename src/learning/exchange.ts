import { BOOK_KIND, EXPORT_APP } from '../shared/exchange';
import { SKILLS } from '../shared/learning';
import { type LearnerProfile, readProfile } from '../shared/profile';

/**
 * The file a parent saves the player's Spell Book in, and later adds to a book on this device or
 * another one. It holds the book and a little about itself, and never anything that identifies a
 * person.
 */

/**
 * The most a file can hold: a book at the word limit with every skill in every word, written out in
 * full, and at the sentence limit as well, with room for the wrapper. A skill takes up to about 600
 * thousand characters of that, and the sentences about 300 thousand, so the limit grows with the
 * skills, and the test of a book at the limit fails when a skill is added that this does not leave
 * room for.
 */
export const MAX_BOOK_CHARS = 1_000_000 * SKILLS.length;

export function exportBook(profile: LearnerProfile, exportedAt: string): { filename: string; text: string } {
  const file = { app: EXPORT_APP, kind: BOOK_KIND, format: 1, exportedAt, book: profile };
  return {
    filename: `${EXPORT_APP}-spell-book-${exportedAt.slice(0, 10)}.json`,
    text: `${JSON.stringify(file, null, 2)}\n`,
  };
}

export type BookFile =
  | {
      ok: true;
      profile: LearnerProfile;
      /**
       * When the file was made, or null for a bare book, which is what a copy put aside under
       * Recovery holds.
       */
      savedAt: number | null;
      /** How many things in the file could not be read and were left out. */
      dropped: number;
    }
  | { ok: false; reason: string };

const no = (reason: string): BookFile => ({ ok: false, reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const NEWER = 'That Spell Book was saved by a newer version of the game. Update the app first.';

/**
 * A book with no word, no sentence and no floor has nothing to add. A book that holds only
 * sentences or a floor is a book.
 */
const isEmpty = (book: LearnerProfile): boolean =>
  Object.keys(book.words).length === 0 && Object.keys(book.sentences ?? {}).length === 0 && book.floor === undefined;

/**
 * Reads a chosen file. It takes this game's Spell Book file, and also a bare book, which is what
 * the copy put aside when a new book was started holds, so that book can be brought back. A word
 * that cannot be read is left out and the rest is kept. The reasons are written for a parent to
 * read.
 */
export function parseBookFile(text: string): BookFile {
  if (text.length > MAX_BOOK_CHARS) return no('That file is too big to be a Spell Book.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return no('That file is not a Spell Book. It could not be read.');
  }
  if (!isRecord(raw)) return no('That file is not a Spell Book.');
  // A saved world, in its file or bare, has these and a Spell Book never does.
  if ('save' in raw || 'recruited' in raw)
    return no('That file is a saved world, not a Spell Book. A world is loaded under Recovery.');

  const wrapped = raw.kind === BOOK_KIND;
  if (wrapped && typeof raw.format === 'number' && raw.format > 1) return no(NEWER);
  if (wrapped && (raw.format !== 1 || !isRecord(raw.book))) return no('That file is not a Spell Book.');

  const read = readProfile(wrapped ? raw.book : raw);
  if (read.newer) return no(NEWER);
  if (isEmpty(read.profile))
    return no(
      read.dropped > 0
        ? 'Nothing in that file could be read as a Spell Book.'
        : 'That Spell Book has no words in it, so there is nothing to add.',
    );
  const savedAt = wrapped && typeof raw.exportedAt === 'string' ? Date.parse(raw.exportedAt) : Number.NaN;
  return { ok: true, profile: read.profile, savedAt: Number.isFinite(savedAt) ? savedAt : null, dropped: read.dropped };
}
