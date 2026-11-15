import type { UnicornId } from '../../shared/ids';
import { Cast, MAX_HERD } from '../engine/cast';
import { COLORS, lighten } from '../engine/color';
import { clamp, damp, TAU } from '../engine/ease';
import { gemImage } from '../engine/gems';
import { Meter } from '../engine/meter';
import { Novelty, scaledCosts } from '../engine/novelty';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import { Runs, SWEEP } from '../engine/runs';
import type { Pointer, Quality } from '../engine/stage';
import { scaleNote } from '../music';
import { FOUNTAIN } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { PARTY_COLORS, ringAt } from './balloons/pops';
import { Arch } from './fountain/arch';
import { FountainArt } from './fountain/art';
import { bloomOf, comet, fanOf, glint, pulse, splash, stoneOf, throwJewel } from './fountain/effects';
import { heightOf, Jets } from './fountain/jets';
import { GREAT, JET_COUNT, jetAt, type Plan, planOf, type Stand, standsOf } from './fountain/layout';
import { MOST, Piles, slotOf } from './fountain/piles';
import { FRIEND_JET, JEWELS, ROOT } from './fountain/recipes';

/**
 * A fountain that plays jewels. Seven jets stand in a ring of little pools in front of a great
 * fountain, each a colour of the rainbow and a note of a scale. A touch on a jet sends a column of
 * its jewels up, and a finger held on it sends them higher; the jewels come down in its pool and
 * stay there, a heap that grows. A finger drawn along the ring plays the scale. Every jet the
 * player plays lights its band of the rainbow over the fountain, and when all seven bands shine at
 * once the rainbow is whole. The big gem on the fountain throws every colour in a fan, and a friend
 * who is touched sends a comet from her horn to the jet of her own colour. When the stars are full
 * the whole fountain goes: every jet at full, the rainbow stays, and jewels rain from it.
 */

/**
 * What each star costs, for a herd of six. A smaller herd has less to bring, so each star is a
 * little nearer.
 */
const FOUNTAIN_STAR_COSTS = [9, 28, 60, 104, 158] as const;

type Thing = 'jet' | 'sweep' | 'scale' | 'rainbow' | 'gem' | 'friend';

/** What each thing is worth the first time, in points. */
const WORTH: Readonly<Record<Thing, number>> = { jet: 1.6, sweep: 0.9, scale: 3, rainbow: 3, gem: 3.4, friend: 3.8 };

/**
 * How long a friend is casting after she is touched, and how far into it her comet leaves her horn.
 */
const CAST_SECONDS = 0.8;
const CAST_RELEASE = 0.26;
/** The seconds before the big gem can be touched for its fan again. */
const GRAND_REST = 2.4;
/** The seconds between a held jet singing again. */
const HOLD_SING = 0.62;
/** How long the comet of a friend takes, and how long her jet goes on after it arrives. */
const COMET = 0.42;
const FRIEND_JET_SECONDS = 1.7;
const MOST_RIPPLES = 26;
/** The most the big gem can add to the music. */
const MUSIC_FROM_JETS = 0.3;

interface Ripple {
  readonly jet: number;
  readonly x: number;
  readonly at: number;
}

export class JewelFountain extends Wonder {
  readonly id = 'jewel-fountain' as const;
  protected readonly meter = new Meter(scaledCosts(FOUNTAIN_STAR_COSTS, this.env.herd.length));
  private readonly novelty = new Novelty<Thing>(WORTH);
  private readonly jets = new Jets();
  private readonly piles = new Piles();
  private readonly arch = new Arch();
  private readonly runs = new Runs(JET_COUNT);
  private readonly cast = new Cast();
  private readonly art: FountainArt;
  private plan!: Plan;
  private stands: Stand[] = [];
  private artFor = 0;
  private artDirty = true;
  private detail = true;
  private ripples: Ripple[] = [];
  private readonly lastRipple: number[] = JEWELS.map(() => -9);
  private readonly heapHop: number[] = JEWELS.map(() => -9);
  /**
   * When each jet was last told by a friend to go, so that her jewels are bigger and brighter for a
   * moment.
   */
  private readonly enchantedUntil: number[] = JEWELS.map(() => -9);
  private readonly nextSing: number[] = JEWELS.map(() => 0);
  private lastLandSound = -9;
  private gemAt = -9;
  private gemPulse = 0;
  private fireflyIn = 1;
  private sprinkleIn = 4;
  /** How much of the fountain's own light is on, for after the finale. */
  private glow = 0;
  /** What the player has done, so that the hand can show them what else there is. */
  private struck = 0;
  private swept = 0;
  private gemTouched = 0;
  private friendsTouched = 0;
  private lastFriend = -1;

