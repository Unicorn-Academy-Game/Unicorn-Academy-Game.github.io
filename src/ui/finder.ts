import { UNICORN_DEFS } from '../content/unicorns';
import { type MagicKind, UNICORN_IDS, type UnicornId } from '../shared/ids';
import { h } from './dom';

/** The glow around a unicorn's portrait once she is found: the colour of her magic. */
const GLOW: Record<MagicKind, string> = {
  light: '#ffe27a',
  nature: '#7be08a',
  ice: '#8fe3ff',
  water: '#6fa8ff',
  fire: '#ff8a4a',
  lightning: '#fff04d',
};

const CONFETTI = ['#ff7ac8', '#ffd75e', '#5fe3d7', '#9b6bff', '#7be08a', '#ff8a4a'];
const CONFETTI_PIECES = 48;
const BANNER_MS = 3000;
const FINALE_BANNER_MS = 5200;
const CHEER_MS = 3800;
/**
 * How long after the party the counter stays, so the row is still there while the banner says it,
 * and then it goes for good.
 */
const RETIRE_AFTER_MS = 5600;
const RETIRE_FADE_MS = 420;

/**
 * How many unicorns are still waiting to be found. Wildstar is with her from the start, so a new
 * world begins with five.
 */
export const left = (found: readonly UnicornId[]): number => UNICORN_IDS.filter((id) => !found.includes(id)).length;

const unicorns = (n: number): string => `${n} ${n === 1 ? 'unicorn' : 'unicorns'}`;

export interface Tally {
  /** The number on the counter, or null once there is nothing left to count. */
  count: string | null;
  label: string;
}

/** What the counter says: the number still to find, counting down, and then that all are found. */
export function tally(found: readonly UnicornId[]): Tally {
  const n = left(found);
  return n === 0
    ? { count: null, label: 'All found!' }
    : { count: String(n), label: n === 1 ? 'unicorn left' : 'unicorns left' };
}

/** What is said, big, when a friend joins. The last one gets a line of her own. */
export function announcement(
  id: UnicornId,
  found: readonly UnicornId[],
): { title: string; detail: string; finale: boolean } {
  const n = left(found);
  if (n === 0)
    return {
      title: 'You found them all!',
      detail: `All ${UNICORN_IDS.length} unicorns are together now`,
      finale: true,
    };
  return { title: `${UNICORN_DEFS[id].displayName} joined you!`, detail: `${unicorns(n)} left to find`, finale: false };
}

/**
 * Whether the counter is wanted at all. Once everyone is found there is nothing left to find, so
 * the row and the count go away.
 */
export const wanted = (found: readonly UnicornId[]): boolean => left(found) > 0;

/** What a screen reader says about the row. */
export const summary = (found: readonly UnicornId[]): string =>
  `${found.length} of ${UNICORN_IDS.length} unicorns found`;

/** Each unicorn's portrait, as the page can show it. */
export type PortraitSource = Readonly<Record<UnicornId, string>>;

/**
 * The row of unicorn portraits in the corner, and the count of how many are still hiding. A friend
 * who is not found yet is a dark shape with a question mark. When she joins, her portrait lights up
 * in the colour of her magic, the number drops and her name is announced; the last one is a party.
 */
export class Finder {
  readonly node: HTMLElement;
  private readonly slots = new Map<UnicornId, HTMLElement>();
  private readonly count = h('b', { class: 'finder-count' });
  private readonly label = h('span', { class: 'finder-label' });
  private banner: HTMLElement | null = null;
  private bannerTimer = 0;
  private cheerTimer = 0;
  private retireTimer = 0;
  /**
   * When each animated thing's flag is taken away, so a second flag set before the first is gone is
   * not cut short by it.
   */
  private readonly flagTimers = new Map<HTMLElement, number>();

  /**
   * `overlay` is where announcements and confetti go. `calm` says whether the parent asked for
   * fewer effects.
   */
  constructor(
    private readonly overlay: HTMLElement,
    portraits: PortraitSource,
    private readonly calm: () => boolean,
  ) {
    const row = h('div', { class: 'finder-slots' });
    UNICORN_IDS.forEach((id, i) => {
      const slot = h(
        'div',
        { class: 'finder-slot', role: 'img', 'data-unicorn': id },
        h(
          'div',
          { class: 'disc' },
          h('img', { src: portraits[id], alt: '', draggable: 'false' }),
          h('i', { class: 'q', 'aria-hidden': 'true' }, '?'),
        ),
      );
      slot.style.setProperty('--glow', GLOW[UNICORN_DEFS[id].magic]);
      slot.style.setProperty('--i', String(i));
      this.slots.set(id, slot);
      row.append(slot);
    });
    this.node = h(
      'div',
      { class: 'finder', role: 'group', 'aria-label': 'Unicorns found' },
      row,
      h('div', { class: 'finder-tally', 'aria-hidden': 'true' }, this.count, this.label),
    );
  }

