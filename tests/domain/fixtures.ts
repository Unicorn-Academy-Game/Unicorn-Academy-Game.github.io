import { CONFIG } from '../../src/domain/config';
import { checkInvariants } from '../../src/domain/invariants';
import { newPersistent } from '../../src/domain/snapshot';
import type { Crown, Persistent, Rules, World } from '../../src/domain/types';
import { type Arrival, createWorld, dispatch, step } from '../../src/domain/world';
import type { UnicornId, Vec2 } from '../../src/shared/ids';
import { type LifeZone, LogicMap } from '../../src/shared/map';

type Pt = { x: number; y: number };
const rect = (x: number, y: number, w: number, h: number) => ({ kind: 'rect' as const, x, y, w, h });
const tree = (x: number, y: number, r = 44) => ({ kind: 'circle' as const, x, y, r });
const box = (cx: number, cy: number, half = 70) => ({ x: cx - half, y: cy - half, w: half * 2, h: half * 2 });
const at = (x: number, y: number, facing: 'north' | 'south' | 'east' | 'west' = 'north') => ({ pos: { x, y }, facing });

/** A line of six standing places going west from (900, 700), 110 apart. */
const LINE: Pt[] = [900, 790, 680, 570, 460, 350].map((x) => ({ x, y: 700 }));

/**
 * A small open map with the features the behaviors need: a fence with a gap, trees, two cups with
 * capacity one, grazing spots, props that react to magic, a door, and a friend waiting to be found.
 * It uses a real map id because the schema only knows the four shipped ones.
 */
export function meadow(): LogicMap {
  return LogicMap.parse({
    schemaVersion: 1,
    id: 'forest',
    widthTiles: 32,
    heightTiles: 24,
    start: 'start',
    obstacles: [rect(1200, 0, 60, 1000), tree(1100, 500), tree(1400, 900), tree(1500, 400), rect(300, 1100, 300, 300)],
    spawns: [
      { spawnId: 'start', facing: 'east', points: LINE },
      { spawnId: 'door', facing: 'west', points: [1760, 1650, 1540, 1430, 1320, 1210].map((x) => ({ x, y: 1300 })) },
    ],
    portals: [
      {
        portalId: 'to-garden',
        bounds: { x: 1900, y: 650, w: 100, h: 120 },
        approach: { x: 1840, y: 710 },
        door: 'forest/door-1',
        to: { mapId: 'palace-garden', spawnId: 'door' },
      },
    ],
    interactables: [
      {
        instanceId: 'forest/chest-1',
        definitionId: 'chest',
        pos: { x: 800, y: 300 },
        hit: box(800, 280),
        approach: [at(800, 370)],
      },
      {
        instanceId: 'forest/cup-a',
        definitionId: 'cup',
        pos: { x: 1000, y: 1000 },
        hit: box(1000, 990, 50),
        approach: [at(1000, 1060)],
        anchor: 'forest/cup-a-spot',
      },
      {
        instanceId: 'forest/cup-b',
        definitionId: 'cup',
        pos: { x: 1100, y: 1000 },
        hit: box(1100, 990, 50),
        approach: [at(1100, 1060)],
        anchor: 'forest/cup-b-spot',
      },
      {
        instanceId: 'forest/lantern-1',
        definitionId: 'lantern',
        pos: { x: 900, y: 400 },
        hit: box(900, 380, 40),
        approach: [at(900, 460)],
      },
      {
        instanceId: 'forest/bed-1',
        definitionId: 'flowerbed',
        pos: { x: 700, y: 420 },
        hit: box(700, 420, 60),
        approach: [at(700, 500)],
      },
      {
        instanceId: 'forest/pinwheel-1',
        definitionId: 'pinwheel',
        pos: { x: 1000, y: 300 },
        hit: box(1000, 290, 40),
        approach: [at(1000, 360)],
      },
      {
        instanceId: 'forest/brazier-1',
        definitionId: 'brazier',
        pos: { x: 600, y: 260 },
        hit: box(600, 250, 40),
        approach: [at(600, 330)],
      },
      {
        instanceId: 'forest/door-1',
        definitionId: 'door',
        pos: { x: 1960, y: 700 },
        hit: box(1960, 690, 60),
        approach: [at(1840, 710, 'east')],
      },
    ],
    anchors: [
      {
        anchorId: 'forest/graze-1',
        tags: ['graze'],
        capacity: 2,
        pos: { x: 700, y: 640 },
        approach: [at(660, 600, 'south'), at(760, 600, 'south')],
      },
      {
        anchorId: 'forest/graze-2',
        tags: ['graze'],
        capacity: 1,
        pos: { x: 950, y: 900 },
        approach: [at(950, 850, 'south')],
      },
      {
        anchorId: 'forest/graze-3',
        tags: ['graze'],
        capacity: 1,
        pos: { x: 520, y: 460 },
        approach: [at(520, 510, 'north')],
      },
      {
        anchorId: 'forest/cup-a-spot',
        tags: ['drink'],
        capacity: 1,
        pos: { x: 1000, y: 1000 },
        approach: [at(1000, 1060)],
      },
      {
        anchorId: 'forest/cup-b-spot',
        tags: ['drink'],
        capacity: 1,
        pos: { x: 1100, y: 1000 },
        approach: [at(1100, 1060)],
      },
    ],
    encounters: [
      {
        unicornId: 'leaf',
        greeting: { x: 1500, y: 1130 },
        home: { x: 1550, y: 1200 },
        facing: 'south',
        triggerRadius: 160,
        idleRadius: 120,
      },
    ],
    npcs: [],
    life: [],
    audio: { music: 'forest', ambience: 'forest' },
  });
}

