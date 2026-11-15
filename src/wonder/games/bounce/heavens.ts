import type { Rng } from '../../../domain/rng';
import { drawPic, type SpriteBank } from '../../engine/bank';
import type { Camera } from '../../engine/camera';
import { COLORS, css, lighten, mix, RAINBOW, type RGB } from '../../engine/color';
import { clamp, lerp, smooth, TAU, unlerp } from '../../engine/ease';
import { glowAt, paintMoon, verticalGradient } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { CloudArt } from './clouds';
import { nightAt, type Palette, skyAt } from './palette';
import type { World } from './world';

/**
 * Everything behind the clouds she climbs: a sky that goes from morning to the dark of the moon as
 * she rises, with stars that come out as it darkens, a moon that grows as she nears it, three
 * depths of far-off clouds that pass at different speeds so the sky is deep, things that belong to
 * this sky and no other, and below it all the meadow she began in.
 */

/** How high the sky goes, in units, so the layers know how far to lay themselves out. */
const SKY_TOP = 3700;

/** A number from 0 to 1 that is always the same for the same two numbers. */
export function hash(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

interface Layer {
  /** How much of the camera's climb it follows. 1 would be the clouds she stands on. */
  readonly factor: number;
  readonly scale: number;
  readonly alpha: number;
  readonly spacing: number;
}

const LAYERS: readonly Layer[] = [
  { factor: 0.14, scale: 0.8, alpha: 0.5, spacing: 210 },
  { factor: 0.28, scale: 1, alpha: 0.64, spacing: 170 },
  { factor: 0.5, scale: 1.3, alpha: 0.8, spacing: 150 },
];

/** The ground the meadow is on, in the world, and how big the mushroom is drawn. */
const GROUND = 98;
export const MUSHROOM = 1.4;

/** A thing in the far sky, in the space of the layer it is in. */
interface Far {
  readonly layer: number;
  /** Across the screen, as a share of its width. */
  readonly fx: number;
  /** Up and down in the layer's own space. */
  readonly ly: number;
  readonly drawing: number;
  readonly drift: number;
}

export class Heavens {
  private readonly far: Far[] = [];
  private readonly stars: { x: number; y: number; r: number; phase: number; rate: number; tone: RGB; big: boolean }[] =
    [];
  private readonly props: { id: string; x: number; y: number; s: number }[] = [];

  constructor(
    private readonly palette: Palette,
    rng: Rng,
    private readonly world: World,
    private readonly bank: SpriteBank | null,
    private readonly art: CloudArt,
  ) {
    LAYERS.forEach((layer, index) => {
      const lo = -SKY_TOP * layer.factor - 500;
      for (let ly = lo; ly < 420; ly += layer.spacing * rng.range(0.7, 1.25)) {
        this.far.push({
          layer: index,
          fx: rng.range(-0.1, 1.1),
          ly,
          drawing: rng.int(4),
          drift: rng.range(0.4, 1.4) * (index + 1),
        });
      }
    });
    const tones: RGB[] = [COLORS.white, [200, 220, 255], [255, 240, 200], [255, 215, 235]];
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: rng.next(),
        y: rng.next(),
        r: rng.range(0.6, 1.7),
        phase: rng.range(0, TAU),
        rate: rng.range(0.6, 2.4),
        tone: rng.pick(tones),
        big: rng.next() < 0.1,
      });
    }
    // The meadow: where each tree, bush and flower of it stands.
    const trees = [
      'pg-tree-blossom-1',
      'pg-tree-oak-lime-1',
      'pg-tree-blossom-2',
      'pg-tree-oak-lime-2',
      'pg-tree-willow-emerald-1',
    ];
    for (const [x, k] of [
      [-70, 0],
      [30, 1],
      [770, 2],
      [850, 3],
      [-20, 4],
    ] as const)
      this.props.push({ id: trees[k]!, x, y: GROUND - 6 + rng.range(-6, 6), s: rng.range(0.62, 0.78) });
    const low = ['pg-bush-lime-1', 'pg-bush-pink-dots', 'pg-bush-lime-2', 'pg-bush-rose-dots', 'pg-bush-emerald-1'];
    for (let x = -120; x < 960; x += rng.range(110, 190))
      this.props.push({ id: rng.pick(low), x, y: GROUND + rng.range(8, 26), s: rng.range(0.7, 1) });
    const flowers = [
      'pg-flowers-pink-1',
      'pg-flowers-yellow-1',
      'pg-flowers-sky-1',
      'pg-flowers-lilac-1',
      'pg-flowers-white-1',
      'pg-flowers-coral-1',
      'pg-tuft-1',
      'pg-tuft-2',
      'pg-tuft-3',
    ];
    for (let x = -140; x < 980; x += rng.range(36, 70))
      this.props.push({ id: rng.pick(flowers), x, y: GROUND + rng.range(24, 62), s: rng.range(0.8, 1.15) });
  }

  /** How far up the sky a place on the screen is, from 0 at the meadow to 1 at the gate. */
  private altitudeAt(cam: Camera, screenY: number, h: number): number {
    return this.world.altitude(cam.worldY(screenY, h));
  }

  /**
   * The moon: where it is on the screen and how big, for the height she is at. It hangs far off in
   * a corner of the sky and grows a little as she rises, and the door at the top is the way into
   * it.
   */
  private moonAt(alt: number, w: number, h: number): { x: number; y: number; r: number } {
    return { x: w * 0.82, y: h * 0.2, r: lerp(9, Math.min(64, h * 0.18), smooth(unlerp(0.1, 1, alt)) ** 1.5) };
  }

  /** The sky behind everything. */
  paintSky(p: Painter, cam: Camera): void {
    const g = p.ctx;
    const { w, h } = p;
    const top = this.altitudeAt(cam, 0, h);
    const mid = this.altitudeAt(cam, h * 0.5, h);
    const bottom = this.altitudeAt(cam, h, h);
    verticalGradient(g, 0, 0, w, h + 2, [
      [0, skyAt(this.palette, top)],
      [0.5, skyAt(this.palette, mid)],
      [1, skyAt(this.palette, bottom)],
    ]);
    const alt = this.world.altitude(cam.y);
    this.paintHorizon(g, cam, w, h, alt);
    this.paintStars(g, cam, w, h, alt, p.t, p.calm);
    this.paintSigns(p, cam, alt);
    this.paintMoon(g, cam, w, h);
    this.paintClouds(g, cam, w, h, alt, p.t);
  }

  /** The glow at the foot of the sky early in the climb, which is the morning behind the hills. */
  private paintHorizon(g: CanvasRenderingContext2D, cam: Camera, w: number, h: number, alt: number): void {
    const strength = 1 - smooth(unlerp(0, 0.22, alt));
    if (strength < 0.01) return;
    const y = cam.screenY(GROUND - 40, h);
    g.globalCompositeOperation = 'lighter';
    glowAt(g, w * 0.5, y, Math.max(w, h) * 1.5, this.palette.glow, 0.5 * strength);
    g.globalCompositeOperation = 'source-over';
  }

  private paintStars(
    g: CanvasRenderingContext2D,
    cam: Camera,
    w: number,
    h: number,
    alt: number,
    t: number,
    calm: boolean,
  ): void {
    const night = nightAt(this.palette, alt);
    if (night < 0.01) return;
    const swing = calm ? 0.12 : 0.4;
    const drift = cam.y * 0.05;
    for (const s of this.stars) {
      const y = (((s.y * h - drift) % h) + h) % h;
      const a = night * (1 - swing + swing * Math.sin(s.phase + t * s.rate));
      if (s.big) {
        glowAt(g, s.x * w, y, 10 + s.r * 4, s.tone, a * 0.9, 'spark');
        continue;
      }
      g.globalAlpha = clamp(a);
      g.fillStyle = css(s.tone);
      g.fillRect(s.x * w - s.r / 2, y - s.r / 2, s.r, s.r);
    }
    g.globalAlpha = 1;
  }

  private paintMoon(g: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
    const alt = this.world.altitude(cam.y);
    if (alt < 0.08) return;
    const m = this.moonAt(alt, w, h);
    g.globalAlpha = smooth(unlerp(0.08, 0.4, alt));
    paintMoon(g, m.x, m.y, m.r, this.palette.moon);
    g.globalAlpha = 1;
  }

  /**
   * The far clouds, three depths of them, thinning and cooling toward the top where there is hardly
   * any air.
   */
  private paintClouds(g: CanvasRenderingContext2D, cam: Camera, w: number, h: number, alt: number, t: number): void {
    const thin = 1 - 0.78 * smooth(unlerp(0.55, 1, alt));
    for (const item of this.far) {
      const layer = LAYERS[item.layer]!;
      const picture = this.art.far(item.drawing);
      const width = picture.w * layer.scale;
      const height = picture.h * layer.scale;
      const y = cam.ay * h + item.ly - cam.y * layer.factor - height / 2;
      if (y > h + 10 || y + height < -10) continue;
      const span = w + width + 80;
      const x =
        ((((item.fx * (w + 160) - (cam.x - 400) * layer.factor * 0.5 + t * item.drift * 2.2) % span) + span) % span) -
        width -
        40;
      g.globalAlpha = layer.alpha * thin;
      g.drawImage(picture.image, x, y, width, height);
    }
    g.globalAlpha = 1;
  }

  /** What belongs to this sky and no other. */
  private paintSigns(p: Painter, cam: Camera, alt: number): void {
    const { w, h } = p;
    const g = p.ctx;
    const place = (factor: number, ly: number): number => cam.ay * h + ly - cam.y * factor;
    switch (this.palette.name) {
      case 'sunrise': {
        // The sun, left behind below as she climbs, and two rainbows that she passes on the way.
        const sy = place(0.1, -70);
        if (sy < h + 160) {
          const sx = w * 0.2 - (cam.x - 400) * 0.03;
          g.globalCompositeOperation = 'lighter';
          glowAt(g, sx, sy, 330, [255, 214, 140], 0.55);
          glowAt(g, sx, sy, 120, [255, 244, 210], 0.8);
          g.globalCompositeOperation = 'source-over';
          const body = g.createRadialGradient(sx - 5, sy - 5, 3, sx, sy, 27);
          body.addColorStop(0, css([255, 252, 232]));
          body.addColorStop(1, css([255, 214, 120]));
          g.fillStyle = body;
          g.beginPath();
          g.arc(sx, sy, 27, 0, TAU);
          g.fill();
        }
        for (const [ly, fx, r] of [
          [-560, 0.7, 330],
          [-1250, 0.28, 300],
        ] as const) {
          const y = place(0.3, ly);
          if (y > h + r || y < -r * 0.2) continue;
          rainbow(g, fx * w, y + r * 0.55, r, 0.34 * (1 - smooth(unlerp(0.5, 0.8, alt))));
        }
        break;
      }
      case 'candy': {
        // Hearts that float like balloons, and lollipops in the far sky.
        for (let i = 0; i < 22; i++) {
          const ly = -140 - i * 150;
          const y = place(0.34 + hash(i, 4) * 0.1, ly) - ((p.t * (8 + hash(i, 5) * 8)) % 40);
          if (y > h + 60 || y < -60) continue;
          const x = hash(i, 1) * (w + 80) - 40 + Math.sin(p.t * 0.6 + i) * 8 - (cam.x - 400) * 0.1;
          const fade = 1 - smooth(unlerp(0.7, 1, alt));
          floatingHeart(
            g,
            x,
            y,
            11 + hash(i, 2) * 10,
            hash(i, 3) < 0.5 ? [255, 120, 190] : [255, 170, 215],
            0.7 * fade,
            p.t + i,
          );
        }
        for (let i = 0; i < 6; i++) {
          const y = place(0.22, -340 - i * 440);
          if (y > h + 90 || y < -90) continue;
          lollipop(g, hash(i, 7) * w, y, 30 + hash(i, 8) * 16, i, 0.55 * (1 - smooth(unlerp(0.65, 0.95, alt))));
        }
        break;
      }
      case 'starry': {
        if (alt > 0.12) {
          aurora(g, w, h, p.t, smooth(unlerp(0.12, 0.45, alt)) * (p.calm ? 0.6 : 1), cam.y);
          const y = place(0.18, -1500);
          if (y > -90 && y < h + 90) ringPlanet(g, w * 0.2, y, 34, 0.9 * smooth(unlerp(0.2, 0.5, alt)));
        }
        if (alt > 0.2 && !p.calm) this.paintComet(p, alt);
        break;
      }
    }
  }

  /** A comet that crosses the sky now and then, slowly, with a long tail. */
  private paintComet(p: Painter, alt: number): void {
    const { w, h } = p;
    const cycle = 11;
    const k = (p.t % cycle) / cycle;
    if (k > 0.45) return;
    const u = k / 0.45;
    const x = lerp(w * 1.1, -w * 0.1, u);
    const y = lerp(h * 0.08, h * 0.5, u);
    const light = p.light;
    const a = Math.sin(u * Math.PI) * smooth(unlerp(0.2, 0.5, alt));
    const dx = w * 0.16;
    const dy = -h * 0.09;
    const grad = light.createLinearGradient(x, y, x + dx, y + dy);
    grad.addColorStop(0, css([220, 240, 255], 0.7 * a));
    grad.addColorStop(1, css([220, 240, 255], 0));
    light.strokeStyle = grad;
    light.lineWidth = 3;
    light.lineCap = 'round';
    light.beginPath();
    light.moveTo(x, y);
    light.lineTo(x + dx, y + dy);
    light.stroke();
    glowAt(light, x, y, 26, [255, 255, 255], a, 'spark');
  }

  /**
   * The colour the playground's greens are washed with to belong to this sky, or nothing for the
   * sunrise, which they already suit.
   */
  private get wash(): RGB | null {
    return this.palette.name === 'sunrise' ? null : this.palette.name === 'candy' ? [255, 150, 214] : [110, 160, 255];
  }

  /**
   * The meadow where she began, behind the mushroom: the hills, the trees, the grass and the
   * bushes. Drawn in the world, below everything else.
   */
  meadowBack(p: Painter, cam: Camera): void {
    if (cam.worldY(p.h, p.h) < GROUND - 150) return;
    const { bank } = this;
    if (!bank) return;
    const g = p.ctx;
    const left = cam.worldX(0, p.w) - 120;
    const right = cam.worldX(p.w, p.w) + 120;
    const wash = this.wash;
    // Hills, far and near. Each is a strip 512 wide that is laid end to end.
    const hill = (name: string, y: number, scale: number, alpha: number): void => {
      const base = bank.sprite('playground', name);
      if (!base) return;
      const pic = wash ? bank.tinted(base, wash, 0.3) : base;
      const width = pic.sw * scale;
      const first = Math.floor((left - 256 * scale) / width) * width;
      g.globalAlpha = alpha;
      for (let x = first; x < right + width; x += width) drawPic(g, pic, x + width / 2, y, { scale: scale * 1.003 });
      g.globalAlpha = 1;
    };
    hill('pg-hills-far-1', GROUND - 40, 0.9, 0.9);
    hill('pg-hills-far-0', GROUND - 24, 0.9, 1);
    for (const prop of this.props) {
      if (prop.id.startsWith('pg-tree') && prop.x > left - 200 && prop.x < right + 200) this.drawProp(g, prop);
    }
    hill('pg-hills-near-1', GROUND - 6, 0.95, 1);
    hill('pg-hills-near-0', GROUND + 12, 0.95, 1);
    // The grass in front of the near hills, as a flat band that runs off the bottom of the screen.
    const grass = this.palette.hills[2];
    const band = g.createLinearGradient(0, GROUND + 20, 0, GROUND + 250);
    band.addColorStop(0, css(mix(grass, this.palette.hills[1], 0.4)));
    band.addColorStop(1, css(grass));
    g.fillStyle = band;
    g.fillRect(left, GROUND + 28, right - left, 900);
    for (const prop of this.props) {
      if (prop.y < GROUND + 20 && !prop.id.startsWith('pg-tree') && prop.x > left - 60 && prop.x < right + 60)
        this.drawProp(g, prop);
    }
  }

  /** The flowers and tufts of the meadow that stand in front of the mushroom. */
  meadowFront(p: Painter, cam: Camera): void {
    if (!this.bank || cam.worldY(p.h, p.h) < GROUND - 150) return;
    const left = cam.worldX(0, p.w) - 60;
    const right = cam.worldX(p.w, p.w) + 60;
    for (const prop of this.props) {
      if (prop.y >= GROUND + 20 && !prop.id.startsWith('pg-tree') && prop.x > left && prop.x < right)
        this.drawProp(p.ctx, prop);
    }
  }

  private drawProp(g: CanvasRenderingContext2D, prop: { id: string; x: number; y: number; s: number }): void {
    const bank = this.bank!;
    const pic = bank.sprite('playground', prop.id);
    if (!pic) return;
    const wash = this.wash;
    drawPic(g, wash ? bank.tinted(pic, wash, 0.18) : pic, prop.x, prop.y, { scale: prop.s });
  }

  /** Long thin lines that rush past when she is fast, so she can feel it. */
  paintFront(p: Painter, speed: number): void {
    if (p.calm) return;
    const strength = clamp((speed - 520) / 700) * 0.55;
    if (strength < 0.02) return;
    const g = p.ctx;
    const { w, h } = p;
    g.lineCap = 'round';
    g.lineWidth = 1.8;
    for (let i = 0; i < 18; i++) {
      const rate = 0.9 + hash(i, 61) * 1.1;
      const u = (hash(i, 62) + p.t * rate * 1.8) % 1;
      const x = w * hash(i, 63);
      const len = 90 + hash(i, 64) * 170;
      const y = h * (1.2 - u * 1.6) + len;
      g.strokeStyle = css(lighten(this.palette.glow, 0.5), strength * (0.3 + 0.5 * hash(i, 65)));
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - len);
      g.stroke();
    }
  }
}

