import { type Trims, WonderSynth } from '../../src/audio/synth/synth';
import type { FxName, FxOptions, NoteOptions, VoiceName } from '../../src/wonder/sound';

/**
 * Plays the real synth into an offline context and hands back what it rendered, so a sound can be
 * measured, looked at and written to a file without a speaker. The engine's own bus chain is
 * mirrored: effects and music into one limiter.
 */

export type Call =
  | { at: number; fx: FxName; options?: FxOptions }
  | { at: number; voice: VoiceName; midi: number; options?: NoteOptions };

export interface Job {
  seconds: number;
  rate?: number;
  calls: readonly Call[];
  trims?: Trims;
  seed?: number;
  /**
   * Mirror the engine's limiter, as the game has it. Off, the levels are what the sounds themselves
   * are, which is what the trims are set from.
   */
  limiter?: boolean;
  /**
   * Asks for each sound only when the render reaches the moment just before it, as a game does,
   * instead of all of them at the start. Music that runs for half a minute is only a fair test this
   * way: asked for all at once, the synth would count every note as sounding together and let the
   * early ones go to make room for the late.
   */
  live?: boolean;
  /**
   * How many nodes the synth may keep sounding at once. Left out, it has the standard budget, as a
   * laptop does.
   */
  budget?: number;
  /**
   * In a live render, how many seconds behind the clock the synth reads it the first time it does
   * for each sound, as when a page is held up after a sound is asked for and before it is built.
   * The browser then finds the sound late.
   */
  late?: number;
}

/** How far ahead of a sound the lab asks for it in a live render, as a game's music does. */
const WINDOW = 0.25;

export interface Rendered {
  rate: number;
  /** Base64 of little-endian float32 samples. */
  left: string;
  right: string;
}

const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const encode = (samples: Float32Array): string => {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

async function render(job: Job): Promise<Rendered> {
  const rate = job.rate ?? 32000;
  const ctx = new OfflineAudioContext(2, Math.ceil(job.seconds * rate), rate);
  const effects = ctx.createGain();
  const music = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.15;
  const end: AudioNode = job.limiter ? limiter : ctx.destination;
  effects.connect(end);
  music.connect(end);
  if (job.limiter) limiter.connect(ctx.destination);
  // The synth is given a clock that reads `behind` seconds early once, and then true, so a sound is
  // found late as it is when the page was held up.
  let behind = 0;
  const clock = new Proxy(ctx, {
    get(target, key) {
      if (key === 'currentTime') {
        const read = Math.max(0, target.currentTime - behind);
        behind = 0;
        return read;
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const synth = new WonderSynth(
    () => ({ ctx: clock, effects, music, playable: () => true }),
    mulberry(job.seed ?? 7),
    job.trims ?? {},
    job.budget,
  );
  const ask = (call: Call, from: number): void => {
    const delay = Math.max(0, call.at - from) + (call.options?.delay ?? 0);
    behind = job.late ?? 0;
    try {
      if ('fx' in call) synth.fx(call.fx, { ...call.options, delay });
      else synth.note(call.voice, call.midi, { ...call.options, delay });
    } finally {
      behind = 0;
    }
  };
  if (job.live) {
    const sorted = [...job.calls].sort((a, b) => a.at - b.at);
    let next = 0;
    const askUntil = (to: number, from: number): void => {
      while (next < sorted.length && sorted[next]!.at < to) ask(sorted[next++]!, from);
    };
    askUntil(WINDOW, 0);
    for (let k = 1; k * WINDOW < job.seconds; k++) {
      void ctx.suspend(k * WINDOW).then(() => {
        // A sound the browser refuses must not leave the render waiting for ever, so the clock is
        // let go whatever happens.
        try {
          askUntil((k + 1) * WINDOW, ctx.currentTime);
        } finally {
          void ctx.resume();
        }
      });
    }
  } else {
    for (const call of job.calls) ask(call, 0);
  }
  const buffer = await ctx.startRendering();
  return { rate, left: encode(buffer.getChannelData(0)), right: encode(buffer.getChannelData(1)) };
}

(window as unknown as { synthLab: { render: typeof render } }).synthLab = { render };
