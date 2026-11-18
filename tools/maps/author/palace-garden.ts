import { mkdirSync, writeFileSync } from 'node:fs';
import { ARCH_PIECES, pieceId } from '../../../src/content/fountain-rainbow';
import type { LifeKind } from '../../../src/shared/life';
import { BANNER } from '../../art/world/banner';
import { hornFromAnchor } from '../../art/world/fountain-horns';
import { BANNER_ROD_RISE, PALACE_PIECES } from '../../art/world/palace';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { blob, disc, stand as E, hitBox as hit, type Pt, pt, rect, Scatter } from './geom';

/**
 * The palace garden. The Fairy Palace stands across the north with its rainbow behind it, and the
 * garden spreads in front: a hedged forecourt at the palace door, a promenade down to a cobbled
 * plaza, the treasure house on the west side and the stable on the east with the two-statue
 * fountain beside it, and flower beds for the gardener between. South of the hedge a gate opens on
 * the farm (fenced beds and a scarecrow), with an orchard to its east and a pond to its west; an
 * east gap leads to a wide meadow of flower beds that ends at a plaza, and a rainbow gate south of
 * it opens on the playground. Everything is in world units (one unit is one art pixel); y grows
 * toward the viewer.
 */

const SIN = Math.sin((27 * Math.PI) / 180);

/**
 * An ellipse as a polygon for collision, because ground units are one to one but a round basin is
 * wider than it is deep.
 */
const ellipsePoly = (c: Pt, rx: number, ry: number, n = 28): [number, number][] =>
  Array.from({ length: n }, (_, i): [number, number] => [
    Math.round(c.x + Math.cos((i / n) * Math.PI * 2) * rx),
    Math.round(c.y + Math.sin((i / n) * Math.PI * 2) * ry),
  ]);

