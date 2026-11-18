import { expect, type Page, test } from '@playwright/test';
import { shownFacings } from '../../src/shared/clips';
import { facingLabel, nearestAmong, UNICORN_FACINGS, type UnicornFacing } from '../../src/shared/compass';
import { type ClipName, UNICORN_IDS } from '../../src/shared/ids';
import { facingKey } from '../../src/shared/manifest';
import { FINE_SHEET, freeze, openGame, play, SILK, waitForFine } from './helpers';

/** What these tests read of the engine and the manifest, as far as they read either. */
interface Img {
  texture?: { key: string };
  frame: { name: string };
  flipX: boolean;
  setOrigin(x: number, y: number): Img;
}
interface Painted {
  draw(entry: Img, x: number, y: number): void;
  render(): void;
  snapshot(done: (image: HTMLImageElement) => void): void;
}
interface Scene {
  textures: {
    exists(key: string): boolean;
    remove(key: string): void;
    addDynamicTexture(key: string, w: number, h: number): Painted;
    get(key: string): { has(frame: string): boolean };
  };
  make: { image(config: { key: string; frame: string; add: false }): Img };
  children: { list: Img[] };
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  sw: number;
  sh: number;
}
interface Clip {
  flip?: true;
  page?: number;
  frames: { rect: number }[];
}
interface Sheet {
  file: string;
  rects: Rect[];
}
interface Asset {
  origin: [number, number];
  atlas: Sheet;
  clips: Record<string, Record<string, Clip | undefined>>;
  fine?: { atlases: Sheet[]; clips: Record<string, Record<string, Clip | undefined>> };
}
interface Hooks {
  stage: { scene: Scene };
  profile: { id: string; fineFacings: string };
  manifest: { unicorns: Record<string, Asset> };
  fine: { want(id: string): void };
  controller: {
    debugStep(seconds: number): void;
    world: {
      time: number;
      unicorns: Record<string, { speed: number; anim: { clip: string; facing: number; startedAt: number } }>;
    };
  };
}

/**
 * What is on the screen for Wildstar: which sheet the body is from, which picture of it, and
 * whether it is turned.
 */
interface Body {
  clip: string;
  facing: UnicornFacing;
  sheet: string;
  picture: string;
  flipped: boolean;
}

const EVERY = (['walk', 'idle'] as const).flatMap((clip) => UNICORN_FACINGS.map((facing) => ({ clip, facing })));

/**
 * Sets Wildstar to each clip and facing and draws one frame at once, with no time passing, and
 * reads what body is on the screen.
 */
const bodies = (page: Page, rows: readonly { clip: string; facing: UnicornFacing }[]): Promise<Body[]> =>
  page.evaluate((list) => {
    const ua = window.__ua as unknown as Hooks;
    const wildstar = ua.controller.world.unicorns.wildstar!;
    return list.map(({ clip, facing }) => {
      wildstar.speed = 0;
      wildstar.anim = { clip, facing, startedAt: ua.controller.world.time };
      // No time draws a frame and cannot step the world, so what is drawn is what was set.
      ua.controller.debugStep(0);
      const image = ua.stage.scene.children.list.find((c) => c.texture?.key?.startsWith('unicorn:wildstar'))!;
      return { clip, facing, sheet: image.texture!.key, picture: image.frame.name, flipped: image.flipX };
    });
  }, rows);

const wildstarAsset = (page: Page): Promise<Asset> =>
  page.evaluate(() => (window.__ua as unknown as Hooks).manifest.unicorns.wildstar!);

/**
 * How a body differs from the one the manifest says should be drawn, one line for each that does.
 */
function wrong(
  rows: readonly Body[],
  wanted: (row: Body) => { sheet: string; picture: string; flipped: boolean },
): string[] {
  return rows.flatMap((row) => {
    const want = wanted(row);
    const got = { sheet: row.sheet, picture: row.picture, flipped: row.flipped };
    return got.sheet === want.sheet && got.picture === want.picture && got.flipped === want.flipped
      ? []
      : [`${row.clip} ${facingLabel(row.facing)}: drew ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`];
  });
}

/**
 * What is drawn for a body when her first sheet is all she has: the picture of the facing of it
 * that is nearest, turned about when that is the northeast or the southeast.
 */
const fromFirstSheet =
  (asset: Asset) =>
  (row: Body): { sheet: string; picture: string; flipped: boolean } => {
    const clip = asset.clips[row.clip]![facingKey(nearestAmong(shownFacings(row.clip as ClipName), row.facing))]!;
    return { sheet: 'unicorn:wildstar', picture: String(clip.frames[0]!.rect), flipped: clip.flip === true };
  };

