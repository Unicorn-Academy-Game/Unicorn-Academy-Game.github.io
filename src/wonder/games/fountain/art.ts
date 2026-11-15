import { Rng } from '../../../domain/rng';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { gemImage } from '../../engine/gems';
import { glowAt, makeCloud, makeHills, paintMoon, prerender, Starfield } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { sharp } from '../party/world-art';
import { BANDS } from './arch';
import { GREAT, type Plan } from './layout';
import { JEWELS } from './recipes';

/**
 * The moonlit square, drawn once for the size of the screen and kept: the sky and its hills, the
 * grass, the paved square, and the stone rim of each pool. The trees at the edges and the flowers
 * are the playground's own and are stamped every frame, so that they sway. The great fountain is
 * the playground's own too. What moves is drawn by the game on top of this.
 */

const SKY: readonly [RGB, RGB, RGB, RGB] = [
  [22, 20, 76],
  [66, 46, 128],
  [168, 84, 150],
  [255, 150, 150],
];
const HILL_FAR: RGB = [88, 72, 150];
const HILL_NEAR: RGB = [48, 70, 124];
const GRASS: readonly [RGB, RGB] = [
  [52, 120, 116],
  [24, 70, 84],
];
const STONE: RGB = [182, 180, 222];
const WATER: RGB = [36, 74, 118];

