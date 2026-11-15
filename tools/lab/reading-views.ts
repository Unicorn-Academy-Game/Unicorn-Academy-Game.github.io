import { CHAPTERS, readLine, readWord, STAGES } from '../../src/content/reading';
import type {
  Band,
  ChapterView,
  DoneView,
  Earned,
  HomeView,
  ItemView,
  MapView,
  StageView,
} from '../../src/game/reading-ports';
import { piecesOf, stageView } from '../../src/game/reading-views';
import { emptyProfile, type LearnerProfile, raiseFloor } from '../../src/learning';
import {
  captionOf,
  courseState,
  currentStage,
  lineItem,
  PROMPTS,
  prizeOf,
  type ReadItem,
  treasureOf,
  withItem,
  wordItem,
  wordsOf,
} from '../../src/learning/reading';
import type { Progress } from '../../src/shared/learning';

/**
 * Views of the reading screen made from the course alone, without a session, so every state of the
 * screen can be put up at once and looked at. Each is the view the session would send for that
 * state: the pieces and the stages are made by the same functions (`src/game/reading-views.ts`).
 */

const READ_WELL: Progress = {
  level: 4,
  best: 4,
  streak: 2,
  struggles: 0,
  due: 0,
  done: 3,
  clean: 3,
  slips: 0,
  first: 0,
  last: 0,
};

/** The player's book with every stage below `stage` cleared, and these ones read to the end. */
export function bookAt(stage: number, mastered: readonly number[] = []): LearnerProfile {
  let book = raiseFloor(emptyProfile(), stage);
  for (const n of mastered) {
    const s = STAGES[n - 1]!;
    for (const word of wordsOf(s)) book = withItem(book, wordItem(word, undefined), READ_WELL);
    for (const line of s.lines) book = withItem(book, lineItem(line, undefined), READ_WELL);
  }
  return book;
}

const stages = (book: LearnerProfile): StageView[] => {
  const current = currentStage(book);
  return courseState(book).map((state) => stageView(state, current));
};

const itemOf = (scene: { word?: string; line?: string }): ReadItem => {
  if (scene.line !== undefined) {
    const line = readLine(scene.line);
    if (!line) throw new Error(`there is no sentence ${scene.line}`);
    return lineItem(line, undefined);
  }
  const word = readWord(scene.word ?? 'cat');
  if (!word) throw new Error(`there is no word ${scene.word}`);
  return wordItem(word, undefined);
};

export interface ItemScene {
  word?: string;
  line?: string;
  phase?: ItemView['phase'];
  touched?: number;
  glowing?: number | null;
  stage?: number;
  earned?: Partial<Earned>;
  hint?: boolean;
  canHelp?: boolean;
  speech?: boolean;
  bands?: Band[];
  deal?: number;
  cue?: ItemView['cue'];
}

export function itemView(scene: ItemScene): ItemView {
  const item = itemOf(scene);
  const pieces = piecesOf(item);
  const phase = scene.phase ?? 'touching';
  const touched = scene.touched ?? (phase === 'touching' ? 0 : pieces.length);
  const book = bookAt(scene.stage ?? 7);
  const stage = stages(book)[(scene.stage ?? 7) - 1]!;
  const word = item.kind === 'word';
  const saying = phase === 'saying';
  const speech = scene.speech ?? true;
  const said = saying ? [word ? PROMPTS.say.id : PROMPTS.together.id] : [word ? PROMPTS.touch.id : PROMPTS.words.id];
  const caption = phase === 'found' ? (scene.earned?.text ?? 'Hooray! Well read!') : captionOf(said);
  return {
    screen: 'item',
    deal: scene.deal ?? 1,
    kind: item.kind,
    pieces,
    touched,
    glowing: scene.glowing ?? null,
    phase,
    caption,
    bands: scene.bands ?? ['read', 'read', 'now', 'ahead', 'ahead', 'ahead', 'ahead'],
    stage,
    chapter: CHAPTERS.find((chapter) => chapter.id === stage.chapter)!.title,
    canHelp: scene.canHelp ?? phase === 'touching',
    canHear: saying && speech,
    canShow: saying && word,
    canApprove: saying,
    canAskAgain: saying,
    speech,
    hint: scene.hint && saying ? PROMPTS.tick.text : null,
    earned:
      phase === 'found'
        ? earnedOf({
            text: caption,
            told: false,
            clean: false,
            reads: false,
            cleared: null,
            chapter: null,
            everything: false,
            ...scene.earned,
          })
        : null,
    cue: scene.cue ?? null,
  };
}

