import { BANNER, renderBanner } from '../../../art/world/banner';
import { BANNER_ROD_RISE, PALACE_PIECES, type PalacePiece, renderPiece } from '../../../art/world/palace';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/palace.ts',
  'art/world/palace.ts',
  'art/world/banner.ts',
  'art/world/arch.ts',
  'art/world/walls.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
  'art/core/edt.ts',
];

const SLUG: Record<PalacePiece, string> = {
  keep: 'palace-keep',
  'tower-left': 'palace-tower-left',
  'tower-right': 'palace-tower-right',
  'wing-left': 'palace-wing-left',
  'wing-right': 'palace-wing-right',
  'end-left': 'palace-end-left',
  'end-right': 'palace-end-right',
};

/**
 * The Fairy Palace. Every piece is drawn around its own origin and the map places it at
 * `PALACE_PIECES[piece].at` from the keep, so the pieces line up on the pixel grid. The banner
 * hangs from the keep's rod and sways.
 */
export const PALACE_RECIPES: Recipe[] = [
  ...(Object.keys(PALACE_PIECES) as PalacePiece[]).map(
    (piece): Recipe => ({
      id: SLUG[piece],
      bundle: 'garden',
      canvas: PALACE_PIECES[piece].canvas,
      render: () => renderPiece(piece, PALACE_PIECES[piece].canvas, 3).img,
      source: SRC,
    }),
  ),
  {
    id: 'palace-banner',
    bundle: 'garden',
    canvas: { w: BANNER.canvas.w, h: BANNER.canvas.h, ox: BANNER.canvas.w / 2, oy: BANNER_ROD_RISE + BANNER.rodY },
    anim: { frames: BANNER.frames, fps: BANNER.fps, loop: true },
    render: (frame) => renderBanner(frame),
    source: SRC,
  },
];
