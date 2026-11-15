import { describe, expect, it } from 'vitest';
import type { DomainEvent, World } from '../../src/domain';
import { CONFIG, dispatch, drainEvents, step } from '../../src/domain';
import { distance, halt, leaderOf, makeWorld, run, steer } from './fixtures';

/**
 * She is meant to be moving, and is not. Nothing that was thought of ahead can be relied on to be
 * the whole list of ways that happens, so the simulation notices it itself, and puts her right:
 * first it sends her again where she was going, then it stands her down and sets her on open
 * ground, and after that it only stands her down. A held finger or key is told to say again, by an
 * event.
 *
 * Each fault is put in by hand, in the state a bug would leave her in, since none of them can be
 * reached by playing.
 */

let seq = 0;
const move = (world: World, to: { x: number; y: number }): void =>
  dispatch(world, { type: 'move', commandId: `m${++seq}`, destination: to });
const resets = (events: DomainEvent[]): Extract<DomainEvent, { type: 'leader-reset' }>[] =>
  events.filter((e): e is Extract<DomainEvent, { type: 'leader-reset' }> => e.type === 'leader-reset');

/** Steps for this long, keeping every event, with the invariants checked after each step. */
function watch(world: World, seconds: number, each?: (world: World) => void): DomainEvent[] {
  const out: DomainEvent[] = [];
  for (let i = 0, n = Math.round(seconds * CONFIG.stepHz); i < n; i++) {
    run(world, CONFIG.step);
    each?.(world);
    out.push(...drainEvents(world));
  }
  return out;
}

describe('a leader who is not on her feet', () => {
  it('is put on open ground at once when she is somewhere that is not a place', () => {
    const world = makeWorld();
    drainEvents(world);
    leaderOf(world).pos = { x: Number.NaN, y: Number.NaN };
    step(world);
    const a = leaderOf(world);
    expect(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y)).toBe(true);
    expect(world.nav.canSetOff(a.pos)).toBe(true);
    expect(resets(drainEvents(world)).map((e) => e.why)).toEqual(['misplaced']);
    // And she walks again when she is told to.
    move(world, { x: 600, y: 300 });
    watch(world, 8);
    expect(distance(a.pos, { x: 600, y: 300 })).toBeLessThan(40);
  });

  it('is put on open ground at once when she is inside a tree', () => {
    const world = makeWorld();
    drainEvents(world);
    leaderOf(world).pos = { x: 1100, y: 500 };
    step(world);
    const a = leaderOf(world);
    expect(world.nav.isWalkable(a.pos)).toBe(true);
    expect(distance(a.pos, { x: 1100, y: 500 })).toBeLessThan(200);
    expect(resets(drainEvents(world)).map((e) => e.why)).toEqual(['misplaced']);
  });

  it('keeps the herd with her when she is put down far from where they stand', () => {
    const world = makeWorld({ recruited: ['leaf', 'glacier'] });
    drainEvents(world);
    const herd = world.order.map((id) => ({ ...world.unicorns[id]!.pos }));
    // Inside the tree in the north east, as far from the herd as the meadow allows.
    leaderOf(world).pos = { x: 1500, y: 400 };
    step(world);
    expect(herd.every((at) => distance(at, leaderOf(world).pos) > 600)).toBe(true);
    watch(world, 14);
    const lead = leaderOf(world).pos;
    for (const id of world.order) expect(distance(world.unicorns[id]!.pos, lead), id).toBeLessThan(400);
  });
});

