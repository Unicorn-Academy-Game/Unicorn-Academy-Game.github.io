import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { closeParent, freeze, goTo, openGame, openParent, play, SCRATCH, SILK, shot, standAt, step } from './helpers';

// Every visit here is on a screen of twice the pixels, so a profile that stops at one is told from
// one that does not.
test.use({ deviceScaleFactor: 2 });

/**
 * What the game is drawing with, from the page's own words for it: boot puts the profile on `__ua`
 * and on the root element.
 */
interface Look {
  profile: string;
  attribute: string | undefined;
  canvas: { w: number; h: number };
  page: { w: number; h: number };
  multisample: boolean;
  smoothing: boolean;
  ratio: number;
}

const look = (page: Page): Promise<Look> =>
  page.evaluate(() => {
    const ua = window.__ua as unknown as {
      profile: { id: string };
      stage: {
        game: {
          canvas: HTMLCanvasElement;
          config: { smoothPixelArt: boolean };
          renderer: { gl: WebGL2RenderingContext };
        };
      };
    };
    const { canvas, config, renderer } = ua.stage.game;
    return {
      profile: ua.profile.id,
      attribute: document.documentElement.dataset.profile,
      canvas: { w: canvas.width, h: canvas.height },
      page: { w: window.innerWidth, h: window.innerHeight },
      multisample: renderer.gl.getContextAttributes()?.antialias ?? false,
      smoothing: config.smoothPixelArt,
      ratio: window.devicePixelRatio,
    };
  });

/**
 * Writes the parent's low-end choice the way the controls do, and waits until it is on the device.
 */
const choose = (page: Page, choice: 'auto' | 'on' | 'off'): Promise<void> =>
  page.evaluate(async (value) => {
    window.__ua!.settings.update({ lowEnd: value } as never);
    await window.__ua!.settings.flush();
  }, choice);

/**
 * Opens the game in low-end mode, which takes a second opening because the picture is made once.
 */
async function openLow(page: Page): Promise<void> {
  await openGame(page);
  await choose(page, 'on');
  await openGame(page);
  expect((await look(page)).profile).toBe('low');
}

const lowEndGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Low-end mode' });
const choiceNamed = (page: Page, name: string) => lowEndGroup(page).getByRole('radio', { name, exact: true });

/** The blur a layer puts over the game, as the browser works it out. */
const blurOf = (page: Page, selector: string): Promise<string> =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backdropFilter, selector);

/** Takes the herd through an exit to another map, and stops the game once the fade is over. */
async function enter(page: Page, map: string, spawn: string): Promise<void> {
  await page.evaluate(([to, at]) => window.__ua!.controller.travel({ mapId: to!, spawnId: at! }), [
    map,
    spawn,
  ] as const);
  await expect.poll(() => page.evaluate(() => window.__ua!.controller.world.map.id), { timeout: 60_000 }).toBe(map);
  await expect
    .poll(() => page.evaluate(() => window.__ua!.stage.scene.cameras.main.fadeEffect.isRunning), { timeout: 60_000 })
    .toBe(false);
  await freeze(page);
  await step(page, 1);
}

/** Where a share of the map's width and height is, in world units. */
const shareOf = (page: Page, across: number, down: number) =>
  page.evaluate(
    ([fx, fy]) => {
      const { widthTiles, heightTiles } = (
        window.__ua!.controller as unknown as { compiled: { logic: { widthTiles: number; heightTiles: number } } }
      ).compiled.logic;
      return { x: widthTiles * 64 * fx!, y: heightTiles * 64 * fy! };
    },
    [across, down] as const,
  );

/**
 * A place on the map the herd can stand, as near as there is to a share of the map's width and
 * height.
 */
const spotOn = async (page: Page, across: number, down: number) => {
  const wanted = await shareOf(page, across, down);
  return page.evaluate((at) => window.__ua!.controller.world.nav.freePointNear(at, [], 0, 640) ?? at, wanted);
};

