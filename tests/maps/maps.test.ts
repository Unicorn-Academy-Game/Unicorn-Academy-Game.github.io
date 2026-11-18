import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AMBIENCE_ZONES } from '../../src/content/ambience-zones';
import { ARCH_PIECES, pieceId } from '../../src/content/fountain-rainbow';
import { LIFE, LIFE_CAP } from '../../src/content/life';
import { NPC_DEFS } from '../../src/content/npcs';
import { FOOD_IDS } from '../../src/content/produce';
import { GEM_TABLES, gemOn, PROP_DEFS, tableOf } from '../../src/content/props';
import { isWonder, WONDERS } from '../../src/content/wonders';
import { checkInvariants } from '../../src/domain/invariants';
import { unicornList } from '../../src/domain/ops';
import { dispatch, step } from '../../src/domain/world';
import { standingDepth } from '../../src/render/depth';
import { drawProp, QUILT_BIAS } from '../../src/render/prop-visuals';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId, UNICORN_IDS } from '../../src/shared/ids';
import { LIFE_KINDS } from '../../src/shared/life';
import type { LogicMap } from '../../src/shared/map';
import { portalMark, TILE } from '../../src/shared/map';
import { HEART_CANVAS, renderHeartCrystals } from '../../tools/art/world/cave-grand';
import { ARCH_CANVAS } from '../../tools/art/world/fountain-rainbow';
import { RECIPES } from '../../tools/assets/env/registry';
import { mapContext } from '../../tools/maps/build-maps';
import { type CompileContext, compileAll, crossCheck } from '../../tools/maps/compile';
import { makeWorld, run } from '../domain/fixtures';
import { picturesOf } from '../render/pictures';

/** The rooms of the palace beyond the throne room. */
const PALACE_ROOM_IDS = MAP_IDS.filter(
  (id) => id.startsWith('palace-') && id !== 'palace-garden' && id !== 'palace-hall',
);

let ctx: CompileContext;
let dir: string;
let maps: Record<MapId, CompiledMap>;