  /**
   * Shows who is found without any fanfare, as at the start of a visit or in a world that is
   * carried on.
   */
  set(found: readonly UnicornId[]): void {
    for (const [id, slot] of this.slots) this.mark(id, slot, found.includes(id));
    this.write(found);
    if (!wanted(found)) this.retire(0);
  }

  /** A friend has just joined: her portrait lights up, the number drops and she is announced. */
  celebrate(id: UnicornId, found: readonly UnicornId[]): void {
    // Every portrait follows the list, so the row is right whatever was found before this one. Only
    // the new one pops.
    for (const [who, slot] of this.slots) this.mark(who, slot, found.includes(who));
    const joined = this.slots.get(id);
    if (joined) this.restart(joined, 'pop', 1100);
    this.write(found);
    this.restart(this.count, 'tick', 700);
    const say = announcement(id, found);
    this.announce(say.title, say.detail, say.finale ? FINALE_BANNER_MS : BANNER_MS, say.finale);
    if (!say.finale) return;
    this.node.dataset.cheer = 'true';
    window.clearTimeout(this.cheerTimer);
    this.cheerTimer = window.setTimeout(() => delete this.node.dataset.cheer, CHEER_MS);
    if (!this.calm()) this.confetti();
    this.retire(RETIRE_AFTER_MS);
  }

  /**
   * Takes the counter away for good. After `ms` it fades out and then leaves the page, so nothing
   * in the corner asks for more.
   */
  private retire(ms: number): void {
    window.clearTimeout(this.retireTimer);
    if (ms === 0) {
      this.node.hidden = true;
      return;
    }
    this.retireTimer = window.setTimeout(() => {
      this.node.dataset.hidden = 'true';
      this.retireTimer = window.setTimeout(() => (this.node.hidden = true), RETIRE_FADE_MS);
    }, ms);
  }

  private mark(id: UnicornId, slot: HTMLElement, found: boolean): void {
    slot.dataset.found = String(found);
    slot.setAttribute('aria-label', `${UNICORN_DEFS[id].displayName}, ${found ? 'found' : 'not found yet'}`);
  }

  private write(found: readonly UnicornId[]): void {
    const t = tally(found);
    this.count.textContent = t.count ?? '';
    this.count.hidden = t.count === null;
    this.label.textContent = t.label;
    this.node.dataset.done = String(t.count === null);
    this.node.setAttribute('aria-label', summary(found));
  }

  /**
   * Plays a one-off animation by setting a flag the stylesheet reacts to and taking it away after
   * it has run.
   */
  private restart(node: HTMLElement, flag: string, ms: number): void {
    window.clearTimeout(this.flagTimers.get(node));
    delete node.dataset[flag];
    void node.offsetWidth;
    node.dataset[flag] = 'true';
    this.flagTimers.set(
      node,
      window.setTimeout(() => delete node.dataset[flag], ms),
    );
  }

  private announce(title: string, detail: string, ms: number, finale: boolean): void {
    this.banner?.remove();
    window.clearTimeout(this.bannerTimer);
    const banner = h(
      'div',
      { class: 'found-banner', role: 'status', 'data-finale': String(finale) },
      h('strong', {}, title),
      h('span', {}, detail),
    );
    banner.style.setProperty('--ms', `${ms}ms`);
    this.banner = banner;
    this.overlay.append(banner);
    this.bannerTimer = window.setTimeout(() => banner.remove(), ms);
  }

  private confetti(): void {
    const sheet = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < CONFETTI_PIECES; i++) {
      const piece = h('i');
      piece.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
      piece.style.setProperty('--delay', `${(Math.random() * 1.1).toFixed(2)}s`);
      piece.style.setProperty('--fall', `${(2.4 + Math.random() * 1.8).toFixed(2)}s`);
      piece.style.setProperty('--spin', `${Math.round(360 + Math.random() * 720)}deg`);
      piece.style.setProperty('--sway', `${Math.round(Math.random() * 120 - 60)}px`);
      piece.style.setProperty('--colour', CONFETTI[i % CONFETTI.length]!);
      sheet.append(piece);
    }
    this.overlay.append(sheet);
    window.setTimeout(() => sheet.remove(), 5600);
  }
}