/** A rainbow, large and faint, across the sky. `r` is its outer radius. */
function rainbow(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number): void {
  if (alpha < 0.01) return;
  const band = r * 0.04;
  g.lineCap = 'butt';
  for (let i = 0; i < RAINBOW.length; i++) {
    g.strokeStyle = css(lighten(RAINBOW[i]!, 0.25), alpha);
    g.lineWidth = band + 0.5;
    g.beginPath();
    g.arc(cx, cy, r - i * band, Math.PI * 1.04, Math.PI * 1.96);
    g.stroke();
  }
}

function floatingHeart(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: RGB,
  alpha: number,
  t: number,
): void {
  if (alpha < 0.02) return;
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 0.9) * 0.14);
  g.globalAlpha = alpha;
  g.fillStyle = css(color);
  g.beginPath();
  g.moveTo(0, size * 0.9);
  g.bezierCurveTo(-size * 1.5, size * 0.1, -size * 0.7, -size * 0.9, 0, -size * 0.25);
  g.bezierCurveTo(size * 0.7, -size * 0.9, size * 1.5, size * 0.1, 0, size * 0.9);
  g.fill();
  g.fillStyle = css([255, 255, 255], 0.55);
  g.beginPath();
  g.ellipse(-size * 0.45, -size * 0.2, size * 0.22, size * 0.13, -0.7, 0, TAU);
  g.fill();
  // The string.
  g.strokeStyle = css([255, 255, 255], 0.55);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, size * 0.9);
  g.quadraticCurveTo(size * 0.3, size * 1.6, -size * 0.1, size * 2.3);
  g.stroke();
  g.restore();
}

