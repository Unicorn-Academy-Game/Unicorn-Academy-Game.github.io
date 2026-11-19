import { Rng } from '../../domain/rng';
import { Bag } from '../engine/bag';
import { COLORS, css, darken, lighten, type RGB } from '../engine/color';
import { clamp, damp, easeOutBack, easeOutCubic, hump, lerp, Spring, TAU } from '../engine/ease';
import { Meter } from '../engine/meter';
import { glowAt, roundedRect, Starfield } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer } from '../engine/stage';
import { noteAt } from '../music';
import type { VoiceName } from '../sound';
import { SNOWY } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import {
  HANG,
  makeGift,
  makeOrnament,
  makeScene,
  makeTopStar,
  makeTree,
  ORNAMENT_H,
  ORNAMENT_W,
  TINT,
  TREE_PAD,
  treeBox,
} from './tree/art';
import { nearestFree, ORNAMENTS, type Ornament, type Plan, planOf, slotAt } from './tree/layout';
import { GIFT, HOOKS, halfWidthAt, LIGHTS, type Spot, TREE_HEIGHT } from './tree/shape';

/** An ornament on the tree, on its way to it, or in a finger that has lifted it off. */
interface Hung {
  hook: number;
  readonly kind: Ornament;
  /** Where its hanging point set off from, when, and how many seconds it takes to arrive. */
  from: Spot;
  born: number;
  dur: number;
  landed: boolean;
  /** Whether the first time it was hung has been counted. Hung again, it is not new. */
  counted: boolean;
  lifted: boolean;
  /** The angle it swings at, in radians. */
  readonly swing: Spring;
  /** How much of a glow it still has from a touch, 1 down to 0. */
  glow: number;
  /** How much of a twinkle it still has, 1 down to 0. */
  glint: number;
}

/** What a finger has hold of. */
interface Held {
  readonly kind: Ornament;
  readonly id: number;
  /** Where its hanging point is, which is above the finger so the finger does not cover it. */
  x: number;
  y: number;
  readonly sx: number;
  readonly sy: number;
  readonly t0: number;
  /** From which place of the tray it came, or null if it was lifted off the tree. */
  readonly slot: number | null;
  readonly from: Hung | null;
  /** Whether it has been moved more than a touch. */
  moved: boolean;
  /** When it last left a spark behind it. */
  trailAt: number;
}

/** An ornament going back to the tray, which is not a wrong turn: it is only put back. */
interface Homing {
  readonly kind: Ornament;
  readonly from: Spot;
  readonly to: Spot;
  t: number;
}

/** A finger on an ornament of the tree: if it moves, the ornament goes with it. */
interface Grab {
  readonly hung: Hung;
  readonly id: number;
  readonly sx: number;
  readonly sy: number;
}

/**
 * What each star costs, in points of play. An ornament is a point and the first of each kind is a
 * second, so the player is led to try all six.
 */
const TREE_COSTS = [3, 7, 12, 18, 25] as const;
const FRESH_KIND = 1;
const SWING_POINTS = 0.2;

const VOICE: Readonly<Record<Ornament, VoiceName>> = {
  'ball-red': 'glass',
  'ball-blue': 'bell',
  'ball-gold': 'chime',
  cane: 'marimba',
  bell: 'bell',
  star: 'harp',
};

/** The colours of the little lights, round and round the string. */
const BULBS: readonly RGB[] = [
  [255, 96, 96],
  [255, 208, 96],
  [112, 172, 255],
  [255, 132, 212],
  [120, 236, 152],
];

const GIFTS = [
  { body: [222, 62, 84], ribbon: [255, 222, 120] },
  { body: [72, 132, 232], ribbon: [255, 255, 255] },
  { body: [62, 172, 112], ribbon: [255, 92, 112] },
  { body: [152, 92, 212], ribbon: [255, 232, 142] },
] as const satisfies readonly { body: RGB; ribbon: RGB }[];

/** How far the ornament in a finger rides above it, so the finger does not cover it. */
const HELD_LIFT = 46;
/** How far an ornament body hangs below its hook, and how far off a finger must go to drag it. */
const BODY = 35;
const DRAG = 12;
/** The share of the picture the tray shows an ornament at, and the one in a finger. */
const TRAY_SCALE = 0.8;
const HELD_SCALE = 0.95;
/** What a tap is: short, and with the finger hardly moved. */
const TAP_SECONDS = 0.7;
/** The pace the lights come on at, one at a time, in play and in the finale. */
const LIGHT_EVERY = 0.12;
const LIGHT_EVERY_FINALE = 0.07;
const PER_STAR = 4;

