import { mkdirSync, writeFileSync } from 'node:fs';
import { PROP_DEFS } from '../../../src/content/props';
import type { MapId } from '../../../src/shared/ids';
import { HALL } from '../../art/world/hall';
import type { BiomeId } from '../../art/world/terrain';
import { CHANDELIER_HANG } from '../../art/world/throne-room';
import { RECIPES } from '../../assets/env/registry';
import { buildTilesetAsset } from '../../assets/env/tilesets';
import { MapBuilder } from './builder';
import { stand as E, hitBox as hit, pt, type Region, rect } from './geom';
import { doorway } from './palace-doors';

/**
 * The rooms of the palace beyond the throne room. Every room is the hall's architecture in another
 * colour: a back wall of pieces 512 units wide with a doorway at the middle of some of them, a
 * carpet from each doorway, and furniture from the throne room's own bundle. A room is a table row:
 * how wide it is, which doorways it has, and a function that furnishes it.
 */
type Wall = 'left' | 'right' | 'windows' | 'flowers';
type Prefix = 'pr' | 'ps' | 'pg';

interface Plan {
  id: MapId;
  prefix: Prefix;
  biome: BiomeId;
  tiles: number;
  /**
   * The doorways, by the wall piece they are in counting from the west, and the room each leads to.
   */
  doors: readonly (readonly [slot: number, to: MapId])[];
  /** What a piece without a doorway has on it, where it is not the usual panel. */
  walls?: Readonly<Record<number, Wall>>;
  /** Carpet beyond the lanes from the doors. */
  rugs?: readonly Region[];
  furnish: (room: Furnisher) => void;
}

const PIECE = 512;
const slotX = (slot: number): number => PIECE / 2 + slot * PIECE;
const lookOf = (def: string): readonly string[] => PROP_DEFS[def]!.looks!;
const FLOWERS = lookOf('flower-vase');
const DIAMONDS = lookOf('diamond-vase');

/**
 * Places things in a room the way the throne room places them: a footprint, a tap area, and a place
 * to stand.
 */
class Furnisher {
  private readonly counts = new Map<string, number>();

  constructor(readonly b: MapBuilder) {}

  private nameOf(kind: string): string {
    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    return `${kind}-${n}`;
  }

  private rectAt(x: number, y: number, halfW: number, halfH: number): void {
    this.b.block({ kind: 'rect', x: x - halfW, y: y - halfH, w: halfW * 2, h: halfH * 2 });
  }

  vase(kind: 'flower' | 'diamond', look: string, x: number, y: number): void {
    const looks = kind === 'flower' ? FLOWERS : DIAMONDS;
    if (!looks.includes(look)) throw new Error(`${this.b.opts.id}: no ${kind} vase looks ${look}`);
    this.b.block({ kind: 'circle', x, y, r: 17 });
    this.b.interactable({
      name: this.nameOf(`${kind}-vase`),
      definitionId: `${kind}-vase`,
      look,
      pos: pt(x, y),
      hit: hit(x, y, 80, 170, 160),
      approach: [E(x, y + 52, 'north')],
    });
  }

  /** A row of vases at one height, taking their looks in turn. */
  vases(kind: 'flower' | 'diamond', y: number, ...xs: readonly number[]): void {
    const looks = kind === 'flower' ? FLOWERS : DIAMONDS;
    xs.forEach((x, i) => {
      this.vase(kind, looks[(i + y) % looks.length]!, x, y);
    });
  }

  chandelier(x: number, floor: number): void {
    const hang = pt(x, floor - CHANDELIER_HANG);
    this.b.place('ph-chandelier-shadow', x, floor, 'ground-detail', 0);
    this.b.interactable({
      name: this.nameOf('chandelier'),
      definitionId: 'chandelier',
      pos: hang,
      hit: { x: x - 96, y: hang.y - 150, w: 192, h: 170 },
      approach: [E(x, floor + 30, 'north')],
    });
  }

  lamp(x: number): void {
    this.b.solid('ph-lamp', x, HALL.wallY + 74);
  }

