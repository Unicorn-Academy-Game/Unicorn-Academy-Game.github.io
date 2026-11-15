import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { TRIMS } from '../../src/audio/synth/trims';
import { DRUMS, KIT } from '../../src/shared/kit';
import { FX_NAMES, VOICE_NAMES } from '../../src/wonder/sound';
import { contactSheet, type Rgba, writePng } from '../art/core/image';
import { type Analysis, analyze, spectrogram } from '../audio/analysis';
import { renderSound } from '../audio/catalog';
import { monoToStereo, SR, wavBytes } from '../audio/dsp';
import { momentaryLoudness } from '../audio/loudness';
import { phoneLoss } from '../audio/phone';
import { PEAK_CAP, PROBE_MIDI, targetOf } from '../audio/targets';
import type { Call, Job, Rendered } from '../lab/synth';
import { args, flag } from '../lib/args';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * Renders every sound the wonder synth can make in a real browser's audio engine (offline, so no
 * speaker), measures each one, writes a WAV and a spectrogram for each, and prints a table next to
 * the loudness of the sounds the world already plays.
 *   tsx tools/qa/synth-sheet.ts [--only star,boom] [--out assets/source/_scratch/audio] [--raw] [--limited] [--reference] [--browser webkit]
 * `--raw` renders without the trims the game uses, which is how the trims are worked out.
 * `--limited` sends it through the engine's limiter as the game does. Needs the dev server on 5173,
 * or on `UA_PORT`. It measures. It does not hear. A person has to listen.
 */
const has = (name: string): boolean => args.includes(`--${name}`);
const out = flag('out', 'assets/source/_scratch/audio');
const only = flag('only').split(',').filter(Boolean);
const raw = has('raw');
const limited = has('limited');
const RATE = 32000;

interface Item {
  label: string;
  seconds: number;
  calls: Call[];
}

const items: Item[] = [
  ...FX_NAMES.map((name): Item => ({ label: name, seconds: 5, calls: [{ at: 0.05, fx: name }] })),
  { label: 'star@0', seconds: 3, calls: [{ at: 0.05, fx: 'star', options: { step: 0 } }] },
  { label: 'star@4', seconds: 3, calls: [{ at: 0.05, fx: 'star', options: { step: 4 } }] },
  { label: 'boom@small', seconds: 4, calls: [{ at: 0.05, fx: 'boom', options: { size: 0.1 } }] },
  { label: 'boom@big', seconds: 5, calls: [{ at: 0.05, fx: 'boom', options: { size: 1 } }] },
  { label: 'launch@small', seconds: 3, calls: [{ at: 0.05, fx: 'launch', options: { size: 0.1 } }] },
  { label: 'launch@big', seconds: 3, calls: [{ at: 0.05, fx: 'launch', options: { size: 1 } }] },
  { label: 'ding@5', seconds: 3, calls: [{ at: 0.05, fx: 'ding', options: { step: 5 } }] },
  ...VOICE_NAMES.filter((voice) => voice !== 'kit').map(
    (voice): Item => ({
      label: `note:${voice}`,
      seconds: 5,
      calls: [{ at: 0.05, voice, midi: PROBE_MIDI[voice] ?? 72 }],
    }),
  ),
  ...[31, 43, 55, 67].map(
    (midi): Item => ({ label: `note:sub@${midi}`, seconds: 5, calls: [{ at: 0.05, voice: 'sub', midi }] }),
  ),
  ...DRUMS.map(
    (drum): Item => ({ label: `drum:${drum}`, seconds: 4, calls: [{ at: 0.05, voice: 'kit', midi: KIT[drum] }] }),
  ),
  {
    label: 'chord:pad',
    seconds: 6,
    calls: [60, 64, 67, 72].map((midi): Call => ({ at: 0.05, voice: 'pad', midi, options: { seconds: 3 } })),
  },
];

const picked =
  only.length > 0
    ? items.filter((i) =>
        only.some(
          (o) =>
            i.label === o ||
            i.label.startsWith(`${o}@`) ||
            i.label === `note:${o}` ||
            i.label.startsWith(`note:${o}@`) ||
            i.label === `drum:${o}`,
        ),
      )
    : items;

