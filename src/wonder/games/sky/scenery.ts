import type { Rng } from '../../../domain/rng';
import { COLORS, css, darken, mix } from '../../engine/color';
import { TAU } from '../../engine/ease';
import {
  glowAt,
  makeCloud,
  makeHills,
  makePalace,
  paintMoon,
  prerender,
  Starfield,
  verticalGradient,
} from '../../engine/paint';
import type { Painter, View } from '../../engine/painter';
import { BurstLight, type Lit, newLit } from './light';
import type { Look } from './looks';

interface Cloud {
  readonly canvas: HTMLCanvasElement;
  x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
}

/** How far down the screen the horizon is, and how tall the bank at the front is. */
const HORIZON = 0.64;
const BANK = 16;
const FEET = 22;

/**
 * The night the fireworks happen in: a sky with a moon and drifting clouds, hills and a palace on
 * the horizon, a lake that mirrors all of it, and a bank in front. Everything that has a surface
 * takes its light from the bursts.
 */
export class Scenery {
  readonly horizon: number;
  /** Where the friends' hooves are. */
  readonly feet: number;
  private readonly stars: Starfield;
  private readonly moon: HTMLCanvasElement;
  private readonly far: HTMLCanvasElement;
  private readonly near: HTMLCanvasElement;
  private readonly palace: HTMLCanvasElement;
  private readonly clouds: Cloud[];
  private mirror: HTMLCanvasElement | null = null;
  private tinted: HTMLCanvasElement | null = null;
  private readonly lit: Lit = newLit();

  constructor(
    private readonly look: Look,
    rng: Rng,
    private readonly view: View,
  ) {
    const { w, h } = view;
    this.horizon = h * HORIZON;
    this.feet = h - FEET;
    this.stars = new Starfield(Math.round((w * h) / 1500), rng, w, 0, this.horizon);
    this.moon = prerender(150, 150, (g) => paintMoon(g, 75, 75, 17, look.moon));
    this.far = makeHills(w + 40, h * 0.2, rng, look.hills[0], look.hills[1], 0.55);
    this.near = makeHills(w + 40, h * 0.14, rng, mix(look.hills[0], look.hills[1], 0.4), look.hills[1], 0.4);
    this.palace = makePalace(170, 110, look.palace, look.window);
    this.clouds = Array.from({ length: Math.max(4, Math.round(w / 190)) }, (_, i) => {
      const cw = rng.range(150, 250);
      const ch = cw * rng.range(0.3, 0.42);
      return {
        canvas: makeCloud(cw, ch, rng, look.cloud[0], look.cloud[1]),
        x: rng.range(-60, w),
        y: this.horizon * rng.range(0.26, 0.78),
        w: cw,
        h: ch,
        speed: rng.range(2, 6) * (i % 2 === 0 ? 1 : 0.6),
      };
    });
  }