beforeAll(() => {
  ctx = mapContext();
  dir = mkdtempSync(join(tmpdir(), 'unicorn-maps-'));
  // Compiling also proves every portal leads to a spawn that exists.
  const out = compileAll('assets/maps', dir, ctx);
  maps = Object.fromEntries(
    out.map((o) => [
      o.id,
      CompiledMap.parse(JSON.parse(readFileSync(join(dir, o.file.replace(/^maps\//, '')), 'utf8'))),
    ]),
  ) as Record<MapId, CompiledMap>;
}, 300_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const logic = (id: MapId) => maps[id].logic;
const anchorsTagged = (id: MapId, tag: string) => logic(id).anchors.filter((a) => a.tags.includes(tag));
const near = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('the six maps', () => {
  it('exist, at their sizes', () => {
    expect([...MAP_IDS].sort()).toEqual([
      'beach',
      'crystal-cave',
      'dance-floor',
      'forest',
      'magic-hall',
      'manor-hall',
      'manor-upper',
      'palace-ballroom',
      'palace-bedroom',
      'palace-dining',
      'palace-flowers',
      'palace-gallery',
      'palace-garden',
      'palace-hall',
      'palace-jewel',
      'palace-library',
      'palace-music',
      'palace-tea',
      'playground',
      'river',
      'santa-cabin',
      'santa-grove',
      'stable',
      'treasure-house',
      'witch-hut',
    ]);
    const size = (id: MapId) => [logic(id).widthTiles, logic(id).heightTiles];
    expect(size('forest')).toEqual([64, 48]);
    expect(size('palace-garden')).toEqual([80, 64]);
    expect(size('treasure-house')).toEqual([24, 18]);
    expect(size('palace-hall')).toEqual([40, 18]);
    expect(size('stable')).toEqual([32, 24]);
    expect(size('playground')).toEqual([40, 28]);
    expect(size('dance-floor')).toEqual([40, 26]);
    expect(size('crystal-cave')).toEqual([52, 42]);
    expect(size('river')).toEqual([80, 56]);
    expect(size('beach')).toEqual([64, 44]);
    expect(size('magic-hall')).toEqual([40, 18]);
    expect(size('witch-hut')).toEqual([24, 18]);
    expect(size('santa-grove')).toEqual([56, 42]);
    expect(size('santa-cabin')).toEqual([24, 18]);
    for (const [id, tiles] of [
      ['palace-dining', 40],
      ['palace-tea', 24],
      ['palace-bedroom', 24],
      ['palace-flowers', 24],
      ['palace-gallery', 40],
      ['palace-library', 32],
      ['palace-music', 32],
      ['palace-ballroom', 40],
      ['palace-jewel', 24],
    ] as const)
      expect(size(id), id).toEqual([tiles, 18]);
  });

  it('are drawn from the bundle and tileset that belong to them', () => {
    expect(maps.forest.render.bundle).toBe('forest');
    expect(maps['palace-garden'].render.bundle).toBe('garden');
    expect(maps['treasure-house'].render.bundle).toBe('treasure-house');
    expect(maps['palace-hall'].render.bundle).toBe('palace-hall');
    for (const id of PALACE_ROOM_IDS) expect(maps[id].render.bundle, id).toBe('palace-hall');
    expect(maps.stable.render.bundle).toBe('stable');
    expect(maps.playground.render.bundle).toBe('playground');
    expect(maps['dance-floor'].render.bundle).toBe('playground');
    expect(maps['dance-floor'].render.tileset).toBe('dance-floor');
    expect(maps['crystal-cave'].render.bundle).toBe('cave');
    expect(maps['crystal-cave'].render.tileset).toBe('crystal-cave');
    for (const id of MAP_IDS) {
      for (const d of maps[id].render.decor)
        expect(ctx.sprites[maps[id].render.bundle]!.has(d.sprite), `${id} places ${d.sprite}`).toBe(true);
      const tiles = ctx.tilesets[maps[id].render.tileset]!.count;
      expect(Math.max(...maps[id].render.ground)).toBeLessThan(tiles);
    }
  });

  it('give every portal a way back, so the herd is never stranded', () => {
    // The dancing game ends on the dance floor and nothing else leads there, so it has a way out
    // and no door to come in by.
    for (const id of MAP_IDS.filter((m) => m !== 'dance-floor')) {
      for (const p of logic(id).portals) {
        const target = logic(p.to.mapId);
        expect(
          target.portals.some((q) => q.to.mapId === id),
          `${p.to.mapId} has no portal back to ${id}`,
        ).toBe(true);
      }
    }
  });

  it('give two portals the same name only when they lead to the same map, because a bubble at the edge of the screen is kept by that name', () => {
    const leads = new Map<string, Set<MapId>>();
    for (const id of MAP_IDS)
      for (const p of logic(id).portals) leads.set(p.portalId, (leads.get(p.portalId) ?? new Set()).add(p.to.mapId));
    for (const [name, to] of leads) expect([...to], `${name} leads to more than one map`).toHaveLength(1);
  });

  it('open every door onto a portal and give every portal with a door a door to open', () => {
    for (const id of MAP_IDS) {
      const l = logic(id);
      for (const i of l.interactables.filter((x) => PROP_DEFS[x.definitionId]?.tap === 'door'))
        expect(
          l.portals.some((p) => p.door === i.instanceId),
          `${i.instanceId} has no portal`,
        ).toBe(true);
      for (const p of l.portals.filter((x) => x.door))
        expect(l.interactables.some((i) => i.instanceId === p.door)).toBe(true);
    }
  });

  it('draw every prop from sprites that their own bundle holds', () => {
    for (const id of MAP_IDS) {
      const bundle = ctx.sprites[maps[id].render.bundle]!;
      for (const i of logic(id).interactables) {
        const def = PROP_DEFS[i.definitionId]!;
        for (const { layers } of picturesOf(def, [i.look]))
          for (const l of layers)
            expect(
              bundle.has(l.sprite),
              `${i.instanceId} (${i.definitionId}) draws ${l.sprite}, which ${maps[id].render.bundle} lacks`,
            ).toBe(true);
      }
    }
  });

  it('keep every interactable inside the map and give each a tap target that contains its ground point', () => {
    for (const id of MAP_IDS) {
      for (const i of logic(id).interactables) {
        const h = i.hit;
        expect(
          i.pos.x >= h.x && i.pos.x <= h.x + h.w && i.pos.y >= h.y && i.pos.y <= h.y + h.h + 40,
          `${i.instanceId}: its ground point is outside its tap area`,
        ).toBe(true);
        expect(h.w, `${i.instanceId} tap width`).toBeGreaterThanOrEqual(64);
        expect(h.h, `${i.instanceId} tap height`).toBeGreaterThanOrEqual(64);
      }
    }
  });

  it('centre every ambience zone on the place it is for, within reach of its door', () => {
    for (const zone of AMBIENCE_ZONES) {
      const door = logic(zone.mapId).interactables.find((i) => i.instanceId.endsWith('/manor-door-1'))!;
      expect(
        Math.hypot(zone.at.x - door.pos.x, zone.at.y - door.pos.y),
        `${zone.ambience} zone is far from the manor door`,
      ).toBeLessThan(220);
      expect(zone.radius).toBeGreaterThan(400);
    }
  });

  it('never let two tap targets overlap in the Spooky Manor, so a touch always means one thing', () => {
    const near = (id: string, i: { instanceId: string }) =>
      id !== 'forest' || /\/(manor-|jack-o-lantern)/.test(i.instanceId);
    for (const id of ['forest', 'manor-hall', 'manor-upper'] as const) {
      const all = logic(id).interactables.filter((i) => near(id, i));
      for (const [n, a] of all.entries()) {
        for (const b of all.slice(n + 1)) {
          const apart =
            a.hit.x + a.hit.w <= b.hit.x ||
            b.hit.x + b.hit.w <= a.hit.x ||
            a.hit.y + a.hit.h <= b.hit.y ||
            b.hit.y + b.hit.h <= a.hit.y;
          expect(apart, `${id}: ${a.instanceId} and ${b.instanceId} overlap`).toBe(true);
        }
      }
    }
  });
});

describe('the forest', () => {
  it('holds each friend once, and nobody else', () => {
    expect(
      logic('forest')
        .encounters.map((e) => e.unicornId)
        .sort(),
    ).toEqual(UNICORN_IDS.filter((u) => u !== 'wildstar').sort());
  });
  it('starts the game at the start spawn', () => {
    expect(logic('forest').start).toBeTruthy();
  });
});

describe('the palace garden', () => {
  const l = () => logic('palace-garden');

  it('has beds for the gardener, two cups with room for one, and a palace door', () => {
    expect(anchorsTagged('palace-garden', 'garden-bed').length).toBeGreaterThanOrEqual(3);
    const cups = l().interactables.filter((i) => i.definitionId === 'cup');
    expect(cups).toHaveLength(2);
    for (const c of cups) {
      const a = l().anchors.find((x) => x.anchorId === c.anchor)!;
      expect(a.capacity).toBe(1);
      expect(a.tags).toContain('drink');
    }
    expect(l().interactables.some((i) => i.definitionId === 'palace-door')).toBe(true);
    expect(l().npcs.map((n) => n.npcId)).toEqual(['gardener']);
  });

  it('offers every reaction a prop for each of the six spells', () => {
    const defs = new Set(l().interactables.map((i) => i.definitionId));
    for (const needed of [
      'lantern',
      'flowerbed',
      'ice-display',
      'fountain-spout',
      'brazier',
      'pinwheel',
      'weather-ornament',
    ])
      expect(defs.has(needed), `no ${needed}`).toBe(true);
  });

  it('shows each bed in its own shape', () => {
    expect(
      new Set(
        l()
          .interactables.filter((i) => i.definitionId === 'flowerbed')
          .map((i) => i.look),
      ),
    ).toEqual(new Set(['long', 'square', 'round']));
  });

  it('has one reading computer, where the piano would stand if the garden were turned about the palace door, so that the two flank it', () => {
    expect(
      l()
        .interactables.filter((i) => i.definitionId === 'computer')
        .map((i) => i.instanceId),
    ).toEqual(['palace-garden/computer-1']);
    const at = (name: string) => l().interactables.find((i) => i.instanceId === `palace-garden/${name}`)!;
    const [door, piano, computer] = [at('palace-door'), at('piano-1'), at('computer-1')];
    expect(computer.pos.x - door.pos.x).toBe(door.pos.x - piano.pos.x);
    expect(computer.pos.y).toBe(piano.pos.y);
    expect([computer.hit.w, computer.hit.h]).toEqual([piano.hit.w, piano.hit.h]);
    // She walks up to it from the same side, to the same distance, and faces it.
    expect(computer.approach[0]!.pos.y - computer.pos.y).toBe(piano.approach[0]!.pos.y - piano.pos.y);
    expect(computer.approach[0]!.facing).toBe(piano.approach[0]!.facing);
  });

  it('keeps every learning game in front of the palace: the reading computer and the two tables stand on one line, a short walk south of the door, and the tables are the pair nearest to it', () => {
    const at = (name: string) => l().interactables.find((i) => i.instanceId === `palace-garden/${name}`)!;
    const [door, piano, memory, abacus, computer] = [
      at('palace-door'),
      at('piano-1'),
      at('memory-table-1'),
      at('abacus-1'),
      at('computer-1'),
    ];
    expect(
      l()
        .interactables.filter((i) => PROP_DEFS[i.definitionId]?.minigame === 'memory')
        .map((i) => i.instanceId),
    ).toEqual(['palace-garden/memory-table-1']);
    expect(
      l()
        .interactables.filter((i) => PROP_DEFS[i.definitionId]?.minigame === 'maths')
        .map((i) => i.instanceId),
    ).toEqual(['palace-garden/abacus-1']);
    for (const game of [memory, abacus, computer]) {
      expect(
        game.pos.y - door.pos.y,
        `${game.instanceId} is south of the door, not further than the plaza`,
      ).toBeGreaterThan(200);
      expect(game.pos.y - door.pos.y).toBeLessThan(450);
      expect(
        Math.abs(game.pos.x - door.pos.x),
        `${game.instanceId} is beside the promenade that leads to the door`,
      ).toBeLessThan(700);
      expect(game.pos.y).toBe(piano.pos.y);
    }
    // The tables flank the door the way the piano and the computer do, between them, so that the
    // four stand in a row of the same size and the same way to walk up to.
    expect(abacus.pos.x - door.pos.x).toBe(door.pos.x - memory.pos.x);
    expect(piano.pos.x).toBeLessThan(memory.pos.x);
    expect(abacus.pos.x).toBeLessThan(computer.pos.x);
    for (const table of [memory, abacus]) {
      expect([table.hit.w, table.hit.h]).toEqual([piano.hit.w, piano.hit.h]);
      expect(table.approach[0]!.pos.y - table.pos.y).toBe(piano.approach[0]!.pos.y - piano.pos.y);
      expect(table.approach[0]!.facing).toBe(piano.approach[0]!.facing);
    }
    const reach = (i: { pos: { x: number; y: number } }) => Math.hypot(i.pos.x - door.pos.x, i.pos.y - door.pos.y);
    expect(Math.max(reach(memory), reach(abacus))).toBeLessThan(Math.min(reach(piano), reach(computer)));
  });

  it("gives each table room to be played at: no hit box over its neighbour's, and the flower beds well south of where she stands", () => {
    const at = (name: string) => l().interactables.find((i) => i.instanceId === `palace-garden/${name}`)!;
    const row = ['piano-1', 'memory-table-1', 'abacus-1', 'computer-1'].map(at);
    for (let i = 1; i < row.length; i++)
      expect(
        row[i]!.hit.x - row[i - 1]!.hit.x - row[i - 1]!.hit.w,
        `the hit boxes of ${row[i - 1]!.instanceId} and ${row[i]!.instanceId} do not overlap`,
      ).toBeGreaterThanOrEqual(0);
    for (const bed of l().interactables.filter(
      (i) => i.definitionId === 'flowerbed' && i.pos.x > 1400 && i.pos.x < 2300,
    )) {
      for (const table of row.slice(1, 3))
        expect(
          bed.pos.y - table.pos.y,
          `${bed.instanceId} is well south of ${table.instanceId}, below where she stands to play`,
        ).toBeGreaterThan(140);
    }
  });

  it('has the palace door, the doors to both houses, the forest gate, the rainbow gate and the river gate', () => {
    const to = l()
      .portals.map((p) => p.to.mapId)
      .sort();
    expect(to).toEqual(['forest', 'palace-hall', 'playground', 'river', 'stable', 'treasure-house']);
  });

  it('grows every kind of produce: a farm of beds, an orchard of both trees, and something to tap for each', () => {
    const harvest = l().interactables.filter((i) => PROP_DEFS[i.definitionId]?.tap === 'harvest');
    const kinds = new Set(harvest.map((i) => i.definitionId));
    expect(kinds).toEqual(
      new Set([
        'apple-tree',
        'berry-tree',
        'carrot-bed',
        'tomato-bed',
        'strawberry-bed',
        'pumpkin-bed',
        'cabbage-bed',
        'berry-bed',
      ]),
    );
    expect(harvest.filter((i) => i.definitionId.endsWith('-tree')).length).toBeGreaterThanOrEqual(20);
    expect(harvest.filter((i) => i.definitionId.endsWith('-bed')).length).toBe(8);
    const produce = new Set(harvest.flatMap((i) => PROP_DEFS[i.definitionId]!.harvest!.produce));
    expect(produce).toEqual(new Set(FOOD_IDS));
  });

  it('has a pond with a bank to drink from, and a meadow of flower beds beyond the east hedge', () => {
    const drinks = l().anchors.filter((a) => a.tags.includes('drink') && a.anchorId.includes('pond'));
    expect(drinks.length).toBeGreaterThanOrEqual(2);
    expect(
      l()
        .interactables.filter((i) => i.definitionId === 'flowerbed')
        .filter((i) => i.pos.x > 3000).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('keeps the creatures within the cap', () => {
    expect(l().life.reduce((n, z) => n + z.count, 0)).toBeLessThanOrEqual(LIFE_CAP);
  });
});

describe('the treasure house', () => {
  const l = () => logic('treasure-house');

  it('holds a chest and every kind of treasure', () => {
    expect(l().interactables.some((i) => i.definitionId === 'chest')).toBe(true);
    const kinds = new Set(
      l()
        .interactables.map((i) => PROP_DEFS[i.definitionId]?.treasure)
        .filter(Boolean),
    );
    expect(kinds).toEqual(new Set(['gold', 'gem', 'money']));
  });

  it('has one table for every gem, one pile for each kind of gold and one desk for each kind of money, and none twice', () => {
    const stands = l().interactables.map((i) => i.definitionId);
    for (const def of ['coin-pile', 'gold-bars', 'sack-pile', 'money-desk', 'cash-desk', ...GEM_TABLES.map(tableOf)])
      expect(
        stands.filter((d) => d === def),
        def,
      ).toHaveLength(1);
  });

  it('puts the tables of the gems in the order of the book: left to right along a row, and the rows from the top', () => {
    const tables = l().interactables.filter((i) => gemOn(i.definitionId) !== undefined);
    const inReadingOrder = [...tables].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    expect(inReadingOrder.map((i) => gemOn(i.definitionId))).toEqual([...GEM_TABLES]);
  });

  it('is a single room with one way out', () => {
    expect(l().portals).toHaveLength(1);
    expect(l().npcs).toHaveLength(0);
  });
});

describe('the stable', () => {
  const l = () => logic('stable');

  it('has the places its worker needs for every step of the routine', () => {
    expect(l().npcs.map((n) => n.npcId)).toEqual(['stable-worker']);
    const tags = new Set<string>();
    for (const step of NPC_DEFS['stable-worker'].routine)
      (step.kind === 'work' ? [step.tag] : [step.from, step.to]).forEach((t) => {
        tags.add(t);
      });
    for (const tag of tags) expect(anchorsTagged('stable', tag).length, `no ${tag} anchors`).toBeGreaterThanOrEqual(2);
    expect(anchorsTagged('stable', 'stall-fruit').length).toBe(6);
  });

  it('has a brushing rail, with the worker close enough to hurry over', () => {
    const station = l().interactables.find((i) => i.definitionId === 'brush-station')!;
    const groom = l().anchors.find((a) => a.anchorId === station.anchor)!;
    expect(groom.tags).toContain('groom');
    const spots = anchorsTagged('stable', NPC_DEFS['stable-worker'].groomer!.tag);
    expect(spots.length).toBeGreaterThanOrEqual(1);
    for (const s of spots)
      expect(near(s.approach[0]!.pos, groom.approach[0]!.pos), `${s.anchorId} is too far from the rail`).toBeLessThan(
        220,
      );
  });

  it('lets the herd graze and drink', () => {
    expect(anchorsTagged('stable', 'graze').length).toBeGreaterThanOrEqual(2);
    expect(anchorsTagged('stable', 'drink').length).toBeGreaterThanOrEqual(2);
  });

  it('is wide open between the door and the brick: the herd arrives clear of every obstacle', () => {
    // A spawn is where Wildstar stands and the way the herd lines up behind her. The line is worked
    // out from the trail, so a spawn needs one clear place and nothing more. The test below runs
    // the whole herd through every spawn.
    const arrivals = l().spawns.find((s) => s.spawnId === 'from-garden')!;
    expect(arrivals.points.length).toBeGreaterThanOrEqual(1);
    for (const p of arrivals.points) expect(p.y).toBeGreaterThan(TILE * 5);
  });
});

describe('the playground', () => {
  const l = () => logic('playground');
  // A toy either reacts when she taps it, or, once it has a game of its own, opens that.
  const gameToys = new Set(Object.values(WONDERS).map((w) => w.toy));
  const toys = () =>
    l().interactables.filter((i) => PROP_DEFS[i.definitionId]?.tap === 'delight' || gameToys.has(i.definitionId));

  it('holds every kind of toy, more than one of the common ones, and nothing that can be saved', () => {
    const kinds = new Set(toys().map((i) => i.definitionId));
    expect(kinds).toEqual(
      new Set([
        'gem-fountain',
        'rainbow-slide',
        'bouncy-mushroom',
        'firework-launcher',
        'spell-cannon',
        'morph-machine',
        'frog-pond',
        'bubble-machine',
        'balloon-stand',
        'confetti-popper',
      ]),
    );
    expect(toys().length).toBe(19);
    for (const k of ['bouncy-mushroom', 'firework-launcher', 'balloon-stand'])
      expect(toys().filter((i) => i.definitionId === k).length, k).toBe(3);
  });

  it('gives every toy a name, a place to stand and a target a finger can hit', () => {
    for (const t of toys()) {
      expect(t.approach.length, t.instanceId).toBeGreaterThanOrEqual(1);
      expect(t.hit.w, t.instanceId).toBeGreaterThanOrEqual(64);
      expect(t.hit.h, t.instanceId).toBeGreaterThanOrEqual(64);
    }
  });

  it('gives every toy that opens a game a look that game knows, and a toy with only one look none', () => {
    for (const t of l().interactables) {
      const game = PROP_DEFS[t.definitionId]?.minigame;
      // A statue opens a postcard that is drawn for the statue, and not a game with looks of its
      // own.
      if (!game || !isWonder(game)) continue;
      const looks = WONDERS[game].looks;
      if (looks.length > 0) expect(looks, t.instanceId).toContain(t.look);
      else expect(t.look, t.instanceId).toBeUndefined();
    }
  });

  it('has one way out, the rainbow gate, and arrives at it from the garden', () => {
    expect(l().portals.map((p) => [p.portalId, p.to.mapId, p.to.spawnId])).toEqual([
      ['garden-gate', 'palace-garden', 'from-playground'],
    ]);
    expect(logic('palace-garden').spawns.some((s) => s.spawnId === 'from-playground')).toBe(true);
    expect(l().spawns.some((s) => s.spawnId === 'from-garden')).toBe(true);
  });

  it('lets the herd graze and drink, and keeps the creatures within the cap', () => {
    expect(anchorsTagged('playground', 'graze').length).toBeGreaterThanOrEqual(2);
    expect(anchorsTagged('playground', 'drink').length).toBeGreaterThanOrEqual(1);
    expect(l().life.reduce((n, z) => n + z.count, 0)).toBeLessThanOrEqual(LIFE_CAP);
  });
});

describe('the dance floor', () => {
  const l = () => logic('dance-floor');
  const lights = () => l().interactables.filter((i) => i.definitionId === 'disco-light');
  const others = () => l().interactables.filter((i) => i.definitionId !== 'disco-light');

  it('is where the dancing game leads on to when it has been seen through, and no door leads there', () => {
    expect(
      Object.values(WONDERS)
        .filter((w) => w.continueTo)
        .map((w) => [w.id, w.continueTo]),
    ).toEqual([['party-time', { mapId: 'dance-floor', spawnId: 'from-party' }]]);
    expect(l().spawns.some((s) => s.spawnId === 'from-party')).toBe(true);
    for (const id of MAP_IDS)
      expect(
        logic(id).portals.filter((p) => p.to.mapId === 'dance-floor'),
        `${id} has no door onto the dance floor`,
      ).toEqual([]);
  });

  it('has one way out, a glowing place at the south edge that leads back to the playground, which has a place for the herd to stand when it comes back', () => {
    expect(l().portals.map((p) => [p.portalId, p.to.mapId, p.to.spawnId])).toEqual([
      ['playground-gate', 'playground', 'from-dance-floor'],
    ]);
    expect(logic('playground').spawns.some((s) => s.spawnId === 'from-dance-floor')).toBe(true);
    const exit = portalMark(l().portals[0]!);
    expect(exit.y, 'at the south end of the map').toBeGreaterThan(l().heightTiles * TILE * 0.85);
  });

  it('is lit by stage lights in every colour they come in, and a light is only light, so the herd walks through it', () => {
    expect(lights().length).toBeGreaterThanOrEqual(8);
    expect(new Set(lights().map((i) => i.look))).toEqual(new Set(PROP_DEFS['disco-light']!.looks));
    const world = makeWorld({ map: l(), seed: 2, arrival: { kind: 'spawn', spawnId: 'from-party' } });
    for (const light of lights()) {
      expect(world.nav.isWalkable(light.pos, 24), `${light.instanceId} stands in the way`).toBe(true);
      expect(light.approach.length, light.instanceId).toBeGreaterThanOrEqual(1);
      expect(light.hit.w, `${light.instanceId} is a target a finger can hit`).toBeGreaterThanOrEqual(64);
      expect(light.hit.h).toBeGreaterThanOrEqual(64);
    }
  });

  it('keeps every kind of toy the playground has, so there is a great deal to do, and each toy answers when she walks up to it', () => {
    const kinds = new Set(others().map((i) => i.definitionId));
    for (const kind of [
      'gem-fountain',
      'confetti-popper',
      'balloon-stand',
      'firework-launcher',
      'spell-cannon',
      'bouncy-mushroom',
      'bubble-machine',
      'morph-machine',
    ])
      expect(kinds.has(kind), kind).toBe(true);
    expect(others().length, 'toys besides the lights').toBeGreaterThanOrEqual(18);
    for (const toy of [...others(), ...lights()]) {
      const world = makeWorld({ map: l(), seed: 2, arrival: { kind: 'spawn', spawnId: 'from-party' } });
      dispatch(world, { type: 'interact', commandId: 'use', instanceId: toy.instanceId });
      let answered = false;
      run(world, 40, () => {
        for (const e of world.events)
          if (
            (e.type === 'prop-activity' || e.type === 'minigame-started' || e.type === 'prop-reacted') &&
            e.instanceId === toy.instanceId
          )
            answered = true;
      });
      expect(answered, `${toy.instanceId} did nothing when she came to it`).toBe(true);
    }
  }, 120_000);

  it('keeps every tap box clear of every other, so a finger on one thing never opens another', () => {
    const all = l().interactables;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!.hit;
        const b = all[j]!.hit;
        const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(across > 0 && down > 0, `${all[i]!.instanceId} and ${all[j]!.instanceId} lie over each other`).toBe(
          false,
        );
      }
    }
  });

  it('opens the dancing game again from its poppers, and gives every toy that opens a game a look that game knows', () => {
    expect(l().interactables.filter((i) => i.definitionId === 'confetti-popper').length).toBeGreaterThanOrEqual(2);
    for (const t of l().interactables) {
      const game = PROP_DEFS[t.definitionId]?.minigame;
      if (!game || !isWonder(game)) continue;
      const looks = WONDERS[game].looks;
      if (looks.length > 0) expect(looks, t.instanceId).toContain(t.look);
      else expect(t.look, t.instanceId).toBeUndefined();
    }
  });

  it('lets the herd graze and keeps the creatures within the cap', () => {
    expect(anchorsTagged('dance-floor', 'graze').length).toBeGreaterThanOrEqual(2);
    expect(l().life.reduce((n, z) => n + z.count, 0)).toBeLessThanOrEqual(LIFE_CAP);
  });
});

describe('the whole herd arriving', () => {
  const friends = ['leaf', 'glacier', 'river', 'cinder', 'storm'] as const;
  /**
   * A unicorn is about 115 units long from the side. Closer than this and one hides most of
   * another.
   */
  const CLOSEST = 90;
  const closest = (world: ReturnType<typeof makeWorld>): number => {
    const all = unicornList(world);
    let least = Infinity;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) least = Math.min(least, near(all[i]!.pos, all[j]!.pos));
    return least;
  };

  for (const id of MAP_IDS) {
    it(`${id}: wherever the herd comes in, none stands on top of another, on arrival or once they have settled`, () => {
      for (const group of logic(id).spawns) {
        const world = makeWorld({
          map: logic(id),
          recruited: [...friends],
          seed: 4,
          arrival: { kind: 'spawn', spawnId: group.spawnId },
        });
        expect(closest(world), `${group.spawnId} on arrival`).toBeGreaterThanOrEqual(CLOSEST);
        run(world, 3);
        expect(closest(world), `${group.spawnId} three seconds later`).toBeGreaterThanOrEqual(CLOSEST - 12);
      }
    });
  }
});

describe('living in each map with the whole herd, nobody doing anything', () => {
  const spawnOf: Record<MapId, string> = {
    forest: 'start',
    'palace-garden': 'from-forest',
    'treasure-house': 'from-garden',
    'palace-hall': 'from-garden',
    stable: 'from-garden',
    playground: 'from-garden',
    'dance-floor': 'from-party',
    'manor-hall': 'from-forest',
    'manor-upper': 'from-lift',
    'crystal-cave': 'from-forest',
    'palace-dining': 'from-tea',
    'palace-tea': 'from-bedroom',
    'palace-bedroom': 'from-tea',
    'palace-flowers': 'from-dining',
    'palace-gallery': 'from-hall',
    'palace-library': 'from-gallery',
    'palace-music': 'from-gallery',
    'palace-ballroom': 'from-music',
    'palace-jewel': 'from-library',
    river: 'from-garden',
    beach: 'from-river',
    'magic-hall': 'from-river',
    'witch-hut': 'from-cave',
    'santa-grove': 'from-forest',
    'santa-cabin': 'from-grove',
  };

  for (const id of MAP_IDS) {
    it(`${id} stays sound for two minutes of idling`, () => {
      const world = makeWorld({
        map: logic(id),
        recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'],
        seed: 31,
        arrival: { kind: 'spawn', spawnId: spawnOf[id] },
      });
      run(world, 120);
      expect(checkInvariants(world)).toEqual([]);
    }, 120_000);
  }

  it('the stable worker sweeps and carries fruit to the stalls, and keeps at it', () => {
    const world = makeWorld({
      map: logic('stable'),
      recruited: ['leaf', 'glacier', 'river', 'cinder', 'storm'],
      seed: 8,
      arrival: { kind: 'spawn', spawnId: 'from-garden' },
    });
    const clips = new Set<string>();
    let carries = 0;
    let carrying = false;
    run(world, 240, () => {
      const c = world.npcs[0]!.anim.clip;
      clips.add(c);
      if (c === 'carry' && !carrying) carries++;
      carrying = c === 'carry';
    });
    expect(clips.has('sweep')).toBe(true);
    expect(carries).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it.each([
    ['drink', 860, 900],
    ['graze', 470, 1080],
  ])(
    'companions in the stable %s when Wildstar stops near where they can',
    (activity, x, y) => {
      const world = makeWorld({
        map: logic('stable'),
        recruited: ['leaf', 'glacier', 'river'],
        seed: 14,
        arrival: { kind: 'spawn', spawnId: 'from-garden' },
      });
      dispatch(world, { type: 'move', commandId: 'go', destination: { x, y } });
      const done = new Set<string>();
      run(world, 120, () => {
        for (const u of Object.values(world.unicorns)) if (u?.state.kind === 'performing') done.add(u.state.activity);
      });
      expect(done.has(activity), `saw ${[...done].join(', ')}`).toBe(true);
    },
    120_000,
  );

  it('the worker brushes a unicorn that Wildstar sends to the rail', () => {
    const world = makeWorld({ map: logic('stable'), seed: 3, arrival: { kind: 'spawn', spawnId: 'from-garden' } });
    const station = logic('stable').interactables.find((i) => i.definitionId === 'brush-station')!;
    dispatch(world, { type: 'interact', commandId: 'brush', instanceId: station.instanceId });
    const clips = new Set<string>();
    run(world, 40, () => clips.add(world.npcs[0]!.anim.clip));
    expect(clips.has('brush')).toBe(true);
  }, 120_000);

  const lived = [
    'palace-garden',
    'palace-hall',
    'stable',
    ...PALACE_ROOM_IDS,
    'witch-hut',
    'magic-hall',
    'beach',
    'santa-grove',
    'santa-cabin',
  ] as const satisfies readonly MapId[];
  it('has somebody at work in every palace room, the hut, the magic hall, on the beach, in the Santa grove and its cabin', () => {
    for (const id of lived.filter((m) => m !== 'palace-garden' && m !== 'stable'))
      expect(logic(id).npcs.length, `${id} has nobody in it`).toBeGreaterThanOrEqual(1);
  });

  it.each(lived)(
    'everyone in %s can reach every place their work takes them, and does it',
    (id) => {
      const map = logic(id);
      const world = makeWorld({ map, seed: 9, arrival: { kind: 'spawn', spawnId: spawnOf[id] } });
      expect(map.npcs.length).toBeLessThanOrEqual(4);
      const seen = new Map<string, Set<string>>();
      for (const placed of map.npcs) {
        const def = NPC_DEFS[placed.npcId];
        seen.set(placed.npcId, new Set());
        for (const step of def.routine) {
          const tag = step.kind === 'work' ? step.tag : step.from;
          const spots = map.anchors.filter((a) => a.tags.includes(tag));
          expect(spots.length, `${placed.npcId} needs somewhere tagged ${tag}`).toBeGreaterThanOrEqual(1);
          for (const a of spots)
            expect(
              world.nav.sameComponent(placed.start, a.approach[0]!.pos),
              `${placed.npcId} cannot walk to ${a.anchorId}`,
            ).toBe(true);
        }
      }
      run(world, 90, () => {
        for (const n of world.npcs) seen.get(n.id)!.add(n.anim.clip);
      });
      for (const placed of map.npcs) {
        const clips = seen.get(placed.npcId)!;
        const worked = NPC_DEFS[placed.npcId].routine.some((s) => s.kind === 'work' && s.clip !== 'idle');
        expect(clips.has('walk'), `${placed.npcId} never walked`).toBe(true);
        if (worked)
          expect(
            [...clips].some((c) => c !== 'idle' && c !== 'walk' && c !== 'wave'),
            `${placed.npcId} only did ${[...clips].join(', ')}`,
          ).toBe(true);
      }
    },
    120_000,
  );

  it('the gardener tends the beds of the real garden', () => {
    const world = makeWorld({
      map: logic('palace-garden'),
      seed: 5,
      arrival: { kind: 'spawn', spawnId: 'from-forest' },
    });
    const clips = new Set<string>();
    run(world, 150, () => clips.add(world.npcs[0]!.anim.clip));
    expect(['water', 'inspect', 'trim'].filter((c) => clips.has(c)).length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

describe('the palace banner', () => {
  const render = () => maps['palace-garden'].render;

  it('hangs on the palace, and the garden asks the camera to make room for all of it', () => {
    const banner = render().decor.find((d) => d.sprite === 'palace-banner');
    const vista = render().vista;
    expect(banner, 'the garden places the banner').toBeDefined();
    expect(vista, 'the garden has a vista').toBeDefined();
    expect(vista!.show.x).toBeLessThanOrEqual(banner!.x - 150);
    expect(vista!.show.x + vista!.show.w).toBeGreaterThanOrEqual(banner!.x + 150);
    expect(vista!.show.y + vista!.show.h).toBeLessThan(banner!.y);
  });

  it('is looked at from the palace door, which is where the herd can stand to open it', () => {
    const door = logic('palace-garden').interactables.find((i) => i.instanceId === 'palace-garden/palace-door')!;
    const stand = render().vista!.stand;
    expect(door.approach.some((a) => a.pos.x === stand.x && a.pos.y === stand.y)).toBe(true);
  });

  it('lies inside the map, so the camera can always reach it', () => {
    const { widthTiles, heightTiles } = logic('palace-garden');
    const v = render().vista!;
    for (const p of [v.stand, { x: v.show.x, y: v.show.y }, { x: v.show.x + v.show.w, y: v.show.y + v.show.h }]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(widthTiles * TILE);
      expect(p.y).toBeLessThanOrEqual(heightTiles * TILE);
    }
  });

  it('can be seen whole: a look at all of it takes in the banner, every tower and wing, and the steps to the door', () => {
    const v = render().vista!;
    expect(v.whole, 'the vista offers a look at the whole palace').toBeDefined();
    const { area, word } = v.whole!;
    expect(word).toBe('palace');
    expect(area.x).toBeLessThanOrEqual(v.show.x);
    expect(area.x + area.w).toBeGreaterThanOrEqual(v.show.x + v.show.w);
    expect(area.y).toBeLessThanOrEqual(v.show.y);
    expect(area.y + area.h).toBeGreaterThan(v.stand.y);
    const pieces = render().decor.filter((d) => d.sprite.startsWith('palace-') && d.sprite !== 'palace-banner');
    expect(pieces.length).toBeGreaterThanOrEqual(7);
    for (const d of pieces) {
      expect(d.x, d.sprite).toBeGreaterThanOrEqual(area.x);
      expect(d.x, d.sprite).toBeLessThanOrEqual(area.x + area.w);
      expect(d.y, d.sprite).toBeGreaterThan(area.y);
      expect(d.y, d.sprite).toBeLessThanOrEqual(area.y + area.h);
    }
    const { widthTiles, heightTiles } = logic('palace-garden');
    for (const p of [
      { x: area.x, y: area.y },
      { x: area.x + area.w, y: area.y + area.h },
    ]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(widthTiles * TILE);
      expect(p.y).toBeLessThanOrEqual(heightTiles * TILE);
    }
  });

  it('shares the camera with the Heart Hall, the Magic Hall and the lighthouse, and no other map pulls it', () => {
    for (const id of MAP_IDS)
      if (!['palace-garden', 'crystal-cave', 'river', 'beach'].includes(id))
        expect(maps[id].render.vista, id).toBeUndefined();
    expect(maps['crystal-cave'].render.vista?.id).toBe('heart-hall');
    expect(maps.river.render.vista?.id).toBe('hall');
    expect(maps.beach.render.vista?.id).toBe('lighthouse');
  });
});

describe('the Heart Hall', () => {
  const vista = () => maps['crystal-cave'].render.vista!;
  const heart = () => logic('crystal-cave').interactables.find((i) => i.definitionId === 'heart-crystal')!;
  /**
   * How far above the foot of the dais the top of the drawn crystal is, measured from the picture.
   */
  const tipAboveFoot = (): number => {
    const { data, width, height } = renderHeartCrystals();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 8) return HEART_CANVAS.oy - y;
    throw new Error('the crystal is not drawn');
  };

  it('asks the camera to make room for all of the Heart Crystal, with some air over its tip', () => {
    const { show } = vista();
    const foot = heart().pos;
    const tip = foot.y - tipAboveFoot();
    expect(show.y, 'the tip is inside what must show').toBeLessThanOrEqual(tip - 24);
    expect(show.y, 'and what must show does not ask for more sky than that').toBeGreaterThanOrEqual(tip - 80);
    expect(show.x).toBeLessThan(foot.x - 100);
    expect(show.x + show.w).toBeGreaterThan(foot.x + 100);
    expect(show.y + show.h).toBeGreaterThan(foot.y);
  });

  it('is looked at from where the herd stands to touch the crystal, and keeps room under her for the bubble that points the way out', () => {
    const { stand, below } = vista();
    expect(heart().approach.some((a) => a.pos.x === stand.x && a.pos.y === stand.y)).toBe(true);
    expect(
      below,
      'the bubble is a button over the bottom of the screen, about 70 pixels tall from the edge',
    ).toBeGreaterThanOrEqual(110);
  });

  it('reaches a good way round the crystal and no further than the hall, and lies inside the map', () => {
    const v = vista();
    expect(v.radius).toBeGreaterThanOrEqual(300);
    expect(v.radius).toBeLessThanOrEqual(500);
    const { widthTiles, heightTiles } = logic('crystal-cave');
    for (const p of [v.stand, { x: v.show.x, y: v.show.y }, { x: v.show.x + v.show.w, y: v.show.y + v.show.h }]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(widthTiles * TILE);
      expect(p.y).toBeLessThanOrEqual(heightTiles * TILE);
    }
    // The gem grotto, the pool room and the witch's yard are all outside it, so the camera is its
    // usual self there.
    for (const place of [
      { x: 26 * TILE, y: 10.6 * TILE },
      { x: 8.2 * TILE, y: 26.2 * TILE },
      { x: 43.8 * TILE, y: 24.6 * TILE },
    ])
      expect(near(v.stand, place)).toBeGreaterThan(v.radius);
  });
});

describe('the fountain court', () => {
  const held = (id: MapId, definitionId: string) =>
    logic(id).interactables.filter((i) => i.definitionId === definitionId);

  it('has a host for each piece of the rainbow, all in one place, and a pad at the foot of each statue and one in front of the basin', () => {
    const pieces = held('palace-garden', 'fountain-rainbow');
    expect(pieces.map((i) => i.look).sort()).toEqual(ARCH_PIECES.map(pieceId).sort());
    expect(new Set(pieces.map((i) => `${i.pos.x},${i.pos.y}`)).size).toBe(1);
    expect(
      held('palace-garden', 'fountain-pad')
        .map((i) => i.instanceId)
        .sort(),
    ).toEqual(['palace-garden/pad-east', 'palace-garden/pad-front', 'palace-garden/pad-west']);
  });

  it('lets a tap go through the pads and the pieces to the ground, and draws nothing for the pads', () => {
    for (const id of ['fountain-pad', 'fountain-rainbow']) expect(PROP_DEFS[id]!.tap, id).toBe('none');
    expect(PROP_DEFS['fountain-pad']!.invisible).toBe(true);
    expect(PROP_DEFS['fountain-rainbow']!.invisible).toBeUndefined();
  });

  it('draws the arch in front of what stands beyond the court under it, and behind the basin, the jet, the statues and anyone in the court', () => {
    const decor = (sprite: string): number[] =>
      maps['palace-garden'].render.decor
        .filter((d) => d.sprite === sprite)
        .map((d) => standingDepth(d.y, d.depthBias ?? 0));
    const depthOfProp = (i: LogicMap['interactables'][number], layer: 'body' | 'overlay'): number => {
      const drawing = drawProp({
        definitionId: i.definitionId,
        instanceId: i.instanceId,
        look: i.look,
        state: undefined,
        moment: undefined,
      })[layer];
      return standingDepth(i.pos.y, drawing?.bias ?? 0);
    };
    const host = held('palace-garden', 'fountain-rainbow')[0]!;
    const piece = drawProp({
      definitionId: host.definitionId,
      instanceId: host.instanceId,
      look: host.look,
      state: undefined,
      moment: { kind: 'light-rainbow', seconds: 2.5, total: 6.5 },
    });
    const arch = standingDepth(host.pos.y, piece.body!.bias ?? 0);

    const under = logic('palace-garden').interactables.filter(
      (i) =>
        Math.abs(i.pos.x - host.pos.x) <= ARCH_CANVAS.w / 2 &&
        i.pos.y < host.pos.y &&
        i.definitionId !== host.definitionId,
    );
    expect(
      under.map((i) => i.definitionId),
      'the lantern in front of the stable, the stable door and the computer are under the arch',
    ).toEqual(expect.arrayContaining(['lantern', 'door', 'computer']));
    expect(decor('stable-house'), 'the stable house is in the garden').toHaveLength(1);
    for (const depth of [...decor('stable-house'), ...under.map((i) => depthOfProp(i, 'body'))])
      expect(depth).toBeLessThan(arch);

    const spout = held('palace-garden', 'fountain-spout')[0]!;
    const before = [
      ...decor('fountain-basin'),
      ...decor('fountain-ripples'),
      ...decor('fountain-statue-east'),
      ...decor('fountain-statue-west'),
      depthOfProp(spout, 'overlay'),
    ];
    expect(before, 'the basin, its ripples, both statues and the jet are all drawn').toHaveLength(5);
    for (const depth of before) expect(depth).toBeGreaterThan(arch);
    expect(standingDepth(1600), 'a unicorn at the back of the court').toBeGreaterThan(arch);
  });

  it('is the only place with a pad or a host, so no other map can have a rainbow', () => {
    for (const id of MAP_IDS)
      if (id !== 'palace-garden')
        for (const def of ['fountain-pad', 'fountain-rainbow']) expect(held(id, def), `${id} ${def}`).toEqual([]);
  });
});

describe('the sky', () => {
  const strips = (id: MapId) => maps[id].render.decor.filter((d) => d.sprite.endsWith('sky-strip'));
  /** How far above its anchor a sprite is painted, from the recipe that draws it. */
  const rise = (id: MapId, sprite: string): number =>
    RECIPES.find((r) => r.bundle === maps[id].render.bundle && r.id === sprite)!.canvas.oy;

  it('is painted from the top of the map down, so a camera that looks high never finds the ground above it', () => {
    const painted = MAP_IDS.filter((id) => strips(id).length > 0);
    expect(painted, 'the maps that have a sky').toEqual([
      'palace-garden',
      'playground',
      'dance-floor',
      'river',
      'beach',
    ]);
    for (const id of painted) {
      const top = Math.min(...strips(id).map((d) => d.y - rise(id, d.sprite)));
      expect(top, `the sky of ${id} starts ${top} units down the map`).toBeLessThanOrEqual(0);
    }
  });
});

describe('the ways out', () => {
  const doors = () => MAP_IDS.flatMap((id) => logic(id).portals.map((portal) => ({ id, portal })));

  it('can be walked to by their mark alone: from where the herd arrives, one move there goes through', () => {
    expect(doors().length).toBe(47);
    for (const { id, portal } of doors()) {
      const l = logic(id);
      const world = makeWorld({
        map: l,
        seed: 3,
        arrival: { kind: 'spawn', spawnId: l.start ?? l.spawns[0]!.spawnId },
      });
      // A door that wants a word or a clue has been opened by then.
      if (portal.door) world.unlocked.add(portal.door);
      dispatch(world, { type: 'move', commandId: 'exit', destination: portalMark(portal) });
      let through: string | null = null;
      for (let i = 0; i < 240 * 30 && through === null; i++) {
        step(world);
        for (const e of world.events) if (e.type === 'portal-entered') through = `${e.to.mapId}/${e.to.spawnId}`;
      }
      expect(through, `${id}/${portal.portalId}`).toBe(`${portal.to.mapId}/${portal.to.spawnId}`);
      expect(checkInvariants(world), `${id}/${portal.portalId}`).toEqual([]);
    }
  }, 120_000);
});

describe('the rooms of the palace', () => {
  const ROOMS: readonly MapId[] = ['palace-hall', ...PALACE_ROOM_IDS];
  const doorsOf = (id: MapId): MapId[] => logic(id).portals.map((p) => p.to.mapId);
  const reach = (from: MapId): Set<MapId> => {
    const seen = new Set<MapId>([from]);
    const queue: MapId[] = [from];
    while (queue.length > 0)
      for (const next of doorsOf(queue.shift()!))
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    return seen;
  };
  const props = (id: MapId, definitionId: string) =>
    logic(id).interactables.filter((i) => i.definitionId === definitionId);

  it('are nine beyond the throne room, and all of them are reached by doors from the garden', () => {
    expect(PALACE_ROOM_IDS).toHaveLength(9);
    const fromGarden = reach('palace-garden');
    for (const id of ROOMS) expect(fromGarden.has(id), id).toBe(true);
  });

  it('each have a door back for every door they have, and a way out to the garden that does not need a key', () => {
    for (const id of ROOMS) {
      for (const to of doorsOf(id))
        if (to !== 'palace-garden') expect(doorsOf(to), `${to} has no door back to ${id}`).toContain(id);
      expect(reach(id).has('palace-garden'), `${id} cannot be left for the garden`).toBe(true);
    }
  });

  it('are never a dead end she cannot be led out of: every room has a door, and a doorway has a spawn named for the room it leads to', () => {
    for (const id of ROOMS) {
      expect(doorsOf(id).length, id).toBeGreaterThanOrEqual(1);
      for (const to of doorsOf(id))
        expect(
          logic(id).spawns.map((s) => s.spawnId),
          `${id} has no place to arrive from ${to}`,
        ).toContain(`from-${to.replace(/^palace-/, '')}`);
    }
  });

  it('hold flowers in vases in every room, and diamonds in vases in the throne room and the rooms that are for them', () => {
    for (const id of ROOMS)
      expect(props(id, 'flower-vase').length, `${id} has no vase of flowers`).toBeGreaterThanOrEqual(2);
    for (const id of [
      'palace-hall',
      'palace-flowers',
      'palace-gallery',
      'palace-music',
      'palace-ballroom',
      'palace-jewel',
    ] as const)
      expect(props(id, 'diamond-vase').length, `${id} has no vase of diamonds`).toBeGreaterThanOrEqual(1);
    expect(ROOMS.reduce((n, id) => n + props(id, 'flower-vase').length, 0)).toBeGreaterThanOrEqual(30);
    expect(ROOMS.reduce((n, id) => n + props(id, 'diamond-vase').length, 0)).toBeGreaterThanOrEqual(20);
  });

  it('keep the crown on its stand in the throne room, and nowhere else', () => {
    expect(props('palace-hall', 'crown-stand')).toHaveLength(1);
    for (const id of MAP_IDS) if (id !== 'palace-hall') expect(props(id, 'crown-stand'), id).toHaveLength(0);
  });

  it('have one bed to nap in, in the bedroom, with room in front of it to lie down, and its quilt drawn just over her', () => {
    const beds = MAP_IDS.flatMap((id) => props(id, 'nap-bed').map((bed) => ({ id, bed })));
    expect(beds.map((b) => b.id)).toEqual(['palace-bedroom']);
    const { bed } = beds[0]!;
    const lift = bed.approach[0]!.pos.y - bed.pos.y;
    // She is drawn at the depth of her feet, so the quilt is nearer than her and nearer than
    // nothing that can stand between them.
    expect(QUILT_BIAS - lift).toBeGreaterThan(0);
    expect(QUILT_BIAS - lift).toBeLessThanOrEqual(6);
    expect(bed.approach[0]!.facing).toBe('east');
  });
});

describe('the creatures of the world', () => {
  const zones = (id: MapId) => logic(id).life;
  const creatures = (id: MapId) => zones(id).reduce((n, z) => n + z.count, 0);
  const problems = (map: LogicMap): string[] => {
    const found: string[] = [];
    crossCheck(map, found);
    return found;
  };
  const withZones = (extra: LogicMap['life']): LogicMap => ({
    ...logic('forest'),
    life: [...logic('forest').life, ...extra],
  });
  const zone = (
    zoneId: string,
    kind: (typeof LIFE_KINDS)[number],
    x: number,
    y: number,
    w: number,
    h: number,
    count = 1,
    shape: 'rect' | 'ellipse' = 'rect',
  ) => ({ zoneId, kind, area: { x, y, w, h }, shape, count });

  it('fill the forest with every kind of creature the game has, and stay inside what a phone can draw', () => {
    const kinds = new Set(zones('forest').map((z) => z.kind));
    for (const kind of LIFE_KINDS) expect(kinds.has(kind), `the forest has no ${kind}`).toBe(true);
    expect(creatures('forest')).toBeGreaterThanOrEqual(80);
    for (const id of MAP_IDS) expect(creatures(id), id).toBeLessThanOrEqual(LIFE_CAP);
  });

  it('put ducks, fish and frogs at the water, and fairies in the air all about', () => {
    const at = (kind: string) => zones('forest').filter((z) => z.kind === kind);
    expect(at('duck').length).toBeGreaterThanOrEqual(2);
    expect(at('fish').length).toBeGreaterThanOrEqual(2);
    expect(at('frog').length).toBeGreaterThanOrEqual(2);
    expect(at('fairy').length).toBeGreaterThanOrEqual(8);
  });

  it('keep ducks and fish on the water in every pond, and the ones that sit on the ground off it', () => {
    expect(problems(logic('forest'))).toEqual([]);
    expect(zones('forest').filter((z) => LIFE[z.kind].home === 'water').length).toBeGreaterThanOrEqual(4);
  });

  it('refuse a zone that reaches off the map, one that is on the wrong ground, one that is crowded and a count past the cap', () => {
    const w = logic('forest').widthTiles * TILE;
    expect(problems(withZones([zone('out', 'bird', w - 100, 200, 400, 200)]))).toContainEqual(
      expect.stringContaining('life zone out reaches outside the map'),
    );
    // A bunny in the middle of the pond has no ground to sit on, and a duck on the start meadow has
    // no water.
    const pond = zones('forest').find((z) => z.zoneId === 'duck-pond')!;
    expect(
      problems(withZones([zone('wet-bunny', 'bunny', pond.area.x, pond.area.y, pond.area.w, pond.area.h, 2)])),
    ).toContainEqual(expect.stringContaining('life zone wet-bunny (bunny) has room for'));
    const meadow = zones('forest').find((z) => z.zoneId === 'bird-start')!;
    expect(
      problems(
        withZones([zone('dry-duck', 'duck', meadow.area.x, meadow.area.y, meadow.area.w, meadow.area.h, 2, 'ellipse')]),
      ),
    ).toContainEqual(
      expect.stringMatching(/life zone dry-duck \(duck\) is only \d+% on water, and must be at least 90%/),
    );
    const crowd = Array.from({ length: 12 }, (_, i) =>
      zone(`crowd-${i}`, 'butterfly', 200 + i * 16, 200, 600, 300, 12),
    );
    expect(problems(withZones(crowd))).toContainEqual(
      expect.stringMatching(/creatures live here, and 128 is the most/),
    );
  });

  it('refuse two zones with the same name', () => {
    const first = zones('forest')[0]!;
    expect(problems(withZones([{ ...first }]))).toContainEqual(`forest: duplicate life zone ${first.zoneId}`);
  });
});
