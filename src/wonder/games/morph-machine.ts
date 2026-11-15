import type { UnicornId } from '../../shared/ids';
import { drawPic } from '../engine/bank';
import { Cast, MAX_HERD } from '../engine/cast';
import { COLORS, lighten, mix, type RGB } from '../engine/color';
import { clamp, damp, easeOutBack, easeOutQuad, lerp, Spring, TAU } from '../engine/ease';
import { gemImage } from '../engine/gems';
import { Meter } from '../engine/meter';
import { Novelty, scaledCosts } from '../engine/novelty';
import { glowAt } from '../engine/paint';
import type { Painter, View } from '../engine/painter';
import type { Pointer, Quality } from '../engine/stage';
import { scaleNote } from '../music';
import { WORKSHOP } from '../styles';
import { Wonder, type WonderEnv } from '../wonder';
import { PARTY_COLORS, ringAt } from './balloons/pops';
import { BLOOM_H, BLOOM_W, bloomImage } from './morph/bloom-art';
import { type Coat, HATCHLING_HEIGHT, paintHatchling } from './morph/critter-art';
import { flare, fruitTrail, rainbowRing, showerOf, steam } from './morph/effects';
import { Hatchling, newShape, type Shape } from './morph/hatchling';
import {
  cellAt,
  onMachine,
  PARTS,
  type Plan,
  planOf,
  SHELF_CELLS,
  type Spot,
  type Stand,
  standsOf,
} from './morph/layout';
import { MachineArt, type MachineState } from './morph/machine-art';
import {
  CREATURES,
  type Creature,
  FRIEND_FRUIT,
  FRUIT_IDS,
  FRUITS,
  type Fruit,
  type FruitId,
  fruitAt,
  LAMPS,
  PAINTS,
  type Product,
  productOf,
} from './morph/recipes';
import { SceneArt } from './morph/scene-art';
import { Shelf, type Shelved } from './morph/shelf';
import { type Happened, newHappened, type Pod, Works, within } from './morph/works';
import { sharp } from './party/world-art';

/**
 * The magic changing machine. A cart of seven fruit stands at one side, and the player feeds them
 * to the machine: each is thrown into the funnel, drops into the glass, is turned, and comes out of
 * the chute as a cut stone (the apple machine) or a flower (the berry machine) of its own colour,
 * and stands on the shelf. Each fruit sings its own note, so the seven in order are a scale. Now
 * and then the machine hiccups and makes a little creature that flies about the workshop from then
 * on. The lever sends every fruit in at once, the whistle plays the whole shelf as a tune, and a
 * friend who is touched throws in a fruit of her own colour. When the gauge is full the machine
 * cannot hold any more: it fills with every colour, and bursts, and a hatchling comes out.
 */

/**
 * What each star costs, for a herd of six. A smaller herd has less to bring, so each star is a
 * little nearer.
 */
const MORPH_STAR_COSTS = [14, 44, 96, 170, 260] as const;

/** The root of the machine's notes, middle C. Every note is of its major pentatonic scale. */
const ROOT = 60;

type Thing = 'feed' | 'friend' | 'lever' | 'whistle' | 'shelf' | 'creature' | 'dome' | 'hatchling';

/** What each thing is worth the first time, in points. */
const WORTH: Readonly<Record<Thing, number>> = {
  feed: 3,
  friend: 3.6,
  lever: 4.5,
  whistle: 2.2,
  shelf: 0.7,
  creature: 1.1,
  dome: 0.3,
  hatchling: 0,
};
/** What a creature that comes out by surprise is worth to the stars. */
const SURPRISE_WORTH = 3;

/** The most creatures that fly about the workshop. The oldest goes when another comes. */
const MOST_CREATURES = 8;
/** Seconds before a fruit that was thrown in is back on the cart. */
const REGROW = 1.3;
/**
 * How long a friend is casting after she is touched, and how far into it the fruit leaves her horn.
 */
const CAST_SECONDS = 0.8;
const CAST_RELEASE = 0.26;
/** The most the machine's energy can add to the music. */
const MUSIC_FROM_WORK = 0.22;

interface Slot {
  /** Whether the fruit is on the cart. */
  here: boolean;
  /** The game time it last came back, for its pop. */
  back: number;
  /** The game time it comes back at, if it is away. */
  returnAt: number;
  /** A hop of its own when it is touched while the machine is full. */
  hop: number;
}

/** A creature that flies about the workshop: where it flies, how fast, and how it is flying now. */
interface Resident {
  readonly id: number;
  readonly creature: Creature;
  x: number;
  y: number;
  vx: number;
  /** Seconds since it was touched, for its loop. Large if it has not been. */
  since: number;
  readonly phase: number;
  readonly speed: number;
  readonly home: { readonly u: number; readonly v: number; readonly au: number; readonly av: number };
  /** Seconds since it came out of the machine. */
  age: number;
}

export class MorphMachine extends Wonder {
  readonly id = 'morph-machine' as const;
  protected readonly meter = new Meter(scaledCosts(MORPH_STAR_COSTS, this.env.herd.length));
  private readonly product: Product = productOf(this.env.look);
  private readonly paint = PAINTS[this.product];
  private readonly novelty = new Novelty<Thing>(WORTH);
  private readonly works = new Works(this.env.rng);
  private readonly shelf = new Shelf(SHELF_CELLS);
  private readonly hatchling = new Hatchling();
  private readonly cast = new Cast();
  private readonly scene: SceneArt;
  private readonly machineArt: MachineArt;
  private readonly happened: Happened = newHappened();
  private readonly shape: Shape = newShape();
  private plan!: Plan;
  private stands: Stand[] = [];
  private cells: { x: number; y: number }[] = [];
  private slots: Slot[] = FRUIT_IDS.map(() => ({ here: true, back: -9, returnAt: 0, hop: -9 }));
  private residents: Resident[] = [];
  private nextResident = 0;
  private artFor = 0;
  private artDirty = true;
  /** How the machine moves. */
  private readonly gulp = new Spring(0, 0, 240, 11);
  private gear = 0;
  private needle = 0;
  private lamps: number[] = LAMPS.map(() => 0);
  private lampPulse = 0;
  private steamIn = 0.6;
  private leverAt = -9;
  private whistleAt = -9;
  private beatPulse = 0;
  private fill = 0.08;
  private tint: RGB = this.paint.glass;
  private overload = 0;
  private crowned = false;
  private bursting = 0;
  /** What the player has made, by fruit, for the colour of the hatchling. */
  private readonly made = new Map<FruitId, number>();
  /** How many things the player has done, which the hand uses to show them what else there is. */
  private fedByHand = 0;
  private fedKinds = new Set<FruitId>();
  private pulled = 0;
  private tooted = 0;
  private friendsTouched = 0;
  private shelfTouched = 0;
  private nextByHopper = 0;
  /** Until when the shelf is playing itself, so a second whistle does not pile on. */
  private tuneUntil = 0;

