import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIFE, LIFE_CAP } from '../../src/content/life';
import { PROP_DEFS } from '../../src/content/props';
import { doorways } from '../../src/domain/arrival';
import { CONFIG } from '../../src/domain/config';
import { inZone } from '../../src/domain/systems/life';
import { navFor } from '../../src/domain/world';
import { CompiledMap, DECOR_LAYERS, type Decor, type Vista } from '../../src/shared/compiled-map';
import { FACINGS, type Facing, MAP_IDS, type MapId, UNICORN_IDS } from '../../src/shared/ids';
import { LIFE_KINDS, type LifeKind } from '../../src/shared/life';
import type { MapAsset } from '../../src/shared/manifest';
import {
  type ActivityAnchor,
  type Approach,
  type Encounter,
  type Interactable,
  type LifeZone,
  LogicMap,
  type NpcPlacement,
  type Obstacle,
  type Portal,
  type SpawnGroup,
  TILE,
} from '../../src/shared/map';
import { factsOf } from './facts';
import { herdRoomProblems } from './herd-room';
import { prop, propNumber, propString, TiledMap, type TiledObject } from './tiled';

/** What the compile step knows about the assets a map may refer to. */
export interface CompileContext {
  /** Sprite ids available in each bundle. */
  sprites: Readonly<Record<string, ReadonlySet<string>>>;
  /** Tile counts per tileset. */
  tilesets: Readonly<Record<string, { count: number }>>;
}

interface Compiled {
  map: CompiledMap;
  /** Tiled-side names, for messages. */
  file: string;
}

const isFacing = (v: unknown): v is Facing => typeof v === 'string' && (FACINGS as readonly string[]).includes(v);

/** `x,y,facing;x,y,facing` */
function parseApproach(text: string, where: string, errors: string[]): Approach[] {
  const out: Approach[] = [];
  for (const part of text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [x, y, f] = part.split(',').map((s) => s.trim());
    if (
      x === undefined ||
      y === undefined ||
      !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(y)) ||
      !isFacing(f)
    ) {
      errors.push(`${where}: bad approach "${part}", expected x,y,facing`);
      continue;
    }
    out.push({ pos: { x: Number(x), y: Number(y) }, facing: f });
  }
  return out;
}

function toObstacle(o: TiledObject, where: string, errors: string[]): Obstacle | null {
  if (o.polygon) return { kind: 'poly', pts: o.polygon.map((p) => [o.x + p.x, o.y + p.y] as [number, number]) };
  if (o.ellipse) {
    if (Math.abs(o.width - o.height) > 0.5) {
      errors.push(`${where}: collision ellipses must be circles`);
      return null;
    }
    return { kind: 'circle', x: o.x + o.width / 2, y: o.y + o.height / 2, r: o.width / 2 };
  }
  if (o.point || o.width <= 0 || o.height <= 0) {
    errors.push(`${where}: collision objects must be rectangles, circles or polygons`);
    return null;
  }
  return { kind: 'rect', x: o.x, y: o.y, w: o.width, h: o.height };
}

const layerObjects = (m: TiledMap, name: string): TiledObject[] =>
  m.layers.flatMap((l) => (l.type === 'objectgroup' && l.name === name ? l.objects : []));

