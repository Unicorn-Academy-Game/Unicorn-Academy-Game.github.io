import { expect, type Page, test } from '@playwright/test';
import { learningOn, level, openGame, play, tapMasterBus, untilSounding } from './helpers';

/**
 * A test browser must not be heard. Playwright mutes its Chromium, and its WebKit plays through the
 * speakers of whoever runs the tests, so `openGame` shuts the output of every page it opens
 * (`tools/qa/silence.ts`). These tests look at that from inside a real browser: the game is making
 * sound, and none of it gets past a gain of zero in front of the speakers.
 */

/** Louder than this at the master volume means the game is making sound. */
const AUDIBLE = 0.004;

const slow = { timeout: 60_000, intervals: [250, 500, 1000] };

/**
 * What stands in front of the speakers, and the loudest sample that gets through it in about half a
 * second. The meter is hung on the far side of the gate, so it hears what the speakers would.
 */
const atTheSpeakers = (page: Page): Promise<{ gain: number | null; loudest: number; gated: number }> =>
  page.evaluate(async () => {
    const context = (window.__ua!.audio as unknown as { engine: { ctx: AudioContext } }).engine.ctx;
    const gate = context.destination;
    const meter = context.createAnalyser();
    gate.connect(meter);
    const samples = new Float32Array(meter.fftSize);
    let loudest = 0;
    for (let i = 0; i < 12; i++) {
      meter.getFloatTimeDomainData(samples);
      for (const v of samples) loudest = Math.max(loudest, Math.abs(v));
      await new Promise((done) => setTimeout(done, 40));
    }
    return { gain: gate instanceof GainNode ? gate.gain.value : null, loudest, gated: window.__silence?.gated ?? 0 };
  });

test.describe('a test browser that could be heard', () => {
  test('lets none of the game out to the speakers while the game is making it', async ({ page }) => {
    await openGame(page);
    await play(page);
    await untilSounding(page);
    await tapMasterBus(page);
    // The music and the ambience are playing and reach the game's master volume...
    await expect.poll(() => level(page), slow).toBeGreaterThan(AUDIBLE);
    // ...and a gain of zero stands between that and the speakers.
    const out = await atTheSpeakers(page);
    expect(out.gain, 'the speakers are behind a gain of zero').toBe(0);
    expect(out.gated).toBeGreaterThanOrEqual(1);
    expect(out.loudest, 'nothing gets through it').toBe(0);
  });

  test('would keep a word from the voice of the device and write it down instead', async ({ page }) => {
    await openGame(page);
    const kept = await page.evaluate(() => {
      // If the browser's own speak is still in place, saying a word would say it aloud, so the test
      // does not say one.
      if (/\[native code\]/.test(Function.prototype.toString.call(window.speechSynthesis.speak))) return null;
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('frog'));
      return { spoken: window.__silence!.spoken, speaking: window.speechSynthesis.speaking };
    });
    expect(kept, "the browser's own speak is in place, so a word would be said aloud").toEqual({
      spoken: ['frog'],
      speaking: false,
    });
  });

  test('says the words with its own recorded voice, through the game and behind the gate, and never asks the device to speak', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await learningOn(page, { say: true });
    expect(await page.evaluate(() => window.__ua!.voice.available), 'the game has a voice').toBe(true);
    expect(await page.evaluate(() => window.__ua!.lessons.practice('frog'))).toBe(true);
    // The card opens and the voice says it: a clip is fetched, decoded, and started into the game's
    // own sound.
    await expect.poll(() => page.evaluate(() => window.__ua!.voice.heard.join(' ')), slow).toContain('open.frog');
    expect(await page.evaluate(() => window.__ua!.voice.stats().started)).toBeGreaterThanOrEqual(1);
    // None of it went to the system voice, and it all stands behind the same gain of zero.
    expect(await page.evaluate(() => window.__silence!.spoken), 'the device was asked to speak').toEqual([]);
    const out = await atTheSpeakers(page);
    expect(out.gain, 'the speakers are behind a gain of zero').toBe(0);
    expect(out.loudest, 'nothing gets through it').toBe(0);
  });
});
