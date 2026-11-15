import type { PageId, WordId } from '../../content/lexicon';
import type { Kept, Rest } from '../../game/ports';
import { type LearnerProfile, STARS_PER_WORD } from '../../learning';
import type { LetterCase } from '../../shared/learning';
import { flag, h, trapFocus } from '../dom';
import type { OverlayDeps } from '../overlay';
import { layOut } from './book-fit';
import { BOOK_LABELS, tabLabel, totalLabel, wordLabel } from './book-text';
import {
  type BookView,
  bookView,
  dotsAcross,
  FIRST_PAGE,
  latestPage,
  type PageView,
  type TabView,
  turned,
  type WordView,
} from './book-view';
import { flyPicture } from './flight';
import { ICON_BOOK, ICON_CLOSE, ICON_FIND, ICON_READ, ICON_SPARKLE, ICON_STAR, ICON_STAR_EMPTY } from './icons';

export interface SpellBookDeps extends OverlayDeps {
  letters: () => LetterCase;
  profile: () => LearnerProfile;
  now: () => number;
  picture: (word: WordId) => string;
  /** Holds the world still while the book is open. */
  rest: Rest;
  /** The player picked a word to spell again. True when a card went up for it. */
  practice: (word: WordId) => boolean;
  /**
   * The player picked a word they have not found, to be shown where to find it. It closes the book
   * and sets them off, and is true when it did.
   */
  find: (word: WordId) => boolean;
  sounds: { open(): void; turn(): void };
}

/**
 * How far a finger has to move along the page to turn it, and how much more along than across, so a
 * scroll or a slip is not a turn.
 */
const SWIPE_PX = 56;
const SWIPE_SLOPE = 1.6;
/** How long a page takes to turn. */
const TURN_MS = 260;

interface Cell {
  item: HTMLElement;
  word: WordId;
  found: boolean;
  button: HTMLButtonElement | null;
  frame: HTMLElement;
  stars: HTMLElement[];
}

interface Parts {
  sheet: HTMLElement;
  count: HTMLElement;
  of: HTMLElement;
  starCount: HTMLElement;
  totals: HTMLElement;
  tabs: Map<PageId, HTMLButtonElement>;
  tablist: HTMLElement;
  page: HTMLElement;
  title: HTMLElement;
  progress: HTMLElement;
  grid: HTMLElement;
  live: HTMLElement;
}

/**
 * The Spell Book: a row of pages, and on a page a place for every word. A word the player has
 * spelled is a card in colour with its stars, which they can tap to spell again, and a word they
 * have not is a shape with a place for each letter, there to be found. The player can tap that too,
 * and is taken to where the word is. It opens on the page of their newest word, turns by its tabs,
 * the arrow keys or a swipe, and can be closed at every moment. The world rests while it is open.
 */
export class SpellBook {
  private root: HTMLElement | null = null;
  private parts: Parts | null = null;
  private page: PageId = FIRST_PAGE;
  private shown: PageId | null = null;
  private readonly cells = new Map<WordId, Cell>();
  private readonly flights = new Set<{ cancel: () => void }>();
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private resizer: ResizeObserver | null = null;
  private opener: HTMLElement | null = null;

