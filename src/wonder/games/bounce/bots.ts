import type { Rng } from '../../../domain/rng';
import type { Climb } from './climb';
import { type Cloud, ROW } from './world';

/** Where a stand-in puts a finger, and whether it stays down. */
interface Touch {
  readonly x: number;
  readonly y: number;
  readonly hold?: boolean;
}

/**
 * Stand-ins for a person, which look at the climb and say where to touch, so the game can be played
 * through and measured with nobody's thumb in the way. They answer with a place in the sky, or
 * nothing for "not now".
 */
export interface Bot {
  /** One moment of play. */
  act(climb: Climb, dt: number): Touch | null;
}

/**
 * A child who has watched the stars: whenever the unicorn is standing, touches the cloud one row up
 * that they lead to.
 */
export function expertBot(): Bot {
  return {
    act(climb) {
      const lead = climb.leader;
      if (lead.mode !== 'stand' || climb.aim) return null;
      const from = lead.to;
      const stars = new Map<number, number>();
      for (const s of climb.world.pickups)
        if (!climb.taken.has(s.id)) stars.set(s.cloud, (stars.get(s.cloud) ?? 0) + 1);
      let pick: Cloud | undefined;
      let score = -Infinity;
      for (const c of climb.world.row(from.row + 1)) {
        if (Math.abs(c.x - from.x) > 330) continue;
        const s = (stars.get(c.id) ?? 0) * 100 + (climb.visited.has(c.id) ? 0 : 40) - Math.abs(c.x - from.x) * 0.1;
        if (s > score) {
          score = s;
          pick = c;
        }
      }
      return pick ? { x: pick.x, y: pick.y + 12 } : { x: from.x, y: from.y - ROW * 2 };
    },
  };
}

/**
 * A child who puts their finger at the top of the screen and keeps it there: always going up, never
 * looking at what is there.
 */
export function holdUpBot(): Bot {
  return { act: (climb) => ({ x: 400, y: climb.leader.y - 900, hold: true }) };
}

/**
 * What the screen shows around the unicorn, in the sky's units: how far above her it reaches,
 * below, and across.
 */
export interface Window {
  readonly above: number;
  readonly below: number;
  readonly left: number;
  readonly right: number;
}

/** A child who touches anywhere, now and then, without looking. */
export function childBot(rng: Rng, window: Window): Bot {
  let wait = rng.range(0.3, 0.9);
  return {
    act(climb, dt) {
      wait -= dt;
      if (wait > 0) return null;
      wait = rng.range(0.55, 1.4);
      return { x: rng.range(window.left, window.right), y: climb.leader.y + rng.range(-window.above, window.below) };
    },
  };
}
