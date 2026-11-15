import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/domain/config';
import { dispatch, drainEvents, step } from '../../src/domain/world';
import { EAST as FACING_EAST, NORTH as FACING_NORTH, WEST as FACING_WEST } from '../../src/shared/compass';
import { distance, halt, hold, leaderOf, makeWorld, meadow, run, serpentine, steer, teleport } from './fixtures';

const NORTH = { x: 0, y: -1 };
const EAST = { x: 1, y: 0 };
const FAST = CONFIG.speed.leader;
const DT = CONFIG.step;

describe('holding a direction', () => {
  it('walks Wildstar that way at her full speed, picking it up quickly', () => {
    const world = makeWorld({ recruited: [] });
    const start = { ...leaderOf(world).pos };
    hold(world, NORTH, 1.5);
    const a = leaderOf(world);
    expect(a.speed).toBeCloseTo(FAST, 0);
    expect(start.y - a.pos.y).toBeGreaterThan(FAST * 1.5 - 60);
    expect(Math.abs(a.pos.x - start.x)).toBeLessThan(1);
    expect(a.anim.clip).toBe('walk');
    expect(a.anim.facing).toBe(FACING_NORTH);
    expect(world.leader.phase).toBe('steering');
  });

  it('does not care how long the heading it is given is', () => {
    const near = makeWorld({ recruited: [] });
    const far = makeWorld({ recruited: [] });
    hold(near, { x: 0.3, y: -0.2 }, 1.2);
    hold(far, { x: 300, y: -200 }, 1.2);
    expect(leaderOf(near).pos.x).toBeCloseTo(leaderOf(far).pos.x, 6);
    expect(leaderOf(near).pos.y).toBeCloseTo(leaderOf(far).pos.y, 6);
  });

  it('stops her within a step or two of letting go, saves once, and goes back to idle', () => {
    const world = makeWorld({ recruited: [] });
    hold(world, NORTH, 1);
    drainEvents(world);
    const letGo = { ...leaderOf(world).pos };
    halt(world);
    run(world, 1);
    const a = leaderOf(world);
    expect(distance(a.pos, letGo)).toBeLessThan(30);
    expect(a.speed).toBe(0);
    expect(a.anim.clip).toBe('idle');
    expect(world.leader.phase).toBe('idle');
    expect(world.leader.steer).toBeNull();
    expect(drainEvents(world).filter((e) => e.type === 'save-needed' && e.reason === 'position')).toHaveLength(1);
  });

  it('treats a heading of nothing as letting go', () => {
    const world = makeWorld({ recruited: [] });
    hold(world, NORTH, 0.5);
    steer(world, { x: 0, y: 0 });
    run(world, 1);
    expect(leaderOf(world).speed).toBe(0);
    expect(world.leader.phase).toBe('idle');
  });

  it('turns on a circle and not on the spot, so the trail behind her can be followed', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 300, y: 700 });
    hold(world, EAST, 0.6);
    const turn = (CONFIG.speed.leader * DT) / CONFIG.steer.turnRadius;
    let before = leaderOf(world).pos;
    let heading: number | null = null;
    let sharpest = 0;
    hold(world, NORTH, 1, (w) => {
      const now = leaderOf(w).pos;
      const move = { x: now.x - before.x, y: now.y - before.y };
      if (Math.hypot(move.x, move.y) > 1e-6) {
        const angle = Math.atan2(move.y, move.x);
        if (heading !== null) {
          let d = Math.abs(angle - heading);
          if (d > Math.PI) d = 2 * Math.PI - d;
          sharpest = Math.max(sharpest, d);
        }
        heading = angle;
      }
      before = now;
    });
    expect(sharpest).toBeGreaterThan(turn * 0.5);
    expect(sharpest).toBeLessThanOrEqual(turn + 0.02);
    expect(leaderOf(world).pos.y).toBeLessThan(700);
  });

  it('turns to face the new way on the spot when she is standing still', () => {
    const world = makeWorld({ recruited: [] });
    run(world, 0.5);
    hold(world, NORTH, 0.1);
    halt(world);
    run(world, 1);
    expect(leaderOf(world).anim.facing).toBe(FACING_NORTH);
    hold(world, { x: -1, y: 0 }, 0.3);
    expect(leaderOf(world).anim.facing).toBe(FACING_WEST);
  });
});

