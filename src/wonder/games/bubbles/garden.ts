import type { Rng } from '../../../domain/rng';
import type { SpriteBank } from '../../engine/bank';
import { TAU } from '../../engine/ease';
import type { Painter } from '../../engine/painter';
import { Bird } from './bird';
import { Fish } from './fish';
import { Bee, Butterfly, Fairy } from './fliers';
import { Flower } from './flower';
import { PRIZE, type Prize } from './kinds';
import type { Plan, Slot } from './layout';
import type { Heard, Layer, Resident, World } from './residents';
import { Ladybug, Snail } from './walkers';

/**
 * Everything that stays in the garden once its bubble has popped. It makes the residents, keeps
 * each kind to the number the garden can hold (the oldest goes when one more comes), steps them,
 * draws them in three layers (under the lilies, on the meadow, in the air), says which one a touch
 * is on, and moves them all to the right places when the screen changes shape.
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

/** How close together two flowers may grow before the next one looks for room elsewhere. */
const CROWD = 52;
/**
 * How far around a place the flowers are counted when a flower looks for a spot that is not already
 * a thicket.
 */
const NEIGHBOURHOOD = 150;

export class Garden implements World {
  readonly blooms: Flower[] = [];
  now = 0;
  private readonly all: Resident[] = [];
  private readonly told: Heard[] = [];
  private taken: boolean[];
  private order = 0;
  private readonly scratch: Resident[] = [];

  constructor(
    readonly rng: Rng,
    public plan: Plan,
    private readonly bank: SpriteBank | null,
  ) {
    this.taken = plan.perches.map(() => false);
  }

  get residents(): readonly Resident[] {
    return this.all;
  }

  /** The most of a kind the garden holds. A small screen has less meadow, so fewer flowers. */
  capOf(prize: Prize): number {
    const cap = PRIZE[prize].cap;
    return prize === 'flower' ? Math.min(cap, this.plan.slots.length - 2) : cap;
  }

  /** How many of a kind are in the garden and staying. */
  count(prize: Prize): number {
    let n = 0;
    for (const r of this.all) if (r.prize === prize && !r.leaving) n++;
    return n;
  }

  /** Whether the garden has all it can hold of this kind. */
  full(prize: Prize): boolean {
    return this.count(prize) >= this.capOf(prize);
  }

  /**
   * Lets a prize out at a point. Nothing comes of the ones that do not stay. The oldest of its kind
   * leaves if there is no more room.
   */
  add(prize: Prize, look: number, from: Point): Resident | null {
    if (PRIZE[prize].home === 'none') return null;
    const same = this.all.filter((r) => r.prize === prize && !r.leaving);
    const room = this.capOf(prize);
    for (let i = 0; i <= same.length - room; i++) same[i]!.leave(this);
    const r = this.make(prize, look, from);
    if (!r) return null;
    r.order = ++this.order;
    this.all.push(r);
    if (r instanceof Flower) this.blooms.push(r);
    return r;
  }

  private make(prize: Prize, look: number, from: Point): Resident | null {
    const phase = this.rng.range(0, TAU);
    switch (prize) {
      case 'flower': {
        const slot = this.slotNear(from.x, from.y);
        return slot ? new Flower(look, from, slot, phase) : null;
      }
      case 'butterfly':
        return new Butterfly(look, from, phase, this);
      case 'bee':
        return new Bee(look, from, phase, this);
      case 'fairy':
        return new Fairy(look, from, phase, this);
      case 'bird':
        return new Bird(look, from, phase, this);
      case 'fish':
        return new Fish(look, from, phase, this);
      case 'ladybug':
        return new Ladybug(look, from, phase, this);
      case 'snail':
        return new Snail(look, from, phase, this);
      default:
        return null;
    }
  }

  clear(): void {
    this.all.length = 0;
    this.blooms.length = 0;
    this.taken.fill(false);
    this.told.length = 0;
  }

  hear(e: Heard): void {
    this.told.push(e);
  }

  /** Hands over everything that was said since the last time, and forgets it. */
  drain(sink: (e: Heard) => void): void {
    for (const e of this.told) sink(e);
    this.told.length = 0;
  }

