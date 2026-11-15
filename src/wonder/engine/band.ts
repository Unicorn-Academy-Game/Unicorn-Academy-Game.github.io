import type { Rng } from '../../domain/rng';
import { PENTATONIC } from '../music';
import type { VoiceName, WonderSound } from '../sound';
import { clamp, damp } from './ease';

/**
 * The music a game plays by itself under what the player plays. A style says what the layers are (a
 * pad, a bass, drums, a harp that runs up and down the chord) and how much music it takes for each
 * to join in, and the band plays the layers a sixteenth at a time, a moment ahead, on the sound's
 * own clock, so the beat never wobbles with the frame rate. Every note is of the one pentatonic
 * key, so whatever they play over it is right.
 */

/** Sixteenths in a bar of four beats. */
export const STEPS = 16;
const PER_BEAT = STEPS / 4;

/** How far ahead of the clock the notes are handed over, in seconds. */
const LOOKAHEAD = 0.28;
/** A step that is this far behind is dropped rather than played late. */
const LATE = 0.05;
/**
 * A gap between the picture's clock and the sound's clock bigger than this is a sleep, and the
 * picture jumps to the sound.
 */
const JUMP = 0.25;
/**
 * A clock that has not moved for this long is not one the music can follow, as when the sound is
 * locked or the page was hidden.
 */
const STILL = 0.1;
/** Time between starting and the first beat, so the first notes are built before they sound. */
const COUNT_IN = 0.12;
/** How loosely a note may be placed, so a bar played twice is not played the same twice. */
const HUMAN = 0.004;
/** How much music it takes for a layer to be at its full level once it has joined. */
const FADE_IN = 0.12;

/** Three notes, of one key, with the one the bass stands on first. */
export interface Chord {
  readonly name: string;
  /** Pitch classes, 0 being C. */
  readonly pcs: readonly [number, number, number];
}

/**
 * Every chord is made of notes of the one pentatonic scale, so the music and whatever the player
 * plays over it never clash.
 */
export const CHORDS = {
  C: { name: 'C', pcs: [0, 4, 7] },
  Am: { name: 'Am', pcs: [9, 0, 4] },
  G: { name: 'G', pcs: [7, 9, 2] },
  Csus: { name: 'Csus', pcs: [0, 2, 7] },
  E: { name: 'E', pcs: [4, 7, 9] },
  D: { name: 'D', pcs: [2, 7, 9] },
} as const satisfies Record<string, Chord>;

const above = (pc: number, low: number): number => low + ((((pc - low) % 12) + 12) % 12);

/** The notes of a chord from `low` upward, each the nearest one at or above `low`, in order. */
export function voicing(chord: Chord, low: number): number[] {
  return chord.pcs.map((pc) => above(pc, low)).sort((a, b) => a - b);
}

/** The root of a chord, the nearest one at or above `low`. */
export const rootAbove = (chord: Chord, low: number): number => above(chord.pcs[0], low);

/** What a layer is asked at each sixteenth. */
export interface Slot {
  /** 0 to 15. */
  readonly step: number;
  /** Bars since the music began. */
  readonly bar: number;
  readonly chord: Chord;
  /** The chord of the bar that follows, for a note that leads into it. */
  readonly next: Chord;
  readonly rng: Rng;
  /** How long a bar lasts at the tempo it is now. */
  readonly seconds: number;
}

/** A note a layer asks for. */
export interface Hit {
  readonly midi: number;
  /** Next to the layer's own level. */
  readonly gain?: number;
  /** -1 left to 1 right, for a note that is in its own place and not the layer's. */
  readonly pan?: number;
  /** How long it is held, for the instruments that are held. */
  readonly seconds?: number;
}

