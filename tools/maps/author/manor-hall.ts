import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { CHANDELIER_HANG } from '../../art/world/throne-room';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * The Wonder Gallery: the ground floor of the Spooky Manor. A long plum hall with the front door
 * second from the west, a pumpkin-orange carpet that runs from the door along the hall and up to a
 * wall of flowers. Eight rare statues from other places and worlds stand in two rows, with garlands
 * on the walls and chandeliers overhead. Among the flowers a jewel butterfly rests: touch it and
 * the flowers by the lift part, a golden door slides open and the lift is ready. Only Wildstar
 * comes in, so the herd waits outside. Everything is in world units; y grows toward the viewer.
 */
const GALLERY_STATUES = [
  ['crystal-fox', 1040, 500],
  ['moon-hare', 1240, 500],
  ['star-whale', 2110, 500],
  ['storm-bird', 2370, 500],
  ['coral-seahorse', 520, 900],
  ['ember-drake', 1000, 900],
  ['cloud-lion', 1480, 900],
  ['glow-owl', 1960, 900],
] as const;

export function authorManorHall(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'manor').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'manor-hall',
    widthTiles: 40,
    heightTiles: 18,
    tileset: 'manor-hall',
    bundle: 'manor',
    music: 'quiet',
    ambience: 'manor-hall',
    solo: true,
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space
  b.open(rect(104, WY - 4, W - 104, H - 52));
  // The carpet leaves the door, runs along the hall and turns up to the lift. Edges sit half a tile
  // off the grid so each band is three tiles wide.
  const DOOR = pt(768, WY);
  const LIFT = pt(1792, WY);
  b.pathBand(rect(672, WY - 40, 864, 800), rect(672, 608, 1888, 800), rect(1696, WY - 40, 1888, 800));
  b.classify();

  // The architecture
  const pieces = [
    ['mn-wall-left', 256],
    ['mn-wall-door', 768],
    ['mn-wall-flowers', 1280],
    ['mn-wall-lift', 1792],
    ['mn-wall-right', 2304],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024, 1536, 2048]) {
    b.place('mn-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('mn-side-west', 0, 0, 'foreground', 0);
  b.place('mn-side-east', W, 0, 'foreground', 0);
  // Flower garlands swag across three of the walls, in front of the wall and behind everything that
  // stands on the floor.
  for (const x of [282, 1280, 2304]) b.place('mn-garland', x, 100, 'object-bases', 232);

  // The front door
  b.interactable({
    name: 'manor-door-in',
    definitionId: 'door',
    look: 'manor-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'manor-exit',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'forest',
    toSpawn: 'from-manor',
    door: 'manor-door-in',
  });
  b.spawn('from-forest', 'south', [pt(DOOR.x, 470), pt(DOOR.x, 680), pt(DOOR.x, 890)]);

  // The secret lift. The door is drawn over the flowers and stays shut until the butterfly is
  // touched. The butterfly rests on the flower panel to its west.
  b.interactable({
    name: 'elevator-door-1',
    definitionId: 'elevator-door',
    pos: LIFT,
    hit: { x: LIFT.x - 92, y: LIFT.y - 214, w: 184, h: 236 },
    approach: [E(LIFT.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'lift-up',
    bounds: { x: LIFT.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(LIFT.x, WY + 38),
    toMap: 'manor-upper',
    toSpawn: 'from-lift',
    door: 'elevator-door-1',
    ride: 'up',
  });
  b.spawn('from-upper', 'south', [pt(LIFT.x, 470), pt(LIFT.x, 680), pt(LIFT.x, 890)]);
  const CLUE = pt(1430, WY - 134);
  b.interactable({
    name: 'clue-butterfly',
    definitionId: 'elevator-clue',
    pos: CLUE,
    hit: { x: CLUE.x - 48, y: CLUE.y - 52, w: 96, h: 104 },
    approach: [E(CLUE.x, WY + 80, 'north')],
  });
  // The two flower panels beside the lift bloom when they are touched.
  for (const [n, x] of [
    [1, LIFT.x - 196],
    [2, LIFT.x + 196],
  ] as const) {
    b.interactable({
      name: `flower-wall-${n}`,
      definitionId: 'flower-wall',
      pos: pt(x, WY - 95),
      hit: { x: x - 40, y: WY - 170, w: 80, h: 150 },
      approach: [E(x, WY + 90, 'north')],
    });
  }

  // The statues
  for (const [name, x, y] of GALLERY_STATUES) {
    const at = pt(x, y);
    b.footprint(`mn-statue-${name}`, x, y);
    b.interactable({
      name: `statue-${name}`,
      definitionId: `statue-${name}`,
      pos: at,
      hit: hit(x, y, 112, 285, 262),
      approach: [E(x, y + 72, 'north')],
    });
  }

  // Chandeliers
  for (const [n, x, floor] of [
    [1, 768, 780],
    [2, 1280, 880],
    [3, 1792, 780],
  ] as const) {
    const hang = pt(x, floor - CHANDELIER_HANG);
    b.place('mn-chandelier-shadow', x, floor, 'ground-detail', 0);
    b.interactable({
      name: `chandelier-${n}`,
      definitionId: 'manor-chandelier',
      pos: hang,
      hit: { x: x - 96, y: hang.y - 150, w: 192, h: 170 },
      approach: [E(x, floor + 30, 'north')],
    });
  }

  // Furniture round the edges
  b.solid('mn-lamp', 600, WY + 74);
  b.solid('mn-lamp', 936, WY + 74);
  b.solid('mn-urn-plum', 150, 430);
  b.solid('mn-urn-plum', 150, 1030);
  b.solid('mn-urn-plum', 2420, 1030);
  b.solid('mn-urn-plum', 700, 1040);
  b.solid('mn-urn-plum', 1740, 1040);

  // Who lives here: tiny friendly wisps drifting between the statues
  b.life({ name: 'wisp-west', kind: 'fairy', area: { x: 300, y: 560, w: 900, h: 420 }, shape: 'ellipse', count: 2 });
  b.life({ name: 'wisp-east', kind: 'fairy', area: { x: 1500, y: 560, w: 900, h: 420 }, shape: 'ellipse', count: 2 });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('manor-hall');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/manor-hall.tmj', JSON.stringify(out.tmj));
  return out;
}
