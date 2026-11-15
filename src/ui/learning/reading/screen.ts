import type { ReadHandlers, ReadScreen, ReadView } from '../../../game/reading-ports';
import { h, trapFocus } from '../../dom';
import { ICON_CLOSE } from '../icons';
import './reading.css';
import type { OverlayDeps } from '../../overlay';
import { Bands } from './bands';
import { DonePane } from './done';
import { effectsOf } from './effects';
import { HomePane } from './home';
import { ItemPane } from './item';
import { MapPane } from './map';
import { onPress } from './press';
import { announcement, dialogLabel, LABELS } from './text';

type Pane =
  | { kind: 'home'; pane: HomePane }
  | { kind: 'map'; pane: MapPane }
  | { kind: 'item'; pane: ItemPane; deal: number }
  | { kind: 'done'; pane: DonePane };

interface Parts {
  panel: HTMLElement;
  level: HTMLElement;
  chapter: HTMLElement;
  bands: Bands;
  body: HTMLElement;
  live: HTMLElement;
}

/**
 * The reading computer's screen: a monitor with the sun's colours round it, over the whole game. It
 * is a picture of the view the session hands it. Each view is drawn in place when it is the same
 * thing as before, so what the player touches keeps its motion, and each cue is shown once.
 * Everything can be closed at every moment, with the cross or Escape, and the keyboard never
 * reaches Wildstar while it is up.
 */
export class ReadingScreen implements ReadScreen {
  private root: HTMLElement | null = null;
  private parts: Parts | null = null;
  private current: Pane | null = null;
  private lastCue = -1;
  private told = '';
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private opener: HTMLElement | null = null;
  private watching: ResizeObserver | null = null;

  constructor(
    private readonly deps: OverlayDeps,
    private readonly handlers: ReadHandlers,
  ) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(view: ReadView): void {
    if (!this.root) this.open();
    const root = this.root!;
    const parts = this.parts!;
    this.swap(view);
    root.dataset.screen = view.screen;
    parts.panel.setAttribute('aria-label', dialogLabel(view));
    if (view.screen !== 'map') root.dataset.chapter = view.stage.chapter;
    parts.level.textContent =
      view.screen === 'home' ? '' : view.screen === 'map' ? LABELS.levels : `Level ${view.stage.n}`;
    parts.chapter.textContent = view.screen === 'item' ? view.chapter : '';
    parts.bands.node.hidden = view.screen !== 'item';
    if (view.screen === 'item') parts.bands.update(view.bands);
    this.tell(announcement(view), view.screen === 'item' ? view.deal : -1);
    if (view.screen === 'item' && view.cue && view.cue.n !== this.lastCue && this.current?.kind === 'item') {
      this.lastCue = view.cue.n;
      this.current.pane.play(effectsOf(view.cue));
    }
  }

