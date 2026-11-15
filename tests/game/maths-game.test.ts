import { describe, expect, it } from 'vitest';
import { WELCOME_GAMES } from '../../src/game/desk';
import { DONE_AFTER_MS, MathsGame, NEXT_AFTER_MS, NEXT_AFTER_SPOKEN_MS } from '../../src/game/maths-game';
import type { AskView, DoneView, MathsHandlers, MathsScreen, MathsView, PickView } from '../../src/game/maths-ports';
import type { PlayLedger } from '../../src/game/play-ports';
import type { ClipId } from '../../src/learning';
import { CHEERS } from '../../src/learning';
import { ALL_CLIPS } from '../../src/learning/course-clips';
import { cheerClip } from '../../src/learning/lines';
import { phraseClip } from '../../src/learning/play/maths/clips';
import { type Family, type StrandId, strandsOf } from '../../src/learning/play/maths/question';
import { RESTS_TO_HINT, ROUND_LENGTH, withRound } from '../../src/learning/play/maths/round';
import type { LearningSettings } from '../../src/shared/learning';
import { emptyPlay, type PlayRecord } from '../../src/shared/play';
import { seeded, settings } from '../learning/helpers';
import { Clock } from './clock';

const CLIP_IDS: ReadonlySet<string> = new Set(ALL_CLIPS.map((clip) => clip.id));
const CHEER_CLIPS: ReadonlySet<string> = new Set(CHEERS.map(cheerClip));

class FakeScreen implements MathsScreen {
  handlers!: MathsHandlers;
  readonly views: MathsView[] = [];
  up = false;
  breaks = false;

  constructor(private readonly log: string[]) {}

  show(view: MathsView): void {
    if (this.breaks) throw new Error('the screen broke');
    this.up = true;
    this.views.push(view);
  }

  close(): void {
    this.up = false;
    this.log.push('close');
  }

  get latest(): MathsView {
    return this.views[this.views.length - 1]!;
  }
}

interface Rig {
  clock: Clock;
  screen: FakeScreen;
  game: MathsGame;
  log: string[];
  said: ClipId[][];
  sounds: string[];
  reports: unknown[];
  record: () => PlayRecord;
  setSettings: (patch: Partial<LearningSettings>) => void;
  voice: { audible: boolean };
}

function rig(
  options: {
    record?: PlayRecord;
    settings?: Partial<LearningSettings>;
    seed?: number;
    throwing?: 'sound' | 'voice';
  } = {},
): Rig {
  const clock = new Clock();
  const log: string[] = [];
  const screen = new FakeScreen(log);
  const said: ClipId[][] = [];
  const sounds: string[] = [];
  const reports: unknown[] = [];
  let record = options.record ?? emptyPlay();
  let current = settings({ say: false, ...options.settings });
  const voice = { audible: true };
  const note = (what: string): void => {
    if (options.throwing === 'sound') throw new Error('the sound broke');
    sounds.push(what);
  };
  const play: PlayLedger = {
    get: () => record,
    set: (next) => {
      record = next;
    },
  };
  const game = new MathsGame({
    settings: () => current,
    play,
    random: seeded(options.seed ?? 5),
    later: clock.later,
    makeScreen: (handlers) => {
      screen.handlers = handlers;
      return screen;
    },
    voice: {
      get audible() {
        return voice.audible;
      },
      say: (clips) => {
        if (options.throwing === 'voice') throw new Error('the voice broke');
        said.push([...clips]);
      },
      stop: () => undefined,
    },
    sounds: {
      open: () => note('open'),
      flip: () => note('flip'),
      pair: (streak) => note(`pair:${streak}`),
      nudge: () => note('nudge'),
      finish: (stars) => note(`finish:${stars}`),
    },
    rest: { freeze: () => void log.push('freeze'), thaw: () => void log.push('thaw') },
    report: (error) => void reports.push(error),
  });
  return {
    clock,
    screen,
    game,
    log,
    said,
    sounds,
    reports,
    record: () => record,
    setSettings: (patch) => {
      current = { ...current, ...patch };
    },
    voice,
  };
}

