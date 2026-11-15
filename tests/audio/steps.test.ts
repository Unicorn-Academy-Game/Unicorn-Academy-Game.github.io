import { describe, expect, it } from 'vitest';
import { Footfalls } from '../../src/audio/steps';
import { surfaceLookup } from '../../src/audio/surface';
import type { World } from '../../src/domain';
import type { Surface, View } from '../../src/game/ports';
import { WALK_STEP } from '../../src/shared/clips';
import { EAST } from '../../src/shared/compass';
import type { CompiledMap } from '../../src/shared/compiled-map';
import { TILE } from '../../src/shared/map';
import { makeWorld, meadow } from '../domain/fixtures';

const FRAME = 1 / 30;
const everywhere: View = { x: 0, y: 0, w: 4000, h: 4000 };
const soft = (): Surface => 'soft';

/** Puts a unicorn mid-walk at a speed, wherever it already is. */
function walking(world: World, id: 'wildstar' | 'leaf', speed: number): void {
  const actor = world.unicorns[id]!;
  actor.speed = speed;
  actor.anim = { clip: 'walk', facing: EAST, startedAt: world.time };
}

/** Plays `seconds` of frames and returns what the footsteps made of them. */
function stroll(
  feet: Footfalls,
  world: World,
  seconds: number,
  view = everywhere,
  surface: (p: { x: number; y: number }) => Surface = soft,
) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / FRAME); i++) out.push(...feet.update(world, view, FRAME, surface));
  return out;
}

describe('footsteps', () => {
  it('land once for every step of the walk cycle covered, at any speed', () => {
    for (const speed of [60, 150, 240]) {
      const world = makeWorld();
      walking(world, 'wildstar', speed);
      const seconds = 6;
      const steps = stroll(new Footfalls(), world, seconds).length;
      const expected = (speed * seconds) / WALK_STEP;
      // The first lands a little early and the last may not have landed yet, so it is within one of
      // the distance covered.
      expect(Math.abs(steps - expected), `speed ${speed}`).toBeLessThanOrEqual(1);
    }
  });

  it('stop the moment the unicorn does, and begin again from a standstill', () => {
    const world = makeWorld();
    const feet = new Footfalls();
    walking(world, 'wildstar', 150);
    expect(stroll(feet, world, 2).length).toBeGreaterThan(0);
    world.unicorns.wildstar!.speed = 0;
    world.unicorns.wildstar!.anim = { clip: 'idle', facing: EAST, startedAt: world.time };
    expect(stroll(feet, world, 3)).toEqual([]);
    walking(world, 'wildstar', 150);
    // A fresh start steps soon, not after a whole stride.
    expect(stroll(feet, world, 0.5).length).toBeGreaterThanOrEqual(1);
  });

  it('are not made by a unicorn that is drifting or turning in place', () => {
    const world = makeWorld();
    walking(world, 'wildstar', 3);
    expect(stroll(new Footfalls(), world, 5)).toEqual([]);
  });

  it('make the leader loudest and the herd a little under her', () => {
    const world = makeWorld({ recruited: ['leaf'] });
    walking(world, 'wildstar', 150);
    walking(world, 'leaf', 150);
    const steps = stroll(new Footfalls(), world, 3);
    const gains = new Set(steps.map((s) => s.gain));
    expect(gains).toEqual(new Set([1, 0.7]));
    for (const s of steps) expect(s.at).toBeDefined();
  });

  it('are skipped off screen, with a little margin so one at the edge is not lost', () => {
    const world = makeWorld();
    walking(world, 'wildstar', 150);
    const at = world.unicorns.wildstar!.pos;
    expect(stroll(new Footfalls(), world, 3, { x: at.x + 400, y: at.y + 400, w: 300, h: 300 })).toEqual([]);
    expect(stroll(new Footfalls(), world, 3, { x: at.x - 20, y: at.y - 20, w: 300, h: 300 }).length).toBeGreaterThan(0);
    expect(stroll(new Footfalls(), world, 3, { x: at.x + 20, y: at.y - 100, w: 300, h: 300 }).length).toBeGreaterThan(
      0,
    );
  });

  it('keep their rhythm through a long frame, which counts for no more than one step', () => {
    const world = makeWorld();
    walking(world, 'wildstar', 150);
    const feet = new Footfalls();
    expect(feet.update(world, everywhere, 5, soft).length).toBeLessThanOrEqual(1);
  });

  it('sound like the ground under the hoof, hard or soft', () => {
    const world = makeWorld({ recruited: ['leaf'] });
    walking(world, 'wildstar', 150);
    const hard = stroll(new Footfalls(), world, 3, everywhere, () => 'hard');
    const grass = stroll(new Footfalls(), world, 3, everywhere, () => 'soft');
    expect(new Set(hard.map((s) => s.sound))).toEqual(new Set(['hoof-hard']));
    expect(new Set(grass.map((s) => s.sound))).toEqual(new Set(['hoof-grass']));
  });

  it('start over for a new map', () => {
    const framesToFirst = (feet: Footfalls, world: World): number => {
      for (let i = 1; i <= 90; i++) if (feet.update(world, everywhere, FRAME, soft).length > 0) return i;
      return Infinity;
    };
    const world = makeWorld();
    walking(world, 'wildstar', 150);
    const feet = new Footfalls();
    // Walk most of the way to a step, then carry on without a reset: the step lands almost at once.
    for (let i = 0; i < 4; i++) feet.update(world, everywhere, FRAME, soft);
    const carriedOn = framesToFirst(feet, world);
    walking(world, 'wildstar', 150);
    const fresh = new Footfalls();
    for (let i = 0; i < 4; i++) fresh.update(world, everywhere, FRAME, soft);
    fresh.reset();
    expect(framesToFirst(fresh, world)).toBeGreaterThan(carriedOn);
  });
});

describe('what the ground is', () => {
  // Four tiles across and two down: grass, path / stone, water, grass.
  const map: Pick<CompiledMap, 'logic' | 'render'> = {
    logic: { ...meadow(), widthTiles: 4, heightTiles: 2 },
    render: { tileset: 'test', bundle: 'forest', ground: [0, 1, 2, 0, 3, 3, 3, 3], water: [], decor: [] },
  };
  const at = surfaceLookup(map, { surfaces: 'sshh' });

  it('comes from the tile drawn under the point', () => {
    expect(at({ x: TILE * 0.5, y: TILE * 0.5 })).toBe('soft');
    expect(at({ x: TILE * 1.5, y: TILE * 0.5 })).toBe('soft');
    expect(at({ x: TILE * 2.5, y: TILE * 0.5 })).toBe('hard');
    expect(at({ x: TILE * 3.5, y: TILE * 1.5 })).toBe('hard');
    expect(at({ x: TILE * 0.1, y: TILE * 1.1 })).toBe('hard');
  });

  it('is soft off the edge of the map, and on the exact edge of a tile belongs to the tile after it', () => {
    expect(at({ x: -1, y: 10 })).toBe('soft');
    expect(at({ x: 10, y: TILE * 2 + 1 })).toBe('soft');
    expect(at({ x: TILE * 4, y: 10 })).toBe('soft');
    expect(at({ x: TILE * 2, y: 10 })).toBe('hard');
  });
});
