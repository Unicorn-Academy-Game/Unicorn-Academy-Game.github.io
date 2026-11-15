import {
  COLUMNS,
  COMPUTER_FPS,
  KEYBOARD as COMPUTER_KEYS,
  offsetOfColumn,
  SCREEN_SPOT,
  timeOfColumn,
} from '../../shared/computer';
import { KEYBOARD, noteOfKey, offsetOfKey, PIANO_KEYS, timeOfKey } from '../../shared/piano';
import type { Kit, Maker } from './library';

/**
 * What the playground's toys do when she casts at them. Every one is a burst of light and colour
 * that ends on its own. The toys draw their own motion (a ball on a slide, a mushroom squashing);
 * these are only the sparkle around them.
 */

const TAU = Math.PI * 2;
const SPARKS = ['fx-spark-pink', 'fx-spark-mint', 'fx-spark-ice', 'fx-spark-gold', 'fx-spark'] as const;
/** Bright toy colours, for tinting the white-ish particles. */
const CONFETTI = [0xff5c7a, 0xffb347, 0xffe14d, 0x6be07f, 0x4fd8d0, 0x5aa8ff, 0xb084ff, 0xff8ac2] as const;
/**
 * The colours of the five notes C D E G A, which are those of the piano's jewels and of the tiles
 * of the tone matrix.
 */
const NOTE_TINTS = [0xff5c7a, 0xffa347, 0xffd84a, 0x4fa0f5, 0xb084ff] as const;

const glowAt = (k: Kit, x: number, y: number, z: number, tint: number, size: number, life: number, delay = 0): void => {
  if (k.reduced) return;
  k.fx.spawn({
    sprite: 'fx-glow',
    x,
    y,
    z,
    life,
    delay,
    scale: [size * 0.5, size],
    tint,
    add: true,
    alpha: 0.6,
    fadeOut: life * 0.8,
  });
};

/** A ring that spreads on the ground, the same one every spell leaves. */
const ring = (k: Kit, x: number, y: number, tint: number, scale: number, delay = 0): void => {
  k.fx.spawn({
    sprite: 'fx-wave',
    x,
    y,
    life: 0.62,
    scale: [scale, scale],
    tint,
    anim: 'life',
    layer: 'ground',
    delay,
  });
};

/** Sparks flying out from a point in every direction, falling a little as they go. */
function burst(k: Kit, x: number, y: number, z: number, count: number, speed: number, delay: number, life = 1.1): void {
  const offset = k.r(0, TAU);
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    const v = speed * k.r(0.7, 1.1);
    k.fx.spawn({
      sprite: SPARKS[i % SPARKS.length]!,
      x,
      y,
      z,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.18,
      vz: Math.sin(a) * v,
      gravity: 70,
      drag: 1.1,
      delay,
      life: k.r(life * 0.8, life * 1.1),
      scale: [k.r(1.2, 1.6), 0.5],
      fadeOut: 0.5,
      layer: 'air',
      add: true,
    });
  }
}

