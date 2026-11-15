import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import type { Particles } from '../../engine/particles';

/**
 * What a bubble leaves behind when it goes, and the other small spectacles of the garden: a splash,
 * a shower of glints, hearts.
 */

/** The pale blue of water and of the droplets of a bubble. */
const DROP: RGB = [196, 230, 255];

/**
 * A bubble of radius `r` going off at (x, y). A bright ring leaves the skin, a second one in the
 * colour of the prize, and a spray of droplets and tiny bubbles flies out and falls. `power` is 1
 * for an ordinary one and more for a bigger moment.
 */
export function popBubble(fx: Particles, rng: Rng, x: number, y: number, color: RGB, r: number, power = 1): void {
  const size = r / 27;
  const hot = lighten(color, 0.55);
  fx.emit({ x, y, life: 0.14, size: r * 1.5, size1: r * 2.5, color: COLORS.white, shape: 'glow', alpha: 0.55 });
  fx.emit({
    x,
    y,
    life: 0.32,
    size: r * 1.7,
    size1: r * 2.5,
    color: COLORS.white,
    shape: 'ring',
    width: 2.4,
    alpha: 0.95,
  });
  fx.emit({
    x,
    y,
    life: 0.55,
    size: r * 1.5,
    size1: r * 3.4,
    color: hot,
    color1: color,
    shape: 'ring',
    width: 4,
    alpha: 0.6,
    hold: 0.2,
  });
  for (let i = fx.count(13 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(70, 220) * Math.sqrt(size * power);
    fx.emit({
      x: x + Math.cos(a) * r * 0.8,
      y: y + Math.sin(a) * r * 0.8,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 28,
      life: rng.range(0.55, 1.1),
      size: rng.range(3.5, 7.5) * (0.8 + 0.3 * size),
      color: mix(DROP, COLORS.white, rng.range(0, 0.5)),
      shape: 'bubble',
      add: false,
      gravity: 190,
      drag: 1.5,
      alpha: 0.95,
      hold: 0.55,
    });
  }
  for (let i = fx.count(6 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(30, 120) * size;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 12,
      life: rng.range(0.5, 0.95),
      size: rng.range(5, 9),
      size1: 1,
      color: hot,
      shape: rng.next() < 0.5 ? 'star4' : 'spark',
      drag: 2.2,
      gravity: 30,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/**
 * A few tiny bubbles that leave the ring of the machine as the player blows, to the right and up.
 */
export function sprayAt(fx: Particles, rng: Rng, x: number, y: number, count = 1): void {
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-5, 5),
      y: y + rng.range(-3, 3),
      vx: rng.range(6, 38),
      vy: -rng.range(26, 70),
      life: rng.range(0.7, 1.3),
      size: rng.range(2.4, 5),
      color: mix(DROP, COLORS.white, rng.range(0, 0.5)),
      shape: 'bubble',
      add: false,
      drag: 0.8,
      gravity: -12,
      alpha: 0.9,
      hold: 0.5,
    });
  }
}

/** Water thrown up where something lands in it or leaps out of it. */
export function splashAt(fx: Particles, rng: Rng, x: number, y: number, size = 1): void {
  for (let i = fx.count(10 * size); i > 0; i--) {
    const a = rng.range(-Math.PI * 0.88, -Math.PI * 0.12);
    const speed = rng.range(50, 130) * Math.sqrt(size);
    fx.emit({
      x: x + rng.range(-5, 5) * size,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.5, 0.9),
      size: rng.range(2.6, 5.2),
      color: mix(DROP, COLORS.white, rng.range(0, 0.6)),
      shape: 'bubble',
      add: false,
      gravity: 330,
      drag: 0.4,
      alpha: 0.95,
      hold: 0.6,
    });
  }
  for (let i = fx.count(3 * size); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-8, 8),
      y: y - 2,
      vx: rng.range(-20, 20),
      vy: rng.range(-90, -40),
      life: rng.range(0.4, 0.7),
      size: rng.range(4, 7),
      size1: 1,
      color: COLORS.white,
      shape: 'spark',
      drag: 1.4,
      gravity: 120,
      twinkle: 10,
      hold: 0.3,
    });
  }
}

/** A shower of glints in this colour from a point: the sign that something good happened there. */
export function glintsAt(fx: Particles, rng: Rng, x: number, y: number, color: RGB, count: number, reach = 1): void {
  for (let i = fx.count(count); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(24, 110) * reach;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 16,
      life: rng.range(0.6, 1.2),
      size: rng.range(5, 10),
      size1: 1,
      color: lighten(color, rng.range(0.3, 0.7)),
      shape: rng.next() < 0.45 ? 'star4' : 'spark',
      drag: 1.8,
      gravity: 28,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/** A few hearts that float up from a point, the colour they are given. */
export function heartsRise(fx: Particles, rng: Rng, x: number, y: number, color: RGB, count = 5): void {
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-10, 10),
      y: y + rng.range(-4, 6),
      vx: rng.range(-12, 12),
      vy: rng.range(-58, -30),
      life: rng.range(1.2, 1.9),
      size: rng.range(10, 17),
      color: lighten(color, rng.range(0, 0.35)),
      shape: 'heart',
      sway: 24,
      drag: 0.4,
      alpha: 0.95,
      hold: 0.45,
      rot: rng.range(-0.3, 0.3),
      delay: rng.range(0, 0.25),
    });
  }
}

/** A few music notes that float up from a point, the colour they are given. */
export function notesRise(fx: Particles, rng: Rng, x: number, y: number, color: RGB, count = 2): void {
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-8, 8),
      y: y - 4,
      vx: rng.range(-14, 14),
      vy: rng.range(-62, -36),
      life: rng.range(1.1, 1.7),
      size: rng.range(14, 19),
      color: lighten(color, 0.2),
      shape: 'note',
      sway: 22,
      drag: 0.4,
      alpha: 0.95,
      hold: 0.35,
      rot: rng.range(-0.3, 0.3),
    });
  }
}

/** Petals that come down slowly from a point and sway as they come. */
export function petalsFall(fx: Particles, rng: Rng, x: number, y: number, width: number, count: number): void {
  const tones: readonly RGB[] = [
    [255, 190, 214],
    [255, 214, 228],
    [255, 170, 200],
  ];
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-width, width),
      y: y + rng.range(-8, 8),
      vx: rng.range(-6, 14),
      vy: rng.range(10, 22),
      life: rng.range(5, 8),
      size: rng.range(5, 8),
      color: tones[rng.int(tones.length)]!,
      shape: 'petal',
      sway: 24,
      spin: rng.range(-2, 2),
      rot: rng.range(0, TAU),
      alpha: 0.9,
      hold: 0.8,
      add: false,
    });
  }
}
