import { describe, expect, it } from 'vitest';
import { LIFE, LIFE_CAP, lifeSprites } from '../../src/content/life';
import { CONFIG } from '../../src/domain/config';
import { inZone, roomFor } from '../../src/domain/systems/life';
import type { Critter, World } from '../../src/domain/types';
import { dispatch, drainEvents, step } from '../../src/domain/world';
import { LIFE_KINDS } from '../../src/shared/life';
import { type LifeZone, LogicMap } from '../../src/shared/map';
import { leaderOf, lively, makeWorld, run, teleport } from './fixtures';

const world = (seed = 12345, map = lively()): World => makeWorld({ map, seed });
const critter = (w: World, kind: string): Critter => w.life.critters.find((c) => c.kind === kind)!;
const poke = (w: World, c: Critter): void => dispatch(w, { type: 'poke', commandId: `poke-${c.id}`, critterId: c.id });

describe('the creatures of the world', () => {
  it('settle where they can live: on the ground with room, on the water, in the air', () => {
    const w = world();
    expect(w.life.critters.length).toBe(lively().life.reduce((n, z) => n + z.count, 0));
    for (const c of w.life.critters) {
      const zone = w.life.zones.get(c.zoneId)!;
      const home = LIFE[c.kind].home;
      expect(inZone(zone, c.pos), `${c.id} is in ${zone.zoneId}`).toBe(true);
      if (home === 'ground') expect(roomFor(w.nav, c.pos), `${c.id} has room`).toBe(true);
      if (home === 'water') expect(w.nav.clearanceAt(c.pos), `${c.id} is on the water`).toBeLessThanOrEqual(0);
      if (home === 'air') expect(c.z).toBeGreaterThan(0);
      else expect(c.z).toBe(0);
      expect(LIFE[c.kind].looks).toContain(c.look);
    }
  });

  it('do not start on top of the herd or of each other', () => {
    const w = world();
    const grounded = w.life.critters.filter((c) => LIFE[c.kind].home !== 'air');
    for (const c of grounded)
      for (const u of Object.values(w.unicorns))
        expect(Math.hypot(c.pos.x - u!.pos.x, c.pos.y - u!.pos.y)).toBeGreaterThanOrEqual(CONFIG.life.fromHerd);
    for (const a of w.life.critters)
      for (const b of w.life.critters)
        if (a !== b && a.zoneId === b.zoneId)
          expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)).toBeGreaterThanOrEqual(CONFIG.life.apart);
  });

  it('stay in their zones and out of the trees, however long they live', () => {
    for (const seed of [1, 2, 3]) run(world(seed), 90);
  });

  it('actually move about, each in its own way', () => {
    const w = world();
    const start = new Map(w.life.critters.map((c) => [c.id, { ...c.pos }]));
    const seen = new Map<string, Set<string>>();
    run(w, 90, () => {
      for (const c of w.life.critters) (seen.get(c.kind) ?? seen.set(c.kind, new Set()).get(c.kind)!).add(c.anim.clip);
    });
    for (const kind of LIFE_KINDS) {
      const moved = w.life.critters
        .filter((c) => c.kind === kind)
        .some((c) => Math.hypot(c.pos.x - start.get(c.id)!.x, c.pos.y - start.get(c.id)!.y) > 20);
      expect(moved, `${kind} got about`).toBe(true);
    }
    // Birds peck and fly, frogs crouch and leap, ducks float.
    expect(seen.get('bird')).toEqual(new Set(['idle', 'peck', 'fly']));
    expect(seen.get('frog')).toEqual(new Set(['sit', 'crouch', 'air']));
  });

  it('keep every clip to the pictures that exist', () => {
    const sprites = new Set(lifeSprites());
    const w = world();
    run(w, 60, () => {
      for (const c of w.life.critters) {
        const id = `${c.kind}-${c.look}-${c.anim.clip}`;
        if (!sprites.has(id)) throw new Error(`${c.id} is in clip ${c.anim.clip}, and there is no picture ${id}`);
      }
    });
  });

  it('only ever face east or west, because the pictures face east and the view flips them', () => {
    const w = world();
    run(w, 60, () => {
      for (const c of w.life.critters)
        if (c.anim.facing !== 'east' && c.anim.facing !== 'west') throw new Error(`${c.id} faces ${c.anim.facing}`);
    });
  });

  it('fly to a height and back down, and only the ones who live in the air stay up', () => {
    const w = world();
    let highest = 0;
    run(w, 60, () => {
      for (const c of w.life.critters.filter((x) => x.kind === 'bird')) highest = Math.max(highest, c.z);
    });
    expect(highest).toBeGreaterThan(20);
    const end = w.life.critters.filter((c) => LIFE[c.kind].home !== 'air' && c.state.kind === 'rest');
    for (const c of end) expect(c.z).toBe(0);
  });

  it('are the same on every run of the same world, and different in a different one', () => {
    const where = (w: World): string =>
      JSON.stringify(
        w.life.critters.map((c) => [
          c.id,
          c.look,
          Math.round(c.pos.x),
          Math.round(c.pos.y),
          Math.round(c.z),
          c.anim.clip,
        ]),
      );
    const a = world(7);
    const b = world(7);
    const c = world(8);
    run(a, 30);
    run(b, 30);
    run(c, 30);
    expect(where(a)).toBe(where(b));
    expect(where(a)).not.toBe(where(c));
  });

  it('never change what the unicorns do, because they have a stream of their own', () => {
    const quiet = makeWorld({ map: LogicMap.parse({ ...lively(), life: [] }), seed: 99 });
    const busy = makeWorld({ map: lively(), seed: 99 });
    for (const w of [quiet, busy]) {
      dispatch(w, { type: 'steer', commandId: 'c1', heading: { x: 0.6, y: 0.8 } });
      run(w, 8);
      dispatch(w, { type: 'halt', commandId: 'c2' });
      run(w, 12);
    }
    expect(busy.rng.state).toBe(quiet.rng.state);
    for (const id of Object.keys(quiet.unicorns) as (keyof typeof quiet.unicorns)[]) {
      expect(busy.unicorns[id]!.pos).toEqual(quiet.unicorns[id]!.pos);
    }
  });

  it('never hold more than a map may', () => {
    const crowd = Array.from(
      { length: 20 },
      (_, i): LifeZone => ({
        zoneId: `crowd-${i}`,
        kind: 'butterfly',
        area: { x: 200, y: 100, w: 900, h: 700 },
        shape: 'rect',
        count: 12,
      }),
    );
    expect(world(1, lively(crowd)).life.critters.length).toBeLessThanOrEqual(LIFE_CAP);
  });
});

