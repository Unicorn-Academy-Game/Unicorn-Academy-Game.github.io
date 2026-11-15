import type { Rng } from '../../../domain/rng';
import { COLORS, css, lighten } from '../../engine/color';
import { clamp, lerp, TAU } from '../../engine/ease';
import { glowAt } from '../../engine/paint';

/**
 * A golden shooting star that crosses the sky now and then. A child who sees it and touches it is
 * rewarded.
 */
export interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/** Seconds of play before the first comet, and between one and the next. */
export const FIRST_COMET = 9;
export const COMET_GAP: readonly [number, number] = [11, 17];
/** How near a touch must be to count as on it, in units. Big, since it is fast and small. */
export const COMET_REACH = 46;
const TAIL = 110;

/** Where it crosses, and how fast. */
export interface Sky {
  readonly w: number;
  /** The top and the bottom of the band of sky it crosses in. */
  readonly top: number;
  readonly bottom: number;
  readonly calm: boolean;
}

export class Comets {
  current: Comet | null = null;
  private wait = FIRST_COMET;

  /**
   * Moves the comet on, and when `may` and it is time, sends the next one. A comet already crossing
   * is never cut short.
   */
  update(dt: number, may: boolean, sky: Sky, rng: Rng): Comet | null {
    const c = this.current;
    if (c) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < -TAIL - 60 || c.x > sky.w + TAIL + 60 || c.age > 9) this.current = null;
      return null;
    }
    if (!may) return null;
    this.wait -= dt;
    if (this.wait > 0) return null;
    this.wait = rng.range(COMET_GAP[0], COMET_GAP[1]);
    return this.send(sky, rng, rng.next() < 0.5 ? 1 : -1);
  }

  /** Sends a comet across from one side: `1` goes left to right. */
  send(sky: Sky, rng: Rng, way: 1 | -1, band: readonly [number, number] = [sky.top, sky.bottom]): Comet {
    const crossing = sky.calm ? 5.4 : 3.8;
    const y = rng.range(band[0], band[1]);
    const comet: Comet = {
      x: way === 1 ? -40 : sky.w + 40,
      y,
      vx: (way * (sky.w + 80)) / crossing,
      vy: rng.range(-6, 26),
      age: 0,
    };
    this.current = comet;
    return comet;
  }

  /** Whether a touch is on the comet. */
  hits(x: number, y: number): boolean {
    const c = this.current;
    return !!c && Math.hypot(x - c.x, y - c.y) <= COMET_REACH;
  }

  /** The comet is caught: it is gone, and says where it was. */
  take(): Comet | null {
    const c = this.current;
    this.current = null;
    return c;
  }

  reset(): void {
    this.current = null;
    this.wait = FIRST_COMET;
  }

  /**
   * Draws it: a bright head with a long tail that thins and fades behind it. The caller draws it on
   * a sheet that can add light.
   */
  paint(g: CanvasRenderingContext2D, t: number): void {
    const c = this.current;
    if (!c) return;
    const speed = Math.hypot(c.vx, c.vy) || 1;
    const dx = c.vx / speed;
    const dy = c.vy / speed;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 14; i >= 0; i--) {
      const s = i / 14;
      const wobble = Math.sin(t * 9 + i * 0.7) * 1.3 * s;
      const x = c.x - dx * TAIL * s - dy * wobble;
      const y = c.y - dy * TAIL * s + dx * wobble;
      const body = lerp(COLORS.white[0], COLORS.pink[0], s);
      glowAt(
        g,
        x,
        y,
        lerp(26, 5, s),
        [body, lerp(COLORS.white[1], COLORS.gold[1], s * 0.6), lerp(COLORS.white[2], COLORS.pink[2], s)],
        0.9 * (1 - s) ** 1.4,
        'spark',
      );
    }
    const pulse = 1 + 0.12 * Math.sin(t * 14);
    glowAt(g, c.x, c.y, 58 * pulse, COLORS.gold, 0.75);
    g.fillStyle = css(lighten(COLORS.gold, 0.7), 0.95);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 1.4;
      const r = i % 2 === 0 ? 13 * pulse : 4.2;
      g.lineTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = css(COLORS.white, clamp(0.9 * pulse));
    g.beginPath();
    g.arc(c.x, c.y, 4.2, 0, TAU);
    g.fill();
    g.restore();
  }
}
