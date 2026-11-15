import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { checkInvariants } from '../../src/domain/invariants';
import { rejoinHerd, slotDistance } from '../../src/domain/ops';
import { placeFollower } from '../../src/domain/systems/herd';
import type { World } from '../../src/domain/types';
import { createWorld, dispatch, drainEvents, step } from '../../src/domain/world';
import type { UnicornId } from '../../src/shared/ids';
import { LogicMap } from '../../src/shared/map';
import { ALL, distance, leaderOf, makeWorld, meadow, persistentWith, run, serpentine } from './fixtures';

const FRIENDS: UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];

/** A world seen through a log of how far every unicorn moved on each step. */
function trackSteps(world: World, seconds: number): { worstStep: number; violations: string[] } {
  let worst = 0;
  const last = new Map<string, { x: number; y: number }>();
  for (const u of Object.values(world.unicorns)) last.set(u!.id, { ...u!.pos });
  const violations = run(world, seconds, (w) => {
    for (const u of Object.values(w.unicorns)) {
      const before = last.get(u!.id)!;
      const d = distance(before, u!.pos);
      // A relocation is a deliberate jump and is checked on its own.
      if (d < 60) worst = Math.max(worst, d);
      last.set(u!.id, { ...u!.pos });
    }
  });
  return { worstStep: worst, violations };
}

describe('traveling herd', () => {
  it('six unicorns follow a winding course and settle behind Wildstar', () => {
    const world = makeWorld({ map: serpentine(), recruited: FRIENDS });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1800, y: 1400 } });
    const { worstStep, violations } = trackSteps(world, 70);
    expect(violations).toEqual([]);
    // Nobody outruns the catch-up speed.
    expect(worstStep).toBeLessThanOrEqual(CONFIG.speed.catchUpMax * CONFIG.step * 1.25);
    const leader = leaderOf(world);
    expect(distance(leader.pos, { x: 1800, y: 1400 })).toBeLessThan(CONFIG.speed.arrive + 1);
    // Everyone is either strung out on the trail or doing something on the way back to it. Nobody
    // is lost.
    for (const id of FRIENDS) {
      const u = world.unicorns[id]!;
      expect(
        ['following', 'recovering', 'performing', 'approaching', 'casting', 'waiting'],
        `${id} is ${u.state.kind}`,
      ).toContain(u.state.kind);
      expect(distance(u.pos, leader.pos), id).toBeLessThan(slotDistance(world, id) + 400);
    }
  });

  it('every follower walks the leader trail, not a shortcut through the barriers', () => {
    const world = makeWorld({ map: serpentine(), recruited: FRIENDS });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1800, y: 1400 } });
    // Followers may never be in a spot Wildstar could not stand: feet clear at every step.
    const bad = run(world, 70, (w) => {
      for (const u of Object.values(w.unicorns))
        if (!w.nav.isWalkable(u!.pos, -3)) throw new Error(`${u!.id} inside an obstacle at ${u!.pos.x},${u!.pos.y}`);
    });
    expect(bad).toEqual([]);
  });

  it('keeps separate and settles on slots when Wildstar stops', () => {
    const world = makeWorld({ recruited: FRIENDS });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1000, y: 800 } });
    run(world, 20);
    // Look at them before idle activities start moving them around.
    const list = Object.values(world.unicorns).filter((u) => world.persistent.recruited.includes(u!.id));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        expect(distance(list[i]!.pos, list[j]!.pos), `${list[i]!.id}/${list[j]!.id}`).toBeGreaterThan(45);
  });

  it('a follower stuck far away walks back by search and rejoins', () => {
    const world = makeWorld({ map: serpentine(), recruited: FRIENDS });
    run(world, 2);
    // Put river in the bottom corridor, a long way around the barriers from where the herd stands.
    const river = world.unicorns.river!;
    river.pos = { x: 1800, y: 1400 };
    river.prev = { ...river.pos };
    rejoinHerd(world, river);
    expect(river.state.kind).toBe('recovering');
    const violations = run(world, 45);
    expect(violations).toEqual([]);
    expect(['following', 'performing', 'approaching', 'casting', 'waiting']).toContain(river.state.kind);
    expect(distance(river.pos, leaderOf(world).pos)).toBeLessThan(slotDistance(world, 'river') + 200);
  });

  it('relocates, with a sparkle and an event, a follower who cannot get back at all', () => {
    // Seal a room off from the rest of the map and drop a follower inside it.
    const base = serpentine();
    const walls = [
      { kind: 'rect' as const, x: 1700, y: 500, w: 20, h: 240 },
      { kind: 'rect' as const, x: 1900, y: 500, w: 20, h: 240 },
      { kind: 'rect' as const, x: 1700, y: 500, w: 220, h: 20 },
      { kind: 'rect' as const, x: 1700, y: 720, w: 220, h: 20 },
    ];
    const map = LogicMap.parse({ ...base, obstacles: [...base.obstacles, ...walls] });
    const world = makeWorld({ map, recruited: FRIENDS });
    run(world, 1.5);
    drainEvents(world);
    const glacier = world.unicorns.glacier!;
    glacier.pos = { x: 1810, y: 620 };
    glacier.prev = { ...glacier.pos };
    expect(world.nav.isWalkable(glacier.pos)).toBe(true);
    rejoinHerd(world, glacier);
    expect(glacier.state.kind).toBe('recovering');
    const leader = leaderOf(world);
    const violations = run(world, 12);
    expect(violations).toEqual([]);
    const events = drainEvents(world);
    const moved = events.filter((e) => e.type === 'companion-relocated');
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(world.nav.sameComponent(glacier.pos, leader.pos)).toBe(true);
    for (const other of Object.values(world.unicorns))
      if (other !== glacier) expect(distance(other!.pos, glacier.pos), other!.id).toBeGreaterThan(40);
  });

  it('passes a narrow gap without jamming', () => {
    const wall = (y: number, h: number) => ({ kind: 'rect' as const, x: 1000, y, w: 60, h });
    const base = serpentine();
    const map = LogicMap.parse({
      ...base,
      // A fence across the whole map with one gap barely wider than a unicorn.
      obstacles: [wall(0, 700), wall(800, 736)],
      spawns: [{ spawnId: 'start', facing: 'east', points: [500, 390, 280, 170, 100, 60].map((x) => ({ x, y: 750 })) }],
    });
    const world = createWorld({
      map,
      persistent: persistentWith(...FRIENDS),
      seed: 4,
      arrival: { kind: 'spawn', spawnId: 'start' },
    });
    // The column is about 570 units long, so the leader goes far enough for the last follower to be
    // well past the gap.
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1950, y: 750 } });
    expect(run(world, 45)).toEqual([]);
    for (const id of FRIENDS) expect(world.unicorns[id]!.pos.x, id).toBeGreaterThan(1060);
  });
});

