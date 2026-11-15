import { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { type Contour, contourOf, fillGround, paintTree, sleepyFace } from '../../engine/land';
import { glowAt, makeCloud, prerender, Starfield, stamp, verticalGradient } from '../../engine/paint';
import type { Painter, View } from '../../engine/painter';
import type { Dress } from './dress';
import type { Plan } from './layout';
import { PITCHES } from './notes';

/**
 * The place the balloons float over: a sky, a sun or moon with a face, clouds with faces that
 * drift, two rows of hills with trees, and between two poles a strand of bunting, lanterns or
 * little lights. What does not move is drawn once, and what does is cheap. The far scenery is drawn
 * first and the near hills over the balloons, so a balloon comes up from behind the hill it was let
 * go from.
 */

interface Cloud {
  readonly image: HTMLCanvasElement;
  x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
  readonly bob: number;
}

/** The bunting's flags, in the colours of the notes and two more. */
const FLAGS: readonly RGB[] = [
  PITCHES[0].color,
  PITCHES[1].color,
  PITCHES[2].color,
  [74, 205, 110],
  PITCHES[3].color,
  PITCHES[4].color,
  [255, 130, 190],
];

export class Meadow {
  /** Where the sun or the moon is, and how big. */
  readonly orb: { readonly x: number; readonly y: number; readonly r: number };
  private readonly sky: HTMLCanvasElement;
  private readonly far: HTMLCanvasElement;
  private readonly near: HTMLCanvasElement;
  private readonly rays: HTMLCanvasElement | null;
  private readonly stars: Starfield | null;
  private readonly clouds: Cloud[] = [];
  /** The two ends of the strand, and how far it hangs in the middle. */
  private readonly strand: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
    readonly sag: number;
  };

  constructor(
    private readonly dress: Dress,
    seed: number,
    private readonly view: View,
    private readonly plan: Plan,
  ) {
    const rng = new Rng(seed);
    const { w, h } = view;
    const horizon = plan.horizon;
    const o = dress.orb;
    this.orb = { x: w * o.x, y: o.kind === 'low-sun' ? horizon - 22 : h * o.y, r: o.r };
    const farLine = contourOf(rng, horizon + 16, h * 0.17, w);
    const nearLine = contourOf(rng, plan.feet - 8, h * 0.035, w, { x: w / 2, reach: Math.max(110, w * 0.17) });
    this.sky = prerender(w, h, (g) => this.drawSky(g, w, h));
    this.far = prerender(w, h, (g) => this.drawFar(g, w, h, farLine, rng));
    this.near = prerender(w, h, (g) => this.drawNear(g, w, h, nearLine, rng));
    const post = (x: number): { x: number; y: number } => ({ x, y: farLine(x) - h * 0.17 });
    const left = post(w * 0.07);
    const right = post(w * 0.93);
    this.strand = { x0: left.x, y0: left.y, x1: right.x, y1: right.y, sag: h * 0.085 };
    this.rays = dress.orb.kind === 'sun' ? this.makeRays(this.orb.r, dress.orb.color) : null;
    this.stars = dress.stars > 0 ? new Starfield(Math.round((w * h) / 2800), rng, w, 0, horizon - 14) : null;
    const count = Math.max(3, Math.min(5, Math.round(w / 190)));
    for (let i = 0; i < count; i++) {
      const cw = rng.range(120, 190);
      const ch = cw * rng.range(0.4, 0.5);
      const image = prerender(cw, ch, (g) => {
        g.drawImage(makeCloud(cw, ch, rng, dress.cloud[0], dress.cloud[1], 6), 0, 0, cw, ch);
        sleepyFace(g, cw / 2, ch * 0.6, ch * 0.62, darken(dress.cloud[1], 0.4), [255, 130, 160]);
      });
      this.clouds.push({
        image,
        x: (i / count) * (w + 200) - 100 + rng.range(-30, 30),
        y: h * rng.range(0.3, 0.5),
        w: cw,
        h: ch,
        speed: rng.range(3, 7),
        bob: rng.range(0, TAU),
      });
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -c.w) c.x = this.view.w + 30;
    }
  }

  /**
   * The point on the strand a share `u` of the way along it, from the left pole to the right, and
   * how it slopes there.
   */
  strandAt(u: number): { x: number; y: number } {
    const s = this.strand;
    const x = s.x0 + (s.x1 - s.x0) * u;
    return { x, y: s.y0 + (s.y1 - s.y0) * u + 4 * s.sag * u * (1 - u) };
  }

  private drawSky(g: CanvasRenderingContext2D, w: number, h: number): void {
    const { dress, orb } = this;
    verticalGradient(g, 0, 0, w, h, dress.sky);
    // The light along the horizon, wide and low, under the sun if there is one.
    g.save();
    g.translate(dress.orb.kind === 'moon' ? w * 0.5 : orb.x, this.plan.horizon);
    g.scale(1, 0.5);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.75);
    glow.addColorStop(0, css(dress.horizon, 0.7));
    glow.addColorStop(0.5, css(dress.horizon, 0.22));
    glow.addColorStop(1, css(dress.horizon, 0));
    g.fillStyle = glow;
    g.fillRect(-w, -w, w * 2, w * 2);
    g.restore();
    if (dress.orb.kind === 'low-sun') this.drawLowSun(g);
    else if (dress.orb.kind === 'moon') this.drawMoon(g);
    else {
      glowAt(g, orb.x, orb.y, orb.r * 8, dress.orb.color, 0.4);
      glowAt(g, orb.x, orb.y, orb.r * 4, [255, 250, 220], 0.5);
    }
  }

  private drawLowSun(g: CanvasRenderingContext2D): void {
    const { orb, dress } = this;
    glowAt(g, orb.x, orb.y, orb.r * 9, dress.orb.color, 0.55);
    glowAt(g, orb.x, orb.y, orb.r * 4.5, [255, 236, 190], 0.6);
    const disc = g.createLinearGradient(0, orb.y - orb.r, 0, orb.y + orb.r);
    disc.addColorStop(0, css(lighten(dress.orb.color, 0.55)));
    disc.addColorStop(1, css(mix(dress.orb.color, dress.horizon, 0.7)));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(orb.x, orb.y, orb.r, 0, TAU);
    g.fill();
  }

  private drawMoon(g: CanvasRenderingContext2D): void {
    const { orb, dress } = this;
    glowAt(g, orb.x, orb.y, orb.r * 7, dress.orb.color, 0.38);
    glowAt(g, orb.x, orb.y, orb.r * 3.6, dress.orb.color, 0.5);
    // A crescent: a disc with a second disc taken out of it, and a sleepy face on the fat part.
    const size = Math.ceil(orb.r * 2.6);
    const moon = prerender(
      size,
      size,
      (c) => {
        const m = size / 2;
        const body = c.createRadialGradient(m - orb.r * 0.3, m - orb.r * 0.3, orb.r * 0.1, m, m, orb.r);
        body.addColorStop(0, css(lighten(dress.orb.color, 0.5)));
        body.addColorStop(1, css(darken(dress.orb.color, 0.04)));
        c.fillStyle = body;
        c.beginPath();
        c.arc(m, m, orb.r, 0, TAU);
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.arc(m + orb.r * 0.62, m - orb.r * 0.34, orb.r * 0.86, 0, TAU);
        c.fill();
        c.globalCompositeOperation = 'source-over';
        sleepyFace(c, m - orb.r * 0.34, m + orb.r * 0.14, orb.r * 0.66, [128, 106, 150], [255, 150, 170]);
      },
      3,
    );
    g.drawImage(moon, orb.x - size / 2, orb.y - size / 2, size, size);
  }

  /** The rays of a sun: rounded points that stand out round it, drawn once and then only turned. */
  private makeRays(r: number, color: RGB): HTMLCanvasElement {
    const size = Math.ceil(r * 6);
    return prerender(
      size,
      size,
      (g) => {
        g.translate(size / 2, size / 2);
        const n = 12;
        for (let i = 0; i < n; i++) {
          g.save();
          g.rotate((i / n) * TAU);
          g.fillStyle = css(lighten(color, 0.45), i % 2 === 0 ? 0.5 : 0.3);
          g.beginPath();
          const long = r * (i % 2 === 0 ? 2.6 : 2.0);
          g.moveTo(-r * 0.24, -r * 1.3);
          g.lineTo(0, -long);
          g.lineTo(r * 0.24, -r * 1.3);
          g.closePath();
          g.fill();
          g.restore();
        }
      },
      2,
    );
  }

  private drawFar(g: CanvasRenderingContext2D, w: number, h: number, line: Contour, rng: Rng): void {
    const { dress, plan } = this;
    fillGround(g, line, w, h, plan.horizon - h * 0.2, dress.hills[0], 0.35);
    // Round trees along the ridge, in the colour of the hill but a little deeper.
    const leaf = mix(dress.hills[0][1], [60, 150, 90], dress.name === 'cool' ? 0.1 : 0.4);
    for (let i = 0; i < Math.round(w / 52); i++) {
      const x = rng.range(10, w - 10);
      paintTree(g, x, line(x) + 3, rng.range(13, 22), dress.name === 'cool' ? darken(leaf, 0.15) : leaf);
    }
    // The two poles that hold the strand, standing on the ridge.
    const strand = (u: number): { x: number; y: number } => ({
      x: w * (u < 0.5 ? 0.07 : 0.93),
      y: line(w * (u < 0.5 ? 0.07 : 0.93)),
    });
    for (const u of [0, 1]) {
      const foot = strand(u);
      g.fillStyle = css(darken(dress.hills[0][1], 0.5));
      g.fillRect(foot.x - 2.2, foot.y - h * 0.17, 4.4, h * 0.17 + 6);
      g.fillStyle = css(lighten(dress.hills[0][0], 0.5));
      g.beginPath();
      g.arc(foot.x, foot.y - h * 0.17, 4.2, 0, TAU);
      g.fill();
    }
  }

  private drawNear(g: CanvasRenderingContext2D, w: number, h: number, line: Contour, rng: Rng): void {
    const { dress, plan } = this;
    fillGround(g, line, w, h, plan.feet - 24, dress.hills[1], 0.4);
    // The grass on top of it, a little lighter and with a soft edge.
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, line(x) + 5 + Math.sin(x * 0.04) * 1.6);
    g.lineTo(w, h);
    g.closePath();
    const turf = g.createLinearGradient(0, plan.feet - 22, 0, h);
    turf.addColorStop(0, css(dress.grass[0]));
    turf.addColorStop(1, css(dress.grass[1]));
    g.fillStyle = turf;
    g.fill();
    g.strokeStyle = css(lighten(dress.grass[0], 0.28), 0.55);
    g.lineWidth = 1.6;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = line(x) + 5 + Math.sin(x * 0.04) * 1.6;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // Tufts of grass.
    g.lineCap = 'round';
    for (let i = 0; i < Math.round(w / 8); i++) {
      const x = rng.range(0, w);
      const y = rng.range(line(x) + 9, h - 3);
      const s = rng.range(3, 6);
      g.strokeStyle = css(lighten(dress.grass[0], rng.range(0.08, 0.3)), 0.8);
      g.lineWidth = 1.3;
      for (const lean of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + lean * s, y - s * (1.2 - Math.abs(lean) * 0.4));
        g.stroke();
      }
    }
    // Flowers, in the dress's colours.
    for (let i = 0; i < Math.round(w / 26); i++) {
      const x = rng.range(6, w - 6);
      const y = rng.range(line(x) + 12, h - 5);
      const c = rng.pick(dress.flowers);
      const r = rng.range(2, 3.6);
      g.fillStyle = css(c, 0.97);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.8, 0, TAU);
        g.fill();
      }
      g.fillStyle = css(darken(c, 0.32));
      g.beginPath();
      g.arc(x, y, r * 0.55, 0, TAU);
      g.fill();
    }
    // The bottom of the picture is a little darker, so the eye stays up with the balloons.
    const shade = g.createLinearGradient(0, h - 44, 0, h);
    shade.addColorStop(0, 'rgba(10,6,30,0)');
    shade.addColorStop(1, `rgba(10,6,30,${dress.name === 'party' ? 0.22 : 0.34})`);
    g.fillStyle = shade;
    g.fillRect(0, h - 44, w, 44);
  }

  /**
   * The sky, the sun or the moon, the clouds, the far hills, and the strand: everything that is
   * behind the balloons.
   */
  paintSky(p: Painter, glow: number): void {
    const g = p.ctx;
    const { w, h } = this.view;
    stamp(g, this.sky, 0, 0, w, h);
    this.stars?.draw(g, p.t, p.calm);
    if (this.rays) {
      const r = this.orb.r;
      g.save();
      g.translate(this.orb.x, this.orb.y);
      g.rotate(p.t * 0.12);
      const size = r * 6;
      g.drawImage(this.rays, -size / 2, -size / 2, size, size);
      g.restore();
      this.paintSunFace(g, p.t);
    }
    for (const c of this.clouds) {
      g.drawImage(c.image, c.x, c.y + Math.sin(p.t * 0.4 + c.bob) * 2.5, c.w, c.h);
    }
    if (glow > 0.01) {
      // A pop lights the sky a little: a wash of the colour of the last, which fades.
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = css(this.dress.horizon, glow * 0.1);
      g.fillRect(0, 0, w, this.plan.horizon + 30);
      g.globalCompositeOperation = 'source-over';
    }
    stamp(g, this.far, 0, 0, w, h);
    this.paintStrand(p);
  }

  /** The near hills, drawn over the balloons that are let go from behind them. */
  paintNear(p: Painter): void {
    stamp(p.ctx, this.near, 0, 0, this.view.w, this.view.h);
  }

  private paintSunFace(g: CanvasRenderingContext2D, t: number): void {
    const { orb, dress } = this;
    const disc = g.createRadialGradient(orb.x - orb.r * 0.3, orb.y - orb.r * 0.3, orb.r * 0.1, orb.x, orb.y, orb.r);
    disc.addColorStop(0, css(lighten(dress.orb.color, 0.55)));
    disc.addColorStop(1, css(dress.orb.color));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(orb.x, orb.y, orb.r, 0, TAU);
    g.fill();
    g.strokeStyle = css(darken(dress.orb.color, 0.3), 0.5);
    g.lineWidth = 1.4;
    g.stroke();
    sleepyFace(g, orb.x, orb.y + orb.r * 0.05 + Math.sin(t * 1.4) * 0.6, orb.r * 1.05, [150, 84, 40], [255, 120, 110]);
  }

  /** The strand between the poles, and what hangs from it. */
  private paintStrand(p: Painter): void {
    const g = p.ctx;
    const s = this.strand;
    const { w } = this.view;
    g.strokeStyle = css(darken(this.dress.hills[0][1], 0.45), 0.9);
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(s.x0, s.y0);
    g.quadraticCurveTo((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2 + 2 * s.sag, s.x1, s.y1);
    g.stroke();
    const kind = this.dress.strand;
    const n = Math.max(8, Math.round(w / (kind === 'bunting' ? 34 : kind === 'lanterns' ? 96 : 26)));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const at = this.strandAt(u);
      if (kind === 'bunting') this.paintFlag(g, at.x, at.y, i, p.t);
      else if (kind === 'lanterns') this.paintLantern(p, at.x, at.y, i, p.t);
      else this.paintBulb(p, at.x, at.y, i, p.t);
    }
  }

  private paintFlag(g: CanvasRenderingContext2D, x: number, y: number, i: number, t: number): void {
    const c = FLAGS[i % FLAGS.length]!;
    const sway = Math.sin(t * 1.7 + i * 0.8) * 0.1;
    g.save();
    g.translate(x, y);
    g.rotate(sway);
    g.fillStyle = css(c);
    g.beginPath();
    g.moveTo(-9, 0);
    g.lineTo(9, 0);
    g.lineTo(0 + sway * 12, 21);
    g.closePath();
    g.fill();
    g.fillStyle = css(lighten(c, 0.35), 0.55);
    g.beginPath();
    g.moveTo(-9, 0);
    g.lineTo(0, 0);
    g.lineTo(-3 + sway * 6, 11);
    g.closePath();
    g.fill();
    g.restore();
  }

  private paintLantern(p: Painter, x: number, y: number, i: number, t: number): void {
    const g = p.ctx;
    const sway = Math.sin(t * 1.2 + i * 1.3) * 0.07;
    const flicker = 0.85 + 0.15 * Math.sin(t * 7 + i * 2.1) * (p.calm ? 0.3 : 1);
    g.save();
    g.translate(x, y);
    g.rotate(sway);
    g.strokeStyle = 'rgba(80,40,40,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 10);
    g.stroke();
    const body = g.createLinearGradient(-9, 0, 9, 0);
    body.addColorStop(0, '#ff9a4a');
    body.addColorStop(0.5, '#ffd27a');
    body.addColorStop(1, '#ff7a3a');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 22, 9, 12, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(160,60,30,0.5)';
    g.lineWidth = 0.9;
    for (const k of [-0.5, 0, 0.5]) {
      g.beginPath();
      g.ellipse(0, 22, 9 * Math.abs(k) + 0.5, 12, 0, 0, TAU);
      g.stroke();
    }
    g.fillStyle = '#7a3a2a';
    g.fillRect(-4, 9.5, 8, 2.4);
    g.fillRect(-4, 32, 8, 2.4);
    g.restore();
    glowAt(p.light, x + sway * 22, y + 22, 58, [255, 190, 110], 0.5 * flicker);
  }

  private paintBulb(p: Painter, x: number, y: number, i: number, t: number): void {
    const g = p.ctx;
    const tones: readonly RGB[] = [
      [255, 236, 160],
      [255, 170, 210],
      [170, 240, 255],
      [200, 255, 170],
    ];
    const c = tones[i % tones.length]!;
    const twinkle = 0.65 + 0.35 * Math.sin(t * 2.4 + i * 1.9) * (p.calm ? 0.4 : 1);
    g.fillStyle = css(darken(c, 0.2));
    g.fillRect(x - 1, y, 2, 3);
    g.fillStyle = css(lighten(c, 0.3), 0.6 + 0.4 * twinkle);
    g.beginPath();
    g.arc(x, y + 5.5, 2.8, 0, TAU);
    g.fill();
    glowAt(p.light, x, y + 5.5, 26, c, 0.55 * twinkle);
  }
}
