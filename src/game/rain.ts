import { piecesOf, RAIN_KINDS, RAIN_PIECES, RAIN_SECONDS, type RainKind, type RainPieceId } from '../content/rain';

/**
 * The treasure game: gems, gold and money fall from the top of the screen and the player catches
 * them by touching them or by sweeping a finger through them. It cannot be lost. Nothing costs the
 * player anything, a piece they miss just falls away, and the round ends only when the time is up.
 * This holds the rules and none of the picture, so it runs the same under a test as on a phone.
 * Positions are in CSS pixels from the top left of the play area.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Piece {
  /** Unique within a round. */
  id: number;
  piece: RainPieceId;
  kind: RainKind;
  x: number;
  y: number;
  /** Fall speed, in pixels a second. */
  speed: number;
  /** How far it drifts from side to side, in pixels, and where in the drift it started. */
  sway: number;
  phase: number;
  /** Where it was in the x direction before drifting. */
  home: number;
  angle: number;
  /** Turn, in degrees a second. Zero for calm mode. */
  spin: number;
  /** Width of its picture, in pixels. */
  size: number;
  state: 'falling' | 'caught' | 'gone';
  /** The time its state last changed, so the picture can play a pop or a fade. */
  since: number;
}

export type Counts = Readonly<Record<RainKind, number>>;

export type RainEvent =
  | { type: 'started'; piece: Piece }
  | { type: 'caught'; piece: Piece }
  | { type: 'missed'; piece: Piece }
  /** A golden shower begins: a burst of pieces. */
  | { type: 'shower' }
  | { type: 'over' };

export interface RainOptions {
  width: number;
  height: number;
  /**
   * A number in [0, 1). The game never calls `Math.random`, so a test can give it a fixed sequence.
   */
  random: () => number;
  /** Whether the parent asked for calmer effects: slower, no spinning, no bursts. */
  calm?: boolean;
  seconds?: number;
}

/** How many pieces may be falling at once. */
const MAX_FALLING = 16;
/**
 * When the golden showers begin, in seconds from the start, for a round of 60. Each one is a burst
 * of pieces over two seconds.
 */
const SHOWERS = [18, 38, 52] as const;
const SHOWER_PIECES = 12;
const SHOWER_SECONDS = 2;
/**
 * The longest time one step may cover, so a slow frame does not drop a handful of pieces at once.
 */
const LONGEST_STEP = 0.1;
/** How long a caught or missed piece stays in the list, for its picture to finish. */
const LINGER = 0.6;
/** Share of the pieces that are of each kind. */
const MIX: Readonly<Record<RainKind, number>> = { gem: 0.45, gold: 0.3, money: 0.25 };

export const emptyCounts = (): Record<RainKind, number> => ({ gem: 0, gold: 0, money: 0 });

export const totalOf = (counts: Counts): number => RAIN_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

export class RainGame {
  readonly seconds: number;
  time = 0;
  over = false;
  readonly pieces: Piece[] = [];
  private readonly tally: Record<RainKind, number> = emptyCounts();
  private width: number;
  private height: number;
  private readonly random: () => number;
  private readonly calm: boolean;
  private serial = 0;
  private untilNext = 0.4;
  /** Pieces still owed by a golden shower that is under way, and the time between them. */
  private owed = 0;
  private showersDone = 0;

  constructor(o: RainOptions) {
    this.width = o.width;
    this.height = o.height;
    this.random = o.random;
    this.calm = o.calm ?? false;
    this.seconds = o.seconds ?? RAIN_SECONDS;
  }

  get counts(): Counts {
    return { ...this.tally };
  }

  get total(): number {
    return totalOf(this.tally);
  }

  /** Seconds left, never below zero. */
  get remaining(): number {
    return Math.max(0, this.seconds - this.time);
  }

  resize(width: number, height: number): void {
    // Pieces keep their share of the width, so a turned phone does not strand them off the side.
    const k = this.width > 0 ? width / this.width : 1;
    for (const p of this.pieces) {
      p.x *= k;
      p.home *= k;
    }
    this.width = width;
    this.height = height;
  }

  /** How close a finger must come to a piece to catch it. Generous, for small fingers. */
  reach(p: Piece): number {
    return p.size * 0.6 + 14;
  }