  /**
   * The free place to grow a flower that is nearest to (x, y), but that is not crowded by flowers
   * already growing and is not in a thicket of them.
   */
  slotNear(x: number, y: number): Slot | null {
    let best: Slot | null = null;
    let bestCost = Infinity;
    for (const s of this.plan.slots) {
      if (this.blooms.some((f) => f.at === s)) continue;
      let cost = 0.7 * Math.abs(s.x - x) + 0.25 * Math.abs(s.y - y) + this.rng.range(0, 30);
      for (const f of this.blooms) {
        const d = Math.hypot(f.at.x - s.x, f.at.y - s.y);
        if (d < CROWD) cost += (CROWD - d) * 2.5;
        if (d < NEIGHBOURHOOD) cost += (NEIGHBOURHOOD - d) * 0.35;
      }
      if (cost < bestCost) {
        best = s;
        bestCost = cost;
      }
    }
    return best;
  }

  claimPerch(avoid: number | null): number | null {
    const free: number[] = [];
    this.taken.forEach((t, i) => {
      if (!t && i !== avoid) free.push(i);
    });
    if (free.length === 0) return null;
    const i = this.rng.pick(free);
    this.taken[i] = true;
    return i;
  }

  releasePerch(perch: number): void {
    this.taken[perch] = false;
  }

  update(dt: number): void {
    this.now += dt;
    // The flowers first, so what visits them sees where their heads are now.
    for (const r of this.all) if (r instanceof Flower) r.update(dt, this);
    for (const r of this.all) if (!(r instanceof Flower)) r.update(dt, this);
    for (let i = this.all.length - 1; i >= 0; i--) {
      const r = this.all[i]!;
      if (!r.gone) continue;
      this.all.splice(i, 1);
      if (r instanceof Flower) this.blooms.splice(this.blooms.indexOf(r), 1);
    }
  }

  /**
   * The garden is laid out again for a screen of another shape: every resident goes to the same
   * place in the new picture.
   */
  refit(plan: Plan): void {
    const from = this.plan;
    this.plan = plan;
    if (this.taken.length !== plan.perches.length) this.taken = plan.perches.map(() => false);
    for (const r of this.all) r.fit(from, plan, this);
    for (let i = this.all.length - 1; i >= 0; i--) {
      const r = this.all[i]!;
      if (!r.gone) continue;
      this.all.splice(i, 1);
      if (r instanceof Flower) this.blooms.splice(this.blooms.indexOf(r), 1);
    }
  }

  /** A touch on the water: every fish that is swimming turns toward the ripple, to see. */
  lure(x: number, y: number): void {
    for (const r of this.all) if (r instanceof Fish) r.lure(x, y);
  }

  /** The resident a touch at (x, y) is on, the one in front if there are several. */
  at(x: number, y: number): Resident | null {
    for (let i = this.all.length - 1; i >= 0; i--) {
      const r = this.all[i]!;
      if (r.layer === 'air' && r.hit(x, y)) return r;
    }
    const ground = this.inLayer('ground');
    ground.sort((a, b) => b.depth - a.depth);
    for (const r of ground) if (r.hit(x, y)) return r;
    for (const r of this.inLayer('water')) if (r.hit(x, y)) return r;
    return null;
  }

  /** The residents of one layer, in the order they came, in a list that is reused. */
  private inLayer(layer: Layer): Resident[] {
    this.scratch.length = 0;
    for (const r of this.all) if (r.layer === layer && !r.gone) this.scratch.push(r);
    return this.scratch;
  }

  /** The fish that swim, under the surface: seen through the water, and clipped to it. */
  paintWater(p: Painter): void {
    const swimmers = this.inLayer('water');
    if (swimmers.length === 0) return;
    const g = p.ctx;
    const { x, y, rx, ry } = this.plan.pond;
    g.save();
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.clip();
    for (const r of swimmers) r.paint(p, this.bank);
    g.restore();
  }

  /**
   * The flowers, the walkers and the fish in the air over the pond, the ones further back first.
   */
  paintGround(p: Painter): void {
    const list = this.inLayer('ground');
    list.sort((a, b) => a.depth - b.depth);
    for (const r of list) r.paint(p, this.bank);
  }

  /** The butterflies, bees, birds and fairies. The fairies are drawn last, so they are in front. */
  paintAir(p: Painter): void {
    const list = this.inLayer('air');
    for (const r of list) if (r.prize !== 'fairy') r.paint(p, this.bank);
    for (const r of list) if (r.prize === 'fairy') r.paint(p, this.bank);
  }
}
