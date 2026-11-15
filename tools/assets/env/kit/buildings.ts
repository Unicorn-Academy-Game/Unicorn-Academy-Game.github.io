import { crop, type Rgba } from '../../../art/core/image';
import { renderStableExterior, renderTreasureHouse, STABLE, TREASURE } from '../../../art/world/buildings';
import {
  DOOR_FRAMES,
  type DoorGeometry,
  doorCanvas,
  renderDoor,
  STABLE_DOOR,
  TREASURE_DOOR,
} from '../../../art/world/doors';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/buildings.ts',
  'art/world/buildings.ts',
  'art/world/feed.ts',
  'art/world/doors.ts',
  'art/world/walls.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

const doorOf = (b: typeof TREASURE | typeof STABLE): DoorGeometry => ({
  building: b.canvas,
  base: [b.doorBase.x, b.doorBase.y, b.doorBase.z],
  w: b.door.w,
  h: b.door.h,
});
const TREASURE_GEO = doorOf(TREASURE);
const STABLE_GEO = doorOf(STABLE);

/**
 * A door is found in its building's pixels, and a door has several frames, so the building renders
 * once.
 */
const once = <T>(make: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const copy = (img: Rgba): Rgba => crop(img, 0, 0, img.width, img.height);
const treasureHouse = once(renderTreasureHouse);
const stableHouse = once(renderStableExterior);

const DOOR_ANIM = { frames: DOOR_FRAMES, fps: 12, loop: false } as const;

/**
 * The two houses on the palace grounds, seen from outside. Their doors are separate sprites so they
 * can swing.
 */
export const BUILDING_RECIPES: Recipe[] = [
  {
    id: 'treasure-house',
    bundle: 'garden',
    canvas: TREASURE.canvas,
    render: () => copy(treasureHouse()),
    source: SRC,
    shadow: { rx: 230, ry: 48, dx: 26, dy: 10, a: 0.26 },
  },
  {
    id: 'stable-house',
    bundle: 'garden',
    canvas: STABLE.canvas,
    render: () => copy(stableHouse()),
    source: SRC,
    shadow: { rx: 240, ry: 46, dx: 26, dy: 10, a: 0.26 },
  },
  // A door shares its building's anchor as its origin, so a map places each at the building's own
  // position.
  {
    id: 'door-treasure',
    bundle: 'garden',
    canvas: doorCanvas(TREASURE_GEO),
    anim: DOOR_ANIM,
    render: (f) => renderDoor(TREASURE_GEO, TREASURE_DOOR, f, treasureHouse()),
    source: SRC,
  },
  {
    id: 'door-stable',
    bundle: 'garden',
    canvas: doorCanvas(STABLE_GEO),
    anim: DOOR_ANIM,
    render: (f) => renderDoor(STABLE_GEO, STABLE_DOOR, f, stableHouse()),
    source: SRC,
  },
];
