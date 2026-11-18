import { z } from 'zod';
import { UNICORN_IDS } from './ids';

/**
 * What sounds exist and where they live. The asset tools render and pack exactly these, the
 * manifest describes where each one ended up, and the game plays them by id. Adding a sound means
 * adding a row here, a recipe in `tools/audio/catalog.ts` and, if something should trigger it, a
 * cue in `src/audio/cues.ts`.
 */

/**
 * What a sound is for. Groups share voice limits and decide what may be cut off when the mix is
 * crowded.
 */
const SOUND_GROUPS = ['step', 'voice', 'character', 'magic', 'object', 'ui'] as const;
export type SoundGroup = (typeof SOUND_GROUPS)[number];

/** Sounds ship in a few sheets so a sheet can be fetched and decoded when it is needed. */
export const SHEET_IDS = ['core', 'magic', 'objects'] as const;
export type SheetId = (typeof SHEET_IDS)[number];

export interface SoundFamily {
  sheet: SheetId;
  group: SoundGroup;
  /**
   * How many near-identical takes exist. The player picks one at random, never the same one twice
   * in a row.
   */
  variants: number;
}

const family = (sheet: SheetId, group: SoundGroup, variants = 1): SoundFamily => ({ sheet, group, variants });

const voices = Object.fromEntries(UNICORN_IDS.map((id) => [`voice-${id}`, family('core', 'voice', 2)])) as Record<
  `voice-${(typeof UNICORN_IDS)[number]}`,
  SoundFamily
>;
const nickers = Object.fromEntries(UNICORN_IDS.map((id) => [`nicker-${id}`, family('core', 'voice')])) as Record<
  `nicker-${(typeof UNICORN_IDS)[number]}`,
  SoundFamily
>;

export const SOUND_FAMILIES = {
  // Movement.
  'hoof-grass': family('core', 'step', 4),
  'hoof-hard': family('core', 'step', 3),
  // Unicorns and grown-ups.
  ...voices,
  ...nickers,
  recruit: family('core', 'character'),
  hearts: family('core', 'character'),
  hello: family('core', 'character'),
  drink: family('core', 'character'),
  stomp: family('core', 'character'),
  hop: family('core', 'character'),
  splash: family('core', 'character'),
  relocate: family('core', 'character'),
  // Interface.
  tap: family('core', 'ui'),
  confirm: family('core', 'ui'),
  refusal: family('core', 'ui'),
  transition: family('core', 'ui'),
  // The six spells, then what they do to things.
  'spell-light': family('magic', 'magic'),
  'spell-nature': family('magic', 'magic'),
  'spell-ice': family('magic', 'magic'),
  'spell-water': family('magic', 'magic'),
  'spell-fire': family('magic', 'magic'),
  'spell-lightning': family('magic', 'magic'),
  'fx-bloom': family('magic', 'magic'),
  'fx-lantern': family('magic', 'magic'),
  'fx-brazier': family('magic', 'magic'),
  'fx-ice': family('magic', 'magic'),
  'fx-spray': family('magic', 'magic'),
  'fx-pinwheel': family('magic', 'magic'),
  'fx-glow': family('magic', 'magic'),
  'fx-rainbow': family('magic', 'magic'),
  // Things in the world.
  'door-open': family('objects', 'object'),
  'door-close': family('objects', 'object'),
  'chest-open': family('objects', 'object'),
  'chest-close': family('objects', 'object'),
  gem: family('objects', 'object', 3),
  // The piano by the palace: a run of ten notes, one for each key that lights.
  'piano-run': family('objects', 'object'),
  // The computer by the palace: the screen wakes with a rising bleep and the keys are lit one after
  // another, each with a small tap.
  'computer-wake': family('objects', 'object'),
  'treasure-bounce': family('objects', 'object'),
  'treasure-float': family('objects', 'object'),
  'palace-welcome': family('objects', 'object'),
  'cup-fill': family('objects', 'object'),
  brush: family('objects', 'object', 3),
  broom: family('objects', 'object', 3),
  hay: family('objects', 'object', 3),
  shears: family('objects', 'object'),
  'water-pour': family('objects', 'object'),
  // The Spooky Manor.
  'lift-ding': family('objects', 'object'),
  'code-success': family('objects', 'object'),
} as const satisfies Record<string, SoundFamily>;

export type SoundFamilyId = keyof typeof SOUND_FAMILIES;

/** The name of one take inside a sheet. */
export const spriteId = (id: SoundFamilyId, variant: number): string => `${id}.${variant}`;

/**
 * Music and ambience: long loops that play under everything. `lufs` is the integrated loudness each
 * is set to. Music sits at -20 so it is a companion and not a foreground, outdoor ambience under
 * it, and the rooms quieter still.
 */
