import type { Rng } from '../../../domain/rng';
import { COLORS, css, lighten, mix, RAINBOW, type RGB } from '../../engine/color';
import { clamp, easeOutBack, lerp, Spring, smooth, TAU, unlerp } from '../../engine/ease';
import { glowAt, prerender, verticalGradient } from '../../engine/paint';
import { hash } from './heavens';
import type { Palette } from './palette';

/**
 * The moon, where the climb ends: a quiet garden under a black sky with the world hanging in it.
 * The ground is silver and dented with craters, and flowers of light come up out of it in a wave
 * from wherever she lands. Everything is in the units of the screen, so there is no camera here.
 */

/**
 * The colours of the sky over the moon, from the top to the horizon, for each of the three skies.
 */
const NIGHTS: Readonly<Record<Palette['name'], readonly [RGB, RGB, RGB]>> = {
  sunrise: [
    [10, 8, 40],
    [50, 30, 100],
    [156, 96, 152],
  ],
  candy: [
    [26, 10, 62],
    [92, 42, 134],
    [218, 124, 194],
  ],
  starry: [
    [3, 8, 36],
    [16, 38, 100],
    [72, 124, 196],
  ],
};

/** How big the picture of the moon seen through the door is, in units. */
const VISTA = 320;

/**
 * The moon as it is seen through the door at the top of the sky: its night, its stars, the world
 * hanging in it, and its silver ground with the first flowers of light. It is a picture of the
 * garden she is about to arrive in, so that when the door opens wide and fills the screen, and the
 * real garden comes up under it, nothing changes but that it moves.
 */
export function makeVista(palette: Palette): HTMLCanvasElement {
  return prerender(VISTA, VISTA, (g, w, h) => {
    const [top, mid, low] = NIGHTS[palette.name];
    verticalGradient(g, 0, 0, w, h, [
      [0, top],
      [0.5, mid],
      [0.78, low],
      [1, mid],
    ]);
    for (let i = 0; i < 70; i++) {
      const a = 0.4 + 0.6 * hash(i, 41);
      if (hash(i, 44) < 0.12) glowAt(g, hash(i, 42) * w, hash(i, 43) * h * 0.7, 9, [255, 250, 230], a, 'spark');
      else {
        g.fillStyle = css([255, 252, 240], a);
        g.fillRect(hash(i, 42) * w, hash(i, 43) * h * 0.74, 1.5, 1.5);
      }
    }
    paintEarth(g, w * 0.72, h * 0.27, w * 0.12, 0);
    const horizon = h * 0.72;
    const base = palette.accents[1]!;
    const ground = g.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, css(mix([226, 220, 250], base, 0.14)));
    ground.addColorStop(1, css(mix([142, 132, 196], base, 0.14)));
    g.fillStyle = ground;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, horizon - Math.sin(x * 0.02 + 0.4) * 5 - Math.sin(x * 0.05 + 2) * 2.5);
    g.lineTo(w, h);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const x = w * (0.08 + hash(i, 51) * 0.84);
      const y = horizon + 8 + hash(i, 52) * (h - horizon - 14);
      glowAt(g, x, y, 14, palette.accents[i % palette.accents.length]!, 0.9);
      glowAt(g, x, y, 5, [255, 250, 220], 0.9, 'spark');
    }
  });
}

/**
 * The world, as seen from the moon: blue and green with white weather going round it, and half in
 * shadow. `t` is seconds, for the slow turning.
 */
