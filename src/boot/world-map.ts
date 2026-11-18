import { SpellSounds } from '../audio/spell-sounds';
import type { GameController } from '../game/controller';
import type { OverlayDeps } from '../ui/overlay';
import { WorldMap } from '../ui/world-map';
import { SILENT } from '../wonder/sound';
import type { Learning } from './learning';
import type { Sound } from './sound';

interface WorldMapDeps {
  overlay: OverlayDeps;
  controller: GameController;
  sound: Sound;
  learning: Pick<Learning, 'rest' | 'idle'>;
}

/**
 * The map of the island, and what the button for it does. A place that is picked is gone to
 * through the same change of place a door makes, so the herd is saved, the screen fades and the
 * herd comes in as it does through any door.
 */
export function makeWorldMap({ overlay, controller, sound, learning }: WorldMapDeps): {
  map: WorldMap;
  openMap: (opener?: HTMLElement) => void;
} {
  const sounds = new SpellSounds(() => sound.synth ?? SILENT);
  const map = new WorldMap({
    ...overlay,
    rest: learning.rest,
    here: () => controller.world.map.id,
    go: (to) => void controller.travel(to),
    sounds,
  });
  return {
    map,
    // The map only opens when the herd is in play and nothing else has the screen.
    openMap: (opener) => {
      if (learning.idle()) map.open(opener);
    },
  };
}
