import { Rng } from '../../domain/rng';
import type { UnicornId } from '../../shared/ids';
import { Camera } from '../engine/camera';
import { Cast } from '../engine/cast';
import { COLORS, css, darken, lighten, type RGB } from '../engine/color';
import {
  clamp,
  damp,
  easeInOutSine,
  easeInQuad,
  easeOutBack,
  easeOutQuad,
  hump,
  lerp,
  Spring,
  TAU,
  wrap,
} from '../engine/ease';
import { Meter } from '../engine/meter';
import { glowAt, makeHills, Starfield } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import { Particles } from '../engine/particles';
import type { Pointer } from '../engine/stage';
import { noteAt } from '../music';
import { JINGLE } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import type { ShellKind } from './shells';
import { burstShell } from './sky/burst';
import { type Scheme, scheme } from './sky/looks';
import {
  type Art,
  BULBS,
  LAMP,
  makeHouse,
  makeLamp,
  makePine,
  makePines,
  makeSky,
  makeSleigh,
  PALETTES,
  PINE,
  SLEIGH,
  WARM,
} from './sleigh/art';
import { type Plan, planOf, TEAM_APART, TEAM_FIRST } from './sleigh/layout';
import { chimneyMouth, EAVE_BULBS, eaveBulb, HOUSES, type Spot, TALLEST } from './sleigh/shape';
import { makeGift } from './tree/art';
import { GIFT } from './tree/shape';

/** A house on the way, and what the sleigh has done for it. */
interface House {
  readonly id: number;
  /** Where the middle of its foot is in the world. */
  readonly x: number;
  readonly shape: number;
  readonly palette: number;
  /** When its first present came down the chimney, or null while it is dark. */
  litAt: number | null;
  /** How lit its windows are, 0 to 1. */
  glow: number;
  /** The presents that have come down its chimney, and the ones still falling. */
  presents: number;
  incoming: number;
  /** A jolt when a present lands, as a squash that springs back. */
  readonly bump: Spring;
  /** How many bulbs along its roof are lit, and when the next one is. */
  bulbs: number;
  bulbIn: number;
  smokeIn: number;
  /** When a heart is due to float up from a lit window, or null. */
  heartAt: number | null;
}

/** A present on its way from Santa's hand to a chimney, in the world's own units. */
interface Gift {
  readonly house: House;
  readonly from: Spot;
  readonly to: Spot;
  readonly born: number;
  readonly dur: number;
  readonly tint: number;
  /** How far it turns on the way, in radians, and which way. */
  readonly spin: number;
}

/** Something that stands in the snow between the houses. */
interface Decor {
  readonly x: number;
  readonly kind: 'pine' | 'lamp';
  readonly size: number;
}

/** Where one of the team is, and how it is tilted: more than 0 is nose down. */
interface Part {
  x: number;
  y: number;
  rot: number;
}

/**
 * What each star costs, in points of play. A present down a chimney is a point, the first to a
 * house of a new kind is a second, so the player is led to visit every kind of house.
 */
const COSTS = [3, 7, 12, 18, 25] as const;
const FRESH_KIND = 1;
/** Another present to a house that has had one is a gift, but no more than a quarter of one. */
const AGAIN_POINTS = 0.25;
/** A touch on the sleigh rings its bells, and is worth a little. */
const JINGLE_POINTS = 0.15;
const JINGLE_GAP = 1.6;

const GIFTS = [
  { body: [222, 62, 84], ribbon: [255, 222, 120] },
  { body: [72, 132, 232], ribbon: [255, 255, 255] },
  { body: [62, 172, 112], ribbon: [255, 92, 112] },
  { body: [152, 92, 212], ribbon: [255, 232, 142] },
] as const satisfies readonly { body: RGB; ribbon: RGB }[];

/** How the unicorn's legs run compared with how fast the ground goes by, so she gallops in the sky. */
const GALLOP = 1.7;
/** The unicorn is drawn at this share of the size of a house. */
const UNICORN = 1.05;
/** Where Santa's hand is on the sleigh, measured from its runner, for a present to start from. */
const HAND: Spot = { x: 12, y: -44 };
/** How long each of the team takes to loop in the finale. */
const LOOP_SECONDS = 2;
/** How far above its runner the sleigh turns, so Santa goes round with it and not about its feet. */
const PIVOT = 30;
/** The shells of the finale, one for each of these, drawn in the sky behind the village. */
const FIREWORKS = 7;
/** What each shell draws in the sky, in the colours of the bulbs on the houses. */
const SHELLS: readonly (readonly [ShellKind, Scheme])[] = [
  ['peony', scheme([255, 130, 120], COLORS.red, COLORS.gold, COLORS.cream)],
  ['star', scheme([255, 224, 150], COLORS.gold, COLORS.amber, COLORS.cream)],
  ['heart', scheme([255, 160, 220], COLORS.pink, COLORS.rose, COLORS.cream)],
  ['double-ring', scheme([150, 255, 180], COLORS.green, COLORS.lime, COLORS.cream)],
  ['flower', scheme([170, 220, 255], COLORS.sky, COLORS.white, COLORS.cyan)],
  ['ring', scheme([255, 224, 150], COLORS.gold, COLORS.white, COLORS.amber)],
  ['star', scheme([255, 130, 120], COLORS.red, COLORS.white, COLORS.gold)],
];
/** How many lights come on along a roof once, and the pace they come on at. */
const FIRST_BULBS = 6;
const BULB_EVERY = 0.06;

