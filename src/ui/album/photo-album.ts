import type { Rest } from '../../game/ports';
import type { Shot } from '../../render/squeeze';
import { MAX_PHOTOS, type Photo } from '../../shared/photos';
import { bookKeys, swipeToTurn, type Turn, tell } from '../book-chrome';
import { flag, h, trapFocus } from '../dom';
import { ICON_CLOSE } from '../learning/icons';
import type { OverlayDeps } from '../overlay';
import { tiltOf } from './album-view';
import './camera.css';
import { Doodle } from './doodle';
import { ICON_CRAYON } from './doodle-icons';
import { arrow, ICON_BIN, ICON_CAMERA, ICON_PRINTS, ICON_SAVE } from './photo-icons';
import { countLabel, DRAW_LABELS, PHOTO_LABELS, photoLabel, placeOf } from './photo-text';

/** What the album reads from the camera, and asks of it. */
export interface PhotoShelf {
  /** The pictures in the album, oldest first. */
  shots(): readonly Photo[];
  /** The pictures taken this visit that the album has not shown yet. */
  unseen(): ReadonlySet<string>;
  /** The album showed these. */
  seen(ids: readonly string[]): void;
  /** Puts a picture away. */
  putAway(id: string): void;
  /** Gives a copy of a picture to the device, as a file. */
  save(photo: Photo): void;
  /** Keeps what was drawn on a picture as a picture of its own. Answers it, or null when it could not be kept. */
  keepDrawing(shot: Shot, on: Photo): Photo | null;
}

export interface PhotoAlbumDeps extends OverlayDeps {
  shelf: PhotoShelf;
  /** Holds the world still while the album is open. */
  rest: Rest;
  sounds: { open(): void; turn(): void; keep(): void; stamped(step: number): void; drawn(): void };
}

interface Parts {
  sheet: HTMLElement;
  total: HTMLElement;
  full: HTMLElement;
  page: HTMLElement;
  grid: HTMLElement;
  empty: HTMLElement;
  live: HTMLElement;
}

/** How long a picture takes to slide in when the player moves along. */
const TURN_MS = 260;

const iconOf = (svg: string): HTMLElement => {
  const node = h('span', { class: 'photo-button-icon', 'aria-hidden': 'true' });
  node.innerHTML = svg;
  return node;
};

/**
 * The pictures the player has taken, as prints in a grid with the newest first. Touching one shows
 * it big, with a way to the one before and after, to draw on it, to keep a copy on the device, and
 * to put it away. A picture is only put away after the player is asked, with a way to keep it as
 * big as the way to put it away. The album can be closed at every moment, and the world rests while
 * it is open.
 */
export class PhotoAlbum {
  private root: HTMLElement | null = null;
  private parts: Parts | null = null;
  private viewing: string | null = null;
  private asking = false;
  private doodle: Doodle | null = null;
  /** What the grid was last drawn from, so moving along the pictures does not draw it again. */
  private drawn = '';
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private opener: HTMLElement | null = null;
  private readonly shown = new Set<string>();

  constructor(private readonly deps: PhotoAlbumDeps) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the album, on the picture `id` when there is one, and on all of them otherwise. */
  open(id?: string): void {
    if (this.root) return;
    this.viewing = id && this.deps.shelf.shots().some((p) => p.id === id) ? id : null;
    this.asking = false;
    this.drawn = '';
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const parts = this.build();
    this.parts = parts;
    this.root = h('div', { class: 'book', 'data-kind': 'photos', 'data-calm': String(this.deps.calm()) }, parts.sheet);
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    // A tap on the dark around the album closes it. A tap on the album itself never does.
    this.root.addEventListener('click', (event) => {
      if (event.target !== this.root) return;
      // A drawing is asked about first, so that a tap beside it never loses it.
      if (this.doodle) this.doodle.back();
      else this.close();
    });
    this.render();
    this.deps.host.dataset.photoalbum = 'true';
    this.deps.mount(this.root);
    this.untrap = trapFocus(parts.sheet);
    this.unlisten = bookKeys({ close: () => this.back(), turn: (to) => this.turn(to) });
    this.deps.rest.freeze();
    parts.sheet.focus({ preventScroll: true });
    this.deps.sounds.open();
  }

