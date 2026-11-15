import type { Rng } from '../../../domain/rng';
import { COLORS, css, darken, lighten, RAINBOW, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import { pictureOf } from '../../engine/particles';
import { cloudVariant, hash, stampCloud, type Variant } from './sky';
import type { Track } from './track';

/** How wide each of the seven colours is. */
const BAND = 7;
/** Half the rainbow's thickness. The unicorn's hooves are on its top edge. */
const HALF = (BAND * RAINBOW.length) / 2;

const STEP = 12;
const MOST = 640;

/** A point along a rainbow: where it is and which way is up from it. */
export interface Bend {
  x: number;
  y: number;
  /** The direction at right angles to the rainbow, upward. */
  nx: number;
  ny: number;
}

/**
 * Fills `out` with `count` points along the track, `STEP` apart, from the first multiple of it at
 * or before `from`. Returns how many there are.
 */
function sample(track: Track, from: number, to: number, out: Bend[]): number {
  const first = Math.floor(from / STEP) * STEP;
  const count = Math.min(out.length, Math.ceil((to - first) / STEP) + 1);
  for (let i = 0; i < count; i++) {
    const x = first + i * STEP;
    const s = track.slopeAt(x);
    const n = Math.sqrt(1 + s * s);
    const b = out[i]!;
    b.x = x;
    b.y = track.heightAt(x);
    b.nx = s / n;
    b.ny = -1 / n;
  }
  return count;
}

/**
 * Draws seven stripes along the points from `first` up to `count`, each pushed out from the middle
 * along the line's normal.
 */
function stripes(
  g: CanvasRenderingContext2D,
  pts: readonly Bend[],
  first: number,
  count: number,
  colors: readonly RGB[],
  band: number,
  alpha = 1,
  overlap = 1.1,
): void {
  const middle = (colors.length - 1) / 2;
  g.lineJoin = 'round';
  g.lineCap = 'butt';
  g.lineWidth = band + overlap;
  // The lowest colour first, so each one above it covers the edge of the one below.
  for (let k = colors.length - 1; k >= 0; k--) {
    const o = (middle - k) * band;
    g.strokeStyle = css(colors[k]!, alpha);
    g.beginPath();
    for (let i = first; i < count; i++) {
      const b = pts[i]!;
      const x = b.x + b.nx * o;
      const y = b.y + b.ny * o;
      if (i === first) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

/**
 * The rainbow itself: seven stripes along the track with a soft shadow under it, a bright edge
 * along its top, little clouds holding it up from below, and twinkles that come and go along it.
 */
export class Ribbon {
  private readonly pts: Bend[] = Array.from({ length: MOST }, () => ({ x: 0, y: 0, nx: 0, ny: -1 }));
  private readonly puffs: Variant[];

  constructor(
    private readonly track: Track,
    rng: Rng,
  ) {
    this.puffs = Array.from({ length: 5 }, () => cloudVariant(rng, rng.range(70, 110), 5, 1.15));
  }

  /** The clouds under the rainbow. They are behind everything else on it. */
  paintUnder(g: CanvasRenderingContext2D, from: number, to: number, dusk: number): void {
    const spacing = 64;
    const first = Math.floor(from / spacing) - 1;
    const last = Math.ceil(to / spacing) + 1;
    for (let i = first; i <= last; i++) {
      const v = this.puffs[Math.floor(hash(i, 40) * this.puffs.length)]!;
      const scale = 0.9 + hash(i, 41) * 0.7;
      const x = i * spacing + hash(i, 42) * 30;
      const y = this.track.heightAt(x) + HALF - v.h * scale * 0.5 + hash(i, 43) * 14;
      stampCloud(g, v, x - (v.w * scale) / 2, y, v.w * scale, v.h * scale, 1, dusk);
    }
  }

  /**
   * The stripes. `glow` is how much brighter it is than usual, from 0 to 1, for a rider who is
   * fast.
   */
  paint(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    from: number,
    to: number,
    t: number,
    glow: number,
    calm: boolean,
  ): void {
    const count = sample(this.track, from - STEP * 2, to + STEP * 2, this.pts);
    this.dress(g, this.pts, 0, count, glow);
    this.twinkles(light, from, to, t, calm);
  }

  /**
   * The stripes of a rainbow that is a line of points and not a track: the points from `first` to
   * `last`, with the shadow, the edges and the glow.
   */
  paintRail(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    rail: readonly Bend[],
    first: number,
    last: number,
    t: number,
    glow: number,
    calm: boolean,
  ): void {
    this.dress(g, rail, first, last + 1, glow);
    const rate = calm ? 0.3 : 0.7;
    const star = pictureOf('star4', 255, 255, 255);
    if (!star) return;
    // About one twinkle in every dozen points, each always in the same place on the rail.
    for (let i = first; i <= last; i += 11) {
      const phase = (t * rate + hash(i, 50) * 9) % 1;
      const open = Math.sin(phase * Math.PI) ** 3;
      if (open < 0.04) continue;
      const b = rail[i]!;
      const along = (hash(i, 52) - 0.5) * (HALF * 1.6);
      const size = 10 + hash(i, 53) * 12;
      light.globalAlpha = open;
      light.drawImage(star, b.x + b.nx * along - size / 2, b.y + b.ny * along - size / 2, size, size);
    }
    light.globalAlpha = 1;
  }

  /** The clouds under a rail: a puff every little way along it, on the side away from the rider. */
  paintRailUnder(g: CanvasRenderingContext2D, rail: readonly Bend[], first: number, last: number, dusk: number): void {
    // A point of the rail is eight units on, so a puff is every eighth point or so.
    for (let i = Math.max(first, 0); i <= last; i += 8) {
      const v = this.puffs[Math.floor(hash(i, 44) * this.puffs.length)]!;
      const scale = 0.9 + hash(i, 45) * 0.7;
      const b = rail[i]!;
      const w = v.w * scale;
      const h = v.h * scale;
      // Under it is the other way from up, and a puff sits with its middle there.
      const cx = b.x - b.nx * (HALF + h * 0.18);
      const cy = b.y - b.ny * (HALF + h * 0.18);
      stampCloud(g, v, cx - w / 2, cy - h / 2, w, h, 1, dusk);
    }
  }

  /**
   * The rainbow itself, for any line of points: a soft shadow, seven stripes, a bright edge along
   * the top and a dark one along the bottom.
   */
  private dress(g: CanvasRenderingContext2D, pts: readonly Bend[], first: number, count: number, glow: number): void {
    // A soft shadow under it, on the clouds below.
    g.save();
    g.translate(0, 12);
    stripes(g, pts, first, count, [[120, 100, 190]], HALF * 2.3, 0.14, 0);
    g.restore();
    stripes(g, pts, first, count, RAINBOW, BAND);
    // The top edge catches the sun, and the bottom edge turns away from it.
    const edge = (o: number, color: string, width: number): void => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (let i = first; i < count; i++) {
        const b = pts[i]!;
        if (i === first) g.moveTo(b.x + b.nx * o, b.y + b.ny * o);
        else g.lineTo(b.x + b.nx * o, b.y + b.ny * o);
      }
      g.stroke();
    };
    edge(HALF - 1.4, 'rgba(255,255,255,0.55)', 2.2);
    edge(HALF - 5, 'rgba(255,255,255,0.18)', 1.6);
    edge(-HALF + 1.2, 'rgba(70,50,140,0.22)', 2.2);
    if (glow > 0.02) {
      g.globalCompositeOperation = 'lighter';
      stripes(g, pts, first, count, [[255, 255, 255]], HALF * 2, 0.22 * glow, 0);
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Little stars that open and close on the rainbow, each at a place that is always the same. */
  private twinkles(light: CanvasRenderingContext2D, from: number, to: number, t: number, calm: boolean): void {
    const spacing = 110;
    const first = Math.floor(from / spacing) - 1;
    const last = Math.ceil(to / spacing) + 1;
    const star = pictureOf('star4', 255, 255, 255);
    if (!star) return;
    for (let i = first; i <= last; i++) {
      const rate = calm ? 0.3 : 0.7;
      const phase = (t * rate + hash(i, 50) * 9) % 1;
      const open = Math.sin(phase * Math.PI) ** 3;
      if (open < 0.04) continue;
      const x = i * spacing + hash(i, 51) * spacing;
      const along = (hash(i, 52) - 0.5) * (HALF * 1.6);
      const s = this.track.slopeAt(x);
      const n = Math.sqrt(1 + s * s);
      const y = this.track.heightAt(x) + (-1 / n) * along;
      const size = 10 + hash(i, 53) * 12;
      light.globalAlpha = open;
      light.drawImage(star, x + (s / n) * along - size / 2, y - size / 2, size, size);
    }
    light.globalAlpha = 1;
  }
}

/**
 * A hoop standing across the rainbow. It is a ring of gold that is wider from front to back than it
 * looks, so it is drawn as an oval seen a little from the side: the far half behind the rider and
 * the near half over her. It has a dark edge so it is seen against the bright sky, and a pale fill
 * so it looks like something to go through.
 */
export function paintHoop(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  near: boolean,
  tint: RGB = COLORS.gold,
): void {
  const squash = 0.3;
  const pulse = 1 + Math.sin(t * 4 + x * 0.05) * 0.04;
  const ry = radius * pulse;
  const rx = ry * squash;
  g.lineCap = 'round';
  if (!near) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fillStyle = css(lighten(tint, 0.65), 0.2);
    g.fill();
  }
  // The far half goes from the top over the right side to the bottom, the near half back over the
  // left.
  const [from, to] = near ? [Math.PI / 2, (Math.PI * 3) / 2] : [-Math.PI / 2, Math.PI / 2];
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, from, to);
  g.strokeStyle = css(darken(tint, 0.4), near ? 0.5 : 0.35);
  g.lineWidth = near ? 14 : 10.5;
  g.stroke();
  g.strokeStyle = css(lighten(tint, near ? 0.12 : 0), 1);
  g.lineWidth = near ? 9.5 : 7;
  g.stroke();
  g.strokeStyle = css([255, 255, 255], near ? 0.9 : 0.5);
  g.lineWidth = near ? 3.2 : 2;
  g.stroke();
  if (!near) {
    glowAt(light, x, y, radius * 2.4, tint, 0.3);
    // Sparks run around it.
    const spark = pictureOf('spark', tint[0], tint[1], tint[2]);
    if (spark) {
      for (let i = 0; i < 6; i++) {
        const a = t * 1.6 + (i / 6) * TAU;
        const sx = x + Math.cos(a) * rx;
        const sy = y + Math.sin(a) * ry;
        light.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 + i);
        light.drawImage(spark, sx - 7, sy - 7, 14, 14);
      }
      light.globalAlpha = 1;
    }
  }
}