const asking = (r: Rig): AskView => {
  const view = r.screen.latest;
  if (view.kind !== 'ask') throw new Error(`the screen shows ${view.kind}, not a question`);
  return view;
};
const picking = (r: Rig): PickView => {
  const view = r.screen.latest;
  if (view.kind !== 'pick') throw new Error(`the screen shows ${view.kind}, not the tiles`);
  return view;
};
const finishing = (r: Rig): DoneView => {
  const view = r.screen.latest;
  if (view.kind !== 'done') throw new Error(`the screen shows ${view.kind}, not the end of a round`);
  return view;
};

/** A place whose choice is not the right one and has not rested. */
const aWrongPlace = (view: AskView): number =>
  view.question.choices.findIndex((_, place) => place !== view.question.answer && !view.rested.includes(place));

/**
 * Plays the question that is up: slips `slips` times, then touches the right choice, and waits for
 * what comes next.
 */
function answer(r: Rig, slips = 0): void {
  for (let i = 0; i < slips; i++) r.screen.handlers.choose(aWrongPlace(asking(r)));
  const last = asking(r).index === ROUND_LENGTH - 1;
  r.screen.handlers.choose(asking(r).question.answer);
  r.clock.advance(last ? DONE_AFTER_MS : NEXT_AFTER_MS);
}

/**
 * Plays a whole round of a kind of sum, with `slipped` of its questions slipped once, the first
 * ones.
 */
function playRound(r: Rig, strand: StrandId, slipped = 0): void {
  r.screen.handlers.pick(strand);
  for (let i = 0; i < ROUND_LENGTH; i++) answer(r, i < slipped ? 1 : 0);
}

describe('sitting down at the maths table', () => {
  it('puts up the tiles of Level 0, one for each kind of sum, holds the world still, and says what to do the first time', () => {
    const r = rig();
    expect(r.game.open()).toBe('up');
    expect(r.game.busy).toBe(true);
    const view = picking(r);
    expect(view.strands.map((s) => s.id)).toEqual([...strandsOf(0)]);
    expect(view.strands).toHaveLength(10);
    expect(new Set(view.strands.map((s) => s.name)).size).toBe(10);
    expect(view.strands.every((s) => s.level === 1 && s.rounds === 0)).toBe(true);
    expect(r.log).toEqual(['freeze']);
    expect(r.sounds).toEqual(['open']);
    expect(r.said).toEqual([[phraseClip('pick')]]);
  });

  it('is never put over itself, and is not wanted with learning off', () => {
    const r = rig();
    expect(r.game.open()).toBe('up');
    expect(r.game.open()).toBe('busy');
    const off = rig({ settings: { on: false } });
    expect(off.game.open()).toBe('off');
    expect(off.screen.views).toHaveLength(0);
    expect(off.log).toEqual([]);
  });

  it('stops saying what to do once the player has played a couple of rounds, and says it again when they ask', () => {
    let record = emptyPlay();
    for (let i = 0; i < WELCOME_GAMES; i++) record = withRound(record, 'count', 1, 3);
    const r = rig({ record });
    r.game.open();
    expect(r.said).toEqual([]);
    r.screen.handlers.hear();
    expect(r.said).toEqual([[phraseClip('pick')]]);
  });

  it('shows the level the player has reached at each kind of sum, and how many rounds they have finished of it', () => {
    let record = withRound(emptyPlay(), 'add', 1, 5);
    record = withRound(record, 'add', 2, 1);
    record = withRound(record, 'clock', 1, 2);
    const r = rig({ record });
    r.game.open();
    const by = new Map(picking(r).strands.map((s) => [s.id, s]));
    expect(by.get('add')).toMatchObject({ level: 2, rounds: 2 });
    expect(by.get('clock')).toMatchObject({ level: 1, rounds: 1 });
    expect(by.get('count')).toMatchObject({ level: 1, rounds: 0 });
  });

  it('puts the world back and says nothing was opened when the screen cannot be drawn', () => {
    const r = rig();
    r.screen.breaks = true;
    expect(r.game.open()).toBe('broke');
    expect(r.game.busy).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    expect(r.reports).toHaveLength(1);
  });

  it('carries on when a sound or the voice breaks, which are never allowed to stop it', () => {
    for (const throwing of ['sound', 'voice'] as const) {
      const r = rig({ throwing });
      expect(r.game.open()).toBe('up');
      r.screen.handlers.pick('count');
      answer(r);
      expect(r.reports.length, `a ${throwing} that breaks is reported`).toBeGreaterThan(0);
      expect(asking(r).index).toBe(1);
    }
  });
});

