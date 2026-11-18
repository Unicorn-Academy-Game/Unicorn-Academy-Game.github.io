import Phaser from 'phaser';
import { DEPTH } from '../depth';
import type { SpriteSet } from '../sprites';

/** Where a particle sits in the draw order. */
type Layer =
  /** Flat on the ground, under every creature (rings, ripples). */
  | 'ground'
  /** Above everything that stands, below the canopy (sparks, hearts, bolts). */
  | 'air';

/**
 * One particle, described in ground coordinates plus a height. A particle at ground (x, y) and
 * height z is drawn at screen y - z, so rising things climb the screen while their ground point
 * stays put.
 */
export interface Spec {
  sprite: string;
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Downward acceleration on height, units per second squared. */
  gravity?: number;
  /** Fraction of velocity lost per second. */
  drag?: number;
  /** Sideways drift: amplitude in units per second and frequency in hertz. */
  sway?: readonly [number, number];
  life: number;
  delay?: number;
  /** Scale at birth and at death. */
  scale?: readonly [number, number];
  /** Seconds a spring-in overshoot takes at the start. */
  pop?: number;
  alpha?: number;
  fadeIn?: number;
  fadeOut?: number;
  rot?: number;
  spin?: number;
  tint?: number;
  add?: boolean;
  /**
   * How frames advance. `loop` repeats at the sprite's own speed, `once` plays through then holds
   * the last frame, and `life` stretches the whole animation across the particle's life.
   */
  anim?: 'loop' | 'once' | 'life';
  layer?: Layer;
  flipX?: boolean;
  /**
   * Called once when the particle falls back to the ground, with where. The particle ends there.
   */
  onLand?: (x: number, y: number) => void;
}

interface Particle {
  image: Phaser.GameObjects.Image;
  live: boolean;
  spec: Spec;
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
}

/**
 * What a source is told each time it spawns: how long it has been going, and how long it has left
 * to go.
 */
type Spawner = (age: number, left: number) => void;

/** A source that spawns on a timer for a while, such as a fountain spout. */
interface Emitter {
  /** What a second call for the same source is known by, for a source that can be kept going. */
  key: string | undefined;
  since: number;
  until: number;
  every: number;
  next: number;
  spawn: Spawner;
}

const POOL = 480;

/**
 * Added to an additive glow's depth when glows go last. It is more than the whole range of the
 * height term, so every glow sorts after every other particle.
 */
const GLOW_BAND = 1;

const easeOutBack = (t: number): number => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * The particle engine. Particles are pooled images from one sprite sheet, so a busy burst is a
 * single draw call, and nothing is allocated while the game runs. When the pool is empty new
 * particles are not shown, which is the right failure for decoration.
 */
export class Fx {
  private readonly pool: Particle[] = [];
  private readonly emitters: Emitter[] = [];
  private clock = 0;
  private snap = 1;

  /**
   * With `glowsLast` every additive particle is drawn after every other one. The draw order inside
   * the effects layer is by height on the ground, so otherwise glows and ordinary sparks alternate,
   * and each change of blend ends a draw call.
   */
  constructor(
    scene: Phaser.Scene,
    private readonly sprites: SpriteSet,
    readonly rand: () => number = Math.random,
    private readonly glowsLast = false,
  ) {
    for (let i = 0; i < POOL; i++) {
      const image = scene.add.image(0, 0, '__DEFAULT').setVisible(false).setActive(false);
      this.pool.push({
        image,
        live: false,
        spec: { sprite: '', x: 0, y: 0, life: 1 },
        age: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        phase: 0,
      });
    }
  }

