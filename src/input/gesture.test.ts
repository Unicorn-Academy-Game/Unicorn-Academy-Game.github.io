import { describe, expect, it } from 'vitest';
import { HOLD_MS, PointerGesture, REST_MS, TAP_MS, TAP_SLOP } from './gesture';

describe('a press on open ground', () => {
  it('leads Wildstar from the moment it lands, and she is told to stop when it lifts', () => {
    const g = new PointerGesture();
    expect(g.down(1, 100, 100, 0, 'ground')).toBe(true);
    expect(g.leading).toBe(true);
    expect(g.up(1, 100, 100, 900)).toEqual({ led: true, tap: false });
    expect(g.leading).toBe(false);
    expect(g.active).toBe(false);
  });

  it('is also a tap when it lifts at once and in place, so a tap still sends her to the spot', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    expect(g.up(1, 100 + TAP_SLOP - 1, 100, TAP_MS)).toEqual({ led: true, tap: true });
  });

  it('is not a tap once it has been held past the tap time, or has drifted, even if it comes back', () => {
    const slow = new PointerGesture();
    slow.down(1, 100, 100, 0, 'ground');
    expect(slow.up(1, 100, 100, TAP_MS + 1).tap).toBe(false);

    const drifting = new PointerGesture();
    drifting.down(1, 100, 100, 0, 'ground');
    drifting.move(1, 200, 100, 50);
    drifting.move(1, 100, 100, 60);
    expect(drifting.up(1, 100, 100, 100)).toEqual({ led: true, tap: false });
  });

  it('follows the finger while it moves', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    g.move(1, 160, 90, 100);
    expect(g.at).toEqual({ x: 160, y: 90 });
    g.up(1, 160, 90, 500);
    expect(g.at).toBeNull();
  });
});

describe('a press on something to tap', () => {
  it('is a tap when it lifts in place, and leads no one', () => {
    const g = new PointerGesture();
    expect(g.down(1, 100, 100, 0, 'thing')).toBe(false);
    expect(g.leading).toBe(false);
    expect(g.up(1, 100, 100, 100)).toEqual({ led: false, tap: true });
  });

  it('allows a little wobble', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.move(1, 100 + TAP_SLOP - 1, 100, 100)).toBe(false);
    expect(g.up(1, 100 + TAP_SLOP - 1, 100, 150)).toEqual({ led: false, tap: true });
  });

  it('becomes a lead when the finger drifts away, and is then not a tap', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.move(1, 100 + TAP_SLOP + 4, 100, 100)).toBe(true);
    expect(g.leading).toBe(true);
    // Only the move that crossed the line says so.
    expect(g.move(1, 220, 100, 150)).toBe(false);
    expect(g.up(1, 100, 100, 200)).toEqual({ led: true, tap: false });
  });

  it('becomes a lead when it stays down, and not before', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.hold(HOLD_MS - 1)).toBe(false);
    expect(g.hold(HOLD_MS)).toBe(true);
    expect(g.leading).toBe(true);
    expect(g.hold(HOLD_MS + 100)).toBe(false);
    expect(g.up(1, 100, 100, 1000)).toEqual({ led: true, tap: false });
  });

  it('is a tap if it lifts just before the hold', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.hold(HOLD_MS - 20)).toBe(false);
    expect(g.up(1, 100, 100, HOLD_MS - 10)).toEqual({ led: false, tap: true });
  });

  it('is nothing when it lifts somewhere else without the finger having been seen to move', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.up(1, 300, 100, 80)).toEqual({ led: false, tap: false });
  });
});

describe('more than one finger', () => {
  it('ignores a second finger entirely', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'thing');
    expect(g.down(2, 400, 400, 10, 'ground')).toBe(false);
    expect(g.move(2, 600, 600, 15)).toBe(false);
    expect(g.up(2, 600, 600, 20)).toEqual({ led: false, tap: false });
    expect(g.up(1, 100, 100, 30)).toEqual({ led: false, tap: true });
  });

  it('lets the first finger lead even when a second one rests on the screen', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    g.down(2, 400, 400, 10, 'ground');
    expect(g.at).toEqual({ x: 100, y: 100 });
    // The second finger lifting does not stop her, and it does not become the first.
    expect(g.up(2, 400, 400, 50)).toEqual({ led: false, tap: false });
    expect(g.leading).toBe(true);
    expect(g.up(1, 100, 100, 600)).toEqual({ led: true, tap: false });
  });
});

