import { Cinema } from '../cinema';
import { css, lighten, type RGB } from '../engine/color';
import { clamp, damp, easeInOutCubic, Spring, TAU } from '../engine/ease';
import { glowAt, label, prerender, roundedRect } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Quality } from '../engine/stage';
import type { WonderEnv } from '../wonder';

/**
 * The golden lift, seen from inside. The doors close over whatever the player was looking at, a
 * lamp over them counts the floors with a ding at each, the lift hums and the light slides down its
 * seam, and when it has gone as far as it goes the doors open on the next place. Unlike the other
 * scenes this one is not a show of a set length: it is a ride that is held for as long as the next
 * place takes to load, and the doors do not open until the game says the place is ready. The stage
 * it is drawn on has a hole where the doorway is, so what is behind it shows when the doors part.
 */

/**
 * The floors the lamps show, from the bottom up. The manor has the ground floor and the Sky Garden
 * above it, so a lamp for any other floor would be for a floor that is not there.
 */
export const FLOORS = ['G', '1'] as const;
export const SHUT_SECONDS = 0.65;
export const CLIMB_SECONDS = 1.5;
export const OPEN_SECONDS = 0.8;
const GOLD: readonly RGB[] = [
  [138, 100, 24],
  [217, 169, 60],
  [246, 220, 138],
  [217, 169, 60],
  [138, 100, 24],
];

export interface LiftHooks {
  /**
   * The ride is held at the top until `open` is called, for as long as the place behind the doors
   * takes to be ready. Without it the doors open by themselves.
   */
  held?: boolean;
  /** The doors are shut and the lift has gone as far as it goes. */
  arrived?: () => void;
  /** The doors have opened. */
  opened?: () => void;
}

interface Door {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export type Direction = 'up' | 'down';

export class ManorLift extends Cinema {
  readonly id = 'manor-lift' as const;
  private readonly from: number;
  private readonly to: number;
  private door: Door = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private art: { wall: HTMLCanvasElement; leaf: HTMLCanvasElement } | null = null;
  private artKey = '';
  private detail = true;
  /** How far the doors are shut: 0 apart, 1 together. */
  private shut = 0;
  private shutTarget = 0;
  private moving = false;
  private floor: number;
  private arrived = false;
  private opening = false;
  private hum = 0;
  private lampPulse = new Spring(0, 0, 200, 10);
  private slide = 0;
  private motes = 0;

  constructor(
    env: WonderEnv,
    private readonly direction: Direction = 'up',
    private readonly hooks: LiftHooks = {},
  ) {
    super(env);
    const top = FLOORS.length - 1;
    this.from = direction === 'up' ? 0 : top;
    this.to = direction === 'up' ? top : 0;
    this.floor = this.from;
  }

  override get bloom(): number {
    return this.env.calm ? 0.06 : 0.12;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
  }

  /** What a measuring tool may look at, and never change. */
  inspect(): {
    readonly phase: string;
    readonly shut: number;
    readonly moving: boolean;
    readonly floor: string;
    readonly arrived: boolean;
    readonly opening: boolean;
    readonly door: Door;
  } {
    return {
      phase: this.phase,
      shut: this.shut,
      moving: this.moving,
      floor: FLOORS[this.floor]!,
      arrived: this.arrived,
      opening: this.opening,
      door: this.door,
    };
  }

  protected show(): void {
    const sound = this.env.sound;
    const steps = Math.abs(this.to - this.from);
    const start = SHUT_SECONDS + 0.05;
    // The doors come together at once, because nothing is behind them yet, and the lift starts to
    // move.
    this.cue(0.03, () => {
      this.shutTarget = 1;
      sound.fx('whoosh', { gain: 0.5, size: 0.5 });
    });
    this.cue(SHUT_SECONDS - 0.04, () => sound.fx('thud', { gain: 0.5 }));
    this.cue(start, () => {
      this.moving = true;
      sound.fx('rumble', { gain: 0.35 });
      sound.note('pad', 43, { gain: 0.35, seconds: CLIMB_SECONDS + 0.4 });
    });
    for (let i = 1; i <= steps; i++) {
      this.cue(start + (CLIMB_SECONDS * i) / steps, () => {
        this.floor = this.from + Math.sign(this.to - this.from) * i;
        this.lampPulse.kick(6);
        sound.note('glass', 84 + i, { gain: 0.25, seconds: 0.3 });
      });
    }
    this.cue(start + CLIMB_SECONDS, () => {
      this.moving = false;
      this.arrived = true;
      // The lift's own bell, a falling pair of notes as a real one has.
      sound.note('bell', 88, { gain: 0.45, seconds: 0.5 });
      sound.note('bell', 83, { gain: 0.45, seconds: 0.8, delay: 0.18 });
    });
    this.cue(start + CLIMB_SECONDS + 0.26, () => {
      this.hooks.arrived?.();
      if (!this.hooks.held) this.open();
    });
  }

