import { expect, type Page, test } from '@playwright/test';
import { BOOT_MS, bodyOf, freeze, hush, openGame, play, SCRATCH, shot, step, tapWorld } from './helpers';

test.describe('the forest', () => {
  test('starts on the title, plays, and shows the controls', async ({ page }) => {
    await openGame(page);
    await shot(page, `${SCRATCH}/title.png`);
    await play(page);
    await expect(page.getByRole('button', { name: /sound|mute/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^parent controls/i }).first()).toBeVisible();
    await shot(page, `${SCRATCH}/playing.png`);
  });

  test('tapping a friend greets her and she joins the herd, and the save has her in it', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    // Stand a short walk south of Leaf, let the camera settle, then tap her.
    await page.evaluate(() => {
      const e = window.__ua!.controller.world.map.encounters.find((x) => x.unicornId === 'leaf')!;
      window.__ua!.controller.debugTeleport({ x: e.home.x - 40, y: e.home.y + 100 });
    });
    await step(page, 1.5);
    await shot(page, `${SCRATCH}/near-leaf.png`);
    await hush(page);
    await tapWorld(page, await bodyOf(page, 'leaf'));
    await step(page, 0.7);
    await shot(page, `${SCRATCH}/greeting-1.png`);
    await step(page, 14);
    expect(await recruited(page)).toContain('leaf');
    await shot(page, `${SCRATCH}/greeting-2.png`);
    await expect.poll(() => savedRecruits(page), { timeout: 15_000 }).toContain('leaf');
  });

  test('a recruited friend is still there after a reload', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await page.evaluate(() => {
      const e = window.__ua!.controller.world.map.encounters.find((x) => x.unicornId === 'leaf')!;
      window.__ua!.controller.debugTeleport({ x: e.home.x - 40, y: e.home.y + 100 });
    });
    await step(page, 1.5);
    await hush(page);
    await tapWorld(page, await bodyOf(page, 'leaf'));
    await step(page, 14);
    expect(await recruited(page)).toContain('leaf');
    await expect.poll(() => savedRecruits(page), { timeout: 15_000 }).toContain('leaf');

    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    const after = await page.evaluate(() => ({
      recruited: window.__ua!.controller.world.persistent.recruited,
      phase: window.__ua!.controller.phase,
    }));
    expect(after.recruited).toEqual(['wildstar', 'leaf']);
    await shot(page, `${SCRATCH}/after-reload.png`);
  });
});

const recruited = (page: Page) => page.evaluate(() => window.__ua!.controller.world.persistent.recruited);

const savedRecruits = (page: Page) =>
  page.evaluate(async () => (await window.__ua!.store!.current())?.save.recruited ?? []);
