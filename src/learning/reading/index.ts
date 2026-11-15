/**
 * The reading engine, for the computer on the lawn. It decides what to put in front of the player
 * to read and when, runs one read, and says what they earned, and it is pure like the spelling
 * engine: the clock is handed in, so everything here can be tested without a screen.
 *
 * It is a chunk of its own. The course it reads is large, so the game loads this when the computer
 * is first used, and nothing outside the reading screen, the parent's page about it and their tools
 * imports it (`tests/architecture/lazy-course.test.ts` checks).
 */

export {
  CLEAR,
  chapterEndedBy,
  courseState,
  currentStage,
  finished,
  type StageState,
  stageState,
  TRICKIEST_SHOWN,
  TRICKY_AFTER,
  totals,
  trickiest,
  wordProgress,
  wordsOf,
} from './course';
export { finishItem, type Reward } from './finish';
export { approve, askAgain, attemptOf, begin, glowing, hear, help, type Reading, show, touch } from './item';
export { idOf, keyOf, lineItem, type ReadItem, stageOf, touchesOf, withItem, wordItem } from './items';
export { GEMS, prizeOf, treasureOf } from './prizes';
export { ALL_PROMPTS, chapterPrompt, PROMPTS } from './prompts';
export { PACE_AFTER, PACES, paceOf, planRound, ROUND_SIZE, SENTENCES, SLOW_SHARE, UNLOCK } from './round';
export {
  askedAgain,
  captionOf,
  homeOpening,
  itemClip,
  itemOpening,
  joined,
  praise,
  praiseCaption,
  roundDone,
  roundOpening,
  tileClip,
  told,
} from './say';
