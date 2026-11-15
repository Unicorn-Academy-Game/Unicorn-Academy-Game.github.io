import type { GemTable } from '../../../src/content/props';
import { hex, type RGB, ramp } from '../core/color';
import type { Rgba } from '../core/image';
import type { Mesh } from '../core/mesh';
import type { SampleInfo } from '../core/render';
import { applyM, type M3, rotX, rotZ, TAU, type V3, v3 } from '../core/vec';
import { lathe } from './arch';
import { gem } from './gems';
import { GEM, type Ramp } from './palette';
import { blob, tube } from './prims';
import { SceneBuilder } from './scene';
import {
  DIAMOND,
  FLOAT_CANVAS,
  FLOAT_FRAMES,
  GOLD_BANDS,
  gemBands,
  glint,
  MAHOGANY,
  noise,
  r6,
  render,
  TABLE_CANVAS,
} from './treasure';

/**
 * The tables of the treasure house, one for each gem she can learn to spell. Every table is the
 * same footed table with a cloth on its tray, and holds one gem and no other, so the thing she taps
 * is the thing she is asked to spell. Each gem also has a copy that rises from its table and turns
 * in the air, drawn here.
 *
 * The diamond is the exception. Its table is a marble pedestal, drawn with the rest of the room in
 * treasure.ts.
 */

/** The gems that lie on a tray. The diamond has a pedestal of its own. */
export type TrayGem = Exclude<GemTable, 'diamond'>;

/**
 * The cloth each tray is lined with, chosen to stand out against the gem on it and against the tray
 * beside it.
 */
const CLOTH = {
  teal: r6('#2a9a98', 240, 130),
  violet: r6('#6a3fb5', 285, 330),
  crimson: r6('#b02f5c', 325, 40),
  gold: r6('#e0ac3e', 25, 95),
  cream: r6('#f1e3cf', 320, 80),
  navy: r6('#26346e', 250, 280),
  sea: r6('#2b7a72', 215, 125),
  rose: r6('#e0608f', 325, 50),
  slate: r6('#4a3a6a', 280, 300),
} as const;

/** Where the cloth is at the middle of the tray, which is where a stone's girdle lies. */
const CLOTH_TOP = 59;

interface Spot {
  k: number;
  x: number;
  y: number;
  /** Which way round the tray it lies, in radians. */
  a: number;
  size: number;
  /** 0 for the outer ring, 1 for the middle one, 2 for the one in the centre. */
  ring: 0 | 1 | 2;
}

/** Where the stones lie: a ring of nine, a ring of five and one in the middle. */
const SPOTS: readonly Spot[] = (
  [
    { n: 9, r: 33, size: 8.6 },
    { n: 5, r: 17, size: 8.2 },
    { n: 1, r: 0, size: 9.4 },
  ] as const
)
  .flatMap((ring, index) =>
    Array.from({ length: ring.n }, (_, i) => ({
      a: (i / ring.n) * TAU + ring.r * 0.1,
      r: ring.r,
      size: ring.size,
      ring: index as 0 | 1 | 2,
    })),
  )
  .map((s, k) => ({ k, x: Math.cos(s.a) * s.r, y: Math.sin(s.a) * s.r * 0.9, a: s.a, size: s.size, ring: s.ring }));

/** The footed table, its gold rim and the cloth in the tray. Every gem's table is this one. */
function table(b: SceneBuilder, cloth: Ramp): void {
  const gold = b.solid('gold', b.variant('gold', GEM.gold, { bands: GOLD_BANDS }), noise(7));
  const wood = b.solid('wood', b.variant('wood', MAHOGANY), noise(8));
  const velvet = b.solid('velvet', b.variant('velvet', cloth), noise(9));
  lathe(b.mesh(wood), {
    c: v3(0, 0, 0),
    segs: 20,
    smooth: true,
    profile: [
      [30, 0],
      [30, 4],
      [14, 8],
      [9, 14],
      [11, 30],
      [8, 36],
      [10, 44],
      [22, 47],
      [48, 49],
      [48, 52],
      [0, 52],
    ],
  });
  lathe(b.mesh(gold), {
    c: v3(0, 0, 48),
    segs: 24,
    profile: [
      [50, 0],
      [50, 7],
      [47, 7],
      [47, 2],
      [44, 2],
    ],
  });
  lathe(b.mesh(velvet), {
    c: v3(0, 0, 50),
    segs: 22,
    smooth: true,
    profile: [
      [46, 0],
      [44, 5],
      [34, 8],
      [0, 9],
    ],
  });
}

