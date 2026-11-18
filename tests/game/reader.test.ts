import { describe, expect, it } from 'vitest';
import { CHAPTERS, readWord, STAGE_COUNT, STAGES } from '../../src/content/reading';
import { CLEARED_EXTRA_MS, JOIN_AFTER_MS, PRAISE_AFTER_MS, READS_EXTRA_MS, STAY_MS } from '../../src/game/reader';
import { type ClipId, emptyProfile, raiseFloor, sentenceProgress, withSentence } from '../../src/learning';
import { READ_START_CLIP } from '../../src/learning/lines';
import { CLEAR, PROMPTS, planRound, type ReadItem, tileClip, totals, wordProgress } from '../../src/learning/reading';
import { DAY, progress, seeded, T0 } from '../learning/helpers';
import {
  booked,
  bookedWords,
  CLIP_IDS,
  type Rig,
  readIt,
  readWords,
  rig,
  settle,
  sitAndStart,
  spoken,
  touchAll,
  wordOn,
  yes,
} from './reading-rig';

describe('sitting down', () => {
  it('shows the home screen, holds the world still, and says hello the first time the player ever comes', () => {
    const r = rig();
    expect(r.reader.open()).toBe('up');
    expect(r.reader.busy).toBe(true);
    expect(r.log).toEqual(['freeze']);
    const view = r.screen.latest;
    expect(view).toMatchObject({
      screen: 'home',
      firstEver: true,
      words: 0,
      reads: 0,
      lines: 0,
      speech: true,
      caption: PROMPTS.welcome.text,
    });
    expect(view.screen === 'home' && view.stage).toMatchObject({ n: 1, mark: 'current', met: 0 });
    expect(r.sounds).toEqual(['open']);
    expect(spoken(r)).toEqual([PROMPTS.welcome.id]);
  });

  it('does not say hello to a child who has read before, and tells them what they have read', () => {
    const r = rig({ profile: booked(1) });
    r.reader.open();
    const view = r.screen.latest;
    expect(view).toMatchObject({ screen: 'home', firstEver: false, caption: '' });
    expect(view.screen === 'home' && view.words).toBe(totals(booked(1)).words);
    expect(spoken(r)).toEqual([]);
  });

  it('is not put over itself, and sits the player down with learning off as well', () => {
    const off = rig({ settings: { on: false } });
    expect(off.reader.open()).toBe('up');
    expect(off.reader.busy).toBe(true);
    expect(off.log).toEqual(['freeze']);
    expect(off.screen.views).toHaveLength(1);
    const r = rig();
    r.reader.open();
    expect(r.reader.open()).toBe('busy');
    expect(r.log).toEqual(['freeze']);
    expect(r.screen.views).toHaveLength(1);
  });

  it('says so, and lets the world go, when the screen would not come up', () => {
    const r = rig();
    r.screen.breaksAt = 1;
    expect(r.reader.open()).toBe('broke');
    expect(r.reader.busy).toBe(false);
    expect(r.log).toEqual(['freeze', 'close', 'thaw']);
    expect(r.reports).toHaveLength(1);
    expect(r.reader.open()).toBe('up');
  });

  it('stays up when a parent changes what is on, and does nothing when it is not up', () => {
    const r = rig();
    r.reader.settingsChanged();
    expect(r.screen.views).toEqual([]);
    r.reader.open();
    r.setSettings({ say: false });
    r.reader.settingsChanged();
    r.setSettings({ on: false });
    r.reader.settingsChanged();
    expect(r.reader.busy).toBe(true);
    expect(r.log).toEqual(['freeze']);
  });
});

/** What an item is written as on the screen, with its pieces joined. */
const written = (item: ReadItem): string =>
  item.kind === 'word' ? item.word.tiles.map((tile) => tile.letters).join('') : item.line.text.split(' ').join('');

describe('a round', () => {
  it('is the round the engine plans for the stage the player is on, dealt one at a time, with seven bands that fill as they go', () => {
    const r = rig();
    sitAndStart(r);
    const planned = planRound(emptyProfile(), T0);
    expect(planned).toHaveLength(7);
    for (let at = 0; at < 7; at++) {
      const item = r.screen.item;
      expect(item.kind).toBe(planned[at]!.kind);
      expect(wordOn(r)).toBe(written(planned[at]!));
      expect(item.bands).toEqual(Array.from({ length: 7 }, (_, i) => (i < at ? 'read' : i === at ? 'now' : 'ahead')));
      expect(item.stage).toMatchObject({ n: 1 });
      expect(item.phase).toBe('touching');
      readIt(r);
    }
    expect(r.screen.latest).toMatchObject({ screen: 'done', read: 7 });
  });

  it('numbers each thing it deals, so a screen can tell a new thing from the same thing drawn again', () => {
    const r = rig();
    sitAndStart(r);
    const first = r.screen.item.deal;
    r.screen.handlers.touch(0);
    r.screen.handlers.help();
    expect(r.screen.item.deal, 'the same thing, touched and helped').toBe(first);
    r.screen.handlers.skip();
    expect(r.screen.item.deal, 'a thing that is skipped').toBe(first + 1);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.phase).toBe('found');
    expect(r.screen.item.deal, 'the same thing, found').toBe(first + 1);
    r.clock.advance(r.reader.stayMs + READS_EXTRA_MS + CLEARED_EXTRA_MS);
    expect(r.screen.item.deal, 'the next thing').toBe(first + 2);
  });

  it('says it is time to read, and what to do with the first new word, and nothing of the kind about the others', () => {
    const r = rig();
    r.reader.open();
    r.said.length = 0;
    r.screen.handlers.start();
    expect(spoken(r)).toEqual([READ_START_CLIP, PROMPTS.touch.id]);
    readIt(r);
    const second = spoken(r).slice(2);
    expect(second).not.toContain(PROMPTS.touch.id);
    expect(second).not.toContain(READ_START_CLIP);
  });

  it('writes what the player read to their book as it is read, before anything is celebrated, and writes nothing for what they did not', () => {
    const r = rig();
    sitAndStart(r);
    expect(r.writes()).toBe(0);
    const first = planRound(emptyProfile(), T0)[0]!;
    if (first.kind !== 'word') throw new Error('the first thing is a word');
    touchAll(r);
    settle(r);
    expect(r.writes()).toBe(0);
    r.screen.handlers.approve();
    expect(r.writes()).toBe(1);
    expect(r.log.slice(-2)).toEqual(['book', 'found']);
    expect(wordProgress(r.book(), first.word)).toMatchObject({ done: 1, clean: 1 });
  });
});

