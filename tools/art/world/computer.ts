import { COLUMN_PITCH, COLUMNS, COMPUTER_UNIT, glowOf, LIT, lightAt, ROWS, SCREEN } from '../../../src/shared/computer';
import { hex, type RGB, toHex } from '../core/color';
import type { Rgba } from '../core/image';
import { v3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2 } from './arch';
import { starPoly } from './hall';
import { GEM, type Ramp } from './palette';
import { type Canvas, paint, r6, render, TOY, type Toy } from './playground';
import { blob, box } from './prims';
import { SceneBuilder } from './scene';
import { roundRect } from './shapes';

/**
 * The computer that stands by the palace, across the garden from the piano: a toy among the toys,
 * in the same colours and drawn with the same camera and light. Its screen wakes and its keys light
 * in the frames drawn here; the sparks that fly off it are the effect `screen-wake`. The timing of
 * the waking is in `shared/computer.ts`.
 */

export const COMPUTER_CANVAS: Canvas = { w: 276, h: 270, ox: 138, oy: 224 };

const CASE = r6('#2fb5ae', 215, 120);
const LID = r6('#8ee6dc', 215, 120);
/** The glass is dark, and it flashes to a pale blue-white when the computer wakes. */
const NIGHT: RGB = hex('#232b73');
const FLASH: RGB = hex('#d9fbff');
const WORDS = ['pink', 'yellow', 'teal'] as const satisfies readonly Toy[];
const KEY_TOYS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const satisfies readonly Toy[];
/** The three jewels under the screen, and the columns of keys each one shines with. */
const JEWELS = [
  { toy: 'red', from: 0, to: 3 },
  { toy: 'yellow', from: 4, to: 7 },
  { toy: 'green', from: 8, to: 10 },
] as const satisfies readonly { toy: Toy; from: number; to: number }[];

/**
 * The word on the screen, one letter at a time in a font of five by seven squares, and the line
 * after it that says more can be written.
 */
const LETTERS: readonly (readonly string[])[] = [
  ['.....', '.....', '.###.', '#...#', '#....', '#...#', '.###.'],
  ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
];
const CURSOR = ['....', '....', '....', '....', '....', '....', '####'] as const;
/** The squares are this big in the model, and the letters are this many squares apart. */
const SQUARE = 4.3;
const ADVANCE = 6;
const TEXT_COLUMNS = ADVANCE * LETTERS.length + CURSOR[0].length;

/** The ramp of a colour mixed toward white, for the keys that are not lit. */
const paler = (ramp: Ramp, t: number): Ramp =>
  ramp.map((c): RGB => [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]);
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The computer by the palace: a teal cabinet with a screen that shows a word, a keyboard of three
 * rows of keys on legs of its own, three jewels under the screen, and a pair of books and a gold
 * star on its lid. Frame `f` is the waking that runs when it is tapped: the glass flashes, the
 * letters jump and settle, and a light runs along the keys, each key lighting in its colour as it
 * passes. Frame 0 and the last are the computer at rest.
 */
export function renderComputer(f: number): Rgba {
  const b = new SceneBuilder();
  const { glass, letters } = SCREEN[f]!;
  const light = lightAt(f);
  const gold = b.mesh(b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));
  // The cabinet is one block, round at the top; the lid overhangs it and a pale frame stands a
  // little proud of its face.
  extrude(b.mesh(paint(b, 'case', CASE, 3)), roundRect(-82, 14, 82, 142, 14), FRONT(0, 26, 0), 0, 50);
  box(b.mesh(paint(b, 'lid', LID, 4)), v3(0, 1, 146), v3(186, 58, 8), 0, 2.4);
  extrude(b.mesh(paint(b, 'frame', TOY.cream, 5)), roundRect(-72, 70, 72, 134, 10, 10), FRONT(0, -24, 0), 0, 2.6);
  // Four round feet under it.
  const feet = b.mesh(paint(b, 'feet', LID, 7));
  for (const [x, y] of [
    [-68, -12],
    [68, -12],
    [-68, 16],
    [68, 16],
  ] as const)
    lathe(feet, {
      c: v3(x, y, 0),
      segs: 14,
      smooth: true,
      profile: [
        [8, 0],
        [9, 3],
        [7.5, 11],
        [8.5, 15],
      ],
    });
  // The glass gives its own light, so it is the same all over, and it is what the letters stand on.
  const glassRamp = r6(toHex(mix(NIGHT, FLASH, glass)), 265, 200);
  extrude(
    b.mesh(b.solid('glass', b.variant('glass', glassRamp, { emissive: 3, noLines: true }))),
    roundRect(-64, 76, 64, 128, 6, 6),
    FRONT(0, -26.6, 0),
    0,
    1.4,
  );
  // Two slanted streaks of reflection, a little paler than the glass.
  const sheen = b.mesh(
    b.solid(
      'sheen',
      b.variant('sheen', r6(toHex(mix(mix(NIGHT, FLASH, glass), FLASH, 0.12)), 265, 200), {
        emissive: 3,
        noLines: true,
      }),
    ),
  );
  for (const [x, width] of [
    [-34, 12],
    [-17, 4],
  ] as const)
    extrude(
      sheen,
      [
        [x, 126],
        [x + width, 126],
        [x + width - 22, 82],
        [x - 22, 82],
      ],
      FRONT(0, -28, 0),
      0,
      0.3,
    );
  if (letters > 0) writeWord(b, letters);
  // Three jewels, each shining while the light is on the keys of its colour.
  JEWELS.forEach(({ toy, from, to }, i) => {
    const on = Array.from({ length: to - from + 1 }, (_, k) => glowOf(from + k, light)).some((g) => g > LIT);
    const x = (i - 1) * 24,
      z = 56;
    const jewel = on
      ? b.solid(`jewel-${i}`, b.variant(`jewel-${i}`, TOY[toy], { emissive: 3 }))
      : paint(b, `jewel-${i}`, TOY[toy], 10 + i);
    const grow = on ? 1.2 : 1;
    blob(b.mesh(jewel), v3(x, -25.5, z), v3(8.6 * grow, 4.6 * grow, 8.6 * grow), 0, { rings: 8, segs: 12 });
    blob(
      b.mesh(b.solid(`glint-${i}`, b.variant(`glint-${i}`, TOY.cream, { noLines: true, emissive: 5 }))),
      v3(x - 2.7 * grow, -29.2, z + 3.2 * grow),
      v3(2.2, 1, 2.2),
      0,
      { rings: 4, segs: 7 },
    );
  });
  // The keyboard sits on a shelf with a leg at each end, and the keys are rows of squares the light
  // runs along.
  const shelf = b.mesh(paint(b, 'shelf', CASE, 8));
  box(shelf, v3(0, -45, 38), v3(168, 42, 8), 0, 1.4);
  for (const sx of [-1, 1]) box(shelf, v3(sx * 80, -45, 21), v3(8, 42, 42), 0, 1.4);
  writeKeys(b, light);
  // A pair of books and a gold star on the lid.
  book(b, { x: -34, z: 155, w: 80, d: 46, h: 10, yaw: 0.06, cover: 'purple' });
  book(b, { x: -30, z: 164.5, w: 62, d: 38, h: 9, yaw: -0.1, cover: 'orange' });
  extrude(
    gold,
    starPoly(0, 0, 16, 7).map(([u, v]): P2 => [u + 60, 13 - v]),
    FRONT(0, 3, 150),
    0,
    6,
  );
  return render(b, COMPUTER_CANVAS, { aoRadius: 7, unit: COMPUTER_UNIT }).rgba;
}

