import { chromium, type Page } from '@playwright/test';
import { flag } from '../lib/args';
import { ORIGIN } from './origin';
import { silence } from './silence';

/**
 * Counts what the game asks of a screen while it plays, so a change that makes it lighter can be
 * shown and not guessed.
 *   tsx tools/qa/perf.ts [--map palace-garden] [--w 1280] [--h 720] [--dpr 1.5] [--throttle 4] [--runs 3] [--seconds 4] [--modes none|off,on] [--ua desktop|silk|<string>]
 * It needs the development server on port 5173, or on `UA_PORT`. `--modes` writes the low-end
 * setting for each run, reloads, and checks the page says which look it is using. `none` leaves the
 * setting alone. Runs of different modes are interleaved so drift lands on both.
 *
 * What the numbers are. Update and render are main thread milliseconds, one for the game's own step
 * and one for Phaser's draw commands. GL calls, blend sets and indices are counted at the WebGL
 * call, so they do not depend on the machine. A draw call is one batch the GPU is asked for, and
 * each change of blend mode ends a batch, so blend sets show why a count is high. Visible objects
 * and fill come from the scene's display list: fill is the area of the on-screen quads in
 * framebuffer pixels, over the pixels in the canvas, so 3 means every pixel is covered three times.
 * New programs are shader programs linked while that scenario ran, which is the one thing a first
 * use can stall on. What they are not. Chromium here draws with a software renderer, so no number
 * is GPU time and none is a tablet's. Time varies with how busy this machine is. The counts are the
 * part to trust, and a time is worth reading only beside its spread.
 */

const map = flag('map', 'palace-garden');
const width = Number(flag('w', '1280'));
const height = Number(flag('h', '720'));
const dpr = Number(flag('dpr', '1.5'));
const throttle = Number(flag('throttle', '1'));
const runs = Number(flag('runs', '3'));
const seconds = Number(flag('seconds', '4'));
const url = flag('url', `${ORIGIN}/?test`);
const modes = flag('modes', 'none').split(',');
/**
 * `desktop` leaves the browser's own user agent. `silk` is a Fire HD 10's, which the engine reads
 * as an Android device. Anything else is used as it is.
 */
const agent = flag('ua', 'desktop');
const SILK =
  'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.6.1 like Chrome/116.0.0.0 Safari/537.36';
const userAgent = agent === 'desktop' ? undefined : agent === 'silk' ? SILK : agent;

const SCENARIOS = ['idle', 'walk', 'cast first', 'cast again'] as const;
const GROUPS = ['tiles', 'shadows', 'scenery', 'creatures', 'effects'] as const;
type Group = (typeof GROUPS)[number];

interface Frame {
  scenario: number;
  gap: number;
  update: number;
  render: number;
  calls: number;
  blends: number;
  indices: number;
  newPrograms: number;
  visible: number | null;
  fill: Record<Group, number> | null;
  particles: number | null;
}

interface Linked {
  scenario: number;
  signature: string;
}

interface Facts {
  profile: string;
  canvas: string;
  multisample: boolean;
  smoothing: boolean;
  fpsLimit: number;
  dpr: number;
  /**
   * How many pictures the engine lets one draw call hold. On a phone or tablet it is 1 unless asked
   * otherwise.
   */
  texturesPerBatch: number;
}

/** Everything below `recorder` runs inside the page. */
interface PageWindow {
  __ua: {
    profile?: { id: string };
    settings: { update(patch: Record<string, unknown>): void; flush(): Promise<void> };
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
      travel(to: { mapId: string; spawnId: string }): Promise<void>;
      debugEffect(id: string, at: { x: number; y: number }, seconds: number, facing: string): void;
      debugParticles(): number;
    };
    stage: {
      scene: {
        children: { list: PageObject[] };
        cameras: { main: { zoom: number; worldView: { x: number; y: number; right: number; bottom: number } } };
      };
      game: {
        canvas: { width: number; height: number };
        config: { smoothPixelArt: boolean };
        loop: { fpsLimit: number };
        events: { on(name: string, fn: () => void): void };
        renderer: { gl: WebGL2RenderingContext; renderNodes: { maxParallelTextureUnits: number } };
      };
    };
  };
  __gl: { calls: number; blends: number; indices: number; links: number; linked: Linked[] };
  __perf: { scenario: number; frames: Frame[] };
}

interface PageObject {
  type: string;
  visible: boolean;
  alpha: number;
  depth: number;
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  originX: number;
  originY: number;
  texture?: { key: string };
  blendMode?: number;
}

/**
 * Counts WebGL work at the call, before any game code runs. A program linked before recording
 * starts is filed under scenario -3.
 */
