import { css, darken, lighten, type RGB } from '../../engine/color';
import { clamp, damp, Spring, TAU } from '../../engine/ease';
import { glowAt, roundedRect } from '../../engine/paint';
import type { Dress } from './dress';

/** How far up the barrel may point: nearly straight up, and nearly flat. */
export const AIM_RANGE: readonly [number, number] = [-1.5, -0.08];

const PIVOT_UP = 50;
const BREECH = -26;
const MUZZLE = 56;

/**
 * The cannon. It is drawn in its own units and scaled to the screen. The barrel swings to where it
 * is told to aim, with a little overshoot like a toy on a spring, and when it fires it slides back,
 * the carriage hops, the wheel rolls back and the muzzle flares. How the shot flies and what it
 * does are the game's.
 */
export class Cannon {
  /** Where its wheel meets the ground. */
  x = 0;
  y = 0;
  scale = 1;
  private readonly aimed = new Spring(-1, -1, 380, 26);
  private readonly slide = new Spring(0, 0, 230, 12);
  private readonly lift = new Spring(0, 0, 330, 17);
  private readonly roll = new Spring(0, 0, 70, 7);
  private flare = 0;
  /** How lit the fuse is, from 0 to 1. */
  private fuse = 0;

  get angle(): number {
    return this.aimed.x;
  }

  /** Swings the barrel toward an angle, in radians, 0 being flat to the right and negative up. */
  aim(angle: number): void {
    this.aimed.target = clamp(angle, AIM_RANGE[0], AIM_RANGE[1]);
  }

  /** How far the barrel is from where it was told to point, in radians. */
  get off(): number {
    return Math.abs(this.aimed.target - this.aimed.x);
  }

  /** Where the barrel pivots. */
  pivot(out = { x: 0, y: 0 }): { x: number; y: number } {
    out.x = this.x + 2 * this.scale;
    out.y = this.y - (PIVOT_UP + this.lift.x) * this.scale;
    return out;
  }

  /** The mouth of the barrel as it is now, and the way it points. */
  muzzle(out = { x: 0, y: 0, angle: 0 }): { x: number; y: number; angle: number } {
    const p = this.pivot();
    const reach = (MUZZLE + 8 - this.slide.x) * this.scale;
    out.x = p.x + Math.cos(this.aimed.x) * reach;
    out.y = p.y + Math.sin(this.aimed.x) * reach;
    out.angle = this.aimed.x;
    return out;
  }

  /**
   * The recoil: the barrel slides back, the carriage hops, the wheel rolls back and the muzzle
   * flares.
   */
  fire(power = 1): void {
    this.slide.x = 11 + 5 * power;
    this.slide.v = 0;
    this.lift.kick(70 + 40 * power);
    this.roll.kick(-9 * power);
    this.flare = 1;
    this.fuse = 1;
  }

  /**
   * Whether a touch at a point is on the cannon, with a little room, since it is the first thing a
   * small finger looks for.
   */
  contains(x: number, y: number): boolean {
    const k = this.scale;
    return x > this.x - 56 * k && x < this.x + 52 * k && y > this.y - 78 * k && y < this.y + 8 * k;
  }

  reset(): void {
    for (const s of [this.slide, this.lift, this.roll]) {
      s.x = 0;
      s.v = 0;
    }
    this.aimed.x = -1;
    this.aimed.v = 0;
    this.aimed.target = -1;
    this.flare = 0;
  }

  tick(dt: number): void {
    this.aimed.step(dt);
    this.slide.step(dt);
    this.lift.step(dt);
    this.roll.step(dt);
    this.flare = damp(this.flare, 0, 7, dt);
    this.fuse = damp(this.fuse, 0, 2.2, dt);
  }

