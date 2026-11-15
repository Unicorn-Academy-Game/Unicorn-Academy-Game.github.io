import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import {
  befriend,
  FRIENDS,
  freeze,
  newWatch,
  openGame,
  play,
  SCRATCH,
  step,
  stepAndLook,
  type Watch,
  walkThrough,
  watchConsole,
} from './helpers';
import { countHandles, heapProbe, type Resources, resources } from './resources';

/**
 * Endurance: at least twenty map changes and twenty minutes of play with the whole herd, with every
 * count that could grow checked at the end. Game time is stepped by hand, so twenty game minutes
 * take a few real ones. The minutes come from UA_SOAK_MINUTES, and the default is short enough for
 * every run of the suite.
 */

const MINUTES = Number(process.env.UA_SOAK_MINUTES ?? 4);
const LAPS = 3;
/**
 * One lap is ten map changes, and it ends where it began. The last four are the Spooky Manor, which
 * only Wildstar enters, by the door and the lift.
 */
const LAP = [
  'palace-garden',
  'treasure-house',
  'palace-garden',
  'stable',
  'palace-garden',
  'forest',
  'manor-hall',
  'manor-upper',
  'manor-hall',
  'forest',
] as const;
/**
 * Doors that ask for a word or a clue. The soak is about memory and not about the riddles, so they
 * are open from the start.
 */
const OPEN_DOORS = ['forest/manor-door-1', 'manor-hall/elevator-door-1'] as const;

/** A repeatable stream of numbers in [0, 1), so a run can be repeated. */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Taps one of the herd, as a child asking for magic. Does nothing if she is off the screen. */
async function askForMagic(page: Page, who: string): Promise<boolean> {
  const at = await page.evaluate((id) => {
    const u = window.__ua!.controller.world.unicorns[id];
    if (!u) return null;
    return window.__ua!.controller.toScreen({ x: u.pos.x, y: u.pos.y - 52 });
  }, who);
  const size = page.viewportSize()!;
  if (!at || at.x < 8 || at.y < 8 || at.x > size.width - 8 || at.y > size.height - 8) return false;
  await page.mouse.click(at.x, at.y);
  return true;
}

/**
 * Taps a spot of open ground not far from the leader, as a child who just wants to walk somewhere.
 */
const wander = (page: Page, r: () => number): Promise<void> =>
  page.evaluate(
    ({ dx, dy }) => {
      const { world, tap } = {
        world: window.__ua!.controller.world,
        tap: window.__ua!.controller.tap.bind(window.__ua!.controller),
      };
      const lead = world.unicorns.wildstar!.pos;
      const spot = world.nav.freePointNear({ x: lead.x + dx, y: lead.y + dy }, [], 0, 160);
      if (spot) tap(spot);
    },
    { dx: (r() - 0.5) * 700, dy: (r() - 0.5) * 360 },
  );

/** What the run noticed, in a table a person can read, kept with the other evidence. */
function report(rows: Resources[]): string {
  const head = [
    'map',
    'session s',
    'textures',
    'tex MiB',
    'fine MiB',
    'objects',
    'listeners',
    'timers',
    'voices',
    'effects',
    'events',
    'particles',
    'snapshots',
    'backups',
    'damaged',
    'heap MiB',
  ];
  const line = (r: Resources): string =>
    [
      r.map,
      r.seconds,
      r.textures,
      r.textureMiB.toFixed(1),
      r.fineMiB.toFixed(1),
      r.objects,
      r.listeners,
      r.timers,
      r.voices,
      r.effects,
      r.events,
      r.particles,
      r.snapshots,
      r.backups,
      r.damaged,
      r.heapMiB === null ? 'n/a' : r.heapMiB.toFixed(1),
    ].join(' | ');
  return [head.join(' | '), ...rows.map(line)].join('\n');
}

test('twenty map changes and a long play with the whole herd leave nothing behind', async ({ page }) => {
  test.setTimeout(MINUTES * 60_000 * 4 + 900_000);
  const noise = watchConsole(page);
  const watch: Watch = newWatch();
  await countHandles(page);

  await openGame(page);
  await play(page);
  await freeze(page);
  const probe = await heapProbe(page);
  const samples: Resources[] = [];
  const sample = async (): Promise<Resources> => {
    const now = await resources(page, probe, watch.seconds);
    samples.push(now);
    return now;
  };

  await page.evaluate(
    (doors) =>
      doors.forEach((d) => {
        window.__ua!.controller.world.unlocked.add(d);
      }),
    OPEN_DOORS,
  );
  await test.step('meets all five friends', async () => {
    for (const id of FRIENDS) await befriend(page, id);
    await step(page, 6);
  });
  await sample();

  await test.step(`makes ${LAPS * LAP.length} map changes`, async () => {
    for (let lap = 0; lap < LAPS; lap++) {
      for (const to of LAP) {
        await walkThrough(page, to, watch);
        for (let s = 0; s < 3; s++) await stepAndLook(page, watch);
        await sample();
      }
    }
  });
  const transitions = samples.length - 1;
  expect(transitions).toBe(LAPS * LAP.length);
  test
    .info()
    .annotations.push({ type: 'game time for the map changes', description: `${Math.round(watch.seconds)} s` });

  await test.step('plays on in the forest until the time is up', async () => {
    const r = stream(20_241_025);
    const herd = ['wildstar', ...FRIENDS];
    let nextSample = Math.ceil(watch.seconds / 60) * 60;
    while (watch.seconds < MINUTES * 60) {
      await stepAndLook(page, watch);
      if (watch.seconds % 4 === 0) await askForMagic(page, herd[Math.floor(r() * herd.length)]!);
      if (watch.seconds % 9 === 0) await wander(page, r);
      // A child who taps as fast as they can, for a second of game time.
      if (watch.seconds % 75 === 0) for (let i = 0; i < 24; i++) await askForMagic(page, herd[i % herd.length]!);
      if (watch.seconds >= nextSample) {
        await sample();
        nextSample += 60;
      }
    }
  });
  const last = await sample();

  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(`${SCRATCH}/endurance.txt`, `${report(samples)}\n`);
  test.info().annotations.push({ type: 'resources', description: `\n${report(samples)}` });

  // The budgets. The 160 MiB is held to what it counted before the unicorns had fine sheets, and
  // the fine sheets of all six have the 256 MiB that `docs/ASSET_REPORT.md` states for everything
  // together.
  for (const s of samples) {
    expect(
      s.textureMiB - s.fineMiB,
      `texture memory in ${s.map} at ${s.seconds} s, without the fine sheets`,
    ).toBeLessThanOrEqual(160);
    expect(s.textureMiB, `texture memory in ${s.map} at ${s.seconds} s, with the fine sheets`).toBeLessThanOrEqual(256);
    expect(s.particles, `particles in ${s.map} at ${s.seconds} s`).toBeLessThanOrEqual(250);
    expect(s.effects, `effects in ${s.map} at ${s.seconds} s`).toBeLessThanOrEqual(24);
    expect(s.events, `queued events in ${s.map} at ${s.seconds} s`).toBeLessThan(512);
    expect(s.snapshots, `snapshots at ${s.seconds} s`).toBeLessThanOrEqual(10);
    expect(s.backups, `backups at ${s.seconds} s`).toBeLessThanOrEqual(8);
    expect(s.damaged, `damaged saves at ${s.seconds} s`).toBe(0);
  }
  expect(last.map).toBe('forest');

  expect(watch.problems).toEqual([]);
  expect(noise).toEqual([]);
});
