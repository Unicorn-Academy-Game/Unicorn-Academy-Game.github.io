import type { UnicornId } from '../../shared/ids';
import { type Depth, depthField } from '../../shared/waters';
import { effect, unicornList } from '../ops';
import type { World } from '../types';

/**
 * Wading, swimming and stepping stones. A unicorn who walks into the sea throws a splash as she
 * goes in and a small one as each hoof comes down, and one who crosses a stone strikes a glint from
 * it. How deep the water is under her is `depthField(map.waters)`, and what that looks like on her
 * body is the renderer's. Nothing here changes where anyone can go: the map's obstacles say that.
 */

/** How long between one splash and the next of a unicorn who keeps on walking, in seconds. */
const WADE_EVERY = 0.42;
const SWIM_EVERY = 0.6;
const STONE_EVERY = 0.34;
/** Moving faster than this, in world units a second, is walking and not standing. */
const MOVING = 24;

interface Wet {
  depth: Depth;
  /** When this unicorn last threw a splash or a glint. */
  at: number;
}

const wet = new WeakMap<World, Map<UnicornId, Wet>>();

const stateOf = (world: World): Map<UnicornId, Wet> => {
  const state = wet.get(world) ?? new Map<UnicornId, Wet>();
  wet.set(world, state);
  return state;
};

/** Runs once per step. A map with no water does nothing. */
export function stepWading(world: World): void {
  if (!world.map.waters) return;
  const field = depthField(world.map.waters);
  const state = stateOf(world);
  for (const u of unicornList(world)) {
    const depth = field.at(u.pos.x, u.pos.y);
    const was = state.get(u.id) ?? { depth: 0, at: -Infinity };
    const moving = u.speed > MOVING;
    if (depth !== was.depth) {
      const into = (depth === 1 || depth === 2) && was.depth !== 1 && was.depth !== 2;
      const deeper = depth === 2 && was.depth === 1;
      if (into || deeper) {
        effect(world, 'dive', u.pos, 1);
        was.at = world.time;
      } else if (depth === 0 && (was.depth === 1 || was.depth === 2)) {
        effect(world, 'wade', u.pos, 0.8);
        was.at = world.time;
      }
      was.depth = depth;
    } else if (moving) {
      const every = depth === 1 ? WADE_EVERY : depth === 2 ? SWIM_EVERY : depth === 3 ? STONE_EVERY : Infinity;
      if (world.time - was.at >= every) {
        was.at = world.time;
        effect(world, depth === 3 ? 'stone-glint' : 'wade', u.pos, 0.8, undefined, undefined, 0.6);
      }
    }
    state.set(u.id, was);
  }
}
