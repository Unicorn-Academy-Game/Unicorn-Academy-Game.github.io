import type { SampleInfo } from '../core/render';
import { hash2 } from '../core/rng';
import { type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import {
  BANDS,
  BLUE,
  COAL,
  DARK_WOOD,
  FUR,
  FUR_LIGHT,
  GOLD,
  GREEN,
  grain,
  ICE,
  LOG,
  PINK,
  RED,
  r6,
  SNOW,
  STONE,
  TURQUOISE,
  WARM,
} from './grove';
import type { Ramp } from './palette';
import { blob, box, tube } from './prims';
import { SceneBuilder } from './scene';

/**
 * What stands in Santa's cabin: a stone hearth with a fire and stockings, a velvet armchair, the
 * elves' toy bench and shelf, a table of cookies for Santa and his sack of presents. Built in round
 * numbers and drawn with the same camera and light as the rest of the grove. Scene y grows away from
 * the viewer, so the front of each piece is at negative y.
 */

/** A part in one colour: its own mesh, so overlapping parts get a line between them. */
const part = (b: SceneBuilder, name: string, ramp: Ramp, bias?: ReturnType<typeof grain>, noLines = false) =>
  b.mesh(b.solid(name, b.variant(name, ramp, { bands: BANDS }), bias), { noLines });

/** A part that gives off light, which the sun and the shade do not change. */
const lit = (b: SceneBuilder, name: string, ramp: Ramp, emissive: number) =>
  b.mesh(b.solid(name, b.variant(name, ramp, { emissive, protect: true, noLines: true, noOutline: true })), {
    noLines: true,
  });

const HEARTH_STONE = r6('#a8907f', 22, 60, [-0.3, -0.2, -0.1, 0, 0.08, 0.15]);

/**
 * Courses of stone with a mortar line between them, each course shifted half a stone from the one
 * below and every stone a little lighter or darker than its neighbours. Tops stay clean.
 */
const masonry =
  (seed: number) =>
  (s: SampleInfo): number => {
    const course = Math.floor(s.rest[2] / 13);
    const along = (s.rest[0] + s.rest[1] + (course % 2) * 17) / 34;
    const stone = Math.floor(along);
    const tone = (hash2(stone, course, seed) - 0.5) * 0.16;
    if (Math.abs(s.n[2]) > 0.7) return tone;
    const mortar = s.rest[2] / 13 - course < 0.13 || along - stone < 0.07;
    return mortar ? -0.3 : tone;
  };

const FLAME = r6('#ff7a1c', 8, 55, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]);
const EMBER = r6('#ff4a1c', 5, 40, [-0.12, -0.06, 0, 0.05, 0.09, 0.13]);
const CREAM = r6('#f6ecd6', 30, 80, [-0.26, -0.17, -0.09, -0.03, 0.02, 0.05]);
const COOKIE = r6('#c98a4a', 18, 60, [-0.3, -0.2, -0.1, 0, 0.07, 0.13]);