function countGl(): void {
  const w = window as unknown as PageWindow;
  w.__gl = { calls: 0, blends: 0, indices: 0, links: 0, linked: [] };
  const scenario = (): number => (w as unknown as Partial<PageWindow>).__perf?.scenario ?? -3;
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const table = proto as unknown as Record<string, ((...a: unknown[]) => void) | undefined>;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const real = table[name];
      if (!real) continue;
      table[name] = function (this: unknown, ...a: unknown[]): void {
        w.__gl.calls++;
        w.__gl.indices += Number(a[name.startsWith('drawArrays') ? 2 : 1] ?? 0);
        real.apply(this, a);
      };
    }
    for (const name of ['blendFunc', 'blendFuncSeparate']) {
      const real = table[name];
      if (!real) continue;
      table[name] = function (this: unknown, ...a: unknown[]): void {
        w.__gl.blends++;
        real.apply(this, a);
      };
    }
    const link = proto.linkProgram;
    proto.linkProgram = function (this: WebGLRenderingContext, program: WebGLProgram): void {
      w.__gl.links++;
      const parts = (this.getAttachedShaders(program) ?? []).map((shader) => {
        const source = this.getShaderSource(shader) ?? '';
        const defines = source
          .split('\n')
          .filter((line) => line.startsWith('#define'))
          .map((line) => line.slice(8).trim());
        return `${source.length}b ${defines.join(' ')}`;
      });
      w.__gl.linked.push({ scenario: scenario(), signature: parts.join(' | ') });
      link.call(this, program);
    };
  }
}

/**
 * Starts recording a frame at a time. Fill and the object count are sampled every tenth frame, so
 * looking does not slow what is looked at.
 */
function recorder(): void {
  const w = window as unknown as PageWindow;
  const { game, scene } = w.__ua.stage;
  const perf: PageWindow['__perf'] = { scenario: -1, frames: [] };
  w.__perf = perf;
  let began = 0;
  let stepped = 0;
  let drawing = 0;
  let calls = 0;
  let blends = 0;
  let indices = 0;
  let links = 0;
  let before = 0;
  let n = 0;
  game.events.on('prestep', () => {
    began = performance.now();
    calls = w.__gl.calls;
    blends = w.__gl.blends;
    indices = w.__gl.indices;
    links = w.__gl.links;
  });
  game.events.on('poststep', () => {
    stepped = performance.now();
  });
  game.events.on('prerender', () => {
    drawing = performance.now();
  });
  game.events.on('postrender', () => {
    const done = performance.now();
    if (perf.scenario < 0) return;
    const frame: Frame = {
      scenario: perf.scenario,
      gap: before ? began - before : 0,
      update: stepped - began,
      render: done - drawing,
      calls: w.__gl.calls - calls,
      blends: w.__gl.blends - blends,
      indices: w.__gl.indices - indices,
      newPrograms: w.__gl.links - links,
      visible: null,
      fill: null,
      particles: null,
    };
    before = began;
    if (n++ % 10 === 0) {
      const cam = scene.cameras.main;
      const view = cam.worldView;
      const px = cam.zoom * cam.zoom;
      const canvasPixels = game.canvas.width * game.canvas.height;
      const area: Record<Group, number> = { tiles: 0, shadows: 0, scenery: 0, creatures: 0, effects: 0 };
      let visible = 0;
      for (const o of scene.children.list) {
        if (!o.visible || o.alpha <= 0) continue;
        const key = o.texture?.key ?? '';
        const group: Group =
          o.type === 'TilemapLayer' || o.type === 'TilemapGPULayer'
            ? 'tiles'
            : key === 'shadow-soft'
              ? 'shadows'
              : key.startsWith('unicorn:') || key.startsWith('npc:')
                ? 'creatures'
                : o.depth >= 150_000 && o.depth < 200_000
                  ? 'effects'
                  : 'scenery';
        if (group === 'tiles') {
          visible++;
          area.tiles += (view.right - view.x) * (view.bottom - view.y);
          continue;
        }
        const left = o.x - o.displayWidth * o.originX;
        const top = o.y - o.displayHeight * o.originY;
        const across = Math.min(left + o.displayWidth, view.right) - Math.max(left, view.x);
        const down = Math.min(top + o.displayHeight, view.bottom) - Math.max(top, view.y);
        if (across <= 0 || down <= 0) continue;
        visible++;
        area[group] += across * down;
      }
      frame.visible = visible;
      frame.fill = {
        tiles: (area.tiles * px) / canvasPixels,
        shadows: (area.shadows * px) / canvasPixels,
        scenery: (area.scenery * px) / canvasPixels,
        creatures: (area.creatures * px) / canvasPixels,
        effects: (area.effects * px) / canvasPixels,
      };
      frame.particles = w.__ua.controller.debugParticles();
    }
    perf.frames.push(frame);
  });
}

