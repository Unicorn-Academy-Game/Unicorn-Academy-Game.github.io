import { describe, expect, it } from 'vitest';
import { BASKET_FADE_MS, type Clock, Fade } from './fade';

/** A clock the test turns by hand. */
function handClock(): Clock & { now: number; advance: (ms: number) => void } {
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const clock = {
    now: 0,
    after: (run: () => void, ms: number): number => {
      pending.set(next, { at: clock.now + ms, run });
      return next++;
    },
    cancel: (id: number): void => void pending.delete(id),
    advance: (ms: number): void => {
      clock.now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at > clock.now) continue;
        pending.delete(id);
        t.run();
      }
    },
  };
  return clock;
}

describe('the basket fading', () => {
  it('waits ten seconds', () => {
    expect(BASKET_FADE_MS).toBe(10_000);
  });

  it('fades once ten seconds have gone by with nothing changing', () => {
    const clock = handClock();
    const seen: boolean[] = [];
    const fade = new Fade((s) => seen.push(s), BASKET_FADE_MS, clock);
    fade.touch();
    clock.advance(BASKET_FADE_MS - 1);
    expect(fade.resting).toBe(false);
    expect(seen).toEqual([]);
    clock.advance(1);
    expect(fade.resting).toBe(true);
    expect(seen).toEqual([false]);
  });

  it('starts the wait again when something changes, so a number the player is still adding to stays', () => {
    const clock = handClock();
    const seen: boolean[] = [];
    const fade = new Fade((s) => seen.push(s), BASKET_FADE_MS, clock);
    fade.touch();
    clock.advance(6_000);
    fade.touch();
    clock.advance(6_000);
    expect(fade.resting).toBe(false);
    clock.advance(4_000);
    expect(fade.resting).toBe(true);
    expect(seen).toEqual([false]);
  });

  it('comes back at once when something changes after it has faded, and fades again later', () => {
    const clock = handClock();
    const seen: boolean[] = [];
    const fade = new Fade((s) => seen.push(s), BASKET_FADE_MS, clock);
    fade.touch();
    clock.advance(BASKET_FADE_MS);
    fade.touch();
    expect(fade.resting).toBe(false);
    expect(seen).toEqual([false, true]);
    clock.advance(BASKET_FADE_MS);
    expect(seen).toEqual([false, true, false]);
  });

  it('says nothing when it is touched while it is already in view', () => {
    const clock = handClock();
    const seen: boolean[] = [];
    const fade = new Fade((s) => seen.push(s), BASKET_FADE_MS, clock);
    fade.touch();
    fade.touch();
    fade.touch();
    expect(seen).toEqual([]);
  });
});
