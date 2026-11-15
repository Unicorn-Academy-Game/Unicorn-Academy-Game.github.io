import type { Rng } from '../../../domain/rng';
import type { SpriteBank } from '../../engine/bank';
import { COLORS, css, lighten, RAINBOW, type RGB } from '../../engine/color';
import { clamp, smooth, TAU } from '../../engine/ease';
import { gemImage, pictureOfStone } from '../../engine/gems';
import type { Particles } from '../../engine/particles';
import { pictureSized } from './icons';
import type { Prize } from './kinds';
import { PRIZE } from './kinds';
import type { Plan } from './layout';
import { GEMS } from './looks';
import { glintsAt, heartsRise, notesRise } from './pops';

/**
 * The surprises that are a moment and then gone: a star, a heart, a note, a gem. Each is let out of
 * its bubble in its own way. They are drawn as particles that cover what is behind them rather than
 * add to it, so they show against a bright daytime sky.
 */

/** A golden star is let out, turns as it rises, and goes out in a little burst of stars. */
export function starMoment(fx: Particles, rng: Rng, x: number, y: number): void {
  const gold = PRIZE.star.color;
  fx.emit({
    x,
    y,
    vx: rng.range(-8, 8),
    vy: -64,
    life: 1.15,
    size: 8,
    size1: 34,
    color: gold,
    shape: 'star5',
    add: false,
    spin: rng.range(-3, 3),
    rot: rng.range(0, TAU),
    drag: 1.2,
    alpha: 1,
    hold: 0.7,
    trail: 0.05,
  });
  for (let i = fx.count(7); i > 0; i--) {
    const a = rng.range(0, TAU);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * rng.range(30, 80),
      vy: Math.sin(a) * rng.range(30, 80) - 20,
      life: rng.range(0.7, 1.1),
      size: rng.range(7, 12),
      size1: 2,
      color: lighten(gold, rng.range(0, 0.4)),
      shape: 'star5',
      add: false,
      spin: rng.range(-4, 4),
      drag: 1.6,
      gravity: 30,
      hold: 0.4,
      delay: rng.range(0, 0.1),
    });
  }
  glintsAt(fx, rng, x, y, gold, 10, 1.2);
}

/** Hearts float up from the bubble, one a good deal bigger than the rest. */
export function heartMoment(fx: Particles, rng: Rng, x: number, y: number): void {
  const pink = PRIZE.heart.color;
  fx.emit({
    x,
    y,
    vx: rng.range(-6, 6),
    vy: -34,
    life: 1.8,
    size: 10,
    size1: 40,
    color: pink,
    shape: 'heart',
    add: false,
    sway: 18,
    drag: 0.5,
    alpha: 0.95,
    hold: 0.55,
    rot: rng.range(-0.2, 0.2),
  });
  heartsRise(fx, rng, x, y, pink, 5);
}

/** Music notes float up from the bubble. */
export function noteMoment(fx: Particles, rng: Rng, x: number, y: number): void {
  notesRise(fx, rng, x, y, PRIZE.note.color, 3);
  glintsAt(fx, rng, x, y, PRIZE.note.color, 5, 0.7);
}

/**
 * A gem falls from the bubble, bounces on the grass, lies glittering a moment and goes out like a
 * star.
 */
export function gemMoment(fx: Particles, rng: Rng, x: number, y: number, floor: number, look: number): void {
  const color = GEMS[look % GEMS.length]!;
  const pic = pictureOfStone(gemImage(color));
  fx.emit({
    x,
    y,
    vx: rng.range(-24, 24),
    vy: -90,
    life: 3.4,
    size: 24,
    shape: 'pic',
    pic,
    add: false,
    gravity: 560,
    floor,
    bounce: 0.45,
    rot: rng.range(-0.3, 0.3),
    spin: rng.range(-2, 2),
    drag: 0.1,
    alpha: 1,
    alpha1: 0,
    hold: 0.7,
  });
  glintsAt(fx, rng, x, y, color, 8, 1);
}

/**
 * A friend's bubble goes, and her magic comes out of it: a flash in her colour, two rings, stars of
 * her colours flying out, hearts rising.
 */
export function friendBurst(
  fx: Particles,
  rng: Rng,
  x: number,
  y: number,
  colors: readonly RGB[],
  flash: RGB,
  r: number,
): void {
  fx.emit({
    x,
    y,
    life: 0.2,
    size: r * 1.4,
    size1: r * 3.2,
    color: COLORS.white,
    color1: flash,
    shape: 'glow',
    alpha: 0.8,
  });
  fx.emit({
    x,
    y,
    life: 0.45,
    size: r * 0.9,
    size1: r * 3,
    color: lighten(flash, 0.35),
    shape: 'ring',
    width: 3.4,
    alpha: 0.95,
  });
  fx.emit({
    x,
    y,
    life: 0.7,
    size: r * 0.6,
    size1: r * 4,
    color: flash,
    shape: 'ring',
    width: 5,
    alpha: 0.6,
    hold: 0.2,
  });
  for (let i = fx.count(26); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(80, 260);
    fx.emit({
      x: x + Math.cos(a) * r * 0.5,
      y: y + Math.sin(a) * r * 0.5,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 36,
      life: rng.range(1.1, 1.9),
      size: rng.range(13, 22),
      size1: 6,
      color: lighten(colors[i % colors.length]!, rng.range(0, 0.25)),
      shape: i % 4 === 0 ? 'heart' : 'star5',
      add: false,
      gravity: 110,
      drag: 1.1,
      spin: rng.range(-5, 5),
      rot: rng.range(0, TAU),
      hold: 0.55,
      trail: 0.06,
    });
  }
  glintsAt(fx, rng, x, y, flash, 8, 1.4);
}

