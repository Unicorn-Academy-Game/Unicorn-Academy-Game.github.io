import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { freeze, openGame, play, standBelowLoneliest, step, tapWorld } from './helpers';

const SHOTS = 'assets/source/_scratch/life';

test.describe('the creatures of the forest', () => {
  test.setTimeout(300_000);

  test('live in the meadow around her, and a tap on one makes it do something lovely without sending her anywhere', async ({
    page,
  }) => {
    mkdirSync(SHOTS, { recursive: true });
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 2);

    const total = await page.evaluate(() => window.__ua!.controller.world.life.critters.length);
    expect(total).toBeGreaterThan(20);

    // A butterfly or a fairy does not run from her, so one is easy to find and to tap.
    const target = await standBelowLoneliest(page, 'fairy');
    await page.screenshot({ path: `${SHOTS}/forest-start.png` });

    const before = await page.evaluate((id) => {
      const ctl = window.__ua!.controller;
      const c = ctl.world.life.critters.find((x) => x.id === id)!;
      return {
        at: ctl.debugCritterAt(id),
        phase: ctl.world.leader.phase,
        state: c.state.kind,
        leader: { ...ctl.world.unicorns.wildstar!.pos },
      };
    }, target.id);
    expect(before.at, 'the creature was drawn').toBeDefined();

    await tapWorld(page, before.at!);
    const after = await page.evaluate((id) => {
      const { world } = window.__ua!.controller;
      const c = world.life.critters.find((x) => x.id === id)!;
      return {
        state: c.state.kind,
        phase: world.leader.phase,
        leader: { ...world.unicorns.wildstar!.pos },
        effects: world.effects.length,
      };
    }, target.id);
    // She twirled, the air shimmered, and Wildstar stayed where she was.
    expect(after.state).toBe('twirl');
    expect(after.effects).toBeGreaterThan(0);
    expect(after.phase).toBe('idle');
    expect(after.leader).toEqual(before.leader);

    await step(page, 0.7);
    await page.screenshot({ path: `${SHOTS}/fairy-dust.png` });
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('stay in their places for a long while, and the game keeps its pace with them all about', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 60);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