describe('touching the tiles of a word', () => {
  it('says the sound of each tile as it is touched, lights it, and counts it, in order', () => {
    const r = rig();
    sitAndStart(r);
    const item = planRound(emptyProfile(), T0)[0]!;
    if (item.kind !== 'word') throw new Error('the first thing is a word');
    const before = r.said.length;
    r.screen.handlers.touch(0);
    expect(r.screen.item.touched).toBe(1);
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'touched', at: 0 });
    expect(r.said.slice(before).map((said) => said.clips)).toEqual([[tileClip(item.word.tiles[0]!)]]);
  });

  it('bounces a tile that is not next, makes no sound of its sound, and does not move on', () => {
    const r = rig();
    sitAndStart(r);
    const before = r.said.length;
    r.screen.handlers.touch(2);
    expect(r.screen.item.touched).toBe(0);
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'bounced', at: 2 });
    expect(r.sounds).toContain('bounce');
    expect(r.said).toHaveLength(before);
    r.screen.handlers.touch(0);
    expect(r.screen.item.touched).toBe(1);
  });

  it('says the sound of a tile again when it is touched again, and it costs nothing', () => {
    const r = rig();
    sitAndStart(r);
    r.screen.handlers.touch(0);
    const before = r.said.length;
    r.screen.handlers.touch(0);
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'again', at: 0 });
    expect(r.said).toHaveLength(before + 1);
    expect(r.screen.item.touched).toBe(1);
  });

  it('lights the first tile of a word the player has just met, and leaves it dark for a word they know until they ask', () => {
    const fresh = rig();
    sitAndStart(fresh);
    expect(fresh.screen.item).toMatchObject({ glowing: 0, canHelp: false });
    const r = rig({ profile: booked(1, { level: 3, best: 3 }) });
    sitAndStart(r);
    expect(r.screen.item).toMatchObject({ glowing: null, canHelp: true });
    r.screen.handlers.help();
    expect(r.screen.item).toMatchObject({ glowing: 0, canHelp: false });
    expect(r.sounds).toContain('hint');
    // The light was for that one tile, and is gone when it is touched.
    r.screen.handlers.touch(0);
    expect(r.screen.item).toMatchObject({ glowing: null, canHelp: true });
  });

  it('makes a note and not a sound when the voice is off, and everything else the same', () => {
    const r = rig({ audible: false });
    sitAndStart(r);
    r.screen.handlers.touch(0);
    expect(r.sounds).toContain(`tile:0/${r.screen.item.pieces.length}`);
    expect(r.said).toEqual([]);
    expect(r.screen.item.touched).toBe(1);
  });

  it('ignores touches of anything that is not there, and touches when nothing is waiting to be touched', () => {
    const r = rig();
    sitAndStart(r);
    r.screen.handlers.touch(-1);
    r.screen.handlers.touch(99);
    r.screen.handlers.touch(Number.NaN);
    expect(r.screen.item.touched).toBe(0);
    expect(r.screen.cues).toEqual([]);
    touchAll(r);
    const cues = r.screen.cues.length;
    r.screen.handlers.touch(0);
    expect(r.screen.cues).toHaveLength(cues);
  });
});

