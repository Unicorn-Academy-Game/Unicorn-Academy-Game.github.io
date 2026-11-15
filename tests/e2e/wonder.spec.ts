import { expect, type Page, test } from '@playwright/test';
import {
  audioStats,
  fingerOn,
  inThePlayground,
  SCRATCH,
  shot,
  standBeside,
  step,
  stepUntil,
  tapWorld,
} from './helpers';

declare global {
  interface Window {
    __busMeter?: AnalyserNode;
  }
}

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };
const LAUNCHER = 'playground/fireworks-1';

const where = (page: Page): Promise<string> => page.evaluate(() => window.__ua!.wonders.state.where);
const isOpen = (page: Page): Promise<boolean> => page.evaluate(() => window.__ua!.wonders.isOpen);
const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);

/**
 * Walks up to a firework launcher in the playground and taps it, as she does, and waits for the
 * picture to finish opening.
 */
async function openSparkleSky(page: Page): Promise<void> {
  await inThePlayground(page);
  await standBeside(page, LAUNCHER);
  await step(page, 2);
  await tapWorld(page, await fingerOn(page, LAUNCHER));
  await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
  await expect.poll(() => where(page), { message: 'the picture opening', timeout: 20_000 }).toBe('open');
}

/**
 * Starts measuring what is on one of the engine's buses, reaching into its private graph as the
 * master-bus helper does.
 */
const tapBus = (page: Page, bus: 'wonder' | 'effects'): Promise<void> =>
  page.evaluate((name) => {
    const engine = (window.__ua!.audio as unknown as { engine: { ctx: AudioContext; buses: Record<string, GainNode> } })
      .engine;
    const analyser = engine.ctx.createAnalyser();
    analyser.fftSize = 2048;
    engine.buses[name]!.connect(analyser);
    window.__busMeter = analyser;
  }, bus);

/** The loudest short-term level (RMS, 0 to 1) on the bus being measured over about a second. */
const busLevel = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const meter = window.__busMeter!;
    const samples = new Float32Array(meter.fftSize);
    let loudest = 0;
    for (let i = 0; i < 24; i++) {
      meter.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
      await new Promise((done) => setTimeout(done, 40));
    }
    return loudest;
  });

const close = async (page: Page): Promise<void> => {
  await page.locator('.wonder-done').click();
  await expect.poll(() => isOpen(page), { message: 'the picture closing', timeout: 20_000 }).toBe(false);
};

