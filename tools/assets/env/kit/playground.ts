import { COMPUTER_FPS, COMPUTER_FRAMES } from '../../../../src/shared/computer';
import { PIANO_FPS, PIANO_FRAMES } from '../../../../src/shared/piano';
import { exitBeam, exitPad } from '../../../art/fx/exits';
import { COMPUTER_CANVAS, renderComputer } from '../../../art/world/computer';
import { PIANO_CANVAS, renderPiano } from '../../../art/world/piano';
import {
  ARCH_CANVAS,
  BALLOON_CANVAS,
  BALLOON_LOOKS,
  BUBBLE_CANVAS,
  BUBBLE_FRAMES,
  CANNON_CANVAS,
  CANNON_LOOKS,
  FIREWORK_CANVAS,
  FIREWORK_LOOKS,
  FROG_LILY_CANVAS,
  GEM_FOUNTAIN_CANVAS,
  GEM_JET_FRAMES,
  MORPH_CANVAS,
  MORPH_FRAMES,
  MORPH_LOOKS,
  MUSHROOM_CANVAS,
  MUSHROOM_FRAMES,
  MUSHROOM_LOOKS,
  POPPER_CANVAS,
  renderBalloons,
  renderBalloonWeight,
  renderBubbleMachine,
  renderCannon,
  renderFireworks,
  renderFrogLily,
  renderGemFountain,
  renderGemJet,
  renderMorph,
  renderMushroom,
  renderPlaygroundArch,
  renderPopper,
  renderSlide,
  renderSlideBall,
  SLIDE_BALL_FRAMES,
  SLIDE_CANVAS,
} from '../../../art/world/playground';
import { renderAbacus, renderMemoryTable, TABLE_CANVAS } from '../../../art/world/tables';
import type { Recipe } from '../types';
import { GARDEN_NATURE_RECIPES } from './garden-nature';
import { GARDENERY_RECIPES } from './gardenery';
import { SKY_RECIPES } from './sky';

