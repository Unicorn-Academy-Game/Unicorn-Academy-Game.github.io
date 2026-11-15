import { Rng } from '../../../domain/rng';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { addRoundedRect, glowAt, makeCloud, makeHills, prerender, Starfield } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { sharp } from '../party/world-art';
import { cellAt, PARTS, type Plan } from './layout';
import type { Paint } from './recipes';

/**
 * The workshop's meadow: a dusk sky with clouds and a few stars, two lines of hills, the grass with
 * a round stone floor under the machine, a market cart that the fruit sit on, and the shelf that
 * the new things stand on. All of it that holds still is drawn once for the screen. The trees,
 * bushes and flowers on the meadow are the playground's own, stamped every frame.
 */

/** The playground's own trees, bushes and flowers that the meadow is dressed with. */
export const TREES = [
  'pg-tree-blossom-1',
  'pg-tree-oak-lavender-1',
  'pg-tree-birch-lime-1',
  'pg-tree-willow-emerald-1',
] as const;
export const BUSHES = ['pg-bush-pink-dots', 'pg-bush-rose-dots', 'pg-bush-lime-1', 'pg-bush-emerald-1'] as const;
export const FLOWERS = [
  'pg-flowers-pink-1',
  'pg-flowers-sky-1',
  'pg-flowers-yellow-1',
  'pg-flowers-lilac-2',
  'pg-flowers-coral-1',
  'pg-flowers-white-1',
] as const;

const WOOD: RGB = [176, 112, 72];
const WOOD_DARK: RGB = [96, 58, 52];

interface Decor {
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
  readonly size: number;
  readonly phase: number;
  readonly tree: boolean;
}

export class SceneArt {
  private back: HTMLCanvasElement | null = null;
  /**
   * The cart and the shelf, which stand in front of the trees at the edges and not the other way
   * about.
   */
  private set: HTMLCanvasElement | null = null;
  private stars: Starfield | null = null;
  private trees: Decor[] = [];
  private decor: Decor[] = [];
  private key = '';
  private seed: number;

  constructor(
    private readonly bank: SpriteBank | null,
    rng: Rng,
  ) {
    this.seed = rng.int(0x7fffffff);
  }

  /** Draws what holds still, for this screen. `k` is device pixels in a unit. */
  place(plan: Plan, paint: Paint, k: number): void {
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    const dpr = Math.min(2, sharp(k));
    this.back = prerender(plan.w, plan.h, (g) => this.paintBack(g, plan, paint), dpr);
    this.set = prerender(
      plan.w,
      plan.h,
      (g) => {
        this.paintCart(g, plan);
        this.paintShelf(g, plan, paint);
      },
      dpr,
    );
    const rng = new Rng(this.seed + 17);
    this.stars = new Starfield(plan.portrait ? 40 : 56, rng, plan.w, 4, plan.horizon * 0.7);
    const laid = this.lay(plan, rng);
    this.trees = laid.filter((d) => d.tree);
    this.decor = laid.filter((d) => !d.tree);
  }

