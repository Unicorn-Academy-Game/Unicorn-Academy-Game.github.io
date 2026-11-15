import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { freeze, mapId, openGame, play, standAt, step, stepUntil, untilArrived } from './helpers';

const SHOTS = 'assets/source/_scratch/exits';

/**
 * Opens the garden, where the palace stands and three ways lead out, and stands the herd at a place
 * in it.
 */
async function inGarden(page: Page, at: { x: number; y: number }): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await untilArrived(page, 'palace-garden');
  await standAt(page, at);
  await step(page, 0.4);
}

/** How wide the screen shows of the world now, in world units. */
const seen = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const c = window.__ua!.controller;
    return c.toWorld({ x: window.innerWidth, y: 0 }).x - c.toWorld({ x: 0, y: 0 }).x;
  });

/**
 * Where along the top edge of the screen, in CSS pixels from the left, the picture is ground and
 * not sky. It reads the top row of a screenshot between the finder and the buttons, which is where
 * a camera that looks high would show what lies above the sky.
 */
async function groundAlongTheTop(page: Page): Promise<number[]> {
  const width = page.viewportSize()!.width;
  const from = Math.round(width * 0.4);
  const png = await page.screenshot({ clip: { x: from, y: 0, width: Math.round(width * 0.2), height: 2 } });
  return page.evaluate(
    async ({ data, from, width }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const probe = document.createElement('canvas');
      probe.width = bitmap.width;
      probe.height = 1;
      const g = probe.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bitmap, 0, 0);
      const row = g.getImageData(0, 0, bitmap.width, 1).data;
      const found: number[] = [];
      for (let x = 0; x < bitmap.width; x += 4) {
        const [r, green, b] = [row[x * 4]!, row[x * 4 + 1]!, row[x * 4 + 2]!];
        // Sky is bluer than it is green, and cloud is white. Grass is greener than it is blue or
        // red.
        if (green > b + 20 && green > r + 20) found.push(Math.round(from + (x * width) / bitmap.width));
      }
      return found;
    },
    { data: png.toString('base64'), from, width: Math.round(width * 0.2) },
  );
}

test.describe('finding the way out', () => {
  test.setTimeout(300_000);

  test('a bubble on the edge of the screen points to the nearest ways out that are out of sight, three at most, and tapping it takes her there', async ({
    page,
  }) => {
    mkdirSync(SHOTS, { recursive: true });
    // Mid-garden, where all five ways out are far beyond a phone's screen. Three bubbles are
    // enough, for the nearest three.
    await inGarden(page, { x: 1536, y: 1640 });
    const bubbles = page.locator('.guide .exit');
    await expect(bubbles).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Go to the throne room' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to the stable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to the treasure house' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to the forest' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/bubbles-garden.png` });

    // Toward the forest, its bubble comes in and the farthest of the others goes.
    await standAt(page, { x: 900, y: 1700 });
    await step(page, 0.5);
    await expect(bubbles).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Go to the forest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to the stable' })).toHaveCount(0);

    // Beside one of them, its own bubble is not needed: she can see the place itself.
    await standAt(page, { x: 330, y: 1800 });
    await step(page, 0.5);
    await expect(page.getByRole('button', { name: 'Go to the forest' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Go to the treasure house' })).toBeVisible();

    // Every bubble is on the screen, clear of its edges, and big enough for a small finger.
    const size = page.viewportSize()!;
    for (const b of await bubbles.all()) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    }

    // A tap on the bubble walks Wildstar to the door, and through it.
    const before = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    await page.getByRole('button', { name: 'Go to the treasure house' }).click();
    expect(await page.evaluate(() => window.__ua!.controller.world.leader.phase)).not.toBe('idle');
    await stepUntil(
      page,
      'she had gone through the door',
      () => window.__ua!.controller.world.map.id !== 'palace-garden' || window.__ua!.controller.phase !== 'playing',
      90,
    );
    await untilArrived(page, 'treasure-house');
    expect(await mapId(page)).toBe('treasure-house');
    expect(before.x).toBeLessThan(600);
    // Inside, the way back is the one door, and it shows when it is out of sight and not when it is
    // in view.
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('a bubble that is fading away takes no tap, so a tap meant for the world under it is not turned into a walk to the door', async ({
    page,
  }) => {
    await inGarden(page, { x: 1536, y: 1640 });
    // Looks at each bubble in the moment it starts to fade, which is the first of the quarter
    // second it stays on the page.
    const fading = await page.evaluateHandle(() => {
      const seen: { name: string; taken: boolean }[] = [];
      new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target as HTMLElement;
          if (el.dataset.leaving !== 'true') continue;
          const box = el.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          seen.push({ name: el.getAttribute('aria-label') ?? '', taken: hit !== null && el.contains(hit) });
        }
      }).observe(document.querySelector('.guide')!, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-leaving'],
      });
      return seen;
    });
    // Toward the forest, the stable is no longer one of the three nearest ways out, so its bubble
    // fades.
    await standAt(page, { x: 900, y: 1700 });
    await step(page, 0.5);
    const seen = await fading.jsonValue();
    expect(
      seen.map((s) => s.name),
      'a bubble faded, so this looked at something',
    ).toContain('Go to the stable');
    expect(
      seen.filter((s) => s.taken).map((s) => s.name),
      'bubbles a finger would still land on while they fade',
    ).toEqual([]);
  });

  test('shows none on the title, and the garden gate has its bubble once play begins', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('.guide .exit')).toHaveCount(0);
    await play(page);
    await freeze(page);
    await step(page, 0.5);
    // In the forest at the start, the garden gate is far away: it has a bubble.
    await expect(page.getByRole('button', { name: 'Go to the garden' })).toBeVisible();
  });
});

