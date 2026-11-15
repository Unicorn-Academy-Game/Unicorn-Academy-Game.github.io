import { Rng } from '../../domain/rng';
import type { UnicornId } from '../../shared/ids';
import { Camera } from '../engine/camera';
import { COLORS, RAINBOW } from '../engine/color';
import { clamp, damp, lerp, Spring, TAU, unlerp } from '../engine/ease';
import { gemImage, starImage } from '../engine/gems';
import { drawRider, FEET, HOP_SECONDS, hopShape, type Look, newLook } from '../engine/herd';
import { Meter } from '../engine/meter';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { SUNNY } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { Course, type Hoop, type Star, WORTH } from './ride/course';
import { Effects } from './ride/effects';
import { History, newPose } from './ride/history';
import { Journey, newSpot, PLAN, SPACING, settle } from './ride/journey';
import { BAND, Lagoon } from './ride/lagoon';
import { type Beat, Pilot } from './ride/pilot';
import { paintHoop, Ribbon } from './ride/ribbon';
import { Eye, newShot, Rig } from './ride/rig';
import { RIDE_HEIGHT, Runner } from './ride/runner';
import { DaySky, hash } from './ride/sky';
import { Track } from './ride/track';

/**
 * What each star costs, in points of play. A child tapping as they like earns about twelve a
 * second, so the finale comes in about forty.
 */
const RIDE_STAR_COSTS = [15, 44, 82, 128, 180] as const;

/** Where on the runway she begins. */
const START = -300;
/** How big the unicorns are drawn: the one who leads, and the friends who follow. */
const LEADER = 1.15;
const FRIEND = 0.92;
/** How near a star must be to be gathered, and how near to be drawn in. */
const COLLECT = 40;
const MAGNET = 78;
/** The chain of stars she gathers one after another goes up a scale and comes back. */
const CHAIN_SPAN = 14;
const CHAIN_SECONDS = 1.25;
/** How far ahead of her the rainbow is handed over to the finale's, at the soonest, in units. */
const HANDOVER = 520;
/** How much room the rainbow's glow needs around it. */
const ARCH_MARGIN = BAND * 1.2;
/**
 * How long the party in the pool goes on once everyone is in, and how long the rainbow takes to
 * grow over them.
 */
const PARTY = 3.4;

export type Place = 'ride' | 'finale' | 'lagoon';

/**
 * A ride down a rainbow. She slides and leaps over hills of colour through a sky that goes from
 * morning to sunset as she plays, gathers stars, rides through hoops that make her fast, and her
 * friends follow in a line behind. Nothing can go wrong: any tap is a leap, the rainbow is always
 * under her, and every star she misses is another one a moment later. The fifth star lifts the
 * rainbow into a loop and a ramp, she leaps across the sky and lands in a pool of jewels, her
 * friends one after another after her, and a rainbow grows over them all.
 */
export class RainbowRide extends Wonder {
  readonly id = 'rainbow-ride' as const;
  protected readonly meter = new Meter(RIDE_STAR_COSTS);
  protected place: Place = 'ride';

  private track!: Track;
  private course!: Course;
  private runner!: Runner;
  private ribbon!: Ribbon;
  private sky: DaySky | null = null;
  private readonly cam = new Camera(0.3, 0.62);
  private readonly history = new History();
  private readonly show: Effects;
  private readonly leader = newPose();
  private readonly bounds = { left: 0, right: 0, top: 0, bottom: 0 };
  /** How each of her and her friends looks now, the leader first. */
  private readonly looks: Look[] = Array.from({ length: 6 }, newLook);
  /**
   * Her stretch: 0 is her own shape, more is long and thin, less is short and wide. One for each of
   * them.
   */
  private readonly springs = Array.from({ length: 6 }, () => new Spring(0, 0, 230, 17));
  private friends: UnicornId[] = [];
  private leaderId: UnicornId = 'wildstar';
  private lean = 0;
  private baseZoom = 1;
  private skyU = 0;
  private chain = 0;
  private chainLeft = 0;
  private trailDebt = 0;
  private moteDebt = 0;
  private windAt = 0;
  private readonly ripples: { x: number; y: number; age: number }[] = [];