/**
 * Puts the camera on a share of the map's width and height and leaves the herd where she came in. A
 * leader put at the corner of a room is on ground she cannot stand on, and is moved off it into the
 * doorway that is nearest, which takes her through it and fades the picture out while the test is
 * still drawing it. Where the camera looks is what the comparison is about, and not where she
 * stands.
 */
async function lookAt(page: Page, across: number, down: number): Promise<void> {
  const at = await shareOf(page, across, down);
  await page.evaluate(
    (to) =>
      (window.__ua!.controller as unknown as { debugLook(at: { x: number; y: number } | null): void }).debugLook(to),
    at,
  );
  await step(page, 0.1);
}

/** Hands the camera back to the herd. */
const lookBack = (page: Page): Promise<void> =>
  page.evaluate(() => (window.__ua!.controller as unknown as { debugLook(at: null): void }).debugLook(null));

test('a parent can turn low-end mode on, and the next opening draws lighter', async ({ page, context }) => {
  // Two openings, each a full load of the game in a browser that draws in software.
  test.setTimeout(300_000);
  await openGame(page);
  const before = await look(page);
  expect(before).toMatchObject({
    profile: 'standard',
    attribute: 'standard',
    multisample: true,
    smoothing: true,
    ratio: 2,
  });
  expect(before.canvas).toEqual({ w: before.page.w * 2, h: before.page.h * 2 });

  await play(page);
  await openParent(page);
  expect(await blurOf(page, '.parent')).toBe('blur(4px)');
  await goTo(page, 'Play');
  await expect(choiceNamed(page, 'Automatic')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Right now the game is not in low-end mode.')).toBeVisible();
  await choiceNamed(page, 'On').click();
  await expect(choiceNamed(page, 'On')).toHaveAttribute('aria-checked', 'true');
  await expect(choiceNamed(page, 'Automatic')).toHaveAttribute('aria-checked', 'false');
  // The picture is made once, so this opening carries on as it was and says so.
  expect((await look(page)).profile).toBe('standard');
  await expect(page.getByText('A change takes effect the next time the game is opened.').last()).toBeVisible();
  await shot(page, `${SCRATCH}/low-end-setting.png`);
  await closeParent(page);
  await page.evaluate(() => window.__ua!.settings.flush());
  await page.close();

  const again = await context.newPage();
  await openGame(again);
  const after = await look(again);
  expect(after).toMatchObject({ profile: 'low', attribute: 'low', multisample: false, smoothing: false });
  // One framebuffer pixel for each pixel of the page, where the other opening drew two.
  expect(after.canvas).toEqual(after.page);
  await play(again);
  await openParent(again);
  expect(await blurOf(again, '.parent')).toBe('none');
  await goTo(again, 'Play');
  await expect(choiceNamed(again, 'On')).toHaveAttribute('aria-checked', 'true');
  await expect(again.getByText('Right now the game is in low-end mode.')).toBeVisible();
  await shot(again, `${SCRATCH}/low-end-setting-on.png`);
});

/**
 * Counts every draw call the page makes, and the indices they ask for, from the first line it runs.
 */
async function countDraws(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const drawn = { count: 0, indices: 0 };
    (window as unknown as { __draws: typeof drawn }).__draws = drawn;
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const table = proto as unknown as Record<string, ((...a: unknown[]) => void) | undefined>;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const real = table[name];
        if (!real) continue;
        table[name] = function (this: unknown, ...a: unknown[]): void {
          drawn.count++;
          drawn.indices += Number(a[name.startsWith('drawArrays') ? 2 : 1] ?? 0);
          real.apply(this, a);
        };
      }
    }
  });
}

/**
 * Stands the herd in the middle of the palace garden and draws one frame of it, counting the draw
 * calls and the indices that frame takes.
 */