  constructor(env: WonderEnv) {
    super(env);
    this.art = new FountainArt(env.bank, env.rng);
    this.startMusic(FOUNTAIN);
  }

  override get bloom(): number {
    return this.env.calm ? 0.22 : 0.44;
  }

  override quality(level: Quality): void {
    super.quality(level);
    this.detail = level > 0;
  }

  protected override musicEnergy(): number {
    return Math.min(
      1,
      super.musicEnergy() + (this.phase === 'play' ? MUSIC_FROM_JETS * Math.min(1, this.jets.count(this.time) / 3) : 0),
    );
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly jets: readonly {
      readonly x: number;
      readonly y: number;
      readonly top: number;
      readonly level: number;
      readonly on: boolean;
      readonly heap: number;
      readonly band: number;
    }[];
    readonly gem: { readonly x: number; readonly y: number; readonly r: number };
    readonly friends: readonly { readonly id: UnicornId; readonly x: number; readonly y: number; readonly r: number }[];
    readonly rainbow: { readonly whole: boolean; readonly shining: number };
    readonly inAir: number;
    readonly spacing: number;
    readonly size: { readonly w: number; readonly h: number };
  } {
    const plan = this.plan;
    return {
      jets: plan.jets.map((j, i) => ({
        x: j.x,
        y: j.y,
        top: plan.ceiling(j.x),
        level: this.jets.level[i]!,
        on: this.jets.on(i, this.time),
        heap: this.piles.count[i]!,
        band: this.arch.level[i]!,
      })),
      gem: plan.gem,
      friends: this.stands.map((s, i) => ({
        id: this.env.herd[i]!,
        x: s.x,
        y: s.y - 34 * s.scale,
        r: this.friendReach(s),
      })),
      rainbow: { whole: this.arch.whole, shining: this.arch.shining },
      inAir: this.piles.inAir,
      spacing: plan.spacing,
      size: { w: plan.w, h: plan.h },
    };
  }

  protected arrange(view: View): void {
    this.plan = planOf(view.w, view.h, view.unit);
    this.stands = standsOf(Math.min(MAX_HERD, this.env.herd.length), this.plan);
    this.artDirty = true;
    this.ripples = [];
  }

  private ensureArt(k: number): void {
    if (!this.artDirty && this.artFor === k) return;
    this.artDirty = false;
    this.artFor = k;
    this.art.place(this.plan, k);
  }

