import { describe, expect, it } from 'vitest';
import { WORD_IDS } from '../../src/content/lexicon';
import type { StickerDef } from '../../src/content/stickers';
import { STICKERS } from '../../src/content/stickers';
import type { DomainEvent, World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { AlbumSession, type LearnerStanding, learnerStanding, NO_LEARNING } from '../../src/game/album';
import { AlbumModel } from '../../src/persistence/album';
import { emptyAlbum } from '../../src/shared/album';
import { LogicMap } from '../../src/shared/map';
import { emptyPlay, type PlayRecord } from '../../src/shared/play';
import { emptyProfile, withProgress, withSentence } from '../../src/shared/profile';
import { ALL, leaderOf, lively, makeWorld, meadow, run, teleport } from '../domain/fixtures';
import { Clock } from '../game/clock';
import { profileOf, progress, T0 } from '../learning/helpers';

const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });

/** The meadow with an apple tree and a present in the open ground below the herd's starting line. */
function farm(): LogicMap {
  const base = meadow();
  return LogicMap.parse({
    ...base,
    interactables: [
      ...base.interactables,
      {
        instanceId: 'forest/apple-1',
        definitionId: 'apple-tree',
        pos: { x: 700, y: 1200 },
        hit: box(700, 1120, 80),
        approach: [{ pos: { x: 700, y: 1290 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/present-1',
        definitionId: 'present',
        pos: { x: 1000, y: 1250 },
        hit: box(1000, 1230, 60),
        approach: [{ pos: { x: 1000, y: 1330 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/snowman-1',
        definitionId: 'snowman',
        pos: { x: 1300, y: 1250 },
        hit: box(1300, 1230, 60),
        approach: [{ pos: { x: 1300, y: 1330 }, facing: 'north' }],
      },
    ],
  });
}

interface Rig {
  session: AlbumSession;
  model: AlbumModel;
  announced: StickerDef[][];
  world: World;
  /** Lets the world run for a while and tells the album everything it said. */
  play(seconds: number): void;
  feed(...events: DomainEvent[]): void;
}

function rig(options: { world?: World; settled?: boolean; untouched?: boolean; learner?: LearnerStanding } = {}): Rig {
  const world = options.world ?? makeWorld({ map: lively(), recruited: [] });
  const model = new AlbumModel(emptyAlbum(), null, new Clock(), false, options.untouched ?? true);
  const session = new AlbumSession({ model, world: () => world, now: () => T0, settled: options.settled ?? false });
  const announced: StickerDef[][] = [];
  session.onEarned((stickers) => announced.push([...stickers]));
  session.begin(options.learner ?? NO_LEARNING);
  const feed = (...events: DomainEvent[]): void => {
    for (const e of events) session.event(e, world);
  };
  return {
    session,
    model,
    announced,
    world,
    feed,
    play: (seconds) => run(world, seconds, (w) => feed(...drainEvents(w))),
  };
}

const ids = (stickers: readonly StickerDef[]): string[] => stickers.map((s) => s.id);
const earned = (r: Rig): string[] => Object.keys(r.session.got()).sort();

describe('the first look', () => {
  it('gives a new player their first sticker, Hello Wildstar, with some ceremony', () => {
    const r = rig();
    expect(earned(r)).toEqual(['hello']);
    expect(r.announced.map(ids)).toEqual([['hello']]);
  });

  it('puts what a player who already has a game has earned into the book without a fuss, once', () => {
    const world = makeWorld({ map: lively(), recruited: ALL });
    world.persistent.visitedMaps.push('forest', 'palace-garden', 'beach');
    const r = rig({ world, settled: true, untouched: true });
    expect(earned(r)).toEqual(
      [
        'hello',
        'friend-leaf',
        'friend-glacier',
        'friend-river',
        'friend-cinder',
        'friend-storm',
        'herd',
        'visit-palace-garden',
        'visit-beach',
      ].sort(),
    );
    expect(r.announced, 'nothing to announce: they are not news').toEqual([]);
    expect(r.session.have()).toBe(9);
  });

  it('does not hush what is earned after the first look, nor a book that is already there', () => {
    const settled = rig({ settled: true, untouched: true });
    settled.feed({ type: 'critter-poked', critterId: 'c1', kind: 'bunny', look: 'white', at: { x: 0, y: 0 }, z: 0 });
    expect(settled.announced.map(ids)).toEqual([['critter', 'critter-bunny']]);
    const returning = rig({ settled: true, untouched: false });
    expect(returning.announced.map(ids), 'a book that was kept does not need to be hushed').toEqual([['hello']]);
  });

  it('knows nothing of the world before it has begun', () => {
    const world = makeWorld({ map: lively(), recruited: [] });
    const model = new AlbumModel(emptyAlbum(), null, new Clock());
    const session = new AlbumSession({ model, world: () => world, now: () => T0, settled: false });
    session.event(
      { type: 'critter-poked', critterId: 'c1', kind: 'frog', look: 'green', at: { x: 0, y: 0 }, z: 0 },
      world,
    );
    session.note('photos');
    expect(model.get()).toEqual(emptyAlbum());
  });
});

describe('what the book has not shown yet', () => {
  it('remembers the stickers announced this visit until the book shows them, and not the ones put in quietly', () => {
    const world = makeWorld({ map: lively(), recruited: ALL });
    const quiet = rig({ world, settled: true, untouched: true });
    expect([...quiet.session.unseen()]).toEqual([]);
    const r = rig();
    expect([...r.session.unseen()]).toEqual(['hello']);
    r.feed({ type: 'critter-poked', critterId: 'c1', kind: 'bunny', look: 'white', at: { x: 0, y: 0 }, z: 0 });
    expect([...r.session.unseen()].sort()).toEqual(['critter', 'critter-bunny', 'hello']);
    r.session.seen(['hello', 'not-a-sticker']);
    expect([...r.session.unseen()].sort()).toEqual(['critter', 'critter-bunny']);
  });
});

describe('what the world says becomes stickers', () => {
  it('counts a spell by the kind of magic of the friend who cast it', () => {
    const r = rig({ world: makeWorld({ map: lively(), recruited: ALL }) });
    r.announced.length = 0;
    dispatch(r.world, { type: 'cast', commandId: 'c1', unicornId: 'glacier' });
    r.play(4);
    expect(r.model.get().counts['cast:ice']).toBeGreaterThanOrEqual(1);
    expect(r.model.get().counts['cast:light']).toBeUndefined();
    expect(ids(r.announced.flat())).toContain('spell');
  });

  it('counts a little creature greeted, by its kind, and says hello to the kind', () => {
    const r = rig();
    r.announced.length = 0;
    const bunny = r.world.life.critters.find((c) => c.kind === 'bunny')!;
    dispatch(r.world, { type: 'poke', commandId: 'p1', critterId: bunny.id });
    r.play(1);
    expect(r.model.get().counts['poke:bunny']).toBe(1);
    expect(ids(r.announced.flat()).sort()).toEqual(['critter', 'critter-bunny']);
  });

  it('counts a fruit gathered, by its kind', () => {
    const world = makeWorld({ map: farm(), recruited: [] });
    const r = rig({ world });
    r.announced.length = 0;
    dispatch(world, { type: 'interact', commandId: 'h1', instanceId: 'forest/apple-1' });
    r.play(14);
    const [first] = world.pickups.list;
    expect(first, 'an apple fell').toBeDefined();
    teleport(world, 'wildstar', first!.to);
    r.play(1.5);
    expect(r.model.get().counts['produce:apple'], 'and she gathered it').toBeGreaterThanOrEqual(1);
    expect(ids(r.announced.flat())).toContain('fruit');
  });

  it('counts a present opened, and not a thing that only hops', () => {
    const world = makeWorld({ map: farm(), recruited: [] });
    const r = rig({ world });
    r.announced.length = 0;
    dispatch(world, { type: 'interact', commandId: 'p1', instanceId: 'forest/present-1' });
    r.play(12);
    expect(r.model.get().counts.presents).toBe(1);
    expect(ids(r.announced.flat())).toContain('present');
    const tree = rig({ world: makeWorld({ map: farm(), recruited: [] }) });
    tree.feed({ type: 'prop-activity', instanceId: 'forest/chest-1', activity: 'delight', seconds: 1 });
    expect(tree.model.get().counts.presents).toBeUndefined();
  });

  it('counts a tap on a toy in the snow, as it is tapped, and no other kind of activity', () => {
    const r = rig({ world: makeWorld({ map: farm(), recruited: [] }) });
    r.announced.length = 0;
    r.feed({ type: 'prop-activity', instanceId: 'forest/snowman-1', activity: 'harvest', seconds: 1 });
    expect(r.model.get().counts).toEqual({});
    r.feed({ type: 'prop-activity', instanceId: 'forest/snowman-1', activity: 'delight', seconds: 1.8 });
    expect(r.model.get().counts).toEqual({ 'tap:snowman': 1 });
    expect(ids(r.announced.flat())).toEqual(['tap-snowman']);
    r.feed({ type: 'prop-activity', instanceId: 'forest/snowman-1', activity: 'delight', seconds: 1.8 });
    expect(r.model.get().counts['tap:snowman']).toBe(2);
  });

  it('counts a game that was opened, but only the toys that are games', () => {
    const r = rig();
    r.feed({ type: 'minigame-started', game: 'lily-hop', instanceId: 'x' });
    r.feed({ type: 'minigame-started', game: 'statue-postcard', instanceId: 'y' });
    r.feed({ type: 'minigame-started', game: 'memory', instanceId: 'z' });
    expect(r.model.get().counts).toEqual({ 'wonder:lily-hop': 1 });
    expect(ids(r.announced.flat())).toContain('game-lily-hop');
  });

  it('counts a swim once, however long she stays in the water', () => {
    const r = rig();
    for (let i = 0; i < 5; i++) r.feed({ type: 'effect', effect: 'dive', at: { x: 0, y: 0 }, seconds: 1 });
    r.feed({ type: 'effect', effect: 'wade', at: { x: 0, y: 0 }, seconds: 1 });
    expect(r.model.get().counts).toEqual({ swim: 1 });
    expect(ids(r.announced.flat())).toContain('swim');
  });

  it('counts a grand sandcastle, and not the mound or the small one', () => {
    const r = rig();
    for (const stage of [1, 2]) {
      r.world.persistent.props['forest/castle-1'] = { kind: 'castle', stage };
      r.feed({ type: 'prop-changed', instanceId: 'forest/castle-1' });
    }
    expect(r.model.get().counts['castle-grand']).toBeUndefined();
    r.world.persistent.props['forest/castle-1'] = { kind: 'castle', stage: 3 };
    r.feed({ type: 'prop-changed', instanceId: 'forest/castle-1' });
    expect(r.model.get().counts['castle-grand']).toBe(1);
    expect(ids(r.announced.flat())).toContain('castle');
  });

  it('does not count a chest opening, or a door, as anything', () => {
    const r = rig();
    r.world.persistent.props['forest/chest-1'] = { kind: 'chest', open: true };
    r.feed({ type: 'prop-changed', instanceId: 'forest/chest-1' }, { type: 'unlocked', instanceId: 'forest/door-1' });
    expect(r.model.get().counts).toEqual({});
  });
});

describe('what the world and the books say becomes stickers', () => {
  it('earns a place when the herd is in it, and a friend when she has joined', () => {
    const r = rig();
    r.announced.length = 0;
    r.world.persistent.visitedMaps.push('beach');
    r.feed({ type: 'map-entered', mapId: 'beach' });
    expect(ids(r.announced.flat())).toEqual(['visit-beach']);
    r.world.persistent.recruited.push('leaf');
    r.feed({ type: 'friend-recruited', unicornId: 'leaf' });
    expect(ids(r.announced.flat())).toEqual(['visit-beach', 'friend-leaf']);
  });

  it('earns the herd when the last friend joins, and no sooner', () => {
    const r = rig({ world: makeWorld({ map: lively(), recruited: ['leaf', 'glacier', 'river', 'cinder'] }) });
    expect(earned(r)).not.toContain('herd');
    r.world.persistent.recruited.push('storm');
    r.feed({ type: 'friend-recruited', unicornId: 'storm' });
    expect(earned(r)).toContain('herd');
  });

  it('earns what the books earn when the learner changes them', () => {
    const r = rig();
    r.announced.length = 0;
    r.session.learned({ ...NO_LEARNING, words: 12, mathsRounds: 1 });
    expect(ids(r.announced.flat()).sort()).toEqual(['sums', 'word', 'words-10']);
    r.session.learned({ ...NO_LEARNING, words: 12, mathsRounds: 1 });
    expect(r.announced, 'nothing is announced twice').toHaveLength(1);
  });

  it('earns a finale or a picture that the world does not know of, when told', () => {
    const r = rig();
    r.announced.length = 0;
    r.session.note('finale:lily-hop');
    r.session.note('photos');
    expect(ids(r.announced.flat()).sort()).toEqual(['finale', 'photo']);
  });

  it('hands out a sticker once, whichever way the facts come, and counts only stickers there are', () => {
    const r = rig();
    r.session.note('photos');
    r.session.note('photos');
    r.session.note('not-a-count-we-keep');
    expect(r.announced.flat().filter((s) => s.id === 'photo')).toHaveLength(1);
    expect(r.session.have()).toBe(2);
    expect(STICKERS.length).toBeGreaterThan(80);
  });

  it('says every fact, for the book to say how far the player has come', () => {
    const r = rig({ world: makeWorld({ map: lively(), recruited: ['leaf'] }), learner: { ...NO_LEARNING, words: 7 } });
    r.session.note('cast:fire');
    r.session.note('cast:fire');
    const facts = r.session.facts();
    expect(facts['cast:fire']).toBe(2);
    expect(facts.casts).toBe(2);
    expect(facts.words).toBe(7);
    expect(facts.friends).toBe(2);
  });
});

describe('telling whoever shows stickers', () => {
  it('tells every listener, once for each moment, and stops when one is taken away', () => {
    const r = rig();
    const heard: string[][] = [];
    const stop = r.session.onEarned((stickers) => heard.push(ids(stickers)));
    r.session.note('photos');
    stop();
    r.session.note('finale:lily-hop');
    expect(heard).toEqual([['photo']]);
    expect(r.announced.map(ids)).toEqual([['hello'], ['photo'], ['finale']]);
  });

  it('records a sticker on the day it was earned', () => {
    const r = rig();
    expect(r.session.got().hello).toBe(Math.floor(T0 / 86_400_000));
  });
});

describe('how far the learner has come', () => {
  const play = (patch: Partial<PlayRecord['memory']> & { maths?: number } = {}): PlayRecord => ({
    ...emptyPlay(),
    memory: { played: patch.played ?? 0, sizes: patch.sizes ?? {} },
    maths: { played: patch.maths ?? 0, strands: {} },
  });

  it('is nothing for a player who has done nothing', () => {
    expect(learnerStanding(emptyProfile(), emptyPlay(), T0)).toEqual(NO_LEARNING);
  });

  it('counts the words spelled, the sentences read and the rounds played', () => {
    const profile = withSentence(profileOf({ apple: {}, bird: {}, crown: {} }), 'the-cat-sat', progress());
    const standing = learnerStanding(
      profile,
      play({
        played: 4,
        sizes: {
          '3': { wins: 2, best: 5, stars: 2 },
          '6': { wins: 1, best: 12, stars: 1 },
        },
        maths: 9,
      }),
      T0,
    );
    expect(standing).toEqual({
      words: 3,
      allWords: false,
      sentences: 1,
      mathsRounds: 9,
      memoryGames: 4,
      memoryPairs: 6,
    });
  });

  it('says every word of the book was spelled only when every one was', () => {
    let profile = emptyProfile();
    for (const word of WORD_IDS) profile = withProgress(profile, word, 'spell', progress());
    expect(learnerStanding(profile, emptyPlay(), T0).allWords).toBe(true);
    const missing = withProgress(emptyProfile(), WORD_IDS[0]!, 'spell', progress());
    expect(learnerStanding(missing, emptyPlay(), T0).allWords).toBe(false);
  });
});

describe('the friend who is in the world from the start', () => {
  it('is Wildstar, who is always there', () => {
    const w = makeWorld({ map: lively(), recruited: [] });
    expect(leaderOf(w)).toBeDefined();
    expect(w.persistent.recruited).toEqual(['wildstar']);
  });
});
