import { piecesOf, RAIN_KIND, RAIN_KINDS, type RainKind, type RainPieceId } from '../../content/rain';
import { emptyCounts, type Piece, type RainEvent, RainGame, totalOf } from '../../game/rain';
import type { UnicornId } from '../../shared/ids';
import { Cast, MAX_HERD } from '../engine/cast';
import { COLORS, css, lighten, RAINBOW, type RGB } from '../engine/color';
import { clamp, damp, easeInOutCubic, easeOutBack, lerp, Spring, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import { glowAt, label, roundedRect } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer, Quality } from '../engine/stage';
import { scaleNote } from '../music';
import { VAULT } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { VaultArt } from './vault/art';
import { type Count, countUp, shownAt, ticksOf } from './vault/count';
import { HEAP_CAP, heapOf } from './vault/heap';
import { baysOf, type Chest, CLOCK_R, type Plan, planOf, type Stand, standsOf } from './vault/layout';
import { drawTreasure, forgetTreasure, treasurePic } from './vault/treasure';
import { headlineOf } from './vault/words';

/**
 * A treasure vault under an open sky. Gems, gold and money rain down the whole screen, and the
 * player catches them with a touch or a swipe; each one that is caught flies into the chest at the
 * bottom and lands in its own heap, which grows as the heaps do in a chest. It is a round of sixty
 * seconds and it cannot be lost: what they miss fades at the floor and nothing is taken away.
 * Three, two, one, go, and then the rain. When the time is up the chest comes to the middle and is
 * counted out, the gems first, then the gold, then the money, each going up with a ticking tune,
 * and then what they caught is said, with confetti. After that every touch spills a little treasure
 * out of the chest. The stars are filled by what they catch, and the last one by finishing.
 */

/**
 * What each star costs in points of catching, for a gem is a point, and a piece of gold or a note a
 * little less. The last is the end of the round.
 */
const RAIN_STAR_COSTS = [6, 16, 30, 46, 1e6] as const;

const WORTH: Readonly<Record<RainKind, number>> = { gem: 1, gold: 0.9, money: 0.8 };
const COLOR: Readonly<Record<RainKind, RGB>> = { gem: [255, 150, 232], gold: [255, 208, 72], money: [128, 236, 170] };
/**
 * The colours of three, two, one: all of them light enough to be read against the dark of the
 * vault.
 */
const COUNT_COLORS: readonly RGB[] = [
  [255, 150, 214],
  [255, 214, 92],
  [132, 236, 176],
];
const VOICE = { gem: 'bell', gold: 'chime', money: 'glass' } as const;

/** The seconds of three, two, one before the rain, and how long the word that begins it stays. */
const COUNT_STEP = 0.8;
const LEAD_SECONDS = COUNT_STEP * 3;
const GO_SECONDS = 0.75;
const FLIGHT = 0.46;
const CAST_SECONDS = 0.8;
/**
 * Catches closer together than this are one run of them, and each is a step higher up the scale.
 */
const STREAK_GAP = 1.15;
const ROOT = 60;
const MOST_SPILLS = 40;
/** The room between two of the pills that say how many the player has caught. */
const PILL_GAP = 6;

interface Flight {
  readonly kind: RainKind;
  readonly piece: RainPieceId;
  readonly x0: number;
  readonly y0: number;
  readonly at: number;
  readonly size: number;
  readonly turn0: number;
  readonly spin: number;
}