describe('holding a direction into things', () => {
  it('slides along a fence she runs at on a slant', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 1100, y: 800 });
    hold(world, { x: 1, y: -1 }, 2);
    const a = leaderOf(world);
    // The fence is at x 1200: her feet stop 22 short of it, and she keeps the part of the move that
    // ran along it.
    expect(a.pos.x).toBeGreaterThan(1170);
    expect(a.pos.x).toBeLessThan(1180);
    expect(a.pos.y).toBeLessThan(700);
    expect(a.speed).toBeGreaterThan(80);
  });

  it('stands against a fence she runs straight at, drawn standing, and walks off again when pointed away', () => {
    const world = makeWorld({ recruited: [] });
    teleport(world, 'wildstar', { x: 1050, y: 800 });
    hold(world, EAST, 3);
    let a = leaderOf(world);
    expect(a.pos.x).toBeGreaterThan(1170);
    expect(a.pos.x).toBeLessThan(1180);
    expect(a.speed).toBeLessThan(5);
    expect(a.anim.clip).toBe('idle');
    expect(a.anim.facing).toBe(FACING_EAST);
    expect(world.leader.phase).toBe('steering');
    hold(world, { x: -1, y: 0 }, 1);
    a = leaderOf(world);
    expect(a.pos.x).toBeLessThan(1100);
    expect(a.anim.clip).toBe('walk');
  });

  // Twelve worlds of half a minute each with every rule checked at every step: more than the
  // default five seconds on a busy machine.
  it('never stands where she cannot, however the finger wanders, with the herd behind her', () => {
    for (const map of [meadow(), serpentine()]) {
      for (let seed = 1; seed <= 6; seed++) {
        const world = makeWorld({ map, recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'], seed });
        let state = seed * 7919;
        const next = (): number => {
          state = (state * 1664525 + 1013904223) % 4294967296;
          return state / 4294967296;
        };
        let angle = next() * Math.PI * 2;
        let jitter = 0.3;
        // `run` stops at the first broken rule, so reaching the end is the test.
        for (let k = 0; k < 120; k++) {
          if (k % 15 === 0) jitter = [0.05, 0.4, 2.2][Math.floor(next() * 3)]!;
          angle += (next() - 0.5) * jitter + (k % 40 === 39 ? Math.PI : 0);
          hold(world, { x: Math.cos(angle), y: Math.sin(angle) }, 0.25);
        }
        halt(world);
        run(world, 2);
      }
    }
  }, 60_000);
});

describe('holding a direction in place of everything else', () => {
  it('ends the walk to a place she was sent to, and a tap after it ends the hold', () => {
    const world = makeWorld({ recruited: [] });
    dispatch(world, { type: 'move', commandId: 'm1', destination: { x: 500, y: 300 } });
    run(world, 0.5);
    hold(world, EAST, 0.5);
    expect(world.leader.goal).toBeNull();
    expect(world.leader.steer).not.toBeNull();
    dispatch(world, { type: 'move', commandId: 'm2', destination: { x: 700, y: 900 } });
    expect(world.leader.steer).toBeNull();
    run(world, 12);
    expect(distance(leaderOf(world).pos, { x: 700, y: 900 })).toBeLessThan(CONFIG.speed.arrive + 1);
  });

  it('lets go of the cup she was walking to, so nobody else finds it held for her', () => {
    const world = makeWorld({ recruited: [] });
    dispatch(world, { type: 'interact', commandId: 'i1', instanceId: 'forest/cup-a' });
    run(world, 0.4);
    expect(world.anchors.heldBy('wildstar').length).toBeGreaterThan(0);
    hold(world, NORTH, 0.5);
    expect(world.anchors.heldBy('wildstar')).toEqual([]);
    expect(world.leader.onArrival.kind).toBe('none');
    run(world, 0.1);
    expect(leaderOf(world).state.kind).toBe('leading');
  });

  it('takes her out of a cast, and she walks', () => {
    const world = makeWorld({ recruited: [] });
    dispatch(world, { type: 'cast', commandId: 'c1', unicornId: 'wildstar' });
    run(world, 0.2);
    expect(leaderOf(world).state.kind).toBe('casting');
    const before = { ...leaderOf(world).pos };
    hold(world, NORTH, 1);
    expect(leaderOf(world).state.kind).toBe('leading');
    expect(before.y - leaderOf(world).pos.y).toBeGreaterThan(100);
  });

  it('brakes while a door she has walked into swings open, then takes the herd through', () => {
    const world = makeWorld({ recruited: ['leaf'] });
    teleport(world, 'wildstar', { x: 1700, y: 710 });
    let entered = false;
    let pace = 0;
    hold(world, EAST, 4, (w) => {
      for (const e of drainEvents(w)) if (e.type === 'portal-entered' && e.portalId === 'to-garden') entered = true;
      if (w.leader.portalAt) pace = Math.max(pace, leaderOf(w).speed);
    });
    expect(entered).toBe(true);
    // She was already at speed when she reached the door and braked from there, so the door did not
    // see her run through it.
    expect(pace).toBeLessThanOrEqual(FAST);
    expect(world.paused).toBe(true);
  });
});

describe('the herd behind a held direction', () => {
  it('follows her round a long winding hold and settles when she lets go', () => {
    const world = makeWorld({ map: serpentine(), recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'] });
    const headings = [EAST, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }];
    for (const h of headings) hold(world, h, 2);
    halt(world);
    run(world, 12);
    const leader = leaderOf(world);
    for (const id of ['leaf', 'glacier', 'river', 'cinder', 'storm'] as const) {
      const u = world.unicorns[id]!;
      expect(['following', 'performing', 'approaching', 'waiting', 'recovering'], `${id} is ${u.state.kind}`).toContain(
        u.state.kind,
      );
      expect(distance(u.pos, leader.pos), id).toBeLessThan(900);
    }
  });

  it('keeps stepping the same whether the finger is held or the heading is sent only when it changes', () => {
    const every = makeWorld({ recruited: ['leaf'] });
    const once = makeWorld({ recruited: ['leaf'] });
    hold(every, NORTH, 1);
    steer(once, NORTH);
    for (let i = 0; i < CONFIG.stepHz; i++) step(once);
    expect(leaderOf(once).pos.y).toBeCloseTo(leaderOf(every).pos.y, 6);
  });
});
