import { expect, type Page, test } from '@playwright/test';
import {
  freeze,
  hush,
  learningOn,
  mapId,
  newWatch,
  openGame,
  play,
  SCRATCH,
  shot,
  standAt,
  step,
  stepUntil,
  tapWorld,
  untilArrived,
  walkThrough,
  watchScene,
} from './helpers';

/** What a phone held sideways shows, the screen everything here is for. */
const PHONE = { width: 863, height: 360 };

const STATUES = [
  'crystal-fox',
  'moon-hare',
  'star-whale',
  'storm-bird',
  'coral-seahorse',
  'ember-drake',
  'cloud-lion',
  'glow-owl',
] as const;
const PLANTS = [
  'urn-1',
  'planter-1',
  'orchid-1',
  'tulips-1',
  'bonsai-1',
  'lotus-fountain',
  'hanging-garden-1',
  'moon-window-2',
] as const;

interface Pad {
  isOpen: boolean;
  state: { typed: string; misses: number; done: boolean; hint: string };
}

/** What the ride's picture shows at one moment. */
interface RideLook {
  ride: boolean;
  /**
   * How see-through the picture is at the middle of the doorway: 255 is the doors, 0 is a hole to
   * whatever is behind them, and -1 is no ride.
   */
  alpha: number;
  /** The place the world is in. */
  map: string;
}
const padOf = (page: Page): Promise<Pad['state'] & { isOpen: boolean }> =>
  page.evaluate(() => {
    const pad = (window.__ua as unknown as { pad: Pad }).pad;
    return { ...pad.state, isOpen: pad.isOpen };
  });

async function startAt(page: Page, to: { mapId: string; spawnId: string }): Promise<void> {
  await page.setViewportSize(PHONE);
  await openGame(page);
  await play(page);
  await freeze(page);
  await page.evaluate((t) => window.__ua!.controller.travel(t as { mapId: 'forest'; spawnId: string }), to);
  await hush(page);
  await step(page, 1.5);
}

/** Taps the door of the manor and runs time until the pad that asks for the word is up. */
async function knockOnTheDoor(page: Page): Promise<void> {
  const door = await page.evaluate(() => {
    const { hit } = window.__ua!.controller.world.interactables.get('forest/manor-door-1')!;
    return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
  });
  await page.evaluate((p) => window.__ua!.controller.tap(p), door);
  for (let s = 0; s < 40 && !(await padOf(page)).isOpen; s++) await step(page, 0.5);
  expect((await padOf(page)).isOpen, 'the pad came up at the door').toBe(true);
}

/** Puts the leader on open ground below and beside a prop, and taps the middle of it. */
async function tapProp(
  page: Page,
  instanceId: string,
  o: { dx?: number; dy?: number; underBubble?: boolean } = {},
): Promise<void> {
  const at = await page.evaluate(
    ({ id, dx, dy }) => {
      const { world } = window.__ua!.controller;
      const { pos } = world.interactables.get(id)!;
      return world.nav.freePointNear({ x: pos.x + dx, y: pos.y + dy }, [], 0, 160);
    },
    { id: instanceId, dx: o.dx ?? -150, dy: o.dy ?? 60 },
  );
  if (!at) throw new Error(`no open ground near ${instanceId}`);
  await standAt(page, at);
  const centre = await page.evaluate((id) => {
    const { hit } = window.__ua!.controller.world.interactables.get(id)!;
    return { x: hit.x + hit.w / 2, y: hit.y + hit.h * 0.85 };
  }, instanceId);
  // A pumpkin the exit arrow floats over is tapped through the game, since the arrow would take a
  // touch on the screen.
  if (o.underBubble) await page.evaluate((p) => window.__ua!.controller.tap(p), centre);
  else await tapWorld(page, centre);
}

const reacting = (page: Page, id: string): Promise<boolean> =>
  page.evaluate((i) => window.__ua!.controller.world.transient.get(i)?.kind === 'delight', id);

/** Runs a tenth of a second at a time until the prop has begun its reaction. */
async function untilDelighted(page: Page, id: string): Promise<void> {
  for (let t = 0; t < 100 && !(await reacting(page, id)); t++) await step(page, 0.1);
  expect(await reacting(page, id), `${id} reacted to a tap`).toBe(true);
}

const unlockedNow = (page: Page, id: string): Promise<boolean> =>
  page.evaluate((i) => window.__ua!.controller.world.unlocked.has(i), id);

