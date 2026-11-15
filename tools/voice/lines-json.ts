import { ALL_CLIPS } from '../../src/learning/course-clips';

/**
 * What the voice generator reads: every clip the game can ask for, with the words as the card shows
 * them (`text`) and, when the voice should be told something different to say it well, the words as
 * they are spoken (`say`). The game writes this list and the generator only reads it, so the two
 * cannot disagree about what exists.
 */
export const linesJson = (): string => `[\n${ALL_CLIPS.map((clip) => `  ${JSON.stringify(clip)}`).join(',\n')}\n]\n`;
