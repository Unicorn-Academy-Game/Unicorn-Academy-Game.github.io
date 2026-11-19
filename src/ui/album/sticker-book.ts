import type { WordId } from '../../content/lexicon';
import type { Facts, StickerPageId } from '../../content/stickers';
import type { Rest } from '../../game/ports';
import { bookKeys, centreTab, swipeToTurn, type Turn, tell, wheelAlong } from '../book-chrome';
import { fill, flag, h, trapFocus } from '../dom';
import { layOut } from '../learning/book-fit';
import { ICON_CLOSE, ICON_DONE, ICON_SPARKLE } from '../learning/icons';
import type { OverlayDeps } from '../overlay';
import { ALBUM_LABELS, progressLabel, stickerLabel, tabLabel, totalLabel } from './album-text';
import {
  type AlbumView,
  albumView,
  dotsAcross,
  FIRST_PAGE,
  latestPage,
  type PageView,
  type StickerView,
  type TabView,
  tiltOf,
  turned,
} from './album-view';
import './album.css';
import { ICON_STICKER } from './icons';

/** What the book reads from the player's album. */
export interface Shelf {
  /** The days the stickers the player has were earned, by id. */
  got(): Readonly<Record<string, number>>;
  /** Every fact there is, for how far the player is to a sticker. */
  facts(): Facts;
  /** The stickers earned this visit that the book has not shown the player yet. */
  unseen(): ReadonlySet<string>;
  /** The book showed these. */
  seen(ids: readonly string[]): void;
}

export interface StickerBookDeps extends OverlayDeps {
  shelf: Shelf;
  picture: (word: WordId) => string;
  /** Holds the world still while the book is open. */
  rest: Rest;
  /** Says a word aloud, if the parent has the voice on. */
  say: (word: WordId) => void;
  sounds: { open(): void; turn(): void };
}

/** How long a page takes to turn. */
const TURN_MS = 260;

interface Parts {
  sheet: HTMLElement;
  count: HTMLElement;
  of: HTMLElement;
  totals: HTMLElement;
  tabs: Map<StickerPageId, HTMLButtonElement>;
  tablist: HTMLElement;
  page: HTMLElement;
  title: HTMLElement;
  progress: HTMLElement;
  grid: HTMLElement;
  note: HTMLElement;
  live: HTMLElement;
}

/**
 * The Sticker Book: a row of pages, and on a page a place for every sticker. A sticker the player
 * has is in colour and a little crooked, as if stuck on by hand, and tapping it says what is on it.
 * One they have not is a shape waiting for it, with how far they are when it asks for a number of
 * something. A line under the page says what the sticker the player touched is for, or, when they
 * touched none, what the next one on the page is waiting for. It opens on the page of the newest
 * sticker, turns by its tabs, the arrow keys or a swipe, and can be closed at every moment. The
 * world rests while it is open.
 */
export class StickerBook {
  private root: HTMLElement | null = null;
  private parts: Parts | null = null;
  private page: StickerPageId = FIRST_PAGE;
  private picked: string | null = null;
  private view: AlbumView | null = null;
  private readonly shown = new Set<string>();
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private resizer: ResizeObserver | null = null;
  private opener: HTMLElement | null = null;

  constructor(private readonly deps: StickerBookDeps) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the book at the page of the player's newest sticker. */
  open(): void {
    if (this.root) return;
    this.page = latestPage(this.deps.shelf.got());
    this.picked = null;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const parts = this.build();
    this.parts = parts;
    this.root = h(
      'div',
      { class: 'book', 'data-kind': 'stickers', 'data-calm': String(this.deps.calm()) },
      parts.sheet,
    );
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    // A tap on the dark around the book closes it. A tap on the book itself never does.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    this.render();
    this.deps.host.dataset.stickerbook = 'true';
    this.deps.mount(this.root);
    centreTab(parts.tablist, parts.tabs.get(this.page), false);
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(parts.grid);
    this.fit();
    this.untrap = trapFocus(parts.sheet);
    this.unlisten = bookKeys({ close: () => this.close(), turn: (to) => this.turn(to) });
    this.deps.rest.freeze();
    parts.sheet.focus({ preventScroll: true });
    this.deps.sounds.open();
  }