const median = (xs: number[]): number => percentile(xs, 0.5);
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}
const present = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);
const fixed = (x: number, digits = 1): string => (Number.isFinite(x) ? x.toFixed(digits) : 'n/a');

async function play(page: Page, mode: string): Promise<Facts> {
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
    timeout: 180_000,
  });
  if (mode !== 'none') {
    await page.evaluate(async (m) => {
      const { settings } = (window as unknown as PageWindow).__ua;
      settings.update({ lowEnd: m });
      await settings.flush();
    }, mode);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
      timeout: 180_000,
    });
  }
  await page.getByRole('button', { name: 'Play' }).waitFor({ timeout: 60_000 });
  const facts = await page.evaluate((): Facts => {
    const { __ua: ua } = window as unknown as PageWindow;
    const { game } = ua.stage;
    const attributes = game.renderer.gl.getContextAttributes();
    return {
      profile: ua.profile?.id ?? 'none',
      canvas: `${game.canvas.width}x${game.canvas.height}`,
      multisample: attributes?.antialias ?? false,
      smoothing: game.config.smoothPixelArt,
      fpsLimit: game.loop.fpsLimit,
      dpr: window.devicePixelRatio,
      texturesPerBatch: game.renderer.renderNodes.maxParallelTextureUnits,
    };
  });
  await page.getByRole('button', { name: 'Play' }).click({ force: true });
  await page.waitForFunction(() => (window as unknown as PageWindow).__ua.controller.phase === 'playing', undefined, {
    timeout: 30_000,
  });
  await page.evaluate(
    (m) =>
      (window as unknown as PageWindow).__ua.controller.travel({
        mapId: m,
        spawnId: m === 'palace-garden' ? 'from-forest' : 'from-garden',
      }),
    map,
  );
  await page.waitForFunction(() => (window as unknown as PageWindow).__ua.controller.phase === 'playing', undefined, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  return facts;
}

async function scenarios(page: Page): Promise<{ frames: Frame[]; linked: Linked[] }> {
  await page.evaluate(recorder);
  const mark = (i: number): Promise<void> =>
    page.evaluate((s) => {
      (window as unknown as PageWindow).__perf.scenario = s;
    }, i);
  await mark(0);
  await page.waitForTimeout(seconds * 1000);

  await mark(1);
  const walk = (): Promise<void> =>
    page.evaluate(() => {
      const { controller } = (window as unknown as PageWindow).__ua;
      const lead = controller.world.unicorns.wildstar!.pos;
      const spot = controller.world.nav.freePointNear(
        { x: lead.x + (Math.random() < 0.5 ? -1 : 1) * 600, y: lead.y + 120 },
        [],
        0,
        220,
      );
      if (spot) controller.tap(spot);
    });
  for (let t = 0; t < seconds; t += 1.5) {
    await walk();
    await page.waitForTimeout(1500);
  }

  const cast = (): Promise<void> =>
    page.evaluate(
      (every) =>
        new Promise<void>((done) => {
          const { controller } = (window as unknown as PageWindow).__ua;
          const spells = ['light-burst', 'leaf-burst', 'ice-burst', 'water-burst', 'fire-burst', 'lightning-burst'];
          let i = 0;
          const next = (): void => {
            if (i === spells.length) {
              done();
              return;
            }
            const lead = controller.world.unicorns.wildstar!.pos;
            controller.debugEffect(
              spells[i++]!,
              { x: lead.x + 60 + (i % 3) * 40, y: lead.y + (i % 2) * 20 },
              2.4,
              'east',
            );
            setTimeout(next, every);
          };
          next();
        }),
      600,
    );
  await mark(2);
  await cast();
  await page.waitForTimeout(1500);
  await mark(3);
  await cast();
  await page.waitForTimeout(1500);
  await mark(-1);
  return page.evaluate(() => ({
    frames: (window as unknown as PageWindow).__perf.frames,
    linked: (window as unknown as PageWindow).__gl.linked,
  }));
}

interface Result {
  mode: string;
  facts: Facts;
  frames: Frame[];
  linked: Linked[];
}

/**
 * One run in a page of its own. The development server can reload a page that is under test, so a
 * run that lost its page is tried again.
 */
