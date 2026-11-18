import { contactSheet, type Rgba, writePng } from '../core/image';
import {
  bucket,
  clam,
  crystalBoulder,
  digMound,
  driftwood,
  lighthouse,
  palm,
  renderShore,
  riverStone,
  sandCastle,
  seashell,
  shutClam,
  starfish,
  umbrella,
} from './shore';

/** Usage: tsx tools/art/world/shore-preview.ts [group] */
const only = process.argv[2];
const small = { w: 128, h: 128, ox: 64, oy: 104 };
const groups: Record<
  string,
  { cols: number; scale?: number; bg: [number, number, number, number]; frames: () => Rgba[] }
> = {
  palms: {
    cols: 4,
    scale: 3,
    bg: [242, 222, 170, 255],
    frames: () => {
      const c = { w: 400, h: 400, ox: 200, oy: 368 };
      return [
        renderShore(palm({ seed: 1, lean: 0.28, fronds: 'emerald' }), c),
        renderShore(palm({ seed: 2, lean: -0.22, fronds: 'lime', scale: 0.9 }), c),
        renderShore(palm({ seed: 3, lean: 0.12, fronds: 'blossom', scale: 0.85 }), c),
        renderShore(palm({ seed: 4, lean: -0.34, fronds: 'spruce', scale: 1.05 }), c),
      ];
    },
  },
  shells: {
    cols: 6,
    bg: [242, 222, 170, 255],
    frames: () => [
      renderShore(seashell({ kind: 'scallop', color: 'pink', seed: 1 }), small),
      renderShore(seashell({ kind: 'scallop', color: 'lilac', seed: 2 }), small),
      renderShore(seashell({ kind: 'turret', color: 'cream', seed: 3 }), small),
      renderShore(seashell({ kind: 'turret', color: 'gold', seed: 4 }), small),
      renderShore(seashell({ kind: 'conch', color: 'pink', seed: 5 }), small),
      renderShore(seashell({ kind: 'conch', color: 'cream', seed: 6 }), small),
      renderShore(starfish({ seed: 1 }), small),
      renderShore(starfish({ seed: 2, scale: 0.8 }), small),
      renderShore(bucket({ seed: 1, colour: 'pink' }), small),
      renderShore(bucket({ seed: 2, colour: 'teal' }), small),
      renderShore(driftwood({ seed: 3 }), small),
      renderShore(digMound({ seed: 5 }), small),
    ],
  },
  clam: {
    cols: 2,
    scale: 4,
    bg: [242, 222, 170, 255],
    frames: () => {
      const c = { w: 192, h: 160, ox: 96, oy: 120 };
      return [renderShore(shutClam({ seed: 1 }), c), renderShore(clam({ open: true, seed: 1 }), c)];
    },
  },
  castle: {
    cols: 2,
    bg: [242, 222, 170, 255],
    frames: () => {
      const c = { w: 360, h: 300, ox: 180, oy: 230 };
      return [
        renderShore(sandCastle({ grand: true, seed: 1 }), c),
        renderShore(sandCastle({ grand: false, seed: 2 }), c),
      ];
    },
  },
  river: {
    cols: 4,
    bg: [60, 160, 190, 255],
    frames: () => {
      const c = { w: 192, h: 160, ox: 96, oy: 100 };
      const big = { w: 192, h: 192, ox: 96, oy: 150 };
      return [
        renderShore(riverStone({ seed: 1, r: 60 }), c),
        renderShore(riverStone({ seed: 2, r: 52 }), c),
        renderShore(riverStone({ seed: 3, r: 70 }), c),
        renderShore(crystalBoulder({ seed: 1, gem: 'amethyst' }), big),
        renderShore(crystalBoulder({ seed: 2, gem: 'sapphire', scale: 0.8 }), big),
        renderShore(crystalBoulder({ seed: 3, gem: 'diamond', scale: 0.9 }), big),
      ];
    },
  },
  umbrella: {
    cols: 3,
    bg: [242, 222, 170, 255],
    frames: () => {
      const c = { w: 256, h: 256, ox: 128, oy: 224 };
      return [
        renderShore(umbrella({ stripes: 'pink', seed: 1 }), c),
        renderShore(umbrella({ stripes: 'teal', seed: 2 }), c),
        renderShore(umbrella({ stripes: 'yellow', seed: 3 }), c),
      ];
    },
  },
  lighthouse: {
    cols: 2,
    bg: [242, 222, 170, 255],
    frames: () => {
      const c = { w: 320, h: 520, ox: 160, oy: 470 };
      return [renderShore(lighthouse({ lit: false }), c), renderShore(lighthouse({ lit: true }), c)];
    },
  },
};

for (const [name, g] of Object.entries(groups)) {
  if (only && only !== name) continue;
  const t0 = Date.now();
  const frames = g.frames();
  writePng(
    `assets/source/_scratch/shore-${name}.png`,
    contactSheet(frames, { cols: g.cols, scale: g.scale ?? 2, bg: g.bg, grid: true }),
  );
  console.log(name, Date.now() - t0, 'ms');
}
