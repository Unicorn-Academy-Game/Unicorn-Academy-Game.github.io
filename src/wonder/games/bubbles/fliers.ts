import { LIFE } from '../../../content/life';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { clamp, damp, TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { PRIZE } from './kinds';
import type { Plan } from './layout';
import { creatureSprite } from './looks';
import { type Bloom, type Layer, lowAir, Resident, sameSpot, type World } from './residents';

/**
 * The residents that fly: butterflies that drift from flower to flower and sit on them, bees that
 * hover and sip, and the fairy who blesses a flower so that it glows. They live in the air over the
 * meadow, behind the bubbles, so a bubble in front of one can always be popped.
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Everything that flies has a goal it steers toward, can loop the loop when it is touched, and
 * flies away when the garden is full.
 */
abstract class Flyer extends Resident {
  readonly layer: Layer = 'air';
  protected vx = 0;
  protected vy = 0;
  protected gx: number;
  protected gy: number;
  private spinLeft = 0;
  private spinRate = 0;
  private spinSpeed = 0;
  private spinAngle = 0;
  private exitX = 0;
  /** Half the width and height of the place a touch counts, in units. */
  protected abstract readonly body: { readonly rx: number; readonly ry: number };

  constructor(look: number, from: Point, phase: number) {
    super(look, from.x, from.y, phase);
    this.gx = from.x;
    this.gy = from.y;
  }

  /** Turns its velocity toward the goal and returns how far off the goal is. */
  protected steer(dt: number, speed: number, rate: number): number {
    const dx = this.gx - this.x;
    const dy = this.gy - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) {
      this.vx = damp(this.vx, (dx / d) * speed, rate, dt);
      this.vy = damp(this.vy, (dy / d) * speed, rate, dt);
    }
    return d;
  }

  /** Flies a circle for `seconds`, one turn, at `speed`, and so comes back to where it began. */
  protected twirl(seconds: number, speed: number): void {
    this.spinLeft = seconds;
    this.spinRate = TAU / seconds;
    this.spinSpeed = speed;
    this.spinAngle = Math.atan2(this.vy, this.vx);
  }

  protected get twirling(): boolean {
    return this.spinLeft > 0;
  }

  /** One step of a loop. */
  protected circle(dt: number): void {
    this.spinLeft = Math.max(0, this.spinLeft - dt);
    this.spinAngle += this.spinRate * dt;
    this.vx = Math.cos(this.spinAngle) * this.spinSpeed;
    this.vy = Math.sin(this.spinAngle) * this.spinSpeed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  protected override parted(w: World): void {
    this.exitX = this.x < w.plan.w / 2 ? -90 : w.plan.w + 90;
  }

  protected override depart(dt: number, w: World): void {
    this.gx = this.exitX;
    this.gy = this.y - 70;
    this.steer(dt, 120, 2.4);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -80 || this.x > w.plan.w + 80 || this.y < -80) this.gone = true;
  }

  hit(x: number, y: number): boolean {
    if (this.leaving) return false;
    const dx = (x - this.x) / (this.body.rx + 8);
    const dy = (y - this.y) / (this.body.ry + 8);
    return dx * dx + dy * dy < 1;
  }

  fit(from: Plan, to: Plan): void {
    const p = sameSpot(from, to, this.x, this.y);
    this.x = p.x;
    this.y = p.y;
    this.gx = p.x;
    this.gy = p.y;
    this.vx = 0;
    this.vy = 0;
  }

  /** Keeps it on the screen. */
  protected keepIn(w: World, margin = 10): void {
    this.x = clamp(this.x, margin, w.plan.w - margin);
  }
}

const BUTTERFLY_SIZE = 0.85;
const BUTTERFLY_SPEED = 38;

export class Butterfly extends Flyer {
  readonly prize = 'butterfly' as const;
  protected readonly body = {
    rx: LIFE.butterfly.body.rx * BUTTERFLY_SIZE,
    ry: LIFE.butterfly.body.ry * BUTTERFLY_SIZE,
  };
  /** The flower it sits on, and the flower it is flying to. */
  private on: Bloom | null = null;
  private toward: Bloom | null = null;
  private rest = 0;
  private fright = 0;

