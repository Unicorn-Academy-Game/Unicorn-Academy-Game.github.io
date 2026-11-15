import { expect, type Page, test } from '@playwright/test';
import { drumOf, KIT } from '../../src/shared/kit';
import {
  audioStats,
  befriend,
  freeze,
  hush,
  openGame,
  PATIENCE,
  play,
  SCRATCH,
  shot,
  standAt,
  step,
  tapWorld,
  untilOpen,
  watchConsole,
} from './helpers';

/** The piano by the palace, which opens the tone matrix. */
const PIANO = 'palace-garden/piano-1';
/** What a phone held sideways shows, and one held upright. */
const SIDEWAYS = { width: 863, height: 360 };
const UPRIGHT = { width: 360, height: 780 };

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The three parts of the song, in the order of their tabs. */
type PartId = 'melody' | 'beat' | 'bass';
const PART_IDS: readonly PartId[] = ['melody', 'beat', 'bass'];

interface Tile {
  readonly x: number;
  readonly y: number;
}

interface MatrixView {
  readonly plan: {
    readonly grid: Box & { readonly tw: number; readonly th: number };
    readonly panel: Box;
    readonly keys: Box & { readonly th: number };
    readonly buttons: readonly {
      readonly id: 'wand' | 'broom' | 'hare' | 'turtle';
      readonly x: number;
      readonly y: number;
      readonly r: number;
    }[];
    readonly tabs: readonly (Box & { readonly id: PartId })[];
  };
  /** The part that is on the glass, and its tiles and tune. */
  readonly active: PartId;
  readonly tiles: readonly Tile[];
  readonly parts: Readonly<
    Record<PartId, { readonly tiles: readonly Tile[]; readonly tune: string; readonly focus: number }>
  >;
  readonly playhead: number;
  readonly speed: number;
  readonly tune: string;
  readonly sparks: number;
  readonly held: number;
  readonly tempoScale: number;
  readonly rung: number;
  readonly view: { readonly w: number; readonly h: number; readonly unit: number };
}

const stateOf = (page: Page) => page.evaluate(() => window.__ua!.wonders.state);
const stepGame = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((s) => window.__ua!.wonders.inside!.stage.step(s), seconds);

/**
 * What the game inside the overlay says about itself, read inside the page because a method on a
 * class does not cross to the test.
 */
const matrix = (page: Page): Promise<MatrixView> =>
  page.evaluate(() => {
    const inside = window.__ua!.wonders.inside!;
    const game = inside.wonder as unknown as { inspect(): Omit<MatrixView, 'view'> };
    const { w, h, unit } = inside.stage.view;
    return { ...game.inspect(), view: { w, h, unit } };
  });

/**
 * Opens the game the way a child does: the leader is on the lawn in front of the piano by the
 * palace and a finger taps the piano. She walks the last of the way herself, the piano plays its
 * run of lights, and the game opens from it. The walk is the world's time, which is stepped by
 * hand, and the game opens when a real timer ends the run, 0.8125 s on. So the wait is in real time
 * and steps the world as it goes. Waiting a fixed number of game seconds lost the race on a quiet
 * machine, where 20 steps take less than that.
 */
async function openFromPiano(
  page: Page,
  friends: readonly string[] = [],
  beforeTap?: () => Promise<void>,
): Promise<void> {
  await openGame(page);
  await play(page);
  await freeze(page);
  await beforeTap?.();
  for (const id of friends) await befriend(page, id);
  await page.evaluate(() => window.__ua!.controller.travel({ mapId: 'palace-garden', spawnId: 'from-forest' }));
  await hush(page);
  await step(page, 1.5);
  const where = await page.evaluate((id) => {
    const { world } = window.__ua!.controller;
    const { pos, hit } = world.interactables.get(id)!;
    return {
      stand: world.nav.freePointNear({ x: pos.x, y: pos.y + 150 }, [], 0, 90),
      keys: { x: hit.x + hit.w / 2, y: hit.y + hit.h * 0.62 },
    };
  }, PIANO);
  if (!where.stand) throw new Error('no open ground in front of the piano');
  await standAt(page, where.stand);
  await tapWorld(page, where.keys);
  await expect
    .poll(
      async () => {
        await step(page, 1);
        return page.evaluate(() => window.__ua!.wonders.isOpen);
      },
      { message: 'the game to start opening', timeout: 30_000 * PATIENCE, intervals: [50] },
    )
    .toBe(true);
  await untilOpen(page);
}