/** Reads one Tiled map and returns the compiled map, or every problem found. */
function compileTiled(file: string, raw: unknown, ctx: CompileContext): { compiled?: Compiled; errors: string[] } {
  const errors: string[] = [];
  const parsed = TiledMap.safeParse(raw);
  if (!parsed.success)
    return {
      errors: [
        `${file}: not a supported Tiled map: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      ],
    };
  const tm = parsed.data;
  const mapProps = { properties: tm.properties };
  const idText = prop(mapProps, 'mapId');
  if (typeof idText !== 'string' || !(MAP_IDS as readonly string[]).includes(idText))
    return { errors: [`${file}: mapId must be one of ${MAP_IDS.join(', ')}`] };
  const mapId = idText as MapId;
  const at = (obj: TiledObject, kind: string): string => `${mapId} ${kind} "${obj.name}" (#${obj.id})`;

  const tilesetName = propString(mapProps, 'tileset', file);
  const bundle = propString(mapProps, 'bundle', file);
  const tileset = ctx.tilesets[tilesetName];
  const sprites = ctx.sprites[bundle];
  if (!tileset) errors.push(`${file}: unknown tileset ${tilesetName}`);
  if (!sprites) errors.push(`${file}: unknown bundle ${bundle}`);
  const firstgid = tm.tilesets[0]!.firstgid;

  const tileLayer = (name: string, required: boolean): number[] => {
    const l = tm.layers.find((x) => x.type === 'tilelayer' && x.name === name);
    if (l?.type !== 'tilelayer') {
      if (required) errors.push(`${file}: missing tile layer ${name}`);
      return new Array<number>(tm.width * tm.height).fill(-1);
    }
    if (l.width !== tm.width || l.height !== tm.height || l.data.length !== tm.width * tm.height)
      errors.push(`${file}: layer ${name} does not match the map size`);
    return l.data.map((gid) => {
      if (gid === 0) return -1;
      const id = gid - firstgid;
      if (id < 0 || (tileset && id >= tileset.count))
        errors.push(`${file}: layer ${name} has tile ${gid} outside tileset ${tilesetName}`);
      return id;
    });
  };
  const ground = tileLayer('ground', true);
  const water = tileLayer('water', false);

  // Logic objects
  const obstacles = layerObjects(tm, 'collision').flatMap((o) => {
    const ob = toObstacle(o, at(o, 'collision'), errors);
    return ob ? [ob] : [];
  });

  const spawns: SpawnGroup[] = layerObjects(tm, 'spawns').flatMap((o) => {
    const pts = o.polyline ?? o.polygon;
    const f = prop(o, 'facing');
    if (!pts || !isFacing(f)) {
      errors.push(`${at(o, 'spawn')}: needs a polyline and a facing`);
      return [];
    }
    return [{ spawnId: o.name, facing: f, points: pts.map((p) => ({ x: o.x + p.x, y: o.y + p.y })) }];
  });

  const portals: Portal[] = layerObjects(tm, 'portals').flatMap((o) => {
    try {
      const door = prop(o, 'door');
      const p: Portal = {
        portalId: o.name,
        bounds: { x: o.x, y: o.y, w: o.width, h: o.height },
        approach: { x: propNumber(o, 'approachX', at(o, 'portal')), y: propNumber(o, 'approachY', at(o, 'portal')) },
        to: {
          mapId: propString(o, 'toMap', at(o, 'portal')) as MapId,
          spawnId: propString(o, 'toSpawn', at(o, 'portal')),
        },
      };
      if (typeof door === 'string') p.door = `${mapId}/${door}`;
      const ride = prop(o, 'ride');
      if (ride === 'up' || ride === 'down') p.ride = ride;
      return [p];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });

  const interactables: Interactable[] = layerObjects(tm, 'interactables').flatMap((o) => {
    try {
      const w = at(o, 'interactable');
      const anchor = prop(o, 'anchor');
      const look = prop(o, 'look');
      const it: Interactable = {
        instanceId: `${mapId}/${o.name}`,
        definitionId: propString(o, 'definitionId', w),
        pos: { x: propNumber(o, 'posX', w, o.x + o.width / 2), y: propNumber(o, 'posY', w, o.y + o.height) },
        hit: { x: o.x, y: o.y, w: o.width, h: o.height },
        approach: parseApproach(propString(o, 'approach', w), w, errors),
      };
      if (typeof anchor === 'string') it.anchor = `${mapId}/${anchor}`;
      if (typeof look === 'string') it.look = look;
      return [it];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });

  const anchors: ActivityAnchor[] = layerObjects(tm, 'activity-anchors').flatMap((o) => {
    try {
      const w = at(o, 'anchor');
      return [
        {
          anchorId: `${mapId}/${o.name}`,
          tags: propString(o, 'tags', w)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          capacity: propNumber(o, 'capacity', w, 1),
          pos: { x: o.x, y: o.y },
          approach: parseApproach(propString(o, 'approach', w), w, errors),
        },
      ];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });

  const encounters: Encounter[] = layerObjects(tm, 'encounters').flatMap((o) => {
    try {
      const w = at(o, 'encounter');
      const f = prop(o, 'facing');
      if (!isFacing(f) || !(UNICORN_IDS as readonly string[]).includes(o.name))
        throw new Error(`${w}: name must be a unicorn id and facing a direction`);
      return [
        {
          unicornId: o.name as Encounter['unicornId'],
          home: { x: o.x, y: o.y },
          greeting: { x: propNumber(o, 'greetingX', w), y: propNumber(o, 'greetingY', w) },
          facing: f,
          triggerRadius: propNumber(o, 'triggerRadius', w, 160),
          idleRadius: propNumber(o, 'idleRadius', w, 90),
        },
      ];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });

  const npcs: NpcPlacement[] = layerObjects(tm, 'npcs').flatMap((o) => {
    const f = prop(o, 'facing');
    if (!isFacing(f)) {
      errors.push(`${at(o, 'npc')}: needs a facing`);
      return [];
    }
    return [{ npcId: o.name as NpcPlacement['npcId'], start: { x: o.x, y: o.y }, facing: f }];
  });

  const life: LifeZone[] = layerObjects(tm, 'life').flatMap((o) => {
    try {
      const w = at(o, 'life zone');
      const kind = prop(o, 'kind');
      if (typeof kind !== 'string' || !(LIFE_KINDS as readonly string[]).includes(kind))
        throw new Error(`${w}: kind must be one of ${LIFE_KINDS.join(', ')}`);
      return [
        {
          zoneId: o.name,
          kind: kind as LifeKind,
          area: { x: o.x, y: o.y, w: o.width, h: o.height },
          shape: o.ellipse ? ('ellipse' as const) : ('rect' as const),
          count: propNumber(o, 'count', w, 1),
        },
      ];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });

  const startProp = prop(mapProps, 'start');
  const audioMusic = prop(mapProps, 'music');
  const audioAmbience = prop(mapProps, 'ambience');
  const solo = prop(mapProps, 'solo') === true;
  const logicRaw = {
    schemaVersion: 1,
    id: mapId,
    widthTiles: tm.width,
    heightTiles: tm.height,
    obstacles,
    spawns,
    ...(typeof startProp === 'string' ? { start: startProp } : {}),
    ...(solo ? { solo: true } : {}),
    portals,
    interactables,
    anchors,
    encounters,
    npcs,
    life,
    audio: { music: audioMusic, ambience: audioAmbience },
  };
  const logic = LogicMap.safeParse(logicRaw);
  if (!logic.success) {
    for (const i of logic.error.issues.slice(0, 8)) errors.push(`${mapId}: ${i.path.join('.')}: ${i.message}`);
    return { errors };
  }

  // Render objects
  const decor: Decor[] = [];
  for (const layer of DECOR_LAYERS) {
    for (const o of layerObjects(tm, layer)) {
      const sprite = prop(o, 'sprite');
      if (typeof sprite !== 'string') {
        errors.push(`${at(o, layer)}: needs a sprite property`);
        continue;
      }
      if (sprites && !sprites.has(sprite)) errors.push(`${at(o, layer)}: unknown sprite ${sprite} in bundle ${bundle}`);
      const bias = prop(o, 'depthBias');
      decor.push({ layer, sprite, x: o.x, y: o.y, ...(typeof bias === 'number' ? { depthBias: bias } : {}) });
    }
  }

  const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x <= tm.width * TILE && y <= tm.height * TILE;
  const vistas: Vista[] = layerObjects(tm, 'vista').flatMap((o) => {
    try {
      const where = at(o, 'vista');
      const v: Vista = {
        id: o.name,
        stand: { x: propNumber(o, 'standX', where), y: propNumber(o, 'standY', where) },
        radius: propNumber(o, 'radius', where),
        show: { x: o.x, y: o.y, w: o.width, h: o.height },
      };
      if (prop(o, 'below') !== undefined) v.below = propNumber(o, 'below', where);
      if (
        !inMap(v.stand.x, v.stand.y) ||
        !inMap(v.show.x, v.show.y) ||
        !inMap(v.show.x + v.show.w, v.show.y + v.show.h)
      )
        errors.push(`${where}: the place to stand and what to show must be inside the map`);
      if (prop(o, 'wholeWord') !== undefined) {
        const word = propString(o, 'wholeWord', where);
        const area = {
          x: propNumber(o, 'wholeX', where),
          y: propNumber(o, 'wholeY', where),
          w: propNumber(o, 'wholeW', where),
          h: propNumber(o, 'wholeH', where),
        };
        if (!inMap(area.x, area.y) || !inMap(area.x + area.w, area.y + area.h))
          errors.push(`${where}: the whole of what the button shows must be inside the map`);
        v.whole = { area, word };
      }
      return [v];
    } catch (e) {
      errors.push((e as Error).message);
      return [];
    }
  });
  if (vistas.length > 1) errors.push(`${mapId}: a map has at most one vista, found ${vistas.length}`);

  crossCheck(logic.data, errors);
  const map: CompiledMap = {
    schemaVersion: 1,
    logic: logic.data,
    render: { tileset: tilesetName, bundle, ground, water, decor, ...(vistas[0] ? { vista: vistas[0] } : {}) },
  };
  const full = CompiledMap.safeParse(map);
  if (!full.success) {
    errors.push(`${mapId}: ${full.error.issues[0]?.path.join('.')}: ${full.error.issues[0]?.message}`);
    return { errors };
  }
  return { compiled: { map: full.data, file }, errors };
}

/** Everything about a map that can be checked without knowing the other maps. */
export function crossCheck(map: LogicMap, errors: string[]): void {
  const id = map.id;
  const nav = navFor(map);
  const w = map.widthTiles * TILE,
    h = map.heightTiles * TILE;
  const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;

  const seen = new Map<string, string>();
  const unique = (kind: string, key: string): void => {
    const prev = seen.get(`${kind}:${key}`);
    if (prev) errors.push(`${id}: duplicate ${kind} id ${key}`);
    seen.set(`${kind}:${key}`, kind);
  };
  map.spawns.forEach((s) => {
    unique('spawn', s.spawnId);
  });
  map.portals.forEach((p) => {
    unique('portal', p.portalId);
  });
  map.interactables.forEach((i) => {
    unique('interactable', i.instanceId);
  });
  map.anchors.forEach((a) => {
    unique('anchor', a.anchorId);
  });
  map.encounters.forEach((e) => {
    unique('encounter', e.unicornId);
  });

  const first = map.spawns.find((s) => s.spawnId === map.start) ?? map.spawns[0]!;
  if (map.start !== undefined && !map.spawns.some((s) => s.spawnId === map.start))
    errors.push(`${id}: start spawn ${map.start} does not exist`);
  const home = first.points[0]!;
  if (!nav.isWalkable(home, 2)) errors.push(`${id}: the first spawn point of ${first.spawnId} is not walkable`);
  const mustReach = (what: string, p: { x: number; y: number }, margin = 2): void => {
    if (!inside(p)) errors.push(`${id}: ${what} lies outside the map`);
    else if (!nav.isWalkable(p, margin))
      errors.push(
        `${id}: ${what} (${Math.round(p.x)}, ${Math.round(p.y)}) is not walkable, clearance ${Math.round(nav.clearanceAt(p))} of ${nav.radius + margin}`,
      );
    else if (!nav.sameComponent(home, p))
      errors.push(`${id}: ${what} (${Math.round(p.x)}, ${Math.round(p.y)}) cannot be reached from the start`);
  };

  for (const s of map.spawns) {
    s.points.forEach((p, i) => {
      mustReach(`spawn ${s.spawnId} point ${i}`, p);
    });
    errors.push(...herdRoomProblems(nav, s, doorways(map), id, map.solo === true));
  }
  for (const p of map.portals) {
    mustReach(`portal ${p.portalId} approach`, p.approach);
    if (p.door && !map.interactables.some((i) => i.instanceId === p.door))
      errors.push(`${id}: portal ${p.portalId} names door ${p.door}, which is not an interactable`);
  }
  for (const i of map.interactables) {
    const def = PROP_DEFS[i.definitionId];
    if (!def) errors.push(`${id}: ${i.instanceId} uses unknown definition ${i.definitionId}`);
    else if (def.looks && (!i.look || !def.looks.includes(i.look)))
      errors.push(`${id}: ${i.instanceId} needs a look, one of ${def.looks.join(', ')}`);
    else if (!def.looks && i.look)
      errors.push(`${id}: ${i.instanceId} names look ${i.look}, but ${i.definitionId} has only one`);
    if (!inside(i.pos)) errors.push(`${id}: ${i.instanceId} lies outside the map`);
    i.approach.forEach((a, n) => {
      mustReach(`${i.instanceId} approach ${n}`, a.pos);
    });
    if (i.anchor && !map.anchors.some((a) => a.anchorId === i.anchor))
      errors.push(`${id}: ${i.instanceId} names anchor ${i.anchor}, which does not exist`);
  }
  for (const a of map.anchors) {
    if (a.approach.length < a.capacity)
      errors.push(
        `${id}: anchor ${a.anchorId} has capacity ${a.capacity} but only ${a.approach.length} standing places`,
      );
    a.approach.forEach((p, n) => {
      mustReach(`${a.anchorId} standing place ${n}`, p.pos);
    });
  }
  for (const e of map.encounters) {
    mustReach(`${e.unicornId} greeting point`, e.greeting);
    mustReach(`${e.unicornId} home`, e.home);
  }
  for (const n of map.npcs) mustReach(`${n.npcId} start`, n.start);
  lifeProblems(map, errors);
}

/**
 * What a life zone needs: to be on the map, to hold the room its creatures live on, and no more
 * creatures than a phone can draw.
 */
function lifeProblems(map: LogicMap, errors: string[]): void {
  const id = map.id;
  const nav = navFor(map);
  const w = map.widthTiles * TILE,
    h = map.heightTiles * TILE;
  const zoneIds = new Set<string>();
  let creatures = 0;
  for (const z of map.life) {
    if (zoneIds.has(z.zoneId)) errors.push(`${id}: duplicate life zone ${z.zoneId}`);
    zoneIds.add(z.zoneId);
    creatures += z.count;
    const a = z.area;
    if (a.x < 0 || a.y < 0 || a.x + a.w > w || a.y + a.h > h)
      errors.push(`${id}: life zone ${z.zoneId} reaches outside the map`);
    const home = LIFE[z.kind].home;
    if (home === 'air') continue;
    // Walk a grid over the zone: ground creatures need room to stand, and water ones must be on the
    // water, which the map treats as solid.
    let inside = 0,
      fit = 0;
    for (let y = a.y; y <= a.y + a.h; y += 16) {
      for (let x = a.x; x <= a.x + a.w; x += 16) {
        if (!inZone(z, { x, y })) continue;
        inside++;
        const room = nav.clearanceAt({ x, y });
        // A point on the seam between two solid blocks has no room at all, which still counts as
        // being in the pond.
        if (home === 'ground' ? room >= CONFIG.life.clearance : room <= 0) fit++;
      }
    }
    if (home === 'ground' && fit < Math.max(6, z.count * 5))
      errors.push(
        `${id}: life zone ${z.zoneId} (${z.kind}) has room for ${fit} spots on the ground and needs ${Math.max(6, z.count * 5)}`,
      );
    if (home === 'water' && (inside === 0 || fit / inside < 0.9))
      errors.push(
        `${id}: life zone ${z.zoneId} (${z.kind}) is only ${Math.round((100 * fit) / Math.max(1, inside))}% on water, and must be at least 90%`,
      );
  }
  if (creatures > LIFE_CAP) errors.push(`${id}: ${creatures} creatures live here, and ${LIFE_CAP} is the most`);
}

/** What the manifest keeps of a compiled map. */
export interface MapOutput extends MapAsset {
  id: MapId;
}

/**
 * Compiles every `.tmj` in `srcDir` and writes hashed runtime JSON into `outDir`. Throws with all
 * problems at once.
 */
export function compileAll(srcDir: string, outDir: string, ctx: CompileContext): MapOutput[] {
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.tmj'))
    .sort();
  const errors: string[] = [];
  const compiled: Compiled[] = [];
  for (const f of files) {
    const r = compileTiled(f, JSON.parse(readFileSync(join(srcDir, f), 'utf8')) as unknown, ctx);
    errors.push(...r.errors);
    if (r.compiled) compiled.push(r.compiled);
  }
  const byId = new Map(compiled.map((c) => [c.map.logic.id, c.map.logic]));
  for (const c of compiled) {
    for (const p of c.map.logic.portals) {
      const target = byId.get(p.to.mapId);
      if (!target)
        errors.push(`${c.map.logic.id}: portal ${p.portalId} leads to ${p.to.mapId}, which was not compiled`);
      else if (!target.spawns.some((s) => s.spawnId === p.to.spawnId))
        errors.push(`${c.map.logic.id}: portal ${p.portalId} leads to missing spawn ${p.to.spawnId} on ${p.to.mapId}`);
    }
  }
  if (errors.length > 0) throw new Error(`maps do not compile:\n  ${errors.join('\n  ')}`);

  mkdirSync(outDir, { recursive: true });
  const outputs: MapOutput[] = [];
  const keep = new Set<string>();
  for (const c of compiled) {
    const json = JSON.stringify(c.map);
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 10);
    const name = `${c.map.logic.id}.${hash}.json`;
    writeFileSync(join(outDir, name), json);
    keep.add(name);
    outputs.push({
      id: c.map.logic.id,
      file: `maps/${name}`,
      bundle: c.map.render.bundle,
      tileset: c.map.render.tileset,
      ...factsOf(c.map.logic),
    });
  }
  for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(join(outDir, f));
  return outputs;
}
