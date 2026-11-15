import { Rng } from '../../../domain/rng';
import { css, darken, lighten, mix, RAINBOW, type RGB } from '../../engine/color';
import { clamp, hump, TAU } from '../../engine/ease';
import { addRoundedRect, glowAt, makeCloud, prerender } from '../../engine/paint';
import type { Palette } from './palette';
import type { Cloud, CloudKind } from './world';

/**
 * The clouds she stands on. Each kind is painted once into a canvas, as a row of round lumps lit
 * from above, with its own colours and the little picture on its belly that says what it does, and
 * is then only stamped. What moves (its face, its nightcap, its rainbow, its wobble) is drawn over
 * the stamp, so a cloud is as cheap as a picture and as alive as a toy.
 */

/** The size of a drawing before a cloud is made wider or narrower, in units. */
export const W0 = 150;
const H0 = 84;
/** How far below the top of a drawing her hooves are, so she stands in the fluff and not on it. */
export const STAND = 11;
/** Room round a drawing for its glow. */
const PAD = 12;

const INK: RGB = [74, 47, 90];

interface Lump {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** The colours of a cloud. */
interface Skin {
  readonly top: RGB;
  readonly body: RGB;
  readonly belly: RGB;
}

const SKINS: Readonly<Partial<Record<CloudKind, Skin>>> = {
  jelly: { top: [247, 238, 255], body: [214, 186, 255], belly: [158, 116, 226] },
  heart: { top: [255, 246, 250], body: [255, 214, 232], belly: [236, 138, 182] },
  music: { top: [255, 253, 238], body: [255, 238, 188], belly: [226, 172, 106] },
  sleepy: { top: [238, 242, 255], body: [198, 210, 244], belly: [138, 150, 212] },
  star: { top: [255, 253, 228], body: [255, 238, 156], belly: [230, 182, 86] },
  friend: { top: [255, 255, 255], body: [255, 228, 240], belly: [240, 158, 200] },
};

/** How many lumps a drawing has, and so how bumpy it is. */
const BUMPS: Readonly<Partial<Record<CloudKind, number>>> = {
  plain: 6,
  rainbow: 7,
  jelly: 5,
  heart: 6,
  music: 6,
  sleepy: 5,
  star: 6,
  friend: 7,
};

function lumpsOf(rng: Rng, bumps: number): Lump[] {
  const belly = H0 - 10;
  const lumps: Lump[] = [];
  for (let i = 0; i < bumps; i++) {
    const u = (i + 0.5) / bumps;
    const swell = Math.sin(u * Math.PI) ** 0.85;
    const r = H0 * (0.19 + 0.2 * swell) * rng.range(0.9, 1.1);
    const x = W0 * (0.13 + 0.74 * u) + rng.range(-0.02, 0.02) * W0;
    const y = belly - r * rng.range(0.82, 1.02) - H0 * 0.06;
    lumps.push({ x, y, r });
  }
  return lumps;
}

function silhouette(g: CanvasRenderingContext2D, lumps: readonly Lump[]): void {
  g.beginPath();
  for (const l of lumps) {
    g.moveTo(l.x + l.r, l.y);
    g.arc(l.x, l.y, l.r, 0, TAU);
  }
  addRoundedRect(g, W0 * 0.06, H0 * 0.52, W0 * 0.88, H0 * 0.48, 11);
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  g.beginPath();
  g.moveTo(x, y + size * 0.9);
  g.bezierCurveTo(x - size * 1.5, y + size * 0.1, x - size * 0.7, y - size * 0.9, x, y - size * 0.25);
  g.bezierCurveTo(x + size * 0.7, y - size * 0.9, x + size * 1.5, y + size * 0.1, x, y + size * 0.9);
  g.closePath();
}

function star5(g: CanvasRenderingContext2D, x: number, y: number, r: number, spin = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = spin + (i / 10) * TAU;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** The little picture on the belly of a cloud that does something. */
function emblem(g: CanvasRenderingContext2D, kind: CloudKind, skin: Skin): void {
  const x = W0 / 2;
  const y = H0 * 0.7;
  g.save();
  g.globalAlpha = 0.9;
  if (kind === 'heart') {
    g.fillStyle = css([255, 118, 156]);
    heart(g, x, y - 1, 9);
    g.fill();
    g.fillStyle = css([255, 255, 255], 0.65);
    g.beginPath();
    g.ellipse(x - 5, y - 6, 2.6, 1.5, -0.7, 0, TAU);
    g.fill();
  } else if (kind === 'music') {
    g.fillStyle = css(darken(skin.belly, 0.28));
    g.strokeStyle = css(darken(skin.belly, 0.28));
    g.lineWidth = 2.2;
    for (const dx of [-9, 6]) {
      g.beginPath();
      g.ellipse(x + dx, y + 4, 4.6, 3.4, -0.4, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(x + dx + 3.8, y + 3);
      g.lineTo(x + dx + 3.8, y - 11);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x - 5.2, y - 11);
    g.lineTo(x + 9.8, y - 14);
    g.lineWidth = 3.4;
    g.stroke();
  } else if (kind === 'star') {
    g.fillStyle = css([255, 214, 92]);
    star5(g, x, y, 10.5);
    g.fill();
    g.strokeStyle = css([214, 150, 40], 0.7);
    g.lineWidth = 1.2;
    g.lineJoin = 'round';
    g.stroke();
  } else if (kind === 'friend') {
    g.fillStyle = css([255, 118, 156]);
    heart(g, x - 18, y, 5.5);
    g.fill();
    heart(g, x + 18, y, 5.5);
    g.fill();
  }
  g.restore();
}

function paintDrawing(rng: Rng, kind: CloudKind, palette: Palette): HTMLCanvasElement {
  const skin: Skin = SKINS[kind] ?? palette.cloud;
  const lumps = lumpsOf(rng, BUMPS[kind] ?? 6);
  return prerender(W0 + PAD * 2, H0 + PAD * 2, (g) => {
    g.translate(PAD, PAD);
    // The soft ring round it, so it can be told from a sky of nearly its own colour.
    g.save();
    g.shadowColor = css(mix(skin.belly, palette.glow, 0.35), 0.55);
    g.shadowBlur = 8;
    g.fillStyle = css(skin.belly);
    silhouette(g, lumps);
    g.fill();
    g.restore();

    // The flat belly, which goes from the colour of the body down to the shade.
    const base = g.createLinearGradient(0, H0 * 0.5, 0, H0);
    base.addColorStop(0, css(skin.body));
    base.addColorStop(1, css(skin.belly));
    g.fillStyle = base;
    g.beginPath();
    addRoundedRect(g, W0 * 0.06, H0 * 0.52, W0 * 0.88, H0 * 0.48, 11);
    g.fill();

    // The lumps, the smallest first so each bigger one overlaps its neighbours, each lit from above
    // and to the left.
    const order = [...lumps].sort((a, b) => a.r - b.r);
    for (const l of order) {
      const lit = g.createRadialGradient(l.x - l.r * 0.22, l.y - l.r * 0.5, l.r * 0.08, l.x, l.y, l.r * 1.04);
      lit.addColorStop(0, css(skin.top));
      lit.addColorStop(0.5, css(mix(skin.top, skin.body, 0.6)));
      lit.addColorStop(1, css(mix(skin.body, skin.belly, 0.5)));
      g.fillStyle = lit;
      g.beginPath();
      g.arc(l.x, l.y, l.r, 0, TAU);
      g.fill();
      g.strokeStyle = css(lighten(skin.top, 0.5), 0.9);
      g.lineWidth = 1.5;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(l.x, l.y, l.r - 0.8, Math.PI * 1.06, Math.PI * 1.94);
      g.stroke();
    }

    // The shade under all of it, so the belly is darker than the back whatever lumps are in front.
    g.save();
    silhouette(g, lumps);
    g.clip();
    const shade = g.createLinearGradient(0, H0 * 0.42, 0, H0);
    shade.addColorStop(0, css(skin.belly, 0));
    shade.addColorStop(1, css(darken(skin.belly, 0.08), 0.72));
    g.fillStyle = shade;
    g.fillRect(-4, 0, W0 + 8, H0 + 4);
    g.restore();

    if (kind === 'jelly') {
      // A cloud of jelly: glossy, with bubbles in it.
      g.fillStyle = css([255, 255, 255], 0.55);
      g.beginPath();
      g.ellipse(W0 * 0.3, H0 * 0.2, 16, 4.2, -0.42, 0, TAU);
      g.fill();
      g.strokeStyle = css([255, 255, 255], 0.5);
      g.lineWidth = 1.2;
      for (const [bx, by, br] of [
        [0.62, 0.64, 4.5],
        [0.74, 0.74, 3],
        [0.36, 0.72, 3.4],
      ] as const) {
        g.beginPath();
        g.arc(W0 * bx, H0 * by, br, 0, TAU);
        g.stroke();
      }
    }
    emblem(g, kind, skin);
  });
}

/** What a face is doing. */
export interface Face {
  /** 0 is a blank cloud, 1 is as happy as it gets. */
  joy: number;
  /** Fast asleep: eyes shut, and a nightcap. */
  asleep: boolean;
  /** 0 to 1, how much it is laughing. */
  giggle: number;
  /** Seconds, for the blink. */
  time: number;
}

/**
 * A cloud's face, on the front of its belly. `s` is how much bigger or smaller than the drawing the
 * cloud is.
 */
export function paintFace(g: CanvasRenderingContext2D, x: number, y: number, s: number, f: Face): void {
  if (f.joy < 0.02 && !f.asleep) return;
  const alpha = f.asleep ? 0.9 : 0.3 + 0.7 * clamp(f.joy);
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  g.strokeStyle = css(INK);
  g.fillStyle = css(INK);
  const eyeY = 33;
  const spread = 15;
  if (f.asleep) {
    g.lineWidth = 1.9;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(sx * spread, eyeY - 2, 4.4, Math.PI * 0.12, Math.PI * 0.88);
      g.stroke();
    }
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, eyeY + 8, 3.4, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  } else if (f.giggle > 0.08) {
    // Laughing: the eyes are two arches, and the mouth is open.
    g.lineWidth = 2;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(sx * spread, eyeY + 2.5, 4.6, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-6.4, eyeY + 8);
    g.quadraticCurveTo(0, eyeY + 8 + 14 * clamp(f.giggle + 0.3, 0, 1), 6.4, eyeY + 8);
    g.closePath();
    g.fill();
    g.fillStyle = css([255, 128, 150]);
    g.beginPath();
    g.ellipse(0, eyeY + 15, 3.2, 2, 0, 0, TAU);
    g.fill();
  } else {
    // Awake and content: two round eyes that blink every few seconds, and a small smile.
    const phase = (f.time * 0.27 + ((x * 0.013) % 1)) % 1;
    const blink = phase > 0.96 ? 0.12 : 1;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(sx * spread, eyeY, 3.3, 4.3 * blink, 0, 0, TAU);
      g.fill();
      if (blink > 0.5) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(sx * spread + 1.1, eyeY - 1.6, 1.15, 0, TAU);
        g.fill();
        g.fillStyle = css(INK);
      }
    }
    g.lineWidth = 1.7;
    g.beginPath();
    g.arc(0, eyeY + 4.5, 4.8, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }
  // Pink cheeks.
  g.fillStyle = css([255, 140, 170], 0.5 * clamp(0.4 + f.joy));
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * (spread + 10), eyeY + 6.5, 5.4, 3.2, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}

/**
 * A blue nightcap with a white pom-pom, on the shoulder of a cloud that is asleep. `wake` is how
 * far it has flown off, from 0.
 */
export function paintCap(g: CanvasRenderingContext2D, x: number, y: number, s: number, tilt: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.scale(s, s);
  g.fillStyle = css([96, 120, 214]);
  g.beginPath();
  g.moveTo(-14, 0);
  g.quadraticCurveTo(-8, -22, 12, -26);
  g.quadraticCurveTo(14, -20, 15, 0);
  g.closePath();
  g.fill();
  g.fillStyle = css([255, 255, 255]);
  g.beginPath();
  addRoundedRect(g, -16, -3, 33, 7, 3.5);
  g.fill();
  g.beginPath();
  g.arc(13, -27, 5, 0, TAU);
  g.fill();
  g.fillStyle = css([255, 255, 255], 0.5);
  for (const [dx, dy] of [
    [-4, -12],
    [3, -17],
    [7, -8],
  ] as const) {
    g.beginPath();
    g.arc(dx, dy, 1.4, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** The sleeper's Zs, rising from it one after the other. */
export function paintZs(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  g.save();
  g.font = `700 ${13 * s}px Fredoka, ui-rounded, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.35 + i / 3) % 1;
    const a = hump(u) * 0.85;
    g.globalAlpha = a;
    const size = (0.7 + u * 0.55) * 13 * s;
    g.font = `700 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
    const px = x + (u * 22 + Math.sin(u * TAU) * 3) * s;
    const py = y - u * 40 * s;
    g.lineWidth = 2.6 * s;
    g.strokeStyle = css([255, 255, 255], 0.9);
    g.strokeText('z', px, py);
    g.fillStyle = css([120, 138, 220]);
    g.fillText('z', px, py);
  }
  g.restore();
}

/**
 * A rainbow that rises out of a cloud and arches over it, seven bands, with a shimmer that runs
 * along it. `grow` is how much of it there is, from 0 to 1, which is how the cloud shows it has
 * been woken.
 */
export function paintArch(
  g: CanvasRenderingContext2D,
  light: CanvasRenderingContext2D | null,
  x: number,
  y: number,
  width: number,
  t: number,
  grow: number,
): void {
  if (grow <= 0.01) return;
  const outer = width * 0.62;
  const band = Math.max(3.4, width * 0.034);
  g.save();
  g.lineCap = 'butt';
  const sweep = Math.PI * clamp(grow);
  for (let i = 0; i < RAINBOW.length; i++) {
    const r = outer - i * band;
    g.strokeStyle = css(lighten(RAINBOW[i]!, 0.2), 0.8);
    g.lineWidth = band + 0.6;
    g.beginPath();
    g.arc(x, y + band * 3, r, Math.PI + (Math.PI - sweep) / 2, Math.PI * 2 - (Math.PI - sweep) / 2);
    g.stroke();
  }
  g.restore();
  if (light && grow > 0.5) {
    // A glint that runs from one end to the other.
    const a = Math.PI + ((t * 0.55) % 1.6) * Math.PI;
    if (a < Math.PI * 2)
      glowAt(
        light,
        x + Math.cos(a) * (outer - band * 3),
        y + band * 3 + Math.sin(a) * (outer - band * 3),
        26,
        [255, 255, 255],
        0.55 * grow,
      );
  }
}

/** All the clouds of one sky: every kind in two drawings, and a handful of far-off ones. */
export class CloudArt {
  private readonly drawings = new Map<string, HTMLCanvasElement>();
  private readonly distant: { readonly image: HTMLCanvasElement; readonly w: number; readonly h: number }[] = [];

  constructor(
    private readonly palette: Palette,
    private readonly rng: Rng,
  ) {
    // Far clouds: four, flatter and nearer the colour of the sky.
    for (let i = 0; i < 4; i++) {
      const w = 220 + i * 40;
      const h = w * 0.34;
      this.distant.push({
        image: makeCloud(w, h, new Rng(rng.int(0x7fffffff)), palette.far.top, palette.far.belly, 5 + (i % 3)),
        w,
        h,
      });
    }
  }

  /** The drawing for a cloud, made the first time it is asked for. */
  of(cloud: Cloud): HTMLCanvasElement | null {
    if (cloud.kind === 'mushroom' || cloud.kind === 'gate') return null;
    const kind = cloud.kind === 'friend' ? 'friend' : cloud.kind;
    const key = `${kind}:${cloud.drawing}`;
    let image = this.drawings.get(key);
    if (!image) {
      image = paintDrawing(new Rng(this.rng.int(0x7fffffff)), kind, this.palette);
      this.drawings.set(key, image);
    }
    return image;
  }

  far(i: number): { readonly image: HTMLCanvasElement; readonly w: number; readonly h: number } {
    return this.distant[((i % this.distant.length) + this.distant.length) % this.distant.length]!;
  }
}

/** Draws a cloud's drawing with its standing line at (x, y). */
export function stampCloud(
  g: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  sx = 1,
  sy = 1,
): void {
  const s = width / W0;
  const w = (W0 + PAD * 2) * s * sx;
  const h = (H0 + PAD * 2) * s * sy;
  g.drawImage(image, x - w / 2, y - (STAND + PAD) * s * sy, w, h);
}
