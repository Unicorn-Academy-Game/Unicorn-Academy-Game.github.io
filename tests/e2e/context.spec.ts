import { expect, type Page, test } from '@playwright/test';
import { decodePng } from '../../tools/lib/png';
import { befriendLeaf, freeze, openGame, play, SCRATCH, shot, step, watchConsole } from './helpers';

interface Picture {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * What the game itself has drawn. A picture of the canvas, taken by the page, takes in what the
 * page lays over it, and a note such as "Leaf joined you!" is there for a few seconds of real time,
 * so a quick run would find it in one picture and not in the next.
 */
const picture = async (page: Page): Promise<Picture> =>
  decodePng(
    new Uint8Array(await page.locator('#game canvas').screenshot({ style: '#ui { display: none !important }' })),
  );

/** The share of pixels that differ clearly between two pictures of the same size. */
function changed(a: Picture, b: Picture): number {
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.max(
        Math.abs(a.data[i]! - b.data[i]!),
        Math.abs(a.data[i + 1]! - b.data[i + 1]!),
        Math.abs(a.data[i + 2]! - b.data[i + 2]!),
      ) > 24
    )
      count++;
  }
  return count / (a.data.length / 4);
}

/**
 * The share of pixels that are within a few levels of one color, for telling a drawn scene from an
 * empty stage.
 */
function sameColor(p: Picture): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < p.data.length; i += 4) {
    const key = ((p.data[i]! >> 3) << 10) | ((p.data[i + 1]! >> 3) << 5) | (p.data[i + 2]! >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / (p.data.length / 4);
}

const memberships = (page: Page) =>
  page.evaluate(() => {
    const { world } = window.__ua!.controller;
    return {
      recruited: [...world.persistent.recruited].sort(),
      herd: Object.keys(world.unicorns).sort(),
      at: world.unicorns.wildstar!.pos,
    };
  });

test('the picture comes back when the graphics context is lost and restored, and no friend is lost with it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const noise = watchConsole(page);
  await openGame(page);
  await play(page);
  await freeze(page);
  await befriendLeaf(page);
  await step(page, 4);
  const worldBefore = await memberships(page);
  const before = await picture(page);
  expect(sameColor(before), 'a scene is on screen to begin with').toBeLessThan(0.5);

  // A lost context hands out no extensions, so the one that restores it is kept from before.
  type Lever = { loseContext(): void; restoreContext(): void };
  await page.evaluate(() => {
    const lever = window.__ua!.stage.game.renderer.gl.getExtension('WEBGL_lose_context') as Lever;
    (window as unknown as { __lever: Lever }).__lever = lever;
    lever.loseContext();
  });
  await expect.poll(() => page.evaluate(() => window.__ua!.stage.game.renderer.gl.isContextLost())).toBe(true);

  // The game carries on underneath, and the parent's button still answers.
  await step(page, 2);
  await page.getByRole('button', { name: 'Sound' }).click();
  await page.getByRole('button', { name: 'Sound' }).click();
  expect(await memberships(page)).toMatchObject({ recruited: worldBefore.recruited, herd: worldBefore.herd });

  await page.evaluate(() => (window as unknown as { __lever: Lever }).__lever.restoreContext());
  await expect
    .poll(
      () =>
        page.evaluate(
          () => !window.__ua!.stage.game.renderer.gl.isContextLost() && !window.__ua!.stage.game.renderer.contextLost,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await step(page, 1);

  const after = await picture(page);
  await shot(page, `${SCRATCH}/context-restored.png`);
  expect(sameColor(after), 'the scene is drawn again, not an empty stage').toBeLessThan(0.5);
  expect(changed(before, after), 'the restored picture is the scene that was there').toBeLessThan(0.1);
  expect(await memberships(page)).toMatchObject({ recruited: worldBefore.recruited, herd: worldBefore.herd });
  // The engine says so, once each, when the context goes and when it returns. Nothing else is
  // expected.
  expect(noise.filter((line) => !/WebGL Context (lost|restored)/.test(line))).toEqual([]);
});
