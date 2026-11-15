import { describe, expect, it } from 'vitest';
import { type Corner, type ExitSpot, exitArrows, roomAround, seekBubble } from '../../src/game/guide';

const SCREEN = { w: 800, h: 400 };
const INSET = { top: 80, right: 50, bottom: 50, left: 50 };
/**
 * The world drawn one to one, with the camera centred at (1000, 1000), so a world point lands at
 * its offset from there.
 */
const toScreen = (p: { x: number; y: number }) => ({ x: p.x - 1000 + SCREEN.w / 2, y: p.y - 1000 + SCREEN.h / 2 });
const spot = (portalId: string, x: number, y: number): ExitSpot => ({ portalId, mapId: 'forest', at: { x, y } });

describe('pointing the way to an exit', () => {
  it('says nothing about an exit that can be seen', () => {
    expect(exitArrows([spot('near', 1100, 1050)], toScreen, SCREEN, INSET)).toEqual([]);
  });

  it('puts a bubble on the edge, on the line toward an exit that is off to one side, pointing at it', () => {
    const [a] = exitArrows([spot('east', 3000, 1000)], toScreen, SCREEN, INSET);
    expect(a!.x).toBeCloseTo(SCREEN.w - INSET.right);
    expect(a!.y).toBeCloseTo(SCREEN.h / 2);
    expect(a!.angle).toBeCloseTo(0);
    const [w] = exitArrows([spot('west', -2000, 1000)], toScreen, SCREEN, INSET);
    expect(w!.x).toBeCloseTo(INSET.left);
    expect(Math.abs(w!.angle)).toBeCloseTo(Math.PI);
  });

  it('keeps a bubble clear of the buttons along the top and the screen edge at the bottom', () => {
    const [up] = exitArrows([spot('up', 1000, -2000)], toScreen, SCREEN, INSET);
    expect(up!.y).toBeCloseTo(INSET.top);
    expect(up!.angle).toBeCloseTo(-Math.PI / 2);
    const [down] = exitArrows([spot('down', 1000, 4000)], toScreen, SCREEN, INSET);
    expect(down!.y).toBeCloseTo(SCREEN.h - INSET.bottom);
    expect(down!.angle).toBeCloseTo(Math.PI / 2);
  });

  it('puts the bubble on the line between the middle of the screen and the exit, whichever corner it lies toward', () => {
    for (const [x, y] of [
      [3000, 2600],
      [-800, 2600],
      [3000, -900],
      [-800, -900],
      [1400, 5000],
    ] as const) {
      const [a] = exitArrows([spot('s', x, y)], toScreen, SCREEN, INSET);
      const p = toScreen({ x, y });
      const dx = a!.x - SCREEN.w / 2,
        dy = a!.y - SCREEN.h / 2;
      expect(Math.atan2(dy, dx)).toBeCloseTo(Math.atan2(p.y - SCREEN.h / 2, p.x - SCREEN.w / 2));
      expect(a!.x).toBeGreaterThanOrEqual(INSET.left - 1e-6);
      expect(a!.x).toBeLessThanOrEqual(SCREEN.w - INSET.right + 1e-6);
      expect(a!.y).toBeGreaterThanOrEqual(INSET.top - 1e-6);
      expect(a!.y).toBeLessThanOrEqual(SCREEN.h - INSET.bottom + 1e-6);
    }
  });

  it('shows the nearest few, and leaves out one that would sit on another', () => {
    const spots = [
      spot('far', 5000, 1000),
      spot('near', 2500, 1000),
      spot('mid', 1000, 3000),
      spot('north', 1000, -1500),
      spot('beside', 2600, 1010),
    ];
    const shown = exitArrows(spots, toScreen, SCREEN, INSET, 3).map((a) => a.portalId);
    expect(shown).toEqual(['near', 'mid', 'north']);
    // 'beside' lands where 'near' does, so it is not shown even with room to spare.
    expect(exitArrows(spots, toScreen, SCREEN, INSET, 9).map((a) => a.portalId)).not.toContain('beside');
  });

  it('leaves out the bubble of a way out that would sit on a bubble that is already there', () => {
    const spots = [spot('under', 3000, 1000), spot('other', 1000, 3000)];
    const taken = [{ x: SCREEN.w - INSET.right - 10, y: SCREEN.h / 2 + 5 }];
    expect(exitArrows(spots, toScreen, SCREEN, INSET, 3).map((a) => a.portalId)).toEqual(['under', 'other']);
    expect(exitArrows(spots, toScreen, SCREEN, INSET, 3, taken).map((a) => a.portalId)).toEqual(['other']);
  });

  it('shows a bubble the moment an exit slips off the screen, and not before', () => {
    expect(exitArrows([spot('s', 1000 + SCREEN.w / 2 - 30, 1000)], toScreen, SCREEN, INSET)).toEqual([]);
    expect(exitArrows([spot('s', 1000 + SCREEN.w / 2 + 40, 1000)], toScreen, SCREEN, INSET)).toHaveLength(1);
  });
});

