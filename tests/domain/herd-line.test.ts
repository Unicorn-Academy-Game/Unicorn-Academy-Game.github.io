import { describe, expect, it } from 'vitest';
import { HERD_LINE, herdIsWhole, lineOf } from '../../src/content/unicorns';
import { CONFIG } from '../../src/domain/config';
import { checkInvariants } from '../../src/domain/invariants';
import { herdSlots, slotS } from '../../src/domain/ops';
import { placeFollower } from '../../src/domain/systems/herd';
import type { Following, World } from '../../src/domain/types';
import { dispatch, step } from '../../src/domain/world';
import { UNICORN_IDS, type UnicornId } from '../../src/shared/ids';
import { distance, hold, leaderOf, makeWorld, run, teleport } from './fixtures';

const IN_ORDER: UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];
const SCRAMBLED: UnicornId[] = ['storm', 'cinder', 'leaf', 'glacier', 'river'];
const EAST = { x: 1, y: 0 };
const SOUTH = { x: 0, y: 1 };
const WEST = { x: -1, y: 0 };
const NORTH = { x: 0, y: -1 };

/**
 * How far from its slot a follower stands, in arc length along the trail. Infinite while it is
 * doing something else.
 */
const offSlot = (world: World, id: UnicornId): number => {
  const st = world.unicorns[id]!.state;
  return st.kind === 'following' ? Math.abs(slotS(world, id) - st.s) : Infinity;
};

const inPlace = (world: World): boolean => IN_ORDER.every((id) => offSlot(world, id) < 3);

/** Runs until `done`, checking the invariants on every step. */
function until(world: World, done: (w: World) => boolean, seconds: number, what: string): void {
  for (let i = 0; i < Math.round(seconds * CONFIG.stepHz); i++) {
    if (done(world)) return;
    step(world);
    const bad = checkInvariants(world);
    if (bad.length > 0) throw new Error(`t=${world.time.toFixed(2)} ${bad[0]!}`);
  }
  if (!done(world)) throw new Error(`timed out after ${seconds}s waiting for ${what}`);
}

/**
 * Wildstar walks a long way without doubling back, so the herd keeps to the trail and has trail
 * enough for every place, and then she stops.
 */
function walkAbout(
  world: World,
  legs: readonly (readonly [{ x: number; y: number }, number])[] = [
    [EAST, 1.2],
    [SOUTH, 5.4],
  ],
  each?: (w: World) => void,
): void {
  for (const [heading, seconds] of legs) hold(world, heading, seconds, each);
  dispatch(world, { type: 'halt', commandId: 'halt-after-walk' });
}

/**
 * A herd that formed up in the order the friends were found, as it does in play before the line-up:
 * the order is put out of line and every follower is set down in its place in that order.
 */
function foundOutOfOrder(): World {
  const world = makeWorld({ recruited: IN_ORDER });
  world.order.splice(0, world.order.length, ...SCRAMBLED);
  const slots = herdSlots(world);
  SCRAMBLED.forEach((id) => {
    const st = world.unicorns[id]!.state as Following;
    st.s = slots.get(id)!;
    st.join = { x: 0, y: 0 };
    const pos = placeFollower(world, st).pos;
    world.unicorns[id]!.pos = { ...pos };
    world.unicorns[id]!.prev = { ...pos };
  });
  return world;
}

