import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import type { Particles } from '../../engine/particles';

/**
 * What a balloon leaves behind when it goes: a flash, a ring of light, a puff of its colour, scraps
 * of rubber, streaks and glints.
 */

/**
 * A balloon of radius `r` going off at (x, y). `power` is 1 for an ordinary one and more for a
 * bigger moment. The flash is white, the puff and the scraps are the colour of the balloon, and the
 * scraps fly out fast and then fall.
 */
export function popBurst(fx: Particles, rng: Rng, x: number, y: number, color: RGB, r: number, power = 1): void {
  const size = r / 30;
  const hot = lighten(color, 0.5);
  fx.emit({
    x,
    y,
    life: 0.16,
    size: r * 1.1,
    size1: r * 3.4,
    color: COLORS.white,
    color1: hot,
    shape: 'glow',
    alpha: 0.95,
  });
  fx.emit({
    x,
    y,
    life: 0.62,
    size: r * 1.6,
    size1: r * 3.9,
    color,
    color1: hot,
    shape: 'glow',
    alpha: 0.5,
    hold: 0.2,
  });
  fx.emit({ x, y, life: 0.42, size: r * 0.9, size1: r * 3.5, color: hot, shape: 'ring', width: 3.4, alpha: 0.95 });
  for (let i = fx.count(16 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(90, 310) * size * Math.sqrt(power);
    fx.emit({
      x: x + Math.cos(a) * r * 0.45,
      y: y + Math.sin(a) * r * 0.45,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 36,
      life: rng.range(0.8, 1.45),
      size: rng.range(7, 12) * (0.75 + 0.35 * size),
      color: mix(color, COLORS.white, rng.range(0, 0.22)),
      shape: 'confetti',
      gravity: 330,
      drag: 1.4,
      spin: rng.range(-16, 16),
      rot: rng.range(0, TAU),
      hold: 0.5,
    });
  }
  for (let i = fx.count(8 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(190, 380) * size;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.22, 0.4),
      size: rng.range(9, 15),
      color: hot,
      shape: 'streak',
      width: rng.range(1.6, 2.6),
      drag: 3.2,
      alpha: 0.95,
    });
  }
  for (let i = fx.count(6 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(40, 150) * size;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 14,
      life: rng.range(0.5, 0.95),
      size: rng.range(5, 9),
      size1: 1,
      color: lighten(color, 0.72),
      shape: rng.next() < 0.55 ? 'star4' : 'spark',
      drag: 2.2,
      gravity: 40,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/**
 * A few music notes that float up from where a note was sung, the colour of the balloon that sang
 * it.
 */
export function noteDrift(fx: Particles, rng: Rng, x: number, y: number, color: RGB, count = 2): void {
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

/** Confetti that falls from above the screen across its whole width, in the colours it is given. */
export function confettiShower(fx: Particles, rng: Rng, width: number, count: number, colors: readonly RGB[]): void {
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: rng.range(-10, width + 10),
      y: rng.range(-40, -6),
      vx: rng.range(-20, 20),
      vy: rng.range(50, 120),
      life: rng.range(3.2, 5),
      size: rng.range(6, 10),
      color: colors[rng.int(colors.length)]!,
      shape: 'confetti',
      gravity: 14,
      drag: 0.2,
      sway: 50,
      spin: rng.range(-9, 9),
      rot: rng.range(0, TAU),
      hold: 0.8,
      delay: rng.range(0, 0.9),
    });
  }
}

/** A ring of light with a few glints, for a note that is sung without a balloon going off. */
export function ringAt(fx: Particles, rng: Rng, x: number, y: number, color: RGB, size: number): void {
  fx.emit({
    x,
    y,
    life: 0.5,
    size: size * 0.7,
    size1: size * 2.6,
    color: lighten(color, 0.5),
    shape: 'ring',
    width: 2.2,
    alpha: 0.8,
  });
  for (let i = fx.count(5); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(30, 100);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 10,
      life: rng.range(0.5, 0.9),
      size: rng.range(4, 7),
      size1: 1,
      color: lighten(color, 0.6),
      shape: 'star4',
      drag: 2,
      gravity: 26,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/**
 * The colours confetti is made of when nothing else is asked: the rainbow of the notes and white
 * and gold.
 */
export const PARTY_COLORS: readonly RGB[] = [
  [235, 48, 72],
  [255, 132, 28],
  [255, 224, 56],
  [74, 205, 110],
  [52, 140, 255],
  [160, 96, 250],
  [255, 130, 190],
  COLORS.white,
  COLORS.gold,
];
