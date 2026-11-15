import { expect, type Page, test } from '@playwright/test';
import {
  approachOf,
  freeze,
  hush,
  mapId,
  newWatch,
  openGame,
  play,
  SCRATCH,
  shot,
  spotOn,
  standAt,
  step,
  stepUntil,
  tapWorld,
  walkThrough,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };

/** The nine rooms beyond the throne room. */
const ROOMS = ['dining', 'tea', 'bedroom', 'flowers', 'gallery', 'library', 'jewel', 'music', 'ballroom'] as const;

/**
 * The rooms in the order a visit walks them: out through each to its far end and back, from the
 * throne room round to the throne room.
 */
const ROUTE = [
  'dining',
  'tea',
  'bedroom',
  'tea',
  'dining',
  'flowers',
  'dining',
  'hall',
  'gallery',
  'library',
  'jewel',
  'library',
  'gallery',
  'music',
  'ballroom',
  'music',
  'gallery',
  'hall',
] as const;

async function inThe(page: Page, map: string, spawn: string): Promise<void> {
  await page.setViewportSize(PHONE);
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate(([m, s]) => window.__ua!.controller.travel({ mapId: m!, spawnId: s! }), [map, spawn] as const);
  await hush(page);
  await step(page, 1.5);
}

/**
 * The pictures on the stage that show the first frame of a sprite of a bundle. A frame of a page is
 * named by its rect in the manifest.
 */
const drawn = (
  page: Page,
  bundle: string,
  sprite: string,
): Promise<{ visible: boolean; alpha: number; x: number; y: number }[]> =>
  page.evaluate(
    ([b, s]) => {
      const ua = window.__ua as unknown as {
        manifest: {
          bundles: Record<string, { sprites: Record<string, { frames: { page: number; rect: number }[] }> }>;
        };
        stage: {
          scene: {
            children: {
              list: {
                texture?: { key: string };
                frame?: { name: string };
                visible: boolean;
                alpha: number;
                x: number;
                y: number;
              }[];
            };
          };
        };
      };
      const first = ua.manifest.bundles[b!]!.sprites[s!]!.frames[0]!;
      return ua.stage.scene.children.list
        .filter(
          (c) => c.texture?.key === `bundle:${b}:${first.page}` && c.frame?.name === String(first.rect) && c.visible,
        )
        .map((c) => ({ visible: c.visible, alpha: c.alpha, x: c.x, y: c.y }));
    },
    [bundle, sprite] as const,
  );

/**
 * Her crown on the stage, which is made the first time she wears it and shown only while she does.
 */
const crownImage = (page: Page): Promise<{ visible: boolean; x: number; y: number } | null> =>
  page.evaluate(() => {
    const list = window.__ua!.stage.scene.children.list as unknown as {
      texture?: { key: string };
      visible: boolean;
      x: number;
      y: number;
    }[];
    const crown = list.find((c) => c.texture?.key === 'unicorn:wildstar:crown');
    return crown ? { visible: crown.visible, x: crown.x, y: crown.y } : null;
  });

const wildstar = (page: Page): Promise<{ x: number; y: number; clip: string; facing: number }> =>
  page.evaluate(() => {
    const u = window.__ua!.controller.world.unicorns.wildstar!;
    return { x: u.pos.x, y: u.pos.y, clip: u.anim.clip, facing: u.anim.facing as number };
  });

