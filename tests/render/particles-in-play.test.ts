import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG, type Command, createWorld, dispatch, drainEvents, newPersistent, step } from '../../src/domain';
import { CompiledMap } from '../../src/shared/compiled-map';
import { MAP_IDS, type MapId, type UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { mulberry32 } from '../../tools/art/core/rng';
import { Counted, draw } from './fx-box';

/**
 * How many particles a child can keep alive at once, with the real effects system under the real
 * simulation and no screen.
 *
 * The game caps live particles at 250 and the pool holds 420. Played the way the census plays, the
 * screen never holds 250 (`tests/maps/census.test.ts` checks that). These are the plays that are
 * not the way a child plays but are in a child's reach: tapping everything on the screen as fast as
 * a finger can, and tapping six unicorns flat out. The first never finds the pool empty, so a
 * smaller pool would lose particles a child can see. The second does fill it, and then the
 * particles that have no room are not shown, which is the right failure for decoration. Nobody has
 * found a way to make the count grow without bound.
 */

// The effects system takes its two blend modes from Phaser, which cannot be loaded without a
// window.
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const maps = Object.fromEntries(
  MAP_IDS.map((id) => [
    id,
    CompiledMap.parse(JSON.parse(readFileSync(`public/assets/${manifest.maps[id]!.file}`, 'utf8'))).logic,
  ]),
) as Record<MapId, CompiledMap['logic']>;

type Intent = Command extends infer C ? (C extends unknown ? Omit<C, 'commandId'> : never) : never;
const HERD: UnicornId[] = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'];

/**
 * Some seconds on one map with all six unicorns, and a child who cannot stop. In `casts` the child
 * taps every unicorn ten times a second. In `everything` they tap ten times a second at a unicorn,
 * a creature, a prop or a friend, and sends Wildstar somewhere new every two seconds.
 */
function storm(mapId: MapId, seed: number, seconds: number, kind: 'casts' | 'everything'): Counted {
  const rng = mulberry32(seed * 7919 + 13);
  const persistent = newPersistent('00000000-0000-4000-8000-000000000001');
  persistent.recruited = HERD;
  const map = maps[mapId];
  const world = createWorld({
    map,
    persistent,
    seed,
    arrival: { kind: 'spawn', spawnId: map.start ?? map.spawns[0]!.spawnId },
  });
  const fx = new Counted(seed + 5);
  const props = map.interactables.filter((i) => i.definitionId !== 'door');
  let sent = 0;
  const send = (c: Intent): void => dispatch(world, { ...c, commandId: `c${sent++}` } as Command);
  const anyUnicorn = (): UnicornId => HERD[Math.floor(rng() * HERD.length)]!;
  for (let i = 0, steps = Math.round(seconds * CONFIG.stepHz); i < steps; i++) {
    if (i % 3 === 0) {
      if (kind === 'casts') for (const id of HERD) send({ type: 'cast', unicornId: id });
      else {
        const roll = rng();
        const critters = world.life.critters;
        if (roll < 0.45) send({ type: 'cast', unicornId: anyUnicorn() });
        else if (roll < 0.6 && critters.length > 0)
          send({ type: 'poke', critterId: critters[Math.floor(rng() * critters.length)]!.id });
        else if (roll < 0.75 && props.length > 0)
          send({ type: 'interact', instanceId: props[Math.floor(rng() * props.length)]!.instanceId });
        else if (roll < 0.85) send({ type: 'greet', unicornId: anyUnicorn() });
      }
    }
    if (i % 60 === 0) {
      const lead = world.unicorns.wildstar!.pos;
      const goal = world.nav.freePointNear(
        { x: lead.x + (rng() - 0.5) * 1100, y: lead.y + (rng() - 0.5) * 800 },
        [],
        0,
        240,
      );
      if (goal) send({ type: 'move', destination: goal });
    }
    step(world);
    // The world stops starting effects at its own cap, whatever is tapped.
    if (world.effects.length > CONFIG.magic.effectCap)
      throw new Error(
        `${world.effects.length} effects are alive in ${mapId}, and the cap is ${CONFIG.magic.effectCap}`,
      );
    draw(fx, drainEvents(world));
    fx.frame();
    fx.frame();
  }
  return fx;
}

describe('a child who cannot stop tapping', () => {
  it('never finds the pool empty while the player taps everything on the screen, on any map', () => {
    for (const id of MAP_IDS) {
      for (const seed of [1, 2]) {
        const fx = storm(id, seed, 40, 'everything');
        expect(
          fx.refused,
          `${id}, seed ${seed}: ${fx.refused} of ${fx.asked} particles had no room, at most ${fx.peak} alive`,
        ).toBe(0);
      }
    }
  }, 120_000);

  it('fills the pool with six unicorns cast flat out, and fewer than one new particle in six is not shown', () => {
    for (const id of ['forest', 'palace-garden', 'treasure-house'] as const) {
      const fx = storm(id, 1, 40, 'casts');
      expect(
        fx.refused / fx.asked,
        `${id}: ${fx.refused} of ${fx.asked} had no room, at most ${fx.peak} alive`,
      ).toBeLessThan(1 / 6);
    }
  }, 120_000);
});
