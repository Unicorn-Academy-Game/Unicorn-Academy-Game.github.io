import type { Band, DoneView, ItemView, ReadView, StageMark, StageView } from '../../../game/reading-ports';
import type { Prize } from '../../../learning/reading/prizes';

/**
 * Every word the reading screen writes or gives to a screen reader, apart from what the voice says
 * (that comes with the view, as the caption). None of it ever says that a try was wrong: a tile
 * that is not the next one only nudges, and a thing that was skipped is left for later.
 */

export const LABELS = {
  close: 'Close',
  start: 'Start',
  levels: 'Levels',
  home: 'Home',
  another: 'Another round',
  help: 'Help',
  helpSays: 'Help, show me the next one',
  hear: 'Hear it',
  show: 'Show me',
  skip: 'Skip',
  next: 'Next',
  once: 'Once more',
  yes: 'I said it',
  answers: 'When you have said it',
  pieces: 'Tiles to touch',
  words: 'Words to touch',
  bands: 'The round',
  steps: 'How to read',
  title: 'Reading',
} as const;

/** The three things that are done with a word, for the first time the player sits down. */
export const STEPS = ['Touch each letter', 'Say the word out loud', 'Tap the tick'] as const;

/** A number and what it counts, with the s when there is not one. */
export const count = (n: number, thing: string): string => `${n} ${thing}${n === 1 ? '' : 's'}`;

/** What the player has read so far, for the home screen. */
export const statsLine = (words: number, lines: number): string =>
  `${count(words, 'word')} and ${count(lines, 'sentence')} read`;

/** How a stage stands, in a few words. */
export const markLine = (mark: StageMark): string =>
  mark === 'current' ? 'Next up' : mark === 'cleared' ? 'Cleared' : mark === 'mastered' ? 'Mastered' : 'Ready to play';

/** What a stage is called to a screen reader and on its button. */
export const stageLabel = (stage: StageView): string => `Level ${stage.n}, ${stage.title}. ${markLine(stage.mark)}`;

/** How many of a stage's words the player has met. */
export const metLine = (stage: StageView): string => `${stage.met} of ${stage.words} words met`;

/** The stage in a line, for the top of the screen. */
export const levelLine = (stage: StageView, chapter: string): string => `Level ${stage.n}, ${chapter}`;

/** What a tile, or a word of a sentence, is called to a screen reader. */
export function pieceLabel(kind: ItemView['kind'], text: string, state: 'waiting' | 'touched' | 'shining'): string {
  const name = kind === 'line' ? `Word ${text}` : text.length === 1 ? `Letter ${text}` : `Letters ${text}`;
  return state === 'touched' ? `${name}, touched` : state === 'shining' ? `${name}, shining` : name;
}

/** How a round stands, for the seven bands. */
export function bandsLabel(bands: readonly Band[]): string {
  const read = bands.filter((band) => band === 'read').length;
  return `${read} of ${bands.length} read`;
}

/** What the screen is called to a screen reader. */
export function dialogLabel(view: ReadView): string {
  switch (view.screen) {
    case 'home':
      return 'Reading, start here';
    case 'map':
      return 'Reading, the levels';
    case 'item':
      return view.kind === 'word' ? 'Reading, a word' : 'Reading, a sentence';
    case 'done':
      return 'Reading, the round is over';
  }
}

/** What the end of a round says of how much the player read. */
export const roundLine = (done: DoneView): string => `You read ${done.read} of ${done.bands.length}`;

/** The new ones in a round, or nothing when none of what the player read was new. */
export const freshLine = (fresh: number): string | null => (fresh > 0 ? `${fresh} new` : null);

/**
 * What the banner says when a level was cleared, a chapter ended or the whole course was read, or
 * nothing. It is one line, the biggest of them, as the voice says one: the end of a chapter is the
 * end of a level, and the end of the course is the end of both.
 */
export function milestoneLine(cleared: number | null, chapter: string | null, everything: boolean): string | null {
  if (everything) return 'You finished the whole course!';
  if (chapter !== null) return `You finished ${chapter}!`;
  return cleared !== null ? `Level ${cleared} cleared!` : null;
}

const GEM_NAMES = {
  diamond: ['diamond', 'diamonds'],
  emerald: ['emerald', 'emeralds'],
  ruby: ['ruby', 'rubies'],
  sapphire: ['sapphire', 'sapphires'],
  gold: ['gold coin', 'gold coins'],
} as const;

/** What a prize is, as the player would say it: "7 diamonds". */
export const prizeName = (prize: Prize): string => `${prize.count} ${GEM_NAMES[prize.gem][prize.count === 1 ? 0 : 1]}`;

/** What a level promises before it is played, and says once it has paid. */
export const promiseLine = (stage: StageView): string =>
  stage.won ? `You won ${prizeName(stage.prize)} here!` : `Finish this level to win ${prizeName(stage.prize)}!`;

/** What the player has won all together, for a screen reader. */
export const treasureLabel = (treasure: readonly Prize[]): string =>
  `Your treasure: ${treasure.map(prizeName).join(', ')}`;

/** What the banner says when a level paid. */
export const wonLine = (prize: Prize): string => `You won ${prizeName(prize)}!`;

/**
 * What a screen reader is told when the screen changes to this view: the caption, and what the
 * player earned if it is read.
 */
export function announcement(view: ReadView): string {
  switch (view.screen) {
    case 'home':
      return view.firstEver
        ? `${LABELS.title}. ${STEPS.join('. ')}.`
        : `${LABELS.title}. ${levelLine(view.stage, view.chapter)}.`;
    case 'map':
      return 'The levels. Choose what to work on.';
    case 'done':
      return `${view.caption} ${roundLine(view)}.${view.prize ? ` ${wonLine(view.prize)}` : ''}`;
    case 'item':
      if (view.earned)
        return [
          view.earned.text,
          milestoneLine(view.earned.cleared, view.earned.chapter, view.earned.everything),
          view.earned.prize ? wonLine(view.earned.prize) : null,
        ]
          .filter(Boolean)
          .join(' ');
      return view.phase === 'touching'
        ? `${view.caption} ${view.pieces.map((piece) => piece.text).join(view.kind === 'word' ? ', ' : ' ')}`
        : view.caption;
  }
}
