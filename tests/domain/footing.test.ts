import { describe, expect, it } from 'vitest';
import type { DomainEvent, World } from '../../src/domain';
import { dispatch, drainEvents } from '../../src/domain';
import { distance, halt, hold, lane, leaderOf, makeWorld, run, teleport } from './fixtures';

let seq = 0;
const move = (world: World, to: { x: number; y: number }): void =>
  dispatch(world, { type: 'move', commandId: `m${++seq}`, destination: to });
const answers = (world: World): DomainEvent['type'][] =>
  drainEvents(world)
    .map((e) => e.type)
    .filter((t) => t === 'command-accepted' || t === 'command-refused');

describe('a leader in a lane too narrow for the route search', () => {
  // The lane is a band ten units wide between two walls. She can walk into it by being led, and
  // from the middle of it no cell is near.
  const inLane = (x = 750): World => {
    const world = makeWorld({ map: lane() });
    teleport(world, 'wildstar', { x, y: 708 });
    drainEvents(world);
    return world;
  };

  it('is walked into by being led, and a tap then gets her out of it', () => {
    const world = makeWorld({ map: lane() });
    // From the yard, lined up with the lane, a finger held toward the east leads her in.
    teleport(world, 'wildstar', { x: 220, y: 708 });
    hold(world, { x: 1, y: 0 }, 1.4);
    halt(world);
    run(world, 1);
    const stood = leaderOf(world).pos;
    expect(stood.x).toBeGreaterThan(500);
    expect(stood.x).toBeLessThan(1100);
    drainEvents(world);
    move(world, { x: 150, y: 400 });
    expect(answers(world)).toEqual(['command-accepted']);
    run(world, 12);
    expect(distance(leaderOf(world).pos, { x: 150, y: 400 })).toBeLessThan(40);
  });

  it('is taken out of it by a tap on the yard to the west', () => {
    const world = inLane();
    const yard = { x: 150, y: 400 };
    move(world, yard);
    expect(answers(world)).toEqual(['command-accepted']);
    run(world, 12);
    expect(answers(world)).not.toContain('command-refused');
    expect(distance(leaderOf(world).pos, yard)).toBeLessThan(40);
  });

  it('is taken out of it by a tap on the yard to the east', () => {
    const world = inLane(500);
    const yard = { x: 1400, y: 900 };
    move(world, yard);
    expect(answers(world)).toEqual(['command-accepted']);
    run(world, 14);
    expect(answers(world)).not.toContain('command-refused');
    expect(distance(leaderOf(world).pos, yard)).toBeLessThan(40);
  });

  it('is told no only for a tap she could not walk to, wherever in the lane she stands', () => {
    for (const x of [320, 450, 600, 750, 900, 1050, 1180]) {
      const world = inLane(x);
      move(world, { x: 640, y: 300 });
      expect(answers(world), `a tap on open ground from x ${x}`).toEqual(['command-accepted']);
    }
  });
});

describe('the herd when she is put down on open ground', () => {
  /**
   * Walked a long way over the yard with three friends behind her, then led into the lane by a
   * finger.
   */
  function ledIn(): World {
    const world = makeWorld({ map: lane(), recruited: ['leaf', 'glacier', 'river'] });
    for (const to of [
      { x: 1700, y: 420 },
      { x: 220, y: 420 },
      { x: 1700, y: 420 },
      { x: 220, y: 708 },
    ]) {
      move(world, to);
      run(world, 14);
    }
    hold(world, { x: 1, y: 0 }, 1.6);
    halt(world);
    run(world, 2);
    drainEvents(world);
    return world;
  }

  it('gathers behind her where she was put, in their own order, and nobody is drawn crossing the map', () => {
    const world = ledIn();
    // The arc length of her trail is far past what it takes to lay the way back, which is what each
    // of them is placed by.
    expect(world.trail.head).toBeGreaterThan(3000);
    expect(leaderOf(world).pos.x).toBeGreaterThan(500);
    move(world, { x: 150, y: 400 });
    // Everyone is drawn from where they stood to where they belong, a step or two at a time, which
    // the invariants check after every step.
    run(world, 3);
    const lead = leaderOf(world).pos;
    const placed = world.order.map((id) => distance(world.unicorns[id]!.pos, lead));
    expect(Math.min(...placed)).toBeGreaterThan(60);
    run(world, 25);
    expect(distance(leaderOf(world).pos, { x: 150, y: 400 })).toBeLessThan(40);
    for (const id of world.order) {
      const f = world.unicorns[id]!;
      expect(f.state.kind, id).not.toBe('recovering');
      expect(distance(f.pos, leaderOf(world).pos), id).toBeLessThan(700);
    }
  });

  it('is not left standing on top of her when the herd is already near and she is only put down a short way off', () => {
    const world = makeWorld({ map: lane(), recruited: ['leaf', 'glacier'] });
    teleport(world, 'wildstar', { x: 750, y: 708 });
    drainEvents(world);
    move(world, { x: 640, y: 300 });
    run(world, 6);
    const lead = leaderOf(world).pos;
    for (const id of world.order) expect(distance(world.unicorns[id]!.pos, lead), id).toBeGreaterThan(50);
  });
});