/**
 * A serpentine course: three long barriers with their gaps at alternating ends, so the way through
 * zigzags.
 */
export function serpentine(): LogicMap {
  return LogicMap.parse({
    schemaVersion: 1,
    id: 'forest',
    widthTiles: 32,
    heightTiles: 24,
    start: 'start',
    obstacles: [
      rect(0, 400, 1600, 60),
      rect(448, 800, 1600, 60),
      rect(0, 1200, 1600, 60),
      tree(1000, 250),
      tree(1000, 620),
      tree(1000, 1030),
      tree(1000, 1380),
    ],
    spawns: [{ spawnId: 'start', facing: 'east', points: [900, 790, 680, 570, 460, 350].map((x) => ({ x, y: 200 })) }],
    portals: [],
    interactables: [],
    anchors: [],
    encounters: [],
    npcs: [],
    life: [],
    audio: { music: 'forest', ambience: 'forest' },
  });
}

/**
 * A yard on each side of a lane between two long walls, which leaves the feet a band ten units
 * wide: too narrow for any 32 unit cell centre to fall in it, and long enough that at its middle
 * the nearest centres are a long way off. Wildstar starts in the west yard.
 */
export function lane(): LogicMap {
  return LogicMap.parse({
    schemaVersion: 1,
    id: 'forest',
    widthTiles: 32,
    heightTiles: 24,
    start: 'start',
    obstacles: [rect(300, 600, 900, 81), rect(300, 735, 900, 300)],
    spawns: [
      {
        spawnId: 'start',
        facing: 'east',
        points: [
          { x: 200, y: 300 },
          { x: 100, y: 300 },
        ],
      },
    ],
    portals: [],
    interactables: [],
    anchors: [],
    encounters: [],
    npcs: [],
    life: [],
    audio: { music: 'forest', ambience: 'forest' },
  });
}

/** A garden with three beds and a gardener. */
export function garden(): LogicMap {
  const bed = (n: number, x: number, y: number) => ({
    anchorId: `palace-garden/bed-${n}`,
    tags: ['garden-bed'],
    capacity: 1,
    pos: { x, y },
    approach: [at(x, y + 60, 'north')],
  });
  return LogicMap.parse({
    schemaVersion: 1,
    id: 'palace-garden',
    widthTiles: 32,
    heightTiles: 24,
    start: 'start',
    obstacles: [tree(1000, 400), tree(500, 1000)],
    spawns: [{ spawnId: 'start', facing: 'east', points: LINE }],
    portals: [],
    interactables: [],
    anchors: [bed(1, 500, 500), bed(2, 900, 700), bed(3, 1300, 500), bed(4, 1500, 1000)],
    encounters: [],
    npcs: [{ npcId: 'gardener', start: { x: 700, y: 900 }, facing: 'south' }],
    life: [],
    audio: { music: 'garden', ambience: 'garden' },
  });
}

/**
 * A stable with a worker's spots, a fruit pile, two stalls, a brush station and the groom anchor
 * beside it.
 */
export function stable(): LogicMap {
  const spot = (id: string, tags: string[], x: number, y: number, cap = 1) => ({
    anchorId: `stable/${id}`,
    tags,
    capacity: cap,
    pos: { x, y },
    approach: [at(x, y + 50, 'north')],
  });
  return LogicMap.parse({
    schemaVersion: 1,
    id: 'stable',
    widthTiles: 32,
    heightTiles: 24,
    start: 'start',
    obstacles: [],
    spawns: [{ spawnId: 'start', facing: 'east', points: LINE }],
    portals: [],
    interactables: [
      {
        instanceId: 'stable/brush-1',
        definitionId: 'brush-station',
        pos: { x: 1200, y: 900 },
        hit: box(1200, 880, 60),
        approach: [at(1200, 960)],
        anchor: 'stable/brush-groom',
      },
    ],
    anchors: [
      spot('sweep-1', ['sweep-spot'], 300, 300),
      spot('sweep-2', ['sweep-spot'], 800, 300),
      spot('fruit-1', ['fruit-pile'], 1600, 300),
      spot('stall-1', ['stall-fruit'], 300, 1200),
      spot('stall-2', ['stall-fruit'], 600, 1200),
      spot('brush-spot', ['brush-worker'], 1100, 900),
      spot('brush-groom', ['groom'], 1300, 900),
    ],
    encounters: [],
    npcs: [{ npcId: 'stable-worker', start: { x: 500, y: 600 }, facing: 'south' }],
    life: [],
    audio: { music: 'quiet', ambience: 'stable-room' },
  });
}

