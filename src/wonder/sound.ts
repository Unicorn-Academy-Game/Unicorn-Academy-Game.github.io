/**
 * What a game asks of the sound. The synth in `src/audio` answers it, and a test or a lab answers
 * it with silence. Games only ever name a sound or a note, never a node, so every game stays in
 * tune and none can be louder than another by accident.
 */

/**
 * One shot sounds. `size` (0 to 1) says how big the thing is, so a small shell and a great one
 * differ.
 */
export type FxName =
  | 'launch'
  | 'boom'
  | 'crackle'
  | 'pop'
  | 'snap'
  | 'boing'
  | 'whoosh'
  | 'splash'
  | 'star'
  | 'twinkle'
  | 'swell'
  | 'tap'
  | 'cheer'
  | 'gear'
  | 'ding'
  | 'poof'
  | 'whistle'
  | 'rumble'
  | 'wind'
  | 'coin'
  | 'thud';

/** Every sound a game can ask for, so a test can walk them all. */
export const FX_NAMES: readonly FxName[] = [
  'launch',
  'boom',
  'crackle',
  'pop',
  'snap',
  'boing',
  'whoosh',
  'splash',
  'star',
  'twinkle',
  'swell',
  'tap',
  'cheer',
  'gear',
  'ding',
  'poof',
  'whistle',
  'rumble',
  'wind',
  'coin',
  'thud',
];

export interface FxOptions {
  gain?: number;
  /** -1 left, 1 right. */
  pan?: number;
  /** Semitones up or down from the sound as made. */
  pitch?: number;
  /**
   * Steps up the scale, for the sounds that are tuned. All of them are in one key, so any step goes
   * with any other.
   */
  step?: number;
  /** Seconds from now. */
  delay?: number;
  /** 0 to 1. */
  size?: number;
}

/** The instruments. Every one plays a note by its MIDI number. */
export type VoiceName =
  | 'bell'
  | 'glass'
  | 'pluck'
  | 'marimba'
  | 'harp'
  | 'pad'
  | 'bass'
  | 'chime'
  | 'flute'
  | 'ping'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'sub'
  | 'kit';

export const VOICE_NAMES: readonly VoiceName[] = [
  'bell',
  'glass',
  'pluck',
  'marimba',
  'harp',
  'pad',
  'bass',
  'chime',
  'flute',
  'ping',
  'kick',
  'snare',
  'hat',
  'sub',
  'kit',
];

export interface NoteOptions {
  gain?: number;
  pan?: number;
  /** How long it is held, in seconds. */
  seconds?: number;
  delay?: number;
  /**
   * Music the game plays by itself goes on the music level, and what the player plays goes on the
   * effects level.
   */
  bus?: 'effects' | 'music';
}

export interface WonderSound {
  fx(name: FxName, options?: FxOptions): void;
  note(voice: VoiceName, midi: number, options?: NoteOptions): void;
  /**
   * Seconds on the sound's own clock. A game that keeps time for itself reads it to put each note
   * exactly where it belongs.
   */
  now(): number;
}

/** A sound that is not there, for the lab, for tests, and for a device with no audio. */
export const SILENT: WonderSound = {
  fx: () => undefined,
  note: () => undefined,
  now: () => 0,
};

/** One sound the recorder was asked for, with the moment it was to start on the sound's clock. */
export type Played =
  | { readonly at: number; readonly fx: FxName; readonly options: FxOptions }
  | { readonly at: number; readonly voice: VoiceName; readonly midi: number; readonly options: NoteOptions };

/** What the recorder wrote down. */
export interface Recording extends WonderSound {
  readonly log: readonly string[];
  /**
   * Every sound asked for, with when it was to start, so a music a game plays can be laid out in
   * time or rendered.
   */
  readonly played: readonly Played[];
  /**
   * Writes a line of the caller's own among what was asked, so a test can see what happened between
   * sounds.
   */
  mark(entry: string): void;
  /**
   * Moves the clock the games read, so a test can keep time for them. Does nothing when the clock
   * is another one's.
   */
  advance(seconds: number): void;
  clear(): void;
}

/**
 * A sound that writes down what it was asked, so a test can check that a game made the sounds it
 * should. Its clock is its own and moves only when it is told to, unless it is given another clock
 * to read, such as the lab's.
 */
export function recorder(clock?: () => number): Recording {
  const log: string[] = [];
  const played: Played[] = [];
  let own = 0;
  const now = clock ?? ((): number => own);
  return {
    log,
    played,
    mark: (entry) => void log.push(entry),
    fx: (name, options = {}) => {
      log.push(options.size !== undefined ? `fx:${name}:${options.size.toFixed(1)}` : `fx:${name}`);
      played.push({ at: now() + (options.delay ?? 0), fx: name, options });
    },
    note: (voice, midi, options = {}) => {
      log.push(`note:${voice}:${midi}`);
      played.push({ at: now() + (options.delay ?? 0), voice, midi, options });
    },
    now,
    advance: (seconds) => {
      own += clock ? 0 : seconds;
    },
    clear: () => {
      log.length = 0;
      played.length = 0;
    },
  };
}
