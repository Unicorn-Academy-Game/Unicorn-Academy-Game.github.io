import { describe, expect, it } from 'vitest';
import type {
  Band,
  DoneView,
  Earned,
  HomeView,
  ItemView,
  MapView,
  Piece,
  ReadView,
  StageMark,
  StageView,
} from '../../../game/reading-ports';
import {
  announcement,
  bandsLabel,
  count,
  dialogLabel,
  freshLine,
  LABELS,
  levelLine,
  markLine,
  metLine,
  milestoneLine,
  pieceLabel,
  prizeName,
  promiseLine,
  roundLine,
  STEPS,
  stageLabel,
  statsLine,
  treasureLabel,
  wonLine,
} from './text';

/** Words that tell a child they were wrong, and that a young child should not meet on a screen. */
const UNKIND = /\b(wrong|fail|failed|failure|bad|no|incorrect|mistakes?|errors?|oops|sorry|lose|lost|try again)\b/i;

const MARKS: readonly StageMark[] = ['open', 'current', 'cleared', 'mastered'];

const stage = (over: Partial<StageView> = {}): StageView => ({
  n: 7,
  title: 'The Pond',
  chapter: 'pond',
  samples: ['frog', 'pond'],
  mark: 'current',
  met: 3,
  words: 20,
  prize: { gem: 'diamond', count: 7 },
  won: false,
  ...over,
});
const tile = (text: string, over: Partial<Piece> = {}): Piece => ({
  text,
  silent: false,
  split: null,
  gap: false,
  ...over,
});
const BANDS: readonly Band[] = ['read', 'read', 'skipped', 'now', 'ahead', 'ahead', 'ahead'];

const item = (over: Partial<ItemView> = {}): ItemView => ({
  screen: 'item',
  deal: 1,
  kind: 'word',
  pieces: [tile('c'), tile('a'), tile('t')],
  touched: 0,
  glowing: null,
  phase: 'touching',
  caption: 'Touch each letter.',
  bands: BANDS,
  stage: stage(),
  chapter: 'The Pond',
  canHelp: true,
  canHear: true,
  canShow: true,
  canApprove: false,
  canAskAgain: false,
  speech: true,
  hint: null,
  earned: null,
  cue: null,
  ...over,
});

const earned = (over: Partial<Earned> = {}): Earned => ({
  text: 'Hooray! Well read!',
  told: false,
  clean: false,
  reads: false,
  cleared: null,
  prize: null,
  chapter: null,
  everything: false,
  ...over,
});
const home = (over: Partial<HomeView> = {}): HomeView => ({
  screen: 'home',
  stage: stage(),
  chosen: false,
  chapter: 'The Pond',
  words: 12,
  reads: 5,
  lines: 3,
  treasure: [],
  firstEver: false,
  caption: '',
  speech: true,
  ...over,
});
const done = (over: Partial<DoneView> = {}): DoneView => ({
  screen: 'done',
  bands: BANDS,
  read: 5,
  fresh: 2,
  caption: 'Well done!',
  stage: stage(),
  cleared: null,
  prize: null,
  chapter: null,
  everything: false,
  speech: true,
  ...over,
});
const map: MapView = {
  screen: 'map',
  chapters: [{ id: 'pond', title: 'The Pond', stages: [stage()] }],
  current: 7,
  picked: 7,
};