  paint(g: CanvasRenderingContext2D, dress: Dress, t: number): void {
    const { cannon: art } = dress;
    const k = this.scale;
    g.save();
    // A shadow on the grass that shrinks as the carriage hops.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(this.x - 4 * k, this.y + 2 * k, (50 - this.lift.x * 1.6) * k, 7 * k, 0, 0, TAU);
    g.fill();
    g.translate(this.x, this.y - Math.max(0, this.lift.x) * k * 0.5);
    g.scale(k, k);
    this.stock(g, art.wood);
    this.barrel(g, dress, t);
    this.cheek(g, dress);
    this.wheel(g, art);
    // The cap over the pivot, in front of everything on the barrel's side.
    const pivotY = -PIVOT_UP;
    g.fillStyle = css(art.band);
    g.strokeStyle = css(darken(art.band, 0.35));
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(2, pivotY + 1, 6.5, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = css(lighten(art.band, 0.6), 0.8);
    g.beginPath();
    g.arc(0.5, pivotY - 1, 2.2, 0, TAU);
    g.fill();
    g.restore();
    this.muzzleFlash(g);
  }

  /** The tail that rests on the ground behind. */
  private stock(g: CanvasRenderingContext2D, wood: readonly [RGB, RGB]): void {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = css(darken(wood[1], 0.4));
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(-24, -22);
    g.lineTo(-46, -3);
    g.stroke();
    g.strokeStyle = css(wood[1]);
    g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = css(wood[0], 0.6);
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-24, -24.5);
    g.lineTo(-45, -6);
    g.stroke();
  }

