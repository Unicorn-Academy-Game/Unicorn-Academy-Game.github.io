import { expect, type Page, test } from '@playwright/test';
import { bodyOf, freeze, goTo, hush, mapId, openGame, openParent, type Pt, play, standAt, step } from './helpers';
import { fingers } from './touch';

/**
 * Wildstar that does not move. The report: she gets stuck for no reason, tapping anywhere does
 * nothing, and turning the screen off and on frees her. Every spec here is one way that can happen
 * on a real device, driven the way the device does it, and each says what a child must be able to
 * do afterwards: tap, and she goes.
 */

/**
 * How long a finger has to stay put before it counts as resting, with room to spare. Real time,
 * because a finger's clock is.
 */
const RESTING_FOR = 1500;

/** Where Wildstar's body is on the screen, in CSS pixels. */
const bodyOnScreen = async (page: Page): Promise<Pt> => {
  const body = await bodyOf(page, 'wildstar');
  return page.evaluate((p) => window.__ua!.controller.toScreen(p), body);
};

const leader = (page: Page) =>
  page.evaluate(() => {
    const { world } = window.__ua!.controller;
    const u = world.unicorns.wildstar!;
    return {
      x: u.pos.x,
      y: u.pos.y,
      phase: world.leader.phase,
      goal: world.leader.goal,
      steering: world.leader.steer !== null,
    };
  });

const toWorld = (page: Page, css: Pt): Promise<Pt> => page.evaluate((c) => window.__ua!.controller.toWorld(c), css);

const AXES: readonly Pt[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * A place on the screen `reach` pixels from her body with open ground under it, in the first of
 * these directions that has some.
 */
async function openGround(page: Page, reach: number, dirs: readonly Pt[] = AXES): Promise<{ at: Pt; dir: Pt }> {
  const body = await bodyOnScreen(page);
  const size = page.viewportSize()!;
  for (const dir of dirs) {
    const at = { x: body.x + dir.x * reach, y: body.y + dir.y * reach };
    if (at.x < 8 || at.y < 8 || at.x > size.width - 8 || at.y > size.height - 8) continue;
    const thing = await page.evaluate((c) => window.__ua!.controller.thingAt(window.__ua!.controller.toWorld(c)), at);
    if (!thing) return { at, dir };
  }
  throw new Error(`no open ground ${reach}px from Wildstar`);
}

const opposite = (dir: Pt): Pt[] => [{ x: -dir.x, y: -dir.y }, ...AXES];

/**
 * The game, frozen so that time is stepped by hand, with nothing wandering across the ground to
 * take a tap.
 */
async function ready(page: Page): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await hush(page);
  await step(page, 1);
}

/** Wildstar's distance from a place in the world. */
const away = async (page: Page, to: Pt): Promise<number> => {
  const l = await leader(page);
  return Math.hypot(l.x - to.x, l.y - to.y);
};

/** How near a tapped place she has to end up for the tap to have sent her there, in world units. */
const nearTarget = 48;

