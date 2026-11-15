import type { Pic } from './bank';
import { bucket, COLORS, css, type RGB, unbucket } from './color';
import { easeOutQuad, lerp, TAU } from './ease';
import type { Painter } from './painter';
import { GLOWING, makeShape, SHAPES, type Shape } from './shapes';

/**
 * Everything a particle can be told when it is made. Only where it is and how long it lasts are
 * required.
 */
export interface Spec {
  x: number;
  y: number;
  /** Seconds it lives. */
  life: number;
  vx?: number;
  vy?: number;
  /** Width in units at the start and at the end of its life. The end defaults to the start. */
  size?: number;
  size1?: number;
  color?: RGB;
  /** The colour it fades into. The start colour if left out. */
  color1?: RGB;
  alpha?: number;
  alpha1?: number;
  /**
   * The share of its life, from 0 to 1, that it keeps its full brightness before it starts to fade.
   */
  hold?: number;
  shape?: Shape;
  /** Per second, the share of its speed it loses. */
  drag?: number;
  /** Units per second squared, downward. */
  gravity?: number;
  rot?: number;
  /** Turns per second, in radians. */
  spin?: number;
  /** How fast it flickers, in turns per second. 0 is steady. */
  twinkle?: number;
  /** Seconds between the little glows it leaves behind. 0 leaves none. */
  trail?: number;
  /**
   * For a `spark`: the seconds of its own motion drawn behind it as a streak, so a fast spark is
   * long and a slow one is a dot.
   */
  tail?: number;
  /** For a `spark`: how many times its width a faint halo around it is drawn. 0 draws none. */
  halo?: number;
  /** Sideways wander in units per second squared, for things that drift on the air. */
  sway?: number;
  /** Turns its direction of travel by this many radians per second, for spirals and swirls. */
  swirl?: number;
  /** Seconds to wait unseen before it begins. */
  delay?: number;
  /** Seconds to fade in. */
  fadeIn?: number;
  /**
   * Seconds it takes to grow from a bud to its size, so a burst of many opens as points of light
   * and not as one solid mass.
   */
  grow?: number;
  /** Add light to what is behind (true), or cover it (false). Glowing shapes add by default. */
  add?: boolean;
  /** The picture to draw, when the shape is `pic`. */
  pic?: Pic;
  /** Line width of a ring or a streak, and how broad a streamer is when it faces you, in units. */
  width?: number;
  /** A line it bounces off, and how much of its speed it keeps. */
  floor?: number;
  bounce?: number;
  /** A number the game can use to find its own particles again. */
  tag?: number;
}

/** What a game may see of a particle that is alive. */
export interface Live {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly age: number;
  readonly life: number;
  readonly tag: number;
}

class P implements Live {
  wait = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;
  life = 1;
  s0 = 8;
  s1 = 8;
  r0 = 255;
  g0 = 255;
  b0 = 255;
  r1 = 255;
  g1 = 255;
  b1 = 255;
  a0 = 1;
  a1 = 0;
  hold = 0;
  drag = 0;
  grav = 0;
  sway = 0;
  swirl = 0;
  rot = 0;
  spin = 0;
  tw = 0;
  ph = 0;
  trail = 0;
  tail = 0;
  halo = 0;
  tacc = 0;
  fadeIn = 0;
  grow = 0;
  width = 2;
  floor = Infinity;
  bounce = 0.5;
  tag = 0;
  shape: Shape = 'glow';
  add = true;
  pic: Pic | null = null;
}

/** How bright a spark's halo is next to the spark. */
const HALO_STRENGTH = 0.8;

const pictures = new Map<number, HTMLCanvasElement | null>();
const cssByBucket = new Map<number, string>();

/**
 * The picture of a shape in the colour nearest to (r, g, b), made the first time it is asked for.
 */
export function pictureOf(shape: Shape, r: number, g: number, b: number): HTMLCanvasElement | null {
  const key = (SHAPES.indexOf(shape) << 12) | bucket(r, g, b);
  let found = pictures.get(key);
  if (found === undefined) {
    found = makeShape(shape, unbucket(key & 0xfff));
    pictures.set(key, found);
  }
  return found;
}

