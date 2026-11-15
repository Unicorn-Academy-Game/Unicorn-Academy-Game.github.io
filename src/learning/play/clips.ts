import type { Clip, ClipId } from '../lines';
import { MATHS_CLIPS } from './maths/clips';

/**
 * What the voice says at the memory and maths tables, apart from the words and the cheers the game
 * already says. It is declared here and joins the rest of the voice in `course-clips.ts`, so the
 * tools that make and check the voice read it with the rest.
 */

/** Said as the memory table comes up, until the player has played a couple of games. */
export const MEMORY_START_CLIP: ClipId = 'play.memory.start';
/** Said when every pair is found. */
export const MEMORY_DONE_CLIP: ClipId = 'play.memory.done';

/**
 * The instructions of the tables, each said as it is written. They are said slowly, since each is a
 * sentence for a child who is learning to listen for the one thing to do.
 */
const PLAY_PROMPTS: Readonly<Record<ClipId, string>> = {
  [MEMORY_START_CLIP]: 'Turn over two cards. Find two that are the same.',
  [MEMORY_DONE_CLIP]: 'You found every pair!',
};

export const PLAY_CLIPS: readonly Clip[] = [
  ...Object.entries(PLAY_PROMPTS).map(([id, text]): Clip => ({ id, text })),
  ...MATHS_CLIPS,
];
