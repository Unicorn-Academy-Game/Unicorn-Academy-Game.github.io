/**
 * The learning engine. It decides what to ask the player to spell and when, runs a spell, and says
 * what they earned, and it is pure: the clock and chance are handed in, so everything here can be
 * tested without a screen. What the screen does with it lives in the game and the interface.
 */

export {
  emptyProfile,
  type LearnerProfile,
  MAX_SENTENCES,
  MAX_WORDS,
  mergeProfiles,
  mergeProgress,
  progressOf,
  raiseFloor,
  readProfile,
  sameProfile,
  sentenceProgress,
  withProgress,
  withSentence,
} from '../shared/profile';
export { type Card, cardOf, chapters, READS_FROM, readsWord, tally, tricky } from './book';
export { type BookFile, exportBook, MAX_BOOK_CHARS, parseBookFile } from './exchange';
export { finish, MILESTONE_EVERY, type Occasion, occasionOf, type Reward, type Worth } from './finish';
export { ALPHABET, asLetter, bankFor, DECOYS, keysFor, LAYOUTS } from './keys';
export { LADDERS, stepOf } from './ladders';
export { LEVELS, levelOf, type Model, READ_RUNGS, RUNGS, type RungId, readRungAt, rungAt, START_LEVEL } from './levels';
export {
  CHEERS,
  CLIPS,
  type ClipId,
  letterClip,
  MILESTONES,
  numberWords,
  numeralClip,
  saysWord,
  soundClip,
  textOf,
  wordClip,
} from './lines';
export { type Attempt, isClean, isDue, isNew, learn, STARS_PER_WORD, type Stars, starsOf } from './mastery';
export {
  type Context,
  ended,
  GAP,
  NO_PACE,
  type Offer,
  offerFor,
  offerForWord,
  type Pace,
  practiceOffer,
  SNOOZE,
  type SpellOffer,
} from './offers';
export { type Chart, chartOf, routeTo } from './places';
export { opening, praise, readDone, readPraise, readStart, wordSaid } from './say';
export {
  attemptOf,
  begin,
  HELP_AFTER,
  help,
  isDone,
  litKey,
  nextLetter,
  type Outcome,
  press,
  type Spelling,
} from './spell';
