import { h, trapFocus } from '../../dom';
import { ICON_CLOSE } from '../icons';
import { onPress } from '../reading/press';
import '../reading/reading.css';
import './play.css';
import type { OverlayDeps } from '../../overlay';

export interface FrameSpec {
  /** Names the game in the screen's content ids, as in `memory.close`. */
  game: 'memory' | 'maths';
  /** What the dialog is called to a screen reader. */
  label: string;
  /**
   * The colour of the glass round the game, by the name the reading computer's chapters give it.
   */
  tint: string;
  /** The player closed the screen, with the cross or Escape. */
  close: () => void;
  /** An arrow key was pressed, as a step to the side and a step down. */
  arrow?: (across: number, down: number) => void;
}

export interface Parts {
  root: HTMLElement;
  panel: HTMLElement;
  /**
   * Where the game puts its own controls in the top bar, which is to the right of where the player
   * is.
   */
  tools: HTMLElement;
  /** The game's own screen. */
  body: HTMLElement;
}

/**
 * The monitor round a table's game: the same gold rim and glass as the reading computer's, over the
 * whole game, with a way out that is always there. The games draw inside it. Everything can be
 * closed at every moment, with the cross or Escape, and the keyboard never reaches Wildstar while
 * it is up.
 */
export class PlayFrame {
  private parts: (Parts & { live: HTMLElement }) | null = null;
  private told = '';
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private opener: HTMLElement | null = null;
  private watching: ResizeObserver | null = null;

  constructor(
    private readonly deps: OverlayDeps,
    private readonly spec: FrameSpec,
  ) {}

  get isOpen(): boolean {
    return this.parts !== null;
  }

  /** Puts the screen on the page, or gives back the one that is there. */
  open(title: string): Parts {
    if (this.parts) return this.parts;
    const { game } = this.spec;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shut = h('button', {
      type: 'button',
      class: 'read-close round',
      'aria-label': 'Close',
      'data-content-id': `${game}.close`,
    });
    shut.innerHTML = ICON_CLOSE;
    onPress(shut, () => this.spec.close());
    const where = h(
      'p',
      { class: 'read-where' },
      h('span', { class: 'read-level', 'data-content-id': `${game}.title` }, title),
    );
    const tools = h('div', { class: 'play-tools' });
    const body = h('div', { class: 'read-body play-body' });
    const live = h('p', { class: 'read-live', role: 'status', 'aria-live': 'polite' });
    const panel = h(
      'div',
      { class: 'read-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.spec.label, tabindex: -1 },
      h('header', { class: 'read-head' }, shut, where, tools),
      body,
      live,
    );
    const root = h(
      'div',
      {
        class: 'read table-game',
        'data-game': game,
        'data-chapter': this.spec.tint,
        'data-calm': String(this.deps.calm()),
        'data-entering': 'true',
      },
      panel,
    );
    root.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.parts = { root, panel, tools, body, live };
    this.deps.host.dataset.reading = 'true';
    this.deps.mount(root);
    this.untrap = trapFocus(panel);
    this.unlisten = this.listen();
    this.measureHud();
    panel.focus({ preventScroll: true });
    window.setTimeout(() => delete root.dataset.entering, 700);
    return this.parts;
  }

  /** Takes the screen away, and focus goes back to where it was. */
  close(): void {
    const parts = this.parts;
    if (!parts) return;
    this.unlisten?.();
    this.untrap?.();
    this.watching?.disconnect();
    parts.root.remove();
    this.parts = null;
    this.unlisten = null;
    this.untrap = null;
    this.watching = null;
    this.told = '';
    delete this.deps.host.dataset.reading;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /** Says something to a screen reader. The same words twice in a row are not said again. */
  tell(text: string): void {
    const live = this.parts?.live;
    if (!live || text === '' || text === this.told) return;
    this.told = text;
    live.textContent = '';
    window.setTimeout(() => {
      if (live.isConnected) live.textContent = text;
    }, 30);
  }

  /**
   * Leaves room in the header for the buttons that are always there, which the player can still
   * reach: as far as they reach over the panel, which is not at all when the panel is narrower than
   * the screen. The panel is measured where it is laid out, and not where it is drawn, since it is
   * drawn smaller while the screen comes on.
   */
  private measureHud(): void {
    const { root, panel } = this.parts!;
    const hud = this.deps.host.querySelector<HTMLElement>('.hud');
    const set = (): void => {
      const bar = hud && !hud.hidden ? hud.getBoundingClientRect() : null;
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = panel;
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

  /** Takes the keyboard, so keys go to the screen and never to Wildstar. */
  private listen(): () => void {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) this.spec.close();
        return;
      }
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (arrow && this.spec.arrow) {
        event.preventDefault();
        event.stopPropagation();
        this.spec.arrow(arrow[0]!, arrow[1]!);
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