test.describe('a game that opens from a toy', () => {
  test('takes the whole screen from the launcher, lets the world rest, and gives the screen back', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openSparkleSky(page);
    await expect(page.getByRole('dialog', { name: 'Fireworks over the lake' })).toBeVisible();
    // The counter and the exit bubbles step aside, and the buttons in the corner stay.
    await expect(page.locator('.corner')).toBeHidden();
    await expect(page.locator('.hud')).toBeVisible();
    await expect(page.locator('.wonder-stars')).toHaveAttribute('aria-label', '0 of 5 stars');
    await expect(page.locator('.wonder-star')).toHaveCount(5);
    await expect(page.locator('.wonder-done')).toBeVisible();
    await expect(page.locator('.wonder-finish')).toBeHidden();
    await shot(page, `${SCRATCH}/wonder-open.png`);

    // The world is asleep behind it, and does not listen.
    const rest = await page.evaluate(() => ({
      running: window.__ua!.stage.game.loop.running,
      listening: window.__ua!.stage.scene.input.enabled,
      slept: window.__ua!.wonders.state.slept,
    }));
    expect(rest).toEqual({ running: false, listening: false, slept: true });
    const frames = await page.evaluate(() => window.__ua!.stage.game.loop.frame);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__ua!.stage.game.loop.frame), 'frames the world drew while it slept').toBe(
      frames,
    );

    // A tap in the picture is for the game: it must not walk her anywhere.
    const goal = await page.evaluate(() => JSON.stringify(window.__ua!.controller.world.leader.goal));
    await page.mouse.click(400, 160);
    expect(await page.evaluate(() => JSON.stringify(window.__ua!.controller.world.leader.goal))).toBe(goal);

    await close(page);
    const back = await page.evaluate(() => ({
      running: window.__ua!.stage.game.loop.running,
      listening: window.__ua!.stage.scene.input.enabled,
      flag: document.getElementById('ui')!.dataset.wonder ?? null,
    }));
    expect(back).toEqual({ running: true, listening: true, flag: null });
    await expect(page.locator('.corner')).toBeVisible();
    await expect(page.locator('.wonder')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('fills the next star as the player plays, and the fifth begins a finale that ends with a way to play again or to stop', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openSparkleSky(page);
    // Real taps in the sky: each one is a shell.
    for (const [x, y] of [
      [300, 120],
      [420, 90],
      [560, 140],
    ] as const) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
    }
    await expect
      .poll(
        () =>
          page.evaluate(() => window.__ua!.wonders.inside!.wonder.progress + window.__ua!.wonders.inside!.wonder.stars),
        { timeout: 8000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(
            document
              .querySelector<HTMLElement>('.wonder-star:not([data-on="true"])')!
              .style.getPropertyValue('--fill') || '0',
          ),
        ),
      )
      .toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/wonder-play.png`);

    // Five stars: the stars fly to the meter one by one and the finale runs by itself.
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    expect((await stateOf(page)).phase).toBe('finale');
    await expect
      .poll(async () => (await stateOf(page)).lit, { message: 'the five stars lighting', timeout: 15_000 })
      .toBe(5);
    await expect(page.locator('.wonder-star[data-on="true"]')).toHaveCount(5);
    await expect(page.locator('.wonder-stars')).toHaveAttribute('aria-label', '5 of 5 stars');
    await expect(page.locator('.wonder-finish')).toBeHidden();
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(7));
    await shot(page, `${SCRATCH}/wonder-finale.png`);
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(10));
    await expect.poll(async () => (await stateOf(page)).phase).toBe('after');
    const again = page.getByRole('button', { name: 'Play again' });
    const done = page.getByRole('button', { name: 'All done' });
    await expect(again).toBeVisible();
    await expect(done).toBeVisible();
    // The buttons rise in with a little bounce, so the picture waits for them to settle.
    await expect(done).toHaveCSS('opacity', '1');
    await shot(page, `${SCRATCH}/wonder-after.png`);

    await again.click();
    await expect.poll(async () => (await stateOf(page)).phase).toBe('play');
    expect((await stateOf(page)).stars).toBe(0);
    await expect(page.locator('.wonder-star[data-on="true"]')).toHaveCount(0);
    await expect(page.locator('.wonder-stars')).toHaveAttribute('aria-label', '0 of 5 stars');
    await expect(page.locator('.wonder-finish')).toBeHidden();

    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(18));
    await expect(done).toBeVisible();
    await done.click();
    await expect.poll(() => isOpen(page), { timeout: 20_000 }).toBe(false);
    expect(await page.evaluate(() => window.__ua!.stage.game.loop.running)).toBe(true);
  });

  test('makes its own sound and music, and the music of the world steps under it and comes back', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const slow = { timeout: 30_000, intervals: [250, 500, 1000] };
    await inThePlayground(page);
    await expect.poll(async () => (await audioStats(page)).state, slow).toBe('running');
    expect((await audioStats(page)).worldShare).toBe(1);
    await standBeside(page, LAUNCHER);
    await step(page, 2);
    await tapWorld(page, await fingerOn(page, LAUNCHER));
    await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
    await expect.poll(() => where(page), { message: 'the picture opening', timeout: 20_000 }).toBe('open');

    // The world's own music goes down to a small share of what it was, and the game's music is what
    // is playing.
    await expect.poll(async () => (await audioStats(page)).worldShare, slow).toBeLessThan(0.2);
    await expect
      .poll(() => page.evaluate(() => window.__ua!.synth!.busy), { ...slow, message: 'sounds alive in the synth' })
      .toBeGreaterThan(0);
    // The game's music reaches the output on its own bus, which nothing of the world's is on.
    await tapBus(page, 'wonder');
    await expect
      .poll(() => busLevel(page), { ...slow, message: "the game's music on its bus" })
      .toBeGreaterThan(0.0015);
    test.info().annotations.push({
      type: 'level',
      description: `the game's music on its bus: ${(await busLevel(page)).toFixed(4)} RMS`,
    });
    // A touch in the sky makes a shell, which sounds a bit later when it opens, on the bus of what
    // she plays.
    await tapBus(page, 'effects');
    await page.mouse.click(430, 110);
    await expect
      .poll(() => busLevel(page), { ...slow, message: 'the shell on the effects bus' })
      .toBeGreaterThan(0.004);

    await close(page);
    await expect.poll(async () => (await audioStats(page)).worldShare, slow).toBe(1);
    // With the game gone the music that was its own is let go, and the world's is what is heard.
    await expect.poll(() => page.evaluate(() => window.__ua!.synth!.busy), slow).toBe(0);
  });

  test('is left with the Escape key too, and a second tap on the toy while it opens does not open a second game', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await inThePlayground(page);
    await standBeside(page, LAUNCHER);
    await step(page, 2);
    await tapWorld(page, await fingerOn(page, LAUNCHER));
    await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
    // She taps the toy again as the picture is opening, and the key is pressed before it has
    // finished: it is let finish and then closes.
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(page), { message: 'the game closing', timeout: 20_000 }).toBe(false);
    await expect(page.locator('.wonder')).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        running: window.__ua!.stage.game.loop.running,
        listening: window.__ua!.stage.scene.input.enabled,
      })),
    ).toEqual({ running: true, listening: true });
    // And she can open it again, once the toy has finished its own little show. She is standing in
    // front of it now, so the tap is on its upper part.
    await step(page, 4);
    await tapWorld(
      page,
      await page.evaluate((id) => {
        const { hit } = window.__ua!.controller.world.interactables.get(id)!;
        return { x: hit.x + hit.w / 2, y: hit.y + hit.h * 0.3 };
      }, LAUNCHER),
    );
    await stepUntil(page, 'the game to open again', () => window.__ua!.wonders.isOpen, 20);
    await expect.poll(() => where(page), { timeout: 20_000 }).toBe('open');
    await expect(page.locator('.wonder')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(page), { timeout: 20_000 }).toBe(false);
  });

  test('with calm effects opens with a fade and lights its stars without flying them', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await inThePlayground(page);
    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await standBeside(page, LAUNCHER);
    await step(page, 2);
    await tapWorld(page, await fingerOn(page, LAUNCHER));
    await stepUntil(page, 'the game to start opening', () => window.__ua!.wonders.isOpen, 20);
    await expect(page.locator('.wonder')).toHaveAttribute('data-calm', 'true');
    await expect.poll(() => where(page), { timeout: 20_000 }).toBe('open');
    await expect(page.locator('.wonder-iris')).toHaveCount(0);
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    expect((await stateOf(page)).flying).toBe(0);
    await expect(page.locator('.wonder-star[data-on="true"]')).toHaveCount(5);
    await expect(page.locator('.wonder-flyer')).toHaveCount(0);
    await close(page);
  });

  test('keeps the stars clear of the buttons on a narrow screen held upright', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await inThePlayground(page);
    await page.evaluate(() => window.__ua!.wonders.open({ game: 'sparkle-sky', look: 'red', at: { x: 200, y: 600 } }));
    await expect.poll(() => where(page), { timeout: 20_000 }).toBe('open');
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      return { stars: box('.wonder-stars'), done: box('.wonder-done'), hud: box('.hud') };
    });
    const meets = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(meets(boxes.stars, boxes.done), 'stars over the done button').toBe(false);
    expect(meets(boxes.stars, boxes.hud), 'stars over the sound and parent buttons').toBe(false);
    expect(boxes.stars.x).toBeGreaterThanOrEqual(0);
    expect(boxes.stars.x + boxes.stars.w).toBeLessThanOrEqual(390);
    await shot(page, `${SCRATCH}/wonder-portrait.png`);
    await close(page);
  });
});