test.describe('the rooms of the palace', () => {
  test('lead on from the throne room through every door and back, and the herd arrives in each', async ({ page }) => {
    test.setTimeout(600_000);
    await inThe(page, 'palace-hall', 'from-garden');
    const watch = newWatch();
    const seen = new Set<string>();
    for (const room of ROUTE) {
      await walkThrough(page, `palace-${room}`, watch);
      await step(page, 1.5);
      expect(await mapId(page)).toBe(`palace-${room}`);
      expect(await page.evaluate(() => window.__ua!.invariants()), room).toEqual([]);
      if (!seen.has(room)) await shot(page, `${SCRATCH}/palace-room-${room}.png`);
      seen.add(room);
    }
    for (const room of ROOMS) expect(seen.has(room), `${room} was visited`).toBe(true);
    expect(watch.problems).toEqual([]);
  });

  test('keep a bed in the bedroom that she lies down in and sleeps, and wake her when she is sent anywhere', async ({
    page,
  }) => {
    await inThe(page, 'palace-bedroom', 'from-tea');
    const bed = 'palace-bedroom/nap-bed-1';
    const seat = () => page.evaluate(() => window.__ua!.controller.world.leader.seat);
    /**
     * How far above her ground point her picture is drawn, which is how far the bed has carried her
     * up.
     */
    const carried = () =>
      page.evaluate(() => {
        const list = window.__ua!.stage.scene.children.list as unknown as { texture?: { key: string }; y: number }[];
        const picture = list.find(
          (c) => c.texture?.key.startsWith('unicorn:wildstar') && !c.texture.key.endsWith(':crown'),
        );
        return picture ? window.__ua!.controller.world.unicorns.wildstar!.pos.y - picture.y : NaN;
      });
    const cropped = () =>
      page.evaluate(() => {
        const list = window.__ua!.stage.scene.children.list as unknown as {
          texture?: { key: string };
          isCropped?: boolean;
        }[];
        return list.some((c) => c.texture?.key.startsWith('unicorn:wildstar') === true && c.isCropped === true);
      });

    await standAt(page, { x: 700, y: 840 });
    expect(await seat()).toBeNull();
    await tapWorld(page, await spotOn(page, bed));
    await stepUntil(page, 'her to lie down', () => window.__ua!.controller.world.leader.seat !== null, 25);
    await step(page, 3);
    expect(await seat()).toBe(bed);
    const asleep = await wildstar(page);
    expect(asleep.clip, 'she is resting').toBe('rest');
    expect(asleep.facing, 'her head is to the east').toBe(0);
    expect(await carried(), 'she is lifted onto the bed').toBeGreaterThan(40);
    expect(await cropped(), 'the quilt hides her legs').toBe(true);
    let zs = 0;
    for (let i = 0; i < 12 && zs === 0; i++) {
      await step(page, 0.5);
      zs = (await drawn(page, 'fx', 'fx-z-1')).length + (await drawn(page, 'fx', 'fx-z-2')).length;
    }
    expect(zs, "z's float up from her").toBeGreaterThan(0);
    await shot(page, `${SCRATCH}/palace-nap.png`);

    await step(page, 20);
    expect(await seat(), 'she sleeps for as long as she is left').toBe(bed);
    await tapWorld(page, await spotOn(page, bed));
    await step(page, 2);
    expect(await seat()).toBe(bed);

    await tapWorld(page, { x: 700, y: 830 });
    await step(page, 0.5);
    expect(await seat(), 'she is up').toBeNull();
    expect((await wildstar(page)).clip).not.toBe('rest');
    await step(page, 2);
    expect(await cropped(), 'the quilt lets go of her').toBe(false);
    await step(page, 4);
    expect(await carried()).toBeCloseTo(0, 0);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});

test.describe('the crown', () => {
  test('goes on her head when she takes it, stays on through the doors, and goes back on its stand', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await inThe(page, 'palace-hall', 'from-garden');
    const stand = 'palace-hall/crown';
    const worn = () => page.evaluate(() => window.__ua!.controller.world.crown.worn);
    expect(await worn()).toBe(false);
    expect(await crownImage(page)).toBeNull();
    expect((await drawn(page, 'palace-hall', 'ph-crown')).length, 'the crown is on its stand').toBeGreaterThan(0);

    await standAt(page, await approachOf(page, stand));
    await step(page, 2);
    // Not the middle of the stand: a unicorn drawn in front takes a tap, and a leader who faces the
    // screen at the stand covers its middle (the nine facings from 20 to 28).
    await tapWorld(page, await spotOn(page, stand));
    await stepUntil(page, 'the crown to be taken', () => window.__ua!.controller.world.crown.worn, 12);
    await step(page, 2);
    const head = await crownImage(page);
    expect(head?.visible, 'the crown is on her').toBe(true);
    const her = await wildstar(page);
    expect(Math.abs(head!.x - her.x), 'on her head and not beside her').toBeLessThan(70);
    expect(her.y - head!.y, 'above her feet').toBeGreaterThan(60);
    expect((await drawn(page, 'palace-hall', 'ph-crown-empty')).length, 'the stand is empty').toBeGreaterThan(0);
    expect((await drawn(page, 'palace-hall', 'ph-crown')).length).toBe(0);
    await shot(page, `${SCRATCH}/palace-crown-worn.png`);

    const watch = newWatch();
    await walkThrough(page, 'palace-dining', watch);
    await step(page, 2);
    expect(await worn(), 'she keeps it on through the door').toBe(true);
    expect((await crownImage(page))?.visible).toBe(true);
    await walkThrough(page, 'palace-hall', watch);
    await hush(page);
    await step(page, 2);
    expect(await worn()).toBe(true);

    await standAt(page, await approachOf(page, stand));
    await step(page, 2);
    await tapWorld(page, await spotOn(page, stand));
    await stepUntil(page, 'the crown to be put back', () => !window.__ua!.controller.world.crown.worn, 12);
    await step(page, 2);
    expect((await crownImage(page))?.visible, 'it is off her head').toBe(false);
    expect((await drawn(page, 'palace-hall', 'ph-crown')).length, 'it is on its stand').toBeGreaterThan(0);
    expect((await drawn(page, 'palace-hall', 'ph-crown-empty')).length).toBe(0);
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
