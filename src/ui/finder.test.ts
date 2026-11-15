import { describe, expect, it } from 'vitest';
import { UNICORN_DEFS } from '../content/unicorns';
import { UNICORN_IDS, type UnicornId } from '../shared/ids';
import { announcement, left, summary, tally, wanted } from './finder';

const FRIENDS = UNICORN_IDS.filter((id) => id !== 'wildstar');

/** Who is found after the first `n` friends have joined Wildstar. */
const after = (n: number): UnicornId[] => ['wildstar', ...FRIENDS.slice(0, n)];

describe('the unicorn counter', () => {
  it('starts at the five friends who are still hiding, since Wildstar is with the player from the start', () => {
    expect(left(after(0))).toBe(FRIENDS.length);
    expect(FRIENDS).toHaveLength(5);
  });

  it('counts down by one for each friend who joins, to nothing', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => left(after(n)))).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('says how many are left, with the right word for one', () => {
    expect(tally(after(0))).toEqual({ count: '5', label: 'unicorns left' });
    expect(tally(after(3))).toEqual({ count: '2', label: 'unicorns left' });
    expect(tally(after(4))).toEqual({ count: '1', label: 'unicorn left' });
  });

  it('says that all are found, with no number, when none are left', () => {
    expect(tally(after(5))).toEqual({ count: null, label: 'All found!' });
  });

  it('does not count a friend twice, or care in what order they were found', () => {
    expect(left(['wildstar', 'storm', 'storm', 'leaf'])).toBe(3);
    expect(left(['storm', 'leaf', 'wildstar'])).toBe(3);
  });

  it('describes the row for a screen reader', () => {
    expect(summary(after(0))).toBe('1 of 6 unicorns found');
    expect(summary(after(5))).toBe('6 of 6 unicorns found');
  });
});

describe('when the counter goes away', () => {
  it('is wanted while anyone is still hiding, and not once the last friend is found', () => {
    expect([0, 1, 2, 3, 4].map((n) => wanted(after(n)))).toEqual([true, true, true, true, true]);
    expect(wanted(after(5))).toBe(false);
  });
});

describe('announcing a friend', () => {
  it('names her and says how many are left to find', () => {
    expect(announcement('leaf', after(1))).toEqual({
      title: 'Leaf joined you!',
      detail: '4 unicorns left to find',
      finale: false,
    });
    expect(announcement('cinder', after(4))).toEqual({
      title: 'Cinder joined you!',
      detail: '1 unicorn left to find',
      finale: false,
    });
  });

  it('turns the last one into a party of its own', () => {
    expect(announcement('storm', after(5))).toEqual({
      title: 'You found them all!',
      detail: 'All 6 unicorns are together now',
      finale: true,
    });
  });

  it('only ever calls the last one a finale', () => {
    for (let n = 1; n < 5; n++) expect(announcement(FRIENDS[n - 1]!, after(n)).finale).toBe(false);
    expect(announcement(FRIENDS[4]!, after(5)).finale).toBe(true);
  });

  it('has a name to say for every unicorn', () => {
    for (const id of UNICORN_IDS)
      expect(announcement(id, after(2)).title.length).toBeGreaterThan(UNICORN_DEFS[id].displayName.length);
  });
});
