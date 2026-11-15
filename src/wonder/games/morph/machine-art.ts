import type { SpriteBank } from '../../engine/bank';
import { drawPic } from '../../engine/bank';
import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, lerp, TAU } from '../../engine/ease';
import { gemImage } from '../../engine/gems';
import { addRoundedRect, glowAt, prerender } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { bloomImage } from './bloom-art';
import { PARTS } from './layout';
import { FRUITS, LAMPS, type Paint, type Product } from './recipes';

/**
 * The machine, drawn in code and large: a teal (or violet) engine with a funnel on the left, a
 * glass dome on top where things are changed, a chimney with a whistle, a lever, a pressure gauge,
 * three gears that turn, a row of lamps, and a chute on the right. What never changes is drawn
 * once, in two layers, one under the dome's contents and one over them. What moves is drawn every
 * frame: the gears, the needle, the lamps, the lever, the whistle and what is in the glass.
 */

/** Room round the machine in its own units, so a shadow and a shake do not get cut off. */
const PAD = 24;

/** What the machine is doing, as the picture needs it. */
export interface MachineState {
  readonly t: number;
  /** How far the gears have turned, in radians. */
  readonly gear: number;
  /** The needle, from 0 to 1. */
  readonly needle: number;
  /** How bright each of the five lamps is, from 0 to 1. */
  readonly lamps: readonly number[];
  /** How far the lever is pulled, from 0 (up) to 1 (down). */
  readonly lever: number;
  /** How far the whistle has popped up, from 0 to 1. */
  readonly whistle: number;
  /** How much is going on in the glass, from 0 (empty) to 1 (full), and the colour of it. */
  readonly fill: number;
  readonly color: RGB;
  /** How fast what is in the glass swirls, in turns a second. */
  readonly swirl: number;
  /** The fruit that are in the glass, each how far through being changed, from 0 to 1. */
  readonly inside: readonly { readonly sprite: string; readonly u: number; readonly angle: number }[];
  /**
   * How hot the machine is, from 0 to 1, for the glow it gives off when it has more than it can
   * hold.
   */
  readonly heat: number;
}

export class MachineArt {
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private key = '';

  constructor(private readonly bank: SpriteBank | null) {}

