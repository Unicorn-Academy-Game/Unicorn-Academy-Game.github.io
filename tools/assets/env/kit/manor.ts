import { crop, type Rgba } from '../../../art/core/image';
import { DOOR_FRAMES, doorCanvas, renderDoor } from '../../../art/world/doors';
import {
  HALL,
  HALL_DOOR_GEOMETRY,
  type HallTheme,
  renderHallColumn,
  renderHallSide,
  renderHallWall,
  type WallPiece,
} from '../../../art/world/hall';
import {
  LIFT_GOLD_STYLE,
  LIFT_SECRET_STYLE,
  MANOR_DOOR_STYLE,
  MANOR_THEME,
  SKY_GARDEN_THEME,
} from '../../../art/world/manor-halls';
import { MANOR, MANOR_DOOR_GEOMETRY, MANOR_OUT_STYLE, renderManor } from '../../../art/world/manor-house';
import {
  CRYSTAL_TULIPS,
  GARDEN_SHADOW,
  GOLD_URN,
  HANGING_GARDEN,
  JADE_BONSAI,
  JEWEL_PLANTER,
  LOTUS_FOUNTAIN,
  LOTUS_FRAMES,
  ORCHID,
  renderCrystalTulips,
  renderGardenShadow,
  renderGoldUrn,
  renderHangingGarden,
  renderJadeBonsai,
  renderJewelPlanter,
  renderLotusFountain,
  renderOrchid,
} from '../../../art/world/manor-plants';
import { BADGE_CANVAS, renderBadge, renderStatue, STATUE, STATUES } from '../../../art/world/manor-statues';
import { CLUE_CANVAS, CLUE_FRAMES, GARLAND_CANVAS, renderClue, renderGarland } from '../../../art/world/manor-wall-art';
import {
  BAT_CANVAS,
  BAT_FRAMES,
  COBWEB_CANVAS,
  FENCE_CANVAS,
  LAMP_POST_CANVAS,
  PUMPKIN_CANVAS,
  renderBat,
  renderCobweb,
  renderFence,
  renderLampPost,
  renderPumpkin,
  renderTwistyTree,
  TWISTY_CANVAS,
} from '../../../art/world/manor-yard';
import {
  CHANDELIER_CANVAS,
  renderChandelier,
  renderShadowPool,
  SHADOW_POOL_CANVAS,
} from '../../../art/world/throne-room';
import { LAMP_CANVAS, renderLamp, renderUrn, URN_CANVAS, URN_GLAZES } from '../../../art/world/treasure';
import type { Recipe } from '../types';
import { HALL_MAP_HEIGHT } from './hall';

const SRC = [
  'assets/env/kit/manor.ts',
  'art/world/hall.ts',
  'art/world/doors.ts',
  'art/world/manor-halls.ts',
  'art/world/manor-flowers.ts',
  'art/world/manor-sky.ts',
  'art/world/treasure.ts',
  'art/world/throne-room.ts',
  'art/world/arch.ts',
  'art/world/manor-statues.ts',
  'art/world/manor-plants.ts',
  'art/world/manor-house.ts',
  'art/world/manor-yard.ts',
  'art/world/glow.ts',
  'art/world/walls.ts',
  'art/world/manor-wall-art.ts',
  'art/world/gems.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/** The Spooky Manor. Its pictures are in one bundle, used by the gallery and the sky garden. */
const STATUE_RECIPES: Recipe[] = [
  ...STATUES.map(
    (id): Recipe => ({
      id: `mn-statue-${id}`,
      bundle: 'manor',
      canvas: STATUE.canvas,
      render: () => renderStatue(id),
      source: SRC,
      shadow: { rx: 54, ry: 16, dx: 10, dy: 4, a: 0.3 },
      footprint: { r: 44 },
    }),
  ),
  ...STATUES.map(
    (id): Recipe => ({
      id: `mn-badge-${id}`,
      bundle: 'manor',
      canvas: BADGE_CANVAS,
      render: () => renderBadge(id),
      source: SRC,
    }),
  ),
];

/** Furniture the gallery shares with the palace, in its own colours. */
const FURNISHINGS: Recipe[] = [
  { id: 'mn-chandelier', bundle: 'manor', canvas: CHANDELIER_CANVAS, render: renderChandelier, source: SRC },
  { id: 'mn-chandelier-shadow', bundle: 'manor', canvas: SHADOW_POOL_CANVAS, render: renderShadowPool, source: SRC },
  {
    id: 'mn-urn-plum',
    bundle: 'manor',
    canvas: URN_CANVAS,
    render: () => renderUrn(URN_GLAZES.plum, 7),
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 30 },
  },
  {
    id: 'mn-lamp',
    bundle: 'manor',
    canvas: LAMP_CANVAS,
    render: renderLamp,
    source: SRC,
    shadow: { rx: 30, ry: 9, dx: 6, dy: 2, a: 0.26 },
    footprint: { r: 22 },
  },
];