  /** The top edge of the bank, where it meets the water, at a place along the shore. */
  edge(x: number): number {
    return this.feet - BANK + Math.sin(x * 0.021) * 2.6 + Math.sin(x * 0.0073 + 1.3) * 3.4;
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.view.w + 20) c.x = -c.w - 20;
    }
  }

  paintSky(p: Painter, light: BurstLight): void {
    const g = p.ctx;
    const { w, h } = this.view;
    const look = this.look;
    verticalGradient(g, 0, 0, w, this.horizon + 2, look.sky);
    g.globalCompositeOperation = 'lighter';
    // The glow of the town beyond the hills, and the light each burst throws on the sky.
    glowAt(g, w * 0.5, this.horizon, w * 1.5, look.glow, 0.28 + light.ambient * 0.1);
    for (const pool of light.pools) glowAt(g, pool.x, pool.y, pool.size, pool.color, 0.26 * BurstLight.fade(pool));
    g.globalCompositeOperation = 'source-over';
    this.stars.draw(g, p.t, p.calm, 1 - light.ambient * 0.55);
    g.drawImage(this.moon, w * 0.14 - 75, h * 0.17 - 75, 150, 150);
    for (const c of this.clouds) this.paintCloud(g, c, light);
    // The hills and the palace stand against the glow as shapes, and the near hills hide the
    // palace's feet.
    g.drawImage(this.far, -20, this.horizon - h * 0.2 + 6, w + 40, h * 0.2);
    g.drawImage(this.palace, w * 0.72, this.horizon - 52, 100, 66);
    g.drawImage(this.near, -20, this.horizon - h * 0.14 + 10, w + 40, h * 0.14);
  }

  private paintCloud(g: CanvasRenderingContext2D, c: Cloud, light: BurstLight): void {
    const lit = light.at(c.x + c.w / 2, c.y + c.h / 2, this.lit);
    if (lit.level < 0.04) {
      g.drawImage(c.canvas, c.x, c.y, c.w, c.h);
      return;
    }
    // A cloud in the light of a burst is the cloud with that light laid over only the cloud.
    const scratch = this.scratchFor(c.canvas);
    const s = scratch.getContext('2d')!;
    s.globalCompositeOperation = 'copy';
    s.drawImage(c.canvas, 0, 0);
    s.globalCompositeOperation = 'source-atop';
    s.fillStyle = `rgba(${Math.round(lit.r)},${Math.round(lit.g)},${Math.round(lit.b)},${(lit.level * 0.8).toFixed(3)})`;
    s.fillRect(0, 0, c.canvas.width, c.canvas.height);
    s.globalCompositeOperation = 'source-over';
    g.drawImage(scratch, 0, 0, c.canvas.width, c.canvas.height, c.x, c.y, c.w, c.h);
  }

  private scratchFor(source: HTMLCanvasElement): HTMLCanvasElement {
    if (!this.tinted) this.tinted = document.createElement('canvas');
    if (this.tinted.width < source.width) this.tinted.width = source.width;
    if (this.tinted.height < source.height) this.tinted.height = source.height;
    return this.tinted;
  }

  /**
   * The water: its own colour, then the sky laid on it upside down in strips that are squeezed and
   * wobbled, then glints. It must be painted after the sky and the sparks are on the picture,
   * because it copies what is there.
   */
  paintLake(p: Painter, light: BurstLight): void {
    const g = p.ctx;
    const { w } = this.view;
    const look = this.look;
    const top = this.horizon;
    const depth = this.feet - BANK - top;
    verticalGradient(g, 0, top, w, depth + 8, [
      [0, look.water[0]],
      [1, look.water[1]],
    ]);
    this.reflect(p, depth);
    verticalGradient(
      g,
      0,
      top,
      w,
      depth,
      [
        [0, look.water[0]],
        [1, look.water[1]],
      ],
      0.34,
    );
    g.globalCompositeOperation = 'lighter';
    // The moon's path across the water, and a few slow glints.
    const mx = w * 0.14;
    for (let i = 0; i < 12; i++) {
      const u = (i + 0.5) / 12;
      const y = top + u * depth;
      const sway = Math.sin(p.t * 1.4 + i * 2.1) * (2 + u * 12) * (p.calm ? 0.4 : 1);
      const width = 5 + u * 34;
      const flick = 0.5 + 0.5 * Math.sin(p.t * 2.3 + i * 1.7);
      g.fillStyle = css(look.moon, (0.22 - u * 0.1) * (0.5 + 0.5 * flick));
      g.fillRect(mx + sway - width / 2, y, width, 1.4 + u);
    }
    for (let i = 0; i < 9; i++) {
      const y = top + 8 + ((i * 41 + p.t * (6 + (i % 3) * 3)) % Math.max(10, depth - 16));
      const x = (i * 197 + Math.sin(p.t * 0.6 + i) * 24) % w;
      g.fillStyle = css(COLORS.white, 0.05 + light.ambient * 0.1);
      g.fillRect(x, y, 26 + (i % 4) * 10, 1.2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  private reflect(p: Painter, depth: number): void {
    const g = p.ctx;
    const { w } = this.view;
    const k = p.k;
    const skyH = this.horizon;
    const mw = Math.max(2, Math.round((w * k) / 2));
    const mh = Math.max(2, Math.round((skyH * k) / 2));
    if (!this.mirror || this.mirror.width !== mw || this.mirror.height !== mh) {
      this.mirror = document.createElement('canvas');
      this.mirror.width = mw;
      this.mirror.height = mh;
    }
    const m = this.mirror.getContext('2d')!;
    // The sky down to the horizon, copied once and small, which also makes it soft.
    m.globalCompositeOperation = 'copy';
    m.drawImage(g.canvas, 0, 0, g.canvas.width, Math.min(g.canvas.height, skyH * k), 0, 0, mw, mh);
    const strips = 22;
    const stripH = depth / strips;
    const wobble = p.calm ? 0.4 : 1;
    g.save();
    for (let i = 0; i < strips; i++) {
      const d = i * stripH;
      // The farther down the water, the higher in the sky it shows, and it is stretched, as in real
      // water.
      const band = stripH * 1.35;
      const srcTop = Math.max(0, skyH - d * 1.35 - band);
      const wob = Math.sin(p.t * 1.7 + i * 0.85) * (0.5 + i * 0.1) * wobble;
      g.globalAlpha = 0.7 - (i / strips) * 0.3;
      g.save();
      g.beginPath();
      g.rect(0, skyH + d, w, stripH + 0.6);
      g.clip();
      g.translate(wob, skyH + d + stripH);
      g.scale(1, -1);
      g.drawImage(this.mirror, 0, (srcTop / skyH) * mh, mw, Math.max(1, (band * mh) / skyH), 0, 0, w, stripH);
      g.restore();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  paintBank(p: Painter, light: BurstLight, lamp: { x: number; y: number }): void {
    const g = p.ctx;
    const { w, h } = this.view;
    const look = this.look;
    const top = this.feet - BANK - 4;
    const bank = g.createLinearGradient(0, top, 0, h);
    bank.addColorStop(0, css(mix(look.hills[0], look.water[0], 0.35)));
    bank.addColorStop(1, css(darken(look.hills[1], 0.5)));
    g.fillStyle = bank;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, this.edge(0));
    for (let x = 6; x <= w + 6; x += 6) g.lineTo(x, this.edge(x));
    g.lineTo(w + 6, h);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'lighter';
    // The water's edge catches what is in the sky, and a lamp's worth of warm light falls at the
    // foot of the launcher.
    g.strokeStyle = css(look.glow, 0.1 + light.ambient * 0.3);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, this.edge(0));
    for (let x = 6; x <= w + 6; x += 6) g.lineTo(x, this.edge(x));
    g.stroke();
    glowAt(g, lamp.x, lamp.y - 6, 96, [255, 190, 110], 0.2);
    g.globalCompositeOperation = 'source-over';
    this.tufts(p);
    this.reeds(p, w * 0.045, 1);
    this.reeds(p, w * 0.955, -1);
  }

  /** Tufts of grass along the edge, leaning a little in a wind that is not there. */
  private tufts(p: Painter): void {
    const g = p.ctx;
    const { w } = this.view;
    const sway = p.calm ? 0.4 : 1.2;
    g.fillStyle = css(darken(this.look.hills[1], 0.3));
    for (let x = 3; x < w + 10; x += 14) {
      const y = this.edge(x) + 3;
      const gh = 5 + ((x * 13) % 6);
      const lean = Math.sin(p.t * 1.3 + x * 0.07) * sway;
      g.beginPath();
      g.moveTo(x - 3, y);
      g.quadraticCurveTo(x - 1.5 + lean * 0.4, y - gh * 0.6, x - 2 + lean, y - gh);
      g.quadraticCurveTo(x + lean * 0.5, y - gh * 0.5, x + 1, y);
      g.quadraticCurveTo(x + 1 + lean * 0.5, y - gh * 0.7, x + 2.5 + lean * 1.2, y - gh * 0.85);
      g.quadraticCurveTo(x + 3, y - gh * 0.4, x + 4, y);
      g.closePath();
      g.fill();
    }
  }

  /**
   * A clump of reeds with a cattail or two, at the end of the shore. `dir` is the way they lean.
   */
  private reeds(p: Painter, x: number, dir: number): void {
    const g = p.ctx;
    const base = this.edge(x) + 6;
    const sway = (p.calm ? 0.4 : 1) * Math.sin(p.t * 0.9 + x);
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const height = 40 + ((i * 17) % 26);
      const lean = (i - 2.5) * 5 * dir + sway * 3;
      const bx = x + (i - 2.5) * 5;
      g.strokeStyle = css(darken(this.look.hills[1], 0.25));
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(bx, base);
      g.quadraticCurveTo(bx + lean * 0.3, base - height * 0.6, bx + lean, base - height);
      g.stroke();
      if (i % 2 === 0) {
        g.fillStyle = css(darken(this.look.hills[1], 0.1));
        g.beginPath();
        g.ellipse(bx + lean, base - height - 4, 2.1, 6, lean * 0.02, 0, TAU);
        g.fill();
      }
    }
  }
}
