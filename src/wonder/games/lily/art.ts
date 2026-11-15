import { Rng } from '../../../domain/rng';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { glowAt, makeCloud, makeHills, paintMoon, prerender, Starfield } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { sharp } from '../party/world-art';
import type { Pad, Plan } from './layout';

/**
 * The pond, drawn twice and kept: at golden hour, and at dusk with the moon up. The game shows the
 * one over the other by how many lotuses are open, so that the more of the pond that blooms the
 * nearer night comes, and the lotuses shine more. The trees, the reeds and the flowers are the
 * playground's own and are stamped every frame so that they sway. The pads and the lotuses are
 * drawn here, in code, every frame, because they dip and open.
 */

interface Mood {
  readonly sky: readonly [RGB, RGB, RGB, RGB];
  readonly hillFar: RGB;
  readonly hillNear: RGB;
  readonly water: readonly [RGB, RGB, RGB];
  readonly grass: readonly [RGB, RGB];
  readonly glint: RGB;
}

const DAY: Mood = {
  sky: [
    [118, 170, 236],
    [190, 194, 244],
    [255, 212, 170],
    [255, 184, 140],
  ],
  hillFar: [150, 152, 216],
  hillNear: [98, 154, 150],
  water: [
    [255, 206, 176],
    [92, 192, 200],
    [24, 108, 140],
  ],
  grass: [
    [118, 200, 112],
    [54, 130, 92],
  ],
  glint: [255, 240, 204],
};

const DUSK: Mood = {
  sky: [
    [26, 22, 86],
    [74, 46, 132],
    [172, 86, 152],
    [255, 150, 142],
  ],
  hillFar: [88, 72, 150],
  hillNear: [44, 62, 118],
  water: [
    [188, 108, 160],
    [58, 68, 140],
    [16, 38, 88],
  ],
  grass: [
    [46, 112, 106],
    [22, 62, 80],
  ],
  glint: [255, 206, 226],
};

const TREES = [
  'pg-tree-willow-emerald-1',
  'pg-tree-blossom-1',
  'pg-tree-oak-lime-1',
  'pg-tree-blossom-2',
  'pg-tree-oak-lavender-1',
  'pg-tree-birch-lime-1',
] as const;
const REEDS = ['pg-reeds-1', 'pg-reeds-2'] as const;
const BUSHES = ['pg-bush-pink-dots', 'pg-bush-rose-dots', 'pg-bush-lime-1', 'pg-bush-emerald-1'] as const;
const FLOWERS = [
  'pg-flowers-pink-1',
  'pg-flowers-sky-1',
  'pg-flowers-yellow-1',
  'pg-flowers-lilac-2',
  'pg-flowers-coral-1',
  'pg-flowers-white-1',
] as const;
const TUFTS = ['pg-tuft-1', 'pg-tuft-2', 'pg-tuft-3'] as const;
const ROCKS = ['pg-rock-moss-1', 'pg-rock-grey-1'] as const;
export const POND_SPRITES = [...TREES, ...REEDS, ...BUSHES, ...FLOWERS, ...TUFTS, ...ROCKS] as const;

/** The life bundle's own animals, which the pond borrows. */
export const POND_LIFE = [
  'frog-green-sit',
  'frog-green-crouch',
  'frog-green-air',
  'frog-teal-sit',
  'frog-teal-crouch',
  'frog-teal-air',
  'frog-sunny-sit',
  'frog-sunny-crouch',
  'frog-sunny-air',
  'duck-white-float',
  'duck-white-quack',
  'duck-mallard-float',
  'duck-mallard-quack',
  'fish-koi-leap',
  'fish-gold-leap',
  'dragonfly-sapphire-hover',
  'dragonfly-ruby-hover',
  'dragonfly-jade-hover',
] as const;

const PAD = {
  light: [150, 226, 118] as RGB,
  mid: [66, 170, 98] as RGB,
  dark: [30, 106, 84] as RGB,
  edge: [22, 78, 70] as RGB,
};

