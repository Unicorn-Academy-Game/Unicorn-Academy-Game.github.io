import type { ProduceId } from '../content/produce';
import type { ProduceIcons } from '../render/produce-icons';
import { GAME_TAGLINE } from '../shared/brand';
import type { UnicornId } from '../shared/ids';
import { Basket } from './basket';
import { h } from './dom';
import { Finder, type PortraitSource } from './finder';
import { logo } from './logo';
import { bindHold } from './parent/gate';
import type { StartChoices } from './start-choices';
import { StartOptions } from './start-options';
import './style.css';
import './learning/learning.css';
import './learning/book.css';
import './low-end.css';

const SVG_PLAY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.2v17.6c0 1 1.1 1.6 2 1.1l14-8.8c.8-.5.8-1.7 0-2.2L8 2.1C7.1 1.6 6 2.2 6 3.2z" fill="#fff" stroke="#26183d" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const SVG_SOUND_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="#fff" stroke="#fff"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const SVG_SOUND_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="#fff" stroke="#fff"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
/**
 * A gear with eight rounded teeth, drawn as one outline so it can be stroked like the other icons.
 */
function gearPath(): string {
  const teeth = 8;
  const outer = 9.6;
  const inner = 7.2;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [t, r] of [
      [-0.3, inner],
      [-0.17, outer],
      [0.17, outer],
      [0.3, inner],
    ] as const) {
      const angle = a + t * step * 1.6;
      pts.push(`${(12 + Math.cos(angle) * r).toFixed(2)} ${(12 + Math.sin(angle) * r).toFixed(2)}`);
    }
  }
  return `M${pts.join('L')}Z`;
}
const SVG_GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${gearPath()}"/><circle cx="12" cy="12" r="3.2"/></svg>`;
/** Four corners pointing outward, for going full screen, and pointing inward, for coming back. */
const SVG_EXPAND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const SVG_COMPRESS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
/** A pair of round glasses, for the badge that says a parent is only looking around. */
const SVG_GLASSES =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="14" r="3.6"/><circle cx="17.5" cy="14" r="3.6"/><path d="M10.1 13.6c1.2-.9 2.6-.9 3.8 0M3 11.5 5 6h3M21 11.5 19 6h-3"/></svg>';
/** The ring that fills while the gear is held, drawn around the button. */
const SVG_HOLD_RING =
  '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" pathLength="100"/></svg>';

const svgButton = (className: string, label: string, svg: string): HTMLButtonElement => {
  const b = h('button', { type: 'button', class: className, 'aria-label': label });
  b.innerHTML = svg;
  return b;
};

export interface HudHandlers {
  onSound: () => void;
  /**
   * Goes full screen or comes back. Left out where the browser cannot do it, and then there is no
   * button.
   */
  onFullscreen?: () => void;
  /**
   * The gear was held long enough. `opener` is where focus goes back to when the controls close.
   */
  onParent: (opener: HTMLElement) => void;
}

export interface TitleDeps {
  choices: StartChoices;
  /** False in a look around, which always starts from scratch and has nothing to choose. */
  offerScratch: boolean;
  onChange: (change: Partial<StartChoices>) => void;
  onPlay: () => void;
}

export interface TitleHandle {
  /** Shows choices that were made somewhere else, without telling anyone. */
  set(choices: StartChoices): void;
  /** Takes the switches and Play out of reach, for the moment before the page reloads. */
  lock(): void;
}

/**
 * The DOM layer above the canvas: loading, title, the two always-present buttons and short notices.
 */
export class Ui {
  private readonly loadingEl: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly message: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly hudEl: HTMLElement;
  /** The top left of the screen, where the look-around badge and the unicorn counter stack. */
  private readonly corner: HTMLElement;
  private finder: Finder | null = null;
  private basket: Basket | null = null;
  private readonly soundButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private notice: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private hintTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.bar = h('i');
    this.message = h('div', { class: 'message', role: 'status' });
    this.loadingEl = h('div', { class: 'loading' }, logo(), h('div', { class: 'bar' }, this.bar), this.message);

