import type { Page } from '@playwright/test';
import type { Pt } from './helpers';

/**
 * Fingers on the screen of a Chromium page, as the browser itself delivers them: touch events with
 * the touch list, the changed list and the identifiers a phone gives. The mouse the other specs use
 * never produces these, and a finger that is lost, or that lands on a button, is only a finger in
 * these.
 */
export interface Fingers {
  /** Puts a finger down. Each finger has its own number for as long as it is down. */
  down(id: number, at: Pt): Promise<void>;
  move(id: number, at: Pt): Promise<void>;
  /** Lifts the finger. The others stay where they are. */
  up(id: number): Promise<void>;
  /**
   * A finger that lands and lifts again `ms` later, as a child's tap does. The lift is sent without
   * waiting for the page to say it heard the landing, so a page that is slow to answer cannot make
   * the tap any longer than the finger made it. A tap made of `down`, a wait and `up` lasts as long
   * as the page takes to hear the first, which on a busy machine is longer than a tap may be.
   */
  tap(id: number, at: Pt, ms?: number): Promise<void>;
  /**
   * The system takes the fingers away, as it does for a swipe from the edge of the screen. The
   * browser cancels every finger at once, so this ends all of them.
   */
  cancel(): Promise<void>;
  /** The fingers that are down now. */
  held(): number[];
}

export async function fingers(page: Page): Promise<Fingers> {
  const cdp = await page.context().newCDPSession(page);
  const down = new Map<number, Pt>();
  const list = (): { x: number; y: number; id: number }[] => [...down].map(([id, at]) => ({ id, x: at.x, y: at.y }));
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: { x: number; y: number; id: number }[],
  ): Promise<unknown> => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const hand: Fingers = {
    async down(id, at) {
      down.set(id, { ...at });
      await send('touchStart', list());
    },
    async move(id, at) {
      down.set(id, { ...at });
      await send('touchMove', list());
    },
    async up(id) {
      const at = down.get(id);
      if (!at) throw new Error(`finger ${id} is not down`);
      down.delete(id);
      await send('touchEnd', [{ id, x: at.x, y: at.y }]);
    },
    async tap(id, at, ms = 60) {
      const landed = hand.down(id, at);
      await new Promise((done) => setTimeout(done, ms));
      await Promise.all([landed, hand.up(id)]);
    },
    async cancel() {
      down.clear();
      await send('touchCancel', []);
    },
    held: () => [...down.keys()],
  };
  return hand;
}
