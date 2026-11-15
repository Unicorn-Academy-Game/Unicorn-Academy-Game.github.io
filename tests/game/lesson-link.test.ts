import { describe, expect, it } from 'vitest';
import type { SubjectId } from '../../src/content/lexicon';
import { PROP_DEFS } from '../../src/content/props';
import type { Command, DomainEvent, Rules, World } from '../../src/domain';
import { dispatch, drainEvents } from '../../src/domain';
import { LessonLink } from '../../src/game/lesson-link';
import type { LessonPort, Place } from '../../src/game/ports';
import type { UnicornId } from '../../src/shared/ids';
import { LogicMap } from '../../src/shared/map';
import { lively, makeWorld, run as runWorld, teleport } from '../domain/fixtures';

/**
 * A lesson that writes down what the world told it, and answers a held tap the way it is told to.
 */
class FakeLesson implements LessonPort {
  holdAnswer = true;
  readonly held: { subject: SubjectId; release: () => void }[] = [];
  readonly touches: { subject: SubjectId; where: () => Place }[] = [];
  readonly meets: { unicorn: UnicornId; join: () => void }[] = [];
  readonly aways: UnicornId[] = [];
  places = 0;

  hold(subject: SubjectId, release: () => void): boolean {
    this.held.push({ subject, release });
    return this.holdAnswer;
  }
  touched(subject: SubjectId, where: () => Place): void {
    this.touches.push({ subject, where });
  }
  met(unicorn: UnicornId, join: () => void): void {
    this.meets.push({ unicorn, join });
  }
  away(unicorn: UnicornId): void {
    this.aways.push(unicorn);
  }
  newPlace(): void {
    this.places += 1;
  }
  get subjects(): SubjectId[] {
    return this.touches.map((t) => t.subject);
  }
}

const box = (cx: number, cy: number, half: number) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });

/**
 * The meadow with its creatures, and in the open ground below the herd a tree, a bed, a pile of
 * gold, a table of gems, a throne and a confetti popper.
 */
