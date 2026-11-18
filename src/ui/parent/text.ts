import type { Keeping } from '../../persistence/learner';
import type { SaveStatus } from '../../persistence/save-service';
import type { VisitKind } from '../../persistence/visit';
import type { WorldSummary } from '../../shared/exchange';
import type { MapId } from '../../shared/ids';

/**
 * The words the parent controls use for the state of things. Pure, so each sentence can be tested
 * and read in one place.
 */

export interface Locale {
  locale?: string | undefined;
  timeZone?: string | undefined;
}

const DAY_MS = 86_400_000;

function dayNumber(at: number, o: Locale): { day: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: o.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(at);
  const pick = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
  return { day: Math.floor(Date.UTC(pick('year'), pick('month') - 1, pick('day')) / DAY_MS), year: pick('year') };
}

const time = (at: number, o: Locale): string =>
  new Intl.DateTimeFormat(o.locale, { timeZone: o.timeZone, hour: 'numeric', minute: '2-digit' }).format(at);

const date = (at: number, now: number, o: Locale): string => {
  const sameYear = dayNumber(at, o).year === dayNumber(now, o).year;
  return new Intl.DateTimeFormat(o.locale, {
    timeZone: o.timeZone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
};

/** A moment on its own, for a list: "Today, 3:42 PM", "Yesterday, 9:10 AM" or "Oct 21, 4:00 PM". */
export function describeMoment(at: number, now: number, o: Locale = {}): string {
  const apart = dayNumber(now, o).day - dayNumber(at, o).day;
  if (apart === 0) return `Today, ${time(at, o)}`;
  if (apart === 1) return `Yesterday, ${time(at, o)}`;
  return `${date(at, now, o)}, ${time(at, o)}`;
}

/**
 * How long ago, for the end of a sentence: "just now", "5 minutes ago", "yesterday at 9:10 AM", "on
 * Oct 21 at 4:00 PM".
 */
export function describeAgo(at: number, now: number, o: Locale = {}): string {
  const seconds = Math.max(0, (now - at) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';
  const minutes = seconds / 60;
  if (minutes < 45) return `${Math.round(minutes)} minutes ago`;
  if (minutes < 90) return 'an hour ago';
  const hours = minutes / 60;
  if (hours < 22) return `${Math.round(hours)} hours ago`;
  const apart = dayNumber(now, o).day - dayNumber(at, o).day;
  if (apart === 0) return `today at ${time(at, o)}`;
  if (apart === 1) return `yesterday at ${time(at, o)}`;
  return `on ${date(at, now, o)} at ${time(at, o)}`;
}

export const PLACE_NAMES: Record<MapId, string> = {
  forest: 'the forest',
  'palace-garden': 'the palace garden',
  'treasure-house': 'the treasure house',
  'palace-hall': 'the throne room',
  stable: 'the stable',
  playground: 'the playground',
  'dance-floor': 'the dance floor',
  'manor-hall': 'the wonder gallery',
  'manor-upper': 'the sky garden',
  'crystal-cave': 'the crystal cave',
  'palace-dining': 'the dining room',
  'palace-tea': 'the tea room',
  'palace-gallery': 'the long gallery',
  'palace-library': 'the library',
  'palace-music': 'the music room',
  'palace-ballroom': 'the ballroom',
  'palace-flowers': 'the flower room',
  'palace-bedroom': 'the bedroom',
  'palace-jewel': 'the jewel room',
  river: 'the magic river',
  beach: 'the beach',
  'magic-hall': 'the magic hall',
  'witch-hut': "the witch's hut",
  'santa-grove': "Santa's grove",
  'santa-cabin': "Santa's cabin",
};

export const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * What a world holds, in a line a parent can compare with another: "3 unicorns, 2 places visited".
 */
export function describeWorld(summary: WorldSummary): string {
  return `${count(summary.friends, 'unicorn', 'unicorns')}, ${count(summary.places, 'place', 'places')} visited`;
}

/** What the game has put right by itself, as counts. */
export interface Caught {
  /** Touches it was still holding after they had ended, found out and let go. */
  touches: number;
  /** Times Wildstar was freed after she was meant to move and did not. */
  freed: number;
  /** Failures that it carried on past. */
  errors: number;
}

/**
 * What the game put right without anyone seeing, for a parent to read out when the player got
 * stuck: "Nothing", or "2 touches it lost track of, Wildstar freed 1 time".
 */
export function describeCaught(c: Caught): string {
  const parts = [
    c.touches > 0 ? count(c.touches, 'touch it lost track of', 'touches it lost track of') : null,
    c.freed > 0 ? `Wildstar freed ${count(c.freed, 'time', 'times')}` : null,
    c.errors > 0 ? `${count(c.errors, 'error', 'errors')} carried past` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'Nothing';
}

export type Tone = 'good' | 'info' | 'warn' | 'bad';

export interface Line {
  tone: Tone;
  title: string;
  detail?: string;
}

/**
 * Where progress stands on this device. It only says saved after a save finished, and says plainly
 * when one failed.
 */
export function deviceLine(status: SaveStatus, now: number, o: Locale = {}): Line & { offerDownload: boolean } {
  switch (status.state) {
    case 'idle':
      return {
        tone: 'info',
        title: 'Nothing to save yet',
        detail: 'Progress is saved on this device as the game is played.',
        offerDownload: false,
      };
    case 'saving':
      return { tone: 'info', title: 'Saving…', offerDownload: false };
    case 'saved':
      return {
        tone: 'good',
        title: 'Saved on this device',
        detail: `Last saved ${describeAgo(status.at, now, o)}.`,
        offerDownload: false,
      };
    case 'failed': {
      const why =
        status.kind === 'quota'
          ? 'This device has no room left for saves.'
          : status.kind === 'unavailable'
            ? 'This browser cannot keep saves. Private browsing often causes this.'
            : 'The last save did not finish. It will be tried again.';
      return {
        tone: 'bad',
        title: 'Progress is not being saved',
        detail: `${why} The game keeps going, but closing it now would lose what happened since the last save. Download a copy to keep it safe.`,
        offerDownload: true,
      };
    }
  }
}

/**
 * What a parent is told in place of the save line when this opening does not touch the saved world.
 * Null when it does, and the line about saving stands.
 */
export function visitLine(visit: VisitKind): Line | null {
  switch (visit) {
    case 'kept':
      return null;
    case 'fresh':
      return {
        tone: 'info',
        title: 'Each visit starts from the beginning',
        detail:
          'What happens in a visit is not saved, and the world on this device is left as it was. A reload of the page carries the visit on. To keep progress, turn this off under Play.',
      };
    case 'incognito':
      return {
        tone: 'info',
        title: 'Incognito: nothing is saved',
        detail:
          'Nothing from this visit is kept on this device, and no setting is changed. Close the page to end it. The saved world is untouched.',
      };
  }
}

/**
 * Whether something here wants a parent's eye, so the gear in the game can show a small dot. A save
 * that failed does.
 */
export const needsAttention = (save: SaveStatus): boolean => save.state === 'failed';

/**
 * Whether the player's Spell Book is going nowhere, so what they spell is not kept: a newer version
 * of the game wrote what is on the device, the device would not give it up, or the browser has
 * nowhere to put it. It matters only while spelling is on, since nothing is written without it. A
 * look around is meant to leave nothing behind, so its book is never a worry.
 */
export function bookNeedsAttention(keeping: Keeping, visit: VisitKind, spelling: boolean): boolean {
  return spelling && visit !== 'incognito' && keeping !== 'device';
}