test.describe('a finger that was lost', () => {
  test.skip(
    ({ browserName, hasTouch }) => browserName !== 'chromium' || !hasTouch,
    'real fingers are driven through Chromium',
  );
  test.setTimeout(300_000);

  test('when the lift of a finger is never heard, the next tap sends her where it landed', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const w = window as unknown as { __lose: boolean };
      w.__lose = false;
      // The game is never told: not by a touch event, not by a pointer event, not by a lost
      // capture.
      for (const type of ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'lostpointercapture', 'mouseup'])
        window.addEventListener(type, (e) => w.__lose && e.stopImmediatePropagation(), { capture: true });
    });
    const touch = await fingers(page);
    const { at: press, dir } = await openGround(page, 170);
    await touch.down(1, press);
    await step(page, 0.6);
    expect((await leader(page)).steering).toBe(true);
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = true));
    await touch.up(1);
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = false));
    await step(page, 0.5);

    const { at: elsewhere } = await openGround(page, 110, opposite(dir));
    const target = await toWorld(page, elsewhere);
    await touch.tap(2, elsewhere);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);
    expect((await leader(page)).steering).toBe(false);
  });

  test('a finger that rests on the ground does not stop a tap from another', async ({ page }) => {
    await ready(page);
    const touch = await fingers(page);
    const { at: thumb, dir } = await openGround(page, 190);
    await touch.down(1, thumb);
    await step(page, 0.5);
    await page.waitForTimeout(RESTING_FOR);

    const { at: elsewhere } = await openGround(page, 100, opposite(dir));
    const target = await toWorld(page, elsewhere);
    await touch.tap(2, elsewhere);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);

    // The one that rested has no say any more, even if it moves, until it lifts and lands again.
    const before = await leader(page);
    await touch.move(1, { x: thumb.x, y: thumb.y + 30 });
    await step(page, 1);
    expect((await leader(page)).steering).toBe(false);
    expect(Math.hypot((await leader(page)).x - before.x, (await leader(page)).y - before.y)).toBeLessThan(8);
    await touch.up(1);
  });

  test('a second finger that lands and stays does not take her from the first', async ({ page }) => {
    await ready(page);
    const touch = await fingers(page);
    const start = await leader(page);
    const { at: first, dir } = await openGround(page, 170);
    await touch.down(1, first);
    await step(page, 0.4);
    const { at: palm } = await openGround(page, 110, opposite(dir));
    await touch.down(2, palm);
    await page.waitForTimeout(RESTING_FOR);
    await step(page, 2);
    // A palm is not a command: she went where the first finger was, and not toward the palm on the
    // other side of her.
    const l = await leader(page);
    expect((l.x - start.x) * dir.x + (l.y - start.y) * dir.y).toBeGreaterThan(100);
    await touch.up(2);
    await touch.up(1);
  });

  test('a touch the system takes away is not a tap', async ({ page }) => {
    await ready(page);
    const touch = await fingers(page);
    const { at } = await openGround(page, 150);
    await touch.down(1, at);
    await page.waitForTimeout(40);
    await touch.cancel();
    await step(page, 1);
    const l = await leader(page);
    expect(l.steering).toBe(false);
    expect(l.goal).toBeNull();
  });

  test('fingers lost under a bubble that goes away do not take the screen from her', async ({ page }) => {
    await ready(page);
    const touch = await fingers(page);
    for (let lost = 1; lost <= 3; lost++) {
      // A bubble like the guide's, on the screen's edge, with a finger on it as the way it pointed
      // to comes into view.
      const bubble = await page.evaluate(() => {
        const b = document.createElement('button');
        b.className = 'exit';
        b.dataset.lost = 'bubble';
        b.style.cssText = 'position:fixed;left:6px;top:140px;width:60px;height:60px;z-index:1000';
        document.body.append(b);
        return { x: 36, y: 170 };
      });
      await touch.down(lost, bubble);
      await page.waitForTimeout(50);
      // It is taken off the page under the finger, and the finger lifts over nothing.
      await page.evaluate(() => document.querySelector('[data-lost="bubble"]')?.remove());
      await touch.up(lost);
      await step(page, 0.3);
    }
    const { at } = await openGround(page, 120);
    const target = await toWorld(page, at);
    await touch.tap(9, at);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });
});

test.describe('a page that is slow to hear a finger', () => {
  test.skip(
    ({ browserName, hasTouch }) => browserName !== 'chromium' || !hasTouch,
    'real fingers are driven through Chromium',
  );
  test.setTimeout(300_000);

  /**
   * Longer than a tap may last, which is what a long frame, a sound being decoded or a picture
   * going to the graphics card can take on a slow device.
   */
  const BUSY_FOR = 450;

  test('a tap is a tap when the page is busy from the moment the finger lands to the moment it lifts', async ({
    page,
  }) => {
    await ready(page);
    // The page hears the finger land, and is busy then. The lift is waiting to be heard when that
    // is over, though the finger lifted soon.
    await page.evaluate((ms) => {
      window.__ua!.stage.game.canvas.addEventListener(
        'pointerdown',
        () => {
          const since = performance.now();
          while (performance.now() - since < ms) {
            // busy
          }
        },
        { once: true },
      );
      window.addEventListener('pointerup', () => ((window as unknown as { __lifted: boolean }).__lifted = true), {
        once: true,
        capture: true,
      });
    }, BUSY_FOR);
    const touch = await fingers(page);
    const { at } = await openGround(page, 130);
    const target = await toWorld(page, at);
    await touch.tap(1, at, 60);
    // The browser says the lift was sent before the page has heard it. A step is three seconds of
    // the game's own clock, so one that ran first would find the finger down for three seconds, and
    // the lift that came after would be the end of a finger that had rested and not a tap.
    await page.waitForFunction(() => (window as unknown as { __lifted?: boolean }).__lifted === true);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);
    expect((await leader(page)).steering).toBe(false);
  });
});