describe('choosing a kind of sum', () => {
  it('starts a round of five at the first level, and says the question', () => {
    const r = rig();
    r.game.open();
    r.said.length = 0;
    r.screen.handlers.pick('add');
    const view = asking(r);
    expect(view).toMatchObject({
      strand: 'add',
      level: 1,
      index: 0,
      length: ROUND_LENGTH,
      solved: false,
      hint: false,
      rested: [],
    });
    expect(view.name).toBe('Adding');
    expect(r.said).toEqual([[...view.question.say]]);
    for (const id of view.question.say) expect(CLIP_IDS.has(id), `${id} has a clip`).toBe(true);
  });

  it('starts at the level the player has reached', () => {
    const r = rig({ record: withRound(withRound(emptyPlay(), 'take', 1, 5), 'take', 2, 4) });
    r.game.open();
    r.screen.handlers.pick('take');
    expect(asking(r).level).toBe(3);
    expect(asking(r).question.level).toBe(3);
  });

  it('ignores a kind that is not there, and a choice of one while a round is on', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('nothing' as StrandId);
    expect(r.screen.latest.kind).toBe('pick');
    r.screen.handlers.pick('count');
    const first = asking(r);
    r.screen.handlers.pick('shape');
    expect(asking(r)).toBe(first);
  });

  it('goes back to the tiles from a question, and stops what it was waiting for', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    r.screen.handlers.choose(asking(r).question.answer);
    r.screen.handlers.menu();
    expect(r.screen.latest.kind).toBe('pick');
    const views = r.screen.views.length;
    r.clock.advance(NEXT_AFTER_MS * 3);
    expect(r.screen.views.length, 'the question that was coming never comes').toBe(views);
    expect(r.record().maths.played, 'a round left unfinished is nothing to keep').toBe(0);
  });
});