/** The hearth's front, its mantel and what hangs on it. `frame` draws the flames alone instead. */
export function hearth(o: { frame?: number } = {}): SceneBuilder {
  const b = new SceneBuilder();
  if (o.frame !== undefined) {
    const f = o.frame;
    const outer = lit(b, 'flame', FLAME, 3.2);
    const inner = lit(b, 'flame-heart', WARM, 4.2);
    const coals = lit(b, 'coals', EMBER, 2.4);
    blob(coals, v3(0, -14, 12), v3(40, 12, 7), 0, { rings: 6, segs: 12 });
    // Tongues of flame that rise and lean a little differently in each frame.
    const tongues = [-30, -17, -5, 7, 19, 31] as const;
    tongues.forEach((x, i) => {
      const t = f * 1.57 + i * 1.9;
      const h = 30 + Math.sin(t) * 9 + (i % 2) * 10 - Math.abs(x) * 0.25;
      const lean = Math.cos(t * 0.8) * 4;
      blob(outer, v3(x + lean, -14, 14 + h / 2), v3(8.6 - Math.abs(x) * 0.07, 7, h / 2), lean * 0.04, {
        rings: 6,
        segs: 9,
      });
      const hh = h * 0.58;
      blob(inner, v3(x * 0.8 + lean * 0.7, -17, 15 + hh / 2), v3(4.6, 4, hh / 2), 0, { rings: 5, segs: 8 });
    });
    // A spark or two lifting away
    for (let k = 0; k < 3; k++) {
      const t = (f + k * 1.3) % 4;
      blob(inner, v3(-20 + k * 20 + Math.sin(f + k) * 4, -14, 52 + t * 9), v3(1.8, 1.8, 1.8), 0, { rings: 4, segs: 6 });
    }
    return b;
  }

  const stone = part(b, 'hearth-stone', HEARTH_STONE, masonry(61));
  const stone2 = part(b, 'hearth-stone-2', HEARTH_STONE, masonry(62));
  // The slab the hearth stands on, the two piers and the lintel over the opening
  box(stone, v3(0, -14, 3), v3(236, 104, 6), 0, 1.5);
  for (const x of [-72, 72]) box(stone2, v3(x, 0, 56), v3(38, 62, 112), 0, 1.5);
  box(stone2, v3(0, 0, 100), v3(180, 62, 24), 0, 1.5);
  // The firebox behind: black with soot
  const soot = part(b, 'soot', COAL);
  box(soot, v3(0, 22, 42), v3(110, 8, 84));
  box(soot, v3(0, 0, 3), v3(110, 56, 7));
  // The chimney breast rising to the rafters
  box(stone, v3(0, 16, 184), v3(130, 40, 136), 0, 1.5);
  box(stone2, v3(0, -2, 128), v3(150, 20, 10), 0, 1);
  // Logs on the fire
  const log = part(b, 'hearth-log', LOG, grain(63, 0.1));
  tube(
    log,
    [
      { p: v3(-38, -6, 10), r: 8 },
      { p: v3(34, -16, 15), r: 8 },
    ],
    { segs: 8, n: 12 },
  );
  tube(
    log,
    [
      { p: v3(34, -6, 10), r: 7 },
      { p: v3(-30, -18, 18), r: 7 },
    ],
    { segs: 8, n: 12 },
  );
  // The mantel shelf
  const wood = part(b, 'mantel', DARK_WOOD, grain(64, 0.08));
  box(wood, v3(0, -8, 124), v3(214, 72, 12), 0, 2);
  box(wood, v3(0, -44, 118), v3(214, 4, 8), 0, 1);
  // A garland of fir along the shelf, with gold baubles and red berries
  const fir = part(b, 'garland', GREEN, grain(65, 0.1), true);
  const gar: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    gar.push({ p: v3(-100 + t * 200, -38, 138 - Math.sin(t * Math.PI) * -2 - Math.sin(t * Math.PI * 4) * 3), r: 6 });
  }
  tube(fir, gar, { segs: 8, n: 60 });
  const gold = part(b, 'garland-ball', GOLD, undefined, true);
  const berry = part(b, 'garland-berry', RED, undefined, true);
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    blob(i % 2 === 0 ? gold : berry, v3(-100 + t * 200, -44, 139), v3(4.2, 4.2, 4.2), 0, { rings: 5, segs: 8 });
  }
  // Candles at either end
  const wax = part(b, 'candle', CREAM, undefined, true);
  const flame = lit(b, 'candle-flame', WARM, 4);
  for (const x of [-90, 90]) {
    lathe(wax, {
      c: v3(x, -22, 130),
      profile: [
        [6, 0],
        [6, 22],
        [0, 22],
      ],
      segs: 10,
    });
    blob(flame, v3(x, -22, 156), v3(3.2, 3.2, 6), 0, { rings: 5, segs: 8 });
  }
  // Stockings hung from the shelf's lip
  const stockings: readonly [number, Ramp][] = [
    [-66, RED],
    [-30, GREEN],
    [66, BLUE],
  ];
  stockings.forEach(([x, ramp], i) => {
    const sock = part(b, `stocking-${i}`, ramp, grain(66 + i, 0.06), true);
    tube(
      sock,
      [
        { p: v3(x, -46, 114), r: 8 },
        { p: v3(x, -46, 82), r: 8 },
      ],
      { segs: 8, n: 8 },
    );
    blob(sock, v3(x + 8, -46, 78), v3(15, 9, 9), 0, { rings: 6, segs: 10 });
    const cuff = part(b, `cuff-${i}`, SNOW, undefined, true);
    blob(cuff, v3(x, -46, 113), v3(10.5, 10.5, 6), 0, { rings: 5, segs: 9 });
  });
  // A wreath on the breast, with a bow
  const wreath = part(b, 'hearth-wreath', GREEN, grain(70, 0.12), true);
  const ring: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push({ p: v3(Math.cos(a) * 26, -6, 196 + Math.sin(a) * 26), r: 6 });
  }
  tube(wreath, ring, { segs: 8, n: 48, capEnd: false });
  const bow = part(b, 'hearth-bow', RED, undefined, true);
  for (const s of [-1, 1]) blob(bow, v3(s * 9, -10, 170), v3(10, 3, 6), s * 0.5, { rings: 5, segs: 8 });
  blob(bow, v3(0, -10, 170), v3(4.4, 4.4, 4.4), 0, { rings: 5, segs: 8 });
  return b;
}

