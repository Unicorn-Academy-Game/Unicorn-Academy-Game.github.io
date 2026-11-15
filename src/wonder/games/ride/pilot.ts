import { damp } from '../../engine/ease';
import type { Journey } from './journey';
import { SPACING, SPREAD } from './journey';

/** A thing that happens along the way, as she gets to it. */
export type Beat =
  | { readonly kind: 'hoop' | 'star' | 'splash'; readonly index: number }
  | { readonly kind: 'loop-in' | 'loop-top' | 'loop-out' | 'launch' };

/** How fast she goes along each part of the way, in units a second. */
const RUN = 380;
const LOOP = 480;
const RAMP = 660;
const GLIDE = 520;
/** How much faster a tap makes her, for a moment, and the most it can add. */
const TAP_BOOST = 38;
const MOST_BOOST = 190;

/**
 * She, going along a journey. It knows how far along she is and how fast she is going; it says what
 * she has just got to; and it lets her friends, who are each a little further back, get to the same
 * places a little later.
 */
export class Pilot {
  /** How far along she is. The friends are this less one gap each. */
  s: number;
  private base: number;
  private boost = 0;
  /** How many of her and her friends have splashed in. */
  private splashed = 0;

  constructor(
    readonly journey: Journey,
    readonly friends: number,
    /** How fast she was going when she got to the start. */
    speed: number,
    /** How far along she already is, if she got to the start a little way on. */
    at = 0,
  ) {
    this.base = speed;
    this.s = at;
  }

  /** A tap: a little faster, for a moment. */
  tap(): void {
    this.boost = Math.min(MOST_BOOST, this.boost + TAP_BOOST);
  }

  /** Whether she and every friend of hers has splashed in and had time to settle. */
  get settled(): boolean {
    return this.placeOf(this.friends) >= this.journey.marks.land + SPACING;
  }

  /** How far along friend `i` is, and `0` is she. */
  placeOf(i: number): number {
    return this.journey.place(this.s, i);
  }

  /** How fast she is going now. */
  get speed(): number {
    return this.base + this.boost;
  }

  /** Which part of the way she is on. */
  get part(): 'run' | 'loop' | 'ramp' | 'air' | 'water' {
    const m = this.journey.marks;
    if (this.s < m.loopIn) return 'run';
    if (this.s < m.loopOut) return 'loop';
    if (this.s < m.launch) return 'ramp';
    if (this.s < m.land) return 'air';
    return 'water';
  }

  /** Goes on for `dt` seconds, adding what she gets to along the way to `out`. */
  step(dt: number, out: Beat[]): void {
    const j = this.journey;
    const part = this.part;
    if (part === 'air') {
      // In the air the leap decides how fast, and it is the same for everyone.
      this.base = Math.max(j.paceAt(this.s), 1);
      this.boost = 0;
    } else {
      const want = part === 'run' ? RUN : part === 'loop' ? LOOP : part === 'ramp' ? RAMP : GLIDE;
      this.base = damp(this.base, want, 2.2, dt);
      this.boost = Math.max(0, this.boost - 160 * dt);
    }
    const from = this.s;
    // Once everyone is in the water she stops going on: the friends have all got where they are
    // going.
    const stop = j.marks.land + SPACING * SPREAD * this.friends + SPACING * 2;
    this.s = Math.min(stop, this.s + this.speed * dt);
    this.crossed(from, this.s, out);
  }

  private crossed(from: number, to: number, out: Beat[]): void {
    const m = this.journey.marks;
    const between = (at: number): boolean => at > from && at <= to;
    m.hoops.forEach((at, index) => {
      if (between(at)) out.push({ kind: 'hoop', index });
    });
    if (between(m.loopIn)) out.push({ kind: 'loop-in' });
    if (between(m.loopTop)) out.push({ kind: 'loop-top' });
    if (between(m.loopOut)) out.push({ kind: 'loop-out' });
    if (between(m.launch)) out.push({ kind: 'launch' });
    m.stars.forEach((at, index) => {
      if (between(at)) out.push({ kind: 'star', index });
    });
    // Each of them, she first, splashes in when they get to the water.
    while (this.splashed <= this.friends && this.journey.place(to, this.splashed) >= m.land) {
      out.push({ kind: 'splash', index: this.splashed });
      this.splashed++;
    }
  }
}