describe('the two levels of tiles', () => {
  const levels = (r: Rig): [number, boolean][] => picking(r).families.map((family) => [family.level, family.chosen]);

  it('offers Level 0 and Level 1, with Level 0 chosen on a first visit and Level 1 not locked', () => {
    const r = rig();
    r.game.open();
    expect(picking(r).families.map((family) => family.name)).toEqual(['Level 0', 'Level 1']);
    expect(levels(r)).toEqual([
      [0, true],
      [1, false],
    ]);
    r.screen.handlers.family(1);
    expect(levels(r)).toEqual([
      [0, false],
      [1, true],
    ]);
    expect(picking(r).strands.map((s) => s.id)).toEqual([...strandsOf(1)]);
    expect(picking(r).strands.map((s) => s.id)).toEqual(['plus', 'minus', 'times', 'share', 'mixed']);
    r.screen.handlers.family(0);
    expect(levels(r)).toEqual([
      [0, true],
      [1, false],
    ]);
    expect(picking(r).strands.map((s) => s.id)).toEqual([...strandsOf(0)]);
  });

  it('switches without a sound or a word, and keeps nothing', () => {
    const r = rig();
    r.game.open();
    const before = r.record();
    const sounds = [...r.sounds];
    const said = r.said.length;
    r.screen.handlers.family(1);
    r.screen.handlers.family(0);
    expect(r.sounds).toEqual(sounds);
    expect(r.said).toHaveLength(said);
    expect(r.log).toEqual(['freeze']);
    expect(r.record()).toBe(before);
  });

  it('shows how far the player has come at each kind of sum of the level they are at', () => {
    const r = rig({ record: withRound(withRound(emptyPlay(), 'times', 1, 5), 'times', 2, 4) });
    r.game.open();
    expect(picking(r).strands.map((s) => s.id)).toEqual([...strandsOf(1)]);
    expect(picking(r).strands.find((s) => s.id === 'times')).toMatchObject({ level: 3, rounds: 2 });
    expect(picking(r).strands.find((s) => s.id === 'plus')).toMatchObject({ level: 1, rounds: 0 });
  });

  it('opens at Level 1 once the player has finished a round of a kind of sum in it, and at Level 0 while they have finished only the first ones', () => {
    const first = rig({ record: withRound(emptyPlay(), 'add', 1, 5) });
    first.game.open();
    expect(levels(first)).toEqual([
      [0, true],
      [1, false],
    ]);
    const school = rig({ record: withRound(emptyPlay(), 'minus', 1, 3) });
    school.game.open();
    expect(levels(school)).toEqual([
      [0, false],
      [1, true],
    ]);
    const both = rig({ record: withRound(withRound(emptyPlay(), 'add', 1, 5), 'share', 1, 2) });
    both.game.open();
    expect(levels(both)).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it('keeps the level the player chose when they go back to the tiles from a question, and when they sit down again', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.family(1);
    r.screen.handlers.pick('mixed');
    r.screen.handlers.menu();
    expect(levels(r)).toEqual([
      [0, false],
      [1, true],
    ]);
    r.screen.handlers.close();
    r.game.open();
    expect(levels(r)).toEqual([
      [0, false],
      [1, true],
    ]);
    r.screen.handlers.family(0);
    r.screen.handlers.close();
    r.game.open();
    expect(levels(r)).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('goes back to the tiles of the kind of sum the player was playing, whichever tiles they started it from', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('times');
    r.screen.handlers.menu();
    expect(levels(r)).toEqual([
      [0, false],
      [1, true],
    ]);
    r.screen.handlers.pick('count');
    r.screen.handlers.menu();
    expect(levels(r)).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('ignores a switch to a level that is not there, to the one the player is at, and one made during a question or at the end of a round', () => {
    const r = rig();
    r.game.open();
    const views = r.screen.views.length;
    r.screen.handlers.family(0);
    r.screen.handlers.family(2 as Family);
    r.screen.handlers.family(-1 as Family);
    r.screen.handlers.family(0.5 as Family);
    expect(r.screen.views).toHaveLength(views);
    r.screen.handlers.pick('count');
    const asked = asking(r);
    r.screen.handlers.family(1);
    expect(asking(r)).toBe(asked);
    for (let i = 0; i < ROUND_LENGTH; i++) answer(r);
    const done = finishing(r);
    r.screen.handlers.family(1);
    expect(finishing(r)).toBe(done);
    r.screen.handlers.menu();
    expect(levels(r)).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('plays a round at Level 1 as it does at Level 0: the first level of the kind of sum, stars for it, and a place in what the player has earned', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.family(1);
    r.said.length = 0;
    r.screen.handlers.pick('mixed');
    const view = asking(r);
    expect(view).toMatchObject({ strand: 'mixed', level: 1, index: 0, length: ROUND_LENGTH });
    expect(view.name).toBe('Mixed sums');
    expect(r.said).toEqual([[...view.question.say]]);
    for (const id of view.question.say) expect(CLIP_IDS.has(id), `${id} has a clip`).toBe(true);
    for (let i = 0; i < ROUND_LENGTH; i++) answer(r);
    expect(finishing(r)).toMatchObject({ strand: 'mixed', level: 1, next: 2, clean: 5, stars: 3 });
    expect(r.record().maths).toEqual({ played: 1, strands: { mixed: { level: 2, rounds: 1, flawless: 1 } } });
    r.screen.handlers.menu();
    expect(levels(r)).toEqual([
      [0, false],
      [1, true],
    ]);
    expect(picking(r).strands.find((s) => s.id === 'mixed')).toMatchObject({ level: 2, rounds: 1 });
  });
});

describe('answering', () => {
  it('lights the right choice at the first touch, with a sound that climbs, and says what it was and a cheer', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    r.sounds.length = 0;
    r.said.length = 0;
    const view = asking(r);
    r.screen.handlers.choose(view.question.answer);
    expect(asking(r)).toMatchObject({ solved: true, rested: [], hint: false });
    expect(r.sounds).toEqual(['flip', 'pair:1']);
    const said = r.said[0]!;
    expect(said.slice(0, -1)).toEqual([...view.question.choices[view.question.answer]!.clips]);
    expect(CHEER_CLIPS.has(said[said.length - 1]!), 'it ends on a cheer').toBe(true);
  });

  it('goes on to the next question after a moment, and not before, and draws it as a new question', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('add');
    const first = asking(r);
    r.screen.handlers.choose(first.question.answer);
    r.clock.advance(NEXT_AFTER_MS - 1);
    expect(asking(r).index).toBe(0);
    r.clock.advance(1);
    const second = asking(r);
    expect(second.index).toBe(1);
    expect(second.solved).toBe(false);
    expect(second.serial).toBeGreaterThan(first.serial);
    expect(second.question).not.toBe(first.question);
  });

  it('waits longer for the voice when it is on, so a cheer is not cut off', () => {
    const r = rig({ settings: { say: true } });
    r.game.open();
    r.screen.handlers.pick('add');
    r.screen.handlers.choose(asking(r).question.answer);
    r.clock.advance(NEXT_AFTER_MS);
    expect(asking(r).index).toBe(0);
    r.clock.advance(NEXT_AFTER_SPOKEN_MS - NEXT_AFTER_MS);
    expect(asking(r).index).toBe(1);
  });

  it('lets a choice that is not right rest, with a soft sound and its name said, and keeps the question open', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    r.sounds.length = 0;
    r.said.length = 0;
    const view = asking(r);
    const wrong = aWrongPlace(view);
    r.screen.handlers.choose(wrong);
    expect(r.sounds).toEqual(['flip', 'nudge']);
    expect(r.said).toEqual([[...view.question.choices[wrong]!.clips]]);
    const after = asking(r);
    expect(after).toMatchObject({ solved: false, rested: [wrong], hint: false });
    expect(after.serial, 'the same question is drawn again, in place').toBe(view.serial);
    r.clock.advance(NEXT_AFTER_MS * 5);
    expect(asking(r).index, 'a question that is not solved waits for as long as the player likes').toBe(0);
  });

  it('does nothing when a choice that has rested is touched again, or when a question is solved and the player touches another', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    const wrong = aWrongPlace(asking(r));
    r.screen.handlers.choose(wrong);
    const views = r.screen.views.length;
    const sounds = r.sounds.length;
    r.screen.handlers.choose(wrong);
    r.screen.handlers.choose(-1);
    r.screen.handlers.choose(99);
    expect(r.screen.views.length).toBe(views);
    expect(r.sounds.length).toBe(sounds);
    r.screen.handlers.choose(asking(r).question.answer);
    const solved = r.screen.views.length;
    r.screen.handlers.choose(aWrongPlace(asking(r)));
    expect(r.screen.views.length).toBe(solved);
  });

  it('lights the right choice after two have rested, and says to look again, which is a hint and not a reproach', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    r.said.length = 0;
    for (let i = 0; i < RESTS_TO_HINT; i++) r.screen.handlers.choose(aWrongPlace(asking(r)));
    expect(asking(r).hint).toBe(true);
    expect(r.said[r.said.length - 1]!.slice(-1)).toEqual([phraseClip('look-again')]);
    r.screen.handlers.choose(asking(r).question.answer);
    expect(asking(r)).toMatchObject({ solved: true, hint: false });
  });

  it('brings the sound down again after a choice rests, so a run of right answers is what climbs', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('count');
    r.sounds.length = 0;
    answer(r);
    answer(r);
    r.screen.handlers.choose(aWrongPlace(asking(r)));
    answer(r);
    expect(r.sounds.filter((s) => s.startsWith('pair'))).toEqual(['pair:1', 'pair:2', 'pair:1']);
  });

  it('never has a screen say that anything was wrong', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('add');
    r.screen.handlers.choose(aWrongPlace(asking(r)));
    r.screen.handlers.choose(aWrongPlace(asking(r)));
    for (const view of r.screen.views)
      expect(view.caption, view.caption).not.toMatch(/\b(wrong|incorrect|fail|bad|no|not|oops|mistake|sorry)\b/i);
  });
});

