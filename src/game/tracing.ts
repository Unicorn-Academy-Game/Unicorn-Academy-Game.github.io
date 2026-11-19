import type { Glyph, Point, Stroke } from '../content/letters';

/** How far apart the points of a stroke are, in the units of the letter. */
const SPACING = 2.5;
/**
 * How many points past what is written a finger may be and still be following, so that a quick
 * stroke is not missed and a finger cannot jump to the other end of the letter.
 */
const AHEAD = 24;
/** A stroke that has not begun can only be begun near its start, so it is never written backwards. */
const BEGIN = 6;
/** A stroke is written once the finger is this many points from its end. */
const NEAR_END = 4;

/**
 * A stroke as points the same distance apart, ending exactly where the stroke ends. The points are
 * what a finger is measured against.
 */
export function along(stroke: Stroke): Point[] {
  const first = stroke[0];
  if (!first) return [];
  const points: Point[] = [first];
  let next = SPACING;
  let walked = 0;
  for (let i = 1; i < stroke.length; i++) {
    const [ax, ay] = stroke[i - 1]!;
    const [bx, by] = stroke[i]!;
    const length = Math.hypot(bx - ax, by - ay);
    if (length === 0) continue;
    for (; next <= walked + length; next += SPACING) {
      const t = (next - walked) / length;
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
    walked += length;
  }
  const end = stroke[stroke.length - 1]!;
  const last = points[points.length - 1]!;
  if (Math.hypot(end[0] - last[0], end[1] - last[1]) > 1e-6) points.push(end);
  return points;
}

/** What a touch did to the letter. */
export type Step =
  /** It was not on the stroke being written, or no further along it than before. */
  | 'none'
  /** It took the stroke further. */
  | 'more'
  /** It finished a stroke, and another is next. */
  | 'stroke'
  /** It finished the last stroke, so the letter is written. */
  | 'letter';

/**
 * A letter being written, one stroke at a time and always from the start of the stroke to its end.
 * A finger that is not near the stroke does nothing, and nothing is ever wrong: the stroke waits
 * where it got to when the finger lifts, and is carried on from there.
 */
export class Tracer {
  private readonly lines: readonly (readonly Point[])[];
  private at = 0;
  private reached = 0;

  /**
   * `reach` is how far from the stroke a finger may be, in the units of the letter. It can be changed
   * as the letter is drawn bigger or smaller, so that it stays the width of a fingertip.
   */
  constructor(
    glyph: Glyph,
    public reach: number,
  ) {
    this.lines = glyph.strokes.map(along);
  }

  get done(): boolean {
    return this.at >= this.lines.length;
  }

  /** The stroke being written, counted from 0, or nothing once the letter is written. */
  get stroke(): number | null {
    return this.done ? null : this.at;
  }

  /** How much of a stroke is written, from 0 to 1. */
  progress(stroke: number): number {
    if (stroke < this.at) return 1;
    const line = this.lines[stroke];
    if (stroke > this.at || !line || line.length < 2) return 0;
    return this.reached / (line.length - 1);
  }

  /** The part of the stroke being written that is left, from where the player got to. */
  rest(): readonly Point[] {
    return this.lines[this.at]?.slice(this.reached) ?? [];
  }

  /** The finger is at this point of the letter. */
  touch([x, y]: Point): Step {
    const line = this.lines[this.at];
    if (!line) return 'none';
    const last = line.length - 1;
    let best = -1;
    let nearest = this.reach * this.reach;
    const ahead = this.reached === 0 ? BEGIN : AHEAD;
    for (let i = this.reached; i <= Math.min(last, this.reached + ahead); i++) {
      const [px, py] = line[i]!;
      const distance = (px - x) ** 2 + (py - y) ** 2;
      // A tie goes to the later point, so a stroke that turns back on itself goes on.
      if (distance <= nearest) {
        nearest = distance;
        best = i;
      }
    }
    if (best < 0) return 'none';
    const moved = best > this.reached;
    this.reached = best;
    if (this.reached < last - NEAR_END) return moved ? 'more' : 'none';
    this.at++;
    this.reached = 0;
    return this.done ? 'letter' : 'stroke';
  }

  /** Starts the letter again. */
  clear(): void {
    this.at = 0;
    this.reached = 0;
  }
}
