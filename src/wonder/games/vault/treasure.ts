import type { RainPieceId } from '../../../content/rain';
import type { Pic } from '../../engine/bank';
import { css, darken, lighten, mix, type RGB } from '../../engine/color';
import { TAU } from '../../engine/ease';
import { gemImage, pictureOfStone } from '../../engine/gems';
import { prerender, roundedRect } from '../../engine/paint';

/**
 * The treasure itself, drawn in code and kept: six stones, a gold coin, a gold bar and three
 * banknotes. Each is drawn once into a picture of 64 by 64 units, held by its middle, so it is as
 * sharp on a big screen as on a small one. A coin turns as it falls, and the rest tumble; that is
 * the game's to do, and this only has the pictures.
 */

const GEM_COLORS: Readonly<Record<'ruby' | 'sapphire' | 'emerald' | 'amethyst' | 'topaz' | 'diamond', RGB>> = {
  ruby: [232, 44, 74],
  sapphire: [70, 132, 255],
  emerald: [58, 200, 116],
  amethyst: [168, 98, 236],
  topaz: [255, 208, 48],
  diamond: [206, 236, 255],
};

const GOLD: RGB = [255, 196, 48];
const NOTE_COLORS: Readonly<Record<'note-mint' | 'note-lilac' | 'note-peach', RGB>> = {
  'note-mint': [112, 214, 158],
  'note-lilac': [178, 148, 236],
  'note-peach': [255, 172, 138],
};

const cache = new Map<RainPieceId, HTMLCanvasElement>();
const pics = new Map<RainPieceId, Pic>();

/** The picture of a piece. */
function treasureImage(id: RainPieceId): HTMLCanvasElement {
  let image = cache.get(id);
  if (image) return image;
  if (id in GEM_COLORS) image = gemImage(GEM_COLORS[id as keyof typeof GEM_COLORS]);
  else if (id === 'coin') image = prerender(64, 64, paintCoin, 3);
  else if (id === 'bar') image = prerender(64, 64, paintBar, 3);
  else image = prerender(64, 64, (g) => paintNote(g, NOTE_COLORS[id as keyof typeof NOTE_COLORS]), 3);
  cache.set(id, image);
  return image;
}

/** The same picture as a particle can be. */
export function treasurePic(id: RainPieceId): Pic {
  let pic = pics.get(id);
  if (!pic) {
    pic = pictureOfStone(treasureImage(id));
    pics.set(id, pic);
  }
  return pic;
}

/** Lets go of the pictures. The stones belong to the engine, which lets go of its own. */
export function forgetTreasure(): void {
  cache.clear();
  pics.clear();
}

/**
 * Draws a piece with its middle at (x, y), `size` units wide. `squeeze` is how much of its width it
 * shows, 1 flat to you and near 0 edge on, for a coin that is turning.
 */
export function drawTreasure(
  g: CanvasRenderingContext2D,
  id: RainPieceId,
  x: number,
  y: number,
  size: number,
  turn = 0,
  squeeze = 1,
  alpha = 1,
): void {
  if (alpha <= 0.003) return;
  const image = treasureImage(id);
  const before = g.globalAlpha;
  g.globalAlpha = before * Math.min(1, alpha);
  g.save();
  g.translate(x, y);
  if (turn) g.rotate(turn);
  if (squeeze !== 1) g.scale(squeeze, 1);
  g.drawImage(image, -size / 2, -size / 2, size, size);
  g.restore();
  g.globalAlpha = before;
}

/**
 * A coin seen square on: a rim, a raised ring inside it, a star pressed into the middle, and a
 * glint.
 */
function paintCoin(g: CanvasRenderingContext2D): void {
  const cx = 32;
  const cy = 32;
  const rim = g.createLinearGradient(8, 6, 56, 58);
  rim.addColorStop(0, css(lighten(GOLD, 0.55)));
  rim.addColorStop(0.5, css(GOLD));
  rim.addColorStop(1, css(darken(GOLD, 0.38)));
  g.fillStyle = rim;
  g.beginPath();
  g.arc(cx, cy, 28, 0, TAU);
  g.fill();
  g.strokeStyle = css(darken(GOLD, 0.5));
  g.lineWidth = 1.6;
  g.stroke();
  const face = g.createRadialGradient(26, 24, 2, cx, cy, 24);
  face.addColorStop(0, css(lighten(GOLD, 0.4)));
  face.addColorStop(1, css(darken(GOLD, 0.12)));
  g.fillStyle = face;
  g.beginPath();
  g.arc(cx, cy, 23, 0, TAU);
  g.fill();
  g.strokeStyle = css(darken(GOLD, 0.34), 0.8);
  g.lineWidth = 1.4;
  g.stroke();
  // A star pressed in: dark below and light above, so that it stands out of the face.
  for (const [dx, dy, tone] of [
    [0.7, 0.9, darken(GOLD, 0.45)],
    [-0.5, -0.6, lighten(GOLD, 0.7)],
    [0, 0, darken(GOLD, 0.18)],
  ] as const) {
    g.fillStyle = css(tone);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 13 : 5.4;
      const x = cx + dx + Math.cos(a) * r;
      const y = cy + dy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, 25.5, Math.PI * 1.12, Math.PI * 1.42);
  g.stroke();
}

