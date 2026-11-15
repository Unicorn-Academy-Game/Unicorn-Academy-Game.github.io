import { WORD_IDS } from '../content/lexicon';
import { READ_LINES, READ_WORDS } from '../content/reading';
import { GROUP_SOUND_TEXT, GROUP_SOUNDS, type GroupSound } from '../content/reading/sounds';
import { CLIPS, type Clip, type ClipId } from './lines';
import { PLAY_CLIPS } from './play/clips';
import { ALL_PROMPTS, asClip } from './reading/prompts';

/**
 * What the voice says for the reading course, apart from what the game already says. It lives here
 * and not in `lines.ts` so that the game does not carry the whole course to know its own clips: the
 * course is a chunk of its own, loaded when the reading computer is first used, and the tools that
 * make and check the voice read this list too.
 */

/**
 * What a group of letters sounds like by itself, as in "sh". The letters have theirs already
 * (`soundClip`).
 */
export const groupSoundClip = (sound: GroupSound): ClipId => `sound.${sound}`;
/**
 * A word of the course said on its own. The words of the Spell Book have the same clips
 * (`wordClip`), so a word that is in both is one clip.
 */
export const readWordClip = (id: string): ClipId => `word.${id}`;
/** A sentence of the course, read through. It is named by its words, as the sentence is. */
export const lineClip = (id: string): ClipId => `line.${id}`;

const OF_THE_BOOK: ReadonlySet<string> = new Set(WORD_IDS);

/**
 * Every clip the course needs that the game did not already have, in the order the files are made
 * in. New words go on the end of the words.
 */
const COURSE_CLIPS: readonly Clip[] = [
  ...GROUP_SOUNDS.map((sound): Clip => ({ id: groupSoundClip(sound), text: GROUP_SOUND_TEXT[sound] })),
  ...ALL_PROMPTS.map(asClip),
  ...READ_WORDS.filter((word) => !OF_THE_BOOK.has(word.id)).map(
    (word): Clip => ({ id: readWordClip(word.id), text: `${word.id}.` }),
  ),
  ...READ_LINES.map((line): Clip => ({ id: lineClip(line.id), text: line.text })),
  ...PLAY_CLIPS,
];

/** Every clip the voice makes: the game's, then the course's. */
export const ALL_CLIPS: readonly Clip[] = [...CLIPS, ...COURSE_CLIPS];