async function closeGame(page: Page): Promise<void> {
  await page.locator('.wonder-done').click();
  await expect.poll(() => page.evaluate(() => window.__ua!.wonders.isOpen), { timeout: 20_000 }).toBe(false);
}

/** The middle of a tile, a key or a button, in the game's units. */
const tileAt = (v: MatrixView, x: number, y: number): { x: number; y: number } => ({
  x: v.plan.grid.x + (x + 0.5) * v.plan.grid.tw,
  y: v.plan.grid.y + (y + 0.5) * v.plan.grid.th,
});
const keyAt = (v: MatrixView, row: number): { x: number; y: number } => ({
  x: v.plan.keys.x + v.plan.keys.w / 2,
  y: v.plan.keys.y + (row + 0.5) * v.plan.keys.th,
});
const buttonOf = (v: MatrixView, id: MatrixView['plan']['buttons'][number]['id']): { x: number; y: number } =>
  v.plan.buttons.find((b) => b.id === id)!;

/** A real finger down, along a line and up, at places in the game's units. */
async function stroke(
  page: Page,
  unit: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x * unit, from.y * unit);
  await page.mouse.down();
  await page.mouse.move(to.x * unit, to.y * unit, { steps: 14 });
  await page.mouse.up();
}

const press = async (page: Page, unit: number, at: { x: number; y: number }): Promise<void> =>
  page.mouse.click(at.x * unit, at.y * unit);

/** Clears the grid with the broom, so that what a stroke does is the only thing on it. */
async function clearGrid(page: Page): Promise<MatrixView> {
  const v = await matrix(page);
  await press(page, v.view.unit, buttonOf(v, 'broom'));
  await stepGame(page, 0.3);
  expect((await matrix(page)).tiles, 'the broom clears the grid').toHaveLength(0);
  return matrix(page);
}

const rowOf = (v: MatrixView, y: number): number[] =>
  v.tiles
    .filter((t) => t.y === y)
    .map((t) => t.x)
    .sort((a, b) => a - b);
const stepOf = (v: MatrixView, x: number): number[] =>
  v.tiles
    .filter((t) => t.x === x)
    .map((t) => t.y)
    .sort((a, b) => a - b);

/** The middle of a tab, in the game's units. */
const tabAt = (v: MatrixView, id: PartId): { x: number; y: number } => {
  const t = v.plan.tabs.find((q) => q.id === id)!;
  return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
};

/** Touches the tab of a part, and waits for it to come onto the glass. */
async function show(page: Page, id: PartId): Promise<MatrixView> {
  const v = await matrix(page);
  await press(page, v.view.unit, tabAt(v, id));
  await stepGame(page, 0.4);
  const now = await matrix(page);
  expect(now.active, `the ${id} tab brings the ${id} onto the glass`).toBe(id);
  return now;
}

interface Heard {
  readonly voice: string;
  readonly midi: number;
  readonly gain: number;
}

/**
 * Writes down every note that is asked of the synth from now on, which is how a test hears what the
 * song and her fingers play. Called before the tap on the piano it hears from the start.
 */
const listen = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const synth = window.__ua!.synth as unknown as {
      note(voice: string, midi: number, options?: { gain?: number }): void;
    };
    const notes: Heard[] = [];
    (window as unknown as { __notes: Heard[] }).__notes = notes;
    const real = synth.note.bind(synth);
    synth.note = (voice, midi, options) => {
      notes.push({ voice, midi, gain: options?.gain ?? 1 });
      real(voice, midi, options);
    };
  });

/** The notes asked of the synth since the last time this was asked, or since `listen`. */
const heard = (page: Page): Promise<Heard[]> =>
  page.evaluate(() => {
    const notes = (window as unknown as { __notes: Heard[] }).__notes;
    return notes.splice(0, notes.length);
  });

const VOICE_OF: Readonly<Record<PartId, string>> = { melody: 'ping', beat: 'kit', bass: 'sub' };