/**
 * The word on the glass, `size` times as big as it is at rest, and the cursor after it. Each letter
 * is its own colour and gives its own light.
 */
function writeWord(b: SceneBuilder, size: number): void {
  const square = SQUARE * size;
  const put = (mesh: ReturnType<SceneBuilder['mesh']>, rows: readonly string[], at: number): void => {
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        box(
          mesh,
          v3((at + x + 0.5 - TEXT_COLUMNS / 2) * square, -27.8 - 1.2 * size, 102 + (3 - y) * square),
          v3(square * 0.98, 2.4 * size, square * 0.98),
          0,
          0,
        );
      });
    });
  };
  LETTERS.forEach((rows, i) => {
    const name = `word-${i}`;
    put(b.mesh(b.solid(name, b.variant(name, TOY[WORDS[i]!], { emissive: 3, noLines: true }))), rows, i * ADVANCE);
  });
  put(
    b.mesh(b.solid('cursor', b.variant('cursor', TOY.cream, { emissive: 4, noLines: true }))),
    CURSOR,
    ADVANCE * LETTERS.length,
  );
}

/**
 * The keys, with the ones the light is on pressed down and shining in their colours, and the long
 * key at the front.
 */
function writeKeys(b: SceneBuilder, light: number): void {
  const made = new Map<string, number>();
  const material = (name: string, make: () => number): number => {
    const known = made.get(name);
    if (known !== undefined) return known;
    const created = make();
    made.set(name, created);
    return created;
  };
  const left = -(COLUMNS * COLUMN_PITCH) / 2;
  const top = 42;
  const key = (x: number, y: number, width: number, toy: Toy, glow: number, seed: number): void => {
    const lit = glow > LIT;
    const name = `key-${toy}-${lit ? 'on' : 'off'}`;
    const m = material(name, () =>
      lit
        ? b.solid(name, b.variant(name, TOY[toy], { emissive: 4, noLines: true }))
        : paint(b, name, paler(TOY[toy], 0.55), seed),
    );
    const height = lit ? 5 - 2.2 * glow : 5;
    box(b.mesh(m), v3(x, y, top + height / 2), v3(width, 10.4, height), 0, 0.9);
  };
  for (let row = 0; row < ROWS; row++) {
    const y = -33 - 12 * row;
    for (let column = 0; column < COLUMNS; column++) {
      // The front row has a long key where its middle five would be.
      if (row === ROWS - 1 && column >= 3 && column <= 7) continue;
      key(
        left + (column + 0.5) * COLUMN_PITCH,
        y,
        COLUMN_PITCH - 1.6,
        KEY_TOYS[(column + 3 * row) % KEY_TOYS.length]!,
        glowOf(column, light),
        20 + column + 11 * row,
      );
    }
  }
  const long = Math.max(...[3, 4, 5, 6, 7].map((column) => glowOf(column, light)));
  key(left + 5.5 * COLUMN_PITCH, -33 - 12 * (ROWS - 1), 5 * COLUMN_PITCH - 1.6, 'teal', long, 60);
}

/** A book lying on the lid: a cover, and the cream edge of its pages along the front. */
function book(
  b: SceneBuilder,
  o: { x: number; z: number; w: number; d: number; h: number; yaw: number; cover: Toy },
): void {
  box(b.mesh(paint(b, `cover-${o.cover}`, TOY[o.cover], 30)), v3(o.x, 4, o.z), v3(o.w, o.d, o.h), o.yaw, 1);
  box(
    b.mesh(paint(b, `pages-${o.cover}`, TOY.cream, 31)),
    v3(o.x, 4, o.z),
    v3(o.w - 8, o.d + 1.4, o.h - 3.6),
    o.yaw,
    0.4,
  );
}
