import type { Facing } from '../../../src/shared/ids';
import type { MapBuilder } from './builder';
import { stand as E, hitBox as hit, type Pt, type Scatter } from './geom';

/** What a prop the game draws needs from the map. */
export interface PropSpec {
  name: string;
  def: string;
  /** The recipe whose footprint it keeps. */
  sprite: string;
  at: Pt;
  /** The tap region: `width` across, `tall` above the ground point. */
  width: number;
  tall: number;
  look?: string;
  /** Places to stand when it is tapped. Found from the room round it when left out. */
  approach?: readonly { x: number; y: number; facing: Facing }[];
  /** Extra room kept clear of scenery round it. */
  keep?: number;
  /** Moves it to the nearest place that has room. */
  loose?: boolean;
  /** How far from water it must lie. The default keeps a dry foot. */
  shore?: number;
  /** The radius of its footprint when its recipe has none, which is then blocked by a circle. */
  r?: number;
}

/**
 * Sets down the props that the game draws on a map: each keeps its footprint, keeps scenery away,
 * and is opened to the herd once every one stands, so each place to stand is found with every
 * footprint in view. A prop that has no room, or no room to stand beside it, is a problem the
 * author reports, so a map never ships with a thing the herd cannot reach.
 */
export class Placer {
  readonly problems: string[] = [];
  private readonly pending: (PropSpec & { r: number })[] = [];

  constructor(
    private readonly b: MapBuilder,
    private readonly sc: Scatter,
    private readonly footprints: Readonly<Record<string, number>>,
    /** Where a thing may be set down, apart from having room: out of the sea, or off the stones. */
    private readonly allowed: (x: number, y: number, shore: number) => boolean = (x, y, shore) =>
      b.pondness(x, y) < -shore,
  ) {}

  /** True when a footprint of `need` fits at the point, off the water. */
  roomAt(x: number, y: number, need: number, shore = 40): boolean {
    return this.b.openness(x, y) > need && this.allowed(x, y, shore) && this.b.clearanceAt(x, y) >= Math.min(need, 90);
  }

  /** The nearest spot to `p` with room, searched in widening rings. */
  snap(p: Pt, need: number, shore = 40): Pt {
    if (this.roomAt(p.x, p.y, need, shore)) return p;
    for (let d = 16; d <= 520; d += 16) {
      const ring = Array.from(
        { length: 24 },
        (_, k): Pt => ({
          x: p.x + Math.cos((k / 24) * Math.PI * 2) * d,
          y: p.y + Math.sin((k / 24) * Math.PI * 2) * d,
        }),
      ).filter((q) => this.roomAt(q.x, q.y, need, shore));
      const best = ring[0];
      if (best) return best;
    }
    throw new Error(
      `${this.b.opts.id}: nowhere near (${Math.round(p.x)}, ${Math.round(p.y)}) has ${need} units of room`,
    );
  }

  /** The cardinal facing that looks from one point toward another. */
  static facing(from: Pt, to: Pt): Facing {
    const dx = to.x - from.x,
      dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.3) return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'south' : 'north';
  }

  /**
   * Two places to stand by a prop: the nearest of several directions that have room, south first
   * when two are as near. A tall prop is seen whole from a short way off.
   */
  standsBy(at: Pt, r: number): { x: number; y: number; facing: Facing }[] {
    const dirs = [
      [0, 1],
      [-0.8, 0.6],
      [0.8, 0.6],
      [-1, 0.3],
      [1, 0.3],
      [0, -1],
    ] as const;
    return dirs
      .flatMap(([dx, dy]) => {
        const away = [56, 76, 100, 130].map((m) => r + m).find((m) => this.standable(at.x + dx * m, at.y + dy * m));
        return away === undefined ? [] : [{ dx, dy, away }];
      })
      .sort((p, q) => p.away - q.away)
      .slice(0, 2)
      .map(({ dx, dy, away }) => {
        const from = { x: at.x + dx * away, y: at.y + dy * away };
        return E(from.x, from.y, Placer.facing(from, at));
      });
  }

  /** Ground a unicorn can stand on, a little off any wall or footprint. */
  private standable(x: number, y: number): boolean {
    return this.b.openness(x, y) > 0 && this.b.clearanceAt(x, y) >= 40;
  }

  /** Sets a prop down, keeping its footprint. */
  prop(o: PropSpec): void {
    const drawn = this.footprints[o.sprite];
    const r = drawn ?? o.r;
    if (r === undefined) throw new Error(`${this.b.opts.id}: ${o.sprite} has no footprint`);
    const shore = o.shore ?? 40;
    let at = o.at;
    if (o.loose) at = this.snap(at, r + 50, shore);
    else if (!this.roomAt(at.x, at.y, r + 50, shore))
      this.problems.push(`${o.name} stands too close to the rock or the water, with ${r + 50} units wanted all round`);
    this.sc.add(at.x, at.y, r + (o.keep ?? 50));
    if (drawn === undefined) this.b.block({ kind: 'circle', x: Math.round(at.x), y: Math.round(at.y), r });
    else this.b.footprint(o.sprite, at.x, at.y);
    this.pending.push({ ...o, at, r });
  }

  /** Opens every prop to the herd. Call once, after all of them stand. */
  open(): void {
    for (const o of this.pending) {
      const approach = o.approach ?? this.standsBy(o.at, o.r);
      if (approach.length === 0) this.problems.push(`${o.name} has no room to stand beside it`);
      this.b.interactable({
        name: o.name,
        definitionId: o.def,
        ...(o.look ? { look: o.look } : {}),
        pos: o.at,
        hit: hit(o.at.x, o.at.y, o.width, o.tall + 20, o.tall),
        approach,
      });
    }
    this.pending.length = 0;
  }

  /** Throws if anything did not fit. */
  finish(): void {
    if (this.problems.length > 0) throw new Error(`${this.b.opts.id}:\n  ${this.problems.join('\n  ')}`);
  }
}