async function once(mode: string): Promise<Result> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: true,
    ...(userAgent ? { userAgent } : {}),
  });
  await silence(context);
  try {
    // tsx keeps function names by wrapping each in a helper, and the page does not have it.
    await context.addInitScript('globalThis.__name = (target) => target;');
    await context.addInitScript(countGl);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
    if (throttle > 1)
      await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const facts = await play(page, mode);
    const wanted = mode === 'on' ? 'low' : mode === 'off' ? 'standard' : null;
    if (wanted && facts.profile !== wanted)
      throw new Error(
        `asked for ${mode} and the page is using "${facts.profile}": the numbers would be for something else`,
      );
    const { frames, linked } = await scenarios(page);
    if (frames.length === 0) throw new Error('no frames were recorded: the game did not draw');
    return { mode, facts, frames, linked };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results: Result[] = [];
for (let run = 0; run < runs; run++) {
  for (const mode of modes) {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await once(mode);
        results.push(result);
        console.log(`run ${run + 1}/${runs} ${mode}: ${result.frames.length} frames`);
        break;
      } catch (error) {
        if (attempt === 3 || !(error instanceof Error) || !/__ua|stage|evaluate|navigat|context/i.test(error.message))
          throw error;
        console.log(`run ${run + 1}/${runs} ${mode}: lost its page (${error.message.split('\n')[0]}), trying again`);
      }
    }
  }
}
await browser.close();

const where = (s: number): string => (s === -3 ? 'before recording' : (SCENARIOS[s] ?? `scenario ${s}`));
console.log(
  `\n${map} at ${width}x${height} css, device pixel ratio ${dpr}, cpu slowed ${throttle}x, ${runs} run(s) each, ${seconds} s per scenario`,
);
for (const mode of modes) {
  const mine = results.filter((r) => r.mode === mode);
  const f = mine[0]!.facts;
  console.log(
    `\nmode ${mode}: profile ${f.profile}, canvas ${f.canvas}, multisample ${f.multisample}, smoothing shader ${f.smoothing}, frame limit ${f.fpsLimit || 'none'}, pictures per draw call ${f.texturesPerBatch}`,
  );
  console.log(
    'scenario     | frames | update ms p50 (runs) p95 | render ms p50 (runs) p95 | gap ms p95 max | gl calls | blend sets | indices | visible | fill x | particles max | new programs',
  );
  SCENARIOS.forEach((name, s) => {
    const per = mine.map((r) => r.frames.filter((fr) => fr.scenario === s));
    const all = per.flat();
    const spread = (pick: (fr: Frame) => number): string => {
      const meds = per.map((fs) => median(fs.map(pick)));
      return `${fixed(median(all.map(pick)))} (${fixed(Math.min(...meds))}-${fixed(Math.max(...meds))})`;
    };
    const gaps = all.map((fr) => fr.gap).filter((g) => g > 0);
    const visible = present(all.map((fr) => fr.visible));
    const fills = present(all.map((fr) => fr.fill));
    const particles = present(all.map((fr) => fr.particles));
    const fresh = per.map((fs) => fs.reduce((sum, fr) => sum + fr.newPrograms, 0));
    console.log(
      [
        name.padEnd(12),
        String(all.length).padStart(6),
        `${spread((fr) => fr.update)} p95 ${fixed(
          percentile(
            all.map((fr) => fr.update),
            0.95,
          ),
        )}`,
        `${spread((fr) => fr.render)} p95 ${fixed(
          percentile(
            all.map((fr) => fr.render),
            0.95,
          ),
        )}`,
        `${fixed(percentile(gaps, 0.95), 0)} ${fixed(Math.max(...gaps), 0)}`,
        fixed(median(all.map((fr) => fr.calls)), 0),
        fixed(median(all.map((fr) => fr.blends)), 0),
        fixed(median(all.map((fr) => fr.indices)), 0),
        fixed(median(visible), 0),
        fixed(median(fills.map((x) => GROUPS.reduce((sum, g) => sum + x[g], 0))), 2),
        fixed(Math.max(...particles), 0),
        fresh.join('/'),
      ].join(' | '),
    );
  });
  console.log('fill by source (median x, the idle and the "cast again" scenarios)');
  for (const s of [0, 3]) {
    const fills = present(mine.flatMap((r) => r.frames.filter((fr) => fr.scenario === s).map((fr) => fr.fill)));
    console.log(
      `  ${(SCENARIOS[s] ?? '').padEnd(11)} ${GROUPS.map((g) => `${g} ${fixed(median(fills.map((x) => x[g])), 2)}`).join(', ')}`,
    );
  }
  console.log('programs linked in the first run');
  for (const l of mine[0]!.linked) console.log(`  ${where(l.scenario).padEnd(17)} ${l.signature.slice(0, 190)}`);
}
