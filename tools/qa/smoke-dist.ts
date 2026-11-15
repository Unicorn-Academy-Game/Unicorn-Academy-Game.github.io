import { resolve } from 'node:path';
import { type BrowserContext, chromium, type Page } from '@playwright/test';
import { cacheNames } from '../../src/shared/offline';
import { planOf } from '../build/dist';
import { DEFAULT_PREFIX, servePages } from './pages-server';
import { silence } from './silence';
import { voiceIsWell } from './voice-check';

/**
 * `tsx tools/qa/smoke-dist.ts [dir]`: proves a finished build works the way it will be published,
 * as a folder of a static site. It serves the build the way GitHub Pages serves a project site
 * (nothing at the root, every other address a 404), opens the game in Chromium, plays, and waits
 * for the game to be kept on the device. The spoken lessons are kept as they are heard, and all of
 * them when a parent asks, so it checks that a lesson is not kept before it is heard, then asks,
 * then goes offline and reloads. It also opens a look around with `?incognito` and checks that
 * nothing is written to the device however the game is played. It fails on a console error and on
 * any address the host did not have.
 */

/**
 * What the browser says about the machine it is drawing on, which is not the game's doing. The
 * end-to-end tests ignore the same.
 */
const MACHINE = /GL Driver Message|GPU stall|swiftshader|software rendering|WebGL.*(performance|fallback)/i;
const WEBGL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const dir = resolve(process.argv[2] ?? 'dist');
let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `: ${detail}`}`);
};

/**
 * What a page has put on the device that is the player's: how many records every table of every
 * database holds, and what local storage holds.
 */
const onDevice = (page: Page) =>
  page.evaluate(async () => {
    const tables: Record<string, number> = {};
    for (const info of (await indexedDB.databases?.()) ?? []) {
      if (!info.name) continue;
      const name = info.name;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const table of Array.from(db.objectStoreNames)) {
        tables[`${name}/${table}`] = await new Promise<number>((resolve, reject) => {
          const count = db.transaction(table).objectStore(table).count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        });
      }
      db.close();
    }
    return { tables, local: Object.keys(localStorage).sort() };
  });

async function watch(context: BrowserContext, noise: string[]): Promise<Page> {
  await silence(context);
  const page = await context.newPage();
  page.on(
    'console',
    (m) =>
      (m.type() === 'error' || m.type() === 'warning') &&
      !MACHINE.test(m.text()) &&
      noise.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  return page;
}

const { plan } = planOf(dir);
const pages = await servePages({ dir, prefix: DEFAULT_PREFIX });
const browser = await chromium.launch({ args: ['--mute-audio', ...WEBGL] });
try {
  const noise: string[] = [];
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, serviceWorkers: 'allow' });
  const page = await watch(context, noise);

  const home = await page.goto(`${pages.url}?test&keep`);
  check('the game is at its folder', home?.status() === 200, String(home?.status()));
  const play = page.getByRole('button', { name: 'Play' });
  await play.waitFor({ timeout: 180_000 });
  check('the title screen came up under a folder of the site', await play.isVisible());
  const root = await page.request.get(`${pages.origin}/`);
  check(
    'nothing answers at the root of the site, so the game does not lean on it',
    root.status() === 404,
    String(root.status()),
  );

  await play.click({ force: true });
  const names = cacheNames(new URL(pages.url).pathname);
  const kept = (): Promise<string[]> =>
    page.evaluate(
      async ([cache, scope]) => {
        if (!(await caches.keys()).includes(cache!)) return [];
        return (await (await caches.open(cache!)).keys()).map((r) => r.url.slice(scope!.length)).sort();
      },
      [names.of(plan.build), pages.url] as const,
    );
  const keptWithin = async (want: string[], ms: number): Promise<string[]> => {
    const deadline = Date.now() + ms;
    let have = await kept();
    while (want.some((url) => !have.includes(url)) && Date.now() < deadline) {
      await page.waitForTimeout(1000);
      have = await kept();
    }
    return want.filter((url) => !have.includes(url));
  };
  const game = plan.entries.filter((entry) => entry.group !== 'voice').map((entry) => entry.url);
  const spoken = plan.entries.filter((entry) => entry.group === 'voice').map((entry) => entry.url);
  const missing = await keptWithin(game, 300_000);
  check(
    `all ${game.length} files of the game in release ${plan.build} are kept on the device`,
    missing.length === 0,
    `missing ${missing.length}: ${missing.slice(0, 5).join(', ')}`,
  );

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
  check('the service worker serves the folder of the game and not the whole site', scope === pages.url, String(scope));

  // A lesson is kept when it is heard, and not before. A first visit is not served by the worker,
  // so what it hears is not kept, and the next opening is.
  await page.reload();
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 120_000 });
  check(
    'after a reload the worker serves the page',
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
  );
  const online = await voiceIsWell(page);
  check('with the network on, a card says its word and a key says its letter', online.length === 0, online.join(' | '));
  const clips: Record<string, { file: string }> = (
    await (await page.request.get(`${pages.url}assets/manifest.json`)).json()
  ).audio.speech.clips;
  const said = await page.evaluate(() => [
    ...(window as unknown as { __ua: { voice: { heard: string[] } } }).__ua.voice.heard,
  ]);
  const heardFiles = said.map((id) => `assets/${clips[id]!.file}`);
  const notKept = await keptWithin(heardFiles, 30_000);
  check(
    'the lessons that were heard are kept as they were heard',
    heardFiles.length > 0 && notKept.length === 0,
    `heard ${said.join(', ')}; not kept ${notKept.join(', ')}`,
  );
  const unheard = spoken.filter((url) => url.includes('/word-') && !heardFiles.includes(url)).at(-1)!;
  check('a lesson that was not heard is not kept', !(await kept()).includes(unheard), unheard);

  // The parent's switch, which is a message from the page to the worker, keeps the rest.
  await page.evaluate(async () =>
    (await navigator.serviceWorker.ready).active?.postMessage({ type: 'warm', voice: true }),
  );
  const unkept = await keptWithin(spoken, 300_000);
  check(
    `all ${spoken.length} spoken lessons are kept when a parent asks`,
    unkept.length === 0,
    `missing ${unkept.length}: ${unkept.slice(0, 5).join(', ')}`,
  );

  const before = pages.asked.length;
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 120_000 });
  check('with the network off, a reload still comes up', true);
  const voice = await voiceIsWell(page);
  check('with the network off, a card says its word and a key says its letter', voice.length === 0, voice.join(' | '));
  await context.setOffline(false);
  const reached = pages.asked.slice(before).filter((r) => !r.path.endsWith('/sw.js'));
  check(
    'the offline reload never reached the host',
    reached.length === 0,
    reached
      .slice(0, 5)
      .map((r) => r.path)
      .join(', '),
  );
  await context.close();

  // A look around writes nothing, however it is played.
  const around = await browser.newContext({ viewport: { width: 915, height: 412 }, serviceWorkers: 'allow' });
  const second = await watch(around, noise);
  await second.goto(`${pages.url}?test&incognito`);
  const start = second.getByRole('button', { name: /Play|Continue/ }).first();
  await start.waitFor({ timeout: 180_000 });
  check(
    'a look around says that it is one',
    await second.getByRole('status').filter({ hasText: 'Incognito' }).isVisible(),
  );
  await start.click({ force: true });
  await second.waitForTimeout(8000);
  const written = await onDevice(second);
  check(
    'a look around writes nothing to the device',
    Object.values(written.tables).every((n) => n === 0) && written.local.length === 0,
    JSON.stringify(written),
  );
  await around.close();

  const lost = pages.asked.filter((r) => r.status === 404 && r.path !== '/');
  check(
    'the host had every address the game asked for',
    lost.length === 0,
    lost
      .slice(0, 5)
      .map((r) => r.path)
      .join(', '),
  );
  check('no console errors or warnings', noise.length === 0, noise.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  await pages.close();
}
if (failed > 0) {
  console.log(`${failed} check${failed === 1 ? '' : 's'} failed`);
  process.exit(1);
}
console.log('every check passed');