/** A deep red velvet armchair with wings and gold buttons, and a green blanket over one arm. */
export function armchair(): SceneBuilder {
  const b = new SceneBuilder();
  const red = part(b, 'velvet', RED, grain(71, 0.05));
  const red2 = part(b, 'velvet-2', RED, grain(72, 0.05));
  const wood = part(b, 'feet', DARK_WOOD, grain(73, 0.08));
  for (const [x, y] of [
    [-32, -24],
    [32, -24],
    [-32, 24],
    [32, 24],
  ] as const)
    box(wood, v3(x, y, 5), v3(8, 8, 10));
  box(red, v3(0, 0, 22), v3(76, 66, 24), 0, 3);
  box(red2, v3(0, -3, 38), v3(60, 52, 14), 0, 4);
  // The back and its wings
  box(red, v3(0, 27, 66), v3(76, 14, 76), 0, 3);
  blob(red, v3(0, 27, 104), v3(38, 8, 11), 0, { rings: 6, segs: 12 });
  for (const s of [-1, 1]) {
    blob(red2, v3(s * 34, 18, 90), v3(9, 14, 22), 0, { rings: 6, segs: 10 });
    box(red, v3(s * 39, -4, 42), v3(14, 58, 34), 0, 3);
    blob(red2, v3(s * 39, -4, 60), v3(8, 29, 8), 0, { rings: 6, segs: 10 });
  }
  // Buttons on the back
  const gold = part(b, 'buttons', GOLD, undefined, true);
  for (const [x, z] of [
    [-16, 74],
    [0, 74],
    [16, 74],
    [-8, 58],
    [8, 58],
  ] as const)
    blob(gold, v3(x, 19.5, z), v3(2.4, 2, 2.4), 0, { rings: 4, segs: 6 });
  // A blanket over the right arm
  const blanket = part(b, 'blanket', GREEN, grain(74, 0.1));
  box(blanket, v3(40, -6, 62), v3(20, 34, 4), 0.1, 1.5);
  box(blanket, v3(51, -6, 48), v3(4, 34, 28), 0.1, 1.5);
  return b;
}

