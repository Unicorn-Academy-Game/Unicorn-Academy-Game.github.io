/**
 * What the Spell Book and the Sticker Book share, because both are a row of pages: how a page is
 * turned by a finger, a wheel and the keys, how the row of tabs keeps the open page in the middle,
 * and how a screen reader is told which page it is on.
 */

/**
 * How far a finger has to move along the page to turn it, and how much more along than across, so a
 * scroll or a slip is not a turn.
 */
const SWIPE_PX = 56;
const SWIPE_SLOPE = 1.6;

/** A page to turn to: the next, the one before, or an end of the book. */
export type Turn = 1 | -1 | 'first' | 'last';

/** A swipe along the page turns it. */
export function swipeToTurn(page: HTMLElement, turn: (by: 1 | -1) => void): void {
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
    turn(dx < 0 ? 1 : -1);
  });
}

/** A mouse wheel turns the row of tabs along, since a mouse cannot swipe it. */
export function wheelAlong(strip: HTMLElement): void {
  strip.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      strip.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false },
  );
}

/**
 * Takes the keyboard while a book is open: arrows turn the page, Home and End go to the ends,
 * Escape closes, and nothing steers Wildstar. Whatever is on top of the book has the keys first.
 * It returns a way to give the keyboard back.
 */
export function bookKeys(on: { close: () => void; turn: (to: Turn) => void }): () => void {
  const turns: Readonly<Record<string, Turn>> = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
  const onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
    event.stopPropagation();
    const to = event.key === 'Escape' ? 'close' : turns[event.key];
    if (to === undefined) return;
    event.preventDefault();
    if (to === 'close') on.close();
    else on.turn(to);
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

/**
 * Brings a tab to the middle of the row of tabs, which is swiped along when there are more than go
 * across. The row alone is moved, and nothing around it.
 */
export function centreTab(strip: HTMLElement | undefined, tab: HTMLElement | undefined, smooth: boolean): void {
  if (!strip || !tab) return;
  const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
}

/** Says something to a screen reader, through a polite live region that is emptied first. */
export function tell(live: HTMLElement | undefined, text: string): void {
  if (!live || text === '') return;
  live.textContent = '';
  window.setTimeout(() => {
    if (live.isConnected) live.textContent = text;
  }, 30);
}
