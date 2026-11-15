import { fromOklch, hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import { mulberry32 } from '../core/rng';
import { TAU, type V3, v3 } from '../core/vec';
import { archShape, extrude, FRONT } from './arch';
import { jewel, prism } from './cave-gems';
import { underGlow } from './glow';
import { Painter } from './paint';
import type { Ramp } from './palette';
import { blob } from './prims';
import { renderScene, SceneBuilder } from './scene';

/**
 * The mouth of the cave, where the forest ends: a hill of grey-violet stone with a round doorway in
 * its face, a few crystals growing out of its shoulders, and a violet light coming from somewhere
 * deep inside. It is drawn in the forest's bundle, since it is the forest that has it, and it
 * stands where the herd walks into the cave.
 */

export const MOUTH_CANVAS = { w: 560, h: 440, ox: 280, oy: 350 } as const;

const STONE: Ramp = ramp(hex('#8d88b4'), {
  steps: 6,
  shadowHue: 275,
  lightHue: 330,
  lean: 0.9,
  lightness: [-0.34, -0.23, -0.12, -0.03, 0.05, 0.12],
});

const OPEN = { w: 156, h: 190 };

function build(): SceneBuilder {
  const b = new SceneBuilder();
  const rng = mulberry32(77);
  const stone = b.solid(
    'stone',
    b.variant('stone', STONE, { bands: [0.15, 0.32, 0.52, 0.74, 0.9] }),
    (s) => (((s.px * 7 + s.py * 13) % 11) / 11 - 0.5) * 0.07,
  );
  const rock = b.mesh(stone);

  // The hill behind, and a heap of shoulders either side of the doorway.
  blob(rock, v3(0, 80, 92), v3(236, 118, 118), 0.2, { rings: 10, segs: 20 });
  blob(rock, v3(-176, 24, 52), v3(92, 70, 56), 1.2, { rings: 7, segs: 12 });
  blob(rock, v3(176, 22, 56), v3(96, 72, 60), 2.1, { rings: 7, segs: 12 });
  blob(rock, v3(-92, 40, 150), v3(110, 70, 70), 0.6, { rings: 7, segs: 12 });
  blob(rock, v3(96, 40, 154), v3(110, 72, 72), 1.7, { rings: 7, segs: 12 });
  // Stones heaped at the foot, so the hill is not set down on the grass like a lid.
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (96 + rng() * 150);
    const r = 20 + rng() * 18;
    blob(rock, v3(x, -26 - rng() * 22, r * 0.45), v3(r * 1.2, r * 0.9, r * 0.8), rng() * 3, { rings: 5, segs: 9 });
  }

  // The doorway: a slab of stone in front of the hill, which the light of the cave is painted into
  // afterwards.
  extrude(rock, archShape(OPEN.w + 64, OPEN.h + 44), FRONT(0, -50, 0), 0, 30, { caps: 'front' });
  // Rough stones at the two feet of the arch, so the slab does not end in a straight line.
  for (const [x, y, r] of [
    [-104, -96, 24],
    [-70, -104, 15],
    [102, -94, 26],
    [72, -104, 14],
    [-122, -84, 18],
    [124, -80, 17],
  ] as const)
    blob(rock, v3(x, y, r * 0.45), v3(r * 1.2, r * 0.9, r * 0.8), x * 0.03, { rings: 5, segs: 9 });

  // Crystals growing out of the stone, in the colours of the cave: a violet cluster on each
  // shoulder and a pale one on top.
  const grow = (colors: Ramp, at: V3, scale: number, n: number, seed: number): void => {
    const g = mulberry32(seed);
    const m = b.mesh(
      b.solid(
        `gem${seed}`,
        b.variant(`gem${seed}`, colors, { bands: [0.16, 0.4, 0.64, 0.86], outlineLit: colors[1]! }),
      ),
    );
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + g();
      const d = i === 0 ? 0 : (10 + g() * 14) * scale;
      prism(m, v3(at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d * 0.7, at[2]), {
        r: (i === 0 ? 11 : 6.5 + g() * 4) * scale,
        h: (i === 0 ? 74 : 30 + g() * 36) * scale,
        lean: [Math.cos(a) * 0.26 * (i === 0 ? 0.1 : 1), Math.sin(a) * 0.2],
        yaw: g() * 2,
      });
    }
  };
  grow(jewel(305), v3(-196, 14, 84), 1.1, 5, 3);
  grow(jewel(325), v3(202, 10, 90), 1.2, 5, 4);
  grow(jewel(250, 0.09), v3(-60, 30, 216), 1, 4, 5);
  grow(jewel(290), v3(60, 22, 178), 0.8, 3, 6);
  return b;
}

