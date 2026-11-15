import type { Rng } from '../../../domain/rng';
import { lighten, mix, RAINBOW, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import type { Particles } from '../../engine/particles';
import { type ShellKind, shell } from '../shells';
import { PHYSICS, type Scheme } from './looks';

/**
 * The sparks of a shell as it opens: a shape drawn in the air by points of light that grow out to
 * their places together and hold for a moment, then fall, with glitter that drifts down after. The
 * game adds what is its own, the flash and the sound.
 */

/** How much wider a spark is drawn than the table says. */
const SPARK = 1.2;

export interface Shell {
  readonly x: number;
  readonly y: number;
  readonly kind: ShellKind;
  readonly scheme: Scheme;
  /** How far from its middle the shape reaches, in units. */
  readonly radius: number;
  /** How big a shell it is, around 1. Bigger has more sparks and more glitter. */
  readonly power: number;
  /**
   * How fine its sparks are, from 0 to 1, which is 1 if left out. A shell that opens small has the
   * same shape in less room, so its sparks are fewer and smaller, or they run together into a solid
   * patch.
   */
  readonly fine?: number;
}

/** Opens a shell. */
export function burstShell(fx: Particles, rng: Rng, o: Shell): void {
  const { x, y, kind, scheme: sc, radius, power } = o;
  const fine = o.fine ?? 1;
  const physics = PHYSICS[kind];
  const sparks = shell(kind, fx.count(physics.count * (0.8 + 0.3 * power) * fine), rng);
  // Every spark leaves at the speed that carries it to its place in `grow` seconds under drag,
  // however far its place is.
  const launch = physics.drag / (1 - Math.exp(-physics.drag * physics.grow));
  const ember = mix(sc.colors[sc.colors.length - 1]!, [255, 130, 60], 0.35);
  for (const s of sparks) {
    // A rainbow is always the colours of the rainbow, whatever the night's colours are.
    const c = ramp(kind === 'rainbow' ? RAINBOW : sc.colors, s.tone);
    const size = physics.size * SPARK * Math.sqrt(fine);
    fx.emit({
      x,
      y,
      vx: s.x * radius * launch,
      vy: s.y * radius * launch,
      life: rng.range(physics.life[0], physics.life[1]) + (kind === 'spiral' ? s.delay : 0),
      size: size * (0.85 + 0.3 * rng.next()),
      size1: size * 0.5,
      halo: physics.halo,
      color: lighten(c, physics.lift),
      color1: mix(c, ember, 0.28),
      alpha: 1,
      alpha1: 0,
      hold: physics.hold,
      grow: 0.2,
      shape: 'spark',
      tail: physics.tail,
      drag: physics.drag,
      gravity: physics.gravity,
      twinkle: rng.next() < physics.twinkle ? (kind === 'crackle' ? rng.range(22, 34) : rng.range(6, 14)) : 0,
      trail: physics.trail,
      delay: s.delay * 0.4,
    });
  }
  // Glitter that falls after the shape has opened.
  for (let i = fx.count(26 + 18 * power); i > 0; i--) {
    const a = rng.range(0, TAU);
    const speed = rng.range(0.3, 1) * radius * 1.1;
    const c = sc.colors[rng.int(sc.colors.length)]!;
    fx.emit({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: rng.range(1.8, 3.2),
      size: rng.range(3, 5),
      size1: 1,
      color: lighten(c, 0.7),
      color1: c,
      shape: rng.next() < 0.25 ? 'star4' : 'glow',
      drag: 1.4,
      gravity: 12,
      sway: 14,
      twinkle: rng.range(8, 17),
      hold: 0.3,
    });
  }
}

/** The colour `tone` of the way along a list of colours. */
function ramp(colors: readonly RGB[], tone: number): RGB {
  if (colors.length === 1) return colors[0]!;
  const f = Math.min(0.9999, Math.max(0, tone)) * (colors.length - 1);
  const i = Math.floor(f);
  return mix(colors[i]!, colors[i + 1]!, f - i);
}
