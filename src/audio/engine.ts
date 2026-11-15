import {
  type AudioAssets,
  CONTEXT_RATE,
  DECODED_BUDGET,
  type LoopId,
  type SheetId,
  SOUND_FAMILIES,
  type SoundFamilyId,
  spriteId,
} from '../shared/audio';
import { AMBIENCE_TRIM, type AudioMix, volumeGain } from './mix';
import type { SynthGraph } from './synth/synth';

/**
 * The thin layer over Web Audio. It owns the context, the four buses (master, music, ambience,
 * effects), what is decoded, and the voices that are sounding. Everything with a decision in it
 * (what plays, how crowded the mix may be, which map gets which loop) lives above it, so this file
 * stays small enough to read in one sitting.
 */

export type Slot = 'music' | 'ambience';

export interface LoopRequest {
  /** The loop to play in this slot, or null to fade the slot out. */
  id: LoopId | null;
  /** Level of the loop, 0 to 1. */
  gain: number;
  /** Corner of a low-pass filter in Hz, for the quiet arrangement indoors. Absent means open. */
  lowpass?: number;
  /** Seconds to cross from the old loop to this one (between 1.5 and 2). */
  fade: number;
}

export interface PlayRequest {
  family: SoundFamilyId;
  variant: number;
  gain: number;
  /** -1 (left) to 1 (right). */
  pan: number;
  /** Playback rate, 1 for the sound as recorded. */
  rate: number;
  /** Seconds from now. */
  delay: number;
}

/** A sound that has been started. The service keeps these to decide what may be cut off. */
export interface Playing {
  readonly family: SoundFamilyId;
  /** Engine time at which it ends on its own. */
  readonly endsAt: number;
}

export interface EngineStats {
  state: 'idle' | 'running' | 'suspended' | 'failed';
  sampleRate: number;
  decodedBytes: number;
  sheets: SheetId[];
  loops: Record<Slot, LoopId | null>;
  voices: number;
  /**
   * How much of the world's music and ambience is let through: 1 normally, less while a game plays
   * its own.
   */
  worldShare: number;
}

export interface Engine {
  /** Creates and starts the context. Call from a user gesture. Safe to call again. */
  unlock(): void;
  /** Fetches a sheet's bytes now so decoding is quick later. */
  prefetch(files: readonly string[]): void;
  loadSheet(id: SheetId): Promise<void>;
  hasSheet(id: SheetId): boolean;
  setLoop(slot: Slot, request: LoopRequest): Promise<void>;
  play(request: PlayRequest): Playing | null;
  stop(voice: Playing, fade: number): void;
  setMix(mix: AudioMix): void;
  /**
   * Turns the world's music and ambience down to a share of their level (1 is as they are), for a
   * full-screen game that plays its own, and brings them back. Sounds and the game's own music are
   * not touched.
   */
  duck?(share: number): void;
  /** Where a synth plays, or null while there is no context to play into. */
  graph?(): SynthGraph | null;
  suspend(): void;
  resume(): void;
  /** Seconds on the engine's clock, which keeps running while nothing plays. */
  now(): number;
  stats(): EngineStats;
}

/**
 * Time constant, in seconds, of the world's music going under a full-screen game and coming back.
 */
const DUCK_EASE = 0.25;

interface Live extends Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
}

interface Running {
  id: LoopId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

interface SlotState {
  current: Running | null;
  /**
   * Bumped on every request, so a decode that finishes after a newer request can tell it is stale.
   */
  token: number;
}

const bytesOf = (b: AudioBuffer): number => b.length * b.numberOfChannels * 4;

/**
 * Fades a parameter along an equal-power curve (a quarter sine), so the middle of a crossfade is
 * not quieter than its ends. Built from short linear ramps, which every browser schedules the same
 * way.
 */
function fade(param: AudioParam, from: number, to: number, start: number, seconds: number): void {
  const steps = 24;
  param.cancelScheduledValues(start);
  param.setValueAtTime(from, start);
  const rising = to >= from;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const shape = rising ? Math.sin((u * Math.PI) / 2) : 1 - Math.cos((u * Math.PI) / 2);
    param.linearRampToValueAtTime(from + (to - from) * shape, start + seconds * u);
  }
}

