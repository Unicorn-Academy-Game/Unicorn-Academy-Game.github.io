import type { EffectId } from '../../content/activities';
import type { Facing, Vec2 } from '../../shared/ids';
import { RAINBOW_MAKERS } from './fountain-rainbow';
import { PLAY_MAKERS } from './play';
import type { Fx, Spec } from './system';

/** What the simulation asked for. `seconds` is how long the world considers it alive. */
export interface EffectCall {
  id: EffectId;
  at: Vec2;
  seconds: number;
  facing?: Facing | undefined;
  /** How high above `at` the thing it belongs to is, for a creature in the air. */
  lift?: number | undefined;
  /**
   * How much of its usual sparkle it throws, from 0 to 1. A thing that happens beside a bigger one
   * does not need all of it.
   */
  share?: number | undefined;
}

/** Heights above the ground, in world units, where things happen on a standing unicorn. */
const BODY = 72;
const HEAD = 112;
const TAU = Math.PI * 2;

/** The colors of the six kinds of magic. */
const TINT = {
  light: 0xffe98a,
  lightPale: 0xfff6cf,
  nature: 0x8fe06a,
  ice: 0xa6e2ff,
  water: 0x62c8f5,
  fire: 0xffa04a,
  lightning: 0xffe85a,
  storm: 0xb7a2ff,
  white: 0xffffff,
  muted: 0xb9a8e8,
} as const;

const SIDE: Record<Facing, number> = { east: 1, west: -1, north: 0, south: 0 };

export interface Kit {
  fx: Fx;
  reduced: boolean;
  /** Scales particle counts for reduced effects, and for a profile that throws fewer sparkles. */
  n(count: number): number;
  /**
   * Seconds between two spawns of a steady source. `calm` is the gap when effects are reduced, and
   * `seconds` stretches as fewer sparkles are thrown.
   */
  every(seconds: number, calm: number): number;
  r(a: number, b: number): number;
  pick<T>(items: readonly T[]): T;
}

/**
 * `sparkles` is the share of particles a profile throws, 1 for all. Reduced effects throw fewer
 * still.
 */
function kit(fx: Fx, reduced: boolean, sparkles: number): Kit {
  const share = reduced ? Math.min(0.4, sparkles) : sparkles;
  return {
    fx,
    reduced,
    n: (count) => (share === 1 ? count : Math.max(1, Math.round(count * share))),
    every: (seconds, calm) => (reduced ? calm : seconds / sparkles),
    r: (a, b) => a + fx.rand() * (b - a),
    pick: (items) => items[Math.floor(fx.rand() * items.length)]!,
  };
}

/** An expanding ring on the ground, the signature of every spell. */
function wave(k: Kit, at: Vec2, tint: number, scale = 1, delay = 0): void {
  k.fx.spawn({
    sprite: 'fx-wave',
    x: at.x,
    y: at.y,
    life: 0.62,
    scale: [scale, scale],
    tint,
    anim: 'life',
    layer: 'ground',
    delay,
  });
}

/** A soft flash of light at body height. Skipped when reduced effects are on. */
function flash(k: Kit, at: Vec2, tint: number, size: number, life: number, delay = 0, z = BODY): void {
  if (k.reduced) return;
  k.fx.spawn({
    sprite: 'fx-glow',
    x: at.x,
    y: at.y,
    z,
    life,
    delay,
    scale: [size * 0.45, size],
    tint,
    add: true,
    alpha: 0.6,
    fadeOut: life * 0.8,
  });
}

/**
 * A point on the ground plane at an angle and distance. The plane is squashed to read as lying
 * flat.
 */
const onGround = (at: Vec2, angle: number, distance: number): Vec2 => ({
  x: at.x + Math.cos(angle) * distance,
  y: at.y + Math.sin(angle) * distance * 0.55,
});

function radial(k: Kit, count: number, make: (angle: number, i: number) => Spec): void {
  const offset = k.r(0, TAU);
  for (let i = 0; i < count; i++) k.fx.spawn(make(offset + (i / count) * TAU, i));
}

const frontOf = (call: EffectCall, distance: number): Vec2 => ({
  x: call.at.x + SIDE[call.facing ?? 'east'] * distance,
  y: call.at.y,
});

export type Maker = (k: Kit, call: EffectCall) => void;

