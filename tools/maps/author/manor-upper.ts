import { mkdirSync, writeFileSync } from 'node:fs';
import { HALL } from '../../art/world/hall';
import { HANGING_HANG } from '../../art/world/manor-plants';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { disc, stand as E, hitBox as hit, pt, rect } from './geom';

/**
 * The Sky Garden: the upper floor of the Spooky Manor. Pearl floors, big windows with the twilight
 * forest, moon and stars outside, and plants that cost more than a castle. A jade carpet runs from
 * the lift to a lotus fountain. Gold urns line the walls, jewel planters, orchids, crystal tulips
 * and jade bonsai stand about, and hanging gardens float overhead. The lift is in the middle of the
 * back wall and goes back down.
 */
export function authorManorUpper(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'manor').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'manor-upper',
    widthTiles: 40,
    heightTiles: 18,
    tileset: 'manor-upper',
    bundle: 'manor',
    music: 'quiet',
    ambience: 'sky-garden',
    solo: true,
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;

  // Space
  b.open(rect(104, WY - 4, W - 104, H - 52));
  const LIFT = pt(1280, WY);
  const FOUNTAIN = pt(1280, 880);
  b.pathBand(rect(1184, WY - 40, 1376, 740), disc(FOUNTAIN, 232));
  b.classify();

  // The architecture
  const pieces = [
    ['sg-wall-windows', 256],
    ['sg-wall-windows', 768],
    ['sg-wall-lift', 1280],
    ['sg-wall-windows', 1792],
    ['sg-wall-windows', 2304],
  ] as const;
  for (const [id, x] of pieces) b.place(id, x, WY, 'object-bases', -20);
  for (const x of [512, 1024, 1536, 2048]) {
    b.place('sg-column', x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place('sg-side-west', 0, 0, 'foreground', 0);
  b.place('sg-side-east', W, 0, 'foreground', 0);

  // The lift, which goes back down
  b.interactable({
    name: 'lift-door-1',
    definitionId: 'lift-door',
    pos: LIFT,
    hit: { x: LIFT.x - 92, y: LIFT.y - 214, w: 184, h: 236 },
    approach: [E(LIFT.x, WY + 38, 'north')],
  });
  b.portal({
    name: 'lift-down',
    bounds: { x: LIFT.x - 56, y: WY + 22, w: 112, h: 44 },
    approach: pt(LIFT.x, WY + 38),
    toMap: 'manor-hall',
    toSpawn: 'from-upper',
    door: 'lift-door-1',
    ride: 'down',
  });
  b.spawn('from-lift', 'south', [pt(LIFT.x, 470), pt(LIFT.x, 590), pt(LIFT.x, 700)]);

  // The windows: touch the middle of each wall and the night outside sparkles
  for (const [n, x] of [
    [1, 256],
    [2, 768],
    [3, 1792],
    [4, 2304],
  ] as const) {
    b.interactable({
      name: `moon-window-${n}`,
      definitionId: 'moon-window',
      pos: pt(x, WY - 140),
      hit: { x: x - 62, y: WY - 214, w: 124, h: 150 },
      approach: [E(x, WY + 90, 'north')],
    });
  }

  // The centrepiece
  b.footprint('sg-fountain-lotus', FOUNTAIN.x, FOUNTAIN.y);
  b.interactable({
    name: 'lotus-fountain',
    definitionId: 'sky-fountain-lotus',
    pos: FOUNTAIN,
    hit: hit(FOUNTAIN.x, FOUNTAIN.y, 330, 220, 170),
    approach: [E(FOUNTAIN.x, FOUNTAIN.y + 170, 'north')],
  });

  // The plants
  const plant = (name: string, def: string, sprite: string, x: number, y: number, w: number, tall: number): void => {
    b.footprint(sprite, x, y);
    b.interactable({
      name,
      definitionId: def,
      pos: pt(x, y),
      hit: hit(x, y, w, tall + 20, tall),
      approach: [E(x, y + footprints[sprite]! + 44, 'north')],
    });
  };
  for (const [n, x] of [
    [1, 440],
    [2, 1060],
    [3, 1500],
    [4, 2120],
  ] as const)
    plant(`urn-${n}`, 'sky-urn-gold', 'sg-urn-gold', x, 440, 110, 190);
  for (const [n, x] of [
    [1, 640],
    [2, 1920],
  ] as const)
    plant(`planter-${n}`, 'sky-planter-jewel', 'sg-planter-jewel', x, 520, 190, 130);
  for (const [n, x, y] of [
    [1, 250, 560],
    [2, 2310, 560],
    [3, 900, 640],
    [4, 1660, 640],
  ] as const)
    plant(`orchid-${n}`, 'sky-orchid', 'sg-orchid', x, y, 100, 210);
  for (const [n, x] of [
    [1, 560],
    [2, 2000],
  ] as const)
    plant(`tulips-${n}`, 'sky-tulips-crystal', 'sg-tulips-crystal', x, 900, 100, 190);
  for (const [n, x] of [
    [1, 320],
    [2, 2240],
  ] as const)
    plant(`bonsai-${n}`, 'sky-bonsai-jade', 'sg-bonsai-jade', x, 800, 140, 150);
  for (const [name, def, sprite, x] of [
    ['urn-5', 'sky-urn-gold', 'sg-urn-gold', 190],
    ['urn-6', 'sky-urn-gold', 'sg-urn-gold', 2370],
  ] as const)
    plant(name, def, sprite, x, 980, 110, 190);

  // Hanging gardens, each tapped from below and throwing a soft shadow on the floor
  for (const [n, x, floor] of [
    [1, 800, 1010],
    [2, 1760, 1010],
    [3, 1040, 820],
    [4, 1520, 820],
  ] as const) {
    const hang = pt(x, floor - HANGING_HANG);
    b.place('sg-hanging-shadow', x, floor, 'ground-detail', 0);
    b.interactable({
      name: `hanging-garden-${n}`,
      definitionId: 'sky-hanging-garden',
      pos: hang,
      hit: { x: x - 90, y: hang.y - 190, w: 180, h: 210 },
      approach: [E(x, floor + 30, 'north')],
    });
  }

  // Who lives here: tiny friendly wisps and butterflies
  b.life({ name: 'wisp-west', kind: 'fairy', area: { x: 300, y: 500, w: 800, h: 480 }, shape: 'ellipse', count: 2 });
  b.life({ name: 'wisp-east', kind: 'fairy', area: { x: 1500, y: 500, w: 800, h: 480 }, shape: 'ellipse', count: 2 });
  b.life({
    name: 'butterflies',
    kind: 'butterfly',
    area: { x: 700, y: 520, w: 1200, h: 460 },
    shape: 'ellipse',
    count: 3,
  });

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('manor-upper');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/manor-upper.tmj', JSON.stringify(out.tmj));
  return out;
}
