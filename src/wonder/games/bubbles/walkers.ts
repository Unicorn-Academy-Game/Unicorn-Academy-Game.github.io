import { LIFE } from '../../../content/life';
import { drawPic, type SpriteBank } from '../../engine/bank';
import { clamp, hump, lerp, Spring, TAU } from '../../engine/ease';
import type { Painter } from '../../engine/painter';
import { insidePond, type Plan } from './layout';
import { creatureSprite } from './looks';
import { type Layer, Resident, sameSpot, turnToward, type World } from './residents';

/**
 * The residents that walk on the meadow: ladybugs that wander in short trips and fly a little way
 * when touched, and snails that cross the grass very slowly and leave a trail of glitter. They keep
 * to the meadow: they never walk into the pond or under the friends.
 */

/**
 * Whether something on foot may stand at a point: on the screen, in the meadow, and out of the
 * pond.
 */
function walkable(plan: Plan, x: number, y: number): boolean {
  return (
    x > 14 &&
    x < plan.w - 14 &&
    y > plan.meadow.top + 6 &&
    y < plan.meadow.bottom + 4 &&
    insidePond(plan.pond, x, y) > 1.3
  );
}

/**
 * The nearest point to (x, y) that may be stood on: on the meadow, and if that is in the pond,
 * level with it but to the side of it.
 */
function nearestWalkable(plan: Plan, x: number, y: number): { x: number; y: number } {
  const py = clamp(y, plan.meadow.top + 8, plan.meadow.bottom);
  let px = clamp(x, 16, plan.w - 16);
  if (insidePond(plan.pond, px, py) <= 1.3) {
    const side = px < plan.pond.x ? -1 : 1;
    const edge = plan.pond.x + side * plan.pond.rx * 1.4;
    px = edge > 16 && edge < plan.w - 16 ? edge : plan.pond.x - side * plan.pond.rx * 1.4;
  }
  return { x: px, y: py };
}

abstract class Walker extends Resident {
  readonly layer: Layer = 'ground';
  protected gx: number;
  protected gy: number;
  protected moving = false;
  protected rest = 0.6;
  /** How fast it goes, how long it stops between trips, and how far a trip is. */
  protected abstract readonly speed: number;
  protected abstract readonly restFor: readonly [number, number];
  protected abstract readonly leg: readonly [number, number];
  protected abstract readonly size: number;
  protected vx = 0;
  protected vy = 0;

  constructor(look: number, from: { readonly x: number; readonly y: number }, phase: number, w: World) {
    super(look, from.x, from.y, phase);
    this.gx = from.x;
    this.gy = from.y;
    // Comes down on the meadow near where its bubble burst.
    let at = null as { x: number; y: number } | null;
    for (let i = 0; i < 24 && !at; i++) {
      const x = clamp(from.x + w.rng.range(-90, 90), 20, w.plan.w - 20);
      const y = w.rng.range(w.plan.meadow.top + 10, w.plan.meadow.bottom - 2);
      if (walkable(w.plan, x, y)) at = { x, y };
    }
    at ??= nearestWalkable(w.plan, from.x, w.plan.meadow.bottom - 6);
    this.fall(at.x, at.y, 0.6);
  }

  protected override landed(w: World): void {
    w.hear({ is: 'land', prize: this.prize, x: this.x, y: this.y, look: this.look, wet: false });
    this.rest = 0.5;
    this.gx = this.x;
    this.gy = this.y;
  }

  protected live(dt: number, w: World): void {
    if (!this.moving) {
      this.rest -= dt;
      this.idle(dt, w);
      if (this.rest <= 0) this.setOff(w);
      return;
    }
    const dx = this.gx - this.x;
    const dy = this.gy - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      this.stop(w);
      return;
    }
    const step = Math.min(d, this.speed * dt);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    if (!walkable(w.plan, nx, ny)) {
      this.stop(w);
      return;
    }
    this.x = nx;
    this.y = ny;
    this.vx = (dx / d) * this.speed;
    this.vy = (dy / d) * this.speed;
    this.stepped(dt, w);
  }

  private stop(w: World): void {
    this.moving = false;
    this.vx = 0;
    this.vy = 0;
    this.rest = w.rng.range(...this.restFor);
  }

  private setOff(w: World): void {
    for (let i = 0; i < 10; i++) {
      const a = w.rng.range(0, TAU);
      const len = w.rng.range(...this.leg);
      const x = this.x + Math.cos(a) * len;
      const y = this.y + Math.sin(a) * len * 0.5;
      if (walkable(w.plan, x, y)) {
        this.gx = x;
        this.gy = y;
        this.moving = true;
        return;
      }
    }
    this.rest = 0.5;
  }

  /** What it does while it stands still, and while it walks. */
  protected idle(_dt: number, _w: World): void {}
  protected stepped(_dt: number, _w: World): void {}

  hit(x: number, y: number): boolean {
    if (this.leaving || this.drop) return false;
    const b = LIFE[this.prize === 'snail' ? 'snail' : 'ladybug'].body;
    const dx = (x - this.x) / (b.rx * this.size + 12);
    const dy = (y - (this.y - b.cy * this.size)) / (b.ry * this.size + 12);
    return dx * dx + dy * dy < 1;
  }

  fit(from: Plan, to: Plan): void {
    const p = sameSpot(from, to, this.x, this.y);
    const at = nearestWalkable(to, p.x, p.y);
    this.x = at.x;
    this.y = at.y;
    this.gx = at.x;
    this.gy = at.y;
    this.drop = null;
    this.moving = false;
    this.rest = 0.5;
  }
}