describe('pointing the way to a word the player is looking for', () => {
  const at = (x: number, y: number) => ({ x, y });

  it('hovers a little above a thing that can be seen, pointing down at it', () => {
    const b = seekBubble(at(1100, 1050), toScreen, SCREEN, INSET);
    const p = toScreen(at(1100, 1050));
    expect(b.over).toBe(true);
    expect(b.x).toBeCloseTo(p.x);
    expect(b.y).toBeLessThan(p.y);
    expect(p.y - b.y).toBeGreaterThan(20);
    expect(b.angle).toBeCloseTo(Math.PI / 2);
  });

  it('keeps its place among the buttons when the thing is close to a side, and stays just under the buttons along the top, still pointing down at a thing close to the top', () => {
    const side = seekBubble(at(1000 - SCREEN.w / 2 + 25, 1000), toScreen, SCREEN, INSET);
    expect(side.x).toBeCloseTo(INSET.left);
    expect(side.over).toBe(true);
    const top = seekBubble(at(1000, 1000 - SCREEN.h / 2 + 30), toScreen, SCREEN, INSET);
    expect(top.over).toBe(true);
    expect(top.y).toBeCloseTo(INSET.top);
    expect(top.angle).toBeCloseTo(Math.PI / 2);
    const bottom = seekBubble(at(1000, 1000 + SCREEN.h / 2 - 30), toScreen, SCREEN, INSET);
    expect(bottom.y).toBeLessThanOrEqual(SCREEN.h - INSET.bottom);
  });

  it('slides along under the buttons as a thing goes up the screen, so it never jumps', () => {
    const heights: number[] = [];
    for (let y = 300; y >= 25; y -= 1)
      heights.push(seekBubble(at(1000, 1000 - SCREEN.h / 2 + y), toScreen, SCREEN, INSET).y);
    for (let i = 1; i < heights.length; i++)
      expect(Math.abs(heights[i]! - heights[i - 1]!), `step ${i}`).toBeLessThanOrEqual(1 + 1e-9);
    expect(heights.at(-1)).toBeCloseTo(INSET.top);
  });

  it('sits at the edge on the line toward a thing that cannot be seen, as the bubble for a way out does', () => {
    const [arrow] = exitArrows([spot('s', 3000, 2600)], toScreen, SCREEN, INSET);
    const b = seekBubble(at(3000, 2600), toScreen, SCREEN, INSET);
    expect(b.over).toBe(false);
    expect(b.x).toBeCloseTo(arrow!.x);
    expect(b.y).toBeCloseTo(arrow!.y);
    expect(b.angle).toBeCloseTo(arrow!.angle);
  });

  it('is never off the screen or under the buttons, wherever the thing is', () => {
    for (let x = -3000; x <= 5000; x += 410) {
      for (let y = -3000; y <= 5000; y += 410) {
        const b = seekBubble(at(x, y), toScreen, SCREEN, INSET);
        expect(b.x, `${x},${y}`).toBeGreaterThanOrEqual(INSET.left - 1e-6);
        expect(b.x, `${x},${y}`).toBeLessThanOrEqual(SCREEN.w - INSET.right + 1e-6);
        expect(b.y, `${x},${y}`).toBeGreaterThanOrEqual(INSET.top - 1e-6);
        expect(b.y, `${x},${y}`).toBeLessThanOrEqual(SCREEN.h - INSET.bottom + 1e-6);
      }
    }
  });
});

