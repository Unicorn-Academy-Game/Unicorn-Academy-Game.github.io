import { expect, type Page, test } from '@playwright/test';
import { isFree, isWonder, WONDERS } from '../../src/content/wonders';
import { builtWonders } from '../../src/wonder/registry';
import { openGame, PATIENCE, play, SCRATCH, SILK, shot, untilArrived, watchConsole, watchScene } from './helpers';

// Every visit here is on a screen of twice the pixels, so a stage that stops at one is told from
// one that does not.
test.use({ deviceScaleFactor: 2 });

interface Drawn {
  readonly profile: string;
  readonly quality: number;
  /** Pixels of the canvas for each CSS pixel of it. */
  readonly ratio: number;
  /**
   * The share of the picture that is not black, from a grid of spots. A game that drew nothing is
   * 0.
   */
  readonly lit: number;
}

const open = (page: Page, game: string, look: string): Promise<void> =>
  page.evaluate(({ game, look }) => window.__ua!.wonders.open({ game: game as never, look, at: { x: 300, y: 180 } }), {
    game,
    look,
  });

async function opened(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__ua!.wonders.state.where), {
      message: 'the picture opening',
      timeout: 30_000,
    })
    .toBe('open');
}

const drawn = (page: Page): Promise<Drawn> =>
  page.evaluate(() => {
    const { stage } = window.__ua!.wonders.inside!;
    const canvas = document.querySelector<HTMLCanvasElement>('.wonder-canvas')!;
    // The picture shrunk to 16 by 9, so it is read once and the game's own canvas is never read
    // back.
    const probe = document.createElement('canvas');
    probe.width = 16;
    probe.height = 9;
    const g = probe.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(canvas, 0, 0, 16, 9);
    const spots = g.getImageData(0, 0, 16, 9).data;
    let lit = 0;
    for (let i = 0; i < spots.length; i += 4) if (Math.max(spots[i]!, spots[i + 1]!, spots[i + 2]!) > 12) lit++;
    return {
      profile: document.documentElement.dataset.profile ?? '',
      quality: stage.quality,
      ratio: canvas.width / canvas.clientWidth,
      lit: lit / (spots.length / 4),
    };
  });

/** Runs the game's own clock on until it is in the phase, a half second of its time at a time. */
async function until(page: Page, phase: string, seconds: number): Promise<void> {
  for (let waited = 0; waited < seconds; waited += 0.5) {
    if ((await page.evaluate(() => window.__ua!.wonders.state.phase)) === phase) return;
    await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(0.5));
  }
  expect(
    await page.evaluate(() => window.__ua!.wonders.state.phase),
    `the game to reach ${phase} in ${seconds} seconds of its own time`,
  ).toBe(phase);
}

async function close(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

test.describe('on an ordinary device', () => {
  test('a game starts at the highest quality, at twice the pixels', async ({ page }) => {
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    await open(page, 'sparkle-sky', 'red');
    await opened(page);
    expect(await drawn(page)).toMatchObject({ profile: 'standard', quality: 2, ratio: 2 });
    await close(page);
    expect(noise).toEqual([]);
  });
});

test.describe('on a Fire tablet', () => {
  test.use({ userAgent: SILK });

  test('every game starts at the lowest quality, draws one pixel for each CSS pixel, and plays through its finale', async ({
    page,
  }) => {
    // One load, and then every game from its opening to its finale in a browser that draws in
    // software.
    test.setTimeout(480_000);
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    for (const game of builtWonders().filter(isWonder)) {
      await test.step(game, async () => {
        await open(page, game, WONDERS[game].looks[0] ?? 'default');
        await opened(page);
        // The picture counts as open when its own clock says so, and is drawn a frame later, which
        // a busy machine can make a good while.
        await expect
          .poll(async () => (await drawn(page)).lit, { message: `${game} draws a picture`, timeout: 20_000 * PATIENCE })
          .toBeGreaterThan(0.5);
        const start = await drawn(page);
        expect(start, `${game} when it opens`).toMatchObject({ profile: 'low', quality: 0, ratio: 1 });
        await shot(page, `${SCRATCH}/low-${game}-open.png`);

        if (isFree(game)) {
          // A game with nothing to earn has no finale, so it is played for as long as one takes to
          // reach.
          await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(20));
          expect(await page.evaluate(() => window.__ua!.wonders.state.phase), `${game} has no finale`).toBe('play');
        } else {
          await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
          expect(await page.evaluate(() => window.__ua!.wonders.state.phase)).toBe('finale');
          await until(page, 'after', 80);
        }
        const end = await drawn(page);
        expect(end, `${game} after its finale`).toMatchObject({ quality: 0, ratio: 1 });
        expect(end.lit, `${game} still draws a picture`).toBeGreaterThan(0.5);
        await shot(page, `${SCRATCH}/low-${game}-after.png`);
        await close(page);
        // The dancing game leads on to the dance floor once its finale has begun, and the herd is
        // there before the next game opens.
        if (game === 'party-time') await untilArrived(page, 'dance-floor');
      });
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});

test.describe('on a Fire tablet, the scenes that are watched', () => {
  test.use({ userAgent: SILK });

  test('each starts at the lowest quality, draws one pixel for each CSS pixel, draws a picture and closes by itself', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const noise = watchConsole(page);
    await openGame(page);
    await play(page);
    // The friends who stand in the finale are the ones she has found.
    await page.evaluate(() =>
      window.__ua!.controller.world.persistent.recruited.push('leaf', 'glacier', 'river', 'cinder', 'storm'),
    );
    for (const game of builtWonders().filter((id) => !isWonder(id))) {
      await test.step(game, async () => {
        await open(page, game, game === 'statue-postcard' ? 'statue-ember-drake' : 'default');
        await opened(page);
        await page.evaluate(() => window.__ua!.wonders.inside!.stage.step(3));
        const seen = await drawn(page);
        expect(seen, `${game} while it plays`).toMatchObject({ profile: 'low', quality: 0, ratio: 1 });
        expect(seen.lit, `${game} draws a picture`).toBeGreaterThan(0.3);
        await shot(page, `${SCRATCH}/low-${game}.png`);
        await watchScene(page, game, 14);
      });
    }
    // The five friends were put there for the picture only; take them away before the world is
    // checked.
    await page.evaluate(() => {
      const recruited = window.__ua!.controller.world.persistent.recruited;
      recruited.splice(0, recruited.length, ...recruited.filter((id) => id === 'wildstar'));
    });
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
