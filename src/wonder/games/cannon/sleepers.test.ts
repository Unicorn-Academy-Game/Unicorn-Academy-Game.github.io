import { describe, expect, it } from 'vitest';
import { constellationOf, fit } from './constellations';
import { LINE_SECONDS, Sleepers } from './sleepers';

const BOX = { x: 100, y: 20, w: 500, h: 240 };

function unicorns(): Sleepers {
  const picture = constellationOf('star');
  const s = new Sleepers(picture);
  s.place(fit(picture, BOX));
  return s;
}

describe('the sleeping stars', () => {
  it('start all asleep', () => {
    const s = unicorns();
    expect(s.count).toBe(21);
    expect(s.awake).toBe(0);
    expect(s.done).toBe(false);
    expect(s.stars.every((x) => x.woke === -1 && x.order === -1)).toBe(true);
  });

  it('wake once, in order, and say so only the first time', () => {
    const s = unicorns();
    expect(s.wake(4, 1.5)).toBe(true);
    expect(s.wake(4, 2)).toBe(false);
    expect(s.wake(9, 2.5)).toBe(true);
    expect(s.stars[4]).toMatchObject({ woke: 1.5, order: 0 });
    expect(s.stars[9]).toMatchObject({ woke: 2.5, order: 1 });
    expect(s.awake).toBe(2);
    expect(s.wake(99, 3)).toBe(false);
  });

  it('are done only when every one is awake', () => {
    const s = unicorns();
    for (let i = 0; i < s.count - 1; i++) s.wake(i, i);
    expect(s.done).toBe(false);
    s.wake(s.count - 1, 30);
    expect(s.done).toBe(true);
  });

  it('can all be put back to sleep', () => {
    const s = unicorns();
    for (let i = 0; i < 5; i++) s.wake(i, i);
    s.reset();
    expect(s.awake).toBe(0);
    expect(s.wake(2, 1)).toBe(true);
    expect(s.stars[2]!.order).toBe(0);
  });
});

describe('finding the stars a burst reaches', () => {
  it('lists the sleepers inside the radius, nearest first, and not the awake or the far', () => {
    const s = unicorns();
    const star = s.stars[7]!;
    const near = s.asleepNear(star.x, star.y, 70);
    expect(near[0]).toBe(7);
    expect(near.length).toBeGreaterThan(1);
    for (let k = 1; k < near.length; k++) {
      const a = s.stars[near[k - 1]!]!;
      const b = s.stars[near[k]!]!;
      expect(Math.hypot(a.x - star.x, a.y - star.y)).toBeLessThanOrEqual(Math.hypot(b.x - star.x, b.y - star.y));
    }
    s.wake(7, 1);
    expect(s.asleepNear(star.x, star.y, 70)).not.toContain(7);
    expect(s.asleepNear(star.x - 1000, star.y, 70)).toEqual([]);
  });

  it('finds the star nearest a touch, asleep or awake, and none when the touch is far from all of them', () => {
    const s = unicorns();
    const a = s.stars[3]!;
    expect(s.nearest(a.x + 4, a.y - 3, 30)).toBe(3);
    s.wake(3, 1);
    expect(s.nearest(a.x, a.y, 30)).toBe(3);
    expect(s.nearest(a.x, a.y, 30, true)).not.toBe(3);
    expect(s.nearest(-500, -500, 30)).toBe(-1);
  });
});

describe('the lines between stars', () => {
  it('are not there while either end sleeps, then grow over half a second from the end that woke first', () => {
    const s = unicorns();
    expect(s.drawn(0, 1, 5)).toBe(0);
    s.wake(0, 2);
    expect(s.drawn(0, 1, 5)).toBe(0);
    s.wake(1, 3);
    expect(s.drawn(0, 1, 3)).toBe(0);
    expect(s.drawn(0, 1, 3 + LINE_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(s.drawn(0, 1, 3 + LINE_SECONDS)).toBe(1);
    expect(s.drawn(0, 1, 99)).toBe(1);
    expect(s.drawn(1, 0, 99)).toBe(1);
    expect(s.source(0, 1)).toBe(0);
    expect(s.source(1, 0)).toBe(0);
  });
});

describe('the order the picture sings in', () => {
  it('is from the left of the picture to the right, each star once', () => {
    const s = unicorns();
    const order = s.leftToRight();
    expect(new Set(order).size).toBe(s.count);
    for (let k = 1; k < order.length; k++)
      expect(s.stars[order[k]!]!.x).toBeGreaterThanOrEqual(s.stars[order[k - 1]!]!.x);
  });
});

describe('putting the picture in a box', () => {
  it('moves the stars and keeps the awake ones awake', () => {
    const s = unicorns();
    s.wake(5, 1);
    const before = { x: s.stars[5]!.x, y: s.stars[5]!.y };
    s.place(fit(s.picture, { x: 0, y: 0, w: 300, h: 150 }));
    expect(s.stars[5]).toMatchObject({ woke: 1, order: 0 });
    expect(s.stars[5]!.x).not.toBeCloseTo(before.x, 3);
  });
});
