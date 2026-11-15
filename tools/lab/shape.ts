import { css } from '../../src/wonder/engine/color';
import { CONSTELLATIONS, mirror } from '../../src/wonder/games/cannon/constellations';
import { dressOf } from '../../src/wonder/games/cannon/dress';
import { paintSleeper } from '../../src/wonder/games/cannon/figures';
import { GLOW_ROOM, silhouette } from '../../src/wonder/games/cannon/silhouette';

/**
 * One constellation as it looks when every star is awake, at the size it is given, with the shape
 * of light behind it. `?look=star|heart&w=640&flip=1&shape=0.6&numbers=1&lines=1`. The
 * picture-design tool: change a point, reload, look.
 */
const q = new URLSearchParams(location.search);
const look = q.get('look') ?? 'star';
const W = Number(q.get('w') ?? 640);
const flipped = q.get('flip') === '1';
const shape = Number(q.get('shape') ?? 0.6);
const dress = dressOf(look);
const base = CONSTELLATIONS[look] ?? CONSTELLATIONS.star!;
const picture = flipped ? mirror(base) : base;
const margin = Math.round(W * 0.1);
const width = W + margin * 2;
const height = Math.round(W * picture.aspect) + margin * 2;

const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
const g = canvas.getContext('2d')!;
const sky = g.createLinearGradient(0, 0, 0, height);
for (const [at, c] of dress.sky) sky.addColorStop(at, css(c));
g.fillStyle = sky;
g.fillRect(0, 0, width, height);

g.translate(margin, margin);
const art = silhouette(base.name, dress, W, base.aspect, flipped);
if (shape > 0) {
  g.globalAlpha = shape;
  const pad = GLOW_ROOM * W;
  g.drawImage(art, -pad, -pad, W + pad * 2, W * base.aspect + pad * 2);
  g.globalAlpha = 1;
}
const at = (i: number): { x: number; y: number } => ({ x: picture.points[i]!.x * W, y: picture.points[i]!.y * W });
if (q.get('lines') !== '0') {
  g.strokeStyle = css(dress.line, 0.9);
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  for (const [a, b] of picture.lines) {
    g.beginPath();
    g.moveTo(at(a).x, at(a).y);
    g.lineTo(at(b).x, at(b).y);
    g.stroke();
  }
}
if (q.get('stars') !== '0') {
  const r = picture.starShare * W;
  picture.points.forEach((_, i) => {
    const p = at(i);
    paintSleeper(g, dress, {
      x: p.x,
      y: p.y,
      r,
      open: 1,
      pop: 1,
      tilt: 0,
      blink: 0,
      breath: 0,
      cap: 0,
      capColor: dress.caps[0]!,
      shine: 0,
    });
  });
}
if (q.get('numbers') === '1') {
  g.font = '600 12px system-ui';
  g.textAlign = 'center';
  g.fillStyle = '#102';
  picture.points.forEach((_, i) => {
    g.fillText(String(i), at(i).x, at(i).y + 4);
  });
}
let nearest = Infinity;
picture.points.forEach((_, i) => {
  for (let j = i + 1; j < picture.points.length; j++)
    nearest = Math.min(nearest, Math.hypot(at(i).x - at(j).x, at(i).y - at(j).y) / W);
});
document.title = `nearest ${nearest.toFixed(3)} (need ${(2 * picture.starShare).toFixed(3)})`;