const once = <T>(make: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};
const copy = (img: Rgba): Rgba => crop(img, 0, 0, img.width, img.height);

/** The wall pieces, columns and side walls of one floor. */
function floor(prefix: string, theme: HallTheme, pieces: readonly WallPiece[]): Recipe[] {
  const wall = (piece: WallPiece): (() => Rgba) => once(() => renderHallWall(piece, theme));
  const walls = new Map(pieces.map((n) => [n, wall(n)] as const));
  return [
    ...pieces.map(
      (name): Recipe => ({
        id: `${prefix}-wall-${name}`,
        bundle: 'manor',
        canvas: HALL.wall,
        render: () => copy(walls.get(name)!()),
        source: SRC,
      }),
    ),
    {
      id: `${prefix}-column`,
      bundle: 'manor',
      canvas: HALL.column,
      render: () => renderHallColumn(theme),
      source: SRC,
      shadow: { rx: 30, ry: 9, dx: 8, dy: 3, a: 0.24 },
    },
    {
      id: `${prefix}-side-west`,
      bundle: 'manor',
      canvas: { w: HALL.side + HALL.sideShadow, h: HALL_MAP_HEIGHT, ox: 0, oy: 0 },
      render: () => renderHallSide(HALL_MAP_HEIGHT, false, theme),
      source: SRC,
    },
    {
      id: `${prefix}-side-east`,
      bundle: 'manor',
      canvas: { w: HALL.side + HALL.sideShadow, h: HALL_MAP_HEIGHT, ox: HALL.side + HALL.sideShadow, oy: 0 },
      render: () => renderHallSide(HALL_MAP_HEIGHT, true, theme),
      source: SRC,
    },
  ];
}

/**
 * A door that sits in the door piece's doorway. `wallOf` is the piece it fills, so the door is cut
 * to the doorway's real pixels.
 */
function door(id: string, style: Parameters<typeof renderDoor>[1], wall: () => Rgba): Recipe {
  return {
    id,
    bundle: 'manor',
    canvas: doorCanvas(HALL_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(HALL_DOOR_GEOMETRY, style, f, wall()),
    source: SRC,
  };
}
const doorWall = once(() => renderHallWall('door', MANOR_THEME));
const liftWall = once(() => renderHallWall('lift', MANOR_THEME));
const skyLiftWall = once(() => renderHallWall('lift', SKY_GARDEN_THEME));

const ARCHITECTURE: Recipe[] = [
  ...floor('mn', MANOR_THEME, ['left', 'door', 'flowers', 'lift', 'right']),
  ...floor('sg', SKY_GARDEN_THEME, ['windows', 'lift']),
  door('door-manor-in', MANOR_DOOR_STYLE, doorWall),
  door('door-lift-secret', LIFT_SECRET_STYLE, liftWall),
  door('door-lift-gold', LIFT_GOLD_STYLE, skyLiftWall),
];

/** The Sky Garden's treasures. */
const PLANT_RECIPES: Recipe[] = [
  {
    id: 'sg-urn-gold',
    bundle: 'manor',
    canvas: GOLD_URN,
    render: renderGoldUrn,
    source: SRC,
    shadow: { rx: 44, ry: 13, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 38 },
  },
  {
    id: 'sg-planter-jewel',
    bundle: 'manor',
    canvas: JEWEL_PLANTER,
    render: renderJewelPlanter,
    source: SRC,
    shadow: { rx: 76, ry: 20, dx: 8, dy: 3, a: 0.28 },
    footprint: { r: 52 },
  },
  {
    id: 'sg-orchid',
    bundle: 'manor',
    canvas: ORCHID,
    render: renderOrchid,
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 30 },
  },
  {
    id: 'sg-tulips-crystal',
    bundle: 'manor',
    canvas: CRYSTAL_TULIPS,
    render: renderCrystalTulips,
    source: SRC,
    shadow: { rx: 36, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 30 },
  },
  {
    id: 'sg-bonsai-jade',
    bundle: 'manor',
    canvas: JADE_BONSAI,
    render: renderJadeBonsai,
    source: SRC,
    shadow: { rx: 58, ry: 16, dx: 8, dy: 3, a: 0.28 },
    footprint: { r: 46 },
  },
  {
    id: 'sg-fountain-lotus',
    bundle: 'manor',
    canvas: LOTUS_FOUNTAIN,
    anim: { frames: LOTUS_FRAMES, fps: 6, loop: true },
    render: renderLotusFountain,
    source: SRC,
    shadow: { rx: 150, ry: 38, dx: 10, dy: 5, a: 0.28 },
    footprint: { r: 126 },
  },
  { id: 'sg-hanging-garden', bundle: 'manor', canvas: HANGING_GARDEN, render: renderHangingGarden, source: SRC },
  { id: 'sg-hanging-shadow', bundle: 'manor', canvas: GARDEN_SHADOW, render: renderGardenShadow, source: SRC },
];