  constructor(private readonly deps: SpellBookDeps) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the book at the page of the player's newest word. */
  open(): void {
    if (this.root) return;
    this.page = latestPage(this.deps.profile());
    this.shown = null;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const parts = this.build();
    this.parts = parts;
    this.root = h(
      'div',
      { class: 'book', 'data-case': this.deps.letters(), 'data-calm': String(this.deps.calm()) },
      parts.sheet,
    );
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    // A tap on the dark around the book closes it. A tap on the book itself never does.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    this.render();
    this.deps.host.dataset.spellbook = 'true';
    this.deps.mount(this.root);
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(parts.grid);
    this.fit();
    this.untrap = trapFocus(parts.sheet);
    this.unlisten = this.listen();
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
    for (const flight of [...this.flights]) flight.cancel();
    this.flights.clear();
    this.root.remove();
    this.root = null;
    this.parts = null;
    this.shown = null;
    this.cells.clear();
    delete this.deps.host.dataset.spellbook;
    this.deps.rest.thaw();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /**
   * The player's book changed, so what is on show is drawn again. A page that was taken out never
   * leaves a blank.
   */
  refresh(): void {
    this.render();
  }

  /**
   * A word the player picked from the book has been spelled again. Its picture flies to its card,
   * which hides until it lands, and a star they have just earned pops in. With fewer effects the
   * card is as it should be at once.
   */
  kept(kept: Kept): void {
    const cell = this.cells.get(kept.word);
    if (!this.root || !cell) return;
    const land = (): void => {
      delete cell.item.dataset.landing;
      flag(cell.item, 'pop', 600);
      for (let i = kept.stars.before; i < kept.stars.after; i++) if (cell.stars[i]) flag(cell.stars[i]!, 'new', 900);
    };
    if (this.deps.calm() || !kept.from) {
      land();
      return;
    }
    cell.item.dataset.landing = 'true';
    const flight: { cancel: () => void } = { cancel: () => undefined };
    this.flights.add(flight);
    flight.cancel = flyPicture(this.deps.host, kept, kept.from, cell.frame.getBoundingClientRect(), () => {
      this.flights.delete(flight);
      land();
    });
  }

  private build(): Parts {
    const shut = h('button', {
      type: 'button',
      class: 'book-shut',
      'aria-label': BOOK_LABELS.close,
      'data-content-id': 'learning.book.close',
      onclick: () => this.close(),
    });
    shut.innerHTML = ICON_CLOSE;
    const badge = h('span', { class: 'book-badge', 'aria-hidden': 'true' });
    badge.innerHTML = ICON_BOOK;
    const count = h('b', { class: 'book-count' });
    const of = h('small', { class: 'book-of' });
    const star = h('span', { class: 'book-star-icon' });
    star.innerHTML = ICON_STAR;
    const starCount = h('b', { class: 'book-count' });
    const totals = h(
      'p',
      { class: 'book-totals', role: 'img' },
      h('span', { class: 'book-total' }, count, of),
      h('span', { class: 'book-total' }, star, starCount),
    );
    const head = h(
      'header',
      { class: 'book-head' },
      badge,
      h('h2', { class: 'book-title' }, BOOK_LABELS.title),
      totals,
    );
    const tablist = h('div', { class: 'book-tabs', role: 'tablist', 'aria-label': BOOK_LABELS.pages });
    const title = h('h3', { class: 'book-page-title' });
    const progress = h('small', { class: 'book-page-progress' });
    const grid = h('ul', { class: 'book-grid', 'aria-label': BOOK_LABELS.words });
    const page = h(
      'section',
      { class: 'book-page', role: 'tabpanel', 'data-complete': 'false' },
      h('div', { class: 'book-page-head' }, title, progress),
      grid,
    );
    this.swipeOn(page);
    const live = h('p', { class: 'book-live', role: 'status', 'aria-live': 'polite' });
    const sheet = h(
      'div',
      { class: 'book-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': BOOK_LABELS.title, tabindex: -1 },
      shut,
      head,
      tablist,
      page,
      live,
    );
    return { sheet, count, of, starCount, totals, tabs: new Map(), tablist, page, title, progress, grid, live };
  }

  /**
   * Draws the book as the player's profile stands: the top, the tabs, and the page that is open.
   */
  private render(): BookView | null {
    const parts = this.parts;
    if (!parts) return null;
    const view = bookView(this.deps.profile(), this.deps.now(), this.page);
    this.page = view.page.id;
    parts.count.textContent = String(view.collected);
    parts.of.textContent = `/${view.total}`;
    parts.starCount.textContent = String(view.stars);
    parts.totals.setAttribute('aria-label', totalLabel(view.collected, view.total, view.stars));
    this.renderTabs(parts, view);
    this.renderPage(parts, view.page);
    return view;
  }

  private renderTabs(parts: Parts, view: BookView): void {
    parts.tablist.style.setProperty('--tabs', String(view.tabs.length));
    parts.tablist.style.setProperty('--half', String(Math.ceil(view.tabs.length / 2)));
    for (const tab of view.tabs) {
      const button = parts.tabs.get(tab.id) ?? this.addTab(parts, tab);
      button.setAttribute('aria-selected', String(tab.current));
      button.tabIndex = tab.current ? 0 : -1;
      button.dataset.complete = String(tab.complete);
      button.setAttribute('aria-label', tabLabel(tab));
      [...button.querySelectorAll<HTMLElement>('.book-pip')].forEach((pip, i) => {
        pip.dataset.on = String(i < tab.collected);
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
        'data-content-id': 'learning.book.page',
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
    parts.progress.textContent = `${page.collected} of ${page.total}`;
    if (this.shown !== page.id) {
      this.shown = page.id;
      this.cells.clear();
      parts.grid.replaceChildren(...page.words.map((word) => this.addCell(word)));
      this.fit();
      return;
    }
    for (const word of page.words) {
      const cell = this.cells.get(word.word);
      if (!cell) continue;
      if (cell.found !== word.found) {
        const next = this.makeCell(word);
        cell.item.replaceWith(next.item);
        this.cells.set(word.word, next);
      } else this.update(cell, word);
    }
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

  private addCell(view: WordView): HTMLElement {
    const cell = this.makeCell(view);
    this.cells.set(view.word, cell);
    return cell.item;
  }

  /**
   * A place on the page: a card to tap for a word the player has, and a shape for one they have
   * not.
   */
  private makeCell(view: WordView): Cell {
    const picture = h('img', { class: 'book-picture', src: this.deps.picture(view.word), alt: '', draggable: 'false' });
    const frame = h('span', { class: 'book-frame', 'data-kind': view.portrait ? 'portrait' : 'thing' }, picture);
    const item = h('li', { class: 'book-word', 'data-word': view.word, style: `--n:${view.letters}` });
    const cell: Cell = { item, word: view.word, found: view.found, button: null, frame, stars: [] };
    if (view.found) {
      cell.stars = Array.from({ length: STARS_PER_WORD }, () => h('span', { class: 'book-star' }));
      const sparkle = h('span', { class: 'book-new', 'aria-hidden': 'true' });
      sparkle.innerHTML = ICON_SPARKLE;
      const reads = h('span', { class: 'book-reads', 'aria-hidden': 'true' });
      reads.innerHTML = ICON_READ;
      cell.button = h(
        'button',
        {
          type: 'button',
          class: 'book-card',
          'data-content-id': 'learning.book.word',
          onclick: () => this.practise(cell),
        },
        frame,
        h('span', { class: 'book-name' }, view.word),
        h('span', { class: 'book-stars', 'aria-hidden': 'true' }, ...cell.stars),
        sparkle,
        reads,
      );
      item.append(cell.button);
    } else {
      const look = h('span', { class: 'book-find', 'aria-hidden': 'true' });
      look.innerHTML = ICON_FIND;
      cell.button = h(
        'button',
        { type: 'button', class: 'book-card', 'data-content-id': 'learning.book.find', onclick: () => this.find(cell) },
        frame,
        h(
          'span',
          { class: 'book-dots', 'aria-hidden': 'true' },
          ...Array.from({ length: view.letters }, () => h('i', { class: 'book-dot' })),
        ),
        look,
      );
      item.append(cell.button);
    }
    this.update(cell, view);
    return cell;
  }

  /**
   * Draws what can change in a place without it being a different place: its stars, whether it is
   * ready again, and what it says.
   */
  private update(cell: Cell, view: WordView): void {
    cell.item.dataset.found = String(view.found);
    cell.item.dataset.due = String(view.found && view.due);
    cell.item.dataset.newest = String(view.found && view.newest);
    cell.item.dataset.reads = String(view.found && view.reads);
    cell.item.dataset.stars = String(view.stars);
    cell.button?.setAttribute('aria-label', wordLabel(view));
    cell.stars.forEach((star, i) => {
      const on = i < view.stars;
      if (star.dataset.on === String(on)) return;
      star.dataset.on = String(on);
      star.innerHTML = on ? ICON_STAR : ICON_STAR_EMPTY;
    });
  }

  /**
   * The player tapped a word they have. A card goes up over the book, and if one cannot, the card
   * only nods.
   */
  private practise(cell: Cell): void {
    if (!this.deps.practice(cell.word)) flag(cell.item, 'nudge', 420);
  }

  /**
   * The player tapped a word they have not found. The book closes and they are on their way to it,
   * and if that cannot be, the card only nods.
   */
  private find(cell: Cell): void {
    if (!this.deps.find(cell.word)) flag(cell.item, 'nudge', 420);
  }

  /** Turns to a page. The page slides in from the side it is on. */
  private go(id: PageId): void {
    const parts = this.parts;
    if (!parts || id === this.page) return;
    const tabs = [...parts.tabs.keys()];
    const direction = tabs.indexOf(id) > tabs.indexOf(this.page) ? 'next' : 'back';
    this.page = id;
    const now = this.render()?.tabs.find((t) => t.current);
    flag(parts.page, 'turn', TURN_MS, direction);
    this.deps.sounds.turn();
    if (now) this.tell(tabLabel(now));
  }

  /** Says something to a screen reader. */
  private tell(text: string): void {
    const live = this.parts?.live;
    if (!live || text === '') return;
    live.textContent = '';
    window.setTimeout(() => {
      if (live.isConnected) live.textContent = text;
    }, 30);
  }

  /** A swipe along the page turns it. */
  private swipeOn(page: HTMLElement): void {
    let start: { x: number; y: number } | null = null;
    page.addEventListener('pointerdown', (event) => (start = { x: event.clientX, y: event.clientY }));
    page.addEventListener('pointercancel', () => (start = null));
    page.addEventListener('pointerup', (event) => {
      const from = start;
      start = null;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return;
      this.go(turned(this.page, dx < 0 ? 1 : -1));
    });
  }

  /**
   * Takes the keyboard while the book is open: arrows turn the page, Escape closes, and nothing
   * steers Wildstar. A card over the book has it first.
   */
  private listen(): () => void {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
      event.stopPropagation();
      const parts = this.parts;
      if (!parts) return;
      const to =
        event.key === 'Escape'
          ? 'close'
          : event.key === 'ArrowRight'
            ? turned(this.page, 1)
            : event.key === 'ArrowLeft'
              ? turned(this.page, -1)
              : event.key === 'Home'
                ? FIRST_PAGE
                : event.key === 'End'
                  ? turned(FIRST_PAGE, -1)
                  : null;
      if (to === null) return;
      event.preventDefault();
      if (to === 'close') {
        this.close();
        return;
      }
      this.go(to);
      parts.tabs.get(this.page)?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }
}
