/**
 * What a child draws on a picture: lines of crayon and stamps. A drawing is only the list of marks,
 * so that undo takes the last one off and the picture is painted again from the first. Everything
 * here is arithmetic on the picture's own pixels; the screen paints it.
 */

export interface Point {
  x: number;
  y: number;
}

/** The crayons, in the order they stand on the palette. The black is the game's own dark purple. */
export const INKS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'white',
  'black',
  'rainbow',
] as const;
export type Ink = (typeof INKS)[number];

/** The stamps, in the order they stand on the palette. */
export const STAMPS = ['star', 'heart', 'flower', 'sparkle', 'sun', 'moon'] as const;
export type StampShape = (typeof STAMPS)[number];

/** What a line is drawn with: a crayon, or the rubber, which draws the picture back where it goes. */
export type Pen = Ink | 'rubber';

/** The two sizes of pen, and of stamp with it. */
export const BRUSHES = ['fine', 'bold'] as const;
export type Brush = (typeof BRUSHES)[number];

const SOLID: Readonly<Record<Exclude<Ink, 'rainbow'>, readonly [number, number, number]>> = {
  red: [239, 74, 90],
  orange: [255, 154, 60],
  yellow: [255, 216, 74],
  green: [91, 207, 110],
  blue: [74, 144, 242],
  purple: [155, 107, 255],
  pink: [255, 143, 200],
  white: [255, 255, 255],
  black: [38, 24, 61],
};

/** How far a rainbow crayon draws before it has been through every colour, in pixels. */
const RAINBOW_LENGTH = 420;

/**
 * The colour of an ink as a CSS colour, a number of pixels along a line. A rainbow crayon changes as
 * it goes and every other ink is one colour.
 */
export function inkAt(ink: Ink, along: number): string {
  if (ink === 'rainbow') return `hsl(${Math.round(((along / RAINBOW_LENGTH) * 360) % 360)} 92% 60%)`;
  const [r, g, b] = SOLID[ink];
  return `rgb(${r} ${g} ${b})`;
}

/** The colour that sits in the middle of a flower: yellow, unless the flower is. */
export const centreOf = (ink: Ink): string => inkAt(ink === 'yellow' ? 'orange' : 'yellow', 0);

/** How wide the pen is and how big a stamp is, as a share of the long side of the picture. */
const PEN: Readonly<Record<Brush, number>> = { fine: 0.0075, bold: 0.019 };
/** The rubber is wider than the crayon, because it is for taking off a good deal at a time. */
const RUBBER: Readonly<Record<Brush, number>> = { fine: 0.026, bold: 0.055 };
const STAMP: Readonly<Record<Brush, number>> = { fine: 0.046, bold: 0.078 };

export const penWidth = (brush: Brush, w: number, h: number): number => PEN[brush] * Math.max(w, h);
export const rubberWidth = (brush: Brush, w: number, h: number): number => RUBBER[brush] * Math.max(w, h);
export const stampSize = (brush: Brush, w: number, h: number): number => STAMP[brush] * Math.max(w, h);

export interface Line {
  readonly kind: 'line';
  readonly ink: Pen;
  readonly width: number;
  readonly points: Point[];
}

export interface Stamp {
  readonly kind: 'stamp';
  readonly shape: StampShape;
  readonly ink: Ink;
  /** The distance from the middle to the tips. */
  readonly size: number;
  at: Point;
}

export type Mark = Line | Stamp;

/** The most marks a picture takes, and the most points in one line. A child never draws this much. */
export const MAX_MARKS = 240;
export const MAX_POINTS = 1500;
/** A finger that has moved less than this, in pixels, has not moved. */
const MIN_STEP = 1.2;

/** The marks on one picture, which is `w` by `h` pixels. */
export class Drawing {
  private readonly list: Mark[] = [];
  private line: Line | null = null;
  private stamped: Stamp | null = null;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  get marks(): readonly Mark[] {
    return this.list;
  }

  get count(): number {
    return this.list.length;
  }

  /** The line that is being drawn now, if there is one. */
  get live(): Line | null {
    return this.line;
  }

  private clamp(at: Point): Point {
    return { x: Math.min(this.w, Math.max(0, at.x)), y: Math.min(this.h, Math.max(0, at.y)) };
  }

  /** Puts the crayon down. A touch that goes nowhere is a dot. Answers false when the picture is full. */
  begin(at: Point, ink: Pen, width: number): boolean {
    this.end();
    if (this.list.length >= MAX_MARKS) return false;
    const line: Line = { kind: 'line', ink, width, points: [this.clamp(at)] };
    this.list.push(line);
    this.line = line;
    return true;
  }

  /** Draws on to a place. Answers whether the line got longer. */
  extend(at: Point): boolean {
    const line = this.line;
    if (!line || line.points.length >= MAX_POINTS) return false;
    const to = this.clamp(at);
    const last = line.points[line.points.length - 1]!;
    if (Math.hypot(to.x - last.x, to.y - last.y) < MIN_STEP) return false;
    line.points.push(to);
    return true;
  }

