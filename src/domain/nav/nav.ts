import type { Vec2 } from '../../shared/ids';
import type { Obstacle } from '../../shared/map';
import { CONFIG } from '../config';
import { dist, lerp } from '../geometry';
import { MinHeap } from './heap';
import { ObstacleIndex } from './obstacles';

export interface NavSource {
  width: number;
  height: number;
  obstacles: readonly Obstacle[];
}

const SQRT2 = Math.SQRT2;

/**
 * Cells that make a patch of ground worth walking about on. The pockets on the maps hold 14 or
 * fewer, the open ground over 600.
 */
const ROOMY_CELLS = 40;

/**
 * When there is a place she is headed for, how many different ways out are tried, how far apart
 * they are, and how much farther than the nearest one is still looked at.
 */
const WAYS_OUT = 6;
const WAYS_APART = 96;
const WAYS_REACH = 320;
/** dx, dy, cost in cell units. */
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

const ORTHO = NEIGHBORS.slice(0, 4);

export interface ReachablePoint {
  point: Vec2;
  /** True when the requested point itself is walkable and connected. */
  exact: boolean;
}

/**
 * Navigation over one map. Walkability comes from the distance to obstacles, so an actor's foot
 * radius is built into every answer: a point is walkable when its feet fit there.
 *
 * Search runs on a 32 unit grid of cell centers. Moves are eight-way and never cut a corner. The
 * raw cell path is then simplified with clearance-checked segments and its corners are rounded only
 * where the rounded curve still has room.
 */
export class Nav {
  readonly cell = CONFIG.nav.cell;
  readonly cols: number;
  readonly rows: number;
  readonly radius = CONFIG.nav.footRadius;
  private readonly index: ObstacleIndex;
  private readonly walk: Uint8Array;
  private readonly comp: Int32Array;
  /**
   * Per component: 1 when it is ground to walk about on, 0 for a pocket a map has sealed off or
   * left over between things.
   */
  private readonly roomy: Uint8Array;
  private readonly heap = new MinHeap();
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;