  urn(glaze: 'teal' | 'rose', x: number, y: number): void {
    this.b.solid(`ph-urn-${glaze}`, x, y);
  }

  /** A banquet table with a chair at each end. */
  table(x: number, y: number): void {
    this.rectAt(x, y, 152, 22);
    for (const sx of [-1, 1]) this.b.block({ kind: 'circle', x: x + sx * 184, y, r: 16 });
    this.b.interactable({
      name: this.nameOf('table'),
      definitionId: 'banquet-table',
      pos: pt(x, y),
      hit: hit(x, y, 340, 120, 96),
      approach: [E(x, y + 70, 'north')],
    });
  }

  harp(x: number, y: number): void {
    this.b.block({ kind: 'circle', x, y, r: 36 });
    this.b.interactable({
      name: this.nameOf('harp'),
      definitionId: 'harp',
      pos: pt(x, y),
      hit: hit(x, y, 130, 250, 235),
      approach: [E(x, y + 62, 'north')],
    });
  }

  bookcase(x: number, y = 380): void {
    this.rectAt(x, y, 82, 14);
    this.b.interactable({
      name: this.nameOf('bookcase'),
      definitionId: 'bookcase',
      pos: pt(x, y),
      hit: hit(x, y, 170, 225, 215),
      approach: [E(x, y + 56, 'north')],
    });
  }

  /**
   * Wildstar's bed. She stands in front of it, a little further than it is deep, and the game lays
   * her down in it facing east, her head on the pillow.
   */
  napBed(x: number, y: number): void {
    this.rectAt(x, y, 90, 24);
    this.b.interactable({
      name: this.nameOf('nap-bed'),
      definitionId: 'nap-bed',
      pos: pt(x, y),
      hit: { x: x - 100, y: y - 120, w: 200, h: 150 },
      approach: [E(x, y + 52, 'east')],
    });
  }

  fairies(x: number, y: number, w: number, h: number, count: number): void {
    this.b.life({ name: this.nameOf('fairy'), kind: 'fairy', area: { x, y, w, h }, shape: 'ellipse', count });
  }
}

