import {
  type BookFile,
  chapters,
  GAP,
  type LearnerProfile,
  levelOf,
  type Model,
  mergeProfiles,
  progressOf,
  rungAt,
  STARS_PER_WORD,
  START_LEVEL,
  type Stars,
  sameProfile,
  tally,
  tricky,
} from '../../learning';
import type { Durable } from '../../persistence/durable';
import type { Keeping } from '../../persistence/learner';
import type { VisitKind } from '../../persistence/visit';
import { type AskRate, type KeyboardLayout, type LetterCase, START_HELP, type StartHelp } from '../../shared/learning';
import type { StartNewResult } from './services';
import { count, describeAgo, type Line } from './text';

/**
 * The words the Learning page uses. Pure, like the other parent text, so each sentence can be
 * tested and read in one place.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A length of time as a parent would say it: "8 seconds", "2 minutes", "an hour", "3 days". */
export function describeSpan(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / SECOND));
  if (seconds < 60) return count(seconds, 'second', 'seconds');
  const minutes = ms / MINUTE;
  if (minutes < 45) return minutes < 1.5 ? 'a minute' : `${Math.round(minutes)} minutes`;
  if (minutes < 90) return 'an hour';
  const hours = ms / HOUR;
  if (hours < 22) return `${Math.round(hours)} hours`;
  const days = ms / DAY;
  return days < 1.5 ? 'a day' : `${Math.round(days)} days`;
}

export const KEYBOARD_LABELS: Readonly<Record<KeyboardLayout, string>> = { abc: 'ABC', qwerty: 'QWERTY' };
export const CASE_LABELS: Readonly<Record<LetterCase, string>> = { upper: 'CAPITALS', lower: 'small' };
export const HELP_LABELS: Readonly<Record<StartHelp, string>> = { full: 'A lot', some: 'Some', little: 'A little' };
export const ASK_LABELS: Readonly<Record<AskRate, string>> = {
  often: 'Often',
  sometimes: 'Sometimes',
  rarely: 'Rarely',
};

/** What the card shows of a word while it is spelled. A new way to show one is a new line here. */
const SHOWS: Readonly<Record<Model, string>> = {
  'in-places': 'every letter is shown faintly and the next key glows',
  above: 'the word is shown above the empty places',
  'first-letter': 'only the first letter is shown',
  none: 'only the picture is shown',
};

/**
 * How much help a new word starts with, said from the same tables the engine reads, so the page
 * cannot say one thing and the card do another.
 */
export const helpDescription = (): string =>
  `What a word that has not been spelled before starts with. ${START_HELP.map((help) => `${HELP_LABELS[help]}: ${SHOWS[rungAt(START_LEVEL[help]).model]}.`).join(' ')} The help fades each time a word is spelled right.`;

/** How often the game asks, said from the same spacing the engine keeps. */
export const askDescription = (): string =>
  `How soon one card can follow another when your child taps a creature, a gem or a friend: ${describeSpan(GAP.often)} if often, ${describeSpan(GAP.sometimes)} if sometimes, ${describeSpan(GAP.rarely)} if rarely. A fruit tree or a vegetable bed asks whenever a word for it is due.`;

/**
 * What a parent is told about the browser's promise not to clear what is stored. A browser that has
 * said nothing is not talked about.
 */
const DURABLE_NOTES: Readonly<Record<Durable, string>> = {
  promised: ' This browser has promised not to clear it.',
  'not-promised':
    ' This browser has not promised to keep it, and can clear it when the device runs short of space. Adding the game to the Home Screen helps, and so does saving a copy of the book now and then.',
  unknown: '',
};

/**
 * Whether what is spelled is being kept on this device, in a line a parent can read at a glance.
 */
export function keepingLine(keeping: Keeping, visit: VisitKind, durable: Durable = 'unknown'): Line {
  if (visit === 'incognito') {
    return {
      tone: 'info',
      title: 'Incognito: nothing is kept',
      detail:
        'What is spelled in this visit is forgotten when the page is closed. The saved Spell Book is left as it was.',
    };
  }
  switch (keeping) {
    case 'device':
      return {
        tone: 'good',
        title: 'Kept on this device',
        detail: `${visit === 'fresh' ? 'The Spell Book is kept even though each visit starts from the beginning.' : 'The Spell Book is saved here as your child plays.'}${DURABLE_NOTES[durable]}`,
      };
    case 'page':
      return {
        tone: 'warn',
        title: 'Not being kept',
        detail:
          'This browser cannot keep the Spell Book, so it is forgotten when the page is closed. Private browsing often causes this.',
      };
    case 'newer':
      return {
        tone: 'warn',
        title: 'A newer version wrote this Spell Book',
        detail:
          'This version leaves it alone, so what is spelled now is not kept. Update the game under Offline, and the book will be there.',
      };
    case 'unreadable':
      return {
        tone: 'warn',
        title: 'This device would not give up the Spell Book',
        detail:
          'It was left alone and nothing was deleted, but what is spelled now is not kept. Closing the game and opening it again often fixes this.',
      };
  }
}

/**
 * What a parent is told after asking for a new book. Only a new book that was started is good news.
 */
export function startNewSaid(result: StartNewResult): { text: string; tone: 'good' | 'warn' } {
  switch (result) {
    case 'started':
      return { text: 'A new Spell Book is started.', tone: 'good' };
    case 'refused':
      return { text: 'The book could not be put away, so it was left as it was.', tone: 'warn' };
  }
}