const LADYBUG_SIZE = 0.9;

interface Flight {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  t: number;
}

const FLIGHT_SECONDS = 1;
const FLIGHT_HEIGHT = 26;

export class Ladybug extends Walker {
  readonly prize = 'ladybug' as const;
  protected readonly speed = 20;
  protected readonly restFor = [0.6, 2.2] as const;
  protected readonly leg = [18, 60] as const;
  protected readonly size = LADYBUG_SIZE;
  private facing = 0;
  private flight: Flight | null = null;

  protected override live(dt: number, w: World): void {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const u = clamp(f.t / FLIGHT_SECONDS);
      this.x = lerp(f.x0, f.x1, u);
      this.y = lerp(f.y0, f.y1, u);
      this.facing = turnToward(this.facing, Math.atan2(f.y1 - f.y0, f.x1 - f.x0), 10, dt);
      if (u >= 1) {
        this.flight = null;
        this.gx = this.x;
        this.gy = this.y;
        this.moving = false;
        this.rest = 0.8;
      }
      return;
    }
    super.live(dt, w);
    if (this.moving) this.facing = turnToward(this.facing, Math.atan2(this.vy, this.vx), 9, dt);
  }

  poke(w: World): void {
    if (this.drop || this.flight || this.leaving) return;
    // Opens its wings and flies a little way to another part of the meadow.
    for (let i = 0; i < 10; i++) {
      const a = w.rng.range(0, TAU);
      const len = w.rng.range(55, 95);
      const x = this.x + Math.cos(a) * len;
      const y = this.y + Math.sin(a) * len * 0.5;
      if (walkable(w.plan, x, y)) {
        this.flight = { x0: this.x, y0: this.y, x1: x, y1: y, t: 0 };
        this.moving = false;
        break;
      }
    }
    w.hear({ is: 'poke', prize: 'ladybug', x: this.x, y: this.y - 8, look: this.look });
  }

  protected override parted(): void {
    this.flight = null;
  }

  override fit(from: Plan, to: Plan): void {
    super.fit(from, to);
    this.flight = null;
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const f = this.flight;
    const u = f ? clamp(f.t / FLIGHT_SECONDS) : 0;
    const lift = f ? FLIGHT_HEIGHT * hump(u) : 0;
    const g = p.ctx;
    const shadow = clamp(1 - lift / 50);
    g.fillStyle = `rgba(20,60,24,${0.28 * shadow})`;
    g.beginPath();
    g.ellipse(this.x, this.y + 1, 10 * LADYBUG_SIZE * (0.6 + 0.4 * shadow), 3.4 * LADYBUG_SIZE, 0, 0, TAU);
    g.fill();
    const name = creatureSprite('ladybug', this.look, f ? 'fly' : 'walk');
    const pic = bank?.sprite('life', name, this.moving || f ? this.age + this.phase : 0);
    if (!pic) return;
    drawPic(g, pic, this.x, this.y - 7 * LADYBUG_SIZE - lift, {
      mid: true,
      scale: LADYBUG_SIZE * (1 + lift * 0.004),
      rot: this.drop ? this.age * 7 : this.facing,
      alpha: this.alpha,
    });
  }
}

const SNAIL_SIZE = 0.95;

export class Snail extends Walker {
  readonly prize = 'snail' as const;
  protected readonly speed = 7;
  protected readonly restFor = [1, 4] as const;
  protected readonly leg = [20, 60] as const;
  protected readonly size = SNAIL_SIZE;
  private face = 1;
  private trail = 0;
  private readonly squash = new Spring(0, 0, 200, 9);

  protected override live(dt: number, w: World): void {
    this.squash.step(dt);
    super.live(dt, w);
    if (this.moving && Math.abs(this.vx) > 1) this.face = this.vx < 0 ? -1 : 1;
  }

  protected override stepped(dt: number, w: World): void {
    // It leaves a thread of glitter behind it.
    this.trail -= dt;
    if (this.trail <= 0) {
      this.trail = 0.45;
      w.hear({ is: 'dust', prize: 'snail', x: this.x - this.face * 12, y: this.y - 2, n: 1 });
    }
  }

  poke(w: World): void {
    if (this.drop || this.leaving) return;
    this.squash.kick(-11);
    w.hear({ is: 'poke', prize: 'snail', x: this.x, y: this.y - 14, look: this.look });
    w.hear({ is: 'dust', prize: 'snail', x: this.x, y: this.y - 14, n: 10 });
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const g = p.ctx;
    g.fillStyle = 'rgba(20,60,24,0.28)';
    g.beginPath();
    g.ellipse(this.x, this.y + 1, 17 * SNAIL_SIZE, 4.5 * SNAIL_SIZE, 0, 0, TAU);
    g.fill();
    const pic = bank?.sprite(
      'life',
      creatureSprite('snail', this.look, 'crawl'),
      (this.moving ? this.age : this.age * 0.35) + this.phase,
    );
    if (!pic) return;
    const s = this.squash.x;
    drawPic(g, pic, this.x, this.y, {
      scale: SNAIL_SIZE,
      sx: 1 - s * 0.12,
      sy: 1 + s * 0.18,
      flip: this.face < 0,
      rot: this.drop ? this.age * 6 : 0,
      alpha: this.alpha,
    });
  }
}