export class WebAudioEngine implements Engine {
  private ctx: AudioContext | null = null;
  /**
   * `wonder` is the music a full-screen game plays itself: it follows the music level and is not
   * ducked.
   */
  private buses: { master: GainNode; music: GainNode; ambience: GainNode; effects: GainNode; wonder: GainNode } | null =
    null;
  private ducked = 1;
  private failed = false;
  private wantRunning = false;
  private decoded = 0;
  private mix: AudioMix = { musicVolume: 0.7, effectsVolume: 0.8, muted: false };
  private readonly sheets = new Map<SheetId, AudioBuffer>();
  private readonly loops = new Map<LoopId, AudioBuffer>();
  private readonly pending = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
  private readonly slots: Record<Slot, SlotState> = {
    music: { current: null, token: 0 },
    ambience: { current: null, token: 0 },
  };
  private readonly live = new Set<Live>();

  constructor(
    private readonly assets: AudioAssets,
    /** Turns a manifest path into a URL. */
    private readonly url: (file: string) => string,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  unlock(): void {
    if (this.failed) return;
    this.wantRunning = true;
    try {
      if (!this.ctx) this.create();
      const ctx = this.ctx!;
      if (ctx.state === 'running') return;
      // A context may stay suspended until a gesture, or be interrupted by a call; resuming inside
      // a gesture fixes both.
      void ctx.resume().catch(() => undefined);
      // iOS only opens its audio session once something has been started inside the gesture.
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      blip.connect(ctx.destination);
      blip.start(0);
    } catch {
      this.failed = true;
    }
  }

  private create(): void {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('This browser has no Web Audio.');
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive', sampleRate: CONTEXT_RATE });
    } catch {
      ctx = new Ctor({ latencyHint: 'interactive' });
    }
    const master = ctx.createGain();
    // A soft safety limiter, so a few sounds landing together can never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    const bus = (): GainNode => {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    };
    this.buses = { master, music: bus(), ambience: bus(), effects: bus(), wonder: bus() };
    this.ctx = ctx;
    this.applyMix(true);
  }

  graph(): SynthGraph | null {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses || this.failed) return null;
    return { ctx, effects: buses.effects, music: buses.wonder, playable: () => ctx.state === 'running' };
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.wantRunning && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setMix(mix: AudioMix): void {
    this.mix = mix;
    this.applyMix(false);
  }

  duck(share: number): void {
    this.ducked = Math.min(1, Math.max(0, share));
    // Slower than a slider, so the world's music slips under a game rather than being cut.
    this.applyMix(false, DUCK_EASE);
  }