  constructor(look: number, from: Point, phase: number, w: World) {
    super(look, from, phase);
    this.vy = -30;
    this.choose(w);
  }

  /** Whether it is sitting on a flower. */
  get perched(): boolean {
    return this.on !== null;
  }

  /** Where to go next: a flower nobody is on, about half the time, or anywhere in the low air. */
  private choose(w: World): void {
    this.release();
    const free = w.blooms.filter((b) => b.ready && !b.taken);
    if (free.length > 0 && w.rng.next() < 0.55) {
      const pick = w.rng.weighted(free, (b) => 1 / (Math.hypot(b.head.x - this.x, b.head.y - this.y) + 80));
      if (pick) {
        pick.taken = true;
        this.toward = pick;
        this.gx = pick.head.x;
        this.gy = pick.head.y;
        return;
      }
    }
    const air = lowAir(w.plan);
    this.gx = clamp(this.x + w.rng.range(-150, 150), 24, w.plan.w - 24);
    this.gy = w.rng.range(air.top, air.bottom);
  }

  /** Lets go of the flower it sits on or was flying to. */
  private release(): void {
    if (this.on) this.on.taken = false;
    if (this.toward) this.toward.taken = false;
    this.on = null;
    this.toward = null;
  }

  protected override parted(w: World): void {
    this.release();
    super.parted(w);
  }

  protected live(dt: number, w: World): void {
    const t = this.age + this.phase;
    if (this.on) {
      if (!this.on.ready) {
        this.vy = -26;
        this.choose(w);
        return;
      }
      this.x = damp(this.x, this.on.head.x, 14, dt);
      this.y = damp(this.y, this.on.head.y - 3, 14, dt);
      this.rest -= dt;
      if (this.rest <= 0) {
        this.vy = -26;
        this.choose(w);
      }
      return;
    }
    if (this.twirling) {
      this.circle(dt);
      if (!this.twirling) this.choose(w);
      this.keepIn(w);
      return;
    }
    if (this.toward) {
      if (!this.toward.ready) this.choose(w);
      else {
        this.gx = this.toward.head.x;
        this.gy = this.toward.head.y - 2;
      }
    }
    const d = this.steer(dt, this.fright > 0 ? 95 : BUTTERFLY_SPEED, 2.2);
    this.fright = Math.max(0, this.fright - dt);
    this.x += (this.vx + Math.cos(t * 3.3) * 9) * dt;
    this.y += (this.vy + Math.sin(t * 5.1) * 14 + Math.sin(t * 8.7) * 5) * dt;
    this.keepIn(w);
    if (d < (this.toward ? 5 : 16)) this.arrive(w);
  }

  private arrive(w: World): void {
    if (this.toward?.ready) {
      this.on = this.toward;
      this.toward = null;
      this.rest = w.rng.range(3.5, 7);
      this.vx = 0;
      this.vy = 0;
    } else this.choose(w);
  }

  poke(w: World): void {
    this.release();
    this.fright = 0;
    this.twirl(LIFE.butterfly.tapped.kind === 'twirl' ? LIFE.butterfly.tapped.seconds : 1.2, 62);
    w.hear({ is: 'poke', prize: 'butterfly', x: this.x, y: this.y, look: this.look });
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const pic = bank?.sprite(
      'life',
      creatureSprite('butterfly', this.look, 'flutter'),
      this.age * (this.on ? 0.3 : 1) + this.phase,
    );
    if (!pic) return;
    drawPic(p.ctx, pic, this.x, this.y, {
      mid: true,
      scale: BUTTERFLY_SIZE,
      rot: clamp(this.vx * 0.006, -0.35, 0.35),
      alpha: this.alpha,
    });
  }
}

const BEE_SIZE = 0.85;
const BEE_SPEED = 62;

type BeeMood = 'go' | 'sip' | 'roam';

export class Bee extends Flyer {
  readonly prize = 'bee' as const;
  protected readonly body = { rx: LIFE.bee.body.rx * BEE_SIZE, ry: LIFE.bee.body.ry * BEE_SIZE };
  private mood: BeeMood = 'roam';
  private flower: Bloom | null = null;
  private side = 1;
  private stay = 0;
  private sipAt = 0;
  private faceLeft = false;