/** The elves' bench: a wooden train, a teddy bear, paint pots, blocks and a hammer. */
export function workbench(): SceneBuilder {
  const b = new SceneBuilder();
  const top = part(b, 'bench-top', LOG, grain(81, 0.1));
  const leg = part(b, 'bench-legs', DARK_WOOD, grain(82, 0.08));
  box(top, v3(0, 0, 58), v3(160, 64, 8), 0, 1.5);
  for (const [x, y] of [
    [-70, -24],
    [70, -24],
    [-70, 24],
    [70, 24],
  ] as const)
    box(leg, v3(x, y, 27), v3(8, 8, 54));
  box(leg, v3(0, 24, 22), v3(140, 6, 5));
  box(top, v3(0, 0, 18), v3(140, 56, 4));
  // The train
  const red = part(b, 'train-body', RED, grain(83, 0.04));
  const blue = part(b, 'train-cab', BLUE, grain(84, 0.04));
  const dark = part(b, 'train-wheels', COAL, undefined, true);
  const gold = part(b, 'train-trim', GOLD, undefined, true);
  box(red, v3(-48, -8, 70), v3(34, 16, 12), 0, 2);
  box(blue, v3(-34, -8, 78), v3(14, 16, 14), 0, 1.5);
  blob(gold, v3(-60, -8, 80), v3(5, 5, 8), 0, { rings: 5, segs: 8 });
  for (const x of [-56, -40, -26])
    for (const y of [-17, 1]) blob(dark, v3(x, y, 64), v3(4.6, 2.6, 4.6), 0, { rings: 4, segs: 8 });
  const cargo = part(b, 'train-cargo', GREEN, grain(85, 0.04));
  box(cargo, v3(-6, -8, 69), v3(24, 14, 10), 0, 2);
  for (const x of [-12, 0])
    for (const y of [-17, 1]) blob(dark, v3(x, y, 64), v3(4.6, 2.6, 4.6), 0, { rings: 4, segs: 8 });
  // The teddy bear
  const fur = part(b, 'bear', FUR, grain(86, 0.1), true);
  const muzzle = part(b, 'bear-muzzle', FUR_LIGHT, undefined, true);
  blob(fur, v3(26, 0, 71), v3(11, 9, 12), 0, { rings: 7, segs: 10 });
  blob(fur, v3(26, -1, 89), v3(9, 8, 8), 0, { rings: 7, segs: 10 });
  for (const s of [-1, 1]) {
    blob(fur, v3(26 + s * 8, 0, 96), v3(3.4, 3, 3.4), 0, { rings: 4, segs: 6 });
    blob(fur, v3(26 + s * 12, -3, 72), v3(4, 4, 7), 0, { rings: 5, segs: 8 });
  }
  blob(muzzle, v3(26, -8, 87), v3(4.4, 3.4, 3.4), 0, { rings: 5, segs: 8 });
  const nose = part(b, 'bear-nose', COAL, undefined, true);
  blob(nose, v3(26, -11, 88), v3(1.8, 1.4, 1.4), 0, { rings: 4, segs: 6 });
  const bowM = part(b, 'bear-bow', PINK, undefined, true);
  for (const s of [-1, 1]) blob(bowM, v3(26 + s * 5, -6, 80), v3(5, 2, 3), s * 0.5, { rings: 4, segs: 8 });
  // Paint pots at the back, blocks and a hammer at the front
  for (const [i, ramp, x] of [
    [0, BLUE, 52],
    [1, GOLD, 62],
    [2, PINK, 72],
  ] as const) {
    const pot = part(b, `pot-${i}`, ramp, undefined, true);
    lathe(pot, {
      c: v3(x, 16, 62),
      profile: [
        [5, 0],
        [5, 8],
        [0, 8],
      ],
      segs: 8,
    });
  }
  const blocks: readonly [number, number, number, Ramp][] = [
    [54, -12, 0.3, RED],
    [66, -16, -0.2, GREEN],
    [60, -12, 0.1, GOLD],
  ];
  blocks.forEach(([x, y, yaw, ramp], i) => {
    const m = part(b, `block-${i}`, ramp, undefined, true);
    box(m, v3(x, y, 66 + (i === 2 ? 9 : 0)), v3(9, 9, 9), yaw, 1);
  });
  const handle = part(b, 'hammer-handle', LOG, undefined, true);
  tube(
    handle,
    [
      { p: v3(-8, -22, 63), r: 1.8 },
      { p: v3(10, -22, 63), r: 1.8 },
    ],
    { segs: 6, n: 4 },
  );
  box(part(b, 'hammer-head', STONE, undefined, true), v3(10, -22, 66), v3(5, 6, 8));
  return b;
}