const SRC = [
  'assets/env/kit/playground.ts',
  'art/world/playground.ts',
  'art/world/arch.ts',
  'art/world/hall.ts',
  'art/world/stone.ts',
  'art/world/gems.ts',
  'art/world/paint.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

/**
 * What the piano is drawn from besides what every toy is: its own file and the timing it shares
 * with the effect.
 */
const PIANO_SRC = [...SRC, 'art/world/piano.ts', 'art/world/shapes.ts', '../src/shared/piano.ts'];

/**
 * And the reading computer: its own file and the timing it shares with its effect and its sound.
 */
const COMPUTER_SRC = [...SRC, 'art/world/computer.ts', 'art/world/shapes.ts', '../src/shared/computer.ts'];

/** And the two tables: their own file, and the rounded shapes the computer is cut from. */
const TABLE_SRC = [...SRC, 'art/world/tables.ts', 'art/world/shapes.ts'];

/**
 * The stage lights of the dance floor are the glowing place and the column of light that mark a way
 * out. A map draws only from its own bundle, so they are drawn here too.
 */
const LIGHT_SRC = ['assets/env/kit/playground.ts', 'art/fx/kit.ts', 'art/fx/exits.ts'];

const shadow = (rx: number, ry: number, a = 0.28) => ({ rx, ry, dx: Math.round(rx / 10), dy: 3, a });

/**
 * The playground grows the garden's grass, flowers and trees and shares its sky, from the same
 * recipes under `pg-` ids, as atlases are per bundle.
 */
const lend = (from: readonly Recipe[], ids: readonly string[]): Recipe[] =>
  ids.map((id) => {
    const r = from.find((x) => x.id === id);
    if (!r) throw new Error(`no recipe ${id} to lend the playground`);
    return { ...r, id: `pg-${id.replace(/^g-/, '')}`, bundle: 'playground' };
  });

const BLOOMS = ['pink', 'sky', 'yellow', 'white', 'lilac', 'coral'];

const DECOR: Recipe[] = [
  ...lend(GARDEN_NATURE_RECIPES, [
    'g-tree-blossom-1',
    'g-tree-blossom-2',
    'g-tree-oak-lavender-1',
    'g-tree-oak-lime-1',
    'g-tree-oak-lime-2',
    'g-tree-birch-lime-1',
    'g-tree-willow-emerald-1',
    'g-bush-lime-1',
    'g-bush-lime-2',
    'g-bush-emerald-1',
    'g-bush-pink-dots',
    'g-bush-rose-dots',
    ...BLOOMS.flatMap((c) => [`g-flowers-${c}-1`, `g-flowers-${c}-2`]),
    'g-windflower-pink-1',
    'g-windflower-lilac-1',
    'g-tuft-1',
    'g-tuft-2',
    'g-tuft-3',
    'g-pebbles-1',
    'g-pebbles-2',
    'g-reeds-1',
    'g-reeds-2',
    'g-lily-1',
    'g-lily-2',
    'g-rock-moss-1',
    'g-rock-grey-1',
  ]),
  ...lend(GARDENERY_RECIPES, ['bench', 'urn-1', 'urn-2']),
  ...lend(SKY_RECIPES, [
    'sky-strip',
    'cloud-1',
    'cloud-2',
    'cloud-3',
    'cloud-4',
    'cloud-5',
    'hills-far-0',
    'hills-far-1',
    'hills-far-2',
    'hills-near-0',
    'hills-near-1',
    'hills-near-2',
  ]),
];

/** The toys of the playground. */
export const PLAYGROUND_RECIPES: Recipe[] = [
  ...DECOR,
  ...MUSHROOM_LOOKS.map(
    (look): Recipe => ({
      id: `pg-mushroom-${look}`,
      bundle: 'playground',
      canvas: MUSHROOM_CANVAS,
      anim: { frames: MUSHROOM_FRAMES, fps: 14, loop: false },
      render: (f) => renderMushroom(look, f),
      source: SRC,
      shadow: shadow(54, 16),
      footprint: { r: 34 },
    }),
  ),
  {
    id: 'pg-balloon-weight',
    bundle: 'playground',
    canvas: BALLOON_CANVAS,
    render: renderBalloonWeight,
    source: SRC,
    shadow: shadow(28, 9, 0.26),
    footprint: { r: 22 },
  },
  ...BALLOON_LOOKS.map(
    (look): Recipe => ({
      id: `pg-balloons-${look}`,
      bundle: 'playground',
      canvas: BALLOON_CANVAS,
      render: () => renderBalloons(look),
      source: SRC,
    }),
  ),
  {
    id: 'pg-popper',
    bundle: 'playground',
    canvas: POPPER_CANVAS,
    render: renderPopper,
    source: SRC,
    shadow: shadow(40, 12),
    footprint: { r: 32 },
  },
  ...FIREWORK_LOOKS.map(
    (look): Recipe => ({
      id: `pg-fireworks-${look}`,
      bundle: 'playground',
      canvas: FIREWORK_CANVAS,
      render: () => renderFireworks(look),
      source: SRC,
      shadow: shadow(58, 14),
      footprint: { r: 46 },
    }),
  ),
  {
    id: 'pg-gem-fountain',
    bundle: 'playground',
    canvas: GEM_FOUNTAIN_CANVAS,
    render: renderGemFountain,
    source: SRC,
    shadow: shadow(112, 34, 0.28),
    footprint: { r: 88 },
  },
  {
    id: 'pg-gem-jet',
    bundle: 'playground',
    canvas: GEM_FOUNTAIN_CANVAS,
    anim: { frames: GEM_JET_FRAMES, fps: 10, loop: true },
    render: renderGemJet,
    source: SRC,
  },
  {
    id: 'pg-slide',
    bundle: 'playground',
    canvas: SLIDE_CANVAS,
    render: renderSlide,
    source: SRC,
    shadow: { rx: 170, ry: 34, dx: 20, dy: 4, a: 0.26 },
  },
  {
    id: 'pg-slide-ball',
    bundle: 'playground',
    canvas: SLIDE_CANVAS,
    anim: { frames: SLIDE_BALL_FRAMES, fps: 9, loop: false },
    render: renderSlideBall,
    source: SRC,
  },
  ...CANNON_LOOKS.map(
    (look): Recipe => ({
      id: `pg-cannon-${look}`,
      bundle: 'playground',
      canvas: CANNON_CANVAS,
      render: () => renderCannon(look),
      source: SRC,
      shadow: shadow(66, 16),
      footprint: { r: 44 },
    }),
  ),
  ...MORPH_LOOKS.map(
    (look): Recipe => ({
      id: `pg-morph-${look}`,
      bundle: 'playground',
      canvas: MORPH_CANVAS,
      anim: { frames: MORPH_FRAMES, fps: 10, loop: false },
      render: (f) => renderMorph(look, f),
      source: SRC,
      shadow: shadow(78, 20),
      footprint: { r: 56 },
    }),
  ),
  {
    id: 'pg-bubbles',
    bundle: 'playground',
    canvas: BUBBLE_CANVAS,
    anim: { frames: BUBBLE_FRAMES, fps: 8, loop: true },
    render: renderBubbleMachine,
    source: SRC,
    shadow: shadow(56, 16),
    footprint: { r: 44 },
  },
  {
    id: 'pg-frog-lily',
    bundle: 'playground',
    canvas: FROG_LILY_CANVAS,
    render: renderFrogLily,
    source: SRC,
    shadow: shadow(70, 16, 0.2),
  },
  {
    id: 'pg-arch',
    bundle: 'playground',
    canvas: ARCH_CANVAS,
    render: renderPlaygroundArch,
    source: SRC,
    shadow: shadow(126, 20, 0.22),
  },
  {
    id: 'g-playground-arch',
    bundle: 'garden',
    canvas: ARCH_CANVAS,
    render: renderPlaygroundArch,
    source: SRC,
    shadow: shadow(126, 20, 0.22),
  },
  {
    id: 'g-piano',
    bundle: 'garden',
    canvas: PIANO_CANVAS,
    anim: { frames: PIANO_FRAMES, fps: PIANO_FPS, loop: false },
    render: renderPiano,
    source: PIANO_SRC,
    shadow: shadow(118, 31, 0.26),
    canopy: { x: -112, y: -196, w: 224, h: 150 },
  },
  {
    id: 'g-computer',
    bundle: 'garden',
    canvas: COMPUTER_CANVAS,
    anim: { frames: COMPUTER_FRAMES, fps: COMPUTER_FPS, loop: false },
    render: renderComputer,
    source: COMPUTER_SRC,
    shadow: shadow(114, 28, 0.26),
    canopy: { x: -118, y: -206, w: 236, h: 150 },
  },
  {
    id: 'g-memory-table',
    bundle: 'garden',
    canvas: TABLE_CANVAS,
    render: renderMemoryTable,
    source: TABLE_SRC,
    shadow: shadow(100, 28, 0.26),
    canopy: { x: -118, y: -150, w: 236, h: 100 },
  },
  {
    id: 'g-abacus',
    bundle: 'garden',
    canvas: TABLE_CANVAS,
    render: renderAbacus,
    source: TABLE_SRC,
    shadow: shadow(112, 22, 0.26),
    canopy: { x: -108, y: -150, w: 216, h: 110 },
  },
  {
    id: 'pg-stage-pad',
    bundle: 'playground',
    canvas: { w: 192, h: 96, ox: 96, oy: 48 },
    render: exitPad,
    source: LIGHT_SRC,
  },
  {
    id: 'pg-stage-beam',
    bundle: 'playground',
    canvas: { w: 64, h: 224, ox: 32, oy: 220 },
    render: exitBeam,
    source: LIGHT_SRC,
  },
];
