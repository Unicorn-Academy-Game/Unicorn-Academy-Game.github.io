import { expect, type Page, test } from '@playwright/test';
import { TAP_MS } from '../../src/input/gesture';
import { facingLabel, NORTHEAST, NORTHWEST, SOUTHEAST, SOUTHWEST, WEST } from '../../src/shared/compass';
import { bodyOf, freeze, hush, openGame, type Pt, pictureOf, play, standAt, step, withoutFineSheets } from './helpers';

// What these tests read is the picture on the screen for the way she faces, and where the fine
// sheets are in, that is the picture made for that exact way, which is not what comes of a game
// that has been up for a moment more or less. They are kept away, and `fine-facings.spec.ts` has
// them in.
test.beforeEach(({ page }) => withoutFineSheets(page));

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
      speed: u.speed,
      clip: u.anim.clip,
      facing: u.anim.facing,
      phase: world.leader.phase,
      goal: world.leader.goal,
    };
  });

/**
 * The game is frozen, but the finger's clock is real, and a press on open ground that lifts within
 * `TAP_MS` is a tap as well as a lead. A second of game time steps in about 30 milliseconds (read
 * from a WebKit trace), so a finger that is to count as held is kept down past it. A release inside
 * it sends her on to the place the finger pressed.
 */
const keepDown = (page: Page): Promise<void> => page.waitForTimeout(TAP_MS + 100);

const AXES: readonly Pt[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * A place on the screen `reach` pixels from Wildstar's body, in the first of these directions that
 * has open ground there, so a press lands on the ground and not on a prop or a friend. Null when
 * none has.
 */
async function findOpenGround(
  page: Page,
  reach: number,
  directions: readonly Pt[],
): Promise<{ at: Pt; dir: Pt } | null> {
  const body = await bodyOnScreen(page);
  const size = page.viewportSize()!;
  for (const dir of directions) {
    const at = { x: body.x + dir.x * reach, y: body.y + dir.y * reach };
    if (at.x < 8 || at.y < 8 || at.x > size.width - 8 || at.y > size.height - 8) continue;
    const thing = await page.evaluate((c) => window.__ua!.controller.thingAt(window.__ua!.controller.toWorld(c)), at);
    if (!thing) return { at, dir };
  }
  return null;
}

async function openGroundFrom(page: Page, reach: number): Promise<{ at: Pt; dir: Pt }> {
  const found = await findOpenGround(page, reach, AXES);
  if (!found) throw new Error('no open ground to press on around Wildstar');
  return found;
}

/**
 * The four slopes between the ways of the compass she is led in, with how each is drawn: the two on
 * her east are the two on her west, turned about her feet.
 */
const DIAGONALS = [
  { facing: SOUTHEAST, dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 }, flipped: true },
  { facing: SOUTHWEST, dir: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, flipped: false },
  { facing: NORTHEAST, dir: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, flipped: true },
  { facing: NORTHWEST, dir: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, flipped: false },
] as const;