/** Turns a finished mesh about a point, so a part that was built upright can lie or lean. */
function turn(mesh: Mesh, about: V3, by: M3): void {
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const p = applyM(by, [mesh.pos[i]! - about[0], mesh.pos[i + 1]! - about[1], mesh.pos[i + 2]! - about[2]]);
    mesh.pos[i] = mesh.rest[i] = about[0] + p[0];
    mesh.pos[i + 1] = mesh.rest[i + 1] = about[1] + p[1];
    mesh.pos[i + 2] = mesh.rest[i + 2] = about[2] + p[2];
    const n = applyM(by, [mesh.nor[i]!, mesh.nor[i + 1]!, mesh.nor[i + 2]!]);
    mesh.nor[i] = n[0];
    mesh.nor[i + 1] = n[1];
    mesh.nor[i + 2] = n[2];
  }
}

/**
 * A ramp for a stone that is neither bright nor dark by nature: five steps from its shadow to its
 * highlight.
 */
const stone = (base: string, shadowHue = 285, lightHue = 85): Ramp =>
  ramp(hex(base), { steps: 5, shadowHue, lightHue });

const OPAL = {
  milk: ramp(hex('#f2eefa'), { steps: 5, shadowHue: 290, lightHue: 60, lightness: [-0.14, -0.08, 0, 0.03, 0.05] }),
  pink: stone('#ff9fd0', 320, 60),
  sky: stone('#8fd4ff', 250, 150),
  mint: stone('#8ff0c4', 200, 120),
  sun: stone('#ffe27a', 30, 95),
};
const PEARL = ramp(hex('#fbeff2'), {
  steps: 5,
  shadowHue: 310,
  lightHue: 60,
  lightness: [-0.16, -0.09, 0, 0.03, 0.05],
});
const PEARL_PINK = ramp(hex('#f7c9d9'), {
  steps: 5,
  shadowHue: 320,
  lightHue: 60,
  lightness: [-0.14, -0.08, 0, 0.04, 0.07],
});
const JADE = ramp(hex('#8fd6ae'), {
  steps: 5,
  shadowHue: 200,
  lightHue: 120,
  lightness: [-0.22, -0.12, 0, 0.07, 0.14],
});
const ONYX = ramp(hex('#44445f'), { steps: 5, shadowHue: 270, lightHue: 250, lightness: [-0.2, -0.11, 0, 0.12, 0.3] });
const CRYSTALS = [stone('#c4dcff', 250, 190), stone('#f6cbe9', 320, 60), stone('#d6c8ff', 275, 330)] as const;

/** One cut stone of a ramp, with its own part so the lines between neighbours show. */
const faceted = (b: SceneBuilder, ramp: Ramp, edges?: { outline: RGB; outlineLit: RGB }) => {
  const material = b.solid('cut', b.variant('cut', ramp, { bands: gemBands, ...edges }));
  return (at: V3, size: number, o: Parameters<typeof gem>[3]): void => gem(b.mesh(material), at, size, o);
};

/**
 * The ring's gold band and the clear stone that sits on it. `yaw` turns the ring about the
 * vertical.
 */
function ring(b: SceneBuilder, centre: V3, band: number, yaw: number, stoneSize: number): void {
  const gold = b.solid('band', b.variant('band', GEM.gold, { bands: GOLD_BANDS }));
  const mesh = b.mesh(gold);
  const points = Array.from({ length: 13 }, (_, i) => {
    const t = (i / 12) * TAU;
    return {
      p: v3(
        centre[0] + Math.cos(t) * band * Math.cos(yaw),
        centre[1] + Math.cos(t) * band * Math.sin(yaw),
        centre[2] + Math.sin(t) * band,
      ),
      r: band * 0.24,
    };
  });
  tube(mesh, points, { n: 48, segs: 8, capEnd: false, up: v3(-Math.sin(yaw), Math.cos(yaw), 0) });
  const clear = b.solid(
    'clear',
    b.variant('clear', DIAMOND, { bands: [0.12, 0.3, 0.55, 0.82], outline: [64, 84, 150], outlineLit: [96, 126, 196] }),
  );
  gem(b.mesh(clear), v3(centre[0], centre[1], centre[2] + band + stoneSize * 0.25), stoneSize, {
    sides: 8,
    table: 0.62,
    crown: 0.42,
    pavilion: 0.78,
    yaw,
  });
}