  constructor(look: number, from: Point, phase: number, w: World) {
    super(look, from, phase);
    this.vy = -20;
    this.choose(w);
  }

  /** Off to a flower, one other than the one it just left, or to wander if there are none. */
  private choose(w: World): void {
    const options = w.blooms.filter((b) => b.ready && b !== this.flower);
    const pick = options.length > 0 && w.rng.next() < 0.8 ? w.rng.pick(options) : null;
    this.flower = pick;
    if (pick) {
      this.mood = 'go';
      this.side = w.rng.next() < 0.5 ? -1 : 1;
    } else {
      this.mood = 'roam';
      const air = lowAir(w.plan);
      this.gx = clamp(this.x + w.rng.range(-140, 140), 24, w.plan.w - 24);
      this.gy = w.rng.range(air.top, air.bottom);
    }
  }

  protected live(dt: number, w: World): void {
    const t = this.age + this.phase;
    if (this.twirling) {
      this.circle(dt);
      if (!this.twirling) this.choose(w);
      this.keepIn(w);
      return;
    }
    const f = this.flower;
    if (f && !f.ready) this.choose(w);
    if (this.mood === 'sip' && f) {
      // Hovers beside the flower in a small figure of eight, and sips now and then.
      this.stay -= dt;
      this.gx = f.head.x + this.side * 17 + Math.sin(t * 2.6) * 6;
      this.gy = f.head.y - 12 + Math.sin(t * 5.2) * 3;
      this.x = damp(this.x, this.gx, 7, dt);
      this.y = damp(this.y, this.gy, 7, dt);
      this.vx = 0;
      this.vy = 0;
      this.sipAt -= dt;
      if (this.sipAt <= 0) {
        this.sipAt = 0.85;
        w.hear({ is: 'sip', x: f.head.x, y: f.head.y });
      }
      if (this.stay <= 0) this.choose(w);
      this.faceLeft = this.side > 0;
      return;
    }
    if (this.mood === 'go' && f) {
      this.gx = f.head.x + this.side * 17;
      this.gy = f.head.y - 12;
    }
    const d = this.steer(dt, BEE_SPEED, 3);
    this.x += this.vx * dt;
    this.y += this.vy * dt + Math.sin(t * 3.4) * 5 * dt;
    this.keepIn(w);
    if (Math.abs(this.vx) > 6) this.faceLeft = this.vx < 0;
    if (d < (this.mood === 'go' ? 6 : 16)) {
      if (this.mood === 'go') {
        this.mood = 'sip';
        this.stay = w.rng.range(1.5, 3.2);
        this.sipAt = 0.2;
      } else this.choose(w);
    }
  }

  poke(w: World): void {
    this.twirl(LIFE.bee.tapped.kind === 'twirl' ? LIFE.bee.tapped.seconds : 1, 74);
    this.flower = null;
    w.hear({ is: 'poke', prize: 'bee', x: this.x, y: this.y, look: this.look });
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const pic = bank?.sprite('life', creatureSprite('bee', this.look, 'fly'), this.age + this.phase);
    if (!pic) return;
    // A bee hums, so it shivers a hair as it goes.
    const t = this.age * 61 + this.phase;
    drawPic(p.ctx, pic, this.x + Math.sin(t) * 0.4, this.y + Math.cos(t * 1.3) * 0.4, {
      mid: true,
      scale: BEE_SIZE,
      flip: this.faceLeft,
      rot: clamp(this.vx * 0.004, -0.25, 0.25) * (this.faceLeft ? -1 : 1),
      alpha: this.alpha,
    });
  }
}

const FAIRY_SIZE = 0.58;
const FAIRY_SPEED = 30;
/** Dust a second she leaves behind her as she goes. */
const DUST_RATE = 15;

type FairyMood = 'drift' | 'visit' | 'bless';

