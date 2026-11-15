import { LIFE } from '../../../content/life';
import { drawPic, type SpriteBank } from '../../engine/bank';
import type { RGB } from '../../engine/color';
import { clamp, damp, hump, lerp, TAU } from '../../engine/ease';
import type { Painter } from '../../engine/painter';
import { insidePond, type Plan } from './layout';
import { creatureSprite } from './looks';
import { type Layer, Resident, sameSpot, type World } from './residents';

/**
 * A fish of the pond. It falls from its bubble in an arc and splashes in, swims slowly under the
 * lilies, and now and then leaps clear of the water and dives back in with a ring that spreads. A
 * touch makes it leap at once.
 */

const SIZE = 0.95;
const SPEED = 18;
/** How much faster it swims toward a touch on the water, and for how long, in seconds. */
const EAGER = 2.4;
const EAGER_SECONDS = 3;
/** How far in from the edge of the pond, as a share of its radius, a fish keeps. */
const KEEP = 0.8;
/** Seconds between one leap and the next. */
const LEAP_EVERY: readonly [number, number] = [6, 14];
const LEAP_SECONDS = 0.95;
/** How high a leap goes, in units. */
const LEAP_HEIGHT = 40;
/** The blue of the water that is over a fish under the surface. */
const WATER: RGB = [80, 170, 230];

interface Leap {
  readonly x0: number;
  readonly x1: number;
  t: number;
}

export class Fish extends Resident {
  readonly prize = 'fish' as const;
  private vx = 0;
  private vy = 0;
  private gx = 0;
  private gy = 0;
  private face = 1;
  private leapIn: number;
  /** Seconds left that it swims in a hurry, after a touch on the water. */
  private eager = 0;
  private leap: Leap | null = null;

  constructor(look: number, from: { readonly x: number; readonly y: number }, phase: number, w: World) {
    super(look, from.x, from.y, phase);
    this.leapIn = w.rng.range(3.5, 6);
    const pond = w.plan.pond;
    const a = w.rng.range(0, TAU);
    const r = Math.sqrt(w.rng.next()) * 0.6;
    const x = pond.x + Math.cos(a) * pond.rx * r;
    const y = pond.y + Math.sin(a) * pond.ry * r;
    this.face = x < from.x ? -1 : 1;
    this.fall(x, y, 0.9, 34);
    this.gx = x;
    this.gy = y;
  }

  /**
   * The leapers and the ones falling in are over the water, so they are drawn with the things on
   * the meadow. The swimmers are under it.
   */
  get layer(): Layer {
    return this.drop || this.leap ? 'ground' : 'water';
  }

  /** Where the fish is in the picture from front to back: on the water, not up in the air. */
  override get depth(): number {
    return this.drop ? this.drop.y1 : this.y;
  }

  /** How far above the water it is, and the point on the water under it. */
  private get lift(): { readonly height: number; readonly shadowY: number } {
    const d = this.drop;
    if (d) {
      const shadowY = lerp(d.y0, d.y1, clamp(d.t / d.seconds));
      return { height: shadowY - this.y, shadowY };
    }
    return { height: this.leap ? LEAP_HEIGHT * hump(this.leap.t / LEAP_SECONDS) : 0, shadowY: this.y };
  }

  protected override landed(w: World): void {
    w.hear({ is: 'land', prize: 'fish', x: this.x, y: this.y, look: this.look, wet: true });
    this.swimOn(w);
  }

  private swimOn(w: World): void {
    const pond = w.plan.pond;
    const a = w.rng.range(0, TAU);
    const r = Math.sqrt(w.rng.next()) * 0.72;
    this.gx = pond.x + Math.cos(a) * pond.rx * r;
    this.gy = pond.y + Math.sin(a) * pond.ry * r;
  }