function lollipop(g: CanvasRenderingContext2D, x: number, y: number, r: number, i: number, alpha: number): void {
  if (alpha < 0.02) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(-0.25 + hash(i, 9) * 0.5);
  g.fillStyle = css([255, 255, 255], 0.9);
  g.fillRect(-1.5, 0, 3, r * 2.3);
  const pink: RGB = hash(i, 10) < 0.5 ? [255, 130, 196] : [186, 150, 255];
  g.fillStyle = css(pink);
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.strokeStyle = css([255, 255, 255], 0.85);
  g.lineWidth = Math.max(2, r * 0.13);
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < TAU * 2.6; a += 0.2) {
    const rr = (a / (TAU * 2.6)) * r * 0.86;
    if (a === 0) g.moveTo(0, 0);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.stroke();
  g.restore();
}

/** A planet with a ring, far off in the night. */
function ringPlanet(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  if (alpha < 0.02) return;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.rotate(-0.35);
  const back = (): void => {
    g.strokeStyle = css([190, 170, 255], 0.75);
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0, TAU);
    g.stroke();
  };
  back();
  const body = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, css([255, 214, 236]));
  body.addColorStop(1, css([158, 118, 226]));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  // The near half of the ring crosses in front.
  g.strokeStyle = css([210, 196, 255], 0.95);
  g.lineWidth = r * 0.12;
  g.beginPath();
  g.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0.05, Math.PI - 0.05);
  g.stroke();
  g.restore();
}

/** Ribbons of green and violet light that sway across the night sky. */
function aurora(g: CanvasRenderingContext2D, w: number, h: number, t: number, alpha: number, camY: number): void {
  if (alpha < 0.02) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const tones: readonly RGB[] = [
    [90, 255, 190],
    [150, 130, 255],
    [90, 200, 255],
  ];
  for (let k = 0; k < tones.length; k++) {
    const tone = tones[k]!;
    const base = h * (0.2 + k * 0.1) - camY * 0.012;
    const grad = g.createLinearGradient(0, base - 70, 0, base + 60);
    grad.addColorStop(0, css(tone, 0));
    grad.addColorStop(0.45, css(tone, 0.2 * alpha));
    grad.addColorStop(1, css(tone, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, base + 80);
    for (let x = 0; x <= w + 20; x += 24) {
      const y = base + Math.sin(x * 0.012 + t * (0.3 + k * 0.1) + k * 2) * 26 + Math.sin(x * 0.027 - t * 0.4) * 9;
      g.lineTo(x, y);
    }
    g.lineTo(w + 20, base + 90);
    g.closePath();
    g.fill();
  }
  g.restore();
}