/** What was earned, with what the level it cleared paid. */
const earnedOf = (earned: Omit<Earned, 'prize'>): Earned => ({
  ...earned,
  prize: earned.cleared === null ? null : prizeOf(earned.cleared),
});

export function homeView(scene: { stage?: number; first?: boolean; words?: number; lines?: number } = {}): HomeView {
  const n = scene.stage ?? 7;
  const stage = stages(bookAt(n))[n - 1]!;
  const first = scene.first ?? false;
  return {
    screen: 'home',
    stage,
    chosen: false,
    chapter: CHAPTERS.find((chapter) => chapter.id === stage.chapter)!.title,
    words: scene.words ?? 84,
    reads: 40,
    lines: scene.lines ?? 9,
    treasure: first ? [] : treasureOf(Array.from({ length: n - 1 }, (_, i) => i + 1)),
    firstEver: first,
    caption: first ? PROMPTS.welcome.text : '',
    speech: true,
  };
}

export function mapView(scene: { stage?: number; mastered?: number[] } = {}): MapView {
  const n = scene.stage ?? 14;
  const all = stages(bookAt(n, scene.mastered ?? [1, 2]));
  const chapters: ChapterView[] = CHAPTERS.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    stages: all.filter((stage) => stage.chapter === chapter.id),
  }));
  return { screen: 'map', chapters, current: n, picked: n };
}

export function doneView(
  scene: {
    stage?: number;
    read?: number;
    fresh?: number;
    cleared?: number | null;
    chapter?: string | null;
    everything?: boolean;
  } = {},
): DoneView {
  const n = scene.stage ?? 7;
  const read = scene.read ?? 5;
  const bands: Band[] = Array.from({ length: 7 }, (_, i) => (i < read ? 'read' : 'skipped'));
  return {
    screen: 'done',
    bands,
    read,
    fresh: scene.fresh ?? 3,
    caption: 'That was a great round!',
    stage: stages(bookAt(n))[n - 1]!,
    cleared: scene.cleared ?? null,
    prize: scene.cleared === undefined || scene.cleared === null ? null : prizeOf(scene.cleared),
    chapter: scene.chapter ?? null,
    everything: scene.everything ?? false,
    speech: true,
  };
}

/**
 * The longest things the course asks the player to read, which the layout has to hold.
 * `tests/tools/reading-lab.test.ts` holds each of these to the course.
 */
export const LONGEST = {
  /** A word with the most letters and a gap in it, so about as wide as a word can be written. */
  word: 'strawberry',
  /** A word with the most pieces to touch, which is the most rows a word can break into. */
  manyTiles: 'beautiful',
  /** The longest sentence. */
  line: [...STAGES.flatMap((stage) => stage.lines)].sort((a, b) => b.text.length - a.text.length)[0]!.id,
  /**
   * The sentence with the longest single word in it, which is the widest one tile of a sentence can
   * be.
   */
  wordLine: [...STAGES.flatMap((stage) => stage.lines)].sort(
    (a, b) => Math.max(...b.words.map((w) => w.length)) - Math.max(...a.words.map((w) => w.length)),
  )[0]!.id,
  /** The shortest sentence. */
  shortLine: [...STAGES.flatMap((stage) => stage.lines)].sort((a, b) => a.text.length - b.text.length)[0]!.id,
} as const;