/**
 * Santa's sleigh over a village at night, pulled by the herd. The houses come by one after another
 * with their chimneys up. A touch sends a present from Santa's hand to the chimney of the house
 * nearest the finger, wherever that finger is, so a touch is never a miss: the present goes down,
 * the windows glow, the roof lights up string by string and a heart floats up. A touch on the
 * sleigh rings its bells. When every star is earned the whole village lights, the sleigh loops the
 * loop and the sky is full of fireworks.
 */
export class SleighRun extends Wonder {
  readonly id = 'sleigh-run' as const;
  protected readonly meter = new Meter(COSTS);
  private readonly cam = new Camera(0.28, 0.5);
  private readonly cast = new Cast();
  private plan!: Plan;
  private art: Gear | null = null;
  private sky!: Starfield;
  private builder!: Rng;
  private team: readonly UnicornId[] = [];
  private houses: House[] = [];
  private decor: Decor[] = [];
  private gifts: Gift[] = [];
  private readonly seen = new Set<number>();
  private nextId = 0;
  private lastX = 0;
  private given = 0;
  /** How far the sleigh has flown, which is where the camera looks. */
  private travel = 0;
  private pace = 0;
  private loopAt: number | null = null;
  private jingledAt = -9;
  private snowIn = 0;
  private trailIn = 0;
  /** Where the sleigh's runner is in the world, and how the sleigh is tilted. */
  private readonly sleigh: Part = { x: 0, y: 0, rot: 0 };
  /** The fireworks, kept apart from the rest of the sparks so that they are drawn behind the village. */
  private readonly shells: Particles;

  constructor(env: WonderEnv) {
    super(env);
    this.camera = this.cam;
    this.shells = new Particles(1400, () => env.rng.next());
    this.shells.calm = env.calm;
    this.startMusic(JINGLE);
  }

  override get bloom(): number {
    return this.env.calm ? 0.25 : 0.5;
  }

  protected arrange(view: View): void {
    this.plan = planOf(view.w, view.h, view.unit);
    this.cam.ax = this.plan.sleighAt;
    this.cam.y = view.h / 2;
    this.art = null;
    this.sky = new Starfield(Math.round((view.w * view.h) / 3600), new Rng(23), view.w, 0, this.plan.ground * 0.8);
    const herd = this.env.herd.length > 0 ? this.env.herd : (['wildstar'] as const);
    this.team = herd.slice(0, this.plan.pullers);
    if (this.houses.length === 0) this.populate();
  }

  protected reset(): void {
    this.cast.reset();
    this.shells.clear();
    this.loopAt = null;
    this.jingledAt = -9;
    this.populate();
  }

  /** The village as it is at the start: a house or two ahead, all dark. */
  private populate(): void {
    this.houses = [];
    this.decor = [];
    this.gifts = [];
    this.seen.clear();
    this.nextId = 0;
    this.given = 0;
    this.travel = 0;
    this.lastX = 0;
    this.pace = this.plan.speed * 0.5;
    this.cam.x = 0;
    this.builder = new Rng(this.env.rng.int(0x7fffffff));
    this.poseTeam(0);
    this.extend();
  }

  protected hint(): Spot | null {
    const s = this.plan.scale;
    // The first house that has had no present, as far as the sleigh and no farther back.
    const ahead = this.view.w * this.plan.sleighAt;
    let best: House | null = null;
    for (const h of this.houses) {
      if (h.presents > 0 || !this.seeable(h)) continue;
      if (this.screenX(h.x) < ahead) continue;
      if (!best || h.x < best.x) best = h;
    }
    if (!best) return null;
    const at = this.mouthOf(best);
    return { x: this.screenX(at.x), y: at.y + 22 * s };
  }

  /** What a test or a film wants to know about the game. */
  inspect(): {
    readonly plan: Plan;
    readonly travel: number;
    readonly houses: readonly {
      id: number;
      shape: number;
      palette: number;
      lit: boolean;
      presents: number;
      incoming: number;
      x: number;
      chimney: Spot;
    }[];
    readonly gifts: number;
    readonly seen: readonly number[];
    readonly team: number;
    readonly looping: boolean;
  } {
    return {
      plan: this.plan,
      travel: this.travel,
      houses: this.houses.map((h) => ({
        id: h.id,
        shape: h.shape,
        palette: h.palette,
        lit: h.litAt !== null,
        presents: h.presents,
        incoming: h.incoming,
        x: this.screenX(h.x),
        chimney: this.screenOf(this.mouthOf(h)),
      })),
      gifts: this.gifts.length,
      seen: [...this.seen],
      team: this.team.length,
      looping: this.loopAt !== null,
    };
  }

  // ---- the village ----