interface Decor {
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
  readonly size: number;
  readonly phase: number;
  /** How much it sways, as a fraction of a radian. */
  readonly sway: number;
  readonly layer: 'far' | 'water' | 'near';
}

export class PondArt {
  private day: HTMLCanvasElement | null = null;
  private dusk: HTMLCanvasElement | null = null;
  private stars: Starfield | null = null;
  private decor: Decor[] = [];
  private key = '';
  private readonly seed: number;

  constructor(
    private readonly bank: SpriteBank | null,
    rng: Rng,
  ) {
    this.seed = rng.int(0x7fffffff);
  }

  /** Draws what holds still, for this screen. `k` is device pixels in a unit. */
  place(plan: Plan, k: number): void {
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    const scale = Math.min(2, sharp(k));
    this.day = prerender(plan.w, plan.h, (g) => this.paintScene(g, plan, DAY, false), scale);
    this.dusk = prerender(plan.w, plan.h, (g) => this.paintScene(g, plan, DUSK, true), scale);
    this.stars = new Starfield(plan.portrait ? 40 : 58, new Rng(this.seed + 5), plan.w, 4, plan.horizon * 0.8);
    this.decor = this.lay(plan, new Rng(this.seed + 17));
  }

  /** The ragged line where the water meets the near bank. */
  private shoreAt(plan: Plan, x: number): number {
    return plan.shore + Math.sin(x * 0.021 + 1) * 4 + Math.sin(x * 0.067 + 2) * 2;
  }

