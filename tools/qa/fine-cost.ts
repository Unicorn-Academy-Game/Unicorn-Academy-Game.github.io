import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, chromium, type Page } from '@playwright/test';
import { flag } from '../lib/args';
import { silence } from './silence';

/**
 * What it costs the game to bring in the fine unicorn facings after play has begun, set beside the
 * same minutes without them.
 *   tsx tools/qa/fine-cost.ts [--url http://localhost:5393/?test] [--throttle 4] [--runs 2] [--w 1280] [--h 720] [--dpr 1.5] [--ua desktop|silk|<string>]
 * Serve the built release (`pnpm build`, then `pnpm exec vite preview --port 5393`), because that
 * is the file a device gets. Every run is a browser of its own with its own profile folder, so the
 * memory of its processes can be read. A run opens the game, starts the clock the moment play
 * begins, asks for the fine sheets of all six unicorns at once (the worst case, which the herd
 * comes to only as each comes on screen), and leads her about by taps while they come. The run
 * without them has the sheets refused, so the same minutes are the same play. Runs of the two kinds
 * are interleaved, and the one without is as long as the one with.
 *
 * What the numbers are. A gap is the time between one frame and the next, so a sheet that holds the
 * page up shows as a long one. A long task is what the browser itself calls one, 50 ms or more of
 * the main thread. Memory is the resident size of every process of the browser, which on this
 * machine's software renderer includes the pictures the renderer holds. GL calls are counted at the
 * call. What they are not. Chromium here draws in software, so no time is a phone's and none is a
 * GPU's. A number from a throttled run is what a slower main thread would see and says nothing of a
 * slower graphics chip. The counts and the memory are the part to trust.
 */

const url = flag('url', 'http://localhost:5393/?test');
const throttle = Number(flag('throttle', '4'));
const runs = Number(flag('runs', '2'));
const width = Number(flag('w', '1280'));
const height = Number(flag('h', '720'));
const dpr = Number(flag('dpr', '1.5'));
const SILK =
  'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.6.1 like Chrome/116.0.0.0 Safari/537.36';
const agent = flag('ua', 'desktop');
const userAgent = agent === 'desktop' ? undefined : agent === 'silk' ? SILK : agent;

const SIX = ['wildstar', 'leaf', 'glacier', 'river', 'cinder', 'storm'];
const FINE_SHEET = /\/unicorns\/[a-z]+\.fine-\d\.[0-9a-f]{10}\.webp$/;

/** Everything below runs inside the page. */
interface Frame {
  at: number;
  gap: number;
  update: number;
  render: number;
  calls: number;
}
interface PageWindow {
  __ua: {
    controller: {
      phase: string;
      world: {
        unicorns: Record<string, { pos: { x: number; y: number } }>;
        nav: {
          freePointNear(
            c: { x: number; y: number },
            avoid: unknown[],
            gap: number,
            r: number,
          ): { x: number; y: number } | null;
        };
      };
      tap(at: { x: number; y: number }): void;
    };
    fine: { want(id: string): void };
    stage: {
      scene: {
        textures: {
          exists(key: string): boolean;
          get(key: string): { has(frame: string): boolean };
          on(name: string, fn: (key: string) => void): void;
        };
      };
      game: { events: { on(name: string, fn: () => void): void } };
    };
    manifest: { unicorns: Record<string, { fine?: { atlases: { rects: unknown[] }[] } }> };
    profile: { id: string; fineFacings: boolean };
  };
  __gl: { calls: number };
  __probe: { frames: Frame[]; long: { at: number; ms: number }[]; sheets: { key: string; at: number }[]; zero: number };
}

/** Counts the draw calls of WebGL at the call, before any of the game's own code runs. */
function countGl(): void {
  const w = window as unknown as PageWindow;
  w.__gl = { calls: 0 };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const table = proto as unknown as Record<string, ((...a: unknown[]) => void) | undefined>;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const real = table[name];
      if (!real) continue;
      table[name] = function (this: unknown, ...a: unknown[]): void {
        w.__gl.calls++;
        real.apply(this, a);
      };
    }
  }
}

/**
 * Starts writing down every frame, every long task and the moment every picture sheet of a unicorn
 * is put into the engine.
 */
function startProbe(): void {
  const w = window as unknown as PageWindow;
  const probe: PageWindow['__probe'] = { frames: [], long: [], sheets: [], zero: performance.now() };
  w.__probe = probe;
  const { game, scene } = w.__ua.stage;
  let began = 0;
  let stepped = 0;
  let drawing = 0;
  let calls = 0;
  let before = 0;
  game.events.on('prestep', () => {
    began = performance.now();
    calls = w.__gl.calls;
  });
  game.events.on('poststep', () => {
    stepped = performance.now();
  });
  game.events.on('prerender', () => {
    drawing = performance.now();
  });
  game.events.on('postrender', () => {
    const done = performance.now();
    probe.frames.push({
      at: done - probe.zero,
      gap: before ? began - before : 0,
      update: stepped - began,
      render: done - drawing,
      calls: w.__gl.calls - calls,
    });
    before = began;
  });
  scene.textures.on('addtexture', (key: string) => {
    if (key.startsWith('unicorn:') && key.split(':').length === 3)
      probe.sheets.push({ key, at: performance.now() - probe.zero });
  });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) probe.long.push({ at: e.startTime - probe.zero, ms: e.duration });
  }).observe({ entryTypes: ['longtask'] });
}