  constructor(env: WonderEnv) {
    super(env);
    this.scene = new SceneArt(env.bank, env.rng);
    this.machineArt = new MachineArt(env.bank);
    const band = this.startMusic(WORKSHOP);
    band.onStep = (step) => {
      if (step % 4 === 0) this.beatPulse = this.works.energy > 0.25 ? 1 : 0;
    };
  }

  override get bloom(): number {
    return this.env.calm ? 0.2 : 0.34;
  }

  override quality(level: Quality): void {
    super.quality(level);
  }

  protected override musicEnergy(): number {
    return Math.min(1, super.musicEnergy() + (this.phase === 'play' ? MUSIC_FROM_WORK * this.works.energy : 0));
  }

  /** What a measuring tool or a stand-in player may look at, and never change. */
  inspect(): {
    readonly product: Product;
    readonly fruit: readonly {
      readonly id: FruitId;
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly here: boolean;
    }[];
    readonly hopper: Spot;
    readonly dome: Spot;
    readonly lever: Spot;
    readonly whistle: Spot;
    readonly chute: Spot;
    readonly friends: readonly { readonly id: UnicornId; readonly x: number; readonly y: number; readonly r: number }[];
    readonly shelf: readonly {
      readonly cell: number;
      readonly x: number;
      readonly y: number;
      readonly fruit: FruitId;
    }[];
    readonly creatures: readonly { readonly x: number; readonly y: number }[];
    readonly hatchling: { readonly here: boolean; readonly x: number; readonly y: number; readonly r: number };
    readonly works: {
      readonly pods: number;
      readonly energy: number;
      readonly fed: number;
      readonly full: boolean;
      readonly brewing: number;
    };
    readonly overload: number;
    readonly size: { readonly w: number; readonly h: number };
  } {
    const plan = this.plan;
    const cells = this.shelf;
    return {
      product: this.product,
      fruit: plan.fruit.map((f, i) => ({ id: FRUIT_IDS[i]!, x: f.x, y: f.y, r: f.r, here: this.slots[i]!.here })),
      hopper: plan.hopper,
      dome: plan.dome,
      lever: plan.lever,
      whistle: plan.whistle,
      chute: plan.chute,
      friends: this.stands.map((s, i) => ({
        id: this.env.herd[i]!,
        x: s.x,
        y: s.y - 34 * s.scale,
        r: this.friendReach(s),
      })),
      shelf: this.cells.flatMap((c, i) => {
        const item = cells.at(i);
        return item ? [{ cell: i, x: c.x, y: c.y, fruit: item.fruit }] : [];
      }),
      creatures: this.residents.map((r) => ({ x: r.x, y: r.y })),
      hatchling: { here: this.hatchling.here, x: this.hatchSpot().x, y: this.hatchSpot().y - 30, r: 40 },
      works: {
        pods: this.works.pods.length,
        energy: this.works.energy,
        fed: this.works.fed,
        full: this.works.full,
        brewing: this.works.brewing,
      },
      overload: this.overload,
      size: { w: plan.w, h: plan.h },
    };
  }

  protected arrange(view: View): void {
    const plan = planOf(view.w, view.h, view.unit);
    this.plan = plan;
    const n = Math.min(MAX_HERD, this.env.herd.length);
    this.stands = standsOf(n, plan);
    this.cells = Array.from({ length: SHELF_CELLS }, (_, i) => cellAt(plan, i));
    this.artDirty = true;
  }

  private ensureArt(k: number): void {
    if (!this.artDirty && this.artFor === k) return;
    this.artDirty = false;
    this.artFor = k;
    this.scene.place(this.plan, this.paint, k);
    this.machineArt.place(this.paint, this.product, sharp(k * this.plan.s));
  }

  protected reset(): void {
    this.works.reset();
    this.shelf.reset();
    this.hatchling.reset();
    this.cast.reset();
    this.novelty.reset();
    this.residents = [];
    this.nextResident = 0;
    this.slots = FRUIT_IDS.map(() => ({ here: true, back: -9, returnAt: 0, hop: -9 }));
    this.gulp.x = 0;
    this.gulp.v = 0;
    this.gear = 0;
    this.needle = 0;
    this.lamps = LAMPS.map(() => 0);
    this.lampPulse = 0;
    this.steamIn = 0.6;
    this.leverAt = -9;
    this.whistleAt = -9;
    this.beatPulse = 0;
    this.fill = 0.08;
    this.tint = this.paint.glass;
    this.overload = 0;
    this.crowned = false;
    this.bursting = 0;
    this.made.clear();
    this.fedByHand = 0;
    this.fedKinds.clear();
    this.pulled = 0;
    this.tooted = 0;
    this.friendsTouched = 0;
    this.shelfTouched = 0;
    this.nextByHopper = 0;
    this.tuneUntil = 0;
    this.itemHop.clear();
  }

  private pan(x: number): number {
    return clamp((x / this.view.w - 0.5) * 1.6, -0.8, 0.8);
  }

  private friendReach(s: Stand): number {
    return Math.max(24, 52 * s.scale);
  }

  /** Where the hatchling's feet are. */
  private hatchSpot(): { x: number; y: number } {
    return { x: this.plan.hatch.x, y: this.plan.hatch.y };
  }

  private hatchScale(): number {
    return clamp(this.plan.s * 1.25, 0.8, 1.3);
  }

  private domeAt(): { x: number; y: number } {
    return { x: this.plan.dome.x, y: this.plan.dome.y };
  }

  /** The tip of a friend's horn, where the fruit she throws begins. */
  private hornOf(i: number): { x: number; y: number } {
    const s = this.stands[i]!;
    const id = this.env.herd[i]!;
    const face = this.facingOf(i);
    const horn = this.env.bank?.unicorn(id, 'cast', 'east', CAST_RELEASE)?.anchors.horn;
    if (horn) return { x: s.x + horn[0] * s.scale * face, y: s.y + horn[1] * s.scale };
    return { x: s.x + 26 * s.scale * face, y: s.y - 96 * s.scale };
  }

