import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { World } from '../../src/domain/types';
import { dispatch, drainEvents } from '../../src/domain/world';
import { CompiledMap } from '../../src/shared/compiled-map';
import type { UnicornId } from '../../src/shared/ids';
import { LogicMap } from '../../src/shared/map';
import { mapContext } from '../../tools/maps/build-maps';
import { compileAll } from '../../tools/maps/compile';
import { makeWorld, run, teleport } from '../domain/fixtures';

let forest: LogicMap;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'unicorn-greeting-'));
  const out = compileAll('assets/maps', dir, mapContext());
  const file = out.find((o) => o.id === 'forest')!.file.replace(/^maps\//, '');
  forest = CompiledMap.parse(JSON.parse(readFileSync(join(dir, file), 'utf8'))).logic;
}, 300_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Runs until the friend has joined, or says she never did. */
function untilJoined(world: World, id: UnicornId, seconds: number): boolean {
  for (let s = 0; s < seconds; s++) {
    if (world.persistent.recruited.includes(id)) return true;
    run(world, 1);
  }
  return world.persistent.recruited.includes(id);
}

describe('tapping a friend who has not been found yet', () => {
  // A friend wanders about her clearing, so she can be anywhere in it when the tap lands. These are
  // the places she can be.
  const RING = [
    [0, 0],
    ...[0, 45, 90, 135, 180, 225, 270, 315].flatMap((deg) => [
      [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)],
    ]),
  ] as number[][];

  it('brings Wildstar to her wherever in the clearing she is standing, so she joins', () => {
    const failures: string[] = [];
    let tried = 0;
    for (const enc of forest.encounters) {
      for (const [ux, uy] of RING) {
        const world = makeWorld({ map: forest, seed: 7 });
        const friend = world.unicorns[enc.unicornId]!;
        const spot = { x: enc.home.x + ux! * enc.idleRadius, y: enc.home.y + uy! * enc.idleRadius };
        if (!world.nav.isWalkable(spot)) continue;
        friend.pos = { ...spot };
        friend.prev = { ...spot };
        // Wildstar is a short way off, out of the range at which a friend joins by herself.
        const start = world.nav.freePointNear({ x: enc.home.x - 60, y: enc.home.y + 330 }, [], 0, 260);
        if (!start) continue;
        teleport(world, 'wildstar', start);
        if (world.persistent.recruited.includes(enc.unicornId)) continue;
        tried++;
        dispatch(world, { type: 'greet', commandId: 'tap', unicornId: enc.unicornId });
        if (!untilJoined(world, enc.unicornId, 25))
          failures.push(`${enc.unicornId} standing at ${Math.round(spot.x)},${Math.round(spot.y)}`);
      }
    }
    expect(tried).toBeGreaterThan(20);
    expect(failures).toEqual([]);
  });

  it('works from the start of the forest too, however far the walk is', () => {
    for (const enc of forest.encounters) {
      const world = makeWorld({ map: forest, seed: 11 });
      dispatch(world, { type: 'greet', commandId: 'tap', unicornId: enc.unicornId });
      expect(untilJoined(world, enc.unicornId, 90), `${enc.unicornId} from the start`).toBe(true);
    }
  });

  it('stops trying when the friend cannot be reached, and does not pace for ever', () => {
    const enc = forest.encounters[0]!;
    const wall = (x: number, y: number, w: number, h: number) => ({ kind: 'rect' as const, x, y, w, h });
    const { x, y } = enc.home;
    // A friend shut in a little yard with walls all round: Wildstar can come close but never gets
    // in.
    const shut = LogicMap.parse({
      ...forest,
      obstacles: [
        ...forest.obstacles,
        wall(x - 160, y - 160, 320, 60),
        wall(x - 160, y + 100, 320, 60),
        wall(x - 160, y - 100, 60, 200),
        wall(x + 100, y - 100, 60, 200),
      ],
    });
    const world = makeWorld({ map: shut, seed: 3 });
    dispatch(world, { type: 'greet', commandId: 'tap', unicornId: enc.unicornId });
    run(world, 40);
    expect(world.persistent.recruited).not.toContain(enc.unicornId);
    expect(world.leader.phase).toBe('idle');
    expect(drainEvents(world).some((e) => e.type === 'command-refused')).toBe(true);
  });
});