/**
 * The resident size, in MiB, of the browser that was started with this profile folder and of every
 * process under it.
 */
function residentMiB(profile: string): { mib: number; processes: number } {
  const table = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='])
    .toString()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [pid, ppid, rss, ...command] = line.trim().split(/\s+/);
      return { pid: Number(pid), ppid: Number(ppid), rss: Number(rss), command: command.join(' ') };
    });
  const root = table.find((p) => p.command.includes(`--user-data-dir=${profile}`) && !p.command.includes('--type='));
  if (!root) return { mib: NaN, processes: 0 };
  const owned = new Set([root.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of table) {
      if (!owned.has(p.pid) && owned.has(p.ppid)) {
        owned.add(p.pid);
        grew = true;
      }
    }
  }
  const mine = table.filter((p) => owned.has(p.pid));
  return { mib: mine.reduce((sum, p) => sum + p.rss, 0) / 1024, processes: mine.length };
}

interface Run {
  fine: boolean;
  windowMs: number;
  frames: Frame[];
  long: { at: number; ms: number }[];
  sheets: { key: string; at: number }[];
  askedAt: number;
  allIn: number | null;
  residentBefore: number;
  residentAfter: number;
  processes: number;
  profile: string;
}

const percentile = (xs: number[], p: number): number =>
  xs.length === 0 ? NaN : [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
const fixed = (x: number, digits = 1): string => (Number.isFinite(x) ? x.toFixed(digits) : 'n/a');

async function open(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  if (throttle > 1)
    await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
    timeout: 240_000,
  });
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Play' }).click({ force: true });
  await page.waitForFunction(() => (window as unknown as PageWindow).__ua.controller.phase === 'playing', undefined, {
    timeout: 60_000,
  });
  return page;
}

/**
 * One tap on open ground a few hundred units to one side of her, a side at a time, as a child would
 * send her about.
 */
const wander = (page: Page, side: number): Promise<void> =>
  page.evaluate((s) => {
    const { controller } = (window as unknown as PageWindow).__ua;
    const lead = controller.world.unicorns.wildstar!.pos;
    const spot = controller.world.nav.freePointNear({ x: lead.x + s * 500, y: lead.y + 100 }, [], 0, 220);
    if (spot) controller.tap(spot);
  }, side);

