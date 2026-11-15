import type { UnicornId } from '../../shared/ids';
import type { SpriteBank } from '../engine/bank';
import { drawPic } from '../engine/bank';
import { Cast, MAX_HERD } from '../engine/cast';
import { COLORS, css, lighten, type RGB } from '../engine/color';
import { clamp, damp, Spring, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import { Novelty, scaledCosts } from '../engine/novelty';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import { Runs, SWEEP } from '../engine/runs';
import type { Pointer, Quality } from '../engine/stage';
import { scaleNote } from '../music';
import { POND } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { PARTY_COLORS, ringAt } from './balloons/pops';
import { comet } from './fountain/effects';
import { FRIEND_JET, JEWELS, ROOT } from './fountain/recipes';
import { PondArt } from './lily/art';
import { Lotuses } from './lily/bloom';
import { type Body, Hopper, type Point } from './lily/hop';
import {
  HOME,
  LOTUS_COUNT,
  PAD_COUNT,
  type Pad,
  type Plan,
  padAt,
  planOf,
  type Stand,
  standingOn,
  standsOf,
} from './lily/layout';

/**
 * A frog on a pond. Eight lily pads wind across the water, and seven of them carry a lotus bud, one
 * for each colour of the rainbow and each a note of a scale going up. A touch on a pad sends the
 * frog hopping to it, and a touch on several sends her along them; where she lands, the pad dips,
 * the water rings, the note sounds and the lotus opens. When all seven are open the pond is whole
 * and sings, two more frogs come out of the reeds to join in, and then the pond goes quiet and the
 * lotuses close one by one so that the player can open them all again. The more of them are open
 * the nearer evening comes. A friend who is touched sends a comet to the lotus of her own colour
 * and calls the frog there. The ducks, the dragonflies, the fish and the other frogs all answer a
 * touch. When the stars are full, the frog hops the whole way along the pond, the lotuses all open
 * at once, and it is night with a great many fireflies.
 */

/**
 * What each star costs, for a herd of six. A smaller herd has less to bring, so each star is a
 * little nearer.
 */
const LILY_STAR_COSTS = [12, 38, 82, 142, 217] as const;

type Thing = 'hop' | 'bloom' | 'sweep' | 'scale' | 'pond' | 'ribbit' | 'duck' | 'fish' | 'dragonfly' | 'friend' | 'pal';

/** What each thing is worth the first time, in points. */
const WORTH: Readonly<Record<Thing, number>> = {
  hop: 1.2,
  bloom: 2.6,
  sweep: 0.9,
  scale: 3,
  pond: 3,
  ribbit: 1.4,
  duck: 1.8,
  fish: 1.8,
  dragonfly: 1.8,
  friend: 3.6,
  pal: 1.6,
};

const CAST_SECONDS = 0.8;
const CAST_RELEASE = 0.26;
const COMET = 0.42;
/** The seconds after the whole pond sings before the lotuses begin to close. */
const SING_SECONDS = 4.4;
const MOST_RIPPLES = 30;
/** The seconds between a frog being touched and being able to ribbit loudly again. */
const RIBBIT_REST = 0.5;
const SEAT_PAL_OFFSET = 15;

const FROGS = ['green', 'teal', 'sunny'] as const;
type Look = (typeof FROGS)[number];

interface Ripple {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  readonly size: number;
  readonly color: RGB;
}

interface Duck {
  x: number;
  y: number;
  speed: number;
  readonly look: 'white' | 'mallard';
  quackUntil: number;
  readonly phase: number;
}

interface Dragonfly {
  readonly look: 'sapphire' | 'ruby' | 'jade';
  readonly phase: number;
  /** Where it hovers, in the fraction of the pond. */
  u: number;
  v: number;
  fleeUntil: number;
  fromU: number;
  fromV: number;
  toU: number;
  toV: number;
  moveAt: number;
}

interface Fish {
  readonly x: number;
  readonly y: number;
  readonly dir: number;
  readonly at: number;
  readonly look: 'koi' | 'gold';
}

export class LilyHop extends Wonder {
  readonly id = 'lily-hop' as const;
  protected readonly meter = new Meter(scaledCosts(LILY_STAR_COSTS, this.env.herd.length));
  private readonly novelty = new Novelty<Thing>(WORTH);
  private readonly frog = new Hopper(HOME);
  private readonly pals: Hopper[] = [new Hopper(PAD_COUNT), new Hopper(PAD_COUNT + 1)];
  private readonly lotuses = new Lotuses();
  private readonly runs = new Runs(LOTUS_COUNT, 1.7);
  private readonly cast = new Cast();
  private readonly art: PondArt;
  private plan!: Plan;
  private stands: Stand[] = [];
  private artFor = 0;
  private artDirty = true;
  private detail = true;
  private readonly dips: Spring[] = Array.from({ length: PAD_COUNT + 2 }, () => new Spring(0, 0, 150, 9));
  private ripples: Ripple[] = [];
  private ducks: Duck[] = [];
  private dragons: Dragonfly[] = [];
  private fish: Fish[] = [];
  /** How far evening has come, 0 to 1. */
  private dusk = 0;
  private ribbitAt = -9;
  private croakAt = -9;
  private lastFish = -9;
  private fishIn = 5;
  private fireflyIn = 1;
  private lastLandSound = -9;
  /** When each lotus was told to bloom, so that its petals can shed a little as it opens. */
  private readonly bloomedAt: number[] = Array.from({ length: LOTUS_COUNT }, () => -9);
  private readonly shine: number[] = Array.from({ length: LOTUS_COUNT }, () => 0);
  private lastFriend = -1;
  private choirUntil = -9;
  private singing = false;
  private dragPad = -1;
  /** What the player has done, so that the hand can show them what else there is. */
  private hops = 0;
  private ribbits = 0;
  private friendsTouched = 0;
  private waterTouched = 0;
  private palsOut = false;

  constructor(env: WonderEnv) {
    super(env);
    this.art = new PondArt(env.bank, env.rng);
    this.startMusic(POND);
    this.ducks = [
      { x: 0.16, y: 0, speed: 8, look: 'white', quackUntil: -9, phase: 0.4 },
      { x: 0.9, y: 0, speed: -7, look: 'mallard', quackUntil: -9, phase: 2.1 },
    ];
    this.dragons = [
      {
        look: 'sapphire',
        phase: 0.3,
        u: 0.3,
        v: 0.4,
        fleeUntil: -9,
        fromU: 0.3,
        fromV: 0.4,
        toU: 0.3,
        toV: 0.4,
        moveAt: -9,
      },
      {
        look: 'ruby',
        phase: 2.5,
        u: 0.72,
        v: 0.55,
        fleeUntil: -9,
        fromU: 0.72,
        fromV: 0.55,
        toU: 0.72,
        toV: 0.55,
        moveAt: -9,
      },
    ];
  }

  override get bloom(): number {
    return this.env.calm ? 0.2 : 0.4;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
  }

  protected override musicEnergy(): number {
    const open = this.lotuses.count / LOTUS_COUNT;
    return Math.min(1, super.musicEnergy() + (this.phase === 'play' ? 0.3 * open : 0));
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly pads: readonly {
      readonly x: number;
      readonly y: number;
      readonly rx: number;
      readonly ry: number;
      readonly lotus: number;
      readonly open: boolean;
      readonly bloom: number;
    }[];
    readonly frog: {
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly at: number;
      readonly target: number;
      readonly busy: boolean;
    };
    readonly pals: readonly { readonly x: number; readonly y: number; readonly r: number; readonly at: number }[];
    readonly friends: readonly { readonly id: UnicornId; readonly x: number; readonly y: number; readonly r: number }[];
    readonly ducks: readonly { readonly x: number; readonly y: number; readonly r: number }[];
    readonly dragonflies: readonly { readonly x: number; readonly y: number; readonly r: number }[];
    readonly open: number;
    readonly whole: boolean;
    readonly dusk: number;
    readonly size: { readonly w: number; readonly h: number };
  } {
    const frog = this.frogBody();
    return {
      pads: this.plan.pads.map((pad) => ({
        x: pad.x,
        y: pad.y,
        rx: pad.rx,
        ry: pad.ry,
        lotus: pad.lotus,
        open: pad.lotus >= 0 && this.lotuses.isOpen(pad.lotus),
        bloom: pad.lotus >= 0 ? this.lotuses.open[pad.lotus]! : 0,
      })),
      frog: {
        x: frog.x,
        y: frog.y - this.frogHeight() * 0.5 - frog.lift,
        r: this.frogReach(),
        at: this.frog.at,
        target: this.frog.target,
        busy: this.frog.busy,
      },
      pals: this.pals.map((h, i) => {
        const b = this.palBody(i);
        return { x: b.x, y: b.y - this.frogHeight() * 0.4 - b.lift, r: this.frogReach() * 0.85, at: h.at };
      }),
      friends: this.stands.map((s, i) => ({
        id: this.env.herd[i]!,
        x: s.x,
        y: s.y - 34 * s.scale,
        r: this.friendReach(s),
      })),
      ducks: this.ducks.map((d) => ({ x: this.duckX(d), y: this.duckY(d), r: 22 })),
      dragonflies: this.dragons.map((d) => {
        const at = this.dragonAt(d);
        return { x: at.x, y: at.y, r: 24 };
      }),
      open: this.lotuses.count,
      whole: this.lotuses.whole,
      dusk: this.dusk,
      size: { w: this.plan.w, h: this.plan.h },
    };
  }

  protected arrange(view: View): void {
    this.plan = planOf(view.w, view.h, view.unit);
    this.stands = standsOf(Math.min(MAX_HERD, this.env.herd.length), this.plan);
    this.artDirty = true;
    this.ripples = [];
    this.fish = [];
  }

  private ensureArt(k: number): void {
    if (!this.artDirty && this.artFor === k) return;
    this.artDirty = false;
    this.artFor = k;
    this.art.place(this.plan, k);
  }

  protected reset(): void {
    this.frog.reset(HOME);
    this.pals[0]!.reset(PAD_COUNT);
    this.pals[1]!.reset(PAD_COUNT + 1);
    this.lotuses.reset();
    this.runs.reset();
    this.cast.reset();
    this.novelty.reset();
    for (const d of this.dips) {
      d.x = 0;
      d.v = 0;
    }
    this.ripples = [];
    this.fish = [];
    this.dusk = 0;
    this.ribbitAt = -9;
    this.croakAt = -9;
    this.lastFish = -9;
    this.fishIn = 5;
    this.bloomedAt.fill(-9);
    this.shine.fill(0);
    this.lastFriend = -1;
    this.choirUntil = -9;
    this.singing = false;
    this.dragPad = -1;
    this.hops = 0;
    this.ribbits = 0;
    this.friendsTouched = 0;
    this.waterTouched = 0;
    this.palsOut = false;
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  private friendReach(s: Stand): number {
    return Math.max(24, 52 * s.scale);
  }

  private facingOf(i: number): number {
    return this.stands[i]!.x < this.plan.w / 2 ? 1 : -1;
  }

  private hornOf(i: number): Point {
    const s = this.stands[i]!;
    const id = this.env.herd[i]!;
    const face = this.facingOf(i);
    const horn = this.env.bank?.unicorn(id, 'cast', 'east', CAST_RELEASE)?.anchors.horn;
    if (horn) return { x: s.x + horn[0] * s.scale * face, y: s.y + horn[1] * s.scale };
    return { x: s.x + 26 * s.scale * face, y: s.y - 96 * s.scale };
  }

  private frogHeight(): number {
    return 42 * this.plan.frog;
  }

  private frogReach(): number {
    return Math.max(26, 30 * this.plan.frog);
  }

  /** Where a place is, for the frog: a pad, or a seat among the reeds. */
  private spot(place: number, shift = 0): Point {
    if (place < PAD_COUNT) {
      const s = standingOn(this.plan.pads[place]!);
      return { x: s.x + shift, y: s.y };
    }
    const seat = this.plan.seats[place - PAD_COUNT]!;
    return { x: seat.x, y: seat.y };
  }

  private frogBody(): Body {
    return this.frog.body(this.time, (place) => this.spot(place));
  }

  private palBody(i: number): Body {
    const shift = (i === 0 ? -1 : 1) * SEAT_PAL_OFFSET * this.plan.frog * 0.9;
    return this.pals[i]!.body(this.time, (place) => this.spot(place, shift));
  }

  /** Where a lotus's flower is, at its middle. */
  private lotusAt(lotus: number): Point {
    const pad = this.plan.pads[lotus + 1]!;
    return { x: pad.x, y: pad.y - pad.ry * 0.3 - this.plan.lotusHeight * 0.5 };
  }

  private padOf(lotus: number): number {
    return lotus + 1;
  }

  private duckX(d: Duck): number {
    return d.x * this.plan.w;
  }

  private duckY(d: Duck): number {
    return (
      this.plan.horizon +
      (this.plan.portrait ? 20 : 17) +
      Math.sin(this.time * 0.9 + d.phase) * 1.2 +
      (d.look === 'mallard' ? (this.plan.portrait ? 18 : 9) : 0)
    );
  }

  /** Where a dragonfly is: hovering about a place, going to another when it has a mind to. */
  private dragonAt(d: Dragonfly): Point {
    const plan = this.plan;
    const now = this.time;
    const move = clamp((now - d.moveAt) / (d.fleeUntil > now ? 0.5 : 1.8));
    const ease = move * move * (3 - 2 * move);
    const u = d.fromU + (d.toU - d.fromU) * ease;
    const v = d.fromV + (d.toV - d.fromV) * ease;
    const top = plan.horizon - 6;
    const bottom = plan.shore - 56;
    return {
      x: u * plan.w + Math.sin(now * 1.3 + d.phase) * 16,
      y: top + v * (bottom - top) + Math.sin(now * 2.1 + d.phase * 1.7) * 7,
    };
  }

  protected tick(dt: number): void {
    const now = this.time;
    const plan = this.plan;
    this.lotuses.step(dt, now);
    const hooks = {
      left: (from: number, to: number, hop: { flight: number }) => this.sprang(from, to, hop.flight),
      landed: (place: number) => this.landed(place),
    };
    this.frog.step(now, (place) => this.spot(place), hooks);
    this.pals.forEach((h, i) => {
      const shift = (i === 0 ? -1 : 1) * SEAT_PAL_OFFSET * plan.frog * 0.9;
      h.step(now, (place) => this.spot(place, shift), {
        landed: (place) => this.palLanded(place),
        left: (_from, _to, hop) =>
          this.env.sound.fx('boing', { gain: 0.14, pan: this.pan(this.palBody(i).x), pitch: 5 - hop.flight * 3 }),
      });
    });
    for (const d of this.dips) d.step(dt);
    for (let i = 0; i < LOTUS_COUNT; i++)
      this.shine[i] = damp(this.shine[i]!, this.lotuses.open[i]! > 0.8 ? 1 : 0, 2, dt);
    // Evening comes as the lotuses open.
    const want = this.phase === 'finale' || this.phase === 'after' ? 1 : (this.lotuses.count / LOTUS_COUNT) * 0.72;
    this.dusk = damp(this.dusk, want, this.phase === 'finale' ? 0.9 : 0.7, dt);
    this.ripples = this.ripples.filter((r) => now - r.at < 1.3);
    this.fish = this.fish.filter((f) => now - f.at < 0.9);
    if (this.phase === 'play' && this.lotuses.completed()) this.pondWhole();
    if (this.singing && this.phase === 'play' && now > this.choirUntil) {
      this.singing = false;
      this.lotuses.lull(now);
      this.script.at(this.script.now + Lotuses.LULL_SECONDS + 1.2, () => this.palsHome());
    }
    // The friends.
    this.stands.forEach((s, i) => {
      const since = this.cast.sinceCheer(i);
      const cheering = since < CAST_SECONDS;
      this.cast.set(
        i,
        {
          x: s.x,
          y: s.y,
          mode: cheering ? 'cheer' : 'idle',
          face: this.facingOf(i),
          clock: cheering ? since : now + i * 0.7,
        },
        dt,
      );
    });
    this.cast.tick(dt);
    // Ducks drift to the edge of the pond and turn.
    for (const d of this.ducks) {
      d.x += (d.speed * dt) / plan.w;
      if (d.x > 0.94) d.speed = -Math.abs(d.speed);
      if (d.x < 0.06) d.speed = Math.abs(d.speed);
    }
    this.dragons.forEach((d) => {
      this.wander(d);
    });
    // Fireflies, once evening has begun; fish that jump by themselves, and a frog that sings now
    // and then.
    this.fireflyIn -= dt;
    if (this.fireflyIn <= 0) {
      this.fireflyIn = this.env.rng.range(0.9, 1.6) / (0.25 + this.dusk * 1.4);
      this.firefly(this.dusk > 0.2 ? 1 : 0);
    }
    this.fishIn -= dt;
    if (this.fishIn <= 0 && this.phase !== 'finale') {
      this.fishIn = this.env.rng.range(6, 10);
      this.fishLeap(this.openWater(), false);
    }
  }

  private wander(d: Dragonfly): void {
    const now = this.time;
    if (now - d.moveAt < (d.fleeUntil > now ? 0.5 : 1.8)) return;
    const rng = this.env.rng;
    d.fromU = d.toU;
    d.fromV = d.toV;
    d.toU = rng.range(0.1, 0.9);
    d.toV = rng.range(0.1, 0.9);
    d.moveAt = now + rng.range(0.3, 2.2);
  }

  protected press(p: Pointer): void {
    const { x, y } = p;
    const plan = this.plan;
    this.dragPad = -1;
    if (this.phase !== 'play' && this.phase !== 'after') {
      this.touchSky(x, y);
      return;
    }
    const body = this.frogBody();
    const reach = this.frogReach();
    const fy = body.y - this.frogHeight() * 0.5 - body.lift;
    if (Math.hypot(x - body.x, y - fy) <= reach) {
      this.touchFrog();
      return;
    }
    for (let i = 0; i < 2; i++) {
      const b = this.palBody(i);
      if (Math.hypot(x - b.x, y - (b.y - this.frogHeight() * 0.4 - b.lift)) <= reach * 0.85) {
        this.touchPal(i);
        return;
      }
    }
    const pad = padAt(plan, x, y);
    if (pad >= 0) {
      this.dragPad = pad;
      this.touchPad(pad, false);
      return;
    }
    const dragon = this.dragons.findIndex((d) => {
      const at = this.dragonAt(d);
      return Math.hypot(x - at.x, y - at.y) <= 26;
    });
    if (dragon >= 0) {
      this.touchDragonfly(dragon);
      return;
    }
    const duck = this.ducks.findIndex((d) => Math.hypot(x - this.duckX(d), y - this.duckY(d) + 8) <= 24);
    if (duck >= 0) {
      this.touchDuck(duck);
      return;
    }
    const friend = this.stands.findIndex((s) => Math.hypot(x - s.x, y - (s.y - 34 * s.scale)) <= this.friendReach(s));
    if (friend >= 0) {
      this.touchFriend(friend);
      return;
    }
    if (y > plan.horizon && y < plan.shore) {
      this.touchWater(x, y);
      return;
    }
    this.touchSky(x, y);
  }

  protected override drag(p: Pointer): void {
    if (this.phase !== 'play' && this.phase !== 'after') return;
    const pad = padAt(this.plan, p.x, p.y);
    if (pad < 0 || pad === this.dragPad) return;
    this.dragPad = pad;
    this.touchPad(pad, true);
  }

  protected override lift(): void {
    this.dragPad = -1;
  }

  /**
   * A touch on a pad, or on the lotus over it: the frog goes there. If she is there, the lotus
   * answers instead.
   */
  private touchPad(pad: number, sliding: boolean): void {
    const p = this.plan.pads[pad]!;
    if (this.frog.go(pad, sliding ? 7 : 3)) {
      this.hops++;
      ringAt(this.fx, this.env.rng, p.x, p.y, pad > 0 ? JEWELS[pad - 1]!.color : COLORS.white, p.rx * 0.5);
      this.env.sound.fx('tap', { gain: 0.1, pan: this.pan(p.x), pitch: 6 + pad });
      return;
    }
    if (pad === this.frog.at && !this.frog.busy) this.touchLotus(p);
  }

  /** The player touches the pad that the frog is on: its lotus rings, or opens if it is shut. */
  private touchLotus(pad: Pad): void {
    if (pad.lotus < 0) {
      this.touchFrog();
      return;
    }
    const now = this.time;
    if (this.lotuses.bloom(pad.lotus)) this.bloomLotus(pad.lotus, true);
    else this.ringLotus(pad.lotus);
    this.shine[pad.lotus] = 1;
    this.bloomedAt[pad.lotus] = Math.max(this.bloomedAt[pad.lotus]!, now - 0.5);
  }

  /** The frog is touched: a ribbit, a hop on the spot, and bubbles. */
  private touchFrog(): void {
    const now = this.time;
    const body = this.frogBody();
    this.ribbits++;
    if (now - this.ribbitAt >= RIBBIT_REST) this.earn(this.novelty.worth('ribbit', 'frog', now));
    this.ribbitAt = now;
    this.croak(body.x, 0.7, 0);
    this.frogBubbles(body.x, body.y - this.frogHeight() * 0.7);
    this.dips[this.frog.at]?.kick(110);
    if (!this.frog.busy) this.frog.go(this.frog.at === HOME ? 1 : HOME, 1);
  }

  /** A ribbit: two low notes, the second higher, which is how a frog says it. */
  private croak(x: number, gain: number, step: number): void {
    const sound = this.env.sound;
    const pan = this.pan(x);
    sound.fx('boing', { gain: 0.34 * gain, pan, pitch: -5 + step });
    sound.fx('boing', { gain: 0.3 * gain, pan, pitch: -1 + step, delay: 0.13 });
    sound.note('bass', 43 + step, { gain: 0.3 * gain, pan, seconds: 0.2 });
    this.croakAt = this.time;
  }

  private frogBubbles(x: number, y: number): void {
    const rng = this.env.rng;
    for (let i = this.fx.count(4); i > 0; i--) {
      this.fx.emit({
        x: x + rng.range(-8, 8),
        y,
        vx: rng.range(-10, 10),
        vy: rng.range(-52, -26),
        life: rng.range(0.8, 1.3),
        size: rng.range(4, 8),
        color: [255, 255, 255],
        shape: 'ring',
        width: 1.3,
        alpha: 0.7,
        sway: 8,
        hold: 0.5,
        delay: i * 0.08,
      });
    }
  }

  private touchPal(i: number): void {
    const now = this.time;
    const b = this.palBody(i);
    this.earn(this.novelty.worth('pal', i, now));
    this.croak(b.x, 0.6, 5 + i * 2);
    this.frogBubbles(b.x, b.y - this.frogHeight() * 0.6);
    const place = this.pals[i]!.at;
    this.dips[place]?.kick(90);
    if (!this.pals[i]!.busy && this.palsOut) {
      // She hops to another pad and back, so that she is something to touch.
      const to = 1 + ((place + 1 + i * 3) % LOTUS_COUNT);
      this.pals[i]!.go(to === this.frog.at ? 1 + (to % LOTUS_COUNT) : to, 1);
    }
  }

  private touchDuck(i: number): void {
    const d = this.ducks[i]!;
    const now = this.time;
    const x = this.duckX(d);
    d.quackUntil = now + 0.7;
    this.earn(this.novelty.worth('duck', i, now));
    this.env.sound.fx('boing', { gain: 0.3, pan: this.pan(x), pitch: 9 });
    this.env.sound.fx('boing', { gain: 0.26, pan: this.pan(x), pitch: 6, delay: 0.1 });
    this.env.sound.note('flute', scaleNote(ROOT + 12, 4 + i * 2), { gain: 0.24, pan: this.pan(x), seconds: 0.3 });
    this.ripple(x, this.duckY(d) + 8, 20, [255, 255, 255]);
    this.frogBubbles(x, this.duckY(d) - 18);
  }

  private touchDragonfly(i: number): void {
    const d = this.dragons[i]!;
    const now = this.time;
    const at = this.dragonAt(d);
    this.earn(this.novelty.worth('dragonfly', i, now));
    d.fromU = at.x / this.plan.w;
    d.fromV = clamp((at.y - (this.plan.horizon - 6)) / (this.plan.shore - 56 - (this.plan.horizon - 6)));
    const rng = this.env.rng;
    d.toU = clamp(d.fromU + rng.range(0.25, 0.45) * (d.fromU > 0.5 ? -1 : 1), 0.08, 0.92);
    d.toV = rng.range(0.1, 0.8);
    d.fleeUntil = now + 0.5;
    d.moveAt = now;
    const color: RGB = d.look === 'ruby' ? [255, 110, 150] : d.look === 'jade' ? [120, 240, 190] : [120, 190, 255];
    for (let k = this.fx.count(8); k > 0; k--) {
      this.fx.emit({
        x: at.x + rng.range(-6, 6),
        y: at.y + rng.range(-5, 5),
        vx: rng.range(-40, 40),
        vy: rng.range(-30, 30),
        life: rng.range(0.4, 0.8),
        size: rng.range(5, 9),
        size1: 1,
        color: lighten(color, 0.4),
        shape: k % 2 ? 'star4' : 'spark',
        twinkle: 12,
        hold: 0.3,
      });
    }
    this.env.sound.fx('twinkle', { gain: 0.3, pan: this.pan(at.x), pitch: 6 + i * 3 });
    this.env.sound.note('glass', scaleNote(ROOT + 24, 2 + i * 3), { gain: 0.24, pan: this.pan(at.x), seconds: 0.4 });
  }

  /** A touch on water: it rings, plops, and a fish jumps near it. */
  private touchWater(x: number, y: number): void {
    const now = this.time;
    this.waterTouched++;
    this.ripple(x, y, 26, [255, 255, 255]);
    this.ripple(x, y, 15, [200, 240, 255]);
    this.env.sound.fx('splash', {
      gain: 0.16,
      pan: this.pan(x),
      pitch: Math.floor(((y - this.plan.horizon) / (this.plan.shore - this.plan.horizon)) * 8),
    });
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((x / this.view.w) * 9)), {
      gain: 0.26,
      pan: this.pan(x),
      seconds: 0.45,
    });
    if (now - this.lastFish > 1.1) this.fishLeap({ x, y }, true);
    else this.drops(x, y, [200, 240, 255], 4);
  }

  private touchSky(x: number, y: number): void {
    ringAt(this.fx, this.env.rng, x, y, PARTY_COLORS[Math.floor(x / 30) % PARTY_COLORS.length]!, 18);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((x / this.view.w) * 9)), {
      gain: 0.3,
      pan: this.pan(x),
      seconds: 0.5,
    });
  }

  private touchFriend(i: number): void {
    const id = this.env.herd[i]!;
    const lotus = FRIEND_JET[id];
    this.friendsTouched++;
    this.lastFriend = i;
    this.cast.cheer(i);
    this.cast.kick(i, 0.7);
    this.env.sound.fx('star', { gain: 0.4, pan: this.pan(this.stands[i]!.x), step: i });
    this.earn(this.novelty.worth('friend', id, this.time));
    this.sendComet(i, lotus);
  }

  /**
   * A comet from a friend's horn to the lotus of her colour, which opens when it arrives and calls
   * the frog.
   */
  private sendComet(i: number, lotus: number): void {
    const target = this.lotusAt(lotus);
    const color = JEWELS[lotus]!.color;
    this.script.at(this.script.now + CAST_RELEASE, () => {
      comet(this.fx, this.env.rng, this.hornOf(i), target, color, COMET);
      this.script.at(this.script.now + COMET, () => {
        if (this.phase !== 'finale') this.frog.go(this.padOf(lotus), 3);
        if (this.lotuses.bloom(lotus)) this.bloomLotus(lotus, false);
        else this.ringLotus(lotus);
      });
    });
  }

  /** The frog crouches and springs. */
  private sprang(from: number, to: number, flight: number): void {
    const a = this.spot(from);
    const b = this.spot(to);
    const x = (a.x + b.x) / 2;
    this.dips[from]?.kick(-60);
    this.env.sound.fx('boing', {
      gain: 0.3,
      pan: this.pan(x),
      pitch: 2 + Math.min(9, Math.hypot(b.x - a.x, b.y - a.y) / 26) - flight * 2,
    });
    this.drops(a.x, a.y, [200, 240, 255], 3);
  }

  /** The frog comes down on a pad. */
  private landed(place: number): void {
    const now = this.time;
    const plan = this.plan;
    const pad = plan.pads[place]!;
    const sound = this.env.sound;
    const pan = this.pan(pad.x);
    this.dips[place]!.kick(230);
    this.ripple(pad.x, pad.y + pad.ry * 0.3, pad.rx * 1.9, [255, 255, 255]);
    this.ripple(pad.x, pad.y + pad.ry * 0.3, pad.rx * 1.2, [200, 240, 255]);
    this.drops(pad.x, pad.y, [210, 244, 255], 7);
    if (now - this.lastLandSound > 0.05) {
      this.lastLandSound = now;
      sound.fx('splash', { gain: 0.2, pan, pitch: 3 + place });
    }
    this.earn(this.novelty.worth('hop', place, now));
    this.hops = Math.max(this.hops, 1);
    if (pad.lotus < 0) {
      this.croak(pad.x, 0.45, 0);
      return;
    }
    const jewel = JEWELS[pad.lotus]!;
    sound.note('marimba', scaleNote(ROOT, jewel.step), { gain: 0.5, pan, seconds: 0.8 });
    sound.note('bell', scaleNote(ROOT + 12, jewel.step), { gain: 0.26, pan, seconds: 0.9, delay: 0.03 });
    if (this.lotuses.bloom(pad.lotus)) this.bloomLotus(pad.lotus, true);
    else this.ringLotus(pad.lotus);
    const run = this.runs.play(pad.lotus, now);
    if (run.length >= SWEEP) this.earn(this.novelty.worth('sweep', run.way, now));
    if (this.runs.isScale(run)) this.songSung(run.way);
  }

  /** A lotus opens: its petals unfold, and the light round it comes up. */
  private bloomLotus(lotus: number, byFrog: boolean): void {
    const now = this.time;
    const jewel = JEWELS[lotus]!;
    const at = this.lotusAt(lotus);
    this.bloomedAt[lotus] = now;
    this.earn(this.novelty.worth('bloom', lotus, now));
    this.env.sound.note('chime', scaleNote(ROOT + 12, jewel.step + (byFrog ? 0 : 2)), {
      gain: 0.34,
      pan: this.pan(at.x),
      seconds: 1.1,
      delay: 0.1,
    });
    this.env.sound.fx('twinkle', { gain: 0.3, pan: this.pan(at.x), pitch: jewel.step });
    this.burst(at.x, at.y, jewel.color, 12);
    this.petalsFall(at.x, at.y, jewel.color, 6);
  }

  /**
   * An open lotus that is touched, or that a frog lands on again: a bell, a ring of light, a few
   * petals.
   */
  private ringLotus(lotus: number): void {
    const jewel = JEWELS[lotus]!;
    const at = this.lotusAt(lotus);
    this.bloomedAt[lotus] = this.time;
    this.shine[lotus] = 1;
    this.env.sound.note('bell', scaleNote(ROOT + 12, jewel.step), {
      gain: 0.3,
      pan: this.pan(at.x),
      seconds: 0.9,
      delay: 0.05,
    });
    ringAt(this.fx, this.env.rng, at.x, at.y, jewel.color, this.plan.pads[lotus + 1]!.rx * 0.9);
    this.petalsFall(at.x, at.y, jewel.color, 3);
  }

  /** The seven in a row, in order: a glissando of every lotus, and a rise of light. */
  private songSung(way: number): void {
    const sound = this.env.sound;
    this.earn(this.novelty.worth('scale', way, this.time));
    JEWELS.forEach((_, i) => {
      const lotus = way < 0 ? JEWELS.length - 1 - i : i;
      sound.note('glass', scaleNote(ROOT + 24, lotus), {
        gain: 0.26,
        delay: 0.12 + i * 0.06,
        seconds: 0.7,
        pan: this.pan(this.lotusAt(lotus).x),
      });
      this.script.at(this.script.now + 0.12 + i * 0.06, () => {
        const at = this.lotusAt(lotus);
        this.burst(at.x, at.y, JEWELS[lotus]!.color, 5);
        this.shine[lotus] = 1;
      });
    });
    this.flash(0.08, COLORS.white);
  }

  /** All seven lotuses are open at once. The pond sings, and two more frogs come to join in. */
  private pondWhole(): void {
    const now = this.time;
    const sound = this.env.sound;
    this.earn(this.novelty.worth('pond', 'whole', now));
    sound.fx('swell', { gain: 0.5 });
    sound.fx('cheer', { gain: 0.36, delay: 0.1 });
    JEWELS.forEach((jewel, i) => {
      sound.note('chime', scaleNote(ROOT + 12, jewel.step), { gain: 0.32, delay: 0.1 + i * 0.12, seconds: 1.1 });
    });
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    this.flash(0.12, COLORS.white);
    this.singing = true;
    this.choirUntil = now + SING_SECONDS;
    JEWELS.forEach((jewel, i) => {
      this.script.at(this.script.now + 0.1 + i * 0.12, () => {
        const at = this.lotusAt(i);
        this.burst(at.x, at.y, jewel.color, 8);
        this.petalsFall(at.x, at.y, jewel.color, 4);
      });
    });
    for (let i = this.fx.count(14); i > 0; i--) this.firefly(2);
    // The other frogs come out of the reeds onto the pads nearest them and sing.
    this.palsOut = true;
    this.pals.forEach((h, i) => {
      const options = [1, 2, 3, 4, 5, 6, 7]
        .filter((pad) => pad !== this.frog.target)
        .sort(
          (a, b) =>
            Math.abs(this.plan.pads[a]!.x - this.plan.seats[i]!.x) -
            Math.abs(this.plan.pads[b]!.x - this.plan.seats[i]!.x),
        );
      const pad = options[0] ?? 1 + i;
      this.script.at(this.script.now + 0.5 + i * 0.4, () => {
        h.go(pad, 1);
      });
    });
    for (const [k, at] of [
      [0, 1.6],
      [1, 2.0],
      [2, 2.4],
    ] as const) {
      this.script.at(this.script.now + at, () => {
        const b = k === 0 ? this.frogBody() : this.palBody(k - 1);
        this.croak(b.x, 0.7, k * 4);
        this.frogBubbles(b.x, b.y - this.frogHeight() * 0.7);
      });
    }
  }

  /** The pond is quiet, and the other frogs go back to the reeds. */
  private palsHome(): void {
    if (this.phase !== 'play') return;
    this.pals.forEach((h, i) => {
      h.go(PAD_COUNT + i, 1);
    });
    this.script.at(this.script.now + 3, () => {
      if (this.phase === 'play' && this.pals.every((h) => h.at >= PAD_COUNT)) this.palsOut = false;
    });
  }

  private palLanded(place: number): void {
    if (place >= PAD_COUNT) {
      const seat = this.plan.seats[place - PAD_COUNT]!;
      this.dips[place]!.kick(120);
      this.ripple(seat.x, seat.y + 4, 22, [255, 255, 255]);
      return;
    }
    const pad = this.plan.pads[place]!;
    this.dips[place]!.kick(160);
    this.ripple(pad.x, pad.y + pad.ry * 0.3, pad.rx * 1.5, [255, 255, 255]);
    this.drops(pad.x, pad.y, [210, 244, 255], 5);
    this.env.sound.fx('splash', { gain: 0.14, pan: this.pan(pad.x), pitch: 5 });
    if (pad.lotus >= 0) {
      const jewel = JEWELS[pad.lotus]!;
      this.env.sound.note('marimba', scaleNote(ROOT + 12, jewel.step), {
        gain: 0.3,
        pan: this.pan(pad.x),
        seconds: 0.6,
      });
      if (this.lotuses.bloom(pad.lotus)) this.bloomLotus(pad.lotus, false);
    }
  }

  private ripple(x: number, y: number, size: number, color: RGB): void {
    if (this.ripples.length >= MOST_RIPPLES) this.ripples.shift();
    this.ripples.push({ x, y, at: this.time, size, color });
  }

  private drops(x: number, y: number, color: RGB, n: number): void {
    const rng = this.env.rng;
    for (let i = this.fx.count(n); i > 0; i--) {
      this.fx.emit({
        x: x + rng.range(-5, 5),
        y,
        vx: rng.range(-34, 34),
        vy: rng.range(-110, -50),
        life: rng.range(0.35, 0.6),
        size: rng.range(2.4, 4),
        size1: 1,
        color,
        shape: 'dot',
        gravity: 420,
        alpha: 0.9,
      });
    }
  }

  private burst(x: number, y: number, color: RGB, n: number): void {
    const rng = this.env.rng;
    this.fx.emit({
      x,
      y,
      life: 0.32,
      size: 14,
      size1: 56,
      color: COLORS.white,
      color1: color,
      shape: 'glow',
      alpha: 0.85,
    });
    for (let i = this.fx.count(n); i > 0; i--) {
      const a = rng.range(0, TAU);
      const speed = rng.range(30, 110);
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 24,
        life: rng.range(0.6, 1.1),
        size: rng.range(5, 9),
        size1: 1,
        color: lighten(color, 0.45),
        shape: i % 2 ? 'star4' : 'spark',
        drag: 1.6,
        gravity: 30,
        twinkle: 12,
        hold: 0.3,
      });
    }
  }

  private petalsFall(x: number, y: number, color: RGB, n: number): void {
    const rng = this.env.rng;
    for (let i = this.fx.count(n); i > 0; i--) {
      this.fx.emit({
        x: x + rng.range(-10, 10),
        y: y + rng.range(-6, 6),
        vx: rng.range(-20, 20),
        vy: rng.range(-30, 0),
        life: rng.range(1.6, 2.6),
        size: rng.range(5, 8),
        color: lighten(color, 0.25),
        shape: 'confetti',
        gravity: 30,
        drag: 0.5,
        sway: 24,
        spin: rng.range(-4, 4),
        rot: rng.range(0, TAU),
        hold: 0.7,
      });
    }
  }

  /**
   * A firefly: a small warm light that drifts over the water and goes out. `grand` makes it larger
   * and slower.
   */
  private firefly(grand: number): void {
    const plan = this.plan;
    const rng = this.env.rng;
    const x = rng.range(10, plan.w - 10);
    const y = rng.range(plan.horizon + 10, plan.shore + 24);
    this.fx.emit({
      x,
      y,
      vx: rng.range(-8, 8),
      vy: rng.range(-12, 3),
      life: rng.range(3.4, 6) * (grand > 1 ? 1.3 : 1),
      size: rng.range(4, 7) * (grand > 1 ? 1.2 : 1),
      size1: 3,
      color: [255, 240, 150],
      color1: [190, 255, 170],
      shape: 'glow',
      alpha: 0.9,
      sway: 14,
      twinkle: 0.8,
      fadeIn: 0.8,
      hold: 0.4,
    });
  }

  /** A place on the water where there is no pad, for a fish. */
  private openWater(): Point {
    const rng = this.env.rng;
    const plan = this.plan;
    for (let tries = 0; tries < 12; tries++) {
      const x = rng.range(40, plan.w - 40);
      const y = rng.range(plan.horizon + 30, plan.shore - 16);
      if (plan.pads.every((pad) => Math.hypot((x - pad.x) / (pad.rx * 1.9), (y - pad.y) / (pad.ry * 2.8)) > 1))
        return { x, y };
    }
    return { x: plan.w * 0.5, y: plan.shore - 20 };
  }

  private fishLeap(at: Point, touched: boolean): void {
    const now = this.time;
    const rng = this.env.rng;
    this.lastFish = now;
    const look = rng.next() < 0.5 ? 'koi' : 'gold';
    const dir = at.x < this.plan.w / 2 ? 1 : -1;
    this.fish.push({ x: at.x, y: at.y, dir, at: now, look });
    if (touched) this.earn(this.novelty.worth('fish', 'fish', now));
    this.ripple(at.x - 22 * dir, at.y, 18, [255, 255, 255]);
    this.script.at(this.script.now + 0.7, () => {
      this.ripple(at.x + 22 * dir, at.y, 22, [255, 255, 255]);
      this.drops(at.x + 22 * dir, at.y, [210, 244, 255], 6);
      this.env.sound.fx('splash', { gain: 0.18, pan: this.pan(at.x), pitch: 9 });
    });
    this.drops(at.x - 22 * dir, at.y, [210, 244, 255], 6);
    this.env.sound.fx('pop', { gain: 0.2, pan: this.pan(at.x), pitch: 4 });
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play') return null;
    const plan = this.plan;
    // The next lotus along the path that is still a bud.
    for (let lotus = 0; lotus < LOTUS_COUNT; lotus++) {
      if (!this.lotuses.isOpen(lotus)) {
        const pad = plan.pads[lotus + 1]!;
        return { x: pad.x, y: pad.y - pad.ry };
      }
    }
    if (this.ribbits === 0) {
      const b = this.frogBody();
      return { x: b.x, y: b.y - this.frogHeight() * 0.5 };
    }
    if (this.friendsTouched === 0 && this.stands.length > 0) {
      const s = this.stands[this.stands.length > 1 ? 1 : 0]!;
      return { x: s.x, y: s.y - 34 * s.scale };
    }
    if (this.waterTouched === 0) return { x: plan.w * 0.5, y: (plan.horizon + plan.shore) / 2 + 14 };
    const pad = plan.pads[1 + (Math.floor(this.time / 3) % LOTUS_COUNT)]!;
    return { x: pad.x, y: pad.y - pad.ry };
  }

  protected finale(): void {
    const sound = this.env.sound;
    const s0 = this.script.now;
    const rng = this.env.rng;
    const plan = this.plan;
    sound.fx('swell', { gain: 0.7 });
    sound.fx('cheer', { gain: 0.5, delay: 0.1 });
    this.flash(0.14, COLORS.white);
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    this.singing = false;
    this.palsOut = true;
    // The frog goes the whole length of the pond, a pad at a time, and every lotus opens as she
    // lands on it.
    for (let lotus = 0; lotus < LOTUS_COUNT; lotus++) {
      this.script.at(s0 + 0.3 + lotus * 0.78, () => {
        this.frog.go(this.padOf(lotus), 9);
      });
    }
    // The other two come to sing, on the pads at either end.
    this.pals.forEach((h, i) => {
      this.script.at(s0 + 1.6 + i * 0.9, () => {
        const pad = i === 0 ? 2 : 6;
        h.go(pad === this.frog.target ? pad + 1 : pad, 1);
      });
    });
    // As she goes the evening comes on, and all the flowers that are not open yet open.
    this.script.at(s0 + 4.6, () => {
      this.lotuses.openAll();
      JEWELS.forEach((jewel, i) => {
        const at = this.lotusAt(i);
        this.burst(at.x, at.y, jewel.color, 7);
        sound.note('chime', scaleNote(ROOT + 12, jewel.step), { gain: 0.4, delay: i * 0.07, seconds: 1.1 });
      });
    });
    // Everyone sings, in three voices, and the stars come out.
    this.script.at(s0 + 6.2, () => {
      sound.fx('boom', { gain: 0.5 });
      this.shake(1.2);
      this.flash(0.2, COLORS.white);
      for (const [k, at] of [
        [0, 0],
        [1, 0.22],
        [2, 0.44],
      ] as const) {
        this.script.at(this.script.now + at, () => {
          const b = k === 0 ? this.frogBody() : this.palBody(k - 1);
          this.croak(b.x, 0.9, k * 4);
          this.frogBubbles(b.x, b.y - this.frogHeight() * 0.7);
          this.burst(b.x, b.y - this.frogHeight() * 0.5, JEWELS[(k * 2) % 7]!.color, 14);
        });
      }
      JEWELS.forEach((jewel, i) => {
        sound.note('bell', scaleNote(ROOT + 12, jewel.step), { gain: 0.46, delay: 0.1 + i * 0.07, seconds: 1.2 });
      });
      for (let i = this.fx.count(40); i > 0; i--) this.firefly(2);
    });
    // Fireflies and petals, over everything.
    for (let k = 0; k < 28; k++) {
      this.script.at(s0 + 4.8 + k * 0.1, () => {
        for (let n = this.fx.count(2); n > 0; n--) this.firefly(2);
        const lotus = rng.int(LOTUS_COUNT);
        const at = this.lotusAt(lotus);
        this.petalsFall(at.x, at.y, JEWELS[lotus]!.color, 2);
      });
    }
    this.script.at(s0 + 6.4, () => {
      for (let i = this.fx.count(70); i > 0; i--) {
        this.fx.emit({
          x: rng.range(-10, plan.w + 10),
          y: rng.range(-40, -6),
          vx: rng.range(-20, 20),
          vy: rng.range(50, 120),
          life: rng.range(3.2, 5),
          size: rng.range(6, 10),
          color: PARTY_COLORS[rng.int(PARTY_COLORS.length)]!,
          shape: 'confetti',
          gravity: 14,
          drag: 0.2,
          sway: 50,
          spin: rng.range(-9, 9),
          rot: rng.range(0, TAU),
          hold: 0.8,
          delay: rng.range(0, 1),
        });
      }
    });
    this.script.at(s0 + 9.8, () => this.endFinale());
  }

  protected paintBack(p: Painter): void {
    this.ensureArt(p.k);
    const plan = this.plan;
    this.art.paint(p, plan, this.dusk, this.detail);
    this.art.paintReeds(p);
    this.paintDucks(p);
    this.paintRipples(p);
    this.paintPads(p);
    this.paintFish(p);
    this.art.paintBank(p);
    this.paintFriends(p);
  }

  private paintRipples(p: Painter): void {
    const g = p.ctx;
    const now = this.time;
    for (const r of this.ripples) {
      const u = clamp((now - r.at) / 1.2);
      const size = r.size * (0.3 + 0.9 * (1 - (1 - u) ** 2));
      g.strokeStyle = css(r.color, 0.55 * (1 - u));
      g.lineWidth = 1.3 * (1 - u * 0.5) + 0.3;
      g.beginPath();
      g.ellipse(r.x, r.y, size, size * 0.4, 0, 0, TAU);
      g.stroke();
    }
  }

  private paintDucks(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const now = this.time;
    const scale = this.plan.portrait ? 0.82 : 0.86;
    for (const d of this.ducks) {
      const x = this.duckX(d);
      const y = this.duckY(d);
      const quack = d.quackUntil > now;
      const pic = bank.sprite('life', `duck-${d.look}-${quack ? 'quack' : 'float'}`, now + d.phase);
      // Its wake, two soft lines trailing behind.
      const back = d.speed > 0 ? -1 : 1;
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      for (const k of [0.6, 1]) {
        g.beginPath();
        g.ellipse(x + back * 12 * k, y + 2, 14 * k, 3.6 * k, 0, 0, TAU);
        g.stroke();
      }
      if (pic) drawPic(g, pic, x, y + 4, { scale, flip: d.speed < 0, rot: quack ? Math.sin(now * 40) * 0.05 : 0 });
    }
  }

  private paintFish(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const now = this.time;
    for (const f of this.fish) {
      const u = clamp((now - f.at) / 0.7);
      if (u >= 1) continue;
      const x = f.x + f.dir * (-22 + 44 * u);
      const arc = 4 * 38 * u * (1 - u);
      const vy = -4 * 38 * (1 - 2 * u);
      const pic = bank.sprite('life', `fish-${f.look}-leap`, u * 0.75);
      if (!pic) continue;
      const angle = Math.atan2(vy, 44 * f.dir) * (f.dir > 0 ? 1 : -1);
      drawPic(g, pic, x, f.y - arc, { scale: 0.95, flip: f.dir < 0, rot: angle * 0.8, mid: true });
    }
  }

  /**
   * Every pad, then every lotus and frog from the back of the pond to the front, so that what is
   * nearer is in front.
   */
  private paintPads(p: Painter): void {
    const plan = this.plan;
    const g = p.ctx;
    // The two seats of the other frogs: little pads in the reeds.
    plan.seats.forEach((seat, i) => {
      const pad: Pad = { x: seat.x, y: seat.y + 2, rx: 24 * seat.scale, ry: 14 * seat.scale, lotus: -1 };
      this.art.paintPad(p, pad, this.dips[PAD_COUNT + i]!.x * 0.06, 20 + i, null, 0);
    });
    plan.pads.forEach((pad, i) => {
      const lotus = pad.lotus;
      const color = lotus >= 0 ? JEWELS[lotus]!.color : null;
      this.art.paintPad(p, pad, this.dips[i]!.x * 0.06, i, color, lotus >= 0 ? this.shine[lotus]! : 0);
    });
    type Layer = { y: number; draw: () => void };
    const things: Layer[] = [];
    plan.pads.forEach((pad, i) => {
      if (pad.lotus < 0) return;
      const lotus = pad.lotus;
      things.push({
        y: pad.y - 1,
        draw: () =>
          this.art.paintLotus(
            p,
            pad,
            this.dips[i]!.x * 0.06,
            plan.lotusHeight,
            this.lotuses.open[lotus]!,
            JEWELS[lotus]!.color,
            lotus,
            this.shine[lotus]!,
          ),
      });
    });
    const frog = this.frogBody();
    things.push({
      y: frog.y + (frog.lift > 0 ? 40 : 0),
      draw: () => this.paintFrog(g, 'green', frog, 1, this.frog.at),
    });
    this.pals.forEach((h, i) => {
      const b = this.palBody(i);
      things.push({ y: b.y + (b.lift > 0 ? 40 : 0), draw: () => this.paintFrog(g, FROGS[i + 1]!, b, 0.88, h.at) });
    });
    things.sort((a, b) => a.y - b.y);
    for (const t of things) t.draw();
  }

  private paintFrog(g: CanvasRenderingContext2D, look: Look, body: Body, size: number, place: number): void {
    const bank = this.env.bank;
    if (!bank) return;
    const now = this.time;
    const scale = this.plan.frog * size;
    const dip = this.dips[place]?.x ?? 0;
    // Its shadow on the pad, smaller and fainter the higher she is.
    const low = 1 / (1 + body.lift / 40);
    g.fillStyle = `rgba(8,40,50,${(0.3 * low).toFixed(3)})`;
    g.beginPath();
    g.ellipse(body.x, body.y + 1, 15 * scale * (0.6 + 0.4 * low), 4.2 * scale * (0.6 + 0.4 * low), 0, 0, TAU);
    g.fill();
    const pic = bank.sprite(
      'life',
      `frog-${look}-${body.pose}`,
      now * 0.9 + (look === 'green' ? 0 : look === 'teal' ? 1.3 : 2.2),
    );
    if (!pic) return;
    const speaking = now - this.croakAt < 0.3;
    const swell = speaking ? 1 + 0.07 * Math.sin(((now - this.croakAt) / 0.3) * Math.PI) : 1;
    drawPic(g, pic, body.x, body.y - body.lift + dip * 0.06, {
      scale,
      sx: body.sx * swell,
      sy: body.sy * (2 - swell),
      rot: body.tilt,
    });
  }

  private paintFriends(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = this.stands.map((s, i) => ({ s, i })).sort((a, b) => a.s.y - b.s.y || a.i - b.i);
    for (const { s, i } of order) {
      const id = this.env.herd[i]!;
      g.fillStyle = 'rgba(8,30,40,0.3)';
      g.beginPath();
      g.ellipse(s.x, s.y + 1, 36 * s.scale, 5 * s.scale, 0, 0, TAU);
      g.fill();
      this.cast.draw(g, bank, i, id, s.scale);
      if (i === this.lastFriend && this.cast.sinceCheer(i) < 1.2) {
        const horn = this.hornOf(i);
        glowAt(p.light, horn.x, horn.y, 34, lighten(JEWELS[FRIEND_JET[id]]!.color, 0.3), 0.5);
      }
    }
  }

  /** What is held in front of the pond: the dragonflies, over everything. */
  protected paintFront(p: Painter): void {
    const bank: SpriteBank | null = this.env.bank;
    if (!bank) return;
    const now = this.time;
    for (const d of this.dragons) {
      const at = this.dragonAt(d);
      const pic = bank.sprite('life', `dragonfly-${d.look}-hover`, now + d.phase);
      if (!pic) continue;
      const fleeing = d.fleeUntil > now;
      drawPic(p.ctx, pic, at.x, at.y + 12, {
        scale: 0.9,
        flip: Math.cos(now * 0.9 + d.phase) < 0,
        rot: Math.sin(now * 3 + d.phase) * 0.06 + (fleeing ? 0.25 : 0),
      });
    }
  }
}