function shelf(): LogicMap {
  const base = lively();
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
        instanceId: 'forest/gems-1',
        definitionId: 'ruby-table',
        pos: { x: 950, y: 1250 },
        hit: box(950, 1230, 60),
        approach: [{ pos: { x: 950, y: 1340 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/carrots-1',
        definitionId: 'carrot-bed',
        pos: { x: 450, y: 1250 },
        hit: box(450, 1230, 60),
        approach: [{ pos: { x: 450, y: 1340 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/gold-1',
        definitionId: 'coin-pile',
        pos: { x: 1150, y: 1250 },
        hit: box(1150, 1230, 60),
        approach: [{ pos: { x: 1150, y: 1340 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/throne-1',
        definitionId: 'throne',
        pos: { x: 1350, y: 1250 },
        hit: box(1350, 1230, 60),
        approach: [{ pos: { x: 1350, y: 1340 }, facing: 'north' }],
      },
      {
        instanceId: 'forest/popper-1',
        definitionId: 'confetti-popper',
        pos: { x: 250, y: 1250 },
        hit: box(250, 1230, 60),
        approach: [{ pos: { x: 250, y: 1340 }, facing: 'north' }],
      },
    ],
  });
}

interface Options {
  /** Nothing is asked and no tap is held. */
  lesson?: boolean;
  recruited?: UnicornId[];
  rules?: Rules;
}

/**
 * A world and the link to a lesson, run the way the controller runs them: what the world says goes
 * to the link as it says it.
 */
function rig(options: Options = {}) {
  let world: World = makeWorld({
    map: shelf(),
    recruited: options.recruited ?? [],
    ...(options.rules ? { rules: options.rules } : {}),
  });
  const lesson = options.lesson === false ? undefined : new FakeLesson();
  const link = new LessonLink(() => world);
  if (lesson) link.attach(lesson);
  const seen: DomainEvent[] = [];
  const pump = (w: World): void => {
    for (const e of drainEvents(w)) {
      seen.push(e);
      link.event(e);
    }
  };
  return {
    get world(): World {
      return world;
    },
    /** The herd is in another place. */
    moveTo(next: World): void {
      world = next;
    },
    lesson: lesson as FakeLesson,
    link,
    seen,
    /** Runs the world for `seconds`, and tells the link everything it said. */
    run(seconds: number): void {
      runWorld(world, seconds, pump);
    },
    /** Tells the link what the world has already said, without running it. */
    hear(): void {
      pump(world);
    },
  };
}

const APPLE_TREE: Command = { type: 'interact', commandId: 'tap-apple', instanceId: 'forest/apple-1' };
const GEMS: Command = { type: 'interact', commandId: 'tap-gems', instanceId: 'forest/gems-1' };
const CARROTS: Command = { type: 'interact', commandId: 'tap-carrots', instanceId: 'forest/carrots-1' };
const GOLD: Command = { type: 'interact', commandId: 'tap-gold', instanceId: 'forest/gold-1' };
const CHEST: Command = { type: 'interact', commandId: 'tap-chest', instanceId: 'forest/chest-1' };
const THRONE: Command = { type: 'interact', commandId: 'tap-throne', instanceId: 'forest/throne-1' };
const POPPER: Command = { type: 'interact', commandId: 'tap-popper', instanceId: 'forest/popper-1' };

const of = <T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] => events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);

describe('a tap on fruit', () => {
  it('goes to the lesson first, as the tree it is, and is not sent while the card is up', () => {
    const r = rig();
    let sent = 0;
    expect(
      r.link.holds(APPLE_TREE, () => {
        sent += 1;
      }),
    ).toBe(true);
    expect(r.lesson.held.map((h) => h.subject)).toEqual(['prop.apple-tree']);
    expect(sent).toBe(0);
  });

  it('is held as the thing it is, whatever grows there', () => {
    const r = rig();
    r.link.holds(CARROTS, () => undefined);
    r.link.holds(APPLE_TREE, () => undefined);
    expect(r.lesson.held.map((h) => h.subject)).toEqual(['prop.carrot-bed', 'prop.apple-tree']);
  });

  it('is sent once the lesson lets it go, and then the fruit falls and not before', () => {
    const r = rig();
    r.link.holds(APPLE_TREE, () => dispatch(r.world, APPLE_TREE));
    r.run(1);
    expect(of(r.seen, 'produce-dropped')).toEqual([]);
    r.lesson.held[0]!.release();
    r.run(14);
    expect(of(r.seen, 'produce-dropped').length).toBeGreaterThanOrEqual(3);
  });

  it('is not held when the lesson has no card, and then it is the tap as it has always been', () => {
    const r = rig();
    r.lesson.holdAnswer = false;
    let sent = 0;
    expect(
      r.link.holds(APPLE_TREE, () => {
        sent += 1;
      }),
    ).toBe(false);
    expect(sent).toBe(0);
  });

  it('is not sent into another place when the herd has left by the time the card is done', () => {
    const r = rig();
    let sent = 0;
    r.link.holds(APPLE_TREE, () => {
      sent += 1;
    });
    r.moveTo(makeWorld({ map: shelf() }));
    r.lesson.held[0]!.release();
    expect(sent).toBe(0);
  });

  it('is the only kind of tap that waits: a chest, a walk, a friend and a creature never go to the lesson', () => {
    const r = rig();
    const others: Command[] = [
      CHEST,
      GEMS,
      { type: 'move', commandId: 'm', destination: { x: 900, y: 700 } },
      { type: 'greet', commandId: 'g', unicornId: 'leaf' },
      { type: 'cast', commandId: 'c', unicornId: 'wildstar' },
      { type: 'poke', commandId: 'p', critterId: 'frog-1' },
      { type: 'interact', commandId: 'nothing', instanceId: 'forest/not-here' },
    ];
    for (const command of others)
      expect(
        r.link.holds(command, () => undefined),
        command.type,
      ).toBe(false);
    expect(r.lesson.held).toEqual([]);
  });

  it('is not held when there is no lesson at all', () => {
    const r = rig({ lesson: false });
    expect(r.link.holds(APPLE_TREE, () => undefined)).toBe(false);
  });
});

describe('a tap on a friend of hers', () => {
  const TAP_LEAF: Command = { type: 'cast', commandId: 'tap-leaf', unicornId: 'leaf' };

  it('asks about her by name, and finds her where she stands when the word is done', () => {
    const r = rig({ recruited: ['leaf'] });
    r.link.tapped(TAP_LEAF);
    expect(r.lesson.subjects).toEqual(['unicorn.leaf']);
    const leaf = r.world.unicorns.leaf!;
    leaf.pos = { x: 640, y: 910 };
    expect(r.lesson.touches[0]!.where()).toEqual({ at: { x: 640, y: 910 }, lift: 0 });
  });

  it('gives her place as a copy, so it cannot move her', () => {
    const r = rig({ recruited: ['leaf'] });
    r.link.tapped(TAP_LEAF);
    const place = r.lesson.touches[0]!.where();
    place.at.x = -1;
    expect(r.world.unicorns.leaf!.pos.x).not.toBe(-1);
  });

  it('is only a tap on a friend who has joined: walking to one, to fruit or to a creature does not ask', () => {
    const r = rig({ recruited: ['leaf'] });
    for (const command of [
      APPLE_TREE,
      GEMS,
      { type: 'greet', commandId: 'g', unicornId: 'leaf' } as const,
      { type: 'move', commandId: 'm', destination: { x: 900, y: 700 } } as const,
      { type: 'poke', commandId: 'p', critterId: 'frog-1' } as const,
    ])
      r.link.tapped(command);
    expect(r.lesson.touches).toEqual([]);
  });

  it('asks nothing about a friend who is not in this world, where the tap did nothing', () => {
    const r = rig({ recruited: ['leaf'] });
    r.link.tapped({ type: 'cast', commandId: 'tap-storm', unicornId: 'storm' });
    expect(r.lesson.touches).toEqual([]);
  });

  it('asks nothing when there is no lesson', () => {
    const r = rig({ recruited: ['leaf'], lesson: false });
    expect(() => r.link.tapped(TAP_LEAF)).not.toThrow();
  });
});

describe('a creature she poked', () => {
  it('is asked about by its kind, and found where it is when the word is done, as it moves', () => {
    const r = rig();
    const frog = r.world.life.critters.find((c) => c.kind === 'frog')!;
    dispatch(r.world, { type: 'poke', commandId: 'poke-1', critterId: frog.id });
    r.hear();
    expect(r.lesson.subjects).toEqual(['life.frog']);
    frog.pos = { x: 420, y: 230 };
    frog.z = 0;
    expect(r.lesson.touches[0]!.where()).toEqual({ at: { x: 420, y: 230 }, lift: 0 });
  });

  it('is asked about for every kind there is, by what it is called', () => {
    const r = rig();
    const kinds = new Set(r.world.life.critters.map((c) => c.kind));
    for (const kind of kinds)
      dispatch(r.world, {
        type: 'poke',
        commandId: `poke-${kind}`,
        critterId: r.world.life.critters.find((c) => c.kind === kind)!.id,
      });
    r.hear();
    expect(new Set(r.lesson.subjects)).toEqual(new Set([...kinds].map((k) => `life.${k}`)));
  });

  it('is found a creature that flies where it flies, with how high it is', () => {
    const r = rig();
    const bird = r.world.life.critters.find((c) => c.kind === 'bird')!;
    dispatch(r.world, { type: 'poke', commandId: 'poke-bird', critterId: bird.id });
    r.hear();
    bird.pos = { x: 500, y: 300 };
    bird.z = 120;
    expect(r.lesson.touches[0]!.where()).toEqual({ at: { x: 500, y: 300 }, lift: 120 });
  });

  it('gives its place as a copy, so it cannot move the creature', () => {
    const r = rig();
    const frog = r.world.life.critters.find((c) => c.kind === 'frog')!;
    dispatch(r.world, { type: 'poke', commandId: 'poke-1', critterId: frog.id });
    r.hear();
    const was = { ...frog.pos };
    const place = r.lesson.touches[0]!.where();
    place.at.x = -1;
    expect(frog.pos).toEqual(was);
  });

  it('is found in the world it was poked in, even when the herd is somewhere else by the time the word is done', () => {
    const r = rig();
    const frog = r.world.life.critters.find((c) => c.kind === 'frog')!;
    dispatch(r.world, { type: 'poke', commandId: 'poke-1', critterId: frog.id });
    r.hear();
    frog.pos = { x: 420, y: 230 };
    const elsewhere = makeWorld({ map: shelf() });
    for (const critter of elsewhere.life.critters) critter.pos = { x: 1, y: 1 };
    r.moveTo(elsewhere);
    expect(r.lesson.touches[0]!.where().at).toEqual({ x: 420, y: 230 });
  });

  it('is found where it was poked when it is gone by then', () => {
    const r = rig();
    const frog = r.world.life.critters.find((c) => c.kind === 'frog')!;
    dispatch(r.world, { type: 'poke', commandId: 'poke-1', critterId: frog.id });
    r.hear();
    const poked = of(r.seen, 'critter-poked')[0]!;
    r.world.life.critters.splice(r.world.life.critters.indexOf(frog), 1);
    expect(r.lesson.touches[0]!.where()).toEqual({ at: poked.at, lift: poked.z });
  });
});

describe('a treasure she tapped', () => {
  it('is asked about once the herd has got to it and it has answered, and not at the tap', () => {
    const r = rig();
    dispatch(r.world, GEMS);
    r.run(0.2);
    expect(r.lesson.touches).toEqual([]);
    r.run(15);
    expect(r.lesson.subjects).toEqual(['prop.ruby-table']);
  });

  it('is asked about when it bounces, as a pile of gold does, as well as when it floats, as gems do', () => {
    const r = rig();
    dispatch(r.world, GOLD);
    r.run(15);
    expect(of(r.seen, 'prop-activity').map((e) => e.activity)).toContain('treasure-bounce');
    expect(r.lesson.subjects).toEqual(['prop.coin-pile']);
  });

  it('is not asked about when the thing it was told of is not in this world', () => {
    const r = rig();
    expect(() =>
      r.link.event({ type: 'prop-activity', instanceId: 'forest/gone', activity: 'treasure-bounce', seconds: 1 }),
    ).not.toThrow();
    expect(r.lesson.touches).toEqual([]);
  });

  it('is found where the table stands', () => {
    const r = rig();
    dispatch(r.world, GEMS);
    r.run(15);
    expect(r.lesson.touches[0]!.where()).toEqual({ at: { x: 950, y: 1250 }, lift: 0 });
  });

  it('is the only thing a prop says that is a reason to ask: a chest, a bed and a tree are not', () => {
    const r = rig();
    dispatch(r.world, CHEST);
    r.run(15);
    dispatch(r.world, APPLE_TREE);
    r.run(15);
    expect(of(r.seen, 'prop-activity').map((e) => e.activity)).toEqual(
      expect.arrayContaining(['chest-opening', 'harvest']),
    );
    expect(r.lesson.touches).toEqual([]);
  });
});

describe('a thing that delights her', () => {
  it('is asked about once the herd has got to it and it has answered, as a treasure is, and not at the tap', () => {
    const r = rig();
    dispatch(r.world, THRONE);
    r.run(0.2);
    expect(r.lesson.touches).toEqual([]);
    r.run(15);
    expect(of(r.seen, 'prop-activity').map((e) => e.activity)).toContain('delight');
    expect(r.lesson.subjects).toEqual(['prop.throne']);
  });

  it('is found where it stands, with the shimmer as high above it as its own is', () => {
    const r = rig();
    dispatch(r.world, THRONE);
    r.run(15);
    const lift = PROP_DEFS.throne!.delight!.lift;
    expect(lift).toBeGreaterThan(0);
    expect(r.lesson.touches[0]!.where()).toEqual({ at: { x: 1350, y: 1250 }, lift });
  });

  it('is not a toy that opens a game, though that delights her as well: it has no word to give', () => {
    const r = rig();
    dispatch(r.world, POPPER);
    r.run(15);
    expect(of(r.seen, 'prop-activity').map((e) => e.activity)).toContain('delight');
    expect(r.lesson.touches).toEqual([]);
  });

  it('is not asked about when the thing it was told of is not in this world', () => {
    const r = rig();
    expect(() =>
      r.link.event({ type: 'prop-activity', instanceId: 'forest/gone', activity: 'delight', seconds: 1 }),
    ).not.toThrow();
    expect(r.lesson.touches).toEqual([]);
  });
});

describe('a friend who waits to be asked in', () => {
  const asking: Rules = { friends: 'ask' };
  /** Wildstar stands this far west of Leaf, in the clearing. */
  const standBy = (w: World, apart = 100): void =>
    teleport(w, 'wildstar', { x: w.unicorns.leaf!.pos.x - apart, y: w.unicorns.leaf!.pos.y });

  it('is given to the lesson, and joins when it says so, as if Wildstar had walked up', () => {
    const r = rig({ rules: asking });
    standBy(r.world);
    r.run(1);
    expect(r.lesson.meets.map((m) => m.unicorn)).toEqual(['leaf']);
    expect(r.world.persistent.recruited).toEqual(['wildstar']);
    r.lesson.meets[0]!.join();
    expect(r.world.persistent.recruited).toEqual(['wildstar', 'leaf']);
    r.run(3);
    expect(of(r.seen, 'friend-recruited').map((e) => e.unicornId)).toEqual(['leaf']);
  });

  it('can be told to join late and more than once, and she joins once', () => {
    const r = rig({ rules: asking });
    standBy(r.world);
    r.run(1);
    const { join } = r.lesson.meets[0]!;
    r.run(20);
    join();
    join();
    r.run(1);
    expect(r.world.persistent.recruited.filter((id) => id === 'leaf')).toHaveLength(1);
  });

  it('is asked again when she is tapped while she waits', () => {
    const r = rig({ rules: asking });
    standBy(r.world);
    r.run(1);
    dispatch(r.world, { type: 'greet', commandId: 'g1', unicornId: 'leaf' });
    r.run(0.1);
    expect(r.lesson.meets.map((m) => m.unicorn)).toEqual(['leaf', 'leaf']);
  });

  it('is told of it when Wildstar goes away from her', () => {
    const r = rig({ rules: asking });
    standBy(r.world);
    r.run(1);
    expect(r.lesson.aways).toEqual([]);
    standBy(r.world, 500);
    r.run(0.5);
    expect(r.lesson.aways).toEqual(['leaf']);
  });

  it('is not joined by a join that comes after the herd has gone to another place', () => {
    const r = rig({ rules: asking });
    const old = r.world;
    standBy(old);
    r.run(1);
    r.moveTo(makeWorld({ map: shelf(), rules: asking }));
    r.lesson.meets[0]!.join();
    expect(old.persistent.recruited).toEqual(['wildstar']);
    expect(r.world.persistent.recruited).toEqual(['wildstar']);
  });

  it('joins at once, with nothing to ask, when there is no lesson', () => {
    const r = rig({ rules: asking, lesson: false });
    standBy(r.world);
    r.run(1);
    expect(r.world.persistent.recruited).toEqual(['wildstar', 'leaf']);
  });

  it('is given to the lesson again when the game begins, if she was already waiting then', () => {
    const r = rig({ rules: asking });
    standBy(r.world);
    r.run(1);
    expect(r.lesson.meets).toHaveLength(1);
    r.link.begun();
    expect(r.lesson.meets.map((m) => m.unicorn)).toEqual(['leaf', 'leaf']);
  });

  it('is not given to the lesson when the game begins with no one waiting', () => {
    const r = rig({ rules: asking });
    r.run(1);
    r.link.begun();
    expect(r.lesson.meets).toEqual([]);
  });

  it('waits for the lesson once there is one, and not before', () => {
    const r = rig({ rules: asking, lesson: false });
    const lesson = new FakeLesson();
    r.link.attach(lesson);
    standBy(r.world);
    r.run(1);
    expect(lesson.meets.map((m) => m.unicorn)).toEqual(['leaf']);
    expect(r.world.persistent.recruited).toEqual(['wildstar']);
  });
});

describe('a new place', () => {
  it('is told to the lesson, so it forgets what was waiting in the old one', () => {
    const r = rig();
    r.link.newPlace();
    expect(r.lesson.places).toBe(1);
  });

  it('needs no lesson', () => {
    const r = rig({ lesson: false });
    expect(() => r.link.newPlace()).not.toThrow();
  });
});

describe("the events that are none of the lesson's business", () => {
  it('are let go by without a word', () => {
    const r = rig({ recruited: ['leaf'] });
    r.run(10);
    expect(r.seen.length).toBeGreaterThan(0);
    expect(r.lesson.touches).toEqual([]);
    expect(r.lesson.meets).toEqual([]);
    expect(r.lesson.aways).toEqual([]);
    expect(r.lesson.held).toEqual([]);
  });
});
