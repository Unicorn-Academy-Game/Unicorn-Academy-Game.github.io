import { describe, expect, test } from 'vitest';
import type { World } from '../../src/domain/types';
import {
  angleOf,
  EAST,
  FACING_COUNT,
  SOUTH,
  stepsBetween,
  UNICORN_FACINGS,
  type UnicornFacing,
} from '../../src/shared/compass';
import type { Vec2 } from '../../src/shared/ids';
import { hold, leaderOf, makeWorld, meadow, teleport } from './fixtures';

/**
 * Where she looks when she is led into something. The meadow has a fence from top to bottom at x
 * 1200, three trees and a block of rock. Walking free she looks the way she goes. Held against
 * scenery she looks the way she is being pushed, and a slide along it turns her only as far as the
 * slide is the step she meant, so a tree never spins her round.
 */

const logic = meadow();
/** How long each scenario is run for. */
const SECONDS = 3.5;
/** How far from the finger scenery may turn her once she has turned to it, four of the 32 steps. */
const STRAY = (4 * Math.PI * 2) / FACING_COUNT;
const heading = (degrees: number): Vec2 => ({
  x: Math.cos((degrees * Math.PI) / 180),
  y: Math.sin((degrees * Math.PI) / 180),
});

const apart = (a: number, b: number): number => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

/**
 * Wildstar set down 260 short of the aim along the heading, and led along it for `seconds`. What
 * she showed at each step is recorded.
 */
function lead(
  aim: Vec2,
  degrees: number,
  seconds: number,
): { world: World; seen: { t: number; facing: UnicornFacing; speed: number }[] } {
  const h = heading(degrees);
  const world = makeWorld({ map: logic, recruited: [] });
  const from = { x: aim.x - h.x * 260, y: aim.y - h.y * 260 };
  if (world.nav.freePointNear(from, [], 0, 1) === null)
    throw new Error(`nowhere to start from at ${from.x}, ${from.y}`);
  teleport(world, 'wildstar', from);
  const seen: { t: number; facing: UnicornFacing; speed: number }[] = [];
  hold(world, h, seconds, (w) => {
    const u = leaderOf(w);
    seen.push({ t: w.time, facing: u.anim.facing, speed: u.speed });
  });
  return { world, seen };
}

/**
 * How far she was swung about: how many steps round the ring the picture went in all, and how many
 * times it changed the way it was turning. A unicorn who is pushed round a tree turns away and
 * back, and one who is made to dance does it again and again.
 */
function swung(seen: { facing: UnicornFacing }[]): { travel: number; reversals: number } {
  let travel = 0;
  let reversals = 0;
  let lastWay = 0;
  for (let i = 1; i < seen.length; i++) {
    const steps = ((seen[i]!.facing - seen[i - 1]!.facing + FACING_COUNT * 1.5) % FACING_COUNT) - FACING_COUNT / 2;
    if (steps === 0) continue;
    travel += Math.abs(steps);
    if (lastWay !== 0 && Math.sign(steps) !== lastWay) reversals++;
    lastWay = Math.sign(steps);
  }
  return { travel, reversals };
}