/**
 * What is drawn for a body once her fine sheets are in: the picture made for the facing, or the
 * first sheet's for the six it draws.
 */
const fromFineSheets =
  (asset: Asset) =>
  (row: Body): { sheet: string; picture: string; flipped: boolean } => {
    const fine = asset.fine!.clips[row.clip]![facingKey(row.facing)];
    const drawn = fine ?? asset.clips[row.clip]![facingKey(row.facing)]!;
    return {
      sheet: fine ? `unicorn:wildstar:${fine.page}` : 'unicorn:wildstar',
      picture: String(drawn.frames[0]!.rect),
      flipped: !fine && drawn.flip === true,
    };
  };

test.describe('the fine facings, in the real game', () => {
  test.setTimeout(480_000);

  test('once the fine sheets have come, every facing of walking and standing is drawn from the picture made for it', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await waitForFine(page, 'wildstar');
    const asset = await wildstarAsset(page);
    const rows = await bodies(page, EVERY);
    expect(wrong(rows, fromFineSheets(asset))).toEqual([]);
    // Nothing is turned about once the picture drawn for the facing is there, and the six that the
    // first sheet draws stay on it.
    expect(rows.filter((r) => r.flipped)).toEqual([]);
    expect(rows.filter((r) => r.sheet === 'unicorn:wildstar')).toHaveLength(2 * 6);
    expect(rows.filter((r) => r.sheet !== 'unicorn:wildstar')).toHaveLength(2 * 26);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });

  // A picture comes by the file, the browser's decoder, the engine's texture and its cut of the
  // frame with the trim of its canvas. Each sheet is read here again, on its own, and every picture
  // of every fine sheet of every unicorn has to be what the engine draws for that frame, to the
  // pixel.
  test('every picture of every fine sheet of every unicorn is drawn by the engine as the file has it, to the pixel', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await page.evaluate(
      (ids) =>
        ids.forEach((id) => {
          (window.__ua as unknown as Hooks).fine.want(id);
        }),
      [...UNICORN_IDS],
    );
    for (const id of UNICORN_IDS) await waitForFine(page, id);

    const found = await page.evaluate(
      async (ids) => {
        const ua = window.__ua as unknown as Hooks;
        const scene = ua.stage.scene;
        const out: { id: string; frames: number; mismatched: number; visible: number; control: number }[] = [];
        for (const id of ids) {
          const asset = ua.manifest.unicorns[id]!;
          const fine = asset.fine!;
          const canvas = fine.atlases[0]!.rects[0]!;
          const [ox, oy] = asset.origin;
          // What the files say: each sheet read on its own with nothing done to its colors, so a
          // picture is the pixels of its rect.
          const files = await Promise.all(
            fine.atlases.map(async (sheet) => {
              const blob = await (await fetch(`/assets/${sheet.file}`)).blob();
              const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
              const surface = document.createElement('canvas');
              surface.width = bitmap.width;
              surface.height = bitmap.height;
              const context = surface.getContext('2d', { willReadFrequently: true })!;
              context.drawImage(bitmap, 0, 0);
              return context.getImageData(0, 0, bitmap.width, bitmap.height);
            }),
          );
          const cells: { page: number; rect: number }[] = [];
          for (const byFacing of Object.values(fine.clips))
            for (const clip of Object.values(byFacing))
              for (const f of clip!.frames) cells.push({ page: clip!.page!, rect: f.rect });
          const unique = [...new Map(cells.map((c) => [`${c.page}:${c.rect}`, c])).values()];
          const result = { id, frames: unique.length, mismatched: 0, visible: 0, control: 0 };
          const columns = 8;
          const batch = 48;
          for (let from = 0; from < unique.length; from += batch) {
            const part = unique.slice(from, from + batch);
            const width = columns * canvas.sw;
            const height = Math.ceil(part.length / columns) * canvas.sh;
            const key = `fine-check:${id}`;
            if (scene.textures.exists(key)) scene.textures.remove(key);
            const paint = scene.textures.addDynamicTexture(key, width, height);
            part.forEach((c, n) => {
              const picture = scene.make
                .image({ key: `unicorn:${id}:${c.page}`, frame: String(c.rect), add: false })
                .setOrigin(ox / canvas.sw, oy / canvas.sh);
              paint.draw(picture, (n % columns) * canvas.sw + ox, Math.floor(n / columns) * canvas.sh + oy);
            });
            paint.render();
            const image = await new Promise<HTMLImageElement>((done) => paint.snapshot(done));
            const surface = document.createElement('canvas');
            surface.width = width;
            surface.height = height;
            const context = surface.getContext('2d', { willReadFrequently: true })!;
            context.drawImage(image, 0, 0);
            const drawn = context.getImageData(0, 0, width, height).data;
            /**
             * How many pixels of the engine's drawing in a cell are not the pixels the file has for
             * a picture, and how many of the file's are visible.
             */
            const compare = (cell: number, c: { page: number; rect: number }): { wrong: number; visible: number } => {
              const r = fine.atlases[c.page]!.rects[c.rect]!;
              const file = files[c.page]!;
              const x0 = (cell % columns) * canvas.sw;
              const y0 = Math.floor(cell / columns) * canvas.sh;
              let wrong = 0;
              let visible = 0;
              for (let row = 0; row < canvas.sh; row++) {
                for (let col = 0; col < canvas.sw; col++) {
                  const at = ((y0 + row) * width + x0 + col) * 4;
                  const inside = col >= r.ox && col < r.ox + r.w && row >= r.oy && row < r.oy + r.h;
                  const base = ((r.y + row - r.oy) * file.width + r.x + col - r.ox) * 4;
                  const want = inside
                    ? [file.data[base]!, file.data[base + 1]!, file.data[base + 2]!, file.data[base + 3]!]
                    : [0, 0, 0, 0];
                  const got = [drawn[at]!, drawn[at + 1]!, drawn[at + 2]!, drawn[at + 3]!];
                  // Colors of pixels that cannot be seen are not a picture.
                  if (want[3] === 0) want[0] = want[1] = want[2] = 0;
                  if (got[3] === 0) got[0] = got[1] = got[2] = 0;
                  if (want[3]! > 0) visible++;
                  if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2] || got[3] !== want[3]) wrong++;
                }
              }
              return { wrong, visible };
            };
            part.forEach((c, n) => {
              const seen = compare(n, c);
              result.mismatched += seen.wrong;
              result.visible += seen.visible;
            });
            // The comparison can fail: a cell held against the pixels of a different picture is not
            // the same.
            if (from === 0) result.control = compare(0, part[1]!).wrong;
            scene.textures.remove(key);
          }
          out.push(result);
        }
        return out;
      },
      [...UNICORN_IDS],
    );

    expect(found.map((f) => f.id).sort()).toEqual([...UNICORN_IDS].sort());
    for (const f of found) {
      expect(f.frames, `${f.id}: pictures checked`).toBeGreaterThan(150);
      expect(f.visible, `${f.id}: visible pixels compared`).toBeGreaterThan(1_000_000);
      expect(f.mismatched, `${f.id}: pixels the engine draws that are not the file's`).toBe(0);
      expect(
        f.control,
        `${f.id}: a picture against the pixels of another must differ, or the check proves nothing`,
      ).toBeGreaterThan(1000);
    }
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });

  test('a unicorn whose fine sheets never come keeps her eight facings, with the northeast and the southeast turned about, and nothing goes wrong', async ({
    page,
  }) => {
    const asked: string[] = [];
    await page.route(FINE_SHEET, (route) => {
      asked.push(route.request().url());
      return route.abort();
    });
    await openGame(page);
    await play(page);
    await freeze(page);
    // Long enough for the game to have asked, and to have given up.
    await expect.poll(() => asked.length, { timeout: 60_000 }).toBeGreaterThan(0);
    const asset = await wildstarAsset(page);
    const rows = await bodies(page, EVERY);
    expect(wrong(rows, fromFirstSheet(asset))).toEqual([]);
    expect(
      rows.some((r) => r.flipped),
      'the northeast and the southeast are shown turned about',
    ).toBe(true);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  });

  // A device that is not up to the fine facings at all is never asked for them: not in the network,
  // not in the engine's memory. It keeps the eight facings it has had.
  async function keepsTheEight(page: Page, profile: { id: string }): Promise<void> {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (FINE_SHEET.test(request.url())) asked.push(request.url());
    });
    await openGame(page);
    expect(await page.evaluate(() => (window.__ua as unknown as Hooks).profile)).toMatchObject({
      ...profile,
      fineFacings: 'none',
    });
    expect(await page.evaluate(() => document.documentElement.dataset.profile)).toBe(profile.id);
    await play(page);
    await freeze(page);
    // Every unicorn is put on screen and asked for, so the game has been given every chance to load
    // them. A sheet it was going to ask for it asks for in the same moment.
    await page.evaluate(
      (ids) =>
        ids.forEach((id) => {
          (window.__ua as unknown as Hooks).fine.want(id);
        }),
      [...UNICORN_IDS],
    );
    await page.waitForTimeout(1_000);
    expect(asked).toEqual([]);
    expect(
      await page.evaluate(
        (ids) => ids.filter((id) => (window.__ua as unknown as Hooks).stage.scene.textures.exists(`unicorn:${id}:0`)),
        [...UNICORN_IDS],
      ),
    ).toEqual([]);
    const asset = await wildstarAsset(page);
    const rows = await bodies(page, EVERY);
    expect(wrong(rows, fromFirstSheet(asset))).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  }

  // A device that is short of memory is given the fine facings of Wildstar alone: the sheets of the
  // six come to 109 MiB, hers are 18, and she is the one a child steers and watches turn. The
  // followers keep the eight they have.
  async function leaderOnly(page: Page, profile: { id: string }): Promise<void> {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (FINE_SHEET.test(request.url())) asked.push(request.url());
    });
    await openGame(page);
    expect(await page.evaluate(() => (window.__ua as unknown as Hooks).profile)).toMatchObject({
      ...profile,
      fineFacings: 'leader',
    });
    expect(await page.evaluate(() => document.documentElement.dataset.profile)).toBe(profile.id);
    await play(page);
    await freeze(page);
    await page.evaluate(
      (ids) =>
        ids.forEach((id) => {
          (window.__ua as unknown as Hooks).fine.want(id);
        }),
      [...UNICORN_IDS],
    );
    await waitForFine(page, 'wildstar');
    await page.waitForTimeout(1_000);
    expect([...new Set(asked.map((url) => /\/unicorns\/([a-z]+)\.fine/.exec(url)![1]))]).toEqual(['wildstar']);
    expect(
      await page.evaluate(
        (ids) => ids.filter((id) => (window.__ua as unknown as Hooks).stage.scene.textures.exists(`unicorn:${id}:0`)),
        [...UNICORN_IDS],
      ),
    ).toEqual(['wildstar']);
    const asset = await wildstarAsset(page);
    const rows = await bodies(page, EVERY);
    expect(wrong(rows, fromFineSheets(asset))).toEqual([]);
    expect(rows.filter((r) => r.flipped)).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
  }

  test.describe('on a Fire tablet', () => {
    test.use({ userAgent: SILK });

    test("only Wildstar's fine sheets are asked for and drawn, and she turns through all 32 facings as she does anywhere", async ({
      page,
    }) => {
      await leaderOnly(page, { id: 'low' });
    });
  });

  // Chromium says how much memory a device has. A device with 2 GB is given Wildstar's fine
  // facings and is otherwise drawn the standard way, and one with less keeps the eight for all.
  test.describe('on a Chrome that says it has 2 GB of memory', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true }),
      );
    });

    test("the picture is the standard one and only Wildstar's fine sheets are asked for and drawn", async ({
      page,
    }) => {
      await leaderOnly(page, { id: 'standard' });
    });

    test('a parent who has turned low-end mode off is given the fine facings of the whole herd all the same', async ({
      page,
    }) => {
      await openGame(page);
      expect(await page.evaluate(() => (window.__ua as unknown as Hooks).profile)).toMatchObject({
        id: 'standard',
        fineFacings: 'leader',
      });
      await page.evaluate(async () => {
        window.__ua!.settings.update({ lowEnd: 'off' } as never);
        await window.__ua!.settings.flush();
      });
      await openGame(page);
      expect(await page.evaluate(() => (window.__ua as unknown as Hooks).profile)).toMatchObject({
        id: 'standard',
        fineFacings: 'herd',
      });
      await play(page);
      await freeze(page);
      await waitForFine(page, 'wildstar');
      expect(await page.evaluate(() => window.__ua!.faults.total)).toBe(0);
    });
  });

  test.describe('on a Chrome that says it has 1 GB of memory', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true }),
      );
    });

    test('the picture is the standard one, no fine sheet is asked for, and the eight facings are drawn as they were', async ({
      page,
    }) => {
      await keepsTheEight(page, { id: 'standard' });
    });
  });

  test.describe('on a Chrome that says it has 4 GB of memory', () => {
    test('the fine sheets come as they do on any other', async ({ page }) => {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true }),
      );
      await openGame(page);
      expect(await page.evaluate(() => (window.__ua as unknown as Hooks).profile)).toMatchObject({
        id: 'standard',
        fineFacings: 'herd',
      });
      await play(page);
      await freeze(page);
      await waitForFine(page, 'wildstar');
    });
  });
});
