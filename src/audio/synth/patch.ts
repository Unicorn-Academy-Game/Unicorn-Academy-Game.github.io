/**
 * The small parts every synthesized sound is built from: a patch that keeps hold of its own nodes
 * and lets them go when the sound is over, envelopes that start and end at silence so nothing
 * clicks, noise, and a room to put bells in.
 */

/** Where a sound goes and what it may draw on. */
export interface Rig {
  readonly ctx: BaseAudioContext;
  /** The level a sound goes to, straight, for each kind of sound. */
  readonly dry: { readonly effects: AudioNode; readonly music: AudioNode };
  /** The room a sound is sent to, for each kind of sound. It is made the first time it is used. */
  room(bus: 'effects' | 'music'): AudioNode;
  /** A little over a second of white noise. */
  readonly white: AudioBuffer;
  readonly rand: () => number;
}

/** Quiet enough to be nothing, and above zero so an exponential ramp can reach it. */
export const SILENCE = 0.0001;

/** Semitones to a frequency ratio. */
export const ratio = (semitones: number): number => 2 ** (semitones / 12);

/** A raised cosine from 0 up to 1, for envelopes that must have no corner at either end. */
const rise = (n: number): Float32Array =>
  Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));
const RISE = rise(24);
const FALL = Float32Array.from(RISE, (v) => 1 - v);
const BELL = Float32Array.from({ length: 48 }, (_, i) => Math.sin((Math.PI * i) / 47) ** 2);

/**
 * A short strike: a quick rise to `peak`, then a fall that is exponential, which is how a struck or
 * plucked thing dies away. Returns when it ends.
 */
export function strike(param: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  param.setValueAtTime(SILENCE, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(SILENCE, t + attack + decay);
  param.setValueAtTime(0, t + attack + decay + 0.002);
  return t + attack + decay;
}

/**
 * A smooth hill: up to `peak` and back down, over `seconds`. The parameter must start at 0, as a
 * gain made by the patch does, because a curve may not share its first moment with another event.
 */
export function hill(param: AudioParam, t: number, seconds: number, peak: number): number {
  param.setValueCurveAtTime(
    BELL.map((v) => v * peak),
    t,
    seconds,
  );
  param.setValueAtTime(0, t + seconds + 0.002);
  return t + seconds;
}

/**
 * A held sound: it rises over `up`, stays at `peak` until `held` seconds from the start, and falls
 * over `down`. Smooth at both ends. The parameter must start at 0. Returns when it is silent.
 */
export function hold(param: AudioParam, t: number, up: number, held: number, down: number, peak: number): number {
  const rest = Math.max(held, up + 0.004);
  param.setValueCurveAtTime(
    RISE.map((v) => v * peak),
    t,
    up,
  );
  param.setValueAtTime(peak, t + up);
  param.setValueCurveAtTime(
    FALL.map((v) => v * peak),
    t + rest,
    down,
  );
  param.setValueAtTime(0, t + rest + down + 0.002);
  return t + rest + down;
}

/** A pitch that glides from one frequency to another, the way a voice or a whistle does. */
export function glide(param: AudioParam, from: number, to: number, t: number, seconds: number): void {
  param.setValueAtTime(from, t);
  param.exponentialRampToValueAtTime(Math.max(1, to), t + seconds);
}

/** A source of a patch, and the moments it was told to start and stop. */
interface Source {
  readonly node: AudioScheduledSourceNode;
  readonly start: number;
  stop: number;
}

/**
 * A patch is one sound's nodes. It starts them, stops them on time, and lets all of them go when
 * the last has ended.
 */
export class Patch {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: Source[] = [];

  constructor(
    readonly rig: Rig,
    /** Where everything this patch makes goes in the end. */
    readonly out: AudioNode,
  ) {}

  get ctx(): BaseAudioContext {
    return this.rig.ctx;
  }

  /** Makes a node of the patch's own. */
  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  gain(value = 0): GainNode {
    const g = this.add(this.ctx.createGain());
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    const f = this.add(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = Math.min(frequency, this.ctx.sampleRate * 0.45);
    f.Q.value = q;
    return f;
  }

  pan(position: number): StereoPannerNode {
    const p = this.add(this.ctx.createStereoPanner());
    p.pan.value = position;
    return p;
  }

  /** An oscillator that sounds from `start` to `stop`. */
  osc(type: OscillatorType, frequency: number, start: number, stop: number): OscillatorNode {
    const o = this.add(this.ctx.createOscillator());
    o.type = type;
    o.frequency.value = Math.min(frequency, this.ctx.sampleRate * 0.45);
    o.start(start);
    o.stop(stop);
    this.sources.push({ node: o, start, stop });
    return o;
  }

  /**
   * Noise that sounds from `start` to `stop`. It starts on a whole sample, from a whole sample of
   * the noise, because Safari smooths white noise that is played from between two samples, and that
   * takes the brightness out of it.
   */
  hiss(start: number, stop: number): AudioBufferSourceNode {
    const rate = this.ctx.sampleRate;
    const n = this.add(this.ctx.createBufferSource());
    n.buffer = this.rig.white;
    n.loop = true;
    const from = Math.floor(this.rig.rand() * Math.max(0, this.rig.white.duration - 0.1) * rate) / rate;
    const begin = Math.round(start * rate) / rate;
    n.start(begin, from);
    n.stop(stop);
    this.sources.push({ node: n, start: begin, stop });
    return n;
  }

  /** Joins nodes one after another, and gives back the last. */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i + 1 < nodes.length; i++) nodes[i]!.connect(nodes[i + 1]!);
    return nodes[nodes.length - 1]!;
  }

  /**
   * Frees every node once every source has stopped, and then says so. Call after the whole sound is
   * built.
   */
  seal(done?: () => void): void {
    let running = this.sources.length;
    if (running === 0) {
      done?.();
      return;
    }
    const stopped = (): void => {
      if (--running > 0) return;
      for (const node of this.nodes) node.disconnect();
      done?.();
    };
    for (const { node } of this.sources) node.addEventListener('ended', stopped, { once: true });
  }

  /**
   * Lets every node go at once, for a sound that could not be finished. Anything already set to
   * start has nothing to be heard in.
   */
  discard(): void {
    for (const node of this.nodes) node.disconnect();
  }

  /**
   * Ends the sound by `at`. A source that has not begun by then never does, and one that was to go
   * on is stopped. A source that stops before `at` is left as it is, because a second stop replaces
   * the first and would make it longer.
   */
  cut(at: number): void {
    for (const source of this.sources) {
      if (source.stop <= at) continue;
      const when = Math.max(at, source.start);
      try {
        source.node.stop(when);
        source.stop = when;
      } catch (error) {
        // A browser that will not move a stop leaves the sound to run out. It is silent, because
        // its level has been taken down.
        if (!(error instanceof DOMException)) throw error;
      }
    }
  }

  /** How many nodes the sound is made of, which is what it costs to keep it sounding. */
  get size(): number {
    return this.nodes.length;
  }

  /** When the last source of this patch stops. */
  get end(): number {
    return this.sources.reduce((latest, s) => Math.max(latest, s.stop), 0);
  }
}