export const LOOPS = {
  'music-forest': { kind: 'music', seconds: 36, lufs: -20 },
  'music-garden': { kind: 'music', seconds: 36, lufs: -20 },
  'music-snow': { kind: 'music', seconds: 32, lufs: -20 },
  'ambience-forest': { kind: 'ambience', seconds: 24, lufs: -27 },
  'ambience-garden': { kind: 'ambience', seconds: 24, lufs: -27 },
  'ambience-treasure-room': { kind: 'ambience', seconds: 16, lufs: -33 },
  'ambience-stable-room': { kind: 'ambience', seconds: 16, lufs: -33 },
  'ambience-manor-yard': { kind: 'ambience', seconds: 24, lufs: -28 },
  'ambience-manor-hall': { kind: 'ambience', seconds: 16, lufs: -33 },
  'ambience-sky-garden': { kind: 'ambience', seconds: 16, lufs: -32 },
} as const;

/** Every ambience a map or a place in a map can ask for. Each is the loop `ambience-<name>`. */
export const AMBIENCE_IDS = [
  'forest',
  'garden',
  'treasure-room',
  'stable-room',
  'manor-yard',
  'manor-hall',
  'sky-garden',
] as const;
export type AmbienceId = (typeof AMBIENCE_IDS)[number];
export type LoopId = keyof typeof LOOPS;

export const LoopAsset = z.object({
  /** Hashed path relative to the manifest URL's directory. */
  file: z.string().min(1),
  kind: z.enum(['music', 'ambience']),
  /** Length of one repeat, in seconds. */
  seconds: z.number().positive(),
  /**
   * Where one repeat starts and ends inside the file. The file carries a little of the loop on each
   * side, so a decoder that adds or removes a few milliseconds still lands on the same seamless
   * stretch.
   */
  loopStart: z.number().nonnegative(),
  loopEnd: z.number().positive(),
  bytes: z.number().int().positive(),
  /** Integrated loudness of the encoded file, in LUFS. */
  lufs: z.number(),
  /** True peak of the encoded file, in dBTP. */
  truePeak: z.number(),
  /** Memory the decoded loop takes in a 48 kHz stereo float context. */
  decodedBytes: z.number().int().positive(),
});
export type LoopAsset = z.infer<typeof LoopAsset>;

const Sprite = z.object({ start: z.number().nonnegative(), duration: z.number().positive() });

export const SheetAsset = z.object({
  file: z.string().min(1),
  bytes: z.number().int().positive(),
  seconds: z.number().positive(),
  sprites: z.record(z.string(), Sprite),
  /** Memory the decoded sheet takes in a 48 kHz mono float context. */
  decodedBytes: z.number().int().positive(),
});
export type SheetAsset = z.infer<typeof SheetAsset>;

/**
 * What every line of the voice is set to. `lufs` is the loudness of the loudest 400 ms of a clip as
 * it is heard from two speakers. A sentence measures about 5.5 LU lower as a whole (4.7 to 7.0 over
 * 12 sentences, by the EBU meter), so -12 here is about -17.5 for the clip, which is where speech
 * made for a phone sits (a podcast is -16). The world is turned down under a card and under a game,
 * and the effects slider starts at 0.8 and takes 4 dB off, so a voice that is meant to be the
 * loudest thing on the screen is set above the world's big moments, which are at -16. `rate` is the
 * sample rate of the files, and the player's context resamples on decode. `truePeak` is the highest
 * peak an encoded file may have, in dBTP.
 */
export const SPEECH = { lufs: -12, rate: 24000, truePeak: -1 } as const;

/**
 * The rate the game asks the browser's audio context for. Music and sound are packed at this rate,
 * so the browser plays them as they are and does not make them again.
 */
export const CONTEXT_RATE = 32000;

/**
 * How many times longer than its master each kind of clip is made, which is how much slower it is
 * spoken. The masters are said at the pace the model gives a child's line, and a sentence of short
 * words comes out at 4 words a second, which is a grown-up talking to a grown-up. A child who is
 * learning to read wants about 2.7. The packer slows a master without changing its pitch
 * (`tools/assets/speech.ts`), so the shipped clip is longer than its master by this much, and the
 * times of the words of a sentence are the master's times by this much too. A kind that is not here
 * is left as it is: the sound of a letter is a tenth of a second long, and slowing it would change
 * what it sounds like.
 */
const PACE: Readonly<Record<string, number>> = {
  line: 1.5,
  open: 1.5,
  again: 1.5,
  can: 1.5,
  page: 1.5,
  milestone: 1.5,
  read: 1.5,
  press: 1.5,
  everything: 1.5,
  play: 1.5,
  star: 1.25,
  cheer: 1.25,
  word: 1.25,
  shout: 1.25,
  num: 1.25,
  maths: 1.5,
  lead: 1.5,
  last: 1.5,
};