export interface Layer {
  readonly voice: VoiceName;
  /** How much music it takes for the layer to play, from 0 (always) to 1 (only at its fullest). */
  readonly joins: number;
  /** Its own level next to the other layers. */
  readonly gain: number;
  readonly pan?: number;
  /**
   * The level it plays on. Music under a game is on the music level, which is where a layer goes
   * unless it says it is what the player plays.
   */
  readonly bus?: 'effects' | 'music';
  readonly play: (slot: Slot) => Hit | readonly Hit[] | null;
}

export interface Style {
  readonly name: string;
  /** Beats per minute. */
  readonly tempo: number;
  /** How late the second sixteenth of each pair is, as a share of a sixteenth. 0 is straight. */
  readonly swing?: number;
  /**
   * How loosely a note may be placed, in seconds either way. Music is loose by a few thousandths,
   * and a style that is an instrument says 0.
   */
  readonly human?: number;
  /**
   * How far ahead of the clock notes are handed over, in seconds. What the player changes is heard
   * a moment later by that much, and a short one has less room for a late frame.
   */
  readonly lookahead?: number;
  /** One chord for each bar, going round. */
  readonly progression: readonly Chord[];
  readonly layers: readonly Layer[];
}

const MARKS: Readonly<Record<string, number>> = { x: 1, X: 1.3, o: 0.5, '.': 0 };

/**
 * A rhythm written as sixteen marks: `x` a note, `X` an accented one, `o` a soft one, `.` a rest.
 * Spaces and bars are ignored.
 */
export function rhythm(marks: string): readonly number[] {
  const clean = [...marks.replace(/[\s|]/g, '')];
  if (clean.length !== STEPS) throw new Error(`a bar has ${STEPS} steps, and ${marks} has ${clean.length}`);
  return clean.map((ch) => {
    const level = MARKS[ch];
    if (level === undefined) throw new Error(`${ch} is not a mark of a rhythm. Use x X o or .`);
    return level;
  });
}

/** One rhythm for every bar, or a list of them, one after the other, going round. */
function bars(marks: string | readonly string[]): (bar: number) => readonly number[] {
  const all = (typeof marks === 'string' ? [marks] : marks).map(rhythm);
  if (all.length === 0) throw new Error('a part needs a rhythm');
  return (bar) => all[bar % all.length]!;
}

interface Part {
  readonly joins: number;
  readonly gain: number;
  readonly pan?: number;
}

const partOf = (voice: VoiceName, part: Part, play: Layer['play']): Layer => ({
  voice,
  joins: part.joins,
  gain: part.gain,
  ...(part.pan === undefined ? {} : { pan: part.pan }),
  play,
});

/** A drum, played where the rhythm says. */
export function drum(voice: 'kick' | 'snare' | 'hat', marks: string | readonly string[], part: Part): Layer {
  const rhythmOf = bars(marks);
  return partOf(voice, part, ({ step, bar }) => {
    const level = rhythmOf(bar)[step]!;
    return level > 0 ? { midi: 60, gain: level } : null;
  });
}

/** A bass on the root of the chord. An accent jumps up an octave. */
export function bass(marks: string | readonly string[], part: Part, low = 36): Layer {
  const rhythmOf = bars(marks);
  return partOf('bass', part, ({ step, bar, chord, seconds }) => {
    const level = rhythmOf(bar)[step]!;
    if (level <= 0) return null;
    const root = rootAbove(chord, low);
    return { midi: level > 1.1 ? root + 12 : root, gain: Math.min(1, level), seconds: (seconds / STEPS) * 3 };
  });
}

/** A wash of the chord that is held for the bar. */
export function pad(part: Part, low = 55, voice: VoiceName = 'pad'): Layer {
  return partOf(voice, part, ({ step, chord, seconds }) =>
    step === 0 ? voicing(chord, low).map((midi) => ({ midi, seconds: seconds * 1.05 })) : null,
  );
}

/** How a part that runs through the notes of the chord goes through them. */
export type Run = 'up' | 'down' | 'updown' | 'skip';