/**
 * The impulse of a small, bright room: noise that dies away and darkens as it does, with a short
 * gap before it begins, in two channels that differ so the room has width. Pure, so it can be
 * looked at without a browser.
 */
export function roomImpulse(rate: number, seconds: number, rand: () => number): [Float32Array, Float32Array] {
  const n = Math.max(2, Math.floor(rate * seconds));
  const gap = Math.floor(rate * 0.012);
  const decay = seconds / 4.6;
  const channel = (): Float32Array => {
    const out = new Float32Array(n);
    let low = 0;
    for (let i = gap; i < n; i++) {
      const t = (i - gap) / rate;
      // The highs go first: the smoothing closes from nearly open to heavy as the room rings out.
      const open = 0.55 * Math.exp(-t / (seconds * 0.35)) + 0.06;
      low += open * (rand() * 2 - 1 - low);
      const swell = Math.min(1, t / 0.01);
      out[i] = low * swell * Math.exp(-t / decay);
    }
    return out;
  };
  return [channel(), channel()];
}

/** White noise for the rig: a little over a second of it. */
export function whiteNoise(ctx: BaseAudioContext, rand: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.6), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

/** The room as a convolver, ready to be sent to. */
export function makeRoom(ctx: BaseAudioContext, rand: () => number): ConvolverNode {
  const [left, right] = roomImpulse(ctx.sampleRate, 1.5, rand);
  const buffer = ctx.createBuffer(2, left.length, ctx.sampleRate);
  buffer.getChannelData(0).set(left);
  buffer.getChannelData(1).set(right);
  const room = ctx.createConvolver();
  room.normalize = true;
  room.buffer = buffer;
  return room;
}
