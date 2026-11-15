import { expect, type Page, test } from '@playwright/test';
import { GEM_TABLES, type GemTable, tableOf } from '../../src/content/props';
import { GAP } from '../../src/learning';
import {
  freeze,
  hush,
  keepWord,
  learningOn,
  openGame,
  play,
  SCRATCH,
  shot,
  spotOn,
  standBelow,
  step,
  tapWorld,
  typeWord,
} from './helpers';

async function inTheTreasureHouse(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'treasure-house', spawnId: 'from-garden' }));
  await hush(page);
}

const instanceOf = (page: Page, definitionId: string): Promise<string> =>
  page.evaluate(
    (def) => [...window.__ua!.controller.world.interactables.values()].find((i) => i.definitionId === def)!.instanceId,
    definitionId,
  );

/** A tap on the table of a gem, from a short way below it. */
async function tapTable(page: Page, gem: GemTable): Promise<void> {
  const id = await instanceOf(page, tableOf(gem));
  await standBelow(page, id, 90);
  await tapWorld(page, await spotOn(page, id));
  await step(page, 4);
}

test.describe('the treasure house, with learning on', () => {
  test('stands a table for every gem, in the order of the book', async ({ page }) => {
    await inTheTreasureHouse(page);
    const tables = await page.evaluate(() =>
      [...window.__ua!.controller.world.interactables.values()]
        .filter((i) => i.definitionId.endsWith('-table'))
        .map((i) => ({ def: i.definitionId, x: i.pos.x, y: i.pos.y })),
    );
    expect(tables.map((t) => t.def).sort()).toEqual(GEM_TABLES.map(tableOf).sort());
    const reading = [...tables].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.def);
    expect(reading).toEqual(GEM_TABLES.map(tableOf));
    await shot(page, `${SCRATCH}/treasure-tables.png`);
  });

  test('asks for the gem on the table the player tapped, and never for one that is on another table', async ({
    page,
  }) => {
    await inTheTreasureHouse(page);
    // The shortest time between two cards, so the second tap is not held back by the pacing a
    // parent has chosen.
    await learningOn(page, { ask: 'often' });

    await tapTable(page, 'ring');
    await expect(page.getByRole('dialog', { name: 'Spell ring' })).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `${SCRATCH}/treasure-ring-card.png`);
    await typeWord(page, 'ring');
    await keepWord(page);
    expect(await page.evaluate(() => window.__ua!.learner.get().words.ring?.spell?.done)).toBe(1);

    await page.waitForTimeout(GAP.often + 500);
    await tapTable(page, 'opal');
    await expect(page.getByRole('dialog', { name: 'Spell opal' })).toBeVisible();
    await typeWord(page, 'opal');
    await keepWord(page);
    expect(await page.evaluate(() => Object.keys(window.__ua!.learner.get().words).sort())).toEqual(['opal', 'ring']);
  });

  test('does not ask again for a gem the player has just spelled', async ({ page }) => {
    await inTheTreasureHouse(page);
    await learningOn(page, { ask: 'often' });
    await tapTable(page, 'jade');
    await expect(page.getByRole('dialog', { name: 'Spell jade' })).toBeVisible();
    await typeWord(page, 'jade');
    await keepWord(page);

    await page.waitForTimeout(GAP.often + 500);
    await tapTable(page, 'jade');
    await page.waitForTimeout(1500);
    await expect(page.locator('.spell')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
