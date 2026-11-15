import { GLOW_ACROSS } from '../../../../src/render/prop-visuals';
import {
  BED_CANVAS,
  type CaveBedLook,
  FLORA_CANVAS,
  GLOW_HUE,
  type GlowName,
  renderBed,
  renderBulbs,
  renderMushrooms,
} from '../../../art/world/cave-flora';
import {
  CLUSTER_CANVAS,
  GEM_STONES,
  gemCluster,
  RAINBOW_CLUSTER_FRAMES,
  rainbowCluster,
  renderCluster,
} from '../../../art/world/cave-gems';
import {
  CHIMES_CANVAS,
  HEART_CANVAS,
  ORB_CANVAS,
  PILLAR_CANVAS,
  renderChimes,
  renderHeartCrystals,
  renderHeartDais,
  renderOrb,
  renderOrbStand,
  renderPillarCrystals,
  renderPillarRock,
} from '../../../art/world/cave-grand';
import {
  BROOM_CANVAS,
  CAULDRON_CANVAS,
  CAULDRON_FRAMES,
  HUT_CANVAS,
  HUT_DOOR_GEOMETRY,
  JARS_CANVAS,
  renderBroom,
  renderCauldron,
  renderHut,
  renderHutDoor,
  renderJars,
  renderSmoke,
  renderWisp,
  SMOKE_CANVAS,
  SMOKE_FRAMES,
  WISP_CANVAS,
  WISP_FRAMES,
} from '../../../art/world/cave-hut';
import { ICE_CANVAS, renderIce } from '../../../art/world/cave-ice';
import { MOUTH_CANVAS, renderCaveMouth } from '../../../art/world/cave-mouth';
import {
  caveRock,
  GROUP_CANVAS,
  ROCK_CANVAS,
  renderAwake,
  renderHalo,
  renderSleeping,
  renderSpire,
  SPIRE_CANVAS,
} from '../../../art/world/cave-rock';
import { DOOR_FRAMES, doorCanvas } from '../../../art/world/doors';
import { RAIN_CANVAS } from '../../../art/world/rain';
import { RAINBOW_FRAMES, renderRainbowGem } from '../../../art/world/rainbow-gem';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/cave.ts',
  'art/world/cave-flora.ts',
  'art/world/cave-gems.ts',
  'art/world/cave-grand.ts',
  'art/world/cave-hut.ts',
  'art/world/cave-ice.ts',
  'art/world/cave-mouth.ts',
  'art/world/cave-rock.ts',
  'art/world/doors.ts',
  'art/world/rain.ts',
  'art/world/rainbow-gem.ts',
  'art/world/gems.ts',
  'art/world/glow.ts',
  'art/world/arch.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
  'art/core/color.ts',
  'art/core/image.ts',
  'art/core/mesh.ts',
  'art/core/rng.ts',
  'art/core/vec.ts',
];

const shadow = (rx: number, ry: number, dx = 6, dy = 2, a = 0.3) => ({ rx, ry, dx, dy, a });

/**
 * A cluster of crystals for each stone, a big one and a small one. The rainbow stone's shimmers
 * instead.
 */
const CLUSTERS: Recipe[] = [
  ...GEM_STONES.flatMap((stone) =>
    ([0, 1] as const).map(
      (variant): Recipe => ({
        id: `cc-${stone}-${variant + 1}`,
        bundle: 'cave',
        canvas: CLUSTER_CANVAS,
        render: () => renderCluster(gemCluster(stone, variant)).rgba,
        source: SRC,
        shadow: shadow(48, 14),
        footprint: { r: 30 },
      }),
    ),
  ),
  {
    id: 'cc-rainbow-1',
    bundle: 'cave',
    canvas: CLUSTER_CANVAS,
    anim: { frames: RAINBOW_CLUSTER_FRAMES, fps: 6, loop: true },
    render: (f) => renderCluster(rainbowCluster(f)).rgba,
    source: SRC,
    shadow: shadow(48, 14),
    footprint: { r: 30 },
  },
];

/**
 * Crystals that sleep until a friend's magic wakes them, in two shapes. The sleeping picture blinks
 * once in a while, and the awake one is white for the game to tint.
 */
const SLEEPERS: Recipe[] = [4, 9].flatMap((seed, i): Recipe[] => [
  {
    id: `cc-sleep-${i + 1}`,
    bundle: 'cave',
    canvas: GROUP_CANVAS,
    anim: { frames: 6, fps: 2, loop: true },
    render: (f) => renderSleeping(seed, f, 6),
    source: SRC,
    shadow: shadow(34, 10, 4, 2, 0.28),
    footprint: { r: 24 },
  },
  { id: `cc-awake-${i + 1}`, bundle: 'cave', canvas: GROUP_CANVAS, render: () => renderAwake(seed), source: SRC },
]);