describe('saying it out loud', () => {
  it('joins the tiles when the last sound is over, says the word and what to do, and tells the player what to tap the first time ever', () => {
    const r = rig();
    sitAndStart(r);
    const first = planRound(emptyProfile(), T0)[0]!;
    if (first.kind !== 'word') throw new Error('the first thing is a word');
    touchAll(r);
    expect(r.screen.item).toMatchObject({ phase: 'saying', canApprove: false, canAskAgain: false });
    r.clock.advance(JOIN_AFTER_MS - 1);
    expect(r.screen.item.canApprove).toBe(false);
    const before = spoken(r).length;
    r.clock.advance(1);
    expect(r.screen.item).toMatchObject({ canApprove: true, canAskAgain: true });
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'joined' });
    expect(r.sounds).toContain('join');
    expect(spoken(r).slice(before)).toEqual([`word.${first.word.id}`, PROMPTS.say.id, PROMPTS.tick.id]);
  });

  it('writes what to tap beside the tick, from the first word that is to be said until the first yes, and never after', () => {
    const r = rig();
    sitAndStart(r);
    expect(r.screen.item.hint, 'while the tiles are touched').toBeNull();
    touchAll(r);
    expect(r.screen.item.hint).toBe(PROMPTS.tick.text);
    settle(r);
    expect(r.screen.item.hint).toBe(PROMPTS.tick.text);
    yes(r);
    expect(r.screen.item.hint, 'once it is read').toBeNull();
    r.clock.advance(r.reader.stayMs + READS_EXTRA_MS + CLEARED_EXTRA_MS);
    touchAll(r);
    settle(r);
    expect(r.screen.item.phase).toBe('saying');
    expect(r.screen.item.hint, 'for the next word').toBeNull();
  });

  it('does not tell the player about the tick again after the first yes', () => {
    const r = rig();
    sitAndStart(r);
    readIt(r);
    const before = spoken(r).length;
    touchAll(r);
    settle(r);
    expect(spoken(r).slice(before)).not.toContain(PROMPTS.tick.id);
  });

  it('is said yes to by one tap on the tick, and not before the tiles have joined', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    const cues = r.screen.cues.length;
    r.screen.handlers.approve();
    expect(r.screen.item.phase, 'the tiles have not joined').toBe('saying');
    expect(r.screen.cues, 'and the player is not told to wait').toHaveLength(cues);
    expect(r.writes()).toBe(0);
    r.clock.advance(JOIN_AFTER_MS);
    r.screen.handlers.approve();
    expect(r.screen.item.phase).toBe('found');
    expect(r.writes()).toBe(1);
  });

  it('is said yes to the moment the tiles have joined, with nobody to hold or to wait, and never twice', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    r.clock.advance(JOIN_AFTER_MS);
    r.screen.handlers.approve();
    expect(r.screen.item.phase).toBe('found');
    r.screen.handlers.approve();
    r.screen.handlers.approve();
    expect(r.writes(), 'a second tap on the same word writes nothing').toBe(1);
  });

  it('ignores a tap when there is nothing to say yes to', () => {
    const r = rig();
    sitAndStart(r);
    r.screen.handlers.approve();
    expect(r.screen.item.phase).toBe('touching');
    expect(r.writes()).toBe(0);
    expect(r.screen.cues).toEqual([]);
  });

  it('cheers, says the word, and shows what was earned, once it is read', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    settle(r);
    const before = spoken(r).length;
    yes(r);
    const item = r.screen.item;
    expect(item.phase).toBe('found');
    expect(item.earned).toMatchObject({ told: false, clean: true, cleared: null });
    expect(item.earned!.text.length).toBeGreaterThan(0);
    expect(r.sounds).toContain('found:clean');
    expect(spoken(r)).toHaveLength(before);
    r.clock.advance(PRAISE_AFTER_MS);
    const said = spoken(r).slice(before);
    expect(said).toHaveLength(2);
    expect(said[1]).toBe(`word.${wordOn(r)}`);
  });

  it('goes on to the next by itself after a while, and at once when the player asks', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    settle(r);
    yes(r);
    const first = wordOn(r);
    r.clock.advance(STAY_MS - 1);
    expect(wordOn(r)).toBe(first);
    r.clock.advance(1);
    expect(wordOn(r)).not.toBe(first);
    touchAll(r);
    settle(r);
    yes(r);
    const second = wordOn(r);
    r.screen.handlers.next();
    expect(wordOn(r)).not.toBe(second);
    expect(r.clock.waiting).toBe(0);
  });
});

describe('how long a thing stays when it is read', () => {
  it('stays long enough for the cheer and the word, and a while longer for a word the player now reads on their own', () => {
    const r = rig({ profile: booked(1, { level: 2, best: 2 }) });
    sitAndStart(r);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.earned).toMatchObject({ reads: true });
    const word = wordOn(r);
    r.clock.advance(STAY_MS + READS_EXTRA_MS - 1);
    expect(wordOn(r)).toBe(word);
    r.clock.advance(1);
    expect(wordOn(r)).not.toBe(word);
  });

  it('stays a while longer for a stage that is cleared, and tells which, with the sounds for it', () => {
    const stage = STAGES[0]!;
    const need = Math.ceil(stage.lines.length * CLEAR.lines);
    let book = booked(1);
    for (const line of stage.lines.slice(0, need - 1))
      book = withSentence(book, line.id, progress({ level: 1, best: 1, due: T0 + 30 * DAY }));
    const r = rig({ profile: book });
    sitAndStart(r);
    readWords(r);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.earned).toMatchObject({
      cleared: 1,
      chapter: null,
      everything: false,
      prize: { gem: 'diamond', count: 3 },
    });
    expect(r.sounds).toContain('cleared');
    const line = r.screen.item.pieces.map((piece) => piece.text).join('');
    r.clock.advance(STAY_MS + CLEARED_EXTRA_MS - 1);
    expect(r.screen.item.pieces.map((piece) => piece.text).join('')).toBe(line);
    r.clock.advance(1);
    expect(r.screen.item.pieces.map((piece) => piece.text).join('')).not.toBe(line);
  });

  it('shows the next band as still to come while a thing is found, and none as the one the player is on', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.bands).toEqual(['read', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead']);
  });
});

describe('what is explained, and when', () => {
  it('explains the first new word of a round and no other, even when a word the player knows comes before it', () => {
    const r = rig({ profile: bookedWords(2) });
    r.reader.open();
    r.screen.handlers.start();
    const planned = planRound(bookedWords(2), T0);
    expect(planned[0]).toMatchObject({ kind: 'word', review: true });
    const firstNew = planned.findIndex((item) => item.kind === 'word' && !item.review);
    expect(firstNew).toBeGreaterThan(0);
    const explained = (): number => spoken(r).filter((clip) => clip === PROMPTS.touch.id).length;
    for (let n = 0; n < firstNew - 1; n++) readIt(r);
    expect(explained(), 'a word the player knows is not explained').toBe(0);
    readIt(r);
    expect(explained(), 'the first new word is').toBe(1);
    readIt(r);
    expect(explained(), 'the second is not').toBe(1);
  });

  it('explains the first sentence of a round and no other', () => {
    const r = rig({ profile: booked(1) });
    r.reader.open();
    r.screen.handlers.start();
    const planned = planRound(booked(1), T0);
    expect(planned.filter((item) => item.kind === 'line').length).toBe(3);
    readWords(r);
    expect(spoken(r).filter((clip) => clip === PROMPTS.words.id)).toHaveLength(1);
    readIt(r);
    expect(r.screen.item.kind).toBe('line');
    expect(spoken(r).filter((clip) => clip === PROMPTS.words.id)).toHaveLength(1);
  });
});