const decode = (b64: string): Float32Array => {
  const bytes = Buffer.from(b64, 'base64');
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

mkdirSync(out, { recursive: true });
const engineName = flag('browser', 'chromium');
const browser = await (engineName === 'webkit' ? webkit : chromium).launch();
const page = await browser.newPage();
await silence(page);
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${ORIGIN}/tools/lab/synth.html`);
await page.waitForFunction(() => (window as unknown as { synthLab?: unknown }).synthLab !== undefined, undefined, {
  timeout: 60_000,
});

interface Row {
  label: string;
  a: Analysis;
  truncated: boolean;
  /**
   * How much of the loudness is left on a small speaker, which gives nothing under about 250 Hz, in
   * dB.
   */
  phone: number;
}
const rows: Row[] = [];
const tiles: Rgba[] = [];
for (const item of picked) {
  const job: Job = { seconds: item.seconds, rate: RATE, calls: item.calls, trims: raw ? {} : TRIMS, limiter: limited };
  const rendered = (await page.evaluate(
    (j) => (window as unknown as { synthLab: { render(j: Job): Promise<Rendered> } }).synthLab.render(j),
    job,
  )) as Rendered;
  const left = decode(rendered.left);
  const right = decode(rendered.right);
  const a = analyze({ l: left, r: right }, rendered.rate);
  const truncated = a.seconds > item.seconds - 0.1;
  const phone = phoneLoss({ l: left, r: right }, rendered.rate, a.loudness);
  rows.push({ label: item.label, a, truncated, phone });
  const safe = item.label.replace(/[^a-z0-9@-]+/gi, '-');
  writeFileSync(join(out, `${safe}.wav`), wavBytes([left, right], rendered.rate));
  const mono = new Float32Array(left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (left[i]! + right[i]!) / 2;
  const tile = spectrogram(mono, rendered.rate, { pxPerSecond: 90, height: 96, maxSeconds: 4.5 });
  tiles.push(tile);
  writePng(join(out, `${safe}.png`), tile);
}
await browser.close();

const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '-inf');
console.log(
  `[${engineName}] ${raw ? 'RAW (no trims)' : 'with trims'}${limited ? ', through the limiter, which also lifts everything by its make-up gain' : ', before the limiter'}  rate ${RATE} Hz`,
);
console.log(
  'label            peak dBFS  LUFS-M  target  trim   rings s  centroid  pitch Hz  noisy  attack ms  end dB   dc  phone dB',
);
const suggested: Record<string, number> = {};
rows.forEach(({ label, a, truncated, phone }, i) => {
  const target = targetOf(label);
  const wanted = target === undefined ? 0 : Math.min(target - a.loudness, PEAK_CAP - a.peakDb);
  if (raw && target !== undefined && !label.includes('@') && !label.startsWith('chord'))
    suggested[label.replace('note:', '')] = Math.round(10 ** (wanted / 20) * 100) / 100;
  const off = !raw && !limited && target !== undefined ? a.loudness - target : 0;
  const flags = [
    a.peakDb > -3 ? 'LOUD' : '',
    a.peakDb < -30 ? 'QUIET' : '',
    a.endDb > -60 ? 'END-CLICK' : '',
    a.attackMs < 0.7 && a.peakDb > -40 ? 'START-CLICK' : '',
    Math.abs(a.dc) > 0.005 ? 'DC' : '',
    truncated ? 'TRUNCATED' : '',
    Math.abs(off) > 1.5 ? `OFF-TARGET ${off > 0 ? '+' : ''}${f(off)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  console.log(
    `${String(i + 1).padStart(2)} ${label.padEnd(14)} ${f(a.peakDb).padStart(9)} ${f(a.loudness).padStart(7)} ${target === undefined ? '    -' : f(target).padStart(6)} ${raw && target !== undefined ? `${f(wanted)}dB`.padStart(6) : '     '} ${f(a.seconds, 2).padStart(8)} ${f(a.centroid, 0).padStart(9)} ${f(a.pitch, 1).padStart(9)} ${f(a.noisiness, 2).padStart(6)} ${f(a.attackMs, 2).padStart(9)} ${f(a.endDb).padStart(7)} ${f(a.dc, 4).padStart(7)} ${f(phone).padStart(8)}  ${flags}`,
  );
});
if (raw) {
  const drums = Object.entries(suggested).filter(([k]) => k.startsWith('drum:'));
  const voices = Object.entries(suggested).filter(([k]) => !k.startsWith('drum:'));
  console.log('\nsuggested trims (paste into src/audio/synth/trims.ts)');
  console.log(`export const TRIMS: Trims = {\n${voices.map(([k, v]) => `  ${k}: ${v},`).join('\n')}\n};`);
  if (drums.length > 0) {
    console.log(
      '\nsuggested drum levels (paste into LEVELS in src/audio/synth/kit.ts, as they are on top of the kit trim)',
    );
    console.log(
      `export const LEVELS = {\n${drums.map(([k, v]) => `  ${k.slice('drum:'.length)}: ${v},`).join('\n')}\n};`,
    );
  }
}