/** What goes on a tray: how the gem lies and what the cloth under it is. */
interface Tray {
  cloth: Ramp;
  /** Lays the stones on the tray. */
  lay: (b: SceneBuilder) => void;
  /** Where the light catches, as points above the tray. */
  glints: readonly V3[];
}

const TOPS: readonly V3[] = [v3(-12, -10, 66), v3(14, 12, 66), v3(30, -10, 64), v3(-30, 6, 64), v3(4, -22, 62)];

const cut =
  (
    ramp: Ramp,
    edges: { outline: RGB; outlineLit: RGB } | undefined,
    at: (s: Spot) => Parameters<typeof gem>[3],
    scale = 1,
  ) =>
  (b: SceneBuilder): void => {
    const place = faceted(b, ramp, edges);
    for (const s of SPOTS) place(v3(s.x, s.y, CLOTH_TOP), s.size * scale, at(s));
  };

const TRAYS: Readonly<Record<TrayGem, Tray>> = {
  ruby: {
    cloth: CLOTH.teal,
    lay: cut(GEM.ruby, undefined, (s) => ({
      yaw: s.k * 0.7,
      sides: s.k % 3 === 0 ? 6 : 8,
      stretch: s.k % 4 === 1 ? [1.2, 0.85] : [1, 1],
    })),
    glints: TOPS,
  },
  topaz: {
    cloth: CLOTH.violet,
    lay: cut(GEM.topaz, undefined, (s) => ({ yaw: s.a * 0.5, sides: 10, stretch: [0.84, 1.26], table: 0.6 }), 0.98),
    glints: TOPS,
  },
  emerald: {
    cloth: CLOTH.crimson,
    lay: cut(
      GEM.emerald,
      undefined,
      () => ({ yaw: Math.PI / 8, sides: 8, stretch: [1.32, 0.8], table: 0.72, crown: 0.22, pavilion: 0.55 }),
      1.02,
    ),
    glints: TOPS,
  },
  sapphire: {
    cloth: CLOTH.gold,
    lay: cut(GEM.sapphire, undefined, (s) => ({ yaw: s.k * 0.4, sides: 8, table: 0.58, crown: 0.38 }), 1.06),
    glints: TOPS,
  },
  amethyst: {
    cloth: CLOTH.cream,
    lay: cut(
      GEM.amethyst,
      undefined,
      (s) => ({ yaw: s.a, sides: 6, stretch: [0.88, 1.3], table: 0.5, crown: 0.4 }),
      1.02,
    ),
    glints: TOPS,
  },
  opal: {
    cloth: CLOTH.navy,
    lay: (b) => {
      const variants = (['milk', 'pink', 'sky', 'mint', 'sun'] as const).map((name) =>
        b.variant(`opal-${name}`, OPAL[name]),
      );
      const fire =
        (phase: number) =>
        (s: SampleInfo): number => {
          const w =
            Math.sin(s.rest[0] * 0.62 + s.rest[2] * 0.4 + phase) +
            Math.sin(s.rest[1] * 0.58 - s.rest[2] * 0.7 + phase * 1.3);
          return variants[w > 1.05 ? 1 : w > 0.5 ? 2 : w < -1.05 ? 3 : w < -0.7 ? 4 : 0]!;
        };
      const material = b.material({ name: 'opal', shade: fire(0.4) });
      for (const s of SPOTS)
        blob(
          b.mesh(material),
          v3(s.x, s.y, CLOTH_TOP + s.size * 0.12),
          v3(s.size * 1.12, s.size * 0.9, s.size * 0.62),
          s.a,
          { rings: 8, segs: 12 },
        );
    },
    glints: TOPS.map(([x, y, z]) => v3(x, y, z - 2)),
  },
  pearl: {
    cloth: CLOTH.sea,
    lay: (b) => {
      const white = b.variant('pearl', PEARL, { bands: gemBands });
      const pink = b.variant('pearl-pink', PEARL_PINK, { bands: gemBands });
      const sheen = (s: SampleInfo): number =>
        Math.sin(s.rest[0] * 0.5 + s.rest[1] * 0.4 + s.rest[2] * 0.3) > 0.55 ? pink : white;
      const material = b.material({ name: 'pearl', shade: sheen });
      for (const s of SPOTS)
        blob(
          b.mesh(material),
          v3(s.x, s.y, CLOTH_TOP + s.size * 0.7),
          v3(s.size * 0.92, s.size * 0.92, s.size * 0.92),
          0,
          { rings: 9, segs: 14 },
        );
      // Two more rest on the middle one, so the heap has a top.
      for (const [x, y, z] of [
        [-3.4, 1.4, 15],
        [3.6, -1.2, 15.6],
      ] as const)
        blob(b.mesh(material), v3(x, y, CLOTH_TOP + z), v3(7, 7, 7), 0, { rings: 9, segs: 14 });
    },
    glints: [v3(-12, -10, 70), v3(14, 12, 70), v3(30, -10, 68), v3(-30, 6, 68), v3(0, -2, 84)],
  },
  jade: {
    cloth: CLOTH.rose,
    lay: (b) => {
      const material = b.solid('jade', b.variant('jade', JADE, { bands: [0.1, 0.36, 0.66, 0.88] }));
      const disc = (x: number, y: number, z: number, r: number): void =>
        lathe(b.mesh(material), {
          c: v3(x, y, z),
          segs: 18,
          smooth: true,
          profile: [
            [r * 0.32, 0],
            [r, 0],
            [r * 1.04, 1.6],
            [r, 3.4],
            [r * 0.32, 3.4],
            [r * 0.28, 1.7],
            [r * 0.32, 0],
          ],
        });
      for (const s of SPOTS.filter((spot) => spot.ring < 2)) disc(s.x, s.y, CLOTH_TOP - 1, s.size * 1.06);
      // The ones in the middle are stacked, each a little off the one below.
      disc(0, 0, CLOTH_TOP - 1, 10.4);
      disc(1.4, -0.6, CLOTH_TOP + 2.4, 9);
      disc(-0.6, 1, CLOTH_TOP + 5.8, 7.6);
    },
    glints: TOPS.map(([x, y, z]) => v3(x, y, z - 3)),
  },
  onyx: {
    cloth: CLOTH.cream,
    lay: cut(
      ONYX,
      { outline: [20, 20, 34], outlineLit: [86, 86, 124] },
      (s) => ({
        yaw: Math.PI / 8 + (s.k % 2) * 0.12,
        sides: 8,
        stretch: [1.14, 0.92],
        table: 0.66,
        crown: 0.26,
        pavilion: 0.6,
      }),
      1.04,
    ),
    glints: TOPS,
  },
  crystal: {
    cloth: CLOTH.slate,
    lay: (b) => {
      const tints = CRYSTALS.map((tint, i) =>
        b.solid(`crystal-${i}`, b.variant(`crystal-${i}`, tint, { bands: [0.1, 0.36, 0.64, 0.88] })),
      );
      // A point is a six-sided prism that ends in a pyramid. The ones in the middle stand tallest.
      const height = [15, 24, 36] as const;
      for (const s of SPOTS) {
        const r = 4.4 + (s.k % 3) * 0.5 + s.ring * 0.4;
        const h = height[s.ring]! + (s.k % 4) * 2.4;
        lathe(b.mesh(tints[s.k % tints.length]!), {
          c: v3(s.x, s.y, CLOTH_TOP - 3),
          segs: 6,
          faceted: true,
          yaw: s.k * 0.5,
          profile: [
            [r, 0],
            [r, h],
            [0, h + r * 1.5],
          ],
        });
      }
    },
    glints: [v3(-12, -10, 80), v3(14, 12, 84), v3(-30, 6, 74), v3(30, -10, 74), v3(0, -2, 100)],
  },
  ring: {
    cloth: CLOTH.teal,
    lay: (b) => {
      // Seven rings stand on their edges: one in the middle and six round it, each turned a little
      // differently.
      const spots: [number, number][] = [
        [0, 0],
        ...Array.from({ length: 6 }, (_, i): [number, number] => [
          Math.cos((i / 6) * TAU + 0.5) * 27,
          Math.sin((i / 6) * TAU + 0.5) * 27 * 0.9,
        ]),
      ];
      spots.forEach(([x, y], i) => {
        ring(b, v3(x, y, CLOTH_TOP + 4), 9.2, ((i % 3) - 1) * 0.5, 5.2);
      });
    },
    glints: [v3(-20, -6, 86), v3(18, 8, 86), v3(0, -22, 80), v3(0, 2, 90)],
  },
};

