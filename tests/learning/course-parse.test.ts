import { describe, expect, it } from 'vitest';
import { CourseError, START_TAUGHT, teach } from '../../src/content/reading/graphemes';
import { idOf, nameTiles, parseWord } from '../../src/content/reading/parse';

/** What is taught after a stage that taught these. The consonants are always known. */
const after = (...keys: string[]) => teach(START_TAUGHT, keys);
const spoken = (tiles: ReturnType<typeof parseWord>): string =>
  tiles.map((tile) => `${tile.letters}:${tile.sound ?? '-'}`).join(' ');

describe('what a stage teaches', () => {
  it('starts with the consonants, each with its usual sound', () => {
    expect(spoken(parseWord('dog=d.o.g', after('o')))).toBe('d:d o:o g:g');
    expect(START_TAUGHT.pairs.get('b')).toEqual(new Set(['b']));
    // no vowel is known before a stage teaches it, and q is only ever the start of qu
    expect(START_TAUGHT.pairs.has('a')).toBe(false);
    expect(START_TAUGHT.pairs.has('q')).toBe(false);
  });

  it('teaches a group with its usual sound, with a sound it names, or as a split digraph', () => {
    expect(after('sh').pairs.get('sh')).toEqual(new Set(['sh']));
    expect(after('ow:oh').pairs.get('ow')).toEqual(new Set(['oh']));
    expect(after('ow:oh', 'ow:ow').pairs.get('ow')).toEqual(new Set(['oh', 'ow']));
    expect(after('a_e').splits.has('a_e')).toBe(true);
  });

  it('refuses a key that is not in the table or a sound the group does not make', () => {
    expect(() => after('zq')).toThrow(CourseError);
    expect(() => after('sh:oy')).toThrow(/does not make/);
  });

  it('never changes the record of what was taught before, so a later stage cannot leak into an earlier one', () => {
    const before = after('a');
    teach(before, ['i']);
    expect(before.pairs.has('i')).toBe(false);
  });
});

describe('cutting a word into tiles', () => {
  it('cuts the plain words letter by letter', () => {
    expect(spoken(parseWord('cat', after('a')))).toBe('c:c a:a t:t');
    expect(spoken(parseWord('and', after('a')))).toBe('a:a n:n d:d');
  });

  it('is written in lower case, with letters and breaks only', () => {
    expect(() => parseWord('Cat', after('a'))).toThrow(/lower case/);
    expect(() => parseWord('cat!', after('a'))).toThrow(/lower case/);
    expect(() => parseWord('|cat', after('a'))).toThrow(/lower case/);
  });

  it('refuses a vowel that has not been taught, and says which', () => {
    expect(() => parseWord('sit', after('a'))).toThrow('"i" is not taught yet');
  });

  it('cuts a group that is taught as one tile, longest first', () => {
    expect(spoken(parseWord('ship', after('i', 'sh')))).toBe('sh:sh i:i p:p');
    expect(spoken(parseWord('catch', after('a', 'ch', 'tch')))).toBe('c:c a:a tch:ch');
    expect(spoken(parseWord('light', after('igh')))).toBe('l:l igh:eye t:t');
  });

  it('does not split a group that is not taught into its letters, which would say the wrong sounds', () => {
    // s and h are both known, and sh is not, so "ship" would cut as s h i p and say the wrong word
    expect(() => parseWord('ship', after('i'))).toThrow('"sh" is not taught yet');
    expect(() => parseWord('ball', after('a'))).toThrow('"ll" is not taught yet');
    expect(() => parseWord('pink', after('i'))).toThrow('"nk" is not taught yet');
    expect(() => parseWord('cow', after('o'))).toThrow('"ow" is not taught yet');
  });

  it('keeps a break the author wrote, so letters on either side of it are not one group', () => {
    expect(spoken(parseWord('mis|hap', after('i', 'a')))).toBe('m:m i:i s:s h:h a:a p:p');
    expect(() => parseWord('mishap', after('i', 'a'))).toThrow('"sh" is not taught yet');
  });

  it('marks the first tile after a break, and no other', () => {
    const tiles = parseWord('rab|bit', after('a', 'i', 'bb'));
    expect(tiles.map((tile) => Boolean(tile.gap))).toEqual([false, false, false, true, false, false]);
  });

  it('gives a stage the sound it prefers when a group makes two', () => {
    const known = after('ow:oh', 'ow:ow');
    expect(spoken(parseWord('cow', known))).toBe('c:c ow:ow');
    expect(spoken(parseWord('snow', known, { ow: 'oh' }))).toBe('s:s n:n ow:oh');
    // a preference for a sound that is not taught is not followed
    expect(spoken(parseWord('snow', after('ow:ow'), { ow: 'oh' }))).toBe('s:s n:n ow:ow');
  });
});