  // The finale.
  private pendingFinale = false;
  private valley = 0;
  private journey: Journey | null = null;
  private pilot: Pilot | null = null;
  private lagoon: Lagoon | null = null;
  private rig: Rig | null = null;
  private readonly eye = new Eye();
  private readonly shot = newShot();
  /**
   * Where the rainbow's own length ended and the finale's began: how far she had come, and how far
   * along the journey she got on.
   */
  private seam = { s: 0, at: 0, dist: 0 };
  private hoopsTaken: boolean[] = [];
  private starsTaken: boolean[] = [];
  private arch = 0;
  private archGoal = 0;
  private partyLeft = -1;
  private showerAt = 0;
  private readonly beats: Beat[] = [];
  private readonly spot = newSpot();
  /** When each of them last leapt for joy. */
  private readonly cheers: number[] = Array.from({ length: 6 }, () => -9);
  private readonly shape = { lift: 0, stretch: 0 };
  private tapSteps = 0;
  private ambientAt = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.camera = this.cam;
    this.show = new Effects(
      this.fx,
      env.sound,
      env.rng,
      { shake: (n) => this.shake(n), flash: (n, c) => this.flash(n, c) },
      (x) => clamp(this.cam.screenX(x, this.view?.w ?? 1) / (this.view?.w ?? 1) - 0.5, -0.5, 0.5) * 1.2,
    );
    this.assign();
    this.startMusic(SUNNY);
    this.begin();
  }

  override get bloom(): number {
    return this.env.calm ? 0.12 : 0.3;
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly runner: Runner;
    readonly course: Course;
    readonly place: Place;
    readonly pilot: Pilot | null;
    readonly journey: Journey | null;
  } {
    return { runner: this.runner, course: this.course, place: this.place, pilot: this.pilot, journey: this.journey };
  }

  private assign(): void {
    const herd = this.env.herd.length > 0 ? this.env.herd : (['wildstar'] as const);
    this.leaderId = herd[0]!;
    this.friends = herd.slice(1, 6);
  }

  /** Lays the rainbow, hangs the stars along it and stands her at the start. */
  private begin(): void {
    const rng = this.env.rng;
    this.track = new Track(new Rng(rng.int(0x7fffffff)));
    this.course = new Course(this.track, new Rng(rng.int(0x7fffffff)), START);
    this.runner = new Runner(this.track, START, 190);
    this.ribbon = new Ribbon(this.track, rng);
    this.course.fill(START + 1800);
    this.place = 'ride';
    Object.assign(this.leader, { x: this.runner.x, y: this.runner.y, rot: 0, sx: 1, sy: 1, air: false, dist: 0, s: 0 });
    this.lean = 0;
    for (const s of this.springs) {
      s.x = 0;
      s.v = 0;
    }
    this.skyU = 0;
    this.chain = 0;
    this.chainLeft = 0;
    this.trailDebt = 0;
    this.moteDebt = 0;
    this.windAt = 0;
    this.ripples.length = 0;
    this.pendingFinale = false;
    this.journey = null;
    this.pilot = null;
    this.lagoon = null;
    this.rig = null;
    this.arch = 0;
    this.archGoal = 0;
    this.partyLeft = -1;
    this.tapSteps = 0;
    this.cheers.fill(-9);
    // The friends are standing behind her on the runway, as if they had been walking along with
    // her: so each has been where she was.
    this.history.clear();
    const lead = (SPACING * (this.friends.length + 1)) / 190 + 0.5;
    for (let t = -lead; t <= 0; t += 1 / 30) {
      this.history.push({ ...this.leader, x: this.runner.x + 190 * t, dist: 190 * t, s: 190 * t });
    }
    this.cam.x = this.runner.x + 40;
    this.cam.y = this.runner.y - 14;
    this.cam.zoom = this.baseZoom;
    this.dress(0);
  }

  protected reset(): void {
    this.begin();
  }

  protected arrange(view: View): void {
    this.baseZoom = clamp(view.w / 640, 0.62, 1);
    this.cam.ax = view.landscape ? 0.3 : 0.37;
    this.cam.ay = 0.62;
    this.sky = new DaySky(this.env.rng, view);
    this.cam.zoom = this.baseZoom;
    // If the screen changes in the middle of the finale, the way it is framed changes with it.
    if (this.journey) this.frameFinale(this.journey, view);
  }

  /** How the finale is shot on this screen, and how big the rainbow over the pool is on it. */
  private frameFinale(journey: Journey, view: View): void {
    this.rig = new Rig(journey, { w: view.w, h: view.h, base: this.baseZoom }, ARCH_MARGIN);
    this.lagoon?.refit(this.rig.fit);
  }

  protected hint(): { x: number; y: number } | null {
    return this.place === 'ride' ? { x: this.view.w * 0.58, y: this.view.h * 0.46 } : null;
  }

  protected press(p: Pointer): void {
    this.ripples.push({ x: p.x, y: p.y, age: 0 });
    if (this.ripples.length > 6) this.ripples.shift();
    if (this.place === 'ride') this.runner.tap();
    else if (this.place === 'finale') this.cheerOn();
    else this.playInPool(p);
  }

  /** A tap on the way through the finale: a little more speed and a hop of joy. */
  private cheerOn(): void {
    this.pilot?.tap();
    this.springs[0]!.kick(2.4);
    this.env.sound.fx('boing', { pitch: 3 + (this.tapSteps++ % 5), size: 0.4, gain: 0.55 });
  }

  /**
   * A tap once she has landed: on a unicorn she leaps for joy, in the pool a jewel jumps, and in
   * the air stars.
   */
  private playInPool(p: Pointer): void {
    const pool = this.lagoon?.pool;
    if (!pool) return;
    const wx = this.cam.worldX(p.x, this.view.w);
    const wy = this.cam.worldY(p.y, this.view.h);
    let nearest = -1;
    let best = 80 * 80;
    this.looks.forEach((look, i) => {
      if (i > this.friends.length) return;
      const d = (look.x - wx) ** 2 + (look.y - wy) ** 2;
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    const step = this.tapSteps++ % 8;
    if (nearest >= 0) {
      const look = this.looks[nearest]!;
      this.cheers[nearest] = this.time;
      this.show.hop(look.x, look.y - 20, step);
    } else if (wx > pool.left && wx < pool.right && wy > pool.y - 150 && wy < pool.y + 90) {
      this.lagoon?.ripple(wx, 0.6);
      this.show.tapWater(wx, pool.y, Math.floor(unlerp(pool.left, pool.right, wx) * 9));
    } else this.show.tapSky(wx, wy, step);
  }

  protected tick(dt: number): void {
    if (this.pendingFinale) this.openFinale();
    if (this.place === 'ride') {
      this.ride(dt);
      this.board();
    } else if (this.place === 'finale') this.fly(dt);
    else this.linger(dt);
    this.dress(dt);
    this.frame(dt);
    this.lagoon?.update(dt);
    this.arch = Math.min(this.archGoal, this.arch + dt * 0.7);
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.age += dt;
      if (r.age > 0.5) this.ripples.splice(i, 1);
    }
  }

  private ride(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt * 60 - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
    const r = this.runner;
    this.course.fill(r.x + 1500);
    this.course.forget(r.x - 700);
    this.track.forget(r.x - 1800);
    if (this.chainLeft > 0) {
      this.chainLeft -= dt;
      if (this.chainLeft <= 0) this.chain = 0;
    }
    this.leaveLight(dt, r.x, r.y, this.lean, Math.min(1.4, r.boost));
    this.dust(dt, r.vx, r.boost > 0.4);
  }

  private step(h: number): void {
    const r = this.runner;
    const x0 = r.x;
    const y0 = r.y;
    const m = r.step(h);
    const feet = this.feet(r.x, r.y, this.lean);
    if (m.leap) {
      this.springs[0]!.kick(m.leap === 1 ? 3.2 : 2.4);
      this.idle = 0;
      this.show.leap(m.leap, feet.x, feet.y, r.vx);
    }
    if (m.landed > 0) {
      this.springs[0]!.kick(-2 - m.landed * 5);
      this.show.landing(m.landed, feet.x, feet.y, r.vx);
    }
    if (m.crest) this.show.crest();
    this.gather(x0, h);
    // How she looks: turned along the rainbow, or along her flight, and stretched or squashed by
    // the spring.
    const target = r.grounded
      ? Math.atan(this.track.slopeAt(r.x)) * 0.9
      : clamp(Math.atan2(r.vy, Math.max(90, r.vx)) * 0.55, -0.5, 0.62);
    this.lean = damp(this.lean, target, 13, h);
    const stretch = this.springs[0]!.step(h);
    const p = this.leader;
    p.x = r.x;
    p.y = r.y;
    p.rot = this.lean;
    p.sy = 1 + stretch;
    p.sx = 1 - stretch * 0.55;
    p.air = !r.grounded;
    if (r.grounded) p.dist += r.vx * h;
    p.s += Math.hypot(r.x - x0, r.y - y0);
    this.history.push(p);
  }

  /** Where her hooves are, in the world. */
  private feet(x: number, y: number, rot: number): { x: number; y: number } {
    return { x: x - Math.sin(rot) * FEET, y: y + Math.cos(rot) * FEET };
  }

  /** Gathers what she is on, near, or has just ridden through. */
  private gather(x0: number, h: number): void {
    const r = this.runner;
    const pull = 1 - Math.exp(-11 * h);
    for (const s of this.course.stars) {
      if (s.taken || s.x < r.x - 70 || s.x > r.x + 160) continue;
      const dx = s.x - r.x;
      const dy = s.y - r.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < COLLECT * COLLECT) this.collect(s);
      else if (d2 < MAGNET * MAGNET && dx > -30) {
        s.x -= dx * pull;
        s.y -= dy * pull;
      }
    }
    for (const hoop of this.course.hoops) {
      if (hoop.taken) continue;
      if (x0 < hoop.x && hoop.x <= r.x && Math.abs(hoop.y - r.y) < hoop.radius + 16) this.through(hoop);
    }
  }

  private collect(s: Star): void {
    const bonus = this.course.take(s);
    this.chain++;
    this.chainLeft = CHAIN_SECONDS;
    const k = (this.chain - 1) % (CHAIN_SPAN * 2);
    const step = k <= CHAIN_SPAN ? k : CHAIN_SPAN * 2 - k;
    this.show.star(s.x, s.y, s.gem, step);
    this.earn(s.value);
    if (bonus > 0) {
      this.earn(bonus);
      this.show.group(s.x, s.y, Math.min(4, Math.floor(this.chain / 6)));
    }
    if (this.chain > 0 && this.chain % 12 === 0) this.show.streak(this.runner.x, this.runner.y);
  }

  /** A ring she has gone through: she is fast, and the ring bursts. */
  private through(hoop: Hoop): void {
    const bonus = this.course.takeHoop(hoop);
    const r = this.runner;
    r.speedUp(1);
    this.earn(WORTH.hoop);
    this.springs[0]!.kick(2);
    this.show.hoop(hoop.x, hoop.y, hoop.radius, r.vx, 0);
    if (bonus > 0) {
      this.earn(bonus);
      this.show.group(hoop.x, hoop.y, 1);
    }
  }

  /** The rainbow of light she leaves behind her. */
  private leaveLight(dt: number, x: number, y: number, rot: number, boost: number): void {
    const rng = this.env.rng;
    this.trailDebt += dt * (46 + 90 * boost);
    const tail = this.feet(x, y, rot);
    while (this.trailDebt >= 1) {
      this.trailDebt -= 1;
      const k = Math.floor(this.time * 18 + this.trailDebt * 7);
      const c = RAINBOW[((k % 7) + 7) % 7]!;
      this.fx.emit({
        x: tail.x - 38 * Math.cos(rot) + rng.range(-5, 5),
        y: tail.y - 26 - 38 * Math.sin(rot) + rng.range(-8, 8),
        vx: rng.range(-18, 4),
        vy: rng.range(-18, 10),
        life: rng.range(0.55, 1.0),
        size: rng.range(9, 14) * (1 + boost * 0.3),
        size1: 1.5,
        color: [Math.min(255, c[0] + 70), Math.min(255, c[1] + 70), Math.min(255, c[2] + 70)],
        color1: c,
        shape: rng.next() < 0.18 ? 'star4' : 'spark',
        alpha: 0.9,
        hold: 0.2,
        drag: 1.2,
        twinkle: 8,
      });
    }
  }

  /** A little dust of light drifting through the day, and the wind she makes when she is fast. */
  private dust(dt: number, speed: number, fast: boolean): void {
    const rng = this.env.rng;
    this.moteDebt += dt * (this.env.calm ? 2 : 5);
    while (this.moteDebt >= 1) {
      this.moteDebt -= 1;
      const b = this.cam.window(this.view.w, this.view.h, 0, this.bounds);
      this.fx.emit({
        x: rng.range(b.left, b.right + 200),
        y: rng.range(b.top, b.bottom),
        vx: -speed * 0.06,
        vy: rng.range(-8, 4),
        life: rng.range(2.4, 4),
        size: rng.range(5, 9),
        color: [255, 250, 220],
        shape: 'glow',
        alpha: 0.6,
        fadeIn: 0.8,
        twinkle: rng.range(0.6, 1.4),
        hold: 0.4,
        sway: 6,
      });
    }
    if (fast && this.time > this.windAt) {
      this.windAt = this.time + 1.3;
      this.env.sound.fx('wind', { gain: 0.5 });
    }
  }

  protected finale(): void {
    // Asked in the middle of gathering a star. What is hung on the rainbow is not to be changed
    // while it is being gone through.
    this.pendingFinale = true;
    this.env.sound.fx('swell', { size: 1 });
  }

  /** The rainbow is cut at the next valley, and the way across the sky is laid from there. */
  private openFinale(): void {
    this.pendingFinale = false;
    const r = this.runner;
    const valley = this.track.valleyAfter(r.x, HANDOVER);
    this.valley = valley.x;
    this.track.cut(valley.x);
    this.course.cut(valley.x);
    const journey = new Journey(valley, PLAN);
    this.journey = journey;
    this.frameFinale(journey, this.view);
    this.lagoon = new Lagoon(journey.pool, new Rng(this.env.rng.int(0x7fffffff)), this.rig!.fit);
    this.hoopsTaken = journey.marks.hoops.map(() => false);
    this.starsTaken = journey.marks.stars.map(() => false);
    this.archGoal = 0;
  }

  /**
   * When she has come to the end of the rainbow that was, she gets on the one that will take her
   * across the sky.
   */
  private board(): void {
    const journey = this.journey;
    const r = this.runner;
    if (!journey || !r.grounded || r.x < this.valley + 14) return;
    const at = r.x - this.valley;
    this.pilot = new Pilot(journey, this.friends.length, Math.max(r.vx, 300), at);
    this.seam = { s: this.leader.s, at, dist: this.leader.dist - journey.at(at).dist };
    this.place = 'finale';
    this.eye.restart();
  }

  private fly(dt: number): void {
    const pilot = this.pilot!;
    const steps = Math.max(1, Math.ceil(dt * 60 - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.beats.length = 0;
      pilot.step(h, this.beats);
      for (const b of this.beats) this.arrive(b);
    }
    const lead = this.looks[0]!;
    this.leaveLight(
      dt,
      lead.x,
      lead.y,
      lead.rot,
      pilot.part === 'air' ? 1.1 : Math.min(1.4, (pilot.speed - 300) / 200),
    );
    this.dust(dt, pilot.speed, pilot.speed > 520);
    if (this.partyLeft < 0 && pilot.settled) this.startParty();
    if (this.partyLeft >= 0) this.party(dt);
  }

  /** What she has just got to on the way. */
  private arrive(beat: Beat): void {
    const j = this.journey!;
    const m = j.marks;
    const lead = this.looks[0]!;
    switch (beat.kind) {
      case 'hoop': {
        this.hoopsTaken[beat.index] = true;
        const at = j.at(m.hoops[beat.index]!, this.spot);
        this.show.hoop(at.x, at.y, 58, this.pilot!.speed, beat.index * 2);
        this.springs[0]!.kick(2);
        break;
      }
      case 'loop-in':
        this.show.loopIn(lead.x, lead.y);
        break;
      case 'loop-top':
        this.show.loopTop(lead.x, lead.y);
        break;
      case 'loop-out':
        this.show.loopOut();
        break;
      case 'launch': {
        const at = j.at(m.launch, this.spot);
        this.show.launch(at.x, at.y, at.turn);
        this.springs[0]!.kick(4);
        break;
      }
      case 'star': {
        this.starsTaken[beat.index] = true;
        const at = j.at(m.stars[beat.index]!, this.spot);
        // Up the scale on the way up and back down it on the way down.
        const half = (m.stars.length - 1) / 2;
        this.show.skyStar(at.x, at.y, Math.round(half - Math.abs(beat.index - half)) * 1);
        break;
      }
      case 'splash': {
        const pool = j.pool;
        const look = this.looks[beat.index]!;
        this.springs[beat.index]!.kick(-4.5);
        this.show.splash(look.x, pool.y, beat.index === 0 ? 1 : 0.7, beat.index);
        this.lagoon?.ripple(look.x, beat.index === 0 ? 1.2 : 0.8);
        // Each one that lands paints more of the rainbow, and the last paints the end of it.
        this.archGoal = Math.min(1, (beat.index + 1) / (this.friends.length + 1.4));
        break;
      }
    }
  }

  /** Everyone is in. The rainbow is made whole and there is a party, then the finale is over. */
  private startParty(): void {
    this.partyLeft = PARTY;
    this.archGoal = 1;
    const lagoon = this.lagoon!;
    this.show.cheer(lagoon.arch.x, lagoon.pool.y - lagoon.arch.ry * 0.3);
    this.showerAt = 0;
  }

  private party(dt: number): void {
    const lagoon = this.lagoon!;
    this.partyLeft -= dt;
    this.showerAt -= dt;
    if (this.showerAt <= 0 && this.partyLeft > 0.6) {
      this.showerAt = 0.09;
      const half = (lagoon.pool.right - lagoon.pool.left) / 2;
      const top = this.cam.worldY(-40, this.view.h);
      this.show.shower(lagoon.pool.centre - half * 0.8, lagoon.pool.centre + half * 0.8, top, lagoon.pool.y, 3);
    }
    if (this.partyLeft <= 0) {
      this.place = 'lagoon';
      this.endFinale();
    }
  }

  /** After the finale: the player can play in the pool as long as they like. */
  private linger(dt: number): void {
    const lagoon = this.lagoon;
    if (!lagoon) return;
    this.dust(dt, 0, false);
    // Now and then a jewel jumps out of the pool by itself, so the place is alive even when nobody
    // is touching it.
    this.ambientAt -= dt;
    if (this.ambientAt <= 0 && this.idle > 2) {
      this.ambientAt = this.env.rng.range(1.2, 2.4);
      const x = this.env.rng.range(lagoon.pool.left + 60, lagoon.pool.right - 60);
      lagoon.ripple(x, 0.4);
      this.show.tapWater(x, lagoon.pool.y, this.env.rng.int(9));
    }
  }

  /** Works out how she and each friend looks, from where each has got to. */
  private dress(dt: number): void {
    const count = this.friends.length + 1;
    for (let i = 0; i < count; i++) {
      const look = this.looks[i]!;
      const spring = this.springs[i]!;
      if (i > 0 || this.place !== 'ride') {
        const stretch = spring.step(dt);
        look.sy = 1 + stretch;
        look.sx = 1 - stretch * 0.55;
      }
      if (this.place === 'ride') this.rideLook(i, look);
      else this.journeyLook(i, look);
      if (this.place === 'lagoon') {
        // A unicorn who has been touched is in the air, and stretched or squashed as she goes.
        hopShape(this.time - this.cheers[i]!, this.shape);
        look.y -= this.shape.lift;
        look.sy += this.shape.stretch;
        look.sx -= this.shape.stretch * 0.6;
      }
    }
  }

  private rideLook(i: number, look: Look): void {
    const pose = i === 0 ? this.leader : this.history.at(this.leader.s - SPACING * i);
    look.x = pose.x;
    look.y = pose.y;
    look.rot = pose.rot;
    look.mode = pose.air ? 'air' : 'run';
    look.dist = pose.dist;
    if (i === 0) {
      look.sx = pose.sx;
      look.sy = pose.sy;
    }
  }

  private journeyLook(i: number, look: Look): void {
    const j = this.journey!;
    const pilot = this.pilot!;
    const p = pilot.placeOf(i);
    // A friend who has not got to where the finale begins is still on the rainbow she was on, so
    // she is where the leader was.
    if (p < this.seam.at) {
      const pose = this.history.at(this.seam.s + (p - this.seam.at));
      look.x = pose.x;
      look.y = pose.y;
      look.rot = pose.rot;
      look.mode = pose.air ? 'air' : 'run';
      look.dist = pose.dist;
    } else {
      const rest = j.rest(i, this.friends.length);
      const here = settle(p, rest);
      const spot = j.at(here, this.spot);
      look.x = spot.x;
      look.y = spot.y;
      look.rot = spot.turn;
      look.dist = spot.dist + this.seam.dist;
      const stopped = p > j.marks.land && rest - here < 2;
      if (spot.air) look.mode = 'air';
      else if (stopped) {
        const since = this.time - this.cheers[i]!;
        const cheering = since < HOP_SECONDS + 0.5;
        look.mode = cheering ? 'cheer' : i === 0 ? 'sign' : 'idle';
        look.clock = cheering ? since : this.time + i * 0.7;
        // Standing in the water, she bobs a little.
        look.y += Math.sin(this.time * 2.1 + i * 1.3) * 1.6;
      } else look.mode = 'run';
    }
    if (i === 0) {
      this.leader.x = look.x;
      this.leader.y = look.y;
    }
  }

  /** The sky goes on toward evening as she plays, and the camera follows her. */
  private frame(dt: number): void {
    const progress = this.phase === 'play' ? (this.meter.stars + this.meter.fraction) / 5 : 1;
    this.skyU = damp(this.skyU, progress, this.phase === 'play' ? 0.9 : 0.55, dt);
    const cam = this.cam;
    if (this.place === 'ride' || !this.rig) {
      const view = this.view;
      const r = this.runner;
      const boost = Math.min(1, r.boost);
      cam.x = damp(cam.x, r.x + r.vx * 0.2, 7, dt);
      // The camera looks at the rainbow she is about to ride, not at the leap she is in the middle
      // of, so a leap does not carry the rainbow off the bottom of the screen. She may go as high
      // or low as the screen allows, and no further.
      const reach = Math.max(300, r.vx);
      const t = this.track;
      const ground =
        (t.heightAt(r.x) +
          t.heightAt(r.x + reach * 0.25) +
          t.heightAt(r.x + reach * 0.5) +
          t.heightAt(r.x + reach * 0.75) +
          t.heightAt(r.x + reach)) /
          5 -
        RIDE_HEIGHT;
      const want = lerp(ground, r.y, r.grounded ? 0 : 0.4) - 12;
      cam.y = clamp(
        damp(cam.y, want, 3.4, dt),
        r.y - (0.8 - cam.ay) * (view.h / cam.zoom),
        r.y + (cam.ay - 0.2) * (view.h / cam.zoom),
      );
      cam.zoom = damp(cam.zoom, this.baseZoom * (1 - (this.env.calm ? 0 : 0.1) * boost), 3.2, dt);
      return;
    }
    const lead = this.looks[0]!;
    this.rig.shot(this.pilot!.s, lead, this.shot);
    this.eye.follow(cam, this.shot, dt);
  }

  protected paintBack(p: Painter): void {
    this.sky?.paint(p, this.cam, this.skyU);
  }

  protected override paintWorld(p: Painter): void {
    const g = p.ctx;
    const light = p.light;
    const b = this.cam.window(this.view.w, this.view.h, 90, this.bounds);
    const dusk = clamp((this.skyU - 0.45) / 0.45);
    const j = this.journey;
    const lagoon = this.lagoon;
    const end = j ? Math.min(b.right, this.track.end) : b.right;
    const boost = this.place === 'finale' ? clamp((this.pilot!.speed - 380) / 280) : Math.min(1, this.runner.boost);
    this.ribbon.paintUnder(g, b.left, end, dusk);
    this.ribbon.paint(g, light, b.left, end, p.t, boost, p.calm);
    if (j) this.paintRail(g, light, j, b, p.t, boost, dusk, p.calm);
    const seen = (x0: number, x1: number): boolean => x1 > b.left - 60 && x0 < b.right + 60;
    if (lagoon && seen(lagoon.pool.left - 100, lagoon.pool.right + 100)) lagoon.paintBehind(g, light, p.t, dusk);
    for (const h of this.course.hoops) {
      if (!h.taken && h.x > b.left - 40 && h.x < b.right + 40) paintHoop(g, light, h.x, h.y, h.radius, p.t, false);
    }
    this.paintStars(g, light, b.left, b.right, p.t);
    if (j) this.paintHoops(g, light, j, p.t, false);
    if (j) this.paintSkyStars(g, light, j, p.t);
    if (lagoon && seen(lagoon.pool.left - 100, lagoon.pool.right + 100))
      lagoon.paintArch(g, light, p.t, this.arch, this.partyLeft >= 0 || this.place === 'lagoon' ? 1 : 0.5);
    this.paintHerd(g);
    for (const h of this.course.hoops) {
      if (!h.taken && h.x > b.left - 40 && h.x < b.right + 40) paintHoop(g, light, h.x, h.y, h.radius, p.t, true);
    }
    if (j) this.paintHoops(g, light, j, p.t, true);
    if (lagoon && seen(lagoon.pool.left - 100, lagoon.pool.right + 100)) lagoon.paintFront(g, light, p.t, dusk);
    this.paintAura(light, boost);
  }

  /**
   * The part of the rainbow that is a rail: the straight, the loop and the ramp, drawn from the
   * first point to the last that is in view.
   */
  private paintRail(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    j: Journey,
    b: { left: number; right: number; top: number; bottom: number },
    t: number,
    glow: number,
    dusk: number,
    calm: boolean,
  ): void {
    const rail = j.rail;
    let first = -1;
    let last = -1;
    for (let i = 0; i < rail.length; i++) {
      const pt = rail[i]!;
      if (pt.x > b.left - 40 && pt.x < b.right + 40 && pt.y > b.top - 60 && pt.y < b.bottom + 60) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (first < 0) return;
    // A point or two either side, so the ends of what is seen are not seen.
    first = Math.max(0, first - 2);
    last = Math.min(rail.length - 1, last + 2);
    this.ribbon.paintRailUnder(g, rail, first, last, dusk);
    this.ribbon.paintRail(g, light, rail, first, last, t, glow, calm);
  }

  /** The rings on the straight, with the far half of each behind her and the near half in front. */
  private paintHoops(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    j: Journey,
    t: number,
    near: boolean,
  ): void {
    j.marks.hoops.forEach((at, i) => {
      if (this.hoopsTaken[i]) return;
      const spot = j.at(at, this.spot);
      paintHoop(g, light, spot.x, spot.y, 58, t, near);
    });
  }

  /** The stars that hang across the sky for her to fly through. */
  private paintSkyStars(g: CanvasRenderingContext2D, light: CanvasRenderingContext2D, j: Journey, t: number): void {
    const star = starImage(COLORS.gold);
    j.marks.stars.forEach((at, i) => {
      if (this.starsTaken[i]) return;
      const spot = j.at(at, this.spot);
      const bob = Math.sin(t * 3 + i) * 3;
      const turn = 0.72 + 0.28 * Math.cos(t * 2.4 + i);
      glowAt(light, spot.x, spot.y + bob, 80, COLORS.gold, 0.4);
      g.drawImage(star, spot.x - (44 * turn) / 2, spot.y + bob - 22, 44 * turn, 44);
    });
  }

  private paintStars(
    g: CanvasRenderingContext2D,
    light: CanvasRenderingContext2D,
    left: number,
    right: number,
    t: number,
  ): void {
    const star = starImage(COLORS.gold);
    for (const s of this.course.stars) {
      if (s.taken || s.x < left - 30 || s.x > right + 30) continue;
      const bob = Math.sin(t * 3 + s.x * 0.021) * 3;
      if (s.gem) {
        const color = RAINBOW[Math.floor(hash(s.x, 5) * 7) % 7]!;
        const size = 30 + Math.sin(t * 5 + s.x) * 1.5;
        glowAt(light, s.x, s.y + bob, 60, color, 0.4);
        g.drawImage(gemImage(color), s.x - size / 2, s.y + bob - size / 2, size, size);
      } else {
        // A star turns about its middle, so it is narrow for a moment and then wide.
        const turn = 0.72 + 0.28 * Math.cos(t * 2.4 + s.x * 0.013);
        const size = 34;
        glowAt(light, s.x, s.y + bob, 54, COLORS.gold, 0.4);
        g.drawImage(star, s.x - (size * turn) / 2, s.y + bob - size / 2, size * turn, size);
      }
    }
  }

  /** The glow a fast rider gives off. */
  private paintAura(light: CanvasRenderingContext2D, boost: number): void {
    if (boost < 0.05) return;
    const lead = this.looks[0]!;
    glowAt(light, lead.x - 20, lead.y, 190, COLORS.gold, 0.45 * boost);
  }

  /** The friends in a line behind her, the farthest first, then the one who leads. */
  private paintHerd(g: CanvasRenderingContext2D): void {
    for (let i = this.friends.length; i >= 1; i--)
      drawRider(g, this.env.bank, this.friends[i - 1]!, this.looks[i]!, FRIEND);
    drawRider(g, this.env.bank, this.leaderId, this.looks[0]!, LEADER);
  }

  protected paintFront(p: Painter): void {
    const g = p.ctx;
    const speed = this.place === 'finale' ? this.pilot!.speed : Math.hypot(this.runner.vx, this.runner.vy);
    const dusk = clamp((this.skyU - 0.45) / 0.45);
    this.sky?.paintFront(p, this.cam, speed, dusk);
    this.speedLines(g, p, speed);
    for (const rip of this.ripples) {
      const u = rip.age / 0.5;
      g.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - u)).toFixed(3)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(rip.x, rip.y, 8 + u * 34, 0, TAU);
      g.stroke();
    }
  }

  /** Long thin lines that rush past when she is fast. */
  private speedLines(g: CanvasRenderingContext2D, p: Painter, speed: number): void {
    if (p.calm || this.place === 'lagoon') return;
    const strength =
      clamp((speed - 330) / 200) * 0.5 + (this.place === 'ride' ? Math.min(1, this.runner.boost) * 0.3 : 0);
    if (strength < 0.03) return;
    const { w, h } = this.view;
    g.lineCap = 'round';
    g.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) {
      const rate = 0.7 + hash(i, 61) * 0.9;
      const u = (hash(i, 62) + p.t * rate * 1.3) % 1;
      const x = w * (1.15 - u * 1.4);
      const y = h * (0.08 + hash(i, 63) * 0.84);
      const len = 70 + hash(i, 64) * 110;
      g.strokeStyle = `rgba(255,255,255,${(strength * (0.35 + 0.5 * hash(i, 65))).toFixed(3)})`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y);
      g.stroke();
    }
  }
}
