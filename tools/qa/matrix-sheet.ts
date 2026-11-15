import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { TRIMS } from '../../src/audio/synth/trims';
import { DRUM_ROWS, PART_IDS, PARTS, type Part, type PartId } from '../../src/wonder/games/tonematrix/parts';
import { SIZE } from '../../src/wonder/games/tonematrix/scale';
import { writePng } from '../art/core/image';
import { analyze, spectrogram } from '../audio/analysis';
import { midiHz, wavBytes } from '../audio/dsp';
import { integratedLoudness } from '../audio/loudness';
import { phoneLoss } from '../audio/phone';
import type { Call, Job, Rendered } from '../lab/synth';
import { args, flag } from '../lib/args';
import { ORIGIN } from './origin';

/**
 * Plays the tone matrix in the lab, writes down every sound it asks for, and renders them in a real
 * browser's audio engine (offline, so no speaker): the song as it opens, a child and an expert at
 * the grid with all three parts going, the grids full to the last tile, and a scribble and a
 * hammered key strip on each part. Measures how loud, how near the ceiling and how even each row of
 * each part is, how much of each part is left on a small speaker, and how the three parts weigh
 * against each other, and writes a WAV and a spectrogram of each so a person can listen.
 *   tsx tools/qa/matrix-sheet.ts [--only box,full] [--rows] [--out assets/source/_scratch/matrix]
 * `--rows` goes straight to the table of rows, without playing. Needs the dev server on 5173, or on
 * `UA_PORT`. It measures. It does not hear. A person has to listen.
 */
const out = flag('out', 'assets/source/_scratch/matrix');
const only = flag('only').split(',').filter(Boolean);
const rowsOnly = args.includes('--rows');
const RATE = 32000;
const HERD = 'wildstar,leaf,glacier,river,cinder,storm';

/**
 * What the lab page is asked to do, as plain script because the page has no use for what a
 * transpiler adds to a function. `drive(name)` plays a scenario and says which stretch of the
 * game's own time is the one to measure.
 */