describe('looking where she is led', () => {
  test('free of anything she looks the way she goes, on every slope', () => {
    const open = { x: 700, y: 700 };
    for (const facing of UNICORN_FACINGS) {
      const degrees = (facing * 360) / FACING_COUNT;
      const world = makeWorld({ map: logic, recruited: [] });
      teleport(world, 'wildstar', open);
      hold(world, heading(degrees), 1);
      expect(leaderOf(world).anim, `${degrees} degrees`).toMatchObject({ clip: 'walk', facing });
    }
  });

  test('pressed at a fence she stands facing it, though the ground gives her nothing to walk on', () => {
    const { world, seen } = lead({ x: 1200, y: 400 }, 0, 4);
    const u = leaderOf(world);
    expect(u.speed).toBeLessThan(1);
    expect(u.anim).toMatchObject({ clip: 'idle', facing: EAST });
    expect(swung(seen)).toEqual({ travel: 0, reversals: 0 });
  });

  test('pressed down the slope at a fence she goes down it, looking the way she goes', () => {
    const { world, seen } = lead({ x: 1200, y: 400 }, 45, 3);
    const u = leaderOf(world);
    // Half of the step she means is the step the fence lets her take, and it runs straight down.
    expect(u.speed).toBeGreaterThan(100);
    // She looks most of the way down it, not quite, since she meant a slope and the fence gave her
    // only the part of it that runs down.
    expect(u.anim.clip).toBe('walk');
    expect(stepsBetween(u.anim.facing, SOUTH)).toBeLessThanOrEqual(1);
    // From the east she turned toward it without once turning back.
    expect(swung(seen).reversals).toBe(0);
  });

  test('led past the edge of a tree she is not swung round by what it does to her', () => {
    // Held south at a point 20 above the middle of the tree at the top left. The tree must not turn
    // her to the northeast, the southeast and the east within a second, away from the finger.
    const { seen } = lead({ x: 1100, y: 480 }, 68, 3.5);
    const toward = seen.filter((s) => s.t > 0.6).map((s) => s.facing);
    for (const facing of toward)
      expect(apart(angleOf(facing), (68 * Math.PI) / 180), String(facing)).toBeLessThan(Math.PI / 2);
    // The tree turns her away and back once, round its edge, and she is not swung about more than
    // that.
    expect(swung(seen).reversals).toBeLessThanOrEqual(3);
    expect(swung(seen).travel).toBeLessThanOrEqual(FACING_COUNT / 2);
  });

  test('led at scenery from every side she never strays far from the finger, and does not dance', () => {
    const aims: { name: string; at: Vec2 }[] = [];
    for (const y of [150, 400, 650, 900]) aims.push({ name: `fence ${y}`, at: { x: 1200, y } });
    for (const [x, y, name] of [
      [1100, 500, 'tree a'],
      [1400, 900, 'tree b'],
      [1500, 400, 'tree c'],
    ] as const) {
      for (const lateral of [-40, -20, 0, 20, 40]) aims.push({ name: `${name} ${lateral}`, at: { x, y: y + lateral } });
    }
    aims.push({ name: 'rock top', at: { x: 450, y: 1100 } }, { name: 'rock left', at: { x: 300, y: 1250 } });

    const bad: string[] = [];
    let tried = 0;
    for (const aim of aims) {
      for (let degrees = 0; degrees < 360; degrees += 22.5) {
        let run: ReturnType<typeof lead>;
        try {
          run = lead(aim.at, degrees, SECONDS);
        } catch {
          continue;
        }
        tried++;
        const theta = (degrees * Math.PI) / 180;
        // The first moments are her turning from where she stood to where she is led. After that
        // scenery turns her by a few steps at most.
        const turned = run.seen.filter((s) => s.t > 0.6);
        const away = turned.find((s) => apart(angleOf(s.facing), theta) > STRAY);
        if (away) bad.push(`${aim.name} at ${degrees}: faced ${away.facing} at ${away.t.toFixed(2)}`);
        // She is not made to dance: she changes the way she is turning no more than once a second.
        const { reversals } = swung(run.seen);
        if (reversals > Math.ceil(SECONDS))
          bad.push(`${aim.name} at ${degrees}: changed the way she turned ${reversals} times`);
      }
    }
    expect(tried, 'scenarios that had room to start').toBeGreaterThan(250);
    expect(bad).toEqual([]);
  });

  test('every one of her 32 facings is a way she can be led to look', () => {
    const open = { x: 700, y: 700 };
    const seen = new Set<UnicornFacing>();
    for (let degrees = 0; degrees < 360; degrees += 360 / FACING_COUNT) {
      const world = makeWorld({ map: logic, recruited: [] });
      teleport(world, 'wildstar', open);
      hold(world, heading(degrees), 1);
      seen.add(leaderOf(world).anim.facing);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([...UNICORN_FACINGS]);
  });
});
