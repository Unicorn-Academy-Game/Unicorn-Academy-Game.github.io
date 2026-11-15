import type { World } from '../domain';
import type { Surface, View } from '../game/ports';
import { WALK_STEP } from '../shared/clips';
import type { UnicornId, Vec2 } from '../shared/ids';
import type { Cue } from './cues';

/**
 * Footsteps beyond the screen are skipped, with a little margin so a step at the edge is not
 * clipped off.
 */
const MARGIN = 48;

/**
 * How far into a step a unicorn is when it starts walking, so the first footfall is not a
 * half-stride late.
 */
const FIRST = 0.55;

const onScreen = (p: Vec2, v: View): boolean =>
  p.x >= v.x - MARGIN && p.x <= v.x + v.w + MARGIN && p.y >= v.y - MARGIN && p.y <= v.y + v.h + MARGIN;

/**
 * Footfalls follow the ground covered, not the clock, so they slow and speed up with the walk and
 * stop the instant the unicorn does. One sound lands for each step of the walk cycle (a diagonal
 * pair of hooves). The leader is heard fully and the followers a little under it, so a herd sounds
 * like a herd and not like a drum.
 */
export class Footfalls {
  private readonly carried = new Map<UnicornId, number>();

  update(world: World, view: View, seconds: number, surfaceAt: (p: Vec2) => Surface): Cue[] {
    const cues: Cue[] = [];
    for (const actor of Object.values(world.unicorns)) {
      if (!actor) continue;
      if (actor.anim.clip !== 'walk' || actor.speed < 6) {
        this.carried.delete(actor.id);
        continue;
      }
      const before = this.carried.get(actor.id) ?? WALK_STEP * FIRST;
      // A long frame (a tab coming back to life) counts for no more than one step.
      const covered = before + Math.min(actor.speed * seconds, WALK_STEP);
      if (covered < WALK_STEP) {
        this.carried.set(actor.id, covered);
        continue;
      }
      this.carried.set(actor.id, covered - WALK_STEP);
      if (!onScreen(actor.pos, view)) continue;
      cues.push({
        sound: surfaceAt(actor.pos) === 'hard' ? 'hoof-hard' : 'hoof-grass',
        at: actor.pos,
        gain: actor.id === 'wildstar' ? 1 : 0.7,
      });
    }
    return cues;
  }

  /** Forgets everyone, for a new map. */
  reset(): void {
    this.carried.clear();
  }
}