  /** Moves the round on by `seconds`. Returns what happened. */
  step(seconds: number): RainEvent[] {
    const events: RainEvent[] = [];
    if (this.over) return events;
    let left = Math.max(0, seconds);
    while (left > 0 && !this.over) {
      const dt = Math.min(left, LONGEST_STEP);
      left -= dt;
      this.advance(dt, events);
    }
    return events;
  }

  /**
   * A finger moved from `from` to `to`, or touched down at `to` when `from` is null. Everything the
   * line between them passes near is caught, so a fast swipe cannot skip over a piece.
   */
  touch(from: Point | null, to: Point): RainEvent[] {
    const events: RainEvent[] = [];
    if (this.over) return events;
    for (const p of this.pieces) {
      if (p.state !== 'falling') continue;
      if (distanceToSegment({ x: p.x, y: p.y }, from ?? to, to) > this.reach(p)) continue;
      p.state = 'caught';
      p.since = this.time;
      this.tally[p.kind] += 1;
      events.push({ type: 'caught', piece: p });
    }
    return events;
  }

  private advance(dt: number, events: RainEvent[]): void {
    this.time += dt;
    for (const p of this.pieces) {
      if (p.state === 'falling') {
        p.y += p.speed * dt;
        p.x = p.home + Math.sin(p.phase + this.time * 1.7) * p.sway;
        p.angle += p.spin * dt;
        if (p.y - p.size > this.height) {
          p.state = 'gone';
          p.since = this.time;
          events.push({ type: 'missed', piece: p });
        }
      }
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (p.state !== 'falling' && this.time - p.since > LINGER) this.pieces.splice(i, 1);
    }
    this.spawn(dt, events);
    if (this.time >= this.seconds) {
      this.over = true;
      events.push({ type: 'over' });
    }
  }

  private spawn(dt: number, events: RainEvent[]): void {
    const scale = this.seconds / RAIN_SECONDS;
    const next = SHOWERS[this.showersDone];
    if (!this.calm && next !== undefined && this.time >= next * scale) {
      this.showersDone += 1;
      this.owed += SHOWER_PIECES;
      events.push({ type: 'shower' });
    }
    this.untilNext -= dt;
    while (this.untilNext <= 0 && this.falling < MAX_FALLING) {
      const shower = this.owed > 0;
      if (shower) this.owed -= 1;
      events.push({ type: 'started', piece: this.drop() });
      // Quicker as the round goes on, with a little give so it never falls into a beat. A shower is
      // a quick run of them.
      const pace = shower
        ? SHOWER_SECONDS / SHOWER_PIECES
        : (0.7 - 0.38 * (this.time / this.seconds)) * (this.calm ? 1.25 : 1);
      this.untilNext += pace * (0.8 + this.random() * 0.4);
    }
    // A full sky waits. It does not save up pieces to pour out afterwards.
    if (this.untilNext < 0) this.untilNext = 0;
  }

  private get falling(): number {
    return this.pieces.filter((p) => p.state === 'falling').length;
  }

  private drop(): Piece {
    const r = this.random;
    const kind = pickKind(r());
    const kinds = piecesOf(kind);
    const piece = kinds[Math.floor(r() * kinds.length) % kinds.length]!;
    const size = Math.round(Math.max(46, Math.min(78, this.height * 0.15)) * (0.9 + r() * 0.25));
    const margin = size * 0.8;
    const home = margin + r() * Math.max(0, this.width - margin * 2);
    const speed = this.height * (0.3 + r() * 0.18) * (this.calm ? 0.75 : 1);
    const p: Piece = {
      id: ++this.serial,
      piece,
      kind: RAIN_PIECES[piece].kind,
      x: home,
      y: -size,
      speed,
      sway: this.calm ? 0 : 8 + r() * 22,
      phase: r() * Math.PI * 2,
      home,
      angle: this.calm ? 0 : (r() - 0.5) * 50,
      spin: this.calm ? 0 : (r() - 0.5) * 120,
      size,
      state: 'falling',
      since: this.time,
    };
    this.pieces.push(p);
    return p;
  }
}

function pickKind(roll: number): RainKind {
  let acc = 0;
  for (const kind of RAIN_KINDS) {
    acc += MIX[kind];
    if (roll < acc) return kind;
  }
  return RAIN_KINDS[RAIN_KINDS.length - 1]!;
}

/** The shortest distance from a point to a line segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
