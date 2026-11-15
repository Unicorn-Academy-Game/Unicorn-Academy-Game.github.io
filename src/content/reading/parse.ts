import { CourseError, ENDINGS, GRAPHEMES, type Taught } from './graphemes';
import { isSoundId, type SoundId } from './sounds';
import type { Tile } from './types';

/**
 * Cutting a word into the tiles a child touches, by what the stage has taught. A word is written
 * either as its letters, which this cuts into the longest groups it knows, or as its letters, `=`
 * and its tiles when the usual cut would say the wrong sound.
 *
 *     ship               s h i p, cut as sh i p
 *     snow=s.n.ow:oh     a tile may name the sound it makes here
 *     rab|bit            `|` is where a longer word breaks, and each part is cut on its own
 *     make               the e that makes the a long is a silent tile, and the a and the e are
 *                        drawn joined
 *
 * Whatever is unclear is an error and not a guess: a group of letters that the stage has not
 * taught, a final e that is not a magic e, a g before e, i or y once the soft g is taught (soft or
 * hard?). The author then writes the tiles out, and a check against the voice model's own phonemes
 * looks at the result.
 */

export type Prefer = Readonly<Record<string, SoundId>>;

const VOWELS = 'aeiou';
const LONG: Readonly<Record<string, SoundId>> = { a: 'ay', e: 'ee', i: 'eye', o: 'oh', u: 'yoo' };
/**
 * The sounds a vowel letter may say when a silent e makes it long. A long u is a y and an oo (cute)
 * or only the oo (rule, flute).
 */
const LONG_SOUNDS: Readonly<Record<string, readonly SoundId[]>> = {
  a: ['ay'],
  e: ['ee'],
  i: ['eye'],
  o: ['oh'],
  u: ['yoo', 'oo'],
};

const isVowelLetter = (group: string): boolean => group.length === 1 && VOWELS.includes(group);
/** Whether a group of letters has a vowel in it. The u of qu is not one. */
const hasVowel = (group: string): boolean => group !== 'qu' && [...group].some((letter) => VOWELS.includes(letter));
const startsLikeFront = (group: string | undefined): boolean => group !== undefined && 'eiy'.includes(group[0]!);

function sounds(group: string, taught: Taught): ReadonlySet<SoundId> {
  const known = taught.pairs.get(group);
  if (!known || known.size === 0) throw new CourseError(`"${group}" is not taught yet`);
  return known;
}

/**
 * The sound a group of letters makes here: the one this stage prefers if it is taught, else the
 * first of its sounds that is.
 */
function usual(group: string, taught: Taught, prefer: Prefer): SoundId {
  const known = sounds(group, taught);
  const wanted = prefer[group];
  if (wanted && known.has(wanted)) return wanted;
  const first = GRAPHEMES[group]!.find((sound) => known.has(sound));
  if (!first) throw new CourseError(`"${group}" is taught, but with no sound that it makes`);
  return first;
}

/** The sound a group must make, which has to be taught. */
function needed(group: string, sound: SoundId, taught: Taught, why: string): SoundId {
  if (!sounds(group, taught).has(sound))
    throw new CourseError(`${why} needs "${group}:${sound}", which is not taught yet`);
  return sound;
}

/**
 * The groups of letters of one part of a word, longest first. A group that is only an ending is not
 * cut here.
 */
function groupsOf(part: string): string[] {
  const groups: string[] = [];
  let at = 0;
  while (at < part.length) {
    let found = '';
    for (let size = Math.min(3, part.length - at); size >= 1; size--) {
      const group = part.slice(at, at + size);
      if (group in GRAPHEMES && !ENDINGS.includes(group)) {
        found = group;
        break;
      }
    }
    if (!found) throw new CourseError(`no group of letters starts at "${part[at]}" in "${part}"`);
    groups.push(found);
    at += found.length;
  }
  return groups;
}

/**
 * Whether a part ends in the sound of a consonant and an l, as in the end of table and apple. A
 * vowel before the l is a magic e instead.
 */
