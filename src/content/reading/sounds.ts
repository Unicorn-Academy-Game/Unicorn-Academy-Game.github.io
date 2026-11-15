/**
 * Every sound a tile of the reading computer can say, and the clip that says it. A tile is one
 * touch: a letter, or a group of letters that make one sound (sh, igh). The sound is what a child
 * is taught the letters say, so `b` says "buh" and `sh` says "shh", and not what the letters are
 * called.
 *
 * Three kinds of sound, which differ only in where the clip comes from:
 * - the sound each of the 26 letters makes at the start of a word, which the spelling card already
 *   plays (`sound.b`);
 * - the sounds of letter groups, which have clips of their own, cut by `tools/voice/sounds.py` the
 *   way the letters are;
 * - the long vowels, which say the name of the letter (a long a is "ay"), so they use the clip of
 *   the name (`letter.a`).
 */

/**
 * The sound a letter makes. `c` and `g` are the hard ones, `q` and `x` are two sounds, and `y` is
 * the consonant.
 */
const LETTER_SOUNDS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
] as const;
export type LetterSound = (typeof LETTER_SOUNDS)[number];

/** A sound that a group of letters makes, and that has a clip of its own. */
export const GROUP_SOUNDS = [
  'sh',
  'ch',
  'th',
  'ng',
  'nk',
  'oo',
  'uu',
  'ow',
  'oy',
  'aw',
  'ar',
  'or',
  'er',
  'air',
  'ing',
] as const;
export type GroupSound = (typeof GROUP_SOUNDS)[number];

/** A long vowel says the name of its letter, so each is said with the clip of that name. */
export const LONG_VOWELS = { ay: 'a', ee: 'e', eye: 'i', oh: 'o', yoo: 'u' } as const;
export type LongVowel = keyof typeof LONG_VOWELS;

export type SoundId = LetterSound | GroupSound | LongVowel;

const SOUND_IDS: readonly SoundId[] = [...LETTER_SOUNDS, ...GROUP_SOUNDS, ...(Object.keys(LONG_VOWELS) as LongVowel[])];

const SOUND_SET: ReadonlySet<string> = new Set(SOUND_IDS);
export const isSoundId = (value: string): value is SoundId => SOUND_SET.has(value);

/**
 * What each group sound is, as a child's book writes it. The voice makes it from the sound, and
 * this is what a person reads to know what the clip should be.
 */
export const GROUP_SOUND_TEXT: Readonly<Record<GroupSound, string>> = {
  sh: 'sh, as in ship',
  ch: 'ch, as in chip',
  th: 'th, as in thin',
  ng: 'ng, as in ring',
  nk: 'nk, as in pink',
  oo: 'oo, as in moon',
  uu: 'oo, as in book',
  ow: 'ow, as in cow',
  oy: 'oy, as in boy',
  aw: 'aw, as in saw',
  ar: 'ar, as in car',
  or: 'or, as in fork',
  er: 'er, as in her',
  air: 'air, as in chair',
  ing: 'ing, as in ring',
};

export const isLetterSound = (sound: SoundId): sound is LetterSound =>
  (LETTER_SOUNDS as readonly string[]).includes(sound);
export const isLongVowel = (sound: SoundId): sound is LongVowel => sound in LONG_VOWELS;
