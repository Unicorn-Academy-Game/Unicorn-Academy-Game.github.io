import { expect, type Page, test } from '@playwright/test';
import { SEASON_FEEL } from '../../src/content/seasons';
import { closeParent, freeze, goTo, openGame, openParent, play, step } from './helpers';

/**
 * The seasons. A page opened for a test is summer whatever the calendar says, so every other test
 * sees the world as it was drawn. A test of the seasons asks for one in the address
 * (`&season=winter`), or for `&season=auto` to let the switch and the calendar rule.
 */

const shown = (page: Page) => page.evaluate(() => window.__ua!.controller.seasonShown);
const weather = (page: Page) => page.evaluate(() => window.__ua!.controller.debugWeather());
const chosen = (page: Page) => page.evaluate(() => window.__ua!.settings.get().season);
const kinds = (page: Page) =>
  page.evaluate(() => [...new Set(window.__ua!.controller.world.life.critters.map((c) => c.kind))]);
const veil = (page: Page) => page.locator('.sky-haze').evaluate((node) => Number((node as HTMLElement).style.opacity));

/**
 * What a picture the engine holds is drawn from: the file as it came, or the file painted for a
 * season.
 */
const drawnFrom = (page: Page, key: string) =>
  page.evaluate((k) => {
    const textures = window.__ua!.stage.game.textures as unknown as {
      list: Record<string, { source: { source: unknown }[] } | undefined>;
    };
    const picture = textures.list[k]?.source[0]?.source;
    return picture instanceof HTMLCanvasElement
      ? 'painted'
      : picture instanceof HTMLImageElement
        ? 'as it came'
        : 'missing';
  }, key);

const FOREST_GROUND = 'tiles:forest';
const FOREST_PICTURES = 'bundle:forest:0';
const AWAY_IN_WINTER = new Set<string>(SEASON_FEEL.winter.away);

const switchOf = (page: Page) => page.getByRole('radiogroup', { name: 'Season' });
const pick = (page: Page, name: string) => switchOf(page).getByRole('radio', { name }).click();