const PLANS: readonly Plan[] = [
  {
    id: 'palace-dining',
    prefix: 'pg',
    biome: 'palace-sage',
    tiles: 40,
    doors: [
      [0, 'palace-tea'],
      [2, 'palace-flowers'],
      [4, 'palace-hall'],
    ],
    furnish: (r) => {
      r.table(760, 940);
      r.table(1800, 940);
      r.chandelier(760, 700);
      r.chandelier(1800, 700);
      r.vases('flower', 392, 672, 848, 1712, 1888);
      r.lamp(1102);
      r.lamp(1458);
      r.urn('teal', 130, 1040);
      r.urn('rose', 2430, 1040);
      r.fairies(300, 460, 900, 480, 2);
      r.fairies(1500, 460, 900, 480, 2);
    },
  },
  {
    id: 'palace-tea',
    prefix: 'pr',
    biome: 'palace-rose',
    tiles: 24,
    doors: [
      [0, 'palace-bedroom'],
      [2, 'palace-dining'],
    ],
    furnish: (r) => {
      r.table(768, 900);
      r.chandelier(768, 700);
      r.vases('flower', 392, 664, 872);
      r.vases('flower', 960, 470, 1066);
      r.lamp(434);
      r.lamp(1102);
      r.urn('teal', 130, 1040);
      r.urn('rose', 1406, 1040);
      r.fairies(300, 460, 900, 480, 2);
    },
  },
  {
    id: 'palace-bedroom',
    prefix: 'pr',
    biome: 'palace-rose',
    tiles: 24,
    doors: [[2, 'palace-tea']],
    walls: { 0: 'left' },
    rugs: [rect(448, 540, 1056, 900)],
    furnish: (r) => {
      r.napBed(700, 700);
      r.vases('flower', 392, 672, 864);
      r.lamp(434);
      r.lamp(1102);
      r.urn('teal', 130, 1040);
      r.urn('rose', 1406, 1040);
      r.chandelier(1060, 860);
      r.fairies(300, 460, 900, 480, 2);
    },
  },
  {
    id: 'palace-flowers',
    prefix: 'pg',
    biome: 'palace-sage',
    tiles: 24,
    doors: [[1, 'palace-dining']],
    rugs: [rect(352, 520, 1184, 1010)],
    furnish: (r) => {
      for (const [x, y] of [
        [330, 470],
        [1206, 470],
        [330, 720],
        [1206, 720],
        [330, 970],
        [1206, 970],
        [560, 1010],
        [976, 1010],
      ] as const)
        r.vase('flower', FLOWERS[(x + y) % FLOWERS.length]!, x, y);
      for (const [x, y] of [
        [520, 600],
        [1016, 600],
        [520, 840],
        [1016, 840],
      ] as const)
        r.vase('diamond', DIAMONDS[(x + y) % DIAMONDS.length]!, x, y);
      r.chandelier(768, 940);
      r.fairies(300, 440, 940, 560, 4);
    },
  },
  {
    id: 'palace-gallery',
    prefix: 'ps',
    biome: 'palace-sky',
    tiles: 40,
    doors: [
      [0, 'palace-hall'],
      [2, 'palace-library'],
      [4, 'palace-music'],
    ],
    furnish: (r) => {
      r.chandelier(768, 700);
      r.chandelier(1792, 700);
      r.chandelier(1280, 900);
      r.vases('diamond', 392, 672, 864, 1696, 1888);
      r.vases('flower', 960, 500, 800, 1760, 2060);
      r.lamp(1102);
      r.lamp(1458);
      r.urn('rose', 130, 1040);
      r.urn('teal', 2430, 1040);
      r.fairies(300, 460, 900, 480, 2);
      r.fairies(1500, 460, 900, 480, 2);
    },
  },
  {
    id: 'palace-library',
    prefix: 'ps',
    biome: 'palace-sky',
    tiles: 32,
    doors: [
      [0, 'palace-gallery'],
      [3, 'palace-jewel'],
    ],
    walls: { 1: 'left', 2: 'right' },
    furnish: (r) => {
      for (const x of [590, 760, 1190, 1360, 1530]) r.bookcase(x);
      r.table(1024, 940);
      r.chandelier(700, 700);
      r.chandelier(1400, 700);
      r.vases('flower', 392, 440, 960);
      r.lamp(1018);
      r.urn('teal', 130, 1040);
      r.urn('rose', 1918, 1040);
      r.fairies(300, 460, 1400, 480, 2);
    },
  },
  {
    id: 'palace-music',
    prefix: 'ps',
    biome: 'palace-sky',
    tiles: 32,
    doors: [
      [0, 'palace-gallery'],
      [3, 'palace-ballroom'],
    ],
    furnish: (r) => {
      r.harp(660, 470);
      r.harp(1390, 470);
      r.harp(1024, 900);
      r.chandelier(700, 740);
      r.chandelier(1400, 740);
      r.vases('flower', 392, 520, 1000);
      r.vases('diamond', 392, 1100);
      r.lamp(434);
      r.urn('rose', 130, 1040);
      r.urn('teal', 1918, 1040);
      r.fairies(300, 460, 1400, 480, 2);
    },
  },
  {
    id: 'palace-ballroom',
    prefix: 'pr',
    biome: 'palace-rose',
    tiles: 40,
    doors: [[0, 'palace-music']],
    walls: { 4: 'left' },
    rugs: [rect(448, 520, 2112, 1000)],
    furnish: (r) => {
      r.chandelier(800, 700);
      r.chandelier(1280, 700);
      r.chandelier(1760, 700);
      r.chandelier(1280, 940);
      r.harp(2250, 480);
      r.harp(2400, 480);
      r.vases('flower', 392, 672, 1100, 1460, 1888);
      r.vases('diamond', 1010, 360, 2200);
      r.lamp(434);
      r.urn('teal', 130, 1040);
      r.urn('rose', 2430, 1040);
      r.fairies(500, 460, 1500, 520, 3);
    },
  },
  {
    id: 'palace-jewel',
    prefix: 'ps',
    biome: 'palace-sky',
    tiles: 24,
    doors: [[0, 'palace-library']],
    walls: { 2: 'right' },
    rugs: [rect(448, 520, 1184, 960)],
    furnish: (r) => {
      for (const [x, y] of [
        [480, 580],
        [1056, 580],
        [480, 860],
        [1056, 860],
        [670, 960],
        [866, 960],
        [768, 600],
      ] as const)
        r.vase('diamond', DIAMONDS[(x + y) % DIAMONDS.length]!, x, y);
      r.vases('flower', 392, 620, 916);
      r.chandelier(640, 760);
      r.chandelier(900, 760);
      r.lamp(434);
      r.urn('teal', 1406, 1040);
    },
  },
];