test.describe('a mouse that was lost', () => {
  test.setTimeout(300_000);

  test('a button that is let go outside the page does not leave her following the mouse', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const w = window as unknown as { __lose: boolean };
      w.__lose = false;
      for (const type of ['mouseup', 'pointerup', 'pointercancel', 'lostpointercapture', 'touchend'])
        window.addEventListener(type, (e) => w.__lose && e.stopImmediatePropagation(), { capture: true });
    });
    const { at: press } = await openGround(page, 170);
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await step(page, 0.6);
    expect((await leader(page)).steering).toBe(true);
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = true));
    await page.mouse.up();
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = false));

    // No button is down now, and the mouse moves about the page. She must not follow it.
    const { at: elsewhere } = await openGround(page, 120, [
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
    await page.mouse.move(elsewhere.x, elsewhere.y, { steps: 4 });
    await step(page, 0.5);
    expect((await leader(page)).steering).toBe(false);
  });
});

test.describe('a key that was lost', () => {
  test.setTimeout(300_000);

  test('a direction key held when Command goes down is let go, as the system never says it lifted', async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.down('ArrowRight');
    await step(page, 0.6);
    expect((await leader(page)).steering).toBe(true);
    await page.keyboard.down('Meta');
    await step(page, 0.6);
    expect((await leader(page)).steering).toBe(false);
    await page.keyboard.up('Meta');
    await page.keyboard.up('ArrowRight');
  });
});

test.describe('a save that never finishes', () => {
  test.setTimeout(300_000);

  test('does not hold the herd at the door', async ({ page }) => {
    await ready(page);
    const portal = await page.evaluate(() => {
      const all = window.__ua!.controller.world.map.portals;
      const gateway = all.find((p) => !p.door) ?? all[0]!;
      return { id: gateway.portalId, approach: gateway.approach, to: gateway.to.mapId };
    });
    // The device's storage stops answering: the write that the change of place waits on is never
    // done.
    await page.evaluate(() => {
      window.__ua!.store!.commit = () => new Promise<void>(() => undefined);
      window.__ua!.saves.request('map', window.__ua!.controller.world);
    });
    await page.evaluate((at) => window.__ua!.controller.debugTeleport(at), portal.approach);
    await step(page, 1);
    await page.evaluate((id) => window.__ua!.controller.goToExit(id), portal.id);
    for (
      let seconds = 0;
      seconds < 6 && (await page.evaluate(() => window.__ua!.controller.phase)) === 'playing';
      seconds++
    )
      await step(page, 1);
    await page.waitForFunction(
      () => window.__ua!.controller.phase === 'playing' && window.__ua!.controller.world.map.id !== 'forest',
      undefined,
      { timeout: 20_000, polling: 250 },
    );
    expect(await mapId(page)).toBe(portal.to);
    // And she can be led there: the new place takes a tap.
    await hush(page);
    await step(page, 1.5);
    const { at } = await openGround(page, 110);
    const target = await toWorld(page, at);
    await page.mouse.click(at.x, at.y);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });
});

