import { describe, expect, it } from 'vitest';
import {
  bookNeedsAttention,
  describeAgo,
  describeCaught,
  describeMoment,
  describeWorld,
  deviceLine,
  needsAttention,
  visitLine,
} from './text';

const tz = { locale: 'en-US', timeZone: 'America/Los_Angeles' };
/** 3:42 PM on Sat Oct 24 2026, Pacific time. */
const NOW = Date.parse('2026-10-24T22:42:00Z');
const minutes = (n: number): number => NOW - n * 60_000;
const hours = (n: number): number => minutes(n * 60);

describe('how long ago', () => {
  it('speaks in short human steps', () => {
    expect(describeAgo(NOW - 10_000, NOW, tz)).toBe('just now');
    expect(describeAgo(NOW - 60_000, NOW, tz)).toBe('a minute ago');
    expect(describeAgo(minutes(7), NOW, tz)).toBe('7 minutes ago');
    expect(describeAgo(minutes(44), NOW, tz)).toBe('44 minutes ago');
    expect(describeAgo(minutes(60), NOW, tz)).toBe('an hour ago');
    expect(describeAgo(hours(5), NOW, tz)).toBe('5 hours ago');
  });

  it('names the day once it is no longer a matter of hours', () => {
    const lateTonight = Date.parse('2026-10-25T06:50:00Z');
    expect(describeAgo(Date.parse('2026-10-24T07:05:00Z'), lateTonight, tz)).toBe('today at 12:05 AM');
    expect(describeAgo(Date.parse('2026-10-23T16:10:00Z'), NOW, tz)).toBe('yesterday at 9:10 AM');
    expect(describeAgo(Date.parse('2026-10-21T23:00:00Z'), NOW, tz)).toBe('on Oct 21 at 4:00 PM');
    expect(describeAgo(Date.parse('2025-12-30T20:00:00Z'), NOW, tz)).toBe('on Dec 30, 2025 at 12:00 PM');
  });

  it('never reads a clock that is a little behind as the future', () => {
    expect(describeAgo(NOW + 5_000, NOW, tz)).toBe('just now');
  });

  it("counts a day by the parent's own calendar, not by 24 hours", () => {
    const lateLastNight = Date.parse('2026-10-24T06:50:00Z');
    const earlyThisMorning = Date.parse('2026-10-24T08:05:00Z');
    const justAfterMidnight = Date.parse('2026-10-24T07:10:00Z');
    expect(describeMoment(lateLastNight, earlyThisMorning, tz)).toBe('Yesterday, 11:50 PM');
    expect(describeMoment(justAfterMidnight, earlyThisMorning, tz)).toBe('Today, 12:10 AM');
  });
});

describe('a moment in a list', () => {
  it('says today and yesterday, and otherwise the date', () => {
    expect(describeMoment(minutes(3), NOW, tz)).toBe('Today, 3:39 PM');
    expect(describeMoment(Date.parse('2026-10-23T16:10:00Z'), NOW, tz)).toBe('Yesterday, 9:10 AM');
    expect(describeMoment(Date.parse('2026-10-21T23:00:00Z'), NOW, tz)).toBe('Oct 21, 4:00 PM');
    expect(describeMoment(Date.parse('2025-12-30T20:00:00Z'), NOW, tz)).toBe('Dec 30, 2025, 12:00 PM');
  });
});

describe('what a world holds', () => {
  it('uses the singular for one', () => {
    expect(describeWorld({ friends: 1, places: 1, mapId: 'forest' })).toBe('1 unicorn, 1 place visited');
    expect(describeWorld({ friends: 4, places: 3, mapId: 'stable' })).toBe('4 unicorns, 3 places visited');
  });
});

describe('what the game put right', () => {
  it('says nothing when nothing was needed', () => {
    expect(describeCaught({ touches: 0, freed: 0, errors: 0 })).toBe('Nothing');
  });

  it('says each thing that happened, in the order a parent would ask about them, and leaves out the rest', () => {
    expect(describeCaught({ touches: 2, freed: 1, errors: 3 })).toBe(
      '2 touches it lost track of, Wildstar freed 1 time, 3 errors carried past',
    );
    expect(describeCaught({ touches: 0, freed: 4, errors: 0 })).toBe('Wildstar freed 4 times');
    expect(describeCaught({ touches: 1, freed: 0, errors: 1 })).toBe('1 touch it lost track of, 1 error carried past');
  });
});