function paintEarth(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  glowAt(g, x, y, r * 4.4, [120, 190, 255], 0.42);
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.clip();
  const sea = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  sea.addColorStop(0, css([120, 196, 255]));
  sea.addColorStop(1, css([36, 92, 190]));
  g.fillStyle = sea;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  // Land, slipping slowly across as it turns.
  const turn = (t * 0.012) % 1;
  g.fillStyle = css([112, 204, 132]);
  for (const [px, py, pr] of [
    [0.15, -0.25, 0.42],
    [0.62, 0.2, 0.3],
    [-0.5, 0.35, 0.34],
    [0.2, 0.62, 0.22],
  ] as const) {
    for (const shift of [0, -2]) {
      g.beginPath();
      g.ellipse(x + (((px + turn * 2 + shift + 3) % 2) - 1) * r * 1.2, y + py * r, pr * r, pr * r * 0.6, 0.5, 0, TAU);
      g.fill();
    }
  }
  // Weather.
  g.strokeStyle = css([255, 255, 255], 0.55);
  g.lineWidth = r * 0.07;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const yy = y + (i - 1.5) * r * 0.42;
    g.beginPath();
    g.moveTo(x - r * 0.8, yy + Math.sin(t * 0.2 + i) * 3);
    g.quadraticCurveTo(x, yy - r * 0.2, x + r * 0.8, yy + r * 0.05);
    g.stroke();
  }
  // The night side.
  const shade = g.createRadialGradient(x - r * 0.55, y - r * 0.45, r * 0.6, x + r * 0.35, y + r * 0.3, r * 1.5);
  shade.addColorStop(0, css([0, 0, 40], 0));
  shade.addColorStop(1, css([0, 0, 40], 0.7));
  g.fillStyle = shade;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  g.strokeStyle = css([190, 226, 255], 0.55);
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(x, y, r - 0.8, Math.PI * 1.05, Math.PI * 1.75);
  g.stroke();
}

/** A flower of light on the ground. */
export interface Flower {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tone: RGB;
  readonly petals: number;
  readonly phase: number;
  /** How far up it has come, from 0 (a seed) to 1. */
  bloom: number;
  /** Whether it has been asked to come up. */
  rising: boolean;
  /** How many steps up the scale its note is. */
  readonly step: number;
  /** A pop when it is touched. */
  readonly pop: Spring;
}

export class Garden {
  readonly flowers: Flower[] = [];
  /** Where the herd stands. */
  groundY = 0;
  private w = 0;
  private h = 0;
  private ground: HTMLCanvasElement | null = null;
  private dunes: HTMLCanvasElement | null = null;
  private readonly stars: { x: number; y: number; r: number; phase: number; rate: number; tone: RGB; big: boolean }[] =
    [];
  /** Where the wave of flowers has got to, and from where. A negative radius is no wave. */
  private waveX = 0;
  private waveR = -1;
  private readonly fresh: Flower[] = [];

  constructor(
    private readonly palette: Palette,
    private readonly rng: Rng,
  ) {
    const tones: RGB[] = [COLORS.white, [200, 220, 255], [255, 240, 200], [255, 215, 235]];
    for (let i = 0; i < 190; i++) {
      this.stars.push({
        x: rng.next(),
        y: rng.next() ** 1.2,
        r: rng.range(0.6, 1.8),
        phase: rng.range(0, TAU),
        rate: rng.range(0.6, 2.4),
        tone: rng.pick(tones),
        big: rng.next() < 0.1,
      });
    }
  }