test.describe('a connection that stops', () => {
  test.setTimeout(300_000);

  test('a place that never arrives takes her back to the door, and the way out is still open', async ({ page }) => {
    await ready(page);
    const portal = await page.evaluate(() => {
      const all = window.__ua!.controller.world.map.portals;
      // The gate to the garden, which leads out over open ground. The first way out that is not a
      // door is the cave mouth now, and a tap beside it can be on rock.
      const gateway = all.find((p) => !p.door && p.to.mapId === 'palace-garden') ?? all[0]!;
      return {
        id: gateway.portalId,
        approach: gateway.approach,
        to: gateway.to.mapId,
        file: window.__ua!.manifest.maps[gateway.to.mapId]!.file,
      };
    });
    // The connection stops: the next place's map is asked for and never comes.
    await page.route(`**/assets/${portal.file}`, () => undefined);
    await page.evaluate(() => window.__ua!.controller.debugPatience({ load: 2500 }));
    await page.evaluate((at) => window.__ua!.controller.debugTeleport(at), portal.approach);
    await step(page, 1);
    await page.evaluate((id) => window.__ua!.controller.goToExit(id), portal.id);
    for (
      let seconds = 0;
      seconds < 6 && (await page.evaluate(() => window.__ua!.controller.phase)) === 'playing';
      seconds++
    )
      await step(page, 1);
    await page.waitForFunction(() => window.__ua!.controller.phase === 'playing', undefined, {
      timeout: 30_000,
      polling: 250,
    });
    expect(await mapId(page)).toBe('forest');
    await expect(page.getByText('Hmm, that way did not open.')).toBeVisible();
    // She is on her own two feet again.
    await hush(page);
    await step(page, 1.5);
    const { at } = await openGround(page, 110, [{ x: -1, y: 0 }, ...AXES]);
    const target = await toWorld(page, at);
    await page.mouse.click(at.x, at.y);
    await step(page, 3);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });
});

test.describe('a leader who is meant to move and does not', () => {
  test.skip(
    ({ browserName, hasTouch }) => browserName !== 'chromium' || !hasTouch,
    'real fingers are driven through Chromium',
  );
  test.setTimeout(300_000);

  test('a finger that is held leads her again once she has been stood down, without being lifted', async ({ page }) => {
    await ready(page);
    const touch = await fingers(page);
    const { at: press } = await openGround(page, 190);
    await touch.down(1, press);
    await step(page, 0.3);
    expect((await leader(page)).steering).toBe(true);
    // Something is wrong in her steering that no finger can see: she is led and goes nowhere.
    await page.evaluate(() => {
      window.__ua!.controller.world.leader.steer!.pace = Number.NaN;
    });
    await step(page, 1);
    const stuck = await leader(page);
    // The finger does not move or lift. The game stands her down, and the finger has to be heard
    // again for her to go.
    await step(page, 4);
    const after = await leader(page);
    expect(Math.hypot(after.x - stuck.x, after.y - stuck.y)).toBeGreaterThan(60);
    await touch.up(1);
  });
});

test.describe('a place no route can start from', () => {
  test.setTimeout(300_000);

  test('a tap there sets her down on open ground and she goes where it said', async ({ page }) => {
    await ready(page);
    // Somewhere her feet fit and nothing can send her from, as the forest has between its trunks.
    const nook = await page.evaluate(() => {
      const { nav } = window.__ua!.controller.world;
      for (let y = 60; y < 2500; y += 12)
        for (let x = 60; x < 3800; x += 12)
          if (nav.isWalkable({ x, y }, -3) && !nav.canSetOff({ x, y })) return { x, y };
      return null;
    });
    expect(nook, 'the forest has a place like that').not.toBeNull();
    await standAt(page, nook!);
    // Open ground on the screen, a little way off, that a route can reach.
    const target = await page.evaluate(() => {
      const c = window.__ua!.controller;
      const here = c.world.unicorns.wildstar!.pos;
      for (const reach of [160, 200, 240, 120]) {
        for (let a = 0; a < 16; a++) {
          const p = {
            x: here.x + Math.cos((a * Math.PI) / 8) * reach,
            y: here.y + Math.sin((a * Math.PI) / 8) * reach,
          };
          const at = c.toScreen(p);
          if (
            at.x > 40 &&
            at.y > 40 &&
            at.x < innerWidth - 40 &&
            at.y < innerHeight - 40 &&
            c.world.nav.canSetOff(p) &&
            !c.thingAt(p)
          )
            return p;
        }
      }
      return null;
    });
    expect(target, 'there is open ground in sight of it').not.toBeNull();
    const at = await page.evaluate((p) => window.__ua!.controller.toScreen(p), target!);
    await page.mouse.click(at.x, at.y);
    await step(page, 5);
    expect(await away(page, target!)).toBeLessThan(nearTarget);
  });
});

