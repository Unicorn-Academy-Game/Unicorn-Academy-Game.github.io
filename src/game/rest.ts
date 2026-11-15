import type { Rest } from './ports';

/**
 * Lets several things hold the world still at once, such as a card that goes up over the book: the
 * world is frozen when the first of them asks and let go when the last of them has. Each asker
 * freezes once and thaws once, and a thaw with nothing held does nothing.
 */
export function sharedRest(world: Rest): Rest {
  let holds = 0;
  return {
    freeze() {
      holds += 1;
      if (holds === 1) world.freeze();
    },
    thaw() {
      if (holds === 0) return;
      holds -= 1;
      if (holds === 0) world.thaw();
    },
  };
}
