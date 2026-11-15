import { Rng } from '../../../domain/rng';
import { COLORS, css, lighten, mix, RAINBOW, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { gemImage } from '../../engine/gems';
import { glowAt, prerender } from '../../engine/paint';
import { pictureOf } from '../../engine/particles';
import type { Pool } from './journey';
import { cloudVariant, hash, stampCloud } from './sky';

/**
 * Where the ride ends: an island of cloud with a pool on top of it full of jewels, and a rainbow
 * that grows over it. She and her friends splash in, one after another, and each one paints more of
 * the rainbow. All of it is made once and drawn a few times a frame: the island is two pictures,
 * one behind the water and one in front, and the water and what is in it are drawn between them.
 */

/** How far the island reaches past each end of the pool. */
const PAD = 170;
/**
 * The water is this deep from its surface to the front of the island, and her hooves are under the
 * top of it.
 */
const DEPTH = 52;
/**
 * The heap of cloud at each end of the water: how big the picture of it is, and how far across it
 * the edge of the water is.
 */
const CAP_W = 300;
const CAP_H = 190;
const CAP_EDGE = 200;
/** How far down the picture of the heap the surface of the water is. */
const CAP_WATER = 70;
/** How thick each stripe of the arch is. */
export const BAND = 15;
/** Jewels lying in the pool, per hundred units across it. */
const GEMS_PER_HUNDRED = 5.5;

interface Jewel {
  x: number;
  /** How far under the surface it lies. */
  depth: number;
  size: number;
  color: RGB;
  turn: number;
  phase: number;
}

interface Ripple {
  x: number;
  age: number;
  /** How big: 1 is the splash of one unicorn. */
  size: number;
}

export class Lagoon {
  private readonly body: HTMLCanvasElement;
  private readonly rim: HTMLCanvasElement;
  private readonly cap: HTMLCanvasElement;
  private readonly jewels: Jewel[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly top: number;
  private readonly left: number;
  private readonly width: number;
  /**
   * The rainbow over the pool: where it stands, and how far it reaches across and up at its outer
   * edge.
   */
  readonly arch: { x: number; y: number; rx: number; ry: number };

  constructor(
    readonly pool: Pool,
    rng: Rng,
    fit: { readonly rx: number; readonly ry: number },
  ) {
    this.left = pool.left - PAD;
    this.width = pool.right - pool.left + PAD * 2;
    this.top = pool.y - 60;
    this.body = this.makeBody(new Rng(rng.int(0x7fffffff)));
    this.rim = this.makeRim(new Rng(rng.int(0x7fffffff)));
    this.cap = this.makeCap(new Rng(rng.int(0x7fffffff)));
    const count = Math.round(((pool.right - pool.left) / 100) * GEMS_PER_HUNDRED);
    for (let i = 0; i < count; i++) {
      this.jewels.push({
        x: pool.left + 30 + rng.range(0, pool.right - pool.left - 60),
        depth: rng.range(14, DEPTH - 12),
        size: rng.range(20, 32),
        color: i % 9 === 0 ? COLORS.white : RAINBOW[(i + rng.int(3)) % RAINBOW.length]!,
        turn: rng.range(-0.5, 0.5),
        phase: rng.range(0, TAU),
      });
    }
    // Back to front, so the ones nearer the top are in front.
    this.jewels.sort((a, b) => b.depth - a.depth);
    this.arch = { x: pool.centre, y: pool.y, rx: fit.rx, ry: fit.ry };
  }

  /** The rainbow is to be this big now, because the screen it is on has changed. */
  refit(fit: { readonly rx: number; readonly ry: number }): void {
    this.arch.rx = fit.rx;
    this.arch.ry = fit.ry;
  }

  /** A splash of this size at `x`: rings go out across the water. */
  ripple(x: number, size = 1): void {
    this.ripples.push({ x, age: 0, size });
    if (this.ripples.length > 18) this.ripples.shift();
  }

  update(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dt;
      if (r.age > 1.8) this.ripples.splice(i, 1);
    }
  }

  /**
   * The island under the water, in rows that get narrower and end in smaller clouds, and the far
   * side of its rim.
   */
  private makeBody(rng: Rng): HTMLCanvasElement {
    const rows = 5;
    const height = 60 + 70 * rows;
    return prerender(
      this.width,
      height,
      (g, w) => {
        const variants = Array.from({ length: 7 }, () => cloudVariant(rng, rng.range(240, 340), 6 + rng.int(3), 1.1));
        for (let row = rows - 1; row >= 0; row--) {
          const span = w * (1 - row * 0.15);
          const x0 = (w - span) / 2;
          const y = 66 + row * 64;
          for (let cx = x0 + 70; cx < x0 + span - 50; cx += rng.range(100, 150)) {
            const v = variants[rng.int(variants.length)]!;
            // Toward either end of a row the clouds are smaller and lower, so an island ends in a
            // slope and not a wall.
            const across = (cx - x0) / span;
            const middle = Math.sin(Math.PI * clamp(across)) ** 0.6;
            const size = rng.range(1, 1.4) * (0.5 + 0.5 * middle);
            const cw = v.w * size;
            const ch = v.h * size;
            // Every row hangs a little lower in the middle than at its ends.
            const hang = 1 - Math.abs((cx - w / 2) / (w / 2));
            stampCloud(g, v, cx - cw / 2, y + hang * 22 + (1 - middle) * 26 + rng.range(-8, 8), cw, ch, 1, 1);
          }
        }
        // The far side of the rim, a little higher than the water.
        for (let cx = PAD * 0.7; cx < w - PAD * 0.7; cx += rng.range(70, 110)) {
          const v = variants[rng.int(variants.length)]!;
          const size = rng.range(0.55, 0.8);
          stampCloud(g, v, cx - (v.w * size) / 2, 12 + rng.range(0, 10), v.w * size, v.h * size, 1, 1);
        }
      },
      1,
    );
  }

  /**
   * A hill of cloud that closes each end of the water: the left end of it, drawn turned round for
   * the right.
   */
  private makeCap(rng: Rng): HTMLCanvasElement {
    return prerender(
      CAP_W,
      CAP_H,
      (g) => {
        const variants = Array.from({ length: 5 }, () => cloudVariant(rng, rng.range(160, 200), 6, 1.15));
        // Rows of clouds, each narrower than the one below it, so the end of the water meets a
        // slope and not a wall.
        const middle = CAP_EDGE - 50;
        for (let row = 0; row < 4; row++) {
          const reach = 280 * (1 - 0.2 * row);
          const top = CAP_WATER - 8 + 52 - row * 40;
          for (let k = 0; k < 2; k++) {
            const v = variants[rng.int(variants.length)]!;
            const w = reach * 0.62 * rng.range(0.95, 1.1);
            const h = w * (v.h / v.w);
            stampCloud(g, v, middle + (k - 0.5) * reach * 0.46 - w / 2, top + rng.range(-5, 5), w, h, 1, 1);
          }
        }
      },
      1,
    );
  }

  /** The near side of the rim, which hides the bottom edge of the water. */
  private makeRim(rng: Rng): HTMLCanvasElement {
    return prerender(
      this.width,
      130,
      (g, w) => {
        const variants = Array.from({ length: 5 }, () => cloudVariant(rng, rng.range(180, 260), 6, 1));
        for (let x = -40; x < w; x += rng.range(60, 95)) {
          const v = variants[rng.int(variants.length)]!;
          const size = rng.range(0.6, 0.95);
          stampCloud(g, v, x, 10 + rng.range(0, 14), v.w * size, v.h * size, 1, 1);
        }
        // Under the rim the island goes on, so there is no gap beneath it.
        for (let x = -60; x < w; x += rng.range(100, 150)) {
          const v = variants[rng.int(variants.length)]!;
          stampCloud(g, v, x, 54 + rng.range(0, 16), v.w * 1.1, v.h * 1.1, 1, 1);
        }
      },
      1,
    );
  }

  /** The colour of the water: a clear green-blue by day and the sky's own rose at the end of it. */
  private water(dusk: number): { top: RGB; deep: RGB } {
    return {
      top: mix([150, 236, 232], [255, 190, 210], dusk * 0.55),
      deep: mix([54, 168, 214], [150, 110, 214], dusk * 0.6),
    };
  }

  /** Everything behind the unicorns: the island, the water, the jewels in it. */
  paintBehind(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, t: number, dusk: number): void {
    const p = this.pool;
    g.drawImage(this.body, this.left, this.top);
    const { top, deep } = this.water(dusk);
    const y = p.y - 2;
    const grad = g.createLinearGradient(0, y, 0, y + DEPTH + 6);
    grad.addColorStop(0, css(top));
    grad.addColorStop(1, css(deep));
    g.fillStyle = grad;
    g.fillRect(p.left, y, p.right - p.left, DEPTH + 6);
    // The jewels at the bottom of the pool, each turning a little as the water moves above it.
    for (const j of this.jewels) {
      const wobble = Math.sin(t * 1.4 + j.phase) * 1.2;
      g.save();
      g.translate(j.x, p.y + j.depth + wobble);
      g.rotate(j.turn + Math.sin(t * 0.8 + j.phase) * 0.05);
      g.drawImage(gemImage(lighten(j.color, 0.1)), -j.size / 2, -j.size / 2, j.size, j.size);
      g.restore();
    }
    this.glitter(light, t, dusk);
  }

  /**
   * Little stars that open and close on the jewels and the water, each always in the same place.
   */
  private glitter(light: CanvasRenderingContext2D, t: number, dusk: number): void {
    const star = pictureOf('star4', 255, 255, 255);
    if (!star) return;
    const p = this.pool;
    for (let i = 0; i < this.jewels.length; i += 2) {
      const j = this.jewels[i]!;
      const open = Math.sin(((t * 0.55 + hash(i, 71) * 9) % 1) * Math.PI) ** 4;
      if (open < 0.05) continue;
      const size = 14 + 20 * open * hash(i, 72);
      light.globalAlpha = 0.5 + 0.5 * open;
      light.drawImage(star, j.x - size / 2, p.y + j.depth - size / 2, size, size);
    }
    light.globalAlpha = 1;
    glowAt(light, p.centre, p.y + 20, (p.right - p.left) * 0.8, mix([140, 230, 255], [255, 170, 200], dusk), 0.12);
  }

  /**
   * The rainbow that grows over the pool, stripe on stripe, from the left foot to the right. `grow`
   * is how far it has got, from 0 to 1, and `glow` how much it shines.
   */
  paintArch(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, t: number, grow: number, glow: number): void {
    if (grow <= 0.001) return;
    const { x, y, rx, ry } = this.arch;
    const end = Math.PI + Math.PI * clamp(grow);
    g.lineCap = 'round';
    for (let k = 0; k < RAINBOW.length; k++) {
      const inset = k * BAND * 0.92;
      g.strokeStyle = css(RAINBOW[k]!);
      g.lineWidth = BAND + 1.5;
      g.beginPath();
      g.ellipse(x, y, rx - inset, ry - inset, 0, Math.PI, end);
      g.stroke();
    }
    // A bright edge along the top of it, and a sheen that runs along it when it is done.
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(x, y, rx + BAND * 0.4, ry + BAND * 0.4, 0, Math.PI, end);
    g.stroke();
    if (glow > 0.01) {
      const middle = BAND * RAINBOW.length * 0.42;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,255,255,${(0.16 * glow).toFixed(3)})`;
      g.lineWidth = BAND * RAINBOW.length;
      g.beginPath();
      g.ellipse(x, y, rx - middle, ry - middle, 0, Math.PI, end);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      // A bright place that runs along the finished arch.
      if (grow >= 0.999) {
        const a = Math.PI + Math.PI * ((t * 0.28) % 1);
        glowAt(
          light,
          x + Math.cos(a) * (rx - BAND * 3),
          y + Math.sin(a) * (ry - BAND * 3),
          150,
          COLORS.white,
          0.5 * glow,
        );
      }
    }
  }

  /**
   * Everything in front of the unicorns: the water over their legs, the ripples on it, the near
   * side of the rim.
   */
  paintFront(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, t: number, dusk: number): void {
    const p = this.pool;
    const { top, deep } = this.water(dusk);
    // Water in front of a leg is a little darker than behind it, and the legs under it look under.
    const y = p.y + 14;
    const grad = g.createLinearGradient(0, y, 0, y + DEPTH - 8);
    grad.addColorStop(0, css(mix(top, deep, 0.3), 0.5));
    grad.addColorStop(1, css(deep, 0.78));
    g.fillStyle = grad;
    g.fillRect(p.left, y, p.right - p.left, DEPTH - 8);
    // The surface: a bright line that moves, and the rings of what has fallen in.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = p.left; x <= p.right; x += 14) {
      const wave = Math.sin(x * 0.045 + t * 2.2) * 1.4 + Math.sin(x * 0.11 - t * 1.6) * 0.8;
      if (x === p.left) g.moveTo(x, p.y + 14 + wave);
      else g.lineTo(x, p.y + 14 + wave);
    }
    g.stroke();
    for (const r of this.ripples) {
      const u = r.age / 1.8;
      const rx = 16 + u * 320 * r.size ** 0.5;
      g.strokeStyle = `rgba(255,255,255,${(0.75 * (1 - u) ** 1.5).toFixed(3)})`;
      g.lineWidth = 3 * (1 - u) + 0.8;
      g.beginPath();
      g.ellipse(r.x, p.y + 20, rx, rx * 0.12, 0, 0, TAU);
      g.stroke();
      if (u < 0.5) glowAt(light, r.x, p.y + 14, 120 * r.size * (1 - u), COLORS.white, 0.35 * (1 - u * 2));
    }
    g.drawImage(this.rim, this.left, p.y + 22);
    // A heap of cloud over each end of the water, so the water ends in a bank and not a cut.
    g.drawImage(this.cap, p.left - CAP_EDGE, p.y - CAP_WATER);
    g.save();
    g.translate(p.right, p.y - CAP_WATER);
    g.scale(-1, 1);
    g.drawImage(this.cap, -CAP_EDGE, 0);
    g.restore();
  }
}