const DRIVER = `
window.tag = () => {
  const { wonder, sound } = window.lab;
  let own = false;
  const sing = wonder.sing.bind(wonder);
  wonder.sing = (...asked) => {
    own = true;
    try {
      return sing(...asked);
    } finally {
      own = false;
    }
  };
  const note = sound.note;
  sound.note = (voice, midi, options = {}) => note(voice, midi, own ? { ...options, own: true } : options);
};
window.drive = (name) => {
  window.tag();
  const lab = window.lab;
  const game = lab.wonder;
  const view = () => game.inspect().plan;
  const press = (id) => {
    const b = view().buttons.find((q) => q.id === id);
    lab.tap(b.x, b.y);
  };
  const tab = (id) => {
    const t = view().tabs.find((q) => q.id === id);
    lab.tap(t.x + t.w / 2, t.y + t.h / 2);
    lab.step(0.4);
  };
  const centre = (x, y) => {
    const g = view().grid;
    return [g.x + (x + 0.5) * g.tw, g.y + (y + 0.5) * g.th];
  };
  /**
   * Every tile of every part lit, set in the grids themselves because painting three grids with a finger takes longer than the stretch measured.
   * A part that is one note at a time gets a note on every step, each in another row, which is the most it can hold.
   */
  const fillAll = () => {
    for (const id of ['melody', 'beat', 'bass']) {
      const grid = game.boards[id].grid;
      grid.clear();
      for (let x = 0; x < 16; x++) {
        if (id === 'bass') grid.set(x, 2 + ((x * 5) % 12), true);
        else for (let y = 0; y < 16; y++) grid.set(x, y, true);
      }
    }
  };
  const lit = () => {
    const parts = game.inspect().parts;
    return parts.melody.tiles.length + '+' + parts.beat.tiles.length + '+' + parts.bass.tiles.length;
  };
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const scribble = () => {
    const g = view().grid;
    for (let n = 0; n < 40; n++) {
      const points = [];
      let x = g.x + rnd() * g.w;
      let y = g.y + rnd() * g.h;
      for (let k = 0; k < 10; k++) {
        x = Math.max(g.x, Math.min(g.x + g.w, x + (rnd() - 0.5) * g.w * 0.5));
        y = Math.max(g.y, Math.min(g.y + g.h, y + (rnd() - 0.5) * g.h * 0.5));
        points.push([x, y]);
      }
      lab.drag(points, 0.2 + rnd() * 0.2);
      lab.step(0.05);
    }
  };
  const hammer = () => {
    const k = view().keys;
    for (let n = 0; n < 160; n++) {
      lab.tap(k.x + k.w / 2, k.y + (Math.floor(rnd() * 16) + 0.5) * k.th, 0.02);
      lab.step(0.03);
    }
  };
  /** The same thing done on each part in turn, each stretch measured by itself. */
  const eachPart = (what, doIt) => {
    const windows = {};
    for (const id of ['melody', 'beat', 'bass']) {
      tab(id);
      const t = lab.state().time;
      doIt(id);
      windows[what + '-' + id] = [t, lab.state().time];
    }
    return windows;
  };
  if (name === 'box') {
    lab.step(10);
    return { windows: { song: [2, 10] } };
  }
  if (name === 'presets') {
    const windows = {};
    for (const id of ['melody', 'beat', 'bass']) {
      tab(id);
      // Five turns of the wand come round to the tune the part began on, so each tune is heard once with the other two parts on theirs.
      for (let n = 0; n < 5; n++) {
        press('wand');
        lab.step(0.6);
        const t = lab.state().time;
        lab.step(8);
        windows[id + '-' + game.inspect().parts[id].tune] = [t, t + 8];
      }
    }
    return { windows };
  }
  if (name === 'child') {
    lab.play(80, 'child');
    const t = lab.state().time;
    return { windows: { child: [t - 20, t] } };
  }
  if (name === 'expert') {
    lab.play(60, 'expert');
    const t = lab.state().time;
    return { windows: { expert: [t - 20, t] } };
  }
  if (name === 'full') {
    lab.play(30, 'expert');
    fillAll();
    lab.step(1);
    const t = lab.state().time;
    lab.step(8);
    return { windows: { full: [t, t + 8] }, tiles: lit() };
  }
  if (name === 'scribble') {
    lab.play(30, 'expert');
    return { windows: eachPart('scribble', scribble) };
  }
  if (name === 'keys') {
    lab.play(30, 'expert');
    return { windows: eachPart('keys', hammer) };
  }
  throw new Error('no scenario called ' + name);
};
window.calls = () =>
  window.lab.sound.played.map((p) => {
    const { delay, own, ...options } = p.options || {};
    const call = 'voice' in p ? { at: p.at, voice: p.voice, midi: p.midi, options } : { at: p.at, fx: p.fx, options };
    return own ? { ...call, own: true } : call;
  });
`;

const decode = (b64: string): Float32Array => {
  const bytes = Buffer.from(b64, 'base64');
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const synth = await browser.newPage();
synth.on('pageerror', (e) => console.log(`[synth pageerror] ${e.message}`));
await synth.goto(`${ORIGIN}/tools/lab/synth.html`);
await synth.waitForFunction(() => (window as unknown as { synthLab?: unknown }).synthLab !== undefined, undefined, {
  timeout: 60_000,
});

/**
 * The page can reload under us when the dev server sees a file change, so a render that was cut off
 * is asked again.
 */
async function render(job: Job): Promise<Rendered> {
  for (let attempt = 0; ; attempt++) {
    try {
      await synth.waitForFunction(
        () => (window as unknown as { synthLab?: unknown }).synthLab !== undefined,
        undefined,
        { timeout: 60_000 },
      );
      return (await synth.evaluate(
        (j) => (window as unknown as { synthLab: { render(j: Job): Promise<Rendered> } }).synthLab.render(j),
        job,
      )) as Rendered;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

async function labPage(): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`[lab pageerror] ${e.message}`));
  await page.goto(`${ORIGIN}/tools/lab/wonder.html?game=tone-matrix&manual=1&seed=7&herd=${HERD}`);
  await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined, undefined, {
    timeout: 120_000,
  });
  await page.evaluate(DRIVER);
  return page;
}

interface Driven {
  windows: Record<string, [number, number]>;
  tiles?: string;
}

const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '-inf');
const rows: string[] = [];
const say = (line: string): void => {
  rows.push(line);
  console.log(line);
};

/** A sound the game asked for, and whether it came from a touch of the player's. */
type Asked = Call & { own?: true };

