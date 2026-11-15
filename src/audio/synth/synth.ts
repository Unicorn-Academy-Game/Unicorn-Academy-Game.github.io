import { clamp } from '../../shared/math';
import { PING } from '../../shared/ping';
import type { FxName, FxOptions, NoteOptions, VoiceName, WonderSound } from '../../wonder/sound';
import { Budget, type Held } from './budget';
import { Crowd, WEIGHTS } from './crowd';
import { INSTRUMENTS } from './instruments';
import { makeRoom, Patch, type Rig, ratio, whiteNoise } from './patch';
import { RECIPES } from './sfx';

/** What the synth needs of the sound it plays into. */
export interface SynthGraph {
  readonly ctx: BaseAudioContext;
  /** What the player plays and what happens. */
  readonly effects: AudioNode;
  /** Music a game plays by itself. */
  readonly music: AudioNode;
  /**
   * Whether sound made now would be heard, which it would not be on a context that is waiting for a
   * touch.
   */
  readonly playable: () => boolean;
}

/**
 * How many nodes may be sounding at once when the game says nothing else: what a phone or a
 * computer is asked for. A device the game knows to be slow is given less, in
 * `src/render/profile.ts`. About a tenth of the time a fast laptop has for audio.
 */
export const DEFAULT_BUDGET = 600;
/**
 * How long a sound that makes way takes to go quiet, in seconds. Short enough to stop it, long
 * enough not to click.
 */
const MAKE_WAY = 0.04;
/**
 * How long after a sound should have ended the clock waits for the browser to say so before it lets
 * the sound go.
 */
const GRACE = 0.5;
/** The sounds that must always be heard, such as a star being won. */
const IMPORTANT: ReadonlySet<FxName> = new Set<FxName>(['star', 'ding', 'boom', 'cheer', 'swell']);
/**
 * How quiet a sound may be made when the mix is full. A sound that matters is never made much less
 * than this, a note keeps a little, and a light sound that has no room is not made at all.
 */
const FLOOR_IMPORTANT = 0.18;
const FLOOR_NOTE = 0.1;
const FLOOR_LIGHT = 0.04;
/** Under this a sound could not be heard, so it is not worth making. */
const AUDIBLE = 0.05;
/**
 * A sound asked for again this soon, the same, is the same sound twice at once, and is not made.
 */
const SAME_WITHIN = 0.028;
/** How many sounds are remembered for that. */
const REMEMBERED = 256;
/** A little time between asking and sounding, so the sound is built before it starts. */
const LEAD = 0.012;
/**
 * The least time a sound has between the clock and its first moment when it is built. A page that
 * is held up after a sound is asked for and before it is built makes the sound late, and a browser
 * starts a curve that is late from now while what is set after it stays where it was put, inside
 * the curve, where it is refused. So a late sound starts a little after now, with all of it set
 * from there.
 */
const SOONEST = 0.004;

/** The highest a sample may go after the ceiling, about -1 dBFS. */
const CEILING = 0.89;

/**
 * A curve that leaves what is below its knee alone and bends what is above it towards `CEILING`
 * without a corner, so sounds that land on top of each other in the same instant are rounded off
 * and never clip.
 */
function ceilingCurve(points = 2049): Float32Array<ArrayBuffer> {
  const knee = 0.6;
  const room = CEILING - knee;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room));
  }
  return curve;
}

/** The ceiling, into `into`. Gives back where sound goes in. */
function ceiling(ctx: BaseAudioContext, into: AudioNode): AudioNode {
  const shaper = ctx.createWaveShaper();
  shaper.curve = ceilingCurve();
  shaper.oversample = '2x';
  shaper.connect(into);
  return shaper;
}

/**
 * What each sound is turned by so they sit together: measured, in the lab, so that every one lands
 * at about the same loudness for the same `gain`. A sound that is not here is made as it is.
 */
export type Trims = Readonly<Partial<Record<FxName | VoiceName, number>>>;

/** A sound that is sounding: what holds its place in the budget, and what lets it go. */
interface Voice extends Held {
  readonly patch: Patch;
  /** Its level, which is taken down to nothing when it makes way. */
  readonly level: GainNode;
}

/**
 * Makes every sound a game asks for out of oscillators and noise, at the moment it is asked, so no
 * audio file is downloaded or decoded and the games cost nothing in the sound budget. Everything is
 * in one key. It plays into whatever it is given, which in the game is the engine's own mix and in
 * a test is an offline context that can be measured.
 */
