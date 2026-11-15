import { UNICORN_FACINGS, type UnicornFacing } from '../../src/shared/compass';
import type { ClipName } from '../../src/shared/ids';
import type { UnicornAsset } from '../../src/shared/manifest';
import { canvasOf, firstSheetPictureOf, type Picture, pictureOf, silhouette } from '../lib/unicorn-pictures';

/** An ellipse about a point on her centre line `cy` above her feet, in world units. */
export interface Body {
  rx: number;
  ry: number;
  cy: number;
}

/**
 * The clips the ellipse is fitted to: the two she is drawn in nearly all the time, and the two that
 * have a picture for every facing. Her other poses are lower than these and sit inside it.
 */
const FITTED_CLIPS: readonly ClipName[] = ['walk', 'idle'];

/**
 * The share of the pixels she is drawn with that the fitted ellipse holds. The horn tip, the end of
 * the tail and the tips of the mane stay out: holding them takes an ellipse half as big again.
 */
export const COVER = 0.98;

/**
 * What is added to both radii after the fit, so that a finger that lands just beside her still
 * counts.
 */
export const MARGIN = 6;

/**
 * Where she is drawn at a facing, in world units from her feet and upward. Each point weighs the
 * share of her frames that it is drawn in.
 */
export interface Mass {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly weight: Float64Array;
  readonly total: number;
}

/**
 * Which pictures she is drawn with: the finest there are, or only those of the first sheet, as on a
 * device that never loads the rest.
 */
export type Sheets = 'fine' | 'first';

/**
 * Every pixel that any frame of her walking and standing at `facing` covers, for all of the
 * unicorns given.
 */
export function drawnMass(unicorns: readonly UnicornAsset[], facing: UnicornFacing, sheets: Sheets = 'fine'): Mass {
  const pick: (asset: UnicornAsset, name: ClipName, facing: UnicornFacing) => Picture =
    sheets === 'fine' ? pictureOf : firstSheetPictureOf;
  const first = unicorns[0];
  if (!first) throw new Error('no unicorn to measure');
  const { width, height } = canvasOf(first);
  const [originX, originY] = first.origin;
  const seen = new Float64Array(width * height);
  let frames = 0;
  for (const asset of unicorns) {
    if (asset.origin[0] !== originX || asset.origin[1] !== originY)
      throw new Error('the unicorns are not drawn from one ground anchor');
    for (const name of FITTED_CLIPS) {
      const picture = pick(asset, name, facing);
      for (let frame = 0; frame < picture.clip.frames.length; frame++) {
        const covered = silhouette(picture, frame);
        if (covered.length !== seen.length) throw new Error('the unicorns are not drawn on one canvas');
        for (let i = 0; i < covered.length; i++) seen[i]! += covered[i]!;
        frames++;
      }
    }
  }
  const x: number[] = [];
  const y: number[] = [];
  const weight: number[] = [];
  let total = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] === 0) continue;
    x.push((i % width) + 0.5 - originX);
    y.push(originY - (Math.floor(i / width) + 0.5));
    weight.push(seen[i]! / frames);
    total += seen[i]! / frames;
  }
  return { x: Float64Array.from(x), y: Float64Array.from(y), weight: Float64Array.from(weight), total };
}

/** The share of the mass that is inside the body. */
export function holds(mass: Mass, body: Body): number {
  let inside = 0;
  for (let i = 0; i < mass.x.length; i++) {
    if ((mass.x[i]! / body.rx) ** 2 + ((mass.y[i]! - body.cy) / body.ry) ** 2 <= 1) inside += mass.weight[i]!;
  }
  return inside / mass.total;
}

const BIN = 0.25;
const BINS = 2000;

/**
 * The smallest half-width for which an ellipse of this height and shape holds `share` of the mass,
 * to a quarter of a unit.
 */
function radiusHolding(mass: Mass, cy: number, aspect: number, share: number): number {
  const bins = new Float64Array(BINS);
  for (let i = 0; i < mass.x.length; i++) {
    const up = (mass.y[i]! - cy) / aspect;
    const r = Math.sqrt(mass.x[i]! * mass.x[i]! + up * up);
    bins[Math.min(BINS - 1, Math.floor(r / BIN))]! += mass.weight[i]!;
  }
  let held = 0;
  for (let b = 0; b < BINS; b++) {
    held += bins[b]!;
    if (held >= share * mass.total - 1e-9) return (b + 1) * BIN;
  }
  return BINS * BIN;
}

/**
 * The ellipse of least area, centered on her feet's column, that holds `COVER` of the mass: a
 * coarse search over its height and shape, then a fine one round the best.
 */
function fitEllipse(mass: Mass): Body {
  let best = { rx: 0, ry: 0, cy: 0, area: Infinity };
  const consider = (cy: number, aspect: number): void => {
    const rx = radiusHolding(mass, cy, aspect, COVER);
    const area = rx * rx * aspect;
    if (area < best.area) best = { rx, ry: rx * aspect, cy, area };
  };
  for (let i = 0; i <= 14; i++) for (let j = 0; j <= 11; j++) consider(20 + 5 * i, 0.4 + 0.2 * j);
  const around = { cy: best.cy, aspect: best.ry / best.rx };
  for (let i = -5; i <= 5; i++) for (let j = -4; j <= 4; j++) consider(around.cy + i, around.aspect + 0.05 * j);
  return { rx: best.rx, ry: best.ry, cy: best.cy };
}

/**
 * The ellipse a tap on a unicorn is tested against, for each of the 32 facings: the smallest that
 * holds `COVER` of her drawn pixels, fitted separately to each facing and then smoothed along the
 * ring so that it follows her as she turns and not the rounding of one picture, and `MARGIN` wider
 * than that on both sides.
 */
export function fitBodies(unicorns: readonly UnicornAsset[]): Body[] {
  const fitted = UNICORN_FACINGS.map((facing) => fitEllipse(drawnMass(unicorns, facing)));
  const at = (i: number): Body => fitted[(i + fitted.length) % fitted.length]!;
  return fitted.map((_, i) => {
    const mean = (pick: (b: Body) => number): number => (pick(at(i - 1)) + 2 * pick(at(i)) + pick(at(i + 1))) / 4;
    return {
      rx: Math.ceil(mean((b) => b.rx)) + MARGIN,
      ry: Math.ceil(mean((b) => b.ry)) + MARGIN,
      cy: Math.round(mean((b) => b.cy)),
    };
  });
}