  /**
   * Draws the parts that do not move, for a machine of this look. `s` is how many pixels there are
   * in a unit of the machine.
   */
  place(paint: Paint, product: Product, s: number): void {
    const key = `${product}|${s}`;
    if (key === this.key) return;
    this.key = key;
    const w = PARTS.width + PAD * 2;
    const h = PARTS.height + PAD * 2;
    const into = (draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement =>
      prerender(
        w,
        h,
        (g) => {
          g.translate(PAD + PARTS.width / 2, PAD + PARTS.height);
          g.lineJoin = 'round';
          g.lineCap = 'round';
          draw(g);
        },
        s,
      );
    this.back = into((g) => paintBack(g, paint, product));
    this.front = into((g) => paintFront(g, paint));
  }

  /**
   * Where the middle of the foot of the machine is in the prerendered pictures, in the machine's
   * units.
   */
  private draw(g: CanvasRenderingContext2D, image: HTMLCanvasElement): void {
    g.drawImage(image, -PAD - PARTS.width / 2, -PAD - PARTS.height, PARTS.width + PAD * 2, PARTS.height + PAD * 2);
  }

  /**
   * Draws the machine with the middle of its foot at (x, y), `size` pixels to the unit, squashed or
   * stretched by `squash` (more than 0 is taller) and shaken by (`shakeX`, `shakeY`) units.
   */
  paint(
    p: Painter,
    x: number,
    y: number,
    size: number,
    squash: number,
    shakeX: number,
    shakeY: number,
    m: MachineState,
  ): void {
    if (!this.back || !this.front) return;
    const g = p.ctx;
    g.save();
    g.translate(x + shakeX * size, y + shakeY * size);
    g.scale(size * (1 - squash * 0.5), size * (1 + squash));
    this.draw(g, this.back);
    this.paintInside(g, m);
    paintMoving(g, m);
    this.draw(g, this.front);
    g.restore();
    // The glow of the glass and the lamps goes on the sheet of light, in the same place.
    const at = (lx: number, ly: number): { x: number; y: number } => ({
      x: x + (lx + shakeX) * size * (1 - squash * 0.5),
      y: y + (ly + shakeY) * size * (1 + squash),
    });
    const dome = at(PARTS.dome.x, PARTS.dome.y);
    glowAt(p.light, dome.x, dome.y, PARTS.dome.r * 3.1 * size, m.color, 0.1 + 0.4 * m.fill + 0.3 * m.heat);
    if (m.heat > 0.05) glowAt(p.light, dome.x, dome.y, PARTS.dome.r * 4.6 * size, COLORS.white, 0.22 * m.heat);
    PARTS.lamps.forEach((lamp, i) => {
      const b = m.lamps[i] ?? 0;
      if (b < 0.06) return;
      const c = at(lamp.x, lamp.y);
      glowAt(p.light, c.x, c.y, 34 * size, LAMPS[i % LAMPS.length]!, 0.55 * b);
    });
  }

  /**
   * What is in the glass: the colour of what is being made, swirling, with the fruit going round in
   * it.
   */
  private paintInside(g: CanvasRenderingContext2D, m: MachineState): void {
    const { x, y, r } = PARTS.dome;
    const inner = r - 4;
    g.save();
    g.beginPath();
    g.arc(x, y, inner, 0, TAU);
    g.clip();
    // The liquid is as high as there is going on in the glass, and level, with a small wave on top.
    const level = y + inner - 2 * inner * clamp(m.fill * 0.82 + 0.06);
    const grad = g.createLinearGradient(0, level, 0, y + inner);
    grad.addColorStop(0, css(lighten(m.color, 0.35), 0.95));
    grad.addColorStop(0.5, css(m.color, 0.95));
    grad.addColorStop(1, css(darken(m.color, 0.35), 0.98));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - inner - 2, y + inner + 2);
    g.lineTo(x - inner - 2, level);
    for (let px = x - inner; px <= x + inner + 2; px += 4)
      g.lineTo(px, level + Math.sin(px * 0.16 + m.t * (3 + m.swirl * 6)) * (1.6 + 2.4 * m.fill));
    g.lineTo(x + inner + 2, y + inner + 2);
    g.closePath();
    g.fill();
    // Streaks of lighter colour that go round, faster the busier the machine is.
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a0 = m.t * m.swirl * TAU + (i / 5) * TAU;
      g.strokeStyle = css(lighten(m.color, 0.55), 0.18 + 0.3 * m.fill);
      g.lineWidth = 2.2 + (i % 2);
      g.beginPath();
      g.arc(x, y + 4, inner * (0.28 + 0.13 * i), a0, a0 + 1.1 + 0.2 * i);
      g.stroke();
    }
    // Small bubbles that rise.
    g.fillStyle = css(lighten(m.color, 0.7), 0.7);
    for (let i = 0; i < 7; i++) {
      const rise = (m.t * (0.3 + 0.07 * i) + i * 0.37) % 1;
      const bx = x + Math.sin(i * 2.1 + m.t * 1.4) * inner * 0.55;
      const by = y + inner - rise * 2 * inner * clamp(m.fill * 0.82 + 0.06);
      g.beginPath();
      g.arc(bx, by, 1.6 + (i % 3) * 0.8, 0, TAU);
      g.fill();
    }
    // The fruit, going round and shrinking as it is changed.
    for (const f of m.inside) {
      const pic = this.bank?.sprite('produce', f.sprite, 0);
      if (!pic) continue;
      const a = f.angle + m.t * 3.2;
      const rr = inner * 0.42 * (1 - f.u * 0.7);
      const grow = 1.25 * (1 - f.u * 0.85);
      drawPic(g, pic, x + Math.cos(a) * rr, y + 6 + Math.sin(a) * rr * 0.55, {
        scale: Math.max(0.05, grow),
        rot: a * 0.6,
        mid: true,
      });
    }
    g.restore();
  }
}