  /** Closes the album and lets the world go. Focus goes back to where it was. */
  close(): void {
    if (!this.root) return;
    this.doodle?.dismiss();
    this.doodle = null;
    this.unlisten?.();
    this.untrap?.();
    this.unlisten = null;
    this.untrap = null;
    this.root.remove();
    this.root = null;
    this.parts = null;
    this.viewing = null;
    this.asking = false;
    this.deps.shelf.seen([...this.shown]);
    this.shown.clear();
    delete this.deps.host.dataset.photoalbum;
    this.deps.rest.thaw();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /** The album changed, so what is on show is drawn again. */
  refresh(): void {
    if (!this.parts) return;
    if (this.viewing && !this.deps.shelf.shots().some((p) => p.id === this.viewing)) {
      this.viewing = null;
      this.asking = false;
    }
    this.render();
  }

  private build(): Parts {
    const shut = h('button', {
      type: 'button',
      class: 'book-shut',
      'aria-label': PHOTO_LABELS.close,
      'data-content-id': 'photos.close',
      onclick: () => this.close(),
    });
    shut.innerHTML = ICON_CLOSE;
    const badge = h('span', { class: 'book-badge', 'aria-hidden': 'true' });
    badge.innerHTML = ICON_CAMERA;
    const total = h('b', { class: 'book-count' });
    const full = h('span', { class: 'book-full', hidden: true, title: PHOTO_LABELS.fullNote }, PHOTO_LABELS.full);
    const head = h(
      'header',
      { class: 'book-head' },
      badge,
      h('h2', { class: 'book-title' }, PHOTO_LABELS.title),
      h('p', { class: 'book-totals' }, h('span', { class: 'book-total' }, total), full),
    );
    const grid = h('ul', { class: 'photo-grid', 'aria-label': PHOTO_LABELS.list });
    const emptyIcon = h('span', { class: 'photo-empty-icon', 'aria-hidden': 'true' });
    emptyIcon.innerHTML = ICON_CAMERA;
    const empty = h(
      'div',
      { class: 'photo-empty' },
      emptyIcon,
      h('b', {}, PHOTO_LABELS.empty),
      h('small', {}, PHOTO_LABELS.emptyHint),
    );
    const page = h('section', { class: 'book-page photo-page' }, grid, empty);
    const live = h('p', { class: 'book-live', role: 'status', 'aria-live': 'polite' });
    const sheet = h(
      'div',
      { class: 'book-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': PHOTO_LABELS.title, tabindex: -1 },
      shut,
      head,
      page,
      live,
    );
    return { sheet, total, full, page, grid, empty, live };
  }

  /** Draws the album as it stands: the top, the prints, and the picture that is open. */
  private render(): void {
    const parts = this.parts;
    if (!parts) return;
    const shots = this.deps.shelf.shots();
    const fresh = this.deps.shelf.unseen();
    parts.total.textContent = countLabel(shots.length);
    parts.full.hidden = shots.length < MAX_PHOTOS;
    parts.grid.dataset.count = shots.length <= 2 ? 'few' : shots.length <= 6 ? 'some' : 'many';
    parts.empty.hidden = shots.length > 0;
    parts.grid.hidden = shots.length === 0;
    const key = shots.map((p) => `${p.id}${fresh.has(p.id) ? '*' : ''}`).join(',');
    if (key !== this.drawn) {
      this.drawn = key;
      parts.grid.replaceChildren(...[...shots].reverse().map((photo) => this.makePrint(photo, fresh.has(photo.id))));
    }
    for (const photo of shots) if (fresh.has(photo.id)) this.shown.add(photo.id);
    parts.page.querySelector('.photo-view')?.remove();
    const photo = shots.find((p) => p.id === this.viewing);
    parts.page.dataset.viewing = String(photo !== undefined);
    // The grid stays under the big picture, and keys and a screen reader must not go to it there.
    parts.grid.toggleAttribute('inert', photo !== undefined);
    if (photo) parts.page.append(this.makeView(photo, shots));
  }

  /** A print in the grid: a picture with a white edge and the name of the place, a little crooked. */
  private makePrint(photo: Photo, fresh: boolean): HTMLElement {
    const image = h('img', { src: photo.image, alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
    const print = h(
      'span',
      { class: 'photo-print', style: `--ratio:${photo.w} / ${photo.h}` },
      image,
      h('span', { class: 'photo-place' }, placeOf(photo.place)),
    );
    const card = h(
      'button',
      {
        type: 'button',
        class: 'photo-card',
        'data-content-id': 'photos.open',
        'aria-label': photoLabel(photo.place, fresh),
        onclick: () => this.view(photo.id),
      },
      print,
    );
    return h(
      'li',
      { class: 'photo', 'data-photo': photo.id, 'data-newest': String(fresh), style: `--tilt:${tiltOf(photo.id)}deg` },
      card,
    );
  }

  private button(kind: string, icon: string, text: string, label: string, onclick: () => void): HTMLButtonElement {
    return h(
      'button',
      {
        type: 'button',
        class: 'photo-button',
        'data-kind': kind,
        'data-content-id': `photos.${kind}`,
        'aria-label': label,
        onclick,
      },
      icon ? iconOf(icon) : null,
      text ? h('span', { class: 'photo-button-text' }, text) : null,
    );
  }

  /** One picture, big, with the ways to move along, keep a copy and put it away. */
  private makeView(photo: Photo, shots: readonly Photo[]): HTMLElement {
    const at = shots.findIndex((p) => p.id === photo.id);
    const print = h(
      'figure',
      {
        class: 'photo-print photo-print-big',
        style: `--ratio:${photo.w} / ${photo.h};--r:${(photo.w / photo.h).toFixed(4)}`,
      },
      h('img', { class: 'photo-big', src: photo.image, alt: '', draggable: 'false' }),
      h('figcaption', { class: 'photo-place' }, placeOf(photo.place)),
    );
    const stage = h('div', { class: 'photo-stage' }, print);
    swipeToTurn(stage, (by) => this.step(by));
    const bar = this.asking
      ? h(
          'div',
          { class: 'photo-ask', role: 'alertdialog', 'aria-label': PHOTO_LABELS.ask },
          h('b', {}, PHOTO_LABELS.ask),
          this.button('keep', '', PHOTO_LABELS.no, PHOTO_LABELS.no, () => this.ask(false)),
          this.button('yes', ICON_BIN, PHOTO_LABELS.yes, PHOTO_LABELS.yes, () => this.confirm(photo)),
        )
      : h(
          'div',
          { class: 'photo-bar', role: 'toolbar', 'aria-label': PHOTO_LABELS.title },
          this.button('newer', arrow('left'), '', PHOTO_LABELS.newer, () => this.step(-1)),
          this.button('back', ICON_PRINTS, PHOTO_LABELS.all, PHOTO_LABELS.back, () => this.view(null)),
          this.button('draw', ICON_CRAYON, DRAW_LABELS.draw, DRAW_LABELS.drawLabel, () => this.draw(photo)),
          this.button('save', ICON_SAVE, PHOTO_LABELS.save, PHOTO_LABELS.saveLabel, () => this.deps.shelf.save(photo)),
          this.button('away', ICON_BIN, PHOTO_LABELS.putAway, PHOTO_LABELS.putAwayLabel, () => this.ask(true)),
          this.button('older', arrow('right'), '', PHOTO_LABELS.older, () => this.step(1)),
        );
    for (const node of bar.querySelectorAll<HTMLButtonElement>('button')) {
      if (node.dataset.kind === 'newer') node.disabled = at >= shots.length - 1;
      if (node.dataset.kind === 'older') node.disabled = at <= 0;
    }
    return h('div', { class: 'photo-view', role: 'group', 'aria-label': photoLabel(photo.place, false) }, stage, bar);
  }

  /** Puts the keyboard on one of the buttons under the picture. */
  private focusOn(kind: string): void {
    this.parts?.page.querySelector<HTMLElement>(`.photo-button[data-kind="${kind}"]`)?.focus({ preventScroll: true });
  }

  /** Shows a picture big, or all of them when there is none. */
  private view(id: string | null): void {
    const parts = this.parts;
    if (!parts) return;
    const was = this.viewing;
    this.viewing = id;
    this.asking = false;
    this.render();
    if (id) {
      this.focusOn('back');
      tell(parts.live, photoLabel(this.deps.shelf.shots().find((p) => p.id === id)?.place ?? '', false));
    } else if (was) {
      parts.grid.querySelector<HTMLElement>(`[data-photo="${was}"] .photo-card`)?.focus({ preventScroll: true });
    }
  }

  /** Moves along the pictures: 1 is the one after this in the album, which is older, and -1 the one before. */
  private step(by: 1 | -1): void {
    const parts = this.parts;
    const shots = this.deps.shelf.shots();
    const at = shots.findIndex((p) => p.id === this.viewing);
    const next = shots[at - by];
    if (!parts || at < 0 || !next) return;
    this.viewing = next.id;
    this.asking = false;
    this.render();
    flag(parts.page, 'turn', TURN_MS, by === 1 ? 'next' : 'back');
    this.deps.sounds.turn();
    this.focusOn('back');
    tell(parts.live, photoLabel(next.place, false));
  }

  /** Asks whether to put the picture away, or takes the question back. */
  private ask(on: boolean): void {
    if (!this.viewing) return;
    this.asking = on;
    this.render();
    this.focusOn(on ? 'keep' : 'away');
  }

  /** The player said yes. The picture before it is shown, or the one after, and when none is left, all of them. */
  private confirm(photo: Photo): void {
    const parts = this.parts;
    const shots = this.deps.shelf.shots();
    const at = shots.findIndex((p) => p.id === photo.id);
    const neighbour = shots[at - 1] ?? shots[at + 1];
    this.deps.shelf.putAway(photo.id);
    this.deps.sounds.keep();
    this.asking = false;
    this.viewing = neighbour?.id ?? null;
    this.render();
    if (!parts) return;
    if (neighbour) this.focusOn('back');
    else parts.sheet.focus({ preventScroll: true });
    tell(parts.live, PHOTO_LABELS.gone);
  }

  /** Opens the picture to draw on. */
  private draw(photo: Photo): void {
    const parts = this.parts;
    if (!parts || this.doodle) return;
    this.asking = false;
    const doodle = new Doodle({
      sheet: parts.sheet,
      live: parts.live,
      photo,
      sounds: this.deps.sounds,
      keep: (shot) => this.deps.shelf.keepDrawing(shot, photo),
      leave: (kept) => this.drew(photo, kept),
    });
    this.doodle = doodle;
    doodle.open();
  }

  /** The drawing is over. The new picture is shown when one was kept, and the one that was drawn on when not. */
  private drew(photo: Photo, kept: Photo | null): void {
    this.doodle = null;
    if (!this.parts) return;
    this.viewing = kept?.id ?? photo.id;
    this.render();
    this.focusOn(kept ? 'back' : 'draw');
  }

  /** Escape: out of the drawing, then out of the question, then out of the picture, and then out of the album. */
  private back(): void {
    if (this.doodle) this.doodle.back();
    else if (this.asking) this.ask(false);
    else if (this.viewing) this.view(null);
    else this.close();
  }

  /** The arrow keys move along the pictures when one is big, and Home and End go to the newest and the oldest. */
  private turn(to: Turn): void {
    if (!this.viewing || this.asking || this.doodle) return;
    if (to === 1 || to === -1) {
      this.step(to);
      return;
    }
    const shots = this.deps.shelf.shots();
    const target = to === 'first' ? shots.at(-1) : shots[0];
    if (!target || target.id === this.viewing) return;
    this.viewing = target.id;
    this.render();
    this.focusOn('back');
  }
}
