import { expect, type Page, test } from '@playwright/test';
import { TRIMS } from '../../src/audio/synth/trims';
import { DRUMS, KIT } from '../../src/shared/kit';
import { FX_NAMES, type FxName, VOICE_NAMES, type VoiceName } from '../../src/wonder/sound';
import { type Analysis, analyze } from '../../tools/audio/analysis';
import { filter4, SR } from '../../tools/audio/dsp';
import { PEAK_CAP, PROBE_MIDI, TARGETS } from '../../tools/audio/targets';
import type { Call, Job, Rendered } from '../../tools/lab/synth';
import { silence } from '../../tools/qa/silence';

/**
 * The wonder synth, played by a real browser's audio engine into an offline context and measured.
 * Nothing here is heard. It is what stops a sound from being too loud, too quiet, out of tune, out
 * of key, clicking, or never ending, and what stops a crowd of them from clipping. Sound is made in
 * the same code in the game, so a change that breaks it breaks here.
 */

const RATE = 32000;
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/**
 * What a small speaker gives of a sound: nothing under about 250 Hz. Two biquads, as the lab's
 * sheet does it.
 */
const highpass = (x: Float32Array): Float32Array => filter4(x, 'highpass', (250 * SR) / RATE);

const decode = (b64: string): Float32Array => {
  const bytes = Buffer.from(b64, 'base64');
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

interface Heard {
  readonly l: Float32Array;
  readonly r: Float32Array;
  readonly a: Analysis;
}

test.describe('the wonder synth, rendered by a real browser', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'not a browser this game is made for');

  let page: Page;
  const problems: string[] = [];

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    await silence(context);
    page = await context.newPage();
    problems.length = 0;
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    await page.goto('/tools/lab/synth.html');
    await page.waitForFunction(() => (window as unknown as { synthLab?: unknown }).synthLab !== undefined, undefined, {
      timeout: 60_000,
    });
  });

  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  /**
   * Renders and measures. The first load of a page that Vite has not served yet may reload once,
   * which is waited out.
   */
  const hear = async (calls: Call[], seconds = 5, extra: Partial<Job> = {}): Promise<Heard> => {
    const job: Job = { seconds, rate: RATE, calls, trims: TRIMS, limiter: false, ...extra };
    for (let attempt = 0; ; attempt++) {
      try {
        const r = (await page.evaluate(
          (j) => (window as unknown as { synthLab: { render(j: Job): Promise<Rendered> } }).synthLab.render(j),
          job,
        )) as Rendered;
        const l = decode(r.left);
        const right = decode(r.right);
        return { l, r: right, a: analyze({ l, r: right }, r.rate) };
      } catch (error) {
        if (attempt >= 3 || !String(error).includes('Execution context was destroyed')) throw error;
        await page.waitForFunction(
          () => (window as unknown as { synthLab?: unknown }).synthLab !== undefined,
          undefined,
          { timeout: 60_000 },
        );
      }
    }
  };

  const fx = (name: FxName, options: Extract<Call, { fx: FxName }>['options'] = {}, at = 0.05): Call => ({
    at,
    fx: name,
    options,
  });
  const note = (
    voice: VoiceName,
    midi: number,
    options: Extract<Call, { voice: VoiceName }>['options'] = {},
    at = 0.05,
  ): Call => ({ at, voice, midi, options });

  test('every sound and instrument makes sound that is finished, clean and as loud as it is meant to be', async () => {
    const failures: string[] = [];
    const items: Array<{ label: string; calls: Call[] }> = [
      ...FX_NAMES.map((n) => ({ label: n, calls: [fx(n)] })),
      ...VOICE_NAMES.filter((v) => v !== 'kit').map((v) => ({
        label: `note:${v}`,
        calls: [note(v, PROBE_MIDI[v] ?? 72)],
      })),
      ...DRUMS.map((drum) => ({ label: `drum:${drum}`, calls: [note('kit', KIT[drum])] })),
    ];
    for (const { label, calls } of items) {
      const { l, r, a } = await hear(calls, 6);
      const bad = (what: string): number => failures.push(`${label}: ${what}`);
      if (![...l, ...r].every(Number.isFinite)) bad('has samples that are not numbers');
      if (a.peakDb > PEAK_CAP + 0.6) bad(`peaks at ${a.peakDb.toFixed(1)} dBFS, over the ${PEAK_CAP} it is allowed`);
      if (a.peakDb < -30) bad(`is almost silent (${a.peakDb.toFixed(1)} dBFS)`);
      if (a.endDb > -60) bad(`is cut off at ${a.endDb.toFixed(1)} dBFS, which clicks`);
      if (a.attackMs < 0.6 && a.peakDb > -40) bad(`starts in ${a.attackMs.toFixed(2)} ms, which clicks`);
      if (Math.abs(a.dc) > 0.002) bad(`pushes the speaker by ${a.dc.toFixed(4)}`);
      if (a.seconds > 4.9) bad(`rings for ${a.seconds.toFixed(1)} s, which is too long to be a sound`);
      const target = TARGETS[label];
      // A sound is never turned up past a peak of PEAK_CAP to reach its target. One that is quieter
      // than the target and sits at the cap is as loud as it can be made, and has not drifted. The
      // balloon's snap is a crack that is mostly peak, and is -24.4 LUFS at the cap where its
      // target is -20.
      const asLoudAsItCanBe = a.peakDb > PEAK_CAP - 0.6;
      if (target !== undefined && Math.abs(a.loudness - target) > 1.5 && !(a.loudness < target && asLoudAsItCanBe))
        bad(`is ${a.loudness.toFixed(1)} LUFS where ${target} is wanted`);
    }
    expect(failures).toEqual([]);
  });

  test('instruments sound at the pitch they are asked for', async () => {
    const wrong: string[] = [];
    for (const voice of [
      'bell',
      'glass',
      'pluck',
      'marimba',
      'harp',
      'chime',
      'pad',
      'flute',
      'bass',
      'ping',
    ] as const) {
      for (const midi of [48, 60, 72, 84]) {
        const { a } = await hear([note(voice, midi, { seconds: 1.2 })], 4);
        if (a.pitch === 0 || Math.abs(a.pitch / hz(midi) - 1) > 0.02)
          wrong.push(`${voice} at ${midi} sounds at ${a.pitch.toFixed(1)} Hz, not ${hz(midi).toFixed(1)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('the bass sounds at the pitch it is asked for, on every note of its rows, down to the lowest', async () => {
    const wrong: string[] = [];
    for (const midi of [31, 36, 43, 50, 55, 62, 67]) {
      const { a } = await hear([note('sub', midi, { seconds: 1.2 })], 4);
      if (a.pitch === 0 || Math.abs(a.pitch / hz(midi) - 1) > 0.02)
        wrong.push(`sub at ${midi} sounds at ${a.pitch.toFixed(1)} Hz, not ${hz(midi).toFixed(1)}`);
    }
    expect(wrong).toEqual([]);
  });

  test('the bass has something to be heard by on a small speaker, at every note of its rows', async () => {
    // A phone gives nothing under about 250 Hz. What is left of the note once that is taken away is
    // what it is heard by there.
    const weak: string[] = [];
    for (const midi of [31, 43, 55, 67]) {
      const { l, r } = await hear([note('sub', midi, { seconds: 1.2 })], 4);
      const whole = analyze({ l, r }, RATE).loudness;
      const small = analyze({ l: highpass(l), r: highpass(r) }, RATE).loudness;
      if (small - whole < -13)
        weak.push(`sub at ${midi} keeps ${(small - whole).toFixed(1)} dB of itself on a small speaker`);
    }
    expect(weak).toEqual([]);
  });

  test('a ping strikes, settles to a soft body for as long as it is held, and then dies away within a second', async () => {
    const { l } = await hear([note('ping', 72, { seconds: 0.125 }, 0.1)], 2);
    const start = l.findIndex((v) => Math.abs(v) > 1e-4);
    const rms = (from: number): number => {
      const part = l.subarray(start + Math.round(from * RATE), start + Math.round((from + 0.01) * RATE));
      return 10 * Math.log10(part.reduce((sum, v) => sum + v * v, 0) / part.length + 1e-20);
    };
    const strike = Math.max(rms(0.004), rms(0.008), rms(0.012));
    // The body is 0.3 of the strike, which is 10.5 dB down. The fall after the hold takes a seventh
    // of a second for each e, which is 8.7 dB.
    expect(rms(0.07) - strike, 'the body while it is held').toBeGreaterThan(-12.5);
    expect(rms(0.07) - strike).toBeLessThan(-8.5);
    expect(rms(0.125 + 0.3) - rms(0.07), 'after it is let go').toBeLessThan(-16);
    expect(rms(0.125 + 0.3) - rms(0.07)).toBeGreaterThan(-24);
    expect(rms(0.9) - strike, 'and it is gone before a second').toBeLessThan(-55);
  });

  test('every step of every tuned sound is a note of the one key', async () => {
    const PENTATONIC = [0, 2, 4, 7, 9];
    const out: string[] = [];
    for (const name of ['star', 'ding', 'coin'] as const) {
      for (let step = 0; step < 10; step++) {
        const { a } = await hear([fx(name, { step })], 3);
        const semitones = 12 * Math.log2(a.pitch / hz(60));
        const pitchClass = ((Math.round(semitones) % 12) + 12) % 12;
        const cents = Math.abs(semitones - Math.round(semitones)) * 100;
        if (!PENTATONIC.includes(pitchClass) || cents > 25)
          out.push(`${name} step ${step} sounds ${semitones.toFixed(2)} semitones above middle C`);
      }
    }
    expect(out).toEqual([]);
  });

  test('the stars climb: each step is higher than the one before', async () => {
    let last = 0;
    for (let step = 0; step < 5; step++) {
      const { a } = await hear([fx('ding', { step })], 3);
      expect(a.pitch, `step ${step}`).toBeGreaterThan(last);
      last = a.pitch;
    }
  });

  test('pitch moves a sound by that many semitones, and size makes a firework bigger', async () => {
    const base = (await hear([fx('pop')], 2)).a.pitch;
    const up = (await hear([fx('pop', { pitch: 12 })], 2)).a.pitch;
    const down = (await hear([fx('pop', { pitch: -12 })], 2)).a.pitch;
    expect(up / base).toBeGreaterThan(1.85);
    expect(up / base).toBeLessThan(2.15);
    expect(down / base).toBeGreaterThan(0.45);
    expect(down / base).toBeLessThan(0.55);
    const small = (await hear([fx('boom', { size: 0.1 })], 4)).a;
    const big = (await hear([fx('boom', { size: 1 })], 5)).a;
    expect(big.loudness).toBeGreaterThan(small.loudness + 2);
    expect(big.centroid).toBeGreaterThan(small.centroid * 0.8);
  });

  test('a sound panned to a side is heard on that side only, and one with no pan on both', async () => {
    const rms = (x: Float32Array): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    const left = await hear([fx('tap', { pan: -1 })], 1);
    const right = await hear([fx('tap', { pan: 1 })], 1);
    const centre = await hear([fx('tap')], 1);
    expect(rms(left.r)).toBeLessThan(rms(left.l) * 0.01);
    expect(rms(right.l)).toBeLessThan(rms(right.r) * 0.01);
    expect(Math.abs(20 * Math.log10(rms(centre.l) / rms(centre.r)))).toBeLessThan(0.5);
  });

  test('a delay holds a sound back by that long, and nothing sounds before it', async () => {
    const { l, r } = await hear([fx('whistle', { delay: 1.5 }, 0)], 4);
    let first = -1;
    for (let i = 0; i < l.length; i++) {
      if (Math.abs(l[i]!) > 1e-4 || Math.abs(r[i]!) > 1e-4) {
        first = i;
        break;
      }
    }
    expect(first / RATE).toBeGreaterThan(1.49);
    expect(first / RATE).toBeLessThan(1.7);
  });

  test('the same seed makes the same sound, and another seed makes a different one', async () => {
    const one = await hear([fx('crackle'), fx('splash', {}, 0.5)], 3, { seed: 11 });
    const again = await hear([fx('crackle'), fx('splash', {}, 0.5)], 3, { seed: 11 });
    const other = await hear([fx('crackle'), fx('splash', {}, 0.5)], 3, { seed: 12 });
    // The room is a convolution the browser does in pieces, which differs between two runs by
    // rounding, a hundred and forty decibels down. Anything above that is a different sound.
    const apart = (x: Float32Array, y: Float32Array): number =>
      x.reduce((worst, v, i) => Math.max(worst, Math.abs(v - y[i]!)), 0);
    expect(apart(again.l, one.l)).toBeLessThan(1e-5);
    expect(apart(other.l, one.l)).toBeGreaterThan(1e-3);
  });

  test('a finale of fourteen shells is loud but not painful and never clips, even through the engine limiter', async () => {
    const calls: Call[] = [];
    for (let i = 0; i < 14; i++) {
      const t = 0.2 + i * 0.18;
      calls.push(fx('launch', { size: 0.6, pitch: i % 4 }, t));
      calls.push(fx('boom', { size: 0.5 + (i % 4) / 8, pitch: (i % 5) - 2 }, t + 0.6));
      calls.push(fx('crackle', { pitch: i % 3 }, t + 0.8));
      calls.push(note('bell', 60 + [0, 2, 4, 7, 9][i % 5]!, {}, t + 0.6));
      for (let k = 0; k < 3; k++) calls.push(fx('twinkle', { pitch: k + (i % 4) }, t + 0.7 + k * 0.1));
    }
    calls.push(fx('star', { step: 4 }, 3.6), fx('cheer', {}, 3.8));
    const open = await hear(calls, 7);
    const limited = await hear(calls, 7, { limiter: true });
    expect(open.a.loudness).toBeLessThan(-8);
    expect(open.a.loudness).toBeGreaterThan(-16);
    expect(open.a.peakDb).toBeLessThan(-0.5);
    expect(limited.a.peakDb).toBeLessThan(-0.5);
  });

  test('a hundred sounds in a second are held under the ceiling and near what a finale is', async () => {
    const calls: Call[] = [];
    for (let i = 0; i < 24; i++) calls.push(fx('boom', { size: 0.4 + (i % 5) / 10, pitch: i }, 0.05 + i * 0.02));
    for (let i = 0; i < 12; i++) calls.push(fx('star', { step: i % 5, pitch: i }, 0.1 + i * 0.03));
    for (let i = 0; i < 10; i++) calls.push(fx('cheer', { pitch: i }, 0.1 + i * 0.05));
    for (let i = 0; i < 40; i++) calls.push(fx('crackle', { pitch: i }, 0.05 + i * 0.04));
    const { a } = await hear(calls, 6, { limiter: true });
    expect(a.peakDb).toBeLessThan(-0.5);
    expect(a.loudness).toBeLessThan(-9);
  });

  test('a sound that is built late, because the page was held up, still sounds and the browser refuses nothing', async () => {
    // The synth reads a clock that is 0.2 s behind when each of these is asked for, so the browser
    // finds each one late. Held notes, swells and whooshes are set with curves, and a curve that
    // has already started is what a browser refuses.
    const calls: Call[] = [
      note('pad', 60, { seconds: 1 }, 0.3),
      note('flute', 72, { seconds: 0.6 }, 0.8),
      fx('whoosh', { size: 0.5 }, 1.3),
      fx('swell', {}, 1.8),
      fx('whistle', {}, 2.3),
      note('harp', 76, {}, 2.8),
    ];
    const { a } = await hear(calls, 5, { live: true, late: 0.2 });
    // The pageerror and console watch of afterEach is what fails if one was refused. A sound that
    // was only dropped would be silence.
    expect(a.peakDb, 'the loudest moment of what was heard').toBeGreaterThan(-35);
  });

  /**
   * How loud a stretch of what was rendered is on the left, in dB below the loudest a sample can
   * be.
   */
  const level = ({ l }: Heard, from: number, to: number): number => {
    const part = l.subarray(Math.round(from * RATE), Math.round(to * RATE));
    return 10 * Math.log10(part.reduce((sum, v) => sum + v * v, 0) / part.length + 1e-20);
  };

  /**
   * What is left of the left side of one render when another is taken from it, between two moments.
   */
  const taken = (from: Heard, away: Heard, start: number, end: number): Float32Array => {
    const a = Math.round(start * RATE);
    const b = Math.round(end * RATE);
    return from.l.subarray(a, b).map((v, i) => v - away.l[a + i]!);
  };

  /**
   * The largest jump from one sample to the next. A click is a jump far bigger than the sound
   * itself ever makes.
   */
  const jump = (x: Float32Array): number =>
    x.reduce((worst, v, i) => (i === 0 ? worst : Math.max(worst, Math.abs(v - x[i - 1]!))), 0);

  test('a browser stops a source at the last time it is told to, which is how a sound is made to make way', async () => {
    const stopped = await page.evaluate(async (rate) => {
      const ctx = new OfflineAudioContext(1, rate * 4, rate);
      const source = ctx.createOscillator();
      source.connect(ctx.destination);
      source.start(0);
      source.stop(3);
      source.stop(1);
      const samples = (await ctx.startRendering()).getChannelData(0);
      let last = -1;
      samples.forEach((v, i) => {
        if (Math.abs(v) > 1e-6) last = i;
      });
      return (last + 1) / rate;
    }, RATE);
    expect(stopped, 'the second stop took the place of the first').toBeLessThan(1.05);
  });

  test('a sound that is let go to make room is gone, and nothing of it is left to be heard', async () => {
    // A pad held for four seconds, and a twinkle asked for in the middle of it. With room for both
    // the pad rings on. With room for one, the pad goes.
    const calls: Call[] = [note('pad', 60, { seconds: 4 }, 0.1), fx('twinkle', {}, 1.2)];
    const roomy = await hear(calls, 6, { live: true });
    const tight = await hear(calls, 6, { live: true, budget: 1 });
    expect(level(roomy, 3.4, 4.4), 'the pad rings on when there is room').toBeGreaterThan(-45);
    expect(level(tight, 3.4, 4.4), 'and is gone when there is not').toBeLessThan(level(roomy, 3.4, 4.4) - 50);
  });

  test('a sound that is let go to make room goes down as a sound does and does not click', async () => {
    // What the flute added to the mix, from just before it was let go to just after, is the flute
    // itself going quiet. It may change from one sample to the next no more than the flute does
    // while it sounds. A flute stopped on the spot jumps.
    const calls: Call[] = [note('flute', 72, { seconds: 3 }, 0.1), fx('tap', {}, 1.2)];
    const roomy = await hear(calls, 6, { live: true });
    const tight = await hear(calls, 6, { live: true, budget: 1 });
    const flute = taken(roomy, tight, 0.95, 1.15);
    const itself = roomy.l.subarray(Math.round(0.95 * RATE), Math.round(1.15 * RATE));
    expect(jump(flute) / jump(itself), 'the largest jump of what went, against the largest of the sound').toBeLessThan(
      2.5,
    );
  });

  test('a note the player asks for while a crowd of sounds is sounding is heard, as the ones with least left to ring make room for it', async () => {
    // Sixty twinkles in a third of a second are more than the budget can hold, and the note comes
    // after all of them.
    const crowd: Call[] = [];
    for (let i = 0; i < 60; i++) crowd.push(fx('twinkle', { pitch: i % 9, step: i % 4 }, 0.1 + i * 0.005));
    const alone = await hear(crowd, 4, { live: true, budget: 120 });
    const withNote = await hear([...crowd, note('bell', 84, {}, 0.5)], 4, { live: true, budget: 120 });
    const bell = taken(withNote, alone, 0.52, 1.5);
    const rms = Math.sqrt(bell.reduce((sum, v) => sum + v * v, 0) / bell.length);
    expect(20 * Math.log10(rms), 'what the note added to the crowd').toBeGreaterThan(-45);
  });
});
