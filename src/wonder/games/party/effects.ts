import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import type { Particles } from '../../engine/particles';
import { PARTY_COLORS } from '../balloons/pops';
import type { Mouth } from './cannons';

/**
 * How far more toward the middle of the floor than the barrel points a cannon throws, in radians.
 */
const THROW = 0.32;

/**
 * What the party throws about: a cannon's confetti and streamers, glitter where the friends dance,
 * paper where the pinata is hit.
 */

/**
 * A cannon goes off. A flash at the mouth, a cloud of confetti thrown along the barrel and out
 * across the floor, streamers that twist as they fly, and glitter that comes after. `colors` are
 * the cannon's own; some white and gold is always mixed in.
 */
export function cannonShot(fx: Particles, rng: Rng, m: Mouth, colors: readonly RGB[], power = 1): void {
  const { x, y } = m;
  // The barrel points up and a little in. The shot goes in further than that, so the paper comes
  // down over the floor.
  const aim = m.angle + Math.sign(Math.cos(m.angle)) * THROW;
  fx.emit({
    x,
    y,
    life: 0.16,
    size: m.width * 0.9,
    size1: m.width * 3.2,
    color: COLORS.white,
    color1: colors[0]!,
    shape: 'glow',
    alpha: 0.95,
  });
  fx.emit({
    x,
    y,
    life: 0.7,
    size: m.width * 1.2,
    size1: m.width * 3.8,
    color: colors[1 % colors.length]!,
    color1: colors[0]!,
    shape: 'glow',
    alpha: 0.35,
    hold: 0.15,
  });
  fx.emit({
    x,
    y,
    life: 0.4,
    size: m.width * 0.6,
    size1: m.width * 2.8,
    color: lighten(colors[0]!, 0.5),
    shape: 'ring',
    width: 3.2,
    alpha: 0.9,
  });
  // Confetti, in the cannon's colours and some bright ones, thrown along the barrel with a spread,
  // some faster than others.
  for (let i = fx.count(62 * power); i > 0; i--) {
    const a = aim + rng.range(-0.4, 0.4);
    const speed = rng.range(300, 860) * (0.8 + 0.2 * power);
    const c = rng.next() < 0.7 ? colors[rng.int(colors.length)]! : PARTY_COLORS[rng.int(PARTY_COLORS.length)]!;
    fx.emit({
      x: x + Math.cos(a) * 4,
      y: y + Math.sin(a) * 4,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(2.4, 3.8),
      size: rng.range(6, 11),
      color: mix(c, COLORS.white, rng.range(0, 0.2)),
      shape: 'confetti',
      gravity: 150,
      drag: 1.3,
      sway: 40,
      spin: rng.range(-12, 12),
      rot: rng.range(0, TAU),
      hold: 0.65,
      delay: rng.range(0, 0.05),
    });
  }
  // Streamers: long thin ribbons that unwind as they go.
  for (let i = fx.count(9 * power); i > 0; i--) {
    const a = aim + rng.range(-0.3, 0.3);
    const speed = rng.range(300, 640);
    const c = colors[rng.int(colors.length)]!;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(2.2, 3.2),
      size: rng.range(46, 100),
      width: rng.range(5, 8),
      color: lighten(c, rng.range(0, 0.2)),
      shape: 'ribbon',
      gravity: 120,
      drag: 1.9,
      sway: 30,
      spin: rng.range(-5, 5),
      rot: rng.range(0, TAU),
      hold: 0.7,
    });
  }
  // Sparks that fly out ahead of the cloud.
  for (let i = fx.count(16 * power); i > 0; i--) {
    const a = aim + rng.range(-0.5, 0.5);
    const speed = rng.range(250, 700);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.5, 1),
      size: rng.range(4, 7),
      size1: 1,
      color: lighten(colors[rng.int(colors.length)]!, 0.55),
      shape: 'spark',
      tail: 0.08,
      drag: 2.2,
      gravity: 90,
      twinkle: 10,
      hold: 0.3,
    });
  }
}

/**
 * A friend is touched. A ring of her colour spreads from her middle and stars of her magic spring
 * up from her back, so she is seen to have heard. Nothing is laid over her body: the light on her
 * comes from the floor.
 */
export function dancerPop(
  fx: Particles,
  rng: Rng,
  x: number,
  y: number,
  colors: readonly RGB[],
  flash: RGB,
  scale: number,
  first: boolean,
): void {
  const r = 34 * scale;
  fx.emit({
    x,
    y,
    life: 0.5,
    size: r,
    size1: r * (first ? 3.2 : 2.4),
    color: lighten(flash, 0.35),
    shape: 'ring',
    width: 2.6,
    alpha: 0.8,
  });
  if (first)
    fx.emit({
      x,
      y,
      life: 0.8,
      size: r * 0.6,
      size1: r * 4.4,
      color: flash,
      shape: 'ring',
      width: 3.4,
      alpha: 0.5,
      hold: 0.2,
    });
  for (let i = fx.count(first ? 18 : 10); i > 0; i--) {
    const a = -Math.PI / 2 + rng.range(-1.1, 1.1);
    const speed = rng.range(70, 210);
    fx.emit({
      x: x + rng.range(-24, 24) * scale,
      y: y - rng.range(10, 34) * scale,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.9, 1.5),
      size: rng.range(9, 15),
      size1: 4,
      color: lighten(colors[i % colors.length]!, rng.range(0, 0.3)),
      shape: i % 4 === 0 ? 'heart' : 'star5',
      add: false,
      gravity: 150,
      drag: 1.2,
      spin: rng.range(-5, 5),
      rot: rng.range(0, TAU),
      hold: 0.5,
    });
  }
}

