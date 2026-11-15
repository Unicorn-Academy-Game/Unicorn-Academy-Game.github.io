import { fingerAt, KEY_PITCH, noteOfKey, PIANO_KEYS, PIANO_UNIT, pressOf } from '../../../src/shared/piano';
import type { Rgba } from '../core/image';
import { TAU, v3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2 } from './arch';
import { GEM } from './palette';
import { type Canvas, paint, r6, render, TOY, type Toy } from './playground';
import { blob, box } from './prims';
import { SceneBuilder } from './scene';
import { roundRect } from './shapes';

/**
 * The piano that stands by the palace: a toy among the toys, in the same colours and drawn with the
 * same camera and light. Its keys and the five jewels above them move in the frames drawn here; the
 * notes that fly off it are the effect `music-notes`.
 */

export const PIANO_CANVAS: Canvas = { w: 276, h: 270, ox: 138, oy: 224 };
/**
 * The toy colour each of the five notes of the tone matrix has, from C up to A, and so the colour
 * its key lights in when the piano plays.
 */
const NOTE_TOYS = ['red', 'orange', 'yellow', 'blue', 'purple'] as const satisfies readonly Toy[];
/**
 * The white keys that have a black key on their right: the five of an octave that are C, D, F, G
 * and A.
 */
const SHARPS: ReadonlySet<number> = new Set([0, 1, 3, 4, 5]);
const CASE = r6('#8a5bd8', 285, 330);
const LID = r6('#b690f0', 285, 330);
const INSET = r6('#efe0fc', 290, 330);
const EBONY = r6('#4b3a68', 275, 300);

/** An ellipse turned by `tilt` radians, for the head of a note. */
const tilted = (a: number, c: number, tilt: number, n = 18): P2[] =>
  Array.from({ length: n }, (_, i): P2 => {
    const t = (i / n) * TAU;
    const x = Math.cos(t) * a,
      z = Math.sin(t) * c;
    return [x * Math.cos(tilt) - z * Math.sin(tilt), x * Math.sin(tilt) + z * Math.cos(tilt)];
  });

/**
 * The magic piano that stands by the palace: a violet upright with two octaves of keys, five jewels
 * in the colours of the five notes, gold pedals and a pair of gold notes on its lid. Frame `f` is
 * the glissando that runs along the keys when it is tapped, each key of the key lighting in its
 * colour as the finger passes, and frame 0 is the piano at rest. The timing of the run is in
 * `shared/piano.ts`.
 */
export function renderPiano(f: number): Rgba {
  const b = new SceneBuilder();
  const gold = b.mesh(b.solid('gold', b.variant('gold', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92] })));
  const trim = b.mesh(
    b.solid('trim', b.variant('trim', GEM.gold, { bands: [0.2, 0.4, 0.6, 0.8, 0.92], noLines: true })),
  );
  // The cabinet is one block, round at the top; the lid overhangs it and a pale panel stands a
  // little proud of its face.
  extrude(b.mesh(paint(b, 'case', CASE, 3)), roundRect(-84, 14, 84, 132, 12), FRONT(0, 26, 0), 0, 50);
  box(b.mesh(paint(b, 'lid', LID, 4)), v3(0, 1, 136), v3(186, 58, 8), 0, 2.4);
  extrude(b.mesh(paint(b, 'panel', INSET, 5)), roundRect(-70, 92, 70, 124, 9, 9), FRONT(0, -24, 0), 0, 2.6);
  extrude(b.mesh(paint(b, 'kick', INSET, 6)), roundRect(-60, 22, 60, 50, 6, 6), FRONT(0, -24, 0), 0, 2.2);
  box(trim, v3(0, -25.2, 86), v3(168, 2.4, 3.2), 0, 0.6);
  box(trim, v3(0, -25.2, 129), v3(168, 2.4, 3.2), 0, 0.6);
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
  // Five jewels across the panel, one for each note. A jewel swells and shines while a key of its
  // colour is down.
  const finger = fingerAt(f);
  const down = (k: number): number => pressOf(k, finger);
  NOTE_TOYS.forEach((c, i) => {
    const x = (i - 2) * 25,
      z = 108;
    const glow = Math.max(...Array.from({ length: PIANO_KEYS }, (_, k) => (noteOfKey(k) === i ? down(k) : 0)));
    const grow = 1 + 0.2 * glow;
    const jewel =
      glow > 0.35
        ? b.solid(`jewel-${i}`, b.variant(`jewel-${i}`, TOY[c], { emissive: 3 }))
        : paint(b, `jewel-${i}`, TOY[c], 10 + i);
    blob(b.mesh(jewel), v3(x, -26, z), v3(8.6 * grow, 4.6 * grow, 8.6 * grow), 0, { rings: 8, segs: 12 });
    blob(
      b.mesh(b.solid(`glint-${i}`, b.variant(`glint-${i}`, TOY.cream, { noLines: true, emissive: 5 }))),
      v3(x - 2.7 * grow, -29.8, z + 3.2 * grow),
      v3(2.2, 1, 2.2),
      0,
      { rings: 4, segs: 7 },
    );
  });
  // The key shelf with a cheek at each end, and the two gold pedals under it.
  const shelf = b.mesh(paint(b, 'shelf', CASE, 8));
  box(shelf, v3(0, -45, 68), v3(168, 42, 8), 0, 1.4);
  for (const sx of [-1, 1]) box(shelf, v3(sx * 80, -45, 75), v3(8, 42, 22), 0, 1.4);
  for (const sx of [-1, 1]) blob(trim, v3(sx * 14, -33, 26), v3(7, 8, 2.8), 0, { rings: 5, segs: 10 });
  // The keys. The finger runs along them from one end to the other, so the keys it has not reached
  // and the keys it has left are at rest.
  const left = -(PIANO_KEYS * KEY_PITCH) / 2;
  for (let k = 0; k < PIANO_KEYS; k++) {
    const note = noteOfKey(k);
    const colour = note !== null && down(k) > 0.35 ? TOY[NOTE_TOYS[note]!] : TOY.cream;
    const top = 78 - 2.8 * down(k);
    box(
      b.mesh(paint(b, `key-${k}`, colour, 20 + k)),
      v3(left + (k + 0.5) * KEY_PITCH, -46, (72 + top) / 2),
      v3(KEY_PITCH - 0.7, 38, top - 72),
      0,
      0.9,
    );
  }
  const ebony = b.mesh(paint(b, 'ebony', EBONY, 40));
  for (let k = 0; k < PIANO_KEYS - 1; k++) {
    if (SHARPS.has(k % 7)) box(ebony, v3(left + (k + 1) * KEY_PITCH, -37, 81.5), v3(6.4, 23, 7), 0, 0.9);
  }
  // Two gold notes on the lid, joined by a beam.
  const noteX = [-12, 12] as const;
  for (const x of noteX) {
    extrude(
      gold,
      tilted(7.6, 5.4, 0.42).map(([u, v]): P2 => [u + x, v]),
      FRONT(0, 3, 146),
      0,
      6,
    );
    extrude(
      gold,
      [
        [x + 5.6, 0],
        [x + 9, 0],
        [x + 9, 27],
        [x + 5.6, 27],
      ],
      FRONT(0, 3, 147),
      0,
      6,
    );
  }
  extrude(
    gold,
    [
      [noteX[0] + 5.6, 28],
      [noteX[1] + 9, 22],
      [noteX[1] + 9, 29],
      [noteX[0] + 5.6, 35],
    ],
    FRONT(0, 3, 147),
    0,
    6,
  );
  return render(b, PIANO_CANVAS, { aoRadius: 7, unit: PIANO_UNIT }).rgba;
}
