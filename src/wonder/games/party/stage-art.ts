import type { SpriteBank } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { addRoundedRect, glowAt, prerender } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { type Plan, wireAt } from './layout';
import { TILE_COLORS, type Tiles } from './tiles';
import { sharp } from './world-art';

/**
 * The stage: a dance floor on a wooden platform, a pole at each back corner with a string of
 * coloured bulbs and little flags between them, a speaker beside each pole, and the balloons tied
 * to the poles. What never changes is drawn once. The tiles, the bulbs, the speakers' cones and the
 * balloons are drawn fresh, because they move with the music.
 */

const WOOD_TOP = [96, 56, 88] as const;
const WOOD_BOTTOM = [44, 24, 62] as const;
const TILE_A = [34, 26, 82] as const;
const TILE_B = [48, 36, 104] as const;

/** The little flags: their colours, in the order they hang. */
const FLAGS = [COLORS.pink, COLORS.gold, COLORS.cyan, COLORS.violet, COLORS.orange, COLORS.mint, COLORS.rose] as const;

/** What the stage needs to know each frame. */
export interface StageState {
  readonly tiles: Tiles;
  /** Where the music is, in beats. */
  readonly beats: number;
  /** How hard the speakers are pushing now, from 0 to 1. */
  readonly pump: number;
  /** How lively the party is, from 0 to 1. */
  readonly lively: number;
  readonly t: number;
}

export class StageArt {
  private back: HTMLCanvasElement | null = null;
  private key = '';
  private plan: Plan | null = null;

  constructor(private readonly bank: SpriteBank | null) {}

  /** The platform, the poles and the speaker boxes, drawn once for this screen. */
  place(plan: Plan, tiles: Tiles, k: number): void {
    this.plan = plan;
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    this.back = prerender(plan.w, plan.h, (g) => this.paintStatic(g, plan, tiles), sharp(k));
  }

