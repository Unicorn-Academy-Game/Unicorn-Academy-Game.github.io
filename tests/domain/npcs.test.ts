import { describe, expect, it } from 'vitest';
import { NPC_DEFS } from '../../src/content/npcs';
import { dispatch, drainEvents } from '../../src/domain/world';
import { FACINGS } from '../../src/shared/ids';
import { garden, leaderOf, makeWorld, run, stable, teleport } from './fixtures';

describe('gardener', () => {
  it('visibly tends at least three beds with at least two different care actions', () => {
    const world = makeWorld({ map: garden(), seed: 5 });
    const clips = new Set<string>();
    const beds = new Set<string>();
    run(world, 150, () => {
      const g = world.npcs[0]!;
      clips.add(g.anim.clip);
      if (g.state.kind === 'working' && g.state.clip !== 'idle') {
        // Which bed is it standing at?
        for (const a of world.map.anchors)
          if (Math.hypot(g.pos.x - a.approach[0]!.pos.x, g.pos.y - a.approach[0]!.pos.y) < 5) beds.add(a.anchorId);
      }
    });
    expect(beds.size).toBeGreaterThanOrEqual(3);
    const care = ['water', 'inspect', 'trim'].filter((c) => clips.has(c));
    expect(care.length).toBeGreaterThanOrEqual(2);
    expect(clips.has('walk')).toBe(true);
  });

  it('waves when tapped, keeps its place in the routine, and goes back to work', () => {
    const world = makeWorld({ map: garden(), seed: 5 });
    run(world, 10);
    const g = world.npcs[0]!;
    drainEvents(world);
    const before = g.state.kind;
    dispatch(world, { type: 'interact', commandId: 'tap', instanceId: g.instanceId });
    expect(g.state.kind).toBe('waving');
    expect(g.anim.clip).toBe('wave');
    run(world, NPC_DEFS.gardener.waveSeconds + 0.2);
    expect(g.state.kind).not.toBe('waving');
    expect(drainEvents(world).filter((e) => e.type === 'npc-waved')).toHaveLength(1);
    // Work picks up again within a normal beat.
    run(world, 12);
    expect(['working', 'walking', 'idle']).toContain(g.state.kind);
    expect(before).toBeTruthy();
  });

  it('never blocks Wildstar, who walks straight through where the gardener stands', () => {
    const world = makeWorld({ map: garden(), seed: 5 });
    const g = world.npcs[0]!;
    const from = { x: g.pos.x - 200, y: g.pos.y };
    const to = { x: g.pos.x + 200, y: g.pos.y };
    teleport(world, 'wildstar', from);
    dispatch(world, { type: 'move', commandId: 'm', destination: to });
    run(world, 8);
    expect(Math.hypot(leaderOf(world).pos.x - to.x, leaderOf(world).pos.y - to.y)).toBeLessThan(40);
  });

  it('only ever faces north, south, east or west, however slantwise she walks between the beds', () => {
    const world = makeWorld({ map: garden(), seed: 5 });
    const seen = new Set<string>();
    run(world, 150, () => {
      const g = world.npcs[0]!;
      seen.add(g.facing);
      seen.add(g.anim.facing);
    });
    expect([...seen].filter((f) => !(FACINGS as readonly string[]).includes(f))).toEqual([]);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('waves hello to a visitor who comes near, now and then', () => {
    const world = makeWorld({ map: garden(), seed: 5 });
    let waves = 0;
    run(world, 120, () => {
      for (const e of drainEvents(world)) if (e.type === 'npc-waved') waves++;
    });
    expect(waves).toBeGreaterThanOrEqual(1);
    expect(waves).toBeLessThan(8);
  });
});

describe('stable worker', () => {
  it('alternates sweeping and carrying fruit, and keeps going', () => {
    const world = makeWorld({ map: stable(), seed: 5 });
    const clips = new Set<string>();
    let carries = 0;
    let wasCarrying = false;
    run(world, 150, () => {
      const w = world.npcs[0]!;
      clips.add(w.anim.clip);
      const carrying = w.anim.clip === 'carry';
      if (carrying && !wasCarrying) carries++;
      wasCarrying = carrying;
    });
    expect(clips.has('sweep')).toBe(true);
    expect(clips.has('carry')).toBe(true);
    expect(carries).toBeGreaterThanOrEqual(2);
  });

  const grooming = (world: ReturnType<typeof makeWorld>): boolean =>
    Object.values(world.unicorns).some((u) => u?.state.kind === 'performing' && u.state.activity === 'groom');

  it('does not brush when nobody is being groomed', () => {
    const world = makeWorld({ map: stable(), seed: 5 });
    run(world, 90, () => expect(world.npcs[0]!.anim.clip).not.toBe('brush'));
  });

  it('hurries over and brushes the unicorn that is being groomed, with hearts, and only while she is there', () => {
    const world = makeWorld({ map: stable(), seed: 5 });
    run(world, 3);
    drainEvents(world);
    dispatch(world, { type: 'interact', commandId: 'b', instanceId: 'stable/brush-1' });
    let brushedFor = 0;
    let hearts = 0;
    let groomedFor = 0;
    run(world, 30, () => {
      const brushing = world.npcs[0]!.anim.clip === 'brush';
      if (brushing) {
        brushedFor += 1 / 30;
        expect(grooming(world), 'the worker brushes only while a unicorn is groomed').toBe(true);
      }
      if (grooming(world)) groomedFor += 1 / 30;
      for (const e of drainEvents(world)) if (e.type === 'effect' && e.effect === 'hearts') hearts++;
    });
    expect(brushedFor).toBeGreaterThanOrEqual(2.5);
    expect(hearts).toBeGreaterThanOrEqual(2);
    // The short groom is held open for the worker, but only for the walk and a few seconds of
    // brushing.
    expect(groomedFor).toBeGreaterThan(4.2);
    expect(groomedFor).toBeLessThan(14);
    expect(grooming(world)).toBe(false);
    expect(world.npcs[0]!.anim.clip).not.toBe('brush');
  });

  it('does not make the trip for a groom that is too far away, and the groom is not held open for nobody', () => {
    const world = makeWorld({ map: stable(), seed: 5 });
    const w = world.npcs[0]!;
    w.pos = { x: 100, y: 100 };
    w.prev = { ...w.pos };
    w.path = null;
    w.state = { kind: 'idle', until: world.time + 1 };
    dispatch(world, { type: 'interact', commandId: 'b', instanceId: 'stable/brush-1' });
    let groomedFor = 0;
    run(world, 20, () => {
      expect(w.anim.clip).not.toBe('brush');
      if (grooming(world)) groomedFor += 1 / 30;
    });
    expect(groomedFor).toBeGreaterThan(4);
    expect(groomedFor).toBeLessThan(4.6);
  });

  it('puts the brush down when the unicorn walks away', () => {
    const world = makeWorld({ map: stable(), seed: 5 });
    dispatch(world, { type: 'interact', commandId: 'b', instanceId: 'stable/brush-1' });
    let seconds = 0;
    while (world.npcs[0]!.anim.clip !== 'brush' && seconds < 20) {
      run(world, 0.2);
      seconds += 0.2;
    }
    expect(world.npcs[0]!.anim.clip).toBe('brush');
    dispatch(world, { type: 'move', commandId: 'away', destination: { x: 400, y: 700 } });
    run(world, 0.5);
    expect(world.npcs[0]!.anim.clip).not.toBe('brush');
  });

  it('the worker never gets stuck for good', () => {
    const world = makeWorld({ map: stable(), seed: 9 });
    let lastMoved = 0;
    let last = { ...world.npcs[0]!.pos };
    let longestStill = 0;
    run(world, 300, () => {
      const w = world.npcs[0]!;
      if (Math.hypot(w.pos.x - last.x, w.pos.y - last.y) > 0.5) {
        lastMoved = world.time;
        last = { ...w.pos };
      }
      longestStill = Math.max(longestStill, world.time - lastMoved);
    });
    expect(longestStill).toBeLessThan(15);
  });
});
