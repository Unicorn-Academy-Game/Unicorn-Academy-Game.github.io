import { faults } from '../game/faults';
import { browserOffline } from '../offline/browser';
import { chooseVisit, firstPlan, hasBegun, openingOf } from '../persistence/visit';
import { GAME_NAME } from '../shared/brand';
import type { OverlayDeps } from '../ui/overlay';
import type { Ui } from '../ui/ui';
import { beginPlay } from './begin';
import { newId, offlineEnabled, randomSeed } from './browser';
import { exposeForTests } from './debug';
import { loadGraphics } from './graphics';
import { noSeeking, showGuide } from './guide';
import { listenForInput } from './input';
import { openStored, readKept } from './kept';
import { makeLearning } from './learning';
import { takeNewestVersion, watchPage } from './page';
import { makeParentPanel, watchAttention } from './parent';
import { makeScreens } from './screens';
import { createSession } from './session';
import { makeSound } from './sound';
import { noDesks } from './tables';
import { showTitle } from './title';
import { noOverlays, startWorld } from './world';

/**
 * Brings the game up behind the loading screen, in the order the parts need each other: what the
 * device kept, the picture, the sound, the world, the player's controls, and last the screens that
 * open over it. The title waits for Play.
 */
export async function boot(ui: Ui): Promise<void> {
  // The badge goes up before anything loads, so it is there on the loading screen too.
  if (chooseVisit(location, true) === 'incognito') ui.showIncognito();
  const offline = offlineEnabled() ? browserOffline() : null;
  if (offline && (await takeNewestVersion(offline, ui))) return;

  ui.progress(0.04, 'Waking up the unicorns');
  const surface = document.getElementById('game');
  if (!surface) throw new Error('the page has no game surface');
  const stored = await openStored(ui);
  const graphics = await loadGraphics(ui, surface, stored.settings);
  const { scene, profile, manifest } = graphics;

  ui.progress(0.64, 'Finding your unicorns');
  const kept = await readKept(stored, manifest);
  const { visit, tab, settings, learner, play, durable, saves, outcome } = kept;
  if (outcome.kind === 'too-new') {
    ui.failed(`This world was saved by a newer version of ${GAME_NAME}. Please update the app to keep playing.`, () =>
      location.reload(),
    );
    return;
  }

  const session = createSession(saves);
  const sound = makeSound({ manifest, profile, settings, ui });
  watchPage({ offline, session, saves, settings, learner, play, audio: sound.audio, voice: sound.voice, visit, tab });

  // The world waits on the title screen at the place the player begins at. A tab that is carrying a
  // game on begins where the player stood.
  const opening = openingOf(visit, outcome, hasBegun(tab), { worldGeneration: newId(), seed: randomSeed() });
  const overlays = noOverlays();
  const plan = firstPlan(opening, settings.get().startPlace);
  const controller = await startWorld({ ui, graphics, settings, saves, sound, plan, overlays });
  session.begin(controller);

  const input = listenForInput(scene, controller);
  const seeking = noSeeking();
  showGuide({ ui, scene, controller, pointer: input.pointer, seeking });
  const { panel, keeper } = makeParentPanel({
    ui,
    profile,
    visit,
    store: stored.store,
    session,
    saves,
    settings,
    learner,
    play,
    durable,
    audio: sound.audio,
    offline,
    input,
  });
  watchAttention({ ui, saves, settings, learner, visit });

  ui.progress(1);
  ui.doneLoading();
  const overlay: OverlayDeps = {
    host: ui.host,
    mount: (node) => ui.underlay(node),
    calm: () => settings.get().reducedEffects,
  };
  const screens = makeScreens({ overlay, graphics, sound, controller, gate: input.gate });
  overlays.wonders = screens.wonders;
  overlays.pad = screens.pad;
  const desks = noDesks();
  const learning = makeLearning({
    ui,
    overlay,
    graphics,
    settings,
    learner,
    play,
    sound,
    controller,
    gate: input.gate,
    screens,
    panel,
    desks,
  });
  overlays.sitDown = learning.tables.sitDown;
  Object.assign(seeking, learning.seeking);

  showTitle({
    ui,
    controller,
    settings,
    visit,
    opening,
    tab,
    begin: () =>
      beginPlay({
        ui,
        controller,
        settings,
        tab,
        offline,
        screens,
        bookChip: learning.bookChip,
        fullscreen: input.fullscreen,
        panel,
        tables: learning.tables,
      }),
  });

  exposeForTests({
    controller,
    faults,
    stage: graphics.stage,
    pointer: input.pointer,
    manifest,
    saves,
    store: stored.store,
    outcome,
    audio: sound.audio,
    engine: sound.engine,
    synth: sound.synth,
    settings,
    fine: graphics.fine,
    keeper,
    panel,
    offline,
    visit,
    ui,
    pad: screens.pad,
    wonders: screens.wonders,
    profile,
    learner,
    lessons: learning.lessons,
    voice: sound.voice,
    spellBook: learning.spellBook,
    bookChip: learning.bookChip,
    durable,
    play,
    reading: {
      seat: learning.tables.seat.reading,
      get reader() {
        return desks.reading;
      },
    },
    memory: {
      seat: learning.tables.seat.memory,
      get game() {
        return desks.memory;
      },
    },
    maths: {
      seat: learning.tables.seat.maths,
      get game() {
        return desks.maths;
      },
    },
  });
}
