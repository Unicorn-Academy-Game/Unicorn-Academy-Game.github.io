import {
  BENCH_CANVAS,
  hedgeCanvas,
  PILLAR_CANVAS,
  renderBench,
  renderHedge,
  renderPillar,
  renderTopiary,
  renderUrn,
  TOPIARY_CANVAS,
  URN_CANVAS,
} from '../../../art/world/gardenery';
import type { Recipe } from '../types';

const SRC = [
  'assets/env/kit/gardenery.ts',
  'art/world/gardenery.ts',
  'art/world/stone.ts',
  'art/world/arch.ts',
  'art/world/prims.ts',
  'art/world/scene.ts',
  'art/world/palette.ts',
  'art/core/render.ts',
];

const HEDGES = [
  { id: 'hedge-h-192', length: 192, axis: 'x', seed: 1 },
  { id: 'hedge-h-128', length: 128, axis: 'x', seed: 2 },
  { id: 'hedge-h-64', length: 64, axis: 'x', seed: 3 },
  { id: 'hedge-h-192-roses', length: 192, axis: 'x', seed: 4, roses: 'pink' },
  { id: 'hedge-v-160', length: 160, axis: 'y', seed: 5 },
  { id: 'hedge-v-96', length: 96, axis: 'y', seed: 6 },
] as const;

/** Clipped hedges, topiary, benches, urns and gate pillars: the furniture of the formal garden. */
export const GARDENERY_RECIPES: Recipe[] = [
  ...HEDGES.map(
    (h): Recipe => ({
      id: h.id,
      bundle: 'garden',
      canvas: hedgeCanvas(h.length, h.axis),
      render: () =>
        renderHedge({ length: h.length, axis: h.axis, seed: h.seed, ...('roses' in h ? { roses: h.roses } : {}) }),
      source: SRC,
      shadow:
        h.axis === 'x'
          ? { rx: Math.round(h.length / 2 + 22), ry: 17, dx: 10, dy: 5, a: 0.26 }
          : { rx: 42, ry: Math.round(h.length * 0.23 + 12), dx: 12, dy: 4, a: 0.26 },
    }),
  ),
  ...(['ball', 'tiers', 'spiral'] as const).map(
    (shape): Recipe => ({
      id: `topiary-${shape}`,
      bundle: 'garden',
      canvas: TOPIARY_CANVAS,
      render: () => renderTopiary(shape),
      source: SRC,
      shadow: { rx: 44, ry: 13, dx: 12, dy: 3, a: 0.28 },
      footprint: { r: 26 },
    }),
  ),
  {
    id: 'bench',
    bundle: 'garden',
    canvas: BENCH_CANVAS,
    render: () => renderBench(),
    source: SRC,
    shadow: { rx: 72, ry: 16, dx: 10, dy: 3, a: 0.26 },
  },
  {
    id: 'urn-1',
    bundle: 'garden',
    canvas: URN_CANVAS,
    render: () => renderUrn({ seed: 1, blooms: ['pink', 'white'] }),
    source: SRC,
    shadow: { rx: 42, ry: 12, dx: 10, dy: 3, a: 0.26 },
    footprint: { r: 26 },
  },
  {
    id: 'urn-2',
    bundle: 'garden',
    canvas: URN_CANVAS,
    render: () => renderUrn({ seed: 2, blooms: ['yellow', 'coral'] }),
    source: SRC,
    shadow: { rx: 42, ry: 12, dx: 10, dy: 3, a: 0.26 },
    footprint: { r: 26 },
  },
  {
    id: 'gate-pillar',
    bundle: 'garden',
    canvas: PILLAR_CANVAS,
    render: () => renderPillar(false),
    source: SRC,
    shadow: { rx: 44, ry: 13, dx: 16, dy: 3, a: 0.28 },
    footprint: { r: 28 },
  },
  {
    id: 'forest-gate-pillar',
    bundle: 'forest',
    canvas: PILLAR_CANVAS,
    render: () => renderPillar(true),
    source: SRC,
    shadow: { rx: 44, ry: 13, dx: 16, dy: 3, a: 0.28 },
    footprint: { r: 28 },
  },
];