test.describe('a game that carries on past what goes wrong in it', () => {
  test.setTimeout(300_000);

  test('a picture that cannot be drawn does not stop her, and is counted', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      (window.__ua!.controller as unknown as { view: { update: () => void } }).view.update = () => {
        throw new Error('the picture failed');
      };
    });
    const { at } = await openGround(page, 120);
    const target = await toWorld(page, at);
    await page.mouse.click(at.x, at.y);
    await step(page, 4);
    expect(await away(page, target)).toBeLessThan(nearTarget);
    expect(await page.evaluate(() => window.__ua!.faults.counts.get('view') ?? 0)).toBeGreaterThan(0);
  });

  test('a sound that cannot be made does not lose the door she went through', async ({ page }) => {
    await ready(page);
    const portal = await page.evaluate(() => {
      const all = window.__ua!.controller.world.map.portals;
      const gateway = all.find((p) => !p.door) ?? all[0]!;
      return { id: gateway.portalId, approach: gateway.approach, to: gateway.to.mapId };
    });
    await page.evaluate(() => {
      (window.__ua!.controller as unknown as { audio: { events: () => void } }).audio.events = () => {
        throw new Error('the sound failed');
      };
    });
    await page.evaluate((at) => window.__ua!.controller.debugTeleport(at), portal.approach);
    await step(page, 1);
    await page.evaluate((id) => window.__ua!.controller.goToExit(id), portal.id);
    for (
      let seconds = 0;
      seconds < 6 && (await page.evaluate(() => window.__ua!.controller.phase)) === 'playing';
      seconds++
    )
      await step(page, 1);
    await page.waitForFunction(
      () => window.__ua!.controller.phase === 'playing' && window.__ua!.controller.world.map.id !== 'forest',
      undefined,
      { timeout: 30_000, polling: 250 },
    );
    expect(await mapId(page)).toBe(portal.to);
  });

  test('a world whose simulation fails at every step is built again where she stood, and she can be tapped again', async ({
    page,
  }) => {
    await ready(page);
    const before = await page.evaluate(() => {
      const { world } = window.__ua!.controller;
      (window as unknown as { __old: unknown }).__old = world;
      // Something in the world is broken in a way that makes every step of it throw.
      (world.life as unknown as { critters: unknown }).critters = null;
      const u = world.unicorns.wildstar!;
      return { x: u.pos.x, y: u.pos.y };
    });
    await step(page, 4);
    const after = await page.evaluate(() => {
      const c = window.__ua!.controller;
      const u = c.world.unicorns.wildstar!;
      return {
        replaced: c.world !== (window as unknown as { __old: unknown }).__old,
        x: u.pos.x,
        y: u.pos.y,
        failed: window.__ua!.faults.counts.get('simulation') ?? 0,
      };
    });
    expect(after.replaced).toBe(true);
    expect(after.failed).toBeGreaterThan(0);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(80);
    await hush(page);
    await step(page, 1);
    const { at } = await openGround(page, 120);
    const target = await toWorld(page, at);
    await page.mouse.click(at.x, at.y);
    await step(page, 4);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });

  test('a world that was stopped and never replaced is replaced, and she can be tapped again', async ({ page }) => {
    await ready(page);
    // The way out was taken, the old world was stopped, and the change of place never began:
    // nothing says another is coming.
    await page.evaluate(() => {
      const w = window as unknown as { __retired: unknown };
      w.__retired = window.__ua!.controller.world;
      window.__ua!.controller.world.paused = true;
    });
    await step(page, 3);
    const state = await page.evaluate(() => ({
      replaced: window.__ua!.controller.world !== (window as unknown as { __retired: unknown }).__retired,
      paused: window.__ua!.controller.world.paused,
      phase: window.__ua!.controller.phase,
    }));
    expect(state).toEqual({ replaced: true, paused: false, phase: 'playing' });
    await hush(page);
    await step(page, 1);
    const { at } = await openGround(page, 120);
    const target = await toWorld(page, at);
    await page.mouse.click(at.x, at.y);
    await step(page, 4);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });

  test('a frame that fails inside the engine does not end the loop', async ({ page }) => {
    await openGame(page);
    await play(page);
    const worldTime = (): Promise<number> => page.evaluate(() => window.__ua!.controller.world.time);
    const before = await worldTime();
    // The engine's own step fails once, after the game has updated the world and before the picture
    // is drawn, where none of the game's own guards reach. The engine asks for the next frame only
    // after this one has come back, so nothing would ask again.
    await page.evaluate(() =>
      window.__ua!.stage.game.events.once('prerender', () => {
        throw new Error('the engine failed in the middle of a frame');
      }),
    );
    await expect.poll(worldTime, { timeout: 90_000, intervals: [500] }).toBeGreaterThan(before + 1);
    expect(await page.evaluate(() => window.__ua!.faults.counts.get('engine') ?? 0)).toBe(1);
  });

  test('a frame whose length is not a number does not stop the world for good', async ({ page }) => {
    await ready(page);
    const { at } = await openGround(page, 120);
    const target = await toWorld(page, at);
    // One frame whose length is not a number. Whatever a length like that is added to is not a
    // number after it, and stays so.
    await page.evaluate(() => {
      (window.__ua!.controller as unknown as { advanceFrame: (ms: number, now: number) => void }).advanceFrame(
        Number.NaN,
        performance.now(),
      );
    });
    await step(page, 1);
    await page.mouse.click(at.x, at.y);
    await step(page, 4);
    expect(await away(page, target)).toBeLessThan(nearTarget);
  });
});