    this.titleEl = h('div', { class: 'title' });
    this.titleEl.dataset.hidden = 'true';
    this.titleEl.hidden = true;

    this.soundButton = svgButton('round', 'Sound', SVG_SOUND_ON);
    this.fullscreenButton = svgButton('round', 'Full screen', SVG_EXPAND);
    this.fullscreenButton.hidden = true;
    this.settingsButton = svgButton(
      'round',
      'Parent controls. Press and hold to open.',
      `${SVG_GEAR}${SVG_HOLD_RING}<i class="dot" aria-hidden="true"></i>`,
    );
    this.hudEl = h('div', { class: 'hud' }, this.soundButton, this.fullscreenButton, this.settingsButton);
    this.hudEl.dataset.hidden = 'true';
    this.hudEl.hidden = true;

    this.corner = h('div', { class: 'corner' });
    this.root.append(this.titleEl, this.hudEl, this.corner, this.loadingEl);
  }

  /** Adds a layer of the game's own that sits under the title, the buttons and the notices. */
  underlay(node: HTMLElement): void {
    this.root.insertBefore(node, this.titleEl);
  }

  progress(fraction: number, message?: string): void {
    this.loadingEl.style.setProperty('--progress', String(Math.max(0, Math.min(1, fraction))));
    if (message !== undefined) this.message.textContent = message;
  }

  /** Shows a failure on the loading screen, with a way to try again. */
  failed(message: string, retry: () => void): void {
    this.bar.parentElement!.hidden = true;
    this.message.textContent = message;
    const again = h('button', { type: 'button', class: 'retry' }, 'Try again');
    again.addEventListener('click', retry, { once: true });
    this.loadingEl.append(again);
  }

  doneLoading(): void {
    this.loadingEl.dataset.done = 'true';
    window.setTimeout(() => this.loadingEl.remove(), 700);
  }

  /**
   * The title screen: the logo, the opening line, the switches for how to begin, and one large play
   * button. The first tap on play starts the game. The returned handle shows choices made somewhere
   * else, and locks the screen while the page is about to reload.
   */
  showTitle(deps: TitleDeps): TitleHandle {
    const play = svgButton('play', 'Play', SVG_PLAY);
    const options = new StartOptions({
      choices: deps.choices,
      offerScratch: deps.offerScratch,
      onChange: deps.onChange,
    });
    const stack = h('div', { class: 'stack' }, logo(), h('p', { class: 'tagline' }, GAME_TAGLINE), options.node, play);
    this.titleEl.replaceChildren(stack);
    this.titleEl.hidden = false;
    requestAnimationFrame(() => delete this.titleEl.dataset.hidden);
    play.addEventListener(
      'click',
      () => {
        this.titleEl.dataset.hidden = 'true';
        window.setTimeout(() => (this.titleEl.hidden = true), 520);
        deps.onPlay();
      },
      { once: true },
    );
    // A keyboard player lands on Play. Anyone who has already reached for a control keeps it: a
    // late timer must not pull focus away.
    window.setTimeout(() => {
      const reached = document.activeElement;
      if (!this.titleEl.hidden && (!reached || reached === document.body)) play.focus({ preventScroll: true });
    }, 50);
    return {
      set: (choices) => options.set(choices),
      lock: () => {
        options.node.inert = true;
        play.disabled = true;
      },
    };
  }

  showHud(handlers: HudHandlers): void {
    this.hudEl.hidden = false;
    requestAnimationFrame(() => delete this.hudEl.dataset.hidden);
    this.soundButton.addEventListener('click', handlers.onSound);
    if (handlers.onFullscreen) {
      this.fullscreenButton.hidden = false;
      this.fullscreenButton.addEventListener('click', handlers.onFullscreen);
    }
    bindHold(this.settingsButton, {
      onOpen: () => handlers.onParent(this.settingsButton),
      onHint: () => this.hintParentGate(),
    });
  }

  /**
   * A small dot on the gear for something a parent should look at. The child sees a dot and nothing
   * to do about it.
   */
  setAttention(on: boolean): void {
    if (on) this.settingsButton.dataset.attention = 'true';
    else delete this.settingsButton.dataset.attention;
  }

  /** Where the parent controls are put. */
  get host(): HTMLElement {
    return this.root;
  }

  /** What a tap on the gear says: it opens by holding, not tapping. Gone again after a moment. */
  private hintParentGate(): void {
    this.hint?.remove();
    window.clearTimeout(this.hintTimer);
    const hint = h('div', { class: 'hint', role: 'status' }, 'Hold the gear to open parent controls');
    this.hint = hint;
    this.root.append(hint);
    this.hintTimer = window.setTimeout(() => hint.remove(), 3200);
  }

  /**
   * Says that this is a look around and not the player's game: nothing that happens is saved. It
   * stays on screen the whole time, over the loading screen and the title, so a parent never
   * mistakes it for their world.
   */
  showIncognito(): void {
    const icon = h('span', { class: 'badge-icon', 'aria-hidden': 'true' });
    icon.innerHTML = SVG_GLASSES;
    this.corner.prepend(
      h(
        'div',
        { class: 'badge', role: 'status' },
        icon,
        h('span', {}, h('strong', {}, 'Incognito'), h('em', {}, 'nothing is saved')),
      ),
    );
  }

  /**
   * Puts up the row of unicorn portraits and the count of how many are still hiding, as they stand
   * now. `calm` says whether the parent asked for fewer effects, which keeps the confetti away.
   */
  showFinder(portraits: PortraitSource, found: readonly UnicornId[], calm: () => boolean): void {
    if (this.finder) return;
    const finder = new Finder(this.root, portraits, calm);
    finder.set(found);
    finder.node.dataset.hidden = 'true';
    this.corner.append(finder.node);
    requestAnimationFrame(() => delete finder.node.dataset.hidden);
    this.finder = finder;
  }

  /**
   * Puts up the basket under the counter. It stays out of sight until the first fruit or vegetable
   * is gathered.
   */
  showBasket(icons: ProduceIcons, calm: () => boolean): void {
    if (this.basket) return;
    this.basket = new Basket(this.root, icons, calm);
    this.corner.append(this.basket.node);
  }

  /**
   * A fruit or vegetable was gathered. `from` is where it lay on the screen, in CSS pixels, or null
   * if that is not known.
   */
  produceGathered(id: ProduceId, from: { x: number; y: number } | null): void {
    this.basket?.collect(id, from);
  }

  /** The top left of the screen, which the exit bubbles keep clear of. */
  get cornerNode(): HTMLElement {
    return this.corner;
  }

  /** A friend joined the herd. Her portrait lights up and she is announced. */
  unicornFound(id: UnicornId, found: readonly UnicornId[]): void {
    this.finder?.celebrate(id, found);
  }

  /** Which way the full screen button points: out to go full screen, in to come back. */
  setFullscreen(active: boolean): void {
    this.fullscreenButton.innerHTML = active ? SVG_COMPRESS : SVG_EXPAND;
    this.fullscreenButton.setAttribute('aria-label', active ? 'Leave full screen' : 'Full screen');
    this.fullscreenButton.setAttribute('aria-pressed', String(active));
  }

  setMuted(muted: boolean): void {
    this.soundButton.innerHTML = muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
    this.soundButton.setAttribute('aria-pressed', String(muted));
  }

  /**
   * A short line with one button, for the rare thing that needs the player's attention, such as a
   * door that would not open.
   */
  showNotice(text: string, action: { label: string; run: () => void }): void {
    this.dismissNotice();
    const button = h('button', { type: 'button' }, action.label);
    const notice = h('div', { class: 'notice', role: 'status' }, h('span', {}, text), button);
    button.addEventListener('click', () => {
      this.dismissNotice();
      action.run();
    });
    this.notice = notice;
    this.root.append(notice);
  }

  dismissNotice(): void {
    this.notice?.remove();
    this.notice = null;
  }
}