  /** Presses a stamp, which moves with the finger until it is let go. Answers false when the picture is full. */
  stamp(shape: StampShape, at: Point, ink: Ink, size: number): boolean {
    this.end();
    if (this.list.length >= MAX_MARKS) return false;
    const stamp: Stamp = { kind: 'stamp', shape, ink, size, at: this.clamp(at) };
    this.list.push(stamp);
    this.stamped = stamp;
    return true;
  }

  /** Slides the stamp that is held. */
  slide(at: Point): boolean {
    if (!this.stamped) return false;
    this.stamped.at = this.clamp(at);
    return true;
  }

  /** The finger is up. */
  end(): void {
    this.line = null;
    this.stamped = null;
  }

  /** Takes off the last mark. Answers whether there was one. */
  undo(): boolean {
    this.end();
    return this.list.pop() !== undefined;
  }
}

/** A part of a stamp: a closed outline, in the ink or in the middle colour, around the stamp's own origin. */
export interface StampPart {
  readonly fill: 'ink' | 'centre';
  readonly points: readonly Point[];
}

const ring = (cx: number, cy: number, r: number, steps: number): Point[] =>
  Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** A star with `tips` points, one of them straight up, whose inner corners are `inner` of the way out. */
const star = (tips: number, size: number, inner: number): Point[] =>
  Array.from({ length: tips * 2 }, (_, i) => {
    const a = (i / (tips * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * inner;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });

/**
 * A crescent: a circle with a bite out of one side by a smaller circle, which opens to the upper
 * right. It is walked round once, along the outside of the big circle the long way and then back
 * along the inside of the bite, and then moved to the middle and fitted so that its farthest point
 * is `size` out, as every stamp's is.
 */
function crescent(size: number): Point[] {
  const big = size * 0.96;
  const bite = big * 0.8;
  const cx = big * 0.46;
  const cy = -big * 0.2;
  const apart = Math.hypot(cx, cy);
  const toward = Math.atan2(cy, cx);
  // Where the circles cross, as angles round each of them, by the law of cosines.
  const outer = Math.acos((big * big + apart * apart - bite * bite) / (2 * big * apart));
  const inner = Math.acos((bite * bite + apart * apart - big * big) / (2 * bite * apart));
  const out = Array.from({ length: 30 }, (_, i): Point => {
    const a = toward + outer + (i / 29) * (Math.PI * 2 - 2 * outer);
    return { x: Math.cos(a) * big, y: Math.sin(a) * big };
  });
  const back = Array.from({ length: 24 }, (_, i): Point => {
    const a = toward + Math.PI + inner - (i / 23) * 2 * inner;
    return { x: cx + Math.cos(a) * bite, y: cy + Math.sin(a) * bite };
  });
  const points = [...out, ...back];
  const left = Math.min(...points.map((p) => p.x));
  const right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y));
  const centred = points.map((p) => ({ x: p.x - (left + right) / 2, y: p.y - (top + bottom) / 2 }));
  const fit = size / Math.max(...centred.map((p) => Math.hypot(p.x, p.y)));
  return centred.map((p) => ({ x: p.x * fit, y: p.y * fit }));
}

/** What a stamp of `shape` is made of, `size` from its middle to its tips. */
export function stampParts(shape: StampShape, size: number): readonly StampPart[] {
  switch (shape) {
    case 'star':
      return [{ fill: 'ink', points: star(5, size, 0.42) }];
    case 'sparkle':
      return [{ fill: 'ink', points: star(4, size, 0.24) }];
    case 'heart': {
      // The classic heart curve, turned the right way up and centred, with its farthest point `size` out.
      const curve = Array.from({ length: 48 }, (_, i) => {
        const t = (i / 48) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return { x, y: y - 2.5 };
      });
      const fit = size / Math.max(...curve.map((p) => Math.hypot(p.x, p.y)));
      return [{ fill: 'ink', points: curve.map((p) => ({ x: p.x * fit, y: p.y * fit })) }];
    }
    case 'sun': {
      // Eight short rays round a disc: the rays are the ink and the disc is the middle colour.
      const rays = Array.from({ length: 8 }, (_, i): StampPart => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const at = (turn: number, reach: number): Point => ({
          x: Math.cos(a + turn) * size * reach,
          y: Math.sin(a + turn) * size * reach,
        });
        return { fill: 'ink', points: [at(-0.2, 0.56), at(0, 1), at(0.2, 0.56)] };
      });
      return [...rays, { fill: 'centre', points: ring(0, 0, size * 0.6, 24) }];
    }
    case 'moon':
      return [{ fill: 'ink', points: crescent(size) }];
    case 'flower': {
      const petals = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return ring(Math.cos(a) * size * 0.62, Math.sin(a) * size * 0.62, size * 0.38, 14);
      });
      return [
        ...petals.map((points): StampPart => ({ fill: 'ink', points })),
        { fill: 'centre', points: ring(0, 0, size * 0.3, 16) },
      ];
    }
  }
}
