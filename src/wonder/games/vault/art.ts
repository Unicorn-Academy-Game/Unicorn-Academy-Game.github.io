import { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { glowAt, makeCloud, prerender, roundedRect, Starfield } from '../../engine/paint';
import { sharp } from '../party/world-art';
import type { Chest, Plan } from './layout';

/**
 * The vault, drawn once and kept: an open sky over a stone hall with arches and pillars, a tiled
 * floor and a red carpet, and the chest the treasure goes into. What moves is drawn over it every
 * frame: the clouds, the stars, the flames of the torches and the glints on the gold in the
 * alcoves.
 */

const WALL: RGB = [78, 58, 124];
const STONE: RGB = [150, 130, 176];
const GOLD: RGB = [255, 196, 48];
const WOOD: RGB = [168, 98, 52];
const CLOUD_TOP: RGB = [255, 236, 178];
const CLOUD_BOTTOM: RGB = [238, 150, 140];

interface Torch {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
}

interface Glint {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
  readonly rate: number;
}

interface Drift {
  readonly image: HTMLCanvasElement;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
  readonly offset: number;
}

/**
 * The margins around the chest's picture, in shares of its width, so that its lid and rim have
 * room.
 */
const SIDE = 0.06;
const TOP = 0.04;
const BOTTOM = 0.05;

export class VaultArt {
  private key = '';
  private room: HTMLCanvasElement | null = null;
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private drifts: Drift[] = [];
  private stars: Starfield | null = null;
  private torches: Torch[] = [];
  private glints: Glint[] = [];

  constructor(private readonly seed: number) {}

  /** Draws what holds still, for this screen. `k` is device pixels in a unit. */
  place(plan: Plan, k: number): void {
    const key = `${plan.w.toFixed(1)}x${plan.h.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    const scale = Math.min(2, sharp(k));
    this.torches = [];
    this.glints = [];
    this.room = prerender(plan.w, plan.h, (g) => this.paintRoom(g, plan), scale);
    const rng = new Rng(this.seed + 9);
    this.stars = new Starfield(plan.portrait ? 34 : 52, rng, plan.w, 2, plan.sky * 0.78);
    this.drifts = this.cloudsOf(plan, rng);
    const chestScale = Math.min(3, sharp(k) * 1.25);
    this.back = prerender(
      plan.chest.w * (1 + SIDE * 2),
      plan.chest.w * (0.27 + 0.21 + TOP),
      (g) => this.paintChestBack(g, plan.chest.w),
      chestScale,
    );
    this.front = prerender(
      plan.chest.w * (1 + SIDE * 2),
      plan.chest.w * (0.31 + BOTTOM + 0.04),
      (g) => this.paintChestFront(g, plan.chest.w),
      chestScale,
    );
  }

  /** The hall, and the sky over it with its drifting clouds. */
  drawRoom(g: CanvasRenderingContext2D, plan: Plan, t: number, calm: boolean): void {
    if (!this.room) return;
    g.drawImage(this.room, 0, 0, plan.w, plan.h);
    g.save();
    g.beginPath();
    g.rect(0, 0, plan.w, plan.sky);
    g.clip();
    this.stars?.draw(g, t, calm);
    for (const d of this.drifts) {
      const travel = plan.w + d.w;
      const x = ((((d.offset + t * d.speed) % travel) + travel) % travel) - d.w;
      g.drawImage(d.image, x, d.y, d.w, d.h);
    }
    g.restore();
  }

  /** The flames and the glints, which are drawn over the hall, and the light they give. */
  drawLive(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, plan: Plan, t: number, calm: boolean): void {
    for (const torch of this.torches) {
      const flick = 1 + 0.1 * Math.sin(t * 12.7 + torch.phase) + 0.07 * Math.sin(t * 7.1 + torch.phase * 2.3);
      paintFlame(g, torch.x, torch.y, flick);
      glowAt(light, torch.x, torch.y - 10, 150, [255, 168, 78], 0.3 * flick);
    }
    // The sky glows where the clouds are, and lights the top of the hall.
    glowAt(light, plan.w / 2, plan.sky, plan.w * 1.1, [255, 190, 130], calm ? 0.12 : 0.16);
    for (const s of this.glints) {
      const a = Math.sin(t * s.rate + s.phase);
      if (a > 0.55) glowAt(light, s.x, s.y, 12 + 10 * a, [255, 240, 190], (a - 0.55) * 1.6, 'spark');
    }
  }

  /**
   * The back of the chest: its open lid and the inside of it. The heaps go over this, and the front
   * over them.
   */
  drawChestBack(g: CanvasRenderingContext2D, chest: Chest): void {
    if (!this.back) return;
    const w = chest.w * (1 + SIDE * 2);
    g.drawImage(
      this.back,
      chest.x - w / 2,
      chest.rim - chest.back - chest.lid - chest.w * TOP,
      w,
      this.back.height * (w / this.back.width),
    );
  }

  drawChestFront(g: CanvasRenderingContext2D, chest: Chest): void {
    if (!this.front) return;
    const w = chest.w * (1 + SIDE * 2);
    g.drawImage(this.front, chest.x - w / 2, chest.rim - chest.w * 0.04, w, this.front.height * (w / this.front.width));
  }

  /** The soft shadow the chest throws on the floor, under it. */
  drawChestShadow(g: CanvasRenderingContext2D, chest: Chest): void {
    const base = chest.rim + chest.front;
    g.save();
    g.translate(chest.x, base + 2);
    g.scale(1, 0.18);
    const shade = g.createRadialGradient(0, 0, 0, 0, 0, chest.w * 0.68);
    shade.addColorStop(0, 'rgba(10,4,24,0.55)');
    shade.addColorStop(1, 'rgba(10,4,24,0)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(0, 0, chest.w * 0.68, 0, TAU);
    g.fill();
    g.restore();
  }

  private cloudsOf(plan: Plan, rng: Rng): Drift[] {
    const out: Drift[] = [];
    const count = Math.max(4, Math.round(plan.w / 120));
    for (let i = 0; i < count; i++) {
      const w = rng.range(120, 190);
      const h = rng.range(34, 50);
      const near = i % 2 === 0;
      out.push({
        image: makeCloud(
          w,
          h,
          rng,
          near ? CLOUD_TOP : lighten(CLOUD_TOP, 0.1),
          near ? CLOUD_BOTTOM : mix(CLOUD_BOTTOM, [255, 190, 150], 0.4),
          6,
        ),
        y: near ? plan.sky - h * 0.62 : plan.sky - h * 1.02,
        w,
        h,
        speed: near ? rng.range(5, 8) : rng.range(2.5, 4.5),
        offset: (i / count) * (plan.w + 190) + rng.range(0, 30),
      });
    }
    return out.sort((a, b) => a.speed - b.speed);
  }

  private paintRoom(g: CanvasRenderingContext2D, plan: Plan): void {
    const rng = new Rng(this.seed);
    const { w, h, sky, floor } = plan;
    // The sky: deep at the top and gold where the clouds are.
    const dome = g.createLinearGradient(0, 0, 0, sky);
    dome.addColorStop(0, css([22, 20, 78]));
    dome.addColorStop(0.5, css([84, 52, 146]));
    dome.addColorStop(0.85, css([232, 128, 156]));
    dome.addColorStop(1, css([255, 202, 132]));
    g.fillStyle = dome;
    g.fillRect(0, 0, w, sky + 2);
    // The wall, dark between the stones so that the mortar shows.
    const wall = g.createLinearGradient(0, sky, 0, floor);
    wall.addColorStop(0, css(darken(WALL, 0.25)));
    wall.addColorStop(1, css(darken(WALL, 0.05)));
    g.fillStyle = wall;
    g.fillRect(0, sky, w, floor - sky + 2);
    this.paintBricks(g, rng, plan);
    const count = plan.portrait ? 2 : clamp(Math.round(w / 200), 3, 5);
    const bay = w / count;
    for (let i = 0; i < count; i++) this.paintAlcove(g, rng, plan, i * bay + bay / 2, bay - 34);
    for (let i = 0; i <= count; i++) this.paintPillar(g, plan, i * bay, i > 0 && i < count);
    this.paintCornice(g, plan);
    this.paintFloor(g, plan);
    this.paintCarpet(g, plan);
    // The dark of the corners, so that the middle is where the light is.
    const edge = g.createRadialGradient(w / 2, h * 0.58, Math.min(w, h) * 0.3, w / 2, h * 0.58, Math.max(w, h) * 0.78);
    edge.addColorStop(0, 'rgba(14,6,34,0)');
    edge.addColorStop(1, 'rgba(14,6,34,0.45)');
    g.fillStyle = edge;
    g.fillRect(0, 0, w, h);
  }

  private paintBricks(g: CanvasRenderingContext2D, rng: Rng, plan: Plan): void {
    const rowH = 16;
    for (let y = plan.sky, row = 0; plan.floor - y > 6; y += rowH, row++) {
      let x = row % 2 ? -22 : 0;
      while (x < plan.w) {
        const bw = rng.range(36, 54);
        const shade = rng.range(-0.06, 0.1) + ((y - plan.sky) / (plan.floor - plan.sky)) * 0.1;
        g.fillStyle = css(shade >= 0 ? lighten(WALL, shade) : darken(WALL, -shade));
        roundedRect(g, x + 1, y + 1, bw - 2, Math.min(rowH, plan.floor - y) - 2, 3);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(x + 3, y + 2, bw - 6, 1.4);
        x += bw;
      }
    }
  }

  private paintAlcove(g: CanvasRenderingContext2D, rng: Rng, plan: Plan, cx: number, aw: number): void {
    const r = aw / 2;
    const top = plan.sky + 28;
    const spring = top + r;
    const bottom = plan.floor - 3;
    const arch = new Path2D();
    arch.moveTo(cx - r, bottom);
    arch.lineTo(cx - r, spring);
    arch.arc(cx, spring, r, Math.PI, 0);
    arch.lineTo(cx + r, bottom);
    arch.closePath();
    // The stone frame round the opening, which is lit from the front, and then the dark inside it.
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = css(lighten(STONE, 0.04));
    g.lineWidth = 11;
    g.stroke(arch);
    g.strokeStyle = css(darken(STONE, 0.35));
    g.lineWidth = 2;
    g.stroke(arch);
    g.clip(arch);
    const inside = g.createLinearGradient(0, top, 0, bottom);
    inside.addColorStop(0, css([26, 16, 56]));
    inside.addColorStop(1, css([60, 36, 86]));
    g.fillStyle = inside;
    g.fillRect(cx - r - 6, top - 6, aw + 12, bottom - top + 12);
    // The inside is a room of its own, a little lighter in the middle where a lamp would be.
    glowAt(g, cx, bottom - 30, aw * 1.5, [255, 190, 100], 0.2);
    const shelves = plan.portrait ? Math.max(2, Math.floor((bottom - spring) / 92)) : 1;
    for (let s = 0; s < shelves; s++) {
      const y = bottom - 4 - s * ((bottom - spring - 20) / Math.max(1, shelves));
      this.paintShelf(g, rng, cx, y, aw - 8, s);
    }
    g.restore();
  }

  /** A stone shelf, and on it what a treasure house keeps: a heap of gold, a vase, a crystal. */
  private paintShelf(g: CanvasRenderingContext2D, rng: Rng, cx: number, y: number, w: number, index: number): void {
    const slab = g.createLinearGradient(0, y, 0, y + 7);
    slab.addColorStop(0, css(lighten(STONE, 0.15)));
    slab.addColorStop(1, css(darken(STONE, 0.3)));
    g.fillStyle = slab;
    g.fillRect(cx - w / 2, y, w, 7);
    const kinds = ['gold', 'vase', 'crystal'] as const;
    const left = cx - w / 2 + 14;
    const span = w - 28;
    const things = 3;
    for (let i = 0; i < things; i++) {
      const kind = kinds[(i + index) % kinds.length]!;
      const x = left + (span * (i + 0.5)) / things + rng.range(-3, 3);
      if (kind === 'gold') {
        for (let c = 0; c < 14; c++) {
          const a = rng.range(-1, 1);
          const cxp = x + a * 15;
          const cyp = y - 3 - (1 - a * a) * 14 * rng.range(0.4, 1) + (c % 3);
          const coin = g.createRadialGradient(cxp - 1, cyp - 1, 0.5, cxp, cyp, 5);
          coin.addColorStop(0, css(lighten(GOLD, 0.5)));
          coin.addColorStop(1, css(darken(GOLD, 0.25)));
          g.fillStyle = coin;
          g.beginPath();
          g.ellipse(cxp, cyp, 5, 3.8, 0, 0, TAU);
          g.fill();
        }
        this.glints.push({ x, y: y - 14, phase: rng.range(0, TAU), rate: rng.range(1.2, 2.2) });
      } else if (kind === 'vase') {
        const tone: RGB = rng.pick([
          [196, 84, 130],
          [82, 170, 190],
          [220, 150, 60],
        ] as const);
        const body = g.createLinearGradient(x - 10, 0, x + 10, 0);
        body.addColorStop(0, css(lighten(tone, 0.25)));
        body.addColorStop(1, css(darken(tone, 0.35)));
        g.fillStyle = body;
        g.beginPath();
        g.moveTo(x - 4, y - 28);
        g.quadraticCurveTo(x - 4, y - 22, x - 10, y - 14);
        g.quadraticCurveTo(x - 12, y - 4, x - 5, y);
        g.lineTo(x + 5, y);
        g.quadraticCurveTo(x + 12, y - 4, x + 10, y - 14);
        g.quadraticCurveTo(x + 4, y - 22, x + 4, y - 28);
        g.closePath();
        g.fill();
        g.fillStyle = css(GOLD);
        g.fillRect(x - 6, y - 30, 12, 3);
        g.fillRect(x - 9, y - 13, 18, 2);
      } else {
        const tone: RGB = rng.pick([
          [120, 220, 255],
          [255, 140, 220],
          [150, 255, 190],
        ] as const);
        const ball = g.createRadialGradient(x - 3, y - 17, 1, x, y - 13, 11);
        ball.addColorStop(0, css(lighten(tone, 0.8)));
        ball.addColorStop(1, css(darken(tone, 0.2), 0.9));
        g.fillStyle = ball;
        g.beginPath();
        g.arc(x, y - 13, 11, 0, TAU);
        g.fill();
        g.fillStyle = css(darken(STONE, 0.1));
        g.fillRect(x - 7, y - 3, 14, 3);
        this.glints.push({ x: x - 3, y: y - 17, phase: rng.range(0, TAU), rate: rng.range(1, 1.8) });
      }
    }
  }

  private paintPillar(g: CanvasRenderingContext2D, plan: Plan, x: number, torch: boolean): void {
    const pw = 22;
    const top = plan.sky + 10;
    const bottom = plan.floor + 2;
    const shaft = g.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    shaft.addColorStop(0, css(darken(STONE, 0.3)));
    shaft.addColorStop(0.35, css(lighten(STONE, 0.18)));
    shaft.addColorStop(1, css(darken(STONE, 0.4)));
    g.fillStyle = shaft;
    g.fillRect(x - pw / 2, top, pw, bottom - top);
    g.fillStyle = css(darken(STONE, 0.15));
    roundedRect(g, x - pw / 2 - 5, top - 2, pw + 10, 12, 3);
    g.fill();
    roundedRect(g, x - pw / 2 - 5, bottom - 14, pw + 10, 16, 3);
    g.fill();
    // Two rings of gold round the shaft.
    for (const at of [0.16, 0.84]) {
      const y = top + (bottom - top) * at;
      const ring = g.createLinearGradient(0, y, 0, y + 6);
      ring.addColorStop(0, css(lighten(GOLD, 0.5)));
      ring.addColorStop(1, css(darken(GOLD, 0.3)));
      g.fillStyle = ring;
      g.fillRect(x - pw / 2 - 1, y, pw + 2, 6);
    }
    if (!torch) return;
    const y = top + (bottom - top) * 0.4;
    // The iron cup of a torch, and the stick in it. The flame is drawn over, every frame.
    g.fillStyle = css([40, 30, 52]);
    g.beginPath();
    g.moveTo(x - 9, y - 2);
    g.lineTo(x + 9, y - 2);
    g.lineTo(x + 5, y + 9);
    g.lineTo(x - 5, y + 9);
    g.closePath();
    g.fill();
    g.fillRect(x - 3, y + 8, 6, 8);
    g.fillStyle = css([70, 46, 36]);
    g.fillRect(x - 2.5, y - 6, 5, 6);
    this.torches.push({ x, y: y - 6, phase: x * 0.37 });
  }

  /**
   * The stone band that the sky is set into, with a line of gold along it and little arches under.
   */
  private paintCornice(g: CanvasRenderingContext2D, plan: Plan): void {
    const y = plan.sky;
    const band = g.createLinearGradient(0, y - 2, 0, y + 14);
    band.addColorStop(0, css(lighten(STONE, 0.25)));
    band.addColorStop(1, css(darken(STONE, 0.28)));
    g.fillStyle = band;
    g.fillRect(0, y - 2, plan.w, 16);
    g.fillStyle = css(GOLD);
    g.fillRect(0, y - 2, plan.w, 3);
    g.fillStyle = css(lighten(GOLD, 0.6), 0.8);
    g.fillRect(0, y - 2, plan.w, 1);
    g.fillStyle = css(darken(STONE, 0.42));
    for (let x = 6; x < plan.w; x += 22) {
      g.beginPath();
      g.arc(x + 5, y + 14, 6, 0, Math.PI);
      g.fill();
    }
  }

  private paintFloor(g: CanvasRenderingContext2D, plan: Plan): void {
    const rows = 5;
    const tones: RGB[] = [
      [74, 52, 108],
      [96, 72, 130],
    ];
    for (let r = 0; r < rows; r++) {
      const y0 = plan.floor + ((plan.h - plan.floor) * r ** 1.25) / rows ** 1.25;
      const y1 = plan.floor + ((plan.h - plan.floor) * (r + 1) ** 1.25) / rows ** 1.25;
      const tile = 30 + r * 12;
      const shift = r % 2 ? tile / 2 : 0;
      for (let x = -shift, i = 0; x < plan.w; x += tile, i++) {
        const tone = tones[(i + r) % 2]!;
        g.fillStyle = css(mix(tone, [30, 18, 56], r * 0.04));
        g.fillRect(x, y0, tile + 0.5, y1 - y0 + 0.5);
      }
    }
    // Light lying on the stone: a shine near the far wall that fades toward you, and the dark line
    // where the wall stands on it.
    const gloss = g.createLinearGradient(0, plan.floor, 0, plan.h);
    gloss.addColorStop(0, 'rgba(255,214,160,0.2)');
    gloss.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = gloss;
    g.fillRect(0, plan.floor, plan.w, plan.h - plan.floor);
    g.fillStyle = 'rgba(18,8,40,0.55)';
    g.fillRect(0, plan.floor - 1, plan.w, 3);
  }

  /** A red carpet under the chest, with a gold edge, running to the front of the floor. */
  private paintCarpet(g: CanvasRenderingContext2D, plan: Plan): void {
    const x = plan.chest.x;
    const cw = plan.chest.w;
    const y0 = plan.floor + 4;
    const topHalf = cw * 0.62;
    const bottomHalf = cw * 0.9;
    const path = (grow: number): void => {
      g.beginPath();
      g.moveTo(x - topHalf - grow, y0);
      g.lineTo(x + topHalf + grow, y0);
      g.lineTo(x + bottomHalf + grow * 1.6, plan.h + 4);
      g.lineTo(x - bottomHalf - grow * 1.6, plan.h + 4);
      g.closePath();
    };
    path(3);
    g.fillStyle = css(darken(GOLD, 0.1));
    g.fill();
    path(0);
    const red = g.createLinearGradient(0, y0, 0, plan.h);
    red.addColorStop(0, css([138, 24, 62]));
    red.addColorStop(1, css([196, 44, 84]));
    g.fillStyle = red;
    g.fill();
    g.save();
    path(0);
    g.clip();
    g.strokeStyle = css(GOLD, 0.55);
    g.lineWidth = 1.5;
    g.setLineDash([5, 5]);
    path(-5);
    g.stroke();
    g.restore();
  }

  /**
   * The inside of the chest and the lid standing open behind it. (0, 0) of the picture is the left
   * of the lid's top.
   */
  private paintChestBack(g: CanvasRenderingContext2D, w: number): void {
    const back = w * 0.27;
    const lid = w * 0.21;
    const ox = w * SIDE;
    const oy = w * TOP;
    g.save();
    g.translate(ox + w / 2, oy + lid + back);
    // The side walls of the chest, as a thing in perspective: they narrow toward the back.
    const wood = (tone: number): string => css(darken(WOOD, tone));
    g.fillStyle = wood(0.55);
    g.beginPath();
    g.moveTo(-w * 0.5, 0);
    g.lineTo(-w * 0.465, -back);
    g.lineTo(w * 0.465, -back);
    g.lineTo(w * 0.5, 0);
    g.closePath();
    g.fill();
    // The back wall, dark, with planks, and a warm light low in it for the treasure.
    const wall = g.createLinearGradient(0, -back, 0, 0);
    wall.addColorStop(0, wood(0.7));
    wall.addColorStop(1, wood(0.45));
    g.fillStyle = wall;
    g.fillRect(-w * 0.465, -back, w * 0.93, back);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1.2;
    for (let i = 1; i < 7; i++) {
      g.beginPath();
      g.moveTo(-w * 0.465 + (w * 0.93 * i) / 7, -back);
      g.lineTo(-w * 0.465 + (w * 0.93 * i) / 7, 0);
      g.stroke();
    }
    // The lid, open and leaning back: wood on the edge and velvet on the inside.
    const lidShape = new Path2D();
    lidShape.moveTo(-w * 0.47, -back);
    lidShape.lineTo(-w * 0.52, -back - lid + 8);
    lidShape.quadraticCurveTo(-w * 0.52, -back - lid, -w * 0.46, -back - lid);
    lidShape.lineTo(w * 0.46, -back - lid);
    lidShape.quadraticCurveTo(w * 0.52, -back - lid, w * 0.52, -back - lid + 8);
    lidShape.lineTo(w * 0.47, -back);
    lidShape.closePath();
    g.fillStyle = wood(0.15);
    g.fill(lidShape);
    g.strokeStyle = wood(0.6);
    g.lineWidth = 1.6;
    g.stroke(lidShape);
    const velvet = g.createLinearGradient(0, -back - lid, 0, -back);
    velvet.addColorStop(0, css([150, 30, 66]));
    velvet.addColorStop(1, css([104, 18, 52]));
    g.fillStyle = velvet;
    g.beginPath();
    g.moveTo(-w * 0.44, -back - 3);
    g.lineTo(-w * 0.485, -back - lid + 12);
    g.quadraticCurveTo(-w * 0.48, -back - lid + 5, -w * 0.43, -back - lid + 5);
    g.lineTo(w * 0.43, -back - lid + 5);
    g.quadraticCurveTo(w * 0.48, -back - lid + 5, w * 0.485, -back - lid + 12);
    g.lineTo(w * 0.44, -back - 3);
    g.closePath();
    g.fill();
    g.strokeStyle = css(GOLD, 0.8);
    g.lineWidth = 1.3;
    g.setLineDash([4, 3]);
    g.stroke();
    g.setLineDash([]);
    // A band of gold along the top of the lid, and studs on it.
    const band = g.createLinearGradient(0, -back - lid, 0, -back - lid + 7);
    band.addColorStop(0, css(lighten(GOLD, 0.5)));
    band.addColorStop(1, css(darken(GOLD, 0.25)));
    g.fillStyle = band;
    roundedRect(g, -w * 0.5, -back - lid - 2, w, 8, 3);
    g.fill();
    g.fillStyle = css(lighten(GOLD, 0.6));
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(-w * 0.44 + (w * 0.88 * i) / 6, -back - lid + 2, 1.5, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  /** The front of the chest, from the lip down. (0, 0) of the picture is `0.04 w` above the rim. */
  private paintChestFront(g: CanvasRenderingContext2D, w: number): void {
    const front = w * 0.31;
    const ox = w * SIDE;
    const oy = w * 0.04;
    g.save();
    g.translate(ox + w / 2, oy);
    const planks = g.createLinearGradient(0, 0, 0, front);
    planks.addColorStop(0, css(lighten(WOOD, 0.08)));
    planks.addColorStop(1, css(darken(WOOD, 0.34)));
    g.fillStyle = planks;
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.lineTo(w / 2, front - 6);
    g.quadraticCurveTo(w / 2, front, w / 2 - 6, front);
    g.lineTo(-w / 2 + 6, front);
    g.quadraticCurveTo(-w / 2, front, -w / 2, front - 6);
    g.closePath();
    g.fill();
    g.strokeStyle = css(darken(WOOD, 0.55), 0.7);
    g.lineWidth = 1.5;
    g.stroke();
    // The planks: dark seams, with a pale edge beside each, and the grain in them.
    const n = 6;
    for (let i = 1; i < n; i++) {
      const x = -w / 2 + (w * i) / n;
      g.strokeStyle = 'rgba(40,16,10,0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, 2);
      g.lineTo(x, front - 1);
      g.stroke();
      g.strokeStyle = 'rgba(255,200,150,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 1.5, 2);
      g.lineTo(x + 1.5, front - 1);
      g.stroke();
    }
    const grain = new Rng(this.seed + 31);
    g.strokeStyle = 'rgba(60,26,16,0.28)';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const x = grain.range(-w / 2 + 4, w / 2 - 4);
      const y = grain.range(6, front - 5);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 3, y + 3, x + grain.range(-2, 2), y + grain.range(6, 13));
      g.stroke();
    }
    // Two bands of gold, down the front.
    for (const side of [-1, 1]) {
      const x = side * w * 0.31;
      const band = g.createLinearGradient(x - w * 0.04, 0, x + w * 0.04, 0);
      band.addColorStop(0, css(darken(GOLD, 0.25)));
      band.addColorStop(0.45, css(lighten(GOLD, 0.45)));
      band.addColorStop(1, css(darken(GOLD, 0.3)));
      g.fillStyle = band;
      g.fillRect(x - w * 0.04, 0, w * 0.08, front);
      g.fillStyle = css(darken(GOLD, 0.5));
      for (const y of [front * 0.22, front * 0.78]) {
        g.beginPath();
        g.arc(x, y, 1.9, 0, TAU);
        g.fill();
      }
    }
    // The lip along the top of the front, where the treasure goes over.
    const lip = g.createLinearGradient(0, -w * 0.03, 0, w * 0.04);
    lip.addColorStop(0, css(lighten(GOLD, 0.65)));
    lip.addColorStop(0.5, css(GOLD));
    lip.addColorStop(1, css(darken(GOLD, 0.4)));
    g.fillStyle = lip;
    roundedRect(g, -w / 2 - 3, -w * 0.03, w + 6, w * 0.07, 4);
    g.fill();
    g.strokeStyle = css(darken(GOLD, 0.55), 0.7);
    g.lineWidth = 1.2;
    g.stroke();
    // The lock: a plate with a keyhole.
    const lockW = w * 0.15;
    const lockH = front * 0.46;
    const ly = front * 0.14;
    const plate = g.createLinearGradient(0, ly, 0, ly + lockH);
    plate.addColorStop(0, css(lighten(GOLD, 0.55)));
    plate.addColorStop(1, css(darken(GOLD, 0.2)));
    g.fillStyle = plate;
    roundedRect(g, -lockW / 2, ly, lockW, lockH, 4);
    g.fill();
    g.strokeStyle = css(darken(GOLD, 0.55));
    g.lineWidth = 1.3;
    g.stroke();
    g.fillStyle = css([50, 24, 20]);
    g.beginPath();
    g.arc(0, ly + lockH * 0.42, lockW * 0.14, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(-lockW * 0.07, ly + lockH * 0.45);
    g.lineTo(lockW * 0.07, ly + lockH * 0.45);
    g.lineTo(lockW * 0.1, ly + lockH * 0.78);
    g.lineTo(-lockW * 0.1, ly + lockH * 0.78);
    g.closePath();
    g.fill();
    // The corners of gold at the bottom.
    g.fillStyle = css(darken(GOLD, 0.15));
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * w * 0.5, front - w * 0.1);
      g.lineTo(side * w * 0.5, front);
      g.lineTo(side * (w * 0.5 - w * 0.1), front);
      g.lineTo(side * (w * 0.5 - w * 0.1), front - 4);
      g.lineTo(side * (w * 0.5 - 4), front - 4);
      g.lineTo(side * (w * 0.5 - 4), front - w * 0.1);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
}

/** A flame, as three teardrops one inside the other, which sways. */
function paintFlame(g: CanvasRenderingContext2D, x: number, y: number, flick: number): void {
  const sway = Math.sin(x + flick * 9) * 1.6;
  for (const [scale, tone] of [
    [1, [255, 118, 36]],
    [0.7, [255, 190, 60]],
    [0.4, [255, 244, 190]],
  ] as const) {
    const hgt = 30 * scale * flick;
    const wid = 9 * scale;
    g.fillStyle = css(tone as RGB, 0.95);
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x - wid * 1.3, y - hgt * 0.3, x - wid * 0.8, y - hgt * 0.8, x + sway, y - hgt);
    g.bezierCurveTo(x + wid * 0.8, y - hgt * 0.8, x + wid * 1.3, y - hgt * 0.3, x, y);
    g.closePath();
    g.fill();
  }
}
