import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAGICS, REACTIONS, reactionOf, SPELLS } from '../../src/content/magic';
import { GEM_IDS, type GemId, PRODUCE } from '../../src/content/produce';
import { clusterOf, PROP_DEFS } from '../../src/content/props';
import { CONFIG, type DomainEvent, dispatch, drainEvents, type World } from '../../src/domain';
import { CompiledMap } from '../../src/shared/compiled-map';
import type { MagicKind, MapId, UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { type LogicMap, portalMark } from '../../src/shared/map';
import { ALL, makeWorld, run, teleport } from './fixtures';

type Pt = { x: number; y: number };

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const mapOf = (id: MapId): LogicMap =>
  CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8'))).logic;
const CAVE = mapOf('crystal-cave');
const FOREST = mapOf('forest');

/** The cave with the whole herd in it, arrived from the forest. */
const cave = (): World =>
  makeWorld({ map: CAVE, recruited: ALL.slice(1), seed: 5, arrival: { kind: 'spawn', spawnId: 'from-forest' } });
const instancesOf = (definitionId: string) => CAVE.interactables.filter((i) => i.definitionId === definitionId);

const steps = (world: World, seconds: number): DomainEvent[] => {
  run(world, seconds);
  return drainEvents(world);
};

/**
 * Puts `who` at `at`, has her cast, and runs on to the moment the spell is released. Everything
 * that happened on the way is returned.
 */
function castFrom(world: World, at: Pt, who: UnicornId): DomainEvent[] {
  teleport(world, who, at);
  dispatch(world, { type: 'cast', commandId: `t${world.tick}-${who}`, unicornId: who });
  const seen: DomainEvent[] = [];
  for (let i = 0; i < 3 * CONFIG.stepHz && !seen.some((e) => e.type === 'cast-released'); i++)
    seen.push(...steps(world, 1 / CONFIG.stepHz));
  if (!seen.some((e) => e.type === 'cast-released'))
    throw new Error(`${who} did not release a spell from ${at.x},${at.y}`);
  return seen;
}

const reactionsIn = (events: DomainEvent[], reaction: string): string[] =>
  events.flatMap((e) => (e.type === 'prop-reacted' && e.reaction === reaction ? [e.instanceId] : []));

/** What each thing in the cave answers to, and with what. */
const ANSWERS: { def: string; magic: MagicKind; reaction: string }[] = [
  ...MAGICS.map((magic) => ({ def: 'heart-crystal', magic, reaction: reactionOf('heart', magic) })),
  ...MAGICS.map((magic) => ({ def: 'sleeping-crystals', magic, reaction: reactionOf('wake', magic) })),
  { def: 'glow-pool', magic: 'ice', reaction: 'freeze-pool' },
  { def: 'glow-pool', magic: 'water', reaction: 'ripple-pool' },
  { def: 'storm-pillar', magic: 'lightning', reaction: 'charge-pillar' },
  { def: 'cave-chimes', magic: 'lightning', reaction: 'ring-chimes' },
  { def: 'witch-cauldron', magic: 'fire', reaction: 'stoke-cauldron' },
  { def: 'cave-bed', magic: 'nature', reaction: 'bloom-bed' },
  { def: 'cave-bed', magic: 'water', reaction: 'water-bed' },
];

describe('the crystal cave: what it holds', () => {
  it('has the Heart Crystal, four pillars, two chimes, twelve sleeping crystals, six beds, the pool, the hut and its door, the cauldron and the ball', () => {
    const count = (def: string): number => instancesOf(def).length;
    expect([
      count('heart-crystal'),
      count('storm-pillar'),
      count('cave-chimes'),
      count('sleeping-crystals'),
      count('cave-bed'),
      count('glow-pool'),
    ]).toEqual([1, 4, 2, 12, 6, 1]);
    expect([count('hut-door'), count('witch-cauldron'), count('crystal-ball')]).toEqual([1, 1, 1]);
  });

  it('grows every gem in two clusters, and nothing else', () => {
    for (const gem of GEM_IDS) expect(instancesOf(clusterOf(gem)).length, gem).toBe(2);
    const clusters = CAVE.interactables.filter((i) => i.definitionId.endsWith('-cluster'));
    expect(clusters.length).toBe(GEM_IDS.length * 2);
  });

  it('has only things the game has a definition of', () => {
    for (const i of CAVE.interactables)
      expect(PROP_DEFS[i.definitionId], `${i.instanceId} is ${i.definitionId}`).toBeDefined();
  });

  it('has a place to stand beside everything, where a unicorn can stand', () => {
    const world = cave();
    for (const i of CAVE.interactables) {
      expect(i.approach.length, i.instanceId).toBeGreaterThan(0);
      for (const a of i.approach)
        expect(world.nav.isWalkable(a.pos, 0), `${i.instanceId} at ${a.pos.x},${a.pos.y}`).toBe(true);
    }
  });
});

describe("the crystal cave: what each friend's magic does", () => {
  for (const { def, magic, reaction } of ANSWERS) {
    it(`${def} answers ${magic} with ${reaction}, from every place she is meant to stand beside it`, () => {
      const found = instancesOf(def);
      expect(found.length).toBeGreaterThan(0);
      for (const inst of found) {
        inst.approach.forEach((stand, k) => {
          const seen = castFrom(cave(), stand.pos, SPELLS[magic].caster);
          expect(reactionsIn(seen, reaction), `${inst.instanceId} from place ${k + 1}`).toContain(inst.instanceId);
        });
      }
    });
  }

  it('gives each of the six friends her own answer from the Heart Crystal, and only her own', () => {
    const heart = instancesOf('heart-crystal')[0]!;
    const answers = new Set<string>();
    for (const magic of MAGICS) {
      const seen = castFrom(cave(), heart.approach[0]!.pos, SPELLS[magic].caster);
      const heard = REACTIONS.filter((r) => r.id.startsWith('heart-') && reactionsIn(seen, r.id).length > 0).map(
        (r) => r.id,
      );
      expect(heard, magic).toEqual([reactionOf('heart', magic)]);
      answers.add(heard[0]!);
    }
    expect(answers.size).toBe(6);
  });

  it('starts a reaction in the picture of the thing for as long as it lasts, and ends it again', () => {
    const heart = instancesOf('heart-crystal')[0]!;
    const world = cave();
    castFrom(world, heart.approach[0]!.pos, 'river');
    const moment = world.transient.get(heart.instanceId);
    expect(moment).toMatchObject({ kind: reactionOf('heart', 'water') });
    expect(moment!.until - moment!.since).toBe(REACTIONS.find((r) => r.id === reactionOf('heart', 'water'))!.seconds);
    run(world, 8);
    expect(
      world.transient.get(heart.instanceId) === undefined || world.transient.get(heart.instanceId)!.until <= world.time,
    ).toBe(true);
  });

  it('does not answer a friend whose magic is not what it waits for', () => {
    const pillar = instancesOf('storm-pillar')[0]!;
    for (const magic of MAGICS.filter((m) => m !== 'lightning')) {
      const seen = castFrom(cave(), pillar.approach[0]!.pos, SPELLS[magic].caster);
      expect(reactionsIn(seen, 'charge-pillar'), magic).toEqual([]);
    }
    const pool = instancesOf('glow-pool')[0]!;
    for (const magic of MAGICS.filter((m) => m !== 'ice' && m !== 'water')) {
      const seen = castFrom(cave(), pool.approach[0]!.pos, SPELLS[magic].caster);
      expect(reactionsIn(seen, 'freeze-pool').concat(reactionsIn(seen, 'ripple-pool')), magic).toEqual([]);
    }
  });

  it("opens a witch's bed to flowers for ten seconds when nature's magic reaches it, and then closes it so it can be opened again", () => {
    const bed = instancesOf('cave-bed')[0]!;
    const world = cave();
    expect(world.persistent.props[bed.instanceId]).toEqual({ kind: 'flowerbed', state: 'leafy' });
    castFrom(world, bed.approach[0]!.pos, 'leaf');
    expect(world.persistent.props[bed.instanceId]).toEqual({ kind: 'flowerbed', state: 'flowering' });
    run(world, CONFIG.magic.hold + 1);
    expect(world.persistent.props[bed.instanceId]).toEqual({ kind: 'flowerbed', state: 'leafy' });
    const again = castFrom(world, bed.approach[0]!.pos, 'leaf');
    expect(reactionsIn(again, 'bloom-bed')).toContain(bed.instanceId);
  });

  it('can have every friend cast at everything for a long time and nothing goes wrong', () => {
    const world = cave();
    const heart = instancesOf('heart-crystal')[0]!.approach[0]!.pos;
    teleport(world, 'wildstar', heart);
    for (let round = 0; round < 6; round++) {
      for (const who of ALL) dispatch(world, { type: 'cast', commandId: `r${round}-${who}`, unicornId: who });
      steps(world, 1.5);
    }
    expect(world.effects.filter((until) => until > world.time).length).toBeLessThanOrEqual(CONFIG.magic.effectCap);
  });
});

describe('the crystal cave: the gems', () => {
  const clusters = GEM_IDS.flatMap((gem) => instancesOf(clusterOf(gem)).map((inst) => ({ gem, inst })));

  it('give their own gem when they are tapped, two or three of it, and nothing else', () => {
    for (const { gem, inst } of clusters) {
      const world = cave();
      teleport(world, 'wildstar', inst.approach[0]!.pos);
      dispatch(world, { type: 'interact', commandId: `h-${inst.instanceId}`, instanceId: inst.instanceId });
      const seen = steps(world, 2);
      const dropped = seen.flatMap((e) => (e.type === 'produce-dropped' ? [e] : []));
      const [lo, hi] = PROP_DEFS[clusterOf(gem)]!.harvest!.count;
      expect(dropped.length, inst.instanceId).toBeGreaterThanOrEqual(lo);
      expect(dropped.length, inst.instanceId).toBeLessThanOrEqual(hi);
      for (const d of dropped) expect(d.produce, inst.instanceId).toBe(gem);
    }
  });

  it('let the gems fall within reach of where she stands, where a unicorn can walk to them', () => {
    for (const { inst } of clusters) {
      const world = cave();
      const origin = inst.approach[0]!.pos;
      teleport(world, 'wildstar', origin);
      dispatch(world, { type: 'interact', commandId: `h-${inst.instanceId}`, instanceId: inst.instanceId });
      const dropped = steps(world, 2).flatMap((e) => (e.type === 'produce-dropped' ? [e] : []));
      expect(dropped.length, inst.instanceId).toBeGreaterThan(0);
      for (const d of dropped) {
        expect(Math.hypot(d.to.x - origin.x, d.to.y - origin.y), inst.instanceId).toBeLessThanOrEqual(
          CONFIG.pickups.reachMax + 2,
        );
        expect(
          world.nav.isWalkable(d.to, 0),
          `${inst.instanceId} drops at ${Math.round(d.to.x)},${Math.round(d.to.y)}`,
        ).toBe(true);
      }
    }
  });

  it('are picked up by whoever walks over them, and every gem there is can be picked up this way', () => {
    const gathered = new Set<GemId>();
    for (const { gem, inst } of clusters) {
      const world = cave();
      teleport(world, 'wildstar', inst.approach[0]!.pos);
      dispatch(world, { type: 'interact', commandId: `h-${inst.instanceId}`, instanceId: inst.instanceId });
      const seen = steps(world, 2);
      for (const p of [...world.pickups.list]) {
        teleport(world, 'wildstar', p.to);
        seen.push(...steps(world, 0.8));
      }
      const taken = seen.flatMap((e) => (e.type === 'produce-collected' ? [e.produce] : []));
      expect(taken.length, inst.instanceId).toBeGreaterThan(0);
      expect(new Set(taken), inst.instanceId).toEqual(new Set([gem]));
      expect(world.pickups.list, inst.instanceId).toEqual([]);
      gathered.add(gem);
    }
    expect([...gathered].sort()).toEqual([...GEM_IDS].sort());
  });

  it('are never used up: the same cluster gives again at once', () => {
    const { inst } = clusters[0]!;
    const world = cave();
    teleport(world, 'wildstar', inst.approach[0]!.pos);
    for (let i = 0; i < 4; i++) {
      dispatch(world, { type: 'interact', commandId: `again-${i}`, instanceId: inst.instanceId });
      const dropped = steps(world, 2).filter((e) => e.type === 'produce-dropped');
      expect(dropped.length, `the ${i + 1}th time`).toBeGreaterThan(0);
    }
  });

  it('are gems, each its own colour, and each grows out of the rock', () => {
    const tints = GEM_IDS.map((gem) => PRODUCE[gem].tint);
    expect(new Set(tints).size).toBe(GEM_IDS.length);
    for (const gem of GEM_IDS) expect(PRODUCE[gem].grows, gem).toBe('rock');
  });
});

describe('the crystal cave: the way in and the way out', () => {
  const mouth = (map: LogicMap, to: MapId) => map.portals.find((p) => p.to.mapId === to);

  it('is entered from the forest by a mouth in the hill, and left by the one in the antechamber, and each leads to a place that is there', () => {
    const inn = mouth(FOREST, 'crystal-cave')!;
    const out = mouth(CAVE, 'forest')!;
    expect(inn).toBeDefined();
    expect(out).toBeDefined();
    expect(CAVE.spawns.map((s) => s.spawnId)).toContain(inn.to.spawnId);
    expect(FOREST.spawns.map((s) => s.spawnId)).toContain(out.to.spawnId);
  });

  it('puts the herd down just in front of the way they came through, not in the middle of the cave or the forest', () => {
    const inn = mouth(FOREST, 'crystal-cave')!;
    const out = mouth(CAVE, 'forest')!;
    const comesIn = CAVE.spawns.find((s) => s.spawnId === inn.to.spawnId)!;
    const comesOut = FOREST.spawns.find((s) => s.spawnId === out.to.spawnId)!;
    const from = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
    for (const p of comesIn.points) expect(from(p, portalMark(out)), `in the cave at ${p.x},${p.y}`).toBeLessThan(700);
    for (const p of comesOut.points)
      expect(from(p, portalMark(inn)), `in the forest at ${p.x},${p.y}`).toBeLessThan(900);
  });

  it('is a place she can bring the whole herd into and leave it idling, and nobody is pushed out of the places a unicorn can stand', () => {
    const world = cave();
    steps(world, 20);
    for (const id of ALL) expect(world.nav.isWalkable(world.unicorns[id]!.pos, 0), id).toBe(true);
  });
});