function author(plan: Plan): {
  tmj: Record<string, unknown>;
  stats: { obstacles: number; decor: number; maskRects: number };
} {
  const sprites = new Set(RECIPES.filter((r) => r.bundle === 'palace-hall').map((r) => r.id));
  const footprints = Object.fromEntries(RECIPES.flatMap((r) => (r.footprint ? [[r.id, r.footprint.r] as const] : [])));
  const b = new MapBuilder({
    id: plan.id,
    widthTiles: plan.tiles,
    heightTiles: 18,
    tileset: plan.biome,
    bundle: 'palace-hall',
    music: 'quiet',
    ambience: 'treasure-room',
    footprints,
    sprites,
  });
  const W = b.width,
    H = b.height;
  const WY = HALL.wallY;
  const pieces = W / PIECE;
  const doors = new Map(plan.doors);
  const panel: Wall = plan.prefix === 'pg' ? 'flowers' : 'windows';

  // Space: the floor in front of the back wall, with a carpet from every doorway
  b.open(rect(104, WY - 4, W - 104, H - 52));
  const lanes = plan.doors.map(([slot]) => rect(slotX(slot) - 96, WY - 40, slotX(slot) + 96, 736));
  const across =
    plan.doors.length > 1
      ? [
          rect(
            slotX(Math.min(...plan.doors.map(([s]) => s))) - 96,
            544,
            slotX(Math.max(...plan.doors.map(([s]) => s))) + 96,
            736,
          ),
        ]
      : [];
  b.pathBand(...lanes, ...across, ...(plan.rugs ?? []));
  b.classify();

  // The architecture
  for (let slot = 0; slot < pieces; slot++) {
    const piece = doors.has(slot)
      ? slot === 0
        ? 'doorL'
        : slot === pieces - 1
          ? 'doorR'
          : 'door'
      : (plan.walls?.[slot] ?? panel);
    b.place(`${plan.prefix}-wall-${piece}`, slotX(slot), WY, 'object-bases', -20);
  }
  for (let joint = 1; joint < pieces; joint++) {
    const x = joint * PIECE;
    b.place(`${plan.prefix}-column`, x, HALL.columnY, 'object-bases', 0);
    b.block({ kind: 'circle', x, y: HALL.columnY, r: 18 });
  }
  b.place(`${plan.prefix}-side-west`, 0, 0, 'foreground', 0);
  b.place(`${plan.prefix}-side-east`, W, 0, 'foreground', 0);

  // The doors, and where the herd arrives through each
  for (const [slot, to] of plan.doors) doorway(b, slotX(slot), to);

  plan.furnish(new Furnisher(b));

  mkdirSync('assets/maps', { recursive: true });
  const built = buildTilesetAsset(plan.biome);
  const out = b.build(built.set, {
    width: built.asset.width,
    height: built.asset.height,
    columns: built.asset.columns,
  });
  writeFileSync(`assets/maps/${plan.id}.tmj`, JSON.stringify(out.tmj));
  return out;
}

/** Every room of the palace but the throne room, in the order the maps are listed. */
export const PALACE_ROOMS: readonly (readonly [MapId, () => ReturnType<typeof author>])[] = PLANS.map(
  (plan) => [plan.id, () => author(plan)] as const,
);