  private barrel(g: CanvasRenderingContext2D, dress: Dress, t: number): void {
    const { cannon: art } = dress;
    g.save();
    g.translate(2, -PIVOT_UP);
    g.rotate(this.aimed.x);
    g.translate(-this.slide.x, 0);
    const half = (x: number): number => 15 - ((x - BREECH) / (MUZZLE - BREECH)) * 3;
    // The tube, thicker at the breech, with a round back.
    g.beginPath();
    g.moveTo(BREECH, -15);
    g.lineTo(MUZZLE - 6, -12);
    g.lineTo(MUZZLE - 6, 12);
    g.lineTo(BREECH, 15);
    g.arc(BREECH, 0, 15, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
    const tube = g.createLinearGradient(0, -15, 0, 15);
    tube.addColorStop(0, css(lighten(art.body[0], 0.28)));
    tube.addColorStop(0.35, css(art.body[0]));
    tube.addColorStop(1, css(art.body[1]));
    g.fillStyle = tube;
    g.fill();
    g.lineJoin = 'round';
    g.strokeStyle = css(darken(art.body[1], 0.5));
    g.lineWidth = 2;
    g.stroke();
    // Three bands.
    for (const x of [-12, 10, 34]) {
      const h = half(x);
      g.fillStyle = css(art.band);
      g.fillRect(x, -h - 0.6, 5.5, h * 2 + 1.2);
      g.fillStyle = css(lighten(art.band, 0.55), 0.7);
      g.fillRect(x + 0.8, -h, 1.4, h * 2);
    }
    // The picture on its side, in the colour of the bands.
    g.save();
    g.translate(21.5, 0);
    g.rotate(Math.PI / 2);
    g.fillStyle = css(art.band, 0.95);
    if (dress.figure === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 6.2 : 3.1;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    } else {
      g.beginPath();
      g.moveTo(0, 5.2);
      g.bezierCurveTo(-1.6, 3.8, -6, 1.4, -5.6, -1.6);
      g.bezierCurveTo(-5.4, -4.6, -1.8, -5.6, 0, -2.8);
      g.bezierCurveTo(1.8, -5.6, 5.4, -4.6, 5.6, -1.6);
      g.bezierCurveTo(6, 1.4, 1.6, 3.8, 0, 5.2);
      g.closePath();
    }
    g.fill();
    g.restore();
    // The lip at the mouth.
    g.fillStyle = css(art.body[1]);
    roundedRect(g, MUZZLE - 9, -17, 15, 34, 5);
    g.fill();
    g.strokeStyle = css(darken(art.body[1], 0.5));
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = css(art.band);
    roundedRect(g, MUZZLE - 7, -15, 4, 30, 2);
    g.fill();
    // The dark inside the mouth.
    g.fillStyle = 'rgba(14,8,40,0.9)';
    g.beginPath();
    g.ellipse(MUZZLE + 5, 0, 2.6, 11, 0, 0, TAU);
    g.fill();
    // A shine along the top.
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(BREECH + 4, -9);
    g.lineTo(MUZZLE - 14, -8);
    g.stroke();
    // The knob at the back, and the fuse in it.
    g.fillStyle = css(art.band);
    g.beginPath();
    g.arc(BREECH - 12, 0, 6, 0, TAU);
    g.fill();
    g.strokeStyle = css(darken(art.body[1], 0.2));
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(BREECH + 2, -14.5);
    g.quadraticCurveTo(BREECH - 1, -22, BREECH - 7, -22.5);
    g.stroke();
    const glow = 0.55 + 0.25 * Math.sin(t * 11) + this.fuse * 0.5;
    g.globalCompositeOperation = 'lighter';
    glowAt(g, BREECH - 7, -22.5, 14, [255, 190, 90], glow, 'spark');
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  /** The side of the carriage, in front of the barrel. */
  private cheek(g: CanvasRenderingContext2D, dress: Dress): void {
    const { wood, band } = dress.cannon;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-30, -9);
    g.lineTo(-27, -40);
    g.quadraticCurveTo(-25, -46, -17, -46);
    g.lineTo(22, -46);
    g.quadraticCurveTo(28, -46, 29, -38);
    g.lineTo(33, -9);
    g.closePath();
    const plank = g.createLinearGradient(0, -46, 0, -9);
    plank.addColorStop(0, css(wood[0]));
    plank.addColorStop(1, css(wood[1]));
    g.fillStyle = plank;
    g.fill();
    g.strokeStyle = css(darken(wood[1], 0.5));
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = css(darken(wood[1], 0.25), 0.7);
    g.lineWidth = 1.2;
    for (const y of [-34, -22]) {
      g.beginPath();
      g.moveTo(-27, y);
      g.lineTo(31, y);
      g.stroke();
    }
    g.fillStyle = css(band);
    for (const [x, y] of [
      [-21, -40],
      [24, -40],
      [-24, -14],
      [28, -14],
    ] as const) {
      g.beginPath();
      g.arc(x, y, 1.9, 0, TAU);
      g.fill();
    }
  }

  private wheel(g: CanvasRenderingContext2D, art: Dress['cannon']): void {
    const cx = 2;
    const cy = -21;
    const turn = this.roll.x;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.arc(0, 0, 21, 0, TAU);
    g.fill();
    g.rotate(turn);
    g.lineCap = 'round';
    g.strokeStyle = css(darken(art.wood[1], 0.35));
    g.lineWidth = 3.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      g.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
      g.stroke();
    }
    g.strokeStyle = css(art.wood[0]);
    g.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5 - 0.8);
      g.lineTo(Math.cos(a) * 17, Math.sin(a) * 17 - 0.8);
      g.stroke();
    }
    g.strokeStyle = css(darken(art.wood[1], 0.45));
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 18.5, 0, TAU);
    g.stroke();
    g.strokeStyle = css(art.wood[1]);
    g.lineWidth = 3.6;
    g.stroke();
    g.fillStyle = css(art.wheel);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      g.beginPath();
      g.arc(Math.cos(a) * 18.5, Math.sin(a) * 18.5, 1.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = css(art.wheel);
    g.strokeStyle = css(darken(art.wheel, 0.4));
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, 5.4, 0, TAU);
    g.fill();
    g.stroke();
    g.restore();
  }

  /** A flash at the mouth that is bright and quick, in the colour of the shell. */
  private muzzleFlash(g: CanvasRenderingContext2D): void {
    if (this.flare < 0.03) return;
    const at = this.muzzle();
    const k = this.scale;
    g.save();
    g.globalCompositeOperation = 'lighter';
    glowAt(g, at.x, at.y, (70 + 60 * this.flare) * k, [255, 220, 150], 0.9 * this.flare);
    g.translate(at.x, at.y);
    g.rotate(at.angle);
    g.fillStyle = css([255, 245, 210], 0.85 * this.flare);
    g.beginPath();
    const spikes = 7;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU;
      const r = (i % 2 === 0 ? 30 + 22 * Math.cos(a) : 8) * this.flare * k;
      g.lineTo(Math.cos(a) * r + 6 * k, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
}