async function once(fine: boolean, windowMs: number | null): Promise<Run> {
  const profile = mkdtempSync(join(tmpdir(), 'fine-cost-'));
  const context = await chromium.launchPersistentContext(profile, {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: true,
    ...(userAgent ? { userAgent } : {}),
  });
  try {
    await silence(context);
    // tsx keeps function names by wrapping each in a helper, and the page does not have it.
    await context.addInitScript('globalThis.__name = (target) => target;');
    // A built release sets up offline play, and its service worker fetches the whole release behind
    // the game. The game plays in a browser that has no service worker (it says offline play is
    // unsupported), so the runs have none, and the fine sheets are the only thing coming in.
    // Playwright's own block makes register() answer nothing, which a real browser never does and
    // the game does not expect.
    await context.addInitScript('delete Navigator.prototype.serviceWorker;');
    await context.addInitScript(countGl);
    if (!fine) await context.route(FINE_SHEET, (route) => route.abort());
    const page = await open(context);
    const mode = await page.evaluate(() => (window as unknown as PageWindow).__ua.profile);
    if (!mode.fineFacings)
      throw new Error(`the profile is "${mode.id}" and shows no fine facings: there is nothing to measure`);
    await page.evaluate(startProbe);
    const before = residentMiB(profile);
    const askedAt = await page.evaluate((ids) => {
      const ua = (window as unknown as PageWindow).__ua;
      const at = performance.now() - (window as unknown as PageWindow).__probe.zero;
      for (const id of ids) ua.fine.want(id);
      return at;
    }, SIX);
    const started = Date.now();
    let allIn: number | null = null;
    for (let i = 0; ; i++) {
      await wander(page, i % 2 === 0 ? -1 : 1);
      await page.waitForTimeout(1500);
      const done = await page.evaluate((ids) => {
        const { stage, manifest } = (window as unknown as PageWindow).__ua;
        return ids.every((id) =>
          manifest.unicorns[id]!.fine!.atlases.every(
            (sheet, p) =>
              stage.scene.textures.exists(`unicorn:${id}:${p}`) &&
              stage.scene.textures.get(`unicorn:${id}:${p}`).has(String(sheet.rects.length - 1)),
          ),
        );
      }, SIX);
      if (done && allIn === null) allIn = Date.now() - started;
      // With the sheets, the window ends three taps after the last one came. Without, it is as long
      // as that one was.
      if (
        fine
          ? allIn !== null && Date.now() - started > allIn + 4500
          : windowMs !== null && Date.now() - started > windowMs
      )
        break;
      if (Date.now() - started > 600_000) throw new Error('the fine sheets did not all come in ten minutes');
    }
    const windowEnd = Date.now() - started;
    const probe = await page.evaluate(() => (window as unknown as PageWindow).__probe);
    const after = residentMiB(profile);
    const from = askedAt;
    return {
      fine,
      windowMs: windowEnd,
      frames: probe.frames.filter((f) => f.at >= from),
      long: probe.long.filter((l) => l.at >= from),
      sheets: probe.sheets,
      askedAt,
      allIn,
      residentBefore: before.mib,
      residentAfter: after.mib,
      processes: after.processes,
      profile: mode.id,
    };
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const runsDone: Run[] = [];
for (let r = 0; r < runs; r++) {
  const withFine = await once(true, null);
  console.log(
    `run ${r + 1}/${runs} with the fine sheets: all in after ${withFine.allIn} ms, ${withFine.frames.length} frames`,
  );
  runsDone.push(withFine);
  const without = await once(false, withFine.windowMs);
  console.log(`run ${r + 1}/${runs} without: ${without.frames.length} frames over the same ${without.windowMs} ms`);
  runsDone.push(without);
}

console.log(
  `\nbuilt release at ${url}, ${width}x${height} css, device pixel ratio ${dpr}, cpu slowed ${throttle}x, ${runs} run(s) of each, profile ${runsDone[0]!.profile}`,
);
console.log(
  'kind    | window s | frames | gap ms p50 p95 p99 max | over 50 / 100 / 200 ms | long tasks (n, total ms, longest) | update ms p50 p95 | render ms p50 p95 | gl calls p50 | resident MiB before > after (processes)',
);
for (const fine of [true, false]) {
  for (const run of runsDone.filter((r) => r.fine === fine)) {
    const gaps = run.frames.map((f) => f.gap).filter((g) => g > 0);
    const over = (ms: number): number => gaps.filter((g) => g > ms).length;
    console.log(
      [
        (fine ? 'fine' : 'without').padEnd(7),
        fixed(run.windowMs / 1000).padStart(8),
        String(run.frames.length).padStart(6),
        [0.5, 0.95, 0.99, 1].map((p) => fixed(percentile(gaps, p), 0)).join(' '),
        `${over(50)} / ${over(100)} / ${over(200)}`,
        `${run.long.length}, ${fixed(
          run.long.reduce((s, l) => s + l.ms, 0),
          0,
        )}, ${fixed(Math.max(0, ...run.long.map((l) => l.ms)), 0)}`,
        `${fixed(
          percentile(
            run.frames.map((f) => f.update),
            0.5,
          ),
        )} ${fixed(
          percentile(
            run.frames.map((f) => f.update),
            0.95,
          ),
        )}`,
        `${fixed(
          percentile(
            run.frames.map((f) => f.render),
            0.5,
          ),
        )} ${fixed(
          percentile(
            run.frames.map((f) => f.render),
            0.95,
          ),
        )}`,
        fixed(
          percentile(
            run.frames.map((f) => f.calls),
            0.5,
          ),
          0,
        ),
        `${fixed(run.residentBefore, 0)} > ${fixed(run.residentAfter, 0)} (${run.processes})`,
      ].join(' | '),
    );
  }
}

console.log('\nwhen each fine sheet came in, and the longest gap within 250 ms of it, in the first run with them');
const first = runsDone.find((r) => r.fine)!;
for (const sheet of first.sheets) {
  const near = first.frames.filter((f) => Math.abs(f.at - sheet.at) <= 250).map((f) => f.gap);
  console.log(
    `  ${sheet.key.padEnd(18)} ${fixed((sheet.at - first.askedAt) / 1000, 2).padStart(6)} s after asking   longest gap ${fixed(Math.max(0, ...near), 0)} ms`,
  );
}
const gain = runsDone.filter((r) => r.fine).map((r) => r.residentAfter - r.residentBefore);
const none = runsDone.filter((r) => !r.fine).map((r) => r.residentAfter - r.residentBefore);
console.log(
  `\nmemory the browser holds more after the window: with the fine sheets ${gain.map((g) => fixed(g, 0)).join(', ')} MiB, without ${none.map((g) => fixed(g, 0)).join(', ')} MiB`,
);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const endWith = mean(runsDone.filter((r) => r.fine).map((r) => r.residentAfter));
const endWithout = mean(runsDone.filter((r) => !r.fine).map((r) => r.residentAfter));
console.log(
  `resident at the end of the window, on average: with the fine sheets ${fixed(endWith, 0)} MiB, without ${fixed(endWithout, 0)} MiB, so they hold ${fixed(endWith - endWithout, 0)} MiB`,
);
