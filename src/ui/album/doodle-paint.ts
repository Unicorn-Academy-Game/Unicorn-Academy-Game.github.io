import { centreOf, inkAt, type Line, type Mark, type Pen, type Point, type Stamp, stampParts } from '../../game/doodle';

/** Paints what the game keeps as marks on to a canvas. Nothing here decides anything. */

/** The white edge round a stamp, as a share of its size, like a sticker. */
const EDGE = 0.2;

/**
 * The picture a drawing is on, as the rubber needs it: `bare` is the picture as it was, and `k` is how
 * many pixels it has for each unit the marks are measured in. A screen that shows the picture bigger than
 * it is keeps it, and the marks painted on it, at more pixels, so a line stays sharp.
 */
export interface Paper {
  bare: HTMLCanvasElement;
  k: number;
}

/**
 * What a line is drawn in: its colour, or for the rubber the picture itself, which a canvas can use
 * as a paint that is the same size as the picture and sits on it, so that the line draws it back.
 */
function paintOf(g: CanvasRenderingContext2D, ink: Pen, paper: Paper): string | CanvasPattern {
  if (ink !== 'rubber') return inkAt(ink, 0);
  const pattern = g.createPattern(paper.bare, 'no-repeat');
  if (!pattern) return '#000';
  // The canvas is scaled up by `k` to paint the marks, and the picture already has `k` pixels to the
  // unit, so it is scaled back down for each of its pixels to land on one of the canvas's.
  pattern.setTransform(new DOMMatrix().scale(1 / paper.k));
  return pattern;
}

/** A touch that went nowhere: a round dot as wide as the crayon. */
function dot(g: CanvasRenderingContext2D, at: Point, line: Line, paper: Paper): void {
  g.fillStyle = paintOf(g, line.ink, paper);
  g.beginPath();
  g.arc(at.x, at.y, line.width / 2, 0, Math.PI * 2);
  g.fill();
}

/** A line in one colour: the points joined by curves through the middles between them, so it is smooth. */
function plainLine(g: CanvasRenderingContext2D, line: Line, paper: Paper): void {
  const [first, ...rest] = line.points;
  if (!first) return;
  if (rest.length === 0) {
    dot(g, first, line, paper);
    return;
  }
  g.strokeStyle = paintOf(g, line.ink, paper);
  g.lineWidth = line.width;
  g.beginPath();
  g.moveTo(first.x, first.y);
  let from = first;
  for (const to of rest) {
    g.quadraticCurveTo(from.x, from.y, (from.x + to.x) / 2, (from.y + to.y) / 2);
    from = to;
  }
  g.lineTo(from.x, from.y);
  g.stroke();
}

/** A rainbow line: one short stretch after another, each in the colour it has reached by then. */
function rainbowLine(g: CanvasRenderingContext2D, line: Line, paper: Paper): void {
  const [first, ...rest] = line.points;
  if (!first) return;
  if (rest.length === 0) {
    dot(g, first, line, paper);
    return;
  }
  g.lineWidth = line.width;
  let from = first;
  let along = 0;
  for (const to of rest) {
    along += Math.hypot(to.x - from.x, to.y - from.y);
    g.strokeStyle = inkAt('rainbow', along);
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();
    from = to;
  }
}

function stampOn(g: CanvasRenderingContext2D, stamp: Stamp): void {
  const parts = stampParts(stamp.shape, stamp.size);
  const ink = inkAt(stamp.ink, stamp.at.x + stamp.at.y);
  const centre = centreOf(stamp.ink);
  g.save();
  g.translate(stamp.at.x, stamp.at.y);
  g.lineJoin = 'round';
  g.lineWidth = stamp.size * EDGE;
  g.strokeStyle = '#fff';
  const trace = (points: readonly Point[]): void => {
    g.beginPath();
    for (const [i, p] of points.entries()) {
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
  };
  // The edge goes under everything first, so that the petals of a flower share one white edge.
  for (const part of parts) {
    trace(part.points);
    g.stroke();
  }
  for (const part of parts) {
    g.fillStyle = part.fill === 'ink' ? ink : centre;
    trace(part.points);
    g.fill();
  }
  g.restore();
}

/**
 * Paints one mark on a canvas that holds the picture at `paper.k` pixels to the unit. `paper.bare` is
 * the picture as it was, for the rubber to draw back.
 */
export function paintMark(g: CanvasRenderingContext2D, mark: Mark, paper: Paper): void {
  g.save();
  g.scale(paper.k, paper.k);
  if (mark.kind === 'stamp') {
    stampOn(g, mark);
  } else {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (mark.ink === 'rainbow') rainbowLine(g, mark, paper);
    else plainLine(g, mark, paper);
  }
  g.restore();
}

/** Paints every mark in the order they were made. */
export function paintMarks(g: CanvasRenderingContext2D, marks: readonly Mark[], paper: Paper): void {
  for (const mark of marks) paintMark(g, mark, paper);
}