/** The meadow with a pond in the upper right and a patch of every kind of creature living on it. */
export function lively(extra: LifeZone[] = []): LogicMap {
  const base = meadow();
  const ground = { x: 300, y: 130, w: 700, h: 340 };
  const sky = { x: 200, y: 100, w: 950, h: 820 };
  const zone = (
    zoneId: string,
    kind: LifeZone['kind'],
    area: LifeZone['area'],
    count: number,
    shape: LifeZone['shape'] = 'rect',
  ): LifeZone => ({ zoneId, kind, area, shape, count });
  return LogicMap.parse({
    ...base,
    obstacles: [...base.obstacles, { kind: 'rect', x: 1500, y: 80, w: 400, h: 250 }],
    life: [
      zone('birds', 'bird', ground, 4),
      zone('frogs', 'frog', ground, 3),
      zone('bunnies', 'bunny', ground, 3),
      zone('snails', 'snail', ground, 3),
      zone('ladybugs', 'ladybug', ground, 3),
      zone('ducks', 'duck', { x: 1550, y: 110, w: 300, h: 190 }, 3, 'ellipse'),
      zone('fish', 'fish', { x: 1550, y: 110, w: 300, h: 190 }, 3, 'ellipse'),
      zone('butterflies', 'butterfly', sky, 4),
      zone('dragonflies', 'dragonfly', sky, 2),
      zone('bees', 'bee', sky, 3),
      zone('fairies', 'fairy', sky, 3),
      ...extra,
    ],
  });
}

export const ALL: UnicornId[] = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'];

export function persistentWith(...recruited: UnicornId[]): Persistent {
  const p = newPersistent('00000000-0000-4000-8000-000000000001');
  p.recruited = ['wildstar', ...recruited.filter((id) => id !== 'wildstar')];
  return p;
}

export function makeWorld(
  opts: {
    map?: LogicMap;
    recruited?: UnicornId[];
    seed?: number;
    arrival?: Arrival;
    unlocked?: Set<string>;
    rules?: Rules;
    crown?: Crown;
  } = {},
): World {
  const map = opts.map ?? meadow();
  return createWorld({
    map,
    persistent: persistentWith(...(opts.recruited ?? [])),
    seed: opts.seed ?? 12345,
    arrival: opts.arrival ?? { kind: 'spawn', spawnId: 'start' },
    ...(opts.unlocked ? { unlocked: opts.unlocked } : {}),
    ...(opts.rules ? { rules: opts.rules } : {}),
    ...(opts.crown ? { crown: opts.crown } : {}),
  });
}

/**
 * Runs the simulation, checking invariants after every step. A violation throws, so no test can
 * step past one.
 */
export function run(world: World, seconds: number, each?: (w: World) => void): string[] {
  const steps = Math.round(seconds * CONFIG.stepHz);
  for (let i = 0; i < steps; i++) {
    step(world);
    each?.(world);
    const bad = checkInvariants(world);
    if (bad.length > 0) throw new Error(`t=${world.time.toFixed(2)}: ${bad.join('; ')}`);
  }
  return [];
}

/**
 * Puts a unicorn somewhere without going through movement. Wildstar takes the trail with her, and
 * the followers that were on it arrive with her, since a follower left far behind would be drawn
 * crossing the map in one step.
 */
export function teleport(world: World, id: UnicornId, pos: Pt): void {
  const u = world.unicorns[id]!;
  u.pos = { ...pos };
  u.prev = { ...pos };
  if (id !== 'wildstar') return;
  world.trail.seed([pos]);
  for (const other of Object.values(world.unicorns)) {
    if (other && other.state.kind === 'following') {
      other.pos = { ...pos };
      other.prev = { ...pos };
    }
  }
}

export const leaderOf = (w: World) => w.unicorns.wildstar!;
export const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

let commandId = 0;
/** Points the finger of someone steering Wildstar. */
export const steer = (world: World, heading: Vec2): void =>
  dispatch(world, { type: 'steer', commandId: `s${++commandId}`, heading });
/** Lifts the finger. */
export const halt = (world: World): void => dispatch(world, { type: 'halt', commandId: `h${++commandId}` });

/** Holds a heading for `seconds`, sending it again every step the way a held finger does. */
export function hold(world: World, heading: Vec2, seconds: number, each?: (w: World) => void): void {
  for (let i = 0, n = Math.round(seconds * CONFIG.stepHz); i < n; i++) {
    steer(world, heading);
    run(world, CONFIG.step);
    each?.(world);
  }
}