/**
 * A bar of gold, a little from above: its top, its front and its end, with a stamp on the front.
 */
function paintBar(g: CanvasRenderingContext2D): void {
  const top = [
    [14, 20],
    [52, 20],
    [58, 30],
    [8, 30],
  ] as const;
  const front = [
    [8, 30],
    [58, 30],
    [54, 50],
    [12, 50],
  ] as const;
  const poly = (pts: readonly (readonly [number, number])[], fill: string | CanvasGradient): void => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => {
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    });
    g.closePath();
    g.fill();
  };
  g.save();
  g.shadowColor = 'rgba(80,40,0,0.3)';
  g.shadowBlur = 3;
  g.shadowOffsetY = 2;
  poly(front, css(darken(GOLD, 0.2)));
  g.restore();
  const body = g.createLinearGradient(0, 30, 0, 50);
  body.addColorStop(0, css(lighten(GOLD, 0.05)));
  body.addColorStop(1, css(darken(GOLD, 0.34)));
  poly(front, body);
  const lid = g.createLinearGradient(8, 20, 58, 30);
  lid.addColorStop(0, css(lighten(GOLD, 0.7)));
  lid.addColorStop(1, css(lighten(GOLD, 0.22)));
  poly(top, lid);
  g.strokeStyle = css(darken(GOLD, 0.5));
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  g.beginPath();
  [...top, top[0]].forEach(([x, y], i) => {
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  });
  g.stroke();
  g.beginPath();
  [...front, front[0]].forEach(([x, y], i) => {
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  });
  g.stroke();
  // The stamp: a small star pressed into the top and a line pressed into the front.
  g.fillStyle = css(darken(GOLD, 0.3), 0.8);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 4.4 : 1.9;
    const x = 33 + Math.cos(a) * r;
    const y = 25 + Math.sin(a) * r * 0.62;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = css(darken(GOLD, 0.4), 0.7);
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(20, 40);
  g.lineTo(46, 40);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(14, 33);
  g.lineTo(26, 33);
  g.stroke();
}

/**
 * A banknote: a coloured note with a cream border, a round seal with a star, and a pattern at its
 * corners.
 */
function paintNote(g: CanvasRenderingContext2D, color: RGB): void {
  const x = 5;
  const y = 14;
  const w = 54;
  const h = 36;
  g.save();
  g.shadowColor = 'rgba(40,20,70,0.3)';
  g.shadowBlur = 3;
  g.shadowOffsetY = 2;
  g.fillStyle = css(mix(color, [255, 250, 232], 0.7));
  roundedRect(g, x, y, w, h, 4);
  g.fill();
  g.restore();
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, css(lighten(color, 0.22)));
  body.addColorStop(1, css(darken(color, 0.16)));
  g.fillStyle = body;
  roundedRect(g, x + 3.5, y + 3.5, w - 7, h - 7, 2.5);
  g.fill();
  g.strokeStyle = css(darken(color, 0.34), 0.7);
  g.lineWidth = 1.1;
  g.stroke();
  // Fine lines across, like the engraving of a real note.
  g.strokeStyle = css(lighten(color, 0.45), 0.5);
  g.lineWidth = 0.8;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(x + 7, y + 5 + i * 4.3);
    g.lineTo(x + 20, y + 5 + i * 4.3);
    g.moveTo(x + w - 20, y + 5 + i * 4.3);
    g.lineTo(x + w - 7, y + 5 + i * 4.3);
    g.stroke();
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.fillStyle = css(mix(color, [255, 250, 232], 0.82));
  g.beginPath();
  g.arc(cx, cy, 10.5, 0, TAU);
  g.fill();
  g.strokeStyle = css(darken(color, 0.34), 0.85);
  g.lineWidth = 1.3;
  g.stroke();
  g.fillStyle = css(darken(color, 0.28));
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 7 : 3;
    if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.fillStyle = css(darken(color, 0.3), 0.8);
  for (const [dx, dy] of [
    [9, 9],
    [w - 9, 9],
    [9, h - 9],
    [w - 9, h - 9],
  ] as const) {
    g.beginPath();
    g.arc(x + dx, y + dy, 1.8, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x + 7, y + 5);
  g.lineTo(x + w - 12, y + 5);
  g.stroke();
}