export const PLAY_MAKERS = {
  /**
   * The fountain throws water and light up from its jewel. The jewels in the air are drawn by the
   * toy itself.
   */
  'gem-burst'(k, { at, seconds }) {
    const top = 120;
    glowAt(k, at.x, at.y, top, 0xe6c2ff, 2.2, 0.8);
    ring(k, at.x, at.y + 12, 0xcfa6ff, 1.3);
    k.fx.emit(Math.min(seconds, 1.4), k.every(0.05, 0.1), () => {
      k.fx.spawn({
        sprite: 'fx-drop',
        x: at.x + k.r(-6, 6),
        y: at.y,
        z: top - 20,
        vx: k.r(-54, 54),
        vy: k.r(-14, 14),
        vz: k.r(150, 230),
        gravity: 480,
        life: 1.2,
        scale: [k.r(0.7, 1), 0.8],
        layer: 'air',
        onLand: (x, y) =>
          k.fx.spawn({
            sprite: 'fx-ring',
            x,
            y,
            life: 0.3,
            anim: 'life',
            layer: 'ground',
            scale: [0.28, 0.28],
            tint: 0x8fd8ff,
            alpha: 0.85,
          }),
      });
    });
    burst(k, at.x, at.y, top + 30, k.n(14), 90, 0.05, 1.3);
  },

  /** A mushroom squashes and a soft ring of dust and little stars springs from its cap. */
  'bounce-puff'(k, { at }) {
    ring(k, at.x, at.y + 4, 0xffffff, 0.6);
    for (const dir of [-1, 1]) {
      k.fx.spawn({
        sprite: 'fx-puff',
        x: at.x + dir * 30,
        y: at.y + 4,
        z: 6,
        vx: dir * 38,
        life: 0.5,
        anim: 'life',
        alpha: 0.9,
        layer: 'air',
        scale: [0.7, 1.2],
        tint: 0xfff0f8,
      });
    }
    for (let i = 0; i < k.n(7); i++) {
      k.fx.spawn({
        sprite: SPARKS[i % SPARKS.length]!,
        x: at.x + k.r(-34, 34),
        y: at.y,
        z: k.r(44, 80),
        vz: k.r(70, 150),
        gravity: 200,
        drag: 0.4,
        delay: 0.14 + i * 0.03,
        life: k.r(0.6, 0.9),
        scale: [k.r(1, 1.5), 0.4],
        fadeOut: 0.3,
        layer: 'air',
      });
    }
  },

  /**
   * A rocket climbs on a trail of sparks, then opens into a flower of colour that sinks and fades.
   */
  firework(k, { at }) {
    const apex = 250;
    const rise = 0.62;
    ring(k, at.x, at.y + 6, 0xffe39a, 0.9);
    k.fx.spawn({
      sprite: 'fx-glow',
      x: at.x,
      y: at.y,
      z: 14,
      life: 0.35,
      scale: [0.6, 1.2],
      tint: 0xffd48a,
      add: true,
      alpha: 0.7,
      fadeOut: 0.3,
      layer: 'air',
    });
    // The rocket and its trail. The trail is dropped at where the rocket was, a moment before.
    k.fx.spawn({
      sprite: 'fx-spark-gold',
      x: at.x,
      y: at.y,
      z: 20,
      vz: (apex - 20) / rise,
      life: rise,
      scale: [1.4, 1],
      layer: 'air',
      add: true,
    });
    const trail = k.n(10);
    for (let i = 0; i < trail; i++) {
      const t = (i / trail) * rise;
      k.fx.spawn({
        sprite: 'fx-spark',
        x: at.x + k.r(-3, 3),
        y: at.y,
        z: 20 + ((apex - 20) / rise) * t,
        vz: -20,
        delay: t,
        life: 0.45,
        scale: [0.8, 0.2],
        fadeOut: 0.4,
        layer: 'air',
      });
    }
    // The flower: a big ring of sparks, a smaller one inside in other colours, a flash and falling
    // glitter.
    glowAt(k, at.x, at.y, apex, 0xfff0b0, 3.4, 0.7, rise);
    burst(k, at.x, at.y, apex, k.n(22), 150, rise, 1.5);
    burst(k, at.x, at.y, apex, k.n(12), 70, rise + 0.05, 1.3);
    for (let i = 0; i < k.n(14); i++) {
      k.fx.spawn({
        sprite: SPARKS[i % SPARKS.length]!,
        x: at.x + k.r(-70, 70),
        y: at.y + k.r(-6, 6),
        z: apex + k.r(-50, 40),
        vz: -k.r(10, 40),
        sway: [k.r(6, 14), k.r(0.8, 1.4)],
        delay: rise + k.r(0.15, 0.8),
        life: k.r(0.8, 1.3),
        scale: [k.r(0.8, 1.1), 0.4],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
  },

  /**
   * A shot leaves the muzzle, flies east in an arc with a tail of sparks, and bursts into stars and
   * hearts where it comes down.
   */
  'cannon-shot'(k, { at }) {
    const MUZZLE = { x: 74, z: 86 };
    const vx = 330,
      vz = 70,
      g = 240;
    const flight = 1.0;
    const x0 = at.x + MUZZLE.x,
      z0 = MUZZLE.z;
    const posAt = (t: number): { x: number; z: number } => ({ x: x0 + vx * t, z: z0 + vz * t - 0.5 * g * t * t });
    // The flash at the muzzle.
    glowAt(k, x0, at.y, z0, 0xfff0a0, 1.4, 0.3);
    k.fx.spawn({
      sprite: 'fx-puff',
      x: x0 + 6,
      y: at.y,
      z: z0 - 6,
      vx: 24,
      life: 0.5,
      anim: 'life',
      alpha: 0.9,
      layer: 'air',
      scale: [0.8, 1.4],
    });
    k.fx.spawn({
      sprite: 'fx-spark-gold',
      x: x0,
      y: at.y,
      z: z0,
      vx,
      vz,
      gravity: g,
      life: flight,
      scale: [1.9, 1.3],
      layer: 'air',
      add: true,
    });
    // The tail, dropped along the same path.
    const steps = k.n(14);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * flight;
      const p = posAt(t);
      k.fx.spawn({
        sprite: i % 2 ? 'fx-spark-pink' : 'fx-spark',
        x: p.x,
        y: at.y + k.r(-4, 4),
        z: p.z + k.r(-3, 3),
        delay: t,
        life: 0.5,
        scale: [1, 0.2],
        fadeOut: 0.4,
        layer: 'air',
      });
    }
    // Where it comes down.
    const land = posAt(flight);
    glowAt(k, land.x, at.y, Math.max(10, land.z), 0xffe3f2, 2, 0.6, flight);
    ring(k, land.x, at.y + 4, 0xffd0ee, 0.9, flight);
    burst(k, land.x, at.y, Math.max(20, land.z) + 14, k.n(14), 110, flight, 1.2);
    for (let i = 0; i < k.n(6); i++) {
      k.fx.spawn({
        sprite: i % 2 ? 'fx-heart-2' : 'fx-heart-1',
        x: land.x + k.r(-30, 30),
        y: at.y + k.r(-6, 6),
        z: 30 + k.r(0, 30),
        vz: k.r(36, 64),
        sway: [k.r(8, 14), k.r(0.7, 1)],
        delay: flight + i * 0.07,
        life: 1.1,
        pop: 0.25,
        scale: [1.3, 1.4],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
  },

  /**
   * What goes in at one cage comes out the other: a puff and a shower of stars over each, and a
   * glint where the new thing appears.
   */
  'morph-poof'(k, { at }) {
    for (const [side, delay] of [
      [-1, 0.12],
      [1, 0.62],
    ] as const) {
      const x = at.x + side * 40;
      glowAt(k, x, at.y, 84, side < 0 ? 0xffd0b0 : 0xd0e6ff, 1.7, 0.5, delay);
      for (const dir of [-1, 0, 1]) {
        k.fx.spawn({
          sprite: 'fx-puff',
          x: x + dir * 12,
          y: at.y,
          z: 70,
          vx: dir * 30,
          vz: 16,
          life: 0.6,
          anim: 'life',
          alpha: 0.9,
          layer: 'air',
          scale: [0.9, 1.5],
          delay,
          tint: 0xfff4ff,
        });
      }
      for (let i = 0; i < k.n(8); i++) {
        const a = (i / 8) * TAU;
        k.fx.spawn({
          sprite: SPARKS[i % SPARKS.length]!,
          x,
          y: at.y,
          z: 84,
          vx: Math.cos(a) * k.r(30, 60),
          vz: Math.sin(a) * k.r(30, 60),
          gravity: 50,
          drag: 1.2,
          delay,
          life: 0.8,
          scale: [1.1, 0.4],
          fadeOut: 0.4,
          layer: 'air',
          add: true,
        });
      }
    }
    ring(k, at.x, at.y + 22, 0xe6c2ff, 1.1, 0.5);
  },

  /** The balloons go up and away, and a few small hearts go with them. */
  'balloons-away'(k, { at, seconds }) {
    for (let i = 0; i < k.n(6); i++) {
      k.fx.spawn({
        sprite: i % 2 ? 'fx-heart-2' : 'fx-heart-1',
        x: at.x + k.r(-30, 30),
        y: at.y,
        z: k.r(150, 230),
        vz: k.r(40, 70),
        sway: [k.r(8, 16), k.r(0.6, 1)],
        delay: i * 0.1,
        life: seconds * 0.55,
        pop: 0.2,
        scale: [1.2, 1.4],
        fadeOut: 0.6,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(8); i++) {
      k.fx.spawn({
        sprite: SPARKS[i % SPARKS.length]!,
        x: at.x + k.r(-34, 34),
        y: at.y,
        z: k.r(120, 260),
        vz: k.r(10, 40),
        delay: k.r(0, seconds * 0.4),
        life: 0.8,
        scale: [1, 0.4],
        fadeOut: 0.3,
        layer: 'air',
      });
    }
  },

  /** A pop, then paper streamers and ribbons in every colour rain down. */
  confetti(k, { at }) {
    const top = 120;
    glowAt(k, at.x, at.y, top, 0xfff2b0, 1.6, 0.4);
    ring(k, at.x, at.y + 6, 0xffd9a0, 0.8);
    const count = k.n(34);
    for (let i = 0; i < count; i++) {
      const a = k.r(-0.9, 0.9) + Math.PI / 2;
      const v = k.r(110, 230);
      k.fx.spawn({
        sprite: i % 5 === 4 ? 'fx-petal-1' : 'fx-shard',
        x: at.x + k.r(-6, 6),
        y: at.y,
        z: top,
        vx: Math.cos(a) * v * 1.2,
        vy: k.r(-14, 14),
        vz: Math.sin(a) * v,
        gravity: 170,
        drag: 0.9,
        sway: [k.r(10, 26), k.r(1, 2)],
        spin: k.r(-6, 6),
        rot: k.r(0, TAU),
        tint: CONFETTI[i % CONFETTI.length]!,
        delay: k.r(0, 0.1),
        life: k.r(1.1, 1.8),
        scale: [k.r(0.55, 0.9), 0.5],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
  },

  /**
   * A finger runs up the piano's keys, and a note of that key's colour floats up from each key it
   * touches.
   */
  'music-notes'(k, { at }) {
    const keys = at.y + KEYBOARD.down;
    glowAt(k, at.x, keys, KEYBOARD.up + 4, 0xe6c2ff, 3, 0.8);
    ring(k, at.x, at.y + 36, 0xcfa6ff, 1.7);
    for (let key = 0; key < PIANO_KEYS; key++) {
      const note = noteOfKey(key);
      if (note === null) continue;
      k.fx.spawn({
        sprite: key % 2 === 0 ? 'fx-note-1' : 'fx-note-2',
        x: at.x + offsetOfKey(key),
        y: keys,
        z: KEYBOARD.up + 4,
        vz: k.r(62, 96),
        sway: [k.r(5, 11), k.r(0.9, 1.5)],
        delay: timeOfKey(key),
        life: k.r(1.2, 1.6),
        pop: 0.18,
        scale: [k.r(1, 1.25), 1.3],
        tint: NOTE_TINTS[note]!,
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(10); i++) {
      k.fx.spawn({
        sprite: SPARKS[i % SPARKS.length]!,
        x: at.x + k.r(-100, 100),
        y: keys,
        z: k.r(KEYBOARD.up + 10, KEYBOARD.up + 60),
        vz: k.r(14, 46),
        delay: k.r(0.05, 0.7),
        life: k.r(0.7, 1),
        scale: [k.r(0.9, 1.3), 0.4],
        fadeOut: 0.4,
        layer: 'air',
        add: true,
      });
    }
  },

  /**
   * A sleeper breathes out z's, three of them one after another, each a little bigger than the
   * last, which float up and fade.
   */
  dream(k, { at }) {
    for (let i = 0; i < 3; i++) {
      k.fx.spawn({
        sprite: i === 0 ? 'fx-z-1' : 'fx-z-2',
        x: at.x + i * 9,
        y: at.y,
        z: 0,
        vz: k.r(17, 24),
        sway: [k.r(4, 7), k.r(0.7, 1.1)],
        delay: i * 0.5,
        life: 1.9,
        pop: 0.2,
        scale: [0.85 + i * 0.15, 1.15 + i * 0.25],
        tint: 0xe4dcff,
        fadeOut: 0.8,
        layer: 'air',
      });
    }
  },

  /**
   * The computer's screen flashes as it wakes, and a spark of each key's colour flies up from the
   * key as the light runs along them.
   */
  'screen-wake'(k, { at }) {
    const keys = at.y + COMPUTER_KEYS.down;
    glowAt(k, at.x, at.y + SCREEN_SPOT.down, SCREEN_SPOT.up, 0xbff4ff, 3.4, 0.6, 1 / COMPUTER_FPS);
    ring(k, at.x, at.y + 40, 0x8ff0e6, 1.8);
    for (let column = 0; column < COLUMNS; column++) {
      // The keys are in the colours of the confetti, the middle row a third of the way round from
      // the first.
      k.fx.spawn({
        sprite: column % 2 === 0 ? 'fx-shard' : SPARKS[column % SPARKS.length]!,
        x: at.x + offsetOfColumn(column),
        y: keys,
        z: COMPUTER_KEYS.up + 4,
        vz: k.r(60, 100),
        sway: [k.r(4, 9), k.r(0.9, 1.5)],
        spin: column % 2 === 0 ? k.r(-4, 4) : 0,
        delay: timeOfColumn(column),
        life: k.r(0.9, 1.3),
        pop: 0.15,
        scale: [k.r(0.8, 1.1), 1.1],
        tint: CONFETTI[(column + 3) % CONFETTI.length]!,
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(8); i++) {
      k.fx.spawn({
        sprite: SPARKS[i % SPARKS.length]!,
        x: at.x + k.r(-70, 70),
        y: at.y + SCREEN_SPOT.down,
        z: SCREEN_SPOT.up + k.r(-26, 30),
        vz: k.r(16, 50),
        delay: k.r(0.1, 0.55),
        life: k.r(0.6, 0.9),
        scale: [k.r(0.9, 1.3), 0.4],
        fadeOut: 0.4,
        layer: 'air',
      });
    }
  },
} satisfies Record<string, Maker>;
