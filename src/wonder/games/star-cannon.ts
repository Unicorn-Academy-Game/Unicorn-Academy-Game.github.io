import { Bag } from '../engine/bag';
import { COLORS, css, lighten } from '../engine/color';
import { clamp, damp, hump, Spring, smooth, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { noteAt, TWINKLE, tuneMidi } from '../music';
import { Wonder, type WonderEnv } from '../wonder';
import { Cannon } from './cannon/barrel';
import { Comets } from './cannon/comet';
import { type Constellation, constellationOf, type Spot } from './cannon/constellations';
import { type Dress, dressOf } from './cannon/dress';
import { capAt, paintLink, paintSleeper, paintZ, type SleeperLook } from './cannon/figures';
import { type Arc, aimAt, arcFrom, at, flightSeconds, loop } from './cannon/flight';
import { Hats } from './cannon/hats';
import { hung, openSky, orbSpot, type Placement, plan } from './cannon/layout';
import { Setting } from './cannon/setting';
import { GLOW_ROOM, silhouette } from './cannon/silhouette';
import { Sleepers } from './cannon/sleepers';
import type { ShellKind } from './shells';
import { Audience, type Member } from './sky/audience';
import { burstShell } from './sky/burst';
import { BurstLight } from './sky/light';
import { MAGIC, type Scheme, scheme } from './sky/looks';

/**
 * What each star costs, in stars woken. There are 21 in a picture, so the fifth star of the meter
 * is earned by waking the last of them, and the finale begins with the picture whole.
 */
const CANNON_STAR_COSTS = [4, 9, 14, 18, 21] as const;

/**
 * The whole tune: 42 notes, the first 21 of which the stars sing as they wake, and the last 21 of
 * which they sing in the finale.
 */
const SONG = tuneMidi(TWINKLE, 72);
const WAKING_NOTES = 21;
/** Seconds in a beat of the finale's song. */
const BEAT = 0.42;
/** How long before its note the cannon fires the shell that arrives with it, in the finale. */
const LEAD = 0.62;
/** A finger held on the sky fires again after this long, and then this often. */
const HOLD_FIRST = 0.36;
const HOLD_EVERY = 0.4;
/** The least time between one shot leaving the cannon and the next. */
const REPEAT = 0.1;
/** The golden of the comet and of what it wakes. */
const GOLDEN = scheme([255, 224, 140], COLORS.gold, COLORS.cream, COLORS.white);

type Land = (x: number, y: number) => void;

/** A shell on its way: where it flies, how far along it is, and what it does when it gets there. */
interface Shot {
  readonly arc: Arc;
  t: number;
  readonly dur: number;
  readonly scheme: Scheme;
  readonly land: Land;
  /** Sparks owed to its trail. */
  owed: number;
}

/** A shot the cannon has been asked for and has not yet fired. */
interface Order {
  readonly target: Spot;
  readonly kind: ShellKind;
  readonly scheme: Scheme;
  readonly power: number;
  /**
   * The moment on the game's clock the shell should arrive, for a shot that must land on a note.
   * Otherwise it flies at its own pace.
   */
  readonly arriveAt: number | null;
  readonly land: Land | null;
  /** When it fires, or -1 until the barrel has been told where to point. */
  due: number;
}

/** What each star does besides being asleep or awake: its own small movements. */
interface Dreamer {
  readonly pop: Spring;
  readonly tilt: Spring;
  /**
   * Where it is in its slow breathing and in the z's it blows, from 0 to 1. Different for every
   * star, so they do not breathe together.
   */
  readonly phase: number;
  blinkAt: number;
  blinkSince: number;
  /** When it last sang. */
  sang: number;
}

/** Where the cannon can send a shell, and how a shell opens there. */
interface Reach {
  /** A sleeper this near the middle of a burst wakes. */
  readonly wake: number;
  /** How far a burst's shape reaches. */
  readonly blast: number;
}

interface Burst {
  readonly kind: ShellKind;
  readonly scheme: Scheme;
  readonly power: number;
  /** How big the shape is next to a usual one. */
  readonly size?: number;
  /** Whether it wakes the sleepers it reaches. */
  readonly wakes: boolean;
  /** Whether it is small and quiet, for the notes of the finale. */
  readonly quiet?: boolean;
}

/**
 * The star cannon. The stars of a picture are asleep in the night sky, each in a nightcap. A touch
 * aims the cannon and fires a shell that opens where the player touched, and every sleeper it
 * reaches wakes with a pop, throws off its cap, and sings the next note of Twinkle, Twinkle, Little
 * Star. A line draws itself between stars that are awake, so the picture comes out of the dark.
 * When the last is awake the picture sings the rest of the song, a star to a note from the left to
 * the right, and the sky bursts. A golden comet crosses now and then, and a touch on it wakes two
 * at once.
 */
export class StarCannon extends Wonder {
  readonly id = 'star-cannon' as const;
  protected readonly meter = new Meter(CANNON_STAR_COSTS);
  private readonly dress: Dress;
  private readonly shape: Constellation;
  private readonly sleepers: Sleepers;
  private readonly dreamers: Dreamer[];
  private readonly kinds: Bag<ShellKind>;
  private readonly schemes: Bag<Scheme>;
  private readonly light = new BurstLight();
  private readonly audience: Audience;
  private readonly cannon = new Cannon();
  private readonly hats = new Hats();
  private readonly comets = new Comets();
  private readonly seed: number;
  private setting!: Setting;
  private where!: Placement;
  private reach: Reach = { wake: 40, blast: 52 };
  private restAngle = -0.8;
  private shots: Shot[] = [];
  private orders: Order[] = [];
  private timers: { at: number; run: () => void }[] = [];
  private holding: { x: number; y: number; next: number } | null = null;
  private lastLaunch = -10;
  /**
   * How far past the usual a near miss is forgiven, in star radii. It grows with every miss and
   * goes when the player hits.
   */
  private assist = 0;
  /** How much the whole picture glows at the end, fading. */
  private glory = 0;
  /** The shape of light behind the stars, drawn for the size the picture has on this screen. */
  private art: HTMLCanvasElement | null = null;
  private artKey = '';
  /** How much of that shape shows, which rises as the stars wake. */
  private shown = 0;
  /** A brightening of the shape each time a star wakes, which fades at once. */
  private flare = 0;
  private readonly spot = { x: 0, y: 0 };
  private readonly pivot = { x: 0, y: 0 };
  private readonly mouth = { x: 0, y: 0, angle: 0 };

  constructor(env: WonderEnv) {
    super(env);
    this.dress = dressOf(env.look);
    this.shape = constellationOf(env.look);
    this.sleepers = new Sleepers(this.shape);
    this.dreamers = this.sleepers.stars.map((_, i) => this.dreamer(i));
    this.kinds = new Bag(this.dress.kinds, env.rng);
    this.schemes = new Bag(this.dress.schemes, env.rng);
    this.audience = new Audience(env.bank, env.rng, this.dress.dark);
    this.seed = env.rng.int(0x7fffffff);
    this.startMusic(this.dress.style);
  }

  override get bloom(): number {
    return this.env.calm ? 0.25 : 0.55;
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly stars: readonly {
      readonly x: number;
      readonly y: number;
      readonly awake: boolean;
      readonly order: number;
    }[];
    readonly awake: number;
    readonly r: number;
    readonly wake: number;
    readonly flipped: boolean;
    readonly orders: number;
    readonly shots: number;
    readonly comet: { readonly x: number; readonly y: number } | null;
    readonly cannon: { readonly x: number; readonly y: number };
  } {
    const c = this.comets.current;
    const m = this.cannon.muzzle();
    return {
      stars: this.sleepers.stars.map((s) => ({ x: s.x, y: s.y, awake: s.woke >= 0, order: s.order })),
      awake: this.sleepers.awake,
      r: this.where.r,
      wake: this.reach.wake,
      flipped: this.where.flipped,
      orders: this.orders.length,
      shots: this.shots.length,
      comet: c ? { x: c.x, y: c.y } : null,
      cannon: { x: m.x, y: m.y },
    };
  }

  protected arrange(view: View): void {
    const screen = { w: view.w, h: view.h, unit: view.unit };
    const layout = plan(screen, this.shape);
    this.where = layout.picture;
    const spots = hung(this.shape, layout.picture).spots;
    this.sleepers.place(spots);
    // A resize that leaves the picture the same size and way round keeps the shape it has.
    const key = `${Math.round(layout.picture.width)}${layout.picture.flipped ? 'f' : ''}`;
    if (key !== this.artKey) {
      this.art = silhouette(
        this.shape.name,
        this.dress,
        layout.picture.width,
        this.shape.aspect,
        layout.picture.flipped,
      );
      this.artKey = key;
    }
    const wake = clamp(layout.picture.r * 2.4, 26, 46);
    this.reach = { wake, blast: wake * 1.3 };
    const moon = this.dress.orb.kind === 'moon';
    const orb = orbSpot(spots, moon ? 20 : 50, screen, layout.feet - 76, moon ? 'sky' : 'horizon');
    this.setting = new Setting(this.dress, this.seed, view, orb);
    this.cannon.x = layout.cannon.x;
    this.cannon.y = layout.feet + 2;
    this.cannon.scale = layout.cannon.scale;
    this.audience.stand(this.env.herd, view.w, layout.cannon.x, layout.feet, 92, this.time, {
      side: 'right',
      maxScale: 0.62,
      step: 106,
    });
    // What was flying was flying over the old screen.
    this.shots = [];
    this.orders = [];
    this.hats.clear();
    this.holding = null;
    this.pointCannon();
  }

  protected reset(): void {
    this.sleepers.reset();
    this.dreamers.forEach((_, i) => {
      this.dreamers[i] = this.dreamer(i);
    });
    this.shots = [];
    this.orders = [];
    this.timers = [];
    this.holding = null;
    this.hats.clear();
    this.comets.reset();
    this.light.clear();
    this.audience.reset(this.time);
    this.cannon.reset();
    this.lastLaunch = -10;
    this.assist = 0;
    this.glory = 0;
    this.shown = 0;
    this.flare = 0;
    this.pointCannon();
  }

  /** Where the middle of the picture is. */
  private middle(): Spot {
    return { x: this.where.x + this.where.width / 2, y: this.where.y + (this.where.width * this.shape.aspect) / 2 };
  }

  /** The barrel rests pointing at the picture. */
  private pointCannon(): void {
    this.restAngle = aimAt(this.cannon.pivot(this.pivot), this.middle());
    this.cannon.aim(this.restAngle);
  }

  private dreamer(i: number): Dreamer {
    return {
      pop: new Spring(1, 1, 300, 13),
      tilt: new Spring(0, 0, 90, 5),
      phase: (i * 0.6180339) % 1,
      blinkAt: 1.5 + ((i * 0.37) % 1) * 3.5,
      blinkSince: -10,
      sang: -10,
    };
  }

  protected hint(): { x: number; y: number } | null {
    if (this.sleepers.done) return null;
    // A star that is still asleep, the one nearest the middle of the picture, so the hand shows the
    // player something they can wake.
    const mid = this.middle();
    let best: { x: number; y: number } | null = null;
    let nearest = Infinity;
    for (const s of this.sleepers.stars) {
      if (s.woke >= 0) continue;
      const d = Math.hypot(s.x - mid.x, s.y - mid.y);
      if (d < nearest) {
        nearest = d;
        best = s;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  protected press(p: Pointer): void {
    const friend = this.audience.at(p.x, p.y);
    if (friend) {
      this.cast(friend);
      return;
    }
    if (this.cannon.contains(p.x, p.y)) {
      this.volley();
      return;
    }
    if (this.comets.hits(p.x, p.y)) {
      this.catchComet();
      return;
    }
    this.holding = { x: p.x, y: p.y, next: this.time + HOLD_FIRST };
    this.tap(p.x, p.y);
  }

  protected override drag(p: Pointer): void {
    if (this.holding) {
      this.holding.x = p.x;
      this.holding.y = p.y;
    }
  }

  protected override lift(): void {
    this.holding = null;
  }

  /**
   * A touch in the sky: the cannon fires at the star nearest it that is asleep, or at the place if
   * there is none near.
   */
  private tap(x: number, y: number): void {
    if (this.orders.length >= 4 || this.shots.length >= 10) return;
    const target = this.target(x, y);
    const star = target.star;
    if (this.phase === 'after' && star >= 0) {
      this.order(target, { land: (px, py) => this.sing(star, px, py) });
      return;
    }
    this.order(target, {});
  }

  /**
   * Where a touch sends a shell. A touch near a sleeping star goes to the star, so a small finger
   * need not be exact. Every near miss widens that a little for the next, so the player is never
   * held up by a star they cannot quite hit, and a hit sets it back. A touch below the sky goes up
   * to the middle of the picture, above it.
   */
  private target(x: number, y: number): Spot & { star: number } {
    const mid = this.middle();
    const ty = y > this.setting.horizon - 10 ? mid.y : y;
    const star = this.sleepers.nearest(x, ty, this.where.r * (2.1 + this.assist), this.phase === 'play');
    if (star >= 0) {
      const s = this.sleepers.stars[star]!;
      return { x: s.x, y: s.y, star };
    }
    return { x, y: ty, star: -1 };
  }

  /** A touch on the cannon fires three shells, one after the other, at three of the sleepers. */
  private volley(): void {
    if (this.orders.length > 0) return;
    const asleep = this.sleepers.stars.map((s, i) => (s.woke < 0 ? i : -1)).filter((i) => i >= 0);
    const rng = this.env.rng;
    for (let k = 0; k < 3; k++) {
      let spot: Spot;
      if (asleep.length > 0) {
        const s = this.sleepers.stars[asleep.splice(rng.int(asleep.length), 1)[0]!]!;
        spot = { x: s.x, y: s.y };
      } else {
        const mid = this.middle();
        spot = {
          x: mid.x + rng.range(-1, 1) * this.where.width * 0.4,
          y: mid.y + rng.range(-1, 1) * this.where.width * this.shape.aspect * 0.4,
        };
      }
      this.order(spot, {});
    }
    this.env.sound.fx('whistle', { pan: this.pan(this.cannon.x), gain: 0.7 });
  }

  /** A friend throws her own magic from her horn at a sleeper. */
  private cast(friend: Member): void {
    const magic = MAGIC[friend.id];
    const horn = this.audience.cast(friend, this.time);
    this.env.sound.fx('tap', { pan: this.pan(friend.x) });
    const asleep = this.sleepers.stars.map((s, i) => (s.woke < 0 ? i : -1)).filter((i) => i >= 0);
    const rng = this.env.rng;
    let spot: Spot;
    if (asleep.length > 0) {
      const s = this.sleepers.stars[asleep[rng.int(asleep.length)]!]!;
      spot = { x: s.x, y: s.y };
    } else {
      const mid = this.middle();
      spot = {
        x: mid.x + rng.range(-1, 1) * this.where.width * 0.35,
        y: mid.y + rng.range(-1, 1) * this.where.width * this.shape.aspect * 0.35,
      };
    }
    this.fireFrom(
      horn,
      spot,
      magic.scheme,
      () => this.burst(spot.x, spot.y, { kind: magic.kind, scheme: magic.scheme, power: 1, wakes: true }),
      horn.after,
    );
  }

  /**
   * The player touched the golden comet: two stars wake, each with a shot of gold from where the
   * comet was.
   */
  private catchComet(): void {
    const comet = this.comets.take();
    if (!comet) return;
    const rng = this.env.rng;
    const rad = 34;
    this.fx.emit({
      x: comet.x,
      y: comet.y,
      life: 0.3,
      size: rad * 0.5,
      size1: rad * 2.4,
      color: COLORS.white,
      shape: 'glow',
      alpha: 0.9,
    });
    this.fx.emit({
      x: comet.x,
      y: comet.y,
      life: 0.6,
      size: rad,
      size1: rad * 4.4,
      color: COLORS.gold,
      shape: 'ring',
      width: 3,
      alpha: 0.8,
    });
    for (let i = 0; i < this.fx.count(26); i++) {
      const a = rng.range(0, TAU);
      const v = rng.range(40, 190);
      this.fx.emit({
        x: comet.x,
        y: comet.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(0.6, 1.3),
        size: rng.range(5, 9),
        size1: 1,
        color: lighten(COLORS.gold, 0.6),
        color1: COLORS.amber,
        shape: rng.next() < 0.4 ? 'star4' : 'spark',
        drag: 1.8,
        gravity: 24,
        twinkle: 12,
        hold: 0.3,
      });
    }
    this.light.add(comet.x, comet.y, GOLDEN.flash, 190, 0.9);
    this.flash(0.4, GOLDEN.flash);
    this.env.sound.fx('coin', { pan: this.pan(comet.x) });
    this.env.sound.fx('twinkle', { pan: this.pan(comet.x), delay: 0.08 });
    const asleep = this.sleepers.stars.map((s, i) => (s.woke < 0 ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < 2; k++) {
      if (asleep.length === 0) break;
      const star = asleep.splice(rng.int(asleep.length), 1)[0]!;
      const s = this.sleepers.stars[star]!;
      this.fireFrom(
        comet,
        s,
        GOLDEN,
        () => this.burst(s.x, s.y, { kind: 'star', scheme: GOLDEN, power: 0.8, size: 0.85, wakes: true }),
        k * 0.22,
      );
    }
  }

  /**
   * Asks the cannon for a shot. It swings round to the target first, and fires when it has nearly
   * got there.
   */
  private order(
    target: Spot,
    o: { kind?: ShellKind; scheme?: Scheme; power?: number; arriveAt?: number; land?: Land },
  ): void {
    const rng = this.env.rng;
    this.orders.push({
      target,
      kind: o.kind ?? this.kinds.next(),
      scheme: o.scheme ?? this.schemes.next(),
      power: o.power ?? rng.range(0.8, 1),
      arriveAt: o.arriveAt ?? null,
      land: o.land ?? null,
      due: -1,
    });
  }

  /**
   * Feeds the cannon its orders one at a time, and lets the barrel rest on the picture when there
   * are none.
   */
  private feed(): void {
    const next = this.orders[0];
    if (!next) {
      if (this.time - this.lastLaunch > 1.4) this.cannon.aim(this.restAngle + 0.05 * Math.sin(this.time * 0.7));
      return;
    }
    if (next.due < 0) {
      this.cannon.aim(aimAt(this.cannon.pivot(this.pivot), next.target));
      next.due = Math.max(this.time + 0.05 + Math.min(0.17, this.cannon.off * 0.5), this.lastLaunch + REPEAT);
      return;
    }
    if (this.time < next.due) return;
    this.orders.shift();
    this.launch(next);
  }

  private launch(o: Order): void {
    const rng = this.env.rng;
    const mouth = this.cannon.muzzle(this.mouth);
    const distance = Math.hypot(o.target.x - mouth.x, o.target.y - mouth.y);
    const dur = o.arriveAt === null ? flightSeconds(distance) : Math.max(0.28, o.arriveAt - this.time);
    this.cannon.fire(o.power);
    this.lastLaunch = this.time;
    // Sparks and a puff of smoke leave the mouth along the barrel.
    const c = o.scheme.colors[0]!;
    for (let i = 0; i < this.fx.count(14); i++) {
      const a = mouth.angle + rng.range(-0.45, 0.45);
      const v = rng.range(90, 270);
      this.fx.emit({
        x: mouth.x,
        y: mouth.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(0.25, 0.6),
        size: rng.range(5, 8),
        size1: 1,
        color: [255, 240, 200],
        color1: c,
        shape: 'spark',
        drag: 2.6,
        gravity: 60,
        twinkle: 10,
        hold: 0.2,
      });
    }
    for (let i = 0; i < this.fx.count(4); i++) {
      this.fx.emit({
        x: mouth.x + rng.range(-4, 4),
        y: mouth.y + rng.range(-4, 4),
        vx: Math.cos(mouth.angle) * rng.range(10, 50) + rng.range(-8, 8),
        vy: Math.sin(mouth.angle) * rng.range(10, 50) - rng.range(5, 20),
        life: rng.range(0.7, 1.2),
        size: rng.range(14, 20),
        size1: rng.range(30, 44),
        color: [200, 190, 232],
        alpha: 0.32,
        shape: 'glow',
        add: false,
        drag: 1.6,
      });
    }
    this.env.sound.fx('launch', { pan: this.pan(mouth.x), size: o.power });
    const land: Land =
      o.land ?? ((x, y) => void this.burst(x, y, { kind: o.kind, scheme: o.scheme, power: o.power, wakes: true }));
    this.shots.push({ arc: arcFrom(mouth, o.target), t: 0, dur, scheme: o.scheme, land, owed: 0 });
    this.audience.cheer(this.cannon.x, 0.6, this.time, this.view.w);
  }

  /**
   * Sends a shell from somewhere that is not the cannon, a friend's horn or a comet, to a place.
   */
  private fireFrom(from: Spot, to: Spot, sc: Scheme, land: Land | (() => unknown), after: number): void {
    const rng = this.env.rng;
    this.later(this.time + after, () => {
      this.shots.push({
        arc: loop(from, to, rng.range(-30, 30)),
        t: 0,
        dur: 0.55 + Math.min(0.3, Math.hypot(to.x - from.x, to.y - from.y) / 1400),
        scheme: sc,
        land: (x, y) => void land(x, y),
        owed: 0,
      });
      this.env.sound.fx('whoosh', { pan: this.pan(from.x), gain: 0.55 });
    });
  }

  private later(at: number, run: () => void): void {
    this.timers.push({ at, run });
  }

  /** A shell opens. Returns how many sleepers it woke. */
  private burst(x: number, y: number, o: Burst): number {
    const rng = this.env.rng;
    const size = o.size ?? 1;
    const radius = this.reach.blast * size * (0.85 + 0.25 * o.power);
    const calm = this.env.calm ? 0.6 : 1;
    const quiet = o.quiet === true;
    burstShell(this.fx, rng, {
      x,
      y,
      kind: o.kind,
      scheme: o.scheme,
      radius,
      power: o.power * (quiet ? 0.55 : 1),
      fine: Math.min(1, radius / 95),
    });
    // The spark of a shell opening is a small tinted glow, and none at all for a quiet one, so that
    // the shape is what is seen.
    if (!quiet)
      this.fx.emit({
        x,
        y,
        life: 0.2,
        size: radius * 0.12,
        size1: radius * 0.7,
        color: lighten(o.scheme.flash, 0.5),
        shape: 'glow',
        alpha: 0.38 * calm,
      });
    this.fx.emit({
      x,
      y,
      life: 0.45,
      size: radius * 0.5,
      size1: radius * 2.1,
      color: o.scheme.flash,
      shape: 'ring',
      width: quiet ? 1.6 : 2.4,
      alpha: (quiet ? 0.4 : 0.6) * calm,
    });
    this.light.add(x, y, o.scheme.flash, radius * 5, (quiet ? 0.4 : 0.7) + 0.25 * o.power);
    if (!quiet) {
      this.flash(0.22 + 0.2 * o.power, o.scheme.flash);
      this.shake(0.7 * o.power);
      this.audience.cheer(x, o.power, this.time, this.view.w);
      this.env.sound.fx('boom', { pan: this.pan(x), size: o.power * 0.8, delay: 0.02 });
    }
    if (!o.wakes) return 0;
    const near = this.sleepers.asleepNear(x, y, this.reach.wake);
    near.forEach((i, k) => {
      const s = this.sleepers.stars[i]!;
      const delay = Math.min(0.4, Math.hypot(s.x - x, s.y - y) / 320 + k * 0.05);
      this.wakeAt(i, this.time + delay);
    });
    if (near.length >= 2)
      this.env.sound.fx('ding', { pan: this.pan(x), step: Math.min(4, near.length - 2), delay: 0.12, gain: 0.6 });
    if (near.length > 0) {
      this.assist = 0;
    } else if (this.phase === 'play') {
      this.missed(x, y);
    }
    return near.length;
  }

  /**
   * A shell opened where nothing sleeps. The sleeper nearest it rolls over in its sleep, to say it
   * was close, and the next shot is forgiven a little more.
   */
  private missed(x: number, y: number): void {
    this.assist = Math.min(3, this.assist + 0.6);
    const i = this.sleepers.nearest(x, y, this.reach.wake * 2.4, true);
    if (i < 0) return;
    const d = this.dreamers[i]!;
    d.tilt.kick((this.env.rng.next() < 0.5 ? -1 : 1) * 6);
    d.pop.kick(2.4);
    this.env.sound.fx('tap', { pan: this.pan(this.sleepers.stars[i]!.x), gain: 0.35, pitch: -5 });
  }

  /**
   * Wakes a star: it is awake from `time` on, and what the wake looks and sounds like happens then.
   */
  private wakeAt(i: number, time: number, quiet = false): void {
    if (!this.sleepers.wake(i, time)) return;
    const order = this.sleepers.stars[i]!.order;
    this.later(time, () => this.popAwake(i, order, quiet));
  }

  /**
   * The moment a star wakes: it pops, its cap flies off, it twinkles, and it sings the next note of
   * the song.
   */
  private popAwake(i: number, order: number, quiet: boolean): void {
    const rng = this.env.rng;
    const s = this.sleepers.stars[i]!;
    const d = this.dreamers[i]!;
    const r = this.where.r;
    d.pop.x = 0.45;
    d.pop.v = 0;
    d.tilt.kick((rng.next() < 0.5 ? -1 : 1) * 7);
    const cap = capAt(this.dress.figure, r);
    const side = rng.next() < 0.5 ? -1 : 1;
    this.hats.toss(
      s.x + cap.x,
      s.y + cap.y,
      cap.rot,
      this.dress.caps[i % this.dress.caps.length]!,
      cap.size,
      side * rng.range(40, 95),
      -rng.range(150, 230),
      side * rng.range(2.5, 6),
    );
    const awake = this.dress.awake;
    this.fx.emit({
      x: s.x,
      y: s.y,
      life: 0.5,
      size: r * 0.8,
      size1: r * 3.6,
      color: awake.core,
      shape: 'ring',
      width: 2.2,
      alpha: 0.75,
    });
    this.fx.emit({
      x: s.x,
      y: s.y,
      life: 0.35,
      size: r * 1.2,
      size1: r * 4,
      color: awake.glow,
      shape: 'glow',
      alpha: 0.7,
    });
    for (let k = 0; k < this.fx.count(9); k++) {
      const a = rng.range(0, TAU);
      const v = rng.range(40, 120);
      this.fx.emit({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 10,
        life: rng.range(0.5, 1),
        size: rng.range(4, 7),
        size1: 1,
        color: lighten(awake.core, 0.4),
        color1: awake.rim,
        shape: rng.next() < 0.4 ? 'star4' : 'spark',
        drag: 2.2,
        gravity: 30,
        twinkle: 12,
        hold: 0.3,
      });
    }
    this.light.add(s.x, s.y, awake.glow, r * 8, 0.3);
    this.flare = Math.min(1, this.flare + 0.6);
    const pan = this.pan(s.x);
    this.env.sound.fx('poof', { pan, gain: 0.5 });
    this.env.sound.fx('twinkle', { pan, gain: 0.8, pitch: (order % 5) - 2 });
    if (!quiet) this.env.sound.note('bell', SONG[order % WAKING_NOTES]!, { pan, gain: 0.95, seconds: 1 });
    this.earn(1);
  }

  /** A star sings: it brightens and bounces, and its note rings. */
  private sing(i: number, x: number, y: number, note: number | null = null): void {
    const s = this.sleepers.stars[i]!;
    const d = this.dreamers[i]!;
    d.sang = this.time;
    d.pop.kick(8);
    const r = this.where.r;
    this.fx.emit({
      x: s.x,
      y: s.y,
      life: 0.55,
      size: r,
      size1: r * 3.8,
      color: lighten(this.dress.awake.glow, 0.5),
      shape: 'ring',
      width: 2,
      alpha: 0.7,
    });
    for (let k = 0; k < this.fx.count(7); k++) {
      const a = this.env.rng.range(0, TAU);
      const v = this.env.rng.range(30, 100);
      this.fx.emit({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 14,
        life: this.env.rng.range(0.5, 1),
        size: this.env.rng.range(4, 7),
        size1: 1,
        color: lighten(this.dress.awake.core, 0.5),
        color1: this.dress.awake.rim,
        shape: 'star4',
        drag: 2,
        gravity: 26,
        twinkle: 12,
        hold: 0.3,
      });
    }
    this.light.add(s.x, s.y, this.dress.awake.glow, r * 7, 0.35);
    const rank = this.sleepers.leftToRight().indexOf(i);
    const midi = note ?? noteAt(rank / (this.sleepers.count - 1), 60, 15);
    this.env.sound.note('bell', midi, { pan: this.pan(s.x), gain: 0.95, seconds: 1 });
    this.env.sound.fx('twinkle', { pan: this.pan(s.x), gain: 0.5, delay: 0.03 });
    // A shell that was sent at a star does not open when it is only there to make a note, but a
    // small shape does.
    this.burst(x, y, {
      kind: this.kinds.next(),
      scheme: this.schemes.next(),
      power: 0.55,
      size: 0.6,
      wakes: false,
      quiet: true,
    });
  }

  protected finale(): void {
    this.script.clear();
    this.orders = [];
    this.holding = null;
    this.env.sound.fx('swell');
    // Whoever is still asleep wakes now, from the left to the right, so the picture is whole before
    // it sings.
    const across = this.sleepers.leftToRight();
    let when = this.time + 0.15;
    for (const i of across) {
      if (this.sleepers.stars[i]!.woke >= 0) continue;
      this.wakeAt(i, when, true);
      when += 0.07;
    }
    const start = Math.max(1.5, when - this.time + 0.7);
    // The picture sings the rest of the tune. Each note is a star, from the left to the right, and
    // a shell from the cannon arrives on it just as it sounds.
    let beats = 0;
    across.forEach((star, k) => {
      const length = TWINKLE.notes[WAKING_NOTES + k]?.[1] ?? 1;
      const noteAt0 = start + beats * BEAT;
      beats += length;
      const note = SONG[WAKING_NOTES + k]!;
      this.script.at(noteAt0 - LEAD, () => {
        const s = this.sleepers.stars[star]!;
        this.order(
          { x: s.x, y: s.y },
          { arriveAt: this.time + LEAD, power: 0.7, land: (x, y) => this.sing(star, x, y, note) },
        );
      });
    });
    const end = start + beats * BEAT;
    const grand = end - BEAT * 1.6;
    this.script.at(grand, () => this.grand());
    this.script.at(grand + 0.2, () => {
      this.env.sound.fx('cheer');
      this.audience.celebrate(this.time);
    });
    this.script.at(end + 3, () => this.endFinale());
    // The picture is lit from the first note on, and glows brightest at the end.
    this.script.at(start - 0.3, () => {
      this.glory = Math.max(this.glory, 0.6);
    });
  }

  /**
   * The end of the song: a great shape in the open sky beside the picture, two more beside it,
   * shooting stars, and the whole sky lit.
   */
  private grand(): void {
    const open = openSky(
      { w: this.view.w, h: this.view.h, unit: this.view.unit },
      this.where,
      this.shape.aspect,
      this.setting.horizon - 20,
    );
    const sc = this.dress.schemes;
    const big = clamp(open.r / (this.reach.blast * 1.2), 1, 2.2);
    this.glory = 1;
    this.burst(open.x, open.y, {
      kind: this.dress.figure === 'star' ? 'star' : 'heart',
      scheme: sc[0]!,
      power: 1.5,
      size: big,
      wakes: false,
    });
    [-1, 1].forEach((side, k) => {
      this.later(this.time + 0.35 + k * 0.2, () => {
        const size = Math.max(0.8, big * 0.6);
        const reach = this.reach.blast * size * 1.2;
        const x = clamp(open.x + side * open.r * 0.85, reach + 8, this.view.w - reach - 8);
        const y = clamp(open.y - side * open.r * 0.35, reach + 8, this.setting.horizon - reach);
        this.burst(x, y, {
          kind: this.dress.kinds[(k + 1) % this.dress.kinds.length]!,
          scheme: sc[(k + 1) % sc.length]!,
          power: 1.2,
          size,
          wakes: false,
        });
      });
    });
    this.flash(0.9, this.dress.awake.glow);
    this.shake(2.4);
    this.env.sound.fx('boom', { size: 1 });
    // Shooting stars rain across the sky, one after another.
    for (let i = 0; i < 9; i++) {
      this.later(this.time + 0.2 + i * 0.28, () => this.meteor());
    }
  }

  /** A shooting star across the sky, drawn by the particles alone. */
  private meteor(): void {
    const rng = this.env.rng;
    const { w } = this.view;
    const fromLeft = rng.next() < 0.5;
    const x = fromLeft ? rng.range(-20, w * 0.5) : rng.range(w * 0.5, w + 20);
    const y = rng.range(10, this.setting.horizon * 0.55);
    const speed = rng.range(380, 520);
    const slope = rng.range(0.25, 0.6);
    const way = fromLeft ? 1 : -1;
    const c = this.dress.awake.core;
    this.fx.emit({
      x,
      y,
      vx: way * speed,
      vy: speed * slope,
      life: rng.range(0.9, 1.3),
      size: rng.range(8, 12),
      size1: 3,
      color: c,
      color1: this.dress.awake.glow,
      shape: 'spark',
      tail: 0.5,
      halo: 3,
      twinkle: 0,
      hold: 0.55,
      drag: 0.1,
    });
    this.env.sound.fx('whoosh', { pan: way * -0.4, gain: 0.25, pitch: 7 });
  }

  protected tick(dt: number): void {
    const rng = this.env.rng;
    this.light.update(dt);
    this.setting.update(dt);
    this.audience.update(this.time);
    this.cannon.tick(dt);
    this.hats.update(dt);
    this.glory = damp(this.glory, 0, this.phase === 'finale' ? 0.25 : 0.7, dt);
    // The shape of light behind the stars comes up as they wake, faint at first and clear before
    // the last.
    this.shown = damp(this.shown, (this.sleepers.awake / this.sleepers.count) ** 1.3, 3.5, dt);
    this.flare = damp(this.flare, 0, 5, dt);
    for (const d of this.dreamers) {
      d.pop.step(dt);
      d.tilt.step(dt);
    }
    this.runTimers();
    this.feed();
    const held = this.holding;
    if (held && this.time >= held.next) {
      held.next = this.time + HOLD_EVERY;
      this.tap(held.x, held.y);
    }
    this.flyShots(dt);
    const sky = {
      w: this.view.w,
      top: Math.max(96 / this.view.unit, 40),
      bottom: Math.max(150, this.setting.horizon * 0.5),
      calm: this.env.calm,
    };
    this.comets.update(dt, this.phase !== 'finale', sky, rng);
    const comet = this.comets.current;
    if (comet && rng.next() < dt * 40) {
      this.fx.emit({
        x: comet.x - rng.range(0, 20),
        y: comet.y + rng.range(-5, 5),
        vx: -comet.vx * 0.06 + rng.range(-14, 14),
        vy: rng.range(-6, 26),
        life: rng.range(0.6, 1.2),
        size: rng.range(4, 8),
        size1: 1,
        color: [255, 246, 200],
        color1: COLORS.amber,
        shape: rng.next() < 0.4 ? 'star4' : 'spark',
        drag: 1.2,
        twinkle: 12,
        hold: 0.3,
      });
    }
  }

  private runTimers(): void {
    for (let i = 0; i < this.timers.length; ) {
      const timer = this.timers[i]!;
      if (timer.at > this.time) {
        i++;
        continue;
      }
      this.timers.splice(i, 1);
      timer.run();
    }
  }

  private flyShots(dt: number): void {
    const rng = this.env.rng;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt;
      const u = Math.min(1, s.t / s.dur);
      const here = at(s.arc, u, this.spot);
      s.owed += dt * 90;
      while (s.owed >= 1) {
        s.owed -= 1;
        this.fx.emit({
          x: here.x + rng.range(-1.5, 1.5),
          y: here.y + rng.range(-1.5, 1.5),
          vx: rng.range(-18, 18),
          vy: rng.range(8, 40),
          life: rng.range(0.3, 0.7),
          size: rng.range(5, 8),
          size1: 1,
          color: [255, 238, 196],
          color1: s.scheme.colors[0]!,
          shape: 'spark',
          drag: 1.8,
          twinkle: 12,
          hold: 0.2,
        });
      }
      this.fx.emit({ x: here.x, y: here.y, life: 0.08, size: 18, color: [255, 246, 214], shape: 'glow', alpha: 0.85 });
      if (u >= 1) {
        this.shots.splice(i, 1);
        s.land(s.arc.x1, s.arc.y1);
      }
    }
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  protected paintBack(p: Painter): void {
    this.setting.paint(p, this.light);
    this.comets.paint(p.ctx, p.t);
    this.paintPicture(p);
    this.hats.paint(p.ctx);
  }

  protected paintFront(p: Painter): void {
    this.audience.paint(p, this.light, this.time);
    this.cannon.paint(p.ctx, this.dress, p.t);
    this.paintShots(p.ctx);
  }

  /**
   * The lines between stars that are awake, the glow of those stars, the stars themselves, and the
   * z's of the ones still asleep.
   */
  private paintPicture(p: Painter): void {
    const g = p.ctx;
    const { stars } = this.sleepers;
    const t = this.time;
    const r = this.where.r;
    this.paintShape(g, p);
    this.shape.lines.forEach(([a, b], n) => {
      const from = this.sleepers.source(a, b);
      const to = from === a ? b : a;
      paintLink(g, this.dress, stars[from]!, stars[to]!, this.sleepers.drawn(a, b, t), p.t, (n * 0.37) % 1, p.calm);
    });
    const beat = this.band ? this.band.pulse(4) * (this.phase === 'finale' ? 1 : 0.4) : 0;
    g.globalCompositeOperation = 'lighter';
    stars.forEach((s, i) => {
      const d = this.dreamers[i]!;
      const since = t - s.woke;
      if (s.woke < 0 || since < 0) {
        // A sleeper gives off a faint glow of its own, so the picture is there to be found.
        glowAt(g, s.x, s.y, r * 3.2, this.dress.asleep.body, 0.1 + 0.05 * Math.sin(p.t * 0.9 + d.phase * TAU));
        return;
      }
      const sang = clamp(1 - (t - d.sang) / 0.7);
      const open = smooth(since / 0.3);
      const alpha = open * (0.5 + 0.14 * beat) + 0.3 * sang + 0.25 * this.glory;
      glowAt(g, s.x, s.y, r * (4.4 + 1.6 * sang), this.dress.awake.glow, alpha);
    });
    g.globalCompositeOperation = 'source-over';
    const look: { -readonly [K in keyof SleeperLook]: SleeperLook[K] } = {
      x: 0,
      y: 0,
      r,
      open: 0,
      pop: 1,
      tilt: 0,
      blink: 0,
      breath: 0,
      cap: 1,
      capColor: COLORS.white,
      shine: 0,
    };
    stars.forEach((s, i) => {
      const d = this.dreamers[i]!;
      const since = t - s.woke;
      const awake = s.woke >= 0 && since >= 0;
      look.open = awake ? smooth(since / 0.3) : 0;
      look.x = s.x;
      look.y = s.y + (awake ? 0 : Math.sin(p.t * 0.9 + d.phase * TAU) * 1.3);
      look.pop = d.pop.x * (awake ? 1 + 0.03 * Math.sin(p.t * 2.6 + d.phase * TAU) : 1);
      look.tilt = d.tilt.x + (awake ? 0.05 : 0.035) * Math.sin(p.t * (awake ? 1.7 : 0.8) + d.phase * TAU);
      look.breath = (p.t / 3.6 + d.phase) % 1;
      look.cap = awake ? clamp(1 - since / 0.1) : 1;
      look.capColor = this.dress.caps[i % this.dress.caps.length]!;
      look.shine = clamp(1 - (t - d.sang) / 0.7) * 0.9 + 0.35 * this.glory * (awake ? 1 : 0);
      look.blink = awake ? this.blink(d, p.t) : 0;
      paintSleeper(g, this.dress, look);
    });
    // The z's: each sleeper breathes out one now and then, which rises, drifts and fades.
    stars.forEach((s, i) => {
      if (s.woke >= 0 && t - s.woke >= 0) return;
      const d = this.dreamers[i]!;
      const u = (p.t * (p.calm ? 0.14 : 0.2) + d.phase) % 1;
      paintZ(
        g,
        s.x + r * (0.85 + 0.55 * u),
        s.y - r * (0.75 + 1.4 * u),
        r * (0.3 + 0.24 * u),
        hump(u) * 0.8,
        [236, 240, 255],
      );
    });
  }

  /**
   * The shape of light behind the stars: the unicorn, or the heart, as clear as the stars that are
   * awake have made it.
   */
  private paintShape(g: CanvasRenderingContext2D, p: Painter): void {
    const art = this.art;
    const alpha =
      0.9 * this.shown +
      0.12 * this.flare +
      0.1 * this.glory +
      (this.band && this.phase === 'finale' ? 0.04 * this.band.pulse(4) : 0);
    if (!art || alpha < 0.01) return;
    const pad = GLOW_ROOM * this.where.width;
    const was = g.globalAlpha;
    g.globalAlpha = clamp(alpha) * (p.calm ? 0.9 : 1);
    g.drawImage(
      art,
      this.where.x - pad,
      this.where.y - pad,
      this.where.width + pad * 2,
      this.where.width * this.shape.aspect + pad * 2,
    );
    g.globalAlpha = was;
  }

  /** How shut an awake star's eyes are: it blinks every few seconds, quickly. */
  private blink(d: Dreamer, t: number): number {
    if (t >= d.blinkAt) {
      d.blinkSince = t;
      d.blinkAt = t + 2.4 + ((d.phase * 7.3) % 1) * 3.4;
    }
    const u = (t - d.blinkSince) / 0.16;
    return u >= 0 && u <= 1 ? hump(u) : 0;
  }

  /** The shells in the air: a hot bright head with a glow. Their trails are the particles. */
  private paintShots(g: CanvasRenderingContext2D): void {
    if (this.shots.length === 0) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of this.shots) {
      const u = Math.min(1, s.t / s.dur);
      const here = at(s.arc, u, this.spot);
      glowAt(g, here.x, here.y, 40, s.scheme.flash, 0.7);
      glowAt(g, here.x, here.y, 20, [255, 248, 224], 0.95, 'spark');
    }
    g.restore();
    g.fillStyle = css([255, 252, 236]);
    for (const s of this.shots) {
      const here = at(s.arc, Math.min(1, s.t / s.dur), this.spot);
      g.beginPath();
      g.arc(here.x, here.y, 3.4, 0, TAU);
      g.fill();
    }
  }
}
