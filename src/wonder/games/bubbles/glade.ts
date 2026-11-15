import { Rng } from '../../../domain/rng';
import { drawPic, type Pic, type SpriteBank } from '../../engine/bank';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { type Contour, contourOf, fillGround, paintTree, sleepyFace } from '../../engine/land';
import { glowAt, makeCloud, prerender, stamp, verticalGradient } from '../../engine/paint';
import type { Painter, View } from '../../engine/painter';
import { insidePond, type Plan, ROCK } from './layout';

/**
 * The place the bubbles float over: a bright morning, a sun with a sleepy face, clouds that drift,
 * hills and a blossom tree, a meadow with a pond. What never changes is drawn once, and what does
 * (the clouds, the rays, the water, the reeds) is cheap. The pond is drawn in two parts, the water,
 * and then the lilies and reeds over it, so a fish swims under the lilies.
 */

const SKY: readonly (readonly [number, RGB])[] = [
  [0, [84, 184, 255]],
  [0.55, [150, 218, 255]],
  [1, [232, 249, 255]],
];
const HORIZON: RGB = [255, 248, 214];
const SUN: RGB = [255, 222, 112];
const CLOUD: readonly [RGB, RGB] = [
  [255, 255, 255],
  [204, 230, 255],
];
const FAR_HILLS: readonly [RGB, RGB] = [
  [152, 226, 188],
  [108, 202, 150],
];
const GRASS: readonly [RGB, RGB, RGB] = [
  [150, 228, 118],
  [96, 202, 98],
  [58, 158, 80],
];
const WATER: readonly [RGB, RGB] = [
  [168, 232, 255],
  [70, 156, 226],
];

interface Cloud {
  readonly image: HTMLCanvasElement;
  x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
  readonly bob: number;
}

interface Ripple {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  age: number;
}

interface Lily {
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly scale: number;
  readonly phase: number;
}

interface Reed {
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly scale: number;
  readonly phase: number;
}

const RIPPLE_SECONDS = 1.5;

export class Glade {
  /** Where the sun is, and how big. */
  readonly sun: { readonly x: number; readonly y: number; readonly r: number };
  private readonly sky: HTMLCanvasElement;
  private readonly far: HTMLCanvasElement;
  private readonly ground: HTMLCanvasElement;
  private readonly rays: HTMLCanvasElement;
  private readonly clouds: Cloud[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly lilies: Lily[] = [];
  private readonly reeds: Reed[] = [];

  constructor(
    private readonly bank: SpriteBank | null,
    seed: number,
    private readonly view: View,
    private readonly plan: Plan,
  ) {
    const rng = new Rng(seed);
    const { w, h } = view;
    this.sun = { x: w * 0.84, y: h * 0.25, r: clamp(h * 0.085, 26, 40) };
    const farLine = contourOf(rng, plan.horizon + 14, h * 0.07, w);
    const nearLine = contourOf(rng, plan.horizon + 12, h * 0.012, w);
    this.sky = prerender(w, h, (g) => this.drawSky(g, w, h));
    this.far = prerender(w, h, (g) => this.drawFar(g, w, h, farLine, rng));
    this.ground = prerender(w, h, (g) => this.drawGround(g, w, h, nearLine, rng));
    this.rays = this.makeRays(this.sun.r);
    this.layPond(rng);
    const count = Math.max(3, Math.min(5, Math.round(w / 190)));
    for (let i = 0; i < count; i++) {
      const cw = rng.range(120, 190);
      const ch = cw * rng.range(0.4, 0.5);
      const image = prerender(cw, ch, (g) => {
        g.drawImage(makeCloud(cw, ch, rng, CLOUD[0], CLOUD[1], 6), 0, 0, cw, ch);
        sleepyFace(g, cw / 2, ch * 0.6, ch * 0.62, darken(CLOUD[1], 0.4), [255, 130, 160]);
      });
      this.clouds.push({
        image,
        x: (i / count) * (w + 200) - 100 + rng.range(-30, 30),
        y: h * rng.range(0.1, 0.42),
        w: cw,
        h: ch,
        speed: rng.range(2.5, 6),
        bob: rng.range(0, TAU),
      });
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -c.w) c.x = this.view.w + 30;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dt;
      if (r.age >= RIPPLE_SECONDS) this.ripples.splice(i, 1);
    }
  }

