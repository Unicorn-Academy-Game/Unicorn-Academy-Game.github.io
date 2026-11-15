import { MANOR_CODE } from '../../content/manor';
import { Rng } from '../../domain/rng';
import { Cinema } from '../cinema';
import { css, lighten, type RGB } from '../engine/color';
import { clamp, damp, easeInOutCubic, easeInOutSine, easeOutBack, lerp, Spring, TAU, unlerp } from '../engine/ease';
import { glowAt, label, prerender, roundedRect } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Quality } from '../engine/stage';
import type { WonderEnv } from '../wonder';
import {
  archPath,
  type Front,
  frontOf,
  hallPicture,
  leafPicture,
  paintFront,
  paintLock,
  pumpkin,
  pumpkinSpots,
} from './manor/art';

/**
 * The word goes into the door. After the player types it on the pad, the picture opens on the front
 * of the manor at night, with the letters they typed in a row on the steps. One at a time each
 * letter lifts and flies in an arc into the keyhole, ringing a note higher than the one before, and
 * the lock glows brighter with every letter. When the last is in, the lock clicks, light pours out
 * from it, and the two great doors swing open on the golden hall, with a flock of bats going out
 * over the roof and stars falling. It is their own word, said back to them, and it opens the door.
 */

const TILE_GOLD: readonly RGB[] = [
  [255, 232, 130],
  [240, 168, 48],
];
/** The scale the letters ring on, in semitones from the root, climbing. */
const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26] as const;
const ROOT = 60;
const FIRST_LAUNCH = 0.55;
const LAUNCH_GAP = 0.2;
const FLIGHT = 0.62;
const OPEN_FOR = 1.2;
const END_AFTER = 2.5;

export class ManorWord extends Cinema {
  readonly id = 'manor-word' as const;
  private readonly letters: readonly string[];
  private front: Front = frontOf(640, 360);
  private art: {
    wall: HTMLCanvasElement;
    left: HTMLCanvasElement;
    right: HTMLCanvasElement;
    hall: HTMLCanvasElement;
  } | null = null;
  private artKey = '';
  private detail = true;
  private tiles: { x: number; y: number; size: number }[] = [];
  private launched: number[] = [];
  private landed = 0;
  private glow = 0;
  private unlockAt = 0;
  private open = 0;
  private openFor = 0;
  private readonly keyPulse = new Spring(0, 0, 220, 11);
  private flicker = 0;
  private readonly bounce: Spring[] = [];
  private unlocked = false;

  constructor(env: WonderEnv) {
    super(env);
    this.letters = [...MANOR_CODE.toUpperCase()];
    this.unlockAt = FIRST_LAUNCH + (this.letters.length - 1) * LAUNCH_GAP + FLIGHT + 0.2;
    this.bounce = this.letters.map(() => new Spring(0, 0, 240, 10));
    this.launched = this.letters.map(() => -1);
  }

  override get bloom(): number {
    return this.env.calm ? 0.1 : 0.16;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
  }

  /** What a measuring tool may look at, and never change. */
  inspect(): {
    readonly phase: string;
    readonly shown: number;
    readonly landed: number;
    readonly letters: readonly string[];
    readonly open: number;
    readonly tiles: readonly { readonly x: number; readonly y: number; readonly size: number }[];
    readonly door: Front['door'];
    readonly size: { readonly w: number; readonly h: number };
  } {
    return {
      phase: this.phase,
      shown: this.shown,
      landed: this.landed,
      letters: this.letters,
      open: this.open,
      tiles: this.tiles,
      door: this.front.door,
      size: { w: this.view.w, h: this.view.h },
    };
  }

  protected show(): void {
    const sound = this.env.sound;
    this.cue(0.15, () => sound.fx('swell', { gain: 0.45, size: 0.4 }));
    this.letters.forEach((_, i) => {
      this.cue(FIRST_LAUNCH + i * LAUNCH_GAP, () => this.launch(i));
      this.cue(FIRST_LAUNCH + i * LAUNCH_GAP + FLIGHT, () => this.arrive(i));
    });
    this.cue(this.unlockAt, () => this.unlock());
    this.cue(this.unlockAt + 0.5, () => {
      sound.fx('whoosh', { gain: 0.8, size: 0.8 });
      sound.fx('rumble', { gain: 0.5 });
      this.flock();
    });
    this.cue(this.unlockAt + OPEN_FOR * 0.55, () => {
      [0, 4, 7, 12, 16, 19, 24].forEach((step, i) => {
        sound.note('harp', ROOT + step, { gain: 0.6, seconds: 1.2, delay: i * 0.07 });
      });
      for (const step of [-12, -5, 0, 4]) sound.note('pad', ROOT + step, { gain: 0.5, seconds: 2.2 });
      sound.fx('cheer', { gain: 0.6 });
      this.shower();
    });
    this.cue(this.unlockAt + OPEN_FOR + END_AFTER, () => this.endFinale());
  }

