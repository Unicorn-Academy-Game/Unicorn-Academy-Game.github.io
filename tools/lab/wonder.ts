import { CINEMA_IDS, isScreen, type ScreenId, WONDER_IDS } from '../../src/content/wonders';
import { Rng } from '../../src/domain/rng';
import { pageTexture, unicornTexture } from '../../src/render/keys';
import { UNICORN_IDS, type UnicornId } from '../../src/shared/ids';
import { Manifest } from '../../src/shared/manifest';
import { SpriteBank } from '../../src/wonder/engine/bank';
import { Stage } from '../../src/wonder/engine/stage';
import { createWonder } from '../../src/wonder/registry';
import { recorder } from '../../src/wonder/sound';
import { playerFor, type Skill } from './players';

/**
 * One game on its own stage, with the real pictures and a sound that writes down what it was asked,
 * so a game can be looked at, driven and measured in a real browser without the world behind it.
 * `window.lab` is how a test or a person drives it.
 *   ?game=sparkle-sky  ?look=blue  ?herd=wildstar,leaf  ?seed=7  ?calm=1  ?manual=1 (steps only when told)  ?quality=0|1|2
 */

const params = new URLSearchParams(location.search);
const game = ((): ScreenId => {
  const asked = params.get('game') ?? 'sparkle-sky';
  if (!isScreen(asked))
    throw new Error(`no game called ${asked}. Games are ${[...WONDER_IDS, ...CINEMA_IDS].join(', ')}`);
  return asked;
})();
const herd = (params.get('herd') ?? 'wildstar,leaf,river,cinder')
  .split(',')
  .filter((id): id is UnicornId => (UNICORN_IDS as readonly string[]).includes(id));
const manual = params.get('manual') === '1';
const calm = params.get('calm') === '1';

const manifest = Manifest.parse(await (await fetch('/assets/manifest.json')).json());
const images = new Map<string, HTMLImageElement>();
const load = (key: string, file: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      images.set(key, image);
      resolve();
    };
    image.onerror = () => reject(new Error(`could not load ${file}`));
    image.src = `/assets/${file}`;
  });

const jobs: Promise<void>[] = [];
for (const id of herd) jobs.push(load(unicornTexture(id), manifest.unicorns[id].atlas.file));
for (const bundle of ['playground', 'fx', 'produce', 'life', 'manor']) {
  manifest.bundles[bundle]?.pages.forEach((page, i) => {
    jobs.push(load(pageTexture(bundle, i), page.file));
  });
}
await Promise.all(jobs);

const host = document.getElementById('host')!;
const readout = document.getElementById('readout')!;
// The sound's clock is the stage's, so music that keeps time by it plays here as it does in the
// game.
const sound = recorder(() => stage.time);
const bank = new SpriteBank(manifest, (key) => images.get(key));
const stage = new Stage({
  host,
  calm,
  manual,
  ...(params.has('dpr') ? { pixelRatio: Number(params.get('dpr')) } : {}),
});
const quality = params.get('quality');
for (let level = 2; quality !== null && level > Number(quality); level--) stage.lower();

const seed = Number(params.get('seed') ?? '7');
const wonder = createWonder(game, {
  bank,
  rng: new Rng(seed),
  calm,
  look: params.get('look') ?? 'red',
  herd,
  sound,
  from: { x: 0.5, y: 0.8 },
  onStar: (stars) => sound.mark(`star:${stars}`),
  onFinale: () => sound.mark('finale'),
  onAfter: () => sound.mark('after'),
});
stage.play(wonder);
stage.start();
stage.redraw();

const lab = {
  stage,
  wonder,
  sound,
  /** Moves the game on by this many seconds, in sixtieths. */
  step: (seconds: number): void => stage.step(seconds),
  /**
   * Moves the game on until the sound is asked for something that starts with `prefix` (such as
   * `fx:boom`), or `max` seconds pass.
   */
  until(prefix: string, max = 6): boolean {
    const from = sound.log.length;
    for (let t = 0; t < max; t += 1 / 60) {
      if (sound.log.slice(from).some((entry) => entry.startsWith(prefix))) return true;
      stage.step(1 / 60);
    }
    return false;
  },
  /** A touch at a place in the game's own units, held for `hold` seconds. */
  tap(x: number, y: number, hold = 0.06): void {
    stage.inject('down', 1, x, y);
    stage.step(hold);
    stage.inject('up', 1, x, y);
  },
  /** A finger that goes down at the first point, moves through the rest in `seconds`, and lifts. */
  drag(points: readonly (readonly [number, number])[], seconds = 0.6): void {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return;
    stage.inject('down', 2, first[0], first[1]);
    const each = seconds / Math.max(1, points.length - 1);
    for (const [x, y] of points.slice(1)) {
      stage.step(each);
      stage.inject('move', 2, x, y);
    }
    stage.inject('up', 2, last[0], last[1]);
  },
  /**
   * Plays for this long as a stand-in for a person: `child` taps anywhere now and then, `expert`
   * taps where the game asks. Stops early at the finale.
   */
  play(
    seconds: number,
    skill: Skill = 'child',
    until: 'finale' | 'after' | 'never' = 'never',
    stopWhen = '',
  ): { time: number; stars: number; phase: string; starTimes: number[] } {
    // A test can also say, as an expression that may use `lab`, the moment it wants play to stop
    // at.
    const stop = stopWhen ? (new Function('lab', `return (${stopWhen});`) as (lab: unknown) => unknown) : null;
    const size = stage.view;
    let held: [number, number] | null = null;
    const hands = {
      width: size.w,
      height: size.h,
      tap(x: number, y: number): void {
        stage.inject('down', 3, x, y);
        stage.inject('up', 3, x, y);
      },
      press(x: number, y: number): void {
        held = [x, y];
        stage.inject('down', 4, x, y);
      },
      move(x: number, y: number): void {
        if (!held) return;
        held = [x, y];
        stage.inject('move', 4, x, y);
      },
      lift(): void {
        if (held) stage.inject('up', 4, held[0], held[1]);
        held = null;
      },
    };
    const player = playerFor(game, wonder, skill, hands, new Rng(seed + 99));
    const from = stage.time;
    // When each star was earned, in seconds from the start of play.
    const starTimes: number[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      player.act(1 / 60);
      stage.step(1 / 60);
      while (starTimes.length < wonder.stars) starTimes.push(stage.time - from);
      if (until === 'finale' && wonder.phase !== 'play') break;
      if (until === 'after' && wonder.phase === 'after') break;
      if (stop?.(lab)) break;
    }
    hands.lift();
    return { time: stage.time - from, stars: wonder.stars, phase: wonder.phase, starTimes };
  },
  state: () => ({
    stars: wonder.stars,
    phase: wonder.phase,
    time: stage.time,
    quality: stage.quality,
    cost: stage.cost,
    frames: stage.frames,
    view: stage.view,
  }),
};
(window as unknown as { lab: typeof lab }).lab = lab;

if (!manual) {
  setInterval(() => {
    const s = lab.state();
    readout.textContent = `${game} ${stage.canvas.width}x${stage.canvas.height}  q${s.quality}  ${s.cost.toFixed(1)} ms  stars ${s.stars}  ${s.phase}`;
  }, 250);
}
