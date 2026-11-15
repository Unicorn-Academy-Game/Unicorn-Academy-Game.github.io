import { Rng } from '../../../domain/rng';
import type { Pic, SpriteBank } from '../../engine/bank';
import { COLORS, css, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { glowAt, paintMoon, prerender, Starfield } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { Plan } from './layout';

/**
 * The night around the party: the sky and its moon and stars, two lines of hills, the meadow, and
 * the trees and lanterns on it. The sky and the far hills never move. The near hills slide past as
 * the parade goes, by just enough that when it comes round they are where they began, and
 * everything on the meadow is laid out over one lap of the road and repeated, so the road goes on
 * for as long as the parade does and comes back to the start exactly.
 */

const NIGHT = {
  top: [8, 11, 52],
  upper: [34, 22, 108],
  low: [118, 50, 150],
  horizon: [255, 128, 176],
  hillFar: [58, 42, 122],
  hillMid: [38, 30, 96],
  meadowBack: [28, 60, 86],
  meadowFront: [16, 42, 60],
  tree: [66, 74, 132],
} as const satisfies Record<string, RGB>;

/**
 * How sharply to draw a picture that never changes, for a screen that has this many device pixels
 * in a unit.
 */
export const sharp = (k: number): number => Math.min(3, Math.max(1, Math.ceil(k * 2) / 2));

/** The trees that stand about the meadow, in the order they are chosen. */
const TREES = [
  'pg-tree-blossom-1',
  'pg-tree-oak-lavender-1',
  'pg-tree-birch-lime-1',
  'pg-tree-blossom-2',
  'pg-tree-willow-emerald-1',
  'pg-tree-oak-lime-2',
] as const;
const BUSHES = ['pg-bush-pink-dots', 'pg-bush-rose-dots', 'pg-bush-lime-1', 'pg-bush-emerald-1'] as const;
const FLOWERS = [
  'pg-flowers-pink-1',
  'pg-flowers-sky-1',
  'pg-flowers-yellow-1',
  'pg-flowers-lilac-2',
  'pg-flowers-coral-1',
  'pg-flowers-white-1',
] as const;

/** One thing on the meadow: where along the lap, how far back, and what it is. */
interface Decor {
  /** Where along the lap, from 0 to 1. */
  readonly u: number;
  /** How far back from the front of the meadow, from 0 to 1. */
  readonly v: number;
  readonly kind: 'tree' | 'bush' | 'flowers' | 'lantern';
  readonly sprite: string;
  readonly size: number;
  readonly phase: number;
}

export class World {
  private key = '';
  private sky: HTMLCanvasElement | null = null;
  private far: HTMLCanvasElement | null = null;
  private mid: HTMLCanvasElement | null = null;
  private meadow: HTMLCanvasElement | null = null;
  private stars: Starfield | null = null;
  private decor: Decor[] = [];
  private plan: Plan | null = null;
  private loop = 1;
  private readonly seed: number;

  constructor(
    private readonly bank: SpriteBank | null,
    rng: Rng,
  ) {
    this.seed = rng.int(0x7fffffff);
  }

  /** Lays the world out for a screen and a road this long round. */
  place(plan: Plan, loop: number, k: number): void {
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${loop.toFixed(1)}|${sharp(k)}`;
    this.plan = plan;
    this.loop = loop;
    if (key === this.key) return;
    this.key = key;
    const s = sharp(k);
    const { w, h } = plan;
    const top = plan.floor.top;
    this.sky = prerender(w, top + 8, (g) => this.drawSky(g, w, top + 8, plan), s);
    this.far = this.hills(
      w,
      top * 0.52,
      1,
      NIGHT.hillFar,
      [NIGHT.hillFar[0] * 0.8, NIGHT.hillFar[1] * 0.8, NIGHT.hillFar[2] * 0.9],
      s,
    );
    this.mid = this.hills(w, top * 0.42, 3, NIGHT.hillMid, NIGHT.meadowBack, s);
    this.meadow = prerender(
      8,
      h - (top - 6),
      (g, ww, hh) => {
        const grad = g.createLinearGradient(0, 0, 0, hh);
        grad.addColorStop(0, css(NIGHT.meadowBack));
        grad.addColorStop(0.35, css(mix(NIGHT.meadowBack, NIGHT.meadowFront, 0.6)));
        grad.addColorStop(1, css(NIGHT.meadowFront));
        g.fillStyle = grad;
        g.fillRect(0, 0, ww, hh);
      },
      1,
    );
    this.stars = new Starfield(plan.portrait ? 50 : 70, this.fork(1), w, 4, top * 0.82);
    this.decor = this.lay(plan, loop);
  }

  /** A random source of this world's own, the same every time it is asked for the same thing. */
  private fork(n: number): Rng {
    return new Rng(this.seed + n * 7919);
  }

  private drawSky(g: CanvasRenderingContext2D, w: number, h: number, plan: Plan): void {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, css(NIGHT.top));
    grad.addColorStop(0.42, css(NIGHT.upper));
    grad.addColorStop(0.8, css(NIGHT.low));
    grad.addColorStop(1, css(NIGHT.horizon));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // A soft glow of the party's own colours low in the sky behind the floor.
    glowAt(g, w * 0.5, h * 0.98, w * 1.1, NIGHT.horizon, 0.28);
    glowAt(g, w * 0.2, h * 0.9, w * 0.5, COLORS.violet, 0.2);
    glowAt(g, w * 0.82, h * 0.92, w * 0.5, COLORS.sky, 0.14);
    paintMoon(
      g,
      w * (plan.portrait ? 0.78 : 0.075),
      plan.h * (plan.portrait ? 0.09 : 0.16),
      plan.portrait ? 22 : 19,
      [255, 244, 214],
    );
  }

  /**
   * A line of hills as wide as the screen that joins up with itself at both ends, so it can be laid
   * end to end.
   */
  private hills(w: number, h: number, extra: number, top: RGB, bottom: RGB, scale: number): HTMLCanvasElement {
    const rng = this.fork(10 + extra);
    const waves = [
      { a: rng.range(0.22, 0.32), f: 1 + extra, p: rng.range(0, TAU) },
      { a: rng.range(0.12, 0.18), f: 2 + extra * 2, p: rng.range(0, TAU) },
      { a: rng.range(0.05, 0.09), f: 5 + extra * 2, p: rng.range(0, TAU) },
    ];
    return prerender(
      w,
      h,
      (g) => {
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          let y = h * 0.52;
          for (const k of waves) y -= Math.sin((x / w) * TAU * k.f + k.p) * k.a * h * 0.55;
          g.lineTo(x, y);
        }
        g.lineTo(w, h);
        g.closePath();
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, css(top));
        grad.addColorStop(1, css(bottom));
        g.fillStyle = grad;
        g.fill();
      },
      scale,
    );
  }

  /** What stands on the meadow, over one lap of the road. */
  private lay(plan: Plan, loop: number): Decor[] {
    const rng = this.fork(40);
    const out: Decor[] = [];
    const w = plan.w;
    const add = (u: number, v: number, kind: Decor['kind'], sprites: readonly string[], size: number): void => {
      out.push({ u: u / loop, v, kind, sprite: sprites[rng.int(sprites.length)]!, size, phase: rng.range(0, TAU) });
    };
    // Beside the dance floor, where the trees frame it, and nothing in the middle of it.
    add(w * 0.015, 0.2, 'tree', TREES, 0.46);
    add(w * 0.985, 0.2, 'tree', TREES, 0.44);
    add(w * 0.1, 0.05, 'tree', TREES, 0.3);
    add(w * 0.905, 0.05, 'tree', TREES, 0.3);
    // The road: trees at the back and bushes and flowers nearer, lanterns all the way.
    const road = loop - w * 1.3;
    for (let x = w * 1.05; x < w * 1.05 + road; x += rng.range(w * 0.1, w * 0.19))
      add(x, rng.range(0.02, 0.5), 'tree', TREES, rng.range(0.3, 0.5));
    for (let x = w * 1.0; x < loop - w * 0.15; x += rng.range(w * 0.07, w * 0.14))
      add(x, rng.range(0.42, 0.62), 'bush', BUSHES, rng.range(0.55, 0.8));
    for (let x = w * 1.0; x < loop - w * 0.1; x += rng.range(w * 0.05, w * 0.1))
      add(x, rng.range(0.55, 0.95), 'flowers', FLOWERS, rng.range(0.6, 0.95));
    const step = Math.max(190, w * 0.26);
    for (let x = w * 1.12; x < loop - w * 0.2; x += step) add(x, 0.32, 'lantern', ['lantern'], 1);
    return out.sort((a, b) => a.v - b.v);
  }

  /** Where the lanterns on the road hang, in the world, over one lap of the road. */
  lanterns(): { x: number; y: number }[] {
    const plan = this.plan;
    if (!plan) return [];
    const out: { x: number; y: number }[] = [];
    for (const d of this.decor) {
      if (d.kind !== 'lantern') continue;
      const base = plan.floor.top + 4 + d.v * (plan.h - plan.floor.top) * 0.62;
      out.push({ x: d.u * this.loop + 18, y: base + 18 - 92 + 6 });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  /**
   * The sky, the stars and the hills that do not move. Drawn in the picture's own space before the
   * world.
   */
  paintSky(p: Painter, camX: number): void {
    const plan = this.plan;
    if (!plan || !this.sky || !this.far || !this.mid) return;
    const g = p.ctx;
    const { w } = plan;
    g.drawImage(this.sky, 0, 0, w, plan.floor.top + 8);
    this.stars?.draw(g, p.t, p.calm);
    const top = plan.floor.top;
    g.drawImage(
      this.far,
      0,
      top - this.far.height / sharpOf(this.far, w) - 4,
      w,
      this.far.height / sharpOf(this.far, w),
    );
    // The near hills slide past a lap's worth of their own width while the parade goes round.
    const slide = ((camX - w / 2) * (w / this.loop)) % w;
    const mh = this.mid.height / sharpOf(this.mid, w);
    for (let x = -slide - (slide > 0 ? 0 : w); x < w; x += w) g.drawImage(this.mid, x, top - mh + 6, w, mh);
  }

  /**
   * The meadow and what stands on it, in the world's own units under the camera. `look` is the
   * window the screen shows.
   */
  paintMeadow(p: Painter, camX: number, t: number): void {
    const plan = this.plan;
    if (!plan || !this.meadow) return;
    const g = p.ctx;
    const { w, h } = plan;
    const top = plan.floor.top - 6;
    g.drawImage(this.meadow, camX - w * 1.2, top, w * 2.4, h - top);
    const left = camX - w * 0.9;
    const right = camX + w * 0.9;
    const lap = this.loop;
    for (const d of this.decor) {
      const x0 = d.u * lap;
      for (let k = Math.floor((left - x0) / lap); k <= Math.ceil((right - x0) / lap); k++) {
        const x = x0 + k * lap;
        if (x < left - 120 || x > right + 120) continue;
        this.paintDecor(p, d, x, t);
      }
    }
  }

  private paintDecor(p: Painter, d: Decor, x: number, t: number): void {
    const plan = this.plan!;
    const g = p.ctx;
    const base = plan.floor.top + 4 + d.v * (plan.h - plan.floor.top) * 0.62;
    if (d.kind === 'lantern') {
      this.paintLantern(p, x, base + 18, t, d.phase);
      return;
    }
    const pic = this.bank?.sprite('playground', d.sprite, 0);
    if (!pic) return;
    const depth = (base - plan.floor.top) / (plan.h - plan.floor.top);
    // Further back is dimmer and bluer, as things are at night.
    const shade =
      d.kind === 'tree'
        ? mix(NIGHT.tree, [150, 140, 200], clamp(depth * 1.2))
        : mix([96, 104, 150], [190, 180, 215], clamp(depth));
    const shaded = this.bank!.shaded(pic, shade);
    const sway = d.kind === 'flowers' || d.kind === 'bush' ? 0 : Math.sin(t * 0.7 + d.phase) * 0.012;
    const scaleUp = plan.portrait ? 1.3 : 1;
    // The ground under it.
    g.fillStyle = 'rgba(0,10,30,0.28)';
    g.beginPath();
    g.ellipse(x, base, 34 * d.size * scaleUp, 6 * d.size * scaleUp, 0, 0, TAU);
    g.fill();
    drawAt(g, shaded, x, base, d.size * scaleUp, sway);
  }

  /**
   * A post with a paper lantern on it and a little light round it, and a string of tiny lights to
   * the next.
   */
  private paintLantern(p: Painter, x: number, y: number, t: number, phase: number): void {
    const g = p.ctx;
    const height = 92;
    g.strokeStyle = 'rgba(30,18,50,0.92)';
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - height);
    g.quadraticCurveTo(x + 8, y - height - 8, x + 18, y - height - 2);
    g.stroke();
    const lx = x + 18;
    const ly = y - height + 6;
    const flicker = 0.9 + 0.1 * Math.sin(t * 5.3 + phase) * Math.sin(t * 3.1 + phase * 2);
    g.fillStyle = css([255, 150, 70], 1);
    g.beginPath();
    g.ellipse(lx, ly, 8.5, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = css([255, 232, 160], 0.9);
    g.beginPath();
    g.ellipse(lx - 1.5, ly - 1.5, 5.2, 7.4, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(120,40,30,0.8)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(lx - 7, ly - 2);
    g.lineTo(lx + 7, ly - 2);
    g.moveTo(lx - 7, ly + 3);
    g.lineTo(lx + 7, ly + 3);
    g.stroke();
    const light = p.light;
    glowAt(light, lx, ly, 74, [255, 168, 84], 0.55 * flicker);
    glowAt(light, lx, ly + height * 0.8, 120, [255, 168, 84], 0.12 * flicker);
  }
}

/**
 * How many pixels a prerendered picture has to a unit, from its size and how wide it is meant to
 * be.
 */
const sharpOf = (canvas: HTMLCanvasElement, width: number): number => canvas.width / width;

/** A picture with its anchor on the ground at (x, y), `size` times its size, leaning a little. */
function drawAt(g: CanvasRenderingContext2D, pic: Pic, x: number, y: number, size: number, lean: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(lean);
  g.scale(size, size);
  g.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, -pic.ax, -pic.ay, pic.sw, pic.sh);
  g.restore();
}