export function authorPalaceGarden(): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'garden').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: 'palace-garden',
    widthTiles: 80,
    heightTiles: 64,
    tileset: 'garden',
    bundle: 'garden',
    music: 'garden',
    ambience: 'garden',
    footprints,
    sprites,
  });
  const sc = new Scatter(1024);
  const rnd = sc.rng;
  const pick = <A>(xs: readonly A[]): A => xs[Math.floor(rnd() * xs.length)]!;
  const W = b.width,
    H = b.height;

  // Fixed points
  const K = pt(1536, 940); // the keep's ground anchor
  const TH = pt(520, 1230); // the treasure house's ground anchor, at its front wall
  const ST = pt(2552, 1230); // the stable's
  const F = pt(2400, 1540); // the fountain's centre
  const PLAZA = pt(1536, 1632);
  const POND = pt(480, 3200);
  const RAINBOW_GATE = pt(4704, 2070); // the arch to the playground, south of the east plaza

  // Where the herd can walk. The garden proper, a forecourt in front of the palace, and nothing
  // behind the buildings where the herd would be hidden.
  const garden = rect(110, 1140, 2962, 2170);
  const forecourt = rect(1150, 990, 1922, 1200);
  // Beyond the south hedge: a lawn with the farm, the orchard and the pond, reached by a gate in
  // the hedge. An east meadow is reached by a gap in the east hedge and runs on into the lawn. The
  // walls between are thin, and the hedges stand in them.
  const lawn = rect(110, 2210, 4980, 3900);
  const southGate = rect(1376, 2150, 1696, 2230);
  const eastMeadow = rect(3000, 1140, 4980, 2330);
  const eastGap = rect(2900, 1696, 3010, 1888);
  const riverGate = rect(4960, 1696, 5100, 1888);
  b.open(garden, forecourt, lawn, southGate, eastMeadow, eastGap, riverGate);

  // Path edges sit half a tile off the vertex grid so each one is a clean, whole number of tiles
  // wide.
  b.pathBand(
    rect(1120, 928, 1952, 1184), // forecourt apron
    rect(1376, 1152, 1696, 1536), // promenade
    disc(PLAZA, 288),
    rect(352, 1248, 2016, 1440), // the garden road, fronting the treasure house
    rect(32, 1696, 1450, 1888), // the road to the forest gate
    rect(1760, 1248, 2848, 1760), // the stable yard, with the fountain in it
    rect(1376, 1850, 1696, 3104), // the avenue south through the gate and the farm
    disc(pt(1536, 3170), 176), // the farm's round plaza, where the scarecrow stands
    rect(2200, 2848, 4256, 2976), // the orchard lane, out of the farm's east gate
    disc(pt(4256, 2912), 128),
    rect(544, 2848, 900, 2976), // the farm's west gate, and the lane along to the pond
    rect(544, 2848, 672, 3040), // and down to its north bank
    rect(2912, 1696, 4608, 1888), // the east path, out of the gap in the east hedge
    rect(4832, 1696, 5100, 1888), // and on to the river gate at its far end
    disc(pt(4700, 1792), 150), // the plaza at its end
    rect(4576, 1792, 4832, 2160), // and the way south from it to the rainbow gate
  );
  b.pond(blob(POND, 250, 150, { seed: 71, wobble: 0.14 }));
  b.classify();

  // Buildings keep their bodies; the strip behind them was never open, so the herd cannot walk
  // where a roof hides it.
  const bodyOf = (a: Pt, halfW: number, depthUnits: number) => ({
    x: a.x - halfW,
    y: a.y - depthUnits * SIN - 2,
    w: halfW * 2,
    h: depthUnits * SIN + 6,
  });
  const th = bodyOf(TH, 182, 206);
  const st = bodyOf(ST, 196, 196);
  for (const r of [th, st]) b.block({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h });

  // Sky, hills, clouds and the rainbow. The backdrop layer sorts by y plus bias, so the biases fix
  // the order: sky, clouds, rainbow, far hills, near hills.
  for (let i = 0; i < 80; i++) {
    b.place('sky-strip', 32 + i * 64, 700, 'backdrop', -3000);
  }
  for (const [id, x, y] of [
    ['cloud-3', 380, 300],
    ['cloud-1', 900, 220],
    ['cloud-5', 1500, 330],
    ['cloud-2', 2080, 250],
    ['cloud-4', 2480, 340],
    ['cloud-3', 2820, 210],
    ['cloud-4', 160, 440],
    ['cloud-2', 1260, 120],
    ['cloud-1', 3300, 260],
    ['cloud-5', 3700, 150],
    ['cloud-3', 4100, 360],
    ['cloud-2', 4500, 230],
    ['cloud-4', 4900, 330],
    ['cloud-1', 3050, 470],
    ['cloud-5', 4300, 90],
  ] as const)
    b.place(id, x, y, 'backdrop', -2000);
  b.place('rainbow', K.x, K.y - 80, 'backdrop', -1500);
  for (let i = 0; i < 10; i++) {
    b.place(`hills-far-${i % 3}`, 256 + i * 512 - 256, 650, 'backdrop', -1000);
    b.place(`hills-near-${(i + 1) % 3}`, 256 + i * 512 - 120, 716, 'backdrop', -900);
  }

  // Keep scenery off the places the herd arrives and the doors it walks to.
  for (const [x, y, r] of [
    [300, 1792, 210],
    [4900, 1792, 210],
    [TH.x, TH.y + 80, 140],
    [ST.x, ST.y + 80, 140],
    [K.x, K.y + 120, 170],
  ] as const)
    sc.add(x, y, r);

  // The palace
  const PIECES = {
    keep: 'palace-keep',
    'tower-left': 'palace-tower-left',
    'tower-right': 'palace-tower-right',
    'wing-left': 'palace-wing-left',
    'wing-right': 'palace-wing-right',
    'end-left': 'palace-end-left',
    'end-right': 'palace-end-right',
  } as const;
  const BIAS = {
    keep: 0,
    'tower-left': -4,
    'tower-right': -4,
    'wing-left': -2,
    'wing-right': -2,
    'end-left': -6,
    'end-right': -6,
  } as const;
  for (const piece of Object.keys(PIECES) as (keyof typeof PIECES)[]) {
    const at = PALACE_PIECES[piece].at;
    b.place(PIECES[piece], K.x + at.x, K.y + at.y, 'object-bases', BIAS[piece]);
  }
  b.place('palace-banner', K.x, K.y, 'object-bases', 2);
  // The banner hangs far above where the herd can stand. On a phone held sideways the camera pulls
  // back and up as the herd nears the door, just far enough to bring the whole banner into view
  // with the leader's feet.
  const banner = {
    x: K.x - BANNER.canvas.w / 2,
    y: K.y - BANNER_ROD_RISE - BANNER.rodY,
    w: BANNER.canvas.w,
    h: BANNER.canvas.h,
  };
  // Everything of the palace on one screen: every piece's picture, the banner over the keep and the
  // steps up to the door.
  let [left, top, right, bottom] = [banner.x, banner.y, banner.x + banner.w, K.y + 140];
  for (const piece of Object.values(PALACE_PIECES)) {
    left = Math.min(left, K.x + piece.at.x - piece.canvas.ox);
    top = Math.min(top, K.y + piece.at.y - piece.canvas.oy);
    right = Math.max(right, K.x + piece.at.x - piece.canvas.ox + piece.canvas.w);
  }
  b.vista({
    id: 'palace-banner',
    stand: pt(K.x, K.y + 92),
    radius: 480,
    show: banner,
    whole: { area: { x: left, y: top, w: right - left, h: bottom - top }, word: 'palace' },
  });

  // The two houses
  b.place('treasure-house', TH.x, TH.y, 'object-bases', -1);
  b.place('stable-house', ST.x, ST.y, 'object-bases', -1);
  for (const r of [th, st]) sc.add(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 60);

  // The fountain
  b.place('fountain-basin', F.x, F.y, 'object-bases', 0);
  b.place('fountain-ripples', F.x, F.y, 'object-bases', 1);
  const statueEast = pt(F.x - 290, F.y + 20);
  const statueWest = pt(F.x + 290, F.y + 20);
  b.place('fountain-statue-east', statueEast.x, statueEast.y, 'object-bases');
  b.place('fountain-statue-west', statueWest.x, statueWest.y, 'object-bases');
  b.block({ kind: 'poly', pts: ellipsePoly(F, 188, 86) });
  b.block({ kind: 'circle', x: statueEast.x, y: statueEast.y, r: 52 });
  b.block({ kind: 'circle', x: statueWest.x, y: statueWest.y, r: 52 });
  sc.add(F.x, F.y, 330);
  // The rainbow Wildstar's light makes stands between the horn tips of the two statues, which the
  // statues' art says where they are.
  const hornEast = hornFromAnchor('east');
  const hornWest = hornFromAnchor('west');
  const RAINBOW = pt(
    (statueEast.x + hornEast.x + statueWest.x + hornWest.x) / 2,
    (statueEast.y + hornEast.y + statueWest.y + hornWest.y) / 2,
  );

  // Hedges, topiary and other furniture
  const hedgeRow = (x0: number, x1: number, y: number, roses = false): void => {
    let x = x0;
    while (x < x1 - 8) {
      const left = x1 - x;
      const id =
        left >= 192 ? (roses ? 'hedge-h-192-roses' : 'hedge-h-192') : left >= 112 ? 'hedge-h-128' : 'hedge-h-64';
      const len = id.includes('192') ? 192 : id.includes('128') ? 128 : 64;
      b.place(id, x + len / 2, y);
      x += len - 8;
    }
  };
  const hedgeCol = (x: number, y0: number, y1: number): void => {
    let y = y0;
    while (y < y1 - 6) {
      const left = y1 - y;
      const id = left >= 73 ? 'hedge-v-160' : 'hedge-v-96';
      const len = id === 'hedge-v-160' ? 73 : 44;
      b.place(id, x, y + len / 2);
      y += len - 4;
    }
  };

  // The forecourt: hedged on both sides, braziers by the steps, topiary on the corners.
  hedgeCol(1136, 1000, 1200);
  hedgeCol(1936, 1000, 1200);
  b.place('topiary-spiral', 1236, 1086);
  b.place('topiary-spiral', 1836, 1086);
  b.place('urn-1', 1300, 1170);
  b.place('urn-2', 1772, 1170);

  // The south edge of the garden, and the long edges, in clipped hedge with the odd urn. The south
  // hedge has a gate for the avenue; the east hedge has a gap for the east path.
  hedgeRow(110, 1296, 2188);
  hedgeRow(1776, 2962, 2188);
  hedgeCol(100, 1150, 1636);
  hedgeCol(100, 1948, 3900);
  hedgeCol(2974, 1150, 1640);
  hedgeCol(2974, 1944, 2200);
  for (const x of [330, 1000, 2380, 2800]) b.place(pick(['urn-1', 'urn-2']), x, 2176);
  for (const x of [1344, 1728]) {
    b.place('gate-pillar', x, 2188);
    b.block({ kind: 'circle', x, y: 2188, r: 28 });
  }
  for (const y of [1672, 1912]) {
    b.place('gate-pillar', 2974, y);
    b.block({ kind: 'circle', x: 2974, y, r: 28 });
  }
  // The edges of the lawn and the east meadow.
  hedgeRow(110, 4992, 3918);
  // The east hedge has a gate of its own, across from the forest gate, for the river.
  hedgeCol(4992, 1150, 1636);
  hedgeCol(4992, 1948, 3900);
  hedgeRow(3000, 4980, 1138);

  // The forest gate: two pillars on the west edge.
  b.place('gate-pillar', 124, 1672);
  b.place('gate-pillar', 124, 1912);
  b.block({ kind: 'circle', x: 124, y: 1672, r: 28 });
  b.block({ kind: 'circle', x: 124, y: 1912, r: 28 });

  // The river gate: two pillars on the east edge, across the garden from the forest gate.
  b.place('gate-pillar', 4996, 1672);
  b.place('gate-pillar', 4996, 1912);
  b.block({ kind: 'circle', x: 4996, y: 1672, r: 28 });
  b.block({ kind: 'circle', x: 4996, y: 1912, r: 28 });

  // Props the game draws from their saved state
  const prop = (sprite: string, x: number, y: number): void => {
    sc.add(x, y, (footprints[sprite] ?? 28) + 30);
    b.footprint(sprite, x, y);
  };

  // Flower beds and the gardener's anchors. Beds are tended in id order.
  const beds: { n: number; shape: 'long' | 'square' | 'round'; at: Pt }[] = [
    { n: 1, shape: 'long', at: pt(640, 1560) },
    { n: 2, shape: 'square', at: pt(960, 1560) },
    { n: 3, shape: 'round', at: pt(800, 1664) },
    { n: 4, shape: 'long', at: pt(1800, 1440) },
    { n: 5, shape: 'square', at: pt(1990, 1425) },
    { n: 6, shape: 'long', at: pt(3350, 1560) },
    { n: 7, shape: 'square', at: pt(3700, 1560) },
    { n: 8, shape: 'round', at: pt(4050, 1560) },
    { n: 9, shape: 'long', at: pt(3500, 2080) },
    { n: 10, shape: 'square', at: pt(3900, 2080) },
    { n: 11, shape: 'round', at: pt(4300, 2080) },
  ];
  const bedW = { long: 210, square: 150, round: 150 } as const;
  for (const bed of beds) {
    const { x, y } = bed.at;
    sc.add(x, y, bedW[bed.shape] / 2 + 40);
    b.block({ kind: 'rect', x: x - bedW[bed.shape] / 2 + 10, y: y - 40, w: bedW[bed.shape] - 20, h: 40 });
    b.interactable({
      name: `bed-${bed.n}`,
      definitionId: 'flowerbed',
      look: bed.shape,
      pos: bed.at,
      hit: hit(x, y, bedW[bed.shape] + 20, 110, 90),
      approach: [E(x, y + 54, 'north')],
    });
    // The gardener works from behind the bed, facing the camera, so her face and what is in her
    // hands can be seen.
    b.anchor({
      name: `garden-bed-${bed.n}`,
      tags: ['garden-bed'],
      pos: pt(x, y - 20),
      approach: [E(x, y - 74, 'south')],
    });
  }

  // Lanterns for Wildstar's light, braziers for Cinder's flame, and playthings for the weather and
  // ice magic.
  const lantern = (n: number, x: number, y: number): void => {
    prop('lantern-off', x, y);
    b.interactable({
      name: `lantern-${n}`,
      definitionId: 'lantern',
      pos: pt(x, y),
      hit: hit(x, y, 80, 190, 170),
      approach: [E(x, y + 60, 'north')],
    });
  };
  [
    [1330, 1196],
    [1742, 1196],
    [1230, 1486],
    [1842, 1486],
    [330, 1330],
    [710, 1330],
    [2362, 1296],
    [2750, 1296],
    [430, 1660],
    [430, 1930],
    [1010, 1770],
    [1930, 1840],
  ].forEach(([x, y], i) => {
    lantern(i + 1, x!, y!);
  });
  [
    [1300, 2420],
    [1772, 2420],
    [1300, 3060],
    [1772, 3060],
    [3200, 1690],
    [3200, 1950],
    [3850, 1690],
    [3700, 1950],
    [4450, 1690],
    [4450, 1950],
    [2400, 2790],
    [3180, 2800],
    [3300, 3050],
    [3950, 3050],
  ].forEach(([x, y], i) => {
    lantern(i + 13, x!, y!);
  });
  for (const [n, x, y] of [
    [1, 1306, 1040],
    [2, 1766, 1040],
    [3, 4560, 1660],
    [4, 4560, 1930],
  ] as const) {
    prop('brazier-unlit', x, y);
    b.interactable({
      name: `brazier-${n}`,
      definitionId: 'brazier',
      pos: pt(x, y),
      hit: hit(x, y, 110, 170, 150),
      approach: [E(x, y + 66, 'north')],
    });
  }
  prop('pinwheel-still', 1790, 1900);
  b.interactable({
    name: 'pinwheel-1',
    definitionId: 'pinwheel',
    pos: pt(1790, 1900),
    hit: hit(1790, 1900, 110, 210, 190),
    approach: [E(1790, 1960, 'north')],
  });
  prop('pinwheel-still', 3560, 2240);
  b.interactable({
    name: 'pinwheel-2',
    definitionId: 'pinwheel',
    pos: pt(3560, 2240),
    hit: hit(3560, 2240, 110, 210, 190),
    approach: [E(3560, 2300, 'north')],
  });
  prop('ornament-calm', 4400, 1330);
  b.interactable({
    name: 'ornament-2',
    definitionId: 'weather-ornament',
    pos: pt(4400, 1330),
    hit: hit(4400, 1330, 120, 210, 190),
    approach: [E(4400, 1392, 'north')],
  });
  prop('ice-display-idle', 4700, 1792);
  b.interactable({
    name: 'ice-2',
    definitionId: 'ice-display',
    pos: pt(4700, 1792),
    hit: hit(4700, 1792, 150, 210, 190),
    approach: [E(4700, 1876, 'north')],
  });
  prop('ornament-calm', 1290, 1900);
  b.interactable({
    name: 'ornament-1',
    definitionId: 'weather-ornament',
    pos: pt(1290, 1900),
    hit: hit(1290, 1900, 120, 210, 190),
    approach: [E(1290, 1962, 'north')],
  });
  prop('ice-display-idle', PLAZA.x, PLAZA.y);
  b.interactable({
    name: 'ice-1',
    definitionId: 'ice-display',
    pos: PLAZA,
    hit: hit(PLAZA.x, PLAZA.y, 150, 210, 190),
    approach: [E(PLAZA.x, PLAZA.y + 84, 'north')],
  });

  // Four stations stand along the north edge of the garden road, in front of the palace: the piano,
  // the memory table, the abacus and the computer. The outer two are mirror images about the
  // palace's axis, and so are the inner two. Beds 4 and 5 and lantern 7 stand clear so the plaza
  // stays open, and the herd walks round their bodies.
  const STATIONS_Y = 1262;
  const station = (name: string, definitionId: string, x: number): void => {
    sc.add(x, STATIONS_Y + 36, 170);
    b.block({ kind: 'rect', x: x - 106, y: STATIONS_Y - 14, w: 212, h: 50 });
    b.interactable({
      name,
      definitionId,
      pos: pt(x, STATIONS_Y),
      hit: hit(x, STATIONS_Y, 236, 232, 192),
      approach: [E(x, STATIONS_Y + 76, 'north')],
    });
  };
  const [PIANO_X, MEMORY_X] = [925, 1196];
  station('piano-1', 'piano', PIANO_X);
  station('memory-table-1', 'memory-table', MEMORY_X);
  station('abacus-1', 'abacus', 2 * K.x - MEMORY_X);
  station('computer-1', 'computer', 2 * K.x - PIANO_X);

  // The fountain's spout, and two cups on their own stations.
  b.interactable({
    name: 'spout',
    definitionId: 'fountain-spout',
    pos: F,
    hit: hit(F.x, F.y, 220, 250, 210),
    approach: [E(F.x, F.y + 130, 'north')],
  });
  const cup = (n: number, x: number, y: number, standX: number, facing: 'east' | 'west'): void => {
    prop('cup-full', x, y);
    b.anchor({ name: `drink-cup-${n}`, tags: ['drink'], pos: pt(x, y), approach: [E(standX, y, facing)] });
    b.interactable({
      name: `cup-${n}`,
      definitionId: 'cup',
      pos: pt(x, y),
      hit: hit(x, y, 96, 120, 100),
      approach: [E(standX, y, facing)],
      anchor: `drink-cup-${n}`,
    });
  };
  cup(1, F.x - 150, F.y + 130, F.x - 150 - 66, 'east');
  cup(2, F.x + 150, F.y + 130, F.x + 150 + 66, 'west');

  // The rainbow is drawn in pieces, one prop for each, all at the middle of the line between the
  // horns where the art of each is anchored. Besides them are the places her light is found from:
  // one at the foot of each statue and one in front of the basin, which together reach every spot
  // of the court in front of the fountain. Nothing draws the pads, and a tap goes through them and
  // through the pieces to the ground.
  const holder = (
    name: string,
    definitionId: string,
    at: Pt,
    standAt: Pt,
    facing: 'north' | 'south',
    look?: string,
  ): void =>
    b.interactable({
      name,
      definitionId,
      ...(look ? { look } : {}),
      pos: at,
      hit: hit(at.x, at.y, 64, 64, 32),
      approach: [E(standAt.x, standAt.y, facing)],
    });
  for (const piece of ARCH_PIECES)
    holder(
      `rainbow-${pieceId(piece)}`,
      'fountain-rainbow',
      RAINBOW,
      pt(RAINBOW.x, RAINBOW.y - 40),
      'south',
      pieceId(piece),
    );
  holder('pad-east', 'fountain-pad', pt(statueEast.x, F.y + 80), pt(statueEast.x, F.y + 140), 'north');
  holder('pad-west', 'fountain-pad', pt(statueWest.x, F.y + 80), pt(statueWest.x, F.y + 140), 'north');
  holder('pad-front', 'fountain-pad', pt(F.x, F.y + 100), pt(F.x, F.y + 130), 'north');

  // Doors
  b.interactable({
    name: 'palace-door',
    definitionId: 'palace-door',
    pos: pt(K.x, K.y + 36),
    hit: { x: K.x - 84, y: K.y - 150, w: 168, h: 190 },
    approach: [E(K.x, K.y + 92, 'north')],
  });
  b.interactable({
    name: 'treasure-door',
    definitionId: 'door',
    look: 'treasure-out',
    pos: TH,
    hit: { x: TH.x - 64, y: TH.y - 130, w: 128, h: 160 },
    approach: [E(TH.x, TH.y + 38, 'north')],
  });
  b.interactable({
    name: 'stable-door',
    definitionId: 'door',
    look: 'stable-out',
    pos: ST,
    hit: { x: ST.x - 70, y: ST.y - 112, w: 140, h: 140 },
    approach: [E(ST.x, ST.y + 38, 'north')],
  });
  b.portal({
    name: 'palace-gate',
    bounds: { x: K.x - 40, y: K.y + 64, w: 80, h: 22 },
    approach: pt(K.x, K.y + 92),
    toMap: 'palace-hall',
    toSpawn: 'from-garden',
    door: 'palace-door',
  });
  b.portal({
    name: 'treasure-gate',
    bounds: { x: TH.x - 32, y: TH.y + 16, w: 64, h: 44 },
    approach: pt(TH.x, TH.y + 38),
    toMap: 'treasure-house',
    toSpawn: 'from-garden',
    door: 'treasure-door',
  });
  b.portal({
    name: 'stable-gate',
    bounds: { x: ST.x - 32, y: ST.y + 16, w: 64, h: 44 },
    approach: pt(ST.x, ST.y + 38),
    toMap: 'stable',
    toSpawn: 'from-garden',
    door: 'stable-door',
  });
  b.portal({
    name: 'river-gate',
    bounds: { x: 4930, y: 1717, w: 150, h: 150 },
    approach: pt(4950, 1792),
    toMap: 'river',
    toSpawn: 'from-garden',
  });
  b.portal({
    name: 'forest-gate',
    bounds: { x: 40, y: 1717, w: 150, h: 150 },
    approach: pt(170, 1792),
    toMap: 'forest',
    toSpawn: 'from-garden',
  });

  // Where the herd arrives. A spawn is the way the herd came in: Wildstar at its start, the friends
  // along it a gap apart in the order they were found. `tools/maps/herd-line.ts` suggests lines,
  // and the compile step checks that each one holds every herd.
  b.spawn('from-forest', 'east', [pt(600, 1746), pt(280, 1746), pt(280, 2100)]);
  b.spawn('from-river', 'west', [pt(4840, 1792), pt(4585, 1537), pt(4807, 1315)]);
  // A row east of her would end on the computer, so the herd stands in an L along the west side of
  // the road.
  b.spawn('from-palace', 'south', [pt(K.x, K.y + 310), pt(K.x - 160, K.y + 310), pt(K.x - 160, K.y + 824)]);
  b.spawn('from-treasure-house', 'south', [
    pt(TH.x - 20, TH.y + 158),
    pt(TH.x + 287, TH.y + 158),
    pt(TH.x + 594, TH.y + 158),
  ]);
  b.spawn('from-playground', 'north', [
    pt(RAINBOW_GATE.x, RAINBOW_GATE.y + 130),
    pt(RAINBOW_GATE.x, RAINBOW_GATE.y + 430),
    pt(RAINBOW_GATE.x, RAINBOW_GATE.y + 730),
  ]);
  b.spawn('from-stable', 'south', [pt(ST.x, ST.y + 130), pt(ST.x + 320, ST.y + 130), pt(ST.x + 320, ST.y + 484)]);

  b.npc('gardener', pt(800, 1592), 'north');

  // Grazing
  const graze = (name: string, x: number, y: number, facing: 'east' | 'west'): void => {
    const dx = facing === 'east' ? 1 : -1;
    sc.add(x + dx * 40, y, 70);
    b.anchor({ name, tags: ['graze'], pos: pt(x + dx * 64, y), approach: [E(x, y, facing)] });
    b.place(`g-tuft-${1 + (Math.round(x * 7 + y * 3) % 3)}`, x + dx * 66, y + 2);
  };
  graze('graze-1', 520, 1900, 'east');
  graze('graze-2', 760, 2010, 'west');
  graze('graze-3', 330, 1560, 'east');
  graze('graze-4', 1480, 2030, 'east');
  graze('graze-5', 1900, 2020, 'west');
  graze('graze-6', 2400, 1900, 'east');
  graze('graze-7', 2760, 1960, 'west');
  graze('graze-8', 2700, 1880, 'west');
  graze('graze-9', 600, 2420, 'east');
  graze('graze-10', 2320, 2420, 'east');
  graze('graze-11', 700, 2740, 'east');
  graze('graze-12', 3150, 2420, 'east');
  graze('graze-13', 4000, 2350, 'west');
  graze('graze-14', 4600, 2250, 'west');
  graze('graze-15', 3500, 1330, 'east');
  graze('graze-16', 4100, 1360, 'west');
  graze('graze-17', 4800, 1500, 'west');
  graze('graze-18', 1300, 3700, 'east');
  graze('graze-19', 2500, 3700, 'west');
  graze('graze-20', 3600, 3640, 'east');
  graze('graze-21', 4500, 3560, 'west');
  graze('graze-22', 700, 3600, 'east');
  graze('graze-23', 4480, 2760, 'west');

  // The farm. A fenced yard south of the hedge, with the avenue running down its middle to a round
  // plaza and a scarecrow. Beds stand either side in two columns, with a wide corridor between the
  // rows for the gates east and west.
  const FARM = { x0: 860, x1: 2212, y0: 2336, y1: 3380 };
  const inFarm = (x: number, y: number): boolean =>
    x > FARM.x0 - 40 && x < FARM.x1 + 40 && y > FARM.y0 - 40 && y < FARM.y1 + 40;
  const fenceX = (x0: number, x1: number, y: number): void => {
    const n = Math.ceil((x1 - x0) / 192),
      step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) b.place('g-fence-x', x0 + step * (i + 0.5), y);
    b.block({ kind: 'rect', x: x0, y: y - 8, w: x1 - x0, h: 12 });
  };
  // A vertical run is drawn a fence at a time, and each piece spans 87 units of ground on a camera
  // tilted 27 degrees.
  const fenceY = (x: number, y0: number, y1: number): void => {
    const n = Math.ceil((y1 - y0) / 87),
      step = (y1 - y0) / n;
    for (let i = 0; i < n; i++) b.place('g-fence-y', x, y0 + step * (i + 0.5));
    b.block({ kind: 'rect', x: x - 7, y: y0, w: 14, h: y1 - y0 });
  };
  fenceX(FARM.x0, 1376 - 6, FARM.y0);
  fenceX(1696 + 6, FARM.x1, FARM.y0);
  fenceX(FARM.x0, FARM.x1, FARM.y1);
  for (const x of [FARM.x0, FARM.x1]) {
    fenceY(x, FARM.y0, 2814);
    fenceY(x, 3010, FARM.y1);
    for (const y of [2828, 2996]) {
      b.place('gate-pillar', x, y);
      b.block({ kind: 'circle', x, y, r: 28 });
    }
  }
  for (const x of [1376 - 6, 1696 + 6]) {
    b.place('gate-pillar', x, FARM.y0 + 4);
    b.block({ kind: 'circle', x, y: FARM.y0 + 4, r: 28 });
  }
  sc.add(1536, 3150, 360);
  sc.add(1536, 2780, 220);

  const crops = ['carrot', 'tomato', 'strawberry', 'pumpkin', 'cabbage', 'berry'] as const;
  type Crop = (typeof crops)[number];
  const farmBeds: { crop: Crop; at: Pt }[] = [
    { crop: 'carrot', at: pt(1100, 2520) },
    { crop: 'tomato', at: pt(1100, 2670) },
    { crop: 'strawberry', at: pt(1100, 3000) },
    { crop: 'pumpkin', at: pt(1100, 3150) },
    { crop: 'cabbage', at: pt(1972, 2520) },
    { crop: 'berry', at: pt(1972, 2670) },
    { crop: 'carrot', at: pt(1972, 3000) },
    { crop: 'strawberry', at: pt(1972, 3150) },
  ];
  farmBeds.forEach(({ crop, at }, i) => {
    const { x, y } = at;
    sc.add(x, y, 110);
    b.block({ kind: 'rect', x: x - 86, y: y - 44, w: 172, h: 44 });
    b.interactable({
      name: `crop-${i + 1}`,
      definitionId: `${crop}-bed`,
      pos: at,
      hit: hit(x, y, 216, 130, 100),
      approach: [E(x, y + 58, 'north')],
    });
  });
  b.solid('g-scarecrow', 1536, 3170);
  for (const [kind, x, y] of [
    ['apples', 1236, 3262],
    ['carrots', 1326, 3296],
    ['berries', 1746, 3296],
    ['pumpkins', 1836, 3262],
  ] as const)
    b.solid(`g-crate-${kind}`, x, y);

  // The orchard. Four rows of fruit trees either side of the lane, a column every 300 units. A tap
  // shakes the tree; the fruit lands at its foot.
  const ORCHARD_ROWS = [2540, 2740, 3180, 3400];
  let orchardTree = 0;
  ORCHARD_ROWS.forEach((y, row) => {
    for (let col = 0; col < 6; col++) {
      const x = 2580 + col * 300 + (row % 2 ? 150 : 0);
      const kind = (col + row) % 2 === 0 ? 'apple' : 'berry';
      const n = ++orchardTree;
      const sprite = `g-tree-${kind}-1`;
      prop(sprite, x, y);
      b.interactable({
        name: `orchard-${n}`,
        definitionId: `${kind}-tree`,
        pos: pt(x, y),
        hit: hit(x, y, 230, 300, 260),
        approach: [E(x, y + 66, 'north')],
      });
    }
  });

  // The pond
  const deco = (id: string, x: number, y: number, layer: 'ground-detail' | 'object-bases' = 'object-bases'): void =>
    b.place(id, x, y, layer);
  for (const [x, y, id] of [
    [300, 3010, 'g-reeds-1'],
    [640, 3020, 'g-reeds-2'],
    [250, 3340, 'g-reeds-2'],
    [720, 3330, 'g-reeds-1'],
    [480, 3366, 'g-reeds-1'],
    [180, 3170, 'g-reeds-2'],
  ] as const)
    deco(id, x, y);
  for (const [x, y, id] of [
    [400, 3160, 'g-lily-2'],
    [520, 3230, 'g-lily-1'],
    [600, 3150, 'g-lily-1'],
    [340, 3250, 'g-lily-2'],
    [470, 3120, 'g-lily-1'],
  ] as const)
    deco(id, x, y, 'ground-detail');
  for (const [x, y, id] of [
    [170, 3050, 'g-tree-willow-emerald-1'],
    [700, 3420, 'g-tree-willow-emerald-1'],
  ] as const) {
    sc.add(x, y, (footprints[id] ?? 24) + 30);
    b.solid(id, x, y);
  }
  for (const [x, y, id] of [
    [250, 3300, 'g-rock-moss-1'],
    [700, 3280, 'g-rock-moss-2'],
    [190, 3110, 'g-rock-grey-1'],
  ] as const) {
    sc.add(x, y, (footprints[id] ?? 28) + 20);
    b.solid(id, x, y);
  }
  sc.add(POND.x, POND.y, 340);
  b.place('bench', 400, 3000);
  b.block({ kind: 'rect', x: 330, y: 2976, w: 140, h: 26 });
  // Drinking: stand on the bank facing the water, close enough for the muzzle to reach it.
  const shore = (side: 1 | -1, gap: number): Pt => {
    let x = POND.x;
    while (b.waterAt(x, POND.y) > 0.2 && Math.abs(x - POND.x) < 900) x += side * 8;
    return pt(x + side * gap, POND.y);
  };
  const east = shore(1, 46);
  b.anchor({
    name: 'drink-pond-east',
    tags: ['drink'],
    pos: pt(east.x - 60, east.y),
    approach: [E(east.x, east.y, 'west')],
  });
  // The north bank, either side of the bench.
  for (const [name, dx] of [
    ['drink-pond-north-east', 150],
    ['drink-pond-north-west', -170],
  ] as const) {
    const x = POND.x + dx;
    let y = POND.y;
    while (b.waterAt(x, y) > 0.2 && Math.abs(y - POND.y) < 900) y -= 8;
    b.anchor({ name, tags: ['drink'], pos: pt(x, y - 106), approach: [E(x, y - 46, 'south')] });
  }

  // The east plaza, benches and toys
  for (const x of [3400, 4150]) {
    b.place('bench', x, 1690);
    b.block({ kind: 'rect', x: x - 70, y: 1666, w: 140, h: 26 });
    sc.add(x, 1690, 100);
  }
  for (const y of [1700, 1890]) {
    b.place(pick(['urn-1', 'urn-2']), 4860, y);
    b.block({ kind: 'circle', x: 4860, y, r: 26 });
  }
  sc.add(4700, 1792, 260);

  // The rainbow gate south of the plaza leads to the playground. The herd walks south between its
  // pillars; from the playground it comes back out the same way, facing north.
  b.place('g-playground-arch', RAINBOW_GATE.x, RAINBOW_GATE.y, 'object-bases', 0);
  for (const sx of [-1, 1]) b.block({ kind: 'circle', x: RAINBOW_GATE.x + sx * 90, y: RAINBOW_GATE.y, r: 22 });
  sc.add(RAINBOW_GATE.x, RAINBOW_GATE.y, 230);
  for (const dy of [130, 430, 730]) sc.add(RAINBOW_GATE.x, RAINBOW_GATE.y + dy, 100);
  b.portal({
    name: 'playground-gate',
    bounds: { x: RAINBOW_GATE.x - 70, y: RAINBOW_GATE.y + 16, w: 140, h: 44 },
    approach: pt(RAINBOW_GATE.x, RAINBOW_GATE.y - 56),
    toMap: 'playground',
    toSpawn: 'from-garden',
  });

  // The wood behind and around
  const TREES = [
    'g-tree-blossom-1',
    'g-tree-blossom-2',
    'g-tree-oak-lavender-1',
    'g-tree-oak-lavender-2',
    'g-tree-oak-lime-1',
    'g-tree-oak-lime-2',
    'g-tree-oak-emerald-1',
    'g-tree-birch-lime-1',
  ] as const;
  const behindPalace = (x: number, y: number): boolean => x > 740 && x < 2330 && y > 560 && y < 1010;
  // Trees stand where the herd cannot: the lawns beside and behind the palace, and the margins of
  // the map.
  let trees = 0;
  for (let attempt = 0; attempt < 30000 && trees < 340; attempt++) {
    const x = -40 + rnd() * (W + 80),
      y = 700 + rnd() * (H - 700 + 60);
    if (behindPalace(x, y)) continue;
    if (b.openness(x, y) > -90) continue;
    // Keep the lower edge free of tall trees: they would hide the herd at the south hedge.
    if (y > 3960 && x > 160 && x < 4960) continue;
    const id = pick(TREES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 24) * 1.6 + 14)) continue;
    b.place(id, x, y);
    trees++;
  }

  // Ground life
  const FLOWERS = ['pink', 'sky', 'yellow', 'white', 'lilac', 'coral'].flatMap((c) => [
    `g-flowers-${c}-1`,
    `g-flowers-${c}-2`,
  ]);
  const clear = (x: number, y: number, m = 40): boolean =>
    b.openness(x, y) > m && b.waterAt(x, y) === 0 && !inFarm(x, y);
  const nearPath = (x: number, y: number): boolean => b.onPath(x, y, 48);
  // Drifts of flowers on the lawns.
  for (let i = 0; i < 260; i++) {
    const cx = 140 + rnd() * (W - 280),
      cy = 1160 + rnd() * (H - 1160 - 260);
    if (!clear(cx, cy, 60) || nearPath(cx, cy)) continue;
    const bloom = pick(FLOWERS),
      bloom2 = pick(FLOWERS);
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 170,
        y = cy + (rnd() - 0.5) * 90;
      if (!clear(x, y, 40) || nearPath(x, y) || !sc.tryAdd(x, y, 28)) continue;
      b.place(rnd() < 0.6 ? bloom : bloom2, x, y);
    }
  }
  for (let i = 0; i < 150; i++) {
    const x = 140 + rnd() * (W - 280),
      y = 1160 + rnd() * (H - 1160 - 260);
    if (!clear(x, y, 50) || nearPath(x, y) || !sc.tryAdd(x, y, 30)) continue;
    b.place(`g-windflower-${pick(['pink', 'lilac'])}-${pick([1, 2])}`, x, y);
  }
  const BUSHES = [
    'g-bush-lime-1',
    'g-bush-lime-2',
    'g-bush-emerald-1',
    'g-bush-emerald-2',
    'g-bush-pink-dots',
    'g-bush-rose-dots',
  ] as const;
  for (let i = 0, n = 0; i < 14000 && n < 110; i++) {
    const x = 150 + rnd() * (W - 300),
      y = 1170 + rnd() * (H - 1170 - 260);
    if (!clear(x, y, 70) || nearPath(x, y) || (x > 2480 && x < 4400 && y > 2300 && y < 3560)) continue; // the orchard's rows keep clear for walking
    const id = pick(BUSHES);
    if (!sc.tryAdd(x, y, (footprints[id] ?? 28) + 50)) continue;
    b.solid(id, x, y);
    n++;
  }
  for (let i = 0, n = 0; i < 30000 && n < 560; i++) {
    const x = rnd() * W,
      y = 1140 + rnd() * (H - 1140 - 200);
    if (!clear(x, y, 6) || b.onPath(x, y, 24)) continue;
    const tuft = rnd() < 0.8;
    if (!sc.tryAdd(x, y, tuft ? 34 : 30, 0.7)) continue;
    b.place(
      tuft ? `g-tuft-${pick([1, 2, 3])}` : `g-pebbles-${pick([1, 2])}`,
      x,
      y,
      tuft ? 'object-bases' : 'ground-detail',
    );
    n++;
  }

  // Who lives here. Each is a patch of the map in world units around a middle, and how many live in
  // it. The game puts them down at random inside it.
  const live = (
    name: string,
    kind: LifeKind,
    cx: number,
    cy: number,
    w: number,
    h: number,
    count: number,
    shape: 'rect' | 'ellipse' = 'rect',
  ): void => b.life({ name, kind, area: { x: cx - w / 2, y: cy - h / 2, w, h }, shape, count });

  // The palace lawns.
  live('bird-lawn-west', 'bird', 420, 2020, 420, 120, 2);
  live('bird-lawn-mid', 'bird', 1500, 2070, 500, 90, 2);
  live('bird-lawn-east', 'bird', 2500, 1990, 400, 120, 2);
  live('bunny-lawn-west', 'bunny', 330, 1620, 260, 120, 2);
  live('bunny-lawn-mid', 'bunny', 1000, 2070, 360, 90, 1);
  live('snail-lawn-west', 'snail', 800, 1780, 300, 100, 1);
  live('snail-yard', 'snail', 2300, 1950, 300, 100, 1);
  live('ladybug-lawn-west', 'ladybug', 600, 1720, 260, 80, 2);
  live('butterfly-lawn-west', 'butterfly', 560, 1900, 700, 360, 2);
  live('butterfly-yard', 'butterfly', 2400, 1700, 700, 300, 2);
  live('fairy-forecourt', 'fairy', 1536, 1180, 700, 200, 1);
  live('fairy-lawn', 'fairy', 1536, 1850, 800, 300, 1);
  live('bee-beds-west', 'bee', 800, 1560, 600, 220, 1);

  // The farm.
  live('bird-farm-north', 'bird', 1536, 2400, 200, 60, 1);
  live('bird-scarecrow', 'bird', 1536, 3290, 260, 70, 2);
  live('bunny-farm-west', 'bunny', 960, 2830, 200, 120, 1);
  live('bunny-farm-east', 'bunny', 2110, 2830, 200, 120, 1);
  live('snail-farm-west', 'snail', 1290, 2830, 130, 100, 1);
  live('ladybug-farm-east', 'ladybug', 1790, 2830, 130, 100, 2);
  live('bee-farm', 'bee', 1536, 2700, 1000, 500, 2);
  live('butterfly-farm', 'butterfly', 1536, 2900, 1100, 500, 2);
  live('fairy-farm', 'fairy', 1536, 3000, 800, 400, 1);

  // The orchard.
  live('bird-orchard-lane', 'bird', 2900, 2912, 500, 90, 2);
  live('bird-orchard-north', 'bird', 3700, 2640, 600, 80, 2);
  live('bird-orchard-south', 'bird', 3000, 3560, 600, 90, 2);
  live('bunny-orchard-lane', 'bunny', 3200, 2912, 300, 90, 2);
  live('bunny-orchard-south', 'bunny', 3500, 3060, 400, 70, 2);
  live('snail-orchard', 'snail', 2800, 3060, 300, 70, 1);
  live('ladybug-orchard', 'ladybug', 3300, 2640, 300, 70, 2);
  live('bee-orchard', 'bee', 3300, 2750, 1400, 500, 2);
  live('butterfly-orchard', 'butterfly', 3400, 3000, 1400, 500, 2);
  live('fairy-orchard', 'fairy', 3400, 2900, 1200, 500, 1);

  // The east meadow.
  live('bird-meadow-west', 'bird', 3600, 1400, 500, 180, 2);
  live('bird-meadow-south', 'bird', 4300, 2150, 500, 160, 2);
  live('bird-meadow-east', 'bird', 4400, 1400, 300, 140, 1);
  live('bunny-meadow-west', 'bunny', 3300, 2160, 400, 140, 2);
  live('bunny-meadow-north', 'bunny', 4100, 1380, 400, 140, 2);
  live('bunny-meadow-east', 'bunny', 4700, 2120, 300, 140, 1);
  live('snail-meadow-south', 'snail', 3800, 2180, 300, 100, 1);
  live('snail-meadow-north', 'snail', 4500, 1380, 300, 100, 1);
  live('ladybug-meadow-west', 'ladybug', 3500, 1400, 300, 100, 3);
  live('ladybug-meadow-south', 'ladybug', 4200, 2200, 300, 100, 2);
  live('butterfly-meadow-west', 'butterfly', 3600, 1700, 800, 500, 3);
  live('butterfly-meadow-east', 'butterfly', 4400, 1900, 900, 600, 3);
  live('bee-meadow', 'bee', 4000, 1800, 1200, 700, 2);
  live('fairy-meadow-west', 'fairy', 3600, 1800, 800, 500, 1);
  live('fairy-meadow-east', 'fairy', 4500, 1800, 800, 500, 1);

  // The pond: ducks on the top, fish underneath, frogs on the bank and dragonflies over it.
  live('duck-pond', 'duck', POND.x, POND.y, 300, 120, 3, 'ellipse');
  live('fish-pond', 'fish', POND.x, POND.y, 280, 110, 4, 'ellipse');
  live('frog-pond', 'frog', POND.x, POND.y + 190, 440, 70, 3);
  live('dragonfly-pond', 'dragonfly', POND.x, POND.y, 560, 340, 2);
  live('bird-pond-west', 'bird', 480, 3500, 400, 100, 2);
  live('bunny-pond', 'bunny', 560, 3560, 400, 100, 2);
  live('fairy-pond', 'fairy', POND.x, POND.y, 600, 380, 1);
  live('butterfly-pond', 'butterfly', 540, 3250, 700, 500, 2);

  // The south lawn.
  live('bird-south-west', 'bird', 1100, 3700, 500, 100, 2);
  live('bird-south-east', 'bird', 2400, 3640, 500, 100, 2);
  live('bunny-south-mid', 'bunny', 1700, 3700, 600, 120, 2);
  live('bunny-south-east', 'bunny', 3000, 3700, 500, 120, 2);
  live('snail-south', 'snail', 800, 3700, 300, 100, 1);
  live('ladybug-south', 'ladybug', 2000, 3620, 300, 100, 2);
  live('butterfly-south-west', 'butterfly', 1400, 3640, 1200, 400, 2);
  live('butterfly-south-east', 'butterfly', 3600, 3600, 1200, 400, 2);
  live('fairy-south', 'fairy', 2400, 3640, 1000, 400, 1);

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset('garden');
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync('assets/maps/palace-garden.tmj', JSON.stringify(out.tmj));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = authorPalaceGarden();
  console.log(
    `palace-garden: ${r.stats.decor} decor, ${r.stats.obstacles} obstacles (${r.stats.maskRects} from the mask)`,
  );
}