  /** Builds the village as far ahead as the sleigh can see, and a little further. */
  private extend(): void {
    const reach = this.cam.x + this.view.w * (1 - this.plan.sleighAt) + this.plan.spacing * 1.5;
    while (this.lastX < reach || this.houses.length === 0) this.spawn();
  }

  private spawn(): void {
    const b = this.builder;
    const { spacing, sleighAt } = this.plan;
    const first = this.nextId === 0;
    const x = first ? this.cam.x + this.view.w * (1 - sleighAt) * 0.55 : this.lastX + spacing * b.range(0.92, 1.12);
    const last = this.houses[this.houses.length - 1];
    let shape = b.int(HOUSES.length);
    // Never two of a kind in a row, so the village is always a little different house to house.
    if (last && shape === last.shape) shape = (shape + 1 + b.int(HOUSES.length - 1)) % HOUSES.length;
    if (last) {
      const between = (last.x + x) / 2 + b.range(-8, 8);
      this.decor.push({ x: between, kind: b.next() < 0.45 ? 'lamp' : 'pine', size: b.range(0.85, 1.15) });
    }
    this.houses.push({
      id: this.nextId++,
      x,
      shape,
      palette: b.int(PALETTES.length),
      litAt: null,
      glow: 0,
      presents: 0,
      incoming: 0,
      bump: new Spring(0, 0, 150, 9),
      bulbs: 0,
      bulbIn: 0,
      smokeIn: b.range(0.2, 1),
      heartAt: null,
    });
    this.lastX = x;
  }

  /** Lets go of what the sleigh has left far behind. */
  private cull(): void {
    const left = this.cam.x - this.view.w * this.plan.sleighAt - this.plan.spacing * 1.2;
    this.houses = this.houses.filter((h) => h.x > left || h.incoming > 0);
    this.decor = this.decor.filter((d) => d.x > left);
  }

  /** Whether the chimney of a house is on the screen, with a little room at each side. */
  private seeable(h: House, margin = 8): boolean {
    const x = this.screenX(h.x + HOUSES[h.shape]!.chimney.x * this.plan.scale);
    return x >= margin && x <= this.view.w - margin;
  }

  private screenX(worldX: number): number {
    return this.cam.screenX(worldX, this.view.w);
  }

  private screenOf(at: Spot): Spot {
    return { x: this.screenX(at.x), y: at.y };
  }

  /** The middle of the mouth of a chimney, which is where a present has to go. */
  private mouthOf(h: House): Spot {
    const s = this.plan.scale;
    const mouth = chimneyMouth(HOUSES[h.shape]!);
    return { x: h.x + mouth.x * s, y: this.plan.ground + mouth.y * s };
  }

  // ---- touch ----

  protected press(p: Pointer): void {
    const wx = this.cam.worldX(p.x, this.view.w);
    const wy = this.cam.worldY(p.y, this.view.h);
    if (this.onTeam(wx, wy)) {
      this.jingle(p.x);
      return;
    }
    const house = this.houseFor(p.x);
    if (house) this.deliver(house);
  }

  /** Whether a point of the world is on the sleigh or the unicorns that pull it. */
  private onTeam(x: number, y: number): boolean {
    const s = this.plan.team;
    const { sleigh } = this;
    const front = TEAM_FIRST + Math.max(0, this.team.length - 1) * TEAM_APART + 36;
    return x > sleigh.x - 54 * s && x < sleigh.x + front * s && y > sleigh.y - 96 * s && y < sleigh.y + 16 * s;
  }