/** The pictures the game paints from, made when the sharpness of the screen is known. */
interface Art {
  readonly pixels: number;
  readonly scene: HTMLCanvasElement;
  readonly tree: HTMLCanvasElement;
  readonly ornaments: Readonly<Record<Ornament, HTMLCanvasElement>>;
  readonly gifts: readonly HTMLCanvasElement[];
  readonly star: readonly [HTMLCanvasElement, HTMLCanvasElement];
}

/**
 * The Christmas tree in the grove, with a tray of ornaments below it. An ornament dragged from the
 * tray hangs on the tree where it is let go. A touch on the tray, or on the tree, hangs one by
 * itself. A touch on an ornament that is hanging makes it swing and ring, and it can be dragged
 * somewhere else. Each ornament is a bell in tune with how high it hangs, each star lights part of
 * a string of lights, and when the tree is full its star lights and the presents come.
 */
export class TreeTrim extends Wonder {
  readonly id = 'tree-trim' as const;
  protected readonly meter = new Meter(TREE_COSTS);
  private readonly bag: Bag<Ornament>;
  private readonly seen = new Set<Ornament>();
  private plan!: Plan;
  private art: Art | null = null;
  private sky!: Starfield;
  private hung: Hung[] = [];
  private held: Held | null = null;
  private grab: Grab | null = null;
  private homing: Homing[] = [];
  private lit = 0;
  private lightIn = 0;
  /** When each light came on, or null while it is dark. */
  private litAt: (number | null)[] = LIGHTS.map(() => null);
  /** When each present came up under the tree. */
  private giftAt = new Map<number, number>();
  private topper = 0;
  private snowIn = 0;
  private glintIn = 1;

  constructor(env: WonderEnv) {
    super(env);
    this.bag = new Bag(ORNAMENTS, env.rng);
    this.startMusic(SNOWY);
  }

  override get bloom(): number {
    return this.env.calm ? 0.25 : 0.5;
  }

  protected arrange(view: View): void {
    this.plan = planOf(view.w, view.h, view.unit);
    this.art = null;
    this.sky = new Starfield(Math.round((view.w * view.h) / 3200), new Rng(17), view.w, 0, this.plan.ground * 0.78);
  }

  protected reset(): void {
    this.hung = [];
    this.held = null;
    this.grab = null;
    this.homing = [];
    this.seen.clear();
    this.lit = 0;
    this.lightIn = 0;
    this.litAt.fill(null);
    this.giftAt.clear();
    this.topper = 0;
    this.glintIn = 1;
  }

  protected hint(): Spot | null {
    const { tree, tray } = this.plan;
    if (this.hung.length === 0) return tray[0]!;
    return { x: tree.x, y: tree.top + tree.scale * 62 };
  }

  /** What a test or a film wants to know about the game. */
  inspect(): {
    readonly plan: Plan;
    readonly hung: readonly { hook: number; kind: Ornament; landed: boolean; x: number; y: number }[];
    readonly free: readonly number[];
    readonly held: Ornament | null;
    readonly lit: number;
    readonly gifts: number;
    readonly topper: number;
    readonly seen: readonly Ornament[];
  } {
    const taken = this.taken();
    return {
      plan: this.plan,
      hung: this.hung.map((h) => ({ hook: h.hook, kind: h.kind, landed: h.landed, ...this.bodyOf(h) })),
      free: HOOKS.map((_, i) => i).filter((i) => !taken.has(i)),
      held: this.held?.kind ?? null,
      lit: this.lit,
      gifts: this.giftAt.size,
      topper: this.topper,
      seen: [...this.seen],
    };
  }

  // ---- touch ----

  protected press(p: Pointer): void {
    // A second finger does nothing while one is holding an ornament, so none is ever left half lifted.
    if (this.held) return;
    const slot = slotAt(this.plan.tray, p.x, p.y);
    if (slot !== null) {
      this.pickUp(slot, p);
      return;
    }
    const on = this.hungAt(p.x, p.y);
    if (on) {
      this.touch(on, p);
      return;
    }
    if (this.onTree(p.x, p.y)) {
      this.hangWhere(p.x, p.y);
      return;
    }
    this.twinkleAt(p.x, p.y);
  }

