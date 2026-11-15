import { chromium } from '@playwright/test';
import { flag } from '../lib/args';
import { ORIGIN } from './origin';

/**
 * What a game asks of a screen while it is played, and where the time goes, on the lab page.
 *   tsx tools/qa/wonder-cost.ts [--game party-time] [--quality 0] [--dpr 1] [--seconds 240] [--herd wildstar,leaf,...] [--profile 40]
 * It needs the development server on port 5173, or on `UA_PORT`. The stand-in expert plays for
 * `--seconds` of game time, and the stage's own cost of a frame (script and draw commands in
 * milliseconds, smoothed over about ten frames) is written down after every step, beside the same
 * figure for 60 frames of the game before anything is touched. With `--profile N` it samples the
 * page for N seconds of play instead and prints the functions that took the most time themselves,
 * then the game's own functions with what each of them called counted in. What the numbers are not.
 * Chromium here draws with a software renderer, so no figure is GPU time and none is a tablet's.
 * They move with how busy this machine is, so read a game beside another one measured in the same
 * sitting, and the mean beside the idle figure.
 */

const game = flag('game', 'party-time');
const quality = flag('quality', '0');
const dpr = Number(flag('dpr', '1'));
const seconds = Number(flag('seconds', '240'));
const profileSeconds = Number(flag('profile', '0'));
const herd = flag('herd', 'wildstar,leaf,glacier,river,cinder,storm');

interface Result {
  idle: number;
  mean: number;
  p95: number;
  max: number;
  frames: number;
  played: { time: number; stars: number; phase: string };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 863, height: 360 }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${ORIGIN}/tools/lab/wonder.html?game=${game}&manual=1&quality=${quality}&seed=7&herd=${herd}`);
await page.waitForFunction('window.lab !== undefined', undefined, { timeout: 120_000 });

// The scripts below are strings so that nothing the tools compiler adds to a function can be
// missing in the page.
if (profileSeconds > 0) {
  await page.evaluate('(() => { for (let i = 0; i < 60; i++) window.lab.stage.step(1 / 60); })()');
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 400 });
  await client.send('Profiler.start');
  await page.evaluate(`window.lab.play(${profileSeconds}, 'expert', 'never')`);
  const { profile } = await client.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
  const own = new Map<number, number>();
  (profile.samples ?? []).forEach((id, i) => {
    own.set(id, (own.get(id) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
  });
  const nameOf = (id: number): string => {
    const f = nodes.get(id)!.callFrame;
    const where = f.url.replace(/^.*\/(src|tools)\//, '$1/').replace(/\?t=\d+/, '');
    return `${f.functionName || '(anonymous)'}  ${where}:${f.lineNumber + 1}`;
  };
  const isOurs = (id: number): boolean => /\/(src|tools)\//.test(nodes.get(id)!.callFrame.url);
  const total = [...own.values()].reduce((a, b) => a + b, 0);
  const byOwn = new Map<string, number>();
  const byCalled = new Map<string, number>();
  for (const [id, us] of own) {
    byOwn.set(nameOf(id), (byOwn.get(nameOf(id)) ?? 0) + us);
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      if (!isOurs(at) || seen.has(nameOf(at))) continue;
      seen.add(nameOf(at));
      byCalled.set(nameOf(at), (byCalled.get(nameOf(at)) ?? 0) + us);
    }
  }
  const show = (title: string, rows: Map<string, number>, count: number): void => {
    console.log(title);
    for (const [name, us] of [...rows].sort((a, b) => b[1] - a[1]).slice(0, count))
      console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)} ms  ${name}`);
  };
  console.log(`${game} q${quality} dpr${dpr}, ${profileSeconds} s of play, ${(total / 1000).toFixed(0)} ms sampled`);
  show('time of their own (drawing done by the browser is named for what it was, such as drawImage)', byOwn, 12);
  show('the game and its parts, with what each called counted in', byCalled, 40);
} else {
  const result = (await page.evaluate(`(() => {
    const lab = window.lab;
    const stage = lab.stage;
    const idle = [];
    for (let i = 0; i < 90; i++) {
      stage.step(1 / 60);
      idle.push(stage.cost);
    }
    const costs = [];
    const original = stage.step.bind(stage);
    stage.step = (s) => {
      original(s);
      costs.push(stage.cost);
    };
    const played = lab.play(${seconds}, 'expert', 'never');
    stage.step = original;
    const sorted = [...costs].sort((a, b) => a - b);
    return {
      idle: idle.slice(30).reduce((a, b) => a + b, 0) / 60,
      mean: costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length),
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      max: sorted[sorted.length - 1] || 0,
      frames: costs.length,
      played,
    };
  })()`)) as Result;
  const ms = (n: number): number => Math.round(n * 10) / 10;
  console.log(
    `${game} q${quality} dpr${dpr}`,
    JSON.stringify({
      ...result,
      idle: ms(result.idle),
      mean: ms(result.mean),
      p95: ms(result.p95),
      max: ms(result.max),
    }),
  );
}
await browser.close();
