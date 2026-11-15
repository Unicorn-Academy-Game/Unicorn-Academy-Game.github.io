import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, RAINBOW, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import type { Particles } from '../../engine/particles';
import { scaleNote } from '../../music';
import type { WonderSound } from '../../sound';
import type { Palette } from './palette';
import type { CloudKind } from './world';

/** What the climb lets its effects do to the whole screen. */
export interface Feel {
  shake(amount: number): void;
  flash(amount: number, color?: RGB): void;
}

/**
 * What every effect of the game is made from: the particles, the sound, the dice, and what an
 * effect may do to the screen.
 */
export interface Craft {
  readonly fx: Particles;
  readonly sound: WonderSound;
  readonly rng: Rng;
  readonly feel: Feel;
  readonly palette: Palette;
  /**
   * Where a place in the world is across the screen, as -1 to 1, so a sound comes from the side it
   * happens on.
   */
  readonly pan: (x: number) => number;
}

const CREAM: RGB = [255, 250, 240];
const PINK: RGB = [255, 150, 196];
const HEART: RGB = [255, 108, 160];
const GOLD = COLORS.gold;

/**
 * What the climb looks and sounds like when something happens in it: a leap, a landing, a star, a
 * friend, a cloud that has a surprise in it. Each is a burst of particles and a sound together, so
 * a thing always has both and the two always match. Everything is in world units.
 */
export class Show {
  private readonly fx: Particles;
  private readonly sound: WonderSound;
  private readonly rng: Rng;
  private readonly feel: Feel;
  private readonly palette: Palette;
  private readonly pan: (x: number) => number;

  constructor(craft: Craft) {
    this.fx = craft.fx;
    this.sound = craft.sound;
    this.rng = craft.rng;
    this.feel = craft.feel;
    this.palette = craft.palette;
    this.pan = craft.pan;
  }

  private accent(i: number): RGB {
    return this.palette.accents[i % this.palette.accents.length]!;
  }