const TREES = [
  'pg-tree-blossom-1',
  'pg-tree-oak-lavender-1',
  'pg-tree-birch-lime-1',
  'pg-tree-willow-emerald-1',
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
export const FOUNTAIN_SPRITES = [...TREES, ...BUSHES, ...FLOWERS, 'pg-gem-fountain'] as const;

interface Decor {
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
  readonly size: number;
  readonly phase: number;
  readonly tree: boolean;
}

/**
 * A twinkle on the water of the great fountain: where it is, in the water's own units, and when.
 */
interface Twinkle {
  readonly u: number;
  readonly v: number;
  readonly phase: number;
  readonly rate: number;
}

export class FountainArt {
  private back: HTMLCanvasElement | null = null;
  private stars: Starfield | null = null;
  private trees: Decor[] = [];
  private decor: Decor[] = [];
  private twinkles: Twinkle[] = [];
  private key = '';
  private readonly seed: number;

  constructor(
    private readonly bank: SpriteBank | null,
    rng: Rng,
  ) {
    this.seed = rng.int(0x7fffffff);
    const own = new Rng(this.seed + 3);
    this.twinkles = Array.from({ length: 14 }, () => ({
      u: own.range(-0.85, 0.85),
      v: own.range(-0.8, 0.9),
      phase: own.range(0, TAU),
      rate: own.range(1.2, 2.6),
    }));
  }

  /** Draws what holds still, for this screen. `k` is device pixels in a unit. */
  place(plan: Plan, k: number): void {
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    this.back = prerender(plan.w, plan.h, (g) => this.paintBack(g, plan), Math.min(2, sharp(k)));
    const rng = new Rng(this.seed + 17);
    this.stars = new Starfield(plan.portrait ? 46 : 64, rng, plan.w, 4, plan.horizon * 0.8);
    const laid = this.lay(plan, rng);
    this.trees = laid.filter((d) => d.tree);
    this.decor = laid.filter((d) => !d.tree);
  }

  private paintBack(g: CanvasRenderingContext2D, plan: Plan): void {
    const { w, h, horizon } = plan;
    const rng = new Rng(this.seed);
    // The sky: deep blue above, violet, and a warm rose at the horizon where the sun has not long
    // gone.
    const sky = g.createLinearGradient(0, 0, 0, horizon + 20);
    sky.addColorStop(0, css(SKY[0]));
    sky.addColorStop(0.4, css(SKY[1]));
    sky.addColorStop(0.78, css(SKY[2]));
    sky.addColorStop(1, css(SKY[3]));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, horizon + 20);
    glowAt(g, w * 0.5, horizon + 8, w * 1.05, lighten(SKY[3], 0.1), 0.45);
    const moonX = plan.portrait ? w * 0.82 : w * 0.1;
    const moonY = plan.portrait ? plan.arch.y - plan.arch.ry - 4 : horizon * 0.46;
    glowAt(g, moonX, moonY, 150, [200, 210, 255], 0.3);
    paintMoon(g, moonX, moonY, plan.portrait ? 21 : 24, [255, 246, 220]);
    // Two clouds, high and slow, lit from under by what is left of the day.
    const top = lighten(SKY[3], 0.2);
    const bottom = mix(SKY[1], SKY[2], 0.5);
    for (const [u, v, cw] of (plan.portrait
      ? [
          [0.04, 0.5, 120],
          [0.58, 0.74, 140],
        ]
      : [
          [0.22, 0.4, 150],
          [0.72, 0.5, 190],
        ]) as [number, number, number][]) {
      g.globalAlpha = 0.5;
      g.drawImage(makeCloud(cw, cw * 0.36, rng, top, bottom, 6), w * u, horizon * v - cw * 0.18, cw, cw * 0.36);
      g.globalAlpha = 1;
    }
    const far = makeHills(w, horizon * 0.46, rng, mix(HILL_FAR, SKY[3], 0.35), HILL_FAR, 0.5);
    g.drawImage(far, 0, horizon - horizon * 0.46 + 12, w, horizon * 0.46);
    const near = makeHills(w, horizon * 0.3, rng, HILL_NEAR, darken(HILL_NEAR, 0.3), 0.55);
    g.drawImage(near, 0, horizon - horizon * 0.3 + 12, w, horizon * 0.3);
    // The grass, and the pale stripes where the moon falls on it.
    const grass = g.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, css(GRASS[0]));
    grass.addColorStop(1, css(GRASS[1]));
    g.fillStyle = grass;
    g.fillRect(0, horizon + 6, w, h - horizon - 6);
    g.fillStyle = 'rgba(190,210,255,0.05)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(
        w * (0.15 + 0.7 * ((i * 0.41) % 1)),
        horizon + 16 + ((h - horizon) / 6) * i,
        w * 0.4,
        6 + i * 2.4,
        0,
        0,
        TAU,
      );
      g.fill();
    }
    this.paintSquare(g, plan);
    for (const [i, jet] of plan.jets.entries()) this.paintPoolBase(g, jet, i);
  }

  /**
   * The round paved square the fountain and the ring of pools stand on, with its rings and its
   * flagstones.
   */
  private paintSquare(g: CanvasRenderingContext2D, plan: Plan): void {
    const { x, y, rx, ry } = plan.square;
    g.fillStyle = 'rgba(8,10,40,0.3)';
    g.beginPath();
    g.ellipse(x, y + 6, rx + 8, ry + 6, 0, 0, TAU);
    g.fill();
    const grad = g.createLinearGradient(0, y - ry, 0, y + ry);
    grad.addColorStop(0, css(lighten(STONE, 0.14)));
    grad.addColorStop(1, css(darken(STONE, 0.22)));
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css(darken(STONE, 0.4), 0.45);
    g.lineWidth = 1.4;
    for (const f of [0.9, 0.66, 0.4]) {
      g.beginPath();
      g.ellipse(x, y, rx * f, ry * f, 0, 0, TAU);
      g.stroke();
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + 0.1;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * rx * 0.4, y + Math.sin(a) * ry * 0.4);
      g.lineTo(x + Math.cos(a) * rx * 0.99, y + Math.sin(a) * ry * 0.99);
      g.stroke();
    }
    glowAt(g, plan.fountain.x, plan.fountain.y - 10, rx * 1.1, [150, 220, 255], 0.14);
  }

  /**
   * The stone rim and the dark water of a pool, with a little of its jewel's colour in the water.
   */
  private paintPoolBase(g: CanvasRenderingContext2D, jet: Plan['jets'][number], index: number): void {
    const jewel = JEWELS[index]!;
    const rim = 5 * jet.scale;
    g.fillStyle = 'rgba(8,10,40,0.35)';
    g.beginPath();
    g.ellipse(jet.x, jet.y + rim * 0.8 + 3, jet.rx + rim + 3, jet.ry + rim * 0.55 + 2, 0, 0, TAU);
    g.fill();
    // The wall of the pool, which is seen from above and in front of it.
    const wall = g.createLinearGradient(0, jet.y - jet.ry, 0, jet.y + jet.ry + rim * 1.5);
    wall.addColorStop(0, css(lighten(STONE, 0.25)));
    wall.addColorStop(1, css(darken(STONE, 0.3)));
    g.fillStyle = wall;
    g.beginPath();
    g.ellipse(jet.x, jet.y + rim * 0.5, jet.rx + rim, jet.ry + rim * 0.55, 0, 0, TAU);
    g.fill();
    g.fillStyle = css(lighten(STONE, 0.3));
    g.beginPath();
    g.ellipse(jet.x, jet.y, jet.rx + rim * 0.7, jet.ry + rim * 0.3, 0, 0, TAU);
    g.fill();
    const water = g.createLinearGradient(0, jet.y - jet.ry, 0, jet.y + jet.ry);
    water.addColorStop(0, css(mix(WATER, jewel.color, 0.22)));
    water.addColorStop(1, css(darken(mix(WATER, jewel.color, 0.12), 0.35)));
    g.fillStyle = water;
    g.beginPath();
    g.ellipse(jet.x, jet.y, jet.rx, jet.ry, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css(lighten(jewel.color, 0.4), 0.28);
    g.lineWidth = 1.1;
    g.beginPath();
    g.ellipse(jet.x, jet.y, jet.rx * 0.78, jet.ry * 0.7, 0, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }

  /**
   * Where the meadow's trees, bushes and flowers stand: trees at the back and the edges, the rest
   * in the grass beyond the square.
   */
  private lay(plan: Plan, rng: Rng): Decor[] {
    const out: Decor[] = [];
    const { w, h, horizon } = plan;
    const add = (x: number, y: number, list: readonly string[], size: number): void => {
      out.push({ x, y, sprite: list[rng.int(list.length)]!, size, phase: rng.range(0, TAU), tree: list === TREES });
    };
    const roof = plan.portrait ? horizon + 22 : horizon + 20;
    add(w * 0.04, roof + 2, TREES, plan.portrait ? 0.5 : 0.54);
    add(w * 0.96, roof + 6, TREES, plan.portrait ? 0.48 : 0.52);
    if (!plan.portrait) {
      add(w * 0.17, roof - 6, TREES, 0.38);
      add(w * 0.84, roof - 4, TREES, 0.38);
    } else {
      add(w * 0.24, roof - 12, TREES, 0.32);
      add(w * 0.8, roof - 10, TREES, 0.3);
    }
    const sq = plan.square;
    const inSquare = (x: number, y: number, pad: number): boolean => {
      const dx = (x - sq.x) / (sq.rx + pad);
      const dy = (y - sq.y) / (sq.ry + pad * 0.6);
      return dx * dx + dy * dy < 1;
    };
    const tries = plan.portrait ? 30 : 44;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(10, w - 10);
      const y = rng.range(horizon + 24, h - 8);
      if (inSquare(x, y, 18)) continue;
      // The friends stand at the sides of the fountain, or along the front, and the buttons are
      // over the bottom corner.
      if (
        plan.portrait
          ? y > plan.friendY - 70
          : Math.abs(y - plan.friendY) < 52 && Math.abs(x - plan.fountain.x) < sq.rx + 80
      )
        continue;
      const far = (y - horizon) / (h - horizon);
      if (rng.next() < 0.5 - far * 0.3) add(x, y, BUSHES, rng.range(0.42, 0.58) * (0.8 + far * 0.4));
      else add(x, y, FLOWERS, rng.range(0.5, 0.78) * (0.8 + far * 0.4));
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /** The sky, the meadow and the square, and the trees at the back. */
  paint(p: Painter): void {
    if (!this.back) return;
    p.ctx.drawImage(this.back, 0, 0, p.w, p.h);
    this.stars?.draw(p.ctx, p.t, p.calm, 0.7);
    this.stamp(p, this.trees);
  }

  /** The bushes and flowers, in front of the trees and behind everything else. */
  paintDecor(p: Painter): void {
    this.stamp(p, this.decor);
  }

  private stamp(p: Painter, list: readonly Decor[]): void {
    const bank = this.bank;
    if (!bank) return;
    for (const d of list) {
      const pic = bank.sprite('playground', d.sprite, 0);
      if (!pic) continue;
      const sway = clamp(d.size, 0.3, 0.9) * 0.025 * Math.sin(p.t * 0.9 + d.phase);
      drawPic(p.ctx, pic, d.x, d.y, { scale: d.size, rot: sway });
    }
  }

  /**
   * The great fountain with the light on its water. `pulse` is the big gem's flash, from 0 to 1,
   * and `glow` how much it shines.
   */
  paintFountain(p: Painter, plan: Plan, pulse: number, glow: number): void {
    const { x, y, s } = plan.fountain;
    const pic = this.bank?.sprite('playground', 'pg-gem-fountain', 0);
    const g = p.ctx;
    g.fillStyle = 'rgba(8,10,40,0.3)';
    g.beginPath();
    g.ellipse(x, y + 40 * s, 104 * s, 20 * s, 0, 0, TAU);
    g.fill();
    if (pic) drawPic(g, pic, x, y, { scale: s });
    else {
      g.fillStyle = css(STONE);
      g.beginPath();
      g.ellipse(x, y - 10 * s, GREAT.halfWidth * s, 40 * s, 0, 0, TAU);
      g.fill();
    }
    // The light on the water, a few points that come and go.
    const w = GREAT.water;
    for (const t of this.twinkles) {
      const a = 0.5 + 0.5 * Math.sin(p.t * t.rate + t.phase);
      if (a < 0.55) continue;
      glowAt(
        p.light,
        x + (w.x + t.u * w.rx * 0.9) * s,
        y + (w.y + t.v * w.ry * 0.8) * s,
        9 * s,
        [200, 240, 255],
        (a - 0.5) * 0.9,
        'spark',
      );
    }
    // The big gem breathes, and flashes when it is touched.
    const gem = plan.gem;
    const breathe = 0.5 + 0.5 * Math.sin(p.t * 1.6);
    glowAt(
      p.light,
      gem.x,
      gem.y,
      gem.r * (2.6 + 0.5 * breathe + 1.6 * pulse),
      [200, 140, 255],
      0.2 + 0.12 * breathe + 0.5 * pulse + 0.3 * glow,
    );
    if (pulse > 0.02) glowAt(p.light, gem.x, gem.y, gem.r * 1.6, COLORS.white, 0.55 * pulse);
  }

  /**
   * The rainbow over the fountain, seven bands, each as bright as its jet has been played. A band
   * that has not been is a faint ghost, so that the player can see where the rainbow will be.
   */
  paintArch(p: Painter, plan: Plan, levels: readonly number[], detail: boolean): void {
    const a = plan.arch;
    const g = p.ctx;
    const t = p.t;
    const thick = a.band * 0.9;
    let any = false;
    for (let i = 0; i < BANDS; i++) if (levels[i]! > 0.02) any = true;
    g.save();
    g.lineCap = 'butt';
    for (let i = 0; i < BANDS; i++) {
      const rx = a.rx - (i + 0.5) * thick;
      const ry = a.ry - (i + 0.5) * thick;
      if (rx < 8 || ry < 8) continue;
      const level = levels[i]!;
      const jewel = JEWELS[i]!;
      g.lineWidth = thick * 0.82;
      g.strokeStyle = css(jewel.color, 0.07 + 0.58 * level);
      g.beginPath();
      g.ellipse(a.x, a.y, rx, ry, 0, Math.PI, TAU);
      g.stroke();
      if (level > 0.05) {
        p.light.save();
        p.light.lineWidth = thick * 1.7;
        p.light.strokeStyle = css(jewel.light, 0.17 * level);
        p.light.beginPath();
        p.light.ellipse(a.x, a.y, rx, ry, 0, Math.PI, TAU);
        p.light.stroke();
        p.light.restore();
      }
      if (detail && level > 0.12) {
        // Cut stones set along the band, which glint one after another.
        const length = Math.PI * (rx + ry);
        const gap = thick * 2.4;
        const n = Math.max(6, Math.floor(length / gap));
        const stone = gemImage(jewel.color);
        const size = thick * 1.15;
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          const ang = Math.PI + u * Math.PI;
          const twinkle = 0.62 + 0.38 * Math.sin(t * 3.2 + k * 1.9 + i * 0.7);
          g.globalAlpha = clamp(level * twinkle);
          g.drawImage(stone, a.x + Math.cos(ang) * rx - size / 2, a.y + Math.sin(ang) * ry - size / 2, size, size);
        }
        g.globalAlpha = 1;
      }
    }
    g.restore();
    if (any) {
      // A glow over the whole of it, like the mist a rainbow stands in.
      const bright = levels.reduce((s, l) => s + l, 0) / BANDS;
      glowAt(p.light, a.x, a.y - a.ry * 0.45, a.rx * 1.3, [255, 230, 255], 0.1 * bright);
    }
  }
}
