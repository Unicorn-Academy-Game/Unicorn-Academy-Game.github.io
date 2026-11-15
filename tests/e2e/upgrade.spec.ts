import { expect, test } from '@playwright/test';
import { silence } from '../../tools/qa/silence';
import { SCRATCH, shot, watchConsole } from './helpers';

/**
 * The saved world and the Spell Book are kept in one database. Version 3 added the book. A window
 * of an older copy of the game can still have version 2 open, and the browser will not upgrade the
 * database until that window lets go. The new window must say what to do while it waits.
 */
test.describe('a window from before the Spell Book is still open', () => {
  test.setTimeout(240_000);

  test('the new window says what to do while it waits, and wakes up once the old one is closed, with the database upgraded', async ({
    page,
    context,
  }) => {
    await silence(context);
    const noise = watchConsole(page);

    // The old window: a page of this origin that is not the game, holding the database at version 2
    // as that release did, and never letting go.
    const old = await context.newPage();
    await old.goto('/icons/icon-192.png');
    await old.evaluate(
      () =>
        new Promise<void>((done, fail) => {
          const open = indexedDB.open('unicorn-academy', 2);
          open.onupgradeneeded = () => {
            const db = open.result;
            db.createObjectStore('currentWorld');
            db.createObjectStore('snapshots', { keyPath: 'snapshotId' }).createIndex('byCreated', 'createdAt');
            db.createObjectStore('sync');
            db.createObjectStore('settings');
            db.createObjectStore('quarantine', { autoIncrement: true });
            db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
          };
          open.onsuccess = () => {
            (window as unknown as { held: IDBDatabase }).held = open.result;
            done();
          };
          open.onerror = () => fail(open.error);
        }),
    );

    await page.goto('/?test&keep');
    const message = page.locator('.loading .message');
    await expect(message).toHaveText(/open in another window/, { timeout: 60_000 });
    await expect(message, 'it says what to do').toHaveText(/Close that one/);
    // It is waiting and not failing: there is nothing to retry, and the game has not begun.
    await expect(page.locator('.loading .retry')).toHaveCount(0);
    await expect(page.locator('.title')).toBeHidden();
    expect(await page.evaluate(() => window.__ua)).toBeUndefined();
    await shot(page, `${SCRATCH}/upgrade-waiting.png`);

    await old.evaluate(() => (window as unknown as { held: IDBDatabase }).held.close());
    await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 120_000 });
    await expect(page.locator('.loading')).toHaveCount(0);

    // The database is at the new version, and the shelf for the player's book is in it.
    const version = await page.evaluate(
      async () => (await indexedDB.databases()).find((d) => d.name === 'unicorn-academy')?.version,
    );
    expect(version).toBe(3);
    expect(await page.evaluate(() => window.__ua!.store!.learner())).toBeUndefined();
    expect(noise).toEqual([]);
  });
});
