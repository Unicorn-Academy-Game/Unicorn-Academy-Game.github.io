import { type Child, h, trapFocus } from '../dom';
import './parent.css';
import { about } from './pages/about';
import { learning } from './pages/learning';
import { offline } from './pages/offline';
import { play } from './pages/play';
import { recovery } from './pages/recovery';
import { saving } from './pages/saving';
import { sound } from './pages/sound';
import type { ParentServices } from './services';
import { bookNeedsAttention, needsAttention, type Tone } from './text';
import { toast } from './widgets';

export type PageId = 'sound' | 'play' | 'learning' | 'saving' | 'offline' | 'recovery' | 'about';

export interface ConfirmOptions {
  title: string;
  body: Child[];
  confirm: string;
  cancel?: string;
  tone?: 'normal' | 'danger';
}

/** What a page may do besides draw itself. */
export interface PageContext {
  services: ParentServices;
  /**
   * Asks the parent to agree before something that matters. Resolves true only when they choose to
   * go ahead.
   */
  confirm(options: ConfirmOptions): Promise<boolean>;
  /**
   * Covers the page with a message while something runs, so it cannot be started twice. Returns a
   * way to uncover it.
   */
  busy(message: string): () => void;
  say(text: string, tone?: Tone): void;
  /** Runs `undo` when the parent leaves the page or closes the controls. */
  onLeave(undo: () => void): void;
  go(page: PageId): void;
}

export type Page = (ctx: PageContext) => HTMLElement;

const PAGES: { id: PageId; label: string; build: Page; icon: string }[] = [
  {
    id: 'sound',
    label: 'Sound',
    build: sound,
    icon: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  },
  {
    id: 'play',
    label: 'Play',
    build: play,
    icon: '<path d="M12 3.6l2.5 5.4 5.9.7-4.3 4.1 1.1 5.8L12 16.8l-5.2 2.8 1.1-5.8L3.6 9.7l5.9-.7z"/>',
  },
  {
    id: 'learning',
    label: 'Learning',
    build: learning,
    icon: '<path d="M4 6c2.6-1.1 5.6-.9 8 .8 2.4-1.7 5.4-1.9 8-.8v12.2c-2.6-1.1-5.6-.9-8 .8-2.4-1.7-5.4-1.9-8-.8z"/><path d="M12 6.8v12.2"/>',
  },
  {
    id: 'saving',
    label: 'Saving',
    build: saving,
    icon: '<path d="M7 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.6 4 4 0 0 1 17.5 18z"/><path d="M12 15v-5M9.8 12l2.2-2.2 2.2 2.2"/>',
  },
  {
    id: 'offline',
    label: 'Offline',
    build: offline,
    icon: '<path d="M3 9.5a14 14 0 0 1 18 0M6 13a9.5 9.5 0 0 1 12 0M9.2 16.4a5 5 0 0 1 5.6 0"/><path d="M12 19.6v.1"/>',
  },
  {
    id: 'recovery',
    label: 'Recovery',
    build: recovery,
    icon: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4M12 8v4.2l2.8 1.8"/>',
  },
  {
    id: 'about',
    label: 'About',
    build: about,
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  },
];

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export interface PanelHooks {
  /** The controls opened. The game stops listening for taps. */
  onOpen(): void;
  onClose(): void;
}

