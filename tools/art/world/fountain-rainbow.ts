import { ARCH, HORN_TIPS } from '../../../src/content/fountain-horns';
import {
  ARCH_GROUPS,
  ARCH_PIECES,
  type ArchGroup,
  type ArchPiece,
  type ArchSide,
  PIECES_PER_SIDE,
} from '../../../src/content/fountain-rainbow';
import { hex, type RGB } from '../core/color';
import { createRgba, type Rgba } from '../core/image';

/**
 * The arch of the rainbow over the palace garden's fountain, painted once whole and then cut into
 * the pieces the game shows and hides one by one. Its bands are the colors of the small rainbow the
 * palace door makes (`fx-rainbow`), drawn with hard edges and no scaling, and it ends in a fade at
 * each horn so that it seems to pour out of the tip.
 */

const BANDS: readonly RGB[] = ['#ff6f7d', '#ffa65c', '#ffe066', '#7fdc7a', '#5ec7f2', '#7d8cf0', '#c58cf0'].map(hex);
const OUTLINE = hex('#6d5aa8');

const HALF_SPAN = HORN_TIPS.right.x;
/** How far the outermost band lies from the middle of the bands. */
const REACH = (ARCH.bands * ARCH.band) / 2;
/** The outline is one pixel out from the outermost band and one in from the innermost. */
const EDGE = REACH + 1;
/** How much of the outer edge catches the light. */
const GLINT_DEPTH = 1.2;
const GLINT_SHARE = 120 / 255;
/**
 * The arch fades out over this many pixels of its length at each horn, so it seems to pour out of
 * the tip.
 */
const FOOT = 34;

/**
 * The canvas the whole arch is drawn in and every piece is cut from. Its anchor is the host, on the
 * line between the horns.
 */
export const ARCH_CANVAS = {
  w: 2 * (HALF_SPAN + Math.ceil(EDGE)),
  h: ARCH.rise + Math.ceil(EDGE) + 2,
  ox: HALF_SPAN + Math.ceil(EDGE),
  oy: ARCH.rise + Math.ceil(EDGE),
} as const;

const SAMPLES = 720;
const COS = Float64Array.from({ length: SAMPLES + 1 }, (_, k) => Math.cos((Math.PI * k) / SAMPLES));
const SIN = Float64Array.from({ length: SAMPLES + 1 }, (_, k) => Math.sin((Math.PI * k) / SAMPLES));

/** The length of the middle of the bands from the left horn to each sample. */
const LENGTH = (() => {
  const out = new Float64Array(SAMPLES + 1);
  for (let k = 1; k <= SAMPLES; k++)
    out[k] = out[k - 1]! + Math.hypot(HALF_SPAN * (COS[k]! - COS[k - 1]!), ARCH.rise * (SIN[k]! - SIN[k - 1]!));
  return out;
})();

const distanceSquared = (x: number, y: number, angle: number): number =>
  (x + HALF_SPAN * Math.cos(angle)) ** 2 + (y + ARCH.rise * Math.sin(angle)) ** 2;

/**
 * Where the point (x, y), measured from the host, is on the arch: the angle of the nearest point on
 * the middle of the bands, which runs from 0 at the left horn to pi at the right, and how far out
 * from it the point lies, outward positive.
 */
function locate(x: number, y: number): { angle: number; across: number } {
  let best = 0;
  let nearest = Infinity;
  for (let k = 0; k <= SAMPLES; k++) {
    const d = (x + HALF_SPAN * COS[k]!) ** 2 + (y + ARCH.rise * SIN[k]!) ** 2;
    if (d < nearest) {
      nearest = d;
      best = k;
    }
  }
  let lo = (Math.PI * Math.max(0, best - 1)) / SAMPLES;
  let hi = (Math.PI * Math.min(SAMPLES, best + 1)) / SAMPLES;
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (distanceSquared(x, y, a) < distanceSquared(x, y, b)) hi = b;
    else lo = a;
  }
  const angle = (lo + hi) / 2;
  const outside = (x / HALF_SPAN) ** 2 + (y / ARCH.rise) ** 2 > 1;
  return { angle, across: (outside ? 1 : -1) * Math.sqrt(distanceSquared(x, y, angle)) };
}

/** How far along the middle of the bands from the left horn the nearest point to an angle is. */
function lengthAt(angle: number): number {
  const at = (angle / Math.PI) * SAMPLES;
  const k = Math.min(SAMPLES - 1, Math.floor(at));
  return LENGTH[k]! + (LENGTH[k + 1]! - LENGTH[k]!) * (at - k);
}