describe('a leader who is meant to move and does not', () => {
  it('is sent again where she was going when her route has gone', () => {
    const world = makeWorld();
    const goal = { x: 500, y: 300 };
    move(world, goal);
    watch(world, 0.3);
    expect(leaderOf(world).speed).toBeGreaterThan(0);
    // The route is lost, and nothing says so: she believes she is walking and stands still.
    leaderOf(world).path = null;
    const before = { ...leaderOf(world).pos };
    const first = watch(world, 2);
    expect(distance(leaderOf(world).pos, before)).toBeLessThan(1);
    expect(resets(first)).toEqual([]);
    const events = watch(world, 12);
    expect(resets(events).map((e) => e.why)).toEqual(['stalled']);
    expect(distance(leaderOf(world).pos, goal)).toBeLessThan(40);
  });

  it('is stood down when she is led and goes nowhere, and goes when the finger says so again', () => {
    const world = makeWorld();
    steer(world, { x: -1, y: 0 });
    watch(world, 0.4);
    const S = world.leader.steer!;
    expect(S).not.toBeNull();
    // Her pace is not a number, so every step she takes is none.
    S.pace = Number.NaN;
    const before = { ...leaderOf(world).pos };
    const events = watch(world, 4, () => steer(world, { x: -1, y: 0 }));
    expect(resets(events).map((e) => e.why)).toContain('stalled');
    // The finger that was held had to start over, and it did.
    expect(distance(leaderOf(world).pos, before)).toBeGreaterThan(100);
  });

  it('is set down on open ground when a finger is held on her and she still cannot be moved, though it takes the finger a moment to say again', () => {
    const world = makeWorld();
    const west = { x: -1, y: 0 };
    steer(world, west);
    watch(world, 0.4);
    // The fault is in every steering she is given, so telling her again does not cure it. What is
    // stood down has to be said again by the finger, which takes it three steps, and in those steps
    // she is not led by anyone.
    let sinceDown = 0;
    const events = watch(world, 9, (w) => {
      if (w.leader.steer) {
        w.leader.steer.pace = Number.NaN;
        sinceDown = 0;
      } else if (++sinceDown >= 3) steer(w, west);
    });
    const said = resets(events);
    expect(said.map((e) => e.why)).toEqual(['stalled', 'stalled', 'stalled']);
    // The first only stands her down. The second sets her down somewhere else. The third, and any
    // after it, only stand her down.
    expect(distance(said[0]!.at, said[1]!.at)).toBeGreaterThan(50);
    // (She takes one step of the new steering before the fault is put back in it, which is under
    // two units.)
    expect(distance(said[1]!.at, said[2]!.at)).toBeLessThan(5);
    expect(world.nav.canSetOff(said[1]!.at)).toBe(true);
  });

  it('is sent again, then set down on open ground, and answers a tap after that', () => {
    const world = makeWorld();
    const start = { ...leaderOf(world).pos };
    // The route search is held up for good, so her route is never found.
    world.paths.budget = 0;
    move(world, { x: 500, y: 300 });
    const events = watch(world, 7);
    const said = resets(events);
    expect(said.map((e) => e.why)).toEqual(['stalled', 'stalled']);
    const a = leaderOf(world);
    expect(distance(a.pos, said[1]!.at)).toBeLessThan(1);
    expect(distance(a.pos, start)).toBeGreaterThan(50);
    expect(world.nav.canSetOff(a.pos)).toBe(true);
    expect(world.leader.phase).toBe('idle');
    // Nothing is waiting for her any more, so nothing more is said, and a tap is answered once the
    // search runs again.
    expect(resets(watch(world, 8))).toEqual([]);
    world.paths.budget = CONFIG.nav.pathBudget;
    move(world, { x: 600, y: 300 });
    watch(world, 10);
    expect(distance(a.pos, { x: 600, y: 300 })).toBeLessThan(40);
  });

  it('answers each tap that is held up the same way, and no more than that', () => {
    const world = makeWorld();
    world.paths.budget = 0;
    const sayings: string[] = [];
    for (let k = 0; k < 4; k++) {
      move(world, { x: 500, y: 300 });
      sayings.push(...resets(watch(world, 7)).map((e) => e.why));
    }
    // Two for each of the four taps. A leader who is set down again and again for the same fault
    // would be a worse fault.
    expect(sayings).toEqual(Array(8).fill('stalled'));
  });
});

describe('a leader who is where she should be', () => {
  it('is left alone when she leans on a tree with a finger held', () => {
    const world = makeWorld();
    // From the west of the tree at (1100, 500), straight at it.
    dispatch(world, { type: 'move', commandId: 'to-tree', destination: { x: 900, y: 500 } });
    watch(world, 5);
    drainEvents(world);
    const events = watch(world, 8, () => steer(world, { x: 1, y: 0 }));
    expect(resets(events)).toEqual([]);
    const a = leaderOf(world);
    expect(a.pos.x).toBeLessThan(1100);
    expect(distance(a.pos, { x: 1100, y: 500 })).toBeLessThan(120);
  });

  it('is left alone when she stands and nothing is asked of her', () => {
    const world = makeWorld();
    expect(resets(watch(world, 20))).toEqual([]);
  });

  it('is left alone on a long walk, a refused tap, and a halt', () => {
    const world = makeWorld();
    const events: DomainEvent[] = [];
    move(world, { x: 1100, y: 1200 });
    events.push(...watch(world, 12));
    // Far outside the map there is nothing near enough to walk to, so the tap is refused.
    move(world, { x: -3000, y: -3000 });
    events.push(...watch(world, 6));
    steer(world, { x: 0, y: -1 });
    events.push(...watch(world, 1));
    halt(world);
    events.push(...watch(world, 3));
    expect(events.map((e) => e.type)).toContain('command-refused');
    expect(resets(events)).toEqual([]);
  });

  it('is left alone while a door swings open for the herd', () => {
    const world = makeWorld();
    const events: DomainEvent[] = [];
    dispatch(world, { type: 'interact', commandId: 'door', instanceId: 'forest/door-1' });
    events.push(...watch(world, 14));
    expect(events.map((e) => e.type)).toContain('portal-entered');
    expect(resets(events)).toEqual([]);
  });

  it('is left alone while she casts', () => {
    const world = makeWorld();
    dispatch(world, { type: 'cast', commandId: 'c', unicornId: 'wildstar' });
    expect(resets(watch(world, 4))).toEqual([]);
  });
});
