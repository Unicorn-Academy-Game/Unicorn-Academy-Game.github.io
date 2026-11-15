import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { args, flag } from '../lib/args';
import { silence } from './silence';

/**
 * Looks at the spell card on its own, without playing up to it, in a running development server.
 *   tsx tools/qa/card-shot.ts <out-dir> [--w 915] [--h 412] [--dpr 1] [--word frog] [--level 0] [--layout abc] [--case upper] [--calm]
 * Writes `open`, `typing`, `nudge`, `done` and, for the rungs that have one, `peek`. The card is
 * driven by the real engine, so what it shows is what a child would see. Run `pnpm exec vite --port
 * 5199` first, and use `--url` for another address.
 */
const out = args[0] ?? 'assets/source/_scratch/card';
const width = Number(flag('w', '915'));
const height = Number(flag('h', '412'));
const dpr = Number(flag('dpr', '1'));
const word = flag('word', 'frog');
const level = Number(flag('level', '0'));
const layout = flag('layout', 'abc');
const letters = flag('case', 'upper');
const calm = args.includes('--calm');

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __ua?: unknown }).__ua !== undefined, undefined, {
    timeout: 120_000,
  });
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true });
await silence(context);
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
// tsx names every function it compiles with a helper that a page does not have, so the page is
// given one that does nothing.
await page.addInitScript('window.__name = (f) => f;');
await page.goto(flag('url', 'http://localhost:5199/?test'));
await ready(page);
await page.waitForTimeout(800);

await page.evaluate(
  async (o) => {
    // biome-ignore lint/suspicious/noExplicitAny: the page loads these modules by URL, so their types are not known here
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const [{ SpellCard }, learning, { wordPictures }, { drawPortraits }, { WORDS }] = await Promise.all([
      load('/src/ui/learning/spell-card.ts'),
      load('/src/learning/index.ts'),
      load('/src/render/word-pictures.ts'),
      load('/src/render/portraits.ts'),
      load('/src/content/lexicon.ts'),
    ]);
    const ua = (window as unknown as { __ua: { stage: { scene: unknown }; manifest: unknown } }).__ua;
    const picture: string = wordPictures(
      ua.stage.scene,
      ua.manifest,
      drawPortraits(ua.stage.scene, ua.manifest),
    )(o.word);
    const portrait: boolean = WORDS[o.word].picture.kind === 'portrait';
    const host = document.getElementById('ui')!;
    let spelling = learning.begin(o.word, o.level, Math.random);
    let peeking = false;
    const card = new SpellCard(
      { host, mount: (node: HTMLElement) => host.append(node), calm: () => o.calm },
      {
        key: (letter: string) => {
          const moved = learning.press(spelling, letter);
          spelling = moved.spelling;
          card.pressed(moved.outcome, spelling, peeking);
          if (learning.isDone(spelling)) {
            window.setTimeout(() => card.celebrate(`Yes! ${o.word}.`, { before: 0, after: 2 }), 320);
          }
        },
        help: () => {
          spelling = learning.help(spelling);
          peeking = spelling.rung.peek;
          card.helped(spelling, peeking);
        },
        say: () => undefined,
        close: () => card.close(),
        collect: () => card.close(),
      },
    );
    (window as unknown as { __card: unknown }).__card = card;
    card.open(spelling, { picture, portrait, layout: o.layout, letters: o.letters, speech: true, firstEver: false });
  },
  { word, level, layout, letters, calm },
);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/open.png` });

const next = async (): Promise<string> =>
  page.evaluate(() => {
    const parts = document.querySelectorAll<HTMLElement>('.spell-slot');
    return [...parts].map((p) => p.dataset.state).join(',');
  });
console.log('slots at open:', await next());

// Type the first letters of the word.
for (const letter of word.slice(0, Math.max(1, Math.floor(word.length / 2)))) {
  await page.locator(`.spell-key[data-letter="${letter}"]`).click({ force: true });
  await page.waitForTimeout(120);
}
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/typing.png` });

// A key that is not the next letter.
const wrong = await page.evaluate(() => {
  const keys = [...document.querySelectorAll<HTMLElement>('.spell-key')].filter((k) => k.dataset.state === 'on');
  return keys.at(-1)?.dataset.letter ?? 'z';
});
await page.locator(`.spell-key[data-letter="${wrong}"]`).click({ force: true });
await page.waitForTimeout(110);
await page.screenshot({ path: `${out}/nudge.png` });

if (level === 2) {
  await page.locator('.spell-help').click({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/peek.png` });
}

// Finish the word.
const rest = await page.evaluate(() => {
  const slots = [...document.querySelectorAll<HTMLElement>('.spell-slot')];
  return slots.filter((s) => s.dataset.state !== 'placed').length;
});
const placed = word.length - rest;
for (const letter of word.slice(placed)) {
  await page.locator(`.spell-key[data-letter="${letter}"]`).click({ force: true });
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1400);
await page.screenshot({ path: `${out}/done.png` });
console.log(`wrote ${out}`);
await browser.close();
