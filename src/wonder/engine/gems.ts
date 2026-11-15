import type { Pic } from './bank';
import { bucket, css, darken, lighten, mix, type RGB, unbucket } from './color';
import { prerender } from './paint';

/**
 * A cut stone and a folded star, seen from the front, drawn once for each colour and kept. Light
 * comes from the top left, so the facets that face it are pale and the ones that turn away are
 * dark, and the same stone is the same stone in every game that has one.
 */

const SIZE = 64;
const cache = new Map<number, HTMLCanvasElement>();
const starCache = new Map<number, HTMLCanvasElement>();

type P = readonly [number, number];

/** The six facets of a stone, with how much lighter (+) or darker (-) each is than its colour. */
const FACETS: readonly { readonly points: readonly P[]; readonly tone: number }[] = [
  {
    points: [
      [14, 10],
      [32, 10],
      [24, 24],
      [2, 24],
    ],
    tone: 0.34,
  },
  {
    points: [
      [32, 10],
      [50, 10],
      [62, 24],
      [40, 24],
    ],
    tone: 0.02,
  },
  {
    points: [
      [32, 10],
      [40, 24],
      [24, 24],
    ],
    tone: 0.62,
  },
  {
    points: [
      [2, 24],
      [24, 24],
      [32, 58],
    ],
    tone: -0.04,
  },
  {
    points: [
      [24, 24],
      [40, 24],
      [32, 58],
    ],
    tone: 0.2,
  },
  {
    points: [
      [40, 24],
      [62, 24],
      [32, 58],
    ],
    tone: -0.32,
  },
];

/** The stone in this colour. Colours near each other share one picture. */
export function gemImage(color: RGB): HTMLCanvasElement {
  const key = bucket(color[0], color[1], color[2]);
  let image = cache.get(key);
  if (!image) {
    const base = unbucket(key);
    image = prerender(SIZE, SIZE, (g) => {
      for (const f of FACETS) {
        g.fillStyle = css(f.tone >= 0 ? lighten(base, f.tone) : darken(base, -f.tone));
        g.beginPath();
        f.points.forEach(([x, y], i) => {
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        });
        g.closePath();
        g.fill();
      }
      // The edges between the facets, then the edge of the stone.
      g.lineJoin = 'round';
      g.strokeStyle = css(lighten(base, 0.7), 0.5);
      g.lineWidth = 1;
      g.beginPath();
      for (const [x0, y0, x1, y1] of [
        [2, 24, 62, 24],
        [32, 10, 24, 24],
        [32, 10, 40, 24],
        [24, 24, 32, 58],
        [40, 24, 32, 58],
      ] as const) {
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
      }
      g.stroke();
      g.strokeStyle = css(darken(base, 0.45), 0.9);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(14, 10);
      g.lineTo(50, 10);
      g.lineTo(62, 24);
      g.lineTo(32, 58);
      g.lineTo(2, 24);
      g.closePath();
      g.stroke();
      // A glint on the face that looks at the light.
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.ellipse(21, 16, 4.5, 2.2, -0.35, 0, Math.PI * 2);
      g.fill();
    });
    cache.set(key, image);
  }
  return image;
}

const STAR_POINTS = 5;

/**
 * A star folded from paper: each point is two flat faces, one in the light and one out of it, with
 * a bold edge round it so it shows against a bright sky as well as a dark one. Colours near each
 * other share one picture.
 */
export function starImage(color: RGB): HTMLCanvasElement {
  const key = bucket(color[0], color[1], color[2]);
  let image = starCache.get(key);
  if (!image) {
    const base = unbucket(key);
    image = prerender(SIZE, SIZE, (g) => {
      const cx = 32;
      const cy = 34;
      const outer = 28;
      const inner = 12.6;
      const at = (angle: number, radius: number): P => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
      const rim = mix(darken(base, 0.3), [214, 86, 20], 0.45);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      // The whole star first, in the rim colour, a little fatter, so the edge is even all the way
      // round.
      g.fillStyle = css(rim);
      g.strokeStyle = css(rim);
      g.lineWidth = 6;
      g.beginPath();
      for (let i = 0; i < STAR_POINTS * 2; i++) {
        const [x, y] = at(-Math.PI / 2 + (i * Math.PI) / STAR_POINTS, i % 2 === 0 ? outer : inner);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      g.stroke();
      // The faces: for each point, the half that turns toward the light is pale and the half that
      // turns away is deep.
      for (let k = 0; k < STAR_POINTS; k++) {
        const tip = -Math.PI / 2 + (k * 2 * Math.PI) / STAR_POINTS;
        const to = at(tip, outer);
        for (const side of [-1, 1] as const) {
          const corner = at(tip + (side * Math.PI) / STAR_POINTS, inner);
          // Which way the face looks, against a light that comes from the top left.
          const look = tip + (side * Math.PI) / STAR_POINTS / 2;
          const lit = Math.cos(look - -Math.PI * 0.75);
          const face = lit >= 0 ? lighten(base, 0.12 + 0.4 * lit) : darken(base, -0.28 * lit);
          g.fillStyle = css(face);
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(to[0], to[1]);
          g.lineTo(corner[0], corner[1]);
          g.closePath();
          g.fill();
        }
      }
      // A glint, where the light first lands.
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(24, 21, 4, 2, -0.7, 0, Math.PI * 2);
      g.fill();
    });
    starCache.set(key, image);
  }
  return image;
}

const pics = new Map<HTMLCanvasElement, Pic>();

/** A stone or a star as a picture a particle can be, held by its middle. */
export function pictureOfStone(image: HTMLCanvasElement): Pic {
  let pic = pics.get(image);
  if (!pic) {
    pic = { image, sx: 0, sy: 0, sw: image.width, sh: image.height, ax: image.width / 2, ay: image.height / 2 };
    pics.set(image, pic);
  }
  return pic;
}

/** Lets go of the stones and stars made so far. */
export function forgetGems(): void {
  cache.clear();
  starCache.clear();
  pics.clear();
}