  private applyMix(immediate: boolean, ease = 0.04): void {
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number): void => {
      if (immediate) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, ease);
    };
    set(this.buses.master, this.mix.muted ? 0 : 1);
    set(this.buses.music, volumeGain(this.mix.musicVolume) * this.ducked);
    set(this.buses.wonder, volumeGain(this.mix.musicVolume));
    set(this.buses.effects, volumeGain(this.mix.effectsVolume));
    set(this.buses.ambience, volumeGain(this.mix.effectsVolume) * AMBIENCE_TRIM * this.ducked);
  }

  private bytes(file: string): Promise<ArrayBuffer | null> {
    let p = this.pending.get(file);
    if (!p) {
      p = this.fetcher(this.url(file))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.pending.set(file, p);
    }
    return p;
  }

  prefetch(files: readonly string[]): void {
    for (const f of files) void this.bytes(f);
  }

  private async decode(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx || this.failed) return null;
    let p = this.decoding.get(file);
    if (!p) {
      p = this.bytes(file).then(async (data) => {
        if (!data) return null;
        // The bytes are only needed once. A copy goes to the decoder, which detaches what it is
        // given.
        try {
          return await ctx.decodeAudioData(data.slice(0));
        } catch {
          return null;
        }
      });
      this.decoding.set(file, p);
      void p.then((b) => {
        if (!b) this.decoding.delete(file);
      });
    }
    return p;
  }

  hasSheet(id: SheetId): boolean {
    return this.sheets.has(id);
  }

  async loadSheet(id: SheetId): Promise<void> {
    if (this.sheets.has(id)) return;
    const buffer = await this.decode(this.assets.sheets[id].file);
    if (buffer && !this.sheets.has(id)) {
      this.sheets.set(id, buffer);
      this.decoded += bytesOf(buffer);
    }
  }

  async setLoop(slot: Slot, request: LoopRequest): Promise<void> {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses || this.failed) return;
    const state = this.slots[slot];
    const token = ++state.token;
    const bus = buses[slot];
    const old = state.current;

    if (old && old.id === request.id) {
      this.retune(old, request);
      return;
    }

    let buffer: AudioBuffer | null = null;
    if (request.id) {
      const asset = this.assets.loops[request.id];
      const estimate = Math.ceil((asset.seconds + 2) * ctx.sampleRate) * 2 * 4;
      // If holding the old loop while the new one decodes would go past the budget, let the old one
      // go first.
      if (old && this.decoded + estimate > DECODED_BUDGET) {
        this.release(slot, old, Math.min(request.fade, 0.6));
        state.current = null;
      }
      buffer = this.loops.get(request.id) ?? (await this.decode(asset.file));
      if (token !== state.token) return;
      if (buffer && !this.loops.has(request.id)) {
        this.loops.set(request.id, buffer);
        this.decoded += bytesOf(buffer);
      }
    }

    const leaving = state.current;
    if (leaving) this.release(slot, leaving, request.fade);
    state.current = null;
    if (!request.id || !buffer) return;

    const asset = this.assets.loops[request.id];
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = asset.loopStart;
    source.loopEnd = asset.loopEnd;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = request.lowpass ?? ctx.sampleRate / 2;
    const gain = ctx.createGain();
    source.connect(filter).connect(gain).connect(bus);
    fade(gain.gain, 0, request.gain, t, Math.max(0.05, request.fade));
    source.start(t, asset.loopStart);
    state.current = { id: request.id, source, gain, filter };
  }

  private retune(run: Running, request: LoopRequest): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    run.gain.gain.cancelScheduledValues(t);
    run.gain.gain.setValueAtTime(run.gain.gain.value, t);
    run.gain.gain.setTargetAtTime(request.gain, t, request.fade / 3);
    run.filter.frequency.setTargetAtTime(request.lowpass ?? ctx.sampleRate / 2, t, request.fade / 3);
  }

  /**
   * Fades a running loop out, stops it, and frees its decoded audio unless the other slot needs it.
   */
  private release(slot: Slot, run: Running, seconds: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    fade(run.gain.gain, run.gain.gain.value, 0, t, Math.max(0.05, seconds));
    run.source.stop(t + Math.max(0.05, seconds) + 0.05);
    run.source.onended = () => {
      run.source.disconnect();
      run.filter.disconnect();
      run.gain.disconnect();
      const other = slot === 'music' ? this.slots.ambience.current : this.slots.music.current;
      if (this.slots[slot].current?.id !== run.id && other?.id !== run.id) {
        const buffer = this.loops.get(run.id);
        if (buffer) {
          this.decoded -= bytesOf(buffer);
          this.loops.delete(run.id);
          this.decoding.delete(this.assets.loops[run.id].file);
        }
      }
    };
  }

  play(request: PlayRequest): Playing | null {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses || this.failed || ctx.state !== 'running') return null;
    const sheetId = SOUND_FAMILIES[request.family].sheet;
    const buffer = this.sheets.get(sheetId);
    const sprite = this.assets.sheets[sheetId].sprites[spriteId(request.family, request.variant)];
    if (!buffer || !sprite) return null;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = request.rate;
    const gain = ctx.createGain();
    gain.gain.value = request.gain;
    const nodes: AudioNode[] = [source, gain];
    source.connect(gain);
    let tail: AudioNode = gain;
    if (typeof ctx.createStereoPanner === 'function' && Math.abs(request.pan) > 0.01) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, request.pan));
      gain.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(buses.effects);
    const when = ctx.currentTime + Math.max(0, request.delay);
    source.start(when, sprite.start, sprite.duration);
    const voice: Live = { family: request.family, endsAt: when + sprite.duration / request.rate, source, gain, nodes };
    this.live.add(voice);
    source.onended = () => {
      for (const n of nodes) n.disconnect();
      this.live.delete(voice);
    };
    return voice;
  }

  stop(voice: Playing, fade: number): void {
    const live = voice as Live;
    const ctx = this.ctx;
    if (!ctx || !this.live.has(live)) return;
    const t = ctx.currentTime;
    live.gain.gain.cancelScheduledValues(t);
    live.gain.gain.setValueAtTime(live.gain.gain.value, t);
    live.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      live.source.stop(t + fade + 0.02);
    } catch {
      // Already stopped.
    }
  }

  stats(): EngineStats {
    const ctx = this.ctx;
    const state: EngineStats['state'] = this.failed
      ? 'failed'
      : !ctx
        ? 'idle'
        : ctx.state === 'running'
          ? 'running'
          : 'suspended';
    return {
      state,
      sampleRate: ctx?.sampleRate ?? 0,
      decodedBytes: this.decoded,
      sheets: [...this.sheets.keys()],
      loops: { music: this.slots.music.current?.id ?? null, ambience: this.slots.ambience.current?.id ?? null },
      voices: this.live.size,
      worldShare: this.ducked,
    };
  }
}
