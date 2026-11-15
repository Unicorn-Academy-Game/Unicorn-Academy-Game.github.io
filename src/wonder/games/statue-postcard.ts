import { Rng } from '../../domain/rng';
import { Cinema } from '../cinema';
import { drawPic } from '../engine/bank';
import { css, darken, type RGB } from '../engine/color';
import { clamp, damp, easeOutBack, easeOutCubic, lerp, Spring, TAU, unlerp } from '../engine/ease';
import { addRoundedRect, glowAt, prerender } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Quality } from '../engine/stage';
import type { WonderEnv } from '../wonder';
import {
  ASLEEP,
  type Ground,
  isStatue,
  type Moment,
  STATUE_NAMES,
  type StatueName,
  WORLDS,
  type World,
} from './postcard/worlds';

/**
 * A postcard from a statue. The player taps one of the eight creatures in the gallery, the picture
 * opens in a dark room with the statue alone in a pool of light, and then it wakes: light pours out
 * of it, the world it comes from blooms round it (a twilight sky, a cave of crystals, the moon, a
 * volcano, the sea, the clouds, a storm, a night wood), it hops to a little tune that is its own,
 * and the picture shrinks into a postcard, with an airmail border and a stamp that lands on it with
 * a thud. A touch anywhere is a small burst of that world's own magic. It is watched, not played,
 * and gives the screen back by itself.
 */

/**
 * How tall the carving stands above its base, and how wide, in the picture's own pixels: what the
 * picture is scaled by to fill the screen.
 */
const STATUE_HEIGHT = 160;
const STATUE_WIDTH = 180;
const WAKE_AT = 0.95;
const FIRST_NOTE = 1.35;
const NOTE_GAP = 0.27;
const FRAME_AT = 4.0;
const STAMP_AT = 4.3;
const END_AT = 5.5;
/** Ambient particles before the statue wakes, as a share of what the world has when it is whole. */
const SLEEP_RATE = 0.2;
const BORDER = 11;

interface Bolt {
  readonly x: number;
  readonly seed: number;
  age: number;
}

export class StatuePostcard extends Cinema {
  readonly id = 'statue-postcard' as const;
  private readonly name: StatueName;
  private readonly world: World;
  private ground: Ground = { x: 0, y: 0, tall: 0, w: 0, h: 0 };
  private backdrop: HTMLCanvasElement | null = null;
  private backKey = '';
  private detail = true;
  private lit = 0.1;
  private awake = 0;
  private sheen = 0;
  private hopY = 0;
  private hopV = 0;
  private readonly squash = new Spring(0, 0, 260, 12);
  private readonly stamp = new Spring(0, 0, 170, 11);
  private frame = 0;
  private driftDue = 0;
  private bolts: Bolt[] = [];
  private hopped = 0;
  private notes = 0;
  private frameIn = false;

  constructor(env: WonderEnv) {
    super(env);
    const asked = env.look.replace(/^statue-/, '');
    this.name = isStatue(asked) ? asked : STATUE_NAMES[0];
    this.world = WORLDS[this.name];
  }

  override get bloom(): number {
    return this.env.calm ? 0.1 : 0.2;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
    this.backKey = '';
  }

  /** What a measuring tool may look at, and never change. */
  inspect(): {
    readonly name: StatueName;
    readonly phase: string;
    readonly shown: number;
    readonly lit: number;
    readonly awake: number;
    readonly frame: number;
    readonly stamp: number;
    readonly statue: { readonly x: number; readonly y: number; readonly tall: number; readonly drawn: boolean };
    readonly notes: number;
    readonly hops: number;
    readonly size: { readonly w: number; readonly h: number };
  } {
    return {
      name: this.name,
      phase: this.phase,
      shown: this.shown,
      lit: this.lit,
      awake: this.awake,
      frame: this.frame,
      stamp: this.stamp.x,
      statue: { x: this.ground.x, y: this.ground.y, tall: this.ground.tall, drawn: this.pic() !== null },
      notes: this.notes,
      hops: this.hopped,
      size: { w: this.view.w, h: this.view.h },
    };
  }