  /**
   * She leaves a cloud. `step` is how far up the scale the cloud she is going to is, so the spring
   * of it is higher the higher she goes.
   */
  takeoff(x: number, y: number, step: number, far: boolean): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('boing', { pitch: -2 + step * 0.6, size: far ? 0.8 : 0.45, gain: 0.5, pan });
    if (far) this.sound.fx('whoosh', { gain: 0.3, size: 0.4, pan });
    for (let i = 0; i < fx.count(far ? 9 : 6); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      fx.emit({
        x: x + side * rng.range(2, 22),
        y: y - 2,
        vx: side * rng.range(14, 60),
        vy: -rng.range(4, 34),
        life: rng.range(0.4, 0.7),
        size: rng.range(14, 22),
        size1: 4,
        color: CREAM,
        alpha: 0.85,
        shape: 'dot',
        drag: 2.4,
        hold: 0.1,
      });
    }
    fx.emit({ x, y, life: 0.4, size: 14, size1: 70, color: COLORS.white, shape: 'ring', width: 2.4, alpha: 0.8 });
    for (let i = 0; i < fx.count(far ? 8 : 4); i++) {
      const a = -Math.PI / 2 + rng.range(-1.1, 1.1);
      const sp = rng.range(40, 110);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.35, 0.7),
        size: rng.range(7, 12),
        size1: 1.5,
        color: lighten(this.accent(i), 0.4),
        color1: this.accent(i),
        shape: 'spark',
        drag: 2.4,
        twinkle: 9,
      });
    }
  }

  /** She comes down on a cloud. */
  landing(
    kind: CloudKind,
    step: number,
    x: number,
    y: number,
    fresh: boolean,
    combo: number,
    height: boolean,
    force: number,
  ): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.note(this.palette.voice, scaleNote(60, step), { pan, gain: fresh ? 0.95 : 0.78 });
    if (fresh) this.sound.note('chime', scaleNote(72, step), { pan, gain: 0.26, delay: 0.05 });
    this.sound.fx('pop', { gain: 0.16, pan, size: 0.2 });
    for (let i = 0; i < fx.count(5 + Math.round(5 * force)); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      fx.emit({
        x: x + side * rng.range(4, 26),
        y: y - 2,
        vx: side * rng.range(20, 80),
        vy: -rng.range(6, 40),
        life: rng.range(0.45, 0.8),
        size: rng.range(14, 24),
        size1: 4,
        color: CREAM,
        alpha: 0.9,
        shape: 'dot',
        drag: 2.2,
        hold: 0.1,
      });
    }
    fx.emit({ x, y, life: 0.45, size: 18, size1: 84, color: COLORS.white, shape: 'ring', width: 2.6, alpha: 0.85 });
    if (fresh) {
      for (let i = 0; i < fx.count(6); i++) {
        const a = -Math.PI / 2 + rng.range(-1.3, 1.3);
        const sp = rng.range(50, 130);
        fx.emit({
          x,
          y: y - 4,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rng.range(0.45, 0.85),
          size: rng.range(8, 13),
          size1: 1.5,
          color: lighten(this.accent(i), 0.4),
          color1: this.accent(i),
          shape: i % 3 === 0 ? 'star4' : 'spark',
          drag: 2.2,
          twinkle: 9,
          hold: 0.2,
        });
      }
    }
    if (height) {
      this.sound.fx('twinkle', { size: 0.5, gain: 0.35, pan, delay: 0.08 });
      fx.emit({ x, y: y - 10, life: 0.7, size: 24, size1: 130, color: GOLD, shape: 'ring', width: 2.4, alpha: 0.7 });
    }
    if (combo >= 3) {
      this.sound.fx('ding', { step: Math.min(7, combo - 3), gain: 0.5, pan, delay: 0.1 });
      fx.emit({
        x,
        y: y - 20,
        life: 0.6,
        size: 20,
        size1: 140,
        color: lighten(GOLD, 0.3),
        shape: 'ring',
        width: 3,
        alpha: 0.8,
      });
    }
    this.surprise(kind, x, y, step, fresh);
  }

  /** What a cloud with something in it does when she lands. */
  private surprise(kind: CloudKind, x: number, y: number, step: number, fresh: boolean): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    switch (kind) {
      case 'jelly': {
        this.sound.fx('boing', { pitch: 7, size: 0.7, gain: 0.55, pan });
        for (let i = 0; i < fx.count(9); i++) {
          fx.emit({
            x: x + rng.range(-30, 30),
            y: y - 6,
            vx: rng.range(-30, 30),
            vy: -rng.range(50, 120),
            life: rng.range(0.9, 1.5),
            size: rng.range(12, 26),
            size1: 14,
            color: [226, 200, 255],
            alpha: 0.9,
            shape: 'bubble',
            drag: 1.1,
            sway: 16,
            hold: 0.3,
          });
        }
        break;
      }
      case 'heart': {
        for (const [i, n] of [0, 2, 4].entries())
          this.sound.note('bell', scaleNote(67, n + (step % 3)), { delay: i * 0.07, gain: 0.55, pan });
        for (let i = 0; i < fx.count(7); i++) {
          fx.emit({
            x: x + rng.range(-34, 34),
            y: y - 20,
            vx: rng.range(-16, 16),
            vy: -rng.range(34, 76),
            life: rng.range(1.1, 1.7),
            size: rng.range(24, 36),
            size1: 18,
            color: i % 2 === 0 ? HEART : PINK,
            alpha: 0.95,
            shape: 'heart',
            drag: 0.8,
            sway: 18,
            hold: 0.45,
            rot: rng.range(-0.3, 0.3),
          });
        }
        break;
      }
      case 'music': {
        for (let i = 0; i < 4; i++)
          this.sound.note('marimba', scaleNote(67, i * 2 + (step % 2)), { delay: i * 0.06, gain: 0.6, pan });
        for (let i = 0; i < fx.count(6); i++) {
          const c = RAINBOW[(i * 2) % RAINBOW.length]!;
          fx.emit({
            x: x + rng.range(-34, 34),
            y: y - 22,
            vx: rng.range(-24, 24),
            vy: -rng.range(40, 90),
            life: rng.range(1.1, 1.7),
            size: rng.range(22, 32),
            size1: 18,
            color: lighten(c, 0.25),
            alpha: 0.95,
            shape: 'note',
            drag: 0.9,
            sway: 22,
            hold: 0.45,
            rot: rng.range(-0.4, 0.4),
          });
        }
        break;
      }
      case 'sleepy': {
        if (!fresh) break;
        this.sound.fx('poof', { gain: 0.5, pan });
        this.sound.note('flute', scaleNote(72, 4), { gain: 0.5, pan, delay: 0.05 });
        this.sound.note('flute', scaleNote(72, 6), { gain: 0.5, pan, delay: 0.17 });
        for (let i = 0; i < fx.count(10); i++) {
          const a = rng.range(0, TAU);
          fx.emit({
            x,
            y: y - 14,
            vx: Math.cos(a) * rng.range(30, 90),
            vy: Math.sin(a) * rng.range(30, 80) - 20,
            life: rng.range(0.6, 1),
            size: rng.range(10, 16),
            size1: 2,
            color: [214, 226, 255],
            shape: i % 2 === 0 ? 'star4' : 'spark',
            drag: 2.2,
            twinkle: 8,
          });
        }
        break;
      }
      case 'rainbow': {
        for (let i = 0; i < 7; i++) this.sound.note('harp', scaleNote(64, i), { delay: i * 0.045, gain: 0.55, pan });
        for (let i = 0; i < fx.count(24); i++) {
          const c = RAINBOW[i % RAINBOW.length]!;
          const a = -Math.PI * (0.1 + 0.8 * (i / 24));
          const sp = rng.range(110, 190);
          fx.emit({
            x,
            y: y - 8,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: rng.range(0.7, 1.2),
            size: rng.range(9, 14),
            size1: 2,
            color: lighten(c, 0.3),
            color1: c,
            shape: 'spark',
            drag: 1.8,
            gravity: 90,
            twinkle: 8,
            halo: 3,
          });
        }
        break;
      }
      case 'star': {
        this.sound.fx('twinkle', { size: 0.9, gain: 0.7, pan });
        this.sound.fx('star', { step: step % 5, gain: 0.5, pan, delay: 0.08 });
        for (let i = 0; i < fx.count(7); i++) {
          fx.emit({
            x: x + rng.range(-70, 70),
            y: y - rng.range(110, 170),
            vx: rng.range(-12, 12),
            vy: rng.range(10, 50),
            life: rng.range(1, 1.5),
            size: rng.range(24, 34),
            size1: 16,
            color: GOLD,
            alpha: 0.95,
            shape: 'star5',
            gravity: 70,
            hold: 0.5,
            spin: rng.range(-2, 2),
            rot: rng.range(0, TAU),
            twinkle: 2,
          });
        }
        for (let i = 0; i < fx.count(12); i++) {
          const a = rng.range(0, TAU);
          fx.emit({
            x,
            y: y - 20,
            vx: Math.cos(a) * rng.range(40, 120),
            vy: Math.sin(a) * rng.range(40, 120) - 30,
            life: rng.range(0.6, 1.1),
            size: rng.range(8, 14),
            size1: 1.5,
            color: lighten(GOLD, 0.5),
            color1: GOLD,
            shape: 'star4',
            drag: 2,
            twinkle: 9,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * A star out of the air. `run` is how many she has gathered one after another, so a row of them
   * is a scale.
   */
  star(x: number, y: number, run: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.note('bell', scaleNote(72, run % 12), { pan, gain: 0.72 });
    this.sound.note('chime', scaleNote(84, run % 12), { pan, gain: 0.2, delay: 0.04 });
    for (let i = 0; i < fx.count(8); i++) {
      const a = rng.range(0, TAU);
      const sp = rng.range(40, 120);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: rng.range(0.35, 0.7),
        size: rng.range(6, 11),
        size1: 1,
        color: lighten(GOLD, 0.6),
        color1: GOLD,
        shape: i % 3 === 0 ? 'star4' : 'spark',
        drag: 2.6,
        twinkle: 10,
      });
    }
    fx.emit({
      x,
      y,
      life: 0.3,
      size: 14,
      size1: 52,
      color: lighten(GOLD, 0.5),
      shape: 'ring',
      width: 2.2,
      alpha: 0.85,
    });
  }

  /** She has found a friend. */
  join(x: number, y: number, index: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('cheer', { gain: 0.5, pan });
    for (const [i, n] of [0, 2, 4, 7].entries())
      this.sound.note('bell', scaleNote(67 + (index % 2) * 2, n), { delay: 0.04 + i * 0.075, gain: 0.8, pan });
    for (let i = 0; i < fx.count(14); i++) {
      const a = (i / 14) * TAU;
      const sp = rng.range(90, 170);
      fx.emit({
        x,
        y: y - 30,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: rng.range(1, 1.6),
        size: rng.range(24, 36),
        size1: 16,
        color: i % 2 === 0 ? HEART : PINK,
        alpha: 0.95,
        shape: 'heart',
        drag: 1.7,
        gravity: -10,
        hold: 0.45,
        rot: rng.range(-0.3, 0.3),
      });
    }
    for (let i = 0; i < fx.count(16); i++) {
      const a = rng.range(0, TAU);
      fx.emit({
        x,
        y: y - 30,
        vx: Math.cos(a) * rng.range(60, 190),
        vy: Math.sin(a) * rng.range(60, 190),
        life: rng.range(0.7, 1.2),
        size: rng.range(9, 15),
        size1: 1.5,
        color: lighten(GOLD, 0.5),
        color1: GOLD,
        shape: 'star4',
        drag: 2,
        twinkle: 9,
      });
    }
    fx.emit({ x, y: y - 30, life: 0.8, size: 30, size1: 240, color: GOLD, shape: 'ring', width: 3.4, alpha: 0.85 });
    this.feel.flash(0.1, GOLD);
  }

  /**
   * She comes out of the door into the moon sky: a ring of light round her, and rainbow-coloured
   * sparks thrown out in every direction.
   */
  arrive(x: number, y: number): void {
    const { fx, rng } = this;
    this.sound.fx('whoosh', { gain: 0.8, size: 1 });
    this.sound.fx('twinkle', { size: 1, gain: 0.9 });
    for (let i = 0; i < fx.count(36); i++) {
      const a = (i / 36) * TAU + rng.range(-0.1, 0.1);
      const sp = rng.range(110, 330);
      const c = RAINBOW[i % 7]!;
      fx.emit({
        x,
        y: y - 40,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.8, 1.5),
        size: rng.range(9, 16),
        size1: 1.5,
        color: lighten(c, 0.4),
        color1: c,
        shape: i % 3 === 0 ? 'star4' : 'spark',
        drag: 1.6,
        twinkle: 9,
        halo: 3,
      });
    }
    fx.emit({
      x,
      y: y - 40,
      life: 0.9,
      size: 40,
      size1: 420,
      color: COLORS.white,
      shape: 'ring',
      width: 5,
      alpha: 0.85,
    });
    this.feel.flash(0.14, GOLD);
  }

  /**
   * A touch that there was nowhere to go for: the sky answers it anyway, with a sparkle where the
   * finger is.
   */
  answer(x: number, y: number, step: number): void {
    const { fx, rng } = this;
    this.sound.note(this.palette.voice, scaleNote(72, step), { pan: this.pan(x), gain: 0.5 });
    for (let i = 0; i < fx.count(7); i++) {
      const a = rng.range(0, TAU);
      const sp = rng.range(20, 70);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.4, 0.8),
        size: rng.range(7, 12),
        size1: 1,
        color: lighten(this.accent(i), 0.4),
        color1: this.accent(i),
        shape: i % 2 === 0 ? 'star4' : 'spark',
        drag: 2.2,
        twinkle: 9,
      });
    }
    fx.emit({ x, y, life: 0.4, size: 10, size1: 56, color: COLORS.white, shape: 'ring', width: 2, alpha: 0.7 });
  }

  /** A sparkle that is left behind as she goes. */
  trail(x: number, y: number, color: RGB, size: number): void {
    const { rng } = this;
    this.fx.emit({
      x: x + rng.range(-5, 5),
      y: y + rng.range(-5, 5),
      vx: rng.range(-12, 12),
      vy: rng.range(-6, 14),
      life: rng.range(0.45, 0.8),
      size: rng.range(size * 0.7, size),
      size1: 1.5,
      color: lighten(color, 0.45),
      color1: color,
      shape: rng.next() < 0.2 ? 'star4' : 'spark',
      drag: 1.4,
      twinkle: 8,
      hold: 0.15,
    });
  }
}
