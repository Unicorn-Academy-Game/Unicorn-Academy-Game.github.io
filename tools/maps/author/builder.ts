import { ObstacleIndex } from '../../../src/domain/nav/obstacles';
import type { AmbienceId } from '../../../src/shared/audio';
import type { Facing, MapId } from '../../../src/shared/ids';
import type { LifeKind } from '../../../src/shared/life';
import type { Obstacle } from '../../../src/shared/map';
import { packWaters, type Waters } from '../../../src/shared/waters';
import { type EdgeKind, pickTile, type Tileset } from '../../art/world/terrain';
import { type TiledObject, toProperties } from '../tiled';
import { type Pt, type Region, T } from './geom';

export type DecorLayerName = 'backdrop' | 'ground-detail' | 'object-bases' | 'foreground';
type Corner = 'grass' | EdgeKind;

export interface BuilderOpts {
  id: MapId;
  widthTiles: number;
  heightTiles: number;
  /** Tileset id in the manifest, and the file name of its image for Tiled. */
  tileset: string;
  bundle: string;
  music: 'forest' | 'garden' | 'quiet' | 'snow';
  ambience: AmbienceId;
  start?: string;
  /** Only Wildstar goes in. The rest of the herd waits outside. */
  solo?: boolean;
  /** Footprint radius per sprite id. */
  footprints: Readonly<Record<string, number>>;
  /** Sprite ids that exist, so a typo fails here and not at compile time. */
  sprites: ReadonlySet<string>;
}

interface Obj {
  layer: string;
  o: Omit<TiledObject, 'id'>;
}

export interface BuildStats {
  obstacles: number;
  decor: number;
  maskRects: number;
}

/** The nav grid cell, which the obstacle mask matches. */
const CELL = 32;

export class MapBuilder {
  readonly width: number;
  readonly height: number;
  private readonly openRegions: Region[] = [];
  private readonly pathRegions: Region[] = [];
  private readonly pondRegions: Region[] = [];
  private readonly seaRegions: Region[] = [];
  private readonly stones: { x: number; y: number; rx: number; ry: number }[] = [];
  private readonly hops: { a: Pt; b: Pt; hw: number }[] = [];
  private extraObstacles: Obstacle[] = [];
  private objs: Obj[] = [];
  private vertex: Corner[] = [];
  private mask: Obstacle[] | undefined;
  private index: ObstacleIndex | undefined;

  constructor(readonly opts: BuilderOpts) {
    this.width = opts.widthTiles * T;
    this.height = opts.heightTiles * T;
  }

  /** Adds ground the herd may walk on. Everything not opened is solid. */
  open(...r: Region[]): this {
    this.openRegions.push(...r);
    return this;
  }

  /**
   * Water the herd can go into: drawn as water and walked through, wading where it is shallow by
   * the shore and swimming farther out. Water outside it is deep and out of bounds, as a pond is.
   * It must lie inside open ground, as everything the herd walks on does.
   */
  sea(...r: Region[]): this {
    this.seaRegions.push(...r);
    this.pondRegions.push(...r);
    return this;
  }

  /**
   * A flat stone standing in the water that the herd can step onto: the ellipse `rx` wide and `ry`
   * deep round (x, y). Its picture is the author's to place.
   */
  stone(x: number, y: number, rx: number, ry: number): this {
    this.stones.push({ x, y, rx, ry });
    this.mask = undefined;
    this.index = undefined;
    return this;
  }

  /**
   * The little jump from one stone to the next: a strip of walkable water `hw` either side of the
   * line from `a` to `b`, so a gap between two stones is crossed and a stream of stones is a route.
   */
  hop(a: Pt, b: Pt, hw = 32): this {
    this.hops.push({ a, b, hw });
    this.mask = undefined;
    this.index = undefined;
    return this;
  }