export class WonderSynth implements WonderSound {
  private rig: Rig | null = null;
  private rigFor: BaseAudioContext | null = null;
  private readonly rooms = new Map<'effects' | 'music', ConvolverNode>();
  private readonly lastMade = new Map<string, number>();
  /**
   * How much is sounding, for the effects and for the music, each on the clock of the context it is
   * playing into.
   */
  private crowds = { effects: new Crowd(), music: new Crowd() };
  private readonly sounding: Budget<Voice>;
  /**
   * Sounds that were cut short to make way, until the browser says they have ended or the clock
   * says they must have.
   */
  private leaving: Voice[] = [];
  private gaveUp = 0;

  constructor(
    private readonly graph: () => SynthGraph | null,
    private readonly random: () => number = Math.random,
    private readonly trims: Trims = {},
    budget: number = DEFAULT_BUDGET,
  ) {
    this.sounding = new Budget<Voice>(budget);
  }

  /** How many sounds are alive now. For tests. */
  get busy(): number {
    return this.sounding.count;
  }

  /** How many nodes the sounds that are alive now are made of. For tests. */
  get nodes(): number {
    return this.sounding.cost;
  }

  /** How many sounds the browser refused part of the way through, and were given up. For tests. */
  get lost(): number {
    return this.gaveUp;
  }

  now(): number {
    return this.graph()?.ctx.currentTime ?? 0;
  }

  fx(name: FxName, options: FxOptions = {}): void {
    const g = this.graph();
    if (!g?.playable()) return;
    const rig = this.rigOf(g);
    const recipe = RECIPES[name];
    const delay = Math.max(0, options.delay ?? 0);
    const at = g.ctx.currentTime + LEAD + delay;
    const step = options.step ?? 0;
    const pitch = options.pitch ?? 0;
    const key = `${name}:${pitch}:${step}`;
    if (this.again(key, at)) return;
    const important = IMPORTANT.has(name);
    const crowd = this.crowds.effects.admit(at, WEIGHTS[name], important ? FLOOR_IMPORTANT : FLOOR_LIGHT);
    if (crowd < AUDIBLE) return;
    this.make(
      g,
      rig,
      'effects',
      important,
      at,
      (p, t) => recipe(p, { t, k: ratio(pitch), step, size: clamp(options.size ?? 0.5, 0, 1) }),
      (options.gain ?? 1) * (this.trims[name] ?? 1) * crowd,
      options.pan ?? 0,
    );
  }

  note(voice: VoiceName, midi: number, options: NoteOptions = {}): void {
    const g = this.graph();
    if (!g?.playable()) return;
    const rig = this.rigOf(g);
    const play = INSTRUMENTS[voice];
    const at = g.ctx.currentTime + LEAD + Math.max(0, options.delay ?? 0);
    const key = `${voice}:${midi}`;
    if (this.again(key, at)) return;
    const bus = options.bus ?? 'effects';
    const crowd = this.crowds[bus].admit(at, WEIGHTS[voice], FLOOR_NOTE);
    if (crowd < AUDIBLE) return;
    this.make(
      g,
      rig,
      bus,
      false,
      at,
      (p, t) => play(p, { t, midi, gain: 1, seconds: options.seconds ?? DEFAULT_HOLD[voice] }),
      (options.gain ?? 1) * (this.trims[voice] ?? 1) * crowd,
      options.pan ?? 0,
    );
  }

  /**
   * Whether this exact sound was already asked for at this moment, near enough to be the same one
   * twice. A sound asked for a while ahead does not stop the same sound being asked for sooner, so
   * the moments are compared in either direction.
   */
  private again(key: string, at: number): boolean {
    const before = this.lastMade.get(key);
    if (before !== undefined && Math.abs(at - before) < SAME_WITHIN) return true;
    // Only what is very recent matters, so a long game does not collect a note for every pitch it
    // ever asked for.
    if (this.lastMade.size >= REMEMBERED) this.lastMade.clear();
    this.lastMade.set(key, at);
    return false;
  }