const svg = (paths: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

/**
 * The parent controls: one sheet over the game with a page for each job. It is built when opened
 * and taken apart when closed, so closed it costs nothing. Everything it shows comes from
 * `ParentServices`.
 */
export class ParentPanel {
  private root: HTMLElement | null = null;
  private lastPage: PageId = 'sound';
  private opener: HTMLElement | null = null;
  private teardown: (() => void)[] = [];
  private leave: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly services: ParentServices,
    private readonly hooks: PanelHooks,
  ) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /**
   * The pages with something on them that wants a parent's eye, which get a dot on their tab, and
   * one of which the controls open on.
   */
  private needsEye(): { saving: boolean; learning: boolean } {
    const { saves, learning, settings, visit } = this.services;
    return {
      saving: needsAttention(saves.get()),
      learning: bookNeedsAttention(learning.keeping(), visit, settings.get().learning.on),
    };
  }

  open(opener: HTMLElement | null = null): void {
    if (this.root) return;
    this.opener = opener;
    const { saving: savingNeeds, learning: learningNeeds } = this.needsEye();
    const start = savingNeeds ? 'saving' : learningNeeds ? 'learning' : this.lastPage;

    const title = h('h2', { id: 'parent-title', tabindex: -1 }, 'Parent controls');
    const close = h('button', {
      type: 'button',
      class: 'close',
      'aria-label': 'Close parent controls',
      onclick: () => this.close(),
    });
    close.innerHTML = CLOSE_ICON;
    const tabs = h('nav', {
      class: 'parent-nav',
      role: 'tablist',
      'aria-label': 'Parent controls sections',
      'aria-orientation': 'vertical',
    });
    const stage = h('div', { class: 'parent-page', role: 'tabpanel', tabindex: 0 });
    const message = toast();
    const layer = h('div', { class: 'layer', hidden: true });
    const main = h(
      'div',
      { class: 'parent-main' },
      h('header', { class: 'parent-head' }, title, close),
      h('div', { class: 'parent-body' }, tabs, stage),
    );
    const sheet = h('div', { class: 'parent-sheet', tabindex: -1 }, main, message.node, layer);
    const root = h(
      'div',
      { class: 'parent', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'parent-title' },
      sheet,
    );

    const buttons = new Map<PageId, HTMLButtonElement>();
    for (const page of PAGES) {
      const tab = h('button', {
        type: 'button',
        role: 'tab',
        id: `tab-${page.id}`,
        class: 'tab',
        'aria-controls': 'parent-panel',
        'aria-selected': 'false',
        tabindex: -1,
        onclick: () => show(page.id),
      });
      tab.innerHTML = `${svg(page.icon)}<span>${page.label}</span><i class="dot" aria-hidden="true"></i>`;
      buttons.set(page.id, tab);
      tabs.append(tab);
    }
    stage.id = 'parent-panel';

    const refreshAttention = (): void => {
      for (const [id, flagged] of Object.entries(this.needsEye()) as [PageId, boolean][]) {
        const tab = buttons.get(id)!;
        if (flagged) tab.dataset.attention = 'true';
        else delete tab.dataset.attention;
      }
    };
    this.teardown.push(this.services.saves.subscribe(refreshAttention));
    this.teardown.push(this.services.settings.subscribe(refreshAttention));
    refreshAttention();

    const context: PageContext = {
      services: this.services,
      confirm: (options) => this.confirm(layer, main, options),
      busy: (text) => this.busy(layer, main, text),
      say: (text, tone) => message.say(text, tone),
      onLeave: (undo) => void this.leave.push(undo),
      go: (id) => show(id),
    };

    const show = (id: PageId): void => {
      const page = PAGES.find((p) => p.id === id)!;
      this.runLeave();
      message.clear();
      this.lastPage = id;
      for (const [pid, tab] of buttons) {
        tab.setAttribute('aria-selected', String(pid === id));
        tab.tabIndex = pid === id ? 0 : -1;
      }
      stage.setAttribute('aria-labelledby', `tab-${id}`);
      stage.replaceChildren(page.build(context));
      stage.scrollTop = 0;
    };

    tabs.addEventListener('keydown', (event) => {
      const order = PAGES.map((p) => p.id);
      const at = order.indexOf(this.lastPage);
      const next = {
        ArrowDown: at + 1,
        ArrowRight: at + 1,
        ArrowUp: at - 1,
        ArrowLeft: at - 1,
        Home: 0,
        End: order.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const id = order[(next + order.length) % order.length]!;
      show(id);
      buttons.get(id)!.focus();
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!layer.hidden) layer.dispatchEvent(new CustomEvent('dismiss'));
      else this.close();
    });
    // A tap on the dim area around the sheet closes it, as on any sheet. Taps inside it do not.
    root.addEventListener('click', (event) => {
      if (event.target === root && layer.hidden) this.close();
    });
    this.teardown.push(trapFocus(root));

    this.root = root;
    this.host.append(root);
    // Nothing else on the page can be reached, by keyboard or by a screen reader, until the
    // controls close.
    for (const other of this.host.children) {
      if (other === root || other.hasAttribute('inert')) continue;
      other.setAttribute('inert', '');
      this.teardown.push(() => other.removeAttribute('inert'));
    }
    this.hooks.onOpen();
    show(start);
    requestAnimationFrame(() => root.classList.add('shown'));
    title.focus({ preventScroll: true });
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    this.runLeave();
    for (const stop of this.teardown.splice(0)) stop();
    root.classList.remove('shown');
    root.setAttribute('inert', '');
    window.setTimeout(() => root.remove(), 220);
    this.hooks.onClose();
    const back = this.opener;
    this.opener = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  private runLeave(): void {
    for (const undo of this.leave.splice(0)) undo();
  }

  /**
   * Puts a question over the page and waits. The page behind cannot be reached until it is
   * answered.
   */
  private confirm(layer: HTMLElement, behind: HTMLElement, options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const before = document.activeElement as HTMLElement | null;
      const titleId = 'confirm-title';
      const bodyId = 'confirm-body';
      const finish = (answer: boolean): void => {
        layer.removeEventListener('dismiss', dismiss);
        layer.hidden = true;
        layer.replaceChildren();
        behind.removeAttribute('inert');
        if (before?.isConnected) before.focus({ preventScroll: true });
        resolve(answer);
      };
      const dismiss = (): void => finish(false);
      const cancel = h(
        'button',
        { type: 'button', class: 'btn quiet', onclick: () => finish(false) },
        options.cancel ?? 'Not now',
      );
      const go = h(
        'button',
        {
          type: 'button',
          class: `btn ${options.tone === 'danger' ? 'danger' : 'primary'}`,
          onclick: () => finish(true),
        },
        options.confirm,
      );
      const dialog = h(
        'div',
        {
          class: 'dialog',
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          'aria-describedby': bodyId,
        },
        h('h3', { id: titleId }, options.title),
        h('div', { class: 'dialog-body', id: bodyId }, ...options.body),
        h('div', { class: 'dialog-actions' }, cancel, go),
      );
      layer.addEventListener('dismiss', dismiss);
      layer.replaceChildren(dialog);
      layer.hidden = false;
      behind.setAttribute('inert', '');
      // The safe answer has the focus, so a stray Enter does not agree to anything.
      cancel.focus({ preventScroll: true });
    });
  }

  private busy(layer: HTMLElement, behind: HTMLElement, text: string): () => void {
    const card = h(
      'div',
      { class: 'dialog working', role: 'status' },
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', {}, text),
    );
    layer.replaceChildren(card);
    layer.hidden = false;
    behind.setAttribute('inert', '');
    return () => {
      if (layer.firstChild !== card) return;
      layer.hidden = true;
      layer.replaceChildren();
      behind.removeAttribute('inert');
    };
  }
}