/** The elves' shelf: three shelves of toys, a robot, a drum, blocks, a doll and a tin soldier. */
export function toyShelf(): SceneBuilder {
  const b = new SceneBuilder();
  const frame = part(b, 'shelf-frame', DARK_WOOD, grain(91, 0.08));
  const board = part(b, 'shelf-board', LOG, grain(92, 0.1));
  box(frame, v3(0, 14, 96), v3(136, 5, 192), 0, 1);
  for (const x of [-65, 65]) box(frame, v3(x, 0, 96), v3(8, 34, 192), 0, 1);
  const levels = [4, 56, 108, 160] as const;
  for (const z of levels) box(board, v3(0, 0, z), v3(136, 34, 6), 0, 1);
  box(frame, v3(0, 0, 192), v3(144, 38, 8), 0, 1.5);
  const red = part(b, 'toy-red', RED, undefined, true);
  const gold = part(b, 'toy-gold', GOLD, undefined, true);
  const blue = part(b, 'toy-blue', BLUE, undefined, true);
  const green = part(b, 'toy-green', GREEN, undefined, true);
  const pink = part(b, 'toy-pink', PINK, undefined, true);
  const teal = part(b, 'toy-teal', TURQUOISE, undefined, true);
  const fur = part(b, 'toy-fur', FUR, grain(93, 0.08), true);
  const white = part(b, 'toy-white', SNOW, undefined, true);
  const dark = part(b, 'toy-dark', COAL, undefined, true);
  // Bottom shelf: a drum, a teddy and a row of blocks
  lathe(red, {
    c: v3(-34, 0, 7),
    profile: [
      [14, 0],
      [14, 16],
      [0, 16],
    ],
    segs: 14,
  });
  lathe(gold, {
    c: v3(-34, 0, 22),
    profile: [
      [14.6, 0],
      [14.6, 2.4],
      [0, 2.4],
    ],
    segs: 14,
  });
  blob(fur, v3(14, 0, 18), v3(10, 8, 11), 0, { rings: 6, segs: 10 });
  blob(fur, v3(14, -1, 35), v3(8, 7, 7.4), 0, { rings: 6, segs: 10 });
  for (const s of [-1, 1]) blob(fur, v3(14 + s * 7, 0, 41), v3(3, 2.6, 3), 0, { rings: 4, segs: 6 });
  for (const [i, m] of [red, green, blue, gold].entries())
    box(m, v3(38 + i * 10, -2, 12), v3(9, 9, 9), (i - 1.5) * 0.12, 1);
  // Second shelf: a robot, a ball and a doll
  box(blue, v3(-38, 0, 72), v3(20, 14, 24), 0, 2);
  box(teal, v3(-38, 0, 90), v3(14, 11, 11), 0, 2);
  box(gold, v3(-38, -6, 91), v3(8, 2, 3));
  for (const s of [-1, 1]) {
    box(red, v3(-38 + s * 14, 0, 74), v3(5, 6, 16), 0, 1);
    blob(gold, v3(-38 + s * 5, 0, 99), v3(2, 2, 4), 0, { rings: 4, segs: 6 });
  }
  blob(pink, v3(0, 0, 70), v3(13, 13, 13), 0, { rings: 8, segs: 12 });
  blob(white, v3(0, -11.4, 72), v3(8, 2.6, 2.6), 0, { rings: 4, segs: 8 });
  lathe(pink, {
    c: v3(38, 0, 61),
    profile: [
      [14, 0],
      [8, 22],
      [0, 22],
    ],
    segs: 10,
  });
  blob(white, v3(38, 0, 92), v3(7, 7, 7.4), 0, { rings: 6, segs: 10 });
  // Third shelf: a pyramid of blocks, a tin soldier and a spinning top
  for (const [i, m] of [red, green, blue].entries()) box(m, v3(-42 + i * 12, 0, 118), v3(11, 11, 11), 0, 1);
  for (const [i, m] of [gold, pink].entries()) box(m, v3(-36 + i * 12, 0, 129), v3(11, 11, 11), 0, 1);
  box(teal, v3(-30, 0, 140), v3(11, 11, 11), 0.2, 1);
  tube(
    red,
    [
      { p: v3(14, 0, 112), r: 5.6 },
      { p: v3(14, 0, 140), r: 5 },
    ],
    { segs: 8, n: 8 },
  );
  blob(white, v3(14, 0, 146), v3(5.4, 5.4, 6), 0, { rings: 5, segs: 8 });
  tube(
    dark,
    [
      { p: v3(14, 0, 150), r: 5.4 },
      { p: v3(14, 0, 160), r: 4 },
    ],
    { segs: 8, n: 4 },
  );
  lathe(green, {
    c: v3(48, 0, 111),
    profile: [
      [0.6, 0],
      [8, 12],
      [8, 16],
      [0, 16],
    ],
    segs: 10,
  });
  tube(
    gold,
    [
      { p: v3(48, 0, 126), r: 1.2 },
      { p: v3(48, 0, 134), r: 1.2 },
    ],
    { segs: 6, n: 3 },
  );
  // Top shelf: a row of wrapped presents and a star
  [-44, -22, 0, 24].forEach((x, i) => {
    box([red, blue, green, pink][i]!, v3(x, 0, 168 + 3), v3(16, 16, 14 + (i % 2) * 6), 0.1 * i, 1);
    box(gold, v3(x, 0, 168 + 3), v3(3, 16.5, 14 + (i % 2) * 6 + 1), 0.1 * i);
  });
  blob(gold, v3(52, 0, 176), v3(7, 3, 7), 0, { rings: 5, segs: 8 });
  return b;
}

