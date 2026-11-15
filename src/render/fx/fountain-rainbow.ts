import { ARCH, archPoint, HORN_TIPS, LANDING, waterPoint } from '../../content/fountain-horns';
import { dissolveFront, PAINT, paintFront, RAINBOW, rainbowPhase, shimmerCrest } from '../../content/fountain-rainbow';
import type { Vec2 } from '../../shared/ids';
import type { Kit, Maker } from './library';

/**
 * The sparkles of the rainbow over the palace garden's fountain. The arch itself is the picture of
 * the props that hold it; this is the light around it. It is asked for when the rainbow comes up
 * and again each time it is given more time, and because it is kept going and not started again,
 * the sparkles follow the arch through a recast: they end when the arch ends, whenever that turns
 * out to be.
 */

const SPARKS = ['fx-spark-gold', 'fx-spark-pink', 'fx-spark-mint', 'fx-spark-ice', 'fx-spark'] as const;
const GLITTER = [0xfff6cf, 0xffd6f6, 0xd6f6ff, 0xe6ffd6] as const;
const GOLD = 0xffe98a;
const SIDES = ['left', 'right'] as const;
type Side = (typeof SIDES)[number];
/** How far from the middle of the bands the sparkles are scattered: as far as the bands reach. */
const REACH = (ARCH.bands * ARCH.band) / 2;

/**
 * A point on the arch, found as the arch's own bands are: `share` goes from 0 at the horn to 1 at
 * the apex. The sparkles stand on the line between the horns and rise from it.
 */
function onArch(at: Vec2, side: Side, share: number, across: number): { x: number; y: number; z: number } {
  const p = archPoint(side === 'left' ? share / 2 : 1 - share / 2, across);
  return { x: at.x + p.x, y: at.y, z: -p.y };
}

/**
 * The tips of the horns light up as the rainbow comes up, stay lit while it stands and are the last
 * of it to go.
 */
function horns(k: Kit, at: Vec2, age: number, left: number): void {
  const igniting = age < 0.01;
  const dimming = Math.min(1, left / RAINBOW.fade);
  for (const side of SIDES) {
    const x = at.x + HORN_TIPS[side].x;
    const y = at.y + HORN_TIPS[side].y;
    if (!k.reduced)
      k.fx.spawn({
        sprite: 'fx-glow',
        x,
        y,
        z: 2,
        life: 1.1,
        scale: igniting ? [0.5, 0.95] : [0.4, 0.65],
        tint: GOLD,
        add: true,
        alpha: (igniting ? 0.75 : 0.5) * dimming,
        fadeIn: 0.25,
        fadeOut: 0.6,
        layer: 'air',
      });
    k.fx.spawn({
      sprite: 'fx-spark-gold',
      x,
      y,
      z: 3,
      life: 0.5,
      anim: 'life',
      pop: 0.2,
      scale: [igniting ? 1.7 : 1.2, 0.6],
      fadeOut: 0.3,
      layer: 'air',
      add: true,
    });
  }
}

/**
 * Sparkles on the arch where the light is. They trail the paint as it grows from the horns, ride
 * the crest of the wave of light while the arch stands, and are shed from the place where it is
 * coming apart, which are the same places the picture's pieces are changing in.
 */
function edge(k: Kit, at: Vec2, age: number, left: number): void {
  const total = age + left;
  const phase = rainbowPhase(age, total);
  if (phase === 'forming' && age < PAINT.begin) return;
  const front =
    phase === 'forming' ? paintFront(age) : phase === 'fading' ? dissolveFront(age, total) : shimmerCrest(age);
  const shedding = phase === 'fading';
  const count = phase === 'arched' ? 1 : k.n(2);
  for (const side of SIDES) {
    for (let i = 0; i < count; i++) {
      const p = onArch(
        at,
        side,
        shedding ? front : Math.max(0, front - (phase === 'forming' ? k.r(0, 0.1) : 0)),
        k.r(-REACH, REACH),
      );
      k.fx.spawn({
        sprite: k.pick(SPARKS),
        x: p.x,
        y: p.y,
        z: p.z,
        vx: shedding ? k.r(-14, 14) : 0,
        vz: shedding ? k.r(-30, 10) : k.r(8, 30),
        gravity: shedding ? 60 : 0,
        drag: 1,
        life: k.r(0.4, 0.6),
        scale: [k.r(1, 1.4), 0.4],
        fadeOut: 0.35,
        layer: 'air',
        add: true,
      });
    }
  }
}

/**
 * A grain of glitter lets go of the arch low down, drifts in over the basin and comes down on the
 * water as a tiny sparkle.
 */
function glitter(k: Kit, at: Vec2, age: number): void {
  if (age < 0.7) return;
  const from = onArch(at, k.pick(SIDES), k.r(0.04, 0.55), k.r(-REACH, REACH));
  const water = waterPoint(k.r(...LANDING.angle), k.r(...LANDING.share));
  const fall = k.r(2, 2.8);
  const gravity = 6;
  const y = at.y + water.y;
  const height = y - (at.y - from.z);
  k.fx.spawn({
    sprite: 'fx-dot',
    x: from.x,
    y,
    z: height,
    vx: (at.x + water.x - from.x) / fall,
    vz: -height / fall + (gravity * fall) / 2,
    gravity,
    sway: [k.r(5, 12), k.r(0.6, 1.1)],
    life: fall + 0.6,
    fadeIn: 0.2,
    tint: k.pick(GLITTER),
    scale: [1.3, 0.8],
    layer: 'air',
    add: true,
    onLand: (x, ground) =>
      k.fx.spawn({
        sprite: 'fx-spark',
        x,
        y: ground,
        z: 1,
        life: 0.45,
        scale: [0.6, 0.2],
        alpha: 0.9,
        fadeOut: 0.3,
        layer: 'air',
        add: true,
      }),
  });
}

export const RAINBOW_MAKERS = {
  'fountain-rainbow'(k, { at, seconds }) {
    k.fx.keep('fountain-rainbow:horns', seconds, k.every(0.55, 1), (age, left) => horns(k, at, age, left));
    k.fx.keep('fountain-rainbow:edge', seconds, k.every(0.08, 0.2), (age, left) => edge(k, at, age, left));
    k.fx.keep('fountain-rainbow:glitter', seconds, k.every(0.2, 0.5), (age) => glitter(k, at, age));
  },
} satisfies Record<string, Maker>;
