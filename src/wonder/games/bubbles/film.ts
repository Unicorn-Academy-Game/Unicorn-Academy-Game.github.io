import { TAU } from '../../engine/ease';
import { prerender } from '../../engine/paint';

/**
 * What a soap bubble looks like. A bubble is nearly clear, a little milky towards its edge, with
 * the colours of a thin film swirling round that edge, a bright window of light on one side and a
 * faint warm reflection on the other. The skin is drawn once in a few colourings and turned slowly,
 * so the colours seem to move over a bubble that is not itself turning.
 */

/**
 * Half the width of the pictures, and the radius of the bubble in them, both in the pictures' own
 * units.
 */
const HALF = 64;
const CR = 58;
/**
 * How many times bigger than its units the pictures are made, so a big bubble on a big screen is
 * still sharp.
 */
const SHARP = 3;

/**
 * The hue each colouring of the film starts from, in degrees: pink, blue and gold are the colours a
 * bubble leans toward.
 */
const BASES: readonly number[] = [320, 195, 48, 270];

type Canvas2D = CanvasRenderingContext2D;

/**
 * A ring of colour that changes round it, as a conic gradient where the browser has one, and a
 * plain diagonal one where it does not.
 */
function ringColours(g: Canvas2D, base: number, alpha: number): CanvasGradient {
  const stops = 8;
  const grad =
    typeof g.createConicGradient === 'function'
      ? g.createConicGradient(-Math.PI / 2, 0, 0)
      : g.createLinearGradient(-CR, -CR, CR, CR);
  for (let i = 0; i <= stops; i++) {
    const hue = (base + 52 * Math.sin((i / stops) * TAU * 1.5) + (i / stops) * 150) % 360;
    grad.addColorStop(i / stops, `hsla(${hue.toFixed(0)},100%,${i % 2 === 0 ? 74 : 82}%,${alpha})`);
  }
  return grad;
}

function makeFilm(base: number): HTMLCanvasElement {
  return prerender(
    HALF * 2,
    HALF * 2,
    (g) => {
      g.translate(HALF, HALF);
      // The body: all but clear in the middle, a little milky at the edge.
      const body = g.createRadialGradient(0, 0, CR * 0.2, 0, 0, CR);
      body.addColorStop(0, 'rgba(255,255,255,0.025)');
      body.addColorStop(0.66, 'rgba(236,248,255,0.07)');
      body.addColorStop(0.92, `hsla(${(base + 20) % 360},100%,93%,0.28)`);
      body.addColorStop(1, 'rgba(255,255,255,0.42)');
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, 0, CR, 0, TAU);
      g.fill();
      // The thin film: three rings of changing colour, the widest and brightest at the edge.
      const rings = [
        { at: 0.9, width: 12, alpha: 0.55, shift: 0 },
        { at: 0.77, width: 8, alpha: 0.3, shift: 120 },
        { at: 0.66, width: 5, alpha: 0.16, shift: 240 },
      ];
      for (const ring of rings) {
        g.strokeStyle = ringColours(g, base + ring.shift, ring.alpha);
        g.lineWidth = ring.width;
        g.beginPath();
        g.arc(0, 0, CR * ring.at, 0, TAU);
        g.stroke();
      }
      // The meniscus: a fine bright line right at the edge.
      g.strokeStyle = 'rgba(255,255,255,0.62)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, CR - 0.8, 0, TAU);
      g.stroke();
    },
    SHARP,
  );
}

function makeShine(): HTMLCanvasElement {
  return prerender(
    HALF * 2,
    HALF * 2,
    (g) => {
      g.translate(HALF, HALF);
      g.lineCap = 'round';
      // The window: a long curved streak and a short one after it, on the side the light comes
      // from.
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 6.5;
      g.beginPath();
      g.arc(0, 0, CR * 0.78, Math.PI * 1.1, Math.PI * 1.4);
      g.stroke();
      g.lineWidth = 3.4;
      g.beginPath();
      g.arc(0, 0, CR * 0.78, Math.PI * 1.46, Math.PI * 1.54);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.96)';
      g.beginPath();
      g.arc(-CR * 0.48, -CR * 0.5, 3, 0, TAU);
      g.fill();
      // The warm light thrown up from the ground, on the far side.
      g.strokeStyle = 'rgba(255,176,218,0.6)';
      g.lineWidth = 5.5;
      g.beginPath();
      g.arc(0, 0, CR * 0.83, Math.PI * 0.07, Math.PI * 0.36);
      g.stroke();
      g.strokeStyle = 'rgba(166,232,255,0.5)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.arc(0, 0, CR * 0.83, Math.PI * 0.42, Math.PI * 0.5);
      g.stroke();
    },
    SHARP,
  );
}

/** What it takes to draw a bubble's skin. */
export interface Skin {
  x: number;
  y: number;
  r: number;
  squash: number;
  squashAt: number;
  hue: number;
  phase: number;
}

export class Film {
  private readonly films: HTMLCanvasElement[] = BASES.map(makeFilm);
  private readonly shine = makeShine();

  /**
   * Draws the skin of a bubble: the colours, which turn slowly, and the light on it, which does
   * not.
   */
  draw(g: Canvas2D, b: Skin, t: number, alpha = 1): void {
    if (alpha <= 0.004 || b.r < 0.5) return;
    const film = this.films[Math.floor(b.hue * this.films.length) % this.films.length]!;
    const side = (2 * b.r * HALF) / CR;
    const before = g.globalAlpha;
    g.globalAlpha = before * alpha;
    g.save();
    g.translate(b.x, b.y);
    if (Math.abs(b.squash) > 0.002) {
      g.rotate(b.squashAt);
      g.scale(1 + b.squash, 1 - b.squash);
      g.rotate(-b.squashAt);
    }
    g.save();
    g.rotate(t * 0.16 + b.phase * 0.35 + b.hue * TAU);
    g.drawImage(film, -side / 2, -side / 2, side, side);
    g.restore();
    g.drawImage(this.shine, -side / 2, -side / 2, side, side);
    g.restore();
    g.globalAlpha = before;
  }
}