  protected reset(): void {
    this.jets.reset();
    this.piles.reset();
    this.arch.reset();
    this.runs.reset();
    this.cast.reset();
    this.novelty.reset();
    this.ripples = [];
    this.lastRipple.fill(-9);
    this.heapHop.fill(-9);
    this.enchantedUntil.fill(-9);
    this.nextSing.fill(0);
    this.gemAt = -9;
    this.gemPulse = 0;
    this.glow = 0;
    this.struck = 0;
    this.swept = 0;
    this.gemTouched = 0;
    this.friendsTouched = 0;
    this.lastFriend = -1;
    this.sprinkleIn = 4;
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  private friendReach(s: Stand): number {
    return Math.max(24, 52 * s.scale);
  }

  private facingOf(i: number): number {
    return this.stands[i]!.x < this.plan.fountain.x ? 1 : -1;
  }

  /** The tip of a friend's horn, where her comet begins. */
  private hornOf(i: number): { x: number; y: number } {
    const s = this.stands[i]!;
    const id = this.env.herd[i]!;
    const face = this.facingOf(i);
    const horn = this.env.bank?.unicorn(id, 'cast', 'east', CAST_RELEASE)?.anchors.horn;
    if (horn) return { x: s.x + horn[0] * s.scale * face, y: s.y + horn[1] * s.scale };
    return { x: s.x + 26 * s.scale * face, y: s.y - 96 * s.scale };
  }

  /**
   * Where the water of the great fountain is, at the front. The jewels the big gem throws come down
   * to it.
   */
  private waterLine(): number {
    return this.plan.fountain.y + (GREAT.water.y + GREAT.water.ry * 0.5) * this.plan.fountain.s;
  }

  protected tick(dt: number): void {
    const now = this.time;
    const plan = this.plan;
    this.jets.step(dt, now);
    this.arch.step(now);
    for (let i = 0; i < JET_COUNT; i++) this.feedJet(i, dt);
    this.piles.land(now, (jet, grew) => this.landed(jet, grew));
    // A finger held on a jet keeps it singing, softly, so that holding is a note that lasts.
    for (let i = 0; i < JET_COUNT; i++) {
      if (this.jets.held(i) && now >= this.nextSing[i]!) {
        this.nextSing[i] = now + HOLD_SING;
        const jet = plan.jets[i]!;
        this.env.sound.note('bell', scaleNote(ROOT + 12, JEWELS[i]!.step), {
          gain: 0.18,
          pan: this.pan(jet.x),
          seconds: 0.7,
        });
      }
    }
    if (this.phase === 'play' && this.arch.completed()) this.wholeRainbow();
    this.gemPulse = damp(this.gemPulse, 0, 3, dt);
    this.glow = damp(this.glow, this.phase === 'after' ? 1 : 0, 1.2, dt);
    this.ripples = this.ripples.filter((r) => now - r.at < 0.9);
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
    // Fireflies over the grass, and when nothing is being played the fountain sprinkles a little by
    // itself.
    this.fireflyIn -= dt;
    if (this.fireflyIn <= 0) {
      this.fireflyIn = this.env.rng.range(0.35, 0.7);
      this.firefly();
    }
    if (this.phase === 'play' && this.jets.count(now) === 0 && this.idle > 4) {
      this.sprinkleIn -= dt;
      if (this.sprinkleIn <= 0) {
        this.sprinkleIn = this.env.rng.range(2.6, 4.2);
        this.sprinkle();
      }
    }
  }

  /** One jet's jewels for this step, thrown from its nozzle up to the height of its column. */
  private feedJet(i: number, dt: number): void {
    const now = this.time;
    const n = this.jets.throwing(i, dt, now);
    if (n === 0) return;
    const plan = this.plan;
    const jet = plan.jets[i]!;
    const jewel = JEWELS[i]!;
    const room = Math.min(380, jet.y - plan.ceiling(jet.x) - 8);
    const bright = this.enchantedUntil[i]! > now;
    const height = Math.min(room, heightOf(this.jets.level[i]!, room) * (bright ? 1.1 : 1));
    // A device that draws fewer particles has each jewel count for more in the heap, so the heaps
    // grow at the same pace on every device.
    const weight = Math.max(1, Math.round(1 / this.fx.density));
    const rng = this.env.rng;
    for (let k = this.fx.count(n); k > 0; k--) {
      const thrown = throwJewel(this.fx, rng, jewel, jet.x, jet.y, height, 22 * jet.scale, bright ? 1.2 : jet.scale);
      for (let w = 0; w < weight; w++) this.piles.launch(i, now + thrown.flight - 0.02);
      if (rng.next() < 0.55) glint(this.fx, rng, jewel, jet.x, jet.y, height);
    }
  }

  /** A jewel has come down into a pool. */
  private landed(jet: number, grew: boolean): void {
    const now = this.time;
    const rng = this.env.rng;
    const j = this.plan.jets[jet]!;
    const jewel = JEWELS[jet]!;
    const x = j.x + rng.range(-0.4, 0.4) * j.rx;
    if (this.detail) splash(this.fx, rng, x, j.y - j.ry * 0.3, jewel, 2);
    if (now - this.lastRipple[jet]! > 0.12) {
      this.lastRipple[jet] = now;
      if (this.ripples.length < MOST_RIPPLES) this.ripples.push({ jet, x, at: now });
    }
    if (now - this.lastLandSound > 0.08) {
      this.lastLandSound = now;
      this.env.sound.fx('tap', { gain: 0.07, pan: this.pan(j.x), pitch: 8 + jewel.step * 2 });
    }
    if (grew) {
      this.heapHop[jet] = now;
      this.env.sound.note('glass', scaleNote(ROOT + 24, jewel.step), { gain: 0.12, pan: this.pan(j.x), seconds: 0.35 });
    }
  }

  private firefly(): void {
    const plan = this.plan;
    const rng = this.env.rng;
    const x = rng.range(10, plan.w - 10);
    const y = rng.range(plan.horizon + 20, plan.h - 14);
    this.fx.emit({
      x,
      y,
      vx: rng.range(-8, 8),
      vy: rng.range(-12, 4),
      life: rng.range(3.5, 6),
      size: rng.range(4, 7),
      size1: 3,
      color: [220, 255, 150],
      color1: [150, 255, 200],
      shape: 'glow',
      alpha: 0.9,
      sway: 14,
      twinkle: 0.8,
      fadeIn: 0.8,
      hold: 0.4,
    });
  }

  /** A little rain of glints on the water of the great fountain, for when nobody is playing. */
  private sprinkle(): void {
    const plan = this.plan;
    const rng = this.env.rng;
    const { x, y, s } = plan.fountain;
    const jewel = JEWELS[rng.int(JEWELS.length)]!;
    for (let i = this.fx.count(5); i > 0; i--) {
      this.fx.emit({
        x: x + rng.range(-20, 20) * s,
        y: y + (GREAT.water.y - 18) * s,
        vx: rng.range(-30, 30),
        vy: rng.range(-130, -70),
        life: rng.range(0.7, 1.1),
        size: rng.range(5, 8),
        size1: 1,
        color: jewel.light,
        shape: 'star4',
        gravity: 300,
        twinkle: 9,
        hold: 0.4,
      });
    }
    this.env.sound.note('glass', scaleNote(ROOT + 24, jewel.step), { gain: 0.1, pan: this.pan(x), seconds: 0.5 });
  }

  protected press(p: Pointer): void {
    const { x, y } = p;
    const plan = this.plan;
    const playing = this.phase === 'play' || this.phase === 'after';
    if (playing) {
      const gem = plan.gem;
      if (Math.hypot(x - gem.x, y - gem.y) <= gem.r + 8) {
        this.touchGem();
        return;
      }
      const friend = this.stands.findIndex((s) => Math.hypot(x - s.x, y - (s.y - 34 * s.scale)) <= this.friendReach(s));
      if (friend >= 0) {
        this.touchFriend(friend);
        return;
      }
      const jet = jetAt(plan, x, y);
      if (jet >= 0) {
        this.touchJet(jet, p.id);
        return;
      }
    }
    this.touchSky(x, y);
  }

  protected override drag(p: Pointer): void {
    if (this.phase !== 'play' && this.phase !== 'after') return;
    const jet = jetAt(this.plan, p.x, p.y);
    if (jet < 0 || jet === this.jets.heldBy(p.id)) return;
    this.touchJet(jet, p.id);
  }

  protected override lift(p: Pointer): void {
    this.jets.release(p.id);
  }

  /** A finger comes down on a jet, or slides onto it. */
  private touchJet(jet: number, finger: number): void {
    const now = this.time;
    this.jets.press(jet, finger, now);
    this.strike(jet);
    this.struck++;
    this.earn(this.novelty.worth('jet', jet, now));
    const run = this.runs.play(jet, now);
    if (run.length >= SWEEP) {
      this.swept++;
      this.earn(this.novelty.worth('sweep', run.way, now));
    }
    if (this.runs.isScale(run)) this.scaleSung(run.way);
  }

  /**
   * What every jet that goes does at the moment it goes: its note, its light, and its band of the
   * rainbow.
   */
  private strike(jet: number, soft = false): void {
    const now = this.time;
    const j = this.plan.jets[jet]!;
    const jewel = JEWELS[jet]!;
    const pan = this.pan(j.x);
    const sound = this.env.sound;
    this.arch.light(jet, now);
    this.heapHop[jet] = now;
    this.nextSing[jet] = now + HOLD_SING;
    sound.note('harp', scaleNote(ROOT, jewel.step), { gain: soft ? 0.5 : 0.66, pan, seconds: 1.3 });
    sound.note('glass', scaleNote(ROOT + 12, jewel.step), { gain: 0.22, pan, seconds: 0.6, delay: 0.02 });
    sound.fx('whoosh', { gain: 0.14, pan, pitch: jewel.step });
    pulse(this.fx, j.x, j.y, jewel, j.rx * 0.9);
  }

  /** The whole scale has been played, from one end of the ring to the other. */
  private scaleSung(way: number): void {
    const now = this.time;
    const sound = this.env.sound;
    const a = this.plan.arch;
    this.earn(this.novelty.worth('scale', way, now));
    JEWELS.forEach((_, i) => {
      const step = way < 0 ? JEWELS.length - 1 - i : i;
      sound.note('bell', scaleNote(ROOT + 12, step), {
        gain: 0.3,
        delay: i * 0.05,
        seconds: 0.8,
        pan: this.pan(this.plan.jets[step]!.x),
      });
    });
    sound.fx('twinkle', { gain: 0.5, pitch: 4 });
    bloomOf(
      this.fx,
      this.env.rng,
      a.x,
      a.y - a.ry,
      JEWELS.map((j) => j.color),
      40,
      18,
    );
    for (let i = 0; i < JET_COUNT; i++) this.heapHop[i] = now + i * 0.04;
    this.flash(0.1, COLORS.white);
  }

  /** The rainbow is whole: all seven bands are shining at once. */
  private wholeRainbow(): void {
    const sound = this.env.sound;
    const rng = this.env.rng;
    const a = this.plan.arch;
    this.earn(this.novelty.worth('rainbow', 'whole', this.time));
    sound.fx('swell', { gain: 0.5 });
    sound.fx('cheer', { gain: 0.4, delay: 0.1 });
    JEWELS.forEach((jewel, i) => {
      sound.note('chime', scaleNote(ROOT + 12, jewel.step), { gain: 0.34, delay: 0.1 + i * 0.07, seconds: 0.9 });
    });
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    this.flash(0.14, COLORS.white);
    // A rain of jewels from the whole length of the rainbow.
    for (let i = this.fx.count(36); i > 0; i--) this.rainFromArch(rng.range(0, 1), rng.range(0.4, 1.3));
    bloomOf(
      this.fx,
      rng,
      a.x,
      a.y - a.ry * 0.9,
      JEWELS.map((j) => j.color),
      54,
      22,
    );
  }

  /** A jewel let go from a place on the rainbow, which falls slowly to the square. */
  private rainFromArch(along: number, delay: number): void {
    const a = this.plan.arch;
    const rng = this.env.rng;
    const jewel = JEWELS[rng.int(JEWELS.length)]!;
    const ang = Math.PI + along * Math.PI;
    this.fx.emit({
      x: a.x + Math.cos(ang) * a.rx * rng.range(0.82, 1),
      y: a.y + Math.sin(ang) * a.ry * rng.range(0.82, 1),
      vx: rng.range(-14, 14),
      vy: rng.range(-10, 40),
      life: rng.range(1.8, 2.8),
      delay,
      size: rng.range(9, 14),
      color: jewel.color,
      shape: 'pic',
      pic: stoneOf(jewel.color),
      add: false,
      gravity: 120,
      spin: rng.range(-5, 5),
      rot: rng.range(0, TAU),
      hold: 0.6,
      floor: this.plan.square.y + rng.range(-10, 14),
      bounce: 0.35,
    });
  }

  /**
   * The big gem on the fountain is touched: it flashes and throws a fan of every colour of jewel.
   */
  private touchGem(): void {
    const now = this.time;
    const gem = this.plan.gem;
    const sound = this.env.sound;
    const pan = this.pan(gem.x);
    this.gemTouched++;
    if (now - this.gemAt < GRAND_REST) {
      this.gemPulse = Math.max(this.gemPulse, 0.4);
      sound.note('glass', scaleNote(ROOT + 24, 2), { gain: 0.3, pan, seconds: 0.5 });
      return;
    }
    this.gemAt = now;
    this.gemPulse = 1;
    fanOf(this.fx, this.env.rng, gem.x, gem.y - gem.r * 0.2, 36, this.waterLine());
    bloomOf(
      this.fx,
      this.env.rng,
      gem.x,
      gem.y,
      JEWELS.map((j) => j.color),
      gem.r * 2.4,
      16,
    );
    ringAt(this.fx, this.env.rng, gem.x, gem.y, [200, 150, 255], gem.r * 2.2);
    JEWELS.forEach((jewel, i) => {
      sound.note('bell', scaleNote(ROOT + 12, jewel.step), { gain: 0.34, pan, delay: i * 0.06, seconds: 0.9 });
    });
    sound.fx('boing', { gain: 0.4, pan, pitch: 4 });
    sound.fx('star', { gain: 0.4, pan });
    this.shake(0.5);
    this.earn(this.novelty.worth('gem', 'gem', now));
  }

  /**
   * A friend is touched. She casts, and a comet of her colour goes from her horn to the jet that is
   * hers, which goes with a column of bright jewels.
   */
  private touchFriend(i: number): void {
    const id = this.env.herd[i]!;
    const jet = FRIEND_JET[id];
    this.friendsTouched++;
    this.lastFriend = i;
    this.cast.cheer(i);
    this.cast.kick(i, 0.7);
    this.env.sound.fx('star', { gain: 0.4, pan: this.pan(this.stands[i]!.x), step: i });
    this.earn(this.novelty.worth('friend', id, this.time));
    this.sendComet(i, jet);
  }

  private sendComet(i: number, jet: number): void {
    const target = this.plan.jets[jet]!;
    const color = JEWELS[jet]!.color;
    this.script.at(this.script.now + CAST_RELEASE, () => {
      const horn = this.hornOf(i);
      comet(this.fx, this.env.rng, horn, { x: target.x, y: target.y - target.ry }, color, COMET);
      this.script.at(this.script.now + COMET, () => this.friendJet(jet));
    });
  }

  /** A jet goes for a moment with no finger on it, for a friend, and its jewels shine brighter. */
  private friendJet(jet: number): void {
    const now = this.time;
    this.jets.kick(jet, now, FRIEND_JET_SECONDS);
    this.enchantedUntil[jet] = now + FRIEND_JET_SECONDS + 0.5;
    this.strike(jet, true);
    const j = this.plan.jets[jet]!;
    bloomOf(this.fx, this.env.rng, j.x, j.y - j.ry, [JEWELS[jet]!.color, JEWELS[jet]!.light], j.rx * 1.4, 10);
  }

  /**
   * A touch on the sky: a ring and a note where it landed. It is not worth anything, and it
   * answers.
   */
  private touchSky(x: number, y: number): void {
    ringAt(this.fx, this.env.rng, x, y, PARTY_COLORS[Math.floor(x / 30) % PARTY_COLORS.length]!, 18);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((x / this.view.w) * 9)), {
      gain: 0.3,
      pan: this.pan(x),
      seconds: 0.5,
    });
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play') return null;
    const plan = this.plan;
    const mid = plan.jets[3]!;
    if (this.struck === 0) return { x: mid.x, y: mid.y - 16 };
    if (this.swept === 0) {
      // A finger drawn along the ring: the hand goes from one jet to another and back.
      const u = 0.5 + 0.5 * Math.sin(this.time * 2.1);
      const a = plan.jets[1]!;
      const b = plan.jets[5]!;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - 16 };
    }
    if (this.gemTouched === 0) return { x: plan.gem.x, y: plan.gem.y };
    if (this.friendsTouched === 0 && this.stands.length > 0) {
      const s = this.stands[this.stands.length > 1 ? 1 : 0]!;
      return { x: s.x, y: s.y - 34 * s.scale };
    }
    const quiet = this.piles.count.findIndex((c) => c < 3);
    const jet = plan.jets[quiet >= 0 ? quiet : 3]!;
    return { x: jet.x, y: jet.y - 16 };
  }

  protected finale(): void {
    const sound = this.env.sound;
    const s0 = this.script.now;
    const plan = this.plan;
    const rng = this.env.rng;
    sound.fx('swell', { gain: 0.7 });
    sound.fx('cheer', { gain: 0.5, delay: 0.1 });
    this.flash(0.16, COLORS.white);
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    // The scale, up the ring jet by jet, each one lighting its band of the rainbow.
    for (let i = 0; i < JET_COUNT; i++) {
      this.script.at(s0 + 0.3 + i * 0.26, () => {
        this.jets.kick(i, this.time, 2.6);
        this.strike(i);
        this.enchantedUntil[i] = this.time + 3;
      });
    }
    // Every jet at once, as high as it goes, and the rainbow held up.
    this.script.at(s0 + 2.5, () => {
      for (let i = 0; i < JET_COUNT; i++) {
        this.jets.keep(i, true);
        this.piles.fill(i, this.time);
        this.heapHop[i] = this.time + i * 0.05;
      }
      this.arch.hold(1);
      sound.fx('boom', { gain: 0.7 });
      sound.fx('rumble', { gain: 0.5 });
      this.shake(2);
      this.flash(0.22, COLORS.white);
      this.gemPulse = 1;
      const gem = plan.gem;
      fanOf(this.fx, rng, gem.x, gem.y - gem.r * 0.2, 64, this.waterLine(), 1.15);
      bloomOf(
        this.fx,
        rng,
        gem.x,
        gem.y,
        JEWELS.map((j) => j.color),
        gem.r * 3.2,
        28,
      );
      ringAt(this.fx, rng, gem.x, gem.y, [255, 230, 255], gem.r * 3.4);
      JEWELS.forEach((jewel, i) => {
        sound.note('bell', scaleNote(ROOT + 12, jewel.step), { gain: 0.5, delay: 0.1 + i * 0.07, seconds: 1.1 });
      });
    });
    // Jewels fall from the rainbow for as long as the jets go.
    for (let k = 0; k < 44; k++) {
      this.script.at(s0 + 2.8 + k * 0.1, () => {
        for (let n = this.fx.count(3); n > 0; n--) this.rainFromArch(rng.next(), 0);
      });
    }
    // Each friend sends her comet to her jet, one after another.
    this.stands.forEach((_, i) => {
      this.script.at(s0 + 3.6 + i * 0.34, () => {
        this.cast.cheer(i);
        this.sendComet(i, FRIEND_JET[this.env.herd[i]!]);
      });
    });
    // Confetti, over everything.
    this.script.at(s0 + 3, () => {
      for (let i = this.fx.count(80); i > 0; i--) {
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
    // The jets let go and the scale comes down the ring, and the fountain is left shining.
    this.script.at(s0 + 7.6, () => {
      for (let i = 0; i < JET_COUNT; i++) this.jets.keep(i, false);
    });
    for (let i = 0; i < JET_COUNT; i++) {
      this.script.at(s0 + 7.8 + i * 0.18, () => {
        const jet = JET_COUNT - 1 - i;
        this.jets.kick(jet, this.time, 0.7);
        this.strike(jet, true);
      });
    }
    this.script.at(s0 + 9.6, () => {
      this.arch.hold(0.55);
      this.endFinale();
    });
  }

  protected paintBack(p: Painter): void {
    this.ensureArt(p.k);
    this.art.paint(p);
    this.art.paintArch(p, this.plan, this.arch.level, this.detail);
    this.art.paintDecor(p);
    this.art.paintFountain(p, this.plan, this.gemPulse, this.glow);
    this.paintFriends(p);
    this.paintPools(p);
  }

  /**
   * Each pool: the water that ripples where a jewel came down, the column of light over the jet,
   * its nozzle, and the heap.
   */
  private paintPools(p: Painter): void {
    const now = this.time;
    const g = p.ctx;
    const plan = this.plan;
    for (let i = 0; i < JET_COUNT; i++) {
      const jet = plan.jets[i]!;
      const jewel = JEWELS[i]!;
      const level = this.jets.level[i]!;
      // The ripples of the pool.
      for (const r of this.ripples) {
        if (r.jet !== i) continue;
        const u = clamp((now - r.at) / 0.9);
        g.strokeStyle = `rgba(${jewel.light[0]},${jewel.light[1]},${jewel.light[2]},${0.55 * (1 - u)})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(r.x, jet.y, jet.rx * (0.12 + 0.82 * u), jet.ry * (0.12 + 0.82 * u), 0, 0, TAU);
        g.stroke();
      }
      // The light in the pool, brighter the stronger the jet.
      const heap = this.piles.count[i]!;
      glowAt(
        p.light,
        jet.x,
        jet.y - jet.ry * 0.3,
        jet.rx * (1.5 + 0.9 * level),
        jewel.color,
        0.08 + (0.1 * heap) / MOST + 0.3 * level,
      );
      this.paintHeap(g, i);
      // The column of light, over the jewels that go up it.
      if (level > 0.02) {
        const room = Math.min(380, jet.y - plan.ceiling(jet.x) - 8);
        const h = heightOf(level, room) * 0.94;
        const w = (11 + 9 * level) * jet.scale;
        const grad = p.light.createLinearGradient(0, jet.y, 0, jet.y - h);
        grad.addColorStop(0, `rgba(${jewel.light[0]},${jewel.light[1]},${jewel.light[2]},${0.3 * level})`);
        grad.addColorStop(1, `rgba(${jewel.light[0]},${jewel.light[1]},${jewel.light[2]},0)`);
        p.light.fillStyle = grad;
        p.light.fillRect(jet.x - w / 2, jet.y - h, w, h);
        glowAt(p.light, jet.x, jet.y - jet.ry * 0.5, jet.rx * 1.2, COLORS.white, 0.35 * level);
      }
    }
  }

  /**
   * The heap of a pool: a mound of its jewels that hops when a new one is added and when the jet is
   * played.
   */
  private paintHeap(g: CanvasRenderingContext2D, i: number): void {
    const jet = this.plan.jets[i]!;
    const count = this.piles.count[i]!;
    if (count <= 0) return;
    const now = this.time;
    const stone = gemImage(JEWELS[i]!.color);
    const size = jet.rx * 0.36;
    const since = now - this.heapHop[i]!;
    const hop = since >= 0 && since < 0.34 ? Math.sin((since / 0.34) * Math.PI) * size * 0.28 : 0;
    const newest = now - this.piles.added[i]!;
    for (let k = 0; k < count; k++) {
      const slot = slotOf(k);
      const grow = k === count - 1 && newest < 0.4 ? 1 + 0.4 * Math.sin((newest / 0.4) * Math.PI) : 1;
      const w = size * grow;
      const x = jet.x + slot.across * size * 1.02;
      const y = jet.y - jet.ry * 0.1 - slot.up * size * 0.86 - hop * (0.5 + slot.up * 0.3);
      g.drawImage(stone, x - w / 2, y - w * 0.85, w, w);
    }
  }

  private paintFriends(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = this.stands.map((s, i) => ({ s, i })).sort((a, b) => a.s.y - b.s.y || a.i - b.i);
    for (const { s, i } of order) {
      const id = this.env.herd[i]!;
      g.fillStyle = 'rgba(8,10,40,0.34)';
      g.beginPath();
      g.ellipse(s.x, s.y + 1, 36 * s.scale, 5 * s.scale, 0, 0, TAU);
      g.fill();
      this.cast.draw(g, bank, i, id, s.scale);
      // The friend whose comet is on its way, or whose jet is going, shines in her colour.
      if (i === this.lastFriend && this.jets.on(FRIEND_JET[id], this.time)) {
        const horn = this.hornOf(i);
        glowAt(p.light, horn.x, horn.y, 34, lighten(JEWELS[FRIEND_JET[id]]!.color, 0.3), 0.5);
      }
    }
  }

  /** Nothing is held in front of the square, which is lit from inside the picture. */
  protected paintFront(_p: Painter): void {}
}