describe('help, and once more', () => {
  it('shows how a word sounds out when the player asks, which is help the book keeps', () => {
    const r = rig();
    sitAndStart(r);
    const item = planRound(emptyProfile(), T0)[0]!;
    if (item.kind !== 'word') throw new Error('the first thing is a word');
    touchAll(r);
    settle(r);
    const before = r.said.length;
    r.screen.handlers.show();
    const sounds = item.word.tiles.map(tileClip).filter((clip): clip is ClipId => clip !== null);
    expect(r.said.slice(before).map((said) => said.clips)).toEqual([
      [...sounds, `word.${item.word.id}`, PROMPTS.say.id],
    ]);
    yes(r);
    expect(r.screen.item.earned).toMatchObject({ told: false, clean: false });
    expect(wordProgress(r.book(), item.word)).toMatchObject({ done: 1, clean: 0 });
  });

  it('says the word to the player when they ask to hear it, and not when there is no voice', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    settle(r);
    expect(r.screen.item.canHear).toBe(true);
    const before = r.said.length;
    r.screen.handlers.hear();
    expect(r.said.slice(before).map((said) => said.clips)).toEqual([[`word.${wordOn(r)}`]]);
    const mute = rig({ audible: false });
    sitAndStart(mute);
    touchAll(mute);
    settle(mute);
    expect(mute.screen.item.canHear).toBe(false);
    const asked = mute.asked.length;
    mute.screen.handlers.hear();
    expect(mute.said).toEqual([]);
    expect(mute.asked, 'the voice is not even asked').toHaveLength(asked);
    expect(mute.sounds).not.toContain('hint');
    yes(mute);
    expect(mute.sounds).toContain('found:clean');
  });

  it('does not say the word before the player has touched its tiles, however they ask, and the asking costs them nothing', () => {
    const r = rig();
    sitAndStart(r);
    const first = planRound(emptyProfile(), T0)[0]!;
    if (first.kind !== 'word') throw new Error('the first thing is a word');
    const before = r.said.length;
    r.screen.handlers.hear();
    r.screen.handlers.show();
    expect(r.said).toHaveLength(before);
    expect(r.screen.item.phase).toBe('touching');
    touchAll(r);
    settle(r);
    yes(r);
    expect(wordProgress(r.book(), first.word)).toMatchObject({ done: 1, clean: 1 });
  });

  it('lights the tiles in turn, and then the word, when a word is shown and nothing can be heard', () => {
    const r = rig({ audible: false });
    sitAndStart(r);
    touchAll(r);
    settle(r);
    const tiles = r.screen.item.pieces.length;
    r.screen.handlers.show();
    const cue = r.screen.cues.at(-1)!;
    if (cue.kind !== 'voiced') throw new Error('a demonstration is a voiced cue');
    expect(cue.marks.map((mark) => mark.at)).toEqual([...Array.from({ length: tiles }, (_, at) => at), null]);
    for (let i = 1; i < cue.marks.length; i++) expect(cue.marks[i]!.after).toBeGreaterThan(cue.marks[i - 1]!.after);
  });

  it('shows it once more the first time the player asks, and it is still to be said, and tells it the second time and goes on', () => {
    const r = rig();
    sitAndStart(r);
    const item = planRound(emptyProfile(), T0)[0]!;
    if (item.kind !== 'word') throw new Error('the first thing is a word');
    touchAll(r);
    settle(r);
    const before = r.said.length;
    r.screen.handlers.again();
    expect(r.screen.item.phase).toBe('saying');
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'asked' });
    expect(r.said.slice(before)[0]!.clips).toEqual([
      PROMPTS.again.id,
      ...item.word.tiles.map(tileClip).filter((clip): clip is ClipId => clip !== null),
      `word.${item.word.id}`,
      PROMPTS.say.id,
    ]);
    expect(r.writes()).toBe(0);
    r.screen.handlers.again();
    expect(r.screen.item.phase).toBe('found');
    expect(r.screen.item.earned).toMatchObject({ told: true, clean: false });
    expect(r.writes()).toBe(1);
    r.clock.advance(PRAISE_AFTER_MS);
    expect(spoken(r).slice(-2)).toEqual([PROMPTS.told.id, `word.${item.word.id}`]);
    expect(wordProgress(r.book(), item.word)).toMatchObject({ done: 1, clean: 0 });
  });

  it('cannot be asked for before the tiles have joined', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    r.screen.handlers.again();
    expect(r.screen.item.phase).toBe('saying');
    expect(r.screen.cues.some((cue) => cue.kind === 'asked')).toBe(false);
  });
});

describe('going on without reading', () => {
  it('skips a thing and leaves it as it was, and deals the next at once', () => {
    const r = rig();
    sitAndStart(r);
    const first = wordOn(r);
    r.screen.handlers.skip();
    expect(wordOn(r)).not.toBe(first);
    expect(r.screen.item.bands.slice(0, 2)).toEqual(['skipped', 'now']);
    expect(r.writes()).toBe(0);
    expect(totals(r.book())).toEqual({ words: 0, reads: 0, lines: 0 });
  });

  it('can skip at any moment of a thing, whatever has been touched', () => {
    const r = rig();
    sitAndStart(r);
    r.screen.handlers.touch(0);
    r.screen.handlers.skip();
    touchAll(r);
    r.screen.handlers.skip();
    touchAll(r);
    settle(r);
    r.screen.handlers.skip();
    r.clock.advance(60_000);
    expect(r.screen.item.bands.slice(0, 4)).toEqual(['skipped', 'skipped', 'skipped', 'now']);
    expect(r.writes()).toBe(0);
  });

  it('ends the round when the last is skipped, with the number the player read', () => {
    const r = rig();
    sitAndStart(r);
    readIt(r);
    for (let i = 0; i < 6; i++) r.screen.handlers.skip();
    expect(r.screen.latest).toMatchObject({ screen: 'done', read: 1 });
    expect(r.sounds).toContain('round:1');
  });

  it('takes a thing that is found to the next when the player skips', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    settle(r);
    yes(r);
    const found = wordOn(r);
    r.screen.handlers.skip();
    expect(wordOn(r)).not.toBe(found);
    expect(r.screen.item.bands.slice(0, 2)).toEqual(['read', 'now']);
  });
});

