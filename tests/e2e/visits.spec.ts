import { expect, type Page, test } from '@playwright/test';
import { BOOT_MS, befriendLeaf, closeParent, freeze, goTo, openGame, openParent, play } from './helpers';

/**
 * The three ways to open the game. A new device carries on with the saved world. Starting from
 * scratch, which is a switch on the start screen and under Play, gives a visit that begins again
 * and leaves the player's saved world alone. A look around at ?incognito writes nothing at all.
 */

test.describe('opening the game', () => {
  test.setTimeout(300_000);

  /**
   * What the device holds for the player: the saved world and everything put aside, as the store
   * sees it.
   */
  const onDisk = (page: Page) =>
    page.evaluate(async () => {
      const { store } = window.__ua!;
      const current = await store!.current();
      return {
        snapshot: (current as unknown as { snapshotId: string } | null)?.snapshotId ?? null,
        friends: current?.save.recruited ?? null,
        history: (await store!.history()).length,
        backups: (await store!.backups()).length,
        settings: await store!.settings(),
      };
    });

  const flushed = (page: Page) => page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));

  /**
   * Gives the device the player's saved world, Wildstar and Leaf, and closes the page that played
   * it. The browser used for tests draws in software, so a second page loading beside a playing one
   * can take minutes. One game is open at a time.
   */
  async function savedWorld(page: Page): Promise<void> {
    await openGame(page, 'kept');
    await play(page);
    await freeze(page);
    await befriendLeaf(page);
    await flushed(page);
    expect((await onDisk(page)).friends).toEqual(['wildstar', 'leaf']);
    // Closing the page writes the game once more, so what the device holds is read from the next
    // page, before it does anything.
    await page.close();
  }

  test('a visit starts from the beginning, carries on after a reload, and leaves the saved world as it was', async ({
    page,
    context,
  }) => {
    await savedWorld(page);

    const visit = await context.newPage();
    await openGame(visit, 'fresh');
    const before = await onDisk(visit);
    expect(before.friends).toEqual(['wildstar', 'leaf']);
    expect(
      await visit.evaluate(() => ({
        visit: window.__ua!.visit,
        outcome: window.__ua!.outcome.kind,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ visit: 'fresh', outcome: 'fresh', friends: ['wildstar'] });
    await play(visit);
    await freeze(visit);
    await befriendLeaf(visit);
    await flushed(visit);

    // She found Leaf again, in her own visit, and the saved world did not notice.
    expect(await visit.evaluate(() => window.__ua!.controller.world.persistent.recruited)).toContain('leaf');
    expect(await onDisk(visit)).toEqual(before);

    // A reload of the same page is the same visit, so an update taking over does not send her back
    // to the start.
    await visit.reload();
    await visit.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect(
      await visit.evaluate(() => ({
        outcome: window.__ua!.outcome.kind,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ outcome: 'resume', friends: ['wildstar', 'leaf'] });
    expect(await onDisk(visit)).toEqual(before);
    await visit.close();

    // A new page is a new visit.
    const another = await context.newPage();
    await openGame(another, 'fresh');
    expect(
      await another.evaluate(() => ({
        outcome: window.__ua!.outcome.kind,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ outcome: 'fresh', friends: ['wildstar'] });
    expect(await onDisk(another)).toEqual(before);
  });

  test('a look around says so, writes nothing, and starts again after a reload', async ({ page, context }) => {
    await savedWorld(page);

    const look = await context.newPage();
    await openGame(look, 'incognito');
    const before = await onDisk(look);
    expect(before.friends).toEqual(['wildstar', 'leaf']);
    await expect(look.getByRole('status').filter({ hasText: 'Incognito' })).toBeVisible();
    await play(look);
    await freeze(look);
    await befriendLeaf(look);
    await flushed(look);
    // Even a setting changed during it stays in it.
    await look.evaluate(() => window.__ua!.settings.update({ muted: true, musicVolume: 0.1 }));
    await look.waitForTimeout(900);
    await look.evaluate(() => window.__ua!.settings.flush());

    expect(
      await look.evaluate(() => ({ visit: window.__ua!.visit, noted: sessionStorage.getItem('ua.visit') })),
    ).toEqual({ visit: 'incognito', noted: null });
    expect(await onDisk(look)).toEqual(before);

    await look.reload();
    await look.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect(
      await look.evaluate(() => ({
        outcome: window.__ua!.outcome.kind,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ outcome: 'fresh', friends: ['wildstar'] });
    // The page showed her settings, so the game looked and sounded as it does for her.
    expect(await look.evaluate(() => window.__ua!.settings.get().muted)).toBe(false);
    expect(await onDisk(look)).toEqual(before);
  });

  test('the parent controls say what a visit is, and turning start from scratch off brings back the saved world', async ({
    page,
    context,
  }) => {
    await savedWorld(page);

    // The device is set to start from scratch each time, as a parent does with the switch on the
    // start screen, and the game opens again by it.
    const visit = await context.newPage();
    await openGame(visit, 'setting');
    await visit.evaluate(async () => {
      window.__ua!.settings.update({ startFresh: true });
      await window.__ua!.settings.flush();
    });
    await visit.reload();
    await visit.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    expect(await visit.evaluate(() => window.__ua!.visit)).toBe('fresh');
    await play(visit);
    await openParent(visit);

    await goTo(visit, 'Saving');
    await expect(visit.getByText('Each visit starts from the beginning')).toBeVisible();
    await goTo(visit, 'Recovery');
    await expect(visit.getByText('It is left alone while each visit starts from the beginning')).toBeVisible();
    await expect(visit.getByRole('button', { name: 'Download a copy' })).toBeVisible();
    await expect(visit.getByRole('button', { name: 'Start over' })).toHaveCount(0);

    await goTo(visit, 'Play');
    const toggle = visit.getByRole('switch', { name: /Start from scratch each time/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await visit.evaluate(() => window.__ua!.settings.flush());
    await closeParent(visit);
    expect((await onDisk(visit)).settings.startFresh).toBe(false);
    await visit.close();

    // The next time the game is opened it carries on with the saved world.
    const next = await context.newPage();
    await openGame(next, 'setting');
    expect(
      await next.evaluate(() => ({
        visit: window.__ua!.visit,
        outcome: window.__ua!.outcome.kind,
        friends: window.__ua!.controller.world.persistent.recruited,
      })),
    ).toEqual({ visit: 'kept', outcome: 'resume', friends: ['wildstar', 'leaf'] });
  });
});
