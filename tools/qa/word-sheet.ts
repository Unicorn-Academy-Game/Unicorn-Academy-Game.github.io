import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { args, flag } from '../lib/args';
import { silence } from './silence';

/**
 * Lays every word's picture out on the frame the spell card puts it in, in a running development
 * server, so each can be judged by eye.
 *   tsx tools/qa/word-sheet.ts <out-file> [--size 150] [--cols 8] [--only fish,fairy] [--url http://localhost:5199/?test]
 * Run `pnpm exec vite --port 5199` first. The pictures come from the same function the game uses,
 * so what is on the sheet is what the player sees.
 */
const out = args[0] ?? 'assets/source/_scratch/word-sheet.png';
const size = Number(flag('size', '150'));
const cols = Number(flag('cols', '8'));
const only = flag('only', '')
  .split(',')
  .filter((word) => word !== '');

mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const width = cols * (size + 24) + 24;
const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await silence(context);
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
// tsx names every function it compiles with a helper that a page does not have, so the page is
// given one that does nothing.
await page.addInitScript('window.__name = (f) => f;');
await page.goto(flag('url', 'http://localhost:5199/?test'));
await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
  timeout: 120_000,
});
await page.waitForTimeout(800);

const count = await page.evaluate(
  async (o) => {
    // biome-ignore lint/suspicious/noExplicitAny: the page loads these modules by URL, so their types are not known here
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const [{ WORDS }, { wordPictures }, { drawPortraits }] = await Promise.all([
      load('/src/content/lexicon.ts'),
      load('/src/render/word-pictures.ts'),
      load('/src/render/portraits.ts'),
    ]);
    const ua = (window as unknown as { __ua: { stage: { scene: unknown }; manifest: unknown } }).__ua;
    const picture = wordPictures(ua.stage.scene, ua.manifest, drawPortraits(ua.stage.scene, ua.manifest));
    const sheet = document.createElement('div');
    sheet.style.cssText = `position:fixed;inset:0;z-index:99;overflow:auto;background:#2b1b4d;display:grid;grid-template-columns:repeat(${o.cols}, ${o.size}px);gap:14px 24px;padding:24px 24px 40px;align-content:start;font-family:Fredoka,sans-serif;color:#fff`;
    const ids = Object.keys(WORDS).filter((id) => o.only.length === 0 || o.only.includes(id));
    for (const id of ids) {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:grid;gap:6px;justify-items:center';
      const frame = document.createElement('div');
      frame.className = 'spell-frame';
      if (WORDS[id].picture.kind === 'portrait') frame.dataset.kind = 'portrait';
      frame.style.setProperty('--art', `${o.size}px`);
      const img = document.createElement('img');
      img.className = 'spell-picture';
      img.src = picture(id);
      img.alt = id;
      frame.append(img);
      const name = document.createElement('div');
      name.textContent = id;
      name.style.cssText = 'font-size:16px;font-weight:600';
      cell.append(frame, name);
      sheet.append(cell);
    }
    document.body.append(sheet);
    await Promise.all([...sheet.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
    return ids.length;
  },
  { size, cols, only },
);
await page.waitForTimeout(300);
const height = Math.ceil(count / cols) * (size + 14 + 28) + 70;
await page.setViewportSize({ width, height });
await page.screenshot({ path: out });
console.log(`wrote ${out} with ${count} pictures`);
await browser.close();