describe('closing', () => {
  it('goes at once from anywhere, lets the world go, and drops everything it was waiting for', () => {
    for (const how of ['home', 'touching', 'saying', 'found', 'done'] as const) {
      const r = rig();
      if (how === 'home') r.reader.open();
      else sitAndStart(r);
      if (how === 'saying' || how === 'found' || how === 'done') {
        touchAll(r);
        settle(r);
      }
      if (how === 'found' || how === 'done') yes(r);
      if (how === 'done') for (let i = 0; i < 7; i++) r.screen.handlers.skip();
      const stopped = r.stops();
      r.screen.handlers.close();
      expect(r.stops(), how).toBeGreaterThan(stopped);
      expect(r.reader.busy, how).toBe(false);
      expect(r.screen.up, how).toBe(false);
      expect(r.log.slice(-2), how).toEqual(['close', 'thaw']);
      expect(r.clock.waiting, how).toBe(0);
      const writes = r.writes();
      r.clock.advance(60_000);
      expect(r.writes(), how).toBe(writes);
      expect(r.screen.up, how).toBe(false);
    }
  });

  it('keeps what the player read, and begins again at home when they come back', () => {
    const r = rig();
    sitAndStart(r);
    readIt(r);
    readIt(r);
    r.screen.handlers.close();
    expect(totals(r.book()).words).toBe(2);
    expect(r.reader.open()).toBe('up');
    expect(r.screen.latest).toMatchObject({ screen: 'home', words: 2, firstEver: false });
  });

  it('does nothing when it is closed with nothing open', () => {
    const r = rig();
    r.reader.dispose();
    expect(r.log).toEqual([]);
  });
});