const WALL_ART: Recipe[] = [
  {
    id: 'mn-clue',
    bundle: 'manor',
    canvas: CLUE_CANVAS,
    anim: { frames: CLUE_FRAMES, fps: 6, loop: true },
    render: renderClue,
    source: SRC,
  },
  { id: 'mn-garland', bundle: 'manor', canvas: GARLAND_CANVAS, render: renderGarland, source: SRC },
];

const manorHouse = once(renderManor);

/**
 * The manor seen from the forest. These live in the forest's bundle, because the forest map draws
 * them.
 */
const EXTERIOR: Recipe[] = [
  {
    id: 'manor-house',
    bundle: 'forest',
    canvas: MANOR.canvas,
    render: () => copy(manorHouse()),
    source: SRC,
    shadow: { rx: 290, ry: 52, dx: 30, dy: 12, a: 0.3 },
  },
  {
    id: 'door-manor-out',
    bundle: 'forest',
    canvas: doorCanvas(MANOR_DOOR_GEOMETRY),
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: (f) => renderDoor(MANOR_DOOR_GEOMETRY, MANOR_OUT_STYLE, f, manorHouse()),
    source: SRC,
  },
];

/** The yard: pumpkins, bats, lamp posts, a crooked tree, a fence and webs. */
const YARD: Recipe[] = [
  {
    id: 'mn-pumpkin-big',
    bundle: 'forest',
    canvas: PUMPKIN_CANVAS.big,
    render: () => renderPumpkin('big', 'grin'),
    source: SRC,
    shadow: { rx: 44, ry: 13, dx: 6, dy: 3, a: 0.28 },
    footprint: { r: 34 },
  },
  {
    id: 'mn-pumpkin-mid',
    bundle: 'forest',
    canvas: PUMPKIN_CANVAS.mid,
    render: () => renderPumpkin('mid', 'happy'),
    source: SRC,
    shadow: { rx: 32, ry: 10, dx: 5, dy: 2, a: 0.28 },
    footprint: { r: 24 },
  },
  {
    id: 'mn-pumpkin-small',
    bundle: 'forest',
    canvas: PUMPKIN_CANVAS.small,
    render: () => renderPumpkin('small', 'surprised'),
    source: SRC,
    shadow: { rx: 22, ry: 7, dx: 4, dy: 2, a: 0.28 },
    footprint: { r: 16 },
  },
  {
    id: 'mn-bat',
    bundle: 'forest',
    canvas: BAT_CANVAS,
    anim: { frames: BAT_FRAMES, fps: 8, loop: true },
    render: renderBat,
    source: SRC,
  },
  {
    id: 'mn-lamp-post',
    bundle: 'forest',
    canvas: LAMP_POST_CANVAS,
    render: renderLampPost,
    source: SRC,
    shadow: { rx: 22, ry: 7, dx: 4, dy: 2, a: 0.28 },
    footprint: { r: 16 },
  },
  {
    id: 'mn-twisty-tree',
    bundle: 'forest',
    canvas: TWISTY_CANVAS,
    render: renderTwistyTree,
    source: SRC,
    shadow: { rx: 70, ry: 18, dx: 10, dy: 4, a: 0.3 },
    footprint: { r: 34 },
  },
  {
    id: 'mn-fence',
    bundle: 'forest',
    canvas: FENCE_CANVAS,
    render: renderFence,
    source: SRC,
    shadow: { rx: 90, ry: 8, dx: 6, dy: 2, a: 0.22 },
  },
  { id: 'mn-cobweb-l', bundle: 'forest', canvas: COBWEB_CANVAS, render: () => renderCobweb(false), source: SRC },
  {
    id: 'mn-cobweb-r',
    bundle: 'forest',
    canvas: { ...COBWEB_CANVAS, ox: COBWEB_CANVAS.w },
    render: () => renderCobweb(true),
    source: SRC,
  },
];

export const MANOR_RECIPES: Recipe[] = [
  ...EXTERIOR,
  ...YARD,
  ...ARCHITECTURE,
  ...STATUE_RECIPES,
  ...FURNISHINGS,
  ...PLANT_RECIPES,
  ...WALL_ART,
];
