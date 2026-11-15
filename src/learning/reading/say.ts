import { CHAPTERS } from '../../content/reading';
import { isLetterSound, isLongVowel, LONG_VOWELS } from '../../content/reading/sounds';
import type { Tile } from '../../content/reading/types';
import { groupSoundClip, lineClip, readWordClip } from '../course-clips';
import {
  CHEERS,
  type ClipId,
  cheerClip,
  letterClip,
  READ_DONE_CLIP,
  READ_START_CLIP,
  READS_CLIP,
  soundClip,
  textOf,
} from '../lines';
import type { Reward } from './finish';
import type { Reading } from './item';
import type { ReadItem } from './items';
import { ALL_PROMPTS, chapterPrompt, PROMPTS } from './prompts';

/**
 * What the voice says while the player reads. It is warm and short, it always says the word, and it
 * never says a try was wrong. A line is a list of clips that are played one after another, and
 * chance only picks between kind words: `random` returns a number from 0 up to but not including 1.
 */

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** The clip that says a word or a sentence all the way through. */
export const itemClip = (item: ReadItem): ClipId =>
  item.kind === 'word' ? readWordClip(item.word.id) : lineClip(item.line.id);

/**
 * The clip a tile plays when it is touched, or none for a letter that makes no sound, like the e
 * that makes the vowel before it long. A tile of a word that cannot be sounded out says the name of
 * its letter. A long vowel says the name of its letter too, which is what a long a is called.
 */
export function tileClip(tile: Tile): ClipId | null {
  if (tile.name) return letterClip(tile.letters);
  if (tile.sound === null) return null;
  if (isLetterSound(tile.sound)) return soundClip(tile.sound);
  if (isLongVowel(tile.sound)) return letterClip(LONG_VOWELS[tile.sound]);
  return groupSoundClip(tile.sound);
}

/**
 * Said when the player sits down at the home screen. The first time they ever come it says hello.
 */
export const homeOpening = (firstEver: boolean): ClipId[] => (firstEver ? [PROMPTS.welcome.id] : []);

/** Said when a round begins. */
export const roundOpening = (): ClipId[] => [READ_START_CLIP];

/**
 * Said when a thing to read comes up: what to do with a word the player has not met, and with the
 * first sentence of a round. The words they know need no telling.
 */
export const itemOpening = (item: ReadItem, first: boolean): ClipId[] => {
  if (item.kind === 'line') return first ? [PROMPTS.words.id] : [];
  return first && !item.review ? [PROMPTS.touch.id] : [];
};

/**
 * Said when the last tile or word is touched. A word that the level says aloud is said first, and
 * then what to do. The first time the player ever gets here, they are told what to tap when they
 * have said it.
 */
export function joined(reading: Reading, item: ReadItem, firstEver: boolean): ClipId[] {
  const what =
    item.kind === 'word' ? [...(reading.heard ? [itemClip(item)] : []), PROMPTS.say.id] : [PROMPTS.together.id];
  return firstEver ? [...what, PROMPTS.tick.id] : what;
}

/** Said when the player asks for once more, before it is shown to them. */
export const askedAgain = (): ClipId[] => [PROMPTS.again.id];

/** Said when it is told to the player because it was asked for twice. */
export const told = (item: ReadItem): ClipId[] => [PROMPTS.told.id, itemClip(item)];

/**
 * Said when the player says they said it. A cheer and the word or the sentence. A word they now
 * read on their own is told so in place of the cheer. A stage that was cleared, the chapter it
 * ended and the whole course are told after.
 */
export function praise(reward: Reward, random: () => number): ClipId[] {
  const said = reward.reads
    ? [itemClip(reward.item), READS_CLIP]
    : [cheerClip(pick(CHEERS, random)), itemClip(reward.item)];
  if (reward.everything) return [...said, PROMPTS.course.id];
  if (reward.chapter) return [...said, chapterPrompt(reward.chapter.id).id];
  if (reward.cleared !== null) return [...said, PROMPTS.level.id];
  return said;
}

/** Said when the last of a round is read. */
export const roundDone = (): ClipId[] => [READ_DONE_CLIP];

const PROMPT_TEXT: ReadonlyMap<ClipId, string> = new Map(ALL_PROMPTS.map((prompt) => [prompt.id, prompt.text]));

/**
 * What a line that was said is written as, so the screen says what the voice says. The word or the
 * sentence is left out, since it is on the screen already: what is left is the cheer and the
 * prompts.
 */
export const captionOf = (clips: readonly ClipId[]): string =>
  clips
    .filter((clip) => !clip.startsWith('word.') && !clip.startsWith('line.'))
    .map((clip) => PROMPT_TEXT.get(clip) ?? textOf(clip))
    .join(' ');

/** The prompts that say a level was cleared, a chapter ended or the course was read. */
const MILESTONES: ReadonlySet<ClipId> = new Set([
  PROMPTS.level.id,
  PROMPTS.course.id,
  ...CHAPTERS.map((chapter) => chapterPrompt(chapter.id).id),
]);

/**
 * What praise is written as under a word the player read: the cheer. The level, the chapter or the
 * course the player finished is a banner of its own, and is not written twice.
 */
export const praiseCaption = (clips: readonly ClipId[]): string =>
  captionOf(clips.filter((clip) => !MILESTONES.has(clip)));