if (has('reference') || only.length === 0) {
  const families = [
    'recruit',
    'hearts',
    'hello',
    'tap',
    'confirm',
    'spell-light',
    'spell-lightning',
    'spell-water',
    'fx-bloom',
    'fx-glow',
    'fx-rainbow',
    'fx-spray',
    'hop',
    'splash',
    'gem',
    'chest-open',
    'palace-welcome',
    'treasure-bounce',
    'lift-ding',
    'code-success',
  ] as const;
  console.log('\nthe world, for comparison (loudest 400 ms, LUFS)');
  const measured = families.map((id) => {
    const take = renderSound(id, 0);
    let top = 0;
    for (const v of take) top = Math.max(top, Math.abs(v));
    return { id, peak: 20 * Math.log10(top), lufs: momentaryLoudness(monoToStereo(take), SR) };
  });
  for (const m of measured)
    console.log(`  ${m.id.padEnd(16)} peak ${f(m.peak).padStart(6)}  LUFS-M ${f(m.lufs).padStart(6)}`);
  const sorted = measured.map((m) => m.lufs).sort((x, y) => x - y);
  console.log(
    `  median ${f(sorted[Math.floor(sorted.length / 2)]!)}  low ${f(sorted[0]!)}  high ${f(sorted[sorted.length - 1]!)}`,
  );
}

// Pages of twelve tiles with a number in the corner, so a sheet can be read next to the table.
const digits: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};
const stamp = (img: Rgba, text: string): Rgba => {
  const data = new Uint8Array(img.data);
  const scale = 3;
  [...text].forEach((ch, k) => {
    const glyph = digits[ch];
    if (!glyph) return;
    glyph.forEach((row, y) => {
      [...row].forEach((on, x) => {
        if (on !== '1') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = 4 + (k * 4 + x) * scale + dx;
            const py = 4 + y * scale + dy;
            const at = (py * img.width + px) * 4;
            data[at] = 255;
            data[at + 1] = 255;
            data[at + 2] = 255;
          }
        }
      });
    });
  });
  return { width: img.width, height: img.height, data };
};
const stamped = tiles.map((t, i) => stamp(t, String(i + 1)));
for (let page0 = 0; page0 < stamped.length; page0 += 12) {
  const group = stamped.slice(page0, page0 + 12);
  const widest = Math.max(...group.map((g) => g.width));
  const padded = group.map((g) => {
    if (g.width === widest) return g;
    const data = new Uint8Array(widest * g.height * 4);
    for (let y = 0; y < g.height; y++)
      data.set(g.data.subarray(y * g.width * 4, (y + 1) * g.width * 4), y * widest * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return { width: widest, height: g.height, data };
  });
  writePng(
    join(out, `sheet-${String(page0 / 12 + 1)}.png`),
    contactSheet(padded, { cols: 2, scale: 1, gap: 4, bg: [10, 10, 20, 255] }),
  );
}
console.log(`\nwrote ${rows.length} sounds, wavs, spectrograms and sheets to ${out}`);