  private onStone(x: number, y: number): boolean {
    return (
      this.stones.some((s) => ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 <= 1) ||
      this.hops.some((h) => {
        const ex = h.b.x - h.a.x,
          ey = h.b.y - h.a.y;
        const l2 = ex * ex + ey * ey;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - h.a.x) * ex + (y - h.a.y) * ey) / l2));
        return Math.hypot(x - (h.a.x + ex * t), y - (h.a.y + ey * t)) <= h.hw;
      })
    );
  }

  private inSea(x: number, y: number): boolean {
    return this.seaRegions.some((r) => r(x, y) > 0);
  }

  pathBand(...r: Region[]): this {
    this.pathRegions.push(...r);
    return this;
  }

  pond(...r: Region[]): this {
    this.pondRegions.push(...r);
    return this;
  }

  /**
   * Largest value over every opened region at a point: positive inside open ground, and by how
   * much.
   */
  openness(x: number, y: number): number {
    let best = -Infinity;
    for (const r of this.openRegions) best = Math.max(best, r(x, y));
    return best;
  }

  /** True when the point is on a path, or within `margin` units of one. */
  onPath(x: number, y: number, margin = 0): boolean {
    return this.pathRegions.some((r) => r(x, y) > -margin);
  }

  /** Positive when the point is in a pond. */
  pondness(x: number, y: number): number {
    let best = -Infinity;
    for (const r of this.pondRegions) best = Math.max(best, r(x, y));
    return best;
  }

  /**
   * The bilinear water weight of the terrain at a point, 0 on land and 1 in deep water. Valid after
   * `classify`.
   */
  waterAt(x: number, y: number): number {
    const gx = x / T,
      gy = y / T;
    const cx = Math.floor(gx),
      cy = Math.floor(gy);
    const fx = gx - cx,
      fy = gy - cy;
    const w = (i: number, j: number): number => (this.vertexAt(i, j) === 'water' ? 1 : 0);
    return (
      (1 - fy) * ((1 - fx) * w(cx, cy) + fx * w(cx + 1, cy)) + fy * ((1 - fx) * w(cx, cy + 1) + fx * w(cx + 1, cy + 1))
    );
  }

  vertexAt(i: number, j: number): Corner {
    const vx = this.opts.widthTiles + 1;
    if (i < 0 || j < 0 || i >= vx || j > this.opts.heightTiles) return 'grass';
    return this.vertex[j * vx + i]!;
  }

  /**
   * Paints the vertex classes from the path and pond regions. Water beats path wherever they would
   * share a tile.
   */
  classify(): void {
    const vx = this.opts.widthTiles + 1,
      vy = this.opts.heightTiles + 1;
    const cls: Corner[] = new Array<Corner>(vx * vy).fill('grass');
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        const x = i * T,
          y = j * T;
        if (this.pondness(x, y) > 0) cls[j * vx + i] = 'water';
        else if (this.pathRegions.some((r) => r(x, y) > 0)) cls[j * vx + i] = 'path';
      }
    }
    // A tile may not touch both water and path: the tileset has no such tile.
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        if (cls[j * vx + i] !== 'path') continue;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++)
            if (cls[(j + dj) * vx + (i + di)] === 'water' && j + dj >= 0 && i + di >= 0 && j + dj < vy && i + di < vx)
              cls[j * vx + i] = 'grass';
      }
    }
    this.vertex = cls;
    this.mask = undefined;
    this.index = undefined;
  }

  /**
   * How far a point is from the nearest rock, water, footprint or map edge as the game will measure
   * it, up to 96. Valid after `classify`.
   */
  clearanceAt(x: number, y: number): number {
    this.mask ??= this.maskRects();
    this.index ??= new ObstacleIndex(this.width, this.height, [...this.mask, ...this.extraObstacles]);
    return this.index.clearanceAt(x, y);
  }

  private check(sprite: string): void {
    if (!this.opts.sprites.has(sprite)) throw new Error(`${this.opts.id}: unknown sprite ${sprite}`);
  }

  /** Draws a sprite with its ground anchor at (x, y). */
  place(sprite: string, x: number, y: number, layer: DecorLayerName = 'object-bases', depthBias?: number): void {
    this.check(sprite);
    this.objs.push({
      layer,
      o: {
        name: '',
        type: 'decor',
        x: Math.round(x),
        y: Math.round(y),
        width: 0,
        height: 0,
        point: true,
        properties: toProperties({ sprite, depthBias }),
      },
    });
  }

  /** Draws a sprite and blocks its footprint with a circle. */
  solid(sprite: string, x: number, y: number): void {
    const r = this.opts.footprints[sprite];
    if (r === undefined) throw new Error(`${this.opts.id}: ${sprite} has no footprint`);
    this.place(sprite, x, y);
    this.extraObstacles.push({ kind: 'circle', x: Math.round(x), y: Math.round(y), r });
    this.index = undefined;
  }

  /** A footprint with no picture, for a prop that the game draws itself from its saved state. */
  footprint(sprite: string, x: number, y: number): void {
    const r = this.opts.footprints[sprite];
    if (r === undefined) throw new Error(`${this.opts.id}: ${sprite} has no footprint`);
    this.extraObstacles.push({ kind: 'circle', x: Math.round(x), y: Math.round(y), r });
    this.index = undefined;
  }

  block(o: Obstacle): void {
    this.extraObstacles.push(o);
    this.index = undefined;
  }

  /**
   * Takes away the scenery and footprints that stand inside a region, for ground that was opened
   * after the trees were planted.
   */
  clear(inside: Region): void {
    this.objs = this.objs.filter(({ o }) => o.type !== 'decor' || inside(o.x, o.y) <= 0);
    this.extraObstacles = this.extraObstacles.filter((ob) => ob.kind !== 'circle' || inside(ob.x, ob.y) <= 0);
    this.index = undefined;
  }

  private add(layer: string, o: Omit<TiledObject, 'id'>): void {
    this.objs.push({ layer, o });
  }

  spawn(name: string, facing: Facing, points: readonly Pt[]): void {
    const [p0, ...rest] = points;
    if (!p0) throw new Error('spawn needs points');
    this.add('spawns', {
      name,
      type: 'spawn',
      x: Math.round(p0.x),
      y: Math.round(p0.y),
      width: 0,
      height: 0,
      polyline: [{ x: 0, y: 0 }, ...rest.map((p) => ({ x: Math.round(p.x - p0.x), y: Math.round(p.y - p0.y) }))],
      properties: toProperties({ facing }),
    });
  }

  /**
   * Something to look up at. While the herd is near `stand` the camera makes room for `show`, and
   * keeps `below` units in view under the leader's feet if that is asked for. With `whole`, a
   * button near `stand` also lets a child stand back to see all of `whole.area`. A map has at most
   * one.
   */
  vista(o: {
    id: string;
    stand: Pt;
    radius: number;
    below?: number;
    show: { x: number; y: number; w: number; h: number };
    whole?: { area: { x: number; y: number; w: number; h: number }; word: string };
  }): void {
    const whole = o.whole
      ? {
          wholeX: Math.round(o.whole.area.x),
          wholeY: Math.round(o.whole.area.y),
          wholeW: Math.round(o.whole.area.w),
          wholeH: Math.round(o.whole.area.h),
          wholeWord: o.whole.word,
        }
      : {};
    this.add('vista', {
      name: o.id,
      type: 'vista',
      x: Math.round(o.show.x),
      y: Math.round(o.show.y),
      width: Math.round(o.show.w),
      height: Math.round(o.show.h),
      properties: toProperties({
        standX: Math.round(o.stand.x),
        standY: Math.round(o.stand.y),
        radius: Math.round(o.radius),
        below: o.below === undefined ? undefined : Math.round(o.below),
        ...whole,
      }),
    });
  }

  portal(o: {
    name: string;
    bounds: { x: number; y: number; w: number; h: number };
    approach: Pt;
    toMap: MapId;
    toSpawn: string;
    door?: string;
    ride?: 'up' | 'down';
  }): void {
    this.add('portals', {
      name: o.name,
      type: 'portal',
      x: o.bounds.x,
      y: o.bounds.y,
      width: o.bounds.w,
      height: o.bounds.h,
      properties: toProperties({
        approachX: o.approach.x,
        approachY: o.approach.y,
        toMap: o.toMap,
        toSpawn: o.toSpawn,
        door: o.door,
        ride: o.ride,
      }),
    });
  }

  interactable(o: {
    name: string;
    definitionId: string;
    hit: { x: number; y: number; w: number; h: number };
    pos?: Pt;
    approach: readonly { x: number; y: number; facing: Facing }[];
    anchor?: string;
    look?: string;
  }): void {
    this.add('interactables', {
      name: o.name,
      type: 'interactable',
      x: Math.round(o.hit.x),
      y: Math.round(o.hit.y),
      width: Math.round(o.hit.w),
      height: Math.round(o.hit.h),
      properties: toProperties({
        definitionId: o.definitionId,
        posX: o.pos ? Math.round(o.pos.x) : undefined,
        posY: o.pos ? Math.round(o.pos.y) : undefined,
        approach: o.approach.map((a) => `${Math.round(a.x)},${Math.round(a.y)},${a.facing}`).join(';'),
        anchor: o.anchor,
        look: o.look,
      }),
    });
  }

  anchor(o: {
    name: string;
    tags: readonly string[];
    capacity?: number;
    pos: Pt;
    approach: readonly { x: number; y: number; facing: Facing }[];
  }): void {
    this.add('activity-anchors', {
      name: o.name,
      type: 'anchor',
      x: Math.round(o.pos.x),
      y: Math.round(o.pos.y),
      width: 0,
      height: 0,
      point: true,
      properties: toProperties({
        tags: o.tags.join(','),
        capacity: o.capacity ?? 1,
        approach: o.approach.map((a) => `${Math.round(a.x)},${Math.round(a.y)},${a.facing}`).join(';'),
      }),
    });
  }

  encounter(o: {
    unicornId: string;
    home: Pt;
    greeting: Pt;
    facing: Facing;
    triggerRadius?: number;
    idleRadius?: number;
  }): void {
    this.add('encounters', {
      name: o.unicornId,
      type: 'encounter',
      x: Math.round(o.home.x),
      y: Math.round(o.home.y),
      width: 0,
      height: 0,
      point: true,
      properties: toProperties({
        facing: o.facing,
        greetingX: Math.round(o.greeting.x),
        greetingY: Math.round(o.greeting.y),
        triggerRadius: o.triggerRadius,
        idleRadius: o.idleRadius,
      }),
    });
  }

  /**
   * Somewhere creatures of one kind live: a rectangle, or the ellipse drawn inside it for a pond.
   */
  life(o: {
    name: string;
    kind: LifeKind;
    area: { x: number; y: number; w: number; h: number };
    shape?: 'rect' | 'ellipse';
    count: number;
  }): void {
    this.add('life', {
      name: o.name,
      type: 'life',
      x: Math.round(o.area.x),
      y: Math.round(o.area.y),
      width: Math.round(o.area.w),
      height: Math.round(o.area.h),
      ...(o.shape === 'ellipse' ? { ellipse: true } : {}),
      properties: toProperties({ kind: o.kind, count: o.count }),
    });
  }

  npc(npcId: string, start: Pt, facing: Facing): void {
    this.add('npcs', {
      name: npcId,
      type: 'npc',
      x: Math.round(start.x),
      y: Math.round(start.y),
      width: 0,
      height: 0,
      point: true,
      properties: toProperties({ facing }),
    });
  }

  /**
   * Solid cells of the 32 unit grid: not open ground, or inside a pond. Merged into as few
   * rectangles as possible.
   */
  private maskRects(): Obstacle[] {
    const cols = Math.ceil(this.width / CELL),
      rows = Math.ceil(this.height / CELL);
    const solid = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CELL,
          y = (r + 0.5) * CELL;
        const water = this.waterAt(x, y) > 0.5 && !this.inSea(x, y) && !this.onStone(x, y);
        solid[r * cols + c] = this.openness(x, y) <= 0 || water ? 1 : 0;
      }
    }
    // Horizontal runs, then merge identical runs on consecutive rows.
    interface Run {
      x0: number;
      x1: number;
      y0: number;
      y1: number;
    }
    const open: Run[] = [];
    const out: Run[] = [];
    for (let r = 0; r < rows; r++) {
      const runs: [number, number][] = [];
      let c = 0;
      while (c < cols) {
        if (!solid[r * cols + c]) {
          c++;
          continue;
        }
        const s = c;
        while (c < cols && solid[r * cols + c]) c++;
        runs.push([s, c]);
      }
      const next: Run[] = [];
      for (const [x0, x1] of runs) {
        const prev = open.find((o) => o.x0 === x0 && o.x1 === x1 && o.y1 === r);
        if (prev) {
          prev.y1 = r + 1;
          next.push(prev);
        } else next.push({ x0, x1, y0: r, y1: r + 1 });
      }
      for (const o of open) if (!next.includes(o)) out.push(o);
      open.length = 0;
      open.push(...next);
    }
    out.push(...open);
    return out.map((o) => ({
      kind: 'rect' as const,
      x: o.x0 * CELL,
      y: o.y0 * CELL,
      w: (o.x1 - o.x0) * CELL,
      h: (o.y1 - o.y0) * CELL,
    }));
  }

  /**
   * How deep the water is under each cell of the 32 unit grid: shallow within three cells of the
   * shore, deep beyond, and a stone where one stands in it. Undefined for a map with no sea and no
   * stones.
   */
  private waters(): Waters | undefined {
    if (this.seaRegions.length === 0 && this.stones.length === 0 && this.hops.length === 0) return undefined;
    const cols = Math.ceil(this.width / CELL),
      rows = Math.ceil(this.height / CELL);
    const wet = new Uint8Array(cols * rows);
    const depth = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CELL,
          y = (r + 0.5) * CELL;
        const here = r * cols + c;
        if (this.onStone(x, y)) depth[here] = 3;
        else if (this.waterAt(x, y) > 0.5 && this.inSea(x, y) && this.openness(x, y) > 0) wet[here] = 1;
      }
    }
    // How many cells from dry ground each wet cell is, by a sweep out from the shore.
    const dist = new Int16Array(cols * rows).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < wet.length; i++) {
      if (wet[i]) continue;
      dist[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const c = i % cols,
        r = Math.floor(i / cols);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = c + dc,
          nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (dist[j] !== -1) continue;
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
    for (let i = 0; i < wet.length; i++) if (wet[i] && depth[i] === 0) depth[i] = dist[i]! <= 3 ? 1 : 2;
    return packWaters(cols, rows, depth);
  }

  build(
    set: Tileset,
    sheet: { width: number; height: number; columns: number },
  ): { tmj: Record<string, unknown>; stats: BuildStats } {
    if (this.vertex.length === 0) this.classify();
    const W = this.opts.widthTiles,
      H = this.opts.heightTiles;
    const ground = new Array<number>(W * H).fill(0);
    const water = new Array<number>(W * H).fill(0);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const corners = [
          this.vertexAt(c, r),
          this.vertexAt(c + 1, r),
          this.vertexAt(c, r + 1),
          this.vertexAt(c + 1, r + 1),
        ];
        const pick = pickTile(set, corners, c, r, 0);
        if (!pick) throw new Error(`${this.opts.id}: no tile for corners ${corners.join(',')} at ${c},${r}`);
        (pick.layer === 'water' ? water : ground)[r * W + c] = pick.id + 1;
      }
    }

    const mask = this.maskRects();
    const obstacles: Obstacle[] = [...mask, ...this.extraObstacles];
    const collision: Obj[] = obstacles.map((ob) => ({ layer: 'collision', o: obstacleToObject(ob) }));

    const layerOrder = [
      'backdrop',
      'ground-detail',
      'object-bases',
      'foreground',
      'collision',
      'spawns',
      'portals',
      'interactables',
      'activity-anchors',
      'encounters',
      'npcs',
      'life',
      'vista',
    ];
    let nextId = 1;
    const groups = layerOrder.map((name) => {
      const mine = [...this.objs.filter((o) => o.layer === name), ...collision.filter((o) => o.layer === name)];
      // Decor reads best in drawing order, so a person reading the file sees back to front.
      if (name === 'object-bases' || name === 'ground-detail' || name === 'foreground' || name === 'backdrop')
        mine.sort((a, b) => a.o.y - b.o.y || a.o.x - b.o.x);
      return {
        type: 'objectgroup',
        id: 100 + layerOrder.indexOf(name),
        name,
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: mine.map((m) => ({ id: nextId++, rotation: 0, visible: true, ...m.o })),
      };
    });

    const tmj = {
      type: 'map',
      version: '1.10',
      tiledversion: '1.11.2',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: W,
      height: H,
      tilewidth: T,
      tileheight: T,
      nextlayerid: 200,
      nextobjectid: nextId,
      properties: toProperties({
        mapId: this.opts.id,
        tileset: this.opts.tileset,
        bundle: this.opts.bundle,
        music: this.opts.music,
        ambience: this.opts.ambience,
        start: this.opts.start,
        solo: this.opts.solo,
        waters: JSON.stringify(this.waters()),
      }),
      tilesets: [
        {
          firstgid: 1,
          name: this.opts.tileset,
          image: `tilesets/${this.opts.tileset}.png`,
          imagewidth: sheet.width,
          imageheight: sheet.height,
          tilewidth: T,
          tileheight: T,
          margin: 1,
          spacing: 2,
          columns: sheet.columns,
          tilecount: set.tiles.length,
        },
      ],
      layers: [
        {
          type: 'tilelayer',
          id: 1,
          name: 'ground',
          width: W,
          height: H,
          x: 0,
          y: 0,
          visible: true,
          opacity: 1,
          data: ground,
        },
        {
          type: 'tilelayer',
          id: 2,
          name: 'water',
          width: W,
          height: H,
          x: 0,
          y: 0,
          visible: true,
          opacity: 1,
          data: water,
        },
        ...groups,
      ],
    };
    return {
      tmj,
      stats: {
        obstacles: obstacles.length,
        decor: this.objs.filter((o) => o.o.type === 'decor').length,
        maskRects: mask.length,
      },
    };
  }
}

function obstacleToObject(o: Obstacle): Omit<TiledObject, 'id'> {
  switch (o.kind) {
    case 'rect':
      return { name: '', type: 'block', x: o.x, y: o.y, width: o.w, height: o.h };
    case 'circle':
      return { name: '', type: 'block', x: o.x - o.r, y: o.y - o.r, width: o.r * 2, height: o.r * 2, ellipse: true };
    case 'poly': {
      const [x0, y0] = o.pts[0]!;
      return {
        name: '',
        type: 'block',
        x: x0,
        y: y0,
        width: 0,
        height: 0,
        polygon: o.pts.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
      };
    }
  }
}
