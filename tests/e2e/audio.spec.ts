import { expect, type Page, test } from '@playwright/test';
import {
  audioStats,
  BOOT_MS,
  freeze,
  hush,
  level,
  listenForSounds,
  openGame,
  play,
  soundsHeard,
  step,
  tapMasterBus,
  tapWorld,
  untilSounding,
  watchConsole,
} from './helpers';

/** Decoded audio stays within 48 MiB. */
const DECODED_BUDGET = 48 * 1024 * 1024;
/**
 * Quieter than this at the master volume is silence for these tests; the quietest bed is far above
 * it.
 */
const SILENT = 0.0005;
/** Louder than this means the music and ambience are reaching the output. */
const AUDIBLE = 0.004;

const slow = { timeout: 60_000, intervals: [250, 500, 1000] };

/**
 * What the engine should hold once a crossfade is over: the sheets it has loaded and the two loops
 * that are playing, as a context at its own rate decodes them.
 */
const holding = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const ua = window.__ua!;
    const { sampleRate, sheets, loops } = ua.audio!.stats();
    const { audio } = ua.manifest;
    const playing = new Set([loops.music, loops.ambience].filter((id): id is string => id !== null));
    const at48k =
      sheets.reduce((sum, id) => sum + audio!.sheets[id]!.decodedBytes, 0) +
      [...playing].reduce((sum, id) => sum + audio!.loops[id]!.decodedBytes, 0);
    return (at48k * sampleRate) / 48_000;
  });

/**
 * Goes to a place, waits for its loops to sound, and then for the place that was left to give its
 * own back, which it does when its fade ends. Until then both are held, and a hop inside that time
 * would hold three, which the budget does not promise: with these maps the worst of those is 48.76
 * MiB at 32 kHz, 0.76 over. So the budget is checked for one crossfade at a time, and what is held
 * afterwards must be only what is playing, so that nothing builds up from hop to hop.
 */
async function hop(
  page: Page,
  to: { mapId: string; spawnId: string },
  loops: { music: string; ambience: string },
): Promise<void> {
  await page.evaluate((t) => window.__ua!.controller.travel(t), to);
  await untilSounding(page, loops);
  expect((await audioStats(page)).decodedBytes, 'what two places hold while one fades into the other').toBeLessThan(
    DECODED_BUDGET,
  );
  await expect
    .poll(async () => (await audioStats(page)).decodedBytes / (await holding(page)), {
      message: 'the place that was left to give its loops back',
      ...slow,
    })
    .toBeLessThan(1.01);
}

