import { expect, type Page, test } from '@playwright/test';
import {
  BOOT_MS,
  befriendLeaf,
  bodyOf,
  centreOf,
  freeze,
  openGame,
  play,
  SCRATCH,
  shot,
  standAt,
  standBelow,
  step,
  stepUntil,
  tapWorld,
  untilArrived,
  watchConsole,
} from './helpers';

/**
 * One whole visit with nothing but taps, in the order a child might do it: meet a friend, ask her
 * for magic, walk to the palace, drink at the fountain, go through the treasure house door and open
 * a chest, then close the game and open it again. Time is stepped by hand, so the same visit runs
 * the same way on a slow or a fast machine.
 */

const state = (page: Page, who: string) =>
  page.evaluate((id) => window.__ua!.controller.world.unicorns[id]?.state ?? null, who);

test('a whole visit: a friend, her magic, the palace, a drink, the treasure house, a chest, and a restart', async ({
  page,
}) => {
  test.setTimeout(480_000);
  const noise = watchConsole(page);

  await openGame(page);
  await play(page);
  await freeze(page);

  await test.step('meets Leaf in the forest, and she joins', async () => {
    await befriendLeaf(page);
    // With the leader standing still, the herd drifts into little activities of its own, so there
    // is no single state to wait for.
    await stepUntil(
      page,
      'Leaf to be done greeting and caught up with the herd',
      () =>
        !['greeting', 'unrecruited-idle', 'recovering'].includes(
          window.__ua!.controller.world.unicorns.leaf!.state.kind,
        ),
      25,
    );
  });

  await test.step('asks Leaf for her magic by tapping her', async () => {
    await tapWorld(page, await bodyOf(page, 'leaf'));
    await step(page, 0.4);
    expect(await state(page, 'leaf')).toMatchObject({ kind: 'casting' });
    await shot(page, `${SCRATCH}/visit-cast.png`);
    await stepUntil(
      page,
      'Leaf to finish her spell',
      () => window.__ua!.controller.world.unicorns.leaf!.state.kind !== 'casting',
      8,
    );
  });

  await test.step('walks into the gate to the palace garden, and the herd arrives with her', async () => {
    const gate = await page.evaluate(
      () => window.__ua!.controller.world.map.portals.find((p) => p.to.mapId === 'palace-garden')!.bounds,
    );
    await standAt(page, { x: gate.x - 240, y: gate.y + gate.h / 2 });
    await tapWorld(page, { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 });
    await step(page, 5);
    await untilArrived(page, 'palace-garden');
    await step(page, 1);
    expect(await page.evaluate(() => Object.keys(window.__ua!.controller.world.unicorns).sort())).toEqual([
      'leaf',
      'wildstar',
    ]);
    await shot(page, `${SCRATCH}/visit-garden.png`);
  });

  await test.step('goes to a cup and drinks', async () => {
    await standBelow(page, 'palace-garden/cup-1');
    await tapWorld(page, await centreOf(page, 'palace-garden/cup-1'));
    await stepUntil(page, 'Wildstar to be drinking', () => {
      const s = window.__ua!.controller.world.unicorns.wildstar!.state;
      return s.kind === 'performing' && s.activity === 'drink';
    });
    await step(page, 0.8);
    await shot(page, `${SCRATCH}/visit-drinking.png`);
    await stepUntil(
      page,
      'Wildstar to finish drinking',
      () => window.__ua!.controller.world.unicorns.wildstar!.state.kind === 'leading',
      30,
    );
  });

  await test.step('taps the treasure house door, which opens, and walks in', async () => {
    await standBelow(page, 'palace-garden/treasure-door', 150);
    await tapWorld(page, await centreOf(page, 'palace-garden/treasure-door'));
    await step(page, 1.2);
    await shot(page, `${SCRATCH}/visit-door.png`);
    await step(page, 6);
    await untilArrived(page, 'treasure-house');
    await step(page, 1);
    await shot(page, `${SCRATCH}/visit-treasure-house.png`);
  });

  await test.step('opens a chest', async () => {
    await standBelow(page, 'treasure-house/chest-1');
    await tapWorld(page, await centreOf(page, 'treasure-house/chest-1'));
    await stepUntil(
      page,
      'the chest to be open',
      () => window.__ua!.controller.world.persistent.props['treasure-house/chest-1']?.open === true,
      25,
    );
    await step(page, 0.6);
    await shot(page, `${SCRATCH}/visit-chest-open.png`);
  });

  await test.step('closes the game and opens it again, and all of it is still there', async () => {
    await page.evaluate(() => window.__ua!.saves.flush(window.__ua!.controller.world));
    await page.reload();
    await page.waitForFunction(() => window.__ua !== undefined, undefined, { polling: 250, timeout: BOOT_MS });
    await page.getByRole('button', { name: 'Play' }).waitFor();
    await shot(page, `${SCRATCH}/visit-reloaded-title.png`);
    await play(page);
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
    await freeze(page);
    await step(page, 0.5);
    const after = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      return {
        map: world.map.id,
        recruited: world.persistent.recruited,
        visited: world.persistent.visitedMaps,
        chest: world.persistent.props['treasure-house/chest-1'],
        herd: Object.keys(world.unicorns).sort(),
      };
    });
    expect(after).toEqual({
      map: 'treasure-house',
      recruited: ['wildstar', 'leaf'],
      visited: ['forest', 'palace-garden', 'treasure-house'],
      chest: { kind: 'chest', open: true },
      herd: ['leaf', 'wildstar'],
    });
    await shot(page, `${SCRATCH}/visit-reloaded.png`);
  });

  expect(noise).toEqual([]);
});