describe('keeping off the buttons in the corner', () => {
  const BUBBLE = 52;
  const AIR = BUBBLE / 2 + 6;
  /**
   * The counter, the Spell Book button and the basket, as the DOM layer hands them over: the right
   * and lower side, with the air added.
   */
  const counter: Corner = { right: 385 + AIR, bottom: 70 + AIR };
  const book: Corner = { right: 101 + AIR, bottom: 125 + AIR };
  const basket: Corner = { right: 85 + AIR, bottom: 173 + AIR };
  const BASE = { top: 96, right: 40, bottom: 44, left: 40 };
  /** A phone held sideways, and a tablet. */
  const PHONE = { w: 863, h: 360 };
  const TABLET = { w: 1024, h: 768 };

  it('goes under a button when that keeps the bubble above the middle of the screen, as on a tablet', () => {
    expect(roomAround(BASE, [counter, book], TABLET, BUBBLE)).toEqual({ ...BASE, top: book.bottom });
    expect(roomAround(BASE, [counter, book, basket], TABLET, BUBBLE)).toEqual({ ...BASE, top: basket.bottom });
  });

  it('keeps to the right of a button that is too low for that, as on a phone held sideways, and stays under the counter', () => {
    expect(roomAround(BASE, [counter, book], PHONE, BUBBLE)).toEqual({
      ...BASE,
      top: counter.bottom,
      left: book.right,
    });
    expect(roomAround(BASE, [counter, book, basket], PHONE, BUBBLE)).toEqual({
      ...BASE,
      top: counter.bottom,
      left: book.right,
    });
    // The bubbles never go lower than a bubble's width above the middle, so a stack of buttons does
    // not push them over the herd.
    expect(roomAround(BASE, [counter, book, basket], PHONE, BUBBLE).top).toBeLessThanOrEqual(PHONE.h / 2 - BUBBLE);
  });

  it('gives the room back when the basket has faded away, since it is no longer one of the buttons', () => {
    const shown = roomAround(BASE, [counter, book, basket], TABLET, BUBBLE).top;
    const resting = roomAround(BASE, [counter, book], TABLET, BUBBLE).top;
    expect(resting).toBeLessThan(shown);
  });

  it('does not mind the order the buttons come in', () => {
    const parts = [counter, book, basket];
    for (const screen of [PHONE, TABLET]) {
      const once = roomAround(BASE, parts, screen, BUBBLE);
      expect(roomAround(BASE, [basket, counter, book], screen, BUBBLE)).toEqual(once);
      expect(roomAround(BASE, [book, basket, counter], screen, BUBBLE)).toEqual(once);
    }
  });

  it('is not troubled by a button that ends above the first row of bubbles, such as the look-around badge', () => {
    expect(roomAround(BASE, [{ right: 200, bottom: 60 }], PHONE, BUBBLE)).toEqual(BASE);
    expect(roomAround(BASE, [], PHONE, BUBBLE)).toEqual(BASE);
  });

  it('always goes under a button wider than a third of the screen, since the bubbles could not all be crowded beside it', () => {
    const wide: Corner = { right: 400, bottom: 200 };
    expect(roomAround(BASE, [wide], PHONE, BUBBLE)).toEqual({ ...BASE, top: 200 });
  });

  it('leaves a bubble on no button, whichever way the exit lies and whichever buttons show', () => {
    const toward = (degrees: number, far: number) => ({
      x: 1000 + far * Math.cos((degrees * Math.PI) / 180),
      y: 1000 + far * Math.sin((degrees * Math.PI) / 180),
    });
    const hit = (b: { x: number; y: number }, part: Corner): boolean =>
      b.x < part.right - 1e-6 && b.y < part.bottom - 1e-6;
    for (const screen of [PHONE, TABLET, { w: 390, h: 800 }, { w: 667, h: 290 }]) {
      const toScreen = (p: { x: number; y: number }) => ({
        x: p.x - 1000 + screen.w / 2,
        y: p.y - 1000 + screen.h / 2,
      });
      for (const parts of [
        [counter, book],
        [counter, book, basket],
      ]) {
        const room = roomAround(BASE, parts, screen, BUBBLE);
        for (let degrees = 0; degrees < 360; degrees += 1) {
          const at = toward(degrees, 4000);
          const [b] = exitArrows([spot('s', at.x, at.y)], toScreen, screen, room);
          for (const part of parts)
            expect(hit(b!, part), `${screen.w}x${screen.h} ${degrees} degrees at ${b!.x},${b!.y}`).toBe(false);
        }
      }
    }
  });

  it('keeps the bubble that hovers over a thing off the buttons too, which it does by staying inside the same room', () => {
    const room = roomAround(BASE, [counter, book, basket], PHONE, BUBBLE);
    for (let x = 0; x <= PHONE.w; x += 17) {
      for (let y = 0; y <= PHONE.h; y += 13) {
        const b = seekBubble(
          { x: 1000 - PHONE.w / 2 + x, y: 1000 - PHONE.h / 2 + y },
          (p) => ({ x: p.x - 1000 + PHONE.w / 2, y: p.y - 1000 + PHONE.h / 2 }),
          PHONE,
          room,
        );
        expect(b.x, `${x},${y}`).toBeGreaterThanOrEqual(room.left - 1e-6);
        expect(b.y, `${x},${y}`).toBeGreaterThanOrEqual(room.top - 1e-6);
      }
    }
  });
});