/** Glitter that rises from a friend's hooves as she dances, in the colours of her own magic. */
export function danceSparkle(
  fx: Particles,
  rng: Rng,
  x: number,
  y: number,
  colors: readonly RGB[],
  scale: number,
  power = 1,
): void {
  for (let i = fx.count(3 * power); i > 0; i--) {
    const c = lighten(colors[rng.int(colors.length)]!, rng.range(0.1, 0.5));
    fx.emit({
      x: x + rng.range(-34, 34) * scale,
      y: y - rng.range(0, 6),
      vx: rng.range(-16, 16),
      vy: rng.range(-70, -30),
      life: rng.range(0.7, 1.2),
      size: rng.range(4, 8),
      size1: 1,
      color: c,
      shape: rng.next() < 0.4 ? 'star4' : 'spark',
      tail: 0.06,
      drag: 1.4,
      gravity: -6,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/** A knock on the pinata: a few scraps of its paper fly off, away from the hit. */
export function paperBits(fx: Particles, rng: Rng, x: number, y: number, push: 1 | -1, colors: readonly RGB[]): void {
  fx.emit({ x, y, life: 0.2, size: 24, size1: 70, color: COLORS.white, shape: 'glow', alpha: 0.7 });
  for (let i = fx.count(10); i > 0; i--) {
    const a = -Math.PI / 2 + push * rng.range(0.1, 1.5);
    const speed = rng.range(90, 260);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.9, 1.6),
      size: rng.range(6, 10),
      color: colors[rng.int(colors.length)]!,
      shape: 'confetti',
      gravity: 420,
      drag: 1.1,
      spin: rng.range(-14, 14),
      rot: rng.range(0, TAU),
      hold: 0.6,
    });
  }
}

/** The pinata bursts: a bang of light and a cloud of paper, with the sweets coming out after. */
export function pinataBang(fx: Particles, rng: Rng, x: number, y: number, colors: readonly RGB[]): void {
  fx.emit({ x, y, life: 0.2, size: 50, size1: 240, color: COLORS.white, color1: COLORS.gold, shape: 'glow', alpha: 1 });
  fx.emit({
    x,
    y,
    life: 0.7,
    size: 40,
    size1: 220,
    color: COLORS.gold,
    color1: colors[0]!,
    shape: 'glow',
    alpha: 0.5,
    hold: 0.2,
  });
  fx.emit({
    x,
    y,
    life: 0.55,
    size: 30,
    size1: 190,
    color: lighten(colors[0]!, 0.5),
    shape: 'ring',
    width: 4.2,
    alpha: 0.95,
  });
  fx.emit({ x, y, life: 0.8, size: 20, size1: 270, color: COLORS.white, shape: 'ring', width: 2.4, alpha: 0.6 });
  for (let i = fx.count(80); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(100, 480);
    fx.emit({
      x: x + Math.cos(a) * 14,
      y: y + Math.sin(a) * 14,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 70,
      life: rng.range(1.8, 3),
      size: rng.range(6, 12),
      color: colors[rng.int(colors.length)]!,
      shape: 'confetti',
      gravity: 300,
      drag: 1.5,
      sway: 36,
      spin: rng.range(-14, 14),
      rot: rng.range(0, TAU),
      hold: 0.65,
    });
  }
  for (let i = fx.count(14); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(160, 440);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(0.4, 0.8),
      size: rng.range(10, 16),
      color: lighten(colors[rng.int(colors.length)]!, 0.5),
      shape: 'streak',
      width: rng.range(1.6, 2.6),
      drag: 3,
      alpha: 0.95,
    });
  }
}

/** Confetti that comes down over a stretch of the world, from above the top of it. */
export function confettiOver(
  fx: Particles,
  rng: Rng,
  x0: number,
  width: number,
  top: number,
  count: number,
  colors: readonly RGB[],
): void {
  for (let i = fx.count(count); i > 0; i--) {
    fx.emit({
      x: x0 + rng.range(0, width),
      y: top - rng.range(10, 60),
      vx: rng.range(-24, 24),
      vy: rng.range(50, 130),
      life: rng.range(3.4, 5.2),
      size: rng.range(6, 11),
      color: colors[rng.int(colors.length)]!,
      shape: rng.next() < 0.2 ? 'ribbon' : 'confetti',
      width: 5,
      gravity: 16,
      drag: 0.2,
      sway: 50,
      spin: rng.range(-9, 9),
      rot: rng.range(0, TAU),
      hold: 0.8,
      delay: rng.range(0, 0.9),
    });
  }
}

/**
 * A lantern by the road pops as the parade comes by: a flash and a fountain of confetti thrown up.
 */
export function lanternPop(fx: Particles, rng: Rng, x: number, y: number): void {
  fx.emit({
    x,
    y,
    life: 0.24,
    size: 24,
    size1: 110,
    color: COLORS.white,
    color1: [255, 190, 100],
    shape: 'glow',
    alpha: 0.95,
  });
  for (let i = fx.count(30); i > 0; i--) {
    const a = -Math.PI / 2 + rng.range(-0.7, 0.7);
    const speed = rng.range(140, 380);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(1.6, 2.6),
      size: rng.range(6, 10),
      color: PARTY_COLORS[rng.int(PARTY_COLORS.length)]!,
      shape: 'confetti',
      gravity: 280,
      drag: 1.2,
      sway: 30,
      spin: rng.range(-12, 12),
      rot: rng.range(0, TAU),
      hold: 0.6,
    });
  }
}
