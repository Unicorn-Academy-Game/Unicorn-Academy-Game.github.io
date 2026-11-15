import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { contactSheet, type Rgba } from '../art/core/image';
import { args, flag } from '../lib/args';
import { decodePng, encodePngRgba } from '../lib/png';
import { ORIGIN } from './origin';

/**
 * Plays a game in the wonder lab with time held still, and photographs it where you say, side by
 * side.
 *   tsx tools/qa/wonder-film.ts <out.png> --query 'game=sparkle-sky&look=red' --script 'tap:430,90 step:0.4 shot step:0.4 shot' [--cols 3] [--w 863] [--h 360] [--dpr 1] [--each] [--clip x,y,w,h]
 * With --clip, each picture is only that part of the screen, in the game's own units, so a detail
 * can be looked at close up. Script words, in order, separated by spaces:
 *   tap:x,y        a touch at a place in the game's units
 *   drag:x,y;x,y;… a finger drawn through the points (add :seconds at the end to change its speed)
 *   step:s         move the game on by s seconds
 *   until:prefix   step until the sound is asked for something starting with prefix (for example
 *                  until:fx:boom)
 *   shot           take a picture now
 *   celebrate      start the finale
 *   eval:code      run code in the page (a ~ is a space), or eval:@file to run the statements in a
 *                  file, where `lab` is the lab
 *   play:s,skill[,until[,expr]]
 *                  a stand-in player plays for s seconds (skill idle|child|expert; until
 *                  finale|after|never; expr, in which a ~ is a space and `lab` is the lab, stops
 *                  play when true)
 *   say:code       run an expression in the page and print what it gives (a ~ is a space)
 * It prints what the sound was asked and where the stars stood at the end.
 */
const out = args[0] ?? 'assets/source/_scratch/wonder-film.png';
const width = Number(flag('w', '863'));
const height = Number(flag('h', '360'));
const dpr = Number(flag('dpr', '1'));
const cols = Number(flag('cols', '3'));
const query = flag('query', 'game=sparkle-sky');
const clipArg = flag('clip');
const clip = clipArg ? (clipArg.split(',').map(Number) as [number, number, number, number]) : null;
const script = flag('script', 'step:1 shot').split(/\s+/).filter(Boolean);

mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${ORIGIN}/tools/lab/wonder.html?${query}&manual=1`);
await page.waitForFunction(() => (window as unknown as { lab?: unknown }).lab !== undefined, undefined, {
  timeout: 60_000,
});
await page.waitForTimeout(300);

const frames: Rgba[] = [];
const take = async (): Promise<void> => {
  const png = decodePng(
    new Uint8Array(
      await page.screenshot(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {}),
    ),
  );
  frames.push({ width: png.width, height: png.height, data: png.data });
};

for (const word of script) {
  const [verb, ...rest] = word.split(':');
  const body = rest.join(':');
  if (verb === 'shot') await take();
  else if (verb === 'step')
    await page.evaluate((s) => (window as unknown as { lab: { step(s: number): void } }).lab.step(s), Number(body));
  else if (verb === 'until') {
    const found = await page.evaluate(
      (prefix) => (window as unknown as { lab: { until(p: string): boolean } }).lab.until(prefix),
      body,
    );
    if (!found) console.log(`[film] never heard ${body}`);
  } else if (verb === 'tap') {
    const [x, y] = body.split(',').map(Number) as [number, number];
    await page.evaluate(
      ([px, py]) => (window as unknown as { lab: { tap(x: number, y: number): void } }).lab.tap(px!, py!),
      [x, y],
    );
  } else if (verb === 'drag') {
    const parts = body.split(':');
    const points = parts[0]!.split(';').map((p) => p.split(',').map(Number) as [number, number]);
    const seconds = parts[1] ? Number(parts[1]) : 0.6;
    await page.evaluate(
      ([pts, s]) =>
        (window as unknown as { lab: { drag(p: [number, number][], s: number): void } }).lab.drag(
          pts as [number, number][],
          s as number,
        ),
      [points, seconds] as const,
    );
  } else if (verb === 'celebrate')
    await page.evaluate(() => (window as unknown as { lab: { wonder: { celebrate(): void } } }).lab.wonder.celebrate());
  else if (verb === 'eval')
    await page.evaluate(
      body.startsWith('@') ? `(async () => { ${readFileSync(body.slice(1), 'utf8')} })()` : body.replaceAll('~', ' '),
    );
  else if (verb === 'play') {
    const [seconds, skill, until, ...stop] = body.split(',');
    const result = await page.evaluate(
      ([sec, sk, un, st]) =>
        (window as unknown as { lab: { play(s: number, k: string, u: string, w: string): unknown } }).lab.play(
          Number(sec),
          sk ?? 'child',
          un ?? 'never',
          st ?? '',
        ),
      [seconds, skill, until, stop.join(',').replaceAll('~', ' ')] as const,
    );
    console.log(`[play] ${JSON.stringify(result)}`);
  } else if (verb === 'say') console.log(`[say] ${JSON.stringify(await page.evaluate(body.replaceAll('~', ' ')))}`);
  else throw new Error(`unknown script word ${word}`);
}

const summary = await page.evaluate(() => {
  const lab = (window as unknown as { lab: { state(): unknown; sound: { log: string[] } } }).lab;
  return { state: lab.state(), sounds: lab.sound.log.slice(-60) };
});
console.log(JSON.stringify(summary.state));
console.log(`sounds (last ${summary.sounds.length}): ${summary.sounds.join(' ')}`);

if (frames.length > 0) {
  const sheet = contactSheet(frames, { cols: Math.min(cols, frames.length), scale: 1, gap: 4, bg: [10, 10, 20, 255] });
  writeFileSync(out, encodePngRgba({ width: sheet.width, height: sheet.height, data: sheet.data }));
  console.log(`wrote ${out} (${frames.length} frames, ${sheet.width}x${sheet.height})`);
  if (args.includes('--each')) {
    frames.forEach((f, i) => {
      writeFileSync(
        out.replace(/\.png$/, `-${String(i + 1).padStart(2, '0')}.png`),
        encodePngRgba({ width: f.width, height: f.height, data: f.data }),
      );
    });
  }
}
await browser.close();
