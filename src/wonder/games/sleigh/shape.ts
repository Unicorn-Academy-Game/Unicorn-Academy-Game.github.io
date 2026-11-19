/**
 * The houses of the village the sleigh flies over, in units of their own. Each stands with the
 * middle of its foot at (0, 0), and up is negative. The shapes are data so that the layout, the
 * pictures and the tests all read the same house.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Spot {
  readonly x: number;
  readonly y: number;
}

export interface HouseShape {
  readonly name: 'cottage' | 'townhouse' | 'cabin' | 'bakery';
  readonly wall: Box;
  /** The roof is a gable: its eave runs `half` either side of the middle at `eave`, up to an apex. */
  readonly roof: { readonly half: number; readonly eave: number; readonly apex: number };
  /** The chimney: the middle of its mouth, its top, how wide it is and where it joins the roof. */
  readonly chimney: { readonly x: number; readonly top: number; readonly w: number; readonly base: number };
  readonly windows: readonly Box[];
  readonly door: Box;
}

export const HOUSES: readonly HouseShape[] = [
  {
    name: 'cottage',
    wall: { x: -42, y: -46, w: 84, h: 46 },
    roof: { half: 54, eave: -44, apex: -88 },
    chimney: { x: 28, top: -96, w: 14, base: -62 },
    windows: [
      { x: -31, y: -35, w: 17, h: 17 },
      { x: 14, y: -35, w: 17, h: 17 },
    ],
    door: { x: -8, y: -31, w: 16, h: 31 },
  },
  {
    name: 'townhouse',
    wall: { x: -32, y: -86, w: 64, h: 86 },
    roof: { half: 42, eave: -84, apex: -122 },
    chimney: { x: -18, top: -138, w: 12, base: -102 },
    windows: [
      { x: -23, y: -74, w: 15, h: 17 },
      { x: 8, y: -74, w: 15, h: 17 },
      { x: -23, y: -48, w: 15, h: 17 },
      { x: 8, y: -48, w: 15, h: 17 },
    ],
    door: { x: -8, y: -26, w: 16, h: 26 },
  },
  {
    name: 'cabin',
    wall: { x: -56, y: -42, w: 112, h: 42 },
    roof: { half: 68, eave: -40, apex: -70 },
    chimney: { x: 38, top: -100, w: 16, base: -50 },
    windows: [
      { x: -45, y: -33, w: 19, h: 17 },
      { x: 26, y: -33, w: 19, h: 17 },
    ],
    door: { x: -9, y: -30, w: 18, h: 30 },
  },
  {
    name: 'bakery',
    wall: { x: -48, y: -60, w: 96, h: 60 },
    roof: { half: 58, eave: -58, apex: -84 },
    chimney: { x: -30, top: -110, w: 14, base: -68 },
    windows: [
      { x: -41, y: -44, w: 34, h: 25 },
      { x: 29, y: -44, w: 14, h: 17 },
    ],
    door: { x: 6, y: -34, w: 16, h: 34 },
  },
];

/** How tall the tallest of them is, with its chimney, and how wide the widest is, with its eaves. */
export const TALLEST = Math.max(...HOUSES.map((h) => -h.chimney.top));
export const WIDEST = Math.max(...HOUSES.map((h) => h.roof.half * 2));

/** The bulbs along the roof of a house that has had its present, from one eave up and over to the other. */
export const EAVE_BULBS = 11;

/** Where bulb `i` of the string along a roof hangs. */
export function eaveBulb(shape: HouseShape, i: number): Spot {
  const { half, eave, apex } = shape.roof;
  // The first half of the string climbs the left slope, the middle one is the apex, the rest come down.
  const mid = (EAVE_BULBS - 1) / 2;
  const u = Math.abs(i - mid) / mid;
  const side = i < mid ? -1 : 1;
  return { x: side * u * (half - 4), y: apex + (eave - apex) * u + 4 };
}

/** Where a present has to go to be down the chimney: the middle of its mouth. */
export const chimneyMouth = (shape: HouseShape): Spot => ({ x: shape.chimney.x, y: shape.chimney.top });
