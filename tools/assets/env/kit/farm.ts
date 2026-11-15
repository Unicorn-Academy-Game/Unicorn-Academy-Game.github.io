import {
  APPLES,
  BED_CANVAS,
  CRATE_CANVAS,
  CRATES,
  CROPS,
  FENCE_X_CANVAS,
  FENCE_Y_CANVAS,
  renderBed,
  renderCrate,
  renderFence,
  renderScarecrow,
  SCARECROW_CANVAS,
  SKY_BERRIES,
} from '../../../art/world/farm';
import { renderScene } from '../../../art/world/scene';
import type { Fruit } from '../../../art/world/trees';
import { type FoliageName, oak } from '../../../art/world/trees';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/farm.ts',
  'art/world/farm.ts',
  'art/world/trees.ts',
  'art/world/prims.ts',
  'art/world/arch.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

const TREE_CANVAS = { w: 400, h: 400, ox: 200, oy: 368 } as const;
/**
 * The oak's crown, measured from the renders in trees.ts, so the orchard fades like the forest
 * does.
 */
const OAK = { crownHalf: 168, crownTop: 335, crownBottom: 140, trunk: 30, shadow: 120 } as const;

interface Orchard {
  id: string;
  fruit: Fruit;
  foliage: FoliageName;
  seed: number;
  scale: number;
}

const ORCHARD: Orchard[] = [
  { id: 'g-tree-apple-1', fruit: APPLES, foliage: 'emerald', seed: 3, scale: 0.8 },
  { id: 'g-tree-apple-2', fruit: APPLES, foliage: 'lime', seed: 9, scale: 0.7 },
  { id: 'g-tree-berry-1', fruit: SKY_BERRIES, foliage: 'emerald', seed: 5, scale: 0.8 },
  { id: 'g-tree-berry-2', fruit: SKY_BERRIES, foliage: 'lime', seed: 13, scale: 0.7 },
];

const TREES: Recipe[] = ORCHARD.map((t): Recipe => {
  const k = t.scale;
  return {
    id: t.id,
    bundle: 'garden',
    canvas: TREE_CANVAS,
    render: () =>
      renderScene(oak({ seed: t.seed, foliage: t.foliage, scale: k, fruit: t.fruit }), {
        width: TREE_CANVAS.w,
        height: TREE_CANVAS.h,
        originX: TREE_CANVAS.ox,
        originY: TREE_CANVAS.oy,
        ss: 3,
      }).rgba,
    source: SRC,
    shadow: {
      rx: Math.round(OAK.shadow * k),
      ry: Math.round(OAK.shadow * k * 0.27),
      dx: Math.round(OAK.shadow * k * 0.28),
      dy: -2,
      a: 0.32,
    },
    canopy: {
      x: -Math.round(OAK.crownHalf * k),
      y: -Math.round(OAK.crownTop * k),
      w: Math.round(OAK.crownHalf * 2 * k),
      h: Math.round((OAK.crownTop - OAK.crownBottom) * k),
    },
    footprint: { r: Math.round(OAK.trunk * k) },
  };
});

/**
 * The farm: a raised bed for each crop, a scarecrow who smiles, crates heaped with fruit and a
 * picket fence.
 */
export const FARM_RECIPES: Recipe[] = [
  ...TREES,
  ...CROPS.map(
    (crop, i): Recipe => ({
      id: `g-bed-${crop}`,
      bundle: 'garden',
      canvas: BED_CANVAS,
      render: () => renderBed({ crop, seed: i + 3 }),
      source: SRC,
      shadow: { rx: 100, ry: 26, dx: 4, dy: 4, a: 0.24 },
      footprint: { r: 34 },
    }),
  ),
  {
    id: 'g-scarecrow',
    bundle: 'garden',
    canvas: SCARECROW_CANVAS,
    render: renderScarecrow,
    source: SRC,
    shadow: { rx: 40, ry: 11, dx: 6, dy: 2, a: 0.28 },
    footprint: { r: 16 },
  },
  ...CRATES.map(
    (kind): Recipe => ({
      id: `g-crate-${kind}`,
      bundle: 'garden',
      canvas: CRATE_CANVAS,
      render: () => renderCrate(kind),
      source: SRC,
      shadow: { rx: 44, ry: 13, dx: 4, dy: 3, a: 0.26 },
      footprint: { r: 30 },
    }),
  ),
  {
    id: 'g-fence-x',
    bundle: 'garden',
    canvas: FENCE_X_CANVAS,
    render: () => renderFence('x'),
    source: SRC,
    shadow: { rx: 100, ry: 6, dx: 6, dy: 3, a: 0.18 },
  },
  {
    id: 'g-fence-y',
    bundle: 'garden',
    canvas: FENCE_Y_CANVAS,
    render: () => renderFence('y'),
    source: SRC,
    shadow: { rx: 9, ry: 46, dx: 8, dy: 0, a: 0.18 },
  },
];
