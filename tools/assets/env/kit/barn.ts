import { crop, type Rgba } from '../../../art/core/image';
import {
  BARN,
  BARN_DOOR_GEOMETRY,
  BARN_DOOR_STYLE,
  type BarnPiece,
  renderBarnFrame,
  renderBarnPost,
  renderBarnSide,
  renderBarnWall,
} from '../../../art/world/barn';
import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/barn.ts',
  'art/world/barn.ts',
  'art/world/feed.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/walls.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/** The map is 1536 units tall, and the side walls run its full height. */
export const BARN_MAP_HEIGHT = 1536;

const once = <T>(make: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const doorWall = once(() => renderBarnWall('door'));
const copy = (img: Rgba): Rgba => crop(img, 0, 0, img.width, img.height);
const piece = (name: BarnPiece): Recipe => ({
  id: `barn-wall-${name}`,
  bundle: 'stable',
  canvas: name === 'bay-west' || name === 'bay-east' || name === 'door' ? BARN.wall : BARN.end,
  render: () => (name === 'door' ? copy(doorWall()) : renderBarnWall(name)),
  source: SRC,
});

/**
 * The stable's architecture: the back wall in pieces, the frames and posts at the front of the
 * stalls, the side walls, and the door seen from inside.
 */
export const BARN_RECIPES: Recipe[] = [
  piece('end-west'),
  piece('bay-west'),
  piece('door'),
  piece('bay-east'),
  piece('end-east'),
  {
    id: 'barn-frame',
    bundle: 'stable',
    canvas: BARN.frame,
    render: renderBarnFrame,
    source: SRC,
    shadow: { rx: 26, ry: 8, dx: 8, dy: 3, a: 0.22 },
  },
  {
    id: 'barn-post',
    bundle: 'stable',
    canvas: BARN.post,
    render: renderBarnPost,
    source: SRC,
    shadow: { rx: 16, ry: 6, dx: 6, dy: 2, a: 0.22 },
  },
  {
    id: 'barn-side-west',
    bundle: 'stable',
    canvas: { w: BARN.side + BARN.sideShadow, h: BARN_MAP_HEIGHT, ox: 0, oy: 0 },
    render: () => renderBarnSide(BARN_MAP_HEIGHT, false),
    source: SRC,
  },
  {
    id: 'barn-side-east',
    bundle: 'stable',
    canvas: { w: BARN.side + BARN.sideShadow, h: BARN_MAP_HEIGHT, ox: BARN.side + BARN.sideShadow, oy: 0 },
    render: () => renderBarnSide(BARN_MAP_HEIGHT, true),
    source: SRC,
  },
  {
    id: 'door-stable-in',
    bundle: 'stable',
    canvas: doorCanvas(BARN_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(BARN_DOOR_GEOMETRY, BARN_DOOR_STYLE, f, doorWall()),
    source: SRC,
  },
];
