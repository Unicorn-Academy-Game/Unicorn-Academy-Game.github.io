import { CABIN_DOOR_STYLE, CABIN_THEME } from '../../../art/world/cabin-hall';
import { armchair, cabinLight, cookieTable, hearth, sack, toyShelf, workbench } from '../../../art/world/cabin-inside';
import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import { christmasTree, glowOf, renderGrove } from '../../../art/world/grove';
import { HALL_DOOR_GEOMETRY, renderHallWall } from '../../../art/world/hall';
import type { SceneBuilder } from '../../../art/world/scene';
import type { Recipe } from '../types';
import { shell } from './hall';

const SRC = [
  'assets/env/kit/cabin.ts',
  'art/world/cabin-hall.ts',
  'art/world/cabin-inside.ts',
  'art/world/grove.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/trees.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/**
 * The inside of Santa's cabin: a hall's walls in red pine, which live in the grove's bundle so that
 * walking in costs no new download, the door from inside with the snow's light beyond it, and the
 * things that stand in the room. The cabin's lit doorway is drawn on the grove's own cabin, so it
 * lines up whatever the cabin's size.
 */
const HEARTH = { w: 264, h: 284, ox: 132, oy: 250 } as const;
const CHAIR = { w: 128, h: 148, ox: 64, oy: 126 } as const;
const BENCH = { w: 184, h: 124, ox: 92, oy: 104 } as const;
const SHELF = { w: 160, h: 214, ox: 80, oy: 196 } as const;
const TABLE = { w: 128, h: 92, ox: 64, oy: 76 } as const;
const SACK = { w: 112, h: 132, ox: 56, oy: 120 } as const;
const TREE = { w: 184, h: 252, ox: 98, oy: 232 } as const;
const CABIN = { w: 380, h: 340, ox: 190, oy: 270 } as const;
const FIRE_FRAMES = 4;
const LIGHT_FRAMES = 3;
const shadow = (rx: number, ry: number, dx = 0, a = 0.26) => ({ rx, ry, dx, dy: 2, a });

const make = (
  id: string,
  canvas: { w: number; h: number; ox: number; oy: number },
  scene: () => SceneBuilder,
  extra: Partial<Recipe> = {},
): Recipe => ({
  id,
  bundle: 'grove',
  canvas,
  render: () => renderGrove(scene(), canvas),
  source: SRC,
  ...extra,
});

const roomTree = (o: { lights: boolean; phase?: number }) => () => christmasTree({ ...o, scale: 0.6, snow: false });

export const CABIN_RECIPES: Recipe[] = [
  ...shell('grove', ['left', 'door', 'windows'], 'xw', null, CABIN_THEME),
  {
    id: 'door-cabin-in',
    bundle: 'grove',
    canvas: doorCanvas(HALL_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(HALL_DOOR_GEOMETRY, CABIN_DOOR_STYLE, f, renderHallWall('door', CABIN_THEME)),
    source: SRC,
  },
  make('xw-hearth', HEARTH, hearth, { shadow: shadow(118, 24, 12, 0.28) }),
  {
    id: 'xw-fire',
    bundle: 'grove',
    canvas: HEARTH,
    anim: { frames: FIRE_FRAMES, fps: 8, loop: true },
    render: (f) => glowOf(renderGrove(hearth({ frame: f }), HEARTH), 9, 0.55),
    source: SRC,
  },
  make('xw-armchair', CHAIR, armchair, { shadow: shadow(48, 12, 6, 0.26) }),
  make('xw-bench', BENCH, workbench, { shadow: shadow(80, 14, 6, 0.26) }),
  make('xw-toy-shelf', SHELF, toyShelf, { shadow: shadow(72, 12, 6, 0.26) }),
  make('xw-cookies', TABLE, cookieTable, { shadow: shadow(54, 13, 4, 0.26) }),
  make('xw-sack', SACK, sack, { shadow: shadow(40, 11, 4, 0.26) }),
  make('xw-tree', TREE, roomTree({ lights: false }), { shadow: shadow(70, 18, 16, 0.28) }),
  {
    id: 'xw-tree-lights',
    bundle: 'grove',
    canvas: TREE,
    anim: { frames: LIGHT_FRAMES, fps: 3, loop: true },
    render: (f) => glowOf(renderGrove(roomTree({ lights: true, phase: f })(), TREE), 6, 0.6),
    source: SRC,
  },
  {
    id: 'xm-cabin-lit',
    bundle: 'grove',
    canvas: CABIN,
    render: () => glowOf(renderGrove(cabinLight(), CABIN), 9, 0.8),
    source: SRC,
  },
];
