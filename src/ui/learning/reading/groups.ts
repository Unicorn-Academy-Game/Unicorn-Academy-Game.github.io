import type { Piece } from '../../../game/reading-ports';

/**
 * What goes in a row of the screen: one piece, or the pieces of a vowel and its magic e with what
 * is between them, which are drawn as one thing joined by a bracket.
 */
export type Group =
  | { readonly bridge: false; readonly at: number }
  | { readonly bridge: true; readonly from: number; readonly to: number };

/**
 * The pieces of a word as the groups that are laid out. A vowel that makes a long sound with an e
 * after the next letter (the a and the e of make) has its two halves marked, and everything from
 * the first half to the second is one group. A half that has no other half is drawn as the piece it
 * is, and so is a second half that comes with no first.
 */
export function groupsOf(pieces: readonly Piece[]): Group[] {
  const groups: Group[] = [];
  let at = 0;
  while (at < pieces.length) {
    if (pieces[at]!.split === 'start') {
      const end = pieces.findIndex((piece, i) => i > at && piece.split !== null);
      if (end > at && pieces[end]!.split === 'end') {
        groups.push({ bridge: true, from: at, to: end });
        at = end + 1;
        continue;
      }
    }
    groups.push({ bridge: false, at });
    at += 1;
  }
  return groups;
}