/** A table with a tray of one gem on it. */
export function trayTable(name: TrayGem): SceneBuilder {
  const b = new SceneBuilder();
  const tray = TRAYS[name];
  table(b, tray.cloth);
  tray.lay(b);
  return b;
}

export function renderTrayTable(name: TrayGem): Rgba {
  const r = render(trayTable(name), TABLE_CANVAS, { aoRadius: 8 });
  for (const p of TRAYS[name].glints) glint(r.rgba, ...r.at(p), 3);
  return r.rgba;
}

/** The gems whose copy is drawn here. The five stones and the diamond are drawn in treasure.ts. */
export type RisingGem = 'opal' | 'pearl' | 'jade' | 'onyx' | 'crystal' | 'ring';

/** How much of a turn the eight frames make, so the last frame runs into the first. */
const TURN: Readonly<Record<RisingGem, number>> = {
  opal: TAU,
  pearl: TAU,
  jade: Math.PI,
  onyx: TAU / 8,
  crystal: TAU / 6,
  ring: Math.PI,
};

/** One of eight turns of a gem that has risen from its table. */
export function renderRisingGem(name: RisingGem, frame: number): Rgba {
  const b = new SceneBuilder();
  const centre = v3(0, 0, 22);
  const turned = (frame / FLOAT_FRAMES) * TURN[name];
  switch (name) {
    case 'opal': {
      const variants = (['milk', 'pink', 'sky', 'mint', 'sun'] as const).map((n) => b.variant(`opal-${n}`, OPAL[n]));
      const material = b.material({
        name: 'opal',
        shade: (s) => {
          const w =
            Math.sin(s.rest[0] * 0.3 + s.rest[2] * 0.22 + turned) +
            Math.sin(s.rest[1] * 0.28 - s.rest[2] * 0.34 + turned * 2);
          return variants[w > 1.05 ? 1 : w > 0.45 ? 2 : w < -1.05 ? 3 : w < -0.65 ? 4 : 0]!;
        },
      });
      blob(b.mesh(material), centre, v3(23, 19, 16), 0.3, { rings: 12, segs: 18 });
      break;
    }
    case 'pearl': {
      const white = b.variant('pearl', PEARL, { bands: gemBands });
      const pink = b.variant('pearl-pink', PEARL_PINK, { bands: gemBands });
      const material = b.material({
        name: 'pearl',
        shade: (s) => (Math.sin(s.rest[0] * 0.28 + s.rest[1] * 0.2 + s.rest[2] * 0.22 + turned) > 0.5 ? pink : white),
      });
      blob(b.mesh(material), centre, v3(19, 19, 19), 0, { rings: 14, segs: 20 });
      break;
    }
    case 'jade': {
      const mesh = b.mesh(b.solid('jade', b.variant('jade', JADE, { bands: [0.1, 0.36, 0.66, 0.88] })));
      lathe(mesh, {
        c: centre,
        segs: 24,
        smooth: true,
        profile: [
          [6.4, -3.6],
          [19, -3.6],
          [20.4, 0],
          [19, 3.6],
          [6.4, 3.6],
          [5.2, 0],
          [6.4, -3.6],
        ],
      });
      // Stood on its edge with its face to the viewer, turning about the upright, and leaning back
      // a little.
      turn(mesh, centre, rotX(-Math.PI / 2));
      turn(mesh, centre, rotZ(turned));
      turn(mesh, centre, rotX(-0.28));
      break;
    }
    case 'onyx': {
      faceted(b, ONYX, { outline: [20, 20, 34], outlineLit: [120, 120, 170] })(centre, 22, {
        sides: 8,
        yaw: turned + Math.PI / 8,
        stretch: [1.08, 0.94],
        table: 0.62,
        crown: 0.34,
        pavilion: 0.85,
      });
      break;
    }
    case 'crystal': {
      const mesh = b.mesh(b.solid('crystal', b.variant('crystal', CRYSTALS[0], { bands: [0.1, 0.36, 0.64, 0.88] })));
      lathe(mesh, {
        c: centre,
        segs: 6,
        faceted: true,
        profile: [
          [0, -21],
          [7.6, -13],
          [7.6, 12],
          [0, 22],
        ],
      });
      turn(mesh, centre, rotZ(turned));
      turn(mesh, centre, rotX(-0.32));
      break;
    }
    case 'ring':
      ring(b, v3(0, 0, 14), 17, turned, 8.4);
      break;
  }
  const r = render(b, FLOAT_CANVAS, { aoRadius: 6, ss: 4 });
  glint(r.rgba, ...r.at(v3(-6 + Math.cos(frame) * 3, 0, 40)), 4);
  return r.rgba;
}
