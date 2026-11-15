/**
 * A tiny sequencer. A song knows its tempo and meter; instruments are placed by bar and beat; the
 * result is mixed to a stereo bus with a shared reverb, then folded so the end flows into the start
 * and the loop has no seam.
 */
import {
  addStereo,
  chorus,
  filter,
  foldLoop,
  mixPanned,
  type Rand,
  type ReverbSettings,
  rand,
  reverb,
  SR,
  type Stereo,
  samples,
  stereoOf,
} from './dsp';

export interface Placement {
  pan?: number;
  /** How much of the note goes to the reverb, 0 to 1. */
  send?: number;
  gain?: number;
  /** Seconds of random timing slack for a human feel. */
  loose?: number;
}

export class Song {
  readonly seconds: number;
  readonly beat: number;
  readonly bar: number;
  private readonly dry: Stereo;
  private readonly wet: Stereo;
  readonly r: Rand;

  constructor(
    readonly bpm: number,
    readonly beatsPerBar: number,
    readonly bars: number,
    seed: number,
    tailSeconds = 6,
  ) {
    this.beat = 60 / bpm;
    this.bar = this.beat * beatsPerBar;
    this.seconds = this.bar * bars;
    const total = samples(this.seconds + tailSeconds);
    this.dry = stereoOf(total);
    this.wet = stereoOf(total);
    this.r = rand(seed);
  }

  /** Seconds at the given bar (from 0) and beat (from 0, may be fractional). */
  at(bar: number, beat: number): number {
    return bar * this.bar + beat * this.beat;
  }

  /** Places a rendered mono note. */
  put(buf: Float32Array, seconds: number, p: Placement = {}): void {
    const jitter = p.loose ? (this.r.next() - 0.5) * 2 * p.loose : 0;
    const offset = Math.round((seconds + jitter) * SR);
    const gain = p.gain ?? 1;
    const send = p.send ?? 0.3;
    mixPanned(this.dry, buf, offset, gain * (1 - send * 0.5), p.pan ?? 0);
    mixPanned(this.wet, buf, offset, gain * send, p.pan ?? 0);
  }

  /**
   * Mixes the bus, adds the reverb, wraps the tail, and shapes the tone for small phone speakers.
   */
  render(room: ReverbSettings, wetLevel: number, tone: Tone = {}): Stereo {
    const verb = reverb(this.wet, room);
    const mix = stereoOf(this.dry.l.length);
    addStereo(mix, this.dry, 1);
    addStereo(mix, verb, wetLevel);
    const wide = chorus(mix, 0.27, 4.5, 0.22);
    const looped = foldLoop(wide, samples(this.seconds));
    const shape = (x: Float32Array): Float32Array => {
      let y = filter(x, 'highpass', 55, 0.7);
      y = filter(y, 'lowshelf', 200, 0.7, tone.low ?? -3);
      y = filter(y, 'peak', 3200, 0.8, tone.presence ?? 3.5);
      y = filter(y, 'highshelf', 8000, 0.7, tone.air ?? 0);
      return y;
    };
    return { l: shape(looped.l), r: shape(looped.r) };
  }
}

/**
 * Gentle tone shaping in dB: less rumble, a little presence so the tune reads on a phone speaker,
 * optional air.
 */
export interface Tone {
  low?: number;
  presence?: number;
  air?: number;
}

/** Scales a stereo buffer so its integrated loudness lands on a target. */
export function setLevel(s: Stereo, current: number, target: number): void {
  const g = 10 ** ((target - current) / 20);
  for (let i = 0; i < s.l.length; i++) {
    s.l[i] = s.l[i]! * g;
    s.r[i] = s.r[i]! * g;
  }
}