function paintMoving(g: CanvasRenderingContext2D, m: MachineState): void {
  // The gears: the big one one way, and its two small neighbours the other, as meshed gears turn.
  gear(g, PARTS.gear.x, PARTS.gear.y, PARTS.gear.r, 10, m.gear, [255, 206, 92]);
  gear(g, 52, -62, 14, 6, -m.gear * (PARTS.gear.r / 14) + 0.3, [236, 172, 78]);
  gear(g, 4, -58, 12, 5, -m.gear * (PARTS.gear.r / 12) + 0.1, [255, 190, 86]);
  // The needle.
  const gauge = PARTS.gauge;
  const a = Math.PI * 0.75 + clamp(m.needle) * Math.PI * 1.5;
  g.strokeStyle = css([40, 24, 52]);
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(gauge.x - Math.cos(a) * 5, gauge.y - Math.sin(a) * 5);
  g.lineTo(gauge.x + Math.cos(a) * gauge.r * 0.78, gauge.y + Math.sin(a) * gauge.r * 0.78);
  g.stroke();
  g.fillStyle = css([255, 214, 110]);
  g.strokeStyle = css([40, 24, 52]);
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(gauge.x, gauge.y, 3.6, 0, TAU);
  g.fill();
  g.stroke();
  // The lamps, each as bright as it is lit.
  PARTS.lamps.forEach((lamp, i) => {
    const b = clamp(m.lamps[i] ?? 0);
    const color = LAMPS[i % LAMPS.length]!;
    g.fillStyle = css(mix([58, 52, 74], color, 0.18 + 0.82 * b));
    g.beginPath();
    g.arc(lamp.x, lamp.y, 6.2, 0, TAU);
    g.fill();
    g.fillStyle = css(lighten(color, 0.75), 0.25 + 0.65 * b);
    g.beginPath();
    g.arc(lamp.x - 1.8, lamp.y - 2, 2, 0, TAU);
    g.fill();
  });
  // The lever, from up to down.
  const arm = lerp(-2.27, -3.9, clamp(m.lever));
  const pivot = PARTS.lever;
  const kx = pivot.x + Math.cos(arm) * pivot.length;
  const ky = pivot.y + Math.sin(arm) * pivot.length;
  g.strokeStyle = css([60, 44, 84]);
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(pivot.x, pivot.y);
  g.lineTo(kx, ky);
  g.stroke();
  g.strokeStyle = css([226, 214, 236]);
  g.lineWidth = 4.6;
  g.stroke();
  g.strokeStyle = css([255, 255, 255], 0.7);
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(pivot.x - 1, pivot.y - 2);
  g.lineTo(kx - 1, ky - 2);
  g.stroke();
  ball(g, kx, ky, 9.4, [238, 70, 96]);
  // The whistle on the chimney, which pops up and squashes.
  const c = PARTS.chimney;
  const pop = clamp(m.whistle);
  g.save();
  g.translate(c.x, c.y1 - 3 - 7 * Math.sin(pop * Math.PI));
  g.scale(1 + 0.12 * pop, 1 - 0.1 * pop);
  const cap = g.createLinearGradient(-12, 0, 12, 0);
  cap.addColorStop(0, css(darken([255, 206, 92], 0.25)));
  cap.addColorStop(0.45, css(lighten([255, 206, 92], 0.4)));
  cap.addColorStop(1, css(darken([255, 206, 92], 0.3)));
  g.fillStyle = cap;
  g.strokeStyle = css([96, 56, 40]);
  g.lineWidth = 1.6;
  g.beginPath();
  addRoundedRect(g, -12, -13, 24, 16, 6);
  g.fill();
  g.stroke();
  g.fillStyle = css([96, 56, 40]);
  g.beginPath();
  g.ellipse(0, -5, 4.4, 2.2, 0, 0, TAU);
  g.fill();
  g.restore();
}

function gear(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  teeth: number,
  angle: number,
  color: RGB,
): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  const inner = r * 0.8;
  g.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const w = TAU / teeth;
    g.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    g.lineTo(Math.cos(a + w * 0.12) * r, Math.sin(a + w * 0.12) * r);
    g.lineTo(Math.cos(a + w * 0.4) * r, Math.sin(a + w * 0.4) * r);
    g.lineTo(Math.cos(a + w * 0.52) * inner, Math.sin(a + w * 0.52) * inner);
  }
  g.closePath();
  const grad = g.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, css(lighten(color, 0.45)));
  grad.addColorStop(0.5, css(color));
  grad.addColorStop(1, css(darken(color, 0.32)));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(color, 0.62));
  g.lineWidth = 1.4;
  g.fill();
  g.stroke();
  // The holes between the spokes, and the hub.
  g.fillStyle = css([34, 62, 74], 0.85);
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(Math.cos((i / 4) * TAU) * r * 0.5, Math.sin((i / 4) * TAU) * r * 0.5, r * 0.15, 0, TAU);
    g.fill();
  }
  ball(g, 0, 0, r * 0.22, color);
  g.restore();
}