/**
 * Words and two sentences that slowing spoils. The word listener understood each master, and then
 * wrote another word for the slowed clip, such as `buggy` for `bug`, `hats` for `hat` and `now` for
 * `no`, because the stretch lays a piece of the voice down on a burst or a stop. It wrote `A hen in
 * a pan.` for `A hen in a pen.` and `ribbon it` for `rib in it`. Pitch tracking also mistook a
 * stretched `bus` or `see` for a rattle. Each is said at the pace of its master, which the
 * generator already made slower than the model's own. `tools/voice/verify.py` is how a clip gets on
 * this list.
 */
export const KEPT_AT_MASTER_PACE: ReadonlySet<string> = new Set([
  'shout.bed',
  'shout.petal',
  'shout.pumpkin',
  'word.best',
  'word.bug',
  'word.bus',
  'word.dome',
  'word.fill',
  'word.full',
  'word.hat',
  'word.hole',
  'word.kettle',
  'word.knock',
  'word.mail',
  'word.make',
  'word.no',
  'word.peaches',
  'word.petal',
  'word.quit',
  'word.rib',
  'word.sang',
  'word.see',
  'word.shy',
  'word.vet',
  'word.were',
  'word.wood',
  'word.zip',
  'line.a-hen-in-a-pen',
  'line.i-can-dip-a-rib-in-it',
]);

/**
 * How many times longer the clip with this id is made than its master. The kind of a clip is what
 * comes before the first dot in its id.
 */
export const paceOf = (id: string): number => (KEPT_AT_MASTER_PACE.has(id) ? 1 : (PACE[id.split('.')[0]!] ?? 1));

/**
 * Whether the clip is a piece cut from the middle of a sentence, which runs straight on into the
 * clip that follows it: `lead.34` in "What is thirty-four plus five?" The pieces of one sentence
 * are laid end to end with no quiet between them, as the speaker said them, and every other clip
 * is said as a thing of its own, with a pause after it. The kind of a clip is what comes before
 * the first dot in its id.
 */
export const runsOn = (id: string): boolean => id.startsWith('lead.');

/**
 * Whether the clip is a piece cut from a whole sentence, `lead.34` or `last.5`. A piece is not set
 * to the loudness of the voice on its own: the sentence is, and each piece is turned up by the
 * same amount, so the words of a question keep the levels they were spoken at.
 */
export const isPiece = (id: string): boolean => id.startsWith('lead.') || id.startsWith('last.');

/**
 * The loudness of the loudest 400 ms of a sentence in the masters of its pieces, in LUFS, which is
 * what `SENTENCE_LUFS` in `tools/voice/frames.py` sets them to. The packer turns every piece up by
 * the difference between this and `SPEECH.lufs`.
 */
export const PIECE_LUFS = -16;

/**
 * One line the voice says: the sound of a letter, a word, or a sentence. Each is a file of its own,
 * so it can be fetched and decoded when it is wanted.
 */
export const SpeechClip = z.object({
  file: z.string().min(1),
  bytes: z.number().int().positive(),
  /** How long it speaks, in seconds. */
  seconds: z.number().positive(),
  /**
   * Loudness of the loudest 400 ms of the encoded file, in LUFS, so clips of different lengths can
   * be set against each other.
   */
  lufs: z.number(),
  /** True peak of the encoded file, in dBTP. */
  truePeak: z.number(),
});
export type SpeechClip = z.infer<typeof SpeechClip>;

/**
 * The voice that ships with the game: recorded once, by a model, and the same on every device. The
 * ids are the ones in `src/learning/lines.ts`.
 */
export const SpeechAssets = z.object({
  /** Who is speaking, for the record. */
  voice: z.string().min(1),
  clips: z.record(z.string().min(1), SpeechClip),
});
export type SpeechAssets = z.infer<typeof SpeechAssets>;

export const AudioAssets = z.object({
  loops: z.record(z.enum(Object.keys(LOOPS) as [LoopId, ...LoopId[]]), LoopAsset),
  sheets: z.record(z.enum(SHEET_IDS), SheetAsset),
  /** Absent in a manifest from before the game could speak, which is a game with no voice. */
  speech: SpeechAssets.optional(),
});
export type AudioAssets = z.infer<typeof AudioAssets>;

/** Bytes a decoded buffer takes: 32-bit floats for every channel of every frame. */
export const decodedBytes = (seconds: number, channels: number, sampleRate = 48000): number =>
  Math.ceil(seconds * sampleRate) * channels * 4;

/** Decoded audio that may be held at once, in bytes. */
export const DECODED_BUDGET = 48 * 1024 * 1024;

/**
 * What the voice may hold decoded at once, in bytes. It is counted into the budget above, and what
 * is over it is let go, least recently said first.
 */
export const SPEECH_RESIDENT = 2.5 * 1024 * 1024;