test.describe('sound', () => {
  test('stays asleep until the first tap, then plays the forest', async ({ page }) => {
    const noise = watchConsole(page);
    await openGame(page);
    const before = await audioStats(page);
    expect(before.state).toBe('idle');
    expect(before.sheets).toEqual([]);
    expect(before.decodedBytes).toBe(0);

    await play(page);
    await untilSounding(page);
    const after = await audioStats(page);
    expect(after.decodedBytes).toBeGreaterThan(0);
    expect(after.decodedBytes).toBeLessThan(DECODED_BUDGET);
    expect(after.sampleRate).toBeGreaterThan(0);
    expect(after.sampleRate).toBeLessThanOrEqual(48_000);
    test.info().annotations.push({
      type: 'audio',
      description: `context ${after.sampleRate} Hz, ${(after.decodedBytes / 1048576).toFixed(1)} MiB decoded`,
    });
    expect(noise).toEqual([]);
  });

  test('music and ambience reach the output, and mute silences them and stays on across a reload', async ({ page }) => {
    await openGame(page);
    await play(page);
    await untilSounding(page);
    await tapMasterBus(page);
    await expect.poll(() => level(page), slow).toBeGreaterThan(AUDIBLE);

    await page
      .getByRole('button', { name: /sound|mute/i })
      .first()
      .click();
    expect((await page.evaluate(() => window.__ua!.settings.get())).muted).toBe(true);
    await expect.poll(() => level(page), slow).toBeLessThan(SILENT);

    // The choice is written a moment after it is made. Wait for it to reach the device's storage,
    // then start the page again.
    await expect.poll(() => page.evaluate(async () => (await window.__ua!.store!.settings()).muted), slow).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect((await page.evaluate(() => window.__ua!.settings.get())).muted).toBe(true);

    await play(page);
    await untilSounding(page);
    await tapMasterBus(page);
    // The loops are playing underneath; mute is what keeps them from the output.
    for (let i = 0; i < 3; i++) expect(await level(page)).toBeLessThan(SILENT);

    await page
      .getByRole('button', { name: /sound|mute/i })
      .first()
      .click();
    await expect.poll(() => level(page), slow).toBeGreaterThan(AUDIBLE);
  });

  test('keeps the band playing and every sound inside its budget while a child hammers the screen, and falls quiet when they stop', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    await untilSounding(page);
    // Eight seconds of four fingers on the toys of a game, each touch a sound, and under them a
    // band that keeps time.
    const flood = await page.evaluate(async () => {
      const ua = window.__ua!;
      const synth = ua.synth!;
      const context = (ua as unknown as { engine: { ctx: AudioContext } }).engine.ctx;
      let created = 0;
      const create = context.createOscillator.bind(context);
      context.createOscillator = () => {
        created++;
        return create();
      };
      const touches = ['pop', 'twinkle', 'coin', 'tap', 'snap'];
      const scale = [0, 2, 4, 7, 9];
      let notes = 0;
      let made = 0;
      let widest = 0;
      for (let i = 0; i < 320; i++) {
        for (let finger = 0; finger < 4; finger++)
          synth.fx(touches[(i + finger) % touches.length]!, { pitch: (i + finger) % 9, step: (i + finger) % 5 });
        if (i % 20 === 0) synth.fx('star', { step: (i / 20) % 5 });
        if (i % 4 === 0) {
          const before = created;
          synth.note('bell', 60 + scale[(i / 4) % 5]! + 12 * (Math.floor(i / 20) % 2), { bus: 'music', delay: 0.1 });
          notes++;
          if (created > before) made++;
        }
        widest = Math.max(widest, synth.nodes);
        await new Promise((done) => setTimeout(done, 25));
      }
      return { notes, made, widest, budget: ua.profile.soundBudget, lost: synth.lost };
    });
    expect(flood.made, `the notes of the band that were made, of ${flood.notes}`).toBe(flood.notes);
    expect(flood.widest, 'the most nodes sounding at once').toBeLessThanOrEqual(flood.budget);
    expect(flood.widest, 'it was a crowd').toBeGreaterThan(flood.budget / 2);
    expect(flood.lost, 'the sounds the browser refused').toBe(0);
    // Every sound that is left ends, and the next one she wins is made, so nothing has been stopped
    // for good.
    await expect.poll(() => page.evaluate(() => window.__ua!.synth!.busy), slow).toBe(0);
    const star = await page.evaluate(() => {
      const ua = window.__ua!;
      const context = (ua as unknown as { engine: { ctx: AudioContext } }).engine.ctx;
      let created = 0;
      const create = context.createOscillator.bind(context);
      context.createOscillator = () => {
        created++;
        return create();
      };
      ua.synth!.fx('star', { step: 3 });
      return { created, busy: ua.synth!.busy };
    });
    expect(star.created, 'oscillators made for the star').toBeGreaterThan(0);
    expect(star.busy, 'sounds alive for it').toBe(1);
    expect(noise).toEqual([]);
  });

  test('lets go of sound when the page is hidden and takes it up again when it is back', async ({ page }) => {
    await openGame(page);
    await play(page);
    await untilSounding(page);
    const visibility = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);

    await visibility('hidden');
    await expect.poll(async () => (await audioStats(page)).state, slow).toBe('suspended');
    await visibility('visible');
    await expect.poll(async () => (await audioStats(page)).state, slow).toBe('running');
  });

  test('answers a tap and a friend with sound', async ({ page }) => {
    await openGame(page);
    await play(page);
    await untilSounding(page);
    await freeze(page);
    await listenForSounds(page);

    // Open ground a short way from Wildstar.
    const wildstar = await page.evaluate(() => window.__ua!.controller.world.unicorns.wildstar!.pos);
    await step(page, 0.5);
    // A butterfly that drifts over the spot takes the tap, and answers with its own sound.
    await hush(page);
    await tapWorld(page, { x: wildstar.x + 150, y: wildstar.y + 20 });
    expect(await soundsHeard(page)).toContainEqual({ family: 'tap', played: true });
    // Let her arrive, so the walk does not carry on from where the next step puts her.
    await step(page, 4);

    // Leaf: walk up, be greeted, join.
    await page.evaluate(() => {
      const e = window.__ua!.controller.world.map.encounters.find((x) => x.unicornId === 'leaf')!;
      window.__ua!.controller.debugTeleport({ x: e.home.x - 40, y: e.home.y + 100 });
    });
    await step(page, 1.5);
    await hush(page);
    const leaf = await page.evaluate(() => {
      const u = window.__ua!.controller.world.unicorns.leaf!;
      return { x: u.pos.x, y: u.pos.y - 52 };
    });
    await tapWorld(page, leaf);
    await step(page, 14);
    const heard = await soundsHeard(page);
    expect(heard).toContainEqual({ family: 'voice-leaf', played: true });
    expect(heard).toContainEqual({ family: 'recruit', played: true });
    expect(heard.filter((h) => !h.played)).toEqual([]);
  });

  test('changes the music and ambience with the place, and stays inside the memory budget', async ({ page }) => {
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    await untilSounding(page);

    await hop(
      page,
      { mapId: 'palace-garden', spawnId: 'from-forest' },
      { music: 'music-garden', ambience: 'ambience-garden' },
    );
    // Inside, the same song carries on, quieter; only the room's air is new.
    await hop(
      page,
      { mapId: 'treasure-house', spawnId: 'from-garden' },
      { music: 'music-garden', ambience: 'ambience-treasure-room' },
    );
    await hop(
      page,
      { mapId: 'palace-garden', spawnId: 'from-treasure-house' },
      { music: 'music-garden', ambience: 'ambience-garden' },
    );
    await hop(
      page,
      { mapId: 'stable', spawnId: 'from-garden' },
      { music: 'music-garden', ambience: 'ambience-stable-room' },
    );
    expect(noise).toEqual([]);
  });

  test('gives the Spooky Manor a night outside and its own air in each room, with the forest birds beyond the yard', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    await untilSounding(page);

    await hop(
      page,
      { mapId: 'forest', spawnId: 'from-manor' },
      { music: 'music-forest', ambience: 'ambience-manor-yard' },
    );
    await hop(
      page,
      { mapId: 'manor-hall', spawnId: 'from-forest' },
      { music: 'music-garden', ambience: 'ambience-manor-hall' },
    );
    await hop(
      page,
      { mapId: 'manor-upper', spawnId: 'from-lift' },
      { music: 'music-garden', ambience: 'ambience-sky-garden' },
    );
    // Back at the forest's start, far from the yard, the birds are back.
    await hop(page, { mapId: 'forest', spawnId: 'start' }, { music: 'music-forest', ambience: 'ambience-forest' });
    expect(noise).toEqual([]);
  });
});
