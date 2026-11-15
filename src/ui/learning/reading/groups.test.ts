import { describe, expect, it } from 'vitest';
import { READ_WORDS } from '../../../content/reading';
import type { Piece } from '../../../game/reading-ports';
import { groupsOf } from './groups';

const piece = (text: string, split: Piece['split'] = null): Piece => ({ text, silent: false, split, gap: false });

describe('the groups of a word', () => {
  it('is a group for each piece when no vowel is split', () => {
    expect(groupsOf([piece('c'), piece('a'), piece('t')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: false, at: 1 },
      { bridge: false, at: 2 },
    ]);
    expect(groupsOf([])).toEqual([]);
  });

  it('draws a vowel and its magic e, and what is between them, as one group', () => {
    expect(groupsOf([piece('m'), piece('a', 'start'), piece('k'), piece('e', 'end')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: true, from: 1, to: 3 },
    ]);
    expect(groupsOf([piece('s'), piece('t'), piece('r'), piece('i', 'start'), piece('k'), piece('e', 'end')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: false, at: 1 },
      { bridge: false, at: 2 },
      { bridge: true, from: 3, to: 5 },
    ]);
  });

  it('has the pieces after a bridge on their own again', () => {
    expect(groupsOf([piece('a', 'start'), piece('t'), piece('e', 'end'), piece('s')])).toEqual([
      { bridge: true, from: 0, to: 2 },
      { bridge: false, at: 3 },
    ]);
  });

  it('draws a half that has no other half as the piece it is', () => {
    expect(groupsOf([piece('a', 'start'), piece('t')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: false, at: 1 },
    ]);
    expect(groupsOf([piece('t'), piece('e', 'end')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: false, at: 1 },
    ]);
    expect(groupsOf([piece('a', 'start'), piece('b', 'start'), piece('e', 'end')])).toEqual([
      { bridge: false, at: 0 },
      { bridge: true, from: 1, to: 2 },
    ]);
    expect(
      groupsOf([piece('e', 'end'), piece('t'), piece('e', 'end')]),
      'a second half does not begin a bridge',
    ).toEqual([
      { bridge: false, at: 0 },
      { bridge: false, at: 1 },
      { bridge: false, at: 2 },
    ]);
  });

  it('covers every piece of every word in the course once, in order', () => {
    for (const word of READ_WORDS) {
      const pieces = word.tiles.map(
        (tile): Piece => ({ text: tile.letters, silent: false, split: tile.split ?? null, gap: tile.gap === true }),
      );
      const covered = groupsOf(pieces).flatMap((group) =>
        group.bridge ? Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from + i) : [group.at],
      );
      expect(covered, word.id).toEqual(pieces.map((_, i) => i));
    }
  });

  it('draws every split in the course as a bridge, so none is left as two unrelated tiles', () => {
    for (const word of READ_WORDS) {
      const pieces = word.tiles.map(
        (tile): Piece => ({ text: tile.letters, silent: false, split: tile.split ?? null, gap: tile.gap === true }),
      );
      const halves = pieces.filter((p) => p.split !== null).length;
      const bridged = groupsOf(pieces).filter((group) => group.bridge).length;
      expect(bridged * 2, word.id).toBe(halves);
    }
  });
});