function colorOf(r: number, g: number, b: number): string {
  const key = bucket(r, g, b);
  let found = cssByBucket.get(key);
  if (found === undefined) {
    found = css(unbucket(key));
    cssByBucket.set(key, found);
  }
  return found;
}

/** Lets go of every picture made for particles. The next game makes the ones it needs again. */
export function forgetShapes(): void {
  pictures.clear();
  cssByBucket.clear();
}

const TRAIL_LIFE = 0.42;
/** How many pieces a streamer is drawn in along its length. */
const RIBBON_STEPS = 8;
/** How big a growing particle is when it is born, as a share of its size. */
const BUD = 0.4;

/**
 * A pool of particles: sparks, glows, hearts, confetti, bubbles. They are made with `emit`, moved
 * with `update` and drawn with `drawSolid` (the ones that cover) and `drawGlow` (the ones that add
 * light). Nothing is allocated while it runs, and when the pool is full the new ones take the
 * places of the old, so a big finale degrades by thinning, never by stalling.
 */
export class Particles {
  private readonly items: P[];
  private n = 0;
  private cursor = 0;
  /** How much of what a game asks for is made: less on a small device and in calm mode. */
  density = 1;
  /** Calm mode steadies every flicker. */
  calm = false;

  constructor(
    readonly capacity = 2600,
    private readonly random: () => number = Math.random,
  ) {
    this.items = Array.from({ length: capacity }, () => new P());
  }

  get alive(): number {
    return this.n;
  }

  /**
   * A count scaled by the density. Never 0 for a count that was asked for, so a single spark still
   * shows.
   */
  count(n: number): number {
    return n <= 0 ? 0 : Math.max(1, Math.round(n * this.density));
  }

  clear(): void {
    this.n = 0;
  }

  /** Looks at each live particle, for a game that reacts to them and for tests. */
  each(fn: (p: Live) => void): void {
    for (let i = 0; i < this.n; i++) fn(this.items[i]!);
  }

  /**
   * Moves every particle, for a game that puts its world back where it started and does not want
   * what is in the air to stay behind.
   */
  shift(dx: number, dy = 0): void {
    for (let i = 0; i < this.n; i++) {
      const p = this.items[i]!;
      p.x += dx;
      p.y += dy;
      if (p.floor !== Infinity) p.floor += dy;
    }
  }

  clearTag(tag: number): void {
    for (let i = this.n - 1; i >= 0; i--) {
      if (this.items[i]!.tag === tag) this.remove(i);
    }
  }

  emit(s: Spec): void {
    let p: P;
    if (this.n < this.capacity) {
      p = this.items[this.n]!;
      this.n++;
    } else {
      // The pool is full: the next one in turn gives up its place.
      this.cursor = (this.cursor + 1) % this.capacity;
      p = this.items[this.cursor]!;
    }
    const shape = s.shape ?? 'glow';
    const c0 = s.color ?? COLORS.white;
    const c1 = s.color1 ?? c0;
    p.wait = s.delay ?? 0;
    p.x = s.x;
    p.y = s.y;
    p.vx = s.vx ?? 0;
    p.vy = s.vy ?? 0;
    p.age = 0;
    p.life = Math.max(0.016, s.life);
    p.s0 = s.size ?? 8;
    p.s1 = s.size1 ?? p.s0;
    p.r0 = c0[0];
    p.g0 = c0[1];
    p.b0 = c0[2];
    p.r1 = c1[0];
    p.g1 = c1[1];
    p.b1 = c1[2];
    p.a0 = s.alpha ?? 1;
    p.a1 = s.alpha1 ?? 0;
    p.hold = s.hold ?? 0;
    p.drag = s.drag ?? 0;
    p.grav = s.gravity ?? 0;
    p.sway = s.sway ?? 0;
    p.swirl = s.swirl ?? 0;
    p.rot = s.rot ?? 0;
    p.spin = s.spin ?? 0;
    p.tw = s.twinkle ?? 0;
    p.ph = this.random() * TAU;
    p.trail = s.trail ?? 0;
    p.tail = s.tail ?? 0;
    p.halo = s.halo ?? 0;
    p.tacc = 0;
    p.fadeIn = s.fadeIn ?? 0;
    p.grow = s.grow ?? 0;
    p.width = s.width ?? 2;
    p.floor = s.floor ?? Infinity;
    p.bounce = s.bounce ?? 0.5;
    p.tag = s.tag ?? 0;
    p.shape = shape;
    p.add = s.add ?? GLOWING.has(shape);
    p.pic = s.pic ?? null;
  }