describe('the gait a follower is drawn in', () => {
  /**
   * Every time a follower went from one pose to another and straight back within a third of a
   * second.
   */
  function flips(world: World, seconds: number): string[] {
    const poses = new Map<UnicornId, { before: string | null; clip: string; at: number }>();
    const found: string[] = [];
    run(world, seconds, (w) => {
      for (const id of FRIENDS) {
        const u = w.unicorns[id]!;
        if (u.state.kind !== 'following' || (u.anim.clip !== 'walk' && u.anim.clip !== 'idle')) {
          poses.delete(id);
          continue;
        }
        const now = poses.get(id);
        if (!now) poses.set(id, { before: null, clip: u.anim.clip, at: w.time });
        else if (now.clip !== u.anim.clip) {
          const held = w.time - now.at;
          if (held < 0.3 && now.before === u.anim.clip)
            found.push(
              `${id} went ${u.anim.clip} to ${now.clip} and back after ${held.toFixed(2)}s at t=${w.time.toFixed(2)}`,
            );
          poses.set(id, { before: now.clip, clip: u.anim.clip, at: w.time });
        }
      }
    });
    return found;
  }

  it.each([12345, 7, 99])(
    'does not flip between walking and standing while the herd settles after each stop (seed %i)',
    (seed) => {
      const world = makeWorld({ recruited: FRIENDS, seed });
      const flipped: string[] = [];
      for (const [i, to] of [
        { x: 1000, y: 800 },
        { x: 600, y: 700 },
        { x: 900, y: 1100 },
        { x: 500, y: 500 },
        { x: 800, y: 900 },
      ].entries()) {
        dispatch(world, { type: 'move', commandId: `m${i}`, destination: to });
        flipped.push(...flips(world, 9));
      }
      expect(flipped).toEqual([]);
    },
  );
});