  protected touch(x: number, y: number): void {
    const n = this.fx.count(10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * 70,
        vy: Math.sin(a) * 70,
        life: 0.8,
        size: 8,
        size1: 1,
        color: i % 2 ? [255, 214, 100] : [255, 150, 70],
        shape: 'star4',
        drag: 1.8,
        twinkle: 1.2,
      });
    }
    this.env.sound.note(
      'glass',
      ROOT + NOTES[Math.floor((x / Math.max(1, this.view.w)) * NOTES.length) % NOTES.length]!,
      { gain: 0.5, seconds: 0.4 },
    );
  }

  private launch(i: number): void {
    this.launched[i] = this.shown;
    const tile = this.tiles[i];
    if (!tile) return;
    this.bounce[i]!.kick(-5);
    this.env.sound.fx('whoosh', { gain: 0.18, pitch: i, size: 0.2 });
    for (let k = 0; k < this.fx.count(6); k++)
      this.fx.emit({
        x: tile.x,
        y: tile.y,
        vx: this.env.rng.range(-40, 40),
        vy: -this.env.rng.range(20, 90),
        life: 0.6,
        size: 8,
        size1: 1,
        color: TILE_GOLD[0]!,
        shape: 'star4',
        drag: 2,
        twinkle: 1,
      });
  }

  private arrive(i: number): void {
    this.landed = Math.max(this.landed, i + 1);
    this.glow = this.landed / this.letters.length;
    this.keyPulse.kick(6);
    const { x, y } = this.lockAt();
    this.env.sound.note('glass', ROOT + NOTES[i % NOTES.length]!, { gain: 0.7, seconds: 0.7 });
    this.env.sound.note('bell', ROOT + 12 + NOTES[i % NOTES.length]!, { gain: 0.3, seconds: 0.5 });
    this.fx.emit({ x, y, life: 0.5, size: 8, size1: 70, shape: 'ring', width: 2, color: [255, 226, 130], alpha: 0.9 });
    for (let k = 0; k < this.fx.count(6); k++) {
      const a = this.env.rng.range(0, TAU);
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        life: 0.5,
        size: 6,
        size1: 1,
        color: [255, 236, 160],
        shape: 'spark',
        tail: 0.14,
        drag: 2,
      });
    }
  }

  private unlock(): void {
    this.unlocked = true;
    const { x, y } = this.lockAt();
    this.env.sound.fx('gear', { gain: 0.8 });
    this.env.sound.fx('thud', { gain: 0.8 });
    this.env.sound.fx('snap', { gain: 0.6 });
    this.flash(0.6, [255, 220, 150]);
    this.shake(2.4);
    this.fx.emit({ x, y, life: 0.9, size: 10, size1: 240, shape: 'ring', width: 4, color: [255, 236, 170], alpha: 1 });
    const n = this.fx.count(26);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const v = this.env.rng.range(60, 220);
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: this.env.rng.range(0.6, 1.2),
        size: 6,
        size1: 1,
        color: [255, 226, 130],
        shape: 'spark',
        tail: 0.2,
        halo: 2,
        drag: 1.4,
        gravity: 90,
      });
    }
  }

  /** Bats go out over the roof from the open door. */
  private flock(): void {
    const door = this.front.door;
    const n = this.fx.count(this.env.calm ? 3 : 8);
    for (let i = 0; i < n; i++) {
      this.fx.emit({
        x: door.x,
        y: door.top + (door.bottom - door.top) * 0.45,
        vx: this.env.rng.range(-170, 170),
        vy: -this.env.rng.range(90, 190),
        life: this.env.rng.range(2.2, 3.2),
        size: this.env.rng.range(22, 34),
        color: [40, 20, 70],
        shape: 'butterfly',
        add: false,
        sway: 40,
        delay: i * 0.12,
        alpha: 1,
        alpha1: 1,
        hold: 0.8,
      });
    }
  }

  /** Stars and confetti fall over the open door. */
  private shower(): void {
    const colors: RGB[] = [
      [255, 150, 60],
      [255, 214, 100],
      [190, 140, 255],
      [255, 120, 190],
    ];
    const n = this.fx.count(this.env.calm ? 24 : 60);
    for (let i = 0; i < n; i++) {
      this.fx.emit({
        x: this.env.rng.range(0, this.view.w),
        y: -10 - this.env.rng.range(0, 40),
        vx: this.env.rng.range(-20, 20),
        vy: this.env.rng.range(50, 120),
        life: this.env.rng.range(2.2, 3.4),
        size: this.env.rng.range(6, 11),
        color: colors[i % colors.length]!,
        shape: i % 3 === 0 ? 'star4' : 'confetti',
        spin: this.env.rng.range(-5, 5),
        sway: 30,
        twinkle: 0.8,
        alpha: 1,
        alpha1: 1,
        hold: 0.8,
        delay: this.env.rng.range(0, 0.7),
      });
    }
  }

  private lockAt(): { x: number; y: number } {
    const d = this.front.door;
    return { x: d.x, y: d.top + (d.bottom - d.top) * 0.58 };
  }

  protected arrange(view: View): void {
    this.front = frontOf(view.w, view.h);
    const n = this.letters.length;
    const size = clamp(Math.min((view.w - 30) / (n * 1.2), view.h * 0.1), 24, 40);
    const gap = size * 0.2;
    const row = n * size + (n - 1) * gap;
    const y = this.front.ground + (view.h - this.front.ground) * 0.5;
    this.tiles = this.letters.map((_, i) => ({ x: view.w / 2 - row / 2 + size / 2 + i * (size + gap), y, size }));
    this.artKey = '';
  }

  protected tick(dt: number): void {
    this.keyPulse.step(dt);
    for (const s of this.bounce) s.step(dt);
    this.flicker += dt;
    if (this.unlocked) this.openFor += dt;
    this.open = easeInOutCubic(clamp(this.openFor / OPEN_FOR));
    this.glow = damp(this.glow, this.landed / this.letters.length, 6, dt);
    // Letters in flight leave a trail of small stars behind them.
    for (let i = 0; i < this.letters.length; i++) {
      const at = this.flight(i);
      if (!at || at.u >= 1) continue;
      this.fx.emit({
        x: at.x,
        y: at.y,
        vx: this.env.rng.range(-14, 14),
        vy: this.env.rng.range(-14, 14),
        life: 0.5,
        size: 9,
        size1: 1,
        color: [255, 226, 130],
        shape: 'star4',
        twinkle: 1.4,
        alpha: 0.9,
      });
    }
  }

  /**
   * Where letter `i` is in the air, from its tile to the lock, or nothing if it has not left or has
   * gone in.
   */
  private flight(i: number): { x: number; y: number; u: number; spin: number } | null {
    const t0 = this.launched[i]!;
    const tile = this.tiles[i];
    if (t0 < 0 || !tile) return null;
    const raw = (this.shown - t0) / FLIGHT;
    if (raw < 0) return null;
    const u = easeInOutSine(clamp(raw));
    const to = this.lockAt();
    // An arc that rises first: the control point is above both ends, off to the side a little for
    // each letter.
    const cx = lerp(tile.x, to.x, 0.5) + (i - (this.letters.length - 1) / 2) * 16;
    const cy = Math.min(tile.y, to.y) - this.view.h * 0.22;
    const a = 1 - u;
    return {
      x: a * a * tile.x + 2 * a * u * cx + u * u * to.x,
      y: a * a * tile.y + 2 * a * u * cy + u * u * to.y,
      u: clamp(raw),
      spin: u * (i % 2 === 0 ? 1 : -1) * 0.8,
    };
  }

  private ensureArt(): void {
    const key = `${Math.round(this.view.w)}x${Math.round(this.view.h)}:${this.detail}`;
    if (key === this.artKey && this.art) return;
    this.artKey = key;
    const f = this.front;
    const scale = this.detail ? 2 : 1;
    const rng = new Rng(4242);
    const wall = prerender(
      f.w,
      f.h,
      (g) => {
        paintFront(g, f, rng);
        for (const spot of pumpkinSpots(f)) pumpkin(g, spot.x, spot.y, spot.r);
      },
      scale,
    );
    this.art = { wall, left: leafPicture(f, 'left'), right: leafPicture(f, 'right'), hall: hallPicture(f) };
  }

  protected paintBack(p: Painter): void {
    this.ensureArt();
    const art = this.art!;
    const g = p.ctx;
    const f = this.front;
    const { door } = f;
    const hh = door.bottom - door.top;
    const left = door.x - door.w / 2;
    const right = door.x + door.w / 2;
    g.drawImage(art.wall, 0, 0, p.w, p.h);

    // Candlelight in the pumpkins and the windows, flickering a little.
    pumpkinSpots(f).forEach((spot, i) => {
      glowAt(
        p.light,
        spot.x,
        spot.y - spot.r * 0.2,
        spot.r * (4 + 0.4 * Math.sin(this.flicker * 9 + i * 2)),
        [255, 150, 60],
        0.5,
      );
    });

    // The hall behind the door, which is only ever seen as the leaves turn away.
    if (this.open > 0.001) {
      g.save();
      archPath(g, left, door.top, door.w, door.bottom);
      g.clip();
      g.drawImage(art.hall, left, door.top, door.w, hh);
      g.restore();
      const spill = this.open;
      glowAt(p.light, door.x, door.top + hh * 0.6, door.w * 3, [255, 200, 110], 0.28 * spill);
      // Light lies on the steps and the ground in front, a fan that widens toward the player.
      g.save();
      g.globalCompositeOperation = 'lighter';
      const fan = g.createLinearGradient(0, door.bottom, 0, p.h);
      fan.addColorStop(0, css([255, 206, 110], 0.34 * spill));
      fan.addColorStop(1, css([255, 206, 110], 0));
      g.fillStyle = fan;
      g.beginPath();
      g.moveTo(left + door.w * 0.1, door.bottom);
      g.lineTo(right - door.w * 0.1, door.bottom);
      g.lineTo(right + door.w * 1.1, p.h);
      g.lineTo(left - door.w * 1.1, p.h);
      g.closePath();
      g.fill();
      g.restore();
    }

    // The leaves swing away from the seam: each narrows toward its hinge as it turns, and falls
    // into shadow.
    const narrow = Math.max(0.05, 1 - this.open * 0.93);
    const half = door.w / 2;
    g.drawImage(art.left, left, door.top, half * narrow, hh);
    g.drawImage(art.right, right - half * narrow, door.top, half * narrow, hh);
    if (this.open > 0.01) {
      g.fillStyle = css([20, 8, 30], 0.5 * this.open);
      g.fillRect(left, door.top, half * narrow, hh);
      g.fillRect(right - half * narrow, door.top, half * narrow, hh);
    }

    // The lock, glowing a little more with every letter, and then gone with the doors.
    const lockFade = clamp(1 - this.open * 5);
    if (lockFade > 0.01) {
      const lock = this.lockAt();
      g.globalAlpha = lockFade;
      paintLock(g, lock.x, lock.y, Math.max(11, door.w * 0.11) * (1 + this.keyPulse.x * 0.1), this.glow);
      g.globalAlpha = 1;
      glowAt(
        p.light,
        lock.x,
        lock.y,
        door.w * (0.5 + 1.2 * this.glow + 0.3 * this.keyPulse.x),
        [255, 226, 130],
        (0.2 + 0.7 * this.glow) * lockFade,
      );
    }
  }

  protected paintFront(p: Painter): void {
    const g = p.ctx;
    const spent = clamp(unlerp(this.unlockAt, this.unlockAt + 0.8, this.shown));
    // The row of letters on the steps. A tile that has gone leaves its outline where it was, so the
    // word's place is kept.
    this.letters.forEach((ch, i) => {
      const tile = this.tiles[i]!;
      const flying = this.flight(i);
      g.globalAlpha = 1;
      if (!flying || flying.u > 0) {
        g.strokeStyle = css(TILE_GOLD[1]!, 0.4 * (1 - spent));
        g.lineWidth = 2;
        g.setLineDash([4, 4]);
        roundedRect(g, tile.x - tile.size / 2, tile.y - tile.size / 2, tile.size, tile.size, tile.size * 0.22);
        g.stroke();
        g.setLineDash([]);
      }
      if (flying && flying.u >= 1) return;
      const at = flying ?? { x: tile.x, y: tile.y + this.bounce[i]!.x * 8, u: 0, spin: 0 };
      const scale = lerp(1, 0.62, easeOutBack(clamp(flying?.u ?? 0)) * 0.9);
      this.paintTile(g, ch, at.x, at.y, tile.size * scale, at.spin);
    });
  }

  private paintTile(g: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, spin: number): void {
    g.save();
    g.translate(x, y);
    g.rotate(spin);
    const fill = g.createLinearGradient(0, -size / 2, 0, size / 2);
    fill.addColorStop(0, css(TILE_GOLD[0]!));
    fill.addColorStop(1, css(TILE_GOLD[1]!));
    roundedRect(g, -size / 2, -size / 2, size, size, size * 0.22);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2.2;
    g.strokeStyle = css([60, 36, 90]);
    g.stroke();
    g.fillStyle = css(lighten(TILE_GOLD[0]!, 0.5), 0.55);
    roundedRect(g, -size * 0.38, -size * 0.42, size * 0.76, size * 0.16, size * 0.08);
    g.fill();
    label(g, ch, 0, size * 0.04, size * 0.66, [255, 255, 255]);
    g.restore();
  }

  protected reset(): void {
    this.launched = this.letters.map(() => -1);
    this.landed = 0;
    this.glow = 0;
    this.open = 0;
    this.openFor = 0;
    this.unlocked = false;
    this.flicker = 0;
    this.keyPulse.x = 0;
    this.keyPulse.v = 0;
    for (const s of this.bounce) {
      s.x = 0;
      s.v = 0;
    }
  }
}