  protected show(): void {
    const w = this.world;
    const sound = this.env.sound;
    this.cue(0.25, () => {
      sound.fx('swell', { gain: 0.5, size: 0.45 });
      this.note(0, 0.35);
    });
    this.cue(WAKE_AT, () => {
      this.awake = 0.001;
      this.sheen = 1;
      this.hop(1);
      this.burst(this.ground.x, this.ground.y - this.ground.tall * 0.5, 1);
      this.flash(0.55, w.glow);
      this.shake(1.6);
      sound.fx(w.call, { gain: 0.85 });
      sound.fx('twinkle', { gain: 0.5 });
      for (const step of [0, 4, 7]) sound.note('pad', w.root - 12 + step, { gain: 0.5, seconds: 1.6 });
    });
    w.tune.forEach((step, i) => {
      this.cue(FIRST_NOTE + i * NOTE_GAP, () => {
        this.note(step, 0.7);
        if (i % 4 === 0) {
          this.hop(0.75);
          this.burst(
            this.ground.x + (i % 8 === 0 ? -1 : 1) * this.ground.tall * 0.25,
            this.ground.y - this.ground.tall * 0.55,
            0.45,
          );
        }
      });
    });
    (w.moments ?? []).forEach((at, i) => {
      this.cue(at, () =>
        w.moment?.(
          {
            fx: this.fx,
            rng: this.env.rng,
            ground: this.ground,
            flash: (a, c) => this.flash(a, c),
            bolt: (x) => this.strike(x),
          } satisfies Moment,
          i,
        ),
      );
    });
    this.cue(FRAME_AT, () => {
      sound.fx('whoosh', { gain: 0.5 });
      this.frameIn = true;
    });
    this.cue(STAMP_AT, () => {
      this.stamp.target = 1;
      this.stamp.kick(4);
      sound.fx('thud', { gain: 0.9 });
      sound.fx('ding', { gain: 0.6, step: 3 });
      for (const step of [0, 4, 7, 12]) sound.note('bell', w.root + step, { gain: 0.55, seconds: 1.4 });
      this.flash(0.25, [255, 244, 214]);
      this.fx.emit({
        x: this.view.w - BORDER - 40,
        y: this.view.h - BORDER - 44,
        life: 0.7,
        size: 14,
        size1: 120,
        shape: 'ring',
        width: 3,
        color: [255, 236, 190],
        alpha: 0.9,
      });
      this.sparkleAt(this.view.w - BORDER - 42, this.view.h - BORDER - 44, 12);
    });
    this.cue(END_AT, () => this.endFinale());
  }

  protected touch(x: number, y: number): void {
    const g = this.ground;
    this.burst(x, y, 0.4);
    const w = this.world;
    const i = clamp(Math.floor((x / Math.max(1, this.view.w)) * w.tune.length), 0, w.tune.length - 1);
    this.note(w.tune[i]!, 0.55);
    if (this.awake > 0.5 && Math.abs(x - g.x) < g.tall * 0.35 && y > g.y - g.tall * 1.05 && y < g.y + 8) this.hop(0.9);
  }

  protected hop(power: number): void {
    if (this.hopY > 4) return;
    this.hopV = 300 * power;
    this.squash.kick(5);
    this.hopped++;
  }

  private note(step: number, gain: number): void {
    const w = this.world;
    this.env.sound.note(w.voice, w.root + step, { gain, seconds: 0.5 });
    this.notes++;
  }

  private burst(x: number, y: number, power: number): void {
    this.world.burst(this.fx, this.env.rng, x, y, power);
  }