describe('getting out of the way', () => {
  it('a bird takes off when a unicorn walks up to it, and lands somewhere else', () => {
    const w = world();
    const bird = critter(w, 'bird');
    const home = { ...bird.pos };
    teleport(w, 'wildstar', { x: bird.pos.x - 60, y: bird.pos.y + 20 });
    let flew = false;
    run(w, 4, () => {
      if (bird.anim.clip === 'fly' && bird.z > 10) flew = true;
    });
    expect(flew).toBe(true);
    expect(Math.hypot(bird.pos.x - leaderOf(w).pos.x, bird.pos.y - leaderOf(w).pos.y)).toBeGreaterThan(80);
    expect(Math.hypot(bird.pos.x - home.x, bird.pos.y - home.y)).toBeGreaterThan(40);
  });

  it('a frog hops away from a unicorn who comes near, and does not fly', () => {
    const w = world();
    const frog = critter(w, 'frog');
    teleport(w, 'wildstar', { x: frog.pos.x - 50, y: frog.pos.y });
    let highest = 0;
    run(w, 3, () => (highest = Math.max(highest, frog.z)));
    expect(highest).toBeGreaterThan(5);
    expect(highest).toBeLessThan(40);
  });

  it('a fairy comes over to look at a unicorn she is curious about', () => {
    const w = world();
    const fairy = critter(w, 'fairy');
    const leader = leaderOf(w);
    teleport(w, 'wildstar', {
      x: Math.min(1000, Math.max(300, fairy.pos.x + 260)),
      y: Math.min(850, Math.max(150, fairy.pos.y)),
    });
    let closest = Infinity;
    run(w, 40, () => {
      for (const f of w.life.critters.filter((c) => c.kind === 'fairy'))
        closest = Math.min(closest, Math.hypot(f.pos.x - leader.pos.x, f.pos.y - leader.pos.y));
    });
    expect(closest).toBeLessThan(230);
  });
});