/** The row of the About page that says what the game put right by itself, as a parent reads it. */
const putRight = (page: Page) =>
  page.locator('.fact', { has: page.locator('dt', { hasText: /^Put right$/ }) }).locator('dd');

/** The controls, opened where a parent looks to say what the game has been doing. */
async function aboutPage(page: Page): Promise<void> {
  await openParent(page);
  await goTo(page, 'About');
}

test.describe('what the game has put right, as the About page says it', () => {
  test.setTimeout(300_000);

  test('says nothing was needed when nothing was', async ({ page }) => {
    await ready(page);
    await step(page, 2);
    await aboutPage(page);
    await expect(putRight(page)).toHaveText('Nothing');
  });

  test('counts a finger whose lift was never heard', async ({ page, browserName, hasTouch }) => {
    test.skip(browserName !== 'chromium' || !hasTouch, 'real fingers are driven through Chromium');
    await ready(page);
    await page.evaluate(() => {
      const w = window as unknown as { __lose: boolean };
      w.__lose = false;
      for (const type of ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'lostpointercapture', 'mouseup'])
        window.addEventListener(type, (e) => w.__lose && e.stopImmediatePropagation(), { capture: true });
    });
    const touch = await fingers(page);
    const { at: press, dir } = await openGround(page, 170);
    await touch.down(1, press);
    await step(page, 0.6);
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = true));
    await touch.up(1);
    await page.evaluate(() => ((window as unknown as { __lose: boolean }).__lose = false));
    // Nothing says the finger is gone until another lands, and then it is found out.
    const { at: elsewhere } = await openGround(page, 110, opposite(dir));
    await touch.tap(2, elsewhere);
    await step(page, 1);
    await aboutPage(page);
    await expect(putRight(page)).toHaveText('1 touch it lost track of');
  });

  test('counts the times she was freed after she was meant to move and did not', async ({
    page,
    browserName,
    hasTouch,
  }) => {
    test.skip(browserName !== 'chromium' || !hasTouch, 'real fingers are driven through Chromium');
    await ready(page);
    const touch = await fingers(page);
    const { at: press } = await openGround(page, 190);
    await touch.down(1, press);
    await step(page, 0.3);
    await page.evaluate(() => {
      window.__ua!.controller.world.leader.steer!.pace = Number.NaN;
    });
    await step(page, 5);
    await touch.up(1);
    await aboutPage(page);
    // How many times depends on how the watch climbs its steps, which is not what is looked at
    // here: that it counts her being freed is.
    await expect(putRight(page)).toHaveText(/^Wildstar freed [1-9]\d* times?$/);
  });

  test('counts what failed and was carried past', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      (window.__ua!.controller as unknown as { view: { update: () => void } }).view.update = () => {
        throw new Error('the picture failed');
      };
    });
    await step(page, 1);
    const failed = await page.evaluate(() => window.__ua!.faults.total);
    expect(failed, 'something failed').toBeGreaterThan(0);
    await aboutPage(page);
    await expect(putRight(page)).toHaveText(`${failed} ${failed === 1 ? 'error' : 'errors'} carried past`);
  });
});