  /** A ring spreads over the pond from a point of it. */
  ripple(x: number, y: number, size = 1): void {
    if (this.ripples.length > 14) this.ripples.shift();
    this.ripples.push({ x, y, size, age: 0 });
  }

  private drawSky(g: CanvasRenderingContext2D, w: number, h: number): void {
    const { plan, sun } = this;
    verticalGradient(g, 0, 0, w, h, SKY);
    // The light along the horizon, wide and low.
    g.save();
    g.translate(sun.x * 0.7 + w * 0.15, plan.horizon);
    g.scale(1, 0.5);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.8);
    glow.addColorStop(0, css(HORIZON, 0.75));
    glow.addColorStop(0.5, css(HORIZON, 0.24));
    glow.addColorStop(1, css(HORIZON, 0));
    g.fillStyle = glow;
    g.fillRect(-w, -w, w * 2, w * 2);
    g.restore();
    glowAt(g, sun.x, sun.y, sun.r * 9, SUN, 0.42);
    glowAt(g, sun.x, sun.y, sun.r * 4, [255, 250, 222], 0.5);
    // Three soft beams of light that fall from the sun across the sky.
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [spread, width, alpha] of [
      [0.5, 0.1, 0.1],
      [0.9, 0.07, 0.075],
      [1.3, 0.13, 0.06],
    ] as const) {
      const angle = Math.PI * (0.5 + spread * 0.18);
      const length = Math.hypot(w, h) * 1.1;
      g.save();
      g.translate(sun.x, sun.y);
      g.rotate(angle);
      const beam = g.createLinearGradient(0, 0, length, 0);
      beam.addColorStop(0, css([255, 244, 200], alpha * 1.4));
      beam.addColorStop(0.7, css([255, 244, 200], alpha * 0.5));
      beam.addColorStop(1, css([255, 244, 200], 0));
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(length, -length * width);
      g.lineTo(length, length * width);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }

  /**
   * The rays of the sun: rounded points that stand out round it, drawn once and then only turned.
   */
  private makeRays(r: number): HTMLCanvasElement {
    const size = Math.ceil(r * 6);
    return prerender(
      size,
      size,
      (g) => {
        g.translate(size / 2, size / 2);
        const n = 12;
        for (let i = 0; i < n; i++) {
          g.save();
          g.rotate((i / n) * TAU);
          g.fillStyle = css(lighten(SUN, 0.45), i % 2 === 0 ? 0.55 : 0.32);
          g.beginPath();
          const long = r * (i % 2 === 0 ? 2.6 : 2.0);
          g.moveTo(-r * 0.24, -r * 1.3);
          g.lineTo(0, -long);
          g.lineTo(r * 0.24, -r * 1.3);
          g.closePath();
          g.fill();
          g.restore();
        }
      },
      2,
    );
  }

  /** A picture from the world, with its base at (x, y) and at this scale, if the world has it. */
  private stampSprite(
    g: CanvasRenderingContext2D,
    bundle: string,
    name: string,
    x: number,
    y: number,
    scale: number,
    flip = false,
  ): Pic | null {
    const pic = this.bank?.sprite(bundle, name, 0) ?? null;
    if (pic) drawPic(g, pic, x, y, { scale, flip });
    return pic;
  }

  private drawFar(g: CanvasRenderingContext2D, w: number, h: number, line: Contour, rng: Rng): void {
    const { plan } = this;
    fillGround(g, line, w, h, plan.horizon - h * 0.12, FAR_HILLS, 0.4);
    // Round trees along the ridge, a little deeper than the hill.
    const leaf = mix(FAR_HILLS[1], [60, 150, 90], 0.4);
    for (let i = 0; i < Math.round(w / 60); i++) {
      const x = rng.range(10, w - 10);
      paintTree(g, x, line(x) + 3, rng.range(12, 20), leaf);
    }
    // The big blossom tree, and the bush, standing on the edge of the meadow.
    const { tree, bush } = plan;
    if (!this.stampSprite(g, 'playground', 'pg-tree-blossom-1', tree.x, tree.y, tree.scale))
      paintTree(g, tree.x, tree.y, 70 * tree.scale * 2, [236, 150, 190]);
    this.stampSprite(g, 'playground', 'pg-bush-pink-dots', bush.x, bush.y, bush.scale);
    this.stampSprite(g, 'playground', 'pg-bush-lime-1', bush.x - 118 * bush.scale, bush.y + 3, bush.scale * 0.85, true);
  }

  private drawGround(g: CanvasRenderingContext2D, w: number, h: number, line: Contour, rng: Rng): void {
    const { plan } = this;
    const top = plan.horizon;
    // The turf, lighter far off and deeper near.
    const outline = (): void => {
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) g.lineTo(x, line(x));
      g.lineTo(w, h);
      g.closePath();
    };
    outline();
    const turf = g.createLinearGradient(0, top, 0, h);
    turf.addColorStop(0, css(GRASS[0]));
    turf.addColorStop(0.55, css(GRASS[1]));
    turf.addColorStop(1, css(GRASS[2]));
    g.fillStyle = turf;
    g.fill();
    g.strokeStyle = css(lighten(GRASS[0], 0.4), 0.55);
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) g.moveTo(x, line(x));
      else g.lineTo(x, line(x));
    }
    g.stroke();
    // Bands of mown grass that run across the meadow, wider near.
    g.save();
    outline();
    g.clip();
    for (let i = 0; i < 9; i++) {
      const u = i / 9;
      const y0 = top + (h - top) * (u * u * 0.9 + 0.02);
      const y1 = top + (h - top) * ((u + 0.5 / 9) * (u + 0.5 / 9) * 0.9 + 0.02);
      g.fillStyle = css(i % 2 === 0 ? lighten(GRASS[1], 0.2) : darken(GRASS[1], 0.1), 0.1);
      g.fillRect(0, y0, w, y1 - y0);
    }
    g.restore();
    this.drawPond(g);
    // Tufts and pebbles, and the specks of small flowers that are too small to be the garden's own.
    // The tufts stand mostly along the front of the picture, where the friends are, and a few at
    // the far edges of the meadow, so the meadow itself stays clear for the flowers that will grow
    // in it.
    for (let i = 0; i < Math.round(w / 30); i++) {
      const front = rng.next() < 0.8;
      const x = front ? rng.range(8, w - 8) : rng.next() < 0.5 ? rng.range(6, 40) : rng.range(w - 40, w - 6);
      const y = front ? rng.range(plan.friends.top + 30, h - 4) : rng.range(plan.horizon + 24, plan.friends.top - 12);
      if (insidePond(plan.pond, x, y) < 1.25) continue;
      const depth = (y - plan.horizon) / (h - plan.horizon);
      this.stampSprite(g, 'playground', `pg-tuft-${1 + rng.int(3)}`, x, y, 0.3 + depth * 0.32, rng.next() < 0.5);
    }
    const pond = plan.pond;
    this.stampSprite(
      g,
      'playground',
      'pg-rock-moss-1',
      pond.x + ROCK.dx * pond.rx,
      pond.y + ROCK.dy * pond.ry,
      ROCK.scale,
    );
    this.stampSprite(g, 'playground', 'pg-pebbles-1', pond.x + pond.rx * 0.5, pond.y + pond.ry * 1.25, 0.8);
    this.stampSprite(g, 'playground', 'pg-pebbles-2', pond.x - pond.rx * 0.45, pond.y + pond.ry * 1.3, 0.7);
    const specks: readonly RGB[] = [
      [255, 120, 160],
      [255, 232, 100],
      [255, 255, 255],
      [190, 150, 255],
    ];
    for (let i = 0; i < Math.round(w / 12); i++) {
      const x = rng.range(4, w - 4);
      const y = rng.range(plan.horizon + 16, h - 3);
      if (insidePond(plan.pond, x, y) < 1.2) continue;
      g.fillStyle = css(specks[rng.int(specks.length)]!, 0.9);
      g.beginPath();
      g.arc(x, y, rng.range(0.9, 1.6), 0, TAU);
      g.fill();
    }
    // The bottom of the picture is a little darker, so the eye stays up with the bubbles.
    const shade = g.createLinearGradient(0, h - 40, 0, h);
    shade.addColorStop(0, 'rgba(10,40,20,0)');
    shade.addColorStop(1, 'rgba(10,40,20,0.3)');
    g.fillStyle = shade;
    g.fillRect(0, h - 40, w, 40);
  }

  /**
   * The pond as it lies: its bank, its water that is the sky upside down, and the light along its
   * edge.
   */
  private drawPond(g: CanvasRenderingContext2D): void {
    const { x, y, rx, ry } = this.plan.pond;
    // A darker rim of wet earth, then the bank of lighter grass around it.
    g.fillStyle = css([88, 150, 78], 0.55);
    g.beginPath();
    g.ellipse(x, y + 1.5, rx + 9, ry + 6.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = css([190, 226, 150], 0.9);
    g.beginPath();
    g.ellipse(x, y + 0.5, rx + 5.5, ry + 4, 0, 0, TAU);
    g.fill();
    const water = g.createLinearGradient(0, y - ry, 0, y + ry);
    water.addColorStop(0, css(WATER[0]));
    water.addColorStop(1, css(WATER[1]));
    g.fillStyle = water;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
    // What the water holds: a pale cloud, the blue of the sky, and long glints across it.
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.clip();
    g.fillStyle = css([255, 255, 255], 0.28);
    g.beginPath();
    g.ellipse(x - rx * 0.28, y - ry * 0.28, rx * 0.34, ry * 0.3, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(x + rx * 0.3, y - ry * 0.12, rx * 0.2, ry * 0.2, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css([255, 255, 255], 0.35);
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const [dx, dy, len] of [
      [-0.55, 0.2, 0.2],
      [0.08, 0.5, 0.26],
      [0.5, 0.34, 0.16],
      [-0.1, -0.05, 0.14],
    ] as const) {
      g.beginPath();
      g.moveTo(x + dx * rx, y + dy * ry);
      g.lineTo(x + (dx + len) * rx, y + dy * ry);
      g.stroke();
    }
    // The near side of the pond is a little deeper in colour.
    const deep = g.createLinearGradient(0, y, 0, y + ry);
    deep.addColorStop(0, 'rgba(20,70,160,0)');
    deep.addColorStop(1, 'rgba(20,70,160,0.22)');
    g.fillStyle = deep;
    g.fillRect(x - rx, y, rx * 2, ry);
    g.restore();
    g.strokeStyle = css([255, 255, 255], 0.55);
    g.lineWidth = 1.3;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95);
    g.stroke();
  }

  /** Where the lilies float and where the reeds stand, which are decided once. */
  private layPond(rng: Rng): void {
    const { x, y, rx, ry } = this.plan.pond;
    const lilies = clamp(Math.round(rx / 34), 3, 7);
    for (let i = 0; i < lilies; i++) {
      const a = (i / lilies) * TAU + rng.range(-0.4, 0.4);
      const d = rng.range(0.25, 0.72);
      this.lilies.push({
        x: x + Math.cos(a) * rx * d,
        y: y + Math.sin(a) * ry * d * 0.9,
        name: `pg-lily-${1 + (i % 2)}`,
        scale: rng.range(0.6, 0.85),
        phase: rng.range(0, TAU),
      });
    }
    const reeds = clamp(Math.round(rx / 36), 3, 6);
    for (let i = 0; i < reeds; i++) {
      // Reeds stand along the two ends of the pond, at its edge.
      const a = (i % 2 === 0 ? Math.PI : 0) + rng.range(-0.55, 0.55);
      this.reeds.push({
        x: x + Math.cos(a) * rx * 1.01,
        y: y + Math.sin(a) * ry * 1.01 + 2,
        name: `pg-reeds-${1 + (i % 2)}`,
        scale: rng.range(0.55, 0.8),
        phase: rng.range(0, TAU),
      });
    }
  }

  /**
   * The sky, the sun, the clouds, the far hills, the tree and the bush: everything that is behind
   * the meadow.
   */
  paintSky(p: Painter, glow: number, behindHills?: (g: CanvasRenderingContext2D) => void): void {
    const g = p.ctx;
    const { w, h } = this.view;
    stamp(g, this.sky, 0, 0, w, h);
    const r = this.sun.r;
    g.save();
    g.translate(this.sun.x, this.sun.y);
    g.rotate(p.t * 0.12);
    const size = r * 6;
    g.drawImage(this.rays, -size / 2, -size / 2, size, size);
    g.restore();
    this.paintSun(g, p.t);
    for (const c of this.clouds) g.drawImage(c.image, c.x, c.y + Math.sin(p.t * 0.4 + c.bob) * 2.5, c.w, c.h);
    if (glow > 0.01) {
      // A pop lights the sky a little, a wash that fades.
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = css(HORIZON, glow * 0.1);
      g.fillRect(0, 0, w, this.plan.horizon + 30);
      g.globalCompositeOperation = 'source-over';
    }
    behindHills?.(g);
    stamp(g, this.far, 0, 0, w, h);
  }

  private paintSun(g: CanvasRenderingContext2D, t: number): void {
    const { x, y, r } = this.sun;
    const disc = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    disc.addColorStop(0, css(lighten(SUN, 0.55)));
    disc.addColorStop(1, css(SUN));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.strokeStyle = css(darken(SUN, 0.3), 0.5);
    g.lineWidth = 1.4;
    g.stroke();
    sleepyFace(g, x, y + r * 0.05 + Math.sin(t * 1.4) * 0.6, r * 1.05, [150, 84, 40], [255, 120, 110]);
  }

  /** The meadow and the water of the pond, with the light moving on it. */
  paintGround(p: Painter): void {
    const g = p.ctx;
    const { w, h } = this.view;
    stamp(g, this.ground, 0, 0, w, h);
    const { x, y, rx, ry } = this.plan.pond;
    // Glints on the water that come and go.
    if (!p.calm) {
      for (let i = 0; i < 5; i++) {
        const t = p.t * 0.5 + i * 1.7;
        const u = t - Math.floor(t);
        const px = x + Math.sin(i * 12.9 + Math.floor(t) * 3.1) * rx * 0.8;
        const py = y + Math.cos(i * 7.3 + Math.floor(t) * 2.3) * ry * 0.6;
        glowAt(p.light, px, py, 9 + 6 * Math.sin(u * Math.PI), [255, 255, 255], 0.75 * Math.sin(u * Math.PI), 'spark');
      }
    }
  }

  /**
   * The lilies and the reeds, and the rings that spread over the water: over the fish, which swim
   * under them.
   */
  paintPond(p: Painter): void {
    const g = p.ctx;
    const { x, y, rx, ry } = this.plan.pond;
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.clip();
    for (const r of this.ripples) {
      const u = r.age / RIPPLE_SECONDS;
      const size = (6 + u * 34) * r.size;
      g.strokeStyle = css([255, 255, 255], 0.7 * (1 - u) * (1 - u));
      g.lineWidth = 1.6 * (1 - u * 0.6);
      g.beginPath();
      g.ellipse(r.x, r.y, size, size * (ry / rx) * 2.2, 0, 0, TAU);
      g.stroke();
    }
    g.restore();
    for (const l of this.lilies) {
      const pic = this.bank?.sprite('playground', l.name, 0);
      if (!pic) continue;
      const bob = p.calm ? 0 : Math.sin(p.t * 1.1 + l.phase) * 0.7;
      drawPic(g, pic, l.x + Math.sin(p.t * 0.4 + l.phase) * (p.calm ? 0 : 1.2), l.y + bob, { scale: l.scale });
    }
    for (const r of this.reeds) {
      const pic = this.bank?.sprite('playground', r.name, 0);
      if (!pic) continue;
      drawPic(g, pic, r.x, r.y, { scale: r.scale, rot: p.calm ? 0 : Math.sin(p.t * 0.9 + r.phase) * 0.035 });
    }
  }
}
