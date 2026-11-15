import { css, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { bodyOf, paintBalloon, paintTwinkle } from './art';
import { type Garland, SAG } from './layout';

/** Where a note of the phrase is: sung already, the one to sing now, or still to come. */
type NoteState = 'done' | 'now' | 'next';

export interface GarlandNote {
  readonly color: RGB;
  readonly state: NoteState;
}

/**
 * The middle of the ribbon at a point along it. The ribbon is a shallow curve that hangs a little
 * in the middle.
 */
function ribbonAt(g: Garland, x: number, left: number, right: number): number {
  const u = clamp((x - left) / (right - left));
  return g.ribbon - 1 + 2 * u * (1 - u) * (2 * SAG + 1);
}

/**
 * How far across the garland is for this many notes, from its left end to its right, with a little
 * ribbon past the last balloons.
 */
function spanOf(g: Garland, count: number): { left: number; right: number } {
  const half = ((count - 1) * g.step) / 2 + g.r * 1.9;
  return { left: g.cx - half, right: g.cx + half };
}

/** The middle of the balloon for note `i` of `count`. */
export const slotOf = (g: Garland, i: number, count: number): number => g.cx + (i - (count - 1) / 2) * g.step;

/**
 * The phrase the player is playing, as a row of small balloons tied to a ribbon under the star
 * meter: the ones sung dim and wear a star, the one to sing now is big and bright and bobs with the
 * music, and the ones to come wait. `pulse` is the beat, 0 to 1.
 */
export function paintGarland(
  c: CanvasRenderingContext2D,
  g: Garland,
  notes: readonly GarlandNote[],
  t: number,
  pulse: number,
  k: number,
  fade = 1,
): void {
  const n = notes.length;
  if (n === 0 || fade <= 0.01) return;
  const { left, right } = spanOf(g, n);
  const was = c.globalAlpha;
  c.globalAlpha = was * fade;
  // The ribbon, with a thin shadow under it so it shows on any sky.
  for (const [dy, color, width] of [
    [1.4, 'rgba(60,40,90,0.28)', 3],
    [0, 'rgba(255,255,255,0.96)', 2.2],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(left, g.ribbon - 1 + dy);
    c.quadraticCurveTo(g.cx, g.ribbon + 2 * SAG + dy, right, g.ribbon - 1 + dy);
    c.stroke();
  }
  notes.forEach((note, i) => {
    const x = slotOf(g, i, n);
    const now = note.state === 'now';
    const done = note.state === 'done';
    const bob = now ? Math.sin(t * 5.2) * 1.6 : Math.sin(t * 1.3 + i * 1.7) * 0.8;
    const size = g.r * (now ? 1.2 + 0.1 * pulse : done ? 0.84 : 0.95);
    const y = g.y + bob - (now ? 2 : 0);
    const tie = ribbonAt(g, x, left, right);
    // The string, from the knot to the ribbon.
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y + size * 1.3);
    c.lineTo(x + Math.sin(t * 1.1 + i) * 0.8, tie);
    c.stroke();
    if (now) {
      // A halo, so the one to sing is where the eye goes first.
      const halo = c.createRadialGradient(x, y, size * 0.5, x, y, size * 2.4);
      halo.addColorStop(0, css(lighten(note.color, 0.6), 0.55 + 0.2 * pulse));
      halo.addColorStop(1, css(lighten(note.color, 0.6), 0));
      c.fillStyle = halo;
      c.beginPath();
      c.arc(x, y, size * 2.4, 0, TAU);
      c.fill();
    }
    const body = bodyOf(done ? mix(note.color, [255, 255, 255], 0.5) : note.color, g.r, k);
    paintBalloon(
      c,
      body,
      { x, y, r: g.r, tilt: Math.sin(t * 1.2 + i * 2) * 0.05, grow: size / g.r, bump: 0, alpha: done ? 0.7 : 1 },
      null,
    );
    if (done) paintTwinkle(c, x, y - size * 0.05, size * 0.62, 0.95);
  });
  c.globalAlpha = was;
}