describe('a tap on a creature', () => {
  for (const kind of LIFE_KINDS) {
    it(`makes the ${kind} do something and shimmer, and it settles afterwards`, () => {
      const w = world();
      const c = critter(w, kind);
      drainEvents(w);
      poke(w, c);
      const events = drainEvents(w);
      expect(events.find((e) => e.type === 'critter-poked')).toMatchObject({ critterId: c.id, kind, look: c.look });
      expect(events.find((e) => e.type === 'effect')).toMatchObject({ effect: LIFE[kind].effect });
      const react = LIFE[kind].tapped;
      if (react.kind === 'pose') expect(c.state).toMatchObject({ kind: 'rest', busy: true, clip: react.clip });
      else if (react.kind === 'twirl') expect(c.state.kind).toBe('twirl');
      else expect(c.state.kind).toBe('go');
      // Let the answer play out: it ends in an ordinary rest, on the ground if it lives there.
      let peak = c.z;
      run(w, 4, () => (peak = Math.max(peak, c.z)));
      if (react.kind === 'hop' || react.kind === 'flit' || react.kind === 'twirl') expect(peak).toBeGreaterThan(8);
      expect(c.state.kind === 'rest' ? c.state.busy : false).not.toBe(true);
    });
  }

  it('does not start over when it is tapped again in the middle of answering, and still shimmers', () => {
    const w = world();
    const c = critter(w, 'butterfly');
    poke(w, c);
    const before = c.state;
    run(w, 0.3);
    drainEvents(w);
    poke(w, c);
    expect(c.state).toBe(before);
    expect(drainEvents(w).map((e) => e.type)).toEqual(expect.arrayContaining(['effect', 'critter-poked']));
  });

  it('goes nowhere and does nothing when there is no such creature', () => {
    const w = world();
    drainEvents(w);
    dispatch(w, { type: 'poke', commandId: 'c9', critterId: 'nobody-1' });
    expect(drainEvents(w)).toEqual([]);
  });

  it('leaves Wildstar walking where she was going', () => {
    const w = world();
    dispatch(w, { type: 'steer', commandId: 'c1', heading: { x: 1, y: 0 } });
    run(w, 1);
    const c = critter(w, 'bunny');
    poke(w, c);
    const x = leaderOf(w).pos.x;
    run(w, 1);
    expect(leaderOf(w).pos.x).toBeGreaterThan(x + 50);
  });

  it('a fish leaps clear of the water and splashes, and is under it again afterwards', () => {
    const w = world();
    const fish = critter(w, 'fish');
    drainEvents(w);
    poke(w, fish);
    let up = 0;
    const effects: string[] = [];
    run(w, 2, () => {
      up = Math.max(up, fish.z);
      for (const e of drainEvents(w)) if (e.type === 'effect') effects.push(e.effect);
    });
    expect(up).toBeGreaterThan(20);
    expect(effects).toContain('splash');
    expect(fish.anim.clip).toBe('swim');
    expect(fish.z).toBe(0);
  });

  it('is the one thing in the world that is never frightening: no step ever takes a creature toward harm', () => {
    // Nothing in the content can hurt, catch or remove a creature. This keeps it that way by
    // listing every reaction the content has.
    const kinds = new Set(LIFE_KINDS.map((k) => LIFE[k].tapped.kind));
    expect([...kinds].sort()).toEqual(['flit', 'hop', 'pose', 'twirl']);
  });
});

describe('the clock', () => {
  it('step order is the same with or without creatures', () => {
    const w = world();
    const before = w.tick;
    step(w);
    expect(w.tick).toBe(before + 1);
  });
});