/** Whether a point is inside a polygon. */
function inside(poly: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}

/**
 * The doorway is cut into the slab after it is drawn: a rim of shaded stone all round the opening,
 * as if the hill were thick, and inside it the light of the cave, deep indigo at the top and violet
 * and then pink toward the floor, with a few crystals black against it.
 */
function cutDoorway(img: Rgba, at: (p: V3) => [number, number]): void {
  const p = new Painter(img);
  const front = -80;
  const shape = (w: number, h: number): [number, number][] => archShape(w, h).map(([x, z]) => at(v3(x, front, z)));
  const hole = shape(OPEN.w, OPEN.h);
  const core = shape(OPEN.w - 20, OPEN.h - 14);
  const xs = hole.map((q) => q[0]),
    ys = hole.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)),
    x1 = Math.ceil(Math.max(...xs)),
    y0 = Math.floor(Math.min(...ys)),
    y1 = Math.ceil(Math.max(...ys));
  const rim: RGB[] = [STONE[0]!, STONE[1]!, STONE[2]!];
  const steps: RGB[] = [
    [28, 12, 62],
    [44, 18, 88],
    [68, 28, 120],
    [102, 44, 158],
    [148, 74, 196],
    [196, 118, 226],
  ];
  const cx = (x0 + x1) / 2;
  // The seams between the stones of the arch, which run out from its middle, and between the
  // courses below its springing.
  const outer = shape(OPEN.w + 64, OPEN.h + 44);
  const ox = outer.map((q) => q[0]),
    oy = outer.map((q) => q[1]);
  const [, spring] = at(v3(0, front, OPEN.h - OPEN.w / 2));
  for (let y = Math.floor(Math.min(...oy)); y <= Math.ceil(Math.max(...oy)); y++) {
    for (let x = Math.floor(Math.min(...ox)); x <= Math.ceil(Math.max(...ox)); x++) {
      if (!inside(outer, x + 0.5, y + 0.5) || inside(hole, x + 0.5, y + 0.5)) continue;
      const seam =
        y < spring
          ? (Math.atan2(y - spring, x - cx) + Math.PI) % 0.34 < 0.045
          : (y - spring) % 38 < 2 ||
            (Math.abs(x - cx) > 60 && Math.round(Math.abs(x - cx)) % 44 < 2 && (y - spring) % 76 < 38);
      if (seam) p.px(x, y, rim[0]!);
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(hole, x + 0.5, y + 0.5)) continue;
      if (!inside(core, x + 0.5, y + 0.5)) {
        // The thickness of the hill, seen on the inside of the arch: darker at the top, lighter low
        // on the right.
        p.px(x, y, rim[y < (y0 + y1) / 2 ? (x < cx ? 0 : 1) : x < cx ? 1 : 2]!);
        continue;
      }
      const t = (y - y0) / (y1 - y0);
      const sideways = Math.abs(x - cx) / ((x1 - x0) / 2);
      const k = Math.min(steps.length - 1, Math.floor((t * t * 0.95 + (1 - sideways) * 0.14) * steps.length));
      p.px(x, y, steps[Math.max(0, k)]!);
    }
  }
  // Far inside, three crystals stand black against the light.
  for (const [dx, h, w] of [
    [-30, 58, 7],
    [6, 82, 9],
    [40, 50, 6],
  ] as const) {
    for (let i = 0; i < h; i++) {
      const half = Math.max(0, Math.round((w * (h - i)) / h));
      for (let x = -half; x <= half; x++) {
        const px = Math.round(cx) + dx + x,
          py = y1 - 6 - i;
        if (inside(core, px + 0.5, py + 0.5)) p.px(px, py, [26, 10, 58]);
      }
    }
  }
}

export function renderCaveMouth(): Rgba {
  const c = MOUTH_CANVAS;
  const { rgba, at } = renderScene(build(), {
    width: c.w,
    height: c.h,
    originX: c.ox,
    originY: c.oy,
    ss: 4,
    aoRadius: 12,
    lineDepth: 6,
  });
  cutDoorway(rgba, at);
  const [fx, fy] = at(v3(0, -130, 0));
  return underGlow(rgba, fx, fy + 6, 150, 46, fromOklch(0.78, 0.15, 305), 0.42);
}
