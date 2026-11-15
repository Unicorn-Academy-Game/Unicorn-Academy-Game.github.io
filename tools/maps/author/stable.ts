import { mkdirSync, writeFileSync } from 'node:fs';
import { BOX_COATS } from '../../art/unicorn/coats';
import { BARN } from '../../art/world/barn';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * The stable. The back wall runs across the north with a barn door in the middle and three open
 * stalls each side. In front of them a broad brick aisle, where the stable worker sweeps, carries
 * fruit from the piles to the stalls and brushes a unicorn at the grooming rail. Everything is in
 * world units; y grows toward the viewer.
 */
export function authorStable(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'stable').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'stable',
    widthTiles: 32,
    heightTiles: 24,
    tileset: 'stable',
    bundle: 'stable',
    music: 'quiet',
    ambience: 'stable-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = BARN.wallY;
  const FRONT = WY + BARN.stallDepth + 6;
  const STALLS = [128, 384, 640, 1408, 1664, 1920] as const;
  const CENTRE = W / 2;

  // Space
  b.open(rect(104, WY - 4, W - 104, H - 56));
  // Brick fills the aisle from the stalls' fronts to the bottom of the map; the stalls themselves
  // stay in straw.
  b.pathBand(rect(-64, 608, W + 64, H + 64));
  b.classify();

  // The architecture
  const pieces = [
    ['barn-wall-end-west', 128],
    ['barn-wall-bay-west', 512],
    ['barn-wall-door', 1024],
    ['barn-wall-bay-east', 1536],
    ['barn-wall-end-east', 1920],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  b.place('barn-side-west', 0, 0, 'foreground', 0);
  b.place('barn-side-east', W, 0, 'foreground', 0);
  // Each stall's left post and header beam, then the post that closes the west run.
  for (const x of [0, 256, 512, 1280, 1536, 1792]) b.place('barn-frame', x, FRONT, 'object-bases', 0);
  b.place('barn-post', 768, FRONT, 'object-bases', 0);
  for (const x of [256, 512, 768, 1280, 1536, 1792]) {
    b.block({ kind: 'rect', x: x - 7, y: WY - 4, w: 14, h: FRONT - WY + 10 });
    b.block({ kind: 'circle', x, y: FRONT, r: 13 });
  }

  // The door
  const DOOR = pt(CENTRE, WY);
  b.interactable({
    name: 'barn-door',
    definitionId: 'door',
    look: 'stable-in',
    pos: DOOR,
    hit: { x: DOOR.x - 124, y: DOOR.y - 244, w: 248, h: 264 },
    approach: [E(DOOR.x, WY + 60, 'north')],
  });
  b.portal({
    name: 'garden-gate',
    bounds: { x: DOOR.x - 80, y: WY + 34, w: 160, h: 60 },
    approach: pt(DOOR.x, WY + 60),
    toMap: 'palace-garden',
    toSpawn: 'from-stable',
    door: 'barn-door',
  });
  b.spawn('from-garden', 'south', [pt(CENTRE + 118, 670), pt(CENTRE - 189, 670), pt(CENTRE - 496, 670)]);

  // Things to stand about
  const solid = (sprite: string, x: number, y: number): void => b.solid(sprite, x, y);
  solid('fruit-pile', 320, 1010);
  solid('fruit-pile', 1730, 1070);
  solid('fruit-crates-a', 160, 770);
  solid('fruit-crates-b', 1884, 790);
  solid('fruit-crates-b', 168, 1318);
  solid('fruit-crates-a', 1890, 1340);
  solid('water-trough', 760, 800);
  solid('bucket-water', 700, 884);
  solid('wheelbarrow', 520, 1130);
  solid('feed-bin', 1346, 1260);
  solid('bucket-oats', 1250, 1306);
  solid('saddle-rack', 1262, 724);
  solid('barn-barrel', 116, 1052);
  solid('barn-barrel', 1950, 1130);
  solid('barn-barrel', 1860, 1236);

  // The brushing rail
  const BRUSH = pt(1480, 790);
  b.footprint('brush-station', BRUSH.x, BRUSH.y);
  b.anchor({
    name: 'groom-1',
    tags: ['groom'],
    pos: pt(BRUSH.x, BRUSH.y + 84),
    approach: [E(BRUSH.x - 74, BRUSH.y + 84, 'east')],
  });
  b.interactable({
    name: 'brush-1',
    definitionId: 'brush-station',
    pos: BRUSH,
    hit: hit(BRUSH.x, BRUSH.y, 190, 200, 180),
    approach: [E(BRUSH.x - 74, BRUSH.y + 84, 'east')],
    anchor: 'groom-1',
  });
  b.anchor({
    name: 'brush-spot-1',
    tags: ['brush-worker'],
    pos: pt(BRUSH.x - 74, BRUSH.y + 150),
    approach: [E(BRUSH.x - 74, BRUSH.y + 152, 'north')],
  });
  b.anchor({
    name: 'brush-spot-2',
    tags: ['brush-worker'],
    pos: pt(BRUSH.x + 40, BRUSH.y + 150),
    approach: [E(BRUSH.x + 40, BRUSH.y + 152, 'north')],
  });

  // The boxed unicorns: one in each stall, in the coat that stall was given
  const COATS = BOX_COATS.map((c) => c.id);
  STALLS.forEach((x, i) => {
    const at = pt(x, WY + 110);
    b.footprint(`boxed-${COATS[i]!}`, at.x, at.y);
    b.interactable({
      name: `boxed-${i + 1}`,
      definitionId: 'boxed-unicorn',
      look: COATS[i]!,
      pos: at,
      hit: hit(at.x, at.y, 120, 200, 175),
      approach: [E(x, FRONT + 70, 'north')],
    });
  });

  // The worker's route
  [
    [540, 930],
    [1010, 1090],
    [1340, 960],
    [830, 1240],
  ].forEach(([x, y], i) => {
    b.anchor({ name: `sweep-${i + 1}`, tags: ['sweep-spot'], pos: pt(x!, y!), approach: [E(x!, y!, 'south')] });
  });
  for (const [n, x, y] of [
    [1, 320, 1010],
    [2, 1730, 1070],
  ] as const)
    b.anchor({ name: `fruit-pile-${n}`, tags: ['fruit-pile'], pos: pt(x, y), approach: [E(x, y + 124, 'north')] });
  STALLS.forEach((x, i) => {
    b.anchor({
      name: `stall-${i + 1}-fruit`,
      tags: ['stall-fruit'],
      pos: pt(x, WY + 60),
      approach: [E(x, FRONT + 70, 'north')],
    });
  });
  b.npc('stable-worker', pt(1120, 780), 'south');

  // Places the herd may idle, grazing at the fruit piles and drinking at the trough. A unicorn
  // stands beside the pile and lowers its head to it; the anchor is the straw it reaches.
  const graze = (n: number, x: number, y: number, facing: 'east' | 'west'): void => {
    b.anchor({
      name: `graze-${n}`,
      tags: ['graze'],
      pos: pt(x + (facing === 'east' ? 64 : -64), y),
      approach: [E(x, y, facing)],
    });
  };
  graze(1, 472, 1030, 'west');
  graze(2, 168, 1030, 'east');
  graze(3, 1578, 1090, 'east');
  graze(4, 1882, 1090, 'west');
  b.anchor({ name: 'drink-trough-1', tags: ['drink'], pos: pt(612 + 64, 812), approach: [E(612, 812, 'east')] });
  b.anchor({ name: 'drink-trough-2', tags: ['drink'], pos: pt(908 - 64, 812), approach: [E(908, 812, 'west')] });

  // Who lives here: two fairies in the rafters' light, sparrows on the bricks, a bunny after the
  // carrots
  b.life({ name: 'fairy-stable', kind: 'fairy', area: { x: 560, y: 640, w: 940, h: 520 }, shape: 'ellipse', count: 2 });
  b.life({ name: 'bird-aisle', kind: 'bird', area: { x: 660, y: 1180, w: 700, h: 120 }, shape: 'rect', count: 2 });
  b.life({ name: 'bunny-aisle', kind: 'bunny', area: { x: 1380, y: 1170, w: 360, h: 110 }, shape: 'rect', count: 1 });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('stable');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/stable.tmj', JSON.stringify(out.tmj));
  return out;
}