  /** Closes the book and lets the world go. Focus goes back to where it was. */
  close(): void {
    if (!this.root) return;
    this.unlisten?.();
    this.untrap?.();
    this.resizer?.disconnect();
    this.unlisten = null;
    this.untrap = null;
    this.resizer = null;
    this.root.remove();
    this.root = null;
    this.parts = null;
    this.view = null;
    this.deps.shelf.seen([...this.shown]);
    this.shown.clear();
    delete this.deps.host.dataset.stickerbook;
    this.deps.rest.thaw();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /** The player's album changed, so what is on show is drawn again. */
  refresh(): void {
    this.render();
  }

  private build(): Parts {
    const shut = h('button', {
      type: 'button',
      class: 'book-shut',
      'aria-label': ALBUM_LABELS.close,
      'data-content-id': 'album.close',
      onclick: () => this.close(),
    });
    shut.innerHTML = ICON_CLOSE;
    const badge = h('span', { class: 'book-badge', 'aria-hidden': 'true' });
    badge.innerHTML = ICON_STICKER;
    const count = h('b', { class: 'book-count' });
    const of = h('small', { class: 'book-of' });
    const totals = h('p', { class: 'book-totals', role: 'img' }, h('span', { class: 'book-total' }, count, of));
    const head = h(
      'header',
      { class: 'book-head' },
      badge,
      h('h2', { class: 'book-title' }, ALBUM_LABELS.title),
      totals,
    );
    const tablist = h('div', { class: 'book-tabs', role: 'tablist', 'aria-label': ALBUM_LABELS.pages });
    wheelAlong(tablist);
    const title = h('h3', { class: 'book-page-title' });
    const progress = h('small', { class: 'book-page-progress' });
    const grid = h('ul', { class: 'book-grid', 'aria-label': ALBUM_LABELS.stickers });
    const note = h('p', { class: 'sticker-note' });
    const page = h(
      'section',
      { class: 'book-page', role: 'tabpanel', 'data-complete': 'false' },
      h('div', { class: 'book-page-head' }, title, progress),
      grid,
      note,
    );
    swipeToTurn(page, (by) => this.go(turned(this.page, by)));
    const live = h('p', { class: 'book-live', role: 'status', 'aria-live': 'polite' });
    const sheet = h(
      'div',
      {
        class: 'book-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': ALBUM_LABELS.title,
        tabindex: -1,
      },
      shut,
      head,
      tablist,
      page,
      live,
    );
    return { sheet, count, of, totals, tabs: new Map(), tablist, page, title, progress, grid, note, live };
  }

  /** Draws the book as the player's album stands: the top, the tabs, and the page that is open. */
  private render(): void {
    const parts = this.parts;
    if (!parts) return;
    const { shelf } = this.deps;
    const view = albumView(shelf.got(), shelf.facts(), this.page, shelf.unseen());
    this.view = view;
    this.page = view.page.id;
    parts.count.textContent = String(view.have);
    parts.of.textContent = `/${view.total}`;
    parts.totals.setAttribute('aria-label', totalLabel(view.have, view.total));
    this.renderTabs(parts, view);
    this.renderPage(parts, view.page);
  }

  private renderTabs(parts: Parts, view: AlbumView): void {
    for (const tab of view.tabs) {
      const button = parts.tabs.get(tab.id) ?? this.addTab(parts, tab);
      button.setAttribute('aria-selected', String(tab.current));
      button.tabIndex = tab.current ? 0 : -1;
      button.dataset.complete = String(tab.complete);
      button.setAttribute('aria-label', tabLabel(tab));
      [...button.querySelectorAll<HTMLElement>('.book-pip')].forEach((pip, i) => {
        pip.dataset.on = String(i < tab.have);
      });
    }
  }

  private addTab(parts: Parts, tab: TabView): HTMLButtonElement {
    const picture = h('img', { src: this.deps.picture(tab.emblem), alt: '', draggable: 'false' });
    const emblem = h('span', { class: 'book-emblem', 'data-kind': tab.portrait ? 'portrait' : 'thing' }, picture);
    const pips = h(
      'span',
      { class: 'book-pips', 'aria-hidden': 'true' },
      ...Array.from({ length: tab.total }, () => h('i', { class: 'book-pip' })),
    );
    pips.style.setProperty('--per', String(dotsAcross(tab.total)));
    const button = h(
      'button',
      {
        type: 'button',
        class: 'book-tab',
        role: 'tab',
        'data-page': tab.id,
        'data-content-id': 'album.page',
        onclick: () => this.go(tab.id),
      },
      emblem,
      pips,
    );
    parts.tabs.set(tab.id, button);
    parts.tablist.append(button);
    return button;
  }

  private renderPage(parts: Parts, page: PageView): void {
    parts.page.dataset.complete = String(page.complete);
    parts.page.setAttribute('aria-label', page.title);
    parts.title.textContent = page.title;
    parts.progress.textContent = `${page.have} of ${page.total}`;
    parts.grid.replaceChildren(...page.stickers.map((sticker) => this.makeCell(sticker)));
    for (const sticker of page.stickers) if (sticker.fresh) this.shown.add(sticker.id);
    this.renderNote(parts, page);
    this.fit();
  }

  /**
   * Sizes the places on the page from the room the page has. It is done again when the room
   * changes, as a phone is turned.
   */
  private fit(): void {
    const grid = this.parts?.grid;
    if (!grid || grid.childElementCount === 0) return;
    const style = getComputedStyle(grid);
    const room = {
      width: grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
    if (!(room.width > 0 && room.height > 0)) return;
    const { cell } = layOut(grid.childElementCount, room, parseFloat(style.columnGap) || 0);
    grid.style.setProperty('--cell-w', `${cell.width}px`);
    grid.style.setProperty('--cell-h', `${cell.height}px`);
  }

  /** A place on the page: a card to tap, in colour for a sticker the player has and a shape for one they have not. */
  private makeCell(sticker: StickerView): HTMLElement {
    const picture = h('img', {
      class: 'book-picture',
      src: this.deps.picture(sticker.emblem),
      alt: '',
      draggable: 'false',
    });
    const frame = h('span', { class: 'book-frame', 'data-kind': sticker.portrait ? 'portrait' : 'thing' }, picture);
    const sparkle = h('span', { class: 'book-new', 'aria-hidden': 'true' });
    sparkle.innerHTML = ICON_SPARKLE;
    const caption = sticker.found ? sticker.name : sticker.progress ? progressLabel(sticker.progress) : '';
    const item = h('li', {
      class: 'book-word sticker',
      'data-sticker': sticker.id,
      'data-found': String(sticker.found),
      'data-newest': String(sticker.found && sticker.fresh),
      'data-picked': String(sticker.id === this.picked),
      style: `--tilt:${sticker.found ? tiltOf(sticker.id) : 0}deg`,
    });
    item.append(
      h(
        'button',
        {
          type: 'button',
          class: 'book-card',
          'data-content-id': 'album.sticker',
          'aria-label': stickerLabel(sticker),
          onclick: () => this.pick(sticker, item),
        },
        frame,
        h('span', { class: 'sticker-caption' }, caption),
        sparkle,
      ),
    );
    return item;
  }

  /**
   * The player touched a sticker. The line under the page says what it is for, and a sticker they
   * have says what is on it aloud.
   */
  private pick(sticker: StickerView, item: HTMLElement): void {
    const parts = this.parts;
    const page = this.view?.page;
    if (!parts || !page) return;
    for (const other of parts.grid.querySelectorAll<HTMLElement>('.book-word')) {
      other.dataset.picked = String(other === item);
    }
    this.picked = sticker.id;
    this.renderNote(parts, page);
    tell(parts.live, stickerLabel(sticker));
    if (!sticker.found) return;
    flag(item, 'pop', 600);
    this.deps.say(sticker.emblem);
  }

  /**
   * The line under the page: what the sticker the player touched is for, else what the next sticker
   * on the page is waiting for, else that the page is full.
   */
  private renderNote(parts: Parts, page: PageView): void {
    const touched = page.stickers.find((s) => s.id === this.picked);
    const shown = touched ?? page.stickers.find((s) => !s.found);
    parts.note.dataset.state = shown ? (shown.found ? 'found' : 'waiting') : 'done';
    if (!shown) {
      fill(parts.note, markOf(ICON_SPARKLE), h('b', {}, 'Every sticker on this page!'));
      return;
    }
    const far = shown.progress
      ? h(
          'span',
          { class: 'sticker-note-far' },
          h(
            'span',
            { class: 'sticker-meter', 'aria-hidden': 'true' },
            h('i', { style: `width:${(100 * shown.progress.have) / shown.progress.of}%` }),
          ),
          h('small', {}, progressLabel(shown.progress)),
        )
      : null;
    fill(
      parts.note,
      markOf(shown.found ? ICON_DONE : ICON_STICKER),
      h(
        'span',
        { class: 'sticker-note-text' },
        h('b', { class: 'sticker-note-name' }, shown.found ? shown.name : touched ? 'Waiting for you' : 'Next sticker'),
        shown.hint,
      ),
      far,
    );
  }

  /** Turns to a page. The page slides in from the side it is on. */
  private go(id: StickerPageId): void {
    const parts = this.parts;
    if (!parts || id === this.page) return;
    const tabs = [...parts.tabs.keys()];
    const direction = tabs.indexOf(id) > tabs.indexOf(this.page) ? 'next' : 'back';
    this.page = id;
    this.picked = null;
    this.render();
    centreTab(parts.tablist, parts.tabs.get(this.page), !this.deps.calm());
    flag(parts.page, 'turn', TURN_MS, direction);
    this.deps.sounds.turn();
    const now = this.view?.tabs.find((t) => t.current);
    if (now) tell(parts.live, tabLabel(now));
  }

  /** Turns to a page from the keyboard, and keeps the keyboard on its tab. */
  private turn(to: Turn): void {
    this.go(to === 'first' ? FIRST_PAGE : to === 'last' ? turned(FIRST_PAGE, -1) : turned(this.page, to));
    this.parts?.tabs.get(this.page)?.focus({ preventScroll: true });
  }
}

/** The little picture at the start of the line under the page. */
function markOf(icon: string): HTMLElement {
  const mark = h('span', { class: 'sticker-note-mark', 'aria-hidden': 'true' });
  mark.innerHTML = icon;
  return mark;
}
