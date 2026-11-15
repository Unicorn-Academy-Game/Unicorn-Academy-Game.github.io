import { expect, type Page, test } from '@playwright/test';
import { PROP_DEFS } from '../../src/content/props';
import {
  fingerOn,
  freeze,
  handBack,
  hush,
  inThePlayground,
  mapId,
  newWatch,
  openGame,
  play,
  SCRATCH,
  shot,
  standBeside,
  step,
  tapWorld,
  untilArrived,
  untilDelighted,
  walkThrough,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };

/** Every toy of the playground, by the name its map gives it. */
const TOYS = [
  'gem-fountain-1',
  'slide-1',
  'balloons-1',
  'balloons-2',
  'balloons-3',
  'fireworks-1',
  'fireworks-2',
  'fireworks-3',
  'mushroom-1',
  'mushroom-2',
  'mushroom-3',
  'cannon-1',
  'cannon-2',
  'bubbles-1',
  'popper-1',
  'popper-2',
  'morph-1',
  'morph-2',
  'frog-pond-1',
] as const;
/** The ones worth a picture while they are playing. */
const PICTURES = new Set([
  'gem-fountain-1',
  'slide-1',
  'balloons-1',
  'fireworks-1',
  'mushroom-2',
  'cannon-1',
  'bubbles-1',
  'popper-1',
  'morph-1',
  'frog-pond-1',
]);

const liveEffects = (page: Page): Promise<number> => page.evaluate(() => window.__ua!.controller.world.effects.length);

test.describe('the playground', () => {
  test('answers a tap on every toy with something to see, and saves nothing', async ({ page }) => {
    // Most of the toys open a game of their own, and each is opened and closed in turn.
    test.setTimeout(420_000);
    await page.setViewportSize(PHONE);
    await inThePlayground(page);
    await shot(page, `${SCRATCH}/playground-arrival.png`);
    for (const name of TOYS) {
      const id = `playground/${name}`;
      await standBeside(page, id);
      await step(page, 2);
      await tapWorld(page, await fingerOn(page, id));
      await untilDelighted(page, id);
      expect(await liveEffects(page), name).toBeGreaterThan(0);
      if (PICTURES.has(name)) {
        await step(
          page,
          name === 'fireworks-1'
            ? 0.7
            : name === 'cannon-1'
              ? 0.5
              : name === 'slide-1'
                ? 0.6
                : name === 'popper-1'
                  ? 0.8
                  : 0.35,
        );
        await shot(page, `${SCRATCH}/playground-${name}.png`);
      }
      await step(page, 4);
      // A toy that has a game of its own gives the whole screen to it. She is done with it before
      // she goes on to the next toy.
      const definition = await page.evaluate(
        (i) => window.__ua!.controller.world.interactables.get(i)!.definitionId,
        id,
      );
      if (PROP_DEFS[definition]?.tap === 'minigame') await handBack(page, id);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(window.__ua!.controller.world.persistent.props).filter((p) => p.startsWith('playground/')),
      ),
      'saved props',
    ).toEqual([]);
  });

  test('is entered through the rainbow gate and left the same way', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openGame(page);
    await play(page);
    await freeze(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-playground' }));
    await hush(page);
    await step(page, 1.5);
    await shot(page, `${SCRATCH}/playground-garden-gate.png`);
    const watch = newWatch();
    await walkThrough(page, 'playground', watch);
    expect(await mapId(page)).toBe('playground');
    await untilArrived(page, 'playground');
    await step(page, 1.5);
    await walkThrough(page, 'palace-garden', watch);
    expect(await mapId(page)).toBe('palace-garden');
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
