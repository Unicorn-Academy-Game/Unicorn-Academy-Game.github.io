import { describe, expect, it } from 'vitest';
import { HOLD_MS, HoldGesture } from './hold';

/** A clock that only moves when the test says so. */
function rig(ms = HOLD_MS) {
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const log: string[] = [];
  const gesture = new HoldGesture(
    {
      later: (delay, fn) => {
        const timer = { at: now + delay, fn, live: true };
        timers.push(timer);
        return () => {
          timer.live = false;
        };
      },
    },
    {
      onStart: () => log.push('start'),
      onOpen: () => log.push('open'),
      onTap: () => log.push('tap'),
      onCancel: () => log.push('cancel'),
    },
    ms,
  );
  const advance = (by: number): void => {
    now += by;
    for (const t of timers) {
      if (!t.live || t.at > now) continue;
      t.live = false;
      t.fn();
    }
  };
  return { gesture, advance, log };
}

describe('hold to open', () => {
  it('opens once the press has lasted the full time, while the finger is still down', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    advance(HOLD_MS - 1);
    expect(log).toEqual(['start']);
    advance(1);
    expect(log).toEqual(['start', 'open']);
  });

  it('treats a press that ends early as a tap and never opens', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    advance(HOLD_MS - 200);
    gesture.release();
    advance(5_000);
    expect(log).toEqual(['start', 'tap']);
  });

  it('does not count releasing after it opened as a tap', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    advance(HOLD_MS);
    gesture.release();
    expect(log).toEqual(['start', 'open']);
  });

  it('lets go quietly when the finger slides off, without a tap or an open', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    advance(500);
    gesture.cancel();
    advance(5_000);
    expect(log).toEqual(['start', 'cancel']);
  });

  it('ignores a second press while one is going, so a second finger cannot restart the clock', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    advance(600);
    gesture.press();
    advance(HOLD_MS - 600);
    expect(log).toEqual(['start', 'open']);
  });

  it('can be used again after any ending', () => {
    const { gesture, advance, log } = rig();
    gesture.press();
    gesture.release();
    gesture.press();
    gesture.cancel();
    gesture.press();
    advance(HOLD_MS);
    gesture.release();
    expect(log).toEqual(['start', 'tap', 'start', 'cancel', 'start', 'open']);
  });

  it('does nothing when released or cancelled without a press', () => {
    const { gesture, log } = rig();
    gesture.release();
    gesture.cancel();
    expect(log).toEqual([]);
  });

  it('is long enough to keep a toddler out and short enough to bear', () => {
    expect(HOLD_MS).toBeGreaterThanOrEqual(900);
    expect(HOLD_MS).toBeLessThanOrEqual(1500);
  });
});