describe('the line about this device', () => {
  it('says saved only after a save finished, and when', () => {
    expect(deviceLine({ state: 'saved', at: minutes(2) }, NOW, tz)).toMatchObject({
      tone: 'good',
      title: 'Saved on this device',
      detail: 'Last saved 2 minutes ago.',
      offerDownload: false,
    });
  });

  it('is plain that progress is not saved after a failure, and offers a download', () => {
    for (const kind of ['quota', 'unavailable', 'error'] as const) {
      const line = deviceLine({ state: 'failed', kind, message: 'x' }, NOW, tz);
      expect(line.tone).toBe('bad');
      expect(line.title).toBe('Progress is not being saved');
      expect(line.title.toLowerCase()).not.toContain('saved on');
      expect(line.detail).toContain('Download a copy');
      expect(line.offerDownload).toBe(true);
    }
    expect(deviceLine({ state: 'failed', kind: 'quota', message: 'x' }, NOW).detail).toContain('no room');
    expect(deviceLine({ state: 'failed', kind: 'unavailable', message: 'x' }, NOW).detail).toContain(
      'Private browsing',
    );
  });

  it('does not claim a save for a world that has nothing to save or is being saved', () => {
    expect(deviceLine({ state: 'idle' }, NOW).title).toBe('Nothing to save yet');
    expect(deviceLine({ state: 'saving' }, NOW).title).toBe('Saving…');
  });
});

describe("what wants a parent's eye", () => {
  it('flags a failed save', () => {
    expect(needsAttention({ state: 'failed', kind: 'error', message: 'x' })).toBe(true);
  });

  it('leaves ordinary states alone', () => {
    expect(needsAttention({ state: 'saved', at: 1 })).toBe(false);
    expect(needsAttention({ state: 'saving' })).toBe(false);
    expect(needsAttention({ state: 'idle' })).toBe(false);
  });
});

describe("when the player's Spell Book wants a parent's eye", () => {
  it('flags a book that is not being kept, whatever the reason, while spelling is on', () => {
    for (const keeping of ['newer', 'unreadable', 'page'] as const)
      expect(bookNeedsAttention(keeping, 'kept', true), keeping).toBe(true);
    expect(bookNeedsAttention('newer', 'fresh', true)).toBe(true);
  });

  it('says nothing while spelling is off, because nothing the player does is written then', () => {
    for (const keeping of ['newer', 'unreadable', 'page'] as const)
      expect(bookNeedsAttention(keeping, 'kept', false), keeping).toBe(false);
  });

  it('says nothing in a look around, which is meant to leave nothing behind', () => {
    for (const keeping of ['device', 'newer', 'unreadable', 'page'] as const)
      expect(bookNeedsAttention(keeping, 'incognito', true), keeping).toBe(false);
  });

  it('leaves a book that is going onto the device alone', () => {
    expect(bookNeedsAttention('device', 'kept', true)).toBe(false);
    expect(bookNeedsAttention('device', 'fresh', true)).toBe(false);
  });
});

describe('what a visit that does not touch the saved world says', () => {
  it('says nothing when the saved world is in use, so the line about saving stands', () => {
    expect(visitLine('kept')).toBeNull();
  });

  it('tells a parent that a visit is not saved and where to change that', () => {
    const line = visitLine('fresh')!;
    expect(line.title).toBe('Each visit starts from the beginning');
    expect(line.detail).toContain('left as it was');
    expect(line.detail).toContain('Play');
  });

  it('tells a parent that a look around writes nothing anywhere', () => {
    const line = visitLine('incognito')!;
    expect(line.title).toBe('Incognito: nothing is saved');
    expect(line.detail).toContain('no setting is changed');
    expect(line.detail).toContain('untouched');
  });

  it('is never alarming, because nothing is wrong', () => {
    for (const kind of ['fresh', 'incognito'] as const) expect(visitLine(kind)!.tone).toBe('info');
  });
});
