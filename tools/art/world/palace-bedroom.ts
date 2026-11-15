import type { Rgba } from '../core/image';
import { TAU, v3 } from '../core/vec';
import { extrude, FRONT, lathe, type P2, scallopEdge } from './arch';
import { GEM } from './palette';
import { blob, box } from './prims';
import { SceneBuilder } from './scene';
import { type Canvas, GOLD_BANDS, glint, noise, r6, render } from './treasure';

/**
 * Wildstar's bed, in two pictures that share one anchor. The bed is drawn behind her: its frame, a
 * tall padded back, the mattress and the pillows. The quilt is drawn in front of her, so she lies
 * with her head on the pillow and the quilt up to her shoulders. In a model, x runs east, y runs
 * away from the viewer and z runs up, and the anchor is the middle of the bed on the floor.
 */

/**
 * The bed is modelled at full size and drawn at this share of it, so it is a little longer than she
 * is and not twice as long.
 */
const NAP_UNIT = 0.86;
/**
 * Wide enough for the bed and its ends, tall enough for the back, with the anchor in the middle of
 * the floor under it.
 */
export const NAP_CANVAS: Canvas = { w: 262, h: 166, ox: 131, oy: 128 };
const draw = (b: SceneBuilder, extra: Parameters<typeof render>[2] = {}) =>
  render(b, NAP_CANVAS, { unit: NAP_UNIT, ...extra });

/**
 * The bed runs east to west, half its length each side of the anchor, and half its depth each side.
 */
const HALF_LENGTH = 104;
const HALF_DEPTH = 60;
/** How high the top of the mattress is above the floor. */
const MATTRESS_TOP = 40;

const WHITEWASH = r6('#f3e8e2', 330, 60);
const CREAM = r6('#f8efe3', 320, 80);
const ROSE = r6('#ee6f9f', 325, 55);
const LILAC = r6('#b79cf0', 270, 330);
const PLUM = r6('#8a6bd0', 275, 330);

interface Kit {
  gold: number;
  frame: number;
  cream: number;
  rose: number;
  lilac: number;
  plum: number;
}

function kit(b: SceneBuilder): Kit {
  const solid = (name: string, ramp: Parameters<SceneBuilder['variant']>[1], seed: number, bands?: readonly number[]) =>
    b.solid(name, b.variant(name, ramp, bands ? { bands } : {}), noise(seed));
  return {
    gold: solid('gold', GEM.gold, 5, GOLD_BANDS),
    frame: solid('frame', WHITEWASH, 4),
    cream: solid('cream', CREAM, 13),
    rose: b.solid('rose', b.variant('rose', ROSE)),
    lilac: solid('lilac', LILAC, 14),
    plum: solid('plum', PLUM, 15),
  };
}

/**
 * The bed: a frame on short feet, a deep mattress, a tall padded back along the north edge, low
 * ends and two pillows at the east end, where she rests her head.
 */
export function napBed(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const L = HALF_LENGTH * 2;
  const D = HALF_DEPTH * 2;
  // The frame stands on four short gold feet.
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      lathe(b.mesh(k.gold), {
        c: v3(sx * (HALF_LENGTH - 8), sy * (HALF_DEPTH - 8), 0),
        segs: 10,
        smooth: true,
        profile: [
          [7, 0],
          [7, 4],
          [4.6, 8],
          [4.6, 10],
          [0, 10],
        ],
      });
    }
  box(b.mesh(k.frame), v3(0, 0, 16), v3(L + 2, D + 2, 14));
  box(b.mesh(k.gold), v3(0, -HALF_DEPTH - 1.4, 22), v3(L + 4, 2.2, 3));
  // A deep mattress with a rounded edge along the front.
  box(b.mesh(k.cream), v3(0, 0, 31), v3(L - 8, D - 8, 18));
  blob(b.mesh(k.cream), v3(0, -HALF_DEPTH + 4, 38), v3(HALF_LENGTH - 10, 7, 5), 0, { rings: 6, segs: 16 });
  // The back is a tall plum panel in padded rounds, with a gold rail along its top and a stud on
  // every round.
  const back = HALF_DEPTH + 5;
  box(b.mesh(k.frame), v3(0, back, 52), v3(L + 12, 8, 96));
  const rounds = 6;
  const span = (L + 12) / rounds;
  for (let i = 0; i < rounds; i++) {
    const x = -(L + 12) / 2 + (i + 0.5) * span;
    blob(b.mesh(k.plum), v3(x, back - 5, 66), v3(span / 2 - 2, 4, 30), 0, { rings: 8, segs: 12 });
    blob(b.mesh(k.gold), v3(x, back - 9, 66), v3(3.4, 2.4, 3.4), 0, { rings: 5, segs: 8 });
    blob(b.mesh(k.frame), v3(x, back, 100), v3(span / 2 + 1, 4.6, 12), 0, { rings: 6, segs: 12 });
  }
  box(b.mesh(k.gold), v3(0, back - 1, 99), v3(L + 14, 5, 3));
  // Two low ends, the east one a little taller.
  box(b.mesh(k.frame), v3(-HALF_LENGTH - 3, 0, 34), v3(7, D + 8, 46));
  box(b.mesh(k.gold), v3(-HALF_LENGTH - 3, 0, 58), v3(8.4, D + 9, 3));
  box(b.mesh(k.frame), v3(HALF_LENGTH + 3, 0, 40), v3(7, D + 8, 58));
  box(b.mesh(k.gold), v3(HALF_LENGTH + 3, 0, 70), v3(8.4, D + 9, 3));
  for (const sy of [-1, 1])
    blob(b.mesh(k.gold), v3(HALF_LENGTH + 3, sy * (HALF_DEPTH + 2), 74), v3(5, 5, 5), 0, { rings: 6, segs: 10 });
  // Two pillows side by side at the east end, the far one propped against the back.
  blob(b.mesh(k.cream), v3(62, 12, MATTRESS_TOP + 9), v3(38, 25, 11), 0, { rings: 8, segs: 16 });
  blob(b.mesh(k.rose), v3(62, 12, MATTRESS_TOP + 16), v3(21, 12, 3), 0, { rings: 5, segs: 10 });
  blob(b.mesh(k.cream), v3(40, 36, MATTRESS_TOP + 14), v3(32, 18, 14), 0, { rings: 8, segs: 14 });
  blob(b.mesh(k.lilac), v3(40, 33, MATTRESS_TOP + 24), v3(17, 8, 3), 0, { rings: 5, segs: 10 });
  return b;
}