  private remove(i: number): void {
    const last = this.n - 1;
    const gone = this.items[i]!;
    this.items[i] = this.items[last]!;
    this.items[last] = gone;
    this.n = last;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; ) {
      const p = this.items[i]!;
      if (p.wait > 0) {
        p.wait -= dt;
        i++;
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        this.remove(i);
        continue;
      }
      if (p.swirl !== 0) {
        const a = p.swirl * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const vx = p.vx * c - p.vy * s;
        p.vy = p.vx * s + p.vy * c;
        p.vx = vx;
      }
      if (p.drag !== 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      if (p.sway !== 0) p.vx += Math.sin(p.ph + p.age * 3.1) * p.sway * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor) {
        p.y = p.floor;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.82;
        p.spin *= 0.6;
        if (Math.abs(p.vy) < 14) p.vy = 0;
      }
      p.rot += p.spin * dt;
      if (p.trail > 0) {
        p.tacc += dt;
        while (p.tacc >= p.trail) {
          p.tacc -= p.trail;
          // A trail is a nicety. When the pool is full it is the first thing to go.
          if (this.n >= this.capacity) continue;
          const size = lerp(p.s0, p.s1, p.age / p.life);
          this.emit({
            x: p.x,
            y: p.y,
            life: TRAIL_LIFE * (this.calm ? 0.7 : 1),
            size: size * 0.8,
            size1: 0,
            color: [p.r0, p.g0, p.b0],
            color1: [p.r1, p.g1, p.b1],
            alpha: 0.55,
            alpha1: 0,
            shape: 'glow',
          });
        }
      }
      i++;
    }
  }

  /** Draws the particles that cover what is behind them: confetti, hearts, bubbles, petals. */
  drawSolid(painter: Painter): void {
    this.draw(painter.ctx, painter.t, false);
  }

  /** Draws the particles that add light: sparks, glows, twinkles. They go on the light sheet. */
  drawGlow(painter: Painter): void {
    this.draw(painter.light, painter.t, true);
  }

  /**
   * The streak behind a fast particle: as long as its speed carries it in `tail` seconds, and no
   * longer than is pretty.
   */
  private drawTail(g: CanvasRenderingContext2D, p: P, size: number, r: number, gg: number, b: number): void {
    const speed = Math.hypot(p.vx, p.vy);
    const length = Math.min(speed * p.tail, size * 9);
    if (length < size * 0.9) return;
    const img = pictureOf('tail', r, gg, b);
    if (!img) return;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(Math.atan2(p.vy, p.vx));
    g.drawImage(img, -length, -size * 0.55, length, size * 1.1);
    g.restore();
  }

  private draw(g: CanvasRenderingContext2D, now: number, additive: boolean): void {
    const was = g.globalCompositeOperation;
    g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    const calmness = this.calm ? 0.12 : 0.34;
    for (let i = 0; i < this.n; i++) {
      const p = this.items[i]!;
      if (p.wait > 0 || p.add !== additive) continue;
      const t = p.age / p.life;
      let alpha = p.hold > 0 ? lerp(p.a0, p.a1, t <= p.hold ? 0 : (t - p.hold) / (1 - p.hold)) : lerp(p.a0, p.a1, t);
      if (p.fadeIn > 0 && p.age < p.fadeIn) alpha *= p.age / p.fadeIn;
      if (p.tw > 0) alpha *= 1 - calmness + calmness * Math.sin(p.ph + now * p.tw * TAU);
      if (alpha <= 0.004) continue;
      let size = lerp(p.s0, p.s1, t);
      // A bud opens quickly at first and then settles at its size.
      if (p.grow > 0 && p.age < p.grow) size *= BUD + (1 - BUD) * easeOutQuad(p.age / p.grow);
      if (size <= 0.05) continue;
      const r = lerp(p.r0, p.r1, t);
      const gg = lerp(p.g0, p.g1, t);
      const b = lerp(p.b0, p.b1, t);
      g.globalAlpha = Math.min(alpha, 1);
      switch (p.shape) {
        case 'glow':
        case 'spark':
        case 'dot':
        case 'bubble': {
          const img = pictureOf(p.shape, r, gg, b);
          if (p.tail > 0) this.drawTail(g, p, size, r, gg, b);
          if (p.halo > 0) {
            const glow = pictureOf('halo', r, gg, b);
            if (glow) {
              const wide = size * p.halo;
              g.globalAlpha = Math.min(alpha, 1) * HALO_STRENGTH;
              g.drawImage(glow, p.x - wide / 2, p.y - wide / 2, wide, wide);
              g.globalAlpha = Math.min(alpha, 1);
            }
          }
          if (img) g.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
          break;
        }
        case 'pic': {
          const pic = p.pic;
          if (!pic) break;
          const k = size / pic.sw;
          g.save();
          g.translate(p.x, p.y);
          if (p.rot !== 0) g.rotate(p.rot);
          g.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, -pic.ax * k, -pic.ay * k, pic.sw * k, pic.sh * k);
          g.restore();
          break;
        }
        case 'streak': {
          // A line along where it is going, long when it is fast.
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(size * 2.6, sp * 0.06 + size * 0.6);
          g.strokeStyle = colorOf(r, gg, b);
          g.lineWidth = Math.max(0.8, p.width);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          g.stroke();
          break;
        }
        case 'ring': {
          g.strokeStyle = colorOf(r, gg, b);
          g.lineWidth = Math.max(0.8, p.width * (1 - t * 0.6));
          g.beginPath();
          g.arc(p.x, p.y, size / 2, 0, TAU);
          g.stroke();
          break;
        }
        case 'ribbon': {
          // A streamer: `size` long and `width` across, rippling along its length and twisting as
          // it tumbles, so it is broad where it faces you and a thread where it is edge on.
          const wave = p.ph + p.age * 6;
          const half = size / 2;
          const across = Math.max(1, p.width) / 2;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = colorOf(r, gg, b);
          g.beginPath();
          for (let i = 0; i <= RIBBON_STEPS; i++) {
            const u = i / RIBBON_STEPS;
            const y =
              Math.sin(wave + u * 7) * size * 0.1 - across * (0.25 + 0.75 * Math.abs(Math.cos(wave * 0.7 + u * 4)));
            if (i === 0) g.moveTo(-half, y);
            else g.lineTo(-half + u * size, y);
          }
          for (let i = RIBBON_STEPS; i >= 0; i--) {
            const u = i / RIBBON_STEPS;
            g.lineTo(
              -half + u * size,
              Math.sin(wave + u * 7) * size * 0.1 + across * (0.25 + 0.75 * Math.abs(Math.cos(wave * 0.7 + u * 4))),
            );
          }
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        case 'confetti': {
          // A flat scrap tumbling: its height shrinks and grows as it turns over.
          const flip = 0.15 + Math.abs(Math.cos(p.ph + p.age * 7.5));
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = colorOf(r, gg, b);
          g.fillRect(-size / 2, -size * 0.32 * flip, size, size * 0.64 * flip);
          g.restore();
          break;
        }
        case 'butterfly': {
          const img = pictureOf('butterfly', r, gg, b);
          if (!img) break;
          const flap = 0.25 + 0.75 * Math.abs(Math.sin(p.ph + p.age * 15));
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.drawImage(img, (-size * flap) / 2, -size / 2, size * flap, size);
          g.restore();
          break;
        }
        default: {
          // Star, heart, petal, note, flake and leaf: a picture that may be turned.
          const img = pictureOf(p.shape, r, gg, b);
          if (!img) break;
          if (p.rot === 0) {
            g.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
          } else {
            g.save();
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.drawImage(img, -size / 2, -size / 2, size, size);
            g.restore();
          }
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = was;
  }
}
