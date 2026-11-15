/**
 * The pictures hidden in the sky of the star cannon: stars that are asleep at the places of a
 * picture, and the lines between them that appear as the stars wake. Each is a few points on a
 * sheet one unit wide, with the lines that join them. The unicorn is the night's, and the heart is
 * the dusk's.
 */

export interface Spot {
  readonly x: number;
  readonly y: number;
}

export interface Constellation {
  readonly name: string;
  /**
   * The sheet's height, as a share of its width. The picture is fitted into whatever room the
   * screen has, whole.
   */
  readonly aspect: number;
  readonly points: readonly Spot[];
  /**
   * How big a star is from its middle to the tip of a point, as a share of the sheet's width. No
   * two stars are nearer than twice this.
   */
  readonly starShare: number;
  /** Pairs of points that have a line between them once both are awake. */
  readonly lines: readonly (readonly [number, number])[];
  /** Whether the picture has a front, so that its mirror image is a different way to hang it. */
  readonly handed: boolean;
}

/**
 * A unicorn at a gallop, facing right. The stars are where the picture is easiest to know her by:
 * the tip of her horn, her ear and her nose, the streaming mane, her back and tail, chest, belly
 * and haunch, and her hooves. They keep off her face so that it can be seen. The lines follow her
 * outline, and the shape of light drawn behind them (see `silhouette.ts`) fills in the rest.
 */
const UNICORN: Constellation = {
  name: 'unicorn',
  aspect: 0.52,
  handed: true,
  starShare: 0.044,
  points: [
    { x: 0.958, y: 0.008 }, // 0 the tip of the horn
    { x: 0.775, y: 0.045 }, // 1 the ear
    { x: 0.945, y: 0.205 }, // 2 the nose
    { x: 0.54, y: 0.04 }, // 3 the end of the highest strand of the mane
    { x: 0.69, y: 0.135 }, // 4 the crest of the neck
    { x: 0.6, y: 0.16 }, // 5 the middle of the mane
    { x: 0.46, y: 0.11 }, // 6 the end of the next strand
    { x: 0.52, y: 0.22 }, // 7 the withers
    { x: 0.4, y: 0.19 }, // 8 the back
    { x: 0.27, y: 0.235 }, // 9 the rump
    { x: 0.13, y: 0.18 }, // 10 the middle of the tail
    { x: 0.03, y: 0.24 }, // 11 the tip of the tail
    { x: 0.62, y: 0.3 }, // 12 the chest
    { x: 0.46, y: 0.33 }, // 13 the belly
    { x: 0.33, y: 0.325 }, // 14 the haunch
    { x: 0.78, y: 0.455 }, // 15 the near front hoof
    { x: 0.675, y: 0.49 }, // 16 the other front hoof
    { x: 0.09, y: 0.43 }, // 17 the near hind hoof
    { x: 0.21, y: 0.485 }, // 18 the other hind hoof
    { x: 0.7, y: 0.375 }, // 19 the knee
    { x: 0.2, y: 0.38 }, // 20 the hock
  ],
  lines: [
    [0, 1],
    [1, 4],
    [4, 5],
    [4, 3],
    [5, 6],
    [5, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [2, 12],
    [12, 13],
    [13, 14],
    [14, 9],
    [12, 19],
    [19, 15],
    [12, 16],
    [14, 20],
    [20, 17],
    [13, 18],
  ],
};

/** How much of its height the heart keeps. */
const PLUMP = 0.86;

/** A heart, with a smaller one inside it and a star at its middle. */
const HEART: Constellation = (() => {
  const outer = 14;
  const inner = 6;
  // The classic heart curve, set on a sheet one wide: its lobes touch the top, its dip is a fifth
  // of the way down and its tip is at the bottom.
  const curve = (t: number): Spot => ({
    x: 0.5 + (16 * Math.sin(t) ** 3) / 32,
    y: (12 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))) / 32,
  });
  // The curve is slow near its dip and its tip, so stars an equal step of the curve's parameter
  // apart would crowd there. These are an equal distance apart along it, from the dip round.
  const dense: { t: number; along: number }[] = [];
  let along = 0;
  let before = curve(0);
  for (let i = 0; i <= 4000; i++) {
    const t = (i / 4000) * Math.PI * 2;
    const at = curve(t);
    along += Math.hypot(at.x - before.x, at.y - before.y);
    before = at;
    dense.push({ t, along });
  }
  const evenly = (count: number): Spot[] =>
    Array.from({ length: count }, (_, k) => {
      const want = (k / count) * along;
      return curve(dense.find((d) => d.along >= want)!.t);
    });
  const middle: Spot = { x: 0.5, y: 0.45 };
  const points: Spot[] = evenly(outer);
  for (const p of evenly(inner))
    points.push({ x: middle.x + (p.x - middle.x) * 0.5, y: middle.y + (p.y - middle.y) * 0.5 });
  const centre = points.length;
  points.push({ x: 0.5, y: 0.5 });
  const lines: [number, number][] = [];
  for (let i = 0; i < outer; i++) lines.push([i, (i + 1) % outer]);
  for (let i = 0; i < inner; i++) lines.push([outer + i, outer + ((i + 1) % inner)]);
  // The little heart hangs from the dip of the big one, and the star at the middle is held up by
  // the little heart's dip and its tip.
  lines.push([0, outer], [centre, outer], [centre, outer + inner / 2]);
  // The heart is drawn a little plump, which fits a screen held sideways better than a tall one.
  const plump = points.map((p) => ({ x: p.x, y: p.y * PLUMP }));
  return { name: 'heart', aspect: 0.91 * PLUMP, handed: false, starShare: 0.048, points: plump, lines };
})();

export const CONSTELLATIONS: Readonly<Record<string, Constellation>> = { star: UNICORN, heart: HEART };

export const constellationOf = (look: string): Constellation => CONSTELLATIONS[look] ?? UNICORN;

/**
 * The picture as seen in a mirror. A picture with no front is its own mirror image, and comes back
 * as it was.
 */
export const mirror = (c: Constellation): Constellation =>
  c.handed ? { ...c, points: c.points.map((p) => ({ x: 1 - p.x, y: p.y })) } : c;

/**
 * Where each point of a picture stands when the picture is fitted whole into a box and centred in
 * it. The same room gives the same places, so a screen turned and turned back finds every star
 * where it was.
 */
export function fit(
  c: Constellation,
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  out: Spot[] = [],
): Spot[] {
  const width = Math.min(box.w, box.h / c.aspect);
  const height = width * c.aspect;
  const left = box.x + (box.w - width) / 2;
  const top = box.y + (box.h - height) / 2;
  out.length = c.points.length;
  c.points.forEach((p, i) => {
    out[i] = { x: left + p.x * width, y: top + p.y * width };
  });
  return out;
}
