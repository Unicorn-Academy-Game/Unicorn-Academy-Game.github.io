import { contactSheet, type Rgba, writePng } from '../core/image';
import {
  cabin,
  candyLamp,
  christmasTree,
  gate,
  glowOf,
  present,
  reindeer,
  renderGrove,
  sleigh,
  snowFir,
  snowman,
  snowPile,
  snowRock,
  WRAP_NAMES,
} from './grove';

/** Usage: tsx tools/art/world/grove-preview.ts [group] */
const only = process.argv[2];
const SNOWY: [number, number, number, number] = [226, 236, 246, 255];
const groups: Record<
  string,
  { cols: number; scale?: number; bg: [number, number, number, number]; frames: () => Rgba[] }
> = {
  firs: {
    cols: 3,
    scale: 1,
    bg: SNOWY,
    frames: () => {
      const c = { w: 400, h: 400, ox: 200, oy: 368 };
      return [
        renderGrove(snowFir({ seed: 2, scale: 0.85 }), c),
        renderGrove(snowFir({ seed: 12, scale: 0.7 }), c),
        renderGrove(snowFir({ seed: 22, scale: 0.95 }), c),
      ];
    },
  },
  tree: {
    cols: 2,
    scale: 1,
    bg: SNOWY,
    frames: () => {
      const c = { w: 560, h: 680, ox: 280, oy: 640 };
      const lit = renderGrove(christmasTree({ lights: true }), c);
      return [renderGrove(christmasTree({ lights: false }), c), glowOf(lit, 7, 0.55)];
    },
  },
  presents: {
    cols: 5,
    scale: 3,
    bg: SNOWY,
    frames: () => {
      const c = { w: 128, h: 128, ox: 64, oy: 104 };
      return [
        ...WRAP_NAMES.map((wrap, i) => renderGrove(present({ wrap, open: false, seed: i }), c)),
        ...WRAP_NAMES.map((wrap, i) => renderGrove(present({ wrap, open: true, seed: i }), c)),
      ];
    },
  },
  sleigh: {
    cols: 2,
    scale: 2,
    bg: SNOWY,
    frames: () => [
      renderGrove(sleigh(), { w: 256, h: 192, ox: 128, oy: 150 }),
      renderGrove(reindeer(), { w: 224, h: 256, ox: 112, oy: 214 }),
    ],
  },
  snowman: {
    cols: 4,
    scale: 2,
    bg: SNOWY,
    frames: () => {
      const c = { w: 192, h: 224, ox: 96, oy: 190 };
      return [
        renderGrove(snowman({ scarf: 'red' }), c),
        renderGrove(snowman({ scarf: 'green' }), c),
        renderGrove(candyLamp({ stripe: 'red' }), { w: 160, h: 224, ox: 60, oy: 190 }),
        renderGrove(candyLamp({ stripe: 'green' }), { w: 160, h: 224, ox: 60, oy: 190 }),
      ];
    },
  },
  mounds: {
    cols: 4,
    scale: 2,
    bg: SNOWY,
    frames: () => [
      renderGrove(snowPile({ seed: 1, big: false }), { w: 224, h: 128, ox: 112, oy: 100 }),
      renderGrove(snowPile({ seed: 2, big: true }), { w: 224, h: 128, ox: 112, oy: 100 }),
      renderGrove(snowRock({ seed: 1 }), { w: 192, h: 128, ox: 96, oy: 100 }),
      renderGrove(snowRock({ seed: 2, scale: 0.7 }), { w: 192, h: 128, ox: 96, oy: 100 }),
    ],
  },
  gate: {
    cols: 1,
    scale: 2,
    bg: [150, 210, 140, 255],
    frames: () => [renderGrove(gate(), { w: 320, h: 300, ox: 160, oy: 250 })],
  },
  cabin: {
    cols: 1,
    scale: 2,
    bg: SNOWY,
    frames: () => [renderGrove(cabin(), { w: 380, h: 340, ox: 190, oy: 270 })],
  },
};

for (const [name, g] of Object.entries(groups)) {
  if (only && only !== name) continue;
  const t0 = Date.now();
  const frames = g.frames();
  writePng(
    `assets/source/_scratch/grove-${name}.png`,
    contactSheet(frames, { cols: g.cols, scale: g.scale ?? 2, bg: g.bg, grid: true }),
  );
  console.log(name, Date.now() - t0, 'ms');
}