describe('the order of the whole herd', () => {
  it('is leaf, glacier, river, cinder, storm', () => {
    expect(HERD_LINE).toEqual(['leaf', 'glacier', 'river', 'cinder', 'storm']);
    expect(HERD_LINE).toEqual(UNICORN_IDS.filter((id) => id !== 'wildstar'));
  });

  it('is the line once all five are found, in whatever order they were found', () => {
    for (const found of [
      IN_ORDER,
      SCRAMBLED,
      [...IN_ORDER].reverse(),
      ['glacier', 'storm', 'leaf', 'river', 'cinder'] as UnicornId[],
    ]) {
      expect(herdIsWhole(['wildstar', ...found])).toBe(true);
      expect(lineOf(['wildstar', ...found])).toEqual(IN_ORDER);
    }
  });

  it('is the order they were found while a friend is still missing', () => {
    expect(lineOf(['wildstar'])).toEqual([]);
    expect(lineOf(['wildstar', 'storm', 'leaf'])).toEqual(['storm', 'leaf']);
    expect(lineOf(['wildstar', 'cinder', 'storm', 'glacier', 'river'])).toEqual([
      'cinder',
      'storm',
      'glacier',
      'river',
    ]);
    expect(herdIsWhole(['wildstar', 'cinder', 'storm', 'glacier', 'river'])).toBe(false);
  });

  it('is already the line when a world is made with the whole herd, so a saved herd arrives in order', () => {
    const world = makeWorld({ recruited: SCRAMBLED });
    expect(world.order).toEqual(IN_ORDER);
    for (const id of IN_ORDER) expect(offSlot(world, id), `${id} stands in its place`).toBeLessThan(1);
    const along = IN_ORDER.map((id) => distance(leaderOf(world).pos, world.unicorns[id]!.pos));
    expect([...along].sort((a, b) => a - b)).toEqual(along);
  });

  it('stays the order they were found, at rest and on the move, until the herd is whole', () => {
    const world = makeWorld({ recruited: ['storm', 'leaf', 'glacier'] });
    expect(world.order).toEqual(['storm', 'leaf', 'glacier']);
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1000, y: 800 } });
    run(world, 25);
    expect(world.order).toEqual(['storm', 'leaf', 'glacier']);
  });

  it('forms the line by itself when the herd was found out of order, without anyone jumping', () => {
    const world = foundOutOfOrder();
    expect(world.order).toEqual(SCRAMBLED);
    let worst = 0;
    const last = new Map(IN_ORDER.map((id) => [id, { ...world.unicorns[id]!.pos }]));
    walkAbout(world, undefined, (w) => {
      for (const id of IN_ORDER) {
        const now = w.unicorns[id]!.pos;
        worst = Math.max(worst, distance(last.get(id)!, now));
        last.set(id, { ...now });
      }
    });
    expect(world.order).toEqual(IN_ORDER);
    // A follower moves at most its catch-up speed, or the cap on a glide, and never in a jump.
    expect(worst).toBeLessThanOrEqual(
      Math.max(CONFIG.speed.catchUpMax * CONFIG.step * 1.25, CONFIG.herd.maxStep) + 0.001,
    );
    until(world, inPlace, 3, 'everyone to stand in place');
    // Nearest Wildstar first, in the herd's order, and nobody standing on anybody.
    const along = IN_ORDER.map((id) => distance(leaderOf(world).pos, world.unicorns[id]!.pos));
    expect([...along].sort((a, b) => a - b)).toEqual(along);
    for (let i = 0; i < IN_ORDER.length; i++)
      for (let j = i + 1; j < IN_ORDER.length; j++)
        expect(distance(world.unicorns[IN_ORDER[i]!]!.pos, world.unicorns[IN_ORDER[j]!]!.pos)).toBeGreaterThan(45);
  });

  it('forms the line when Wildstar stands still too, and the unicorns that were away from the herd take their new places when they come back', () => {
    const world = foundOutOfOrder();
    run(world, 40);
    expect(world.order).toEqual(IN_ORDER);
    walkAbout(world);
    until(world, inPlace, 3, 'everyone to stand in place');
  });

  it('keeps the line afterwards, however far she walks', () => {
    const world = foundOutOfOrder();
    walkAbout(world);
    run(world, 2);
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1000, y: 1250 } });
    run(world, 30);
    dispatch(world, { type: 'move', commandId: 'm2', destination: { x: 600, y: 300 } });
    run(world, 30);
    expect(world.order).toEqual(IN_ORDER);
  });

  it('waits while one of them is mid-cast, and lines up when the cast is over', () => {
    const world = foundOutOfOrder();
    dispatch(world, { type: 'cast', commandId: 'c1', unicornId: 'cinder' });
    step(world);
    expect(world.unicorns.cinder!.state.kind).toBe('casting');
    for (let i = 0; i < 6; i++) step(world);
    expect(world.order).toEqual(SCRAMBLED);
    until(world, (w) => w.unicorns.cinder!.state.kind !== 'casting', 5, 'the cast to end');
    until(world, (w) => w.order.every((id, i) => id === IN_ORDER[i]), 5, 'the line to form');
  });

  it('is the line the fifth friend takes when she joins at the back, after she has joined', () => {
    const world = makeWorld({ recruited: ['storm', 'cinder', 'river', 'glacier'], rules: { friends: 'ask' } });
    expect(world.order).toEqual(['storm', 'cinder', 'river', 'glacier']);
    const leaf = world.unicorns.leaf!;
    teleport(world, 'wildstar', { x: leaf.pos.x - 100, y: leaf.pos.y });
    run(world, 1);
    dispatch(world, { type: 'befriend', commandId: 'b1', unicornId: 'leaf' });
    expect(world.order).toEqual(['storm', 'cinder', 'river', 'glacier', 'leaf']);
    // She is greeted, casts and walks to the herd first. The herd shuffles when she is in it, and
    // not before.
    const seen = new Set<string>();
    until(
      world,
      () => {
        seen.add(world.unicorns.leaf!.state.kind);
        return world.order[0] === 'leaf';
      },
      30,
      'the line to form',
    );
    expect([...seen]).toEqual(expect.arrayContaining(['greeting', 'casting', 'recovering']));
    expect(world.unicorns.leaf!.state.kind).toBe('following');
    expect(world.order).toEqual(IN_ORDER);
    walkAbout(world, [
      [WEST, 3.5],
      [NORTH, 4.5],
    ]);
    until(world, inPlace, 3, 'everyone to stand in place');
    run(world, 10);
    expect(world.order).toEqual(IN_ORDER);
  });
});
