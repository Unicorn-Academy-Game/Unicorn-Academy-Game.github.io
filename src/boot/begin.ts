import type { GameController } from '../game/controller';
import type { OfflineService } from '../offline/service';
import type { SettingsModel } from '../persistence/settings';
import { markBegun } from '../persistence/visit';
import type { Fullscreen } from '../ui/fullscreen';
import type { BookChip } from '../ui/learning/book-chip';
import type { ParentPanel } from '../ui/parent/panel';
import type { Ui } from '../ui/ui';
import { after, type TabStorage } from './browser';
import type { Screens } from './screens';
import type { Tables } from './tables';

/**
 * How long after Play the chunks of the tables start to come down, which leaves the first moments
 * of the world to the world.
 */
const PRELOAD_TABLES_MS = 4000;

interface BeginDeps {
  ui: Ui;
  controller: GameController;
  settings: SettingsModel;
  tab: TabStorage | null;
  offline: OfflineService | null;
  screens: Pick<Screens, 'portraits' | 'produceIcons'>;
  bookChip: BookChip;
  /** Opens the map of the island, when nothing else has the screen. */
  openMap: (opener: HTMLElement) => void;
  fullscreen: Fullscreen;
  panel: ParentPanel;
  tables: Tables;
}

/** What the player sees once Play is pressed: the world, the finder, the basket and the buttons. */
export function beginPlay({
  ui,
  controller,
  settings,
  tab,
  offline,
  screens,
  bookChip,
  openMap,
  fullscreen,
  panel,
  tables,
}: BeginDeps): void {
  markBegun(tab);
  controller.begin();
  ui.showFinder(screens.portraits, controller.world.persistent.recruited, () => settings.get().reducedEffects);
  ui.cornerNode.append(bookChip.node);
  ui.showBasket(screens.produceIcons, () => settings.get().reducedEffects);
  // With the game under way, the rest of it can be kept for offline play in the background.
  offline?.keep();
  // The chunks of the tables come down once the world has had a moment to itself, so that they are
  // there when the player first sits down.
  after(PRELOAD_TABLES_MS, () => tables.preload());
  ui.showHud({
    onMap: openMap,
    onSound: () => settings.update({ muted: !settings.get().muted }),
    ...(fullscreen.supported ? { onFullscreen: () => void fullscreen.toggle() } : {}),
    onParent: (opener) => panel.open(opener),
  });
  ui.setMuted(settings.get().muted);
  // The button follows full screen however it starts or stops: its own tap, the F key, the Escape
  // key or a swipe.
  ui.setFullscreen(fullscreen.active);
  fullscreen.subscribe((active) => ui.setFullscreen(active));
}
