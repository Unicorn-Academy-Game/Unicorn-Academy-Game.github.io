import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { gemImage, pictureOfStone } from '../../engine/gems';
import type { Particles } from '../../engine/particles';
import { bloomImage, pictureOfBloom } from './bloom-art';
import { FRUIT_IDS, FRUITS, type Fruit, type Product } from './recipes';

/** What the machine throws about: steam, light, and the stones and flowers it makes. */

/** A puff of steam that rises from the chimney and spreads as it goes. */
export function steam(fx: Particles, rng: Rng, x: number, y: number, power = 1): void {
  for (let i = fx.count(2 + 3 * power); i > 0; i--) {
    fx.emit({
      x: x + rng.range(-5, 5),
      y: y + rng.range(-3, 3),
      vx: rng.range(-10, 16),
      vy: rng.range(-58, -34) * (0.8 + 0.4 * power),
      life: rng.range(1.1, 1.8),
      size: rng.range(10, 15),
      size1: rng.range(32, 50) * (0.8 + 0.3 * power),
      color: [255, 255, 255],
      color1: [236, 232, 252],
      shape: 'glow',
      add: false,
      alpha: 0.5,
      alpha1: 0,
      sway: 16,
      drag: 0.5,
      hold: 0.1,
      delay: rng.range(0, 0.1),
    });
  }
}

/**
 * A ring of light with a few glints that spreads out from a point, for a thing that has happened
 * there.
 */
export function flare(fx: Particles, rng: Rng, x: number, y: number, color: RGB, size: number, glints = 6): void {
  fx.emit({
    x,
    y,
    life: 0.2,
    size: size * 0.6,
    size1: size * 1.8,
    color: COLORS.white,
    color1: lighten(color, 0.5),
    shape: 'glow',
    alpha: 0.9,
  });
  fx.emit({
    x,
    y,
    life: 0.55,
    size: size * 0.7,
    size1: size * 2.7,
    color: lighten(color, 0.5),
    shape: 'ring',
    width: 2.4,
    alpha: 0.85,
  });
  for (let i = fx.count(glints); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(30, 110);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 12,
      life: rng.range(0.5, 0.95),
      size: rng.range(5, 9),
      size1: 1,
      color: lighten(color, 0.55),
      shape: i % 2 ? 'star4' : 'spark',
      drag: 2,
      gravity: 24,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/**
 * The stones or the flowers of a colour, thrown up and falling, as many as `count`. `spread` is how
 * fast they go out.
 */
export function showerOf(
  fx: Particles,
  rng: Rng,
  product: Product,
  x: number,
  y: number,
  count: number,
  spread: number,
  ground: number,
): void {
  for (let i = fx.count(count); i > 0; i--) {
    const fruit = FRUITS[FRUIT_IDS[rng.int(FRUIT_IDS.length)]!]!;
    const a = rng.range(-Math.PI * 0.95, -Math.PI * 0.05);
    const speed = rng.range(0.45, 1) * spread;
    const pic = pieceOf(product, fruit);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(1.5, 2.4),
      size: product === 'gem' ? rng.range(15, 22) : rng.range(20, 28),
      color: fruit.color,
      shape: 'pic',
      pic,
      add: false,
      gravity: 380,
      drag: 0.35,
      spin: rng.range(-6, 6),
      rot: rng.range(0, TAU),
      hold: 0.7,
      floor: ground + rng.range(-6, 8),
      bounce: 0.35,
    });
  }
  // A glitter in the same colours, so what is thrown has light round it.
  for (let i = fx.count(count * 0.6); i > 0; i--) {
    const fruit = FRUITS[FRUIT_IDS[rng.int(FRUIT_IDS.length)]!]!;
    const a = rng.range(0, TAU);
    const speed = rng.range(40, spread);
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 40,
      life: rng.range(0.6, 1.3),
      size: rng.range(6, 11),
      size1: 1,
      color: lighten(fruit.color, 0.5),
      shape: i % 3 ? 'star4' : 'spark',
      drag: 1.8,
      gravity: 90,
      twinkle: 12,
      hold: 0.3,
    });
  }
}

/** One piece of what the machine makes, for a particle. */
function pieceOf(product: Product, fruit: Fruit): ReturnType<typeof pictureOfStone> {
  return product === 'gem' ? pictureOfStone(gemImage(fruit.color)) : pictureOfBloom(bloomImage(fruit));
}

/** A ring of every colour of the rainbow, one inside the next, spreading from a point. */
export function rainbowRing(fx: Particles, x: number, y: number, size: number): void {
  FRUIT_IDS.forEach((id, i) => {
    const color = FRUITS[id].color;
    fx.emit({
      x,
      y,
      life: 0.9 + i * 0.05,
      size: size * (0.3 + i * 0.05),
      size1: size * (1.2 + i * 0.18),
      color: lighten(color, 0.2),
      shape: 'ring',
      width: 5,
      alpha: 0.85,
      hold: 0.2,
      delay: i * 0.03,
    });
  });
}

/** The glitter a fruit leaves behind as it is thrown to the machine. */
export function fruitTrail(fx: Particles, rng: Rng, x: number, y: number, color: RGB, power = 1): void {
  if (rng.next() > 0.7 * power + 0.3) return;
  fx.emit({
    x: x + rng.range(-5, 5),
    y: y + rng.range(-5, 5),
    vx: rng.range(-14, 14),
    vy: rng.range(-20, 10),
    life: rng.range(0.35, 0.6),
    size: rng.range(4, 8),
    size1: 1,
    color: mix(color, COLORS.white, 0.5),
    shape: rng.next() < 0.5 ? 'star4' : 'spark',
    twinkle: 14,
    drag: 1.5,
    hold: 0.2,
  });
}