  private paintStatic(g: CanvasRenderingContext2D, plan: Plan, tiles: Tiles): void {
    const f = plan.floor;
    const lip = Math.max(8, plan.h * 0.032);
    // A soft shadow on the meadow under the platform.
    g.fillStyle = 'rgba(2,6,22,0.4)';
    g.beginPath();
    g.ellipse(plan.w / 2, f.bottom + lip * 0.7, (f.bottomRight - f.bottomLeft) * 0.53, lip * 1.5, 0, 0, TAU);
    g.fill();
    // The front and the two sides of the platform.
    const face = g.createLinearGradient(0, f.bottom, 0, f.bottom + lip);
    face.addColorStop(0, css(WOOD_TOP));
    face.addColorStop(1, css(WOOD_BOTTOM));
    g.fillStyle = face;
    g.beginPath();
    g.moveTo(f.bottomLeft, f.bottom);
    g.lineTo(f.bottomRight, f.bottom);
    g.lineTo(f.bottomRight + 2, f.bottom + lip);
    g.lineTo(f.bottomLeft - 2, f.bottom + lip);
    g.closePath();
    g.fill();
    g.fillStyle = css(darken(WOOD_BOTTOM, 0.1));
    g.beginPath();
    g.moveTo(f.topLeft, f.top);
    g.lineTo(f.bottomLeft, f.bottom);
    g.lineTo(f.bottomLeft - 2, f.bottom + lip);
    g.lineTo(f.topLeft - 3, f.top + lip * 0.35);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(f.topRight, f.top);
    g.lineTo(f.bottomRight, f.bottom);
    g.lineTo(f.bottomRight + 2, f.bottom + lip);
    g.lineTo(f.topRight + 3, f.top + lip * 0.35);
    g.closePath();
    g.fill();
    // Planks on the front.
    g.strokeStyle = 'rgba(20,8,34,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = f.bottomLeft + 36; x < f.bottomRight - 10; x += 52) {
      g.moveTo(x, f.bottom + 1);
      g.lineTo(x + 1, f.bottom + lip);
    }
    g.stroke();
    // The tiles, in two blues that take turns, lighter toward the back where the sky shines on
    // them.
    for (let row = 0; row < tiles.rows; row++) {
      for (let col = 0; col < tiles.cols; col++) {
        const q = tiles.corners(col, row);
        const depth = row / tiles.rows;
        const base = mix((col + row) % 2 === 0 ? TILE_A : TILE_B, [86, 60, 150], (1 - depth) * 0.22);
        g.fillStyle = css(base);
        g.beginPath();
        g.moveTo(q[0]![0], q[0]![1]);
        for (let i = 1; i < 4; i++) g.lineTo(q[i]![0], q[i]![1]);
        g.closePath();
        g.fill();
        // A bright edge along the back of each tile, as light on a polished floor.
        g.strokeStyle = css(lighten(base, 0.35), 0.55);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(q[0]![0] + 0.5, q[0]![1] + 0.5);
        g.lineTo(q[1]![0] - 0.5, q[1]![1] + 0.5);
        g.stroke();
      }
    }
    // The seams between the tiles.
    g.strokeStyle = 'rgba(8,4,28,0.65)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let row = 0; row <= tiles.rows; row++) {
      const q = tiles.corners(0, Math.min(row, tiles.rows - 1));
      const r = tiles.corners(tiles.cols - 1, Math.min(row, tiles.rows - 1));
      const y = row === tiles.rows ? q[3]![1] : q[0]![1];
      g.moveTo(row === tiles.rows ? q[3]![0] : q[0]![0], y);
      g.lineTo(row === tiles.rows ? r[2]![0] : r[1]![0], y);
    }
    for (let col = 0; col <= tiles.cols; col++) {
      const a = tiles.corners(Math.min(col, tiles.cols - 1), 0);
      const b = tiles.corners(Math.min(col, tiles.cols - 1), tiles.rows - 1);
      g.moveTo(col === tiles.cols ? a[1]![0] : a[0]![0], a[0]![1]);
      g.lineTo(col === tiles.cols ? b[2]![0] : b[3]![0], b[3]![1]);
    }
    g.stroke();
    // A haze over the back of the floor, so that it goes away into the night.
    const haze = g.createLinearGradient(0, f.top, 0, f.top + (f.bottom - f.top) * 0.5);
    haze.addColorStop(0, 'rgba(140,90,190,0.28)');
    haze.addColorStop(1, 'rgba(140,90,190,0)');
    g.fillStyle = haze;
    g.beginPath();
    g.moveTo(f.topLeft, f.top);
    g.lineTo(f.topRight, f.top);
    g.lineTo(f.bottomRight, f.bottom);
    g.lineTo(f.bottomLeft, f.bottom);
    g.closePath();
    g.fill();
    // The poles.
    for (const pole of plan.poles) this.paintPole(g, pole.x, pole.base, pole.top, plan.portrait ? 1.15 : 1);
    // The speaker boxes.
    for (const s of plan.speakers) this.paintBox(g, s.x, s.y, s.w, s.h);
  }

  private paintPole(g: CanvasRenderingContext2D, x: number, base: number, top: number, size: number): void {
    const wTop = 3 * size;
    const wBase = 4.6 * size;
    const grad = g.createLinearGradient(x - wBase, 0, x + wBase, 0);
    grad.addColorStop(0, css(lighten(WOOD_TOP, 0.2)));
    grad.addColorStop(0.5, css(WOOD_TOP));
    grad.addColorStop(1, css(WOOD_BOTTOM));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - wTop, top);
    g.lineTo(x + wTop, top);
    g.lineTo(x + wBase, base);
    g.lineTo(x - wBase, base);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,8,34,0.45)';
    g.lineWidth = 1;
    g.stroke();
    // A foot of stone.
    g.fillStyle = css([92, 84, 130]);
    addRoundedRect(g, x - wBase * 1.7, base - 5 * size, wBase * 3.4, 7 * size, 2.5);
    g.fill();
    // A cap with a ring, where the string is tied.
    g.fillStyle = css(lighten(WOOD_TOP, 0.35));
    g.beginPath();
    g.arc(x, top - 1, wTop * 1.35, 0, TAU);
    g.fill();
  }

  private paintBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const left = x - w / 2;
    const top = y - h;
    const body = g.createLinearGradient(left, top, left + w, top + h);
    body.addColorStop(0, css([44, 36, 92]));
    body.addColorStop(1, css([22, 16, 52]));
    g.fillStyle = body;
    addRoundedRect(g, left, top, w, h, w * 0.1);
    g.fill();
    g.strokeStyle = css([150, 130, 230], 0.6);
    g.lineWidth = 1.6;
    g.stroke();
    // A bevel along the top and left, and two feet.
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(left + w * 0.12, top + 2);
    g.lineTo(left + w * 0.88, top + 2);
    g.stroke();
    g.fillStyle = css([20, 14, 44]);
    g.fillRect(left + w * 0.1, y - 1, w * 0.16, 4);
    g.fillRect(left + w * 0.74, y - 1, w * 0.16, 4);
    // The grille's rim and the name plate.
    g.fillStyle = css([255, 160, 214], 0.85);
    g.fillRect(x - w * 0.14, top + h * 0.9, w * 0.28, 2.2);
  }

  /** The platform, the poles and the speaker boxes, `ox` units along. */
  paintBack(p: Painter, ox: number): void {
    const plan = this.plan;
    if (!plan || !this.back) return;
    p.ctx.drawImage(this.back, ox, 0, plan.w, plan.h);
  }

  /**
   * The tiles, lit. They are added to the picture, under the friends, so that a friend who stands
   * on a bright tile keeps her own colours. Only a faint halo goes on the light sheet, where it
   * blooms.
   */
  paintTiles(p: Painter, ox: number, s: StageState): void {
    const plan = this.plan;
    if (!plan) return;
    const g = p.ctx;
    const before = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    const tiles = s.tiles;
    for (let row = 0; row < tiles.rows; row++) {
      for (let col = 0; col < tiles.cols; col++) {
        const tile = tiles.at(col, row);
        if (tile.glow < 0.03) continue;
        const q = tiles.corners(col, row);
        const c = TILE_COLORS[tile.color]!;
        g.fillStyle = css(c, Math.min(1, tile.glow * 0.72));
        g.beginPath();
        g.moveTo(q[0]![0] + ox + 0.8, q[0]![1] + 0.8);
        g.lineTo(q[1]![0] + ox - 0.8, q[1]![1] + 0.8);
        g.lineTo(q[2]![0] + ox - 0.8, q[2]![1] - 0.8);
        g.lineTo(q[3]![0] + ox + 0.8, q[3]![1] - 0.8);
        g.closePath();
        g.fill();
      }
    }
    g.globalCompositeOperation = before;
    for (let row = 0; row < tiles.rows; row++) {
      for (let col = 0; col < tiles.cols; col++) {
        const tile = tiles.at(col, row);
        if (tile.glow < 0.3) continue;
        const q = tiles.corners(col, row);
        const wide = q[2]![0] - q[3]![0];
        glowAt(
          p.light,
          (q[0]![0] + q[2]![0]) / 2 + ox,
          (q[0]![1] + q[2]![1]) / 2,
          wide * 1.9,
          TILE_COLORS[tile.color]!,
          0.12 * tile.glow,
        );
      }
    }
  }

  /** The front edge of the platform, a strip of lights that run along it with the beat. */
  paintEdge(p: Painter, ox: number, s: StageState): void {
    const plan = this.plan;
    if (!plan) return;
    const f = plan.floor;
    const g = p.ctx;
    const lip = Math.max(8, plan.h * 0.032);
    const bulbs = 24;
    for (let i = 0; i < bulbs; i++) {
      const x = f.bottomLeft + ((f.bottomRight - f.bottomLeft) * (i + 0.5)) / bulbs + ox;
      const chase = 0.5 + 0.5 * Math.cos(TAU * (i / 8 - s.beats / 2));
      const c = TILE_COLORS[(i + Math.floor(s.beats / 2)) % TILE_COLORS.length]!;
      const level = 0.25 + 0.75 * chase * (0.4 + 0.6 * s.lively);
      g.fillStyle = css(mix([40, 30, 70], c, level));
      g.fillRect(x - 3.2, f.bottom + lip * 0.3, 6.4, lip * 0.34);
      if (level > 0.55) glowAt(p.light, x, f.bottom + lip * 0.47, 22, c, (level - 0.5) * 0.9);
    }
  }

  /** The string of bulbs and the flags that hang from it. */
  paintWire(p: Painter, ox: number, s: StageState): void {
    const plan = this.plan;
    if (!plan) return;
    const g = p.ctx;
    const { w } = plan;
    const poles = plan.poles;
    g.strokeStyle = css([30, 18, 52], 0.9);
    g.lineWidth = 1.6;
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 16) {
      const y = wireAt(plan, x);
      if (x === -10) g.moveTo(x + ox, y);
      else g.lineTo(x + ox, y);
    }
    g.stroke();
    // Flags between the poles, swinging a little.
    const lo = poles[0].x + 8;
    const hi = poles[1].x - 8;
    const gap = plan.portrait ? 21 : 24;
    const count = Math.max(2, Math.floor((hi - lo) / gap));
    const low = p.light === p.ctx;
    for (let i = 0; i <= count; i++) {
      const x = lo + ((hi - lo) * i) / count;
      const y = wireAt(plan, x) + 1;
      const swing = Math.sin(s.t * 1.9 + i * 0.7) * (p.calm ? 0.025 : 0.07);
      const c = FLAGS[i % FLAGS.length]!;
      g.save();
      g.translate(x + ox, y);
      g.rotate(swing);
      g.fillStyle = css(darken(c, 0.18));
      g.beginPath();
      g.moveTo(-7, 0);
      g.lineTo(7, 0);
      g.lineTo(0, 17);
      g.closePath();
      g.fill();
      if (!low) {
        g.fillStyle = css(lighten(c, 0.35), 0.5);
        g.beginPath();
        g.moveTo(-7, 0);
        g.lineTo(0, 0);
        g.lineTo(-1.5, 9);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
    // The bulbs, each a colour and chasing round.
    const step = plan.portrait ? 26 : 32;
    let n = 0;
    for (let x = step / 2; x < w; x += step, n++) {
      const y = wireAt(plan, x) - 2;
      const chase = 0.5 + 0.5 * Math.cos(TAU * (n / 7 - s.beats / 4));
      const c = TILE_COLORS[(n + Math.floor(s.beats / 4)) % TILE_COLORS.length]!;
      const level = clamp(0.5 + 0.45 * chase + 0.2 * s.lively);
      g.fillStyle = css([30, 18, 52]);
      g.fillRect(x + ox - 1.4, y - 2, 2.8, 4);
      g.fillStyle = css(mix([60, 50, 90], lighten(c, 0.3), level));
      g.beginPath();
      g.ellipse(x + ox, y + 5.5, 3.1, 4.2, 0, 0, TAU);
      g.fill();
      glowAt(p.light, x + ox, y + 5.5, 26 + 10 * level, c, 0.18 + 0.5 * level);
    }
  }

  /** The speakers' cones, which push out on the beat. */
  paintSpeakers(p: Painter, ox: number, s: StageState): void {
    const plan = this.plan;
    if (!plan) return;
    const g = p.ctx;
    for (const sp of plan.speakers) {
      const x = sp.x + ox;
      const cone = (cy: number, r: number, push: number): void => {
        const rr = r * (1 + 0.1 * push);
        const grad = g.createRadialGradient(x - rr * 0.25, cy - rr * 0.25, rr * 0.1, x, cy, rr);
        grad.addColorStop(0, css([110, 96, 190]));
        grad.addColorStop(0.55, css([56, 44, 120]));
        grad.addColorStop(1, css([22, 14, 52]));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, cy, rr, 0, TAU);
        g.fill();
        g.strokeStyle = css(lighten([150, 130, 230], push * 0.5), 0.8);
        g.lineWidth = 1.6;
        g.stroke();
        g.fillStyle = css([190, 170, 255], 0.5 + 0.4 * push);
        g.beginPath();
        g.arc(x, cy, rr * 0.3, 0, TAU);
        g.fill();
      };
      cone(sp.y - sp.h * 0.3, sp.w * 0.34, s.pump);
      cone(sp.y - sp.h * 0.74, sp.w * 0.17, s.pump * 0.7);
      if (s.pump > 0.08)
        glowAt(p.light, x, sp.y - sp.h * 0.4, sp.w * 2.4, COLORS.pink, 0.45 * s.pump * (0.4 + 0.6 * s.lively));
    }
  }

  /**
   * The bunches of balloons tied to the poles part of the way up, floating above where they are
   * tied and bobbing.
   */
  paintBalloons(p: Painter, ox: number, t: number): void {
    const plan = this.plan;
    const bank = this.bank;
    if (!plan || !bank) return;
    const names = ['pg-balloons-party', 'pg-balloons-warm'] as const;
    plan.poles.forEach((pole, i) => {
      const pic = bank.sprite('playground', names[i]!, 0);
      if (!pic) return;
      const size = plan.portrait ? 0.4 : 0.36;
      const sway = Math.sin(t * 1.3 + i * 2) * 0.07;
      const bob = Math.sin(t * 1.9 + i) * 1.5;
      const tie = pole.top + (pole.base - pole.top) * 0.52;
      const shaded = bank.shaded(pic, [210, 200, 235]);
      p.ctx.save();
      p.ctx.translate(pole.x + ox + pole.side * 3, tie + bob);
      p.ctx.rotate(sway);
      p.ctx.scale(size, size);
      p.ctx.drawImage(
        shaded.image,
        shaded.sx,
        shaded.sy,
        shaded.sw,
        shaded.sh,
        -shaded.ax,
        -shaded.ay,
        shaded.sw,
        shaded.sh,
      );
      p.ctx.restore();
    });
  }
}
