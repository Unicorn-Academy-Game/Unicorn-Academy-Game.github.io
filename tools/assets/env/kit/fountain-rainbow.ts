import { pieceSprite } from '../../../../src/content/fountain-rainbow';
import { ARCH_CANVAS, archPieces, renderArchPiece } from '../../../art/world/fountain-rainbow';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/fountain-rainbow.ts',
  'art/world/fountain-rainbow.ts',
  '../src/content/fountain-horns.ts',
  '../src/content/fountain-rainbow.ts',
];

/**
 * The pieces of the arch over the palace garden's fountain, each in the canvas of the whole arch so
 * they all stand where the host is.
 */
export const FOUNTAIN_RAINBOW_RECIPES: Recipe[] = archPieces().map(({ piece, side }) => ({
  id: pieceSprite(piece, side),
  bundle: 'garden',
  canvas: ARCH_CANVAS,
  render: () => renderArchPiece(piece, side),
  source: SRC,
}));