/** A round table in a lace cloth with a plate of cookies, a gingerbread man and a glass of milk. */
export function cookieTable(): SceneBuilder {
  const b = new SceneBuilder();
  const wood = part(b, 'table-wood', DARK_WOOD, grain(101, 0.08));
  lathe(wood, {
    c: v3(0, 0, 0),
    profile: [
      [24, 0],
      [24, 3],
      [8, 10],
      [8, 32],
      [0, 32],
    ],
    segs: 14,
  });
  const cloth = part(b, 'lace', SNOW, grain(102, 0.03));
  lathe(cloth, {
    c: v3(0, 0, 0),
    profile: [
      [52, 26],
      [52, 30],
      [50, 34],
      [50, 40],
      [44, 44],
      [0, 44],
    ],
    segs: 20,
    smooth: true,
  });
  const redband = part(b, 'cloth-band', RED, undefined, true);
  lathe(redband, {
    c: v3(0, 0, 0),
    profile: [
      [52.6, 28],
      [52.6, 31],
      [50.6, 31],
      [50.6, 28],
    ],
    segs: 20,
  });
  // The plate and the cookies on it
  const plate = part(b, 'plate', GOLD, undefined, true);
  lathe(plate, {
    c: v3(-6, 4, 44),
    profile: [
      [20, 0],
      [22, 2.4],
      [0, 2.4],
    ],
    segs: 16,
  });
  const cookie = part(b, 'cookie', COOKIE, grain(103, 0.1), true);
  const icing = part(b, 'icing', SNOW, undefined, true);
  const chips = part(b, 'chips', DARK_WOOD, undefined, true);
  for (const [x, y, z] of [
    [-16, 6, 49],
    [-2, 2, 49],
    [-10, 12, 49],
    [-12, 6, 54],
  ] as const) {
    blob(cookie, v3(x, y, z), v3(8, 8, 2.8), 0, { rings: 4, segs: 12 });
    blob(chips, v3(x - 2, y - 2, z + 2.4), v3(1.2, 1.2, 0.8), 0, { rings: 3, segs: 5 });
    blob(chips, v3(x + 2.4, y + 1, z + 2.4), v3(1.2, 1.2, 0.8), 0, { rings: 3, segs: 5 });
    blob(icing, v3(x + 1, y - 3, z + 2.2), v3(1.6, 1.2, 0.7), 0, { rings: 3, segs: 5 });
  }
  // A gingerbread man
  const ginger = part(b, 'ginger', COOKIE, grain(104, 0.1), true);
  blob(ginger, v3(22, -8, 47), v3(5, 2.4, 6), 0, { rings: 5, segs: 8 });
  blob(ginger, v3(22, -8, 55), v3(3.8, 2.4, 3.8), 0, { rings: 5, segs: 8 });
  for (const s of [-1, 1]) {
    blob(ginger, v3(22 + s * 6.4, -8, 48), v3(3, 2.2, 1.8), s * 0.4, { rings: 4, segs: 6 });
    blob(ginger, v3(22 + s * 2.4, -8, 41), v3(2, 2.2, 4), 0, { rings: 4, segs: 6 });
  }
  blob(icing, v3(22, -10, 50), v3(1.2, 0.8, 1.2), 0, { rings: 3, segs: 5 });
  blob(icing, v3(20.6, -10.2, 55.6), v3(0.8, 0.6, 0.8), 0, { rings: 3, segs: 5 });
  blob(icing, v3(23.4, -10.2, 55.6), v3(0.8, 0.6, 0.8), 0, { rings: 3, segs: 5 });
  // A glass of milk
  const glass = part(b, 'glass', ICE, undefined, true);
  lathe(glass, {
    c: v3(30, 14, 44),
    profile: [
      [5, 0],
      [6.4, 15],
      [0, 15],
    ],
    segs: 12,
  });
  const milk = part(b, 'milk', SNOW, undefined, true);
  lathe(milk, {
    c: v3(30, 14, 44.6),
    profile: [
      [4.6, 0],
      [5.6, 11],
      [0, 11],
    ],
    segs: 12,
  });
  // A little candle for the night
  const wax = part(b, 'table-candle', CREAM, undefined, true);
  lathe(wax, {
    c: v3(-34, 12, 44),
    profile: [
      [3.6, 0],
      [3.6, 13],
      [0, 13],
    ],
    segs: 8,
  });
  blob(lit(b, 'table-flame', WARM, 4), v3(-34, 12, 61), v3(2, 2, 4), 0, { rings: 4, segs: 6 });
  return b;
}