  /** Opens the doors on whatever is behind them. Only means anything once the lift has arrived. */
  open(): void {
    if (this.opening) return;
    this.opening = true;
    this.shutTarget = 0;
    this.env.sound.fx('whoosh', { gain: 0.6, size: 0.6 });
    this.env.sound.note('harp', 79, { gain: 0.35, seconds: 0.8 });
    this.script.at(this.script.now + OPEN_SECONDS, () => this.hooks.opened?.());
    this.script.at(this.script.now + OPEN_SECONDS + 0.3, () => this.endFinale());
    const mid = (this.door.x0 + this.door.x1) / 2;
    for (let i = 0; i < this.fx.count(14); i++) {
      this.fx.emit({
        x: mid + this.env.rng.range(-4, 4),
        y: this.env.rng.range(this.door.y0, this.door.y1),
        vx: this.env.rng.range(-160, 160),
        vy: this.env.rng.range(-30, 30),
        life: 0.7,
        size: 7,
        size1: 1,
        color: [255, 236, 160],
        shape: 'star4',
        drag: 2.4,
        twinkle: 1.2,
      });
    }
  }

  protected touch(): void {
    // A touch on the lift's wall is a little shine, and nothing else: the ride goes on whatever the
    // player does.
    this.lampPulse.kick(3);
  }

  protected arrange(view: View): void {
    const w = Math.min(view.w * 0.56, view.h * 0.95);
    const x0 = (view.w - w) / 2;
    this.door = { x0, x1: x0 + w, y0: view.h * 0.17, y1: view.h * 0.88 };
    this.artKey = '';
  }

  protected tick(dt: number): void {
    // The doors shut and part along an ease, at their own pace, whatever the frame rate.
    const rate = this.shutTarget > this.shut ? 1 / SHUT_SECONDS : 1 / OPEN_SECONDS;
    this.shut = clamp(this.shut + Math.sign(this.shutTarget - this.shut) * dt * rate, 0, 1);
    if (Math.abs(this.shutTarget - this.shut) < dt * rate) this.shut = this.shutTarget;
    this.lampPulse.step(dt);
    this.hum = damp(this.hum, this.moving ? 1 : 0, 10, dt);
    this.slide = (this.slide + dt * (this.moving ? 1 : 0) * (this.direction === 'up' ? 1 : -1)) % 1000;
    if (this.moving) {
      this.motes += dt * (this.env.calm ? 8 : 22) * this.fx.density;
      for (; this.motes >= 1; this.motes -= 1) {
        const d = this.door;
        this.fx.emit({
          x: this.env.rng.range(d.x0, d.x1),
          y: this.direction === 'up' ? d.y1 : d.y0,
          vy: (this.direction === 'up' ? -1 : 1) * this.env.rng.range(120, 260),
          size: this.env.rng.range(4, 9),
          life: this.env.rng.range(0.5, 0.9),
          color: [255, 232, 150],
          alpha: 0.7,
          shape: 'glow',
        });
      }
    }
  }

