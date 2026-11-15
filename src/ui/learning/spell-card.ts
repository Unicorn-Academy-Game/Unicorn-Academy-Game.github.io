import type { Box, CardHandlers, CardOpening, CardPort } from '../../game/ports';
import { asLetter, isDone, type Outcome, occasionOf, type Spelling, STARS_PER_WORD, type Worth } from '../../learning';
import type { KeyboardLayout } from '../../shared/learning';
import { flag, h, trapFocus } from '../dom';
import type { OverlayDeps } from '../overlay';
import { type Badge, badgeOf, cardView, keyViews } from './card-view';
import {
  ICON_BOOK,
  ICON_CLOSE,
  ICON_CROWN,
  ICON_HELP,
  ICON_ROSETTE,
  ICON_ROSETTE_STAR,
  ICON_SAY,
  ICON_STAR,
  ICON_STAR_EMPTY,
} from './icons';
import { Keyboard } from './keyboard';
import { announce, caption, dialogLabel, HELP_ANNOUNCEMENT, LABELS, slotLabel, starsLabel } from './text';

/** How long a letter takes to fly from its key to its place. */
const FLIGHT_MS = 300;
/**
 * The size of a letter on a key, as a share of the key's height. The flying letter starts the same
 * size.
 */
const CAP_OF_KEY = 0.48;
/**
 * A tap this soon after the word is done is the last key still being pressed, and does not skip the
 * celebration.
 */
const SETTLE_MS = 700;

interface Parts {
  card: HTMLElement;
  /** The box the picture is in, which a badge is pinned to the corner of. */
  pic: HTMLElement;
  caption: HTMLElement;
  above: HTMLElement;
  slots: HTMLElement[];
  keyboard: Keyboard;
  say: HTMLButtonElement;
  help: HTMLButtonElement;
  stars: HTMLElement;
  collect: HTMLButtonElement;
  live: HTMLElement;
}

/**
 * The card the player spells a word on. It is a dialog over the whole game: the picture of the
 * word, a place for each letter, and the keys. It can be closed at every moment. What is typed is
 * always on the screen, and only a right letter ever goes into a place. Typing works on the keys on
 * the screen and on a keyboard, and a keyboard never steers Wildstar while it is up.
 */
export class SpellCard implements CardPort {
  private node: HTMLElement | null = null;
  private parts: Parts | null = null;
  private layout: KeyboardLayout = 'abc';
  private untrap: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private opener: HTMLElement | null = null;
  private doneAt = -Infinity;
  private readonly flyers = new Set<Animation>();

  constructor(
    private readonly deps: OverlayDeps,
    private readonly handlers: CardHandlers,
  ) {}

  get isOpen(): boolean {
    return this.node !== null;
  }

  open(s: Spelling, opening: CardOpening): void {
    if (this.node) return;
    this.layout = opening.layout;
    this.doneAt = -Infinity;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const parts = this.build(s, opening);
    this.parts = parts;
    this.node = h(
      'div',
      { class: 'spell', 'data-case': opening.letters, 'data-done': 'false', 'data-calm': String(this.deps.calm()) },
      parts.card,
    );
    this.node.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.render(s, false);
    this.deps.host.dataset.spellcard = 'true';
    this.deps.mount(this.node);
    this.untrap = trapFocus(parts.card);
    this.unlisten = this.listen();
    parts.card.focus({ preventScroll: true });
  }

  /**
   * Draws the card again as the spelling stands. `peeking` is true while the whole word is being
   * shown for a moment.
   */
  render(s: Spelling, peeking: boolean): void {
    const parts = this.parts;
    if (!parts) return;
    const view = cardView(s, peeking);
    view.slots.forEach((slot, i) => {
      const place = parts.slots[i]!;
      place.dataset.state = slot.state;
      place.dataset.guide = String(slot.guide);
      place.firstElementChild!.textContent = slot.letter ?? '';
      place.setAttribute('aria-label', slotLabel(i, view.slots.length, slot.state === 'placed' ? slot.letter : null));
    });
    parts.above.hidden = !view.hasAbove;
    parts.above.dataset.show = String(view.above !== null);
    parts.above.textContent = view.above ?? '';
    parts.keyboard.show(keyViews(this.layout, s));
    parts.help.hidden = s.rung.lights;
    parts.help.disabled = s.helped || isDone(s);
  }

