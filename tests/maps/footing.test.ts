import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dispatch, drainEvents, navFor } from '../../src/domain';
import type { Nav } from '../../src/domain/nav/nav';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId, type Vec2 } from '../../src/shared/ids';
import { mapContext } from '../../tools/maps/build-maps';
import { compileAll } from '../../tools/maps/compile';
import { distance, leaderOf, makeWorld, run, teleport } from '../domain/fixtures';

/**
 * A tap is answered wherever she stands. She is led by a finger or a key and slides along what is
 * in her way, so she can come to rest in a nook that joins the open ground only by a gap no wider
 * than her feet. A tap is answered by a route over a grid of cells 32 units across, and a nook with
 * no cell centre in reach of it, or one on a patch of cells of its own, has no route out. Each map
 * is flooded from where the herd arrives over every place her feet fit, and she is put in the
 * places that have no way out, one after another, and told to go to open ground near them.
 */

let maps: Record<MapId, CompiledMap['logic']>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'unicorn-footing-'));
  try {
    const out = compileAll('assets/maps', dir, mapContext());
    maps = Object.fromEntries(
      out.map((o) => [
        o.id,
        CompiledMap.parse(JSON.parse(readFileSync(join(dir, o.file.replace(/^maps\//, '')), 'utf8'))).logic,
      ]),
    ) as Record<MapId, CompiledMap['logic']>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120_000);

/** How far apart the places looked at are. */
const LOOK = 8;
/** How many of the places with no way out each map is asked about. */
const SAMPLES = 14;

/** Every place her feet fit that joins `home` by steps of `LOOK`. */
function flood(nav: Nav, width: number, height: number, home: Vec2): Vec2[] {
  const cols = Math.ceil(width / LOOK);
  const rows = Math.ceil(height / LOOK);
  const seen = new Uint8Array(cols * rows);
  const at = (cx: number, cy: number): Vec2 => ({ x: cx * LOOK + LOOK / 2, y: cy * LOOK + LOOK / 2 });
  const fits = (cx: number, cy: number): boolean =>
    cx >= 0 && cy >= 0 && cx < cols && cy < rows && nav.isWalkable(at(cx, cy));
  const first = Math.floor(home.y / LOOK) * cols + Math.floor(home.x / LOOK);
  const stack = [first];
  seen[first] = 1;
  const out: Vec2[] = [];
  while (stack.length > 0) {
    const c = stack.pop()!;
    const cx = c % cols;
    const cy = (c / cols) | 0;
    out.push(at(cx, cy));
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!fits(nx, ny) || seen[ny * cols + nx]) continue;
      seen[ny * cols + nx] = 1;
      stack.push(ny * cols + nx);
    }
  }
  return out;
}

/**
 * The nearest walkable cell centre to `p` within `cells` cells, at least `least` away when `least`
 * is given. Null when there is none.
 */
function centreNear(nav: Nav, p: Vec2, cells: number, accept: (c: Vec2) => boolean = () => true): Vec2 | null {
  const bx = Math.floor(p.x / nav.cell);
  const by = Math.floor(p.y / nav.cell);
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let dy = -cells; dy <= cells; dy++) {
    for (let dx = -cells; dx <= cells; dx++) {
      const x = bx + dx;
      const y = by + dy;
      if (x < 0 || y < 0 || x >= nav.cols || y >= nav.rows) continue;
      const c = nav.centerOf(y * nav.cols + x);
      const d = distance(c, p);
      if (d < bestD && nav.isWalkable(c) && accept(c)) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

const evenly = <T>(all: readonly T[], n: number): T[] =>
  all.length <= n ? [...all] : Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]!);

let seq = 0;

describe('a tap is answered from every place she can stand', () => {
  for (const id of MAP_IDS) {
    it(id, () => {
      const logic = maps[id];
      const nav = navFor(logic);
      const home = logic.spawns.find((s) => s.spawnId === logic.start)?.points[0] ?? logic.spawns[0]!.points[0]!;
      const main = nav.componentAt(home);
      const places = flood(nav, logic.widthTiles * 64, logic.heightTiles * 64, home);
      expect(places.length).toBeGreaterThan(1000);

      // The places where, at least by the cells, a route cannot begin: on a patch of cells of their
      // own, or with no cell centre they can walk straight to.
      const stuck = places.filter((p) => {
        const near = centreNear(nav, p, 3, (c) => nav.componentAt(c) === main);
        return nav.componentAt(p) !== main || nav.findPath(p, near ?? home) === null;
      });

      const world = makeWorld({
        map: logic,
        arrival: { kind: 'spawn', spawnId: logic.start ?? logic.spawns[0]!.spawnId },
      });
      const failures: string[] = [];
      for (const p of evenly(stuck, SAMPLES)) {
        teleport(world, 'wildstar', p);
        drainEvents(world);
        // Open ground a little way off, as a child taps.
        const to =
          centreNear(nav, p, 12, (c) => nav.componentAt(c) === main && nav.isWalkable(c, 2) && distance(c, p) >= 100) ??
          home;
        dispatch(world, { type: 'move', commandId: `t${++seq}`, destination: to });
        run(world, Math.min(25, distance(p, to) / 150 + 4));
        const answers = drainEvents(world)
          .map((e) => e.type)
          .filter((t) => t === 'command-accepted' || t === 'command-refused');
        const arrived = distance(leaderOf(world).pos, to) < 60;
        if (!arrived || answers.includes('command-refused'))
          failures.push(
            `from (${p.x}, ${p.y}) to (${to.x.toFixed(0)}, ${to.y.toFixed(0)}): ${answers.join(', ') || 'no answer'}${arrived ? '' : ', did not arrive'}`,
          );
      }
      expect(
        failures,
        `${id}: of ${stuck.length} places with no way out, asked ${Math.min(stuck.length, SAMPLES)}`,
      ).toEqual([]);
    }, 120_000);
  }
});