const RUNS: Readonly<Record<Run, readonly number[]>> = {
  up: [0, 1, 2, 3, 4, 5],
  down: [5, 4, 3, 2, 1, 0],
  updown: [0, 1, 2, 3, 2, 1],
  skip: [0, 2, 1, 3, 2, 4],
};

/** A part that plays the notes of the chord one after another, at the places the rhythm says. */
export function arpeggio(
  voice: VoiceName,
  marks: string | readonly string[],
  part: Part & { low?: number; run?: Run },
): Layer {
  const rhythmOf = bars(marks);
  const order = RUNS[part.run ?? 'up'];
  return partOf(voice, part, ({ step, bar, chord }) => {
    const here = rhythmOf(bar);
    const level = here[step]!;
    if (level <= 0) return null;
    let nth = 0;
    for (let i = 0; i < step; i++) if (here[i]! > 0) nth++;
    const low = voicing(chord, part.low ?? 60);
    // Three notes and the same three an octave up, which is as far as a hand would reach.
    const ladder = [...low, ...low.map((n) => n + 12)];
    return { midi: ladder[order[nth % order.length]!]!, gain: Math.min(1, level) };
  });
}

/**
 * Chimes at random, at the places the rhythm says, each with a chance of sounding: a note of the
 * scale from `low` up for `span` semitones.
 */
export function chimes(
  voice: VoiceName,
  marks: string,
  chance: number,
  part: Part & { low?: number; span?: number },
): Layer {
  const rhythmOf = bars(marks);
  const low = part.low ?? 72;
  const span = part.span ?? 14;
  const notes = [0, 12].flatMap((octave) => PENTATONIC.map((n) => low + octave + n)).filter((n) => n <= low + span);
  return partOf(voice, part, ({ step, bar, rng }) => {
    const level = rhythmOf(bar)[step]!;
    if (level <= 0 || rng.next() > chance) return null;
    return { midi: rng.pick(notes), gain: Math.min(1, level) * rng.range(0.6, 1) };
  });
}

interface Passed {
  readonly time: number;
  readonly index: number;
  readonly seconds: number;
}

/** Plays a style. A game starts it, tells it how much is going on, and moves it on every frame. */
export class Band {
  /** How much music the game wants, from 0 to 1. The layers join in as it rises. */
  energy = 0.5;
  /** The tempo is the style's times this, so a game can quicken its music. */
  tempoScale = 1;
  /** Everything the band plays is this much louder or quieter. */
  gain = 1;
  /** Told as each sixteenth is reached, for a picture that moves to the beat. */
  onStep: ((step: number, bar: number) => void) | null = null;

  private running = false;
  private level = 0;
  /**
   * Where the music is, in seconds from its first beat. Follows the sound's clock when that is
   * moving.
   */
  private songTime = 0;
  /** What the sound's clock read at the first beat. */
  private origin = 0;
  private heard = 0;
  private still = 0;
  private nextIndex = 0;
  private nextTime = 0;
  private readonly coming: Passed[] = [];
  private last: Passed | null = null;

  constructor(
    private readonly sound: WonderSound,
    private readonly rng: Rng,
    readonly style: Style,
  ) {
    if (style.progression.length === 0) throw new Error('a style needs at least one chord');
  }

  get playing(): boolean {
    return this.running;
  }

  /** How much music is playing now: where `energy` is being eased to. */
  get music(): number {
    return this.level;
  }

  /** Where the music is in beats since its first, with a fraction. 0 before it begins. */
  get beats(): number {
    const at = this.last;
    if (!at) return 0;
    return (at.index + clamp((this.songTime - at.time) / at.seconds, 0, 1)) / PER_BEAT;
  }

  /**
   * 1 on a beat, falling away to 0 until the next, for something that should pulse with the music.
   */
  pulse(sharpness = 5): number {
    return Math.exp(-(this.beats % 1) * sharpness);
  }

  /** The chord that is playing. */
  get chord(): Chord {
    const at = this.last?.index ?? 0;
    return this.style.progression[Math.floor(at / STEPS) % this.style.progression.length]!;
  }

