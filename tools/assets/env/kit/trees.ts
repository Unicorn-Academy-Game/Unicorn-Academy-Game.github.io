import { renderScene } from '../../../art/world/scene';
import { birch, type FoliageName, fir, oak, willow } from '../../../art/world/trees';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/trees.ts',
  'art/world/trees.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
];
const CANVAS = { w: 400, h: 400, ox: 200, oy: 368 } as const;

type Species = 'oak' | 'fir' | 'birch' | 'willow';

interface Spec {
  id: string;
  species: Species;
  foliage: FoliageName;
  seed: number;
  scale: number;
}

const build = (s: Spec) => {
  const o = { seed: s.seed, foliage: s.foliage, scale: s.scale };
  return s.species === 'oak' ? oak(o) : s.species === 'fir' ? fir(o) : s.species === 'birch' ? birch(o) : willow(o);
};

/**
 * Crown width, crown height and trunk size at scale 1, in screen pixels, measured from the renders.
 */
const METRICS: Record<
  Species,
  { crownHalf: number; crownTop: number; crownBottom: number; trunk: number; shadow: number }
> = {
  oak: { crownHalf: 168, crownTop: 335, crownBottom: 140, trunk: 30, shadow: 120 },
  fir: { crownHalf: 112, crownTop: 330, crownBottom: 40, trunk: 20, shadow: 84 },
  birch: { crownHalf: 100, crownTop: 320, crownBottom: 150, trunk: 14, shadow: 66 },
  willow: { crownHalf: 150, crownTop: 250, crownBottom: 0, trunk: 28, shadow: 130 },
};

const SPECS: Spec[] = [
  { id: 'tree-oak-emerald-1', species: 'oak', foliage: 'emerald', seed: 1, scale: 0.85 },
  { id: 'tree-oak-emerald-2', species: 'oak', foliage: 'emerald', seed: 11, scale: 0.72 },
  { id: 'tree-oak-emerald-3', species: 'oak', foliage: 'emerald', seed: 21, scale: 0.95 },
  { id: 'tree-oak-lime-1', species: 'oak', foliage: 'lime', seed: 5, scale: 0.78 },
  { id: 'tree-oak-lime-2', species: 'oak', foliage: 'lime', seed: 15, scale: 0.66 },
  { id: 'tree-blossom-1', species: 'oak', foliage: 'blossom', seed: 7, scale: 0.8 },
  { id: 'tree-blossom-2', species: 'oak', foliage: 'blossom', seed: 17, scale: 0.68 },
  { id: 'tree-oak-gold-1', species: 'oak', foliage: 'gold', seed: 31, scale: 0.8 },
  { id: 'tree-oak-gold-2', species: 'oak', foliage: 'gold', seed: 41, scale: 0.68 },
  { id: 'tree-oak-lavender-1', species: 'oak', foliage: 'lavender', seed: 51, scale: 0.8 },
  { id: 'tree-oak-lavender-2', species: 'oak', foliage: 'lavender', seed: 61, scale: 0.68 },
  { id: 'tree-fir-spruce-1', species: 'fir', foliage: 'spruce', seed: 2, scale: 0.85 },
  { id: 'tree-fir-spruce-2', species: 'fir', foliage: 'spruce', seed: 12, scale: 0.7 },
  { id: 'tree-fir-spruce-3', species: 'fir', foliage: 'spruce', seed: 22, scale: 0.95 },
  { id: 'tree-birch-lime-1', species: 'birch', foliage: 'lime', seed: 3, scale: 0.85 },
  { id: 'tree-birch-lime-2', species: 'birch', foliage: 'lime', seed: 13, scale: 0.72 },
  { id: 'tree-willow-emerald-1', species: 'willow', foliage: 'emerald', seed: 4, scale: 0.8 },
];

export const TREE_RECIPES: Recipe[] = SPECS.map((s) => {
  const m = METRICS[s.species];
  const k = s.scale;
  return {
    id: s.id,
    bundle: 'forest',
    canvas: CANVAS,
    render: () =>
      renderScene(build(s), { width: CANVAS.w, height: CANVAS.h, originX: CANVAS.ox, originY: CANVAS.oy, ss: 3 }).rgba,
    source: SRC,
    shadow: {
      rx: Math.round(m.shadow * k),
      ry: Math.round(m.shadow * k * 0.27),
      dx: Math.round(m.shadow * k * 0.28),
      dy: -2,
      a: 0.32,
    },
    canopy: {
      x: -Math.round(m.crownHalf * k),
      y: -Math.round(m.crownTop * k),
      w: Math.round(m.crownHalf * 2 * k),
      h: Math.round((m.crownTop - m.crownBottom) * k),
    },
    footprint: { r: Math.round(m.trunk * k) },
  };
});
