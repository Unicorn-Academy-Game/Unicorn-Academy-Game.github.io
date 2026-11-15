import { drawPic, type Pic, type SpriteBank } from '../../engine/bank';
import { clamp, damp, Spring } from '../../engine/ease';
import { glowAt } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { windAt } from './field';
import { PRIZE } from './kinds';
import type { Plan, Slot } from './layout';
import { flowerSprite } from './looks';
import { type Bloom, type Layer, Resident, sameSpot, type World } from './residents';

/**
 * A flower of the meadow. It drops from its bubble as a seed, lands, and grows with a little
 * overshoot, then sways in the same wind that carries the bubbles. Butterflies sit on it, bees sip
 * from it, and the fairy blesses it so that it glows.
 */

/**
 * How big the flower picture is drawn at the nearest row of the meadow, which sets the size of
 * every flower.
 */
const SCALE = 0.95;
/** How big a seed is, as a share of the full flower. */
const SEED = 0.3;
/** How high the middle of the petals is above the base of the stem, in the picture's pixels. */
const HEAD = 35;
/** Seconds a seed takes to fall from the bubble. */
const FALL_SECONDS = 0.62;

export class Flower extends Resident implements Bloom {
  readonly prize = 'flower' as const;
  readonly layer: Layer = 'ground';
  readonly head = { x: 0, y: 0 };
  taken = false;
  glow = 0;
  private slot: Slot;
  private readonly grow = new Spring(SEED, SEED, 70, 6.5);
  private readonly bump = new Spring(0, 0, 220, 9);
  private lean = 0;
  private bloomed = false;

  constructor(look: number, from: { readonly x: number; readonly y: number }, slot: Slot, phase: number) {
    super(look, from.x, from.y, phase);
    this.slot = slot;
    this.head.x = from.x;
    this.head.y = from.y;
    this.fall(slot.x, slot.y, FALL_SECONDS);
  }

  /** How big it is drawn when fully grown. */
  private get full(): number {
    return this.slot.scale * SCALE;
  }

  get ready(): boolean {
    return !this.drop && !this.leaving && this.grow.x > 0.85;
  }

  protected override landed(w: World): void {
    this.grow.target = 1;
    this.grow.kick(3.5);
    w.hear({ is: 'land', prize: 'flower', x: this.x, y: this.y, look: this.look, wet: false });
  }

  protected live(dt: number, w: World): void {
    this.grow.step(dt);
    this.bump.step(dt);
    this.glow = damp(this.glow, 0, 1.1, dt);
    this.sway(w.now);
    if (!this.bloomed && this.grow.x > 0.97) {
      this.bloomed = true;
      w.hear({ is: 'bloom', x: this.head.x, y: this.head.y, look: this.look });
    }
  }

  /** Leans with the wind and nods a little on its own, and so moves the head. */
  private sway(now: number): void {
    this.lean = Math.sin(now * 1.25 + this.phase) * 0.035 + (windAt(now) / 13) * 0.035;
    const reach = HEAD * this.full * this.grow.x;
    this.head.x = this.x + Math.sin(this.lean) * reach;
    this.head.y = this.y - Math.cos(this.lean) * reach;
  }

  protected override parted(): void {
    this.grow.target = 0;
    this.taken = false;
  }

  protected override depart(dt: number): void {
    this.grow.step(dt);
    this.bump.step(dt);
    if (this.grow.x < 0.04) this.gone = true;
  }

  poke(w: World): void {
    if (!this.ready) return;
    this.bump.kick(-15);
    this.glow = Math.max(this.glow, 0.7);
    w.hear({ is: 'poke', prize: 'flower', x: this.head.x, y: this.head.y, look: this.look });
  }

  hit(x: number, y: number): boolean {
    if (this.drop || this.leaving || this.grow.x < 0.5) return false;
    const s = this.full;
    return Math.abs(x - this.head.x) < 22 * s + 9 && y > this.head.y - 24 * s - 8 && y < this.y + 10;
  }

  /** Grows in the nearest free place of the new meadow, or goes if the new meadow has no room. */
  fit(from: Plan, to: Plan, w: World): void {
    const p = sameSpot(from, to, this.x, this.y);
    const slot = w.slotNear(p.x, p.y);
    if (!slot) {
      this.gone = true;
      return;
    }
    this.slot = slot;
    this.x = slot.x;
    this.y = slot.y;
    this.drop = null;
    this.sway(w.now);
  }

  /** The place it grows in. */
  get at(): Slot {
    return this.slot;
  }

  paint(p: Painter, bank: SpriteBank | null): void {
    const pic: Pic | null | undefined = bank?.sprite('playground', flowerSprite(this.look), 0);
    if (!pic) return;
    const g = p.ctx;
    if (this.drop) {
      // A seed, turning as it falls.
      drawPic(g, pic, this.x, this.y, { scale: this.full * SEED, rot: this.age * 9, mid: true, alpha: this.alpha });
      return;
    }
    const size = this.full * Math.max(0, this.grow.x);
    g.fillStyle = 'rgba(24,64,28,0.3)';
    g.beginPath();
    g.ellipse(this.x, this.y + 1, 13 * size, 4 * size, 0, 0, Math.PI * 2);
    g.fill();
    drawPic(g, pic, this.x, this.y, {
      scale: size,
      sx: 1 - this.bump.x * 0.14,
      sy: 1 + this.bump.x * 0.2,
      rot: this.lean + this.bump.x * 0.08,
      alpha: this.alpha,
    });
    if (this.glow > 0.02)
      glowAt(
        p.light,
        this.head.x,
        this.head.y,
        46 * size * (0.8 + this.glow * 0.4),
        PRIZE.flower.color,
        clamp(this.glow) * 0.8,
      );
  }
}