/**
 * Who a sound belongs to, for telling what makes a stretch loud: the player's own notes, and the
 * loop of each of the three parts.
 */
const WHO: readonly (readonly [string, (c: Asked) => boolean])[] = [
  ['own', (c) => c.own === true],
  ...PART_IDS.map((id): readonly [string, (c: Asked) => boolean] => [
    id,
    (c) => c.own !== true && 'voice' in c && c.voice === PARTS[id].voice,
  ]),
];

/**
 * Renders the calls of one stretch of play twice, as they are and through the engine's limiter, and
 * writes what came out.
 */
async function measure(label: string, calls: readonly Asked[], seconds: number, parts = false): Promise<void> {
  const job: Job = { seconds: seconds + 3, rate: RATE, calls, trims: TRIMS, seed: 7, live: true };
  const raw = await render(job);
  const limited = await render({ ...job, limiter: true });
  const left = decode(raw.left);
  const right = decode(raw.right);
  const a = analyze({ l: left, r: right }, raw.rate);
  const integrated = integratedLoudness({ l: left, r: right }, raw.rate);
  const under = analyze({ l: decode(limited.left), r: decode(limited.right) }, limited.rate);
  writeFileSync(join(out, `${label}.wav`), wavBytes([left, right], raw.rate));
  writeFileSync(join(out, `${label}.json`), JSON.stringify(calls));
  const mono = new Float32Array(left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (left[i]! + right[i]!) / 2;
  writePng(join(out, `${label}.png`), spectrogram(mono, raw.rate, { pxPerSecond: 40, height: 128, maxSeconds: 40 }));
  const starts = calls.map((c) => c.at).sort((p, q) => p - q);
  let busiest = 0;
  for (let i = 0, j = 0; i < starts.length; i++) {
    while (starts[i]! - starts[j]! > 0.25) j++;
    busiest = Math.max(busiest, i - j + 1);
  }
  const phone = phoneLoss({ l: left, r: right }, raw.rate, a.loudness);
  say(
    `${label.padEnd(16)} ${f(a.peakDb).padStart(9)} ${f(under.peakDb).padStart(9)} ${f(a.loudness).padStart(8)} ${f(integrated).padStart(11)} ${f(phone).padStart(8)} ${f(a.centroid, 0).padStart(9)} ${String(calls.length).padStart(7)} ${String(busiest).padStart(8)}`,
  );
  if (!parts) return;
  for (const [who, mine] of WHO) {
    const part = calls.filter(mine);
    if (part.length === 0) continue;
    const r = await render({ ...job, calls: part });
    const l = decode(r.left);
    const rr = decode(r.right);
    const m = analyze({ l, r: rr }, r.rate);
    say(
      `  ${who.padEnd(14)} ${f(m.peakDb).padStart(9)} ${''.padStart(9)} ${f(m.loudness).padStart(8)} ${f(integratedLoudness({ l, r: rr }, r.rate)).padStart(11)} ${f(phoneLoss({ l, r: rr }, r.rate, m.loudness)).padStart(8)} ${f(m.centroid, 0).padStart(9)} ${String(part.length).padStart(7)}`,
    );
  }
}

if (!rowsOnly) {
  say('scenario           peak dBFS  limited   LUFS-M  integrated  phone dB  centroid   notes  per .25s');
  const scenarios = ['box', 'presets', 'child', 'expert', 'full', 'scribble', 'keys'].filter(
    (s) => only.length === 0 || only.includes(s),
  );
  for (const name of scenarios) {
    const page = await labPage();
    const driven = (await page.evaluate(
      (n) => (window as unknown as { drive(n: string): unknown }).drive(n),
      name,
    )) as Driven;
    const all = (await page.evaluate(() => (window as unknown as { calls(): unknown }).calls())) as Asked[];
    for (const [label, [from, to]] of Object.entries(driven.windows)) {
      const calls = all.filter((c) => c.at >= from && c.at < to).map((c): Asked => ({ ...c, at: c.at - from }));
      await measure(label, calls, to - from, true);
    }
    if (driven.tiles !== undefined) say(`  ${name}: ${driven.tiles} tiles lit (melody+beat+bass)`);
    await page.close();
  }
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number): string => NAMES[midi % 12]! + String(Math.floor(midi / 12) - 1);

/**
 * Every row of a part rung by itself at the gain its own trim gives it and no other, so that what
 * differs between rows is what the game's levels leave uneven. A part that is held rings for half a
 * second, which is about what a bass note is held for in a tune.
 */
async function table(part: Part): Promise<void> {
  const tuned = part.voice !== 'kit';
  const ring = (y: number, at: number): Call => {
    const row = part.rows[y]!;
    return {
      at,
      voice: part.voice,
      midi: row.midi,
      options: { gain: row.trim, bus: 'effects', ...(part.mono ? { seconds: 0.5 } : {}) },
    };
  };
  say(
    `\n${part.id}: row  ${tuned ? 'note ' : 'drum '}       expected Hz  measured Hz  cents    peak dBFS  LUFS-M  phone dB`,
  );
  const heard: { loudness: number; cents: number; phone: number }[] = [];
  const tour: Call[] = [];
  const bottomUp = Array.from({ length: SIZE }, (_, i) => SIZE - 1 - i);
  bottomUp.forEach((y, i) => {
    tour.push(ring(y, i * 0.4));
  });
  for (const y of bottomUp) {
    const row = part.rows[y]!;
    const r = await render({ seconds: 2.6, rate: RATE, calls: [ring(y, 0.05)], trims: TRIMS, seed: 7, live: true });
    const sound = { l: decode(r.left), r: decode(r.right) };
    const a = analyze(sound, r.rate);
    const cents = tuned ? 1200 * Math.log2(a.pitch / midiHz(row.midi)) : 0;
    const phone = phoneLoss(sound, r.rate, a.loudness);
    heard.push({ loudness: a.loudness, cents, phone });
    const label = tuned ? noteName(row.midi) : DRUM_ROWS[SIZE - 1 - y]!;
    say(
      `${part.id.padEnd(6)}  ${String(heard.length).padStart(3)}  ${label.padEnd(10)}  ${tuned ? f(midiHz(row.midi), 1).padStart(11) : '          -'}  ${tuned ? f(a.pitch, 1).padStart(11) : '          -'}  ${tuned ? f(cents, 0).padStart(5) : '    -'}  ${f(a.peakDb).padStart(9)}  ${f(a.loudness).padStart(6)}  ${f(phone).padStart(8)}`,
    );
  }
  const loud = heard.map((h) => h.loudness);
  const mean = loud.reduce((p, q) => p + q, 0) / loud.length;
  const phones = heard.map((h) => h.phone).sort((p, q) => p - q);
  const median = phones[Math.floor(phones.length / 2)]!;
  const clamp = (v: number): number => Math.max(-6, Math.min(6, v));
  const list = (trims: readonly number[]): string => trims.map((v) => f(v)).join(', ');
  // What to add to the trims the rows have now, in dB, lowest row first. Even is every row to the
  // mean. Squeezed leaves a third of how far each is from the mean, which is how a kit is made fit
  // for a child, who has to hear the hat they put down as well as the kick. Lifted is even and then
  // the rows a phone loses most of turned up by a third of the difference.
  const even = loud.map((l) => clamp(mean - l));
  say(`${part.id}: add, in dB, lowest row first, to make the rows as loud as each other:             ${list(even)}`);
  say(
    `${part.id}: add, to leave each row a third of the way it is from the middle:                  ${list(loud.map((l) => clamp(0.35 * l + 0.65 * mean - l)))}`,
  );
  say(
    `${part.id}: add, to make them as loud and lift what a small speaker loses most of:            ${list(heard.map((h, i) => clamp(even[i]! + 0.3 * Math.max(0, median - h.phone))))}`,
  );
  const r = await render({
    seconds: tour.length * 0.4 + 3,
    rate: RATE,
    calls: tour,
    trims: TRIMS,
    seed: 7,
    live: true,
  });
  writeFileSync(join(out, `rows-${part.id}.wav`), wavBytes([decode(r.left), decode(r.right)], r.rate));
}

for (const id of PART_IDS satisfies readonly PartId[])
  if (only.length === 0 || only.includes(id) || rowsOnly) await table(PARTS[id]);
writeFileSync(join(out, 'summary.txt'), `${rows.join('\n')}\n`);
await browser.close();
console.log(`\nwrote wavs, spectrograms and summary.txt to ${out}`);