  protected live(dt: number, w: World): void {
    if (this.leap) {
      this.stepLeap(dt, w);
      return;
    }
    this.leapIn -= dt;
    if (this.leapIn <= 0) {
      this.jump(w);
      return;
    }
    const pond = w.plan.pond;
    const dx = this.gx - this.x;
    const dy = this.gy - this.y;
    const d = Math.hypot(dx, dy);
    const speed = this.eager > 0 ? SPEED * EAGER : SPEED;
    this.eager = Math.max(0, this.eager - dt);
    if (d > 0.001) {
      this.vx = damp(this.vx, (dx / d) * speed, 1.6, dt);
      this.vy = damp(this.vy, (dy / d) * speed, 1.6, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // The edge of the pond turns it back toward the middle.
    const k = insidePond(pond, this.x, this.y);
    if (k > KEEP) {
      this.x = pond.x + ((this.x - pond.x) / k) * KEEP;
      this.y = pond.y + ((this.y - pond.y) / k) * KEEP;
      this.swimOn(w);
    }
    if (d < 6) this.swimOn(w);
    if (Math.abs(this.vx) > 2) this.face = this.vx < 0 ? -1 : 1;
  }

  /** Leaps toward the middle of the pond, so it lands in it. */
  private jump(w: World): void {
    const pond = w.plan.pond;
    const dir = w.rng.next() < 0.75 ? Math.sign(pond.x - this.x) || 1 : w.rng.next() < 0.5 ? -1 : 1;
    // It comes down still inside the pond: how far it may go along its row is how wide the pond is
    // there.
    const row = (this.y - pond.y) / pond.ry;
    const reach = pond.rx * Math.sqrt(Math.max(0.01, KEEP * KEEP - row * row));
    const x1 = clamp(this.x + dir * w.rng.range(30, 44), pond.x - reach, pond.x + reach);
    this.leap = { x0: this.x, x1, t: 0 };
    this.face = dir < 0 ? -1 : 1;
    this.vx = 0;
    this.vy = 0;
    w.hear({ is: 'leap', x: this.x, y: this.y, up: true });
  }

  private stepLeap(dt: number, w: World): void {
    const l = this.leap;
    if (!l) return;
    l.t += dt;
    const u = clamp(l.t / LEAP_SECONDS);
    this.x = lerp(l.x0, l.x1, u);
    if (u >= 1) {
      this.leap = null;
      this.leapIn = w.rng.range(...LEAP_EVERY);
      w.hear({ is: 'leap', x: this.x, y: this.y, up: false });
      this.swimOn(w);
    }
  }

  protected override parted(): void {
    this.leap = null;
  }

  /** A touch on the water: it swims to the ripple to see. */
  lure(x: number, y: number): void {
    if (this.drop || this.leap || this.leaving) return;
    this.gx = x;
    this.gy = y;
    this.eager = EAGER_SECONDS;
  }

  poke(w: World): void {
    if (this.drop || this.leap || this.leaving) return;
    this.jump(w);
    w.hear({ is: 'poke', prize: 'fish', x: this.x, y: this.y, look: this.look });
  }

  hit(x: number, y: number): boolean {
    if (this.leaving || this.drop) return false;
    const b = LIFE.fish.body;
    const dx = (x - this.x) / (b.rx * SIZE + 10);
    const dy = (y - (this.y - this.lift.height)) / (b.ry * SIZE + 14);
    return dx * dx + dy * dy < 1;
  }

  fit(from: Plan, to: Plan, w: World): void {
    const p = sameSpot(from, to, this.x, this.y);
    const k = Math.max(insidePond(to.pond, p.x, p.y), 0.001);
    const keep = Math.min(1, KEEP / k);
    this.x = to.pond.x + (p.x - to.pond.x) * keep;
    this.y = to.pond.y + (p.y - to.pond.y) * keep;
    this.drop = null;
    this.leap = null;
    this.swimOn(w);
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const g = p.ctx;
    const { height, shadowY } = this.lift;
    const up = this.drop ?? this.leap;
    const u = this.drop ? this.drop.t / this.drop.seconds : this.leap ? this.leap.t / LEAP_SECONDS : 0.5;
    // The same fish all the way: tail down going up, level at the top, nose down coming in. Under
    // the water it is level.
    const frame = !up ? 1 : u < 0.3 ? 0 : u < 0.7 ? 1 : 2;
    const pic = bank?.spriteFrame('life', creatureSprite('fish', this.look, 'leap'), frame);
    if (!pic) return;
    if (height > 2) {
      // Its shadow on the water, small when it is high.
      g.fillStyle = `rgba(20,60,120,${0.2 * clamp(1 - height / 90)})`;
      g.beginPath();
      g.ellipse(this.x, shadowY, 12 * clamp(1 - height / 140, 0.3), 3.5, 0, 0, TAU);
      g.fill();
    }
    if (up) {
      drawPic(g, pic, this.x, this.leap ? this.y - height : this.y, {
        scale: SIZE,
        flip: this.face < 0,
        alpha: this.alpha,
      });
      return;
    }
    // Under the surface the water is over it, and its tail wags as it swims, its nose to where it
    // is going.
    const wag = Math.sin((this.age + this.phase) * 9) * 0.07;
    g.fillStyle = 'rgba(20,70,130,0.16)';
    g.beginPath();
    g.ellipse(this.x + 2, this.y + 9, 11, 3, 0, 0, TAU);
    g.fill();
    drawPic(g, bank ? bank.tinted(pic, WATER, 0.2) : pic, this.x, this.y, {
      scale: SIZE,
      flip: this.face < 0,
      rot: this.face * clamp(this.vy * 0.03, -0.3, 0.3) + wag,
      alpha: this.alpha * 0.92,
    });
  }
}
