import type { DomainEvent, World } from '../../src/domain';
import { type EffectCall, playEffect } from '../../src/render/fx/library';
import { Fx, type Spec } from '../../src/render/fx/system';
import { mulberry32 } from '../../tools/art/core/rng';

/**
 * The real effects system with no screen, to count particles in a world that is being played. A
 * test that uses it mocks `phaser` first, because the effects system takes its two blend modes from
 * Phaser, which cannot be loaded without a window:
 *   vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
 */

/** A picture that does what it is told and keeps nothing. */
class Picture {
  setActive = (): this => this;
  setVisible = (): this => this;
  setBlendMode = (): this => this;
  setTint = (): this => this;
  setFlipX = (): this => this;
  setScale = (): this => this;
  setAlpha = (): this => this;
  setRotation = (): this => this;
  setPosition = (): this => this;
  setDepth = (): this => this;
  destroy = (): void => undefined;
}
const scene = { add: { image: () => new Picture() } } as never;
const sprites = { get: () => ({ frames: [{ ms: 100 }], loop: true }), show: () => undefined } as never;

/** The effects system, counting what it was asked for and what it had no room for. */
export class Counted extends Fx {
  asked = 0;
  refused = 0;
  peak = 0;

  constructor(seed: number) {
    super(scene, sprites, mulberry32(seed));
  }

  override spawn(spec: Spec): void {
    const before = this.liveCount;
    super.spawn(spec);
    this.asked++;
    if (this.liveCount === before) this.refused++;
  }

  /** One frame at 60 a second. Returns how many particles are alive after it. */
  frame(): number {
    this.update(1000 / 60);
    const live = this.liveCount;
    this.peak = Math.max(this.peak, live);
    return live;
  }
}

/**
 * What the game draws for the events a world raised, which is what the controller does with them.
 * `sparkles` is the share a profile throws.
 */
export function draw(fx: Fx, events: readonly DomainEvent[], sparkles = 1): void {
  const play = (call: EffectCall): void => playEffect(fx, call, false, sparkles);
  for (const e of events) {
    if (e.type === 'command-accepted') play({ id: 'tap', at: e.at, seconds: 0.4 });
    else if (e.type === 'command-refused') play({ id: 'refusal', at: e.at, seconds: 0.4 });
    else if (e.type === 'effect')
      play({ id: e.effect, at: e.at, seconds: e.seconds, facing: e.facing, lift: e.lift, share: e.share });
    else if (e.type === 'produce-collected') play({ id: 'pip-sparkle', at: e.at, seconds: 0.7 });
  }
}

/**
 * Watches a play of the census, which hands it the world after every step of the world, before the
 * events are taken. It draws two frames for each step, as the game does, and remembers the most
 * particles that were alive at once.
 */
export class ParticleWatch {
  private readonly fx = new Counted(11);
  private here = '';
  worst = { live: 0, where: '' };

  readonly inspect = (world: World, where: string): void => {
    // A new visit is a new map, and a map change clears whatever is playing.
    if (where !== this.here) {
      this.fx.clear();
      this.here = where;
    }
    draw(this.fx, world.events);
    this.fx.frame();
    const live = this.fx.frame();
    if (live > this.worst.live) this.worst = { live, where: `${where} at ${world.time.toFixed(1)} s` };
  };
}