/** Why a new book cannot be started now, or null when it can. */
export function startNewBlock(keeping: Keeping, visit: VisitKind, found: number): string | null {
  if (visit === 'incognito') return 'This is an incognito visit, so there is nothing kept to start over.';
  if (keeping === 'newer' || keeping === 'unreadable')
    return 'The Spell Book on this device cannot be changed from here right now.';
  if (found === 0) return 'The Spell Book has no words in it yet.';
  return null;
}

/**
 * Why a saved Spell Book cannot be added now, or null when it can. A book added where it is not
 * kept would be gone when the page closed.
 */
export function addBlock(keeping: Keeping, visit: VisitKind): string | null {
  if (visit === 'incognito')
    return 'This is an incognito visit, so a Spell Book added now would be forgotten when the page is closed.';
  if (keeping === 'page')
    return 'This browser cannot keep the Spell Book, so one added now would be forgotten when the page is closed.';
  if (keeping === 'newer' || keeping === 'unreadable')
    return 'The Spell Book on this device cannot be changed from here right now.';
  return null;
}

/** Why the Spell Book cannot be saved as a file, or null when it can. */
export const saveBlock = (found: number): string | null =>
  found === 0 ? 'The Spell Book has no words in it yet.' : null;

export interface FilePreview extends Line {
  detail: string;
  /**
   * Whether adding the file would change the book. A file that holds only what the book has already
   * is not offered.
   */
  adds: boolean;
}

/**
 * What a parent is shown of a chosen file before it is added: enough to tell it from another, and
 * to know it takes nothing away.
 */
export function previewFile(current: LearnerProfile, file: Extract<BookFile, { ok: true }>, now: number): FilePreview {
  const unread =
    file.dropped > 0
      ? ` ${count(file.dropped, 'thing', 'things')} in the file could not be read, and ${file.dropped === 1 ? 'was' : 'were'} left out.`
      : '';
  if (sameProfile(mergeProfiles(current, file.profile), current)) {
    return {
      tone: 'info',
      title: 'The Spell Book has all of this already',
      detail: `Everything in this file is in the Spell Book, so adding it would change nothing.${unread}`,
      adds: false,
    };
  }
  const have = new Set(Object.keys(current.words));
  const fresh = Object.keys(file.profile.words).filter((word) => !have.has(word)).length;
  const inFile = reportOf(file.profile, now);
  const saved = file.savedAt === null ? '' : `, saved ${describeAgo(file.savedAt, now)}`;
  const news =
    fresh === 0
      ? 'The Spell Book has all of these words already, and adding the file brings them up to date.'
      : `${fresh === 1 ? '1 word is' : `${fresh} words are`} not in the Spell Book yet.`;
  return {
    tone: 'good',
    title: 'This file holds a Spell Book',
    detail: `${count(Object.keys(file.profile.words).length, 'word', 'words')} and ${count(inFile.stars, 'star', 'stars')}${saved}. ${news} Adding it never takes a word or a star away.${unread}`,
    adds: true,
  };
}

interface WordRow {
  word: string;
  stars: Stars;
  /** How well the player knows it, by the name the engine gives that level. */
  level: string;
  /** When it will be asked again. */
  again: string;
}

export interface PageReport {
  title: string;
  found: number;
  total: number;
  complete: boolean;
  /** Only the words the player has found, in the order of the page. */
  words: WordRow[];
}

export interface BookReport {
  found: number;
  total: number;
  stars: number;
  mostStars: number;
  pages: PageReport[];
  pagesDone: number;
  /** Words the player has found that are ready to be asked again. */
  ready: number;
  /**
   * Where to help: the words that took the most wrong keys for each time the player spelled them.
   */
  tricky: string[];
}

export function reportOf(profile: LearnerProfile, now: number): BookReport {
  const totals = tally(profile, now);
  const pages = chapters(profile, now).map<PageReport>((chapter) => ({
    title: chapter.page.title,
    found: chapter.collected,
    total: chapter.cards.length,
    complete: chapter.complete,
    words: chapter.cards
      .filter((card) => card.collected)
      .map((card): WordRow => {
        const due = progressOf(profile, card.word, 'spell')?.due ?? now;
        return {
          word: card.word,
          stars: card.stars,
          level: levelOf(card.level ?? 0).name,
          again: card.due ? 'Ready to be asked again' : `Asked again in ${describeSpan(due - now)}`,
        };
      }),
  }));
  return {
    found: totals.collected,
    total: totals.total,
    stars: totals.stars,
    mostStars: totals.total * STARS_PER_WORD,
    pages,
    pagesDone: pages.filter((page) => page.complete).length,
    ready: totals.due,
    tricky: tricky(profile, 3).map((card) => card.word),
  };
}

/**
 * The numbers at the top of the player's Spell Book card. The list of the trickiest words only
 * appears once there are some.
 */
export function factsOf(report: BookReport): { label: string; value: string }[] {
  const facts = [
    { label: 'Words found', value: `${report.found} of ${report.total}` },
    { label: 'Stars', value: `${report.stars} of ${report.mostStars}` },
    { label: 'Pages finished', value: `${report.pagesDone} of ${report.pages.length}` },
    { label: 'Ready to be asked again', value: report.ready === 0 ? 'None' : count(report.ready, 'word', 'words') },
  ];
  if (report.tricky.length > 0) facts.push({ label: 'Trickiest words', value: report.tricky.join(', ') });
  return facts;
}

/** What the list of trickiest words means. Nothing when there is none. */
export const trickyNote = (report: BookReport): string | null =>
  report.tricky.length > 0
    ? 'The trickiest words are the ones that took the most wrong keys each time they were spelled.'
    : null;
