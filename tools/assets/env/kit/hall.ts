import { crop, type Rgba } from '../../../art/core/image';
import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import {
  HALL,
  HALL_DOOR_GEOMETRY,
  HALL_DOOR_STYLE,
  HALL_ROOM_DOOR_STYLE,
  HALL_THEME,
  type HallTheme,
  ROSE_THEME,
  renderHallColumn,
  renderHallSide,
  renderHallWall,
  SAGE_THEME,
  SKY_THEME,
  type WallPiece,
} from '../../../art/world/hall';
import type { BundleId, Recipe } from '../types';

const SRC = [
  'assets/env/kit/hall.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/treasure.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/** The map is 1152 units tall, and the side walls run its full height. */
export const HALL_MAP_HEIGHT = 1152;

const once = <T>(make: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const doorWall = once(() => renderHallWall('door'));
const copy = (img: Rgba): Rgba => crop(img, 0, 0, img.width, img.height);

/**
 * The architecture of a hall: the back wall in pieces, the columns over its joints, the side walls,
 * and the door seen from inside.
 */
export function shell(
  bundle: BundleId,
  pieces: readonly WallPiece[],
  prefix: string,
  doorId: string | null,
  theme: HallTheme = HALL_THEME,
): Recipe[] {
  const piece = (name: WallPiece): Recipe => ({
    id: `${prefix}-wall-${name}`,
    bundle,
    canvas: HALL.wall,
    render: () => (name === 'door' && theme === HALL_THEME ? copy(doorWall()) : renderHallWall(name, theme)),
    source: SRC,
  });
  const door: Recipe[] =
    doorId === null
      ? []
      : [
          {
            id: doorId,
            bundle,
            canvas: doorCanvas(HALL_DOOR_GEOMETRY),
            anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
            render: (f) => renderDoor(HALL_DOOR_GEOMETRY, HALL_DOOR_STYLE, f, doorWall()),
            source: SRC,
          },
        ];
  return [
    ...pieces.map(piece),
    {
      id: `${prefix}-column`,
      bundle,
      canvas: HALL.column,
      render: () => renderHallColumn(theme),
      source: SRC,
      shadow: { rx: 30, ry: 9, dx: 8, dy: 3, a: 0.24 },
    },
    {
      id: `${prefix}-side-west`,
      bundle,
      canvas: { w: HALL.side + HALL.sideShadow, h: HALL_MAP_HEIGHT, ox: 0, oy: 0 },
      render: () => renderHallSide(HALL_MAP_HEIGHT, false, theme),
      source: SRC,
    },
    {
      id: `${prefix}-side-east`,
      bundle,
      canvas: { w: HALL.side + HALL.sideShadow, h: HALL_MAP_HEIGHT, ox: HALL.side + HALL.sideShadow, oy: 0 },
      render: () => renderHallSide(HALL_MAP_HEIGHT, true, theme),
      source: SRC,
    },
    ...door,
  ];
}

/** The treasure house: a niche wall, the doorway wall, another niche wall. */
export const HALL_RECIPES: Recipe[] = shell('treasure-house', ['left', 'door', 'right'], 'hall', 'door-treasure-in');

/**
 * The throne room: a longer wall of five pieces, with the doorway second and the throne's arch in
 * the middle. It has a doorway at each end as well, for the dining room and the gallery, and the
 * door that opens between two rooms of the palace is drawn over all of them.
 */
export const PALACE_HALL_RECIPES: Recipe[] = [
  ...shell('palace-hall', ['left', 'door', 'doorL', 'doorR', 'throne', 'right'], 'ph', 'door-palace-in'),
  {
    id: 'door-palace-room',
    bundle: 'palace-hall',
    canvas: doorCanvas(HALL_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(HALL_DOOR_GEOMETRY, HALL_ROOM_DOOR_STYLE, f, doorWall()),
    source: SRC,
  },
];

/**
 * The rooms of the palace beyond the throne room: the same wall in another colour, each with the
 * pieces its rooms use.
 */
const ROOM_PIECES: readonly WallPiece[] = ['left', 'right', 'door', 'doorL', 'doorR'];
export const PALACE_ROOM_RECIPES: Recipe[] = [
  ...shell('palace-hall', [...ROOM_PIECES, 'windows'], 'pr', null, ROSE_THEME),
  ...shell('palace-hall', [...ROOM_PIECES, 'windows'], 'ps', null, SKY_THEME),
  ...shell('palace-hall', [...ROOM_PIECES, 'flowers'], 'pg', null, SAGE_THEME),
];