  /**
   * A key was pressed and the spelling has moved on. A right letter flies to its place, and a key
   * that is not the next letter only nudges.
   */
  pressed(outcome: Outcome, s: Spelling, peeking: boolean): void {
    const parts = this.parts;
    if (!parts) return;
    this.render(s, peeking);
    if (outcome.kind === 'right') {
      parts.keyboard.flash(outcome.letter, 'right');
      this.land(outcome.letter, parts.slots[outcome.index]!);
    } else if (outcome.kind === 'wrong') parts.keyboard.flash(outcome.letter, 'soft');
    else if (outcome.kind === 'faded') parts.keyboard.flash(outcome.letter, 'faded');
    this.tell(announce(outcome, s));
  }

  /** The player asked for help and the key they need is shining now. */
  helped(s: Spelling, peeking: boolean): void {
    this.render(s, peeking);
    this.tell(HELP_ANNOUNCEMENT);
  }

  /**
   * The word is done. `text` is what the card says about it, and `worth` is the stars the player
   * has now and had before, and whether it was a big moment.
   */
  celebrate(text: string, worth: Worth): void {
    const parts = this.parts;
    if (!parts || !this.node) return;
    const { stars } = worth;
    this.doneAt = performance.now();
    this.node.dataset.done = 'true';
    this.node.dataset.occasion = occasionOf(worth);
    parts.caption.textContent = text;
    parts.stars.setAttribute('aria-label', starsLabel(stars.after));
    parts.stars.replaceChildren(
      ...Array.from({ length: STARS_PER_WORD }, (_, i) => {
        const earned = i < stars.after;
        const star = h('span', {
          class: 'spell-star',
          'data-earned': String(earned),
          'data-new': String(earned && i >= stars.before),
          style: `--i:${i}`,
        });
        star.innerHTML = earned ? ICON_STAR : ICON_STAR_EMPTY;
        return star;
      }),
    );
    const badge = badgeOf(worth);
    if (badge) parts.pic.append(badgeNode(badge));
    this.tell(text);
    parts.collect.focus({ preventScroll: true });
  }

  /** Takes the card away. What it was doing is dropped, and focus goes back to where it was. */
  close(): void {
    if (!this.node) return;
    this.unlisten?.();
    this.untrap?.();
    this.unlisten = null;
    this.untrap = null;
    for (const flight of this.flyers) flight.cancel();
    this.flyers.clear();
    this.node.remove();
    this.node = null;
    this.parts = null;
    delete this.deps.host.dataset.spellcard;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.opener = null;
  }

  /** Where the picture and its frame are on the screen, for them to fly to the book from. */
  pictureRect(): Box | null {
    return this.node?.querySelector('.spell-frame')?.getBoundingClientRect() ?? null;
  }

  private build(s: Spelling, opening: CardOpening): Parts {
    const keyboard = new Keyboard(opening.layout, (letter) => this.handlers.key(letter));
    const slots = s.letters.map((_, i) =>
      h('span', { class: 'spell-slot', style: `--i:${i}` }, h('span', { class: 'spell-letter' })),
    );
    const picture = h('img', {
      class: 'spell-picture',
      src: opening.picture,
      alt: '',
      draggable: 'false',
      'data-content-id': 'learning.card.picture',
    });
    const say = h('button', {
      type: 'button',
      class: 'spell-tool spell-say',
      'aria-label': LABELS.say,
      'data-content-id': 'learning.card.say',
      onclick: () => this.handlers.say(),
    });
    say.innerHTML = ICON_SAY;
    say.hidden = !opening.speech;
    const help = h('button', {
      type: 'button',
      class: 'spell-tool spell-help',
      'aria-label': LABELS.help,
      'data-content-id': 'learning.card.help',
      onclick: () => this.handlers.help(),
    });
    help.innerHTML = ICON_HELP;
    const shut = h('button', {
      type: 'button',
      class: 'spell-shut',
      'aria-label': LABELS.close,
      'data-content-id': 'learning.card.close',
      onclick: () => this.handlers.close(),
    });
    shut.innerHTML = ICON_CLOSE;
    const collect = h(
      'button',
      { type: 'button', class: 'spell-collect', 'data-content-id': 'learning.card.collect' },
      'Put it in my book',
    );
    const book = h('span', { class: 'spell-collect-icon', 'aria-hidden': 'true' });
    book.innerHTML = ICON_BOOK;
    collect.prepend(book);
    const stars = h('div', { class: 'spell-stars', role: 'img', 'aria-label': starsLabel(0) });
    const above = h('div', { class: 'spell-above', 'aria-hidden': 'true', 'data-content-id': 'learning.card.above' });
    const text = h(
      'p',
      { class: 'spell-caption', 'data-content-id': 'learning.card.caption' },
      caption(s, opening.firstEver),
    );
    const places = h(
      'div',
      {
        class: 'spell-slots',
        role: 'group',
        'aria-label': LABELS.places,
        'data-content-id': 'learning.card.word',
        style: `--n:${s.letters.length}`,
      },
      ...slots,
    );
    const live = h('p', { class: 'spell-live', role: 'status', 'aria-live': 'polite' });
    const pic = h(
      'div',
      { class: 'spell-pic' },
      h('div', { class: 'spell-frame', 'data-kind': opening.portrait ? 'portrait' : 'thing' }, picture),
    );
    const art = h('div', { class: 'spell-art' }, pic, h('div', { class: 'spell-tools' }, say, help));
    const work = h(
      'div',
      { class: 'spell-work' },
      text,
      above,
      places,
      keyboard.node,
      h('div', { class: 'spell-finish' }, stars, collect),
    );
    const card = h(
      'div',
      { class: 'spell-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': dialogLabel(s), tabindex: -1 },
      shut,
      art,
      work,
      live,
    );
    // A tap anywhere on a finished card goes on, except on a button that does something else.
    card.addEventListener('click', (event) => {
      if (!(event.target as Element).closest('button:not(.spell-collect)')) this.collect();
    });
    return { card, pic, caption: text, above, slots, keyboard, say, help, stars, collect, live };
  }