describe('the end of a round', () => {
  it('says how many the player read and how many were new, says it is done, and offers another round', () => {
    const r = rig();
    sitAndStart(r);
    for (let i = 0; i < 7; i++) readIt(r);
    expect(r.screen.latest).toMatchObject({ screen: 'done', read: 7, fresh: 7 });
    expect(r.sounds).toContain('round:7');
    r.clock.advance(PRAISE_AFTER_MS);
    expect(spoken(r).at(-1)).toBe('read.done');
    r.screen.handlers.another();
    expect(r.screen.latest.screen).toBe('item');
    expect(r.screen.item.bands).toEqual(['now', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead']);
  });

  it('asks nothing of the next round that the player read in this one, and what they read is due again later', () => {
    const r = rig();
    sitAndStart(r);
    const asked: string[] = [];
    for (let i = 0; i < 7; i++) {
      asked.push(wordOn(r));
      readIt(r);
    }
    expect(new Set(asked).size).toBe(7);
    r.screen.handlers.another();
    expect(asked).not.toContain(wordOn(r));
  });
});

describe('the levels', () => {
  it('shows every stage of the course in its chapter, the one the player is on, and every other as open to play', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 4) });
    r.reader.open();
    r.screen.handlers.levels();
    const map = r.screen.latest;
    if (map.screen !== 'map') throw new Error('the levels are a map');
    expect(map.chapters.map((chapter) => chapter.id)).toEqual(CHAPTERS.map((chapter) => chapter.id));
    const marks = map.chapters.flatMap((chapter) => chapter.stages.map((stage) => stage.mark));
    expect(marks).toHaveLength(STAGE_COUNT);
    expect(marks.slice(0, 3)).toEqual(['cleared', 'cleared', 'cleared']);
    expect(marks[3]).toBe('current');
    expect(marks.slice(4).every((mark) => mark === 'open')).toBe(true);
    expect(map.current).toBe(4);
    expect(map.picked).toBe(4);
    for (const stage of map.chapters.flatMap((chapter) => chapter.stages)) {
      expect(stage.samples.length).toBeGreaterThan(0);
      expect(stage.title.length).toBeGreaterThan(0);
    }
  });

  it('offers the levels the very first time the player sits down, and no stage is shut', () => {
    const r = rig();
    r.reader.open();
    expect(r.screen.latest).toMatchObject({ screen: 'home', firstEver: true });
    r.screen.handlers.levels();
    expect(r.screen.latest.screen).toBe('map');
    r.screen.handlers.play(STAGE_COUNT);
    expect(r.screen.item.stage.n).toBe(STAGE_COUNT);
  });

  it('plays any stage from the map, whenever the player likes, and not a number that is no stage', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 4) });
    r.reader.open();
    r.screen.handlers.levels();
    r.screen.handlers.play(0);
    r.screen.handlers.play(Number.NaN);
    r.screen.handlers.play(STAGE_COUNT + 1);
    expect(r.screen.latest.screen).toBe('map');
    r.screen.handlers.play(9);
    expect(r.screen.item.stage.n, 'one the player has not come to').toBe(9);
    r.screen.handlers.home();
    r.screen.handlers.levels();
    r.screen.handlers.play(2);
    expect(r.screen.item.stage.n, 'one the player has cleared').toBe(2);
    expect(r.screen.item.bands[0]).toBe('now');
  });

  it('says what each level pays, and shows only what the player has won as their treasure', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 3) });
    r.reader.open();
    expect(r.screen.latest).toMatchObject({
      screen: 'home',
      treasure: [],
      stage: { n: 3, prize: { gem: 'diamond', count: 5 }, won: false },
    });
    r.screen.handlers.close();
    let book = booked(1, { done: 1, clean: 1 });
    for (const line of STAGES[0]!.lines) book = withSentence(book, line.id, progress({ done: 1, clean: 1 }));
    const won = rig({ profile: raiseFloor(book, 2) });
    won.reader.open();
    expect(won.screen.latest).toMatchObject({ screen: 'home', treasure: [{ gem: 'diamond', count: 3 }] });
    won.screen.handlers.levels();
    const map = won.screen.latest;
    expect(map.screen === 'map' && map.chapters[0]!.stages.map((stage) => stage.won)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('keeps what the player chose, so Start goes on with it, and shows it on the home screen and on the map', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 3) });
    r.reader.open();
    expect(r.screen.latest).toMatchObject({ screen: 'home', chosen: false, stage: { n: 3 } });
    r.screen.handlers.levels();
    r.screen.handlers.play(1);
    expect(r.screen.item.stage.n).toBe(1);
    r.screen.handlers.home();
    expect(r.screen.latest).toMatchObject({ screen: 'home', chosen: true, stage: { n: 1 } });
    r.screen.handlers.levels();
    expect(r.screen.latest).toMatchObject({ screen: 'map', picked: 1, current: 3 });
    r.screen.handlers.home();
    r.screen.handlers.start();
    expect(r.screen.item.stage.n).toBe(1);
    r.screen.handlers.close();
    r.reader.open();
    expect(r.screen.latest, 'the player still has it when they come back').toMatchObject({
      screen: 'home',
      chosen: true,
      stage: { n: 1 },
    });
  });

  it('plays another round of what the player chose, and goes to the levels from the end of a round', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 3) });
    r.reader.open();
    r.screen.handlers.levels();
    r.screen.handlers.play(2);
    for (let i = 0; i < 7; i++) readIt(r);
    expect(r.screen.latest).toMatchObject({ screen: 'done', stage: { n: 2 } });
    r.screen.handlers.another();
    expect(r.screen.item.stage.n).toBe(2);
    for (let i = 0; i < 7; i++) r.screen.handlers.skip();
    expect(r.screen.latest.screen).toBe('done');
    r.screen.handlers.levels();
    expect(r.screen.latest).toMatchObject({ screen: 'map', picked: 2 });
    r.screen.handlers.play(5);
    expect(r.screen.item.stage.n).toBe(5);
    expect(r.clock.waiting, 'nothing from the round that ended is still waiting').toBe(0);
  });

  it('lets go of what the player chose when a parent starts them somewhere else, so the parent is not argued with', () => {
    const r = rig({ profile: raiseFloor(emptyProfile(), 3) });
    r.reader.open();
    r.screen.handlers.levels();
    r.screen.handlers.play(1);
    r.screen.handlers.close();
    r.setBook(raiseFloor(r.book(), 6));
    r.reader.open();
    expect(r.screen.latest).toMatchObject({ screen: 'home', chosen: false, stage: { n: 6 } });
    r.screen.handlers.start();
    expect(r.screen.item.stage.n).toBe(6);
  });

  it('only opens the map from home or the end of a round, only plays from the map, and starts a round only from home or the end of one', () => {
    const r = rig();
    sitAndStart(r);
    r.screen.handlers.skip();
    const view = r.screen.item;
    expect(view.bands.slice(0, 2)).toEqual(['skipped', 'now']);
    for (const ask of [
      () => r.screen.handlers.levels(),
      () => r.screen.handlers.play(1),
      () => r.screen.handlers.start(),
      () => r.screen.handlers.another(),
    ]) {
      ask();
      expect(r.screen.latest, 'the round is not started over, or left').toBe(view);
    }
  });

  it('goes home from anywhere, and drops the round that was left', () => {
    const r = rig();
    sitAndStart(r);
    touchAll(r);
    r.screen.handlers.home();
    expect(r.screen.latest.screen).toBe('home');
    expect(r.clock.waiting).toBe(0);
    r.clock.advance(60_000);
    expect(r.screen.latest.screen).toBe('home');
    expect(r.writes()).toBe(0);
  });
});

