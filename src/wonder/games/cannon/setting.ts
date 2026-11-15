import { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { makeCloud, makeHills, paintMoon, prerender, Starfield, stamp, verticalGradient } from '../../engine/paint';
import type { Painter, View } from '../../engine/painter';
import type { BurstLight } from '../sky/light';
import type { Dress } from './dress';

interface Drift {
  readonly image: HTMLCanvasElement;
  x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly speed: number;
}

/**
 * The place the cannon stands: a sky that goes from night to the glow at the horizon, the moon or a
 * low sun, stars that twinkle, clouds that drift, two rows of hills and a grassy rise to stand on.
 * What does not move is drawn once.
 */
export class Setting {
  /** Where the cannon's wheel and the friends' hooves meet the grass. */
  readonly feet: number;
  /** About where the hills meet the sky. */
  readonly horizon: number;
  private readonly sky: HTMLCanvasElement;
  private readonly land: HTMLCanvasElement;
  private readonly stars: Starfield;
  private readonly clouds: Drift[] = [];
  /** The moon or the sun: where it is and how big. */
  readonly orb: { readonly x: number; readonly y: number; readonly r: number };

  constructor(
    private readonly dress: Dress,
    seed: number,
    private readonly view: View,
    /**
     * Where the moon or the sun goes, if the game has somewhere in mind. The sun stays on the
     * horizon, so only its `x` counts.
     */
    spot?: { readonly x: number; readonly y: number },
  ) {
    const rng = new Rng(seed);
    const { w, h } = view;
    this.feet = h - 30;
    this.horizon = this.feet - 76;
    this.orb =
      dress.orb.kind === 'moon'
        ? { x: spot?.x ?? Math.max(130, w * 0.15), y: spot?.y ?? h * 0.2, r: 20 }
        : { x: spot?.x ?? w * 0.7, y: this.horizon - 2, r: 50 };
    this.sky = prerender(w, h, (g) => this.drawSky(g, w, h));
    this.land = prerender(w, h, (g) => this.drawLand(g, w, h, rng));
    this.stars = new Starfield(Math.round((w * h) / 3400), rng, w, 0, this.horizon - 10);
    for (let i = 0; i < 3; i++) {
      const cw = rng.range(120, 190);
      const ch = cw * rng.range(0.32, 0.4);
      this.clouds.push({
        image: makeCloud(cw, ch, rng, dress.cloud[0], dress.cloud[1], 6),
        x: rng.range(0, w),
        y: rng.range(h * 0.1, this.horizon * 0.5),
        w: cw,
        h: ch,
        speed: rng.range(2.5, 6),
      });
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -c.w) c.x = this.view.w + 20;
    }
  }

  /**
   * The sky, its stars and clouds, then the hills and the grass. Everything the game draws is drawn
   * over this.
   */
  paint(p: Painter, light: BurstLight): void {
    const g = p.ctx;
    const { w, h } = this.view;
    stamp(g, this.sky, 0, 0, w, h);
    this.stars.draw(g, p.t, p.calm);
    g.globalAlpha = 0.5;
    for (const c of this.clouds) g.drawImage(c.image, c.x, c.y, c.w, c.h);
    g.globalAlpha = 1;
    // What bursts lights the whole sky a little, in the colour of the last burst.
    if (light.ambient > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = css(light.tint, light.ambient * 0.13);
      g.fillRect(0, 0, w, this.horizon + 20);
      g.globalCompositeOperation = 'source-over';
    }
    stamp(g, this.land, 0, 0, w, h);
  }

  private drawSky(g: CanvasRenderingContext2D, w: number, h: number): void {
    const { dress, horizon, orb } = { dress: this.dress, horizon: this.horizon, orb: this.orb };
    verticalGradient(g, 0, 0, w, h, dress.sky);
    // The glow along the horizon, wide and low.
    g.save();
    const cx = dress.orb.kind === 'sun' ? orb.x : w * 0.5;
    g.translate(cx, horizon);
    g.scale(1, 0.46);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.7);
    glow.addColorStop(0, css(dress.horizon, 0.62));
    glow.addColorStop(0.5, css(dress.horizon, 0.2));
    glow.addColorStop(1, css(dress.horizon, 0));
    g.fillStyle = glow;
    g.fillRect(-w, -w, w * 2, w * 2);
    g.restore();
    if (dress.orb.kind === 'moon') {
      paintMoon(g, orb.x, orb.y, orb.r, dress.orb.color);
      return;
    }
    // A low sun that the hills are about to take, with a halo.
    const halo = g.createRadialGradient(orb.x, orb.y, orb.r * 0.4, orb.x, orb.y, orb.r * 3.2);
    halo.addColorStop(0, css(dress.orb.color, 0.55));
    halo.addColorStop(1, css(dress.orb.color, 0));
    g.fillStyle = halo;
    g.fillRect(orb.x - orb.r * 3.4, orb.y - orb.r * 3.4, orb.r * 6.8, orb.r * 6.8);
    const disc = g.createLinearGradient(0, orb.y - orb.r, 0, orb.y + orb.r);
    disc.addColorStop(0, css(lighten(dress.orb.color, 0.6)));
    disc.addColorStop(1, css(mix(dress.orb.color, dress.horizon, 0.7)));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(orb.x, orb.y, orb.r, 0, TAU);
    g.fill();
  }

  private drawLand(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng): void {
    const { dress, horizon, feet } = { dress: this.dress, horizon: this.horizon, feet: this.feet };
    const far = h - (horizon - 62);
    g.drawImage(makeHills(w, far, rng, dress.hills[0][0], dress.hills[0][1], 0.5), 0, horizon - 62, w, far);
    const near = h - (horizon - 22);
    g.drawImage(makeHills(w, near, rng, dress.hills[1][0], dress.hills[1][1], 0.3), 0, horizon - 22, w, near);
    // A few round bushes along the near hills, in the colour of the hill but a little lighter.
    for (let i = 0; i < Math.round(w / 80); i++) {
      const x = rng.range(10, w - 10);
      const y = horizon + rng.range(-6, 14);
      const r = rng.range(7, 14);
      g.fillStyle = css(lighten(dress.hills[1][0], 0.07));
      g.beginPath();
      g.arc(x, y, r, Math.PI, 0);
      g.arc(x + r * 0.9, y, r * 0.7, Math.PI, 0);
      g.closePath();
      g.fill();
    }
    // The rise they stand on: grass with a soft edge along its top.
    const top = feet - 14;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, top + Math.sin(x * 0.012 + 1) * 5 + Math.sin(x * 0.031) * 2.5);
    g.lineTo(w, h);
    g.closePath();
    const grass = g.createLinearGradient(0, top - 6, 0, h);
    grass.addColorStop(0, css(dress.grass[0]));
    grass.addColorStop(1, css(dress.grass[1]));
    g.fillStyle = grass;
    g.fill();
    g.strokeStyle = css(lighten(dress.grass[0], 0.22), 0.5);
    g.lineWidth = 1.6;
    g.stroke();
    // Tufts of grass and little flowers.
    g.lineCap = 'round';
    for (let i = 0; i < Math.round(w / 9); i++) {
      const x = rng.range(0, w);
      const y = rng.range(top + 8, h - 3);
      const s = rng.range(3, 6);
      g.strokeStyle = css(lighten(dress.grass[0], rng.range(0.1, 0.3)), 0.8);
      g.lineWidth = 1.3;
      for (const lean of [-0.5, 0, 0.5]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + lean * s, y - s * (1.2 - Math.abs(lean) * 0.4));
        g.stroke();
      }
    }
    for (let i = 0; i < Math.round(w / 34); i++) {
      const x = rng.range(6, w - 6);
      const y = rng.range(top + 10, h - 5);
      const c = rng.pick(dress.flowers);
      const r = rng.range(1.8, 3.2);
      g.fillStyle = css(c, 0.95);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.8, 0, TAU);
        g.fill();
      }
      g.fillStyle = css(darken(c, 0.3));
      g.beginPath();
      g.arc(x, y, r * 0.55, 0, TAU);
      g.fill();
    }
    // The bottom of the picture is a little darker, so the eye stays up in the sky.
    const shade = g.createLinearGradient(0, h - 40, 0, h);
    shade.addColorStop(0, 'rgba(8,4,24,0)');
    shade.addColorStop(1, 'rgba(8,4,24,0.38)');
    g.fillStyle = shade;
    g.fillRect(0, h - 40, w, 40);
  }
}