/** A round knob that catches the light from the top left. */
function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: RGB): void {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, css(lighten(color, 0.7)));
  grad.addColorStop(0.45, css(color));
  grad.addColorStop(1, css(darken(color, 0.4)));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(color, 0.65), 0.9);
  g.lineWidth = 1.3;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.stroke();
}

/** A band of metal that is light along the top and dark along the bottom. */
function metal(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
  r: number,
  outline = 0.55,
): void {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, css(lighten(color, 0.4)));
  grad.addColorStop(0.35, css(color));
  grad.addColorStop(1, css(darken(color, 0.34)));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(color, outline), 0.95);
  g.lineWidth = 1.6;
  g.beginPath();
  addRoundedRect(g, x, y, w, h, r);
  g.fill();
  g.stroke();
}

function rivet(g: CanvasRenderingContext2D, x: number, y: number, r = 2.3): void {
  ball(g, x, y, r, [255, 214, 120]);
}

function paintBack(g: CanvasRenderingContext2D, paint: Paint, product: Product): void {
  const body = paint.body;
  const dark = paint.bodyDark;
  const trim = paint.trim;
  // A shadow on the grass.
  g.fillStyle = 'rgba(8,10,30,0.3)';
  g.beginPath();
  g.ellipse(0, 3, 126, 11, 0, 0, TAU);
  g.fill();

  // The chimney stands behind the body.
  const c = PARTS.chimney;
  const chim = g.createLinearGradient(c.x - c.w / 2, 0, c.x + c.w / 2, 0);
  chim.addColorStop(0, css(darken(dark, 0.1)));
  chim.addColorStop(0.35, css(lighten(body, 0.2)));
  chim.addColorStop(1, css(darken(dark, 0.3)));
  g.fillStyle = chim;
  g.strokeStyle = css(darken(dark, 0.55));
  g.lineWidth = 1.6;
  g.fillRect(c.x - c.w / 2, c.y1, c.w, c.y0 - c.y1 + 6);
  g.strokeRect(c.x - c.w / 2, c.y1, c.w, c.y0 - c.y1 + 6);
  metal(g, c.x - c.w / 2 - 3, c.y1 + 20, c.w + 6, 8, trim, 3);
  metal(g, c.x - c.w / 2 - 3, c.y1 + 46, c.w + 6, 8, trim, 3);

  // The pipe from the funnel down into the glass.
  const h = PARTS.hopper;
  const pipe = new Path2D();
  pipe.moveTo(h.x, h.y + 14);
  pipe.quadraticCurveTo(h.x, PARTS.hopperPipe.y, PARTS.hopperPipe.x + 12, PARTS.hopperPipe.y);
  g.strokeStyle = css(darken(trim, 0.55));
  g.lineWidth = 14;
  g.stroke(pipe);
  g.strokeStyle = css(trim);
  g.lineWidth = 10;
  g.stroke(pipe);
  g.strokeStyle = css(lighten(trim, 0.6), 0.6);
  g.lineWidth = 2.4;
  g.translate(-2, -2);
  g.stroke(pipe);
  g.translate(2, 2);

  // The plinth, and the body above it.
  const p = PARTS.plinth;
  metal(g, p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, dark, 8);
  g.fillStyle = css(trim);
  g.fillRect(p.x0 + 6, p.y0 + 11, p.x1 - p.x0 - 12, 3.4);
  for (const rx of [p.x0 + 10, p.x1 - 10]) {
    rivet(g, rx, p.y0 + 6);
    rivet(g, rx, p.y1 - 6);
  }
  const b = PARTS.body;
  const grad = g.createLinearGradient(b.x0, 0, b.x1, 0);
  grad.addColorStop(0, css(darken(body, 0.2)));
  grad.addColorStop(0.18, css(lighten(body, 0.22)));
  grad.addColorStop(0.55, css(body));
  grad.addColorStop(1, css(darken(body, 0.38)));
  g.fillStyle = grad;
  g.strokeStyle = css(darken(dark, 0.6));
  g.lineWidth = 2;
  g.beginPath();
  addRoundedRect(g, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 14);
  g.fill();
  g.stroke();
  // A band of trim along the top and the bottom of it, with rivets.
  g.fillStyle = css(trim);
  g.fillRect(b.x0 + 3, b.y0 + 10, b.x1 - b.x0 - 6, 3);
  g.fillRect(b.x0 + 3, b.y1 - 12, b.x1 - b.x0 - 6, 3);
  for (let rx = b.x0 + 12; rx <= b.x1 - 10; rx += 26) {
    rivet(g, rx, b.y0 + 5.5, 2);
    rivet(g, rx, b.y1 - 5.5, 2);
  }
  // A shine down the left of the body.
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  addRoundedRect(g, b.x0 + 5, b.y0 + 18, 6, b.y1 - b.y0 - 36, 3);
  g.fill();
  // The panel the gears and the gauge are set into.
  const panel = g.createLinearGradient(0, -128, 0, -44);
  panel.addColorStop(0, css(darken(dark, 0.45)));
  panel.addColorStop(1, css(darken(dark, 0.7)));
  g.fillStyle = panel;
  g.strokeStyle = css(trim, 0.9);
  g.lineWidth = 2;
  g.beginPath();
  addRoundedRect(g, -70, -126, 140, 82, 10);
  g.fill();
  g.stroke();
  // The face of the gauge: a dial with green, then amber, then red.
  const gg = PARTS.gauge;
  ball(g, gg.x, gg.y, gg.r + 3.4, trim);
  g.fillStyle = css([252, 246, 230]);
  g.beginPath();
  g.arc(gg.x, gg.y, gg.r - 1, 0, TAU);
  g.fill();
  const zones: [number, number, RGB][] = [
    [0, 0.5, [92, 200, 120]],
    [0.5, 0.8, [255, 190, 70]],
    [0.8, 1, [240, 84, 84]],
  ];
  g.lineCap = 'butt';
  g.lineWidth = 4.4;
  for (const [from, to, color] of zones) {
    g.strokeStyle = css(color);
    g.beginPath();
    g.arc(gg.x, gg.y, gg.r - 6.4, Math.PI * (0.75 + from * 1.5), Math.PI * (0.75 + to * 1.5));
    g.stroke();
  }
  g.lineCap = 'round';
  g.strokeStyle = css([60, 44, 84], 0.8);
  g.lineWidth = 1.2;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.75 + (i / 10) * 1.5);
    const r0 = gg.r - 11;
    g.beginPath();
    g.moveTo(gg.x + Math.cos(a) * r0, gg.y + Math.sin(a) * r0);
    g.lineTo(gg.x + Math.cos(a) * (r0 - (i % 5 === 0 ? 4 : 2.4)), gg.y + Math.sin(a) * (r0 - (i % 5 === 0 ? 4 : 2.4)));
    g.stroke();
  }
  // The sockets of the lamps.
  for (const lamp of PARTS.lamps) {
    g.fillStyle = css(darken(trim, 0.4));
    g.beginPath();
    g.arc(lamp.x, lamp.y, 9.4, 0, TAU);
    g.fill();
    g.strokeStyle = css(trim);
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(lamp.x, lamp.y, 8.2, 0, TAU);
    g.stroke();
  }
  // The collar the glass stands in.
  metal(g, -62, -152, 124, 18, trim, 7);
  for (const rx of [-50, -26, 0, 26, 50]) rivet(g, rx, -143, 1.9);
  // The back of the glass: dark, a little of the machine's colour in it.
  const d = PARTS.dome;
  const glass = g.createRadialGradient(d.x, d.y + 10, 4, d.x, d.y, d.r);
  glass.addColorStop(0, css(mix(darken(paint.glass, 0.7), body, 0.35)));
  glass.addColorStop(1, css(darken(mix(paint.glass, body, 0.5), 0.72)));
  g.fillStyle = glass;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 2, 0, TAU);
  g.fill();

  // The chute, out of the right of the body.
  const chute = new Path2D();
  chute.moveTo(78, -80);
  chute.lineTo(108, -60);
  g.strokeStyle = css(darken(trim, 0.55));
  g.lineWidth = 22;
  g.stroke(chute);
  g.strokeStyle = css(mix(body, trim, 0.5));
  g.lineWidth = 17;
  g.stroke(chute);
  g.strokeStyle = css(lighten(trim, 0.6), 0.55);
  g.lineWidth = 3;
  g.translate(-1, -4);
  g.stroke(chute);
  g.translate(1, 4);
  g.save();
  g.translate(PARTS.chute.x - 6, PARTS.chute.y - 8);
  g.rotate(0.55);
  metal(g, -14, -12, 28, 24, trim, 6);
  g.fillStyle = css(darken(dark, 0.7));
  g.beginPath();
  g.ellipse(9, 0, 4.4, 8, 0, 0, TAU);
  g.fill();
  g.restore();

  // The funnel on the left, wide at the top and narrow at the bottom.
  const f = new Path2D();
  f.moveTo(h.x - 32, h.y - 4);
  f.lineTo(h.x + 32, h.y - 4);
  f.lineTo(h.x + 9, h.y + 22);
  f.lineTo(h.x - 9, h.y + 22);
  f.closePath();
  const fg = g.createLinearGradient(h.x - 32, 0, h.x + 32, 0);
  fg.addColorStop(0, css(darken(trim, 0.3)));
  fg.addColorStop(0.35, css(lighten(trim, 0.5)));
  fg.addColorStop(1, css(darken(trim, 0.38)));
  g.fillStyle = fg;
  g.strokeStyle = css(darken(trim, 0.62));
  g.lineWidth = 1.8;
  g.fill(f);
  g.stroke(f);
  g.fillStyle = css(darken(dark, 0.78));
  g.beginPath();
  g.ellipse(h.x, h.y - 4, 31, 7.4, 0, 0, TAU);
  g.fill();
  g.strokeStyle = css(lighten(trim, 0.5));
  g.lineWidth = 2.4;
  g.stroke();
  // A bracket from the body to the funnel's pipe.
  g.strokeStyle = css(darken(trim, 0.4));
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(-82, -150);
  g.lineTo(-100, -196);
  g.stroke();

  // The pivot of the lever, and the slot it swings in.
  const lv = PARTS.lever;
  ball(g, lv.x, lv.y, 11, trim);
  rivet(g, lv.x, lv.y, 3.4);

  // A badge on the plinth: the thing this machine makes.
  const badge = product === 'gem' ? gemImage(FRUITS['sky-berry'].color) : bloomImage(FRUITS.strawberry, 3);
  g.save();
  g.translate(0, -15);
  g.fillStyle = css(darken(dark, 0.55));
  g.beginPath();
  g.ellipse(0, 0, 24, 11.5, 0, 0, TAU);
  g.fill();
  g.strokeStyle = css(trim);
  g.lineWidth = 1.8;
  g.stroke();
  if (product === 'gem') g.drawImage(badge, -9, -9, 18, 18);
  else g.drawImage(badge, -7, -9.4, 14, 17.5);
  g.restore();
}

/** What goes over the glass's contents: the shine on it and the ring that holds it. */
function paintFront(g: CanvasRenderingContext2D, paint: Paint): void {
  const d = PARTS.dome;
  // The sheen of the glass, a big curve at the top left and a small one at the bottom right.
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 9, Math.PI * 1.12, Math.PI * 1.46);
  g.stroke();
  g.lineWidth = 2.6;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 9, Math.PI * 1.52, Math.PI * 1.62);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 8, Math.PI * 0.12, Math.PI * 0.3);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.ellipse(d.x - 17, d.y - 24, 18, 11, -0.7, 0, TAU);
  g.fill();
  // The ring that holds it.
  g.strokeStyle = css(darken(paint.trim, 0.55));
  g.lineWidth = 6;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 1, 0, TAU);
  g.stroke();
  g.strokeStyle = css(paint.trim);
  g.lineWidth = 3.4;
  g.stroke();
  g.strokeStyle = css(lighten(paint.trim, 0.55), 0.7);
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(d.x, d.y, d.r - 2, Math.PI * 1.15, Math.PI * 1.55);
  g.stroke();
}