  protected override drag(p: Pointer): void {
    const g = this.grab;
    if (g && g.id === p.id && !this.held && Math.hypot(p.x - g.sx, p.y - g.sy) > DRAG) this.liftOff(g, p);
    const h = this.held;
    if (!h || h.id !== p.id) return;
    if (!h.moved && Math.hypot(p.x - h.sx, p.y - h.sy) > DRAG) h.moved = true;
    if (!h.moved) return;
    h.x = clamp(p.x, 6, this.view.w - 6);
    h.y = Math.max(6, p.y - HELD_LIFT);
    if (this.time - h.trailAt > 0.05) {
      h.trailAt = this.time;
      this.trailOf(h);
    }
  }

  protected override lift(p: Pointer): void {
    if (this.grab && this.grab.id === p.id) this.grab = null;
    const h = this.held;
    if (!h || h.id !== p.id) return;
    this.held = null;
    const taken = this.taken();
    if (h.from) {
      // A lifted ornament goes to the free hook nearest where it was let go, or back where it was.
      const hook = nearestFree(this.plan.hooks, taken, h.x, h.y, this.plan.reach);
      this.rehang(h.from, hook ?? h.from.hook, { x: h.x, y: h.y });
      return;
    }
    const tap = !h.moved && this.time - h.t0 < TAP_SECONDS;
    const hook = tap ? this.spreadHook(taken) : nearestFree(this.plan.hooks, taken, h.x, h.y, this.plan.reach);
    const start = tap ? this.trayHang(h.slot!) : { x: h.x, y: h.y };
    if (hook !== null) this.hang(h.kind, hook, start);
    else if (!tap) this.sendHome(h.kind, { x: h.x, y: h.y }, h.slot!);
    else this.hop(h.slot!);
  }

  private pickUp(slot: number, p: Pointer): void {
    const kind = ORNAMENTS[slot]!;
    const at = this.trayHang(slot);
    this.held = {
      kind,
      id: p.id,
      x: at.x,
      y: at.y,
      sx: p.x,
      sy: p.y,
      t0: this.time,
      slot,
      from: null,
      moved: false,
      trailAt: 0,
    };
    this.env.sound.fx('tap', { pitch: slot, pan: this.pan(p.x), gain: 0.6 });
  }

  /** A touch on an ornament that hangs makes it swing and ring, and a drag takes it with the finger. */
  private touch(h: Hung, p: Pointer): void {
    const side = p.x < this.bodyOf(h).x ? 1 : -1;
    this.ring(h, side, 1);
    if (h.glow < 0.5) this.earn(SWING_POINTS);
    this.grab = { hung: h, id: p.id, sx: p.x, sy: p.y };
  }

  private liftOff(g: Grab, p: Pointer): void {
    const h = g.hung;
    if (h.lifted || !h.landed) return;
    h.lifted = true;
    this.held = {
      kind: h.kind,
      id: p.id,
      x: p.x,
      y: Math.max(6, p.y - HELD_LIFT),
      sx: p.x,
      sy: p.y,
      t0: this.time,
      slot: null,
      from: h,
      moved: true,
      trailAt: 0,
    };
    this.grab = null;
  }

  /** A touch on the tree hangs the next ornament on the free hook nearest to it. */
  private hangWhere(x: number, y: number): void {
    const hook = nearestFree(this.plan.hooks, this.taken(), x, y, Infinity);
    const kind = this.bag.next();
    if (hook === null) {
      this.twinkleAt(x, y);
      return;
    }
    this.hang(kind, hook, this.trayHang(ORNAMENTS.indexOf(kind)));
  }

  private twinkleAt(x: number, y: number): void {
    const rng = this.env.rng;
    this.sparks(x, y, rng.pick(BULBS), 5, 0.8);
    this.env.sound.note('glass', noteAt(1 - y / this.view.h, 72, 9), { gain: 0.5, pan: this.pan(x) });
  }

  // ---- the tree ----

