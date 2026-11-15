import { expect, type Page, test } from '@playwright/test';
import {
  befriend,
  FRIENDS,
  freeze,
  newWatch,
  openGame,
  play,
  SCRATCH,
  shot,
  stepAndLook,
  stepWatching,
  type Watch,
  walkThrough,
  watchConsole,
} from './helpers';

/**
 * The whole herd: all six follow through the trees, the doors and the map changes, and when they
 * stop they do at least three different things at once. The domain tests prove the rules for every
 * subset. This runs the real game, on the real maps, and asks the simulation's own invariant check
 * after every second of game time.
 */

const SIX = ['wildstar', ...FRIENDS].sort();

const herd = (page: Page): Promise<string[]> =>
  page.evaluate(() => Object.keys(window.__ua!.controller.world.unicorns).sort());

/** What each unicorn who is busy with something is doing. */
const activities = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.values(window.__ua!.controller.world.unicorns).flatMap((u) =>
      u.state.kind === 'performing' && u.state.activity ? [u.state.activity] : [],
    ),
  );

/**
 * Runs time with the herd standing, and returns how many different activities were going on at once
 * at the busiest moment. Stops as soon as there are `want` of them.
 */
async function busiest(
  page: Page,
  watch: Watch,
  want: number,
  limit: number,
): Promise<{ most: number; seen: string[] }> {
  let most = 0;
  let seen: string[] = [];
  for (let s = 0; s < limit && most < want; s++) {
    await stepAndLook(page, watch);
    const now = [...new Set(await activities(page))];
    if (now.length > most) ({ most, seen } = { most: now.length, seen: now });
  }
  return { most, seen };
}

/**
 * Runs time with the herd standing, and says the longest run of seconds in which any one of them
 * was trying to get back to the others.
 */
async function longestStray(page: Page, watch: Watch, seconds: number): Promise<number> {
  const run = new Map<string, number>();
  let longest = 0;
  for (let s = 0; s < seconds; s++) {
    await stepAndLook(page, watch);
    const lost = await page.evaluate(() =>
      Object.entries(window.__ua!.controller.world.unicorns).flatMap(([id, u]) =>
        u.state.kind === 'recovering' ? [id] : [],
      ),
    );
    for (const id of [...run.keys()]) if (!lost.includes(id)) run.delete(id);
    for (const id of lost) run.set(id, (run.get(id) ?? 0) + 1);
    longest = Math.max(longest, ...run.values(), 0);
  }
  return longest;
}

test('all six follow through the forest, the doors and the map changes, and stopped, they do different things', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const noise = watchConsole(page);
  const watch = newWatch();

  await openGame(page);
  await play(page);
  await freeze(page);

  await test.step('finds all five friends with a tap each, and every one stays', async () => {
    for (const id of FRIENDS) await befriend(page, id);
    expect(await page.evaluate(() => [...window.__ua!.controller.world.persistent.recruited].sort())).toEqual(SIX);
    expect(await herd(page)).toEqual(SIX);
  });

  await test.step('stopped, at least three of them do different things at once', async () => {
    await stepWatching(page, 6, watch);
    const { most, seen } = await busiest(page, watch, 3, 60);
    test.info().annotations.push({ type: 'activities at once', description: `${most}: ${seen.join(', ')}` });
    expect(most).toBeGreaterThanOrEqual(3);
    await shot(page, `${SCRATCH}/herd-stopped.png`);
  });

  await test.step('walk across the forest to the palace gate, and all six arrive in the garden', async () => {
    await walkThrough(page, 'palace-garden', watch);
    await stepWatching(page, 4, watch);
    expect(await herd(page)).toEqual(SIX);
    await shot(page, `${SCRATCH}/herd-garden.png`);
  });

  await test.step('go into the treasure house, and out again', async () => {
    await walkThrough(page, 'treasure-house', watch);
    await stepWatching(page, 4, watch);
    expect(await herd(page)).toEqual(SIX);
    await shot(page, `${SCRATCH}/herd-treasure-house.png`);
    await walkThrough(page, 'palace-garden', watch);
    await stepWatching(page, 3, watch);
    expect(await herd(page)).toEqual(SIX);
  });

  await test.step('go into the stable, and nobody is stuck in a stall', async () => {
    await walkThrough(page, 'stable', watch);
    const stray = await longestStray(page, watch, 40);
    test.info().annotations.push({ type: 'longest time anyone spent finding her way back', description: `${stray} s` });
    expect(stray).toBeLessThanOrEqual(10);
    expect(await herd(page)).toEqual(SIX);
    await shot(page, `${SCRATCH}/herd-stable.png`);
    await walkThrough(page, 'palace-garden', watch);
    await stepWatching(page, 3, watch);
  });

  await test.step('walk home to the forest, with nobody left behind', async () => {
    await walkThrough(page, 'forest', watch);
    await stepWatching(page, 4, watch);
    expect(await herd(page)).toEqual(SIX);
    await shot(page, `${SCRATCH}/herd-forest-again.png`);
  });

  test.info().annotations.push({
    type: 'farthest any follower was from Wildstar',
    description: `${Math.round(watch.worstLag)} units`,
  });
  // Followers are about 600 units behind at most when they keep to the trail. A stalled one is
  // brought back at 900. Right after a door the last of them is where the herd stood and the leader
  // walks on before she turns to follow, so the farthest is near 990 then (990 or 991 in 15 of 17
  // runs on two trees, 1004 or 1005 in the other two, measured). A follower that is never brought
  // back goes on past this.
  expect(watch.worstLag).toBeLessThan(1100);
  expect(watch.problems).toEqual([]);
  expect(noise).toEqual([]);
});