const GRAND: Recipe[] = [
  {
    id: 'cc-heart-dais',
    bundle: 'cave',
    canvas: HEART_CANVAS,
    render: renderHeartDais,
    source: SRC,
    shadow: shadow(150, 40, 8, 6, 0.3),
    footprint: { r: 66 },
  },
  { id: 'cc-heart-crystal', bundle: 'cave', canvas: HEART_CANVAS, render: renderHeartCrystals, source: SRC },
  {
    id: 'cc-pillar-rock',
    bundle: 'cave',
    canvas: PILLAR_CANVAS,
    render: renderPillarRock,
    source: SRC,
    shadow: shadow(70, 20, 8, 3, 0.3),
    footprint: { r: 44 },
  },
  { id: 'cc-pillar-crystal', bundle: 'cave', canvas: PILLAR_CANVAS, render: renderPillarCrystals, source: SRC },
  {
    id: 'cc-orb-stand',
    bundle: 'cave',
    canvas: ORB_CANVAS,
    render: renderOrbStand,
    source: SRC,
    shadow: shadow(52, 15, 6, 2, 0.3),
    footprint: { r: 36 },
  },
  { id: 'cc-orb', bundle: 'cave', canvas: ORB_CANVAS, render: renderOrb, source: SRC },
  {
    id: 'cc-chimes',
    bundle: 'cave',
    canvas: CHIMES_CANVAS,
    render: renderChimes,
    source: SRC,
    shadow: shadow(104, 16, 6, 2, 0.26),
    footprint: { r: 36 },
  },
];

const BEDS: Recipe[] = (['long', 'round'] as const satisfies readonly CaveBedLook[]).flatMap((look): Recipe[] => [
  {
    id: `cc-bed-leafy-${look}`,
    bundle: 'cave',
    canvas: BED_CANVAS,
    render: () => renderBed(look, false),
    source: SRC,
    shadow: shadow(look === 'long' ? 100 : 74, look === 'long' ? 24 : 30, 6, 2, 0.28),
    footprint: { r: look === 'long' ? 62 : 54 },
  },
  {
    id: `cc-bed-flowering-${look}`,
    bundle: 'cave',
    canvas: BED_CANVAS,
    anim: { frames: 4, fps: 3, loop: true },
    render: (f) => renderBed(look, true, f, 4),
    source: SRC,
    shadow: shadow(look === 'long' ? 100 : 74, look === 'long' ? 24 : 30, 6, 2, 0.28),
    footprint: { r: look === 'long' ? 62 : 54 },
  },
]);

/**
 * What grows on the floor of the cave without anyone tending it: glowing mushrooms and bulbs, which
 * breathe a little. Walked over, like flowers.
 */
const GROWTH: Recipe[] = [
  ...(Object.keys(GLOW_HUE) as GlowName[]).map(
    (name): Recipe => ({
      id: `cc-mushrooms-${name}`,
      bundle: 'cave',
      canvas: FLORA_CANVAS,
      anim: { frames: 4, fps: 3, loop: true },
      render: (f) => renderMushrooms(name, f, 4),
      source: SRC,
    }),
  ),
  {
    id: 'cc-bulbs-1',
    bundle: 'cave',
    canvas: FLORA_CANVAS,
    anim: { frames: 4, fps: 3, loop: true },
    render: (f) => renderBulbs(5, [195, 320, 82], f, 4),
    source: SRC,
  },
  {
    id: 'cc-bulbs-2',
    bundle: 'cave',
    canvas: FLORA_CANVAS,
    anim: { frames: 4, fps: 3, loop: true },
    render: (f) => renderBulbs(9, [300, 160, 40], f, 4),
    source: SRC,
  },
];