  /** Takes the screen away. What it was doing is dropped, and focus goes back to where it was. */
  close(): void {
    if (!this.root) return;
    this.unlisten?.();
    this.untrap?.();
    this.watching?.disconnect();
    this.destroyPane();
    this.root.remove();
    this.root = null;
    this.parts = null;
    this.unlisten = null;
    this.untrap = null;
    this.watching = null;
    this.lastCue = -1;
    this.told = '';
    delete this.deps.host.dataset.reading;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  private open(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shut = h('button', {
      type: 'button',
      class: 'read-close round',
      'aria-label': LABELS.close,
      'data-content-id': 'reading.close',
    });
    shut.innerHTML = ICON_CLOSE;
    onPress(shut, () => this.handlers.close());
    const level = h('span', { class: 'read-level', 'data-content-id': 'reading.level' });
    const chapter = h('span', { class: 'read-chapter-name' });
    const bands = new Bands('small');
    bands.node.hidden = true;
    const head = h('header', { class: 'read-head' }, shut, h('p', { class: 'read-where' }, level, chapter), bands.node);
    const body = h('div', { class: 'read-body' });
    const live = h('p', { class: 'read-live', role: 'status', 'aria-live': 'polite' });
    const panel = h(
      'div',
      { class: 'read-panel', role: 'dialog', 'aria-modal': 'true', tabindex: -1 },
      head,
      body,
      live,
    );
    const root = h('div', { class: 'read', 'data-calm': String(this.deps.calm()), 'data-entering': 'true' }, panel);
    root.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root = root;
    this.parts = { panel, level, chapter, bands, body, live };
    this.deps.host.dataset.reading = 'true';
    this.deps.mount(root);
    this.untrap = trapFocus(panel);
    this.unlisten = this.listen();
    this.measureHud();
    panel.focus({ preventScroll: true });
    window.setTimeout(() => delete root.dataset.entering, 700);
  }

  /**
   * Draws the view in the pane it belongs to, making a new pane when it is not the same thing as
   * before.
   */
  private swap(view: ReadView): void {
    const now = this.current;
    switch (view.screen) {
      case 'home': {
        if (now?.kind === 'home') {
          now.pane.update(view);
          return;
        }
        this.put({ kind: 'home', pane: new HomePane(view, this.handlers) });
        return;
      }
      case 'map': {
        if (now?.kind === 'map') {
          now.pane.update(view);
          return;
        }
        const pane = new MapPane(view, this.handlers);
        this.put({ kind: 'map', pane });
        pane.reveal();
        return;
      }
      case 'item': {
        if (now?.kind === 'item' && now.deal === view.deal) {
          now.pane.update(view);
          return;
        }
        const pane = new ItemPane(view, { handlers: this.handlers, calm: this.deps.calm });
        this.put({ kind: 'item', pane, deal: view.deal });
        pane.fit();
        return;
      }
      case 'done': {
        if (now?.kind === 'done') {
          now.pane.update(view);
          return;
        }
        this.put({ kind: 'done', pane: new DonePane(view, this.handlers) });
        return;
      }
    }
  }

  private put(next: Pane): void {
    this.destroyPane();
    this.current = next;
    const node = next.pane.node;
    node.dataset.enter = 'true';
    this.parts!.body.replaceChildren(node);
    window.setTimeout(() => delete node.dataset.enter, 600);
  }

  private destroyPane(): void {
    if (this.current?.kind === 'item' || this.current?.kind === 'map') this.current.pane.destroy();
    this.current = null;
  }

  /**
   * Leaves room in the header for the buttons that are always there, which the player can still
   * reach: as far as they reach over the panel, which is not at all when the panel is narrower than
   * the screen. The panel is measured where it is laid out, and not where it is drawn, since it is
   * drawn smaller while the screen comes on.
   */
  private measureHud(): void {
    const { root, parts } = { root: this.root!, parts: this.parts! };
    const hud = this.deps.host.querySelector<HTMLElement>('.hud');
    const set = (): void => {
      const bar = hud && !hud.hidden ? hud.getBoundingClientRect() : null;
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = parts.panel;
      const over = bar !== null && bar.width > 0 && bar.bottom > top && bar.top < top + height;
      root.style.setProperty('--hud', `${over ? Math.max(0, Math.round(left + width - bar.left + 8)) : 0}px`);
    };
    set();
    if (typeof ResizeObserver === 'function') {
      this.watching = new ResizeObserver(set);
      this.watching.observe(root);
      if (hud) this.watching.observe(hud);
    }
  }

  /**
   * Says something to a screen reader. The same words for the same thing twice in a row are not
   * said again.
   */
  private tell(text: string, deal: number): void {
    const live = this.parts?.live;
    const key = `${deal}:${text}`;
    if (!live || text === '' || key === this.told) return;
    this.told = key;
    live.textContent = '';
    window.setTimeout(() => {
      if (live.isConnected) live.textContent = text;
    }, 30);
  }

  /** Takes the keyboard, so keys go to the screen and never to Wildstar. */
  private listen(): () => void {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) this.handlers.close();
        return;
      }
      const arrow = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].indexOf(event.key);
      if (arrow >= 0 && this.current?.kind === 'item') {
        event.preventDefault();
        event.stopPropagation();
        this.current.pane.move(arrow < 2 ? -1 : 1);
        return;
      }
      // Anything else, Enter and space on a button included, does what the button under focus does,
      // and never reaches Wildstar.
      event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }
}