  private ensureArt(): void {
    const key = `${Math.round(this.view.w)}x${Math.round(this.view.h)}:${this.detail}`;
    if (key === this.artKey && this.art) return;
    this.artKey = key;
    const { w, h } = this.view;
    const d = this.door;
    const scale = this.detail ? 2 : 1;
    const wall = prerender(
      w,
      h,
      (g) => {
        // Brass over the whole picture, in a column of light that is brightest at the middle and
        // darkest at the edges.
        const body = g.createLinearGradient(0, 0, w, 0);
        GOLD.forEach((c, i) => {
          body.addColorStop(i / (GOLD.length - 1), css(i === 2 ? lighten(c, 0.1) : c));
        });
        g.fillStyle = body;
        g.fillRect(0, 0, w, h);
        const top = g.createLinearGradient(0, 0, 0, h);
        top.addColorStop(0, css([255, 255, 255], 0.22));
        top.addColorStop(0.2, css([255, 255, 255], 0));
        top.addColorStop(0.85, css([0, 0, 0], 0));
        top.addColorStop(1, css([0, 0, 0], 0.3));
        g.fillStyle = top;
        g.fillRect(0, 0, w, h);
        // Panels of the wall, set in with a lighter line.
        g.strokeStyle = css([255, 244, 190], 0.4);
        g.lineWidth = 2.5;
        for (const [x, y, pw, ph] of [
          [w * 0.03, h * 0.22, d.x0 - w * 0.06, h * 0.62],
          [d.x1 + w * 0.03, h * 0.22, w - d.x1 - w * 0.06, h * 0.62],
        ] as const) {
          if (pw < 18) continue;
          roundedRect(g, x, y, pw, ph, 10);
          g.stroke();
        }
        // The doorway: its frame, then a hole.
        g.fillStyle = css([90, 60, 12]);
        roundedRect(g, d.x0 - 10, d.y0 - 10, d.x1 - d.x0 + 20, d.y1 - d.y0 + 14, 18);
        g.fill();
        g.strokeStyle = css([255, 233, 160]);
        g.lineWidth = 3;
        roundedRect(g, d.x0 - 10, d.y0 - 10, d.x1 - d.x0 + 20, d.y1 - d.y0 + 14, 18);
        g.stroke();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        roundedRect(g, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0, 12);
        g.fill();
        g.globalCompositeOperation = 'source-over';
      },
      scale,
    );

    const lw = (d.x1 - d.x0) / 2;
    const lh = d.y1 - d.y0;
    const leaf = prerender(
      lw,
      lh,
      (g) => {
        const face = g.createLinearGradient(0, 0, lw, 0);
        face.addColorStop(0, css([217, 169, 60]));
        face.addColorStop(0.45, css([246, 220, 138]));
        face.addColorStop(0.55, css([217, 169, 60]));
        face.addColorStop(1, css([183, 136, 34]));
        g.fillStyle = face;
        g.fillRect(0, 0, lw, lh);
        g.strokeStyle = css([255, 240, 190], 0.6);
        g.lineWidth = 3;
        g.strokeRect(2, 2, lw - 4, lh - 4);
        // An inset panel with a diamond in it.
        g.strokeStyle = css([138, 100, 24], 0.7);
        g.lineWidth = 2;
        roundedRect(g, lw * 0.14, lh * 0.1, lw * 0.72, lh * 0.8, 8);
        g.stroke();
        g.fillStyle = css([255, 244, 190], 0.5);
        g.beginPath();
        g.moveTo(lw / 2, lh * 0.34);
        g.lineTo(lw * 0.7, lh * 0.5);
        g.lineTo(lw / 2, lh * 0.66);
        g.lineTo(lw * 0.3, lh * 0.5);
        g.closePath();
        g.fill();
        g.strokeStyle = css([120, 82, 12], 0.8);
        g.stroke();
        const shade = g.createLinearGradient(0, 0, 0, lh);
        shade.addColorStop(0, css([255, 255, 255], 0.16));
        shade.addColorStop(1, css([0, 0, 0], 0.22));
        g.fillStyle = shade;
        g.fillRect(0, 0, lw, lh);
      },
      scale,
    );
    this.art = { wall, leaf };
  }

  protected paintBack(p: Painter): void {
    this.ensureArt();
    const art = this.art!;
    const g = p.ctx;
    const d = this.door;
    const lw = (d.x1 - d.x0) / 2;
    const lh = d.y1 - d.y0;
    const reach = easeInOutCubic(this.shut);
    // The lift hums while it moves: the whole of it shivers a hair.
    const shiver = this.env.calm ? 0 : this.hum * Math.sin(p.t * 61) * 0.9;
    g.save();
    g.translate(0, shiver);
    // The leaves sit in the doorway and slide apart into the walls.
    g.save();
    roundedRect(g, d.x0, d.y0, d.x1 - d.x0, lh, 12);
    g.clip();
    const slide = (1 - reach) * (lw + 4);
    g.drawImage(art.leaf, d.x0 - slide, d.y0, lw, lh);
    g.save();
    g.translate(d.x1 + slide, d.y0);
    g.scale(-1, 1);
    g.drawImage(art.leaf, 0, 0, lw, lh);
    g.restore();
    // The seam of the doors, and light that runs down it as the lift moves.
    if (reach > 0.95) this.paintSeam(g, d);
    g.restore();
    g.drawImage(art.wall, 0, 0, p.w, p.h);
    this.paintLamps(p, d);
    this.paintSill(g, d);
    g.restore();
  }

