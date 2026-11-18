import { isTable, PROP_DEFS, type TableId } from '../content/props';
import { isScreen } from '../content/wonders';
import type { LoadPlan } from '../domain/snapshot';
import { GameController } from '../game/controller';
import { Seasons, seasonPreview } from '../game/seasons';
import type { SaveService } from '../persistence/save-service';
import type { SettingsModel } from '../persistence/settings';
import type { CodePad } from '../ui/code-pad';
import { left } from '../ui/finder';
import { SkyHaze } from '../ui/haze';
import { ride } from '../ui/ride';
import type { Ui } from '../ui/ui';
import type { WonderOverlay } from '../ui/wonder';
import { builtWonders } from '../wonder/registry';
import { SILENT } from '../wonder/sound';
import type { Graphics } from './graphics';
import type { Sound } from './sound';

/**
 * How long a toy gets to react to a tap before its game opens from it, unless it says it has more
 * to show.
 */
const WONDER_LEAD_IN_MS = 280;
const leadInOf = (toy: string | undefined): number => {
  const own = toy === undefined ? undefined : PROP_DEFS[toy]?.leadIn;
  return own === undefined ? WONDER_LEAD_IN_MS : own * 1000;
};
/**
 * After the last friend joins, the banner and the confetti say so for a moment, and then the whole
 * screen is the party.
 */
const FINALE_LEAD_MS = 2600;

/**
 * What the world opens over itself. Each is made after the world and needs it, so the world reaches
 * them through here and a tap that comes before one exists does nothing.
 */
export interface Overlays {
  wonders: WonderOverlay | null;
  pad: CodePad | null;
  /**
   * What a tap on a table does a moment later: its chunk is fetched if it is not here yet, and the
   * player sits down.
   */
  sitDown: Record<TableId, () => void>;
}

export function noOverlays(): Overlays {
  return {
    wonders: null,
    pad: null,
    sitDown: { reading: () => undefined, memory: () => undefined, maths: () => undefined },
  };
}

interface WorldDeps {
  ui: Ui;
  graphics: Graphics;
  settings: SettingsModel;
  saves: SaveService;
  sound: Sound;
  plan: LoadPlan;
  overlays: Overlays;
}

/**
 * Makes the world behind the loading screen and starts it. From then on it follows the settings and
 * the season.
 */
export async function startWorld({
  ui,
  graphics,
  settings,
  saves,
  sound,
  plan,
  overlays,
}: WorldDeps): Promise<GameController> {
  const { stage, scene, manifest, textures, fine, profile } = graphics;
  const { audio, synth } = sound;
  // The season is the one asked for in the address, else the one a parent picked, else the
  // calendar's.
  const seasons = new Seasons(
    { choice: () => settings.get().season },
    seasonPreview(location.search, new URLSearchParams(location.search).has('test')),
  );
  const haze = new SkyHaze();
  ui.underlay(haze.node);
  const controller = new GameController({
    scene,
    manifest,
    textures,
    fine,
    profile,
    season: seasons.showing,
    onSky: (veil) => haze.set(veil),
    save: saves,
    ...(audio ? { audio } : {}),
    onNotice: (n) => ui.showNotice('Hmm, that way did not open.', { label: 'Try again', run: n.retry }),
    onFriendFound: (id, found) => {
      ui.unicornFound(id, found);
      if (left(found) === 0)
        window.setTimeout(
          () =>
            overlays.wonders?.open({
              game: 'finder-finale',
              look: undefined,
              at: { x: innerWidth / 2, y: innerHeight * 0.7 },
            }),
          FINALE_LEAD_MS,
        );
    },
    onProduceGathered: (id, at) => ui.produceGathered(id, controller.onScreen(at)),
    onMinigame: (site) => {
      // A table has its own little show as it is tapped, and the player sits down at it a moment
      // later, whether learning is on or off.
      if (isTable(site.game)) {
        const table = site.game;
        window.setTimeout(() => overlays.sitDown[table](), leadInOf(site.toy));
        return;
      }
      // The toy has its own little reaction as it is tapped, and the picture opens from it a moment
      // later.
      if (isScreen(site.game) && builtWonders().includes(site.game)) {
        const game = site.game;
        // A statue's postcard is the statue's own: it is told which of the eight was touched.
        const look = game === 'statue-postcard' ? site.toy : site.look;
        window.setTimeout(() => overlays.wonders?.open({ game, look, at: site.at }), leadInOf(site.toy));
      }
    },
    onCodeWanted: (door) => overlays.pad?.open(door),
    onRide: (direction) =>
      ride(
        {
          mount: (node) => ui.underlay(node),
          sound: (id, gain) => audio?.cheer(id, gain),
          calm: () => settings.get().reducedEffects,
          wonderSound: () => synth ?? SILENT,
          quality: profile.wonderQuality,
        },
        direction,
      ),
  });
  seasons.subscribe((season) => void controller.setSeason(season));
  settings.subscribe(() => seasons.refresh());
  // A page that was put away over the turn of a season has the new one when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') seasons.refresh();
  });
  stage.setCloseness(settings.get().zoom);
  controller.setViewport(stage.viewport());
  controller.setReducedEffects(settings.get().reducedEffects);
  settings.subscribe((s) => controller.setReducedEffects(s.reducedEffects));
  // A friend joins by walking up, unless a parent wants the name spelled first. That is settled
  // before the first step of the world.
  const friendRule = (): 'ask' | 'walk-up' =>
    settings.get().learning.on && settings.get().learning.friends ? 'ask' : 'walk-up';
  controller.setFriendRule(friendRule());
  settings.subscribe(() => controller.setFriendRule(friendRule()));
  ui.progress(0.66, 'Planting flowers');
  await controller.start(plan);
  stage.onResize((v) => controller.setViewport(v));
  settings.subscribe((s) => stage.setCloseness(s.zoom));
  return controller;
}