  /**
   * Builds a sound that was asked for to start at `at`. The recipe is given the moment to start
   * from, which is `at` unless the clock has caught up with it by now. A browser that refuses part
   * of a sound loses that sound and nothing else: whatever it made is let go, and the game is not
   * told. A mistake in a recipe is not the browser's, so it is let go and then thrown. When the
   * sound will not fit in the budget the sounds with least left to be heard make way for it. It is
   * only turned away if every one of them must be heard and it need not be.
   */
  private make(
    g: SynthGraph,
    rig: Rig,
    bus: 'effects' | 'music',
    important: boolean,
    at: number,
    build: (p: Patch, t: number) => { room: number },
    gain: number,
    pan: number,
  ): void {
    const ctx = g.ctx;
    this.letGo(ctx.currentTime);
    if (!this.sounding.open(important)) return;
    const out = ctx.createGain();
    out.gain.value = gain;
    const patch = new Patch(rig, out);
    patch.add(out);
    let tail: AudioNode = out;
    if (Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      const panner = patch.add(ctx.createStereoPanner());
      panner.pan.value = clamp(pan, -1, 1);
      out.connect(panner);
      tail = panner;
    }
    tail.connect(rig.dry[bus]);
    const begins = Math.max(at, ctx.currentTime + SOONEST);
    let played: { room: number };
    try {
      played = build(patch, begins);
    } catch (error) {
      patch.discard();
      // The browser refusing part of a sound is the browser's doing, and costs that sound. Anything
      // else is a mistake in a recipe.
      if (!(error instanceof DOMException)) throw error;
      this.gaveUp++;
      return;
    }
    if (played.room > 0.001) {
      const send = patch.add(ctx.createGain());
      send.gain.value = played.room;
      tail.connect(send);
      send.connect(rig.room(bus));
    }
    const voice: Voice = {
      patch,
      level: out,
      cost: patch.size,
      at: begins,
      vital: important,
      end: patch.end,
      loud: gain,
    };
    const going = this.sounding.room(voice.cost, important, ctx.currentTime);
    if (!going) {
      patch.discard();
      return;
    }
    for (const old of going) this.makeWay(old, ctx.currentTime);
    this.sounding.add(voice);
    patch.seal(() => this.sounding.remove(voice));
  }

  /**
   * Takes a sound out of the budget and out of the mix: its level falls to nothing over a few
   * hundredths of a second and its sources stop there. A browser that refuses that leaves the sound
   * to ring on, which costs what it cost.
   */
  private makeWay(voice: Voice, now: number): void {
    this.sounding.remove(voice);
    const until = now + MAKE_WAY;
    try {
      const level = voice.level.gain;
      level.cancelScheduledValues(now);
      level.setValueAtTime(level.value, now);
      level.linearRampToValueAtTime(0, until);
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
    voice.patch.cut(until + 0.01);
    voice.end = voice.patch.end;
    this.leaving.push(voice);
  }

  /**
   * Lets go of what the clock says is over, without waiting for the browser to say so. A sound
   * whose end never comes would otherwise stay in the budget for ever, and the budget would fill
   * with sounds that are not there until nothing could be made.
   */
  private letGo(now: number): void {
    for (const voice of this.sounding.ended(now, GRACE)) {
      this.sounding.remove(voice);
      voice.patch.discard();
    }
    if (this.leaving.length === 0) return;
    this.leaving = this.leaving.filter((voice) => {
      if (voice.end + GRACE >= now) return true;
      voice.patch.discard();
      return false;
    });
  }

  private rigOf(g: SynthGraph): Rig {
    if (this.rig && this.rigFor === g.ctx) return this.rig;
    const ctx = g.ctx;
    this.rooms.clear();
    this.lastMade.clear();
    this.sounding.clear();
    this.leaving = [];
    this.crowds = { effects: new Crowd(), music: new Crowd() };
    this.rigFor = ctx;
    const dry = { effects: ceiling(ctx, g.effects), music: ceiling(ctx, g.music) };
    this.rig = {
      ctx,
      dry,
      white: whiteNoise(ctx, this.random),
      rand: this.random,
      room: (bus) => {
        let room = this.rooms.get(bus);
        if (!room) {
          room = makeRoom(ctx, this.random);
          // The room is heard through the same ceiling as the dry sound, so the two together cannot
          // go over.
          room.connect(dry[bus]);
          this.rooms.set(bus, room);
        }
        return room;
      },
    };
    return this.rig;
  }
}

/** How long each held instrument is held when a game does not say. */
const DEFAULT_HOLD: Readonly<Record<VoiceName, number>> = {
  bell: 0,
  glass: 0,
  chime: 0,
  harp: 0,
  marimba: 0,
  pluck: 0.5,
  pad: 2,
  bass: 0.5,
  flute: 0.6,
  ping: PING.held,
  kick: 0,
  snare: 0,
  hat: 0,
  sub: 0.4,
  kit: 0,
};