describe('the small lines of the screen', () => {
  it('count a thing with the s only when there is not exactly one', () => {
    expect(count(0, 'word')).toBe('0 words');
    expect(count(1, 'word')).toBe('1 word');
    expect(count(2, 'sentence')).toBe('2 sentences');
    expect(count(11, 'sentence')).toBe('11 sentences');
  });

  it('say what the player has read, with each count in its own number', () => {
    expect(statsLine(1, 1)).toBe('1 word and 1 sentence read');
    expect(statsLine(0, 12)).toBe('0 words and 12 sentences read');
    expect(statsLine(949, 2)).toBe('949 words and 2 sentences read');
  });

  it('say how each stage stands in words that are different from one another', () => {
    const said = MARKS.map(markLine);
    expect(new Set(said).size).toBe(MARKS.length);
    expect(markLine('current')).toBe('Next up');
    expect(markLine('open')).toBe('Ready to play');
  });

  it('name a stage by its number, its title and how it stands, and the level by its number and chapter', () => {
    expect(stageLabel(stage({ n: 14, title: 'Rain Boots', mark: 'cleared' }))).toBe('Level 14, Rain Boots. Cleared');
    expect(levelLine(stage({ n: 40 }), 'Rainbow')).toBe('Level 40, Rainbow');
    expect(metLine(stage({ met: 0, words: 24 }))).toBe('0 of 24 words met');
  });

  it('name a tile by what is on it, so a letter is a letter and a group of letters is letters', () => {
    expect(pieceLabel('word', 'c', 'waiting')).toBe('Letter c');
    expect(pieceLabel('word', 'sh', 'waiting')).toBe('Letters sh');
    expect(pieceLabel('line', 'beautiful', 'waiting')).toBe('Word beautiful');
    expect(pieceLabel('line', 'a', 'waiting')).toBe('Word a');
  });

  it('add to the name of a piece that has been touched, or that is shining, and nothing to one that waits', () => {
    expect(pieceLabel('word', 'c', 'touched')).toBe('Letter c, touched');
    expect(pieceLabel('line', 'The', 'shining')).toBe('Word The, shining');
    expect(pieceLabel('word', 'c', 'waiting')).not.toContain(',');
  });

  it('count the bands that were read and not the ones that were skipped or are still to come', () => {
    expect(bandsLabel(BANDS)).toBe('2 of 7 read');
    expect(bandsLabel(['ahead', 'ahead', 'now'])).toBe('0 of 3 read');
    expect(bandsLabel(['read', 'read', 'read'])).toBe('3 of 3 read');
    expect(bandsLabel([])).toBe('0 of 0 read');
  });

  it('say how much of a round the player read, and how many of it was new only when some was', () => {
    expect(roundLine(done({ read: 6 }))).toBe('You read 6 of 7');
    expect(freshLine(0)).toBeNull();
    expect(freshLine(1)).toBe('1 new');
    expect(freshLine(4)).toBe('4 new');
  });
});

describe('what the banner says of a milestone', () => {
  it('says nothing when nothing was passed', () => {
    expect(milestoneLine(null, null, false)).toBeNull();
  });

  it('names the level that was cleared', () => {
    expect(milestoneLine(12, null, false)).toBe('Level 12 cleared!');
  });

  it('names the chapter that ended instead of the level, since the end of a chapter is the end of a level', () => {
    expect(milestoneLine(12, 'The Forest', false)).toBe('You finished The Forest!');
    expect(milestoneLine(null, 'The Forest', false)).toBe('You finished The Forest!');
  });

  it('says the whole course was read before anything else, since it is the end of both', () => {
    expect(milestoneLine(40, 'The Rainbow', true)).toBe('You finished the whole course!');
    expect(milestoneLine(null, null, true)).toBe('You finished the whole course!');
  });
});

describe('what the screen reader is told', () => {
  it('is how to begin, and how it works, the first time the player comes', () => {
    const said = announcement(home({ firstEver: true }));
    expect(said).toContain(LABELS.title);
    for (const step of STEPS) expect(said).toContain(step);
  });

  it('is where the player is, after that, and not the steps again', () => {
    const said = announcement(home({ stage: stage({ n: 9 }), chapter: 'The Forest' }));
    expect(said).toBe('Reading. Level 9, The Forest.');
    for (const step of STEPS) expect(said).not.toContain(step);
  });

  it('says that the levels are to choose from, on the map', () => {
    expect(announcement(map)).toBe('The levels. Choose what to work on.');
  });

  it('says what the end of a round says, with how much the player read', () => {
    expect(announcement(done({ caption: 'Well done!', read: 5 }))).toBe('Well done! You read 5 of 7.');
  });

  it('gives the letters of a word one by one, and the words of a sentence in a row, when a thing is first shown', () => {
    expect(announcement(item())).toBe('Touch each letter. c, a, t');
    const line = item({
      kind: 'line',
      caption: 'Touch each word as you read it.',
      pieces: [tile('The'), tile('cat'), tile('sat.')],
    });
    expect(announcement(line)).toBe('Touch each word as you read it. The cat sat.');
  });

  it('gives only the caption while the player says it out loud, since they know what the pieces are', () => {
    expect(announcement(item({ phase: 'saying', caption: 'Now say it out loud.' }))).toBe('Now say it out loud.');
  });

  it('gives what the player earned when it is found, and the milestone after it when there is one', () => {
    expect(announcement(item({ phase: 'found', earned: earned() }))).toBe('Hooray! Well read!');
    expect(announcement(item({ phase: 'found', earned: earned({ cleared: 3 }) }))).toBe(
      'Hooray! Well read! Level 3 cleared!',
    );
    expect(announcement(item({ phase: 'found', earned: earned({ cleared: 6, chapter: 'The Meadow' }) }))).toBe(
      'Hooray! Well read! You finished The Meadow!',
    );
  });

  it('names every screen to a screen reader, and a word and a sentence differently', () => {
    const views: ReadView[] = [home(), map, done(), item(), item({ kind: 'line' })];
    const names = views.map(dialogLabel);
    expect(new Set(names).size).toBe(views.length);
    for (const name of names) expect(name).toMatch(/^Reading/);
  });
});

