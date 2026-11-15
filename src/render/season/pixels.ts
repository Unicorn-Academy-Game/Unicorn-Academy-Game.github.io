/**
 * A picture as the browser's canvas and the tools both hold it: straight RGBA, four bytes a pixel,
 * a row after a row.
 */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/**
 * What a sprite is, for the seasons. A tree turns with the year, a blossom tree is pink and white
 * in spring, a conifer only goes white under snow, a flower is out in the warm and under the snow
 * in the cold, a rock or a fence only takes a cap of snow, a house has snow on its roof, the sky
 * goes grey in winter, and some things are never touched.
 */
export type Role =
  | 'tree'
  | 'blossom'
  | 'conifer'
  | 'plant'
  | 'flower'
  | 'rock'
  | 'building'
  | 'manor'
  | 'prop'
  | 'sky'
  | 'distant'
  | 'skip';

/**
 * One picture on a page: where it sits and what it is. The seasons are worked out a picture at a
 * time, so each has its own top and its own light.
 */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  role: Role;
}