const hasLe = (part: string): boolean =>
  part.length >= 3 &&
  part.endsWith('le') &&
  !isVowelLetter(part[part.length - 3]!) &&
  !'lr'.includes(part[part.length - 3]!);

/**
 * The sound of a y that is a vowel: i in a word of one part, as in my, and e at the end of a longer
 * one, as in happy.
 */
const vowelY = (only: boolean): SoundId => (only ? 'eye' : 'ee');

/** One part of a word, cut by what is taught. `only` is whether the word has no other part. */
function cutPart(part: string, taught: Taught, prefer: Prefer, only: boolean): Tile[] {
  if (part === 'ing') return [{ letters: 'ing', sound: needed('ing', 'ing', taught, '"ing"') }];
  if (part === 'le' && !only) return [{ letters: 'le', sound: needed('le', 'l', taught, 'the "le" at the end') }];
  if (part === 'ed') throw new CourseError('write the tiles of a word that ends in "ed", since it says t, d or id');
  const ending = hasLe(part);
  const groups = groupsOf(ending ? part.slice(0, -2) : part);
  const last = groups.length - 1;
  const tiles: Tile[] = [];
  groups.forEach((group, i) => {
    const next = groups[i + 1];
    if (group === 'e' && i === last && i > 0 && !ending) {
      // A silent e at the end makes the vowel before the consonant before it long. Alone after a
      // consonant it says ee, as in me.
      const consonant = groups[i - 1]!;
      const vowel = groups[i - 2];
      if (vowel !== undefined && 'aiou'.includes(vowel) && vowel.length === 1 && !isVowelLetter(consonant)) {
        if (!taught.splits.has(`${vowel}_e`)) throw new CourseError(`"${vowel}_e" is not taught yet, in "${part}"`);
        const at = tiles.length - 2;
        tiles[at] = { ...tiles[at]!, sound: LONG[vowel]!, split: 'start' };
        tiles.push({ letters: 'e', sound: null, split: 'end' });
        return;
      }
      if (!groups.slice(0, i).some(hasVowel)) {
        tiles.push({ letters: 'e', sound: needed('e', 'ee', taught, `the "e" at the end of "${part}"`) });
        return;
      }
      throw new CourseError(`the "e" at the end of "${part}" is not a magic e, so write its tiles`);
    }
    if (isVowelLetter(group)) {
      // A vowel that ends a part with a consonant before it, or that is a part on its own, is open,
      // and says its name: go, ba|by.
      const open = i === last && !ending;
      tiles.push({
        letters: group,
        sound: open
          ? needed(group, LONG[group]!, taught, `the open "${group}" at the end of "${part}"`)
          : usual(group, taught, prefer),
      });
      return;
    }
    if (group === 'y') {
      if (next !== undefined && VOWELS.includes(next[0]!))
        tiles.push({ letters: 'y', sound: usual('y', taught, prefer) });
      else if (next === undefined && (i > 0 || !only))
        tiles.push({ letters: 'y', sound: needed('y', vowelY(only), taught, `the "y" at the end of "${part}"`) });
      else
        throw new CourseError(
          `a "y" in "${part}" that is not before a vowel or at the end may say i, so write its tiles`,
        );
      return;
    }
    if (group === 'c' && startsLikeFront(next)) {
      tiles.push({ letters: 'c', sound: needed('c', 's', taught, `the "c" before "${next}" in "${part}"`) });
      return;
    }
    if (group === 'g' && startsLikeFront(next)) {
      // Before the stage that teaches the soft g, a g before e, i or y says its hard sound (get,
      // gift). A g and e that end a word are always soft (age, page).
      const endsWord = next === 'e' && i + 1 === last && !ending;
      if (endsWord || taught.pairs.get('g')?.has('j'))
        throw new CourseError(`a "g" before "${next}" in "${part}" is soft or hard, so write its tiles`);
    }
    tiles.push({ letters: group, sound: usual(group, taught, prefer) });
  });
  if (ending) tiles.push({ letters: 'le', sound: needed('le', 'l', taught, `the "le" at the end of "${part}"`) });
  return tiles;
}