  /** Which way a friend faces, toward the machine. */
  private facingOf(i: number): number {
    return this.stands[i]!.x < this.plan.machine.x ? 1 : -1;
  }

  /**
   * The fruit the player has made the most of, for the hatchling's colour, and the three most for
   * its crown.
   */
  private coat(): Coat {
    const counts = FRUIT_IDS.map((id) => ({ id, n: this.made.get(id) ?? 0 }));
    const ranked = [...counts].sort((a, b) => b.n - a.n || FRUIT_IDS.indexOf(a.id) - FRUIT_IDS.indexOf(b.id));
    const top = ranked[0]!.n > 0 ? ranked[0]!.id : 'pumpkin';
    const crown = ranked.map((c) => c.id).slice(0, 3);
    return { color: FRUITS[top].color, product: this.product, crown };
  }

  protected tick(dt: number): void {
    const works = this.works;
    const t = this.time;
    works.step(dt, this.happened);
    for (const pod of this.happened.dropped) this.dropIn(pod);
    for (const pod of this.happened.finished) this.finish(pod);
    for (const pod of this.happened.landed) this.land(pod);
    // A fruit that went in comes back to the cart.
    this.slots.forEach((s, i) => {
      if (!s.here && t >= s.returnAt) {
        s.here = true;
        s.back = t;
        const spot = this.plan.fruit[i]!;
        this.env.sound.note('glass', scaleNote(ROOT + 24, FRUITS[FRUIT_IDS[i]!]!.step), {
          gain: 0.14,
          pan: this.pan(spot.x),
          seconds: 0.3,
        });
        flare(this.fx, this.env.rng, spot.x, spot.y, FRUITS[FRUIT_IDS[i]!]!.color, 18, 2);
      }
    });
    // The machine's own motion: the gears go faster the busier it is, and the needle follows the
    // stars.
    const finale = this.phase === 'finale';
    this.overload = damp(this.overload, finale && this.bursting === 0 ? 1 : 0, finale ? 0.9 : 3, dt);
    const busy = clamp(works.energy + this.overload);
    this.gear += dt * (0.45 + 4.8 * busy + 2.2 * (works.brewing > 0 ? 1 : 0));
    const want = this.meter.full ? 1 : (this.meter.stars + this.meter.fraction) / 5;
    this.needle = damp(this.needle, clamp(want + (busy > 0.6 ? 0.012 * Math.sin(t * 40) : 0)), 3.2, dt);
    this.gulp.step(dt);
    this.beatPulse = damp(this.beatPulse, 0, 8, dt);
    this.lampPulse = damp(this.lampPulse, 0, 2.4, dt);
    const speed = 0.55 + 2.2 * busy;
    for (let i = 0; i < this.lamps.length; i++) {
      const chase = Math.max(0, Math.cos(TAU * (t * speed - i / this.lamps.length))) ** 2;
      this.lamps[i] = clamp(
        0.22 + 0.2 * Math.sin(t * 1.6 + i) * (1 - busy) + (0.15 + 0.7 * busy) * chase + this.lampPulse * 0.5,
      );
    }
    // What is in the glass.
    this.updateGlass(dt);
    // Steam from the chimney, more of it the busier the machine is.
    this.steamIn -= dt;
    if (this.steamIn <= 0) {
      const top = onMachine(this.plan, PARTS.chimney.x, PARTS.chimney.y1 - 12);
      steam(this.fx, this.env.rng, top.x, top.y, 0.5 + busy);
      this.steamIn = lerp(1.2, 0.28, busy);
    }
    // A glitter behind each fruit as it flies.
    for (const pod of works.pods) {
      if (pod.phase !== 'fly') continue;
      const at = this.podAt(pod);
      if (at) fruitTrail(this.fx, this.env.rng, at.x, at.y, FRUITS[pod.fruit].color, this.friendPod(pod) ? 1 : 0.6);
    }
    // The friends, the creatures and the hatchling.
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
          clock: cheering ? since : t + i * 0.7,
        },
        dt,
      );
    });
    this.cast.tick(dt);
    for (const r of this.residents) this.flyAbout(r, dt);
    this.hatchling.tick(dt);
    // A flower or a stone on the shelf glints now and again.
    if (Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4) && this.shelf.count > 0) this.glint();
  }

  private friendPod(pod: Pod): boolean {
    return pod.by >= 0;
  }

  /**
   * What colour the glass is, and how full: the mean of the fruit that are in it, and as much as
   * there are of them.
   */
  private updateGlass(dt: number): void {
    const inside = this.works.pods.filter((p) => p.phase === 'brew');
    let target = 0.08 + 0.05 * this.works.energy;
    let color: RGB = this.paint.glass;
    if (inside.length > 0) {
      target = clamp(0.3 + 0.2 * inside.length + 0.2 * this.works.energy);
      let r = 0;
      let g = 0;
      let b = 0;
      for (const p of inside) {
        const c = FRUITS[p.fruit].color;
        r += c[0];
        g += c[1];
        b += c[2];
      }
      color = [r / inside.length, g / inside.length, b / inside.length];
    }
    if (this.overload > 0.05) {
      target = Math.max(target, 0.55 + 0.45 * this.overload);
      const hue = FRUITS[FRUIT_IDS[Math.floor(this.time * 3) % FRUIT_IDS.length]!]!.color;
      color = mix(color, hue, this.overload);
    }
    this.fill = damp(this.fill, target, 4, dt);
    this.tint = [
      damp(this.tint[0], color[0], 6, dt),
      damp(this.tint[1], color[1], 6, dt),
      damp(this.tint[2], color[2], 6, dt),
    ];
  }

  private glint(): void {
    const filled: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.shelf.at(i)) filled.push(i);
    const cell = filled[Math.floor(this.time * 1.4) % filled.length]!;
    const c = this.cells[cell]!;
    const item = this.shelf.at(cell)!;
    this.fx.emit({
      x: c.x + this.env.rng.range(-8, 8),
      y: c.y + this.env.rng.range(-10, 4),
      life: 0.6,
      size: 11,
      size1: 2,
      color: lighten(FRUITS[item.fruit].color, 0.6),
      shape: 'star4',
      twinkle: 10,
      hold: 0.3,
    });
  }

  /**
   * A creature that has come out of the machine goes about the workshop in a loop of its own, and
   * after a touch goes round in a circle.
   */
  private flyAbout(r: Resident, dt: number): void {
    r.age += dt;
    r.since += dt;
    const sky = this.plan.sky;
    const t = this.time;
    const cx = lerp(sky.x0, sky.x1, r.home.u);
    const cy = lerp(sky.y0, sky.y1, r.home.v);
    const ax = r.home.au * (sky.x1 - sky.x0);
    const ay = r.home.av * (sky.y1 - sky.y0);
    let tx = cx + ax * Math.sin(r.speed * t + r.phase);
    let ty = cy + ay * Math.sin(r.speed * 1.7 * t + r.phase * 1.3);
    // After a touch it flies a loop, once round, over a second.
    if (r.since < 1) {
      const a = r.since * TAU;
      tx += Math.sin(a) * 34;
      ty += (Math.cos(a) - 1) * 34;
    }
    const nx = damp(r.x, tx, r.age < 1.2 ? 3 : 7, dt);
    const ny = damp(r.y, ty, r.age < 1.2 ? 3 : 7, dt);
    r.vx = damp(r.vx, (nx - r.x) / Math.max(dt, 1e-3), 6, dt);
    r.x = nx;
    r.y = ny;
  }

  /** A fruit goes into the glass: the machine gulps, the gears bite, and a puff goes up. */
  private dropIn(pod: Pod): void {
    const dome = this.domeAt();
    const fruit = FRUITS[pod.fruit];
    const pan = this.pan(dome.x);
    this.gulp.kick(-3.2);
    this.lampPulse = 1;
    this.env.sound.fx('gear', { gain: 0.34, pan });
    flare(this.fx, this.env.rng, dome.x, dome.y, fruit.color, this.plan.dome.r * 0.9, 4);
    const top = onMachine(this.plan, PARTS.chimney.x, PARTS.chimney.y1 - 12);
    steam(this.fx, this.env.rng, top.x, top.y, 1);
  }

  /**
   * The change is done. A stone or a flower comes out of the chute, or the machine hiccups and a
   * creature comes out of the glass.
   */
  private finish(pod: Pod): void {
    const fruit = FRUITS[pod.fruit];
    const sound = this.env.sound;
    this.gulp.kick(2.8);
    this.lampPulse = 1;
    if (pod.surprise) {
      const dome = this.domeAt();
      const pan = this.pan(dome.x);
      sound.fx('poof', { gain: 0.5, pan });
      sound.fx('whoosh', { gain: 0.3, pan, delay: 0.04 });
      [0, 2, 4].forEach((n, i) => {
        sound.note('flute', scaleNote(ROOT + 24, n + fruit.step), {
          gain: 0.34,
          pan,
          delay: 0.05 + i * 0.08,
          seconds: 0.5,
        });
      });
      flare(this.fx, this.env.rng, dome.x, dome.y - 10, COLORS.white, this.plan.dome.r * 1.4, 10);
      this.addCreature();
      if (this.phase === 'play') this.earn(SURPRISE_WORTH);
      return;
    }
    const chute = this.plan.chute;
    const pan = this.pan(chute.x);
    sound.fx('ding', { gain: 0.5, pan, step: fruit.step });
    sound.fx('poof', { gain: 0.3, pan, delay: 0.02 });
    sound.note('glass', scaleNote(ROOT + 24, fruit.step), { gain: 0.46, pan, delay: 0.06, seconds: 0.7 });
    flare(this.fx, this.env.rng, chute.x, chute.y, fruit.color, 22, 6);
    this.shake(0.25);
  }

  /** What was made lands on the shelf, with a ring and a note, and stays. */
  private land(pod: Pod): void {
    if (pod.surprise || pod.cell < 0) return;
    const fruit = FRUITS[pod.fruit];
    const cell = this.cells[pod.cell]!;
    const item: Shelved = { fruit: pod.fruit, born: this.time, seed: pod.id * 7 + 3 };
    const was = this.shelf.land(pod.cell, item);
    this.made.set(pod.fruit, (this.made.get(pod.fruit) ?? 0) + 1);
    const pan = this.pan(cell.x);
    if (was) flare(this.fx, this.env.rng, cell.x, cell.y, FRUITS[was.fruit].light, 16, 3);
    flare(this.fx, this.env.rng, cell.x, cell.y, fruit.color, this.plan.shelf.cell * 0.9, 7);
    this.env.sound.note('bell', scaleNote(ROOT + 12, fruit.step), { gain: 0.42, pan, seconds: 0.8 });
    this.env.sound.fx('twinkle', { gain: 0.3, pan, step: fruit.step });
  }

  private addCreature(): void {
    const list = CREATURES[this.product];
    const creature = list[this.nextResident % list.length]!;
    const id = this.nextResident++;
    const dome = this.domeAt();
    const frac = (n: number): number => n - Math.floor(n);
    const r: Resident = {
      id,
      creature,
      x: dome.x,
      y: dome.y - 8,
      vx: 0,
      since: 9,
      phase: id * 2.1,
      speed: 0.45 + 0.4 * frac(id * 0.618),
      home: {
        u: 0.12 + 0.76 * frac(id * 0.381 + 0.17),
        v: 0.18 + 0.6 * frac(id * 0.618 + 0.31),
        au: 0.1 + 0.08 * frac(id * 0.7),
        av: 0.07 + 0.06 * frac(id * 0.53),
      },
      age: 0,
    };
    this.residents.push(r);
    if (this.residents.length > MOST_CREATURES) {
      const old = this.residents.shift()!;
      flare(this.fx, this.env.rng, old.x, old.y, COLORS.white, 20, 4);
    }
  }

  /**
   * A fruit goes in. `by` is who threw it: -1 for the player's own hand, or the number of the
   * friend. Says whether the machine took it, which it does not when it is full already.
   */
  private feedFruit(fruit: Fruit, from: { x: number; y: number }, by: number): boolean {
    const pod = this.works.feed(fruit.id, from, by, 1, () => this.shelf.reserve());
    if (!pod) return false;
    const pan = this.pan(from.x);
    const sound = this.env.sound;
    sound.fx('whoosh', { gain: 0.2, pan, pitch: 3 + fruit.step });
    sound.note(by >= 0 ? 'harp' : 'pluck', scaleNote(ROOT + 12, fruit.step), { gain: 0.6, pan, seconds: 0.5 });
    flare(this.fx, this.env.rng, from.x, from.y, fruit.color, 20, 4);
    return true;
  }

  /**
   * Throws the fruit of a slot of the cart in, and puts the slot to rest until it grows back. Says
   * whether the machine took it.
   */
  private throwFrom(slot: number, by = -1): boolean {
    const s = this.slots[slot]!;
    if (!s.here) return false;
    const spot = this.plan.fruit[slot]!;
    const fruit = FRUITS[FRUIT_IDS[slot]!]!;
    if (!this.feedFruit(fruit, { x: spot.x, y: spot.y }, by)) {
      s.hop = this.time;
      this.env.sound.fx('tap', { gain: 0.3, pan: this.pan(spot.x), pitch: -5 });
      return false;
    }
    s.here = false;
    s.returnAt = this.time + REGROW + this.env.rng.range(0, 0.4);
    return true;
  }

  protected press(p: Pointer): void {
    const { x, y } = p;
    const plan = this.plan;
    const hit = (s: Spot, extra = 8): boolean => Math.hypot(x - s.x, y - s.y) <= s.r + extra;
    if (
      this.hatchling.here &&
      Math.hypot(x - this.hatchSpot().x, y - (this.hatchSpot().y - 30 * this.hatchScale())) <=
        40 * this.hatchScale() + 8
    ) {
      this.touchHatchling();
      return;
    }
    const playing = this.phase === 'play' || this.phase === 'after';
    if (playing) {
      if (hit(plan.lever, 10)) {
        this.pull();
        return;
      }
      if (hit(plan.whistle, 8)) {
        this.toot();
        return;
      }
      const friend = this.stands.findIndex((s) => Math.hypot(x - s.x, y - (s.y - 34 * s.scale)) <= this.friendReach(s));
      if (friend >= 0) {
        this.touchFriend(friend);
        return;
      }
      const slot = plan.fruit.findIndex((f) => Math.hypot(x - f.x, y - f.y) <= f.r + 4);
      if (slot >= 0) {
        this.touchFruit(slot);
        return;
      }
      if (hit(plan.hopper, 6)) {
        this.touchHopper();
        return;
      }
    }
    const resident = this.residents.findIndex((r) => Math.hypot(x - r.x, y - r.y) <= 30);
    if (resident >= 0) {
      this.touchCreature(this.residents[resident]!);
      return;
    }
    const cell = Shelf.nearest(this.cells, this.shelf, x, y, plan.shelf.cell * 0.62);
    if (cell >= 0) {
      this.touchItem(cell);
      return;
    }
    if (playing && hit(plan.dome, 4)) {
      this.touchDome();
      return;
    }
    this.touchSky(x, y);
  }

  /** A fruit on the cart is touched, and goes into the machine. */
  private touchFruit(slot: number): void {
    const s = this.slots[slot]!;
    const fruit = FRUITS[FRUIT_IDS[slot]!]!;
    if (!s.here) {
      this.touchSky(this.plan.fruit[slot]!.x, this.plan.fruit[slot]!.y);
      return;
    }
    if (!this.throwFrom(slot)) return;
    this.fedByHand++;
    this.fedKinds.add(fruit.id);
    this.earn(this.novelty.worth('feed', fruit.id, this.time));
  }

  /**
   * The funnel is touched, and takes the next fruit of the rainbow without the cart having to give
   * it up.
   */
  private touchHopper(): void {
    const fruit = fruitAt(this.nextByHopper);
    const h = this.plan.hopper;
    if (!this.feedFruit(fruit, { x: h.x + (this.nextByHopper % 2 ? 22 : -22), y: h.y - 36 }, -1)) {
      this.env.sound.fx('tap', { gain: 0.3, pan: this.pan(h.x), pitch: -5 });
      return;
    }
    this.nextByHopper++;
    this.fedByHand++;
    this.fedKinds.add(fruit.id);
    this.earn(this.novelty.worth('feed', fruit.id, this.time));
  }

  /**
   * A friend is touched. She casts, and a fruit of her own colour leaves her horn for the machine.
   */
  private touchFriend(i: number): void {
    const id = this.env.herd[i]!;
    const stand = this.stands[i]!;
    const pan = this.pan(stand.x);
    this.cast.cheer(i);
    this.cast.kick(i, 0.7);
    this.friendsTouched++;
    this.env.sound.fx('star', { gain: 0.4, pan, step: i });
    const fruit = FRUITS[FRIEND_FRUIT[id]];
    this.script.at(this.script.now + CAST_RELEASE, () => {
      const horn = this.hornOf(i);
      if (!this.feedFruit(fruit, horn, i)) return;
      flare(this.fx, this.env.rng, horn.x, horn.y, lighten(fruit.color, 0.3), 26, 8);
    });
    this.earn(this.novelty.worth('friend', id, this.time));
  }

  /** The lever is pulled, and every fruit on the cart goes in, one after another. */
  private pull(): void {
    this.leverAt = this.time;
    this.pulled++;
    const pan = this.pan(this.plan.lever.x);
    this.env.sound.fx('thud', { gain: 0.5, pan, pitch: -3 });
    this.env.sound.fx('gear', { gain: 0.5, pan, delay: 0.05 });
    this.shake(0.7);
    this.lampPulse = 1;
    let k = 0;
    FRUIT_IDS.forEach((_, slot) => {
      if (!this.slots[slot]!.here) return;
      this.script.at(this.script.now + 0.28 + k * 0.17, () => {
        if (!this.throwFrom(slot)) return;
        this.earn(this.novelty.worth('feed', FRUIT_IDS[slot]!, this.time));
      });
      k++;
    });
    this.earn(this.novelty.worth('lever', 'lever', this.time));
  }

  /** The whistle blows, and the shelf plays itself as a tune. */
  private toot(): void {
    this.whistleAt = this.time;
    this.tooted++;
    const w = this.plan.whistle;
    const pan = this.pan(w.x);
    this.env.sound.fx('whistle', { gain: 0.5, pan });
    steam(this.fx, this.env.rng, w.x, w.y - 6, 2.4);
    this.lampPulse = 1;
    this.shake(0.4);
    if (this.time >= this.tuneUntil) this.playShelf(0.1, 0.075);
    this.earn(this.novelty.worth('whistle', 'whistle', this.time) * (0.5 + 0.5 * Math.min(1, this.shelf.count / 8)));
  }

  /** Every thing on the shelf, in order, plays its note and hops. */
  private playShelf(after: number, gap: number): void {
    const order: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.shelf.at(i)) order.push(i);
    order.forEach((cell, n) => {
      this.script.at(this.script.now + after + n * gap, () => this.playItem(cell, 0.5));
    });
    this.tuneUntil = this.time + after + order.length * gap + 0.4;
  }

  /** One thing on the shelf sings its fruit's note, hops, and throws a little light. */
  private playItem(cell: number, gain: number): void {
    const item = this.shelf.at(cell);
    if (!item) return;
    const c = this.cells[cell]!;
    const fruit = FRUITS[item.fruit];
    const pan = this.pan(c.x);
    this.env.sound.note('bell', scaleNote(ROOT + 12, fruit.step), { gain, pan, seconds: 0.7 });
    this.env.sound.note('glass', scaleNote(ROOT + 24, fruit.step), {
      gain: gain * 0.5,
      pan,
      seconds: 0.5,
      delay: 0.02,
    });
    this.itemHop.set(cell, this.time);
    flare(this.fx, this.env.rng, c.x, c.y, fruit.color, 18, 3);
  }

  private readonly itemHop = new Map<number, number>();

  private touchItem(cell: number): void {
    this.shelfTouched++;
    this.playItem(cell, 0.6);
    this.earn(this.novelty.worth('shelf', cell, this.time));
  }

  private touchCreature(r: Resident): void {
    r.since = 0;
    const pan = this.pan(r.x);
    this.env.sound.fx('twinkle', { gain: 0.5, pan, step: r.id });
    [0, 2, 4, 6].forEach((n, i) => {
      this.env.sound.note('flute', scaleNote(ROOT + 24, n + (r.id % 3)), {
        gain: 0.3,
        pan,
        delay: i * 0.07,
        seconds: 0.4,
      });
    });
    flare(this.fx, this.env.rng, r.x, r.y, PARTY_COLORS[r.id % PARTY_COLORS.length]!, 22, 6);
    this.earn(this.novelty.worth('creature', r.id, this.time));
  }

  /** The glass is touched: it sloshes and rings. */
  private touchDome(): void {
    const dome = this.plan.dome;
    this.gulp.kick(-2.4);
    this.lampPulse = 1;
    this.env.sound.fx('boing', { gain: 0.4, pan: this.pan(dome.x), pitch: 3 });
    ringAt(this.fx, this.env.rng, dome.x, dome.y, this.paint.glass, dome.r * 0.9);
    this.earn(this.novelty.worth('dome', 'dome', this.time));
  }

  private touchHatchling(): void {
    const trick = this.hatchling.touch();
    if (!trick) return;
    const spot = this.hatchSpot();
    const s = this.hatchScale();
    const pan = this.pan(spot.x);
    const coat = this.coat();
    this.env.sound.fx(trick === 'hop' ? 'boing' : 'twinkle', { gain: 0.55, pan, step: this.hatchling.done });
    [0, 2, 4, 7].forEach((n, i) => {
      this.env.sound.note('marimba', scaleNote(ROOT + 12, n + (this.hatchling.done % 3)), {
        gain: 0.4,
        pan,
        delay: i * 0.07,
        seconds: 0.4,
      });
    });
    flare(this.fx, this.env.rng, spot.x, spot.y - HATCHLING_HEIGHT * s * 0.6, lighten(coat.color, 0.3), 30, 8);
    if (this.phase === 'play') this.earn(this.novelty.worth('hatchling', 'hatchling', this.time));
  }

  /**
   * A touch on the sky: a ring and a note where it landed. It is not worth anything, and it
   * answers.
   */
  private touchSky(x: number, y: number): void {
    ringAt(this.fx, this.env.rng, x, y, PARTY_COLORS[Math.floor(x / 30) % PARTY_COLORS.length]!, 18);
    this.env.sound.note('glass', scaleNote(ROOT + 12, Math.floor((x / this.view.w) * 9)), {
      gain: 0.32,
      pan: this.pan(x),
      seconds: 0.5,
    });
  }

  protected hint(): { x: number; y: number } | null {
    if (this.phase !== 'play') return null;
    const plan = this.plan;
    const free = plan.fruit.findIndex((_, i) => this.slots[i]!.here && !this.fedKinds.has(FRUIT_IDS[i]!));
    if (this.fedByHand === 0 || (this.fedKinds.size < 4 && free >= 0)) {
      const slot = Math.max(free, 0);
      return { x: plan.fruit[slot]!.x, y: plan.fruit[slot]!.y };
    }
    if (this.pulled === 0) return { x: plan.lever.x, y: plan.lever.y };
    if (this.tooted === 0 && this.shelf.count >= 2) return { x: plan.whistle.x, y: plan.whistle.y };
    if (this.friendsTouched === 0 && this.stands.length > 0) {
      const s = this.stands[this.stands.length > 1 ? 1 : 0]!;
      return { x: s.x, y: s.y - 34 * s.scale };
    }
    if (this.shelfTouched === 0 && this.shelf.count > 0) {
      for (let i = 0; i < this.cells.length; i++) if (this.shelf.at(i)) return this.cells[i]!;
    }
    const open = plan.fruit.findIndex((_, i) => this.slots[i]!.here && !this.fedKinds.has(FRUIT_IDS[i]!));
    const pick = plan.fruit[Math.max(open, 0)]!;
    return { x: pick.x, y: pick.y };
  }

  protected finale(): void {
    const sound = this.env.sound;
    const s0 = this.script.now;
    const plan = this.plan;
    sound.fx('swell', { gain: 0.7 });
    sound.fx('cheer', { gain: 0.5, delay: 0.1 });
    this.lampPulse = 1;
    this.flash(0.16, COLORS.white);
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    // The rest of the fruit goes in, every colour of the rainbow, so the glass fills with all of
    // them.
    FRUIT_IDS.forEach((id, slot) => {
      this.script.at(s0 + 0.2 + slot * 0.24, () => {
        const spot = plan.fruit[slot]!;
        const fruit = FRUITS[id];
        if (this.slots[slot]!.here) {
          this.slots[slot]!.here = false;
          this.slots[slot]!.returnAt = this.time + 1.2;
        }
        this.feedFruit(fruit, { x: spot.x, y: spot.y }, -1);
      });
    });
    // The whistle blows and blows, and the machine shakes harder.
    [2.4, 3.0, 3.5].forEach((at, i) => {
      this.script.at(s0 + at, () => {
        this.whistleAt = this.time;
        const w = plan.whistle;
        sound.fx('whistle', { gain: 0.45, pitch: i * 2 });
        steam(this.fx, this.env.rng, w.x, w.y - 6, 3);
        this.shake(0.8 + i * 0.5);
        this.lampPulse = 1;
      });
    });
    this.script.at(s0 + 3.4, () => sound.fx('rumble', { gain: 0.6 }));
    this.script.at(s0 + 4.2, () => this.burst());
    this.script.at(s0 + 6.4, () => this.playShelf(0, 0.09));
    this.script.at(s0 + 6.2, () => {
      const spot = this.hatchSpot();
      const s = this.hatchScale();
      const pan = this.pan(spot.x);
      sound.fx('twinkle', { gain: 0.5, pan });
      flare(
        this.fx,
        this.env.rng,
        spot.x,
        spot.y - HATCHLING_HEIGHT * s * 0.5,
        lighten(this.coat().color, 0.3),
        40,
        12,
      );
    });
    this.script.at(s0 + 7.4, () => this.hatchling.touch());
    this.script.at(s0 + 9.6, () => this.endFinale());
  }

  /**
   * The machine cannot hold any more. It goes off in a shower of what it makes, and the hatchling
   * comes out.
   */
  private burst(): void {
    const plan = this.plan;
    const dome = this.domeAt();
    const sound = this.env.sound;
    this.bursting = 1;
    this.crowned = true;
    this.overload = 0;
    showerOf(this.fx, this.env.rng, this.product, dome.x, dome.y - 14, 56, 340, plan.machine.y + 4);
    rainbowRing(this.fx, dome.x, dome.y, plan.dome.r * 2.2);
    flare(this.fx, this.env.rng, dome.x, dome.y, COLORS.white, plan.dome.r * 3, 16);
    for (let i = this.fx.count(70); i > 0; i--) {
      const rng = this.env.rng;
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
        delay: rng.range(0, 0.9),
      });
    }
    this.gulp.kick(7);
    this.flash(0.34, COLORS.white);
    this.shake(3);
    sound.fx('boom', { gain: 0.8 });
    sound.fx('cheer', { gain: 0.8, delay: 0.1 });
    sound.fx('poof', { gain: 0.6, delay: 0.05 });
    FRUIT_IDS.forEach((_, i) => {
      sound.note('bell', scaleNote(ROOT + 12, i), { gain: 0.5, delay: 0.1 + i * 0.08, seconds: 0.9 });
    });
    this.stands.forEach((_, i) => {
      this.cast.cheer(i);
    });
    this.hatchling.hatch();
    this.lampPulse = 1;
  }

  protected paintBack(p: Painter): void {
    this.ensureArt(p.k);
    this.scene.paint(p);
    this.scene.paintDecor(p);
    this.paintCart(p);
    this.paintMachine(p);
    this.paintShelf(p);
    this.paintPods(p);
    this.paintResidents(p);
    this.paintFriends(p);
    this.paintHatchling(p);
  }

  /**
   * The fruit on the cart, bobbing a little, each one shrinking to nothing as it is thrown and
   * growing back when it returns.
   */
  private paintCart(p: Painter): void {
    const bank = this.env.bank;
    const g = p.ctx;
    const plan = this.plan;
    plan.fruit.forEach((spot, i) => {
      const slot = this.slots[i]!;
      const fruit = FRUITS[FRUIT_IDS[i]!]!;
      let grow = slot.here ? 1 : 0;
      if (slot.here) grow = easeOutBack(clamp((this.time - slot.back) / 0.45));
      if (grow <= 0.01) return;
      const bob = Math.sin(this.time * 2.2 + i * 0.9) * 1.6;
      const hop = this.time - slot.hop;
      const jump = hop >= 0 && hop < 0.4 ? 9 * Math.sin((hop / 0.4) * Math.PI) : 0;
      g.fillStyle = 'rgba(10,20,30,0.25)';
      g.beginPath();
      g.ellipse(spot.x, spot.y + spot.r * 0.62, spot.r * 0.78 * grow, spot.r * 0.2 * grow, 0, 0, TAU);
      g.fill();
      const pic = bank?.sprite('produce', fruit.sprite, 0);
      if (pic) drawPic(g, pic, spot.x, spot.y + bob - jump, { scale: plan.fruitScale * grow, mid: true });
      else {
        g.fillStyle = `rgb(${fruit.color.join(',')})`;
        g.beginPath();
        g.arc(spot.x, spot.y + bob - jump, spot.r * 0.7 * grow, 0, TAU);
        g.fill();
      }
    });
  }

  private paintMachine(p: Painter): void {
    const plan = this.plan;
    const t = p.t;
    const lever = this.time - this.leverAt;
    const pull =
      lever < 0
        ? 0
        : lever < 0.22
          ? easeOutQuad(lever / 0.22)
          : lever < 0.55
            ? 1
            : lever < 1.1
              ? 1 - easeOutQuad((lever - 0.55) / 0.55)
              : 0;
    const toot = this.time - this.whistleAt;
    const whistle = toot >= 0 && toot < 0.5 ? Math.sin((toot / 0.5) * Math.PI) : 0;
    const busy = clamp(this.works.energy + this.overload);
    const shake = busy > 0.75 ? (busy - 0.75) * 4 : 0;
    const inside = this.works.pods
      .filter((pod) => pod.phase === 'brew')
      .map((pod) => ({ sprite: FRUITS[pod.fruit].sprite, u: within(pod), angle: pod.id * 1.7 }));
    const state: MachineState = {
      t,
      gear: this.gear,
      needle: this.needle,
      lamps: this.lamps,
      lever: pull,
      whistle,
      fill: this.fill,
      color: this.tint,
      swirl: 0.12 + 0.6 * busy,
      inside,
      heat: this.overload,
    };
    const squash = clamp(this.gulp.x * 0.06 + 0.012 * this.beatPulse, -0.12, 0.14);
    const calm = this.env.calm ? 0.3 : 1;
    this.machineArt.paint(
      p,
      plan.machine.x,
      plan.machine.y,
      plan.s,
      squash,
      Math.sin(t * 61) * 0.7 * shake * calm,
      Math.cos(t * 47) * 0.5 * shake * calm,
      state,
    );
  }

  /** What is on the shelf. */
  private paintShelf(p: Painter): void {
    const g = p.ctx;
    const cell = this.plan.shelf.cell;
    for (let i = 0; i < this.cells.length; i++) {
      const item = this.shelf.at(i);
      if (!item) continue;
      const c = this.cells[i]!;
      const age = this.time - item.born;
      const hop = this.time - (this.itemHop.get(i) ?? -9);
      const pop = 1 + 0.3 * Math.exp(-age * 6) * Math.sin(age * 24);
      const lift = hop >= 0 && hop < 0.4 ? cell * 0.22 * Math.sin((hop / 0.4) * Math.PI) : 0;
      const fruit = FRUITS[item.fruit];
      glowAt(p.light, c.x, c.y - lift, cell * 1.1, fruit.color, 0.1 + 0.05 * Math.sin(this.time * 2 + i));
      if (this.product === 'gem') {
        const size = cell * 0.74 * pop;
        g.drawImage(gemImage(fruit.color), c.x - size / 2, c.y - size * 0.5 - lift, size, size);
      } else {
        const w = cell * 0.82 * pop;
        const h = w * (BLOOM_H / BLOOM_W);
        const sway = 0.05 * Math.sin(this.time * 1.6 + item.seed);
        g.save();
        g.translate(c.x, c.y + cell * 0.43 - lift);
        g.rotate(sway);
        g.drawImage(bloomImage(fruit, 3), -w / 2, -h, w, h);
        g.restore();
      }
    }
  }

  /**
   * Where a fruit or a thing it has become is now, on its way through the machine, or nothing if it
   * cannot be seen.
   */
  private podAt(pod: Pod): { x: number; y: number; scale: number; rot: number } | null {
    const plan = this.plan;
    const u = within(pod);
    if (pod.phase === 'fly') {
      const e = u * u * (3 - 2 * u);
      return {
        x: lerp(pod.fromX, plan.hopper.x, e),
        y: lerp(pod.fromY, plan.hopper.y - 6, e) - 56 * Math.sin(u * Math.PI),
        scale: plan.fruitScale,
        rot: u * TAU * 1.4,
      };
    }
    if (pod.phase === 'fall') {
      const into = onMachine(plan, -58, -194);
      const e = u * u;
      return {
        x: lerp(plan.hopper.x, into.x, e),
        y: lerp(plan.hopper.y - 6, into.y, e),
        scale: lerp(plan.fruitScale, plan.fruitScale * 0.6, u),
        rot: TAU * 1.4 + u * 2,
      };
    }
    if (pod.phase === 'out' && !pod.surprise && pod.cell >= 0) {
      const c = this.cells[pod.cell]!;
      const out = plan.chute;
      return {
        x: lerp(out.x, c.x, u),
        y: lerp(out.y, c.y, u) - 44 * 4 * u * (1 - u),
        scale: lerp(0.55, 1, u),
        rot: u * TAU * 1.5,
      };
    }
    return null;
  }

  private paintPods(p: Painter): void {
    const bank = this.env.bank;
    const g = p.ctx;
    const cell = this.plan.shelf.cell;
    for (const pod of this.works.pods) {
      const at = this.podAt(pod);
      if (!at) continue;
      const fruit = FRUITS[pod.fruit];
      if (pod.phase === 'out') {
        // A stone turning over as it goes, or a flower held upright, to its place on the shelf.
        const size = cell * 0.74 * at.scale;
        if (this.product === 'gem') {
          const flat = Math.max(0.2, Math.abs(Math.cos(at.rot)));
          g.save();
          g.translate(at.x, at.y);
          g.scale(flat, 1);
          g.drawImage(gemImage(fruit.color), -size / 2, -size / 2, size, size);
          g.restore();
        } else {
          const w = cell * 0.82 * at.scale;
          const h = w * (BLOOM_H / BLOOM_W);
          g.save();
          g.translate(at.x, at.y + h * 0.35);
          g.rotate(Math.sin(at.rot) * 0.25);
          g.drawImage(bloomImage(fruit, 3), -w / 2, -h, w, h);
          g.restore();
        }
        glowAt(p.light, at.x, at.y, cell * 1.2, fruit.color, 0.35);
        continue;
      }
      const pic = bank?.sprite('produce', fruit.sprite, 0);
      if (pic) drawPic(g, pic, at.x, at.y, { scale: at.scale, rot: at.rot, mid: true });
      if (pod.by >= 0) glowAt(p.light, at.x, at.y, 40, lighten(fruit.color, 0.3), 0.4);
    }
  }

  private paintResidents(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    for (const r of this.residents) {
      const pic = bank.sprite('life', r.creature.sprite, this.time + r.id * 0.13);
      if (!pic) continue;
      const bob = Math.sin(this.time * 4 + r.id) * 1.5;
      drawPic(g, pic, r.x, r.y + bob, { scale: r.creature.scale, flip: r.vx < 0, mid: true });
      glowAt(p.light, r.x, r.y, 36, this.product === 'gem' ? [170, 220, 255] : [255, 190, 235], 0.28);
    }
  }

  private paintFriends(p: Painter): void {
    const bank = this.env.bank;
    if (!bank) return;
    const g = p.ctx;
    const order = this.stands.map((s, i) => ({ s, i })).sort((a, b) => a.s.y - b.s.y || a.i - b.i);
    for (const { s, i } of order) {
      const id = this.env.herd[i]!;
      g.fillStyle = 'rgba(10,20,30,0.3)';
      g.beginPath();
      g.ellipse(s.x, s.y + 1, 36 * s.scale, 5 * s.scale, 0, 0, TAU);
      g.fill();
      this.cast.draw(g, bank, i, id, s.scale);
      if (this.crowned) this.paintCrown(g, i, id);
    }
  }

  /**
   * The stone or flower of her own colour that each friend wears at her horn once the machine has
   * gone off.
   */
  private paintCrown(g: CanvasRenderingContext2D, i: number, id: UnicornId): void {
    const horn = this.hornOf(i);
    const s = this.stands[i]!;
    const fruit = FRUITS[FRIEND_FRUIT[id]];
    const size = 24 * (0.7 + 0.6 * s.scale);
    const bob = Math.sin(this.time * 2.4 + i) * 1.2;
    if (this.product === 'gem')
      g.drawImage(gemImage(fruit.color), horn.x - size / 2, horn.y - size * 0.8 + bob, size, size);
    else {
      const w = size * 0.9;
      const h = w * (BLOOM_H / BLOOM_W);
      g.drawImage(bloomImage(fruit, 3), horn.x - w / 2, horn.y - h * 0.9 + bob, w, h);
    }
  }

  private paintHatchling(p: Painter): void {
    const h = this.hatchling;
    if (!h.here) return;
    const feet = this.hatchSpot();
    const dome = this.domeAt();
    const k = h.flight;
    const x = lerp(feet.x, dome.x, k);
    const y = lerp(feet.y, dome.y, k);
    h.shape(this.shape);
    const coat = this.coat();
    paintHatchling(p.ctx, x, y, this.hatchScale(), this.shape, coat, p.t);
    glowAt(p.light, x, y - HATCHLING_HEIGHT * this.hatchScale() * 0.55, 90, lighten(coat.color, 0.3), 0.18);
  }

  /** Nothing is held in front of the workshop, which is lit from inside the picture. */
  protected paintFront(_p: Painter): void {}
}
