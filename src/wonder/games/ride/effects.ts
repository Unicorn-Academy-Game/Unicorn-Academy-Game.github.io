import type { Rng } from '../../../domain/rng';
import { COLORS, lighten, RAINBOW, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { gemImage, pictureOfStone } from '../../engine/gems';
import type { Particles } from '../../engine/particles';
import { scaleNote } from '../../music';
import type { WonderSound } from '../../sound';

/** What the game lets its effects do to the whole screen. */
export interface Feel {
  shake(amount: number): void;
  flash(amount: number, color?: RGB): void;
}

/** The colours of the jewels that fly, as light as the ones in the pool. */
const JEWELS: readonly RGB[] = [...RAINBOW, COLORS.pink, COLORS.white];

/**
 * What the ride looks and sounds like when something happens in it: a leap, a landing, a star, a
 * hoop, a splash. Each is a burst of particles and a sound together, so a thing always has both and
 * the two always match. Everything is in world units.
 */
export class Effects {
  constructor(
    private readonly fx: Particles,
    private readonly sound: WonderSound,
    private readonly rng: Rng,
    private readonly feel: Feel,
    /**
     * Where a place in the world is across the screen, as -1 to 1, so a sound comes from the side
     * it happens on.
     */
    private readonly pan: (x: number) => number,
  ) {}

  /** She leaves the rainbow: a first leap from it, or a second step off the air. */
  leap(kind: 1 | 2, x: number, y: number, vx: number): void {
    const { fx, rng } = this;
    this.sound.fx('boing', { pitch: kind === 1 ? 2 : 9, size: 0.5, gain: 0.7 });
    for (let i = 0; i < fx.count(kind === 1 ? 7 : 11); i++) {
      const c = RAINBOW[(i + (kind === 2 ? 3 : 0)) % RAINBOW.length]!;
      const a = (kind === 1 ? -Math.PI / 2 : Math.PI / 2) + (i / 8 - 0.5) * 2.2;
      const sp = rng.range(30, 90);
      fx.emit({
        x: x + rng.range(-10, 10),
        y,
        vx: Math.cos(a) * sp - vx * 0.15,
        vy: Math.sin(a) * sp * 0.6,
        life: rng.range(0.35, 0.7),
        size: rng.range(8, 13),
        size1: 2,
        color: lighten(c, 0.45),
        color1: c,
        shape: 'spark',
        drag: 2.4,
        twinkle: 9,
      });
    }
    if (kind === 2) {
      // The puff of light she steps off.
      fx.emit({
        x,
        y: y + 6,
        life: 0.55,
        size: 20,
        size1: 64,
        color: COLORS.white,
        shape: 'ring',
        width: 3,
        alpha: 0.75,
      });
      fx.emit({ x, y: y + 6, life: 0.5, size: 40, size1: 80, color: COLORS.pink, shape: 'glow', alpha: 0.5 });
    }
  }

  /** She comes down onto the rainbow. `force` is how hard, from 0 to 1. */
  landing(force: number, x: number, y: number, vx: number): void {
    const { fx, rng } = this;
    if (force > 0.12) this.sound.fx('thud', { size: force, gain: 0.45 + 0.4 * force });
    const n = fx.count(4 + Math.round(10 * force));
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const c = RAINBOW[i % RAINBOW.length]!;
      fx.emit({
        x,
        y,
        vx: side * rng.range(20, 90) + vx * 0.2,
        vy: -rng.range(10, 60),
        life: rng.range(0.3, 0.6),
        size: rng.range(7, 12),
        size1: 2,
        color: lighten(c, 0.5),
        color1: c,
        shape: 'spark',
        drag: 2.8,
        gravity: 80,
        twinkle: 8,
      });
    }
    if (force > 0.45) this.feel.shake(0.8 * force);
  }

  /** She runs over the top of a hill fast enough to leave it. */
  crest(): void {
    this.sound.fx('whoosh', { gain: 0.5, size: 0.5 });
  }

  /** A star or a jewel is gathered. `step` is how far up the scale its note is. */
  star(x: number, y: number, gem: boolean, step: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    // The notes of a run of stars go up the scale and come back down it, so a long run is a tune.
    this.sound.note(gem ? 'glass' : 'bell', scaleNote(gem ? 72 : 67, step), { pan, gain: gem ? 0.9 : 0.75 });
    if (gem) this.sound.fx('coin', { step: step % 5, gain: 0.5, pan });
    const color = gem ? COLORS.rose : COLORS.gold;
    for (let i = 0; i < fx.count(gem ? 12 : 7); i++) {
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
        color: lighten(color, 0.6),
        color1: color,
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
      size1: 48,
      color: lighten(color, 0.5),
      shape: 'ring',
      width: 2.2,
      alpha: 0.8,
    });
  }

  /** All of a group of stars gathered: a bell, and a ring of light that opens around her. */
  group(x: number, y: number, step: number): void {
    const { fx } = this;
    this.sound.fx('ding', { step, gain: 0.8 });
    for (let i = 0; i < fx.count(18); i++) {
      const a = (i / 18) * TAU;
      const c = RAINBOW[i % RAINBOW.length]!;
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * 130,
        vy: Math.sin(a) * 130,
        life: 0.8,
        size: 11,
        size1: 2,
        color: lighten(c, 0.4),
        color1: c,
        shape: i % 2 === 0 ? 'star4' : 'spark',
        drag: 2.2,
        twinkle: 9,
        hold: 0.3,
      });
    }
    fx.emit({ x, y, life: 0.7, size: 30, size1: 190, color: COLORS.white, shape: 'ring', width: 3.2, alpha: 0.9 });
    this.feel.flash(0.12, COLORS.gold);
  }

  /** Twelve stars in a row. */
  streak(x: number, y: number): void {
    this.sound.fx('twinkle', { size: 1, gain: 0.7 });
    this.fx.emit({ x, y, life: 0.6, size: 20, size1: 150, color: COLORS.gold, shape: 'ring', width: 3, alpha: 0.8 });
  }

  /** She goes through a ring: it bursts. `step` is how high its chord is. */
  hoop(x: number, y: number, radius: number, vx: number, step: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('whoosh', { gain: 0.85, size: 0.8, pan });
    for (const [i, n] of [0, 4, 7].entries())
      this.sound.note('glass', scaleNote(67, n + 2 + step), { delay: i * 0.055, gain: 0.7, pan });
    for (let i = 0; i < fx.count(22); i++) {
      const a = (i / 22) * TAU;
      const c = RAINBOW[i % RAINBOW.length]!;
      const sp = rng.range(90, 170);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp * 0.35 + vx * 0.3,
        vy: Math.sin(a) * sp,
        life: rng.range(0.5, 0.9),
        size: rng.range(8, 13),
        size1: 2,
        color: lighten(c, 0.4),
        color1: c,
        shape: 'spark',
        drag: 2.2,
        twinkle: 9,
        halo: 3,
      });
    }
    fx.emit({
      x,
      y,
      life: 0.6,
      size: radius * 0.6,
      size1: radius * 2.8,
      color: COLORS.gold,
      shape: 'ring',
      width: 4,
      alpha: 0.9,
    });
    this.feel.flash(0.16, COLORS.gold);
    this.feel.shake(1.1);
  }

  /** She starts into the loop. */
  loopIn(x: number, y: number): void {
    this.sound.fx('whistle', { gain: 0.7 });
    this.fx.emit({ x, y, life: 0.6, size: 30, size1: 170, color: COLORS.white, shape: 'ring', width: 3, alpha: 0.7 });
    this.feel.flash(0.1, COLORS.white);
  }

  /** She is upside down at the top of it: stars fly out all round. */
  loopTop(x: number, y: number): void {
    const { fx, rng } = this;
    this.sound.fx('twinkle', { size: 1, gain: 0.85 });
    this.sound.note('bell', scaleNote(79, 2), { gain: 0.8 });
    this.sound.note('bell', scaleNote(79, 4), { gain: 0.8, delay: 0.09 });
    for (let i = 0; i < fx.count(26); i++) {
      const a = (i / 26) * TAU + rng.range(-0.1, 0.1);
      const c = RAINBOW[i % RAINBOW.length]!;
      const sp = rng.range(110, 230);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.7, 1.2),
        size: rng.range(10, 17),
        size1: 2,
        color: lighten(c, 0.35),
        color1: c,
        shape: i % 2 === 0 ? 'star5' : 'star4',
        drag: 1.8,
        twinkle: 8,
        spin: rng.range(-3, 3),
        rot: rng.range(0, TAU),
      });
    }
    fx.emit({ x, y, life: 0.8, size: 40, size1: 330, color: COLORS.gold, shape: 'ring', width: 4, alpha: 0.85 });
    this.feel.flash(0.18, COLORS.gold);
  }

  /** She comes out of the loop. */
  loopOut(): void {
    this.sound.fx('whoosh', { gain: 0.7, size: 0.8 });
  }

  /** She leaves the end of the rainbow and flies. */
  launch(x: number, y: number, angle: number): void {
    const { fx, rng } = this;
    this.sound.fx('launch', { gain: 0.75 });
    this.sound.fx('boing', { pitch: 5, size: 1, gain: 0.8 });
    for (let i = 0; i < fx.count(40); i++) {
      const a = angle + Math.PI + rng.range(-0.9, 0.9);
      const c = RAINBOW[i % RAINBOW.length]!;
      const sp = rng.range(120, 360);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.6, 1.1),
        size: rng.range(9, 16),
        size1: 2,
        color: lighten(c, 0.4),
        color1: c,
        shape: 'spark',
        drag: 2,
        twinkle: 9,
        halo: 3,
        tail: 0.04,
      });
    }
    fx.emit({ x, y, life: 0.7, size: 40, size1: 260, color: COLORS.white, shape: 'ring', width: 5, alpha: 0.9 });
    fx.emit({ x, y, life: 0.8, size: 120, size1: 280, color: COLORS.gold, shape: 'glow', alpha: 0.55 });
    this.feel.flash(0.28, COLORS.gold);
    this.feel.shake(2.2);
  }

  /**
   * She flies through one of the stars that hang across the sky. `step` goes up the first half of
   * the flight and down the second.
   */
  skyStar(x: number, y: number, step: number): void {
    const { fx, rng } = this;
    this.sound.note('bell', scaleNote(72, step), { pan: this.pan(x), gain: 0.8 });
    this.sound.note('chime', scaleNote(84, step), { pan: this.pan(x), gain: 0.4 });
    for (let i = 0; i < fx.count(10); i++) {
      const a = rng.range(0, TAU);
      const sp = rng.range(50, 150);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.45, 0.9),
        size: rng.range(7, 13),
        size1: 1,
        color: lighten(COLORS.gold, 0.5),
        color1: COLORS.gold,
        shape: i % 2 === 0 ? 'star4' : 'spark',
        drag: 2.2,
        twinkle: 10,
      });
    }
    fx.emit({ x, y, life: 0.4, size: 16, size1: 80, color: COLORS.white, shape: 'ring', width: 2.4, alpha: 0.85 });
  }

  /**
   * Someone lands in the pool: jewels fly up out of it and fall back, and drops of water, and a
   * note that is higher for each one who comes after. `size` is from 0 to 1, and the leader's is
   * the biggest.
   */
  splash(x: number, surface: number, size: number, index: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('splash', { size, pan, gain: 0.55 + 0.4 * size });
    this.sound.note('glass', scaleNote(72, 1 + index * 2), { pan, gain: 0.85 });
    this.sound.note('bell', scaleNote(84, index * 2), { pan, gain: 0.5, delay: 0.07 });
    const gems = fx.count(Math.round(9 + 16 * size));
    for (let i = 0; i < gems; i++) {
      const color = JEWELS[rng.int(JEWELS.length)]!;
      fx.emit({
        x: x + rng.range(-30, 30),
        y: surface,
        vx: rng.range(-170, 170) * (0.6 + 0.6 * size),
        vy: -rng.range(260, 520) * (0.7 + 0.5 * size),
        life: rng.range(1.2, 1.9),
        size: rng.range(14, 24),
        shape: 'pic',
        pic: pictureOfStone(gemImage(lighten(color, 0.1))),
        gravity: 900,
        rot: rng.range(0, TAU),
        spin: rng.range(-6, 6),
        floor: surface + 14,
        bounce: 0.32,
        hold: 0.65,
        add: false,
      });
    }
    for (let i = 0; i < fx.count(Math.round(14 + 14 * size)); i++) {
      const a = -Math.PI / 2 + rng.range(-1.1, 1.1);
      const sp = rng.range(120, 360) * (0.6 + 0.6 * size);
      fx.emit({
        x,
        y: surface,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.5, 1),
        size: rng.range(4, 9),
        size1: 2,
        color: [235, 250, 255],
        color1: [160, 220, 250],
        shape: 'dot',
        gravity: 760,
        alpha: 0.9,
        drag: 0.2,
        add: false,
        floor: surface + 6,
        bounce: 0.1,
      });
    }
    fx.emit({
      x,
      y: surface,
      life: 0.55,
      size: 40,
      size1: 220 * (0.6 + 0.6 * size),
      color: COLORS.white,
      shape: 'glow',
      alpha: 0.5,
    });
    if (index === 0) {
      this.feel.flash(0.22, COLORS.white);
      this.feel.shake(2.6);
    } else this.feel.shake(0.9 * size);
  }

  /**
   * A shower of jewels and confetti from the top of the view, falling into the pool. `from` and
   * `to` are the sides of where it falls.
   */
  shower(from: number, to: number, top: number, surface: number, amount: number): void {
    const { fx, rng } = this;
    for (let i = 0; i < fx.count(amount); i++) {
      const color = JEWELS[rng.int(JEWELS.length)]!;
      const confetti = i % 3 !== 0;
      fx.emit(
        confetti
          ? {
              x: rng.range(from, to),
              y: top - rng.range(0, 140),
              vx: rng.range(-30, 30),
              vy: rng.range(60, 140),
              life: rng.range(2.2, 3.4),
              size: rng.range(9, 15),
              color,
              shape: 'confetti',
              spin: rng.range(-5, 5),
              rot: rng.range(0, TAU),
              sway: rng.range(20, 60),
              gravity: 40,
              drag: 0.4,
              add: false,
              hold: 0.8,
            }
          : {
              x: rng.range(from, to),
              y: top - rng.range(0, 140),
              vx: rng.range(-20, 20),
              vy: rng.range(80, 180),
              life: rng.range(2.4, 3.2),
              size: rng.range(15, 24),
              shape: 'pic',
              pic: pictureOfStone(gemImage(lighten(color, 0.1))),
              gravity: 120,
              rot: rng.range(0, TAU),
              spin: rng.range(-3, 3),
              floor: surface + 12,
              bounce: 0.3,
              hold: 0.8,
              add: false,
            },
      );
    }
  }

  /** Everyone is in the pool and the rainbow is whole. */
  cheer(x: number, y: number): void {
    const { fx, rng } = this;
    this.sound.fx('cheer', { size: 1, gain: 0.9 });
    this.sound.fx('swell', { size: 1 });
    this.sound.fx('twinkle', { size: 1, delay: 0.4 });
    for (let i = 0; i < fx.count(40); i++) {
      const a = rng.range(Math.PI * 1.05, Math.PI * 1.95);
      const c = RAINBOW[i % RAINBOW.length]!;
      const sp = rng.range(160, 420);
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.9, 1.6),
        size: rng.range(10, 18),
        size1: 2,
        color: lighten(c, 0.35),
        color1: c,
        shape: i % 2 === 0 ? 'star5' : 'spark',
        drag: 1.1,
        gravity: 150,
        twinkle: 7,
        spin: rng.range(-3, 3),
        rot: rng.range(0, TAU),
        halo: 3,
      });
    }
    this.feel.flash(0.25, COLORS.white);
  }

  /**
   * A tap in the pool: jewels jump out of the water with a ring and two notes. `step` is how far
   * across the pool the tap is.
   */
  tapWater(x: number, surface: number, step: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('splash', { size: 0.5, pan, gain: 0.55 });
    this.sound.note('glass', scaleNote(72, step), { pan, gain: 0.85 });
    this.sound.note('bell', scaleNote(84, step + 2), { pan, gain: 0.5, delay: 0.08 });
    for (let i = 0; i < fx.count(9); i++) {
      const color = JEWELS[rng.int(JEWELS.length)]!;
      fx.emit({
        x: x + rng.range(-16, 16),
        y: surface,
        vx: rng.range(-130, 130),
        vy: -rng.range(420, 760),
        life: rng.range(1.3, 1.9),
        size: rng.range(20, 32),
        shape: 'pic',
        pic: pictureOfStone(gemImage(lighten(color, 0.1))),
        gravity: 900,
        rot: rng.range(0, TAU),
        spin: rng.range(-7, 7),
        floor: surface + 14,
        bounce: 0.3,
        hold: 0.7,
        add: false,
      });
    }
    for (let i = 0; i < fx.count(16); i++) {
      const a = -Math.PI / 2 + rng.range(-1, 1);
      const sp = rng.range(120, 340);
      fx.emit({
        x,
        y: surface,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(0.45, 0.9),
        size: rng.range(4, 9),
        size1: 2,
        color: [235, 250, 255],
        color1: [160, 220, 250],
        shape: 'dot',
        gravity: 760,
        alpha: 0.9,
        add: false,
        floor: surface + 6,
        bounce: 0.1,
      });
    }
    fx.emit({ x, y: surface, life: 0.5, size: 30, size1: 190, color: COLORS.white, shape: 'glow', alpha: 0.5 });
  }

  /** A tap in the air: a shower of light, stars and hearts. */
  tapSky(x: number, y: number, step: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.note('bell', scaleNote(76, step), { pan, gain: 0.75 });
    this.sound.note('chime', scaleNote(88, step), { pan, gain: 0.4, delay: 0.06 });
    // The sky is often a rainbow, so what is thrown into it is white, gold and pink: the three that
    // no stripe of it is.
    for (let i = 0; i < fx.count(20); i++) {
      const a = rng.range(0, TAU);
      const sp = rng.range(70, 230);
      const kind = i % 3;
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: rng.range(0.7, 1.3),
        size: rng.range(kind === 2 ? 16 : 32, kind === 2 ? 26 : 46),
        size1: 2,
        color: kind === 0 ? [255, 214, 90] : kind === 1 ? [255, 110, 170] : COLORS.white,
        color1: kind === 0 ? [255, 238, 170] : kind === 1 ? [255, 176, 206] : [255, 236, 170],
        shape: kind === 0 ? 'star5' : kind === 1 ? 'heart' : 'spark',
        drag: 1.7,
        twinkle: 9,
        gravity: 70,
        halo: 3,
        hold: 0.5,
        spin: rng.range(-3, 3),
        rot: rng.range(0, TAU),
      });
    }
    fx.emit({ x, y, life: 0.5, size: 20, size1: 120, color: COLORS.white, shape: 'ring', width: 3, alpha: 0.85 });
    fx.emit({ x, y, life: 0.6, size: 40, size1: 150, color: COLORS.pink, shape: 'glow', alpha: 0.45 });
  }

  /** A unicorn in the pool is touched: she leaps for joy, with hearts and light. */
  hop(x: number, y: number, step: number): void {
    const { fx, rng } = this;
    const pan = this.pan(x);
    this.sound.fx('boing', { pitch: 4 + step, size: 0.6, pan, gain: 0.7 });
    this.sound.note('bell', scaleNote(76, step), { pan, gain: 0.75, delay: 0.1 });
    this.sound.note('chime', scaleNote(88, step), { pan, gain: 0.35, delay: 0.2 });
    for (let i = 0; i < fx.count(18); i++) {
      const a = rng.range(0, TAU);
      const heart = i % 2 === 0;
      fx.emit({
        x,
        y,
        vx: Math.cos(a) * 120,
        vy: Math.sin(a) * 120 - 80,
        life: rng.range(0.8, 1.3),
        size: rng.range(34, 48),
        size1: 4,
        color: heart ? [255, 110, 170] : [255, 214, 90],
        color1: heart ? [255, 176, 206] : [255, 238, 170],
        shape: heart ? 'heart' : 'star5',
        drag: 1.7,
        twinkle: 8,
        gravity: 90,
        halo: 3,
        hold: 0.5,
        spin: heart ? 0 : rng.range(-3, 3),
      });
    }
    fx.emit({
      x,
      y: y + 30,
      life: 0.5,
      size: 20,
      size1: 130,
      color: COLORS.white,
      shape: 'ring',
      width: 3,
      alpha: 0.8,
    });
  }
}