export class Fairy extends Flyer {
  readonly prize = 'fairy' as const;
  protected readonly body = { rx: LIFE.fairy.body.rx * FAIRY_SIZE, ry: LIFE.fairy.body.ry * FAIRY_SIZE };
  private mood: FairyMood = 'drift';
  private flower: Bloom | null = null;
  private wait: number;
  private orbit = 0;
  private dust = 0;
  private faceLeft = false;

  constructor(look: number, from: Point, phase: number, w: World) {
    super(look, from, phase);
    this.vy = -24;
    this.wait = w.rng.range(2.2, 4.5);
    this.wander(w);
  }

  private wander(w: World): void {
    this.mood = 'drift';
    this.flower = null;
    const top = w.plan.roam.top + 20;
    this.gx = clamp(this.x + w.rng.range(-170, 170), 40, w.plan.w - 40);
    this.gy = w.rng.range(top, Math.max(top + 20, w.plan.horizon + 10));
  }

  protected live(dt: number, w: World): void {
    const t = this.age + this.phase;
    this.dust += dt * DUST_RATE;
    while (this.dust >= 1) {
      this.dust -= 1;
      w.hear({ is: 'dust', prize: 'fairy', x: this.x - (this.faceLeft ? -9 : 9), y: this.y + 5, n: 1 });
    }
    if (this.twirling) {
      this.circle(dt);
      if (!this.twirling) this.wander(w);
      this.keepIn(w, 30);
      return;
    }
    const f = this.flower;
    if (this.mood !== 'drift' && !f?.ready) this.wander(w);
    if (this.mood === 'bless' && f) {
      // Goes round the flower once, and touches it with her light.
      this.orbit += dt;
      const a = this.orbit * (TAU / 1.3);
      this.x = damp(this.x, f.head.x + Math.cos(a) * 20, 9, dt);
      this.y = damp(this.y, f.head.y - 24 + Math.sin(a) * 9, 9, dt);
      this.faceLeft = Math.sin(a) > 0;
      if (this.orbit >= 1.3) {
        f.glow = 1;
        w.hear({ is: 'bless', x: f.head.x, y: f.head.y });
        this.wait = w.rng.range(3.5, 7);
        this.wander(w);
      }
      return;
    }
    if (this.mood === 'visit' && f) {
      this.gx = f.head.x + 20;
      this.gy = f.head.y - 24;
    }
    const d = this.steer(dt, this.mood === 'visit' ? 58 : FAIRY_SPEED, 1.6);
    this.x += this.vx * dt;
    this.y += this.vy * dt + Math.sin(t * 1.7) * 7 * dt;
    this.keepIn(w, 30);
    if (Math.abs(this.vx) > 5) this.faceLeft = this.vx < 0;
    if (this.mood === 'visit' && d < 8) {
      this.mood = 'bless';
      this.orbit = 0;
    } else if (this.mood === 'drift') {
      this.wait -= dt;
      const ready = w.blooms.filter((b) => b.ready);
      if (this.wait <= 0 && ready.length > 0) {
        this.flower = w.rng.pick(ready);
        this.mood = 'visit';
      } else if (d < 14) this.wander(w);
    }
  }

  poke(w: World): void {
    this.mood = 'drift';
    this.flower = null;
    this.wait = w.rng.range(2, 4);
    this.twirl(LIFE.fairy.tapped.kind === 'twirl' ? LIFE.fairy.tapped.seconds : 1.7, 70);
    w.hear({ is: 'poke', prize: 'fairy', x: this.x, y: this.y, look: this.look });
    w.hear({ is: 'dust', prize: 'fairy', x: this.x, y: this.y, n: 14 });
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const pic = bank?.sprite('life', creatureSprite('fairy', this.look, 'fly'), this.age + this.phase);
    if (!pic) return;
    const pulse = 0.75 + 0.25 * Math.sin(this.age * 4 + this.phase);
    glowAt(p.light, this.x, this.y, 52, PRIZE.fairy.color, 0.4 * pulse * this.alpha);
    drawPic(p.ctx, pic, this.x, this.y, {
      mid: true,
      scale: FAIRY_SIZE,
      flip: this.faceLeft,
      rot: clamp(this.vx * 0.004, -0.2, 0.2) * (this.faceLeft ? -1 : 1),
      alpha: this.alpha,
    });
  }
}
