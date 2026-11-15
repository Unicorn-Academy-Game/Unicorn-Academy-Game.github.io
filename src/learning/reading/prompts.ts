import { CHAPTERS } from '../../content/reading';
import type { ChapterId } from '../../content/reading/types';
import type { Clip, ClipId } from '../lines';

/**
 * What the reading computer says that is not a word, a sound or a sentence of the course. The
 * screen writes the same words as the voice says, since each is one clip with its text beside it,
 * and the tools that make the voice read this list too (`course-clips.ts`). Nothing here says a try
 * was wrong. A word that is told to the player is a word we will do again.
 */
export interface Prompt {
  readonly id: ClipId;
  readonly text: string;
}

export const PROMPTS = {
  /** The first time the player ever comes. */
  welcome: { id: 'read.welcome', text: 'Welcome to the reading computer!' },
  /** A new word, before its tiles are touched. */
  touch: { id: 'read.touch', text: 'Touch each letter.' },
  /** A sentence, before its words are touched. */
  words: { id: 'read.words', text: 'Touch each word as you read it.' },
  /** The tiles of a word have joined. */
  say: { id: 'read.say', text: 'Now say it out loud!' },
  /** The words of a sentence are all touched. */
  together: { id: 'read.together', text: 'Now read it all together!' },
  /** The first time the player ever gets here, after they are asked to say it. */
  tick: { id: 'read.tick', text: 'Then tap the tick!' },
  /** The player asked for once more. */
  again: { id: 'read.again', text: "Let's try that once more." },
  /** Before a word or a sentence is said to the player, because it was asked for twice. */
  told: { id: 'read.told', text: 'Listen.' },
  /** A stage is cleared. */
  level: { id: 'read.level', text: 'You cleared the level!' },
  /** The last stage of the course is cleared. */
  course: { id: 'read.course', text: 'You have read every level!' },
} as const satisfies Readonly<Record<string, Prompt>>;

/** A chapter is finished: "You finished the Meadow!". */
export const chapterPrompt = (id: ChapterId): Prompt => ({
  id: `read.${id}`,
  text: `You finished ${CHAPTERS.find((chapter) => chapter.id === id)!.title.replace(/^The /, 'the ')}!`,
});

/** Every prompt, in the order the clips are made in. */
export const ALL_PROMPTS: readonly Prompt[] = [
  ...Object.values(PROMPTS),
  ...CHAPTERS.map((chapter) => chapterPrompt(chapter.id)),
];

export const asClip = (prompt: Prompt): Clip => ({ id: prompt.id, text: prompt.text });