/**
 * Where the piece cuts are, as angles of the middle of the bands from the horn, one every twelfth
 * of a quarter turn. The cuts are only ever along a row of pixels where the arch is steep and along
 * a column where it is flat, never slanted. The game smooths the edge of every sprite, and where a
 * cut is not on the edge of the sprite's frame the edge pixels are blended with the transparent
 * ones beside them, so two slanted pieces meet in a thin line that lets the ground show through. A
 * cut on the frame's edge is blended with the pixels the atlas copies out from it, and does not
 * show. The one cut that does follow the arch, between the outer bands and the inner ones, is on
 * the line between two colors, where a thin line is not seen.
 */
const CUT_ANGLES = Array.from({ length: PIECES_PER_SIDE - 1 }, (_, k) => ((k + 1) * Math.PI) / 2 / PIECES_PER_SIDE);
const isRowCut = (angle: number): boolean => ARCH.rise * Math.cos(angle) > HALF_SPAN * Math.sin(angle);
const ROW_CUTS = CUT_ANGLES.filter(isRowCut).map((angle) => ARCH.rise * Math.sin(angle));
const COLUMN_CUTS = CUT_ANGLES.filter((angle) => !isRowCut(angle)).map((angle) => HALF_SPAN * Math.cos(angle));

/**
 * The place along the arch from the horn of the piece a pixel is in, from how high it is above the
 * line between the horns and how far it is from the middle.
 */
function placeOf(fromMiddle: number, high: number): number {
  const row = ROW_CUTS.findIndex((cut) => high < cut);
  if (row >= 0) return row;
  const column = COLUMN_CUTS.findIndex((cut) => fromMiddle >= cut);
  return ROW_CUTS.length + (column >= 0 ? column : COLUMN_CUTS.length);
}

/**
 * Which piece a painted pixel belongs to, as a number that tells its side, its group and its place
 * along the arch.
 */
const codeOf = (side: ArchSide, group: ArchGroup, index: number): number =>
  (side === 'right' ? 256 : 0) + (group === 'inner' ? 16 : 0) + index;

interface Painted {
  image: Rgba;
  /** For every pixel, the piece it belongs to, or -1 where nothing is painted. */
  code: Int16Array;
}

const bandOf = (across: number): number => Math.min(ARCH.bands - 1, Math.floor((REACH - across) / ARCH.band));

const lerp = (from: RGB, to: RGB, t: number): RGB => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
  from[2] + (to[2] - from[2]) * t,
];

let painted: Painted | undefined;

function paint(): Painted {
  const { w, h, ox, oy } = ARCH_CANVAS;
  const image = createRgba(w, h);
  const code = new Int16Array(w * h).fill(-1);
  const full = LENGTH[SAMPLES]!;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px + 0.5 - ox;
      const y = py + 0.5 - oy;
      if (y > 0) continue;
      // Pixels far from the arch cannot be on it, which is most of the canvas.
      const g = (x / HALF_SPAN) ** 2 + (y / ARCH.rise) ** 2 - 1;
      if (Math.abs(g) > 0.55) continue;
      const { angle, across } = locate(x, y);
      if (Math.abs(across) > EDGE) continue;
      const length = lengthAt(angle);
      const reach = Math.min(1, Math.min(length, full - length) / FOOT);
      const alpha = Math.round(255 * reach * reach * (3 - 2 * reach));
      if (alpha === 0) continue;
      const band = bandOf(across);
      const edge = Math.abs(across) > REACH;
      let color: RGB = edge ? OUTLINE : BANDS[band]!;
      if (!edge && band === 0 && across > REACH - GLINT_DEPTH) color = lerp(color, [255, 255, 255], GLINT_SHARE);
      const i = py * w + px;
      image.data.set([Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), alpha], i * 4);
      const side: ArchSide = x < 0 ? 'left' : 'right';
      const index = placeOf(Math.abs(x), -y);
      // The outline goes with the group it borders.
      const group: ArchGroup =
        (edge ? (across > 0 ? 0 : ARCH.bands - 1) : band) <= ARCH_GROUPS.outer.last ? 'outer' : 'inner';
      code[i] = codeOf(side, group, index);
    }
  }
  return { image, code };
}

/** The whole arch, every piece in its place. */
export function renderArch(): Rgba {
  painted ??= paint();
  return painted.image;
}

/**
 * One side of one piece, alone in the arch's canvas, so the game can place it by the sprite's
 * anchor.
 */
export function renderArchPiece(piece: ArchPiece, side: ArchSide): Rgba {
  painted ??= paint();
  const { image, code } = painted;
  const out = createRgba(image.width, image.height);
  const want = codeOf(side, piece.group, piece.index);
  for (let i = 0; i < code.length; i++)
    if (code[i] === want) out.data.set(image.data.subarray(i * 4, i * 4 + 4), i * 4);
  return out;
}

/** Every piece on both sides, in the order the recipes list them. */
export const ARCH_SIDES: readonly ArchSide[] = ['left', 'right'];
export const archPieces = (): { piece: ArchPiece; side: ArchSide }[] =>
  ARCH_PIECES.flatMap((piece) => ARCH_SIDES.map((side) => ({ piece, side })));