test.describe('standing back to see the whole palace', () => {
  test.setTimeout(300_000);

  test('a button near the palace pulls the camera back until all of it shows, and a touch brings it home', async ({
    page,
  }) => {
    mkdirSync(SHOTS, { recursive: true });
    await inGarden(page, { x: 1536, y: 1032 });
    const button = page.getByRole('button', { name: 'See the whole palace' });
    await expect(button).toBeVisible();
    const home = await seen(page);
    const leaderBefore = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));

    await button.click();
    await step(page, 2);
    await expect(page.getByRole('button', { name: 'Go back to Wildstar' })).toBeVisible();
    expect(await page.evaluate(() => window.__ua!.controller.surveyed)).toBeCloseTo(1, 2);
    const wide = await seen(page);
    // How far it goes back depends on the screen, because the palace's height is what has to fit:
    // 2.1 times what the phone shows at home, and 1.5 times on a desktop. A quarter more is the
    // least that counts as going back.
    expect(wide, 'the camera went back').toBeGreaterThan(home * 1.25);
    // All of it is in view: the corners of the palace's area are on the screen.
    const whole = await page.evaluate(() => {
      const c = window.__ua!.controller as unknown as {
        compiled: { render: { vista: { whole: { area: { x: number; y: number; w: number; h: number } } } } };
      };
      const a = c.compiled.render.vista.whole.area;
      return {
        a,
        tl: window.__ua!.controller.toScreen({ x: a.x, y: a.y }),
        br: window.__ua!.controller.toScreen({ x: a.x + a.w, y: a.y + a.h }),
      };
    });
    const size = page.viewportSize()!;
    expect(whole.tl.x).toBeGreaterThanOrEqual(0);
    expect(whole.tl.y).toBeGreaterThanOrEqual(0);
    expect(whole.br.x).toBeLessThanOrEqual(size.width);
    expect(whole.br.y).toBeLessThanOrEqual(size.height);
    // Above the palace there is sky right up to the edge of the screen, and no band of grass over
    // the top of it.
    expect(
      await groundAlongTheTop(page),
      'places along the top edge of the screen where grass shows above the sky',
    ).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/survey-palace.png` });

    // A touch on the ground only brings the camera home. It does not send her to a place picked
    // from far away.
    await page.mouse.click(size.width / 2, size.height * 0.8);
    await step(page, 2);
    expect(await page.evaluate(() => window.__ua!.controller.surveyed)).toBe(0);
    expect(Math.abs((await seen(page)) - home)).toBeLessThan(2);
    const leaderAfter = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    expect(leaderAfter).toEqual(leaderBefore);
    await expect(button).toBeVisible();

    // The same button goes both ways.
    await button.click();
    await step(page, 2);
    await page.getByRole('button', { name: 'Go back to Wildstar' }).click();
    await step(page, 2);
    expect(await page.evaluate(() => window.__ua!.controller.surveyed)).toBe(0);
  });

  test('the button is only there near the palace', async ({ page }) => {
    await inGarden(page, { x: 2500, y: 1700 });
    await expect(page.getByRole('button', { name: 'See the whole palace' })).toHaveCount(0);
    await standAt(page, { x: 1536, y: 1250 });
    await step(page, 0.5);
    await expect(page.getByRole('button', { name: 'See the whole palace' })).toBeVisible();
  });
});