/** Santa's sack, as big as an armchair and brimming with presents and a candy cane. */
export function sack(): SceneBuilder {
  const b = new SceneBuilder();
  const cloth = part(b, 'sack', FUR, grain(111, 0.1));
  blob(cloth, v3(0, 0, 34), v3(40, 32, 34), 0.3, { rings: 9, segs: 14 });
  blob(cloth, v3(0, 0, 66), v3(20, 18, 18), 0, { rings: 7, segs: 12 });
  const tie = part(b, 'sack-tie', GOLD, undefined, true);
  tube(
    tie,
    [
      { p: v3(0, 0, 70), r: 5 },
      { p: v3(0, 0, 74), r: 5 },
    ],
    { segs: 8, n: 3 },
  );
  const stuff: readonly [Ramp, number, number, number, number][] = [
    [BLUE, -8, -2, 88, 0.4],
    [GREEN, 8, 2, 84, -0.3],
    [PINK, 0, 4, 98, 0.1],
  ];
  stuff.forEach(([ramp, x, y, z, yaw], i) => {
    box(part(b, `sack-gift-${i}`, ramp, undefined, true), v3(x, y, z), v3(16, 16, 16), yaw, 1.5);
    box(part(b, `sack-ribbon-${i}`, GOLD, undefined, true), v3(x, y, z), v3(3, 16.6, 16.6), yaw);
  });
  // The candy cane leaning out of the top
  const red = part(b, 'cane-red', RED, undefined, true);
  const cane: { p: V3; r: number }[] = [];
  for (let i = 0; i <= 8; i++) cane.push({ p: v3(14 + i * 1.6, -4, 76 + i * 5), r: 2.4 });
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    cane.push({ p: v3(27 + (1 - Math.cos(a)) * 6, -4, 116 + Math.sin(a) * 7), r: 2.4 });
  }
  tube(red, cane, { segs: 6, n: 40 });
  const white = part(b, 'cane-white', SNOW, undefined, true);
  for (let i = 1; i < 8; i += 2)
    blob(white, v3(14 + i * 1.6, -4, 76 + i * 5), v3(2.8, 2.8, 2.2), 0, { rings: 3, segs: 7 });
  return b;
}

/** The doorway of the cabin, lit from inside: laid over the door while it is open. */
export function cabinLight(): SceneBuilder {
  const b = new SceneBuilder();
  box(lit(b, 'doorway', WARM, 3.4), v3(0, -83.5, 38), v3(44, 2, 72), 0, 1);
  return b;
}