describe('arrival after movement', () => {
  it('changes nothing about the membership while traveling', () => {
    const world = makeWorld({ map: serpentine(), recruited: ALL.slice(1) });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 1800, y: 1400 } });
    run(world, 30);
    expect(Object.keys(world.unicorns).sort()).toEqual([...ALL].sort());
    expect(checkInvariants(world)).toEqual([]);
    for (let i = 0; i < 3; i++) step(world);
  });
});

describe('when Wildstar turns back through the herd', () => {
  interface Pass {
    /** The least distance between any two unicorns, Wildstar included. */
    nearest: number;
    /** Seconds in which some two were nearer than a unicorn's own width. */
    crowded: number;
    /** Steps in which someone was drawn moving faster than any unicorn walks. */
    zips: number;
  }

  /**
   * Sends Wildstar along `legs` one after the other, to the end of each, and watches how close the
   * herd comes to itself.
   */
  function walk(legs: { x: number; y: number }[]): Pass {
    const world = makeWorld({ map: meadow(), recruited: FRIENDS });
    const ids = Object.keys(world.unicorns) as UnicornId[];
    const pass: Pass = { nearest: Infinity, crowded: 0, zips: 0 };
    const watch = (): void => {
      step(world);
      let closest = Infinity;
      for (let a = 0; a < ids.length; a++) {
        const first = world.unicorns[ids[a]!]!;
        if (distance(first.pos, first.prev) > 14) pass.zips++;
        for (let b = a + 1; b < ids.length; b++)
          closest = Math.min(closest, distance(first.pos, world.unicorns[ids[b]!]!.pos));
      }
      pass.nearest = Math.min(pass.nearest, closest);
      if (closest < 40) pass.crowded += CONFIG.step;
    };
    const leader = leaderOf(world);
    for (const [i, leg] of legs.entries()) {
      dispatch(world, { type: 'move', commandId: `leg${i}`, destination: leg });
      for (let k = 0; k < 40 * CONFIG.stepHz && distance(leader.pos, leg) > 14; k++) watch();
    }
    for (let k = 0; k < 6 * CONFIG.stepHz; k++) watch();
    expect(checkInvariants(world)).toEqual([]);
    return pass;
  }

  it('lets them pass, side to side, instead of through each other', () => {
    const back = walk([
      { x: 1000, y: 700 },
      { x: 400, y: 700 },
    ]);
    expect(back.nearest).toBeGreaterThan(24);
    expect(back.crowded).toBeLessThan(1);
    expect(back.zips).toBe(0);
  });

  it('stays apart through a turn and a turn back again', () => {
    const there = walk([
      { x: 1000, y: 700 },
      { x: 400, y: 700 },
      { x: 1000, y: 700 },
    ]);
    expect(there.nearest).toBeGreaterThan(10);
    expect(there.crowded).toBeLessThan(2);
    expect(there.zips).toBeLessThanOrEqual(1);
  });

  it('stays apart on a zigzag', () => {
    const zigzag = walk([
      { x: 1000, y: 600 },
      { x: 600, y: 700 },
      { x: 1000, y: 800 },
      { x: 600, y: 900 },
      { x: 1000, y: 1000 },
    ]);
    expect(zigzag.nearest).toBeGreaterThan(24);
    expect(zigzag.crowded).toBeLessThan(1);
    expect(zigzag.zips).toBeLessThanOrEqual(1);
  });

  it('leaves a gentle turn alone', () => {
    for (const turn of [
      { x: 1000, y: 1000 },
      { x: 600, y: 1000 },
    ]) {
      const gentle = walk([{ x: 1000, y: 700 }, turn]);
      expect(gentle.nearest).toBeGreaterThan(45);
      expect(gentle.crowded).toBe(0);
    }
  });
});

/**
 * Puts a follower on the trail at arc length `s`, standing where that is, as if it had arrived
 * there on its own.
 */
