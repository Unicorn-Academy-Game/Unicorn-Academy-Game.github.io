import { clamp, easeOutBack, easeOutQuad, lerp } from '../../engine/ease';

/**
 * The little creature that comes out of the machine when it has done more than it can hold. It is a
 * crystal one from the apple machine and a blossom one from the berry machine. It hatches with a
 * pop, is round and soft and happy, and does a trick when the player touches it. This is how it
 * moves, as a function of time, and how it looks is for the game to draw from it.
 */

export type Trick = 'hop' | 'spin' | 'wave' | 'dance';

/**
 * The tricks in the order they are done, going round, so each touch is a different one from the
 * last.
 */
export const TRICKS: readonly Trick[] = ['hop', 'wave', 'spin', 'dance'];

/** Seconds each takes. */
export const SECONDS: Readonly<Record<Trick, number>> = { hop: 0.7, wave: 1.1, spin: 0.9, dance: 1.6 };

/** How long it takes to come out of the machine and land. */
export const HATCH_SECONDS = 1.5;

/** How it looks at a moment. */
export interface Shape {
  /** How far it is above where it stands, and sideways from there. */
  lift: number;
  shift: number;
  /** Taller (above 0) or squashed (below). */
  stretch: number;
  /** How far it has turned over, in radians, for a spin or a tilt. */
  turn: number;
  /** How far round it is facing, from -1 to 1, as in a spin. */
  face: number;
  /** How closed its eyes are, from 0 to 1. */
  blink: number;
  /** How wide its smile is, from 0 to 1. */
  smile: number;
  /** How far an arm is up, from 0 to 1. */
  wave: number;
}

export const newShape = (): Shape => ({
  lift: 0,
  shift: 0,
  stretch: 0,
  turn: 0,
  face: 1,
  blink: 0,
  smile: 0.6,
  wave: 0,
});

type Phase = 'unborn' | 'hatching' | 'here';

export class Hatchling {
  phase: Phase = 'unborn';
  /** Seconds since it hatched, and since its present trick began. */
  age = 0;
  since = 0;
  trick: Trick | null = null;
  /** How many tricks it has done. */
  done = 0;
  private nextBlink = 2.2;
  private blinkAt = -9;
  private clock = 0;

  reset(): void {
    this.phase = 'unborn';
    this.age = 0;
    this.since = 0;
    this.trick = null;
    this.done = 0;
    this.nextBlink = 2.2;
    this.blinkAt = -9;
    this.clock = 0;
  }

  get here(): boolean {
    return this.phase !== 'unborn';
  }

  hatch(): void {
    if (this.phase !== 'unborn') return;
    this.phase = 'hatching';
    this.age = 0;
  }

  /**
   * The player touches it. It does its next trick, and if it was doing one it begins again from the
   * start of the next. Says which.
   */
  touch(): Trick | null {
    if (this.phase !== 'here') return null;
    const next = TRICKS[this.done % TRICKS.length]!;
    this.done += 1;
    this.trick = next;
    this.since = 0;
    return next;
  }

  tick(dt: number): void {
    if (this.phase === 'unborn') return;
    this.clock += dt;
    this.age += dt;
    if (this.phase === 'hatching' && this.age >= HATCH_SECONDS) this.phase = 'here';
    if (this.trick) {
      this.since += dt;
      if (this.since >= SECONDS[this.trick]) this.trick = null;
    }
    if (this.clock >= this.nextBlink) {
      this.blinkAt = this.clock;
      // A blink every few seconds, never at the same beat twice.
      this.nextBlink = this.clock + 2.4 + ((Math.sin(this.clock * 12.9898) + 1) / 2) * 2.4;
    }
  }

  /**
   * How it looks now, filled into `out`. Where it is in the flight out of the machine is `flight`,
   * from 0 to 1, if it is still hatching.
   */
  shape(out: Shape = newShape()): Shape {
    out.lift = 0;
    out.shift = 0;
    out.stretch = 0;
    out.turn = 0;
    out.face = 1;
    out.smile = 0.6;
    out.wave = 0;
    // A slow breath, so it is never quite still.
    const breath = Math.sin(this.clock * 3.1);
    out.stretch = 0.025 * breath;
    const since = this.clock - this.blinkAt;
    out.blink = since >= 0 && since < 0.16 ? Math.sin((since / 0.16) * Math.PI) : 0;

    if (this.phase === 'hatching') {
      const u = clamp(this.age / HATCH_SECONDS);
      // Up out of the glass in a high arc and down onto its feet, squashing as it lands.
      out.lift = 120 * Math.sin(u * Math.PI) ** 0.9;
      out.stretch = u < 0.8 ? 0.2 * Math.sin(u * Math.PI) : -0.28 * Math.sin(((u - 0.8) / 0.2) * Math.PI);
      out.turn = (1 - easeOutQuad(u)) * Math.PI * 2;
      out.smile = 1;
      return out;
    }
    if (!this.trick) return out;
    const u = clamp(this.since / SECONDS[this.trick]);
    out.smile = 1;
    switch (this.trick) {
      case 'hop': {
        out.lift = 46 * Math.sin(u * Math.PI);
        out.stretch = u < 0.15 ? -0.18 * Math.sin((u / 0.15) * Math.PI) : 0.14 * Math.sin(u * Math.PI);
        if (u > 0.85) out.stretch = -0.16 * Math.sin(((u - 0.85) / 0.15) * Math.PI);
        break;
      }
      case 'wave': {
        out.wave = Math.sin(u * Math.PI) * (0.65 + 0.35 * Math.sin(u * 28));
        out.turn = 0.12 * Math.sin(u * Math.PI * 4);
        break;
      }
      case 'spin': {
        out.lift = 30 * Math.sin(u * Math.PI);
        out.face = Math.cos(easeOutBack(u) * Math.PI * 2);
        out.stretch = 0.1 * Math.sin(u * Math.PI);
        break;
      }
      case 'dance': {
        const beat = u * 6;
        out.shift = 16 * Math.sin(beat * Math.PI);
        out.lift = 14 * Math.abs(Math.sin(beat * Math.PI * 2)) * Math.sin(u * Math.PI);
        out.turn = 0.2 * Math.sin(beat * Math.PI * 2);
        out.stretch = 0.08 * Math.sin(beat * Math.PI * 4);
        out.wave = 0.5 * Math.abs(Math.sin(beat * Math.PI));
        break;
      }
    }
    return out;
  }

  /**
   * Where it is on its way out of the machine, as how far from the dome to its feet, from 1 to 0,
   * so the game can place it.
   */
  get flight(): number {
    if (this.phase === 'unborn') return 1;
    if (this.phase === 'here') return 0;
    return lerp(1, 0, easeOutQuad(clamp(this.age / HATCH_SECONDS)));
  }
}