  /**
   * The word is done and the player tapped to go on. A tap while the last letter is still settling
   * does not count.
   */
  private collect(): void {
    if (this.node?.dataset.done !== 'true' || performance.now() - this.doneAt < SETTLE_MS) return;
    this.handlers.collect();
  }

  /**
   * A letter flies from its key to its place, and the place pops when it lands. With fewer effects
   * it only pops.
   */
  private land(letter: string, place: HTMLElement): void {
    const from = this.parts?.keyboard.rectOf(letter);
    const to = place.getBoundingClientRect();
    if (this.deps.calm() || !from || from.width === 0 || to.width === 0 || typeof place.animate !== 'function') {
      flag(place, 'pop', 480);
      return;
    }
    const shape = this.node!;
    const bounds = shape.getBoundingClientRect();
    const flyer = h('span', { class: 'spell-flyer', 'aria-hidden': 'true' }, letter);
    flyer.style.cssText = `left:${from.left - bounds.left}px;top:${from.top - bounds.top}px;width:${from.width}px;height:${from.height}px;font-size:${from.height * CAP_OF_KEY}px`;
    shape.append(flyer);
    place.dataset.landing = 'true';
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const grow = to.width / from.width;
    const flight = flyer.animate(
      [
        { transform: 'translate(0, 0) scale(1)', offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 28}px) scale(${(1 + grow) / 2 + 0.15})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${grow})`, offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.35, 0, 0.3, 1)' },
    );
    this.flyers.add(flight);
    const landed = (): void => {
      this.flyers.delete(flight);
      flyer.remove();
      delete place.dataset.landing;
      flag(place, 'pop', 480);
    };
    flight.onfinish = landed;
    flight.oncancel = landed;
  }

  /** Says something to a screen reader. The same words twice in a row are still heard. */
  private tell(text: string): void {
    const live = this.parts?.live;
    if (!live || text === '') return;
    live.textContent = '';
    window.setTimeout(() => {
      if (live.isConnected) live.textContent = text;
    }, 30);
  }

  /** Takes the keyboard, so letters go to the card and never to Wildstar. */
  private listen(): () => void {
    const accept = (event: KeyboardEvent, then: () => void): void => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) then();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Tab is for the focus trap, which keeps it inside the card.
      if (event.key === 'Tab') return;
      const letter = asLetter(event.key);
      if (event.key === 'Escape') accept(event, () => this.handlers.close());
      else if (this.node?.dataset.done === 'true' && (event.key === 'Enter' || event.key === ' '))
        accept(event, () => this.collect());
      else if (letter !== null) accept(event, () => this.handlers.key(letter));
      // Anything else, Enter and space on a key included, does what the key under focus does, and
      // never reaches Wildstar.
      else event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }
}

/**
 * The badge a big moment pins to the picture. The caption and the voice already say what it is, so
 * it is only drawn.
 */
function badgeNode(badge: Badge): HTMLElement {
  const node = h('div', {
    class: 'spell-badge',
    'data-shape': badge.shape,
    'aria-hidden': 'true',
    'data-content-id': 'learning.card.badge',
  });
  node.innerHTML = badge.shape === 'crown' ? ICON_CROWN : badge.number === null ? ICON_ROSETTE_STAR : ICON_ROSETTE;
  if (badge.number !== null) node.append(h('span', { class: 'spell-badge-number' }, String(badge.number)));
  return node;
}
