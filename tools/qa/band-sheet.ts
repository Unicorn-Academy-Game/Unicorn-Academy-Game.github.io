import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { TRIMS } from '../../src/audio/synth/trims';
import { Rng } from '../../src/domain/rng';
import { Band } from '../../src/wonder/engine/band';
import { recorder } from '../../src/wonder/sound';
import { STYLES } from '../../src/wonder/styles';
import { writePng } from '../art/core/image';
import { analyze, spectrogram } from '../audio/analysis';
import { wavBytes } from '../audio/dsp';
import { integratedLoudness } from '../audio/loudness';
import type { Call, Job, Rendered } from '../lab/synth';
import { flag } from '../lib/args';

/**
 * Plays each style of music in a real browser's audio engine (offline, so no speaker) at a few
 * levels of energy, and measures what comes out: how loud, how near the ceiling, how it changes as
 * layers join. Writes a WAV and a spectrogram of each.
 *   tsx tools/qa/band-sheet.ts [--only night] [--out assets/source/_scratch/band] [--bars 8]
 * Needs the dev server on 5173. It measures. It does not hear. A person has to listen.
 */
const out = flag('out', 'assets/source/_scratch/band');
const only = flag('only').split(',').filter(Boolean);
const bars = Number(flag('bars', '8'));
const RATE = 32000;
const ENERGIES = [0.1, 0.45, 0.75, 1] as const;
/**
 * Seconds the music is left to settle before what is measured begins, since it eases in as it
 * rises.
 */
const SETTLE = 7;

const decode = (b64: string): Float32Array => {
  const bytes = Buffer.from(b64, 'base64');
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/tools/lab/synth.html');
await page.waitForFunction(() => (window as unknown as { synthLab?: unknown }).synthLab !== undefined, undefined, {
  timeout: 60_000,
});

/**
 * The page can reload under us when the dev server sees a file change, so a render that was cut off
 * is asked again.
 */
async function render(job: Job): Promise<Rendered> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(
        () => (window as unknown as { synthLab?: unknown }).synthLab !== undefined,
        undefined,
        { timeout: 60_000 },
      );
      return (await page.evaluate(
        (j) => (window as unknown as { synthLab: { render(j: Job): Promise<Rendered> } }).synthLab.render(j),
        job,
      )) as Rendered;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '-inf');
console.log('style        energy   peak dBFS  LUFS-M  integrated  centroid Hz   notes');
for (const [name, style] of Object.entries(STYLES)) {
  if (only.length > 0 && !only.includes(name)) continue;
  for (const energy of ENERGIES) {
    const sound = recorder();
    const band = new Band(sound, new Rng(11), style);
    band.energy = energy;
    band.start();
    const seconds = SETTLE + (bars * 4 * 60) / style.tempo;
    for (let t = 0; t < seconds; t += 1 / 60) {
      sound.advance(1 / 60);
      band.update(1 / 60);
    }
    const calls: Call[] = sound.played
      .filter((p) => p.at >= SETTLE)
      .map((p) => {
        const { delay: _delay, ...options } = p.options;
        return 'voice' in p
          ? { at: p.at - SETTLE, voice: p.voice, midi: p.midi, options }
          : { at: p.at - SETTLE, fx: p.fx, options };
      });
    const job: Job = { seconds: seconds - SETTLE + 3, rate: RATE, calls, trims: TRIMS, seed: 7, live: true };
    const rendered = await render(job);
    const left = decode(rendered.left);
    const right = decode(rendered.right);
    const a = analyze({ l: left, r: right }, rendered.rate);
    const integrated = integratedLoudness({ l: left, r: right }, rendered.rate);
    const label = `${name}-${energy}`;
    writeFileSync(join(out, `${label}.wav`), wavBytes([left, right], rendered.rate));
    const mono = new Float32Array(left.length);
    for (let i = 0; i < mono.length; i++) mono[i] = (left[i]! + right[i]!) / 2;
    writePng(
      join(out, `${label}.png`),
      spectrogram(mono, rendered.rate, { pxPerSecond: 40, height: 128, maxSeconds: 40 }),
    );
    console.log(
      `${name.padEnd(12)} ${String(energy).padStart(6)} ${f(a.peakDb).padStart(10)} ${f(a.loudness).padStart(7)} ${f(integrated).padStart(11)} ${f(a.centroid, 0).padStart(12)} ${String(calls.length).padStart(7)}`,
    );
  }
}
await browser.close();
console.log(`\nwrote wavs and spectrograms to ${out}`);