describe('a round', () => {
  it('has five questions, each different, and ends after the fifth is answered right', () => {
    const r = rig();
    r.game.open();
    r.screen.handlers.pick('add');
    const prompts: string[] = [];
    for (let i = 0; i < ROUND_LENGTH; i++) {
      expect(asking(r).index).toBe(i);
      prompts.push(JSON.stringify([asking(r).question.prompt, asking(r).question.show]));
      answer(r);
    }
    expect(new Set(prompts).size).toBe(ROUND_LENGTH);
    expect(r.screen.latest.kind).toBe('done');
  });

  it('earns three stars and the next level for five right at the first touch, and keeps it', () => {
    const r = rig();
    r.game.open();
    r.sounds.length = 0;
    r.said.length = 0;
    playRound(r, 'tens');
    const view = finishing(r);
    expect(view).toMatchObject({ strand: 'tens', level: 1, next: 2, clean: 5, length: 5, stars: 3 });
    expect(r.sounds[r.sounds.length - 1]).toBe('finish:3');
    expect(r.said[r.said.length - 1]).toEqual([phraseClip('done')]);
    expect(r.record().maths).toEqual({ played: 1, strands: { tens: { level: 2, rounds: 1, flawless: 1 } } });
  });

  it('earns fewer stars when questions needed a second try, and goes up a level only when most did not', () => {
    const a = rig();
    a.game.open();
    playRound(a, 'take', 1);
    expect(finishing(a)).toMatchObject({ clean: 4, stars: 2, next: 2 });
    const b = rig();
    b.game.open();
    playRound(b, 'take', 2);
    expect(finishing(b)).toMatchObject({ clean: 3, stars: 2, next: 1 });
    const c = rig();
    c.game.open();
    playRound(c, 'take', 5);
    expect(finishing(c)).toMatchObject({ clean: 0, stars: 1, next: 1 });
    expect(c.record().maths.strands.take).toEqual({ level: 1, rounds: 1, flawless: 0 });
  });

  it('plays another round of the same kind at the level the player is at now, and asks again from the tiles for another', () => {
    const r = rig();
    r.game.open();
    playRound(r, 'double');
    r.screen.handlers.again();
    expect(asking(r)).toMatchObject({ strand: 'double', level: 2, index: 0 });
    for (let i = 0; i < ROUND_LENGTH; i++) answer(r);
    r.screen.handlers.menu();
    expect(picking(r).strands.find((s) => s.id === 'double')).toMatchObject({ level: 3, rounds: 2 });
    r.screen.handlers.again();
    expect(r.screen.latest.kind, 'again does nothing from the tiles').toBe('pick');
  });

  it('keeps a level the player has reached, even when they play a kind of sum at a lower one', () => {
    const r = rig({ record: withRound(withRound(emptyPlay(), 'count', 1, 5), 'count', 2, 5) });
    r.game.open();
    playRound(r, 'count', 5);
    expect(r.record().maths.strands.count).toEqual({ level: 3, rounds: 3, flawless: 2 });
  });

  it('is nothing to keep when the player closes the screen in the middle, and what they have already earned stays', () => {
    const r = rig({ record: withRound(emptyPlay(), 'count', 1, 5) });
    const before = r.record();
    r.game.open();
    r.screen.handlers.pick('add');
    answer(r);
    answer(r);
    r.screen.handlers.close();
    expect(r.game.busy).toBe(false);
    expect(r.record()).toBe(before);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    const views = r.screen.views.length;
    r.clock.advance(60_000);
    expect(r.screen.views.length, 'nothing is drawn after the screen is gone').toBe(views);
  });
});