async function gardenDraws(
  page: Page,
): Promise<{ profile: string; draws: number; indices: number; picturesPerCall: number }> {
  await play(page);
  await freeze(page);
  await enter(page, 'palace-garden', 'from-forest');
  await standAt(page, await spotOn(page, 0.5, 0.5));
  return page.evaluate(() => {
    const ua = window.__ua as unknown as {
      profile: { id: string };
      stage: {
        game: {
          step(time: number, delta: number): void;
          renderer: { renderNodes: { maxParallelTextureUnits: number } };
        };
      };
    };
    const { game } = ua.stage;
    const drawn = (window as unknown as { __draws: { count: number; indices: number } }).__draws;
    const before = { ...drawn };
    game.step(performance.now(), 0);
    return {
      profile: ua.profile.id,
      draws: drawn.count - before.count,
      indices: drawn.indices - before.indices,
      picturesPerCall: game.renderer.renderNodes.maxParallelTextureUnits,
    };
  });
}

test.describe('on a Fire tablet', () => {
  test.use({ userAgent: SILK });

  test('the game draws lighter with nothing chosen, and a parent can turn that off', async ({ page, context }) => {
    test.setTimeout(300_000);
    await openGame(page);
    expect(await page.evaluate(() => (window.__ua!.settings.get() as unknown as { lowEnd: string }).lowEnd)).toBe(
      'auto',
    );
    expect(await look(page)).toMatchObject({ profile: 'low', multisample: false, smoothing: false });
    await choose(page, 'off');
    await page.close();

    const again = await context.newPage();
    await openGame(again);
    expect(await look(again)).toMatchObject({ profile: 'standard', multisample: true, smoothing: true });
  });

  test('the palace garden asks for a third of the pictures, or fewer, that it asks for in standard mode', async ({
    page,
    context,
  }) => {
    // Two openings, each a full load of the game in a browser that draws in software.
    test.setTimeout(400_000);
    await countDraws(context);
    await openGame(page);
    const low = await gardenDraws(page);
    await choose(page, 'off');
    await page.close();

    const again = await context.newPage();
    await openGame(again);
    const standard = await gardenDraws(again);

    expect([low.profile, standard.profile]).toEqual(['low', 'standard']);
    // A Fire tablet's browser has the engine put one picture in each draw call. Where the engine
    // puts several in a call the two profiles would be close, and this would be measuring something
    // else.
    expect([low.picturesPerCall, standard.picturesPerCall]).toEqual([1, 1]);
    // What the cull saves is the pictures asked for, which are the indices. The number of calls is
    // not what is held. It falls whenever the packer puts the scenery that is drawn together on
    // fewer sheets: packing by filling gaps took the garden from about 340 calls to about 40.
    expect(
      low.indices * 3,
      `${low.indices} indices in low-end mode against ${standard.indices} in standard`,
    ).toBeLessThan(standard.indices);
    expect(
      low.draws,
      `${low.draws} draw calls in low-end mode against ${standard.draws} in standard`,
    ).toBeLessThanOrEqual(standard.draws);
  });
});

/**
 * Where on a map to put the camera: each corner, nearly, and the middle, as a share of the map's
 * width and height.
 */
const SPOTS = [
  [0.1, 0.12],
  [0.9, 0.12],
  [0.1, 0.88],
  [0.9, 0.88],
  [0.5, 0.5],
] as const;

/** A map, and how to get into it from where the game starts. */
const PLACES = [
  { map: 'forest', spawn: null, big: true },
  { map: 'palace-garden', spawn: 'from-forest', big: true },
  { map: 'playground', spawn: 'from-garden', big: false },
  { map: 'stable', spawn: 'from-garden', big: false },
  { map: 'treasure-house', spawn: 'from-garden', big: false },
  { map: 'palace-hall', spawn: 'from-garden', big: false },
  { map: 'palace-dining', spawn: 'from-hall', big: false },
  { map: 'palace-gallery', spawn: 'from-hall', big: false },
  { map: 'palace-ballroom', spawn: 'from-music', big: false },
  { map: 'palace-bedroom', spawn: 'from-tea', big: false },
  { map: 'manor-hall', spawn: 'from-forest', big: false },
  { map: 'manor-upper', spawn: 'from-lift', big: false },
] as const;