interface Token {
  letters: string;
  named: string | undefined;
}

/**
 * A part whose tiles were written out. A long vowel is allowed when its e follows, if that split
 * digraph is taught.
 */
function explicitPart(part: string, written: string, taught: Taught, prefer: Prefer): Tile[] {
  const tokens: Token[] = written.split('.').map((token) => {
    const [letters = '', named] = token.split(':');
    return { letters, named };
  });
  const tiles: Tile[] = [];
  tokens.forEach(({ letters, named }, i) => {
    if (letters === '' || !GRAPHEMES[letters])
      throw new CourseError(`"${letters}" in "${written}" is not a group of letters in the table`);
    if (named === '-') {
      // The e at the end of a part that says nothing. After a long vowel it is the magic e and is
      // drawn joined to it, and after any other consonant it is only silent, as in house and have.
      const before = tiles[tiles.length - 1];
      if (letters !== 'e' || i !== tokens.length - 1 || !before || isVowelLetter(before.letters)) {
        throw new CourseError(
          `a silent tile is the e at the end of a word after a consonant, and "${letters}:-" in "${part}" is not`,
        );
      }
      const vowel = tiles[tiles.length - 2];
      const joined =
        vowel?.sound != null &&
        LONG_SOUNDS[vowel.letters]?.includes(vowel.sound) === true &&
        taught.splits.has(`${vowel.letters}_e`);
      if (joined) tiles[tiles.length - 2] = { ...vowel!, split: 'start' };
      tiles.push(joined ? { letters: 'e', sound: null, split: 'end' } : { letters: 'e', sound: null });
      return;
    }
    if (named === undefined) {
      tiles.push({ letters, sound: usual(letters, taught, prefer) });
      return;
    }
    if (!isSoundId(named)) throw new CourseError(`"${named}" in "${letters}:${named}" is not a sound`);
    const magic = tokens[i + 2];
    const split =
      LONG_SOUNDS[letters]?.includes(named as SoundId) === true &&
      magic?.letters === 'e' &&
      magic.named === '-' &&
      taught.splits.has(`${letters}_e`);
    tiles.push({ letters, sound: split ? named : needed(letters, named, taught, `"${letters}:${named}"`) });
  });
  if (tiles.map((tile) => tile.letters).join('') !== part)
    throw new CourseError(`the tiles ${written} do not spell "${part}"`);
  return tiles;
}

/**
 * The tiles of a word to sound out, cut by what is taught. Throws a `CourseError` that says what is
 * wrong.
 */
export function parseWord(spec: string, taught: Taught, prefer: Prefer = {}): Tile[] {
  const [word = '', written] = spec.split('=');
  if (!/^[a-z]+(\|[a-z]+)*$/.test(word)) throw new CourseError(`"${spec}" is not a word in lower case`);
  const parts = word.split('|');
  const marked = written?.split('|');
  if (marked && marked.length !== parts.length)
    throw new CourseError(`"${spec}" breaks the word in a different place from its tiles`);
  const tiles: Tile[] = [];
  parts.forEach((part, i) => {
    const cut = marked
      ? explicitPart(part, marked[i]!, taught, prefer)
      : cutPart(part, taught, prefer, parts.length === 1);
    tiles.push(...(i > 0 ? [{ ...cut[0]!, gap: true as const }, ...cut.slice(1)] : cut));
  });
  return tiles;
}

/** The tiles of a word that cannot be sounded out: every letter on its own, saying its name. */
export const nameTiles = (word: string): Tile[] =>
  [...word].map((letter) => ({ letters: letter, sound: null, name: true as const }));

/** The word's id: its letters, with no marks. */
export const idOf = (spec: string): string => spec.split('=')[0]!.replaceAll('|', '');