  /** The hooks that have an ornament on them, or on the way. A lifted one has let go of its. */
  private taken(): Set<number> {
    const taken = new Set<number>();
    for (const h of this.hung) if (!h.lifted) taken.add(h.hook);
    return taken;
  }

  /**
   * A hook for an ornament that is put on without being aimed: the best of a few free ones, which is
   * the one farthest from the rest, so the tree fills out and does not bunch.
   */
  private spreadHook(taken: ReadonlySet<number>): number | null {
    const free = this.plan.hooks.map((_, i) => i).filter((i) => !taken.has(i));
    if (free.length === 0) return null;
    const rng = this.env.rng;
    let best = free[0]!;
    let bestGap = -1;
    for (let k = 0; k < 4; k++) {
      const i = free[rng.int(free.length)]!;
      const at = this.plan.hooks[i]!;
      let gap = Infinity;
      for (const t of taken) {
        const o = this.plan.hooks[t]!;
        gap = Math.min(gap, Math.hypot(o.x - at.x, o.y - at.y));
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    return best;
  }

  private onTree(x: number, y: number): boolean {
    const { tree } = this.plan;
    const ty = (y - tree.top) / tree.scale;
    if (ty < -4 || ty > TREE_HEIGHT) return false;
    return Math.abs(x - tree.x) <= (halfWidthAt(ty) + 12) * tree.scale;
  }

  private hungAt(x: number, y: number): Hung | null {
    for (let i = this.hung.length - 1; i >= 0; i--) {
      const h = this.hung[i]!;
      if (!h.landed || h.lifted) continue;
      const at = this.bodyOf(h);
      const s = this.plan.sizes[h.hook]!;
      if (Math.hypot(at.x - x, at.y - y) <= 17 * s + 10) return h;
    }
    return null;
  }

  /** The hanging point of an ornament: the hook it is on, or where it is on its way there. */
  private hangOf(h: Hung): Spot {
    const to = this.plan.hooks[h.hook]!;
    if (h.landed) return to;
    const t = clamp((this.time - h.born) / h.dur);
    const e = easeOutCubic(t);
    return { x: lerp(h.from.x, to.x, e), y: lerp(h.from.y, to.y, e) - hump(t) * 22 };
  }

  /** The middle of the ball, or the bell, or the star of an ornament. */
  private bodyOf(h: Hung): Spot {
    const at = this.hangOf(h);
    const s = this.sizeOf(h);
    const a = h.swing.x;
    return { x: at.x - Math.sin(a) * BODY * s, y: at.y + Math.cos(a) * BODY * s };
  }

  private sizeOf(h: Hung): number {
    const size = this.plan.sizes[h.hook]!;
    if (h.landed) return size;
    return lerp(TRAY_SCALE, size, easeOutCubic(clamp((this.time - h.born) / h.dur)));
  }

  private trayHang(slot: number): Spot {
    const at = this.plan.tray[slot]!;
    return { x: at.x, y: at.y - 30 * TRAY_SCALE };
  }

  /** Hangs an ornament on a hook. It flies there from where it was let go. */
  private hang(kind: Ornament, hook: number, from: Spot): void {
    const to = this.plan.hooks[hook]!;
    const far = Math.hypot(to.x - from.x, to.y - from.y);
    this.hung.push({
      hook,
      kind,
      from,
      born: this.time,
      dur: clamp(0.22 + far / 900, 0.26, 0.5),
      landed: false,
      counted: false,
      lifted: false,
      swing: new Spring(0, 0, 38, 2.2),
      glow: 0,
      glint: 0,
    });
    this.env.sound.fx('whoosh', { pan: this.pan(to.x), gain: 0.3, pitch: 4 });
  }

  /** An ornament that was lifted off hangs again, on this hook, and is not counted twice. */
  private rehang(h: Hung, hook: number, from: Spot): void {
    const to = this.plan.hooks[hook]!;
    h.hook = hook;
    h.from = from;
    h.born = this.time;
    h.dur = clamp(0.2 + Math.hypot(to.x - from.x, to.y - from.y) / 900, 0.24, 0.45);
    h.landed = false;
    h.lifted = false;
  }

  private land(h: Hung): void {
    h.landed = true;
    h.glow = 1;
    h.swing.kick(this.env.rng.next() < 0.5 ? -2.6 : 2.6);
    const at = this.bodyOf(h);
    this.sparks(at.x, at.y, TINT[h.kind], 8, 1);
    this.chime(h, 1);
    if (h.counted) return;
    h.counted = true;
    const fresh = !this.seen.has(h.kind);
    this.seen.add(h.kind);
    this.earn(1 + (fresh ? FRESH_KIND : 0));
  }

  /** Rings an ornament: it swings from the side of the touch, glows and sounds its note. */
  private ring(h: Hung, side: number, strength: number): void {
    h.swing.kick(side * 3.4 * strength);
    h.glow = 1;
    h.glint = 1;
    this.chime(h, 0.9 * Math.min(1, 0.4 + strength));
    const at = this.bodyOf(h);
    this.sparks(at.x, at.y, TINT[h.kind], 4, 0.7);
  }

  /** The note an ornament rings is higher the higher it hangs. */
  private chime(h: Hung, gain: number): void {
    const { tree, hooks } = this.plan;
    const hook = hooks[h.hook]!;
    const height = 1 - (hook.y - tree.top) / (TREE_HEIGHT * tree.scale);
    const midi = noteAt(height, 64, 11);
    const pan = clamp((hook.x - tree.x) / (this.view.w * 0.3), -0.7, 0.7);
    this.env.sound.note(VOICE[h.kind], midi, { gain: 0.8 * gain, pan });
    if (h.kind === 'bell') this.env.sound.note('bell', midi + 7, { gain: 0.5 * gain, pan, delay: 0.1 });
  }

  /** Whatever is in a finger is let go: an ornament lifted off the tree goes back on its hook. */
  private letGo(): void {
    const h = this.held;
    this.held = null;
    this.grab = null;
    if (h?.from) this.rehang(h.from, h.from.hook, { x: h.x, y: h.y });
  }

  /** An ornament that is not near a place to hang goes gently back to the tray. */
  private sendHome(kind: Ornament, from: Spot, slot: number): void {
    this.homing.push({ kind, from, to: this.trayHang(slot), t: 0 });
    this.env.sound.fx('whoosh', { gain: 0.25, pitch: -3 });
  }

  /** Nothing is left to hang on, so the ornament only hops in its place and the tree glitters. */
  private hop(slot: number): void {
    const at = this.plan.tray[slot]!;
    this.sparks(at.x, at.y - 10, TINT[ORNAMENTS[slot]!], 6, 0.8);
    this.env.sound.fx('twinkle', { pan: this.pan(at.x), step: slot });
    const own = this.hung.filter((h) => h.landed && !h.lifted);
    if (own.length > 0) this.ring(own[this.env.rng.int(own.length)]!, this.env.rng.next() < 0.5 ? -1 : 1, 0.8);
  }

  // ---- time ----

  protected tick(dt: number): void {
    this.snow(dt);
    for (const h of this.hung) {
      if (!h.landed && !h.lifted && this.time - h.born >= h.dur) this.land(h);
      h.swing.step(dt);
      h.glow = damp(h.glow, 0, 2.4, dt);
      h.glint = Math.max(0, h.glint - dt * 1.3);
    }
    for (const h of this.homing) h.t += dt / 0.36;
    this.homing = this.homing.filter((h) => h.t < 1);
    this.lights(dt);
    this.glints(dt);
    const target = this.phase === 'play' ? (this.meter.stars / 5) * 0.7 : 1;
    this.topper = damp(this.topper, target, 2.2, dt);
  }

  /** The lights come on one after another until there are as many as the player has earned. */
  private lights(dt: number): void {
    const want = this.phase === 'play' ? this.meter.stars * PER_STAR : LIGHTS.length;
    if (this.lit >= want) return;
    this.lightIn -= dt;
    if (this.lightIn > 0) return;
    this.lightIn = this.phase === 'play' ? LIGHT_EVERY : LIGHT_EVERY_FINALE;
    // A string is lit from the bottom up so that the top is the last to glow, ahead of the star.
    const i = LIGHTS.length - 1 - this.lit;
    this.lit++;
    this.litAt[i] = this.time;
    const at = this.plan.lights[i]!;
    this.sparks(at.x, at.y, BULBS[i % BULBS.length]!, 3, 0.5);
    this.env.sound.note('glass', noteAt(this.lit / LIGHTS.length, 72, 10), { gain: 0.35, pan: this.pan(at.x) });
  }

  private glints(dt: number): void {
    this.glintIn -= dt;
    if (this.glintIn > 0) return;
    this.glintIn = this.env.rng.range(0.6, 1.5);
    const own = this.hung.filter((h) => h.landed && !h.lifted);
    if (own.length > 0) own[this.env.rng.int(own.length)]!.glint = 1;
  }

  private snow(dt: number): void {
    this.snowIn -= dt;
    if (this.snowIn > 0) return;
    const rng = this.env.rng;
    this.snowIn = this.env.calm ? 0.4 : 0.18;
    const vy = rng.range(15, 30);
    this.fx.emit({
      x: rng.range(-10, this.view.w + 10),
      y: -8,
      vx: rng.range(-5, 5),
      vy,
      sway: 16,
      life: (this.view.h + 20) / vy,
      size: rng.range(3, 6),
      color: COLORS.white,
      alpha: 0.85,
      shape: 'flake',
      spin: rng.range(-1, 1),
    });
  }

  // ---- the finale ----

  protected finale(): void {
    const s = this.script;
    const { sound } = this.env;
    this.letGo();
    this.flash(0.3, [255, 236, 170]);
    sound.fx('swell', { size: 0.8 });
    // The star on top lights, and the whole tree with it.
    s.at(1.6, () => {
      this.flash(0.35, [255, 240, 190]);
      this.crown();
      sound.fx('star', { step: 4 });
      sound.note('bell', 88, { gain: 0.8 });
    });
    // Every ornament rings in turn, from the bottom of the tree to the top, so it plays a tune.
    const byHeight = this.hung
      .filter((h) => h.landed && !h.lifted)
      .sort((a, b) => this.plan.hooks[b.hook]!.y - this.plan.hooks[a.hook]!.y);
    s.spread(2.2, 4.4, byHeight.length, (i) => this.ring(byHeight[i]!, i % 2 === 0 ? 1 : -1, 0.7));
    // Then the presents come up under it, and the snow falls thicker.
    const n = this.plan.gifts.length;
    s.spread(3.4, 5.2, n, (i) => this.giftUp(i));
    s.at(4.6, () => {
      this.flurry();
      sound.fx('cheer', {});
    });
    s.at(7.2, () => this.endFinale());
  }

  private crown(): void {
    const { star } = this.plan;
    this.fx.emit({
      x: star.x,
      y: star.y,
      life: 0.9,
      size: 20,
      size1: this.plan.starSize * 4,
      color: [255, 236, 170],
      shape: 'glow',
      alpha: 0.7,
    });
    this.fx.emit({
      x: star.x,
      y: star.y,
      life: 0.9,
      size: 12,
      size1: this.plan.starSize * 5,
      color: [255, 246, 210],
      shape: 'ring',
      width: 2.4,
      alpha: 0.7,
    });
    this.sparks(star.x, star.y, [255, 240, 170], 22, 1.6);
  }

  private giftUp(i: number): void {
    const at = this.plan.gifts[i]!;
    this.giftAt.set(i, this.time);
    this.sparks(at.x, at.y - 18, GIFTS[i % GIFTS.length]!.ribbon, 9, 1.1);
    this.env.sound.fx('coin', { step: i, pan: this.pan(at.x) });
  }

  private flurry(): void {
    const rng = this.env.rng;
    for (let i = 0; i < this.fx.count(70); i++) {
      const vy = rng.range(30, 70);
      this.fx.emit({
        x: rng.range(0, this.view.w),
        y: -rng.range(0, 90),
        vx: rng.range(-12, 12),
        vy,
        sway: 22,
        life: (this.view.h + 100) / vy,
        size: rng.range(3, 7),
        color: COLORS.white,
        alpha: 0.9,
        shape: 'flake',
        spin: rng.range(-2, 2),
      });
    }
  }

  // ---- particles ----

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

  private trailOf(h: Held): void {
    const rng = this.env.rng;
    this.fx.emit({
      x: h.x + rng.range(-5, 5),
      y: h.y + BODY * HELD_SCALE + rng.range(-4, 8),
      vx: rng.range(-12, 12),
      vy: rng.range(-6, 16),
      life: rng.range(0.5, 0.9),
      size: rng.range(5, 8),
      size1: 1,
      color: lighten(TINT[h.kind], 0.4),
      color1: TINT[h.kind],
      shape: 'spark',
      gravity: 30,
      drag: 1.4,
      twinkle: 9,
    });
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  // ---- painting ----

  /**
   * The pictures, at the sharpness of the screen they are drawn on. They are made when first needed
   * and again if the screen is laid out anew or sharper, which is rare.
   */
  private artFor(p: Painter): Art {
    const pixels = clamp(Math.round(p.k * 10) / 10, 1, 4);
    if (this.art && this.art.pixels === pixels) return this.art;
    const { plan } = this;
    const made = {} as Record<Ornament, HTMLCanvasElement>;
    for (const kind of ORNAMENTS) made[kind] = makeOrnament(kind, pixels);
    this.art = {
      pixels,
      scene: makeScene(p.w, p.h, plan, new Rng(5), Math.min(2, pixels)),
      tree: makeTree(plan.tree.scale, pixels),
      ornaments: made,
      gifts: GIFTS.map((c) => makeGift(c.body, c.ribbon, pixels)),
      star: [makeTopStar(false, pixels), makeTopStar(true, pixels)],
    };
    return this.art;
  }

  protected paintBack(p: Painter): void {
    const art = this.artFor(p);
    const g = p.ctx;
    const { tree, star, starSize } = this.plan;
    g.drawImage(art.scene, 0, 0, p.w, p.h);
    this.sky.draw(g, this.time, this.env.calm, 0.9);
    const warm = this.lit / LIGHTS.length;
    const box = treeBox(tree.scale);
    glowAt(
      p.light,
      tree.x,
      tree.top + (TREE_HEIGHT * tree.scale) / 2,
      TREE_HEIGHT * tree.scale * 2.4,
      [255, 196, 120],
      0.08 + 0.2 * warm,
    );
    g.fillStyle = 'rgba(28, 34, 92, 0.3)';
    g.beginPath();
    g.ellipse(tree.x, tree.foot - tree.scale, 54 * tree.scale, 5 * tree.scale, 0, 0, TAU);
    g.fill();
    g.drawImage(art.tree, tree.x - TREE_PAD.x * tree.scale, tree.top - TREE_PAD.y * tree.scale, box.w, box.h);
    this.paintBulbs(p);
    // The star on top, which gains its light as the stars are earned, and has all of it at the end.
    const sz = starSize;
    g.drawImage(art.star[0], star.x - sz / 2, star.y - sz / 2, sz, sz);
    if (this.topper > 0.02) {
      g.globalAlpha = clamp(this.topper);
      g.drawImage(art.star[1], star.x - sz / 2, star.y - sz / 2, sz, sz);
      g.globalAlpha = 1;
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 2.4);
      glowAt(p.light, star.x, star.y, sz * 3, [255, 214, 130], 0.3 * this.topper * pulse);
      glowAt(p.light, star.x, star.y, sz * 1.5, [255, 236, 170], 0.3 * this.topper * pulse);
      if (this.topper > 0.55)
        glowAt(p.light, star.x, star.y, sz * 2.6, [255, 240, 190], (this.topper - 0.55) * 0.9, 'spark');
    }
    this.paintGifts(p, art);
    this.paintTray(p);
  }

  private paintBulbs(p: Painter): void {
    const g = p.ctx;
    const s = this.plan.tree.scale;
    const r = Math.max(2.6, 1.9 * s);
    LIGHTS.forEach((_, i) => {
      const at = this.plan.lights[i]!;
      const color = BULBS[i % BULBS.length]!;
      const born = this.litAt[i] ?? null;
      const on = born !== null;
      const since = on ? this.time - born : 0;
      g.fillStyle = css(on ? color : darken(color, 0.55), on ? 1 : 0.8);
      g.beginPath();
      g.arc(at.x, at.y, r, 0, TAU);
      g.fill();
      if (!on) return;
      g.fillStyle = css(lighten(color, 0.7), 0.9);
      g.beginPath();
      g.arc(at.x - r * 0.25, at.y - r * 0.25, r * 0.45, 0, TAU);
      g.fill();
      const glow = 0.62 + 0.3 * Math.sin(this.time * 3.1 + i * 1.7) + Math.max(0, 1 - since) * 0.8;
      glowAt(p.light, at.x, at.y, r * (since < 0.6 ? 9 : 6.5), color, glow * 0.6);
    });
  }

  private paintGifts(p: Painter, art: Art): void {
    const g = p.ctx;
    const k = this.plan.giftScale;
    this.plan.gifts.forEach((at, i) => {
      const born = this.giftAt.get(i);
      if (born === undefined) return;
      const t = clamp((this.time - born) / 0.55);
      const e = easeOutBack(t, 2.2);
      const s = k * e;
      const pic = art.gifts[i % art.gifts.length]!;
      g.save();
      g.translate(at.x, at.y);
      g.scale(s, s);
      g.drawImage(pic, -GIFT.w / 2, -GIFT.base, GIFT.w, GIFT.h);
      g.restore();
    });
  }

  private paintTray(p: Painter): void {
    const g = p.ctx;
    const { shelf } = this.plan;
    g.fillStyle = 'rgba(20, 26, 78, 0.55)';
    g.strokeStyle = 'rgba(206, 220, 255, 0.28)';
    g.lineWidth = 1.5;
    roundedRect(g, shelf.x, shelf.y, shelf.w, shelf.h, 24);
    g.fill();
    g.stroke();
  }

  protected paintFront(p: Painter): void {
    const art = this.artFor(p);
    const g = p.ctx;
    const { tray } = this.plan;
    // The tray: each place shows its ornament, a little dimmer while a copy of it is in a finger.
    tray.forEach((at, i) => {
      const kind = ORNAMENTS[i]!;
      const away = this.held?.slot === i && this.held.moved;
      g.globalAlpha = away ? 0.4 : 1;
      const bob = Math.sin(this.time * 1.8 + i * 1.1) * 1.4;
      this.drawOrnament(g, art, kind, at.x, at.y - 30 * TRAY_SCALE + bob, TRAY_SCALE, 0);
    });
    g.globalAlpha = 1;
    const held = this.held;
    if (held?.moved) this.paintTarget(p, held);
    for (const h of this.hung) {
      if (h.lifted) continue;
      const at = this.hangOf(h);
      this.drawOrnament(g, art, h.kind, at.x, at.y, this.sizeOf(h), h.swing.x);
    }
    for (const h of this.homing) {
      const e = easeOutCubic(h.t);
      this.drawOrnament(
        g,
        art,
        h.kind,
        lerp(h.from.x, h.to.x, e),
        lerp(h.from.y, h.to.y, e),
        lerp(HELD_SCALE, TRAY_SCALE, e),
        0,
      );
    }
    if (held) {
      const sway = held.moved ? Math.sin(this.time * 7) * 0.05 : 0;
      this.drawOrnament(g, art, held.kind, held.x, held.y, held.moved ? HELD_SCALE : TRAY_SCALE, sway);
    }
    this.paintGlints(g);
  }

  /** Shows which hook an ornament that is in a finger would hang on, if it were let go. */
  private paintTarget(p: Painter, held: Held): void {
    const hook = nearestFree(this.plan.hooks, this.taken(), held.x, held.y, this.plan.reach);
    if (hook === null) return;
    const at = this.plan.hooks[hook]!;
    const g = p.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 7);
    g.strokeStyle = css([255, 244, 200], 0.55 + 0.35 * pulse);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(at.x, at.y + 2, (7 + pulse * 2) * this.plan.sizes[hook]! + 3, 0, TAU);
    g.stroke();
  }

  private paintGlints(g: CanvasRenderingContext2D): void {
    g.globalCompositeOperation = 'lighter';
    for (const h of this.hung) {
      if (!h.landed || h.lifted || h.glint <= 0.02) continue;
      const at = this.bodyOf(h);
      const s = this.plan.sizes[h.hook]!;
      glowAt(g, at.x - 6 * s, at.y - 7 * s, 22 * s, COLORS.white, h.glint, 'spark');
    }
    g.globalCompositeOperation = 'source-over';
  }

  private drawOrnament(
    g: CanvasRenderingContext2D,
    art: Art,
    kind: Ornament,
    x: number,
    y: number,
    scale: number,
    angle: number,
  ): void {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.scale(scale, scale);
    g.drawImage(art.ornaments[kind], -HANG.x, -HANG.y, ORNAMENT_W, ORNAMENT_H);
    g.restore();
  }
}