/**
 * A prize that was inside the great bubble flies out of it from where it was, away from the middle,
 * in its own picture, and falls and fades. The ones that are drawn in code fly as the shape they
 * are.
 */
export function prizeFlies(
  fx: Particles,
  rng: Rng,
  bank: SpriteBank | null,
  prize: Prize,
  look: number,
  at: { readonly x: number; readonly y: number },
  from: { readonly x: number; readonly y: number },
): void {
  const a = Math.atan2(at.y - from.y, at.x - from.x) + rng.range(-0.35, 0.35);
  const speed = rng.range(120, 250);
  const flight = {
    x: at.x,
    y: at.y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed - 70,
    life: rng.range(2, 2.8),
    gravity: 150,
    drag: 0.5,
    add: false,
    alpha: 1,
    alpha1: 0,
    hold: 0.6,
    spin: rng.range(-1.5, 1.5),
    rot: rng.range(-0.3, 0.3),
  } as const;
  const sized = pictureSized(bank, prize, look, 22);
  if (sized) {
    fx.emit({ ...flight, shape: 'pic', pic: sized.pic, size: sized.size });
    return;
  }
  if (prize === 'gem') {
    fx.emit({ ...flight, shape: 'pic', pic: pictureOfStone(gemImage(GEMS[look % GEMS.length]!)), size: 26 });
    return;
  }
  const color = PRIZE[prize].color;
  fx.emit({ ...flight, shape: prize === 'star' ? 'star5' : prize === 'heart' ? 'heart' : 'note', color, size: 26 });
}

const RAINBOW_GROW = 1.5;
const RAINBOW_HOLD = 6;
const RAINBOW_FADE = 2.5;

/**
 * How a rainbow looks: how big it is next to the one the plan draws, how bright, and whether its
 * colours run the other way, as the fainter bow outside a double rainbow does.
 */
export interface RainbowLook {
  readonly size?: number;
  readonly alpha?: number;
  readonly flip?: boolean;
  /** How long it hangs there once it has grown, in seconds. */
  readonly hold?: number;
}

/**
 * The rainbow prize: an arc of colour that grows across the sky from one foot to the other, hangs
 * there, and fades.
 */
export class Rainbow {
  age = 0;
  /** How many of its notes have been rung. */
  rung = 0;
  readonly size: number;
  readonly alpha: number;
  readonly flip: boolean;
  private readonly hold: number;

  constructor(look: RainbowLook = {}) {
    this.size = look.size ?? 1;
    this.alpha = look.alpha ?? 1;
    this.flip = look.flip ?? false;
    this.hold = look.hold ?? RAINBOW_HOLD;
  }

  get done(): boolean {
    return this.age >= RAINBOW_GROW + this.hold + RAINBOW_FADE;
  }

  /** How much of the arc is drawn, 0 to 1. */
  get grown(): number {
    return smooth(this.age / RAINBOW_GROW);
  }

  update(dt: number): void {
    this.age += dt;
  }

  /**
   * The arc, behind the hills' front edge and the meadow: seven bands, outermost red (or violet,
   * for the fainter bow).
   */
  paint(g: CanvasRenderingContext2D, plan: Plan): void {
    const { x0, x1, baseY, top } = plan.rainbow;
    const fade = this.age < RAINBOW_GROW + this.hold ? 1 : 1 - (this.age - RAINBOW_GROW - this.hold) / RAINBOW_FADE;
    if (fade <= 0) return;
    const cx = (x0 + x1) / 2;
    const rx = ((x1 - x0) / 2) * this.size;
    const ry = (baseY - top) * this.size;
    const band = clamp(rx * 0.028, 4, 9);
    const grown = this.grown;
    g.save();
    g.lineCap = 'round';
    g.globalAlpha = clamp(fade) * 0.82 * this.alpha;
    const colors = this.flip ? [...RAINBOW].reverse() : RAINBOW;
    colors.forEach((c, i) => {
      const inset = i * band * 0.96;
      g.strokeStyle = css(lighten(c, 0.12));
      g.lineWidth = band;
      g.beginPath();
      // From the left foot, over the top, as far as it has grown.
      g.ellipse(cx, baseY, rx - inset, ry - inset * (ry / rx), 0, Math.PI, Math.PI + Math.PI * grown);
      g.stroke();
    });
    // A pale light inside the arc.
    g.globalAlpha = clamp(fade) * 0.12 * grown * this.alpha;
    g.fillStyle = css(COLORS.white);
    g.beginPath();
    g.ellipse(cx, baseY, rx - band * 7, ry - band * 7 * (ry / rx), 0, Math.PI, Math.PI + Math.PI * grown);
    g.fill();
    g.restore();
  }

  /**
   * The point on the middle of the arc a way along it, for a sparkle that travels with the growing
   * end.
   */
  tip(plan: Plan): { x: number; y: number } {
    const { x0, x1, baseY, top } = plan.rainbow;
    const a = Math.PI + Math.PI * this.grown;
    return {
      x: (x0 + x1) / 2 + Math.cos(a) * ((x1 - x0) / 2) * this.size,
      y: baseY + Math.sin(a) * (baseY - top) * this.size,
    };
  }
}