/**
 * How high the quilt stands over the mattress at her hips and at her shoulders, and where it ends.
 */
const QUILT_HIP = 62;
const QUILT_SHOULDER = 92;
const QUILT_RIGHT = 32;

/** The height of the top of the quilt at x: low over her hips, highest over her shoulders. */
const quiltTop = (x: number): number => QUILT_HIP + (QUILT_SHOULDER - QUILT_HIP) * Math.exp(-(((x + 20) / 46) ** 2));

/** A five pointed star, `r` out to its points. */
function star(r: number): P2[] {
  return Array.from({ length: 10 }, (_, i): P2 => {
    const a = (i / 10) * TAU - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * 0.44;
    return [Math.cos(a) * d, Math.sin(a) * d];
  });
}

/**
 * The quilt: a rose loaf with a scalloped hem, rounded up over her shoulders, with patches and a
 * gold star sewn on the front. It is one shape seen from the front and pushed back across the bed,
 * so it hangs straight down at the front and the hem is a row of rounded scallops.
 */
export function napQuilt(): SceneBuilder {
  const b = new SceneBuilder();
  const k = kit(b);
  const left = -HALF_LENGTH - 2;
  const width = QUILT_RIGHT - left;
  const hemAt = 12;
  const count = 8;
  const hem = scallopEdge(width, 7, count).map(([x, z]): P2 => [left + width / 2 + x, hemAt + z]);
  const top: P2[] = [];
  for (let i = 0; i <= 64; i++) {
    const x = QUILT_RIGHT - (i / 64) * width;
    // Rounded at both ends, so the quilt does not end in a corner.
    const edge = Math.min(1, Math.min(QUILT_RIGHT - x, x - left) / 8);
    top.push([x, hemAt + (quiltTop(x) - hemAt) * Math.sqrt(1 - (1 - edge) ** 2)]);
  }
  const outline: P2[] = [...hem, [QUILT_RIGHT, hemAt + 4], ...top];
  const front = -HALF_DEPTH - 2;
  extrude(b.mesh(k.rose), outline, FRONT(0, front, 0), -(HALF_DEPTH + 30), 0, { smooth: 62 });
  // A band of lilac above the hem, and stars sewn on the front face, which comes out toward the
  // viewer a little.
  const lay = (poly: readonly P2[], mesh: number, depth: number): void =>
    extrude(b.mesh(mesh), poly, FRONT(0, front, 0), -0.2, depth);
  lay(
    [
      [left + 2, 23],
      [QUILT_RIGHT - 2, 23],
      [QUILT_RIGHT - 2, 29],
      [left + 2, 29],
    ],
    k.lilac,
    1.4,
  );
  lay(
    star(11).map(([x, z]): P2 => [left + 56 + x, 46 + z]),
    k.gold,
    2.2,
  );
  lay(
    star(7).map(([x, z]): P2 => [left + 100 + x, 40 + z]),
    k.gold,
    2.2,
  );
  lay(
    star(5).map(([x, z]): P2 => [left + 30 + x, 41 + z]),
    k.gold,
    2.2,
  );
  return b;
}

export function renderNapBed(): Rgba {
  const r = draw(napBed(), { aoRadius: 8 });
  const [gx, gy] = r.at(v3(HALF_LENGTH + 3, HALF_DEPTH + 2, 78));
  glint(r.rgba, Math.round(gx), Math.round(gy), 3);
  return r.rgba;
}

export function renderNapQuilt(): Rgba {
  return draw(napQuilt(), { aoRadius: 5, lineDepth: 4 }).rgba;
}
