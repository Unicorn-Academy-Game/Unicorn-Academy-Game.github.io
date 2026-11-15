import { readLine } from '../../src/content/reading';
import { Reader } from '../../src/game/reader';
import type { ReadHandlers, ReadView } from '../../src/game/reading-ports';
import { type ClipId, emptyProfile, type LearnerProfile } from '../../src/learning';
import { DEFAULT_LEARNING, type LearningSettings } from '../../src/shared/learning';
import { ReadingScreen } from '../../src/ui/learning/reading/screen';
import { Ui } from '../../src/ui/ui';
import { bookAt, doneView, homeView, type ItemScene, itemView, mapView } from './reading-views';

/**
 * The reading computer with nothing else of the game around it: no world and no audio, so it loads
 * in a moment and can be looked at at every size of screen. There are two ways to use it, and
 * `window.lab` is how a test or a person does either.
 *   The real session: the reader and the screen together, as in the game. `lab.open()` sits down
 *   at it.
 *   Views made by hand: `lab.show(view)` puts a view of the course on the screen with nothing
 *   behind it, so any word, any sentence and any state can be looked at. Nothing the player
 *   touches does anything then, but it is written to `lab.calls`.
 * The address says how it starts: ?stage=14&first=1&calm=1&speech=0&hud=2
 */

const q = new URLSearchParams(location.search);
const stage = Number(q.get('stage') ?? '7');
const first = q.get('first') === '1';
const calm = q.get('calm') === '1';
const speech = q.get('speech') !== '0';
const hudButtons = q.get('hud') === '2' ? 2 : 3;

const ui = new Ui(document.getElementById('ui')!);
ui.doneLoading();
ui.showHud({
  onSound: () => undefined,
  ...(hudButtons === 3 ? { onFullscreen: () => undefined } : {}),
  onParent: () => undefined,
});
// The buttons fade in, and a measurement should not wait for that.
document.querySelector<HTMLElement>('.hud')?.removeAttribute('data-hidden');

const calls: string[] = [];
const noting = (): ReadHandlers => {
  const note =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(args.length > 0 ? `${name}:${args.join(',')}` : name);
    };
  return {
    start: note('start'),
    levels: note('levels'),
    home: note('home'),
    play: note('play'),
    touch: note('touch'),
    help: note('help'),
    hear: note('hear'),
    show: note('show'),
    approve: note('approve'),
    again: note('again'),
    skip: note('skip'),
    next: note('next'),
    another: note('another'),
    close: note('close'),
  };
};

const hand = new ReadingScreen({ host: ui.host, mount: (node) => ui.underlay(node), calm: () => calm }, noting());

let profile: LearnerProfile = first ? emptyProfile() : bookAt(stage);
const settings: LearningSettings = { ...DEFAULT_LEARNING, on: true, say: speech };

/**
 * How long each clip would be, so a word is lit as it would be in the game: the lab has no voice,
 * and this is what a voice would tell it.
 */
const lengthOf = (clip: ClipId): number => {
  if (clip.startsWith('line.')) return 0.45 * (readLine(clip.slice(5))?.words.length ?? 4) + 0.4;
  if (clip.startsWith('read.')) return 1.5;
  return 0.6;
};

const reader = new Reader({
  settings: () => settings,
  book: {
    get: () => profile,
    set: (next) => {
      profile = next;
    },
  },
  now: () => Date.now(),
  random: Math.random,
  later: (ms, run) => {
    const timer = window.setTimeout(run, ms);
    return () => window.clearTimeout(timer);
  },
  makeScreen: (handlers) =>
    new ReadingScreen({ host: ui.host, mount: (node) => ui.underlay(node), calm: () => calm }, handlers),
  voice: {
    audible: speech,
    say: (clips, began) => {
      let at = 0.1;
      for (const clip of clips) {
        const seconds = lengthOf(clip);
        began?.(clip, seconds, at);
        at += seconds + 0.1;
      }
    },
    stop: () => undefined,
  },
  sounds: { open() {}, tile() {}, bounce() {}, join() {}, hint() {}, found() {}, cleared() {}, round() {} },
  rest: { freeze() {}, thaw() {} },
  report: (error) => console.error(error),
});
// A thing that is read stays until the person looking at it moves on.
reader.stayMs = 600_000;

(window as unknown as { lab: unknown }).lab = {
  reader,
  open: () => reader.open(),
  calls,
  hand,
  show: (view: ReadView) => hand.show(view),
  close: () => hand.close(),
  views: { item: (scene: ItemScene) => itemView({ stage, ...scene }), home: homeView, map: mapView, done: doneView },
};