const MAKERS: Record<EffectId, Maker> = {
  ...PLAY_MAKERS,
  ...RAINBOW_MAKERS,
  tap(k, { at }) {
    k.fx.spawn({ sprite: 'fx-ring', x: at.x, y: at.y, life: 0.34, anim: 'life', layer: 'ground', alpha: 0.95 });
  },

  refusal(k, { at }) {
    k.fx.spawn({
      sprite: 'fx-ring',
      x: at.x,
      y: at.y,
      life: 0.3,
      anim: 'life',
      layer: 'ground',
      tint: TINT.muted,
      alpha: 0.85,
      scale: [0.7, 0.7],
    });
    for (const dir of [-1, 1])
      k.fx.spawn({
        sprite: 'fx-dust',
        x: at.x + dir * 6,
        y: at.y,
        z: 4,
        vx: dir * 26,
        life: 0.4,
        anim: 'life',
        alpha: 0.9,
        layer: 'air',
        scale: [0.8, 1.0],
      });
  },

  hearts(k, call) {
    const { at } = call;
    const spread = call.seconds * 0.38;
    const count = k.n(6);
    for (let i = 0; i < count; i++) {
      k.fx.spawn({
        sprite: i % 3 === 2 ? 'fx-heart-2' : 'fx-heart-1',
        x: at.x + k.r(-34, 34),
        y: at.y + k.r(-6, 6),
        z: HEAD + k.r(-8, 12),
        vz: k.r(34, 54),
        sway: [k.r(10, 20), k.r(0.6, 1.0)],
        delay: (i / count) * spread + k.r(0, 0.1),
        life: call.seconds * 0.7,
        pop: 0.28,
        scale: [1.45, 1.5],
        fadeOut: 0.6,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(4); i++)
      k.fx.spawn({
        sprite: 'fx-spark-pink',
        x: at.x + k.r(-46, 46),
        y: at.y + 2,
        z: k.r(60, HEAD + 20),
        life: 0.7,
        delay: k.r(0, spread),
        layer: 'air',
        scale: [0.8, 0.6],
      });
  },

  sparkle(k, call) {
    const { at } = call;
    const count = k.n(9);
    for (let i = 0; i < count; i++) {
      k.fx.spawn({
        sprite: 'fx-spark',
        x: at.x + k.r(-48, 48),
        y: at.y + k.r(-8, 8),
        z: k.r(14, 140),
        vz: k.r(6, 22),
        life: k.r(0.55, 0.9),
        delay: (i / count) * Math.min(call.seconds, 1.6),
        layer: 'air',
        scale: [k.r(1.3, 1.9), 0.7],
        fadeOut: 0.25,
      });
    }
  },

  bloom(k, { at }) {
    flash(k, at, 0xffd1e4, 1.4, 0.3, 0, 40);
    wave(k, at, 0xffb3d1, 0.5);
    for (let i = 0; i < k.n(10); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: k.pick(['fx-petal-1', 'fx-petal-2']),
        x: at.x,
        y: at.y,
        z: 30,
        vx: Math.cos(a) * k.r(30, 80),
        vy: Math.sin(a) * k.r(14, 40),
        vz: k.r(130, 220),
        gravity: 230,
        sway: [26, k.r(1.2, 2)],
        spin: k.r(-4, 4),
        scale: [1.3, 1.2],
        life: k.r(1.1, 1.6),
        fadeOut: 0.4,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(6); i++)
      k.fx.spawn({
        sprite: 'fx-spark-pink',
        x: at.x + k.r(-44, 44),
        y: at.y + k.r(-10, 10),
        z: k.r(20, 90),
        life: 0.8,
        delay: k.r(0, 0.5),
        layer: 'air',
        scale: [1, 0.5],
      });
  },

  mote(k, call) {
    const base = frontOf(call, 92);
    k.fx.spawn({
      sprite: 'fx-mote',
      x: base.x,
      y: base.y,
      z: 78,
      vz: 7,
      sway: [10, 0.7],
      life: call.seconds,
      fadeIn: 0.4,
      fadeOut: 0.7,
      scale: [1, 1.15],
      layer: 'air',
      add: false,
    });
    k.fx.spawn({
      sprite: 'fx-glow-small',
      x: base.x,
      y: base.y,
      z: 78,
      vz: 7,
      life: call.seconds,
      fadeIn: 0.5,
      fadeOut: 0.7,
      alpha: 0.5,
      tint: TINT.light,
      add: true,
      layer: 'air',
    });
    for (let i = 0; i < k.n(5); i++)
      k.fx.spawn({
        sprite: 'fx-spark',
        x: base.x + k.r(-16, 16),
        y: base.y,
        z: 78 + k.r(-20, 30),
        life: 0.6,
        delay: k.r(0.3, call.seconds * 0.8),
        scale: [0.6, 0.3],
        layer: 'air',
      });
  },

  'ice-flower'(k, call) {
    const at = call.facing ? frontOf(call, 40) : call.at;
    k.fx.spawn({
      sprite: 'fx-ice-flower',
      x: at.x,
      y: at.y + 6,
      life: call.seconds,
      anim: 'once',
      fadeOut: Math.min(0.9, call.seconds * 0.4),
      scale: [1.3, 1.3],
      layer: 'air',
    });
    wave(k, at, TINT.ice, 0.4);
    for (let i = 0; i < k.n(6); i++)
      k.fx.spawn({
        sprite: 'fx-spark-ice',
        x: at.x + k.r(-24, 24),
        y: at.y,
        z: k.r(10, 70),
        vz: k.r(8, 30),
        life: 0.8,
        delay: k.r(0, 0.8),
        scale: [0.8, 0.4],
        layer: 'air',
      });
  },

  bubbles(k, { at }) {
    for (let i = 0; i < k.n(7); i++) {
      k.fx.spawn({
        sprite: 'fx-bubble',
        x: at.x + k.r(-34, 34),
        y: at.y + k.r(-6, 6),
        z: k.r(10, 60),
        vz: k.r(36, 66),
        sway: [k.r(10, 22), k.r(0.8, 1.5)],
        delay: k.r(0, 0.9),
        life: k.r(1.3, 1.9),
        scale: [k.r(0.7, 1.1), k.r(1.1, 1.4)],
        pop: 0.2,
        fadeOut: 0.35,
        layer: 'air',
      });
    }
    wave(k, at, TINT.water, 0.45);
  },

  embers(k, call) {
    const base = frontOf(call, -22);
    for (let i = 0; i < k.n(15); i++) {
      k.fx.spawn({
        sprite: 'fx-ember',
        x: base.x + k.r(-28, 28),
        y: base.y + k.r(-6, 6),
        z: k.r(76, 112),
        vz: k.r(36, 80),
        vx: k.r(-18, 18),
        gravity: -14,
        sway: [k.r(10, 26), k.r(1, 2)],
        delay: k.r(0, 1.0),
        life: k.r(0.8, 1.3),
        scale: [k.r(1.7, 2.5), 0.4],
        fadeOut: 0.5,
        add: true,
        layer: 'air',
      });
    }
    flash(k, base, TINT.fire, 1.1, 0.5, 0, 96);
  },

  cloud(k, call) {
    const { at } = call;
    k.fx.spawn({
      sprite: 'fx-cloud',
      x: at.x,
      y: at.y,
      z: 178,
      vz: 6,
      life: Math.min(call.seconds, 2.2),
      fadeIn: 0.3,
      fadeOut: 0.5,
      pop: 0.35,
      scale: [0.9, 1],
      layer: 'air',
    });
    for (let i = 0; i < k.n(5); i++)
      k.fx.spawn({
        sprite: 'fx-spark',
        x: at.x + k.r(-26, 26),
        y: at.y,
        z: 160 + k.r(-6, 8),
        life: 0.35,
        delay: 0.3 + k.r(0, 1.4),
        tint: TINT.lightning,
        scale: [0.9, 0.4],
        layer: 'air',
      });
  },

  'grow-flower'(k, call) {
    const at = call.facing ? frontOf(call, 52) : call.at;
    const sprite = k.pick(['fx-grow-flower', 'fx-grow-flower-lilac', 'fx-grow-flower-white']);
    k.fx.spawn({
      sprite,
      x: at.x,
      y: at.y + 8,
      life: call.seconds,
      anim: 'once',
      fadeOut: 0.7,
      scale: [1.25, 1.25],
      layer: 'air',
    });
    for (let i = 0; i < k.n(4); i++)
      k.fx.spawn({
        sprite: 'fx-spark-mint',
        x: at.x + k.r(-18, 18),
        y: at.y + 6,
        z: k.r(6, 40),
        vz: k.r(10, 26),
        life: 0.7,
        delay: k.r(0.2, 0.9),
        scale: [0.8, 0.4],
        layer: 'air',
      });
  },

  splash(k, { at }) {
    wave(k, at, TINT.water, 0.4);
    for (let i = 0; i < k.n(8); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: 'fx-drop',
        x: at.x,
        y: at.y,
        z: 8,
        vx: Math.cos(a) * k.r(20, 60),
        vy: Math.sin(a) * k.r(8, 24),
        vz: k.r(120, 200),
        gravity: 560,
        life: 1.1,
        scale: [0.9, 0.8],
        layer: 'air',
      });
    }
  },

  // A hoof in the shallows: a small ring, a few drops and a glint or two.
  wade(k, { at }) {
    wave(k, at, TINT.water, 0.4);
    for (let i = 0; i < k.n(5); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: 'fx-drop',
        x: at.x,
        y: at.y,
        z: 6,
        vx: Math.cos(a) * k.r(14, 40),
        vy: Math.sin(a) * k.r(6, 16),
        vz: k.r(90, 150),
        gravity: 520,
        life: 0.9,
        scale: [0.7, 0.6],
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(3); i++)
      k.fx.spawn({
        sprite: k.pick(['fx-spark', 'fx-spark-mint', 'fx-spark-pink']),
        x: at.x + k.r(-20, 20),
        y: at.y + k.r(-6, 6),
        z: k.r(8, 36),
        vz: k.r(8, 26),
        life: 0.6,
        delay: k.r(0, 0.25),
        scale: [0.8, 0.3],
        layer: 'air',
      });
  },

  // A leap into the sea: two rings, a burst of drops and a spray of glitter.
  dive(k, { at }) {
    wave(k, at, TINT.water, 0.65);
    wave(k, at, TINT.white, 0.42, 0.14);
    for (let i = 0; i < k.n(14); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: 'fx-drop',
        x: at.x,
        y: at.y,
        z: 10,
        vx: Math.cos(a) * k.r(26, 78),
        vy: Math.sin(a) * k.r(10, 30),
        vz: k.r(150, 250),
        gravity: 560,
        life: 1.1,
        scale: [0.9, 0.8],
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(10); i++)
      k.fx.spawn({
        sprite: k.pick(['fx-spark', 'fx-spark-mint', 'fx-spark-pink']),
        x: at.x + k.r(-34, 34),
        y: at.y + k.r(-10, 10),
        z: k.r(20, 80),
        vz: k.r(20, 60),
        life: 0.9,
        delay: k.r(0, 0.35),
        scale: [1, 0.3],
        layer: 'air',
      });
  },

  // Sand flung up from a dig, in puffs that fall back to the beach.
  dig(k, { at }) {
    const sand = [0xf2deaa, 0xe2c98f, 0xfff0c8];
    for (let i = 0; i < k.n(10); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      k.fx.spawn({
        sprite: 'fx-dust',
        x: at.x + side * k.r(4, 26),
        y: at.y + k.r(-4, 6),
        z: k.r(8, 30),
        vx: side * k.r(20, 70),
        vz: k.r(70, 150),
        gravity: 420,
        life: k.r(0.5, 0.8),
        anim: 'life',
        tint: k.pick(sand),
        alpha: 0.95,
        layer: 'air',
        scale: [k.r(0.8, 1.1), 1.3],
      });
    }
    for (let i = 0; i < k.n(4); i++)
      k.fx.spawn({
        sprite: 'fx-spark-gold',
        x: at.x + k.r(-20, 20),
        y: at.y + k.r(-4, 4),
        z: k.r(26, 60),
        vz: k.r(30, 70),
        life: 0.7,
        delay: k.r(0, 0.2),
        scale: [0.9, 0.4],
        layer: 'air',
      });
  },

  // A plant by the Magic Hall throws glitter: a cloud of sparks of every colour, and a soft glow.
  glitter(k, { at, seconds }) {
    flash(k, at, 0xffe6fb, 1.7, 0.5, 0, 60);
    wave(k, at, 0xe6c8ff, 0.5);
    for (let i = 0; i < k.n(26); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: k.pick(['fx-spark', 'fx-spark-pink', 'fx-spark-mint', 'fx-spark-gold', 'fx-spark-ice']),
        x: at.x + Math.cos(a) * k.r(4, 52),
        y: at.y + Math.sin(a) * 6,
        z: k.r(10, 120),
        vz: k.r(8, 40),
        sway: [k.r(6, 16), k.r(0.6, 1.2)],
        delay: (i / 26) * Math.min(seconds, 1.4) * 0.8,
        life: k.r(0.7, 1.3),
        scale: [k.r(1.1, 1.9), 0.4],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
  },

  // A hoof on a stone in the river: a pinch of glitter flies up.
  'stone-glint'(k, { at }) {
    for (let i = 0; i < k.n(5); i++)
      k.fx.spawn({
        sprite: k.pick(['fx-spark', 'fx-spark-mint', 'fx-spark-pink']),
        x: at.x + k.r(-24, 24),
        y: at.y + k.r(-8, 8),
        z: k.r(6, 30),
        vz: k.r(30, 80),
        life: 0.7,
        delay: k.r(0, 0.15),
        scale: [0.9, 0.2],
        layer: 'air',
      });
  },

  relocate(k, { at }) {
    k.fx.spawn({
      sprite: 'fx-ring',
      x: at.x,
      y: at.y,
      life: 0.5,
      anim: 'life',
      layer: 'ground',
      tint: 0xffd1ee,
      scale: [1.3, 1.3],
    });
    flash(k, at, 0xffe0f4, 1.3, 0.4, 0, 50);
    for (let i = 0; i < k.n(7); i++)
      k.fx.spawn({
        sprite: 'fx-spark-pink',
        x: at.x + k.r(-34, 34),
        y: at.y,
        z: k.r(10, 100),
        vz: k.r(20, 60),
        life: 0.7,
        delay: k.r(0, 0.2),
        scale: [1, 0.4],
        layer: 'air',
      });
  },

  'light-burst'(k, { at }) {
    flash(k, at, TINT.lightPale, 2.7, 0.5);
    wave(k, at, TINT.light, 1.0);
    wave(k, at, TINT.white, 0.62, 0.1);
    radial(k, k.n(14), (a) => ({
      sprite: 'fx-spark',
      x: at.x,
      y: at.y,
      z: BODY,
      vx: Math.cos(a) * k.r(150, 230),
      vy: Math.sin(a) * k.r(80, 130),
      vz: k.r(-10, 50),
      drag: 2.4,
      life: k.r(0.8, 1.2),
      scale: [1.25, 0.35],
      fadeOut: 0.4,
      layer: 'air',
      add: true,
    }));
    for (let i = 0; i < k.n(10); i++)
      k.fx.spawn({
        sprite: 'fx-spark-gold',
        x: at.x + k.r(-80, 80),
        y: at.y + k.r(-26, 26),
        z: k.r(16, 130),
        vz: k.r(26, 60),
        delay: k.r(0.08, 0.7),
        life: k.r(0.9, 1.4),
        scale: [k.r(0.8, 1.2), 0.4],
        fadeOut: 0.4,
        layer: 'air',
      });
  },

  'leaf-burst'(k, { at }) {
    flash(k, at, 0xd6ffb0, 1.9, 0.4);
    wave(k, at, TINT.nature, 1.0);
    for (let i = 0; i < k.n(13); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: k.pick(['fx-leaf-1', 'fx-leaf-2', 'fx-leaf-3']),
        x: at.x,
        y: at.y,
        z: 50,
        vx: Math.cos(a) * k.r(50, 150),
        vy: Math.sin(a) * k.r(20, 70),
        vz: k.r(150, 260),
        gravity: 190,
        drag: 0.5,
        sway: [k.r(40, 80), k.r(1, 1.8)],
        spin: k.r(-3.5, 3.5),
        rot: k.r(0, TAU),
        life: k.r(1.5, 2.1),
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(6); i++) {
      const a = k.r(0, TAU);
      k.fx.spawn({
        sprite: k.pick(['fx-petal-1', 'fx-petal-2']),
        x: at.x,
        y: at.y,
        z: 60,
        vx: Math.cos(a) * k.r(30, 90),
        vy: Math.sin(a) * k.r(14, 40),
        vz: k.r(110, 190),
        gravity: 150,
        sway: [k.r(30, 60), k.r(1.2, 2.2)],
        spin: k.r(-4, 4),
        life: k.r(1.3, 1.8),
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(3); i++) {
      const p = onGround(at, k.r(0, TAU), k.r(60, 110));
      k.fx.spawn({
        sprite: k.pick(['fx-grow-flower', 'fx-grow-flower-lilac', 'fx-grow-flower-white']),
        x: p.x,
        y: p.y,
        life: 2.0,
        delay: k.r(0.1, 0.55),
        anim: 'once',
        fadeOut: 0.6,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(7); i++)
      k.fx.spawn({
        sprite: 'fx-spark-mint',
        x: at.x + k.r(-80, 80),
        y: at.y + k.r(-24, 24),
        z: k.r(16, 120),
        vz: k.r(20, 50),
        delay: k.r(0.05, 0.7),
        life: 1.0,
        scale: [1, 0.4],
        fadeOut: 0.35,
        layer: 'air',
      });
  },

  'ice-burst'(k, { at }) {
    flash(k, at, 0xe4f6ff, 2.3, 0.45);
    wave(k, at, TINT.ice, 1.0);
    for (let i = 0; i < k.n(10); i++) {
      k.fx.spawn({
        sprite: k.pick(['fx-flake-1', 'fx-flake-2']),
        x: at.x + k.r(-100, 100),
        y: at.y + k.r(-30, 30),
        z: k.r(150, 230),
        vz: -k.r(60, 100),
        vx: k.r(-18, 18),
        sway: [k.r(14, 30), k.r(0.8, 1.4)],
        spin: k.r(-1.6, 1.6),
        delay: k.r(0, 0.5),
        life: k.r(1.5, 1.9),
        scale: [k.r(0.8, 1.2), 0.9],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    radial(k, k.n(8), (a) => ({
      sprite: 'fx-shard',
      x: at.x,
      y: at.y,
      z: 40,
      vx: Math.cos(a) * k.r(90, 190),
      vy: Math.sin(a) * k.r(40, 90),
      vz: k.r(150, 260),
      gravity: 520,
      rot: a + Math.PI / 2,
      spin: k.r(-3, 3),
      life: 1.4,
      layer: 'air',
      onLand: (x, y) => k.fx.spawn({ sprite: 'fx-spark-ice', x, y, z: 6, life: 0.4, scale: [0.9, 0.3], layer: 'air' }),
    }));
    for (let i = 0; i < k.n(9); i++)
      k.fx.spawn({
        sprite: 'fx-spark-ice',
        x: at.x + k.r(-84, 84),
        y: at.y + k.r(-26, 26),
        z: k.r(16, 130),
        vz: k.r(14, 40),
        delay: k.r(0.05, 0.8),
        life: 1.0,
        scale: [1, 0.4],
        fadeOut: 0.35,
        layer: 'air',
      });
  },

  'water-burst'(k, { at }) {
    flash(k, at, 0xb5ebff, 2.0, 0.4);
    wave(k, at, TINT.water, 1.0);
    radial(k, k.n(16), (a, i) => {
      const reach = k.r(40, 130);
      return {
        sprite: 'fx-drop',
        x: at.x,
        y: at.y,
        z: 38,
        vx: Math.cos(a) * reach,
        vy: Math.sin(a) * reach * 0.5,
        vz: k.r(230, 350),
        gravity: 640,
        delay: (i % 4) * 0.03,
        life: 1.5,
        scale: [k.r(0.9, 1.2), 0.9],
        layer: 'air',
        onLand: (x, y) =>
          k.fx.spawn({
            sprite: 'fx-ring',
            x,
            y,
            life: 0.32,
            anim: 'life',
            layer: 'ground',
            scale: [0.34, 0.34],
            tint: TINT.water,
            alpha: 0.9,
          }),
      };
    });
    for (let i = 0; i < k.n(6); i++)
      k.fx.spawn({
        sprite: 'fx-bubble',
        x: at.x + k.r(-60, 60),
        y: at.y + k.r(-18, 18),
        z: k.r(10, 60),
        vz: k.r(30, 60),
        sway: [14, 1.1],
        delay: k.r(0.1, 0.7),
        life: 1.4,
        scale: [0.8, 1.2],
        fadeOut: 0.35,
        layer: 'air',
      });
  },

  'fire-burst'(k, { at }) {
    flash(k, at, 0xffc27a, 2.5, 0.5);
    wave(k, at, TINT.fire, 1.0);
    for (let i = 0; i < k.n(5); i++) {
      const p = onGround(at, (i / 5) * TAU + k.r(-0.3, 0.3), k.r(46, 92));
      k.fx.spawn({
        sprite: 'fx-flame',
        x: p.x,
        y: p.y,
        life: k.r(0.95, 1.35),
        delay: k.r(0, 0.16),
        pop: 0.3,
        scale: [k.r(0.8, 1.05), 0.5],
        fadeOut: 0.45,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(16); i++) {
      k.fx.spawn({
        sprite: 'fx-ember',
        x: at.x + k.r(-60, 60),
        y: at.y + k.r(-18, 18),
        z: k.r(20, 80),
        vz: k.r(110, 250),
        vx: k.r(-40, 40),
        gravity: -40,
        sway: [k.r(14, 34), k.r(1, 2.4)],
        delay: k.r(0, 0.5),
        life: k.r(0.9, 1.6),
        scale: [k.r(1, 1.6), 0.3],
        fadeOut: 0.5,
        add: true,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(4); i++)
      k.fx.spawn({
        sprite: 'fx-spark-gold',
        x: at.x + k.r(-70, 70),
        y: at.y + k.r(-20, 20),
        z: k.r(40, 130),
        vz: k.r(40, 90),
        delay: k.r(0.1, 0.5),
        life: 0.9,
        scale: [1, 0.4],
        layer: 'air',
      });
  },

  'lightning-burst'(k, { at }) {
    const strike = 0.2;
    k.fx.spawn({
      sprite: 'fx-cloud',
      x: at.x,
      y: at.y,
      z: 222,
      life: 1.15,
      fadeIn: 0.14,
      fadeOut: 0.4,
      pop: 0.22,
      scale: [1.0, 1.08],
      layer: 'air',
    });
    ([1, 2, 3, 1] as const).forEach((n, i) => {
      k.fx.spawn({
        sprite: `fx-bolt-${n}`,
        x: at.x,
        y: at.y,
        z: 0,
        delay: strike + i * 0.09,
        life: 0.085,
        layer: 'air',
      });
    });
    flash(k, at, 0xfff6c0, 3.2, 0.42, strike, 40);
    flash(k, at, TINT.storm, 1.8, 0.5, strike + 0.02, 150);
    wave(k, at, TINT.lightning, 0.95, strike);
    wave(k, at, TINT.storm, 0.6, strike + 0.1);
    radial(k, k.n(12), (a) => ({
      sprite: 'fx-spark',
      x: at.x,
      y: at.y,
      z: 30,
      vx: Math.cos(a) * k.r(110, 230),
      vy: Math.sin(a) * k.r(50, 110),
      vz: k.r(30, 120),
      gravity: 260,
      delay: strike,
      life: k.r(0.5, 0.9),
      tint: TINT.lightning,
      scale: [1.1, 0.3],
      fadeOut: 0.3,
      layer: 'air',
      add: true,
    }));
    for (let i = 0; i < k.n(5); i++)
      k.fx.spawn({
        sprite: 'fx-puff',
        x: at.x + k.r(-30, 30),
        y: at.y + 4,
        z: 6,
        vz: k.r(10, 30),
        delay: strike + k.r(0, 0.1),
        life: 0.6,
        anim: 'life',
        alpha: 0.8,
        tint: TINT.storm,
        layer: 'air',
      });
  },

  'trim-sparkle'(k, { at }) {
    for (let i = 0; i < k.n(7); i++)
      k.fx.spawn({
        sprite: 'fx-spark-mint',
        x: at.x + k.r(-40, 40),
        y: at.y + k.r(-6, 6),
        z: k.r(30, 110),
        vz: k.r(10, 40),
        delay: k.r(0, 0.6),
        life: 0.7,
        scale: [1, 0.4],
        layer: 'air',
      });
    for (let i = 0; i < k.n(4); i++)
      k.fx.spawn({
        sprite: k.pick(['fx-leaf-1', 'fx-leaf-2']),
        x: at.x + k.r(-34, 34),
        y: at.y,
        z: k.r(60, 100),
        vz: 10,
        gravity: 80,
        sway: [30, 1.4],
        spin: k.r(-3, 3),
        scale: [0.55, 0.5],
        delay: k.r(0, 0.4),
        life: 1.0,
        fadeOut: 0.3,
        layer: 'air',
      });
  },

  'treasure-sparkle'(k, { at, seconds }) {
    flash(k, at, 0xffe39a, 1.5, 0.45, 0, 40);
    const count = k.n(11);
    for (let i = 0; i < count; i++) {
      k.fx.spawn({
        sprite: 'fx-spark-gold',
        x: at.x + k.r(-46, 46),
        y: at.y + k.r(-12, 12),
        z: k.r(8, 90),
        vz: k.r(10, 30),
        delay: (i / count) * Math.min(seconds, 1.4),
        life: k.r(0.6, 1.0),
        scale: [k.r(0.9, 1.4), 0.4],
        fadeOut: 0.25,
        layer: 'air',
      });
    }
  },

  'door-glow'(k, { at, seconds }) {
    if (!k.reduced)
      k.fx.spawn({
        sprite: 'fx-glow',
        x: at.x,
        y: at.y,
        z: 70,
        life: seconds,
        scale: [1.2, 1.7],
        tint: 0xffe3a0,
        add: true,
        alpha: 0.7,
        fadeIn: 0.4,
        fadeOut: 0.9,
        layer: 'air',
      });
    for (let i = 0; i < k.n(9); i++)
      k.fx.spawn({
        sprite: 'fx-spark-gold',
        x: at.x + k.r(-40, 40),
        y: at.y + 6,
        z: k.r(10, 120),
        vz: k.r(14, 36),
        delay: k.r(0, seconds * 0.7),
        life: 0.9,
        scale: [1, 0.4],
        fadeOut: 0.3,
        layer: 'air',
      });
  },

  'water-spray'(k, { at, seconds }) {
    k.fx.emit(seconds, k.every(0.045, 0.09), () => {
      k.fx.spawn({
        sprite: 'fx-drop',
        x: at.x + k.r(-5, 5),
        y: at.y,
        z: 70,
        vx: k.r(-46, 46),
        vy: k.r(-18, 18),
        vz: k.r(190, 270),
        gravity: 520,
        life: 1.4,
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
            tint: TINT.water,
            alpha: 0.85,
          }),
      });
    });
  },

  'pip-sparkle'(k, { at, lift }) {
    const z = (lift ?? 0) + 18;
    const count = k.n(7);
    for (let i = 0; i < count; i++) {
      k.fx.spawn({
        sprite: i % 3 === 0 ? 'fx-spark-gold' : 'fx-spark',
        x: at.x + k.r(-22, 22),
        y: at.y + k.r(-4, 4),
        z: z + k.r(-6, 34),
        vz: k.r(10, 30),
        delay: (i / count) * 0.35,
        life: k.r(0.5, 0.8),
        scale: [k.r(1, 1.5), 0.6],
        fadeOut: 0.3,
        layer: 'air',
      });
    }
  },

  'pip-hearts'(k, { at, lift }) {
    const z = (lift ?? 0) + 34;
    for (let i = 0; i < k.n(3); i++) {
      k.fx.spawn({
        sprite: i % 2 === 0 ? 'fx-heart-1' : 'fx-heart-2',
        x: at.x + k.r(-14, 14),
        y: at.y,
        z: z + k.r(0, 10),
        vz: k.r(30, 46),
        sway: [k.r(6, 12), k.r(0.7, 1.1)],
        delay: i * 0.12,
        life: 1,
        pop: 0.22,
        scale: [1, 1.05],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
    for (let i = 0; i < k.n(3); i++)
      k.fx.spawn({
        sprite: 'fx-spark-pink',
        x: at.x + k.r(-26, 26),
        y: at.y,
        z: z + k.r(-10, 30),
        life: 0.6,
        delay: k.r(0, 0.4),
        scale: [0.8, 0.5],
        layer: 'air',
      });
  },

  /**
   * What a fairy leaves when she is tapped: a burst of coloured sparks that open like a flower,
   * then drift down like dust.
   */
  'fairy-dust'(k, { at, lift }) {
    const z = (lift ?? 0) + 40;
    const sparks = ['fx-spark-pink', 'fx-spark-mint', 'fx-spark-ice', 'fx-spark-gold', 'fx-spark'] as const;
    flash(k, at, 0xffd6f6, 1.5, 0.5, 0, z);
    radial(k, k.n(16), (a, i) => ({
      sprite: sparks[i % sparks.length]!,
      x: at.x,
      y: at.y,
      z,
      vx: Math.cos(a) * k.r(34, 80),
      vy: Math.sin(a) * k.r(14, 36),
      vz: k.r(-6, 44),
      drag: 1.7,
      delay: i * 0.02,
      life: k.r(0.9, 1.4),
      scale: [1.1, 0.5],
      fadeOut: 0.4,
      layer: 'air',
      add: true,
    }));
    for (let i = 0; i < k.n(10); i++) {
      k.fx.spawn({
        sprite: sparks[i % sparks.length]!,
        x: at.x + k.r(-36, 36),
        y: at.y + k.r(-8, 8),
        z: z + k.r(-6, 26),
        vz: -k.r(14, 34),
        sway: [k.r(8, 16), k.r(0.8, 1.4)],
        delay: k.r(0.1, 0.9),
        life: k.r(1, 1.6),
        scale: [k.r(0.8, 1.2), 0.5],
        fadeOut: 0.5,
        layer: 'air',
      });
    }
  },

  'rainbow-arc'(k, { at, seconds }) {
    k.fx.spawn({
      sprite: 'fx-rainbow',
      x: at.x,
      y: at.y,
      z: 108,
      life: seconds,
      pop: 0.5,
      fadeIn: 0.35,
      fadeOut: 0.9,
      scale: [1, 1.04],
      layer: 'air',
    });
    for (let i = 0; i < k.n(10); i++)
      k.fx.spawn({
        sprite: 'fx-spark',
        x: at.x + k.r(-90, 90),
        y: at.y,
        z: 108 + k.r(10, 90),
        vz: k.r(4, 18),
        delay: k.r(0.1, seconds * 0.75),
        life: 0.7,
        scale: [0.9, 0.4],
        layer: 'air',
      });
  },
};

/** Starts one effect. Unknown ids cannot reach here: the table is exhaustive over `EffectId`. */
export function playEffect(fx: Fx, call: EffectCall, reduced: boolean, sparkles = 1): void {
  MAKERS[call.id](kit(fx, reduced, sparkles * (call.share ?? 1)), call);
}
