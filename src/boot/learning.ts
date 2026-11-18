import { SpellSounds } from '../audio/spell-sounds';
import type { GameController } from '../game/controller';
import type { Rest } from '../game/ports';
import { sharedRest } from '../game/rest';
import { Teacher } from '../game/teacher';
import { tally } from '../learning';
import type { LearnerModel } from '../persistence/learner';
import type { PlayModel } from '../persistence/play';
import type { SettingsModel } from '../persistence/settings';
import { wordPictures } from '../render/word-pictures';
import { BookChip } from '../ui/learning/book-chip';
import { SpellBook } from '../ui/learning/spell-book';
import { SpellCard } from '../ui/learning/spell-card';
import type { OverlayDeps } from '../ui/overlay';
import type { ParentPanel } from '../ui/parent/panel';
import type { Ui } from '../ui/ui';
import { SILENT } from '../wonder/sound';
import { after } from './browser';
import type { Graphics } from './graphics';
import type { Seeking } from './guide';
import type { InputGate } from './input';
import type { Screens } from './screens';
import { type Sound, WORLD_UNDER_A_CARD, WORLD_UNDER_A_GAME } from './sound';
import { type Desks, makeTables, type Tables } from './tables';

export interface Learning {
  lessons: Teacher;
  spellBook: SpellBook;
  bookChip: BookChip;
  tables: Tables;
  /** How the guide asks the lessons for the word the player is being shown the way to. */
  seeking: Seeking;
  /** Holds the world still for as long as a screen of the game's own is up. */
  rest: Rest;
  /** True when nothing else has the screen, so another screen may go up. */
  idle: () => boolean;
}

interface LearningDeps {
  ui: Ui;
  overlay: OverlayDeps;
  graphics: Graphics;
  settings: SettingsModel;
  learner: LearnerModel;
  play: PlayModel;
  sound: Sound;
  controller: GameController;
  gate: InputGate;
  screens: Screens;
  panel: ParentPanel;
  desks: Desks;
}

/**
 * The lesson: what the player touches may ask for its name, on a card over the world. The Spell
 * Book holds the words found so far, the button in the corner says how many, and the tables are
 * lessons too.
 */
export function makeLearning({
  ui,
  overlay,
  graphics,
  settings,
  learner,
  play,
  sound,
  controller,
  gate,
  screens,
  panel,
  desks,
}: LearningDeps): Learning {
  const { scene, manifest } = graphics;
  const { engine, synth, voice } = sound;
  const wordPicture = wordPictures(scene, manifest, screens.portraits);
  const spellSounds = new SpellSounds(() => synth ?? SILENT);
  // The card and the Spell Book can be up together, and the world wakes when the last of them goes.
  const rest = sharedRest({
    freeze: () => {
      gate.take();
      engine?.duck(WORLD_UNDER_A_CARD);
      controller.sleep();
    },
    thaw: () => {
      controller.wake();
      engine?.duck(1);
      gate.give();
    },
  });
  // Nothing else has the screen: the game is being played and no controls or games are up.
  const free = (): boolean =>
    controller.phase === 'playing' &&
    !panel.isOpen &&
    !screens.pad.isOpen &&
    !screens.wonders.isOpen &&
    !Object.values(desks).some((desk) => desk?.busy);

  const lessons = new Teacher({
    settings: () => settings.get().learning,
    book: learner,
    now: () => Date.now(),
    random: Math.random,
    later: after,
    canOpen: () => free() && !spellBook.isOpen,
    makeCard: (handlers) => new SpellCard(overlay, handlers),
    picture: wordPicture,
    voice,
    sounds: spellSounds,
    rest,
    celebrate: (effect, place) => controller.celebrate(effect, place),
    // A word that has been spelled flies to the book that is open, or to the button that opens it.
    keep: (kept) => (spellBook.isOpen ? spellBook.kept(kept) : bookChip.kept(kept)),
    report: (error) => console.error(error),
  });
  controller.setLesson(lessons);
  const spellBook = new SpellBook({
    ...overlay,
    letters: () => settings.get().learning.letters,
    profile: () => learner.get(),
    now: () => Date.now(),
    picture: wordPicture,
    rest,
    practice: (word) => lessons.practice(word),
    // The book is shut before the player sets off, so the first thing they come to can ask for its
    // word at once.
    find: (word) => {
      if (!lessons.seek(word)) return false;
      spellBook.close();
      controller.seekGo(word);
      return true;
    },
    sounds: spellSounds,
  });
  const bookChip = new BookChip({
    layer: ui.host,
    calm: overlay.calm,
    busy: () => lessons.busy,
    open: () => {
      if (free() && !lessons.busy) spellBook.open();
    },
  });
  bookChip.set(tally(learner.get(), Date.now()).collected);
  learner.subscribe((profile) => {
    spellBook.refresh();
    bookChip.sync(tally(profile, Date.now()).collected);
  });
  settings.subscribe(() => {
    lessons.settingsChanged();
    // The book and its button stay with learning off, so the player can look at the words. A word
    // in it only asks for its card while learning is on.
    spellBook.refresh();
    // A table that is up shows the voice as it is now.
    for (const desk of Object.values(desks)) desk?.settingsChanged();
  });

  const tableRest: Rest = {
    freeze: () => {
      rest.freeze();
      engine?.duck(WORLD_UNDER_A_GAME);
    },
    thaw: () => rest.thaw(),
  };
  const tables = makeTables({
    ui,
    overlay,
    settings,
    learner,
    play,
    sound,
    desks,
    rest: tableRest,
    picture: wordPicture,
    free,
  });
  const seeking: Seeking = {
    word: () => lessons.seeking,
    picture: wordPicture,
    stop: () => lessons.stopSeeking(),
  };
  const idle = (): boolean => free() && !lessons.busy && !spellBook.isOpen;
  return { lessons, spellBook, bookChip, tables, seeking, rest, idle };
}