test.describe('the seasons', () => {
  test.setTimeout(240_000);

  test('a page opened for a test is summer, and the switch is on the calendar', async ({ page }) => {
    await openGame(page);
    expect(await shown(page)).toBe('summer');
    expect(await weather(page)).toEqual({ fall: null, visible: 0 });
    expect(await chosen(page)).toBe('auto');
    expect(await drawnFrom(page, FOREST_GROUND)).toBe('as it came');
    expect(await drawnFrom(page, FOREST_PICTURES)).toBe('as it came');
    // The creatures that winter sends away are about in summer, so what winter does to them is a
    // change and not an empty forest.
    expect((await kinds(page)).filter((kind) => AWAY_IN_WINTER.has(kind)).length).toBeGreaterThan(0);
  });

  test('an address that asks for winter shows it for that visit only', async ({ page }) => {
    await openGame(page, 'kept', '&season=winter');
    expect(await shown(page)).toBe('winter');
    await expect.poll(() => weather(page).then((w) => w.fall)).toBe('snow');
    expect(await drawnFrom(page, FOREST_GROUND)).toBe('painted');
    expect(await drawnFrom(page, FOREST_PICTURES)).toBe('painted');
    expect(await chosen(page)).toBe('auto');
    expect(await veil(page)).toBeGreaterThan(0);

    const living = await kinds(page);
    expect(living.length).toBeGreaterThan(0);
    expect(living.filter((kind) => AWAY_IN_WINTER.has(kind))).toEqual([]);
  });

  test('the switch on the start screen shows a season at once and gives summer back its own pictures', async ({
    page,
  }) => {
    await openGame(page, 'setting', '&season=auto');
    await expect(switchOf(page).getByRole('radio')).toHaveCount(5);
    await expect(switchOf(page).getByRole('radio', { checked: true })).toHaveAccessibleName('Automatic');

    await pick(page, 'Winter');
    await expect.poll(() => shown(page), { timeout: 60_000 }).toBe('winter');
    expect(await chosen(page)).toBe('winter');
    expect((await weather(page)).fall).toBe('snow');
    expect(await drawnFrom(page, FOREST_GROUND)).toBe('painted');

    await pick(page, 'Autumn');
    await expect.poll(() => shown(page), { timeout: 60_000 }).toBe('autumn');
    expect((await weather(page)).fall).toBe('leaves');

    await pick(page, 'Spring');
    await expect.poll(() => shown(page), { timeout: 60_000 }).toBe('spring');
    expect((await weather(page)).fall).toBe('petals');

    await pick(page, 'Summer');
    await expect.poll(() => shown(page), { timeout: 60_000 }).toBe('summer');
    expect(await weather(page)).toEqual({ fall: null, visible: 0 });
    expect(await drawnFrom(page, FOREST_GROUND)).toBe('as it came');
    expect(await drawnFrom(page, FOREST_PICTURES)).toBe('as it came');
    expect(await chosen(page)).toBe('summer');
  });

  test('keeps the switch on the screen and clear of the others', async ({ page }) => {
    await openGame(page, 'setting', '&season=auto', { learning: true });
    const size = page.viewportSize()!;
    const box = (await switchOf(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    expect(box.height).toBeGreaterThanOrEqual(28);
    for (const name of ['Start at', 'Learning mode']) {
      const other = (await page.getByRole('radiogroup', { name }).boundingBox())!;
      expect(
        other.y + other.height <= box.y + 1 || box.y + box.height <= other.y + 1,
        `${name} and the season switch do not overlap`,
      ).toBe(true);
    }
    const start = (await page.getByRole('button', { name: 'Play' }).boundingBox())!;
    expect(
      box.y + box.height <= start.y + 1 || start.y + start.height <= box.y + 1,
      'Play is clear of the season switch',
    ).toBe(true);
  });

  test('draws a picture on every side of the switch, on a phone held either way, where the switches with words may drop theirs', async ({
    page,
  }) => {
    await openGame(page, 'setting', '&season=auto', { learning: true });
    // A switch that has words can do without its pictures on a short or narrow screen, and this one
    // has no words, so without them it is an empty pill.
    for (const [width, height] of [
      [863, 360],
      [640, 360],
      [568, 320],
      [915, 412],
      [1280, 720],
      [360, 640],
      [320, 568],
    ] as const) {
      await page.setViewportSize({ width, height });
      const around = (await switchOf(page).boundingBox())!;
      const pictures = switchOf(page).locator('.side-icon svg');
      expect(await pictures.count(), `${width}x${height}: a picture for each season`).toBe(5);
      for (const picture of await pictures.all()) {
        const at = await picture.boundingBox();
        expect(at, `${width}x${height}: the picture is drawn`).not.toBeNull();
        expect(at!.width, `${width}x${height}: the picture is big enough to see`).toBeGreaterThanOrEqual(12);
        expect(at!.height).toBeGreaterThanOrEqual(12);
        expect(
          at!.x >= around.x && at!.x + at!.width <= around.x + around.width,
          `${width}x${height}: the picture is inside the switch`,
        ).toBe(true);
      }
    }
  });

  test('the parent controls change the season while the player plays', async ({ page }) => {
    await openGame(page, 'kept', '&season=auto');
    await play(page);
    await openParent(page);
    await goTo(page, 'Play');
    await page.getByRole('radiogroup', { name: 'Season' }).getByRole('radio', { name: 'Winter' }).click();
    await expect.poll(() => shown(page), { timeout: 60_000 }).toBe('winter');
    expect(await chosen(page)).toBe('winter');
    expect((await weather(page)).fall).toBe('snow');
    await closeParent(page);
    await expect.poll(() => veil(page)).toBeGreaterThan(0.1);
  });

  test("the words of the parent's season choice stay apart and inside their buttons on a phone held upright", async ({
    page,
  }) => {
    await openGame(page, 'kept', '&season=auto');
    await play(page);
    await openParent(page);
    await goTo(page, 'Play');
    for (const [width, height] of [
      [360, 640],
      [320, 568],
      [390, 844],
      [768, 1024],
      [863, 360],
    ] as const) {
      await page.setViewportSize({ width, height });
      const group = page.getByRole('radiogroup', { name: 'Season' });
      await group.scrollIntoViewIfNeeded();
      const words = await group.getByRole('radio').evaluateAll((buttons) =>
        buttons.map((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const at = button.getBoundingClientRect();
          return {
            name: button.textContent ?? '',
            text: { left: text.left, right: text.right },
            at: { left: at.left, right: at.right, top: at.top, bottom: at.bottom },
          };
        }),
      );
      expect(words.map((w) => w.name)).toEqual(['Automatic', 'Spring', 'Summer', 'Autumn', 'Winter']);
      for (const word of words) {
        expect(
          word.text.left >= word.at.left - 0.5 && word.text.right <= word.at.right + 0.5,
          `${width}x${height}: "${word.name}" is inside its button`,
        ).toBe(true);
      }
      for (const [i, a] of words.entries()) {
        for (const b of words.slice(i + 1)) {
          const apart =
            a.at.right <= b.at.left + 0.5 ||
            b.at.right <= a.at.left + 0.5 ||
            a.at.bottom <= b.at.top + 0.5 ||
            b.at.bottom <= a.at.top + 0.5;
          expect(apart, `${width}x${height}: "${a.name}" and "${b.name}" do not sit on each other`).toBe(true);
        }
      }
    }
  });

  test('a house keeps its summer in winter, and the snow is back when she walks out', async ({ page }) => {
    await openGame(page, 'kept', '&season=winter');
    await play(page);
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'stable', spawnId: 'from-garden' }));
    expect(await shown(page)).toBe('summer');
    expect(await weather(page)).toEqual({ fall: null, visible: 0 });
    expect(await drawnFrom(page, 'bundle:stable:0')).toBe('as it came');
    await expect.poll(() => veil(page)).toBe(0);

    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
    expect(await shown(page)).toBe('winter');
    expect((await weather(page)).fall).toBe('snow');
    expect(await drawnFrom(page, 'tiles:garden')).toBe('painted');
  });

  test('the snow is in the air, goes with calm, and comes back', async ({ page }) => {
    await openGame(page, 'kept', '&season=winter');
    await play(page);
    await freeze(page);
    await step(page, 2);
    expect((await weather(page)).visible).toBeGreaterThan(20);

    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: true }));
    await step(page, 1);
    expect((await weather(page)).visible).toBe(0);

    await page.evaluate(() => window.__ua!.settings.update({ reducedEffects: false }));
    await step(page, 2);
    expect((await weather(page)).visible).toBeGreaterThan(20);
  });
});