  constructor(readonly source: NavSource) {
    this.index = new ObstacleIndex(source.width, source.height, source.obstacles);
    this.cols = Math.ceil(source.width / this.cell);
    this.rows = Math.ceil(source.height / this.cell);
    const n = this.cols * this.rows;
    this.walk = new Uint8Array(n);
    this.comp = new Int32Array(n).fill(-1);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const c = this.centerOf(i);
      this.walk[i] = this.index.clearanceAt(c.x, c.y) >= this.radius ? 1 : 0;
    }
    this.roomy = this.label();
  }

  private cellIndex(p: Vec2): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / this.cell)));
    return cy * this.cols + cx;
  }

  centerOf(i: number): Vec2 {
    return { x: ((i % this.cols) + 0.5) * this.cell, y: (Math.floor(i / this.cols) + 0.5) * this.cell };
  }

  /**
   * Connected components over walkable cells. Four-connectivity is enough because diagonals need
   * both neighbors. Says which of them are ground to walk about on: the largest always is, and any
   * other is when it holds `ROOMY_CELLS` cells. The rest are the pockets that a tree, a pond or a
   * table leaves between its neighbours.
   */
  private label(): Uint8Array {
    let next = 0;
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let s = 0; s < this.walk.length; s++) {
      if (!this.walk[s] || this.comp[s]! >= 0) continue;
      this.comp[s] = next;
      stack.push(s);
      let size = 0;
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        const x = c % this.cols,
          y = (c / this.cols) | 0;
        for (const [dx, dy] of ORTHO) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const n = ny * this.cols + nx;
          if (this.walk[n] && this.comp[n]! < 0) {
            this.comp[n] = next;
            stack.push(n);
          }
        }
      }
      sizes.push(size);
      next++;
    }
    const need = Math.min(ROOMY_CELLS, Math.max(0, ...sizes));
    return Uint8Array.from(sizes, (size) => (size >= need ? 1 : 0));
  }

  /** Nearest walkable cell to a point by ring search, or -1 when none lies within `rings` cells. */
  private nearestWalkableCell(p: Vec2, rings: number): number {
    const base = this.cellIndex(p);
    const bx = base % this.cols,
      by = (base / this.cols) | 0;
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= rings; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = bx + dx,
            y = by + dy;
          if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
          const i = y * this.cols + x;
          if (!this.walk[i]) continue;
          const d = dist(this.centerOf(i), p);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }

  /** Distance from a point to the nearest obstacle or map edge, capped. */
  clearanceAt(p: Vec2): number {
    return this.index.clearanceAt(p.x, p.y);
  }

  /** True when an actor's feet fit at `p`. */
  isWalkable(p: Vec2, margin = 0): boolean {
    return this.index.clearanceAt(p.x, p.y) >= this.radius + margin;
  }

  /** True when a body walking straight from `a` to `b` keeps its feet clear the whole way. */
  segmentClear(a: Vec2, b: Vec2, margin = 0): boolean {
    const need = this.radius + margin;
    const len = dist(a, b);
    const steps = Math.max(1, Math.ceil(len / CONFIG.nav.sampleStep));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.index.clearanceAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) < need) return false;
    }
    return true;
  }

  /**
   * True when a body can walk straight from `a` to `b` without its feet coming closer to anything
   * than they need to be or than they are at `a`, whichever is less. A follower comes to rest a
   * hair too close to a wall, and without this it could not set off from there in any direction
   * that is not along a route of cell centers.
   */
  leaves(a: Vec2, b: Vec2): boolean {
    const need = Math.min(this.radius, this.index.clearanceAt(a.x, a.y)) - 0.25;
    const len = dist(a, b);
    const steps = Math.max(1, Math.ceil(len / CONFIG.nav.sampleStep));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.index.clearanceAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) < need) return false;
    }
    return true;
  }

  /**
   * Where a body ends up when it tries to walk from `from` to `to`. It gets there if its feet fit
   * there. If they do not, it is pushed back out of whatever it walked into, the way that gives it
   * more room, and keeps the part of the move that ran alongside: it slides along a tree or the
   * edge of a pond and never comes to rest inside one. It stays where it was when no open place is
   * found.
   */
  slide(from: Vec2, to: Vec2): Vec2 {
    let p: Vec2 = { x: to.x, y: to.y };
    for (let pass = 0; pass < 3; pass++) {
      const room = this.index.clearanceAt(p.x, p.y);
      if (room >= this.radius) return p;
      const gx = this.index.clearanceAt(p.x + 2, p.y) - this.index.clearanceAt(p.x - 2, p.y);
      const gy = this.index.clearanceAt(p.x, p.y + 2) - this.index.clearanceAt(p.x, p.y - 2);
      const along = Math.hypot(gx, gy);
      if (along < 1e-6) break;
      const out = this.radius - room + 0.5;
      p = { x: p.x + (gx / along) * out, y: p.y + (gy / along) * out };
    }
    return this.isWalkable(p) ? p : { x: from.x, y: from.y };
  }

  /**
   * True when nothing solid stands between `a` and `b`. The last `ignoreEnd` units are skipped
   * because the target usually sits inside its own footprint. Brushing the edge of an obstacle does
   * not block the view, passing through its middle does.
   */
  lineOfSight(a: Vec2, b: Vec2, ignoreEnd = 64): boolean {
    const total = dist(a, b);
    const len = total - ignoreEnd;
    if (len <= 0) return true;
    const steps = Math.ceil(len / 8);
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (len / total);
      if (this.index.clearanceAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) < -6) return false;
    }
    return true;
  }

  /** Component id of the walkable area around `p`, or -1 when `p` is not near any walkable cell. */
  componentAt(p: Vec2): number {
    const i = this.cellIndex(p);
    if (this.walk[i]) return this.comp[i]!;
    const n = this.nearestWalkableCell(p, 2);
    return n < 0 ? -1 : this.comp[n]!;
  }

  sameComponent(a: Vec2, b: Vec2): boolean {
    const ca = this.componentAt(a);
    return ca >= 0 && ca === this.componentAt(b);
  }

  /**
   * Component id of the ground a route from or to `p` runs on: the one holding the cell it would
   * start or end in (see `entryCell`), which is `p`'s own cell when that is walkable. This is what
   * `findPath` goes by. `componentAt` takes the nearest walkable cell whether or not `p` can walk
   * to it, so it can name a pocket across a gap, or nothing, for a place that has a route out, and
   * a route's ground for one that has none. -1 when there is no ground to set off from or to arrive
   * at.
   */
  groundAt(p: Vec2): number {
    const i = this.cellIndex(p);
    if (this.walk[i]) return this.comp[i]!;
    const entry = this.entryCell(p);
    return entry < 0 ? -1 : this.comp[entry]!;
  }

  /** True when a route between the two can be made, by `groundAt`. */
  sameGround(a: Vec2, b: Vec2): boolean {
    const ga = this.groundAt(a);
    return ga >= 0 && ga === this.groundAt(b);
  }

  /**
   * True when a body standing at `p` can be sent anywhere on the ground it is on: its feet fit, and
   * a cell centre that it can walk to in a straight line lies on ground to walk about on. A route
   * is made of cell centres, so there is none from a nook narrower than a cell, nor from a patch of
   * cells that nothing joins to the rest.
   */
  canSetOff(p: Vec2): boolean {
    if (!this.isWalkable(p, -CONFIG.nav.standSlack)) return false;
    const entry = this.entryCell(p);
    return entry >= 0 && this.roomy[this.comp[entry]!] === 1;
  }

  /**
   * Where a body that cannot set off from `p` can be put down: a cell centre on ground to walk
   * about on, at least `gap` from every point in `avoid`, and on the ground it is on when that is
   * ground to walk about on. The nearest, or when `toward` says where it is headed, the one of the
   * nearest ways out from which it gets there soonest, hop and walk together: of two places either
   * side of a hedge, the one on the side of the tap. Null only when the map has no such ground at
   * all.
   */
  openGroundNear(p: Vec2, avoid: readonly Vec2[] = [], gap = 56, toward?: Vec2): Vec2 | null {
    const own = this.groundAt(p) >= 0 ? this.groundAt(p) : this.componentAt(p);
    const only = own >= 0 && this.roomy[own] === 1 ? own : -1;
    const found: { at: Vec2; d: number }[] = [];
    for (let i = 0; i < this.walk.length; i++) {
      if (!this.walk[i] || !this.roomy[this.comp[i]!] || (only >= 0 && this.comp[i] !== only)) continue;
      const at = this.centerOf(i);
      if (!avoid.some((q) => dist(at, q) < gap)) found.push({ at, d: dist(at, p) });
    }
    found.sort((a, b) => a.d - b.d);
    const nearest = found[0];
    if (!nearest) return null;
    if (!toward) return nearest.at;

    // The nearest ground each way, so that the ways out are not neighbours on one side.
    const ways: typeof found = [];
    for (const f of found) {
      if (f.d > nearest.d + WAYS_REACH || ways.length >= WAYS_OUT) break;
      if (ways.every((w) => dist(w.at, f.at) >= WAYS_APART)) ways.push(f);
    }
    let best = nearest;
    let bestCost = Infinity;
    for (const w of ways) {
      const aim = this.nearestReachable(w.at, toward);
      const route = aim ? this.findPath(w.at, aim.point) : null;
      const cost = route ? w.d + pathLength(w.at, route) : Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        best = w;
      }
    }
    return best.at;
  }

  private cellPath(start: number, goal: number): number[] | null {
    const { cols, rows, walk, g, parent, seen, closed, heap } = this;
    const gen = ++this.gen;
    const gx = goal % cols,
      gy = (goal / cols) | 0;
    const h = (i: number): number => {
      const dx = Math.abs((i % cols) - gx),
        dy = Math.abs(((i / cols) | 0) - gy);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    heap.clear();
    g[start] = 0;
    parent[start] = -1;
    seen[start] = gen;
    heap.push(start, h(start));
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        const out: number[] = [];
        for (let c = goal; c !== -1; c = parent[c]!) out.push(c);
        return out.reverse();
      }
      const cx = cur % cols,
        cy = (cur / cols) | 0;
      const gc = g[cur]!;
      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (!walk[n] || closed[n] === gen) continue;
        if (dx !== 0 && dy !== 0 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
        const ng = gc + cost;
        if (seen[n] !== gen || ng < g[n]!) {
          g[n] = ng;
          parent[n] = cur;
          seen[n] = gen;
          // A hair of weight on the heuristic prefers paths that head for the goal among equal
          // costs.
          heap.push(n, ng + h(n) * 1.0001);
        }
      }
    }
    return null;
  }

  /**
   * Waypoints from `from` to `to`, not including `from`, or null when `to` cannot be reached. Every
   * segment keeps the actor's feet clear of obstacles, or at least no closer than they are when the
   * path starts from a point that is already too close (see `leaves`).
   */
  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    // A place a hair too close to a wall is one to stand in: a follower's place on the trail, cut
    // across a corner, can be.
    if (!this.isWalkable(to, -CONFIG.nav.standSlack)) return null;
    if (this.joins(from, to)) return [{ x: to.x, y: to.y }];
    const start = this.entryCell(from);
    const goal = this.entryCell(to);
    if (start < 0 || goal < 0 || this.comp[start] !== this.comp[goal]) return null;
    const cells = this.cellPath(start, goal);
    if (!cells) return null;
    const pts: Vec2[] = [from, ...cells.map((c) => this.centerOf(c)), to];
    return this.roundCorners(this.simplify(pts)).slice(1);
  }

  /**
   * True when a body can walk straight between the two points, whichever of them it starts from
   * (see `leaves`).
   */
  private joins(a: Vec2, b: Vec2): boolean {
    return this.leaves(a, b) || this.leaves(b, a);
  }

  /**
   * The cell a path through the grid starts or ends in for the point `p`: the nearest walkable cell
   * that `p` can walk to and from in a straight line, which is its own when that is walkable. A
   * point too close to a wall, or in a passage narrower than a cell, has no cell centre of its own,
   * and a centre on the far side of a corner is not a way out of it. None at all when there is no
   * such cell, so no path is made through a wall.
   */
  private entryCell(p: Vec2): number {
    const here = this.cellIndex(p);
    const bx = here % this.cols,
      by = (here / this.cols) | 0;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = bx + dx,
          y = by + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const i = y * this.cols + x;
        if (!this.walk[i]) continue;
        const c = this.centerOf(i);
        const d = dist(c, p);
        if (d < bestD && this.joins(p, c)) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * Greedy string pulling: from each kept point, jump to the farthest later point that is in clear
   * view.
   */
  private simplify(pts: readonly Vec2[]): Vec2[] {
    const out: Vec2[] = [pts[0]!];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      // Look ahead a little past the first blocked point, since visibility is not monotonic around
      // corners.
      let miss = 0;
      for (let k = i + 2; k < pts.length && miss < 4; k++) {
        if (this.leaves(pts[i]!, pts[k]!)) {
          j = k;
          miss = 0;
        } else miss++;
      }
      out.push(pts[j]!);
      i = j;
    }
    return out;
  }

  /**
   * Replaces sharp interior corners with short curves, but only where every sampled point of the
   * curve has room.
   */
  private roundCorners(pts: readonly Vec2[]): Vec2[] {
    if (pts.length < 3) return [...pts];
    const out: Vec2[] = [pts[0]!];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1]!,
        v = pts[i]!,
        b = pts[i + 1]!;
      const la = dist(a, v),
        lb = dist(v, b);
      const cut = Math.min(CONFIG.nav.cornerRound, la * 0.45, lb * 0.45);
      if (cut < 6) {
        out.push(v);
        continue;
      }
      const p0 = lerp(v, a, cut / la),
        p2 = lerp(v, b, cut / lb);
      const curve: Vec2[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4,
          u = 1 - t;
        curve.push({
          x: u * u * p0.x + 2 * u * t * v.x + t * t * p2.x,
          y: u * u * p0.y + 2 * u * t * v.y + t * t * p2.y,
        });
      }
      const ok = curve.every((c) => this.isWalkable(c)) && this.segmentClear(out[out.length - 1]!, curve[0]!);
      if (ok) out.push(...curve);
      else out.push(v);
    }
    out.push(pts[pts.length - 1]!);
    return out;
  }

  /**
   * The point nearest to `target` that `from` can walk to. An exact walkable connected target is
   * returned as is. Returns null when nothing reachable lies within the fallback reach, so the
   * caller can refuse the tap.
   */
  nearestReachable(from: Vec2, target: Vec2, reach: number = CONFIG.nav.fallbackReach): ReachablePoint | null {
    const fromComp = this.groundAt(from);
    if (fromComp < 0) return null;
    // A tap is taken as it is only where a route can end. In a nook narrower than a cell there is
    // none, and a tap there is answered by the nearest place that has one.
    if (this.isWalkable(target) && this.groundAt(target) === fromComp)
      return { point: { x: target.x, y: target.y }, exact: true };

    const base = this.cellIndex(target);
    const bx = base % this.cols,
      by = (base / this.cols) | 0;
    const maxRing = Math.ceil(reach / this.cell) + 1;
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      // Once a candidate is closer than any cell in this ring could be, stop.
      if (best >= 0 && bestD < (r - 1) * this.cell) break;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = bx + dx,
            y = by + dy;
          if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
          const i = y * this.cols + x;
          if (!this.walk[i] || this.comp[i] !== fromComp) continue;
          const d = dist(this.centerOf(i), target);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    if (best < 0 || bestD > reach) return null;

    // Slide from the cell center toward the target until the feet stop fitting, so the stop is as
    // near the tap as it can be.
    const c = this.centerOf(best);
    let point = c;
    const len = dist(c, target);
    for (let d = 4; d <= len; d += 4) {
      const p = lerp(c, target, d / len);
      if (!this.isWalkable(p)) break;
      point = p;
    }
    return { point, exact: false };
  }

  /**
   * The reachable point closest to `target` regardless of distance. Used to place a refusal sparkle
   * at the nearest edge.
   */
  closestEdgePoint(from: Vec2, target: Vec2): Vec2 {
    const comp = this.groundAt(from);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.walk.length; i++) {
      if (!this.walk[i] || this.comp[i] !== comp) continue;
      const d = dist(this.centerOf(i), target);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? from : this.centerOf(best);
  }

  /**
   * A validated standing place near `center`, at least `gap` from every point in `avoid`, in the
   * same walkable area. Candidates are tried in widening rings, so the answer is deterministic and
   * as near as possible.
   */
  freePointNear(center: Vec2, avoid: readonly Vec2[], gap = 56, maxRadius = 360): Vec2 | null {
    const comp = this.componentAt(center);
    if (comp < 0) return null;
    for (let r = 0; r <= maxRadius; r += 20) {
      const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 40));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r * 0.37;
        const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
        if (!this.isWalkable(p, 2) || this.componentAt(p) !== comp) continue;
        if (avoid.some((q) => dist(p, q) < gap)) continue;
        return p;
      }
    }
    return null;
  }

  /** Number of walkable cells. For validation and tests. */
  walkableCells(): number {
    let n = 0;
    for (const w of this.walk) n += w;
    return n;
  }
}

export const pathLength = (from: Vec2, pts: readonly Vec2[]): number => {
  let l = 0;
  let prev = from;
  for (const p of pts) {
    l += dist(prev, p);
    prev = p;
  }
  return l;
};