/** Stone that is only scenery: boulders and tall spires along the walls. */
const ROCKS: Recipe[] = [
  ...(
    [
      [3, 0.9, 34],
      [8, 1.15, 44],
      [13, 1.5, 58],
    ] as const
  ).map(
    ([seed, scale, r], i): Recipe => ({
      id: `cc-rock-${i + 1}`,
      bundle: 'cave',
      canvas: ROCK_CANVAS,
      render: () => caveRock(seed, scale),
      source: SRC,
      shadow: shadow(r * 1.5, r * 0.45, 6, 2, 0.3),
      footprint: { r },
    }),
  ),
  {
    id: 'cc-spire-1',
    bundle: 'cave',
    canvas: SPIRE_CANVAS,
    render: () => renderSpire(5),
    source: SRC,
    shadow: shadow(52, 15, 6, 2, 0.3),
    footprint: { r: 38 },
  },
  {
    id: 'cc-spire-2',
    bundle: 'cave',
    canvas: SPIRE_CANVAS,
    render: () => renderSpire(11, 0.8),
    source: SRC,
    shadow: shadow(42, 12, 6, 2, 0.3),
    footprint: { r: 30 },
  },
];

const hutDoorCanvas = doorCanvas(HUT_DOOR_GEOMETRY);

/**
 * The witch's hut and what stands round it. The smoke and the door are drawn on the hut's own
 * anchor, so they line up whatever the hut's size.
 */
const HUT: Recipe[] = [
  {
    id: 'cc-hut',
    bundle: 'cave',
    canvas: HUT_CANVAS,
    render: renderHut,
    source: SRC,
    shadow: shadow(170, 40, 14, 6, 0.3),
  },
  {
    id: 'cc-hut-door',
    bundle: 'cave',
    canvas: hutDoorCanvas,
    anim: { frames: DOOR_FRAMES, fps: 12, loop: false },
    render: renderHutDoor,
    source: SRC,
  },
  {
    id: 'cc-smoke',
    bundle: 'cave',
    canvas: SMOKE_CANVAS,
    anim: { frames: SMOKE_FRAMES, fps: 5, loop: true },
    render: renderSmoke,
    source: SRC,
  },
  {
    id: 'cc-cauldron',
    bundle: 'cave',
    canvas: CAULDRON_CANVAS,
    anim: { frames: CAULDRON_FRAMES, fps: 6, loop: true },
    render: renderCauldron,
    source: SRC,
    shadow: shadow(56, 16, 6, 3, 0.3),
    footprint: { r: 36 },
  },
  {
    id: 'cc-broom',
    bundle: 'cave',
    canvas: BROOM_CANVAS,
    render: renderBroom,
    source: SRC,
    shadow: shadow(24, 7, 4, 2, 0.26),
  },
  {
    id: 'cc-jars',
    bundle: 'cave',
    canvas: JARS_CANVAS,
    render: renderJars,
    source: SRC,
    shadow: shadow(84, 16, 6, 2, 0.28),
    footprint: { r: 50 },
  },
  {
    id: 'cc-wisp',
    bundle: 'cave',
    canvas: WISP_CANVAS,
    anim: { frames: WISP_FRAMES, fps: 6, loop: true },
    render: renderWisp,
    source: SRC,
  },
];

/**
 * Light and ice. The glow is one soft white disc, as wide as the game draws it at scale one, that
 * the game tints, stretches to what each light needs and adds to the floor. The ice is a flat sheet
 * over the pool.
 */
const LIGHT: Recipe[] = [
  {
    id: 'cc-halo',
    bundle: 'cave',
    canvas: { w: GLOW_ACROSS, h: GLOW_ACROSS, ox: GLOW_ACROSS / 2, oy: GLOW_ACROSS / 2 },
    render: () => renderHalo(GLOW_ACROSS),
    source: SRC,
  },
  { id: 'cc-pool-ice', bundle: 'cave', canvas: ICE_CANVAS, render: renderIce, source: SRC },
];

/** The mouth of the cave, which the forest draws. */
const MOUTH: Recipe[] = [
  {
    id: 'rock-cave-mouth',
    bundle: 'forest',
    canvas: MOUTH_CANVAS,
    render: renderCaveMouth,
    source: SRC,
    shadow: shadow(250, 40, 20, 8, 0.3),
  },
];

/**
 * The rainbow gem she gathers from the rainbow crystals. It cycles its colours where it lies, and
 * lives with the produce, which loads everywhere.
 */
const RAINBOW_GEM: Recipe[] = [
  {
    id: 'produce-rainbow',
    bundle: 'produce',
    canvas: RAIN_CANVAS,
    anim: { frames: RAINBOW_FRAMES, fps: 5, loop: true },
    render: (f) => renderRainbowGem(f),
    source: SRC,
  },
];

export const CAVE_RECIPES: Recipe[] = [
  ...CLUSTERS,
  ...SLEEPERS,
  ...GRAND,
  ...BEDS,
  ...GROWTH,
  ...ROCKS,
  ...HUT,
  ...LIGHT,
  ...MOUTH,
  ...RAINBOW_GEM,
];
