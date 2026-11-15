import { RAINBOW, rainbowPhase } from '../../content/fountain-rainbow';
import { effect, startTransient } from '../ops';
import type { World } from '../types';

/**
 * Brings up the rainbow that the reaction `kind` stands for, or keeps it up a little longer. The
 * rainbow is drawn in pieces, one prop for each, and they all start, grow and end together, so the
 * first of them says how far along the rainbow is. This is the only place that writes their
 * transients, because starting one again would restart its picture: a rainbow that is up is given
 * more time, never beyond the cap, and one that has begun to fade is left to finish.
 *
 * The sparkles are asked for when the rainbow starts and each time it is given more time, with the
 * time it has left. They are kept going and not started again, so they end when the rainbow does.
 */
export function engage(world: World, kind: string, hostDefinition: string): void {
  const hosts = [...world.interactables.values()].filter((i) => i.definitionId === hostDefinition);
  const first = hosts[0];
  if (!first) return;
  const up = world.transient.get(first.instanceId);
  if (up?.kind !== kind || up.until <= world.time) {
    for (const host of hosts) startTransient(world, host.instanceId, kind, RAINBOW.life);
    effect(world, 'fountain-rainbow', first.pos, RAINBOW.life);
    return;
  }
  if (rainbowPhase(world.time - up.since, up.until - up.since) === 'fading') return;
  const until = Math.max(up.until, Math.min(up.since + RAINBOW.cap, world.time + RAINBOW.life));
  if (until === up.until) return;
  for (const host of hosts) {
    const piece = world.transient.get(host.instanceId);
    if (piece) piece.until = until;
  }
  effect(world, 'fountain-rainbow', first.pos, until - world.time);
}
