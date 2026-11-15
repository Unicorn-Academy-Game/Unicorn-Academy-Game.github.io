import { ObstacleIndex } from '../../../src/domain/nav/obstacles';
import type { AmbienceId } from '../../../src/shared/audio';
import type { Facing, MapId } from '../../../src/shared/ids';
import type { LifeKind } from '../../../src/shared/life';
import type { Obstacle } from '../../../src/shared/map';
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
  music: 'forest' | 'garden' | 'quiet';
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
        solid[r * cols + c] = this.openness(x, y) <= 0 || this.waterAt(x, y) > 0.5 ? 1 : 0;
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