describe('losing a finger', () => {
  it('forgets the press, and says whether she was being led', () => {
    const leading = new PointerGesture();
    leading.down(1, 100, 100, 0, 'ground');
    expect(leading.cancel()).toBe(true);
    expect(leading.up(1, 100, 100, 10)).toEqual({ led: false, tap: false });

    const waiting = new PointerGesture();
    waiting.down(1, 100, 100, 0, 'thing');
    expect(waiting.cancel()).toBe(false);
  });

  it('starts fresh after a cancel', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    g.cancel();
    expect(g.down(3, 50, 50, 20, 'thing')).toBe(false);
    expect(g.up(3, 50, 50, 60)).toEqual({ led: false, tap: true });
  });

  it('does nothing for a release it never saw begin', () => {
    expect(new PointerGesture().up(9, 0, 0, 0)).toEqual({ led: false, tap: false });
    expect(new PointerGesture().hold(5000)).toBe(false);
    expect(new PointerGesture().move(9, 1, 1, 0)).toBe(false);
  });
});

describe('a finger that rests', () => {
  it('has been still for as long as it has stayed within a tap of where it last was', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    expect(g.resting(REST_MS - 1)).toBe(false);
    expect(g.resting(REST_MS)).toBe(true);
    // A tremor is still. A move of any size is not, and the time starts again from where it went.
    g.move(1, 100 + TAP_SLOP - 1, 100, REST_MS + 10);
    expect(g.resting(REST_MS + 20)).toBe(true);
    g.move(1, 200, 100, REST_MS + 30);
    expect(g.resting(REST_MS + 40)).toBe(false);
    expect(g.resting(REST_MS * 2 + 30)).toBe(true);
  });

  it('is nothing when no finger is down', () => {
    expect(new PointerGesture().resting(1e9)).toBe(false);
  });
});

describe('a second finger that taps', () => {
  const landed = REST_MS + 100;

  it('counts when it is quick and in place and the first had rested when it landed', () => {
    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    g.other(2, 400, 300, landed);
    expect(g.otherUp(2, 400 + TAP_SLOP - 1, 300, landed + TAP_MS)).toBe(true);
    // Said once. The caller drops the first finger.
    expect(g.otherUp(2, 400, 300, landed + TAP_MS)).toBe(false);
  });

  it('does not count when the first had not rested, or the tap was slow or wandered', () => {
    const early = new PointerGesture();
    early.down(1, 100, 100, 0, 'ground');
    early.other(2, 400, 300, REST_MS - 1);
    expect(early.otherUp(2, 400, 300, REST_MS + 20)).toBe(false);

    const slow = new PointerGesture();
    slow.down(1, 100, 100, 0, 'ground');
    slow.other(2, 400, 300, landed);
    expect(slow.otherUp(2, 400, 300, landed + TAP_MS + 1)).toBe(false);

    const wandering = new PointerGesture();
    wandering.down(1, 100, 100, 0, 'ground');
    wandering.other(2, 400, 300, landed);
    wandering.otherMove(2, 400 + TAP_SLOP + 1, 300);
    wandering.otherMove(2, 400, 300);
    expect(wandering.otherUp(2, 400, 300, landed + 50)).toBe(false);
  });

  it('is not watched when no finger is down, and only one is watched at a time', () => {
    const none = new PointerGesture();
    none.other(2, 400, 300, landed);
    expect(none.otherUp(2, 400, 300, landed + 50)).toBe(false);

    const g = new PointerGesture();
    g.down(1, 100, 100, 0, 'ground');
    g.other(2, 400, 300, landed);
    g.other(3, 500, 300, landed + 10);
    expect(g.otherUp(2, 400, 300, landed + 50)).toBe(false);
    expect(g.otherUp(3, 500, 300, landed + 60)).toBe(true);
  });

  it('is forgotten when the first lifts, or when all are cancelled, or when it is lost', () => {
    const lifted = new PointerGesture();
    lifted.down(1, 100, 100, 0, 'ground');
    lifted.other(2, 400, 300, landed);
    lifted.up(1, 100, 100, landed + 10);
    expect(lifted.otherUp(2, 400, 300, landed + 50)).toBe(false);

    const cancelled = new PointerGesture();
    cancelled.down(1, 100, 100, 0, 'ground');
    cancelled.other(2, 400, 300, landed);
    cancelled.cancel();
    expect(cancelled.otherUp(2, 400, 300, landed + 50)).toBe(false);

    const lost = new PointerGesture();
    lost.down(1, 100, 100, 0, 'ground');
    lost.other(2, 400, 300, landed);
    lost.otherLost(2);
    expect(lost.otherUp(2, 400, 300, landed + 50)).toBe(false);
  });
});