  private paintSeam(g: CanvasRenderingContext2D, d: Door): void {
    const mid = (d.x0 + d.x1) / 2;
    g.fillStyle = css([90, 60, 12], 0.9);
    g.fillRect(mid - 1.4, d.y0, 2.8, d.y1 - d.y0);
    if (this.hum <= 0.02) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const period = 46;
    const phase = (((this.slide * 260) % period) + period) % period;
    g.fillStyle = css([255, 236, 150], 0.55 * this.hum);
    for (let y = d.y0 - period + phase; y < d.y1; y += period)
      g.fillRect(mid - 2, Math.max(d.y0, y), 4, Math.min(18, d.y1 - Math.max(d.y0, y)));
    g.restore();
  }

  /** The row of floor lamps over the doors, with the one the lift is at lit and glowing. */
  private paintLamps(p: Painter, d: Door): void {
    const g = p.ctx;
    const r = Math.max(13, Math.min(20, this.view.h * 0.055));
    const gap = r * 0.7;
    const row = FLOORS.length * (r * 2) + (FLOORS.length - 1) * gap;
    const cx = (d.x0 + d.x1) / 2;
    const cy = d.y0 - Math.min(d.y0 * 0.5, r + 14);
    g.fillStyle = css([42, 26, 5]);
    roundedRect(g, cx - row / 2 - 12, cy - r - 8, row + 24, r * 2 + 16, r + 8);
    g.fill();
    g.strokeStyle = css([255, 233, 160]);
    g.lineWidth = 3;
    g.stroke();
    FLOORS.forEach((name, i) => {
      const x = cx - row / 2 + r + i * (r * 2 + gap);
      const on = i === this.floor;
      g.fillStyle = on ? css([255, 226, 122]) : css([74, 52, 16]);
      g.beginPath();
      g.arc(x, cy, r * (on ? 1 + this.lampPulse.x * 0.08 : 1), 0, TAU);
      g.fill();
      label(g, name, x, cy + 1, r * 1.05, on ? [74, 52, 16] : [128, 96, 40]);
      if (on) glowAt(p.light, x, cy, r * 4, [255, 226, 122], 0.4 + 0.15 * this.lampPulse.x);
    });
    // An arrow that blinks while the lift is going somewhere.
    if (this.moving) {
      const up = this.direction === 'up';
      const x = cx + row / 2 + 34;
      g.fillStyle = css([255, 226, 122], 0.6 + 0.4 * Math.sin(p.t * 12));
      g.beginPath();
      g.moveTo(x, cy + (up ? -r * 0.7 : r * 0.7));
      g.lineTo(x - r * 0.6, cy + (up ? r * 0.5 : -r * 0.5));
      g.lineTo(x + r * 0.6, cy + (up ? r * 0.5 : -r * 0.5));
      g.closePath();
      g.fill();
    }
  }

  /** The strip of lights along the foot of the doors, running one way while the lift moves. */
  private paintSill(g: CanvasRenderingContext2D, d: Door): void {
    const y = d.y1 + 6;
    const h = Math.max(7, this.view.h * 0.022);
    g.fillStyle = css([138, 100, 24]);
    roundedRect(g, d.x0, y, d.x1 - d.x0, h, h / 2);
    g.fill();
    g.save();
    roundedRect(g, d.x0, y, d.x1 - d.x0, h, h / 2);
    g.clip();
    const period = 28;
    const phase = (((this.slide * 360) % period) + period) % period;
    g.fillStyle = css([255, 226, 122], 0.75 + 0.25 * this.hum);
    for (let x = d.x0 - period + phase; x < d.x1; x += period) g.fillRect(x, y, period / 2, h);
    g.restore();
  }

  protected paintFront(): void {
    // Nothing is drawn over the lift: its own lamps, doors and walls are the whole picture, and the
    // way out is the page's.
  }

  protected reset(): void {
    this.shut = 0;
    this.shutTarget = 0;
    this.moving = false;
    this.floor = this.from;
    this.opening = false;
    this.arrived = false;
    this.hum = 0;
    this.slide = 0;
    this.motes = 0;
    this.lampPulse.x = 0;
    this.lampPulse.v = 0;
  }
}
