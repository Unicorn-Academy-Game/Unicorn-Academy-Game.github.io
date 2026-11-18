import type { WordId } from '../content/lexicon';
import type { TableId } from '../content/props';
import type { Desk } from '../game/desk';
import type { Rest } from '../game/ports';
import type { LearnerModel } from '../persistence/learner';
import type { PlayModel } from '../persistence/play';
import type { SettingsModel } from '../persistence/settings';
import type { OverlayDeps } from '../ui/overlay';
import type { Ui } from '../ui/ui';
import { SILENT, type WonderSound } from '../wonder/sound';
import { after } from './browser';
import type { Sound } from './sound';

/** The session at each table, once its chunk has come. */
export type Desks = { [T in TableId]: Desk | null };

export const noDesks = (): Desks => ({ reading: null, memory: null, maths: null });

export interface Tables {
  /**
   * Brings a table's chunk down when it is first asked for, and makes its session. Null when the
   * chunk did not come, and the next ask tries again.
   */
  seat: Record<TableId, () => Promise<Desk | null>>;
  /** What a tap on a table does a moment later: it is seated, and the player sits down. */
  sitDown: Record<TableId, () => void>;
  /** Asks for every chunk, so that they are there before anyone sits down. */
  preload(): void;
}

interface TablesDeps {
  ui: Ui;
  overlay: OverlayDeps;
  settings: SettingsModel;
  learner: LearnerModel;
  play: PlayModel;
  sound: Sound;
  /** Filled in as each session is made. */
  desks: Desks;
  /**
   * Holds the world still the way a game does, with the music far under, so that the sounds and the
   * voice are clear.
   */
  rest: Rest;
  picture: (word: WordId) => string;
  /** Nothing else has the screen. */
  free: () => boolean;
}

const BROKE: Record<TableId, string> = {
  reading: 'Hmm, the computer did not wake up.',
  memory: 'Hmm, the memory game did not open.',
  maths: 'Hmm, the maths game did not open.',
};

/**
 * The reading computer, the memory table and the maths table. Each one's session, screen and sounds
 * are a chunk of their own, so the world starts as fast without them. They come down while the game
 * is quiet after Play, or else when the player first sits down, and a chunk that did not come is
 * asked for again at the next tap. A tap on a table opens it whether learning is on or off, and only
 * the voice at the table is learning's.
 */
export function makeTables({
  ui,
  overlay,
  settings,
  learner,
  play,
  sound,
  desks,
  rest,
  picture,
  free,
}: TablesDeps): Tables {
  const { voice, synth } = sound;
  const wonderSound = (): WonderSound => synth ?? SILENT;
  const shared = {
    settings: () => settings.get().learning,
    random: Math.random,
    later: after,
    voice,
    rest,
    report: (error: unknown) => console.error(error),
  };

  const make: Record<TableId, () => Promise<Desk>> = {
    reading: async () => {
      const [{ Reader }, { ReadingScreen }, { ReadingSoundBank }] = await Promise.all([
        import('../game/reader'),
        import('../ui/learning/reading/screen'),
        import('../audio/reading-sounds'),
      ]);
      return new Reader({
        ...shared,
        book: learner,
        now: () => Date.now(),
        makeScreen: (handlers) => new ReadingScreen(overlay, handlers),
        sounds: new ReadingSoundBank(wonderSound),
      });
    },
    memory: async () => {
      const [{ MemoryGame }, { MemoryTable }, { PlaySoundBank }] = await Promise.all([
        import('../game/memory-game'),
        import('../ui/learning/play/memory-screen'),
        import('../audio/play-sounds'),
      ]);
      return new MemoryGame({
        ...shared,
        play,
        makeScreen: (handlers) => new MemoryTable({ ...overlay, picture }, handlers),
        sounds: new PlaySoundBank(wonderSound),
      });
    },
    maths: async () => {
      const [{ MathsGame }, { MathsTable }, { PlaySoundBank }] = await Promise.all([
        import('../game/maths-game'),
        import('../ui/learning/play/maths-screen'),
        import('../audio/play-sounds'),
      ]);
      return new MathsGame({
        ...shared,
        setSettings: (patch) => settings.update({ learning: { ...settings.get().learning, ...patch } }),
        play,
        makeScreen: (handlers) => new MathsTable({ ...overlay, picture }, handlers),
        sounds: new PlaySoundBank(wonderSound),
      });
    },
  };

  const seatOnce = (table: TableId): (() => Promise<Desk | null>) => {
    let seating: Promise<Desk | null> | null = null;
    return () => {
      seating ??= make[table]().then(
        (desk) => {
          desks[table] = desk;
          return desk;
        },
        (error: unknown) => {
          console.error(error);
          seating = null;
          return null;
        },
      );
      return seating;
    };
  };
  const seat: Tables['seat'] = { reading: seatOnce('reading'), memory: seatOnce('memory'), maths: seatOnce('maths') };

  const sitAt = (table: TableId): (() => void) => {
    const sit = (): void => {
      // Something else may have come up in the moment it took for the tap to get here and the chunk
      // to come.
      if (!free()) return;
      void seat[table]().then((desk) => {
        if (!free()) return;
        if (desk === null || desk.open() === 'broke') ui.showNotice(BROKE[table], { label: 'Try again', run: sit });
      });
    };
    return sit;
  };
  const sitDown: Tables['sitDown'] = { reading: sitAt('reading'), memory: sitAt('memory'), maths: sitAt('maths') };

  return {
    seat,
    sitDown,
    preload: () => {
      void seat.reading();
      void seat.memory();
      void seat.maths();
    },
  };
}