describe('the silent e', () => {
  it('makes the vowel before it long and is drawn joined to it', () => {
    const tiles = parseWord('make', after('a', 'a_e'));
    expect(spoken(tiles)).toBe('m:m a:ay k:k e:-');
    expect(tiles[1]!.split).toBe('start');
    expect(tiles[3]!.split).toBe('end');
  });

  it('is refused before the stage that teaches it, because a short a and a silent e would say the wrong word', () => {
    expect(() => parseWord('make', after('a'))).toThrow('"a_e" is not taught yet');
  });

  it('is not the end of a word that ends in le after a vowel, as in mile and whole', () => {
    expect(spoken(parseWord('mile', after('i', 'i_e', 'le')))).toBe('m:m i:eye l:l e:-');
    expect(spoken(parseWord('bone', after('o', 'o_e')))).toBe('b:b o:oh n:n e:-');
  });

  it('works through a letter group and a cluster', () => {
    expect(spoken(parseWord('bathe', after('a', 'th', 'a_e')))).toBe('b:b a:ay th:th e:-');
    expect(spoken(parseWord('snake', after('a', 'a_e')))).toBe('s:s n:n a:ay k:k e:-');
  });

  it('is a soft c in face, which has to be taught too', () => {
    expect(() => parseWord('face', after('a', 'a_e'))).toThrow('needs "c:s"');
    expect(spoken(parseWord('face', after('a', 'a_e', 'c:s')))).toBe('f:f a:ay c:s e:-');
  });

  it('says ee alone after a consonant, as in he, me and she, once that is taught', () => {
    expect(spoken(parseWord('me', after('e:ee')))).toBe('m:m e:ee');
    expect(spoken(parseWord('she', after('sh', 'e:ee')))).toBe('sh:sh e:ee');
    expect(() => parseWord('me', after('e'))).toThrow('needs "e:ee"');
  });

  it('says ee after a cluster of consonants too, as in the first part of pre|tend', () => {
    expect(spoken(parseWord('pre|tend', after('e', 'e:ee')))).toBe('p:p r:r e:ee t:t e:e n:n d:d');
    expect(() => parseWord('pre|tend', after('e'))).toThrow('needs "e:ee"');
  });

  it('is not guessed at in a word where it does not belong to a vowel before it', () => {
    expect(() => parseWord('tense', after('e'))).toThrow(/not a magic e/);
  });
});

describe('open vowels, y and the ends of longer words', () => {
  it('says its name at the end of a part: go, ba|by', () => {
    expect(spoken(parseWord('go', after('o:oh')))).toBe('g:g o:oh');
    expect(spoken(parseWord('ba|by', after('a', 'a:ay', 'y:ee')))).toBe('b:b a:ay b:b y:ee');
    expect(() => parseWord('go', after('o'))).toThrow('needs "o:oh"');
  });

  it('says i at the end of a word of one part and e at the end of a longer one', () => {
    expect(spoken(parseWord('my', after('y:eye', 'y:ee')))).toBe('m:m y:eye');
    expect(spoken(parseWord('happ|y', after('a', 'pp', 'y:eye', 'y:ee')))).toBe('h:h a:a pp:p y:ee');
    expect(spoken(parseWord('cit|y', after('i', 'y:ee', 'c:s')))).toBe('c:s i:i t:t y:ee');
  });

  it('is a consonant before a vowel, and before a group that begins with one', () => {
    expect(spoken(parseWord('yes', after('e')))).toBe('y:y e:e s:s');
    expect(spoken(parseWord('yawn', after('aw')))).toBe('y:y aw:aw n:n');
    expect(spoken(parseWord('yard', after('ar')))).toBe('y:y ar:ar d:d');
  });

  it('asks the author to write the tiles when a y is between consonants', () => {
    expect(() => parseWord('gym', after('y:eye'))).toThrow(/write its tiles/);
  });

  it('says the hard g before e, i and y until the soft g is taught, and asks for the tiles after', () => {
    expect(spoken(parseWord('get', after('e')))).toBe('g:g e:e t:t');
    expect(spoken(parseWord('gift', after('i')))).toBe('g:g i:i f:f t:t');
    expect(() => parseWord('get', after('e', 'g:j'))).toThrow(/soft or hard/);
    expect(spoken(parseWord('get=g.e.t', after('e', 'g:j')))).toBe('g:g e:e t:t');
    expect(spoken(parseWord('gem=g:j.e.m', after('e', 'g:j')))).toBe('g:j e:e m:m');
  });

  it('always asks for the tiles of a g and e that end a word, which is soft: age, page', () => {
    expect(() => parseWord('page', after('a', 'a_e'))).toThrow(/soft or hard/);
    expect(spoken(parseWord('page=p.a:ay.g:j.e:-', after('a', 'a_e', 'g:j')))).toBe('p:p a:ay g:j e:-');
  });

  it('ends a word with le as a tile of its own, after a consonant', () => {
    const tiles = parseWord('ta|ble', after('a:ay', 'le'));
    expect(spoken(tiles)).toBe('t:t a:ay b:b le:l');
    expect(tiles[2]!.gap).toBe(true);
    expect(spoken(parseWord('app|le', after('a', 'pp', 'le')))).toBe('a:a pp:p le:l');
  });

  it('makes an ending of ing one tile, and asks for the tiles of ed', () => {
    expect(spoken(parseWord('jump|ing', after('u', 'ing')))).toBe('j:j u:u m:m p:p ing:ing');
    expect(() => parseWord('jump|ed', after('u'))).toThrow(/ed/);
    expect(spoken(parseWord('jump|ed=j.u.m.p|ed:t', after('u', 'ed:t')))).toBe('j:j u:u m:m p:p ed:t');
  });
});