  private sparkleAt(x: number, y: number, n: number): void {
    for (let i = 0; i < this.fx.count(n); i++) {
      const a = (i / n) * TAU;
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * 80,
        vy: Math.sin(a) * 80,
        life: 0.8,
        size: 8,
        size1: 1,
        color: [255, 240, 190],
        shape: 'star4',
        drag: 1.8,
        twinkle: 1.2,
      });
    }
  }

  private strike(x: number): void {
    if (this.env.calm) return;
    this.bolts.push({ x, seed: this.env.rng.int(1000), age: 0 });
    this.env.sound.fx('crackle', { gain: 0.8 });
    this.env.sound.fx('rumble', { gain: 0.45, delay: 0.25 });
    this.shake(1.2);
  }

  protected arrange(view: View): void {
    const tall = Math.min((view.h * 0.62) / STATUE_HEIGHT, (view.w * 0.8) / STATUE_WIDTH) * STATUE_HEIGHT;
    this.ground = { x: view.w / 2, y: view.h * 0.9, tall, w: view.w, h: view.h };
    this.backKey = '';
  }

  protected tick(dt: number): void {
    const awake = this.phase !== 'play' && this.shown >= WAKE_AT;
    this.lit = damp(this.lit, awake ? 1 : 0.1, awake ? 2.4 : 5, dt);
    if (awake) this.awake = damp(this.awake, 1, 3, dt);
    this.sheen = damp(this.sheen, 0, 2.6, dt);
    this.squash.step(dt);
    this.stamp.step(dt);
    if (this.frameIn) this.frame = clamp(this.frame + dt / 0.5, 0, 1);
    if (this.hopY > 0 || this.hopV > 0) {
      this.hopV -= 1300 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) {
        if (this.hopV < -140) {
          this.squash.kick(-6);
          this.env.sound.fx('thud', { gain: 0.22 });
          this.dust();
        }
        this.hopY = 0;
        this.hopV = 0;
      }
    }
    this.driftDue += dt * this.world.rate * (awake ? 1 : SLEEP_RATE) * this.fx.density;
    for (; this.driftDue >= 1; this.driftDue -= 1) this.world.drift(this.fx, this.env.rng, this.ground);
    for (const b of this.bolts) b.age += dt;
    this.bolts = this.bolts.filter((b) => b.age < 0.34);
  }

  private dust(): void {
    const g = this.ground;
    for (let i = 0; i < this.fx.count(8); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.fx.emit({
        x: g.x + side * g.tall * 0.12,
        y: g.y - 4,
        vx: side * this.env.rng.range(30, 90),
        vy: -this.env.rng.range(10, 40),
        life: 0.6,
        size: 14,
        size1: 4,
        color: this.world.glow,
        alpha: 0.5,
        drag: 3,
      });
    }
  }

  private pic() {
    return this.env.bank?.sprite('manor', `mn-statue-${this.name}`) ?? null;
  }

  private ensureBackdrop(k: number): void {
    const scale = this.detail ? Math.min(2, Math.max(1, k)) : 1;
    const key = `${Math.round(this.ground.w)}x${Math.round(this.ground.h)}:${scale}`;
    if (key === this.backKey && this.backdrop) return;
    this.backKey = key;
    const ground = this.ground;
    const rng = new Rng(STATUE_NAMES.indexOf(this.name) * 7919 + 13);
    this.backdrop = prerender(ground.w, ground.h, (g) => this.world.paint(g, ground, rng), scale);
  }

  protected paintBack(p: Painter): void {
    const g = p.ctx;
    const ground = this.ground;
    this.ensureBackdrop(p.k);
    g.drawImage(this.backdrop!, 0, 0, p.w, p.h);
    this.world.behind?.(p, ground, this.lit);

    // The room is dark until it wakes, with a pool of light on the statue alone.
    const dark = 0.84 * (1 - this.lit);
    if (dark > 0.01) {
      const cy = ground.y - ground.tall * 0.5;
      const hole = g.createRadialGradient(ground.x, cy, ground.tall * 0.22, ground.x, cy, ground.tall * 1.05);
      hole.addColorStop(0, css([6, 6, 18], 0));
      hole.addColorStop(1, css([6, 6, 18], dark));
      g.fillStyle = hole;
      g.fillRect(0, 0, p.w, p.h);
    }

    if (this.awake > 0.01) {
      const light = p.light;
      const cy = ground.y - ground.tall * 0.5;
      const breath = 0.88 + 0.12 * Math.sin(p.t * 2.2);
      glowAt(
        light,
        ground.x,
        cy,
        ground.tall * 2.3,
        this.world.glow,
        0.42 * (this.world.glowScale ?? 1) * this.awake * breath,
      );
      glowAt(light, ground.x, cy, ground.tall * 1.2, [255, 255, 255], 0.16 * this.awake);
      if (this.detail) this.rays(light, ground.x, cy, ground.tall * 1.7, p.t);
    } else if (this.phase === 'play' || this.shown < WAKE_AT) {
      // Before it wakes: one soft beam from above.
      glowAt(p.light, ground.x, ground.y - ground.tall * 0.55, ground.tall * 1.5, [230, 236, 255], 0.2);
    }
    this.paintBolts(p);
    this.paintStatue(p);
  }

  private rays(g: CanvasRenderingContext2D, x: number, y: number, reach: number, t: number): void {
    const wedges = 9;
    g.fillStyle = css(this.world.glow, 0.07 * this.awake);
    for (let i = 0; i < wedges; i++) {
      const a = t * 0.22 + (i * TAU) / wedges;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a - 0.09) * reach, y + Math.sin(a - 0.09) * reach);
      g.lineTo(x + Math.cos(a + 0.09) * reach, y + Math.sin(a + 0.09) * reach);
      g.closePath();
      g.fill();
    }
  }

  private paintBolts(p: Painter): void {
    const g = p.light;
    const stop = this.ground.y - this.ground.tall * 0.25;
    for (const b of this.bolts) {
      const flicker = Math.sin(b.age * 70) > -0.2 ? 1 : 0.35;
      const fade = (1 - b.age / 0.34) * flicker;
      const rng = new Rng(b.seed);
      let x = b.x;
      const points: [number, number][] = [[x, 0]];
      for (let y = 0; y < stop; y += rng.range(20, 36)) {
        x += rng.range(-18, 18);
        points.push([x, y]);
      }
      points.push([x + rng.range(-10, 10), stop]);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [width, color, alpha] of [
        [9, [150, 130, 255], 0.35],
        [3.2, [255, 255, 255], 1],
      ] as const) {
        g.strokeStyle = css(color as RGB, alpha * fade);
        g.lineWidth = width;
        g.beginPath();
        points.forEach(([px, py], i) => {
          i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
        });
        g.stroke();
      }
      glowAt(g, points[points.length - 1]![0], stop, 120, [200, 190, 255], 0.5 * fade);
    }
  }

  private paintStatue(p: Painter): void {
    const g = p.ctx;
    const ground = this.ground;
    const s = ground.tall / STATUE_HEIGHT;
    const bob = this.awake * Math.sin(p.t * 2.1) * 2.2;
    const sway = this.awake * Math.sin(p.t * 1.3) * 0.018;
    const stretch = this.squash.x;
    const x = ground.x;
    const y = ground.y - this.hopY + bob;
    const pic = this.pic();
    if (!pic) {
      this.paintStandIn(g, x, y, ground.tall, p.t);
      return;
    }
    const opts = { scale: s, sx: 1 - stretch * 0.4, sy: 1 + stretch * 0.5, rot: sway };
    drawPic(g, pic, x, y, opts);
    const bank = this.env.bank!;
    // A statue that has not woken is a little grey and dark; the light brings its colours up.
    if (this.awake < 0.98) drawPic(g, bank.shaded(pic, ASLEEP), x, y, { ...opts, alpha: (1 - this.awake) * 0.7 });
    // The moment it wakes it is white with light, and then it is itself.
    if (this.sheen > 0.02)
      drawPic(g, bank.tinted(pic, [255, 255, 255], 0.9), x, y, { ...opts, alpha: this.sheen * 0.85 });
  }

  /**
   * What stands in for a statue whose picture is not loaded: a pedestal and a round, glowing
   * creature. It is never what the player sees in the game.
   */
  private paintStandIn(g: CanvasRenderingContext2D, x: number, y: number, tall: number, t: number): void {
    g.fillStyle = css([236, 226, 206]);
    addRoundedRect(g, x - tall * 0.2, y - tall * 0.22, tall * 0.4, tall * 0.22, 8);
    g.fill();
    g.fillStyle = css(darken(this.world.glow, 0.3));
    g.beginPath();
    g.ellipse(x, y - tall * 0.5 + Math.sin(t * 2) * 2, tall * 0.2, tall * 0.28, 0, 0, TAU);
    g.fill();
  }

  protected paintFront(p: Painter): void {
    const a = easeOutCubic(this.frame);
    if (a <= 0.003) return;
    const g = p.ctx;
    const { w, h } = p;
    g.save();
    g.globalAlpha = a;
    // A cream border, with the airmail stripes of red and blue running round it.
    g.fillStyle = css([252, 242, 222]);
    g.beginPath();
    g.rect(0, 0, w, h);
    addRoundedRect(g, BORDER, BORDER, w - BORDER * 2, h - BORDER * 2, 16);
    g.fill('evenodd');
    g.lineWidth = BORDER * 0.5;
    g.beginPath();
    addRoundedRect(g, BORDER / 2, BORDER / 2, w - BORDER, h - BORDER, 12);
    g.setLineDash([16, 16]);
    g.strokeStyle = css([232, 76, 82]);
    g.stroke();
    g.lineDashOffset = 16;
    g.strokeStyle = css([72, 120, 226]);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 1.4;
    g.strokeStyle = css([120, 84, 64], 0.45);
    g.beginPath();
    addRoundedRect(g, BORDER, BORDER, w - BORDER * 2, h - BORDER * 2, 16);
    g.stroke();
    g.restore();
    this.paintStamp(g, w, h);
  }

  private paintStamp(g: CanvasRenderingContext2D, w: number, h: number): void {
    const land = this.stamp.x;
    if (land <= 0.01) return;
    const sw = 50;
    const sh = 60;
    const cx = w - BORDER - 18 - sw / 2;
    const cy = h - BORDER - 14 - sh / 2;
    const scale = lerp(1.9, 1, clamp(land)) + Math.max(0, land - 1) * 0.1;
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.1);
    g.scale(scale, scale);
    g.globalAlpha = clamp(land * 3);
    // The teeth round a stamp's edge, then its paper, and a field of the world's colour with a
    // picture of the world.
    g.fillStyle = css([255, 252, 244]);
    for (let i = 0; i <= 6; i++) {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(side * (sw / 2), -sh / 2 + (i / 6) * sh, 3.2, 0, TAU);
        g.fill();
      }
    }
    for (let i = 0; i <= 5; i++) {
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(-sw / 2 + (i / 5) * sw, side * (sh / 2), 3.2, 0, TAU);
        g.fill();
      }
    }
    g.fillRect(-sw / 2, -sh / 2, sw, sh);
    g.fillStyle = css(darken(this.world.glow, 0.62));
    g.fillRect(-sw / 2 + 5, -sh / 2 + 5, sw - 10, sh - 10);
    glowAt(g, 0, 0, 40, this.world.glow, 0.5);
    this.world.glyph(g, 0, 0, 13);
    g.restore();
    // The postmark comes down on it a moment after: a ring and three wavy lines, in ink.
    const mark = clamp(unlerp(1.05, 1.3, land));
    if (mark > 0) {
      g.save();
      g.globalAlpha = 0.5 * easeOutBack(mark);
      g.strokeStyle = css([60, 44, 80]);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx - sw * 0.55, cy + sh * 0.15, 21, 0, TAU);
      g.stroke();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        for (let x = 0; x <= 40; x += 4) g.lineTo(cx - sw * 1.55 + x, cy - 6 + i * 11 + Math.sin(x * 0.4) * 2);
        g.stroke();
      }
      g.restore();
    }
  }

  protected reset(): void {
    this.lit = 0.1;
    this.awake = 0;
    this.sheen = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.squash.x = 0;
    this.squash.v = 0;
    this.stamp.x = 0;
    this.stamp.v = 0;
    this.stamp.target = 0;
    this.frame = 0;
    this.frameIn = false;
    this.driftDue = 0;
    this.bolts = [];
    this.hopped = 0;
    this.notes = 0;
  }
}
