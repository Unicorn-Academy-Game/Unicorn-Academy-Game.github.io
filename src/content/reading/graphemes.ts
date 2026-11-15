import type { SoundId } from './sounds';

/**
 * Which sounds each letter or group of letters can make in the words of the course, the usual one
 * first. What a stage lets a tile say is a choice from this table, so a word cannot be asked before
 * the stage that teaches what is in it.
 */
export const GRAPHEMES: Readonly<Record<string, readonly SoundId[]>> = {
  // single letters
  a: ['a', 'ay', 'aw'],
  b: ['b'],
  c: ['c', 's'],
  d: ['d'],
  e: ['e', 'ee', 'i'],
  f: ['f'],
  g: ['g', 'j'],
  h: ['h'],
  i: ['i', 'eye'],
  j: ['j'],
  k: ['k'],
  l: ['l'],
  m: ['m'],
  n: ['n'],
  o: ['o', 'oh'],
  p: ['p'],
  r: ['r'],
  s: ['s', 'z'],
  t: ['t'],
  u: ['u', 'yoo', 'uu'],
  v: ['v'],
  w: ['w'],
  x: ['x'],
  y: ['y', 'ee', 'eye'],
  z: ['z'],
  // a double letter makes the one sound
  bb: ['b'],
  dd: ['d'],
  ff: ['f'],
  gg: ['g'],
  ll: ['l'],
  mm: ['m'],
  nn: ['n'],
  pp: ['p'],
  rr: ['r'],
  ss: ['s'],
  tt: ['t'],
  zz: ['z'],
  // two or three letters that make a sound of their own
  sh: ['sh'],
  ch: ['ch'],
  th: ['th'],
  wh: ['w'],
  ph: ['f'],
  ck: ['k'],
  ng: ['ng'],
  nk: ['nk'],
  qu: ['q'],
  kn: ['n'],
  wr: ['r'],
  tch: ['ch'],
  dge: ['j'],
  // vowels that work together
  ai: ['ay'],
  ay: ['ay'],
  ee: ['ee'],
  ea: ['ee', 'e'],
  oa: ['oh'],
  oo: ['oo', 'uu'],
  ou: ['ow'],
  ow: ['ow', 'oh'],
  oi: ['oy'],
  oy: ['oy'],
  aw: ['aw'],
  au: ['aw'],
  igh: ['eye'],
  ie: ['eye', 'ee'],
  ey: ['ee'],
  ue: ['oo', 'yoo'],
  ew: ['oo', 'yoo'],
  // a vowel and an r, and the vowel with an r and a silent e
  ar: ['ar'],
  or: ['or'],
  er: ['er'],
  ir: ['er'],
  ur: ['er'],
  air: ['air'],
  are: ['air'],
  ore: ['or'],
  // the end of a longer word
  le: ['l'],
  ing: ['ing'],
  ed: ['t', 'd'],
};

/** The vowel letters, which are the ones a silent e can make long. */
const SPLITS = ['a_e', 'i_e', 'o_e', 'u_e'] as const;
type Split = (typeof SPLITS)[number];

/** Letter groups that only count at the end of a part of a longer word. */
export const ENDINGS: readonly string[] = ['le', 'ing', 'ed'];

/**
 * What a word may be made of at some point in the course: the sounds each group of letters may say,
 * and the split digraphs that are known.
 */
export interface Taught {
  readonly pairs: ReadonlyMap<string, ReadonlySet<SoundId>>;
  readonly splits: ReadonlySet<string>;
}

/**
 * What the player knows before the first stage: the consonants, each with its usual sound. The
 * vowels and every group of letters are taught later.
 */
export const START_TAUGHT: Taught = {
  pairs: new Map<string, ReadonlySet<SoundId>>(
    [...'bcdfghjklmnprstvwxyz'].map((letter) => [letter, new Set<SoundId>([GRAPHEMES[letter]![0]!])] as const),
  ),
  splits: new Set(),
};

export class CourseError extends Error {}

const isSplit = (key: string): key is Split => (SPLITS as readonly string[]).includes(key);

/**
 * What is known once a stage has taught its `keys`. A key is a group of letters (`sh`), which
 * brings the sound it usually makes, a group with the sound it makes here (`ow:oh`), or a split
 * digraph (`a_e`). Anything else is a mistake and is thrown.
 */
export function teach(known: Taught, keys: readonly string[]): Taught {
  const pairs = new Map([...known.pairs].map(([group, sounds]) => [group, new Set(sounds)] as const));
  const splits = new Set(known.splits);
  for (const key of keys) {
    if (isSplit(key)) {
      splits.add(key);
      continue;
    }
    const [group = '', named] = key.split(':');
    const sounds = GRAPHEMES[group];
    if (!sounds) throw new CourseError(`"${key}" teaches a group of letters that is not in the table`);
    const sound = (named ?? sounds[0]) as SoundId;
    if (!sounds.includes(sound)) throw new CourseError(`"${key}" teaches a sound that "${group}" does not make`);
    const have = pairs.get(group) ?? new Set<SoundId>();
    have.add(sound);
    pairs.set(group, have);
  }
  return { pairs, splits };
}