  private paintBack(g: CanvasRenderingContext2D, plan: Plan, paint: Paint): void {
    const { w, h, horizon } = plan;
    const rng = new Rng(this.seed);
    // The sky: violet above and warm at the horizon, with the glow of the sun that has just gone.
    const sky = g.createLinearGradient(0, 0, 0, horizon + 30);
    sky.addColorStop(0, css(paint.sky[0]));
    sky.addColorStop(0.62, css(mix(paint.sky[0], paint.sky[1], 0.55)));
    sky.addColorStop(1, css(paint.sky[1]));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, horizon + 30);
    glowAt(g, w * 0.5, horizon + 6, w * 1.1, lighten(paint.sky[1], 0.2), 0.5);
    glowAt(g, w * (plan.portrait ? 0.25 : 0.18), horizon - 6, w * 0.5, COLORS.gold, 0.2);
    // A few clouds, high up.
    const cloudTop = lighten(paint.sky[1], 0.35);
    const cloudBottom = mix(paint.sky[0], paint.sky[1], 0.35);
    const clouds = plan.portrait
      ? [
          [0.1, 0.2, 120],
          [0.62, 0.3, 150],
        ]
      : [
          [0.05, 0.3, 160],
          [0.7, 0.2, 200],
          [0.4, 0.4, 130],
        ];
    for (const [u, v, cw] of clouds as [number, number, number][]) {
      const ch = cw * 0.38;
      g.globalAlpha = 0.55;
      g.drawImage(makeCloud(cw, ch, rng, cloudTop, cloudBottom, 6), w * u, horizon * v, cw, ch);
      g.globalAlpha = 1;
    }
    // Two lines of hills, the far one pale and the near one deeper.
    const far = makeHills(
      w,
      horizon * 0.5,
      rng,
      mix(paint.hill, paint.sky[1], 0.55),
      mix(paint.hill, paint.sky[1], 0.2),
      0.5,
    );
    g.drawImage(far, 0, horizon - horizon * 0.5 + 14, w, horizon * 0.5);
    const near = makeHills(w, horizon * 0.34, rng, paint.hill, darken(paint.hill, 0.25), 0.55);
    g.drawImage(near, 0, horizon - horizon * 0.34 + 14, w, horizon * 0.34);
    // The grass, lighter at the back, and wide soft stripes where it has been mown.
    const grass = g.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, css(paint.grass[0]));
    grass.addColorStop(1, css(paint.grass[1]));
    g.fillStyle = grass;
    g.fillRect(0, horizon + 8, w, h - horizon - 8);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    for (let i = 0; i < 6; i++) {
      const y = horizon + 14 + ((h - horizon) / 6) * i * 1.04;
      g.beginPath();
      g.ellipse(w * (0.2 + 0.6 * ((i * 0.37) % 1)), y + 8, w * 0.42, 6 + i * 2.2, 0, 0, TAU);
      g.fill();
    }
    this.paintFloor(g, plan, paint);
  }

  /** The round stone floor the machine stands on. */
  private paintFloor(g: CanvasRenderingContext2D, plan: Plan, paint: Paint): void {
    const cx = plan.machine.x;
    const cy = plan.machine.y + 5 * plan.s;
    const rx = 156 * plan.s;
    const ry = 21 * plan.s;
    const stone = mix(paint.sky[1], [210, 200, 226], 0.55);
    g.fillStyle = 'rgba(10,10,40,0.22)';
    g.beginPath();
    g.ellipse(cx, cy + 4, rx + 6, ry + 4, 0, 0, TAU);
    g.fill();
    const grad = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    grad.addColorStop(0, css(lighten(stone, 0.2)));
    grad.addColorStop(1, css(darken(stone, 0.18)));
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css(darken(stone, 0.35), 0.5);
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(cx, cy, rx * 0.84, ry * 0.84, 0, 0, TAU);
    g.stroke();
    g.beginPath();
    g.ellipse(cx, cy, rx * 0.6, ry * 0.6, 0, 0, TAU);
    g.stroke();
    // Flagstones, as lines across the rings.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * rx * 0.6, cy + Math.sin(a) * ry * 0.6);
      g.lineTo(cx + Math.cos(a) * rx * 0.99, cy + Math.sin(a) * ry * 0.99);
      g.stroke();
    }
  }

  /** The cart: a plank under each row of fruit, on posts, with a striped awning over the top. */
  private paintCart(g: CanvasRenderingContext2D, plan: Plan): void {
    const { cart, fruit } = plan;
    const ys = [...new Set(fruit.map((f) => Math.round(f.y)))].sort((a, b) => a - b);
    const r = fruit[0]!.r;
    // A shadow on the grass under the whole of it.
    g.fillStyle = 'rgba(10,20,30,0.26)';
    g.beginPath();
    g.ellipse((cart.x0 + cart.x1) / 2, cart.y1 + 2, (cart.x1 - cart.x0) / 2 + 6, 7, 0, 0, TAU);
    g.fill();
    for (const y of ys) {
      const row = fruit.filter((f) => Math.round(f.y) === y);
      const x0 = Math.min(...row.map((f) => f.x)) - r - 4;
      const x1 = Math.max(...row.map((f) => f.x)) + r + 4;
      const top = y + r * 0.78;
      g.fillStyle = css(darken(WOOD_DARK, 0.2));
      g.fillRect(x0 + 5, top + 6, 5, cart.y1 - top - 2);
      g.fillRect(x1 - 10, top + 6, 5, cart.y1 - top - 2);
      const plank = g.createLinearGradient(0, top, 0, top + 9);
      plank.addColorStop(0, css(lighten(WOOD, 0.25)));
      plank.addColorStop(1, css(darken(WOOD, 0.2)));
      g.fillStyle = plank;
      g.strokeStyle = css(WOOD_DARK, 0.9);
      g.lineWidth = 1.4;
      g.beginPath();
      addRoundedRect(g, x0, top, x1 - x0, 9, 3);
      g.fill();
      g.stroke();
    }
    // The awning over the back row, red and cream, scalloped along its lower edge.
    const topRow = fruit.filter((f) => Math.round(f.y) === ys[0]);
    const ax0 = Math.min(...topRow.map((f) => f.x)) - r - 8;
    const ax1 = Math.max(...topRow.map((f) => f.x)) + r + 8;
    const ay = ys[0]! - r - 22;
    const stripes = Math.max(4, Math.round((ax1 - ax0) / 20));
    const sw = (ax1 - ax0) / stripes;
    g.strokeStyle = css(WOOD_DARK);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ax0 + 4, ay + 2);
    g.lineTo(ax0 + 4, ys[0]! + r * 0.7);
    g.moveTo(ax1 - 4, ay + 2);
    g.lineTo(ax1 - 4, ys[0]! + r * 0.7);
    g.stroke();
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = css(i % 2 ? [255, 244, 224] : [238, 84, 108]);
      g.beginPath();
      g.moveTo(ax0 + sw * i, ay);
      g.lineTo(ax0 + sw * (i + 1), ay);
      g.lineTo(ax0 + sw * (i + 1), ay + 12);
      g.arc(ax0 + sw * (i + 0.5), ay + 12, sw / 2, 0, Math.PI);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = css([120, 40, 70], 0.7);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(ax0, ay);
    g.lineTo(ax1, ay);
    g.stroke();
  }

  /** The shelf: a wooden cabinet with a plate under each place a thing can stand. */
  private paintShelf(g: CanvasRenderingContext2D, plan: Plan, paint: Paint): void {
    const sh = plan.shelf;
    const pad = 7;
    const x0 = sh.x0 - pad;
    const x1 = sh.x1 + pad;
    const y0 = sh.y0 - pad + 2;
    const y1 = sh.y1 + 6;
    g.fillStyle = 'rgba(10,20,30,0.28)';
    g.beginPath();
    g.ellipse((x0 + x1) / 2, y1 + 4, (x1 - x0) / 2 + 4, 6, 0, 0, TAU);
    g.fill();
    const frame = g.createLinearGradient(x0, 0, x1, 0);
    frame.addColorStop(0, css(darken(WOOD, 0.1)));
    frame.addColorStop(0.5, css(lighten(WOOD, 0.12)));
    frame.addColorStop(1, css(darken(WOOD, 0.22)));
    g.fillStyle = frame;
    g.strokeStyle = css(WOOD_DARK);
    g.lineWidth = 2;
    g.beginPath();
    addRoundedRect(g, x0, y0, x1 - x0, y1 - y0, 8);
    g.fill();
    g.stroke();
    // The inside, dark and a little lit from above.
    const inside = g.createLinearGradient(0, y0 + pad, 0, y1 - 4);
    inside.addColorStop(0, css(darken(paint.bodyDark, 0.35)));
    inside.addColorStop(1, css(darken(paint.bodyDark, 0.7)));
    g.fillStyle = inside;
    g.beginPath();
    addRoundedRect(g, sh.x0 - 2, sh.y0 - 2, sh.x1 - sh.x0 + 4, sh.y1 - sh.y0 + 4, 5);
    g.fill();
    // A plate for each place, with the light catching the top edge of it.
    for (let i = 0; i < sh.cols * sh.rows; i++) {
      const c = cellAt(plan, i);
      const half = sh.cell / 2 - 2.5;
      g.fillStyle = css(mix(paint.bodyDark, [255, 255, 255], 0.14), 0.55);
      g.beginPath();
      addRoundedRect(g, c.x - half, c.y - half, half * 2, half * 2, 5);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(c.x - half + 4, c.y - half + 0.5);
      g.lineTo(c.x + half - 4, c.y - half + 0.5);
      g.stroke();
      g.fillStyle = css(paint.trim, 0.3);
      g.beginPath();
      g.ellipse(c.x, c.y + half - 3, half * 0.62, 2.6, 0, 0, TAU);
      g.fill();
    }
  }

  /**
   * Where the meadow's trees, bushes and flowers stand: at the edges and the back, and none where a
   * thing is.
   */
  private lay(plan: Plan, rng: Rng): Decor[] {
    const out: Decor[] = [];
    const { w, h, horizon } = plan;
    const add = (x: number, y: number, list: readonly string[], size: number): void => {
      out.push({ x, y, sprite: list[rng.int(list.length)]!, size, phase: rng.range(0, TAU), tree: list === TREES });
    };
    const roof = plan.portrait ? horizon + 26 : horizon + 22;
    // Trees at the back and at both edges.
    add(w * 0.045, roof, TREES, plan.portrait ? 0.5 : 0.52);
    add(w * 0.955, roof + 4, TREES, plan.portrait ? 0.48 : 0.5);
    if (!plan.portrait) {
      add(w * 0.2, roof - 4, TREES, 0.36);
      add(w * 0.81, roof - 2, TREES, 0.36);
    }
    // Bushes and flowers along the back of the grass, away from what the player touches.
    const near = (x: number, y: number, pad: number): boolean => {
      const sh = plan.shelf;
      const inShelf = x > sh.x0 - pad && x < sh.x1 + pad && y > sh.y0 - pad - 12 && y < sh.y1 + pad;
      const inCart =
        x > plan.cart.x0 - pad &&
        x < plan.cart.x1 + pad &&
        y > plan.fruit[0]!.y - plan.fruit[0]!.r * 2 - pad &&
        y < plan.cart.y1 + pad;
      const half = (PARTS.width / 2) * plan.s + pad;
      const inMachine =
        Math.abs(x - plan.machine.x) < half &&
        y > plan.machine.y - PARTS.height * plan.s - pad &&
        y < plan.machine.y + pad;
      return inShelf || inCart || inMachine;
    };
    const tries = plan.portrait ? 26 : 40;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(10, w - 10);
      const y = rng.range(horizon + 22, h - 10);
      if (near(x, y, 16)) continue;
      // Flowers are more of the nearer grass and bushes more of the far.
      const far = (y - horizon) / (h - horizon);
      if (rng.next() < 0.5 - far * 0.3) add(x, y, BUSHES, rng.range(0.42, 0.58) * (0.8 + far * 0.4));
      else add(x, y, FLOWERS, rng.range(0.5, 0.78) * (0.8 + far * 0.4));
    }
    return out.sort((a, b) => a.y - b.y);
  }

  /**
   * The sky and the meadow, the trees at the back, and the cart and the shelf in front of them: all
   * of it under everything else.
   */
  paint(p: Painter): void {
    if (!this.back) return;
    p.ctx.drawImage(this.back, 0, 0, p.w, p.h);
    this.stars?.draw(p.ctx, p.t, p.calm, 0.7);
    this.stamp(p, this.trees);
    if (this.set) p.ctx.drawImage(this.set, 0, 0, p.w, p.h);
  }

  /**
   * The bushes and flowers, which sway a little, in front of the cart and the shelf and behind the
   * machine.
   */
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
}