  /**
   * The house a touch at `x` is for: the nearest chimney on the screen, a little less ready to take
   * a house that has a present coming already, and than one that has had its own, so presents go
   * round.
   */
  private houseFor(x: number): House | null {
    const { spacing } = this.plan;
    let best: House | null = null;
    let bestScore = Infinity;
    for (const h of this.houses) {
      if (!this.seeable(h)) continue;
      const sx = this.screenX(this.mouthOf(h).x);
      const score = Math.abs(sx - x) + h.incoming * spacing * 0.6 + (h.presents > 0 ? spacing * 0.22 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  /** Santa throws a present for a chimney. It flies there along an arc and goes down it. */
  private deliver(house: House): void {
    const from = this.handOf();
    const to = this.mouthOf(house);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const n = this.given++;
    this.gifts.push({
      house,
      from,
      to,
      born: this.time,
      dur: clamp(0.5 + dist / 800, 0.55, 0.9),
      tint: n % GIFTS.length,
      spin: (n % 2 === 0 ? 1 : -1) * this.env.rng.range(2.4, 3.6),
    });
    house.incoming++;
    const pan = this.pan(to.x);
    this.env.sound.fx('whoosh', { pan, gain: 0.35, pitch: 5 });
    this.env.sound.note('bell', 84 + (n % 3) * 2, { gain: 0.4, pan });
  }

  /** The sleigh's bells ring and the unicorns toss their heads. */
  private jingle(screenX: number): void {
    const { sound } = this.env;
    const pan = clamp((screenX / this.view.w - 0.5) * 1.6, -0.8, 0.8);
    sound.note('bell', 79, { gain: 0.55, pan });
    sound.note('bell', 84, { gain: 0.5, pan, delay: 0.09 });
    sound.note('bell', 88, { gain: 0.45, pan, delay: 0.18 });
    sound.fx('twinkle', { pan, step: 2, gain: 0.5 });
    for (let i = 0; i < this.team.length; i++) this.cast.kick(i, i % 2 === 0 ? 4 : -4);
    const at = this.toWorld(30 * this.plan.team, -50 * this.plan.team);
    this.sparks(at.x, at.y, [255, 224, 140], 10, 1);
    if (this.time - this.jingledAt > JINGLE_GAP) {
      this.jingledAt = this.time;
      this.earn(JINGLE_POINTS);
    }
  }

  // ---- time ----

  protected tick(dt: number): void {
    const { plan } = this;
    const target = this.phase === 'finale' ? plan.speed * 1.35 : plan.speed * (this.env.calm ? 0.7 : 1);
    this.pace = damp(this.pace, target, 1.2, dt);
    this.travel += this.pace * dt;
    this.cam.x = this.travel;
    this.cam.y = this.view.h / 2;
    this.shells.density = this.fx.density;
    this.shells.update(dt);
    this.extend();
    this.cull();
    this.poseTeam(dt);
    this.flight();
    this.houseLife(dt);
    this.snow(dt);
    this.stardust(dt);
  }

  /** How far in front of the sleigh the leader is, at the size the team is drawn at. */
  private front(): number {
    return (TEAM_FIRST + Math.max(0, this.team.length - 1) * TEAM_APART) * this.plan.team;
  }

  /** Where the sleigh and the unicorns are this frame. */
  private poseTeam(dt: number): void {
    const { plan } = this;
    const s = plan.team;
    const n = this.team.length;
    const front = this.front();
    // The whole team has looped when the sleigh at the back has.
    if (this.loopAt !== null && this.time - this.loopAt > LOOP_SECONDS + front / (plan.speed * 1.35))
      this.loopAt = null;
    const bob = Math.sin(this.time * 1.9) * 6;
    this.place(0, front, plan.flyY + bob, this.sleigh);
    this.cast.tick(dt);
    for (let i = 0; i < n; i++) {
      const ahead = (TEAM_FIRST + (n - 1 - i) * TEAM_APART) * s;
      const hooves: Part = { x: 0, y: 0, rot: 0 };
      // The leader is at the front, the others behind her, a little above and below one another.
      const level = plan.flyY + bob + ((i % 2 === 0 ? 5 : -2) + Math.sin(this.time * 3.1 + i * 1.7) * 2.4) * s;
      this.place(ahead, front, level, hooves);
      const look = this.cast.looks[i]!;
      look.dist += this.pace * dt * GALLOP;
      this.cast.set(
        i,
        {
          x: hooves.x,
          y: hooves.y,
          mode: this.cast.sinceCheer(i) < 1.2 ? 'cheer' : 'run',
          face: 1,
          pitch: -hooves.rot,
          clock: this.cast.sinceCheer(i),
        },
        dt,
      );
    }
  }

  /**
   * Where a part of the team that is `ahead` of the sleigh stands, at height `y`. In the loop each
   * part flies the same path as the one in front of it a moment later, so the team goes over the top
   * in a line, the leader first, the way a train takes a bend.
   */
  private place(ahead: number, front: number, y: number, out: Part): void {
    const { plan } = this;
    let dx = 0;
    let dy = 0;
    let rot = Math.sin(this.time * 1.9 + 1) * 0.04;
    if (this.loopAt !== null) {
      const flown = this.time - this.loopAt - (front - ahead) / (plan.speed * 1.35);
      const u = flown / LOOP_SECONDS;
      if (u > 0 && u < 1) {
        const a = easeInOutSine(u) * TAU;
        const turning = ((Math.PI / 2) * Math.sin(Math.PI * u) * TAU) / LOOP_SECONDS;
        dx = plan.loop * Math.sin(a);
        dy = -plan.loop * (1 - Math.cos(a));
        // It points along the way it is going.
        rot = Math.atan2(-plan.loop * Math.sin(a) * turning, plan.speed * 1.35 + plan.loop * Math.cos(a) * turning);
      }
    }
    out.x = this.travel + ahead + dx;
    out.y = y + dy;
    out.rot = rot;
  }

  /** A point on the sleigh, measured from its runner, as a place in the world. The sleigh turns about its middle. */
  private toWorld(x: number, y: number): Spot {
    const { sleigh } = this;
    const lift = PIVOT * this.plan.team;
    const c = Math.cos(sleigh.rot);
    const n = Math.sin(sleigh.rot);
    return { x: sleigh.x + c * x - n * (y + lift), y: sleigh.y - lift + n * x + c * (y + lift) };
  }

  private handOf(): Spot {
    return this.toWorld(HAND.x * this.plan.team, HAND.y * this.plan.team);
  }

  /** Presents on their way: they land at the end of their arc. */
  private flight(): void {
    const arrived = this.gifts.filter((g) => this.time - g.born >= g.dur);
    if (arrived.length === 0) return;
    this.gifts = this.gifts.filter((g) => !arrived.includes(g));
    for (const g of arrived) this.land(g);
  }

  /** Where a present is, a quarter of the way through, half way, and so on. */
  private giftAt(g: Gift, u: number): Spot {
    const dx = g.to.x - g.from.x;
    const lift = Math.min(90, 30 + Math.abs(dx) * 0.14);
    // It goes across first and falls last, so it comes down the chimney straight.
    return {
      x: g.from.x + dx * easeOutQuad(u),
      y: lerp(g.from.y, g.to.y, easeInQuad(u)) - lift * hump(u),
    };
  }

  private land(g: Gift): void {
    const h = g.house;
    h.incoming = Math.max(0, h.incoming - 1);
    const first = h.presents === 0;
    h.presents++;
    h.bump.kick(-2.8);
    const { to } = g;
    const pan = this.pan(to.x);
    const ribbon = GIFTS[g.tint]!.ribbon;
    this.smoke(to.x, to.y, 5);
    this.sparks(to.x, to.y - 4, ribbon, 12, 1.15);
    const height = 1 - (to.y - this.plan.top) / (this.plan.ground - this.plan.top);
    this.env.sound.note('glass', noteAt(height, 64, 11), { gain: 0.55, pan });
    if (!first) {
      this.env.sound.fx('twinkle', { pan, step: h.presents, gain: 0.5 });
      this.earn(AGAIN_POINTS);
      return;
    }
    h.litAt = this.time;
    h.heartAt = this.time + 0.45;
    this.env.sound.fx('coin', { pan, step: this.seen.size + 1 });
    const fresh = !this.seen.has(h.shape);
    this.seen.add(h.shape);
    if (fresh) this.sparks(to.x, to.y - 8, [255, 236, 170], 14, 1.5);
    this.earn(1 + (fresh ? FRESH_KIND : 0));
  }

  /** The lights come on, the smoke goes up, the hearts float. */
  private houseLife(dt: number): void {
    const s = this.plan.scale;
    const finale = this.phase === 'finale';
    for (const h of this.houses) {
      h.bump.step(dt);
      if (finale && h.litAt === null && this.seeable(h, -30)) this.lightUp(h, h.id);
      h.glow = damp(h.glow, h.litAt === null ? 0 : 1, 4, dt);
      const shape = HOUSES[h.shape]!;
      const want = h.litAt === null ? 0 : h.presents > 1 || this.phase !== 'play' ? EAVE_BULBS : FIRST_BULBS;
      h.bulbs = Math.min(h.bulbs, want);
      if (h.bulbs < want) {
        h.bulbIn -= dt;
        if (h.bulbIn <= 0) {
          h.bulbIn = BULB_EVERY;
          const at = this.bulbAt(h, h.bulbs);
          this.sparks(at.x, at.y, BULBS[h.bulbs % BULBS.length]!, 2, 0.4);
          h.bulbs++;
        }
      }
      if (h.heartAt !== null && this.time >= h.heartAt) {
        h.heartAt = null;
        const win = shape.windows[0]!;
        this.heart(h.x + (win.x + win.w / 2) * s, this.plan.ground + (win.y + win.h / 2) * s);
      }
      if (h.litAt !== null && this.seeable(h, 40)) {
        h.smokeIn -= dt;
        if (h.smokeIn <= 0) {
          h.smokeIn = this.env.calm ? 1.6 : 0.8;
          const mouth = this.mouthOf(h);
          this.smoke(mouth.x, mouth.y - 4, 1);
        }
      }
    }
  }

  /** A house lights without a present, as the whole village does in the finale. */
  private lightUp(h: House, step: number): void {
    h.litAt = this.time;
    h.presents = Math.max(1, h.presents);
    h.heartAt = this.time + 0.3;
    h.bump.kick(-2.4);
    const mouth = this.mouthOf(h);
    this.smoke(mouth.x, mouth.y, 4);
    this.sparks(mouth.x, mouth.y - 6, BULBS[step % BULBS.length]!, 16, 1.5);
    this.env.sound.fx('coin', { pan: this.pan(mouth.x), step, gain: 0.7 });
  }

  /** Where bulb `i` of the string along the roof of a house hangs in the world. */
  private bulbAt(h: House, i: number): Spot {
    const at = eaveBulb(HOUSES[h.shape]!, i);
    const s = this.plan.scale;
    return { x: h.x + at.x * s, y: this.plan.ground + at.y * s };
  }

  // ---- the finale ----

  protected finale(): void {
    const s = this.script;
    const { sound } = this.env;
    this.flash(0.3, [255, 236, 170]);
    sound.fx('swell', { size: 0.8 });
    for (let i = 0; i < this.team.length; i++) this.cast.cheer(i);
    // Every house in view lights, one after another from the sleigh outward, and the ones that
    // come into view later light as they come.
    const near = this.houses.filter((h) => this.seeable(h, -30) && h.litAt === null).sort((a, b) => a.x - b.x);
    s.spread(0.5, 3, near.length, (i) => this.lightUp(near[i]!, i));
    s.at(3.2, () => {
      this.loopAt = this.time;
      sound.fx('whoosh', { size: 0.9 });
      for (let i = 0; i < this.team.length; i++) this.cast.cheer(i);
    });
    s.spread(4.2, 6.6, FIREWORKS, (i) => this.firework(i));
    s.at(5.4, () => {
      this.flash(0.25, [255, 240, 190]);
      sound.fx('cheer', {});
    });
    s.at(8, () => this.endFinale());
  }

  /** A shell bursts over the village, in the sky where the camera looks. */
  private firework(i: number): void {
    const { view, plan } = this;
    const [kind, colors] = SHELLS[i % SHELLS.length]!;
    const radius = Math.min(84, view.h * 0.24);
    const x = this.cam.worldX(view.w * (0.12 + 0.76 * ((i * 0.618) % 1)), view.w);
    const lowest = Math.max(radius * 0.9, plan.top);
    const y = lerp(lowest, Math.max(lowest, plan.ground - TALLEST * plan.scale - radius * 0.4), this.env.rng.next());
    const pan = this.pan(x);
    burstShell(this.shells, this.env.rng, { x, y, kind, scheme: colors, radius, power: 1 });
    this.shells.emit({
      x,
      y,
      life: 0.26,
      size: radius * 0.2,
      size1: radius,
      color: COLORS.white,
      shape: 'glow',
      alpha: 0.6,
    });
    this.shells.emit({
      x,
      y,
      life: 0.5,
      size: radius * 0.5,
      size1: radius * 2,
      color: colors.flash,
      shape: 'ring',
      width: 2.6,
      alpha: 0.5,
    });
    this.env.sound.fx('boom', { pan, size: 0.7, pitch: i });
    this.env.sound.fx('crackle', { pan, gain: 0.3, delay: 0.25 });
  }

  // ---- particles ----

  private pan(worldX: number): number {
    return clamp((this.screenX(worldX) / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  private sparks(x: number, y: number, color: RGB, count: number, power: number): void {
    const rng = this.env.rng;
    for (let i = 0; i < this.fx.count(count); i++) {
      const a = rng.range(0, TAU);
      const v = rng.range(24, 84) * power;
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 18,
        life: rng.range(0.5, 1.1),
        size: rng.range(5, 9),
        size1: 1,
        color: lighten(color, 0.5),
        color1: color,
        shape: rng.next() < 0.35 ? 'star4' : 'spark',
        drag: 2.2,
        gravity: 46,
        twinkle: 9,
      });
    }
  }

  /** Smoke from a chimney: round white puffs that swell, rise and fade. */
  private smoke(x: number, y: number, count: number): void {
    const rng = this.env.rng;
    for (let i = 0; i < this.fx.count(count); i++) {
      this.fx.emit({
        x: x + rng.range(-3, 3),
        y,
        vx: rng.range(-8, 4),
        vy: rng.range(-26, -16),
        life: rng.range(1.4, 2.2),
        size: rng.range(6, 9),
        size1: rng.range(16, 24),
        color: [238, 242, 255],
        alpha: 0.7,
        alpha1: 0,
        shape: 'dot',
        sway: 6,
        delay: i * 0.06,
        add: false,
      });
    }
  }

  /** Someone in the house is pleased: a heart floats up from the window. */
  private heart(x: number, y: number): void {
    const rng = this.env.rng;
    this.fx.emit({
      x,
      y,
      vx: rng.range(-6, 6),
      vy: -34,
      life: 1.6,
      size: 9,
      size1: 16,
      color: [255, 128, 176],
      alpha: 1,
      alpha1: 0,
      hold: 0.4,
      shape: 'heart',
      sway: 10,
    });
  }

  /** The sleigh leaves stardust behind it, and snow falls past it. */
  private stardust(dt: number): void {
    this.trailIn -= dt;
    if (this.trailIn > 0) return;
    const rng = this.env.rng;
    this.trailIn = this.env.calm ? 0.12 : 0.05;
    const s = this.plan.team;
    const at = this.toWorld(-46 * s, -4 * s);
    this.fx.emit({
      x: at.x + rng.range(-3, 3),
      y: at.y + rng.range(-4, 4),
      vx: rng.range(-18, -4),
      vy: rng.range(-6, 14),
      life: rng.range(0.6, 1.1),
      size: rng.range(4, 7),
      size1: 1,
      color: [255, 236, 170],
      color1: [255, 160, 120],
      shape: rng.next() < 0.4 ? 'star4' : 'spark',
      gravity: 18,
      drag: 1.2,
      twinkle: 9,
    });
  }

  private snow(dt: number): void {
    this.snowIn -= dt;
    if (this.snowIn > 0) return;
    const rng = this.env.rng;
    this.snowIn = this.env.calm ? 0.2 : 0.07;
    const { view, plan } = this;
    const left = this.cam.worldX(0, view.w);
    const right = this.cam.worldX(view.w, view.w);
    const vy = rng.range(18, 34);
    this.fx.emit({
      x: rng.range(left - 20, right + 20),
      y: -8,
      vx: rng.range(-8, 4),
      vy,
      sway: 16,
      life: (plan.ground + 6) / vy,
      size: rng.range(2.5, 5.5),
      color: COLORS.white,
      alpha: 0.8,
      shape: 'flake',
      spin: rng.range(-1, 1),
    });
  }

  // ---- painting ----

  /** The pictures the game paints from, made when the sharpness of the screen is known. */
  private gear(p: Painter): Gear {
    const pixels = clamp(Math.round(p.k * 10) / 10, 1, 4);
    if (this.art && this.art.pixels === pixels) return this.art;
    const { plan } = this;
    const rng = new Rng(11);
    const tile = Math.max(p.w * 1.3, 640);
    this.art = {
      pixels,
      tile,
      sky: makeSky(p.w, p.h, plan, Math.min(2, pixels)),
      far: makeHills(tile, p.h * 0.3, rng, [104, 110, 170], [72, 78, 136], 0.7),
      mid: makeHills(tile, p.h * 0.2, rng, [150, 164, 214], [110, 126, 186], 0.6),
      pines: makePines(tile, 54, rng, Math.min(2, pixels)),
      sleigh: makeSleigh(Math.min(3, pixels)),
      pine: makePine(Math.min(2, pixels)),
      lamp: makeLamp(Math.min(2, pixels)),
      gifts: GIFTS.map((c) => makeGift(c.body, c.ribbon, Math.min(2.5, pixels))),
      houses: new Map(),
    };
    return this.art;
  }

  private houseArt(art: Gear, shape: number, palette: number): Art {
    const key = shape * PALETTES.length + palette;
    let made = art.houses.get(key);
    if (!made) {
      made = makeHouse(HOUSES[shape]!, PALETTES[palette]!, Math.min(2.5, art.pixels));
      art.houses.set(key, made);
    }
    return made;
  }

  protected paintBack(p: Painter): void {
    const art = this.gear(p);
    const g = p.ctx;
    const { ground } = this.plan;
    g.drawImage(art.sky, 0, 0, p.w, p.h);
    this.sky.draw(g, this.time, this.env.calm, 0.9);
    // The hills slip by slower than the village does, the farthest slowest, so the sleigh is flying.
    this.strip(g, art.far, 0.08, ground - p.h * 0.3 + 18, art.tile, p.h * 0.3);
    this.strip(g, art.mid, 0.2, ground - p.h * 0.2 + 12, art.tile, p.h * 0.2);
    this.strip(g, art.pines, 0.42, ground - 52, art.tile, 54);
  }

  private strip(
    g: CanvasRenderingContext2D,
    pic: HTMLCanvasElement,
    rate: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const x = -wrap(this.travel * rate, w);
    g.drawImage(pic, x, y, w, h);
    g.drawImage(pic, x + w, y, w, h);
  }

  protected override paintWorld(p: Painter): void {
    const art = this.gear(p);
    const g = p.ctx;
    const { plan, view, cam } = this;
    const left = cam.worldX(0, view.w) - 4;
    const right = cam.worldX(view.w, view.w) + 4;
    const snow = g.createLinearGradient(0, plan.ground, 0, view.h);
    snow.addColorStop(0, css([236, 243, 255]));
    snow.addColorStop(1, css([172, 190, 232]));
    // Their light goes straight onto the picture, not onto the sheet laid over everything at the end,
    // so the sleigh and the village stay in front of them.
    const behind: Painter = { ...p, light: g };
    this.shells.drawSolid(behind);
    this.shells.drawGlow(behind);
    g.fillStyle = snow;
    g.fillRect(left, plan.ground, right - left, view.h - plan.ground + 4);
    for (const d of this.decor) {
      if (d.x < left - 60 || d.x > right + 60) continue;
      this.paintDecor(p, art, d);
    }
    for (const h of this.houses) {
      if (h.x < left - 120 || h.x > right + 120) continue;
      this.paintHouse(p, art, h);
    }
    this.paintTeam(p, art);
    for (const gift of this.gifts) this.paintGift(g, art, gift);
  }

  private paintDecor(p: Painter, art: Gear, d: Decor): void {
    const g = p.ctx;
    const { plan } = this;
    const s = plan.scale * d.size;
    if (d.kind === 'pine') {
      g.drawImage(art.pine, d.x - (PINE.w / 2) * s, plan.ground + 3 - (PINE.h - 4) * s, PINE.w * s, PINE.h * s);
      return;
    }
    const top = plan.ground + 3 - (LAMP.h - 3) * s;
    g.drawImage(art.lamp, d.x - (LAMP.w / 2) * s, top, LAMP.w * s, LAMP.h * s);
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 2.3 + d.x);
    glowAt(p.light, d.x, top + 8 * s, 46 * s, WARM, 0.55 * flicker);
    glowAt(p.light, d.x, top + 9 * s, 16 * s, [255, 244, 200], 0.6 * flicker);
  }

  private paintHouse(p: Painter, art: Gear, h: House): void {
    const g = p.ctx;
    const { plan } = this;
    const shape = HOUSES[h.shape]!;
    const pic = this.houseArt(art, h.shape, h.palette);
    const squash = h.bump.x * 0.05;
    g.save();
    g.translate(h.x, plan.ground);
    g.scale(plan.scale * (1 - squash), plan.scale * (1 + squash * 1.4));
    g.drawImage(pic.canvas, -pic.ox, -pic.oy, pic.w, pic.h);
    if (h.glow > 0.02) {
      for (const [i, win] of shape.windows.entries()) {
        const flicker = 0.9 + 0.1 * Math.sin(this.time * 3.3 + h.id * 2.1 + i * 1.7);
        g.fillStyle = css(WARM, h.glow * flicker);
        g.fillRect(win.x, win.y, win.w, win.h);
        g.fillStyle = css([255, 244, 214], h.glow * 0.8);
        g.fillRect(win.x + win.w / 2 - 0.7, win.y, 1.4, win.h);
        g.fillRect(win.x, win.y + win.h / 2 - 0.7, win.w, 1.4);
      }
    }
    g.restore();
    if (h.glow > 0.02) {
      const s = plan.scale;
      for (const [i, win] of shape.windows.entries()) {
        const cx = h.x + (win.x + win.w / 2) * s;
        const cy = plan.ground + (win.y + win.h / 2) * s;
        glowAt(p.light, cx, cy, (win.w + 30) * s, WARM, 0.5 * h.glow * (0.9 + 0.1 * Math.sin(this.time * 3 + i)));
      }
    }
    for (let i = 0; i < h.bulbs; i++) {
      const at = this.bulbAt(h, i);
      const color = BULBS[i % BULBS.length]!;
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 4 + i * 1.3 + h.id);
      g.fillStyle = css(color);
      g.strokeStyle = css(darken(color, 0.45));
      g.lineWidth = 0.9;
      g.beginPath();
      g.arc(at.x, at.y, 2.9 * plan.scale, 0, TAU);
      g.fill();
      g.stroke();
      glowAt(p.light, at.x, at.y, 16 * plan.scale, color, 0.4 * pulse);
    }
  }

  private paintGift(g: CanvasRenderingContext2D, art: Gear, gift: Gift): void {
    const u = clamp((this.time - gift.born) / gift.dur);
    const at = this.giftAt(gift, u);
    // It is small in the hand, grows as it is thrown, and shrinks as it goes down the chimney.
    const size = lerp(0.5, 0.8, easeOutBack(Math.min(1, u * 3), 2)) * (1 - 0.35 * easeInQuad(clamp((u - 0.82) / 0.18)));
    const k = size * this.plan.scale;
    g.save();
    g.translate(at.x, at.y);
    g.rotate(gift.spin * u);
    g.scale(k, k);
    g.drawImage(art.gifts[gift.tint]!, -GIFT.w / 2, -GIFT.h / 2, GIFT.w, GIFT.h);
    g.restore();
  }

  private paintTeam(p: Painter, art: Gear): void {
    const g = p.ctx;
    const s = this.plan.team;
    const { sleigh } = this;
    // The unicorns, the one in front first so that the ones behind her are drawn over her.
    for (let i = 0; i < this.team.length; i++) this.cast.draw(g, this.env.bank, i, this.team[i]!, UNICORN * s);
    this.paintHarness(g, s);
    g.save();
    g.translate(sleigh.x, sleigh.y - PIVOT * s);
    g.rotate(sleigh.rot);
    g.translate(0, PIVOT * s);
    g.drawImage(art.sleigh, -SLEIGH.ox * s, -SLEIGH.oy * s, SLEIGH.w * s, SLEIGH.h * s);
    g.restore();
    const hand = this.handOf();
    glowAt(p.light, hand.x, hand.y, 26 * s, [255, 226, 150], 0.25 + 0.1 * Math.sin(this.time * 4));
  }

  /** The rope from the front of the sleigh to the chest of each unicorn, with a bell on it. */
  private paintHarness(g: CanvasRenderingContext2D, s: number): void {
    const hook = this.toWorld(46 * s, -34 * s);
    g.strokeStyle = css([226, 186, 110]);
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let i = 0; i < this.team.length; i++) {
      const look = this.cast.looks[i]!;
      const c = Math.cos(look.rot);
      const n = Math.sin(look.rot);
      const reach = 16 * UNICORN * s;
      const drop = 4 * UNICORN * s;
      const x1 = look.x + c * reach - n * drop;
      const y1 = look.y + n * reach + c * drop;
      g.beginPath();
      g.moveTo(hook.x, hook.y);
      g.quadraticCurveTo((hook.x + x1) / 2, (hook.y + y1) / 2 + 8 * s, x1, y1);
      g.stroke();
      g.fillStyle = css([255, 214, 90]);
      g.beginPath();
      g.arc(x1, y1, 2.4 * s, 0, TAU);
      g.fill();
    }
  }

  protected paintFront(_p: Painter): void {}
}

/** The pictures the game paints from. */
interface Gear {
  readonly pixels: number;
  /** How wide the strips of hills and trees are before they repeat. */
  readonly tile: number;
  readonly sky: HTMLCanvasElement;
  readonly far: HTMLCanvasElement;
  readonly mid: HTMLCanvasElement;
  readonly pines: HTMLCanvasElement;
  readonly sleigh: HTMLCanvasElement;
  readonly pine: HTMLCanvasElement;
  readonly lamp: HTMLCanvasElement;
  readonly gifts: readonly HTMLCanvasElement[];
  /** The houses painted so far, by kind and colours, made when a house of them first comes by. */
  readonly houses: Map<number, Art>;
}