  /** Seconds in one beat at the tempo it is now. */
  get beatSeconds(): number {
    return 60 / (this.style.tempo * this.tempoScale);
  }

  start(): void {
    this.running = true;
    const now = this.sound.now();
    this.origin = now + COUNT_IN;
    this.songTime = -COUNT_IN;
    this.heard = now;
    this.still = 0;
    this.nextIndex = 0;
    this.nextTime = 0;
    this.coming.length = 0;
    this.last = null;
  }

  /** Stops. What was already handed to the sound, a fraction of a second, rings out. */
  stop(): void {
    this.running = false;
    this.coming.length = 0;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.level = damp(this.level, this.energy, 1.1, dt);
    this.follow(dt);
    // After a sleep the steps that were missed are not played one after the other. The music picks
    // up at the next bar.
    if (this.nextTime < this.songTime - 1) {
      this.nextIndex = (Math.floor(this.nextIndex / STEPS) + 1) * STEPS;
      this.nextTime = this.songTime + 0.05;
    }
    const horizon = this.songTime + (this.style.lookahead ?? LOOKAHEAD);
    for (let guard = 0; this.nextTime <= horizon && guard < 64; guard++) this.schedule();
    while (this.coming.length > 0 && this.coming[0]!.time <= this.songTime) {
      const passed = this.coming.shift()!;
      this.last = passed;
      this.onStep?.(passed.index % STEPS, Math.floor(passed.index / STEPS));
    }
  }

  /**
   * Brings the song's time to the sound's clock when that is moving, and carries on by the frame's
   * when it is not.
   */
  private follow(dt: number): void {
    const now = this.sound.now();
    this.songTime += dt;
    if (now > this.heard) {
      this.heard = now;
      this.still = 0;
      const off = now - this.origin - this.songTime;
      this.songTime += Math.abs(off) > JUMP ? off : off * Math.min(1, dt * 6);
    } else {
      this.still += dt;
      if (this.still > STILL) this.origin = now - this.songTime;
    }
  }

  /** Hands the sound the next sixteenth. */
  private schedule(): void {
    const index = this.nextIndex;
    const step = index % STEPS;
    const bar = (index - step) / STEPS;
    const { progression, layers, swing = 0, human = HUMAN } = this.style;
    const stepSeconds = this.beatSeconds / PER_BEAT;
    const time = this.nextTime + (step % 2 === 1 ? swing * stepSeconds : 0);
    this.coming.push({ time: this.nextTime, index, seconds: stepSeconds });
    const delay = this.origin + time - this.sound.now();
    if (delay > -LATE) {
      const slot: Slot = {
        step,
        bar,
        chord: progression[bar % progression.length]!,
        next: progression[(bar + 1) % progression.length]!,
        rng: this.rng,
        seconds: stepSeconds * STEPS,
      };
      for (const layer of layers) {
        // A layer that joins at 0 is always there, so even the quietest music has something in it.
        const fade = layer.joins <= 0 ? 1 : clamp((this.level - layer.joins) / FADE_IN, 0, 1);
        if (fade < 0.05) continue;
        const asked = layer.play(slot);
        if (!asked) continue;
        const hits: readonly Hit[] = 'midi' in asked ? [asked] : asked;
        for (const hit of hits) {
          const pan = hit.pan ?? layer.pan;
          this.sound.note(layer.voice, hit.midi, {
            bus: layer.bus ?? 'music',
            delay: Math.max(0, human > 0 ? delay + this.rng.range(-human, human) : delay),
            gain: (hit.gain ?? 1) * layer.gain * fade * this.gain,
            ...(pan === undefined ? {} : { pan }),
            ...(hit.seconds === undefined ? {} : { seconds: hit.seconds }),
          });
        }
      }
    }
    this.nextIndex++;
    this.nextTime += stepSeconds;
  }
}