describe('a sentence', () => {
  /**
   * A child who has met the words of the first stage and is given a round that has sentences in it.
   */
  function atTheSentence(r: Rig): void {
    sitAndStart(r);
    readWords(r);
  }

  it('is touched word by word, with a tick for each and the voice silent, since it would read the sentence for the player', () => {
    const r = rig({ profile: booked(1) });
    atTheSentence(r);
    const item = r.screen.item;
    expect(item.kind).toBe('line');
    expect(item.pieces.length).toBeGreaterThan(2);
    expect(item.pieces.every((piece) => !piece.silent && piece.split === null && !piece.gap)).toBe(true);
    const before = r.said.length;
    r.sounds.length = 0;
    r.screen.handlers.touch(0);
    expect(r.said).toHaveLength(before);
    expect(r.sounds).toEqual([`tile:0/${item.pieces.length}`]);
  });

  it('asks the player to read it all together when its words are touched, and to say yes the same way', () => {
    const r = rig({ profile: booked(1) });
    atTheSentence(r);
    touchAll(r);
    const before = spoken(r).length;
    settle(r);
    expect(spoken(r).slice(before)).toEqual([PROMPTS.together.id]);
    expect(r.screen.item).toMatchObject({ phase: 'saying', canShow: false });
  });

  it('is read to the player word by word, each word lit after the one before it, and none before the voice has begun or after it has ended', () => {
    const r = rig({ profile: booked(1) });
    atTheSentence(r);
    touchAll(r);
    settle(r);
    const words = r.screen.item.pieces.length;
    const before = r.said.length;
    r.screen.handlers.hear();
    const said = r.said.slice(before)[0]!;
    expect(said.clips).toHaveLength(1);
    said.began!(said.clips[0]!, 4, 0.3);
    const cue = r.screen.cues.at(-1)!;
    if (cue.kind !== 'voiced') throw new Error('the voice makes a cue');
    expect(cue.marks).toHaveLength(words);
    expect(cue.marks.map((mark) => mark.at)).toEqual(Array.from({ length: words }, (_, at) => at));
    expect(cue.marks[0]!.after).toBeGreaterThanOrEqual(0.3 - 1e-9);
    for (let i = 1; i < words; i++)
      expect(cue.marks[i]!.after).toBeGreaterThanOrEqual(cue.marks[i - 1]!.after + cue.marks[i - 1]!.seconds - 1e-9);
    const last = cue.marks[words - 1]!;
    expect(last.after + last.seconds).toBeLessThanOrEqual(0.3 + 4 + 1e-9);
  });

  it('is written to the book when it is read, and the words the player has met that are in it are credited', () => {
    const r = rig({ profile: booked(1) });
    atTheSentence(r);
    const line = planRound(booked(1), T0).find((item) => item.kind === 'line')!;
    if (line.kind !== 'line') throw new Error('a sentence');
    expect(sentenceProgress(r.book(), line.line.id)).toBeUndefined();
    const writes = r.writes();
    readIt(r);
    expect(sentenceProgress(r.book(), line.line.id)).toMatchObject({ done: 1, clean: 1 });
    expect(r.writes()).toBe(writes + 1);
    const word = line.line.words.map((id) => readWord(id)).find((found) => found !== undefined)!;
    expect(wordProgress(r.book(), word)!.done).toBeGreaterThan(wordProgress(booked(1), word)?.done ?? 0);
  });
});

describe('the voice and the screen belong to the reading, and never stand in its way', () => {
  it('reads on when the voice breaks', () => {
    const r = rig({ throwing: 'voice' });
    sitAndStart(r);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.phase).toBe('found');
    expect(r.writes()).toBe(1);
    expect(r.reports.length).toBeGreaterThan(0);
  });

  it('reads on when the sounds break', () => {
    const r = rig({ throwing: 'sound' });
    r.reader.open();
    r.screen.handlers.start();
    r.screen.handlers.touch(5);
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.screen.item.phase).toBe('found');
    expect(r.writes()).toBe(1);
  });

  it('ends the round and lets the world go when a thing would not go up, with what the player read kept', () => {
    const r = rig();
    sitAndStart(r);
    readIt(r);
    // The third thing would not go up.
    r.screen.breakOn = (view) =>
      view.screen === 'item' && view.bands.filter((band) => band === 'read').length === 2 && view.phase === 'touching';
    touchAll(r);
    settle(r);
    yes(r);
    expect(r.reader.busy).toBe(true);
    r.clock.advance(STAY_MS);
    expect(r.reader.busy).toBe(false);
    expect(r.screen.up).toBe(false);
    expect(r.log.slice(-2)).toEqual(['close', 'thaw']);
    expect(r.reports).toHaveLength(1);
    expect(totals(r.book()).words).toBe(2);
    expect(r.clock.waiting).toBe(0);
  });

  it('ignores a voice that was for a thing that has gone', () => {
    const r = rig();
    sitAndStart(r);
    const opening = r.said.at(-1)!;
    r.screen.handlers.skip();
    const cues = r.screen.cues.length;
    opening.began!('word.cat', 1, 0);
    expect(r.screen.cues).toHaveLength(cues);
  });

  it('turns what the voice says into marks to light, for a tile that is sounded out and for the word that is said', () => {
    const r = rig();
    sitAndStart(r);
    const item = planRound(emptyProfile(), T0)[0]!;
    if (item.kind !== 'word') throw new Error('the first thing is a word');
    touchAll(r);
    settle(r);
    r.screen.handlers.show();
    const said = r.said.at(-1)!;
    const clips = said.clips;
    const first = tileClip(item.word.tiles[0]!)!;
    said.began!(first, 0.4, 0.1);
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'voiced', marks: [{ at: 0, after: 0.1, seconds: 0.4 }] });
    said.began!(`word.${item.word.id}`, 0.8, 2);
    expect(r.screen.cues.at(-1)).toMatchObject({ kind: 'voiced', marks: [{ at: null, after: 2, seconds: 0.8 }] });
    expect(clips).toContain(first);
  });
});

