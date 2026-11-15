import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { CHANDELIER_HANG, DAIS_DEPTH } from '../../art/world/throne-room';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';
import { ARRIVAL, doorway } from './palace-doors';

/**
 * The throne room, inside the Fairy Palace. The same kind of hall as the treasure house, but wider:
 * a long back wall with the door to the garden second from the west, the throne in the middle, a
 * violet carpet from the door to the dais, and a room that has everything a princess could want. A
 * banquet table and a harp to the west, the crown and a bookcase to the east, a canopy bed in the
 * far corner, three chandeliers and vases of flowers and diamonds. A doorway at each end leads on
 * to the other rooms of the palace. Everything is in world units; y grows toward the viewer.
 */
export function authorPalaceHall(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'palace-hall').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'palace-hall',
    widthTiles: 40,
    heightTiles: 18,
    tileset: 'palace-hall',
    bundle: 'palace-hall',
    music: 'quiet',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space
  b.open(rect(104, WY - 4, W - 104, H - 52));
  // The carpet leaves the door, turns east and runs up to the throne, spreading into a rug at the
  // foot of the dais. Edges sit half a tile off the grid so each is three tiles wide.
  const DOOR = pt(768, WY);
  const THRONE_X = 1280;
  b.pathBand(
    rect(672, WY - 40, 864, 736),
    rect(160, 544, 2400, 736),
    rect(THRONE_X - 96, 420, THRONE_X + 96, 736),
    rect(THRONE_X - 224, 420, THRONE_X + 224, 480),
    rect(160, WY - 40, 352, 736),
    rect(2208, WY - 40, 2400, 736),
  );
  b.classify();

  // The architecture
  const pieces = [
    ['ph-wall-doorL', 256],
    ['ph-wall-door', 768],
    ['ph-wall-throne', 1280],
    ['ph-wall-right', 1792],
    ['ph-wall-doorR', 2304],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024, 1536, 2048]) {
    b.place('ph-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('ph-side-west', 0, 0, 'foreground', 0);
  b.place('ph-side-east', W, 0, 'foreground', 0);

  // The door
  b.interactable({
    name: 'hall-door',
    definitionId: 'door',
    look: 'palace-in',
    pos: DOOR,
    hit: { x: DOOR.x - 92, y: DOOR.y - 214, w: 184, h: 236 },
    approach: [E(DOOR.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'garden-gate',
    bounds: { x: DOOR.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(DOOR.x, WY + 38),
    toMap: 'palace-garden',
    toSpawn: 'from-palace',
    door: 'hall-door',
  });
  b.spawn(
    'from-garden',
    'south',
    ARRIVAL.map((y) => pt(DOOR.x, y)),
  );
  // The doorways at the two ends lead to the dining room in the west and the gallery in the east.
  doorway(b, 256, 'palace-dining');
  doorway(b, 2304, 'palace-gallery');

  // The throne. The dais is two sprites: the chair and steps behind anyone standing on them, and
  // the risers in front. She stands on the top step.
  const FRONT = 412;
  const BACK = FRONT - Math.round(DAIS_DEPTH * 0.454);
  b.place('ph-dais-front', THRONE_X, FRONT, 'object-bases', 0);
  b.block({ kind: 'rect', x: THRONE_X - 112, y: WY + 4, w: 224, h: 356 - WY - 4 });
  b.interactable({
    name: 'throne',
    definitionId: 'throne',
    pos: pt(THRONE_X, BACK),
    hit: { x: THRONE_X - 130, y: BACK - 180, w: 260, h: FRONT - BACK + 190 },
    approach: [E(THRONE_X, 380, 'south')],
  });

  // Things to enjoy
  const rectAt = (x: number, y: number, halfW: number, halfH: number): void =>
    b.block({ kind: 'rect', x: x - halfW, y: y - halfH, w: halfW * 2, h: halfH * 2 });
  // The banquet table, south-west, with a chair at each end.
  const TABLE = pt(500, 900);
  rectAt(TABLE.x, TABLE.y, 152, 22);
  for (const sx of [-1, 1]) b.block({ kind: 'circle', x: TABLE.x + sx * 184, y: TABLE.y, r: 16 });
  b.interactable({
    name: 'table',
    definitionId: 'banquet-table',
    pos: TABLE,
    hit: hit(TABLE.x, TABLE.y, 340, 120, 96),
    approach: [E(TABLE.x, TABLE.y + 70, 'north')],
  });
  // The harp stands by the back wall, between the doorway and the garden door.
  const HARP = pt(480, 440);
  b.block({ kind: 'circle', x: HARP.x, y: HARP.y, r: 36 });
  b.interactable({
    name: 'harp',
    definitionId: 'harp',
    pos: HARP,
    hit: hit(HARP.x, HARP.y, 130, 250, 235),
    approach: [E(HARP.x, HARP.y + 62, 'north')],
  });
  // The crown on its stand, under the painting.
  const CROWN = pt(1792, 446);
  b.block({ kind: 'circle', x: CROWN.x, y: CROWN.y, r: 30 });
  b.interactable({
    name: 'crown',
    definitionId: 'crown-stand',
    pos: CROWN,
    hit: hit(CROWN.x, CROWN.y, 92, 160, 150),
    approach: [E(CROWN.x, CROWN.y + 56, 'north')],
  });
  // A bookcase between the crown and the east doorway.
  const CASE = pt(2060, 380);
  rectAt(CASE.x, CASE.y, 82, 14);
  b.interactable({
    name: 'bookcase-1',
    definitionId: 'bookcase',
    pos: CASE,
    hit: hit(CASE.x, CASE.y, 170, 225, 215),
    approach: [E(CASE.x, CASE.y + 56, 'north')],
  });
  // The canopy bed, in the south-east.
  const BED = pt(2100, 900);
  rectAt(BED.x, BED.y, 90, 48);
  b.interactable({
    name: 'bed',
    definitionId: 'canopy-bed',
    pos: BED,
    hit: hit(BED.x, BED.y, 210, 270, 215),
    approach: [E(BED.x, BED.y + 84, 'north')],
  });
  // Three chandeliers hang over the room. Each is tapped from below and lights up the air where it
  // hangs.
  for (const [n, x, floor] of [
    [1, 700, 780],
    [2, 1280, 880],
    [3, 1860, 780],
  ] as const) {
    const hang = pt(x, floor - CHANDELIER_HANG);
    b.place('ph-chandelier-shadow', x, floor, 'ground-detail', 0);
    b.interactable({
      name: `chandelier-${n}`,
      definitionId: 'chandelier',
      pos: hang,
      hit: { x: x - 96, y: hang.y - 150, w: 192, h: 170 },
      approach: [E(x, floor + 30, 'north')],
    });
  }

  // Furniture round the edges
  const solid = (sprite: string, x: number, y: number): void => b.solid(sprite, x, y);
  solid('ph-lamp', 590, WY + 74);
  solid('ph-lamp', 946, WY + 74);
  solid('ph-lamp', 1590, WY + 74);
  solid('ph-lamp', 2160, WY + 74);
  solid('ph-urn-teal', 130, 420);
  solid('ph-urn-rose', 2440, 640);
  solid('ph-urn-rose', 130, 1040);
  solid('ph-urn-teal', 2440, 1040);
  solid('ph-urn-teal', 640, 1050);
  solid('ph-urn-rose', 1920, 1050);
  solid('ph-urn-teal', 1000, 470);
  solid('ph-urn-rose', 1560, 470);

  // Vases: flowers by the doors and the dais, diamonds beside the crown
  const vase = (kind: 'flower' | 'diamond', name: string, look: string, x: number, y: number): void => {
    b.block({ kind: 'circle', x, y, r: 17 });
    b.interactable({
      name,
      definitionId: `${kind}-vase`,
      look,
      pos: pt(x, y),
      hit: hit(x, y, 80, 170, 160),
      approach: [E(x, y + 52, 'north')],
    });
  };
  vase('flower', 'flower-vase-1', 'rose', 656, 440);
  vase('flower', 'flower-vase-2', 'daisy', 880, 440);
  vase('flower', 'flower-vase-3', 'lilac', 1096, 392);
  vase('flower', 'flower-vase-4', 'tulip', 1464, 392);
  vase('diamond', 'diamond-vase-1', 'clear', 1690, 410);
  vase('diamond', 'diamond-vase-2', 'spray', 1894, 410);

  // Who lives here: fairies drifting between the pillars
  b.life({
    name: 'fairy-hall-west',
    kind: 'fairy',
    area: { x: 300, y: 460, w: 900, h: 480 },
    shape: 'ellipse',
    count: 2,
  });
  b.life({
    name: 'fairy-hall-east',
    kind: 'fairy',
    area: { x: 1500, y: 460, w: 900, h: 480 },
    shape: 'ellipse',
    count: 2,
  });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('palace-hall');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/palace-hall.tmj', JSON.stringify(out.tmj));
  return out;
}