export class TreasureRain extends Wonder {
  readonly id = 'treasure-rain' as const;
  protected readonly meter = new Meter(RAIN_STAR_COSTS);
  private readonly art: VaultArt;
  private readonly cast = new Cast();
  private plan!: Plan;
  private stands: Stand[] = [];
  private game!: RainGame;
  private artFor = 0;
  private detail = true;
  /** Seconds of the count in left, and seconds since the word that begins the rain. */
  private lead = LEAD_SECONDS;
  private sinceGo = 99;
  private countStep = -1;
  private flights: Flight[] = [];
  private landed: Record<RainKind, number> = emptyCounts();
  /**
   * The pieces in each heap, as the chest has them: the first of them first, and the newest taking
   * the place of the oldest in a full heap.
   */
  private readonly inside: Record<RainKind, RainPieceId[]> = { gem: [], gold: [], money: [] };
  private readonly heapShown: Record<RainKind, number> = emptyCounts();
  private readonly heapSpots: Record<RainKind, { key: number; spots: ReturnType<typeof heapOf> }> = {
    gem: { key: -1, spots: [] },
    gold: { key: -1, spots: [] },
    money: { key: -1, spots: [] },
  };
  private readonly bumps = RAIN_KINDS.map(() => new Spring(0, 0, 220, 11));
  private readonly chestSpring = new Spring(0, 0, 200, 10);
  private points = 0;
  private streak = 0;
  private lastCatch = -9;
  private lastTick = -1;
  private sparkleIn = 1;
  private showerUntil = -9;
  private closing = false;
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private lastFriendTap = -9;
  private lastSpill = -9;
  private spills = 0;
  private result: Count | null = null;
  private resultClock = 0;
  private chestT = 0;
  private headlineT = 0;
  /** Counts the frames a flight is drawn, so that it sheds a spark every other one. */
  private puffs = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.art = new VaultArt(env.rng.int(0x7fffffff));
    this.startMusic(VAULT);
  }

  override get bloom(): number {
    return this.env.calm ? 0.12 : 0.22;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
  }

  protected override musicEnergy(): number {
    if (this.phase !== 'play') return super.musicEnergy();
    if (this.lead > 0) return 0.08;
    return Math.min(1, 0.14 + 0.86 * (this.points / 44));
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly phase: string;
    readonly lead: number;
    readonly remaining: number;
    readonly counts: Readonly<Record<RainKind, number>>;
    readonly landed: Readonly<Record<RainKind, number>>;
    readonly pieces: readonly {
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly kind: RainKind;
      readonly id: number;
    }[];
    readonly flights: number;
    readonly friends: readonly { readonly id: UnicornId; readonly x: number; readonly y: number; readonly r: number }[];
    readonly chest: { readonly x: number; readonly y: number; readonly w: number };
    readonly result: {
      readonly headlineAt: number;
      readonly end: number;
      readonly clock: number;
      readonly title: string;
    } | null;
    /** Where the clock is and how far it reaches. */
    readonly clock: { readonly x: number; readonly y: number; readonly r: number };
    readonly size: { readonly w: number; readonly h: number };
  } {
    const c = this.chestNow();
    return {
      phase: this.phase,
      lead: this.lead,
      remaining: this.game.remaining,
      counts: this.game.counts,
      landed: { ...this.landed },
      pieces: this.game.pieces
        .filter((p) => p.state === 'falling')
        .map((p) => ({ x: p.x, y: p.y, r: this.game.reach(p), kind: p.kind, id: p.id })),
      flights: this.flights.length,
      friends: this.stands.map((s, i) => ({
        id: this.env.herd[i]!,
        x: s.x,
        y: s.y - 34 * s.scale,
        r: Math.max(24, 52 * s.scale),
      })),
      chest: { x: c.x, y: c.rim - c.back * 0.4, w: c.w },
      result: this.result
        ? {
            headlineAt: this.result.headlineAt,
            end: this.result.end,
            clock: this.resultClock,
            title: headlineOf(this.game.counts).title,
          }
        : null,
      clock: { x: this.plan.clock.x, y: this.plan.clock.y, r: this.plan.clock.r },
      size: { w: this.plan.w, h: this.plan.h },
    };
  }

  protected arrange(view: View): void {
    this.plan = planOf(view.w, view.h, view.unit);
    this.stands = standsOf(Math.min(MAX_HERD, this.env.herd.length), this.plan);
    if (this.game) this.game.resize(view.w, view.h);
    else this.game = this.newGame();
    this.artFor = 0;
  }

  private newGame(): RainGame {
    return new RainGame({
      width: this.view.w,
      height: this.view.h,
      random: () => this.env.rng.next(),
      calm: this.env.calm,
    });
  }

  protected reset(): void {
    this.game = this.newGame();
    this.cast.reset();
    this.lead = LEAD_SECONDS;
    this.sinceGo = 99;
    this.countStep = -1;
    this.flights = [];
    this.landed = emptyCounts();
    for (const kind of RAIN_KINDS) {
      this.inside[kind] = [];
      this.heapShown[kind] = 0;
      this.heapSpots[kind] = { key: -1, spots: [] };
    }
    for (const b of this.bumps) {
      b.x = 0;
      b.v = 0;
    }
    this.chestSpring.x = 0;
    this.chestSpring.v = 0;
    this.points = 0;
    this.streak = 0;
    this.lastCatch = -9;
    this.lastTick = -1;
    this.sparkleIn = 1;
    this.showerUntil = -9;
    this.closing = false;
    this.fingers.clear();
    this.lastFriendTap = -9;
    this.lastSpill = -9;
    this.spills = 0;
    this.result = null;
    this.resultClock = 0;
    this.chestT = 0;
    this.headlineT = 0;
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  /**
   * The chest as it is now: where it stands while the player plays, and in the middle, a little
   * bigger, when it is being counted.
   */
  private chestNow(): Chest {
    const a = this.plan.chest;
    const b = this.plan.centre;
    return { ...a, x: lerp(a.x, b.x, easeInOutCubic(this.chestT)) };
  }

  /**
   * Upright there is room to show the chest off bigger, and held sideways there is room for the
   * words over it.
   */
  private chestScale(): number {
    return 1 + (this.plan.portrait ? 0.1 : 0) * easeInOutCubic(this.chestT);
  }

  /** Where a heap's top is, so that what lands lands on it and not in the air above it. */
  private heapTop(kind: RainKind): { x: number; y: number } {
    const c = this.chestNow();
    const bay = baysOf(c)[RAIN_KINDS.indexOf(kind)]!;
    const full = Math.min(1, this.landed[kind] / 22);
    return { x: bay.x, y: c.rim + 4 - (c.back * 0.55 + 10) * full };
  }

  private burst(x: number, y: number, color: RGB, n: number, speed = 130, size = 4): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.env.rng.range(0, 0.6);
      const v = speed * this.env.rng.range(0.5, 1.1);
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 20,
        life: this.env.rng.range(0.35, 0.65),
        size,
        size1: 1,
        color,
        color1: lighten(color, 0.5),
        shape: 'spark',
        tail: 0.07,
        drag: 2.4,
        gravity: 120,
      });
    }
  }

  private ring(x: number, y: number, color: RGB, size: number, life = 0.4): void {
    this.fx.emit({
      x,
      y,
      life,
      size: size * 0.3,
      size1: size,
      color,
      shape: 'ring',
      width: 2.4,
      alpha: 0.9,
      alpha1: 0,
    });
  }

  private rainbowBits(x: number, y: number, n: number, up = true): void {
    for (let i = 0; i < n; i++) {
      this.fx.emit({
        x: x + this.env.rng.range(-8, 8),
        y,
        vx: this.env.rng.range(-70, 70),
        vy: (up ? -1 : 1) * this.env.rng.range(120, 260),
        life: this.env.rng.range(0.9, 1.5),
        size: this.env.rng.range(5, 9),
        color: this.env.rng.pick(RAINBOW),
        shape: 'confetti',
        rot: this.env.rng.range(0, TAU),
        spin: this.env.rng.range(-8, 8),
        gravity: 300,
        drag: 0.8,
        add: false,
        hold: 0.7,
      });
    }
  }

  protected press(p: Pointer): void {
    this.fingers.set(p.id, { x: p.x, y: p.y });
    if (this.phase === 'after') {
      this.spill(p);
      return;
    }
    if (this.phase !== 'play') return;
    this.ring(p.x, p.y, [255, 240, 190], 30, 0.3);
    if (this.lead > 0) return;
    this.handle(this.game.touch(null, { x: p.x, y: p.y }));
    this.touchFriend(p);
  }

  protected override drag(p: Pointer): void {
    const from = this.fingers.get(p.id) ?? { x: p.px, y: p.py };
    this.fingers.set(p.id, { x: p.x, y: p.y });
    if (this.phase !== 'play') return;
    this.swipeTrail(from.x, from.y, p.x, p.y);
    if (this.lead > 0) return;
    this.handle(this.game.touch(from, { x: p.x, y: p.y }));
  }

  protected override lift(p: Pointer): void {
    this.fingers.delete(p.id);
  }

  /** A line of light left where a finger went, so that the swipe is seen as it is made. */
  private swipeTrail(x0: number, y0: number, x1: number, y1: number): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.min(6, Math.floor(length / 10));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = lerp(x0, x1, u);
      const y = lerp(y0, y1, u);
      this.fx.emit({
        x,
        y,
        life: 0.34,
        size: 12,
        size1: 2,
        color: [255, 232, 150],
        color1: [255, 150, 210],
        shape: 'glow',
        alpha: 0.8,
        alpha1: 0,
      });
      if (i % 2 === 0)
        this.fx.emit({
          x,
          y,
          vx: this.env.rng.range(-26, 26),
          vy: this.env.rng.range(-26, 10),
          life: 0.5,
          size: 6,
          size1: 0,
          color: [255, 250, 220],
          shape: 'star4',
          rot: this.env.rng.range(0, 3),
          spin: 3,
        });
    }
  }

  private touchFriend(p: Pointer): void {
    this.stands.forEach((s, i) => {
      const reach = Math.max(24, 52 * s.scale);
      if (Math.hypot(p.x - s.x, p.y - (s.y - 34 * s.scale)) > reach) return;
      if (this.time - this.lastFriendTap < 0.25) return;
      this.lastFriendTap = this.time;
      this.cast.cheer(i);
      this.cast.kick(i, 0.7);
      this.env.sound.note('flute', scaleNote(ROOT + 12, i * 2), { gain: 0.3, pan: this.pan(s.x), seconds: 0.6 });
      this.burst(s.x, s.y - 40 * s.scale, lighten(COLOR.gold, 0.2), 6, 90);
    });
  }

  private handle(events: readonly RainEvent[]): void {
    for (const e of events) {
      if (e.type === 'caught') this.caught(e.piece);
      else if (e.type === 'started') this.started(e.piece);
      else if (e.type === 'missed') this.missed(e.piece);
      else if (e.type === 'shower') this.shower();
      else this.timeUp();
    }
  }

  private started(p: Piece): void {
    if (!this.detail && p.id % 2 === 0) return;
    this.fx.emit({
      x: p.x,
      y: 6,
      life: 0.55,
      size: 34,
      size1: 8,
      color: COLOR[p.kind],
      shape: 'glow',
      alpha: 0.5,
      alpha1: 0,
    });
  }

  private missed(p: Piece): void {
    // It sinks into the floor in a twinkle, which is all there is to missing.
    if (p.id % 2 === 0 && !this.detail) return;
    this.burst(p.x, this.plan.fadeFrom + 38, COLOR[p.kind], 3, 50, 3);
  }

  private shower(): void {
    this.showerUntil = this.time + 2.4;
    this.env.sound.fx('swell', { gain: 0.45 });
    this.env.sound.fx('twinkle', { gain: 0.5, delay: 0.1 });
    this.flash(0.07, COLORS.gold);
    for (let i = 0; i < 6; i++) this.burst(this.env.rng.range(0.1, 0.9) * this.view.w, 18, COLOR.gold, 5, 90, 5);
  }

  private caught(p: Piece): void {
    const now = this.time;
    this.streak = now - this.lastCatch > STREAK_GAP ? 0 : this.streak + 1;
    this.lastCatch = now;
    const kind = p.kind;
    const color = COLOR[kind];
    const sound = this.env.sound;
    // The notes of a run go up the scale and come back down it, so that a good catch is always a
    // tune.
    const cycle = this.streak % 14;
    const step = cycle < 7 ? cycle : 14 - cycle;
    sound.note(VOICE[kind], scaleNote(ROOT + 12, step + (kind === 'gem' ? 2 : 0)), {
      gain: 0.5,
      pan: this.pan(p.x),
      seconds: 0.9,
    });
    sound.fx('pop', { gain: 0.16, pan: this.pan(p.x), pitch: 1 + step * 0.04 });
    this.ring(p.x, p.y, lighten(color, 0.3), p.size * 1.5);
    this.burst(p.x, p.y, color, 7, 150);
    this.fx.emit({
      x: p.x,
      y: p.y,
      life: 0.3,
      size: p.size * 2.2,
      size1: p.size * 0.6,
      color: lighten(color, 0.4),
      shape: 'glow',
      alpha: 0.8,
      alpha1: 0,
    });
    this.flights.push({
      kind,
      piece: p.piece,
      x0: p.x,
      y0: p.y,
      at: now,
      size: p.size,
      turn0: (p.angle * Math.PI) / 180,
      spin: (p.spin * Math.PI) / 180,
    });
    if (this.streak > 0 && this.streak % 6 === 0) this.cheerFriend();
    const before = this.meter.stars;
    this.earn(WORTH[kind]);
    this.points += WORTH[kind];
    if (this.meter.stars > before) this.starCheer();
  }

  private cheerFriend(): void {
    if (this.stands.length === 0) return;
    const i = this.env.rng.int(this.stands.length);
    this.cast.cheer(i);
    this.cast.kick(i, 0.8);
  }

  private starCheer(): void {
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    this.chestSpring.kick(1.4);
    const c = this.chestNow();
    this.rainbowBits(c.x, c.rim - c.back, 18);
    this.fx.emit({
      x: c.x,
      y: c.rim - c.back,
      life: 0.7,
      size: c.w * 0.4,
      size1: c.w * 1.5,
      color: lighten(COLOR.gold, 0.3),
      shape: 'glow',
      alpha: 0.7,
      alpha1: 0,
    });
  }

  /** A piece lands in its heap: the heap grows, the chest gives a little, and it clinks. */
  private land(f: Flight, quiet: boolean): void {
    const kind = f.kind;
    const index = RAIN_KINDS.indexOf(kind);
    this.landed[kind] += 1;
    const heap = this.inside[kind];
    const slot = (this.landed[kind] - 1) % HEAP_CAP;
    if (slot < heap.length) heap[slot] = f.piece;
    else heap.push(f.piece);
    this.bumps[index]!.kick(0.9);
    this.chestSpring.kick(0.35);
    if (quiet) return;
    const top = this.heapTop(kind);
    this.burst(top.x, top.y, COLOR[kind], 3, 60, 3);
    this.env.sound.fx(kind === 'gold' ? 'coin' : kind === 'gem' ? 'ding' : 'pop', {
      gain: 0.2,
      pan: this.pan(top.x),
      pitch: 0.9 + this.env.rng.range(0, 0.4),
    });
  }

  /**
   * Where a flight is, for drawing and for where it lands: it goes up a little, over, and down into
   * the chest.
   */
  private flightAt(f: Flight): { x: number; y: number; u: number } {
    const u = clamp((this.time - f.at) / FLIGHT);
    const to = this.heapTop(f.kind);
    const lift = Math.min(f.y0, to.y) - 34;
    const e = easeInOutCubic(u);
    const mx = lerp(f.x0, to.x, 0.5);
    const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * to.x;
    const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * lift + e * e * to.y;
    return { x, y, u };
  }

  private timeUp(): void {
    this.closing = true;
    // What was still falling turns to sparkles, because the round is over and there is no more to
    // catch.
    for (const p of this.game.pieces) {
      if (p.state !== 'falling') continue;
      p.state = 'gone';
      p.since = this.game.time;
      this.burst(p.x, p.y, COLOR[p.kind], 4, 70);
      this.fx.emit({
        x: p.x,
        y: p.y,
        life: 0.5,
        size: p.size * 1.6,
        size1: p.size * 0.3,
        color: COLOR[p.kind],
        shape: 'glow',
        alpha: 0.6,
        alpha1: 0,
      });
    }
    this.env.sound.note('bell', ROOT + 7, { gain: 0.5, seconds: 1.6 });
    this.env.sound.note('bell', ROOT + 12, { gain: 0.5, seconds: 1.6, delay: 0.14 });
  }

  /** The finger of a stand-in, or anyone's, spills treasure from the chest. */
  private spill(p: Pointer): void {
    const touchedFriend = this.stands.some(
      (s) => Math.hypot(p.x - s.x, p.y - (s.y - 34 * s.scale)) < Math.max(24, 52 * s.scale),
    );
    if (touchedFriend) {
      this.touchFriend(p);
      return;
    }
    if (this.time - this.lastSpill < 0.18 || this.spills > MOST_SPILLS) return;
    this.lastSpill = this.time;
    const c = this.chestNow();
    const bays = baysOf(c);
    const count = 3 + this.env.rng.int(3);
    for (let i = 0; i < count; i++) {
      const kind = RAIN_KINDS[this.env.rng.int(3)]!;
      this.launch(kind, bays[RAIN_KINDS.indexOf(kind)]!.x, c.rim - 6);
    }
    this.spills += count;
    this.chestSpring.kick(0.9);
    this.env.sound.fx('coin', { gain: 0.4, pan: this.pan(c.x) });
    this.env.sound.note('bell', scaleNote(ROOT + 12, this.env.rng.int(8)), {
      gain: 0.4,
      seconds: 0.8,
      pan: this.pan(c.x),
    });
    this.ring(c.x, c.rim - c.back * 0.6, COLOR.gold, c.w * 0.8, 0.5);
  }

  /** One piece of treasure thrown up from the chest that tumbles and bounces on the floor. */
  private launch(kind: RainKind, x: number, y: number, size = 26): void {
    const ids = piecesOf(kind);
    const id = ids[this.env.rng.int(ids.length)]!;
    this.fx.emit({
      x,
      y,
      vx: this.env.rng.range(-130, 130),
      vy: this.env.rng.range(-380, -250),
      life: 2.4,
      size,
      shape: 'pic',
      pic: treasurePic(id),
      rot: this.env.rng.range(0, TAU),
      spin: this.env.rng.range(-7, 7),
      gravity: 780,
      floor: this.plan.floor + (this.plan.h - this.plan.floor) * 0.55,
      bounce: 0.4,
      drag: 0.15,
      hold: 0.72,
      add: false,
    });
  }

  protected tick(dt: number): void {
    const now = this.time;
    this.chestSpring.step(dt);
    for (const b of this.bumps) b.step(dt);
    for (const kind of RAIN_KINDS) this.heapShown[kind] = damp(this.heapShown[kind], this.landed[kind], 9, dt);
    this.stands.forEach((s, i) => {
      const since = this.cast.sinceCheer(i);
      const cheering = since < CAST_SECONDS;
      this.cast.set(
        i,
        {
          x: s.x,
          y: s.y,
          mode: cheering ? 'cheer' : 'idle',
          face: this.plan.portrait ? (s.x < this.plan.w / 2 ? 1 : -1) : 1,
          clock: cheering ? since : now + i * 0.7,
        },
        dt,
      );
    });
    this.cast.tick(dt);
    if (this.phase === 'play') this.play(dt);
    else this.counting(dt);
    // Treasure that has landed.
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      if (now - f.at < FLIGHT) continue;
      this.flights.splice(i, 1);
      this.land(f, false);
    }
    if (this.closing && this.flights.length === 0 && this.phase === 'play') {
      this.closing = false;
      this.celebrate();
    }
    // The heaps glitter now and then.
    this.sparkleIn -= dt;
    if (this.sparkleIn <= 0) {
      this.sparkleIn = this.env.rng.range(0.22, 0.5);
      const kind = RAIN_KINDS[this.env.rng.int(3)]!;
      if (this.landed[kind] > 0) {
        const top = this.heapTop(kind);
        const c = this.chestNow();
        this.fx.emit({
          x: top.x + this.env.rng.range(-c.w * 0.1, c.w * 0.1),
          y: top.y + this.env.rng.range(-6, 8),
          life: 0.7,
          size: this.env.rng.range(8, 14),
          color: [255, 246, 210],
          shape: 'star4',
          rot: this.env.rng.range(0, 3),
          spin: 2,
          alpha: 0.95,
        });
      }
    }
  }

  private play(dt: number): void {
    if (this.lead > 0) {
      this.lead -= dt;
      const step = Math.min(3, Math.floor((LEAD_SECONDS - this.lead) / COUNT_STEP));
      if (step !== this.countStep && this.lead > 0) {
        this.countStep = step;
        this.env.sound.note('glass', scaleNote(ROOT + 12, step * 2), { gain: 0.5, seconds: 0.5 });
        this.env.sound.fx('tap', { gain: 0.3, pitch: 1 + step * 0.12 });
        this.ring(this.view.w / 2, this.view.h * 0.46, COLOR.gold, 110, 0.6);
      }
      if (this.lead <= 0) {
        this.lead = 0;
        this.sinceGo = 0;
        this.countStep = 3;
        const sound = this.env.sound;
        sound.fx('whoosh', { gain: 0.5 });
        sound.fx('cheer', { gain: 0.35, delay: 0.05 });
        [0, 2, 4, 7].forEach((s, i) => {
          sound.note('bell', scaleNote(ROOT + 12, s), { gain: 0.45, delay: i * 0.07, seconds: 1 });
        });
        this.rainbowBits(this.view.w / 2, this.view.h * 0.5, 22);
        this.stands.forEach((_, i) => {
          this.cast.cheer(i);
        });
      }
      return;
    }
    this.sinceGo += dt;
    this.handle(this.game.step(dt));
    // The last seconds tick, softly, a little higher each.
    const left = Math.ceil(this.game.remaining);
    if (left <= 5 && left > 0 && left !== this.lastTick && !this.game.over) {
      this.lastTick = left;
      this.env.sound.note('glass', scaleNote(ROOT + 24, 5 - left), { gain: 0.22, seconds: 0.3 });
    }
  }

  /**
   * The finale: the chest comes to the middle and each kind is counted out, and then it is all
   * said.
   */
  private counting(dt: number): void {
    this.chestT = clamp(this.chestT + dt / 1.1);
    if (!this.result) return;
    this.resultClock += dt;
    const out = this.resultClock - this.result.headlineAt;
    this.headlineT = clamp(out / 0.5);
    if (this.phase === 'finale' && this.resultClock >= this.result.end) this.endFinale();
  }

  protected finale(): void {
    const sound = this.env.sound;
    const s0 = this.script.now;
    const game = this.game;
    // Whatever was still on its way is in the chest, and the round is over for good.
    for (const f of this.flights) this.land(f, true);
    this.flights = [];
    game.over = true;
    for (const p of game.pieces) if (p.state === 'falling') p.state = 'gone';
    this.lead = 0;
    this.closing = false;
    const counts = game.counts;
    const result = countUp(counts);
    this.result = result;
    this.resultClock = 0;
    this.headlineT = 0;
    sound.fx('swell', { gain: 0.6 });
    this.flash(0.12, COLORS.white);
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    const c = this.plan.centre;
    this.script.at(s0 + 0.5, () => {
      sound.fx('whoosh', { gain: 0.4 });
      this.rainbowBits(c.x, c.rim - c.back, 14);
    });
    result.tallies.forEach((t, k) => {
      const kind = t.kind;
      const index = RAIN_KINDS.indexOf(kind);
      // Each count begins with a bell, goes up with a tick for every piece, and ends with a
      // flourish and a handful of that treasure thrown up.
      this.script.at(s0 + t.start, () => {
        sound.note(VOICE[kind], scaleNote(ROOT + 12, k * 2), { gain: 0.5, seconds: 0.8 });
        this.bumps[index]!.kick(1);
      });
      ticksOf(t).forEach((at, i) => {
        this.script.at(s0 + at, () => {
          sound.note(VOICE[kind], scaleNote(ROOT + 12 + k * 3, i % 10), {
            gain: 0.3,
            seconds: 0.35,
            pan: (k - 1) * 0.4,
          });
          if (i % 2 === 0) this.bumps[index]!.kick(0.45);
        });
      });
      this.script.at(s0 + t.end, () => {
        if (t.n === 0) return;
        const bay = baysOf(this.chestNow())[index]!;
        sound.fx('ding', { gain: 0.5, step: k * 2 });
        sound.fx('coin', { gain: 0.4, delay: 0.05 });
        this.ring(bay.x, this.chestNow().rim - this.chestNow().back * 0.5, COLOR[kind], 90, 0.55);
        this.burst(bay.x, this.chestNow().rim - this.chestNow().back * 0.5, COLOR[kind], 14, 190, 5);
        const throwing = Math.min(9, 2 + Math.floor(t.n / 5));
        for (let i = 0; i < throwing; i++) this.launch(kind, bay.x, this.chestNow().rim - 8, 28);
        this.chestSpring.kick(0.8);
      });
    });
    // Then it is all said, and the sky rains confetti.
    this.script.at(s0 + result.headlineAt, () => {
      const total = totalOf(counts);
      sound.fx('boom', { gain: 0.35 });
      if (total > 0) {
        sound.fx('cheer', { gain: 0.6 });
        [0, 2, 4, 7, 9].forEach((s, i) => {
          sound.note('bell', scaleNote(ROOT + 12, s), { gain: 0.5, delay: i * 0.08, seconds: 1.4 });
        });
        this.shake(1);
        this.flash(0.14, COLORS.white);
        for (let i = 0; i < 4; i++) this.script.at(this.script.now + i * 0.28, () => this.rain());
      } else {
        sound.note('bell', ROOT + 12, { gain: 0.4, seconds: 1.2 });
      }
      this.stands.forEach((_, i) => {
        this.cast.cheer(i);
      });
    });
  }

  /** A shower of confetti and stars from the whole of the sky. */
  private rain(): void {
    for (let i = 0; i < 20; i++) {
      this.fx.emit({
        x: this.env.rng.range(0, this.view.w),
        y: -10,
        vx: this.env.rng.range(-26, 26),
        vy: this.env.rng.range(90, 190),
        life: this.env.rng.range(3, 4.6),
        size: this.env.rng.range(6, 10),
        color: this.env.rng.pick(RAINBOW),
        shape: 'confetti',
        rot: this.env.rng.range(0, TAU),
        spin: this.env.rng.range(-6, 6),
        sway: 70,
        drag: 0.2,
        gravity: 24,
        add: false,
        hold: 0.85,
      });
    }
  }

  private ensureArt(k: number): void {
    if (this.artFor === k) return;
    this.artFor = k;
    this.art.place(this.plan, k);
  }

  protected paintBack(p: Painter): void {
    const g = p.ctx;
    this.ensureArt(p.k);
    const plan = this.plan;
    this.art.drawRoom(g, plan, this.time, this.env.calm);
    this.art.drawLive(g, p.light, plan, this.time, this.env.calm);
    this.paintChest(p);
    this.paintFriends(p);
    this.paintPieces(p);
  }

  private paintChest(p: Painter): void {
    const g = p.ctx;
    const chest = this.chestNow();
    const base = chest.rim + chest.front;
    const squash = this.chestSpring.x;
    const s = this.chestScale();
    this.art.drawChestShadow(g, chest);
    g.save();
    g.translate(chest.x, base);
    g.scale(s * (1 + squash * 0.05), s * (1 - squash * 0.08));
    g.translate(-chest.x, -base);
    this.art.drawChestBack(g, chest);
    const bays = baysOf(chest);
    RAIN_KINDS.forEach((kind, i) => {
      this.paintHeap(g, p.light, kind, bays[i]!, chest, i);
    });
    this.art.drawChestFront(g, chest);
    g.restore();
    // Light comes up out of the chest and grows with what is in it, and in the finale it is a
    // column of it.
    const total = totalOf(this.landed);
    const glow = clamp(total / 40);
    const ramp = easeInOutCubic(this.chestT);
    glowAt(
      p.light,
      chest.x,
      chest.rim - chest.back * 0.7,
      chest.w * (1.3 + 0.6 * ramp),
      [255, 196, 96],
      0.07 + 0.14 * glow + 0.1 * ramp,
    );
    if (ramp > 0.05 && !this.env.calm) this.paintRays(p.light, chest, ramp);
  }

  private paintRays(l: CanvasRenderingContext2D, chest: Chest, ramp: number): void {
    const top = chest.rim - chest.back * 0.6;
    l.save();
    l.globalCompositeOperation = 'lighter';
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(this.time * 0.7 + i) * 0.05;
      const angle = i * 0.2 + sway;
      const length = this.plan.h;
      const fade = l.createLinearGradient(
        chest.x,
        top,
        chest.x + Math.sin(angle) * length,
        top - Math.cos(angle) * length,
      );
      fade.addColorStop(0, css([255, 214, 130], 0.13 * ramp));
      fade.addColorStop(1, css([255, 214, 130], 0));
      l.fillStyle = fade;
      l.beginPath();
      l.moveTo(chest.x - 8, top);
      l.lineTo(chest.x + 8, top);
      l.lineTo(chest.x + Math.sin(angle) * length + 34 + i * 6, top - Math.cos(angle) * length);
      l.lineTo(chest.x + Math.sin(angle) * length - 34 + i * 6, top - Math.cos(angle) * length);
      l.closePath();
      l.fill();
    }
    l.restore();
  }

  private paintHeap(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    kind: RainKind,
    bay: { x: number; half: number },
    chest: Chest,
    index: number,
  ): void {
    const shown = this.heapShown[kind];
    if (shown < 0.04) return;
    const holder = this.heapSpots[kind];
    // The places of the pieces change only when the heap has grown enough to see.
    const key = Math.round(shown * 12);
    if (holder.key !== key) {
      holder.key = key;
      holder.spots = heapOf(shown);
    }
    const ids = this.inside[kind];
    const fallback = piecesOf(kind);
    const reach = chest.back * 0.62 + 16;
    const size = chest.w * 0.13;
    const bump = this.bumps[index]!.x;
    holder.spots.forEach((spot, n) => {
      const id = ids[n] ?? fallback[n % fallback.length]!;
      const x = bay.x + spot.u * bay.half * 1.12;
      const y = chest.rim + 5 - spot.rise * reach * (1 + bump * 0.06);
      const coin = id === 'coin';
      drawTreasure(
        g,
        id,
        x,
        y,
        size * (1 + bump * 0.04),
        spot.turn * 1.4,
        coin ? 0.78 + 0.22 * Math.cos(spot.turn * 9) : 1,
      );
    });
    glowAt(light, bay.x, chest.rim - reach * 0.4, bay.half * 3.2, COLOR[kind], clamp(shown / 24) * 0.15 + 0.03);
  }

  private paintFriends(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = this.stands.map((s, i) => ({ s, i })).sort((a, b) => a.s.y - b.s.y || a.i - b.i);
    for (const { s, i } of order) {
      g.fillStyle = 'rgba(10,4,26,0.4)';
      g.beginPath();
      g.ellipse(s.x, s.y + 1, 34 * s.scale, 5 * s.scale, 0, 0, TAU);
      g.fill();
      this.cast.draw(g, bank, i, this.env.herd[i]!, s.scale);
    }
  }

  /** What is falling, and what is on its way to the chest. */
  private paintPieces(p: Painter): void {
    const g = p.ctx;
    const plan = this.plan;
    for (const piece of this.game.pieces) {
      if (piece.state !== 'falling') continue;
      const fade = clamp(1 - (piece.y - plan.fadeFrom) / (piece.size * 0.9));
      if (fade <= 0) continue;
      const coin = piece.piece === 'coin';
      const squeeze = coin ? Math.max(0.2, Math.abs(Math.cos(piece.phase * 2 + this.time * 4.6))) : 1;
      glowAt(p.light, piece.x, piece.y, piece.size * 2, COLOR[piece.kind], 0.3 * fade);
      drawTreasure(
        g,
        piece.piece,
        piece.x,
        piece.y,
        piece.size,
        ((piece.angle * Math.PI) / 180) * (coin ? 0.25 : 1),
        squeeze,
        fade,
      );
    }
    for (const f of this.flights) {
      const at = this.flightAt(f);
      const u = at.u;
      const grow = 1 - 0.42 * easeInOutCubic(u);
      glowAt(p.light, at.x, at.y, f.size * 2.2, COLOR[f.kind], 0.5 * (1 - u * 0.5));
      drawTreasure(g, f.piece, at.x, at.y, f.size * grow, f.turn0 + f.spin * (this.time - f.at));
      if (this.detail && ++this.puffs % 2 === 0)
        this.fx.emit({
          x: at.x,
          y: at.y,
          life: 0.3,
          size: 7,
          size1: 0,
          color: COLOR[f.kind],
          shape: 'glow',
          alpha: 0.7,
          alpha1: 0,
        });
    }
  }

  protected paintFront(p: Painter): void {
    const g = p.ctx;
    const plan = this.plan;
    const chest = this.chestNow();
    // How many of each the player has, in a row over the chest, and big when they are counted.
    const s = this.chestScale();
    const base = chest.rim + chest.front;
    const ramp = easeInOutCubic(this.chestT);
    const top = base - (base - chest.rim + chest.back + chest.lid) * s;
    const big = (plan.portrait ? 1.5 : 1.3) * ramp + (1 - ramp);
    const shown = RAIN_KINDS.map((kind, i) => {
      const tally = this.result?.tallies[i];
      return tally && this.phase !== 'play' ? shownAt(tally, this.resultClock) : this.landed[kind];
    });
    // A pill is as wide as its number is long, but never narrower than two digits, so that it does
    // not jump as the number grows.
    const widths = shown.map((n, i) => (44 + 9 * Math.max(2, String(this.result?.tallies[i]?.n ?? n).length)) * big);
    const row = widths.reduce((sum, w) => sum + w, 0) + PILL_GAP * 2 * big;
    let x = chest.x - row / 2;
    RAIN_KINDS.forEach((kind, i) => {
      const tally = this.result?.tallies[i];
      const active = Boolean(
        tally && this.phase !== 'play' && this.resultClock >= tally.start && this.resultClock <= tally.end + 0.4,
      );
      const kick = this.bumps[i]!.x;
      const scale = big * (active ? 1.14 : 1) * (1 + kick * 0.12);
      this.paintBadge(g, kind, shown[i]!, x + widths[i]! / 2, top - 22 * big, scale, widths[i]! / big, active);
      x += widths[i]! + PILL_GAP * big;
    });
    if (this.phase === 'play' || this.chestT < 1) this.paintClock(g, plan, 1 - ramp);
    this.paintWords(g, plan);
    if (this.lead > 0) this.paintCount(g);
    else if (this.sinceGo < GO_SECONDS) this.paintGo(g);
    if (this.time < this.showerUntil && this.phase === 'play') this.paintShower(g);
  }

  private paintBadge(
    g: CanvasRenderingContext2D,
    kind: RainKind,
    n: number,
    x: number,
    y: number,
    scale: number,
    w: number,
    lit: boolean,
  ): void {
    const text = String(n);
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.fillStyle = lit ? 'rgba(60,34,100,0.88)' : 'rgba(26,14,52,0.74)';
    roundedRect(g, -w / 2, -14, w, 28, 14);
    g.fill();
    g.strokeStyle = css(lit ? lighten(COLOR[kind], 0.4) : COLOR[kind], lit ? 1 : 0.75);
    g.lineWidth = lit ? 2.4 : 1.6;
    g.stroke();
    drawTreasure(g, RAIN_KIND[kind].icon, -w / 2 + 17, 0, 26);
    label(g, text, (-w / 2 + 30 + w / 2 - 8) / 2, 1, 18, '#fff', 'center');
    g.restore();
  }

  private paintClock(g: CanvasRenderingContext2D, plan: Plan, alpha: number): void {
    if (alpha <= 0.01) return;
    const { x, y, scale } = plan.clock;
    const r = CLOCK_R;
    const left = this.game.remaining;
    const share = this.lead > 0 ? 1 : clamp(left / this.game.seconds);
    const urgent = this.lead <= 0 && left <= 5 && left > 0 && !this.game.over;
    const pulse = urgent ? 1 + 0.07 * Math.sin(this.time * 9) : 1;
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.scale(pulse * scale, pulse * scale);
    g.fillStyle = 'rgba(26,14,52,0.72)';
    g.beginPath();
    g.arc(0, 0, r + 4, 0, TAU);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(0, 0, r - 2, 0, TAU);
    g.stroke();
    g.lineCap = 'round';
    g.strokeStyle = css(urgent ? [255, 120, 140] : share < 0.3 ? [255, 168, 90] : [255, 214, 90]);
    g.beginPath();
    g.arc(0, 0, r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * share);
    g.stroke();
    label(g, String(Math.max(0, Math.ceil(this.lead > 0 ? this.game.seconds : left))), 0, 1, 19);
    g.restore();
  }

  /** The three, two, one, big in the middle, each coming in at a size and settling. */
  private paintCount(g: CanvasRenderingContext2D): void {
    const step = Math.max(0, this.countStep);
    const into = LEAD_SECONDS - this.lead - step * COUNT_STEP;
    const u = clamp(into / COUNT_STEP);
    // It comes in big, settles, and fades as the next comes.
    const size = 120 * easeOutBack(clamp(into / 0.25)) * (1 - 0.1 * u);
    g.save();
    g.globalAlpha = clamp(1 - Math.max(0, u - 0.7) / 0.3);
    label(
      g,
      String(3 - step),
      this.view.w / 2,
      this.view.h * 0.46,
      Math.max(24, size),
      css(COUNT_COLORS[step % COUNT_COLORS.length]!),
    );
    g.restore();
  }

  private paintGo(g: CanvasRenderingContext2D): void {
    const u = this.sinceGo / GO_SECONDS;
    g.save();
    g.globalAlpha = clamp(1 - Math.max(0, u - 0.55) / 0.45);
    label(g, 'Go!', this.view.w / 2, this.view.h * 0.46 - u * 26, 84 * easeOutBack(clamp(u / 0.3)) + 20, '#ffe27a');
    g.restore();
  }

  private paintShower(g: CanvasRenderingContext2D): void {
    const u = clamp((this.showerUntil - this.time) / 2.4);
    const a = Math.min(1, u * 3, (1 - u) * 8);
    g.save();
    g.globalAlpha = a;
    label(g, 'Golden shower!', this.view.w / 2, this.plan.sky + 38, 28, '#ffe27a');
    g.restore();
  }

  /** What is said when the count is done. */
  private paintWords(g: CanvasRenderingContext2D, plan: Plan): void {
    if (!this.result || this.headlineT <= 0) return;
    const say = headlineOf(this.game.counts);
    const u = easeOutBack(this.headlineT);
    const y = plan.portrait ? plan.h * 0.3 : 96;
    g.save();
    g.globalAlpha = clamp(this.headlineT * 2);
    g.translate(plan.w / 2, y);
    g.scale(u, u);
    label(g, say.title, 0, 0, plan.portrait ? 38 : 40, '#ffe27a');
    label(g, say.detail, 0, plan.portrait ? 34 : 30, plan.portrait ? 17 : 17, '#fff');
    g.restore();
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play' || this.lead > 0) return null;
    let best: Piece | null = null;
    for (const piece of this.game.pieces) {
      if (piece.state !== 'falling' || piece.y < 40 || piece.y > this.plan.fadeFrom - 30) continue;
      if (!best || piece.y > best.y) best = piece;
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  override dispose(): void {
    super.dispose();
    forgetTreasure();
  }
}