  private paintScene(g: CanvasRenderingContext2D, plan: Plan, mood: Mood, night: boolean): void {
    const { w, h, horizon, shore } = plan;
    const rng = new Rng(this.seed);
    const [s0, s1, s2, s3] = mood.sky;
    const sky = g.createLinearGradient(0, 0, 0, horizon + 20);
    sky.addColorStop(0, css(s0));
    sky.addColorStop(0.42, css(s1));
    sky.addColorStop(0.8, css(s2));
    sky.addColorStop(1, css(s3));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, horizon + 20);
    glowAt(g, w * 0.5, horizon + 6, w * 1.1, lighten(s3, 0.12), night ? 0.4 : 0.55);
    if (night) {
      const moonX = plan.portrait ? w * 0.2 : w * 0.16;
      const moonY = plan.portrait ? horizon * 0.5 : horizon * 0.48;
      glowAt(g, moonX, moonY, 150, [200, 210, 255], 0.3);
      paintMoon(g, moonX, moonY, plan.portrait ? 20 : 24, [255, 246, 220]);
    } else {
      // The sun, low over the far bank, with a wide warm haze round it.
      const { x, y, r } = plan.sun;
      glowAt(g, x, y, r * 7, [255, 214, 150], 0.5);
      glowAt(g, x, y, r * 3.6, [255, 226, 170], 0.55);
      const disc = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r * 0.62);
      disc.addColorStop(0, '#fffbe8');
      disc.addColorStop(1, '#ffd784');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(x, y, r * 0.62, 0, TAU);
      g.fill();
    }
    // High clouds, lit from below by the low light.
    const top = lighten(s3, night ? 0.1 : 0.34);
    const bottom = mix(s1, s2, 0.5);
    for (const [u, v, cw] of (plan.portrait
      ? [
          [0.04, 0.46, 130],
          [0.54, 0.7, 150],
        ]
      : [
          [0.2, 0.34, 160],
          [0.58, 0.44, 200],
        ]) as [number, number, number][]) {
      g.globalAlpha = night ? 0.45 : 0.7;
      g.drawImage(makeCloud(cw, cw * 0.34, rng, top, bottom, 6), w * u, horizon * v - cw * 0.17, cw, cw * 0.34);
      g.globalAlpha = 1;
    }
    const far = makeHills(w, horizon * 0.5, rng, mix(mood.hillFar, s3, 0.4), mood.hillFar, 0.5);
    g.drawImage(far, 0, horizon - horizon * 0.5 + 14, w, horizon * 0.5);
    const near = makeHills(w, horizon * 0.3, rng, mood.hillNear, darken(mood.hillNear, 0.3), 0.55);
    g.drawImage(near, 0, horizon - horizon * 0.3 + 14, w, horizon * 0.3);

    // The water: the sky in it near the far bank, going to deep green-blue at the front.
    const water = g.createLinearGradient(0, horizon, 0, shore + 8);
    water.addColorStop(0, css(mood.water[0]));
    water.addColorStop(0.3, css(mood.water[1]));
    water.addColorStop(1, css(mood.water[2]));
    g.fillStyle = water;
    g.fillRect(0, horizon + 6, w, shore - horizon + 8);
    // The far bank: a dark line of grass the water laps.
    g.fillStyle = css(darken(mood.hillNear, 0.2));
    g.fillRect(0, horizon + 2, w, 8);
    g.fillStyle = css(mood.grass[0], 0.9);
    g.fillRect(0, horizon + 4, w, 4);
    // The sun, or the moon, laid on the water: a long glow under it.
    const lightX = night ? (plan.portrait ? w * 0.2 : w * 0.16) : plan.sun.x;
    g.save();
    g.translate(lightX, horizon + (shore - horizon) * 0.42);
    g.scale(0.22, 1);
    glowAt(g, 0, 0, (shore - horizon) * 1.25, night ? [230, 220, 255] : [255, 226, 170], night ? 0.28 : 0.42);
    g.restore();
    // Fine lines on the water, each a little lighter than the water round it.
    g.lineCap = 'round';
    for (let i = 0; i < (plan.portrait ? 40 : 34); i++) {
      const y = horizon + 12 + rng.next() ** 0.8 * (shore - horizon - 18);
      const near = (y - horizon) / (shore - horizon);
      const len = rng.range(14, 44) * (0.6 + near * 0.8);
      const x = rng.range(-10, w);
      g.strokeStyle = css(lighten(mood.water[1], 0.35), 0.1 + 0.12 * (1 - near));
      g.lineWidth = 0.8 + near * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 1.2 - near, x + len, y);
      g.stroke();
    }

    // The near bank, with a wet dark edge where the water has been.
    const bank = g.createLinearGradient(0, shore, 0, h);
    bank.addColorStop(0, css(mood.grass[0]));
    bank.addColorStop(1, css(mood.grass[1]));
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, this.shoreAt(plan, x));
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = bank;
    g.fill();
    g.strokeStyle = css(darken(mood.grass[1], 0.25), 0.7);
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) g.moveTo(x, this.shoreAt(plan, x) + 1.5);
      else g.lineTo(x, this.shoreAt(plan, x) + 1.5);
    }
    g.stroke();
    g.strokeStyle = css(lighten(mood.water[1], 0.4), 0.5);
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) g.moveTo(x, this.shoreAt(plan, x) - 1.4);
      else g.lineTo(x, this.shoreAt(plan, x) - 1.4);
    }
    g.stroke();
    // Soft pale stripes of light on the grass.
    g.fillStyle = css(night ? [190, 210, 255] : [255, 244, 200], night ? 0.05 : 0.09);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(
        w * (0.15 + 0.7 * ((i * 0.43) % 1)),
        shore + 14 + ((h - shore) / 4) * i,
        w * 0.34,
        5 + i * 2,
        0,
        0,
        TAU,
      );
      g.fill();
    }
  }

  /** Where the trees, the reeds, the flowers and the rocks stand. */
  private lay(plan: Plan, rng: Rng): Decor[] {
    const out: Decor[] = [];
    const { w, h, horizon, shore } = plan;
    const add = (
      layer: Decor['layer'],
      x: number,
      y: number,
      list: readonly string[],
      size: number,
      sway: number,
    ): void => {
      out.push({ x, y, sprite: list[rng.int(list.length)]!, size, phase: rng.range(0, TAU), sway, layer });
    };
    // A line of trees along the far bank, bigger at the edges.
    const trees = plan.portrait ? 6 : 11;
    for (let i = 0; i < trees; i++) {
      const u = (i + 0.5 + rng.range(-0.3, 0.3)) / trees;
      const edge = Math.abs(u - 0.5) * 2;
      // None stands in front of the sun.
      if (Math.abs(w * u - plan.sun.x) < plan.sun.r * 0.9) continue;
      add(
        'far',
        w * u,
        horizon + 16 + rng.range(-3, 4),
        TREES,
        (plan.portrait ? 0.22 : 0.24) + edge * 0.16 + rng.range(0, 0.05),
        0.02,
      );
    }
    // Reeds at both edges of the water, and a few along the far bank.
    const reeds = plan.portrait ? 4 : 6;
    for (let i = 0; i < reeds; i++) {
      for (const side of [0, 1]) {
        const x = side === 0 ? rng.range(0, 38) : w - rng.range(0, 38);
        const y = horizon + 34 + ((i + rng.next() * 0.6) / reeds) * (shore - horizon - 56);
        add('water', x, y, REEDS, 0.42 + ((y - horizon) / (shore - horizon)) * 0.32, 0.03);
      }
    }
    for (let i = 0; i < 5; i++) add('far', rng.range(20, w - 20), horizon + 14 + rng.range(-2, 3), REEDS, 0.24, 0.04);
    // The near bank: rocks at the edge of the water, bushes at the sides, flowers and tufts
    // between.
    for (const side of [0, 1]) {
      const x = side === 0 ? rng.range(20, w * 0.1) : w - rng.range(20, w * 0.1);
      add('near', x, shore + rng.range(10, 22), ROCKS, rng.range(0.55, 0.75), 0);
      add('near', side === 0 ? w * 0.04 : w * 0.96, h - rng.range(6, 18), BUSHES, plan.portrait ? 0.6 : 0.68, 0.015);
    }
    const flowers = plan.portrait ? 16 : 22;
    for (let i = 0; i < flowers; i++) {
      const x = rng.range(8, w - 8);
      const y = shore + 10 + rng.next() * (h - shore - 14);
      add(
        'near',
        x,
        y,
        rng.next() < 0.6 ? FLOWERS : TUFTS,
        rng.range(0.5, 0.74) * (0.8 + ((y - shore) / (h - shore)) * 0.3),
        0.03,
      );
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /** The sky, the water and the far bank. `dusk` is how far evening has come, 0 to 1. */
  paint(p: Painter, plan: Plan, dusk: number, detail: boolean): void {
    if (!this.day || !this.dusk) return;
    const g = p.ctx;
    g.drawImage(this.day, 0, 0, p.w, p.h);
    if (dusk > 0.01) {
      g.globalAlpha = dusk;
      g.drawImage(this.dusk, 0, 0, p.w, p.h);
      g.globalAlpha = 1;
      this.stars?.draw(g, p.t, p.calm, 0.75 * clamp((dusk - 0.15) / 0.6));
    }
    this.stamp(p, 'far');
    if (detail) this.paintGlitter(p, plan, dusk);
  }

  /** Little lights that wink on the water, along the glow of the sun or moon. */
  private paintGlitter(p: Painter, plan: Plan, dusk: number): void {
    const g = p.ctx;
    const x0 = dusk > 0.5 ? (plan.portrait ? plan.w * 0.2 : plan.w * 0.16) : plan.sun.x;
    const tone = mix(DAY.glint, DUSK.glint, dusk);
    for (let i = 0; i < 18; i++) {
      const u = (i * 0.618) % 1;
      const y = plan.horizon + 14 + u * (plan.shore - plan.horizon - 30);
      const spread = 8 + u * 38;
      const x = x0 + Math.sin(i * 12.9 + p.t * 0.3) * spread;
      const a = Math.max(0, Math.sin(p.t * (1.4 + (i % 5) * 0.5) + i * 2.1));
      if (a < 0.2) continue;
      g.fillStyle = css(tone, 0.55 * a);
      g.fillRect(x - 3 - u * 4, y, 6 + u * 8, 1.4);
    }
  }

  /** The reeds that stand in the water, in front of the far bank. */
  paintReeds(p: Painter): void {
    this.stamp(p, 'water');
  }

  /** The near bank's rocks, bushes and flowers. */
  paintBank(p: Painter): void {
    this.stamp(p, 'near');
  }

  private stamp(p: Painter, layer: Decor['layer']): void {
    const bank = this.bank;
    if (!bank) return;
    for (const d of this.decor) {
      if (d.layer !== layer) continue;
      const pic = bank.sprite('playground', d.sprite, 0);
      if (!pic) continue;
      const sway = d.sway * Math.sin(p.t * 0.8 + d.phase);
      drawPic(p.ctx, pic, d.x, d.y, { scale: d.size, rot: sway });
    }
  }

  /**
   * A lily pad, dipped `dip` units into the water, with a ring of light round it in a colour when a
   * lotus on it is open.
   */
  paintPad(p: Painter, pad: Pad, dip: number, seed: number, shine: RGB | null, amount: number): void {
    const g = p.ctx;
    const { x, rx, ry } = pad;
    const y = pad.y + dip;
    // The pad's shadow on the water, and the ripple that rides on it.
    g.fillStyle = 'rgba(8,48,66,0.3)';
    g.beginPath();
    g.ellipse(x + 2, y + ry * 0.7, rx * 1.05, ry * 0.95, 0, 0, TAU);
    g.fill();
    // Its thick edge, a little under the top of it.
    g.fillStyle = css(PAD.edge);
    g.beginPath();
    g.ellipse(x, y + ry * 0.22, rx, ry, 0, 0, TAU);
    g.fill();
    const a0 = seed * 2.399;
    const notch = 0.16;
    g.beginPath();
    g.moveTo(x, y);
    g.ellipse(x, y, rx, ry, 0, a0 + notch, a0 + TAU - notch);
    g.closePath();
    const top = g.createRadialGradient(x - rx * 0.28, y - ry * 0.4, 2, x, y, rx);
    top.addColorStop(0, css(lighten(PAD.light, 0.12)));
    top.addColorStop(0.5, css(PAD.mid));
    top.addColorStop(1, css(PAD.dark));
    g.fillStyle = top;
    g.fill();
    g.strokeStyle = css(PAD.edge, 0.95);
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    g.stroke();
    // Veins.
    g.strokeStyle = css(PAD.dark, 0.34);
    g.lineWidth = 0.9;
    for (let i = 0; i < 9; i++) {
      const a = a0 + 0.34 + (i * (TAU - 0.68)) / 8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * rx * 0.9, y + Math.sin(a) * ry * 0.9);
      g.stroke();
    }
    // The light along its upper left rim.
    g.strokeStyle = css(lighten(PAD.light, 0.4), 0.55);
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    g.beginPath();
    g.ellipse(x, y, rx * 0.93, ry * 0.9, 0, Math.PI * 0.86, Math.PI * 1.45);
    g.stroke();
    if (shine && amount > 0.02) {
      g.strokeStyle = css(lighten(shine, 0.3), 0.9 * amount);
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(x, y, rx * 1.04, ry * 1.02, 0, 0, TAU);
      g.stroke();
      glowAt(p.light, x, y, rx * 3.2, shine, 0.22 * amount);
    }
  }

  /**
   * A lotus on a pad. `open` is 0 for a bud, shut and pointing up with a hint of its colour at the
   * tip, and 1 for a flower, its petals fanned out in three layers and the light of its middle
   * showing.
   */
  paintLotus(
    p: Painter,
    pad: Pad,
    dip: number,
    height: number,
    open: number,
    color: RGB,
    seed: number,
    glow: number,
  ): void {
    const g = p.ctx;
    const x = pad.x;
    const y = pad.y + dip - pad.ry * 0.3;
    const L = height;
    const W = L * 0.3;
    const sway = Math.sin(p.t * 1.1 + seed * 1.7) * 0.025;
    const o = clamp(open);
    const bloomed = o * o * (3 - 2 * o);
    g.save();
    g.translate(x, y);
    g.rotate(sway);
    g.lineJoin = 'round';
    // Two leaves at its foot.
    g.fillStyle = css(PAD.mid);
    g.strokeStyle = css(PAD.edge, 0.9);
    g.lineWidth = 1.1;
    for (const side of [-1, 1] as const) {
      g.beginPath();
      g.ellipse(side * W * 0.9, -2, W * 0.95, W * 0.34, side * -0.32, 0, TAU);
      g.fill();
      g.stroke();
    }
    const petalColor = mix(mix([140, 214, 150], color, 0.78), color, bloomed);
    const layers: readonly { n: number; spread: number; len: number; wid: number; shade: number }[] = [
      { n: 5, spread: 0.5, len: 0.96, wid: 0.9, shade: -0.28 },
      { n: 4, spread: 0.62, len: 0.9, wid: 1.0, shade: -0.1 },
      { n: 3, spread: 0.8, len: 0.76, wid: 1.12, shade: 0.06 },
    ];
    if (bloomed > 0.5) glowAt(p.light, 0, -L * 0.3, L * (1.3 + glow * 1.4), color, (0.16 + 0.26 * glow) * bloomed);
    layers.forEach((layer, li) => {
      const fan = 0.05 + (layer.spread - 0.05) * bloomed;
      for (let i = 0; i < layer.n; i++) {
        const c = (layer.n - 1) / 2;
        const a = (i - c) * fan;
        const len = L * layer.len * (1 - (0.1 * bloomed * Math.abs(i - c)) / Math.max(1, c));
        const wid = W * layer.wid * (0.82 + 0.26 * bloomed);
        g.save();
        // The outer petals of a flower sit lower and lean away, which is what makes it a cup and
        // not a fan.
        g.translate(Math.sin(a) * 2 * bloomed, -Math.abs(i - c) * 1.6 * bloomed);
        g.rotate(a);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(wid * 1.08, -len * 0.26, wid * 0.92, -len * 0.78, 0, -len);
        g.bezierCurveTo(-wid * 0.92, -len * 0.78, -wid * 1.08, -len * 0.26, 0, 0);
        g.closePath();
        const grad = g.createLinearGradient(0, 0, 0, -len);
        const tint = layer.shade >= 0 ? lighten(petalColor, layer.shade) : darken(petalColor, -layer.shade);
        grad.addColorStop(0, css(mix(tint, COLORS.white, 0.62)));
        grad.addColorStop(0.55, css(tint));
        grad.addColorStop(1, css(layer.shade >= 0 ? petalColor : darken(petalColor, 0.12)));
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = css(darken(petalColor, 0.5), 0.9);
        g.lineWidth = 1.1;
        g.stroke();
        if (bloomed > 0.4) {
          g.strokeStyle = css(lighten(petalColor, 0.5), 0.35 * bloomed);
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(0, -len * 0.14);
          g.lineTo(0, -len * 0.78);
          g.stroke();
        }
        g.restore();
      }
      // The middle, between the back layers and the front one, a little gold light.
      if (li === 1 && bloomed > 0.3) {
        const cy = -L * 0.2;
        const gold = g.createRadialGradient(0, cy, 0.5, 0, cy, L * 0.18);
        gold.addColorStop(0, `rgba(255,250,200,${0.95 * bloomed})`);
        gold.addColorStop(1, `rgba(255,200,90,0)`);
        g.fillStyle = gold;
        g.beginPath();
        g.arc(0, cy, L * 0.18, 0, TAU);
        g.fill();
      }
    });
    g.restore();
  }
}