describe('what a parent changes', () => {
  it('takes the screen away when learning is turned off, and keeps what was earned', () => {
    const r = rig();
    r.game.open();
    playRound(r, 'count');
    const record = r.record();
    r.setSettings({ on: false });
    r.game.settingsChanged();
    expect(r.game.busy).toBe(false);
    expect(r.screen.up).toBe(false);
    expect(r.log[r.log.length - 1]).toBe('thaw');
    expect(r.record()).toBe(record);
  });

  it('leaves the screen up for any other change, and can be sat down at again afterwards', () => {
    const r = rig();
    r.game.open();
    r.setSettings({ say: true });
    r.game.settingsChanged();
    expect(r.game.busy).toBe(true);
    r.game.dispose();
    expect(r.game.busy).toBe(false);
    expect(r.game.open()).toBe('up');
  });

  it('tells the screen whether it is being spoken to: the voice is on and it can be heard', () => {
    const quiet = rig({ settings: { say: false } });
    quiet.game.open();
    expect(quiet.screen.latest.speech).toBe(false);
    const loud = rig({ settings: { say: true } });
    loud.game.open();
    expect(loud.screen.latest.speech).toBe(true);
    loud.voice.audible = false;
    loud.screen.handlers.pick('count');
    expect(loud.screen.latest.speech, 'a voice that cannot be heard is not a voice').toBe(false);
  });
});
