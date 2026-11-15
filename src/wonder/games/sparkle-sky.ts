import { Bag } from '../engine/bag';
import { drawPic } from '../engine/bank';
import { COLORS, lighten, mix, type RGB } from '../engine/color';
import { lerp, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { noteAt } from '../music';
import { NIGHT } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import type { ShellKind } from './shells';
import { Audience, type Member } from './sky/audience';
import { burstShell } from './sky/burst';
import { BurstLight } from './sky/light';
import { GOLDEN, type Look, lookOf, MAGIC, type Scheme } from './sky/looks';
import { Scenery } from './sky/scenery';

/** A shell on its way up. */
interface Rocket {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  t: number;
  readonly dur: number;
  readonly kind: ShellKind;
  readonly scheme: Scheme;
  readonly power: number;
  /** How far the flight bows to one side. */
  readonly bend: number;
  /** Counts toward the player's stars. The show that makes itself does not. */
  readonly counted: boolean;
  /** Whether it rings a bell when it opens. */
  readonly note: boolean;
}

/** What a shell needs said about it to be sent up. Anything left out is chosen. */
interface Order {
  x: number;
  y: number;
  kind?: ShellKind;
  scheme?: Scheme;
  power?: number;
  counted: boolean;
  /** Opens at once, where it is, with no flight. */
  quick?: boolean;
  from?: { x: number; y: number };
  /** Seconds to wait before it leaves. */
  delay?: number;
  note?: boolean;
}

/** Bursts closer together than this many seconds count as a run. */
const RUN_SECONDS = 1.2;
/**
 * What each star costs, in points of play. A new shape is worth the most, so the player is led to
 * try them all.
 */
const SKY_STAR_COSTS = [4, 10, 18, 29, 42] as const;
const FRESH_SHAPE = 1.2;

/**
 * The fireworks over the lake. A touch in the sky sends up a shell that opens into a shape: a
 * heart, a star, a butterfly, a rainbow. Dragging writes in glitter. A friend on the shore,
 * touched, throws her own magic. The crate fires three at once. The sky, the clouds, the lake and
 * the friends all take their light from what bursts, and every burst rings a bell in tune with
 * where in the sky it opened, so the sky is an instrument.
 */
export class SparkleSky extends Wonder {
  readonly id = 'sparkle-sky' as const;
  protected readonly meter = new Meter(SKY_STAR_COSTS);
  private readonly look: Look;
  private readonly bag: Bag<ShellKind>;
  private readonly seen = new Set<ShellKind>();
  private readonly light = new BurstLight();
  private readonly audience: Audience;
  private scenery!: Scenery;
  private rockets: Rocket[] = [];
  private stroke: { x: number; y: number; length: number } | null = null;
  private launcher = { x: 0, y: 0 };
  private sinceBurst = 0;
  private lastBurst = -10;
  private run = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.look = lookOf(env.look);
    this.bag = new Bag(this.look.kinds, env.rng);
    this.audience = new Audience(env.bank, env.rng, this.look.dark);
    this.startMusic(NIGHT);
  }

  override get bloom(): number {
    return this.env.calm ? 0.3 : 0.6;
  }

  protected arrange(view: View): void {
    this.scenery = new Scenery(this.look, this.env.rng, view);
    this.launcher = { x: view.w / 2, y: this.scenery.feet + 2 };
    this.audience.stand(this.env.herd, view.w, this.launcher.x, this.scenery.feet, 64, this.time);
  }

  protected reset(): void {
    this.rockets = [];
    this.light.clear();
    this.seen.clear();
    this.stroke = null;
    this.sinceBurst = 0;
    this.run = 0;
    this.lastBurst = -10;
    this.audience.reset(this.time);
  }

  protected hint(): { x: number; y: number } | null {
    return { x: this.view.w * 0.5, y: this.scenery.horizon * 0.42 };
  }

  protected press(p: Pointer): void {
    const friend = this.audience.at(p.x, p.y);
    if (friend) {
      this.sing(friend);
      return;
    }
    if (this.onLauncher(p.x, p.y)) {
      this.salvo();
      return;
    }
    // A touch in the lake or on the shore sends the shell up into the middle of the sky above it.
    const y = p.y > this.scenery.horizon - 24 ? this.scenery.horizon * this.env.rng.range(0.28, 0.55) : p.y;
    this.fire({ x: p.x, y, counted: true });
    this.stroke = { x: p.x, y: p.y, length: 0 };
  }

  protected override drag(p: Pointer): void {
    const s = this.stroke;
    if (!s || p.y > this.scenery.horizon - 6) return;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < 6) return;
    s.length += d;
    // Glitter along the path of the finger, each bit twinkling as it drifts down.
    const steps = Math.ceil(d / 7);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      this.glitter(lerp(s.x, p.x, u), lerp(s.y, p.y, u), s.length);
    }
    s.x = p.x;
    s.y = p.y;
  }

  protected override lift(p: Pointer): void {
    const s = this.stroke;
    this.stroke = null;
    if (!s || s.length < 44) return;
    // A long stroke ends in a small burst where the finger lifted.
    this.fire({
      x: p.x,
      y: Math.min(p.y, this.scenery.horizon - 30),
      kind: 'peony',
      power: 0.55,
      counted: false,
      quick: true,
    });
    this.earn(1.4);
    this.env.sound.fx('twinkle', { pan: this.pan(p.x) });
  }

  private onLauncher(x: number, y: number): boolean {
    return Math.abs(x - this.launcher.x) < 38 && y > this.launcher.y - 66 && y < this.launcher.y + 10;
  }

  /** How far from its middle a shell of this power reaches. */
  private reach(power: number): number {
    return Math.min(this.view.h * (0.19 + 0.075 * power), this.view.w * 0.3);
  }

  /** Sends up a shell. */
  private fire(o: Order): void {
    if (this.rockets.length > 16) return;
    const rng = this.env.rng;
    const kind = o.kind ?? this.bag.next();
    const power = o.power ?? rng.range(0.78, 1);
    const sc = o.scheme ?? rng.pick(this.look.schemes);
    const from = o.from ?? this.launcher;
    // A shape must be seen whole, so it opens where all of it fits on the screen.
    const reach = this.reach(power);
    const x = Math.max(reach * 1.05, Math.min(this.view.w - reach * 1.05, o.x));
    const y = Math.max(reach * 1.04 + 4, Math.min(this.scenery.horizon - reach * 0.35, o.y));
    const distance = Math.hypot(x - from.x, y - from.y);
    const launch = (): void => {
      this.rockets.push({
        x0: from.x,
        y0: from.y,
        x1: x,
        y1: y,
        t: 0,
        dur: o.quick ? 0.01 : 0.5 + Math.min(0.55, distance / 820),
        kind,
        scheme: sc,
        power,
        bend: rng.range(-26, 26),
        counted: o.counted,
        note: o.note ?? true,
      });
      if (!o.quick) this.env.sound.fx('launch', { pan: this.pan(from.x), size: power });
    };
    if (o.delay && o.delay > 0) this.script.at(this.script.now + o.delay, launch);
    else launch();
  }

  private pan(x: number): number {
    return Math.max(-0.8, Math.min(0.8, (x / this.view.w - 0.5) * 1.6));
  }

  /** The crate's three shells, one after another, fanned across the sky. */
  private salvo(): void {
    const { w } = this.view;
    const rng = this.env.rng;
    const sky = this.scenery.horizon;
    const lanes = [0.28, 0.5, 0.72];
    const first = rng.int(2);
    this.env.sound.fx('whistle', { pan: 0 });
    lanes.forEach((lane, i) => {
      const order = first === 0 ? i : lanes.length - 1 - i;
      this.fire({ x: w * lane + rng.range(-24, 24), y: sky * rng.range(0.26, 0.5), counted: true, delay: order * 0.2 });
    });
  }

  /**
   * A friend on the shore throws her own magic into the sky, from her horn, when her cast reaches
   * its moment.
   */
  private sing(friend: Member): void {
    const magic = MAGIC[friend.id];
    const horn = this.audience.cast(friend, this.time);
    this.env.sound.fx('tap', { pan: this.pan(friend.x) });
    this.fire({
      x: lerp(friend.x, this.view.w / 2, 0.45) + this.env.rng.range(-50, 50),
      y: this.scenery.horizon * this.env.rng.range(0.22, 0.5),
      kind: magic.kind,
      scheme: magic.scheme,
      power: 1.1,
      counted: true,
      from: horn,
      delay: horn.after,
    });
    this.earn(0.6);
    this.spray(horn.x, horn.y, magic.scheme.colors[0]!, 7);
  }

  private glitter(x: number, y: number, length: number): void {
    const rng = this.env.rng;
    const schemes = this.look.schemes;
    const sc = schemes[Math.floor(length / 140) % schemes.length]!;
    const c = sc.colors[rng.int(sc.colors.length)]!;
    this.fx.emit({
      x,
      y,
      vx: rng.range(-16, 16),
      vy: rng.range(-10, 14),
      life: rng.range(1.1, 1.9),
      size: rng.range(6, 10),
      size1: 1.5,
      color: lighten(c, 0.55),
      color1: c,
      alpha: 1,
      hold: 0.35,
      shape: rng.next() < 0.3 ? 'star4' : 'spark',
      gravity: 22,
      drag: 1.1,
      twinkle: rng.range(7, 14),
    });
  }

  /** A little spray of sparks from a point. */
  private spray(x: number, y: number, color: RGB, count: number): void {
    const rng = this.env.rng;
    for (let i = 0; i < this.fx.count(count); i++) {
      const a = rng.range(0, TAU);
      const s = rng.range(30, 90);
      this.fx.emit({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: rng.range(0.5, 1),
        size: 7,
        size1: 1,
        color: lighten(color, 0.5),
        color1: color,
        shape: 'spark',
        drag: 2.2,
        gravity: 40,
        twinkle: 10,
      });
    }
  }

  /** The shell reaches the top and opens. */
  private explode(r: Rocket): void {
    const { x1: x, y1: y, kind, scheme: sc, power } = r;
    const rng = this.env.rng;
    const radius = this.reach(power);
    burstShell(this.fx, rng, { x, y, kind, scheme: sc, radius, power });
    // The flash: a hot core, a ring racing out, and a pool of light on the sky.
    const calm = this.env.calm ? 0.6 : 1;
    this.fx.emit({
      x,
      y,
      life: 0.26,
      size: radius * 0.22,
      size1: radius * 1.1,
      color: COLORS.white,
      shape: 'glow',
      alpha: 0.6 * calm,
    });
    this.fx.emit({
      x,
      y,
      life: 0.5,
      size: radius * 0.5,
      size1: radius * 2.1,
      color: sc.flash,
      shape: 'ring',
      width: 2.6,
      alpha: 0.6 * calm,
    });
    this.light.add(x, y, sc.flash, radius * 5, 0.8 + 0.3 * power);
    this.flash(0.5 + 0.35 * power, sc.flash);
    this.shake(1.1 * power);
    this.audience.cheer(x, power, this.time, this.view.w);
    // Sound: the thump of the shell, and a bell in tune with where in the sky it opened.
    this.env.sound.fx('boom', { pan: this.pan(x), size: power, delay: 0.02 });
    if (kind === 'crackle' || kind === 'willow')
      this.env.sound.fx('crackle', { pan: this.pan(x), size: power, delay: 0.2 });
    if (r.note)
      this.env.sound.note('bell', noteAt(x / this.view.w, 60, 15), { pan: this.pan(x), gain: 0.8 + 0.2 * power });
    if (r.counted) this.count(kind);
    this.sinceBurst = 0;
  }

  /**
   * A burst the player made is worth one, a shape they have not seen yet is worth more, and a run
   * of them a little more.
   */
  private count(kind: ShellKind): void {
    const fresh = !this.seen.has(kind);
    this.seen.add(kind);
    this.run = this.time - this.lastBurst < RUN_SECONDS ? this.run + 1 : 0;
    this.lastBurst = this.time;
    this.earn(1 + (fresh ? FRESH_SHAPE : 0) + Math.min(this.run, 3) * 0.2);
  }

  protected finale(): void {
    const { w } = this.view;
    const rng = this.env.rng;
    const sky = this.scenery.horizon;
    const sx = (u: number): number => w * (0.1 + 0.8 * u);
    const sy = (u: number): number => sky * (0.16 + 0.38 * u);
    const colors = (i: number): Scheme => this.look.schemes[i % this.look.schemes.length]!;
    const show = (at: number, o: Order): void => {
      this.script.at(at, () => this.fire(o));
    };
    this.env.sound.fx('swell');
    this.script.clear();
    // A run of shells climbing the sky from the left to the right.
    const climb: readonly ShellKind[] = ['peony', 'ring', 'double-ring', 'peony', 'ring', 'double-ring', 'peony'];
    this.script.spread(0.2, 2, climb.length, (i, of) => {
      const u = i / (of - 1);
      this.fire({
        x: sx(u),
        y: sy(0.6 - 0.4 * Math.sin(u * Math.PI)),
        kind: climb[i]!,
        scheme: colors(i),
        power: 0.95,
        counted: false,
      });
    });
    // Three hearts, a star either side, a rainbow over everything, and golden willows from both
    // edges.
    show(2.6, { x: sx(0.5), y: sy(0.45), kind: 'heart', scheme: colors(0), power: 1.35, counted: false });
    show(3.2, { x: sx(0.2), y: sy(0.7), kind: 'heart', scheme: colors(2), power: 1.15, counted: false });
    show(3.2, { x: sx(0.8), y: sy(0.7), kind: 'heart', scheme: colors(1), power: 1.15, counted: false });
    show(4.1, { x: sx(0.3), y: sy(0.3), kind: 'star', scheme: colors(3), power: 1.1, counted: false });
    show(4.1, { x: sx(0.7), y: sy(0.3), kind: 'star', scheme: colors(1), power: 1.1, counted: false });
    show(5, { x: sx(0.5), y: sy(0.8), kind: 'rainbow', scheme: colors(0), power: 1.5, counted: false });
    show(5.5, { x: sx(0.12), y: sy(0.1), kind: 'willow', scheme: GOLDEN, power: 1.2, counted: false });
    show(5.5, { x: sx(0.88), y: sy(0.1), kind: 'willow', scheme: GOLDEN, power: 1.2, counted: false });
    // The grand finale: a crowd of shells all at once.
    const crowd: readonly ShellKind[] = ['peony', 'crackle', 'ring', 'flower', 'butterfly', 'sun'];
    this.script.spread(6.3, 7.7, 16, (i) => {
      this.fire({
        x: sx(rng.next()),
        y: sy(rng.next()),
        kind: crowd[i % crowd.length]!,
        scheme: colors(i),
        power: rng.range(0.9, 1.2),
        counted: false,
        note: i % 2 === 0,
      });
    });
    show(8.2, { x: sx(0.5), y: sy(0.05), kind: 'willow', scheme: GOLDEN, power: 1.6, counted: false });
    this.script.at(8.4, () => {
      this.audience.celebrate(this.time);
      this.env.sound.fx('cheer');
    });
    this.script.at(11.2, () => this.endFinale());
  }

  protected tick(dt: number): void {
    const rng = this.env.rng;
    this.light.update(dt);
    this.scenery.update(dt);
    this.audience.update(this.time);
    this.sinceBurst += dt;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      const e = 1 - (1 - u) ** 2.2;
      const x = lerp(r.x0, r.x1, u) + r.bend * Math.sin(u * Math.PI) * (1 - u * 0.4);
      const y = lerp(r.y0, r.y1, e);
      if (r.dur > 0.02) {
        const tint = r.scheme.colors[0]!;
        for (let k = 0; k < 2; k++) {
          this.fx.emit({
            x: x + rng.range(-1.5, 1.5),
            y: y + rng.range(0, 3),
            vx: rng.range(-16, 16),
            vy: rng.range(14, 46),
            life: rng.range(0.35, 0.8),
            size: rng.range(5, 8),
            size1: 1,
            color: [255, 235, 190],
            color1: mix(tint, [255, 150, 70], 0.5),
            shape: 'spark',
            drag: 1.8,
            twinkle: 12,
            hold: 0.2,
          });
        }
        this.fx.emit({ x, y, life: 0.09, size: 16, color: [255, 245, 210], shape: 'glow', alpha: 0.9 });
      }
      if (u >= 1) {
        this.rockets.splice(i, 1);
        this.explode(r);
      }
    }
    // Fireflies over the water, and a small show of its own when nobody is playing, so the sky
    // never looks asleep.
    if (this.phase === 'play' && rng.next() < dt * (this.env.calm ? 0.9 : 2.2)) this.firefly();
    if (this.phase === 'play' && this.sinceBurst > 4.2 && this.rockets.length === 0) {
      this.fire({
        x: this.view.w * rng.range(0.2, 0.8),
        y: this.scenery.horizon * rng.range(0.25, 0.5),
        power: 0.7,
        counted: false,
        note: false,
      });
      this.sinceBurst = 1.5;
    }
  }

  private firefly(): void {
    const rng = this.env.rng;
    const { horizon, feet } = this.scenery;
    this.fx.emit({
      x: rng.range(0, this.view.w),
      y: rng.range(horizon + 18, feet - 22),
      vx: rng.range(-5, 5),
      vy: rng.range(-9, -2),
      life: rng.range(3.5, 6),
      size: rng.range(6, 9),
      color: [255, 245, 150],
      color1: [190, 255, 140],
      shape: 'glow',
      alpha: 0.8,
      fadeIn: 1,
      twinkle: rng.range(0.5, 1.2),
      sway: 8,
      hold: 0.4,
    });
  }

  protected paintBack(p: Painter): void {
    this.scenery.paintSky(p, this.light);
  }

  protected paintFront(p: Painter): void {
    this.scenery.paintLake(p, this.light);
    this.scenery.paintBank(p, this.light, this.launcher);
    this.paintLauncher(p);
    this.audience.paint(p, this.light, this.time);
  }

  private paintLauncher(p: Painter): void {
    const bank = this.env.bank;
    const pic = bank?.sprite('playground', `pg-fireworks-${this.env.look}`, 0);
    if (!bank || !pic) return;
    // The crate is in the dark like everything else, and the lamp at its foot lights it from below.
    drawPic(p.ctx, bank.shaded(pic, [190, 170, 215]), this.launcher.x, this.launcher.y + 8, { scale: 1.05 });
  }
}