/**
 * Draws the frame the camera is showing twice without moving anything: once as the game does, and
 * once with every piece of scenery the game left out put back. The pixels are read straight after
 * each draw, before the browser takes the frame.
 */
const sameWithAllScenery = (page: Page) =>
  page.evaluate(() => {
    const ua = window.__ua as unknown as {
      controller: { view: { culler: { hidden(): { setVisible(on: boolean): void }[]; count: number } | null } };
      stage: {
        game: {
          canvas: HTMLCanvasElement;
          step(time: number, delta: number): void;
          renderer: { gl: WebGL2RenderingContext };
        };
      };
    };
    const { game } = ua.stage;
    const { gl } = game.renderer;
    const { width, height } = game.canvas;
    const culler = ua.controller.view.culler!;
    const drawn = (): Uint8Array => {
      game.step(performance.now(), 0);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const asPlayed = drawn();
    const hidden = culler.hidden();
    for (const image of hidden) image.setVisible(true);
    const withAll = drawn();
    for (const image of hidden) image.setVisible(false);
    let differ = 0;
    const colours = new Set<number>();
    for (let i = 0; i < asPlayed.length; i += 4) {
      if (asPlayed[i] !== withAll[i] || asPlayed[i + 1] !== withAll[i + 1] || asPlayed[i + 2] !== withAll[i + 2])
        differ++;
      if (i % 64 === 0) colours.add((asPlayed[i]! << 16) | (asPlayed[i + 1]! << 8) | asPlayed[i + 2]!);
    }
    return { hidden: hidden.length, images: culler.count, differ, pixels: width * height, colours: colours.size };
  });

test.describe('low-end mode leaves out scenery that is off the screen', () => {
  test('and the picture is the same with every piece of it put back, wherever the camera is', async ({ page }) => {
    // Every map, five places in each, in a browser that draws in software.
    test.setTimeout(900_000);
    await openLow(page);
    await play(page);
    await freeze(page);
    for (const place of PLACES) {
      await test.step(place.map, async () => {
        if (place.spawn) await enter(page, place.map, place.spawn);
        let hiddenSomewhere = 0;
        for (const [across, down] of SPOTS) {
          await lookAt(page, across, down);
          const result = await sameWithAllScenery(page);
          expect(
            result.colours,
            `${place.map} at ${across}, ${down} drew a flat picture, so the comparison says nothing`,
          ).toBeGreaterThan(40);
          expect(
            result.differ,
            `${place.map} at ${across}, ${down}: ${result.differ} of ${result.pixels} pixels change when ${result.hidden} of ${result.images} left-out pieces are put back`,
          ).toBe(0);
          hiddenSomewhere += result.hidden;
        }
        await lookBack(page);
        // A map as big as these has far more scenery than a screen shows, so a test that never hid
        // anything would prove nothing.
        if (place.big) expect(hiddenSomewhere, `${place.map} hid nothing`).toBeGreaterThan(100);
      });
    }
  });

  test('and the same when the camera has stood back to see the whole palace', async ({ page }) => {
    test.setTimeout(300_000);
    await openLow(page);
    await play(page);
    await freeze(page);
    await enter(page, 'palace-garden', 'from-forest');
    await standAt(page, { x: 1536, y: 1032 });
    await page.getByRole('button', { name: 'See the whole palace' }).click();
    await step(page, 3);
    expect(await page.evaluate(() => window.__ua!.controller.surveyed)).toBeCloseTo(1, 2);
    const result = await sameWithAllScenery(page);
    expect(result.colours, 'the picture was flat, so the comparison says nothing').toBeGreaterThan(40);
    expect(
      result.differ,
      `${result.differ} of ${result.pixels} pixels change when ${result.hidden} of ${result.images} left-out pieces are put back`,
    ).toBe(0);
  });

  test('and a phone that is not in low-end mode draws all of it', async ({ page }) => {
    await openGame(page);
    await play(page);
    expect(
      await page.evaluate(() => (window.__ua!.controller as unknown as { view: { culler: unknown } }).view.culler),
    ).toBeNull();
  });
});