function putOnTrail(world: World, id: UnicornId, s: number): void {
  const actor = world.unicorns[id]!;
  if (actor.state.kind !== 'following') throw new Error(`${id} should be on the trail`);
  actor.state.s = s;
  actor.state.join = { x: 0, y: 0 };
  actor.state.push = { x: 0, y: 0 };
  actor.pos = placeFollower(world, actor.state).pos;
  actor.prev = { ...actor.pos };
}

const sOf = (world: World, id: UnicornId): number => {
  const state = world.unicorns[id]!.state;
  if (state.kind !== 'following') throw new Error(`${id} should be on the trail`);
  return state.s;
};

describe('who stands where in the herd', () => {
  it('starts in the order they were recruited', () => {
    expect(makeWorld({ recruited: FRIENDS }).order).toEqual(FRIENDS);
    expect(makeWorld({ recruited: ['leaf', 'glacier'] }).order).toEqual(['leaf', 'glacier']);
  });

  it('hands the nearer slot to the follower who got ahead, so nobody has to push past anybody', () => {
    const world = makeWorld({ map: meadow(), recruited: ['leaf', 'glacier'] });
    dispatch(world, { type: 'move', commandId: 'far', destination: { x: 1000, y: 1100 } });
    run(world, 2);
    putOnTrail(world, 'glacier', sOf(world, 'leaf') + 80);
    expect(world.order).toEqual(['leaf', 'glacier']);
    run(world, 0.2);
    expect(world.order).toEqual(['glacier', 'leaf']);
    expect(checkInvariants(world)).toEqual([]);
  });

  it('keeps followers that are level in the order they were in', () => {
    const world = makeWorld({ map: meadow(), recruited: ['leaf', 'glacier'] });
    dispatch(world, { type: 'move', commandId: 'far', destination: { x: 1000, y: 1100 } });
    run(world, 2);
    putOnTrail(world, 'glacier', sOf(world, 'leaf'));
    run(world, 0.2);
    expect(world.order).toEqual(['leaf', 'glacier']);
  });

  it('keeps two followers that are catching up from running level along the trail', () => {
    // A long winding walk, so the leader is still walking away while they run for their places.
    const world = makeWorld({ map: serpentine(), recruited: FRIENDS });
    dispatch(world, { type: 'move', commandId: 'far', destination: { x: 1800, y: 1400 } });
    run(world, 6);
    // Two of them are left far behind, level with each other, as if they had both just come back
    // from somewhere.
    const far = Math.max(world.trail.tail, world.trail.head - 900);
    putOnTrail(world, 'glacier', far);
    putOnTrail(world, 'river', far);
    expect(world.order.indexOf('glacier')).toBeLessThan(world.order.indexOf('river'));
    // With nothing to do but run for their places they would stay level until the places part them.
    // They string out.
    let narrowest = Infinity;
    const trouble = run(world, 4, (w) => {
      const front = w.unicorns.glacier!.state;
      const back = w.unicorns.river!.state;
      if (front.kind === 'following' && back.kind === 'following' && w.time > 7)
        narrowest = Math.min(narrowest, front.s - back.s);
    });
    expect(trouble).toEqual([]);
    expect(narrowest).toBeGreaterThan(55);
  });
});

describe('stepping aside as Wildstar sets off', () => {
  it('ends the activity of a unicorn standing right beside her at once, and the others within half a second', () => {
    const world = makeWorld({ recruited: FRIENDS });
    run(world, 12);
    const performing = FRIENDS.filter((id) => world.unicorns[id]!.state.kind === 'performing');
    expect(performing.length).toBeGreaterThan(0);
    const leader = leaderOf(world);
    const near = performing.filter((id) => distance(world.unicorns[id]!.pos, leader.pos) < CONFIG.idle.makeWayRadius);
    const start = world.time;
    dispatch(world, { type: 'move', commandId: 'go', destination: { x: leader.pos.x + 400, y: leader.pos.y } });
    for (const id of FRIENDS) {
      const state = world.unicorns[id]!.state;
      if (state.kind !== 'performing') continue;
      const within = near.includes(id) ? CONFIG.idle.makeWayWithin : CONFIG.idle.cancelWithin;
      expect(state.endsAt - start, id).toBeLessThanOrEqual(within + 1e-6);
    }
  });
});
