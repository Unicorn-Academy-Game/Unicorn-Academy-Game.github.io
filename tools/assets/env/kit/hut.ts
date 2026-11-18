import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import { HALL_DOOR_GEOMETRY, renderHallWall, WITCH_DOOR_STYLE, WITCH_THEME } from '../../../art/world/hall';
import type { Recipe } from '../types';
import { shell } from './hall';

const SRC = [
  'assets/env/kit/hut.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/**
 * The inside of the witch's hut: a hall's walls in honey timber, which live in the cave's bundle so
 * that walking in costs no new download, and the door from inside with the cave's light beyond it.
 */
export const HUT_RECIPES: Recipe[] = [
  ...shell('cave', ['left', 'door', 'right'], 'hw', null, WITCH_THEME),
  {
    id: 'door-hut-in',
    bundle: 'cave',
    canvas: doorCanvas(HALL_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(HALL_DOOR_GEOMETRY, WITCH_DOOR_STYLE, f, renderHallWall('door', WITCH_THEME)),
    source: SRC,
  },
];
