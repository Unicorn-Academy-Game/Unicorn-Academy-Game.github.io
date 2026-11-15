import { COLORS, lighten, RAINBOW } from '../engine/color';
import { clamp, damp, easeOutBack, lerp, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { scaleNote } from '../music';
import { GLADE } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { ringAt } from './balloons/pops';
import { Blower, type Blowing } from './bubbles/blower';
import { type Bubble, Field } from './bubbles/field';
import { Film } from './bubbles/film';
import { type Cue, Finale } from './bubbles/finale';
import { Garden } from './bubbles/garden';
import { FULL, Giant, storm } from './bubbles/giant';
import { Glade } from './bubbles/glade';
import { paintPrize, paintSparkleRing, spotsOf } from './bubbles/icons';
import { PRIZE, type Prize, PrizeBag } from './bubbles/kinds';
import { insidePond, type Plan, planOf } from './bubbles/layout';
import { looksOf } from './bubbles/looks';
import { Machine } from './bubbles/machine';
import { friendBurst, gemMoment, heartMoment, noteMoment, prizeFlies, Rainbow, starMoment } from './bubbles/moments';
import { glintsAt, popBubble, sprayAt } from './bubbles/pops';
import { react, type Scene } from './bubbles/reactions';
import type { Heard } from './bubbles/residents';
import { bubbleFor, type Happened as RideHappened, Rides } from './bubbles/rides';
import { Audience, type Member } from './sky/audience';
import { BurstLight } from './sky/light';
import { MAGIC } from './sky/looks';

/**
 * The points each star is earned at. A freed prize is a point or so, a rare one is three, and a
 * bubble that held several is worth all of them.
 */
const BUBBLE_STAR_COSTS = [4, 10, 18, 28, 40] as const;

/**
 * How far past the edge of a bubble a touch still counts, at first and at most. A miss widens it,
 * and a hit puts it back.
 */
const SLACK = 12;
const SLACK_MOST = 28;

/** What a ride in a bubble is worth toward the stars when it is burst. */
const RIDE_POINTS = 4;

/** How long what is inside a bubble takes to settle into its places when it changes, in seconds. */
const SETTLE = 0.34;

/**
 * In the finale: how fast the bubbles of the sky are called to the great bubble, and how close to
 * its middle, as a share of its radius, one must come to be taken in.
 */
const CALLED_SPEED = 260;
const TAKEN_AT = 0.55;

/** The most residents of the garden that answer when the finale begins. */
const SINGERS_MOST = 14;

/**
 * The root of the garden's tunes, middle C. Every note is of its major pentatonic scale, so none is
 * wrong over the music.
 */
const ROOT = 60;

/**
 * The bubble garden. A machine on the grass blows bubbles and every one has a surprise inside: a
 * butterfly, a flower, a fish, a bird, a note, a star. Popping one lets its surprise out, and what
 * stays (the butterflies, the flowers, the fish) stays, so the garden fills with what the player
 * has popped. Two bubbles that touch become one bubble that holds both surprises.
 */
export class BubbleGarden extends Wonder {
  readonly id = 'bubble-garden' as const;
  protected readonly meter = new Meter(BUBBLE_STAR_COSTS);
  private readonly field: Field;
  private readonly rides: Rides;
  private readonly bag: PrizeBag;
  private readonly film = new Film();
  private readonly machine = new Machine();
  private readonly blower = new Blower();
  /** The bubble the player is blowing, while their finger is on the machine. */
  private blown: Bubble | null = null;
  private blownLast = 0;
  private readonly audience: Audience;
  private readonly light = new BurstLight();
  private readonly scene: Scene;
  private readonly rainbows: Rainbow[] = [];
  private readonly seed: number;
  private garden!: Garden;
  private giant!: Giant;
  private glade!: Glade;
  private plan!: Plan;
  private slack = SLACK;
  private spawnWait = 0;
  /** How much the sky is lit by what has just burst, which fades. */
  private glow = 0;
  private first = true;
  /**
   * How many bubbles the player has popped, and whether they have yet held the machine or taken a
   * friend up, which the hand shows them when they have not.
   */
  private popped = 0;
  private blew = false;
  private rode = false;
  /**
   * The timing of the finale while it plays, how many bubbles the great bubble has taken in, and
   * when a bubble of the storm last rang a note.
   */
  private show: Finale | null = null;
  private taken = 0;
  private stormRang = 0;
  private chorusAt = -9;

  constructor(env: WonderEnv) {
    super(env);
    this.field = new Field(env.rng);
    this.rides = new Rides(this.field, env.rng);
    this.bag = new PrizeBag(env.rng);
    this.audience = new Audience(env.bank, env.rng, COLORS.white);
    this.seed = env.rng.int(0x7fffffff);
    this.scene = {
      fx: this.fx,
      rng: env.rng,
      sound: env.sound,
      width: () => this.view.w,
      ripple: (x, y, size) => this.glade.ripple(x, y, size),
    };
    this.startMusic(GLADE);
  }

  override get bloom(): number {
    return this.env.calm ? 0.15 : 0.3;
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly bubbles: readonly {
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly prizes: readonly string[];
      readonly ready: boolean;
      readonly rider: string | null;
      readonly held: boolean;
    }[];
    readonly machine: { readonly x: number; readonly y: number; readonly half: number; readonly height: number };
    readonly friends: readonly { readonly id: string; readonly x: number; readonly y: number }[];
    readonly residents: Readonly<Partial<Record<Prize, number>>>;
    readonly slack: number;
    /**
     * How many prizes are in the bubble the player is blowing, or 0 if they are not blowing one.
     */
    readonly blowing: number;
    /** How many friends are in bubbles. */
    readonly riding: number;
    /**
     * The stage of the finale, or null when it is not playing, and how big the great bubble is as a
     * share of its room.
     */
    readonly stage: string | null;
    readonly giant: number;
  } {
    const m = this.plan.machine;
    const residents: Partial<Record<Prize, number>> = {};
    for (const r of this.garden.residents) if (!r.leaving) residents[r.prize] = (residents[r.prize] ?? 0) + 1;
    return {
      bubbles: this.field.bubbles.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        r: b.r,
        prizes: [...b.prizes],
        ready: b.r > b.rTo * 0.85 && !b.held,
        rider: b.rider,
        held: b.held,
      })),
      machine: { x: m.x, y: m.y, half: m.half, height: m.height },
      friends: this.audience.members.map((f) => ({ id: f.id, x: f.x, y: f.y - 50 * f.scale })),
      residents,
      slack: this.slack,
      blowing: this.blown ? this.blown.prizes.length : 0,
      riding: this.rides.list.length,
      stage: this.show ? this.show.stage : null,
      giant: this.giant.size,
    };
  }

  protected arrange(view: View): void {
    this.plan = planOf({ w: view.w, h: view.h, unit: view.unit });
    this.glade = new Glade(this.env.bank, this.seed, view, this.plan);
    this.rides.clear();
    this.audience.stand(this.env.herd, view.w, this.plan.standFrom, this.plan.feet, 0, this.time, {
      side: 'right',
      maxScale: this.plan.friends.scale,
    });
    // A garden the player has grown stays when the screen turns: everything in it moves to the same
    // place in the new picture.
    if (this.first) {
      this.garden = new Garden(this.env.rng, this.plan, this.env.bank);
      this.giant = new Giant(this.env.rng, this.plan.giant);
    } else {
      this.garden.refit(this.plan);
      this.giant.place(this.plan.giant);
    }
    this.setUp(this.first);
    this.first = false;
  }

  /**
   * Fills the sky with bubbles from all over it, so the garden is not empty for the first moment.
   */
  private setUp(scatter: boolean): void {
    this.field.clear();
    this.blower.cancel();
    this.blown = null;
    // The sky is not refilled while the great bubble is being made: the bubbles in it are the ones
    // it has taken.
    if (this.show) return;
    const { w } = this.view;
    const n = Math.round(this.plan.crowd * 0.75);
    for (let i = 0; i < n; i++) {
      const prize = this.bag.next((p) => this.garden.full(p));
      this.field.add({
        x: ((i + 0.5 + this.env.rng.range(-0.3, 0.3)) / n) * w,
        y: this.env.rng.range(this.plan.air.floor * 0.12, this.plan.air.floor * 0.8),
        vx: this.env.rng.range(-8, 8),
        vy: this.env.rng.range(-14, -6),
        prizes: [prize],
        swell: scatter,
      });
    }
  }

  protected reset(): void {
    this.rides.clear();
    this.popped = 0;
    this.blew = false;
    this.rode = false;
    this.bag.reset();
    this.light.clear();
    this.audience.reset(this.time);
    this.garden.clear();
    this.rainbows.length = 0;
    this.show = null;
    this.taken = 0;
    this.chorusAt = -9;
    if (this.giant.opened) this.giant.burst();
    this.slack = SLACK;
    this.spawnWait = 0;
    this.glow = 0;
    this.setUp(true);
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play') return null;
    // Once the player has the way of popping, the hand shows what else there is: a friend to take
    // up, and the machine to hold.
    if (this.popped >= 4 && !this.rode) {
      const friend = this.audience.members.find((m) => !this.rides.riding(m));
      if (friend) return { x: friend.x, y: friend.y - 56 * friend.scale };
    }
    if (this.popped >= 8 && !this.blew) {
      const m = this.plan.machine;
      return { x: m.x, y: m.y - m.height * 0.4 };
    }
    // The bubble the player can reach best: the one nearest the middle of the screen's air.
    let best: Bubble | null = null;
    let score = Infinity;
    for (const b of this.field.bubbles) {
      if (b.held || b.r < b.rTo * 0.9 || b.y < 90) continue;
      const s = Math.abs(b.x - this.view.w * 0.55) * 0.5 + Math.abs(b.y - this.plan.air.floor * 0.45);
      if (s < score) {
        score = s;
        best = b;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  protected press(p: Pointer): void {
    // A bubble that has only just left the ring is not what a touch on the machine means.
    const onMachine = this.machine.hit(this.plan, p.x, p.y);
    const b = this.field.at(p.x, p.y, this.slack, onMachine ? 0.8 : 0);
    if (b) {
      this.slack = SLACK;
      this.pop(b);
      return;
    }
    const resident = this.garden.at(p.x, p.y);
    if (resident) {
      resident.poke(this.garden);
      return;
    }
    const friend = this.audience.at(p.x, p.y);
    if (friend) {
      // The friends are lifted in the finale at the moment it chooses, not before: until then a
      // touch makes her hop for joy.
      if (!this.show || this.show.stage === 'burst') this.rideBegins(friend);
      else this.friendCheers(friend);
      return;
    }
    if (this.giant.has(p.x, p.y)) {
      this.giant.poke(p.x, p.y);
      this.env.sound.note('glass', scaleNote(ROOT + 12, 2 + (this.taken % 6)), {
        pan: this.pan(p.x),
        gain: 0.35,
        seconds: 0.6,
      });
      return;
    }
    if (insidePond(this.plan.pond, p.x, p.y) < 1) {
      this.pondTouched(p.x, p.y);
      return;
    }
    if (onMachine) {
      this.startBlow(p);
      return;
    }
    this.slack = Math.min(SLACK_MOST, this.slack + 5);
  }

  protected override lift(p: Pointer): void {
    const ended = this.blower.lift(p.id, this.time);
    if (!ended) return;
    if (ended.is === 'tap') this.blow();
    else this.letGo();
  }

  protected override drag(p: Pointer): void {
    // A finger swept through the air pushes the bubbles along, and does not pop them.
    this.field.push(p.x, p.y, p.vx, p.vy, 10);
  }

  /**
   * A touch on the machine: a tap blows a few bubbles, and a touch that is held blows one that
   * grows.
   */
  private startBlow(p: Pointer): void {
    const pan = this.pan(this.plan.machine.x);
    // In the finale the machine only answers: the sky is full already.
    if (this.phase === 'finale') {
      this.machine.puff(0.4);
      this.env.sound.fx('tap', { pan, gain: 0.3, pitch: 9 });
      return;
    }
    if (!this.blower.press(p.id, this.time)) return;
    this.blew = true;
    this.machine.puff(0.5);
    this.env.sound.fx('tap', { pan, gain: 0.4, pitch: 9 });
  }

  /** A tap: the machine puffs and a few bubbles leave the ring one after another. */
  private blow(): void {
    this.machine.puff();
    this.env.sound.fx('boing', { pan: this.pan(this.plan.machine.x), gain: 0.5, pitch: 5 });
    for (let i = 0; i < 3; i++) this.script.at(this.script.now + i * 0.13, () => this.launch(i === 0));
  }

  /**
   * The bubble the player is blowing forms at the ring, takes one more prize every moment the
   * player holds on, and shivers when it can hold no more.
   */
  private blowing(dt: number): void {
    for (const e of this.blower.step(this.time)) this.grew(e);
    const b = this.blown;
    if (!b) return;
    const m = this.plan.machine;
    // It stays on the ring, its lower edge on it, and breathes.
    b.x = m.mouth.x;
    b.y = m.mouth.y - b.r * 0.9;
    b.vx = 0;
    b.vy = 0;
    b.squashAt = Math.PI / 2;
    b.squash = 0.03 * Math.sin(this.time * 6.5) * (1 + b.prizes.length * 0.3);
    this.machine.work = Math.max(this.machine.work, 0.75);
    this.blownLast -= dt;
    if (this.blownLast <= 0) {
      this.blownLast = 0.1;
      sprayAt(this.fx, this.env.rng, m.mouth.x + b.r * 0.55, m.mouth.y - 2, 1);
    }
  }

  private grew(e: Blowing): void {
    const m = this.plan.machine;
    const rng = this.env.rng;
    const pan = this.pan(m.mouth.x);
    if (e.is === 'begin') {
      const prize = this.bag.next((p) => this.garden.full(p));
      this.blown = this.field.add({ x: m.mouth.x, y: m.mouth.y, prizes: [prize], held: true, mine: true, swell: true });
      this.env.sound.fx('swell', { pan, gain: 0.3, pitch: 2 });
      return;
    }
    const b = this.blown;
    if (!b) return;
    if (e.is === 'more') {
      const prize = this.bag.next((p) => this.garden.full(p));
      this.field.addPrize(b, prize, rng.int(looksOf(prize)));
      this.env.sound.note('glass', scaleNote(ROOT + 12, [0, 2, 4][e.n - 1] ?? 4), { pan, gain: 0.5, seconds: 0.7 });
      ringAt(this.fx, rng, b.x, b.y, PRIZE[prize].color, b.r * 0.5);
      return;
    }
    // Full: it shivers, and a bright note says to let it go.
    b.squashV += 9;
    glintsAt(this.fx, rng, b.x, b.y, COLORS.white, 6, 1.3);
    this.env.sound.note('bell', scaleNote(ROOT + 24, 2), { pan, gain: 0.4, seconds: 0.9 });
  }

  /** The player lets go: the bubble they blew floats up from the ring. */
  private letGo(): void {
    const b = this.blown;
    this.blown = null;
    this.machine.puff(0.7);
    if (!b) return;
    const rng = this.env.rng;
    b.held = false;
    b.vx = rng.range(18, 46);
    b.vy = -rng.range(80, 112);
    b.squashV += 7;
    this.env.sound.fx('whoosh', { pan: this.pan(b.x), gain: 0.4, pitch: 6 });
    this.env.sound.note('chime', scaleNote(ROOT + 12, 2 + b.prizes.length * 2), {
      pan: this.pan(b.x),
      gain: 0.4,
      seconds: 0.8,
    });
  }

  /**
   * A touch on the water: ripples spread, a few tiny bubbles rise, a note drops in, and the fish
   * swim over to see.
   */
  private pondTouched(x: number, y: number): void {
    const pan = this.pan(x);
    // Three rings, one after another, each a little smaller, so it reads as a drop and not as a
    // mark.
    this.glade.ripple(x, y, 1.8);
    this.script.at(this.script.now + 0.2, () => this.glade.ripple(x, y, 1.25));
    this.script.at(this.script.now + 0.4, () => this.glade.ripple(x, y, 0.75));
    sprayAt(this.fx, this.env.rng, x, y, 3);
    this.garden.lure(x, y);
    this.env.sound.fx('splash', { pan, gain: 0.3, size: 0.25 });
    this.env.sound.note('glass', scaleNote(ROOT + 12, 1 + Math.floor((x / this.view.w) * 7)), {
      pan,
      gain: 0.28,
      delay: 0.04,
      seconds: 0.5,
    });
  }

  /** A bubble leaves the ring, a speck that swells as it rises. */
  private launch(loud: boolean): Bubble {
    const m = this.plan.machine;
    const rng = this.env.rng;
    const prize = this.bag.next((p) => this.garden.full(p));
    const b = this.field.add({
      x: m.mouth.x + rng.range(-3, 3),
      y: m.mouth.y,
      vx: rng.range(14, 46),
      vy: -rng.range(28, 52),
      prizes: [prize],
      swell: true,
    });
    if (loud) this.env.sound.fx('tap', { pan: this.pan(m.mouth.x), gain: 0.4, pitch: 9 });
    return b;
  }

  /** A touch on a friend blows a great bubble round her, which carries her up over the garden. */
  private rideBegins(friend: Member, quick = false): void {
    if (!this.rides.start(friend, this.plan, this.time, quick)) return;
    this.rode = true;
    const magic = MAGIC[friend.id].scheme;
    const pan = this.pan(friend.x);
    ringAt(this.fx, this.env.rng, friend.x, friend.y - 40 * friend.scale, magic.flash, 26);
    this.env.sound.fx('swell', { pan, gain: quick ? 0.35 : 0.5, pitch: 5 });
    // In the finale the friends go up one after another, so each has one bright note instead of a
    // run.
    if (quick)
      this.env.sound.note('bell', scaleNote(ROOT + 12, 2 + this.rides.list.length * 2), {
        pan,
        gain: 0.45,
        delay: 0.05,
        seconds: 0.8,
      });
    else
      [0, 2, 4].forEach((n, i) => {
        this.env.sound.note('bell', scaleNote(ROOT + 12, n), { pan, gain: 0.45, delay: 0.05 + i * 0.09, seconds: 0.8 });
      });
  }

  /**
   * The bubble round a friend bursts: her magic comes out of it in her colours, and she floats
   * down.
   */
  private rideBursts(b: Bubble): void {
    const ride = this.rides.of(b);
    this.field.remove(b);
    if (!ride) return;
    const magic = MAGIC[ride.friend.id].scheme;
    const pan = this.pan(b.x);
    popBubble(this.fx, this.env.rng, b.x, b.y, magic.flash, b.r, 1.3);
    friendBurst(this.fx, this.env.rng, b.x, b.y, magic.colors, magic.flash, b.r);
    this.light.add(b.x, b.y, magic.flash, 160, 0.3);
    this.glow = Math.min(1, this.glow + 0.35);
    this.env.sound.fx('pop', { pan, size: 1, gain: 0.8 });
    [0, 2, 4, 7].forEach((n, i) => {
      this.env.sound.note('harp', scaleNote(ROOT + 12, n), { pan, gain: 0.5, delay: 0.04 + i * 0.07, seconds: 0.9 });
    });
    this.rides.burst(ride, this.time);
    this.earn(RIDE_POINTS);
  }

  private rideHappened(e: RideHappened): void {
    const f = e.ride.friend;
    const pan = this.pan(f.x);
    if (e.is === 'drifted') {
      // The player's bubble came all the way down by itself and bursts softly.
      popBubble(this.fx, this.env.rng, e.x, e.y, MAGIC[f.id].scheme.flash, bubbleFor(f.scale) * 0.8);
      this.env.sound.fx('pop', { pan, size: 0.8, gain: 0.5 });
      return;
    }
    // She is down: a little hop, and hearts over her.
    f.hopAt = this.time;
    f.hopPower = 0.8;
    ringAt(this.fx, this.env.rng, f.x, f.y - 100 * f.scale, PRIZE.heart.color, 16);
    this.env.sound.fx('thud', { pan, gain: 0.3 });
    this.env.sound.note('bell', scaleNote(ROOT + 12, 4), { pan, gain: 0.4, delay: 0.1, seconds: 0.8 });
  }

  /** A bubble goes off, and what was inside comes out. */
  private pop(b: Bubble): void {
    this.popped++;
    if (b.rider) {
      this.rideBursts(b);
      return;
    }
    const rng = this.env.rng;
    this.field.remove(b);
    const lead = PRIZE[b.prizes[0] ?? 'note'];
    popBubble(this.fx, rng, b.x, b.y, lead.color, b.r);
    this.light.add(b.x, b.y, lead.color, 120, 0.2);
    this.glow = Math.min(1, this.glow + 0.2);
    const pan = this.pan(b.x);
    this.env.sound.fx('pop', { pan, size: clamp((b.r - 20) / 30), gain: 0.8 });
    const spots = spotsOf(b.prizes.length);
    let points = 0;
    b.prizes.forEach((prize, i) => {
      const spot = spots[i]!;
      const at = { x: b.x + spot[0] * b.r, y: b.y + spot[1] * b.r };
      points += PRIZE[prize].points;
      this.fx.emit({
        x: at.x,
        y: at.y,
        life: 0.5,
        size: 20,
        size1: 90,
        color: lighten(PRIZE[prize].color, 0.3),
        shape: 'glow',
        alpha: 0.6,
      });
      this.release(prize, b.looks[i] ?? 0, at);
      // A bubble that held several rings a chord, a note for each, so a bigger bubble sounds
      // bigger.
      if (b.prizes.length > 1)
        this.env.sound.note('glass', scaleNote(ROOT + 12, [0, 2, 4][i]!), {
          pan,
          gain: 0.45,
          delay: 0.04 + i * 0.07,
          seconds: 0.6,
        });
    });
    if (b.prizes.length === 1)
      this.env.sound.note('glass', scaleNote(ROOT + 12, 1 + Math.floor((b.x / this.view.w) * 7)), {
        pan,
        gain: 0.32,
        delay: 0.03,
        seconds: 0.5,
      });
    // A bubble with nothing in it, which the finale leaves behind, is only a note.
    if (b.prizes.length === 0)
      this.env.sound.note('glass', scaleNote(ROOT + 24, 1 + Math.floor((b.x / this.view.w) * 7)), {
        pan,
        gain: 0.3,
        seconds: 0.5,
      });
    this.earn(points);
  }

  /**
   * What comes out of a bubble: a creature or a flower that stays, or a surprise that is a moment.
   */
  private release(prize: Prize, look: number, at: { x: number; y: number }): void {
    const rng = this.env.rng;
    if (PRIZE[prize].home !== 'none') {
      this.garden.add(prize, look, at);
      if (prize === 'fairy') this.fairyArrives(at);
      return;
    }
    const pan = this.pan(at.x);
    switch (prize) {
      case 'note':
        noteMoment(this.fx, rng, at.x, at.y);
        this.env.sound.note('bell', scaleNote(ROOT + 12, 3 + rng.int(5)), {
          pan,
          gain: 0.55,
          delay: 0.1,
          seconds: 0.9,
        });
        break;
      case 'star': {
        starMoment(this.fx, rng, at.x, at.y);
        this.env.sound.fx('star', { pan, gain: 0.6 });
        break;
      }
      case 'heart':
        heartMoment(this.fx, rng, at.x, at.y);
        this.env.sound.fx('swell', { pan, gain: 0.4, pitch: 7 });
        this.friendHops(at.x);
        break;
      case 'gem': {
        const m = this.plan.meadow;
        const floor = clamp(m.bottom - rng.range(0, 26), at.y + 12, m.bottom + 4);
        gemMoment(this.fx, rng, at.x, at.y, floor, look);
        this.env.sound.fx('coin', { pan, gain: 0.5 });
        break;
      }
      case 'rainbow':
        this.rainbows.push(new Rainbow());
        this.audience.celebrate(this.time);
        break;
      default:
        break;
    }
  }

  /** A friend hops, and a small ring of hearts opens over her. */
  private friendCheers(f: Member): void {
    f.hopAt = this.time;
    f.hopPower = 0.8;
    ringAt(this.fx, this.env.rng, f.x, f.y - 100 * f.scale, PRIZE.heart.color, 14);
    this.env.sound.fx('swell', { pan: this.pan(f.x), gain: 0.3, pitch: 12 });
  }

  /**
   * The friend nearest to a point hops for joy, and a ring of hearts opens over her a moment after.
   */
  private friendHops(x: number): void {
    let near = this.audience.members[0];
    for (const m of this.audience.members) if (!near || Math.abs(m.x - x) < Math.abs(near.x - x)) near = m;
    if (!near) return;
    const friend = near;
    this.script.at(this.script.now + 0.5, () => {
      friend.hopAt = this.time;
      friend.hopPower = 1;
      ringAt(this.fx, this.env.rng, friend.x, friend.y - 100 * friend.scale, PRIZE.heart.color, 18);
      this.env.sound.fx('swell', { pan: this.pan(friend.x), gain: 0.35, pitch: 12 });
    });
  }

  /**
   * A fairy has come out of her bubble: a ring of light, a run of bells, and the flowers shine in
   * turn.
   */
  private fairyArrives(at: { x: number; y: number }): void {
    ringAt(this.fx, this.env.rng, at.x, at.y, PRIZE.fairy.color, 34);
    [0, 2, 4, 5, 7].forEach((n, i) => {
      this.env.sound.note('bell', scaleNote(ROOT + 12, n), {
        pan: this.pan(at.x),
        gain: 0.55,
        delay: 0.1 + i * 0.08,
        seconds: 1,
      });
    });
    this.flowerChorus();
  }

  /**
   * Every flower shines and sings in turn, from the left of the meadow to the right, a note higher
   * each time.
   */
  private flowerChorus(): void {
    // Two fairies asked together, or a fairy and the finale, sing it once.
    if (this.time - this.chorusAt < 1.5) return;
    this.chorusAt = this.time;
    const flowers = [...this.garden.blooms].filter((f) => f.ready).sort((a, b) => a.head.x - b.head.x);
    flowers.forEach((f, i) => {
      this.script.at(this.script.now + 0.25 + i * 0.09, () => {
        f.glow = 1;
        this.env.sound.note('marimba', scaleNote(ROOT, 5 + (i % 10)), {
          pan: this.pan(f.head.x),
          gain: 0.5,
          seconds: 0.5,
        });
        ringAt(this.fx, this.env.rng, f.head.x, f.head.y, PRIZE.flower.color, 14);
      });
    });
  }

  /** What the residents did, as light and sound. */
  private heard(e: Heard): void {
    react(e, this.scene);
    if (e.is === 'poke' && e.prize === 'fairy') this.flowerChorus();
  }

  /**
   * The garden sings. A great bubble opens at the top of the sky and the bubbles are called to it,
   * each taken in with a note higher than the last, and what they held turns inside it. It is blown
   * up and bursts: what it held flies out, a storm of small bubbles and two rainbows fill the sky,
   * and the friends are lifted into bubbles of their own, which burst one after another. `Finale`
   * says when; this says what.
   */
  protected finale(): void {
    this.script.clear();
    this.blower.cancel();
    this.letGo();
    this.taken = 0;
    this.show = new Finale(this.audience.members.length);
    for (const ride of [...this.rides.list]) if (ride.bubble) this.rideBursts(ride.bubble);
  }

  private finaleGoes(dt: number): void {
    const show = this.show;
    if (!show) return;
    let left = 0;
    for (const b of this.field.bubbles) if (b.aim && !b.rider) left++;
    for (const cue of show.step(dt, left)) this.cue(cue);
  }

  private cue(c: Cue): void {
    const g = this.giant;
    const rng = this.env.rng;
    switch (c.is) {
      case 'sing':
        this.sing();
        break;
      case 'open':
        g.open();
        ringAt(this.fx, rng, g.x, g.y, COLORS.white, 22);
        glintsAt(this.fx, rng, g.x, g.y, COLORS.white, 8, 1.2);
        this.env.sound.fx('whoosh', { pan: this.pan(g.x), gain: 0.4, pitch: 3 });
        this.env.sound.note('chime', scaleNote(ROOT + 24, 4), { pan: this.pan(g.x), gain: 0.5, seconds: 1.2 });
        break;
      case 'gather':
        // Every bubble in the sky is called, and none that is a friend's, or that is about to go by
        // itself.
        for (const b of this.field.bubbles) {
          if (b.rider || b.life !== null) continue;
          b.aim = { x: g.x, y: g.y };
          b.speed = CALLED_SPEED;
          b.squashV += 2;
        }
        this.env.sound.fx('whoosh', { gain: 0.35, pitch: 6 });
        break;
      case 'swell': {
        // Whatever is late hurries, and it is blown up to its full size with a run of notes up the
        // scale.
        for (const b of this.field.bubbles) if (b.aim && !b.rider) b.speed = CALLED_SPEED * 2;
        g.inflate(FULL);
        this.env.sound.fx('swell', { gain: 0.6, pitch: 3 });
        for (let i = 0; i < 8; i++)
          this.env.sound.note('chime', scaleNote(ROOT + 12, i), {
            pan: this.pan(g.x),
            gain: 0.3 + i * 0.03,
            delay: i * 0.2,
            seconds: 0.7,
          });
        break;
      }
      case 'shiver':
        g.shiver = 1;
        this.env.sound.fx('rumble', { gain: 0.4 });
        for (let i = 0; i < 6; i++)
          this.env.sound.note('bell', scaleNote(ROOT + 24, 3 + (i % 3)), {
            pan: this.pan(g.x),
            gain: 0.28,
            delay: i * 0.1,
            seconds: 0.4,
          });
        break;
      case 'burst':
        this.grandBurst();
        break;
      case 'lift': {
        const m = this.audience.members[c.friend];
        if (m) this.rideBegins(m, true);
        break;
      }
      case 'pop': {
        const m = this.audience.members[c.friend];
        const ride = m ? this.rides.list.find((r) => r.friend === m) : undefined;
        if (ride?.bubble) this.rideBursts(ride.bubble);
        break;
      }
      case 'done':
        this.show = null;
        this.endFinale();
        // The sky has been emptied into the great bubble, so the machine blows it full again.
        this.machine.puff(1);
        for (let i = 0; i < 6; i++) this.script.at(this.script.now + 0.2 + i * 0.15, () => this.launch(i === 0));
        break;
    }
  }

  /**
   * The garden answers: the friends celebrate, and everything that lives in it stirs, from the left
   * of the meadow to the right.
   */
  private sing(): void {
    this.audience.celebrate(this.time);
    this.flash(0.16);
    this.env.sound.fx('swell', { gain: 0.5, pitch: 3 });
    [0, 2, 4, 5, 7, 9].forEach((n, i) => {
      this.env.sound.note('bell', scaleNote(ROOT + 12, n), {
        pan: this.pan(this.view.w * (0.2 + i * 0.12)),
        gain: 0.5,
        delay: i * 0.09,
        seconds: 1.1,
      });
    });
    const all = this.garden.residents.filter((r) => !r.leaving && !r.gone && !r.falling).sort((a, b) => a.x - b.x);
    // A garden of forty answers with a dozen or so, spread from one side to the other, so it is a
    // song and not a din.
    const crowd = all.filter((_, i) => i % Math.ceil(all.length / SINGERS_MOST) === 0);
    const gap = Math.min(0.1, 0.8 / Math.max(1, crowd.length));
    crowd.forEach((r, i) => {
      this.script.at(this.script.now + 0.15 + i * gap, () => {
        if (!r.leaving && !r.gone) r.poke(this.garden);
      });
    });
  }

  /**
   * A bubble that has come all the way to the great bubble goes into it: it grows, its prizes turn
   * inside, and a note rings, a step higher each time.
   */
  private takeIn(): void {
    const g = this.giant;
    if (!g.opened) return;
    for (const b of [...this.field.bubbles]) {
      if (!b.aim || b.rider) continue;
      if (Math.hypot(b.x - g.x, b.y - g.y) < g.r * TAKEN_AT) this.absorb(b);
    }
  }

  private absorb(b: Bubble): void {
    const g = this.giant;
    const rng = this.env.rng;
    const skin = g.skinAt(Math.atan2(b.y - g.y, b.x - g.x));
    g.take(b);
    this.field.remove(b);
    ringAt(this.fx, rng, skin.x, skin.y, PRIZE[b.prizes[0] ?? 'note'].color, 12);
    glintsAt(this.fx, rng, skin.x, skin.y, COLORS.white, 3, 0.6);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.min(this.taken++, 11)), {
      pan: this.pan(g.x),
      gain: 0.42,
      seconds: 0.6,
    });
  }

  /**
   * The great bubble bursts: light and sound, what was in it flying out in its own picture, a storm
   * of small bubbles, and two rainbows.
   */
  private grandBurst(): void {
    const g = this.giant;
    const rng = this.env.rng;
    for (const b of [...this.field.bubbles]) if (b.aim && !b.rider) this.absorb(b);
    const { x, y, r } = g;
    const inside = g.guests.map((guest) => ({ guest, at: g.guestAt(guest) }));
    g.burst();
    const colors = this.audience.members.flatMap((m) => MAGIC[m.id].scheme.colors);
    this.flash(0.55);
    this.shake(3.5);
    this.light.add(x, y, [255, 240, 255], r * 3, 0.6);
    this.glow = 1;
    this.fx.emit({ x, y, life: 0.3, size: r * 1.1, size1: r * 3.6, color: COLORS.white, shape: 'glow', alpha: 0.9 });
    [0, 2, 4].forEach((c, i) => {
      this.fx.emit({
        x,
        y,
        life: 0.7 + 0.12 * i,
        size: r * 0.9,
        size1: r * (2.2 + 0.7 * i),
        color: RAINBOW[c]!,
        shape: 'ring',
        width: 4.5 - i,
        alpha: 0.8,
        delay: 0.07 * i,
      });
    });
    // A ring that crosses the whole sky, and a starburst of sparks in the colours of the rainbow.
    this.fx.emit({
      x,
      y,
      life: 1,
      size: r,
      size1: this.view.w * 0.5,
      color: COLORS.white,
      shape: 'ring',
      width: 2,
      alpha: 0.45,
      delay: 0.04,
    });
    const rays = this.fx.count(28);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + rng.range(-0.08, 0.08);
      const speed = rng.range(300, 560);
      this.fx.emit({
        x: x + Math.cos(a) * r * 0.6,
        y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rng.range(0.55, 0.95),
        size: rng.range(6, 10),
        size1: 2,
        color: lighten(RAINBOW[i % RAINBOW.length]!, 0.45),
        shape: 'spark',
        tail: 0.2,
        halo: 3,
        drag: 2.4,
        hold: 0.25,
      });
    }
    popBubble(this.fx, rng, x, y, COLORS.white, r, 2.4);
    friendBurst(this.fx, rng, x, y, colors.length > 0 ? colors : RAINBOW, COLORS.white, r * 0.8);
    for (const { guest, at } of inside) prizeFlies(this.fx, rng, this.env.bank, guest.prize, guest.look, at, { x, y });
    [0, 0.12, 0.26].forEach((d, i) => {
      this.script.at(this.script.now + d, () => {
        storm(this.field, rng, x, y, this.fx.count(i === 0 ? 16 : 12));
      });
    });
    this.rainbows.push(new Rainbow({ hold: 7 }));
    this.script.at(this.script.now + 0.45, () => {
      this.rainbows.push(new Rainbow({ size: 1.16, alpha: 0.5, flip: true, hold: 6.4 }));
    });
    this.flowerChorus();
    this.audience.celebrate(this.time);
    const pan = this.pan(x);
    this.env.sound.fx('pop', { pan, size: 1, gain: 1 });
    this.env.sound.fx('cheer', { gain: 0.7 });
    [0, 2, 4, 7, 9].forEach((n, i) => {
      this.env.sound.note('bell', scaleNote(ROOT + 12, n), { pan, gain: 0.55, delay: 0.04 + i * 0.07, seconds: 1.4 });
    });
    [0, 4, 7].forEach((n, i) => {
      this.env.sound.note('pad', scaleNote(ROOT - 12, n), { pan, gain: 0.5, delay: 0.02 + i * 0.03, seconds: 2.4 });
    });
  }

  /**
   * A bubble of the storm goes off by itself: a small burst of its own colour, and now and then a
   * high note, so the storm sounds like rain on glass.
   */
  private stormBursts(b: Bubble): void {
    const rng = this.env.rng;
    const color = RAINBOW[rng.int(RAINBOW.length)]!;
    popBubble(this.fx, rng, b.x, b.y, color, b.r, 0.7);
    if (this.time - this.stormRang < 0.06) return;
    this.stormRang = this.time;
    const pan = this.pan(b.x);
    this.env.sound.fx('pop', { pan, size: 0, gain: 0.3 });
    this.env.sound.note('glass', scaleNote(ROOT + 24, rng.int(8)), { pan, gain: 0.22, seconds: 0.4 });
  }

  protected tick(dt: number): void {
    this.light.update(dt);
    this.glade.update(dt);
    this.audience.update(this.time);
    this.machine.update(dt);
    this.blowing(dt);
    this.glow = damp(this.glow, 0, 2.6, dt);
    this.garden.update(dt);
    this.garden.drain((e) => this.heard(e));
    this.rainbowsGo(dt);
    this.giant.update(dt);
    this.finaleGoes(dt);
    const happened = this.field.step(dt, this.time, this.plan.air);
    for (const j of happened.joined) this.merged(j.into);
    for (const b of happened.burst) this.stormBursts(b);
    if (this.show && (this.show.stage === 'gather' || this.show.stage === 'swell')) this.takeIn();
    for (const e of this.rides.update(dt, this.time, this.plan)) this.rideHappened(e);
    this.spawn(dt);
  }

  /** The rainbows grow and ring a note for each band as they reach it, then fade. */
  private rainbowsGo(dt: number): void {
    for (let i = this.rainbows.length - 1; i >= 0; i--) {
      const r = this.rainbows[i]!;
      r.update(dt);
      const reached = Math.min(7, Math.floor(r.grown * 7.999));
      while (r.rung < reached) {
        const tip = r.tip(this.plan);
        this.env.sound.note('bell', scaleNote(ROOT + 12 + (r.flip ? 12 : 0), r.rung), {
          pan: this.pan(tip.x),
          gain: 0.6 * r.alpha,
          seconds: 1.2,
        });
        ringAt(this.fx, this.env.rng, tip.x, tip.y, COLORS.white, 14);
        r.rung++;
      }
      if (r.done) this.rainbows.splice(i, 1);
    }
  }

  private merged(b: Bubble): void {
    this.env.sound.fx('tap', { pan: this.pan(b.x), gain: 0.4, pitch: 14 });
  }

  /** The machine keeps the air full: a bubble now and then, more when there are few. */
  private spawn(dt: number): void {
    // The sky is filled again as soon as the great bubble has burst, so it is not empty when the
    // finale ends.
    if (this.show && this.show.stage !== 'burst') return;
    this.spawnWait -= dt;
    if (this.spawnWait > 0) return;
    const free = this.field.bubbles.filter((b) => !b.held).length;
    if (free >= this.plan.crowd) {
      this.spawnWait = 0.5;
      return;
    }
    const hungry = free < this.plan.crowd * 0.5;
    this.machine.puff(0.35);
    this.launch(false);
    this.spawnWait = (hungry ? 0.7 : 1.5) + this.env.rng.range(0, 0.8);
  }

  protected paintBack(p: Painter): void {
    this.glade.paintSky(p, Math.max(this.glow, this.light.ambient * 0.8), (g) => {
      for (const r of this.rainbows) r.paint(g, this.plan);
    });
    this.glade.paintGround(p);
    this.garden.paintWater(p);
    this.glade.paintPond(p);
    this.garden.paintGround(p);
    this.machine.paint(p, this.plan, this.env.bank, this.band ? this.band.pulse(4) : 0);
    this.garden.paintAir(p);
  }

  protected paintFront(p: Painter): void {
    this.audience.paint(p, this.light, this.time);
    this.giant.paint(p, this.film, this.env.bank);
    const order = [...this.field.bubbles].sort((a, b) => b.r - a.r);
    for (const b of order) this.paintBubble(p, b);
  }

  /**
   * One bubble: what is inside it, and over it its skin. A prize that has just gone in grows into
   * its place, and the ones already there make room.
   */
  private paintBubble(p: Painter, b: Bubble): void {
    const t = p.t + b.phase;
    const n = b.prizes.length;
    const to = spotsOf(n);
    const was = b.held0 > 0 && b.held0 < n ? spotsOf(b.held0) : to;
    const settled = easeOutBack(clamp((b.age - b.changedAt) / SETTLE));
    b.prizes.forEach((prize, i) => {
      const [tx, ty, tfit] = to[i]!;
      const old = i < b.held0 ? was[i] : undefined;
      const dx = old ? lerp(old[0], tx, settled) : tx;
      const dy = old ? lerp(old[1], ty, settled) : ty;
      const fit = (old ? lerp(old[2], tfit, settled) : tfit * Math.max(0, settled)) * b.r;
      const bob = Math.sin(t * 1.4 + i * 2) * b.r * 0.04;
      const x = b.x + dx * b.r;
      const y = b.y + dy * b.r + bob;
      if (fit < 0.5) return;
      paintPrize(p.ctx, p.light, this.env.bank, prize, {
        x,
        y,
        fit,
        t,
        look: b.looks[i] ?? 0,
        turn: Math.sin(t * 1.1 + i) * 0.1,
      });
      if (PRIZE[prize].rare) paintSparkleRing(p.light, x, y, fit * 1.15, t, PRIZE[prize].color);
    });
    this.film.draw(p.ctx, b, p.t);
  }
}