describe('a word whose tiles are written out', () => {
  it('may name the sound of a tile', () => {
    expect(spoken(parseWord('snow=s.n.ow:oh', after('ow:oh')))).toBe('s:s n:n ow:oh');
  });

  it('may only name a sound that is taught', () => {
    expect(() => parseWord('snow=s.n.ow:oh', after('ow:ow'))).toThrow('needs "ow:oh"');
  });

  it('must spell the word', () => {
    expect(() => parseWord('cat=c.a.p', after('a'))).toThrow(/do not spell/);
  });

  it('writes a magic e as a tile with no sound, and only where a split digraph is taught', () => {
    expect(spoken(parseWord('make=m.a:ay.k.e:-', after('a', 'a_e')))).toBe('m:m a:ay k:k e:-');
    expect(() => parseWord('make=m.a:ay.k.e:-', after('a'))).toThrow();
    expect(() => parseWord('cat=c.a.t:-', after('a', 'a_e'))).toThrow(/silent tile/);
  });

  it('writes a silent e as the last tile of a part, after a consonant, and as nothing else', () => {
    const known = after('a', 'a:ay', 'a_e', 'ou');
    expect(() => parseWord('makk=m.a:ay.k.k:-', known)).toThrow(/silent tile/);
    expect(() => parseWord('make=m.a:ay.e:-.k', known)).toThrow(/silent tile/);
    // an e that says nothing and is not the last tile has no place, even after a consonant
    expect(() => parseWord('makek=m.a:ay.k.e:-.k', known)).toThrow(/silent tile/);
    expect(() => parseWord('toe=t.o:oh.e:-', after('o:oh', 'o_e'))).toThrow(/silent tile/);
  });

  it('draws the silent e joined only when it makes the vowel before it long and that is taught', () => {
    const joined = parseWord('make=m.a:ay.k.e:-', after('a', 'a_e'));
    expect(joined.map((tile) => tile.split ?? '')).toEqual(['', 'start', '', 'end']);
    const apart = parseWord('make=m.a:ay.k.e:-', after('a', 'a:ay'));
    expect(apart.map((tile) => tile.split ?? '')).toEqual(['', '', '', '']);
    // a short vowel keeps its sound, as in have, and the e is only silent
    const have = parseWord('have=h.a.v.e:-', after('a', 'a_e'));
    expect(spoken(have)).toBe('h:h a:a v:v e:-');
    expect(have.map((tile) => tile.split ?? '')).toEqual(['', '', '', '']);
    expect(spoken(parseWord('house=h.ou.s.e:-', after('ou')))).toBe('h:h ou:ow s:s e:-');
  });

  it('says a long u as yoo or as oo, which a word has to say', () => {
    const known = after('u', 'u_e');
    expect(spoken(parseWord('cute=c.u:yoo.t.e:-', known))).toBe('c:c u:yoo t:t e:-');
    expect(spoken(parseWord('rule=r.u:oo.l.e:-', known))).toBe('r:r u:oo l:l e:-');
    expect(spoken(parseWord('cute', known))).toBe('c:c u:yoo t:t e:-');
    expect(() => parseWord('rule=r.u:oo.l.e:-', after('u'))).toThrow(/not a sound|not taught|needs/);
  });

  it('refuses a name that is not a sound, and a break in a different place from the tiles', () => {
    expect(() => parseWord('cat=c.a:zz.t', after('a'))).toThrow(/not a sound/);
    expect(() => parseWord('rab|bit=r.a.b.b.i.t', after('a', 'i'))).toThrow(/different place/);
  });
});

describe('words that cannot be sounded out', () => {
  it('are spelled by the names of their letters', () => {
    expect(nameTiles('said').map((tile) => `${tile.letters}${tile.name ? '!' : ''}${tile.sound}`)).toEqual([
      's!null',
      'a!null',
      'i!null',
      'd!null',
    ]);
  });

  it('have an id of their letters, and so does a word with marks', () => {
    expect(idOf('rab|bit')).toBe('rabbit');
    expect(idOf('snow=s.n.ow:oh')).toBe('snow');
    expect(idOf('cat')).toBe('cat');
  });
});
