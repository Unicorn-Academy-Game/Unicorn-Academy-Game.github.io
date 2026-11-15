import type { Rng } from '../../../domain/rng';
import type { Pic } from '../../engine/bank';
import { COLORS, lighten, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { gemImage, pictureOfStone, starImage } from '../../engine/gems';
import type { Particles } from '../../engine/particles';
import { flightOf, GRAVITY, speedFor } from './jets';
import { JEWELS, type Jewel } from './recipes';

/**
 * What the fountain throws about: jewels, the light round them, the splash they make, and the
 * comets friends send.
 */

/** The cut stone of a colour as a picture a particle can be. */
export const stoneOf = (color: RGB): Pic => pictureOfStone(gemImage(color));
const starOf = (color: RGB): Pic => pictureOfStone(starImage(color));

/**
 * One jewel thrown up from a nozzle to a height, with a little to either side so that a column is a
 * bunch and not a thread. Says how long it will be in the air, and how far across it will have
 * gone, for the pool it comes down in.
 */
export function throwJewel(
  fx: Particles,
  rng: Rng,
  jewel: Jewel,
  x: number,
  y: number,
  height: number,
  spread: number,
  grand = 1,
): { flight: number; across: number } {
  const h = height * rng.range(0.8, 1);
  const flight = flightOf(h);
  const vx = rng.range(-1, 1) * spread;
  const star = rng.next() < 0.14;
  fx.emit({
    x: x + rng.range(-2.5, 2.5),
    y,
    vx,
    vy: -speedFor(h),
    life: flight,
    size: rng.range(11, 16) * grand,
    color: jewel.color,
    shape: 'pic',
    pic: star ? starOf(jewel.light) : stoneOf(jewel.color),
    add: false,
    gravity: GRAVITY,
    spin: rng.range(-7, 7),
    rot: rng.range(0, TAU),
    hold: 1,
    trail: rng.next() < 0.3 ? 0.045 : 0,
  });
  return { flight, across: vx * flight };
}

/**
 * The sparkle that comes with a jewel: a glint of its colour that rises with it and goes out as it
 * falls.
 */
export function glint(fx: Particles, rng: Rng, jewel: Jewel, x: number, y: number, height: number): void {
  const h = height * rng.range(0.6, 1);
  fx.emit({
    x: x + rng.range(-5, 5),
    y,
    vx: rng.range(-18, 18),
    vy: -speedFor(h),
    life: flightOf(h) * rng.range(0.6, 0.95),
    size: rng.range(5, 9),
    size1: 1,
    color: jewel.light,
    shape: rng.next() < 0.5 ? 'star4' : 'spark',
    gravity: GRAVITY,
    twinkle: 10,
    hold: 0.4,
  });
}

/** A jewel lands in a pool: a few drops thrown up and a bright point where it went in. */
export function splash(fx: Particles, rng: Rng, x: number, y: number, jewel: Jewel, drops = 3): void {
  fx.emit({
    x,
    y,
    life: 0.22,
    size: 6,
    size1: 18,
    color: COLORS.white,
    color1: jewel.light,
    shape: 'glow',
    alpha: 0.7,
  });
  for (let i = fx.count(drops); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-3, 3),
      y,
      vx: rng.range(-24, 24),
      vy: rng.range(-90, -40),
      life: rng.range(0.3, 0.5),
      size: rng.range(2.4, 4),
      size1: 1,
      color: lighten(jewel.light, 0.35),
      shape: 'dot',
      gravity: 420,
      alpha: 0.9,
    });
  }
}

/** A ring of light that opens round a nozzle when its jet is touched. */
export function pulse(fx: Particles, x: number, y: number, jewel: Jewel, size: number): void {
  fx.emit({
    x,
    y,
    life: 0.2,
    size: size * 0.6,
    size1: size * 1.6,
    color: COLORS.white,
    color1: jewel.light,
    shape: 'glow',
    alpha: 0.85,
  });
  fx.emit({
    x,
    y,
    life: 0.5,
    size: size * 0.5,
    size1: size * 2.4,
    color: jewel.light,
    shape: 'ring',
    width: 2.2,
    alpha: 0.8,
  });
}

/** A burst of glints and light from a point, in colours: for the big gem and the rainbow. */
export function bloomOf(
  fx: Particles,
  rng: Rng,
  x: number,
  y: number,
  colors: readonly RGB[],
  size: number,
  glints: number,
): void {
  fx.emit({
    x,
    y,
    life: 0.3,
    size: size * 0.6,
    size1: size * 2,
    color: COLORS.white,
    color1: colors[0]!,
    shape: 'glow',
    alpha: 0.9,
  });
  for (let i = fx.count(glints); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(50, 190);
    const c = colors[rng.int(colors.length)]!;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 20,
      life: rng.range(0.6, 1.2),
      size: rng.range(5, 10),
      size1: 1,
      color: lighten(c, 0.5),
      shape: i % 2 ? 'star4' : 'spark',
      drag: 1.6,
      gravity: 60,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/**
 * A comet of a friend's colour that goes from her horn to a nozzle: a line of lights, each a moment
 * after the one before.
 */
export function comet(
  fx: Particles,
  rng: Rng,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: RGB,
  seconds = 0.4,
): void {
  const n = fx.count(16);
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const lift = Math.sin(u * Math.PI) * 38;
    fx.emit({
      x: from.x + (to.x - from.x) * u + rng.range(-2, 2),
      y: from.y + (to.y - from.y) * u - lift + rng.range(-2, 2),
      life: rng.range(0.28, 0.5),
      delay: u * seconds,
      size: rng.range(9, 15) * (1 - u * 0.3),
      size1: 1,
      color: lighten(color, 0.4),
      shape: i % 3 === 0 ? 'star4' : 'glow',
      twinkle: 8,
      hold: 0.2,
    });
  }
}

/** Jewels of every colour thrown up in a fan, falling to a line `ground`. For the big gem. */
export function fanOf(fx: Particles, rng: Rng, x: number, y: number, count: number, ground: number, power = 1): void {
  for (let i = fx.count(count); i > 0; i--) {
    const jewel = JEWELS[i % JEWELS.length]!;
    const a = -Math.PI / 2 + rng.range(-1.05, 1.05);
    const speed = rng.range(170, 300) * power;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(1.5, 2.2),
      size: rng.range(13, 20),
      color: jewel.color,
      shape: 'pic',
      pic: stoneOf(jewel.color),
      add: false,
      gravity: GRAVITY * 0.75,
      drag: 0.2,
      spin: rng.range(-8, 8),
      rot: rng.range(0, TAU),
      hold: 0.7,
      floor: ground,
      bounce: 0.3,
    });
  }
}