describe('what the screen is told', () => {
  it('always says the same things as the voice, in the same words, and never that the player was wrong', () => {
    const r = rig();
    sitAndStart(r);
    const view = r.screen.item;
    expect(view.caption).toBe(PROMPTS.touch.text);
    touchAll(r);
    expect(r.screen.item.caption).toContain(PROMPTS.say.text);
    settle(r);
    yes(r);
    expect(r.screen.item.caption).toBe(r.screen.item.earned!.text);
  });

  it('writes the cheer under the word, and the level the player cleared once, as a banner', () => {
    const stage = STAGES[0]!;
    const need = Math.ceil(stage.lines.length * CLEAR.lines);
    let book = booked(1);
    for (const line of stage.lines.slice(0, need - 1))
      book = withSentence(book, line.id, progress({ level: 1, best: 1, due: T0 + 30 * DAY }));
    const r = rig({ profile: book });
    sitAndStart(r);
    readWords(r);
    touchAll(r);
    settle(r);
    yes(r);
    r.clock.advance(PRAISE_AFTER_MS);
    // The voice says the level was cleared. The banner says so on the screen, so what is written
    // under the word does not say it twice.
    expect(spoken(r)).toContain(PROMPTS.level.id);
    const { item } = r.screen;
    expect(item.earned).toMatchObject({ cleared: 1 });
    expect(item.caption).not.toContain(PROMPTS.level.text);
    expect(item.caption.length).toBeGreaterThan(0);
    expect(item.caption).toBe(item.earned!.text);
  });

  it('puts every clip it asks the voice to say among the clips that the game ships', () => {
    const r = rig({ seed: 3 });
    sitAndStart(r);
    for (let i = 0; i < 14; i++) {
      if (r.screen.latest.screen === 'done') r.screen.handlers.another();
      readIt(r);
    }
    for (const clip of spoken(r)) expect(CLIP_IDS.has(clip), clip).toBe(true);
  });

  it('says when a stage is cleared, and the screen shows which, with the sounds for it', () => {
    const near = booked(1);
    const r = rig({ profile: near });
    sitAndStart(r);
    for (let i = 0; i < 40 && !r.sounds.includes('cleared'); i++) {
      if (r.screen.latest.screen === 'done') r.screen.handlers.another();
      readIt(r);
    }
    expect(r.sounds.filter((sound) => sound.startsWith('cleared'))).not.toHaveLength(0);
  });
});

describe('what chance does to a child at the screen', () => {
  const actions = [
    'touch',
    'touch',
    'touch',
    'wrong',
    'help',
    'hear',
    'show',
    'yes',
    'yes',
    'again',
    'skip',
    'next',
    'wait',
    'wait',
    'wait',
    'start',
    'levels',
    'home',
    'play',
    'another',
  ] as const;

  it('never breaks, whatever is pressed in whatever order, and always lets the player out', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded(seed * 97);
      const r = rig({ seed, profile: seed % 3 === 0 ? booked(2) : emptyProfile(), audible: seed % 4 !== 0 });
      const pick = (n: number): number => Math.floor(random() * n);
      r.reader.open();
      let writes = 0;
      for (let step = 0; step < 400; step++) {
        const action = actions[pick(actions.length)]!;
        const h = r.screen.handlers;
        const view = r.screen.latest;
        const count = view.screen === 'item' ? view.pieces.length : 0;
        if (action === 'touch') h.touch(view.screen === 'item' ? view.touched : pick(5));
        else if (action === 'wrong') h.touch(pick(count + 3));
        else if (action === 'help') h.help();
        else if (action === 'hear') h.hear();
        else if (action === 'show') h.show();
        else if (action === 'yes') h.approve();
        else if (action === 'again') h.again();
        else if (action === 'skip') h.skip();
        else if (action === 'next') h.next();
        else if (action === 'wait') r.clock.advance([100, 700, 1100, 3300, 5000][pick(5)]!);
        else if (action === 'start') h.start();
        else if (action === 'levels') h.levels();
        else if (action === 'home') h.home();
        else if (action === 'play') h.play(1 + pick(STAGE_COUNT + 1));
        else h.another();
        expect(r.reports, `seed ${seed} step ${step} ${action}`).toEqual([]);
        expect(r.writes(), `seed ${seed}`).toBeGreaterThanOrEqual(writes);
        writes = r.writes();
        const now = r.screen.latest;
        if (now.screen === 'item') {
          expect(now.touched).toBeGreaterThanOrEqual(0);
          expect(now.touched).toBeLessThanOrEqual(now.pieces.length);
          expect(now.bands).toHaveLength(7);
          expect(now.bands.filter((band) => band === 'now').length).toBeLessThanOrEqual(1);
          if (now.canApprove) expect(now.phase).toBe('saying');
          if (now.phase === 'touching')
            expect(now.canApprove || now.canAskAgain || now.canHear || now.canShow).toBe(false);
          if (now.glowing !== null) expect(now.glowing).toBe(now.touched);
        }
        if (now.screen === 'done') expect(now.bands.every((band) => band === 'read' || band === 'skipped')).toBe(true);
      }
      r.screen.handlers.close();
      expect(r.reader.busy, `seed ${seed}`).toBe(false);
      expect(r.clock.waiting, `seed ${seed}`).toBe(0);
      const frozen = r.log.filter((entry) => entry === 'freeze').length;
      expect(r.log.filter((entry) => entry === 'thaw').length, `seed ${seed}`).toBe(frozen);
      for (const clip of spoken(r)) expect(CLIP_IDS.has(clip), clip).toBe(true);
    }
  });

  it("never writes a thing to the player's book that they did not read, or one twice", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const random = seeded(seed * 31);
      const r = rig({ seed });
      sitAndStart(r);
      const reads: string[] = [];
      for (let step = 0; step < 200 && r.reader.busy; step++) {
        const view = r.screen.latest;
        if (view.screen === 'done') break;
        if (view.screen !== 'item') break;
        const roll = random();
        if (view.phase === 'touching') {
          if (roll < 0.15) r.screen.handlers.skip();
          else r.screen.handlers.touch(roll < 0.3 ? view.touched + 1 : view.touched);
        } else if (view.phase === 'saying') {
          if (roll < 0.3) {
            r.clock.advance(1500);
            yes(r);
          } else if (roll < 0.4) r.screen.handlers.skip();
          else if (roll < 0.5) r.screen.handlers.again();
          else r.clock.advance(300);
        } else {
          const word = view.pieces.map((piece) => piece.text).join('');
          if (view.kind === 'word' && !reads.includes(word)) reads.push(word);
          r.clock.advance(STAY_MS + READS_EXTRA_MS + CLEARED_EXTRA_MS);
        }
      }
      const written = totals(r.book()).words;
      expect(written, `seed ${seed}`).toBeLessThanOrEqual(7);
      expect(written, `seed ${seed}`).toBe(reads.length);
    }
  });
});