  get liveCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.live) n++;
    return n;
  }

  /**
   * Positions snap to whole framebuffer pixels, so resting particles are crisp. `k` is framebuffer
   * pixels per world unit.
   */
  setSnap(k: number): void {
    this.snap = Math.max(1, k);
  }

  spawn(spec: Spec): void {
    const p = this.pool.find((q) => !q.live);
    if (!p) return;
    p.live = true;
    p.spec = spec;
    p.age = 0;
    p.x = spec.x;
    p.y = spec.y;
    p.z = spec.z ?? 0;
    p.vx = spec.vx ?? 0;
    p.vy = spec.vy ?? 0;
    p.vz = spec.vz ?? 0;
    p.phase = this.rand() * Math.PI * 2;
    const img = p.image;
    img.setActive(true).setVisible(false);
    img.setBlendMode(spec.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    img.setTint(spec.tint ?? 0xffffff);
    img.setFlipX(spec.flipX ?? false);
    if (!spec.delay) this.show(p, 0);
  }

  /** Runs `spawn` every `every` seconds for `seconds`, starting now. */
  emit(seconds: number, every: number, spawn: Spawner): void {
    this.emitters.push({
      key: undefined,
      since: this.clock,
      until: this.clock + seconds,
      every,
      next: this.clock,
      spawn,
    });
  }

  /**
   * Like `emit`, for a source that a second call should keep going and not start beside the first.
   * While the source known by `key` is running, a call makes it run until `seconds` from now, if
   * that is later than it was going to, and starts nothing. Says whether this call started the
   * source.
   */
  keep(key: string, seconds: number, every: number, spawn: Spawner): boolean {
    const running = this.emitters.find((e) => e.key === key);
    if (running) {
      running.until = Math.max(running.until, this.clock + seconds);
      return false;
    }
    this.emitters.push({ key, since: this.clock, until: this.clock + seconds, every, next: this.clock, spawn });
    return true;
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    this.clock += dt;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]!;
      while (e.next <= this.clock && e.next < e.until) {
        e.spawn(e.next - e.since, e.until - e.next);
        e.next += e.every;
      }
      if (e.next >= e.until) this.emitters.splice(i, 1);
    }

    for (const p of this.pool) {
      if (!p.live) continue;
      const s = p.spec;
      const delay = s.delay ?? 0;
      p.age += dt;
      if (p.age < delay) continue;
      const age = p.age - delay;
      if (age >= s.life) {
        this.kill(p);
        continue;
      }
      const drag = Math.exp(-(s.drag ?? 0) * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz = p.vz * drag - (s.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (s.sway) p.x += Math.sin(age * s.sway[1] * Math.PI * 2 + p.phase) * s.sway[0] * dt;
      if (p.z <= 0 && p.vz < 0 && s.gravity) {
        p.z = 0;
        s.onLand?.(p.x, p.y);
        this.kill(p);
        continue;
      }
      this.show(p, age);
    }
  }

  private show(p: Particle, age: number): void {
    const s = p.spec;
    const t = Math.min(1, age / s.life);
    const img = p.image;
    const sprite = this.sprites.get(s.sprite);
    const frames = sprite.frames.length;
    let index = 0;
    if (frames > 1) {
      const mode = s.anim ?? (sprite.loop ? 'loop' : 'once');
      const raw = Math.floor((age * 1000) / sprite.frames[0]!.ms);
      index =
        mode === 'life'
          ? Math.min(frames - 1, Math.floor(t * frames))
          : mode === 'once'
            ? Math.min(frames - 1, raw)
            : raw % frames;
    }
    this.sprites.show(img, s.sprite, index);

    const [s0, s1] = s.scale ?? [1, 1];
    let scale = s0 + (s1 - s0) * t;
    if (s.pop && age < s.pop) scale *= Math.max(0.01, easeOutBack(age / s.pop));
    img.setScale(scale);

    const fadeIn = s.fadeIn ?? 0,
      fadeOut = s.fadeOut ?? 0;
    let alpha = s.alpha ?? 1;
    if (fadeIn > 0) alpha *= Math.min(1, age / fadeIn);
    if (fadeOut > 0) alpha *= Math.min(1, (s.life - age) / fadeOut);
    img.setAlpha(Math.max(0, alpha));

    img.setRotation((s.rot ?? 0) + (s.spin ?? 0) * age);
    const k = this.snap;
    img.setPosition(Math.round(p.x * k) / k, Math.round((p.y - p.z) * k) / k);
    img.setDepth(
      s.layer === 'ground'
        ? DEPTH.groundDetail + 10 + p.y / 100_000
        : DEPTH.effects + (this.glowsLast && s.add ? GLOW_BAND : 0) + p.y / 100_000,
    );
    img.setVisible(alpha > 0.003);
  }

  private kill(p: Particle): void {
    p.live = false;
    p.image.setVisible(false).setActive(false);
  }

  clear(): void {
    this.emitters.length = 0;
    for (const p of this.pool) if (p.live) this.kill(p);
  }

  destroy(): void {
    for (const p of this.pool) p.image.destroy();
    this.pool.length = 0;
    this.emitters.length = 0;
  }
}