  /**
   * The screen changed size, or this is the first layout. The flowers keep to the screen they are
   * on.
   */
  arrange(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.groundY = h * 0.8;
    const rng = this.rng;
    // The ground is made again for the new size, and the flowers are laid out over it again, each
    // keeping its own bloom.
    const keep = this.flowers.map((f) => ({ bloom: f.bloom, rising: f.rising }));
    this.flowers.length = 0;
    const count = Math.round(clamp(w / 22, 22, 44));
    for (let i = 0; i < count; i++) {
      const depth = rng.next();
      const y = h * (0.72 + 0.25 * depth);
      const x = lerp(-0.02, 1.02, (i + rng.range(0.1, 0.9)) / count) * w;
      const scale = 0.7 + depth * 0.7;
      const flower: Flower = {
        x,
        y,
        size: rng.range(8, 13) * scale,
        tone: this.palette.accents[i % this.palette.accents.length]!,
        petals: 5 + (i % 3),
        phase: rng.range(0, TAU),
        bloom: keep[i]?.bloom ?? 0,
        rising: keep[i]?.rising ?? false,
        step: Math.min(9, Math.floor((x / w) * 10)),
        pop: new Spring(0, 0, 220, 9),
      };
      this.flowers.push(flower);
    }
    this.flowers.sort((a, b) => a.y - b.y);
    this.dunes = prerender(w, h * 0.34, (g, pw, ph) => {
      const sky = NIGHTS[this.palette.name][2];
      g.fillStyle = css(mix(sky, [210, 200, 245], 0.35));
      g.beginPath();
      g.moveTo(0, ph);
      for (let x = 0; x <= pw; x += 6)
        g.lineTo(x, ph * 0.46 - Math.sin(x * 0.008 + 1) * ph * 0.16 - Math.sin(x * 0.021 + 3) * ph * 0.07);
      g.lineTo(pw, ph);
      g.fill();
    });
    this.ground = prerender(w, h * 0.34, (g, pw, ph) => {
      const base = this.palette.accents[1]!;
      const grad = g.createLinearGradient(0, 0, 0, ph);
      grad.addColorStop(0, css(mix([226, 220, 250], base, 0.14)));
      grad.addColorStop(1, css(mix([142, 132, 196], base, 0.14)));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, ph);
      for (let x = 0; x <= pw; x += 6)
        g.lineTo(x, ph * 0.3 - Math.sin(x * 0.006 + 0.4) * ph * 0.1 - Math.sin(x * 0.017 + 2) * ph * 0.045);
      g.lineTo(pw, ph);
      g.fill();
      // Craters: a dark dent with a light lip on the side the light comes from.
      const crater = (x: number, y: number, rx: number): void => {
        g.fillStyle = css([96, 88, 150], 0.28);
        g.beginPath();
        g.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU);
        g.fill();
        g.strokeStyle = css([255, 255, 255], 0.35);
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(x, y, rx, rx * 0.28, 0, Math.PI * 1.05, Math.PI * 1.95);
        g.stroke();
      };
      for (let i = 0; i < 9; i++) crater(hash(i, 21) * pw, ph * (0.5 + hash(i, 22) * 0.42), 22 + hash(i, 23) * 40);
      // Small stones.
      for (let i = 0; i < 40; i++) {
        const x = hash(i, 31) * pw;
        const y = ph * (0.42 + hash(i, 32) * 0.55);
        g.fillStyle = css([120, 112, 170], 0.35);
        g.beginPath();
        g.ellipse(x, y, 2.5 + hash(i, 33) * 3, 1.5, 0, 0, TAU);
        g.fill();
      }
    });
  }

  /** Starts the flowers coming up from a place, in a wave. */
  bloomFrom(x: number): void {
    this.waveX = x;
    this.waveR = 0;
  }

  /** Flowers all up, at once. */
  bloomAll(): void {
    for (const f of this.flowers) {
      f.rising = true;
      f.bloom = 1;
    }
    this.waveR = -1;
  }

  /**
   * A touch on the ground: the flower nearest it comes up if it has not, and jumps if it has.
   * Returns it, or nothing if the touch was far from any.
   */
  touch(x: number, y: number): Flower | null {
    let best: Flower | null = null;
    let bestD = 70 * 70;
    for (const f of this.flowers) {
      const d = (f.x - x) ** 2 + ((f.y - y) * 1.6) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    if (!best) return null;
    best.rising = true;
    best.pop.kick(9);
    return best;
  }

  /** How many flowers are up. */
  get up(): number {
    let n = 0;
    for (const f of this.flowers) if (f.bloom > 0.98) n++;
    return n;
  }

  /**
   * Moves the flowers on. Returns the ones that were set going this time, so the game can sound
   * them.
   */
  update(dt: number): readonly Flower[] {
    this.fresh.length = 0;
    if (this.waveR >= 0) {
      this.waveR += dt * 460;
      for (const f of this.flowers) {
        if (!f.rising && Math.abs(f.x - this.waveX) + Math.abs(f.y - this.groundY) * 0.5 <= this.waveR) {
          f.rising = true;
          this.fresh.push(f);
        }
      }
      if (this.waveR > this.w * 1.2) this.waveR = -1;
    }
    for (const f of this.flowers) {
      if (f.rising && f.bloom < 1) f.bloom = Math.min(1, f.bloom + dt * 1.7);
      f.pop.step(dt);
    }
    return this.fresh;
  }

  /** Puts everything back as it was: no flower is up. */
  reset(): void {
    for (const f of this.flowers) {
      f.bloom = 0;
      f.rising = false;
      f.pop.x = 0;
      f.pop.v = 0;
    }
    this.waveR = -1;
  }

  /**
   * The sky: black at the top, violet at the horizon, stars, the world hanging in it, and the
   * rainbow of moonlight.
   */
  paintSky(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    t: number,
    calm: boolean,
    arch: number,
    beat: number,
  ): void {
    const { w, h } = this;
    const [top, mid, low] = NIGHTS[this.palette.name];
    verticalGradient(g, 0, 0, w, h + 2, [
      [0, top],
      [0.55, mid],
      [0.82, low],
      [1, mid],
    ]);
    const swing = calm ? 0.12 : 0.4;
    for (const s of this.stars) {
      const a = 1 - swing + swing * Math.sin(s.phase + t * s.rate);
      if (s.big) {
        glowAt(g, s.x * w, s.y * h * 0.8, 11 + s.r * 4, s.tone, a * 0.9, 'spark');
        continue;
      }
      g.globalAlpha = clamp(a);
      g.fillStyle = css(s.tone);
      g.fillRect(s.x * w - s.r / 2, s.y * h * 0.8 - s.r / 2, s.r, s.r);
    }
    g.globalAlpha = 1;
    paintEarth(g, w * 0.8, h * 0.23, Math.min(w, h) * 0.13, t);
    this.paintMoonbow(g, light, arch, t, beat);
    if (this.dunes) g.drawImage(this.dunes, 0, h * 0.62, w, h * 0.34);
  }

  /** A rainbow of moonlight that rises behind the herd and arches over them. `grow` is 0 to 1. */
  private paintMoonbow(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    grow: number,
    t: number,
    beat: number,
  ): void {
    if (grow <= 0.01) return;
    const { w } = this;
    const cx = w * 0.5;
    const cy = this.groundY + 6;
    const outer = Math.min(w * 0.46, this.h * 0.72);
    const band = outer * 0.055;
    // It is drawn from the left foot over to the right, as if with a brush, and the sparks follow
    // the end of it.
    const sweep = Math.PI * smooth(grow);
    const from = Math.PI;
    const to = Math.PI + sweep;
    g.lineCap = 'butt';
    for (let i = 0; i < RAINBOW.length; i++) {
      g.strokeStyle = css(lighten(RAINBOW[i]!, 0.3), 0.62);
      g.lineWidth = band + 0.8;
      g.beginPath();
      g.arc(cx, cy, outer - i * band, from, to);
      g.stroke();
    }
    light.globalCompositeOperation = 'lighter';
    glowAt(light, cx, cy - outer * 0.55, outer * 2.1, [255, 244, 255], (0.1 + 0.05 * beat) * grow);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI + ((t * 0.3 + k / 3) % 1) * sweep;
      glowAt(
        light,
        cx + Math.cos(a) * (outer - band * 3.5),
        cy + Math.sin(a) * (outer - band * 3.5),
        38,
        [255, 255, 255],
        0.5 * grow,
        'spark',
      );
    }
    // The brush: a bright point at the end of what is drawn, until it is all drawn.
    if (grow < 0.995)
      glowAt(
        light,
        cx + Math.cos(to) * (outer - band * 3.5),
        cy + Math.sin(to) * (outer - band * 3.5),
        70,
        [255, 255, 255],
        0.85,
        'spark',
      );
    light.globalCompositeOperation = 'source-over';
  }

  /** The ground, and the flowers that are behind where the herd stands. */
  paintGround(g: CanvasRenderingContext2D, t: number, beat: number): void {
    const { w, h } = this;
    if (this.ground) g.drawImage(this.ground, 0, h * 0.66, w, h * 0.34);
    this.paintFlowers(g, t, beat, false);
  }

  /**
   * The flowers that are in front of where the herd stands, to be drawn over it. `beat` is 1 on a
   * beat of the music and falls away, so the flowers glow to it.
   */
  paintFront(g: CanvasRenderingContext2D, t: number, beat: number): void {
    this.paintFlowers(g, t, beat, true);
  }

  private paintFlowers(g: CanvasRenderingContext2D, t: number, beat: number, front: boolean): void {
    for (const f of this.flowers) {
      if (f.y > this.groundY !== front) continue; // behind the herd, or in front of it
      if (f.bloom <= 0.01) {
        // A seed: a small bright speck, so it can be seen where a flower will be.
        this.lit(g, f.x, f.y, 10, f.tone, 0.5, 'spark');
        continue;
      }
      const grow = easeOutBack(clamp(f.bloom));
      const sway = Math.sin(t * 1.1 + f.phase) * 2.4 * grow;
      const pop = 1 + f.pop.x * 0.1;
      const height = f.size * 2.4 * grow;
      const tipX = f.x + sway;
      const tipY = f.y - height;
      g.strokeStyle = css(mix(f.tone, [150, 230, 190], 0.5), 0.85);
      g.lineWidth = Math.max(1.4, f.size * 0.16);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(f.x, f.y);
      g.quadraticCurveTo(f.x + sway * 0.2, f.y - height * 0.5, tipX, tipY);
      g.stroke();
      // Two leaves.
      g.fillStyle = css([150, 230, 190], 0.8);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(f.x + side * f.size * 0.4, f.y - height * 0.35, f.size * 0.42, f.size * 0.17, side * -0.6, 0, TAU);
        g.fill();
      }
      const r = f.size * pop * clamp(grow);
      this.lit(g, tipX, tipY, r * 4.2, f.tone, (0.38 + 0.25 * beat) * clamp(f.bloom));
      for (let k = 0; k < f.petals; k++) {
        const a = (k / f.petals) * TAU + Math.sin(t * 0.5 + f.phase) * 0.12;
        g.fillStyle = css(lighten(f.tone, 0.18), 0.95);
        g.beginPath();
        g.ellipse(tipX + Math.cos(a) * r * 0.62, tipY + Math.sin(a) * r * 0.62, r * 0.55, r * 0.24, a, 0, TAU);
        g.fill();
      }
      g.fillStyle = css([255, 246, 200]);
      g.beginPath();
      g.arc(tipX, tipY, r * 0.3, 0, TAU);
      g.fill();
      this.lit(g, tipX, tipY, r * 1.5, [255, 250, 220], 0.55 * clamp(f.bloom), 'spark');
    }
  }

  /**
   * A glow laid on what is there, so that it shines on the flower and on what is behind it, and is
   * hidden by what is in front.
   */
  private lit(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: RGB,
    alpha: number,
    kind: 'glow' | 'spark' = 'glow',
  ): void {
    g.globalCompositeOperation = 'lighter';
    glowAt(g, x, y, size, color, alpha, kind);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * How far the wave of flowers has got, for a game that wants to time something to it. Negative
   * when there is none.
   */
  get wave(): number {
    return this.waveR;
  }

  /** The share of the way across the screen that a place is, from 0 to 1. */
  shareOf(x: number): number {
    return unlerp(0, this.w, x);
  }
}