test.describe('leading Wildstar by holding', () => {
  test.setTimeout(300_000);

  test('a finger held on the ground leads her toward it, and she stops when it lifts', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const before = await leader(page);
    const { at, dir } = await openGroundFrom(page, 180);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await step(page, 1.2);
    const walking = await leader(page);
    expect(walking.phase).toBe('steering');
    // She went the way the finger was, at about her pace, with the picture of it drawn to match.
    const along = (walking.x - before.x) * dir.x + (walking.y - before.y) * dir.y;
    expect(along).toBeGreaterThan(120);
    expect(walking.clip).toBe('walk');
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);

    await keepDown(page);
    await page.mouse.up();
    await step(page, 1);
    const stopped = await leader(page);
    expect(stopped.speed).toBe(0);
    expect(stopped.phase).toBe('idle');
    expect(stopped.clip).toBe('idle');
    // And she is where she stopped, not on her way back to where the finger came down.
    await step(page, 1);
    const later = await leader(page);
    expect(Math.hypot(later.x - stopped.x, later.y - stopped.y)).toBeLessThan(1);
  });

  test('a finger held on a slope leads her facing it, and she stops facing it, in the picture drawn for that way', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const home = await page.evaluate(() => ({ ...window.__ua!.controller.world.unicorns.wildstar!.pos }));
    const tried: string[] = [];
    for (const { facing, dir, flipped } of DIAGONALS) {
      const label = facingLabel(facing);
      await standAt(page, home);
      await hush(page);
      const found = await findOpenGround(page, 200, [dir]);
      if (!found) continue;
      tried.push(label);
      const before = await leader(page);

      await page.mouse.move(found.at.x, found.at.y);
      await page.mouse.down();
      await step(page, 1);
      const walking = await leader(page);
      expect(walking.phase, label).toBe('steering');
      expect(
        (walking.x - before.x) * dir.x + (walking.y - before.y) * dir.y,
        `${label} distance along the slope`,
      ).toBeGreaterThan(80);
      expect(walking, label).toMatchObject({ clip: 'walk', facing });
      const walked = await pictureOf(page, 'wildstar');
      // What is on the screen is the walk of that way, and the ways on her east are her west turned
      // over.
      expect(walked, label).toMatchObject({ clip: 'walk', facing, flipX: flipped });
      expect(walked.clipFrames, label).toContain(walked.frame);

      await keepDown(page);
      await page.mouse.up();
      await step(page, 1);
      expect(await leader(page), label).toMatchObject({ speed: 0, phase: 'idle', clip: 'idle', facing });
      const stood = await pictureOf(page, 'wildstar');
      expect(stood, label).toMatchObject({ clip: 'idle', facing, flipX: flipped });
      expect(stood.clipFrames, label).toContain(stood.frame);
      expect(await page.evaluate(() => window.__ua!.invariants()), label).toEqual([]);
    }
    // A thicket can stand on one of the slopes at the place she starts, and not on three.
    expect(tried.length, `slopes with open ground: ${tried.join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  test('she follows the finger round a new corner when it is dragged', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const first = await openGroundFrom(page, 180);
    const before = await leader(page);

    await page.mouse.move(first.at.x, first.at.y);
    await page.mouse.down();
    await step(page, 0.8);
    const mid = await leader(page);
    // The finger swings round to the opposite side of her.
    const body = await bodyOnScreen(page);
    const behind = { x: body.x - first.dir.x * 200, y: body.y - first.dir.y * 200 };
    await page.mouse.move(behind.x, behind.y);
    await step(page, 1.6);
    const after = await leader(page);
    await page.mouse.up();

    const outward = (mid.x - before.x) * first.dir.x + (mid.y - before.y) * first.dir.y;
    const back = (after.x - mid.x) * first.dir.x + (after.y - mid.y) * first.dir.y;
    expect(outward).toBeGreaterThan(80);
    // She turned on the way, so some of the second leg went back the other way.
    expect(back).toBeLessThan(-40);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('a quick tap on the ground still sends her to the spot, and goes on after the finger is up', async ({
    page,
  }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const { at } = await openGroundFrom(page, 220);
    const target = await page.evaluate((c) => window.__ua!.controller.toWorld(c), at);
    await page.mouse.click(at.x, at.y);
    await step(page, 0.3);
    const going = await leader(page);
    expect(going.phase).not.toBe('idle');
    await step(page, 6);
    const arrived = await leader(page);
    expect(Math.hypot(arrived.x - target.x, arrived.y - target.y)).toBeLessThan(60);
    expect(arrived.phase).toBe('idle');
  });

  test('a press on a friend that stays down leads her toward the friend, and is not a tap', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    const leaf = await page.evaluate(
      () => window.__ua!.controller.world.map.encounters.find((x) => x.unicornId === 'leaf')!.home,
    );
    // Far enough that she is not found by walking up to her before the press (her trigger radius is
    // 160), near enough that she is on the screen. A phone held sideways is wide and short, so
    // there the gap is sideways.
    const size = page.viewportSize()!;
    const sideways = size.width - 120 > size.height - 120;
    const want = sideways ? { x: leaf.x - 280, y: leaf.y } : { x: leaf.x - 40, y: leaf.y + 280 };
    const spot = await page.evaluate((p) => window.__ua!.controller.world.nav.freePointNear(p, [], 0, 120), want);
    if (!spot) throw new Error('no open ground to stand on away from Leaf');
    await standAt(page, spot);
    const before = await leader(page);
    expect(Math.hypot(before.x - leaf.x, before.y - leaf.y)).toBeGreaterThan(200);
    const body = await bodyOf(page, 'leaf');
    const at = await page.evaluate((p) => window.__ua!.controller.toScreen(p), body);
    expect(at.x).toBeGreaterThan(20);
    expect(at.x).toBeLessThan(size.width - 20);
    expect(at.y).toBeGreaterThan(20);
    expect(at.y).toBeLessThan(size.height - 20);
    expect(await page.evaluate((p) => window.__ua!.controller.thingAt(p), body)).toBe(true);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    // The game is frozen, but the finger's clock is real: it has to stay down long enough to count
    // as a hold. The next frame promotes the press to a lead, and the steps after it carry her.
    await page.waitForTimeout(500);
    await step(page, 0.1);
    expect(
      await page.evaluate(() => (window.__ua!.controller as unknown as { finger: unknown }).finger),
    ).not.toBeNull();
    await step(page, 0.8);
    const walking = await leader(page);
    // A tap on a friend sends her to the friend by a route to the greeting. A hold is a lead, with
    // no goal.
    expect(walking.phase).toBe('steering');
    expect(walking.goal).toBeNull();
    expect(Math.hypot(walking.x - before.x, walking.y - before.y)).toBeGreaterThan(60);
    await page.mouse.up();
    await step(page, 1);
    expect((await leader(page)).phase).toBe('idle');
  });
});

test.describe('leading Wildstar with the keys', () => {
  test.setTimeout(300_000);

  test('WASD and the arrows lead her while they are down, and a key that is let go stops her', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const before = await leader(page);

    await page.keyboard.down('KeyD');
    await step(page, 1);
    const east = await leader(page);
    expect(east.x - before.x).toBeGreaterThan(100);
    expect(east.phase).toBe('steering');

    await page.keyboard.down('KeyS');
    await step(page, 0.4);
    // Two keys lead her down the slope between them, and she walks facing it, and not facing one of
    // the two.
    expect(await leader(page)).toMatchObject({ clip: 'walk', facing: SOUTHEAST });
    const slope = await pictureOf(page, 'wildstar');
    expect(slope).toMatchObject({ clip: 'walk', facing: SOUTHEAST, flipX: true });
    expect(slope.clipFrames).toContain(slope.frame);
    await step(page, 0.6);
    const southEast = await leader(page);
    expect(southEast.y - east.y).toBeGreaterThan(40);

    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    await step(page, 1);
    const stopped = await leader(page);
    expect(stopped.speed).toBe(0);
    expect(stopped.phase).toBe('idle');
    expect(stopped.facing).toBe(SOUTHEAST);

    await page.keyboard.down('ArrowLeft');
    await step(page, 0.6);
    await page.keyboard.up('ArrowLeft');
    await step(page, 1);
    const west = await leader(page);
    expect(west.x).toBeLessThan(stopped.x - 40);
    expect(west.facing).toBe(WEST);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
  });

  test('a key typed with a modifier, or into a text box, does not lead her', async ({ page }) => {
    await openGame(page);
    await play(page);
    await freeze(page);
    await step(page, 1);
    const before = await leader(page);

    await page.keyboard.down('Control');
    await page.keyboard.down('KeyD');
    await step(page, 1);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('Control');
    expect((await leader(page)).phase).toBe('idle');

    await page.evaluate(() => {
      const box = document.createElement('input');
      box.id = 'typing-test';
      box.type = 'text';
      document.body.append(box);
      box.focus();
    });
    await page.keyboard.down('KeyW');
    await step(page, 1);
    await page.keyboard.up('KeyW');
    const after = await leader(page);
    expect(after.phase).toBe('idle');
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
    expect(await page.inputValue('#typing-test')).toBe('w');
  });
});
