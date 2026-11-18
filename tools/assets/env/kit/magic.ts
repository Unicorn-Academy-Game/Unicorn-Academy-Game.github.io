import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import {
  HALL_DOOR_GEOMETRY,
  MAGIC_DOOR_STYLE,
  MAGIC_THEME,
  renderHallWall,
  type WallPiece,
} from '../../../art/world/hall';
import {
  BOOK,
  BOOK_COVERS,
  BOOK_FRAMES,
  CANDLE_FRAMES,
  CANDLES,
  CIRCLE,
  CIRCLE_FRAMES,
  GLOBE,
  GLOBE_FRAMES,
  renderBook,
  renderCandles,
  renderCircle,
  renderGlobe,
} from '../../../art/world/magic-interior';
import type { Recipe } from '../types';
import { CAVE_RECIPES } from './cave';
import { shell } from './hall';
import { MANOR_RECIPES } from './manor';
import { reuse as reuseFrom } from './reuse';

const reuse = (from: readonly Recipe[], ids: readonly string[]): Recipe[] => reuseFrom(from, ids, 'mh', 'magic');

const SRC = [
  'assets/env/kit/magic.ts',
  'art/world/magic-interior.ts',
  'art/world/magic-hall.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

const PIECES: readonly WallPiece[] = ['left', 'right', 'door', 'doorL', 'doorR', 'windows'];

const shadow = (rx: number, ry: number, dx = 0, a = 0.28) => ({ rx, ry, dx, dy: 2, a });

/**
 * The Magic Hall inside: the architecture in pearl and violet, the door from inside, and the
 * things that float, turn and glow, with the fountain, cauldron and lights it borrows.
 */
export const MAGIC_RECIPES: Recipe[] = [
  ...shell('magic', PIECES, 'mh', null, MAGIC_THEME),
  {
    id: 'door-magic-in',
    bundle: 'magic',
    canvas: doorCanvas(HALL_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(HALL_DOOR_GEOMETRY, MAGIC_DOOR_STYLE, f, renderHallWall('door', MAGIC_THEME)),
    source: SRC,
  },
  ...BOOK_COVERS.map(
    (c): Recipe => ({
      id: `mh-book-${c}`,
      bundle: 'magic',
      canvas: BOOK,
      anim: { frames: BOOK_FRAMES, fps: 6, loop: true },
      render: (f) => renderBook(c, f),
      source: SRC,
      shadow: shadow(40, 11, 6),
      footprint: { r: 30 },
    }),
  ),
  {
    id: 'mh-globe',
    bundle: 'magic',
    canvas: GLOBE,
    anim: { frames: GLOBE_FRAMES, fps: 8, loop: true },
    render: renderGlobe,
    source: SRC,
    shadow: shadow(52, 14, 8),
    footprint: { r: 40 },
  },
  {
    id: 'mh-candles',
    bundle: 'magic',
    canvas: CANDLES,
    anim: { frames: CANDLE_FRAMES, fps: 6, loop: true },
    render: renderCandles,
    source: SRC,
    shadow: shadow(56, 14, 6, 0.22),
    footprint: { r: 40 },
  },
  {
    id: 'mh-circle',
    bundle: 'magic',
    canvas: CIRCLE,
    anim: { frames: CIRCLE_FRAMES, fps: 6, loop: true },
    render: renderCircle,
    source: SRC,
  },
  ...reuse(MANOR_RECIPES, ['sg-fountain-lotus', 'mn-chandelier', 'mn-chandelier-shadow']),
  ...reuse(CAVE_RECIPES, [
    'cc-cauldron',
    'cc-orb-stand',
    'cc-orb',
    'cc-wisp',
    'cc-halo',
    'cc-mushrooms-cyan',
    'cc-mushrooms-rose',
    'cc-mushrooms-gold',
    'cc-mushrooms-lilac',
    'cc-mushrooms-mint',
    'cc-bulbs-1',
    'cc-bulbs-2',
    'cc-chimes',
  ]),
];
