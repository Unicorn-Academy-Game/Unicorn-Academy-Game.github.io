import { COLORS, css, lighten, mix } from '../../engine/color';
import { TAU, wrap } from '../../engine/ease';
import { glowAt, prerender } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import type { Plan } from './layout';
import type { Spot } from './lights';
import { sharp } from './world-art';

/**
 * The mirror ball: a sphere of small mirrors that turns slowly, throws spots of coloured light that
 * wander over the floor, and glints. It is drawn as twelve pictures of itself, one for each step of
 * its turn between one column of mirrors and the next, so that turning is only a matter of choosing
 * one.
 */

const FRAMES = 12;
const COLUMNS = 14;
const ROWS = 9;

/** Light comes from above and to the left, a little toward you. */
const TOWARD = (() => {
  const v = [-0.5, -0.62, 0.6] as const;
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n] as const;
})();

/** A number from 0 to 1 that comes out of two others the same way every time. */
const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class BallArt {
  private frames: HTMLCanvasElement[] = [];
  private key = '';
  private plan: Plan | null = null;

  place(plan: Plan, k: number): void {
    this.plan = plan;
    const r = plan.ball.r;
    const key = `${r.toFixed(1)}|${sharp(k)}`;
    if (key === this.key) return;
    this.key = key;
    this.frames = Array.from({ length: FRAMES }, (_, i) =>
      prerender(r * 2 + 4, r * 2 + 4, (g) => this.paintFrame(g, r, i), sharp(k)),
    );
  }

  /** The ball turned `i` twelfths of the way from one column of mirrors to the next. */
  private paintFrame(g: CanvasRenderingContext2D, r: number, i: number): void {
    const turn = (i / FRAMES) * (TAU / COLUMNS);
    const tilt = 0.28;
    g.translate(r + 2, r + 2);
    // The dark of the ball behind its mirrors.
    g.fillStyle = css([30, 28, 56]);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    const facets: { path: [number, number][]; shade: number; z: number; tone: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      const lat0 = -Math.PI / 2 + (row / ROWS) * Math.PI;
      const lat1 = -Math.PI / 2 + ((row + 1) / ROWS) * Math.PI;
      for (let col = 0; col < COLUMNS; col++) {
        const lon0 = turn + (col / COLUMNS) * TAU;
        const lon1 = turn + ((col + 1) / COLUMNS) * TAU;
        const corners: [number, number][] = [];
        let facing = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (const [lat, lon] of [
          [lat0, lon0],
          [lat0, lon1],
          [lat1, lon1],
          [lat1, lon0],
        ] as const) {
          // On the sphere, then tipped toward you by the tilt, then flattened onto the picture.
          const x = Math.cos(lat) * Math.sin(lon);
          const y0 = Math.sin(lat);
          const z0 = Math.cos(lat) * Math.cos(lon);
          const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
          const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
          corners.push([x * r, y * r]);
          facing += z;
          nx += x;
          ny += y;
          nz += z;
        }
        if (facing <= 0.2) continue;
        const len = Math.hypot(nx, ny, nz) || 1;
        const lit = Math.max(0, (nx * TOWARD[0] + ny * TOWARD[1] + nz * TOWARD[2]) / len);
        // Which mirror it is does not change as the ball turns, so each keeps its own tone.
        const id = row * COLUMNS + ((col + 0) % COLUMNS);
        facets.push({ path: corners, shade: lit, z: facing, tone: hash(id, 3) });
      }
    }
    for (const f of facets) {
      const base = mix([120, 126, 170], [226, 232, 255], f.tone * 0.8);
      const colour = mix([34, 32, 74], base, 0.25 + 0.75 * f.shade);
      g.fillStyle = css(colour);
      g.beginPath();
      f.path.forEach(([x, y], n) => {
        n === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      });
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(14,10,40,0.7)';
      g.lineWidth = Math.max(0.5, r * 0.035);
      g.stroke();
      if (f.shade > 0.7 && f.tone > 0.55) {
        g.fillStyle = css(lighten(colour, 0.7), 0.7);
        g.beginPath();
        g.arc((f.path[0]![0] + f.path[2]![0]) / 2, (f.path[0]![1] + f.path[2]![1]) / 2, r * 0.06, 0, TAU);
        g.fill();
      }
    }
    // The sphere: bright where the light falls on it and dark at its far edge.
    const shade = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.5)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0)');
    shade.addColorStop(0.75, 'rgba(10,6,40,0.1)');
    shade.addColorStop(1, 'rgba(10,6,40,0.62)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(20,12,50,0.8)';
    g.lineWidth = 1.2;
    g.stroke();
  }

  /**
   * The string, the ball and its glints. `spin` is how far it has turned, in columns of mirrors.
   */
  paint(p: Painter, ox: number, spin: number, t: number, lively: number): void {
    const plan = this.plan;
    if (!plan || this.frames.length === 0) return;
    const { x: bx, y: by, r, top } = plan.ball;
    const g = p.ctx;
    const x = bx + ox;
    g.strokeStyle = css([40, 28, 70], 0.95);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, by - r);
    g.stroke();
    g.fillStyle = css([190, 190, 230]);
    g.fillRect(x - 3, by - r - 4, 6, 5);
    // Its halo is behind it, in the sky, so that the mirrors can be seen; only a little of it goes
    // on the light sheet, to bloom.
    const before = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    glowAt(g, x, by, r * 6, [200, 214, 255], 0.14 + 0.2 * lively);
    g.globalCompositeOperation = before;
    const frame = this.frames[Math.floor(wrap(spin, 1) * FRAMES) % FRAMES]!;
    g.drawImage(frame, x - r - 2, by - r - 2, r * 2 + 4, r * 2 + 4);
    const light = p.light;
    glowAt(light, x, by, r * 3.4, [200, 214, 255], 0.1 + 0.1 * lively);
    // Glints on the mirrors, each lasting for a moment somewhere else.
    for (let i = 0; i < 5; i++) {
      const n = Math.floor(t * 3.2 + i * 0.7);
      const life = (t * 3.2 + i * 0.7) % 1;
      const a = hash(n, i + 11) * TAU;
      const d = Math.sqrt(hash(n, i + 29)) * r * 0.85;
      const gx = x + Math.cos(a) * d;
      const gy = by + Math.sin(a) * d * 0.9;
      const fade = Math.sin(Math.PI * life) ** 2;
      glowAt(light, gx, gy, r * (0.45 + 0.6 * fade), COLORS.white, 0.7 * fade, 'spark');
    }
  }

  /**
   * The beams from the ball to the spots on the floor, and the spots. They are added to the picture
   * under the friends, so that a friend who is in a spot is lit by it and not covered.
   */
  paintBeams(p: Painter, ox: number, spots: readonly Spot[], lively: number): void {
    const plan = this.plan;
    if (!plan) return;
    const g = p.ctx;
    const { x: bx, y: by, r } = plan.ball;
    const before = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (const s of spots) {
      if (s.level < 0.03) continue;
      const a = 0.14 * s.level * (0.5 + 0.5 * lively);
      const width = s.r * 0.85;
      const grad = g.createLinearGradient(bx + ox, by, s.x + ox, s.y);
      grad.addColorStop(0, css(lighten(s.color, 0.5), a * 1.4));
      grad.addColorStop(1, css(s.color, a * 0.5));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx + ox - 1.5, by + r * 0.3);
      g.lineTo(bx + ox + 1.5, by + r * 0.3);
      g.lineTo(s.x + ox + width, s.y);
      g.lineTo(s.x + ox - width, s.y);
      g.closePath();
      g.fill();
    }
    for (const s of spots) {
      if (s.level < 0.03) continue;
      // A spot on the floor lies flat, so it is wider than it is tall.
      g.save();
      g.translate(s.x + ox, s.y);
      g.scale(1, 0.42);
      glowAt(g, 0, 0, s.r * 2.5, s.color, 0.62 * s.level);
      glowAt(g, 0, 0, s.r * 1.2, lighten(s.color, 0.45), 0.4 * s.level);
      g.restore();
    }
    g.globalCompositeOperation = before;
  }
}