/** The word as a child gets there: through the door, as Wildstar alone, into the gallery. */
async function intoTheGallery(page: Page): Promise<void> {
  await startAt(page, { mapId: 'forest', spawnId: 'from-manor' });
  await knockOnTheDoor(page);
  await page.keyboard.type('wildstar');
  await page.keyboard.press('Enter');
  // The player's word goes into the door as a scene of its own, and the manor takes Wildstar in
  // after it.
  await watchScene(page, 'manor-word');
  await stepUntil(
    page,
    'the manor took her in',
    () => window.__ua!.controller.phase !== 'playing' || window.__ua!.controller.world.map.id === 'manor-hall',
    30,
  );
  await untilArrived(page, 'manor-hall');
  await hush(page);
  await step(page, 1.5);
}

test.describe('the Spooky Manor', () => {
  test('says the sound of each letter the player types at the door, and the word itself once it opens, when a parent has the voice on, and nothing at all when learning is off', async ({
    page,
  }) => {
    await startAt(page, { mapId: 'forest', spawnId: 'from-manor' });
    await knockOnTheDoor(page);
    const heard = (): Promise<string[]> => page.evaluate(() => [...window.__ua!.voice.heard]);
    // Learning is off, so the door is the game the player knows, and it says nothing.
    await page.keyboard.type('wi');
    expect((await padOf(page)).typed).toBe('wi');
    await page.waitForTimeout(400);
    expect(await heard()).toEqual([]);

    // A parent turns the voice on: the keyboard and the keys on the screen each say their letter,
    // once.
    await learningOn(page, { say: true });
    await page.keyboard.type('l');
    await expect.poll(heard).toEqual(['sound.l']);
    await page.locator('.codepad-key[data-letter="D"]').click({ force: true });
    await expect.poll(heard).toEqual(['sound.l', 'sound.d']);
    expect((await padOf(page)).typed).toBe('wild');

    // The whole word is said as the word, once the door has it, and not letter by letter.
    for (const letter of 'star')
      await page.locator(`.codepad-key[data-letter="${letter.toUpperCase()}"]`).click({ force: true });
    await page.locator('.codepad-go').click({ force: true });
    await expect
      .poll(heard)
      .toEqual(['sound.l', 'sound.d', 'sound.s', 'sound.t', 'sound.a', 'sound.r', 'word.wildstar']);
  });

  test('keeps its door shut until the word is typed, and typing it does not steer her', async ({ page }) => {
    await startAt(page, { mapId: 'forest', spawnId: 'from-manor' });
    await shot(page, `${SCRATCH}/manor-outside.png`);
    await knockOnTheDoor(page);
    await shot(page, `${SCRATCH}/manor-code-pad.png`);

    const before = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    // W, A and S steer her. With the pad up they are only letters.
    await page.keyboard.type('wild', { delay: 30 });
    await step(page, 1);
    expect((await padOf(page)).typed).toBe('wild');
    await page.keyboard.type('star', { delay: 30 });
    await step(page, 1);
    const typed = await padOf(page);
    expect(typed.typed).toBe('wildstar');
    expect(typed.done, 'nothing is checked until she says go').toBe(false);
    const after = await page.evaluate(() => ({
      ...window.__ua!.controller.world.unicorns.wildstar!.pos,
      phase: window.__ua!.controller.world.leader.phase,
    }));
    expect(Math.hypot(after.x - before.x, after.y - before.y), 'she did not move').toBeLessThan(2);
    expect(after.phase).toBe('idle');
    await shot(page, `${SCRATCH}/manor-code-typed.png`);

    // Nothing is hidden, so it can be read back.
    expect(await page.locator('.codepad input[type="password"]').count()).toBe(0);
    expect(await page.locator('.codepad-box').allTextContents()).toEqual(['W', 'I', 'L', 'D', 'S', 'T', 'A', 'R']);
  });

  test('answers a wrong word with a hint, shows the word after a few tries, and takes the right one in any case', async ({
    page,
  }) => {
    await startAt(page, { mapId: 'forest', spawnId: 'from-manor' });
    await knockOnTheDoor(page);
    expect((await padOf(page)).hint).toMatch(/Whisper the name/);
    await page.keyboard.type('unicorn');
    await page.keyboard.press('Enter');
    expect(await padOf(page)).toMatchObject({ misses: 1, done: false, typed: 'unicorn' });
    expect((await padOf(page)).hint).toBe('Not quite. It starts with W.');
    await shot(page, `${SCRATCH}/manor-code-hint.png`);
    for (let i = 0; i < 7; i++) await page.keyboard.press('Backspace');
    expect((await padOf(page)).typed).toBe('');
    await page.keyboard.type('hello');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    expect((await padOf(page)).misses).toBeGreaterThanOrEqual(3);
    expect((await padOf(page)).hint).toBe('Almost there! Copy the pale letters.');
    await shot(page, `${SCRATCH}/manor-code-ghost.png`);
    expect(await page.locator('.codepad-box[data-state="ghost"]').count()).toBeGreaterThan(0);
    expect(await mapId(page)).toBe('forest');
    // On-screen letters work the same, in capitals, with a trailing space.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
    for (const letter of 'WILDSTAR') await page.locator(`.codepad-key[data-letter="${letter}"]`).click({ force: true });
    await page.locator('.codepad-go').click({ force: true });
    expect((await padOf(page)).done).toBe(true);
    await watchScene(page, 'manor-word');
    await stepUntil(
      page,
      'the manor took her in',
      () => window.__ua!.controller.world.map.id === 'manor-hall' || window.__ua!.controller.phase !== 'playing',
      30,
    );
    await untilArrived(page, 'manor-hall');
    expect(await unlockedNow(page, 'manor-hall/manor-door-in')).toBe(false);
  });

  test('takes only Wildstar in, and the herd is waiting when she comes back out', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openGame(page);
    await play(page);
    await freeze(page);
    // Two friends have joined her, as they would have in a game that has been played for a while.
    await page.evaluate(() => window.__ua!.controller.world.persistent.recruited.push('leaf', 'glacier'));
    await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'forest', spawnId: 'from-manor' }));
    await hush(page);
    await step(page, 3);
    const herd = await page.evaluate(() => Object.keys(window.__ua!.controller.world.unicorns).sort());
    expect(await page.evaluate(() => window.__ua!.controller.world.order), 'her friends came out with her').toEqual([
      'leaf',
      'glacier',
    ]);
    await knockOnTheDoor(page);
    await page.keyboard.type('WILDSTAR');
    await page.keyboard.press('Enter');
    await watchScene(page, 'manor-word');
    await stepUntil(
      page,
      'she went in',
      () => window.__ua!.controller.world.map.id === 'manor-hall' || window.__ua!.controller.phase !== 'playing',
      30,
    );
    await untilArrived(page, 'manor-hall');
    await hush(page);
    await step(page, 2);
    expect(await page.evaluate(() => Object.keys(window.__ua!.controller.world.unicorns))).toEqual(['wildstar']);
    expect(
      await page.evaluate(() => window.__ua!.controller.world.persistent.recruited.length),
      'the friends are still hers',
    ).toBe(3);
    await shot(page, `${SCRATCH}/manor-gallery-arrival.png`);

    const watch = newWatch();
    await walkThrough(page, 'forest', watch);
    await hush(page);
    await step(page, 3);
    expect(await mapId(page)).toBe('forest');
    expect(
      await page.evaluate(() => Object.keys(window.__ua!.controller.world.unicorns).sort()),
      'she is with her friends again',
    ).toEqual(herd);
    expect(await unlockedNow(page, 'forest/manor-door-1'), 'the door stays unlocked for the session').toBe(true);
    await shot(page, `${SCRATCH}/manor-back-outside.png`);
    expect(watch.problems).toEqual([]);
    // Nothing about the door is saved: a new session starts with it shut.
    expect(await page.evaluate(() => JSON.stringify(window.__ua!.controller.world.persistent))).not.toMatch(
      /unlocked|wildstar-code|manor-door/,
    );
  });

  test('shows a gallery of statues that each answer a tap, and saves nothing for them', async ({ page }) => {
    test.setTimeout(240_000);
    await intoTheGallery(page);
    await shot(page, `${SCRATCH}/manor-gallery.png`);
    for (const name of STATUES) {
      const id = `manor-hall/statue-${name}`;
      await tapProp(page, id, { dx: -140, dy: 90 });
      await untilDelighted(page, id);
      // Each statue's own reaction is followed by a postcard from the place it comes from, and it
      // is that statue's own.
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  window.__ua!.wonders.inside?.wonder as unknown as { inspect?: () => { name: string } } | undefined
                )?.inspect?.().name,
            ),
          { timeout: 15_000 },
        )
        .toBe(name);
      await watchScene(page, 'statue-postcard');
      // She steps back so the whole statue shows, with the reaction going on.
      await page.evaluate((i) => {
        const { controller } = window.__ua!;
        const { pos } = controller.world.interactables.get(i)!;
        controller.debugTeleport(controller.world.nav.freePointNear({ x: pos.x - 210, y: pos.y - 105 }, [], 0, 160)!);
      }, id);
      await step(page, 0.45);
      await shot(page, `${SCRATCH}/manor-statue-${name}.png`);
      await step(page, 3.5);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(window.__ua!.controller.world.persistent.props).filter((p) => p.startsWith('manor-')),
      ),
      'saved props',
    ).toEqual([]);
  });

  test('opens the lift when the butterfly is touched, rides up to the sky garden and back down', async ({ page }) => {
    test.setTimeout(300_000);
    await intoTheGallery(page);
    const lift = 'manor-hall/elevator-door-1';
    expect(await unlockedNow(page, lift)).toBe(false);
    await standAt(
      page,
      await page.evaluate(() => window.__ua!.controller.world.nav.freePointNear({ x: 1792, y: 440 }, [], 0, 120)!),
    );
    await shot(page, `${SCRATCH}/manor-lift-shut.png`);
    // Asking the lift to open before the butterfly is found only shows where the butterfly is.
    const { hit } = await page.evaluate(
      () => window.__ua!.controller.world.interactables.get('manor-hall/elevator-door-1')!,
    );
    await page.evaluate((p) => window.__ua!.controller.tap(p), { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 });
    await step(page, 2);
    expect(await mapId(page)).toBe('manor-hall');
    expect(await unlockedNow(page, lift)).toBe(false);

    await tapProp(page, 'manor-hall/clue-butterfly', { dx: -170, dy: 170 });
    await untilDelighted(page, 'manor-hall/clue-butterfly');
    expect(await unlockedNow(page, lift)).toBe(true);
    await step(page, 0.4);
    await shot(page, `${SCRATCH}/manor-lift-opening.png`);
    await step(page, 2);
    await shot(page, `${SCRATCH}/manor-lift-open.png`);

    const watch = newWatch();
    await walkThrough(page, 'manor-upper', watch);
    await hush(page);
    await step(page, 2);
    expect(await mapId(page)).toBe('manor-upper');
    await shot(page, `${SCRATCH}/manor-sky-garden.png`);
    for (const name of PLANTS) {
      await tapProp(page, `manor-upper/${name}`, { dx: -120, dy: 100 });
      await untilDelighted(page, `manor-upper/${name}`);
      await step(page, 0.6);
      await shot(page, `${SCRATCH}/manor-sky-${name}.png`);
      await step(page, 3);
    }
    await walkThrough(page, 'manor-hall', watch);
    expect(await mapId(page)).toBe('manor-hall');
    await hush(page);
    await step(page, 1);
    await shot(page, `${SCRATCH}/manor-lift-back.png`);
    expect(await unlockedNow(page, lift), 'the lift stays open').toBe(true);
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('draws the ride in the lift over the dark, shut, and opens its doors on the place she is going to', async ({
    page,
  }) => {
    await intoTheGallery(page);
    // The butterfly is not what this looks at: the lift is open, and the ride is.
    await page.evaluate(() => window.__ua!.controller.world.unlocked.add('manor-hall/elevator-door-1'));
    await standAt(
      page,
      await page.evaluate(() => window.__ua!.controller.world.nav.freePointNear({ x: 1792, y: 440 }, [], 0, 120)!),
    );
    const { hit } = await page.evaluate(
      () => window.__ua!.controller.world.interactables.get('manor-hall/elevator-door-1')!,
    );

    // The ride is three seconds of the page's clock, and it lets go of a picture that is late, so
    // that she is never kept in a lift. A machine that other work has starved would decide what
    // this sees. So from here the clock is the test's, and the page is given its time a twentieth
    // of a second at a time, as `step` gives the world its time.
    await page.clock.install();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 5_000);
    const seen: RideLook[] = [];
    const tick = async (world = 0): Promise<RideLook> => {
      if (world > 0) await page.evaluate((s) => window.__ua!.controller.debugStep(s), world);
      await page.clock.runFor(50);
      const now = await page.evaluate((): RideLook => {
        const c = document.querySelector<HTMLCanvasElement>('.ride canvas');
        const alpha = c
          ? c.getContext('2d')!.getImageData(Math.round(c.width * 0.45), Math.round(c.height * 0.5), 1, 1).data[3]!
          : -1;
        return { ride: c !== null, alpha, map: window.__ua!.controller.world.map.id };
      });
      if (seen.length > 0 || now.ride) seen.push(now);
      return now;
    };
    const until = async (what: string, done: (look: RideLook) => boolean, world = 0): Promise<RideLook> => {
      for (let i = 0; i < 2000; i++) {
        const now = await tick(world);
        if (done(now)) return now;
        if (seen.length > 0 && !now.ride) throw new Error(`the ride was over before ${what}`);
      }
      throw new Error(`${what} had not happened after 2000 ticks`);
    };

    await page.evaluate((p) => window.__ua!.controller.tap(p), { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 });
    await until('the ride coming up', (look) => look.ride, 0.1);
    const shut = await until('the doors shutting', (look) => look.alpha === 255);
    expect(shut.map, 'the doors shut over the place she is leaving').toBe('manor-hall');
    await until('the lift on its way', () => seen.length >= 32);
    await shot(page, `${SCRATCH}/manor-ride-moving.png`, { settle: false });
    const under = await until('the new place coming under the doors', (look) => look.map === 'manor-upper');
    expect(under.alpha, 'the doors are still shut when it does').toBe(255);
    await until('the doors opening', (look) => look.alpha >= 0 && look.alpha < 40);
    for (let i = 0; i < 3; i++) await tick();
    await shot(page, `${SCRATCH}/manor-ride-opening.png`, { settle: false });
    await until('the ride going', (look) => !look.ride);
    expect(await page.locator('.ride').count(), 'the ride is gone').toBe(0);
    expect(await mapId(page)).toBe('manor-upper');
    expect(await page.evaluate(() => window.__ua!.controller.phase), 'she can play again').toBe('playing');
  });

  test('a lift that is still taking its doors away does not cut short the next change of place', async ({ page }) => {
    test.setTimeout(300_000);
    await startAt(page, { mapId: 'manor-upper', spawnId: 'from-lift' });
    // The last of a ride goes on for a few seconds after the new place is playing. How a change of
    // place that begins in those seconds fares would depend on how fast the machine is, so the ride
    // is held by hand and let go of when the next change has begun to fade out.
    await page.evaluate(() => {
      const c = window.__ua!.controller as unknown as {
        onRide: () => { arrived: Promise<void>; leave: () => Promise<void> };
        fade: (out: boolean) => Promise<void>;
      };
      let finish = (): void => {};
      const held = new Promise<void>((done) => (finish = done));
      c.onRide = () => ({ arrived: Promise.resolve(), leave: () => held });
      let fadeOuts = 0;
      const fade = c.fade.bind(c);
      c.fade = (out) => {
        const done = fade(out);
        if (out && ++fadeOuts === 2) finish();
        return done;
      };
    });
    const watch = newWatch();
    await walkThrough(page, 'manor-hall', watch);
    expect(
      await page.evaluate(() => window.__ua!.controller.phase),
      'she is playing while the lift is still held',
    ).toBe('playing');
    await walkThrough(page, 'forest', watch);
    expect(await mapId(page)).toBe('forest');
    expect(await page.evaluate(() => window.__ua!.controller.phase)).toBe('playing');
    expect(watch.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('answers a tap on every pumpkin in the yard', async ({ page }) => {
    await startAt(page, { mapId: 'forest', spawnId: 'from-manor' });
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const id = `forest/jack-o-lantern-${n}`;
      await tapProp(page, id, { dx: n % 2 ? -110 : 110, dy: 120, underBubble: true });
      await untilDelighted(page, id);
      await step(page, 0.5);
      await shot(page, `${SCRATCH}/manor-pumpkin-${n}.png`);
      await step(page, 1);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('answers a tap on each chandelier and each flower wall in the gallery', async ({ page }) => {
    await intoTheGallery(page);
    for (const name of ['chandelier-1', 'chandelier-2', 'chandelier-3', 'flower-wall-1', 'flower-wall-2']) {
      const id = `manor-hall/${name}`;
      await tapProp(page, id, { dx: -140, dy: 120, underBubble: true });
      await untilDelighted(page, id);
      await step(page, 0.5);
      await shot(page, `${SCRATCH}/manor-${name}.png`);
      await step(page, 1.5);
    }
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });
});