describe('the prizes', () => {
  it('says what a level pays by name, with the plural each kind has', () => {
    expect(prizeName({ gem: 'diamond', count: 7 })).toBe('7 diamonds');
    expect(prizeName({ gem: 'ruby', count: 4 })).toBe('4 rubies');
    expect(prizeName({ gem: 'gold', count: 5 })).toBe('5 gold coins');
    expect(prizeName({ gem: 'emerald', count: 1 })).toBe('1 emerald');
  });

  it('promises it before the level is won and says it was won after', () => {
    expect(promiseLine(stage())).toBe('Finish this level to win 7 diamonds!');
    expect(promiseLine(stage({ won: true }))).toBe('You won 7 diamonds here!');
    expect(wonLine({ gem: 'sapphire', count: 6 })).toBe('You won 6 sapphires!');
  });

  it('tells a screen reader what the player won when a level is cleared, and what is in their treasure', () => {
    expect(
      announcement(item({ phase: 'found', earned: earned({ cleared: 7, prize: { gem: 'diamond', count: 7 } }) })),
    ).toBe('Hooray! Well read! Level 7 cleared! You won 7 diamonds!');
    expect(announcement(done({ cleared: 7, prize: { gem: 'diamond', count: 7 } }))).toContain('You won 7 diamonds!');
    expect(
      treasureLabel([
        { gem: 'diamond', count: 7 },
        { gem: 'emerald', count: 4 },
      ]),
    ).toBe('Your treasure: 7 diamonds, 4 emeralds');
  });
});

describe('what the screen writes', () => {
  it('never says that a try was wrong, in a label, a step or anything it tells a screen reader', () => {
    const lines: string[] = [...Object.values(LABELS), ...STEPS];
    for (const mark of MARKS) lines.push(markLine(mark), stageLabel(stage({ mark })));
    for (const view of [
      home(),
      home({ firstEver: true }),
      map,
      done(),
      item(),
      item({ phase: 'saying' }),
      item({ phase: 'found', earned: earned({ everything: true }) }),
    ]) {
      lines.push(announcement(view), dialogLabel(view));
    }
    for (const state of ['waiting', 'touched', 'shining'] as const)
      lines.push(pieceLabel('word', 'c', state), pieceLabel('line', 'cat', state));
    lines.push(
      metLine(stage()),
      statsLine(3, 1),
      roundLine(done()),
      bandsLabel(BANDS),
      freshLine(2)!,
      milestoneLine(1, null, false)!,
      milestoneLine(1, 'The Pond', false)!,
      promiseLine(stage()),
      promiseLine(stage({ won: true })),
      wonLine({ gem: 'ruby', count: 4 }),
      treasureLabel([{ gem: 'gold', count: 9 }]),
    );
    expect(lines.length).toBeGreaterThan(40);
    for (const line of lines) expect(line).not.toMatch(UNKIND);
  });

  it('has the three steps the player does, in order, and the last of them is a tap and not a hold', () => {
    expect(STEPS).toHaveLength(3);
    expect(STEPS[0]).toMatch(/touch/i);
    expect(STEPS[1]).toMatch(/say/i);
    expect(STEPS[2]).toMatch(/tap/i);
    for (const step of STEPS) expect(step).not.toMatch(/hold|grown-up/i);
  });
});
