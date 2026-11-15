import { describe, expect, it } from 'vitest';
import { analyze, fft, spectrogram } from '../../tools/audio/analysis';
import { momentaryLoudness } from '../../tools/audio/loudness';

const RATE = 32000;

const tone = (hz: number, seconds: number, amp = 0.5, fade = 0.02): Float32Array => {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / fade, (seconds - t) / fade);
    out[i] = Math.sin(2 * Math.PI * hz * t) * amp * Math.max(0, env);
  }
  return out;
};
const stereo = (x: Float32Array): { l: Float32Array; r: Float32Array } => ({ l: x, r: x });
const noise = (seconds: number, amp: number): Float32Array => {
  let seed = 12345;
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * amp;
  }
  return out;
};

describe('the sound analyser', () => {
  it('finds a tone at the frequency it was made at', () => {
    for (const hz of [262, 440, 1175, 3000]) {
      const a = analyze(stereo(tone(hz, 0.6)), RATE);
      expect(Math.abs(a.pitch - hz) / hz).toBeLessThan(0.01);
      expect(a.noisiness).toBeLessThan(0.1);
      expect(Math.abs(a.dc)).toBeLessThan(0.01);
    }
  });

  it('calls noise noise', () => {
    const a = analyze(stereo(noise(0.6, 0.3)), RATE);
    expect(a.pitch).toBe(0);
    expect(a.noisiness).toBeGreaterThan(0.3);
  });

  it('puts the centroid between the partials of a two-tone sound', () => {
    const low = tone(500, 0.5);
    const high = tone(4000, 0.5);
    const both = new Float32Array(low.length);
    for (let i = 0; i < both.length; i++) both[i] = (low[i]! + high[i]!) / 2;
    const a = analyze(stereo(both), RATE);
    expect(a.centroid).toBeGreaterThan(500);
    expect(a.centroid).toBeLessThan(4000);
  });

  it('reports a sound cut off at full level as one that ends with a click, and a faded one as clean', () => {
    const clean = analyze(stereo(tone(440, 0.4, 0.5, 0.05)), RATE);
    expect(clean.endDb).toBeLessThan(-40);
    const cut = tone(440, 0.4, 0.5, 0.0001);
    // Stop it abruptly in the middle of a cycle by silencing everything after 0.3 s.
    for (let i = Math.round(0.3 * RATE); i < cut.length; i++) cut[i] = 0;
    const abrupt = analyze(stereo(cut), RATE);
    expect(abrupt.endDb).toBeGreaterThan(-40);
  });

  it('reports a sound that jumps in at full level as one that starts with a click', () => {
    const hard = analyze(stereo(tone(440, 0.4, 0.5, 0.0001)), RATE);
    const soft = analyze(stereo(tone(440, 0.4, 0.5, 0.05)), RATE);
    expect(hard.startDb).toBeGreaterThan(soft.startDb);
    expect(hard.attackMs).toBeLessThan(0.7);
    expect(soft.attackMs).toBeGreaterThan(5);
  });

  it('measures how long a sound rings', () => {
    const a = analyze(stereo(tone(440, 1.0, 0.5, 0.01)), RATE);
    expect(a.seconds).toBeGreaterThan(0.95);
    expect(a.seconds).toBeLessThan(1.01);
  });

  it('measures six decibels more for twice the level', () => {
    const quiet = momentaryLoudness(stereo(tone(1000, 0.5, 0.1)), RATE);
    const loud = momentaryLoudness(stereo(tone(1000, 0.5, 0.2)), RATE);
    expect(loud - quiet).toBeCloseTo(6.02, 0);
  });

  it('puts the energy of a tone at the right height in the picture', () => {
    const img = spectrogram(tone(1000, 0.5), RATE, { height: 100, lowHz: 100, highHz: 10000 });
    expect(img.height).toBe(100);
    expect(img.width).toBeGreaterThan(40);
    // 1000 Hz is half way up a logarithmic axis from 100 to 10000.
    const column = Math.floor(img.width / 2);
    let brightest = 0;
    let brightestRow = 0;
    for (let y = 0; y < img.height; y++) {
      const at = (y * img.width + column) * 4;
      const v = img.data[at]! + img.data[at + 1]! + img.data[at + 2]!;
      if (v > brightest) {
        brightest = v;
        brightestRow = y;
      }
    }
    expect(Math.abs(brightestRow - 50)).toBeLessThan(6);
  });

  it('transforms a sine to a single bin', () => {
    const n = 256;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 8 * i) / n);
    fft(re, im);
    let top = 0;
    for (let i = 1; i < n / 2; i++) if (Math.hypot(re[i]!, im[i]!) > Math.hypot(re[top]!, im[top]!)) top = i;
    expect(top).toBe(8);
  });
});