test.describe('the tone matrix', () => {
  test('opens from the piano by the palace with a tune already on the grid, sixteen keys and four buttons, all clear of what the page draws', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    await expect(page.getByRole('dialog', { name: 'A piano of lights that plays a song' })).toBeVisible();
    await expect(page.locator('.wonder-stars'), 'there are no stars to show').toBeHidden();
    await stepGame(page, 3);
    await shot(page, `${SCRATCH}/matrix-open.png`);

    const v = await matrix(page);
    const { plan, view } = v;
    expect(v.tune, 'the music box tune is the first').toBe('box');
    expect(v.tiles.length, 'a tune to hear before a finger has touched').toBeGreaterThan(5);
    expect(v.playhead, 'the playhead is going round').toBeGreaterThanOrEqual(0);
    expect(plan.buttons.map((b) => b.id)).toEqual(['wand', 'broom', 'hare', 'turtle']);
    for (const b of plan.buttons)
      expect(b.r * 2 * view.unit, `${b.id} is as big as a thumb`).toBeGreaterThanOrEqual(44);
    for (const box of [plan.panel, plan.keys]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(view.w);
      expect(box.y + box.h).toBeLessThanOrEqual(view.h);
    }

    // The page's own buttons are not over the tiles, the keys or the buttons of the game.
    const over = await page.evaluate(
      ({ unit, rects }) => {
        const overlap = (a: DOMRect, r: { x: number; y: number; w: number; h: number }): boolean =>
          a.left < (r.x + r.w) * unit && a.right > r.x * unit && a.top < (r.y + r.h) * unit && a.bottom > r.y * unit;
        const own = [...document.querySelectorAll('.wonder-done')].map((el) => ({
          name: el.className,
          rect: el.getBoundingClientRect(),
        }));
        return own.flatMap((o) => rects.filter((r) => overlap(o.rect, r.box)).map((r) => `${o.name} over ${r.name}`));
      },
      {
        unit: view.unit,
        rects: [
          { name: 'the tiles', box: plan.grid },
          { name: 'the keys', box: plan.keys },
          ...plan.buttons.map((b) => ({ name: b.id, box: { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 } })),
        ],
      },
    );
    expect(over).toEqual([]);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('is painted with a finger, rubbed out by a finger that starts on a lit tile, and each tile painted rings its note', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const empty = await clearGrid(page);
    const { unit } = empty.view;

    await stroke(page, unit, tileAt(empty, 2, 8), tileAt(empty, 9, 8));
    await stepGame(page, 0.2);
    const painted = await matrix(page);
    expect(rowOf(painted, 8), 'a stroke across empty tiles lights every tile it crosses').toEqual([
      2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(painted.rung, 'the notes she painted rang').toBeGreaterThan(0);
    expect(painted.rung, 'and never as a buzz, which the game does not allow').toBeLessThanOrEqual(9);
    await shot(page, `${SCRATCH}/matrix-painted.png`);

    // The first tile decides: a stroke that starts on a lit tile rubs out, and goes on rubbing out
    // over the tiles that are dark.
    await stroke(page, unit, tileAt(painted, 5, 8), tileAt(painted, 12, 8));
    await stepGame(page, 0.2);
    expect(
      rowOf(await matrix(page), 8),
      'tiles from the one she started on are gone, and the dark ones she crossed were not lit',
    ).toEqual([2, 3, 4]);

    // And a stroke that starts on a dark tile paints, and leaves the lit tiles it crosses lit.
    await stroke(page, unit, tileAt(painted, 13, 8), tileAt(painted, 3, 8));
    await stepGame(page, 0.2);
    expect(rowOf(await matrix(page), 8)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('has keys that ring the notes, one for a touch and a run for a finger that slides along them', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const v = await clearGrid(page);
    const { unit } = v.view;
    const before = (await matrix(page)).rung;

    await press(page, unit, keyAt(v, 12));
    await stepGame(page, 0.3);
    expect((await matrix(page)).rung - before, 'one key, one note').toBe(1);

    await stroke(page, unit, keyAt(v, 14), keyAt(v, 5));
    await stepGame(page, 0.3);
    const run = (await matrix(page)).rung - before - 1;
    expect(run, 'a run of notes, as many as the game lets ring').toBeGreaterThanOrEqual(4);
    expect(run).toBeLessThanOrEqual(9);
    expect((await matrix(page)).tiles, 'the keys play and paint nothing').toHaveLength(0);
    await shot(page, `${SCRATCH}/matrix-keys.png`);

    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('has a wand for a new tune, a broom to clear it, and a hare and a turtle for the speed of the music', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const v = await matrix(page);
    const { unit } = v.view;
    const tunes = [v.tune];

    for (let i = 0; i < 5; i++) {
      await press(page, unit, buttonOf(v, 'wand'));
      await stepGame(page, 0.5);
      tunes.push((await matrix(page)).tune);
    }
    expect(tunes.slice(0, 5), 'five different tunes').toHaveLength(new Set(tunes.slice(0, 5)).size);
    expect(tunes[5], 'and the fifth wand takes her back to the first').toBe(tunes[0]);
    expect((await matrix(page)).tiles.length, 'the first tune is on the grid again').toBeGreaterThan(5);

    expect((await matrix(page)).tempoScale, 'the music starts at the middle speed').toBe(1);
    await press(page, unit, buttonOf(v, 'turtle'));
    await stepGame(page, 0.2);
    expect((await matrix(page)).tempoScale, 'the turtle slows it').toBeLessThan(1);
    await press(page, unit, buttonOf(v, 'turtle'));
    expect((await matrix(page)).speed, 'there is no slower than the slowest, and the turtle only shakes').toBe(0);
    await press(page, unit, buttonOf(v, 'hare'));
    await press(page, unit, buttonOf(v, 'hare'));
    await stepGame(page, 1.2);
    expect((await matrix(page)).tempoScale, 'the hare, twice, is the quickest').toBeGreaterThan(1);
    await press(page, unit, buttonOf(v, 'hare'));
    expect((await matrix(page)).speed).toBe(2);

    await press(page, unit, buttonOf(v, 'broom'));
    await stepGame(page, 0.3);
    expect((await matrix(page)).tiles, 'the broom').toHaveLength(0);
    await shot(page, `${SCRATCH}/matrix-cleared.png`);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('lets two fingers at once each do their own thing, one rubbing out where the other paints', async ({ page }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const v = await clearGrid(page);
    await stroke(page, v.view.unit, tileAt(v, 1, 3), tileAt(v, 14, 3));
    expect(rowOf(await matrix(page), 3)).toHaveLength(14);

    // One finger goes down on a lit tile of the row and another on an empty row, and they move
    // together.
    await page.evaluate(
      ({ a, b, a2, b2 }) => {
        const { stage } = window.__ua!.wonders.inside!;
        stage.inject('down', 31, a.x, a.y);
        stage.inject('down', 32, b.x, b.y);
        for (let i = 1; i <= 8; i++) {
          stage.step(0.016);
          stage.inject('move', 31, a.x + ((a2.x - a.x) * i) / 8, a.y);
          stage.inject('move', 32, b.x + ((b2.x - b.x) * i) / 8, b.y);
        }
        stage.inject('up', 31, a2.x, a2.y);
        stage.inject('up', 32, b2.x, b2.y);
      },
      { a: tileAt(v, 2, 3), a2: tileAt(v, 8, 3), b: tileAt(v, 2, 11), b2: tileAt(v, 8, 11) },
    );
    const now = await matrix(page);
    expect(rowOf(now, 3), 'the first finger rubbed out its part of the row').toEqual([1, 9, 10, 11, 12, 13, 14]);
    expect(rowOf(now, 11), 'the second painted its own row at the same time').toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(now.held, 'both fingers are lifted').toBe(0);

    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('has a tab for each part of the song, as big as a thumb and clear of the tiles, the keys, the buttons and the page, with the melody on the glass', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    await expect(page.getByRole('dialog', { name: 'A piano of lights that plays a song' })).toBeVisible();
    const v = await matrix(page);
    const { plan, view } = v;
    expect(
      plan.tabs.map((t) => t.id),
      'the melody, the beat and the bass, in that order',
    ).toEqual(PART_IDS);
    expect(v.active).toBe('melody');
    expect(
      PART_IDS.map((id) => v.parts[id].tune),
      'each part opens on the first of its own tunes',
    ).toEqual(['box', 'pulse', 'bounce']);
    for (const id of PART_IDS)
      expect(v.parts[id].tiles.length, `the ${id} has something to hear before a finger has touched`).toBeGreaterThan(
        2,
      );

    const overlaps = (a: Box, b: Box): boolean =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const others = [
      { name: 'the tiles', box: plan.grid },
      { name: 'the keys', box: plan.keys },
      ...plan.buttons.map((b) => ({ name: b.id, box: { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 } })),
    ];
    for (const t of plan.tabs) {
      expect(t.w * view.unit, `the ${t.id} tab is as wide as a thumb`).toBeGreaterThanOrEqual(44);
      expect(t.h * view.unit, `the ${t.id} tab is as tall as a thumb`).toBeGreaterThanOrEqual(44);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(view.w);
      expect(t.y + t.h).toBeLessThanOrEqual(view.h);
      for (const o of others) expect(overlaps(t, o.box), `the ${t.id} tab over ${o.name}`).toBe(false);
    }
    for (const [i, a] of plan.tabs.entries())
      for (const b of plan.tabs.slice(i + 1))
        expect(overlaps(a, b), `the ${a.id} tab over the ${b.id} tab`).toBe(false);

    const over = await page.evaluate(
      ({ unit, tabs }) => {
        const own = [...document.querySelectorAll('.wonder-done')].map((el) => ({
          name: el.className,
          rect: el.getBoundingClientRect(),
        }));
        return own.flatMap((o) =>
          tabs
            .filter(
              (t) =>
                o.rect.left < (t.x + t.w) * unit &&
                o.rect.right > t.x * unit &&
                o.rect.top < (t.y + t.h) * unit &&
                o.rect.bottom > t.y * unit,
            )
            .map((t) => `${o.name} over the ${t.id} tab`),
        );
      },
      { unit: view.unit, tabs: plan.tabs },
    );
    expect(over, 'the page draws nothing over the tabs').toEqual([]);
    await shot(page, `${SCRATCH}/matrix-tabs.png`);
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('puts a part on the glass when its tab is touched, and each part keeps what is on it while the others are shown', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const start = await matrix(page);
    const { unit } = start.view;

    for (const id of ['beat', 'bass', 'melody'] as const) {
      const v = await show(page, id);
      expect(v.tune, `the ${id} is on the glass with its own tune`).toBe(start.parts[id].tune);
      expect(v.tiles, `and its own tiles`).toEqual(start.parts[id].tiles);
      await shot(page, `${SCRATCH}/matrix-tab-${id}.png`);
    }

    // What she paints is on the part on the glass and on no other.
    const beat = await show(page, 'beat');
    await press(page, unit, buttonOf(beat, 'broom'));
    await stepGame(page, 0.3);
    const cleared = await matrix(page);
    expect(cleared.tiles, 'the broom clears the part on the glass').toHaveLength(0);
    expect(cleared.parts.melody.tiles, 'and not the melody').toEqual(start.parts.melody.tiles);
    expect(cleared.parts.bass.tiles, 'and not the bass').toEqual(start.parts.bass.tiles);
    await stroke(page, unit, tileAt(cleared, 2, 9), tileAt(cleared, 6, 9));
    await stepGame(page, 0.2);
    const painted = await matrix(page);
    expect(rowOf(painted, 9), 'a stroke paints the beat').toEqual([2, 3, 4, 5, 6]);
    expect(painted.parts.melody.tiles).toEqual(start.parts.melody.tiles);
    expect(painted.parts.bass.tiles).toEqual(start.parts.bass.tiles);

    // A new tune from the wand is a tune of the part on the glass.
    await press(page, unit, buttonOf(painted, 'wand'));
    await stepGame(page, 0.5);
    const wanded = await matrix(page);
    expect(wanded.tune, 'the wand gave the beat a groove').not.toBe('pulse');
    expect(wanded.parts.melody.tune, 'and left the melody alone').toBe('box');
    expect(wanded.parts.bass.tune).toBe('bounce');

    // A touch on the tab of the part that is on the glass changes nothing.
    await press(page, unit, tabAt(wanded, 'beat'));
    await stepGame(page, 0.3);
    expect((await matrix(page)).tiles).toEqual(wanded.tiles);

    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('plays the melody, the beat and the bass together in one loop, whichever part is on the glass', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page, [], () => listen(page));
    await stepGame(page, 4.5);
    const count = (notes: readonly Heard[], voice: string): number => notes.filter((n) => n.voice === voice).length;
    const opening = await heard(page);
    for (const id of PART_IDS)
      expect(count(opening, VOICE_OF[id]), `the ${id} plays in the first two bars`).toBeGreaterThan(4);
    expect(new Set(opening.map((n) => n.voice)), 'and nothing else does').toEqual(new Set(Object.values(VOICE_OF)));
    const midis = (voice: string): number[] => opening.filter((n) => n.voice === voice).map((n) => n.midi);
    expect(
      midis('kit').every((m) => drumOf(m) !== undefined),
      'every note of the beat is a drum of the kit',
    ).toBe(true);
    expect(new Set(midis('kit')).size, 'a beat is more than one drum').toBeGreaterThanOrEqual(3);
    expect(Math.min(...midis('sub')), 'the bass is the low notes, from G1').toBeGreaterThanOrEqual(31);
    expect(Math.max(...midis('sub')), 'and goes no higher than G4').toBeLessThanOrEqual(67);
    expect(Math.min(...midis('ping')), 'the melody is above the bass, from G3').toBeGreaterThanOrEqual(55);

    for (const id of ['beat', 'bass'] as const) {
      await show(page, id);
      await heard(page);
      await stepGame(page, 4.5);
      const notes = await heard(page);
      for (const other of PART_IDS)
        expect(
          count(notes, VOICE_OF[other]),
          `the ${other} goes on playing with the ${id} on the glass`,
        ).toBeGreaterThan(4);
    }
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('has keys that ring the instrument of the part on the glass, a drum of the kit for the beat and a bass note for the bass', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page, [], () => listen(page));
    const bottom = 15;
    for (const id of PART_IDS) {
      const v = await show(page, id);
      await press(page, v.view.unit, buttonOf(v, 'broom'));
      await stepGame(page, 0.3);
      // With the part empty, and the other two playing their own instruments, every note of this
      // part's instrument is a note of hers.
      await heard(page);
      await press(page, v.view.unit, keyAt(v, bottom));
      await stepGame(page, 0.05);
      const mine = (await heard(page)).filter((n) => n.voice === VOICE_OF[id]);
      expect(mine, `one key of the ${id}, one note`).toHaveLength(1);
      if (id === 'beat') expect(mine[0]!.midi, 'the bottom key of the beat is the kick').toBe(KIT.kick);
      if (id === 'bass') expect(mine[0]!.midi, 'the bottom key of the bass is G1').toBe(31);
    }
    // And the top key of the beat is the crash, as it is in the kit.
    const v = await show(page, 'beat');
    await heard(page);
    await press(page, v.view.unit, keyAt(v, 0));
    await stepGame(page, 0.05);
    expect(
      (await heard(page)).find((n) => n.voice === 'kit' && n.midi === KIT.crash),
      'the top key of the beat is the crash',
    ).toBeDefined();
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('keeps the bass to one note at a time, so that a tile painted in a step puts out the one that was there', async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await openFromPiano(page);
    const bass = await show(page, 'bass');
    const { unit } = bass.view;
    await press(page, unit, buttonOf(bass, 'broom'));
    await stepGame(page, 0.3);

    // A finger down a step goes through many rows and leaves the last of them.
    await stroke(page, unit, tileAt(bass, 5, 3), tileAt(bass, 5, 10));
    await stepGame(page, 0.2);
    expect(stepOf(await matrix(page), 5), 'one note in the step, the last the finger was on').toEqual([10]);
    // A tile in another row of the same step takes its place.
    await press(page, unit, tileAt(bass, 5, 6));
    await stepGame(page, 0.2);
    expect(stepOf(await matrix(page), 5), 'a tap in another row of the step').toEqual([6]);
    // Rubbing it out leaves the step with none, and a line of notes is a note in each of its steps.
    await stroke(page, unit, tileAt(bass, 1, 12), tileAt(bass, 8, 12));
    await stepGame(page, 0.2);
    const line = await matrix(page);
    for (let x = 1; x <= 8; x++) expect(stepOf(line, x), `step ${x}`).toEqual([12]);
    expect(
      Math.max(...Array.from({ length: 16 }, (_, x) => stepOf(line, x).length)),
      'no step has two notes',
    ).toBeLessThanOrEqual(1);

    // The same two strokes on the melody, which is not one note at a time, keep every tile.
    const melody = await show(page, 'melody');
    await press(page, unit, buttonOf(melody, 'broom'));
    await stepGame(page, 0.3);
    await stroke(page, unit, tileAt(melody, 5, 3), tileAt(melody, 5, 10));
    await stepGame(page, 0.2);
    expect(stepOf(await matrix(page), 5), 'a step of the melody holds every tile the finger crossed').toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    await closeGame(page);
    expect(noise).toEqual([]);
  });

  test('has nothing to earn: no stars, no pointing hand, no finale, whatever the player does and however long they wait', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openFromPiano(page);
    const hand = (): Promise<unknown> =>
      page.evaluate(() => (window.__ua!.wonders.inside!.wonder as unknown as { hint(): unknown }).hint());
    expect(await hand(), 'no hand shows where to begin').toBeNull();
    await expect(page.locator('.wonder-stars')).toBeHidden();
    await stepGame(page, 12);
    expect(await hand(), 'and none comes when she waits').toBeNull();

    // Every kind of play there is, on every part, and the game is where it was: still playing, with
    // nothing earned.
    for (const id of PART_IDS) {
      const v = await show(page, id);
      for (let row = 15; row >= 0; row -= 3) {
        await stroke(page, v.view.unit, tileAt(v, 1, row), tileAt(v, 14, row));
        await press(page, v.view.unit, keyAt(v, row));
      }
      for (const b of ['wand', 'wand', 'hare', 'turtle', 'broom'] as const)
        await press(page, v.view.unit, buttonOf(v, b));
      await stepGame(page, 1);
    }
    await page.evaluate(() => window.__ua!.wonders.inside!.wonder.celebrate());
    await stepGame(page, 30);
    expect(await stateOf(page), 'no star, and no finale or end of the game').toMatchObject({ stars: 0, phase: 'play' });
    expect(await hand()).toBeNull();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeHidden();
    const again = await clearGrid(page);
    await stroke(page, again.view.unit, tileAt(again, 4, 9), tileAt(again, 8, 9));
    expect(rowOf(await matrix(page), 9), 'and she can go on painting').toEqual([4, 5, 6, 7, 8]);
    await stepGame(page, 0.3);
    await shot(page, `${SCRATCH}/matrix-played.png`);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('makes no sound but the notes of the song, with the music of the world off under it and back after', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    // Writes down every sound the game and the screen around it ask of the synth, from before the
    // tap on the piano.
    await openFromPiano(page, [], () =>
      page.evaluate(() => {
        const synth = window.__ua!.synth as unknown as Record<'fx' | 'note', (...args: unknown[]) => void>;
        const heard: string[] = [];
        (window as unknown as { __heard: string[] }).__heard = heard;
        for (const kind of ['fx', 'note'] as const) {
          const real = synth[kind].bind(synth);
          synth[kind] = (...args) => {
            heard.push(`${kind}:${String(args[0])}`);
            real(...args);
          };
        }
      }),
    );
    expect((await audioStats(page)).worldShare, 'the music of the world is off while the piano is open').toBe(0);

    const v = await clearGrid(page);
    await stroke(page, v.view.unit, tileAt(v, 1, 5), tileAt(v, 9, 5));
    await press(page, v.view.unit, keyAt(v, 6));
    for (const id of ['wand', 'broom', 'hare', 'turtle'] as const) {
      await press(page, v.view.unit, buttonOf(v, id));
      await stepGame(page, 0.3);
    }
    // The tabs, and a stroke, a key and a wand on each of the other two parts, which have their own
    // instruments and nothing else.
    for (const id of ['beat', 'bass'] as const) {
      const part = await show(page, id);
      await stroke(page, part.view.unit, tileAt(part, 2, 4), tileAt(part, 7, 9));
      await press(page, part.view.unit, keyAt(part, 3));
      await press(page, part.view.unit, buttonOf(part, 'wand'));
      await stepGame(page, 0.3);
    }
    await stepGame(page, 4);
    await closeGame(page);

    const heard = await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);
    expect(heard.length, 'the song did ring').toBeGreaterThan(10);
    expect(
      [...new Set(heard)].sort(),
      'every sound asked of the synth is a note of the melody, the beat or the bass',
    ).toEqual(['note:kit', 'note:ping', 'note:sub']);
    await expect.poll(async () => (await audioStats(page)).worldShare, { timeout: 20_000 }).toBe(1);
    expect(noise).toEqual([]);
  });

  test("keeps the grid, the keys and the buttons whole on the screen when the phone is turned upright and back, and keeps the player's tune", async ({
    page,
  }) => {
    const noise = watchConsole(page);
    await page.setViewportSize(SIDEWAYS);
    await openFromPiano(page);
    const before = await matrix(page);

    await page.setViewportSize(UPRIGHT);
    await expect
      .poll(async () => (await matrix(page)).view.h, { message: 'the game seeing the new shape of the screen' })
      .toBeGreaterThan(600);
    await stepGame(page, 1);
    const upright = await matrix(page);
    expect(upright.tiles, 'the tune is where she left it').toEqual(before.tiles);
    expect(
      upright.plan.tabs.map((t) => t.id),
      'the three tabs are still there',
    ).toEqual(PART_IDS);
    for (const box of [
      upright.plan.panel,
      upright.plan.keys,
      ...upright.plan.tabs,
      ...upright.plan.buttons.map((b) => ({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 })),
    ]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(upright.view.w + 0.5);
      expect(box.y + box.h).toBeLessThanOrEqual(upright.view.h + 0.5);
    }
    expect(upright.plan.grid.tw * upright.view.unit, 'a tile is big enough to hit upright').toBeGreaterThan(14);
    await shot(page, `${SCRATCH}/matrix-upright.png`);

    for (const t of upright.plan.tabs) {
      expect(t.w * upright.view.unit, `the ${t.id} tab is as wide as a thumb upright`).toBeGreaterThanOrEqual(44);
      expect(t.h * upright.view.unit, `the ${t.id} tab is as tall as a thumb upright`).toBeGreaterThanOrEqual(44);
    }
    // A touch on a tab still brings its part, and a touch on a tile still paints, in the new
    // layout.
    await show(page, 'bass');
    await show(page, 'melody');
    await press(page, upright.view.unit, buttonOf(upright, 'broom'));
    await stepGame(page, 0.3);
    await stroke(page, upright.view.unit, tileAt(upright, 3, 7), tileAt(upright, 6, 7));
    expect(rowOf(await matrix(page), 7)).toEqual([3, 4, 5, 6]);

    await page.setViewportSize(SIDEWAYS);
    await expect.poll(async () => (await matrix(page)).view.w).toBeGreaterThan(800);
    await stepGame(page, 1);
    expect(rowOf(await matrix(page), 7), 'and back').toEqual([3, 4, 5, 6]);
    await show(page, 'beat');
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });

  test('stays sound when a child hammers the screen with their whole hand', async ({ page }) => {
    test.setTimeout(240_000);
    const noise = watchConsole(page);
    await openFromPiano(page);
    let most = 0;
    let loudest = 0;
    for (let turn = 0; turn < 220; turn++) {
      const v = await matrix(page);
      most = Math.max(most, v.sparks);
      // Four fingers at once-ish, anywhere on the game, and the game moved on a little.
      for (let i = 0; i < 4; i++) {
        const x = 20 + ((turn * 131 + i * 247) % (v.view.w - 40));
        const y = 20 + ((turn * 73 + i * 97) % (v.view.h - 40));
        // A hand that lands on a button of the page presses the button, which is not what this is
        // about.
        const onGame = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [
          x * v.view.unit,
          y * v.view.unit,
        ] as const);
        if (!onGame) continue;
        if (i % 2 === 0) await page.mouse.click(x * v.view.unit, y * v.view.unit);
        else await stroke(page, v.view.unit, { x, y }, { x: Math.min(v.view.w - 12, x + 90), y: Math.max(12, y - 30) });
      }
      const before = v.rung;
      await stepGame(page, 0.25);
      loudest = Math.max(loudest, (await matrix(page)).rung - before);
    }
    expect(most, 'never more sparks than the game keeps').toBeLessThanOrEqual(2000);
    expect(
      loudest,
      'the game keeps nine notes of her own to a quarter of a second of its time, and a turn has the end of one such stretch and the start of the next',
    ).toBeLessThanOrEqual(18);
    await closeGame(page);
    expect(await page.evaluate(() => window.__ua!.invariants())).toEqual([]);
    expect(noise).toEqual([]);
  });
});
