// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { chromeOf, type Rect } from '../../engine/chrome';
import { SCREENS } from '../../engine/screens';
import { type Box, BUTTON_IDS, buttonAt, keyBox, planOf, tabAt, tileBox } from './layout';
import { PART_IDS } from './parts';
import { SIZE } from './scale';

const box = (b: Box): Rect => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h });
const meets = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const disc = (b: { x: number; y: number; r: number }): Rect => ({
  x0: b.x - b.r,
  y0: b.y - b.r,
  x1: b.x + b.r,
  y1: b.y + b.r,
});

describe.each(SCREENS)('the layout on $name', (screen) => {
  const plan = planOf(screen);
  const chrome = chromeOf(screen);
  const px = (units: number): number => units * screen.unit;

  it('keeps everything it draws or touches out from under the page buttons, the stars, and the buttons of the end', () => {
    const things: [string, Rect][] = [
      ['the panel', box(plan.panel)],
      ['the keys', box(plan.keys)],
      ...plan.buttons.map((b): [string, Rect] => [`the ${b.id} button`, disc(b)]),
      ...plan.tabs.map((t): [string, Rect] => [`the ${t.id} tab`, box(t)]),
    ];
    for (const [name, rect] of things) {
      for (const [other, where] of Object.entries(chrome))
        expect(meets(rect, where), `${name} and ${other}`).toBe(false);
    }
  });

  it('is all on the screen, and the tiles are inside their glass', () => {
    for (const rect of [box(plan.panel), box(plan.keys), ...plan.buttons.map(disc), ...plan.tabs.map(box)]) {
      expect(rect.x0).toBeGreaterThanOrEqual(0);
      expect(rect.y0).toBeGreaterThanOrEqual(0);
      expect(rect.x1).toBeLessThanOrEqual(screen.w + 1e-6);
      expect(rect.y1).toBeLessThanOrEqual(screen.h + 1e-6);
    }
    expect(plan.grid.x).toBeGreaterThanOrEqual(plan.panel.x);
    expect(plan.grid.y).toBeGreaterThanOrEqual(plan.panel.y);
    expect(plan.grid.x + plan.grid.w).toBeLessThanOrEqual(plan.panel.x + plan.panel.w + 1e-6);
    expect(plan.grid.y + plan.grid.h).toBeLessThanOrEqual(plan.panel.y + plan.panel.h + 1e-6);
  });

  it('has tiles a finger can hit and buttons a thumb can hit', () => {
    expect(px(plan.grid.th), 'a tile is this high in CSS pixels').toBeGreaterThanOrEqual(15);
    expect(px(plan.grid.tw), 'and this wide').toBeGreaterThanOrEqual(15);
    for (const b of plan.buttons) expect(px(b.r * 2), `the ${b.id} button`).toBeGreaterThanOrEqual(44);
    expect(px(plan.keys.w)).toBeGreaterThanOrEqual(19);
  });

  it('does not stretch a tile into a bar', () => {
    expect(plan.grid.tw / plan.grid.th).toBeLessThanOrEqual(1.7 + 1e-9);
    expect(plan.grid.th / plan.grid.tw).toBeLessThanOrEqual(1.7 + 1e-9);
  });

  it('has the 16 keys level with the 16 rows, and the keys clear of the tiles', () => {
    expect(plan.keys.th).toBeCloseTo(plan.grid.th, 9);
    expect(plan.keys.h).toBeCloseTo(plan.grid.h, 9);
    expect(plan.keys.y).toBeCloseTo(plan.grid.y, 9);
    expect(plan.keys.x + plan.keys.w).toBeLessThan(plan.grid.x);
    expect(keyBox(plan, SIZE - 1).y + keyBox(plan, SIZE - 1).h).toBeCloseTo(plan.grid.y + plan.grid.h, 9);
  });

  it('has buttons that are four, in order, with room between them and clear of the keys and the glass', () => {
    expect(plan.buttons.map((b) => b.id)).toEqual([...BUTTON_IDS]);
    for (const [i, a] of plan.buttons.entries()) {
      expect(meets(disc(a), box(plan.keys)), `${a.id} and the keys`).toBe(false);
      expect(meets(disc(a), box(plan.panel)), `${a.id} and the glass`).toBe(false);
      for (const b of plan.buttons.slice(i + 1))
        expect(
          px(Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r),
          `${a.id} and ${b.id}, in CSS pixels`,
        ).toBeGreaterThanOrEqual(6 - 1e-6);
    }
  });

  it('has three tabs, one for each part and in the order of the parts, that a thumb can hit', () => {
    expect(plan.tabs.map((t) => t.id)).toEqual([...PART_IDS]);
    for (const t of plan.tabs) {
      expect(px(t.w), `the ${t.id} tab is this wide in CSS pixels`).toBeGreaterThanOrEqual(44);
      expect(px(t.h), `and this high`).toBeGreaterThanOrEqual(44);
    }
  });

  it('puts the tabs against the glass, on its right when the screen is wide and above it when the screen is tall, and within its length', () => {
    const wide = screen.w >= screen.h;
    expect(plan.tabSide).toBe(wide ? 'right' : 'top');
    const { panel } = plan;
    for (const t of plan.tabs) {
      if (wide) {
        expect(
          px(t.x - (panel.x + panel.w)),
          `the ${t.id} tab is this far from the glass, in CSS pixels`,
        ).toBeGreaterThanOrEqual(0);
        expect(px(t.x - (panel.x + panel.w))).toBeLessThanOrEqual(6);
        expect(t.y).toBeGreaterThanOrEqual(panel.y);
        expect(t.y + t.h).toBeLessThanOrEqual(panel.y + panel.h);
      } else {
        expect(
          px(panel.y - (t.y + t.h)),
          `the ${t.id} tab is this far from the glass, in CSS pixels`,
        ).toBeGreaterThanOrEqual(0);
        expect(px(panel.y - (t.y + t.h))).toBeLessThanOrEqual(6);
        expect(t.x).toBeGreaterThanOrEqual(panel.x);
        expect(t.x + t.w).toBeLessThanOrEqual(panel.x + panel.w);
      }
    }
  });

  it('has tabs that are clear of each other and of the keys, the buttons and the glass, with room for a thumb between them', () => {
    for (const [i, a] of plan.tabs.entries()) {
      expect(meets(box(a), box(plan.keys)), `${a.id} and the keys`).toBe(false);
      expect(meets(box(a), box(plan.panel)), `${a.id} and the glass`).toBe(false);
      for (const b of plan.buttons) expect(meets(box(a), disc(b)), `${a.id} and ${b.id}`).toBe(false);
      for (const b of plan.tabs.slice(i + 1)) {
        expect(meets(box(a), box(b)), `${a.id} and ${b.id}`).toBe(false);
        const apart = screen.w >= screen.h ? b.y - (a.y + a.h) : b.x - (a.x + a.w);
        expect(px(apart), `${a.id} and ${b.id}, in CSS pixels`).toBeGreaterThanOrEqual(6 - 1e-6);
      }
    }
  });

  it('puts a tile where the tile box says, and every tile in the grid', () => {
    const first = tileBox(plan, 0, 0);
    const last = tileBox(plan, SIZE - 1, SIZE - 1);
    expect(first).toEqual({ x: plan.grid.x, y: plan.grid.y, w: plan.grid.tw, h: plan.grid.th });
    expect(last.x + last.w).toBeCloseTo(plan.grid.x + plan.grid.w, 9);
    expect(last.y + last.h).toBeCloseTo(plan.grid.y + plan.grid.h, 9);
  });
});

describe('finding a tab', () => {
  for (const screen of SCREENS) {
    const plan = planOf(screen);

    it(`finds the one a point in the middle of it is on, on ${screen.name}`, () => {
      for (const t of plan.tabs) expect(tabAt(plan, t.x + t.w / 2, t.y + t.h / 2, 0)?.id).toBe(t.id);
    });

    it(`finds none for a point on the glass, on a key or on a button, on ${screen.name}`, () => {
      expect(tabAt(plan, plan.grid.x + plan.grid.w / 2, plan.grid.y + plan.grid.h / 2, 0)).toBeNull();
      expect(tabAt(plan, plan.keys.x + plan.keys.w / 2, plan.keys.y + plan.keys.h / 2, 0)).toBeNull();
      for (const b of plan.buttons) expect(tabAt(plan, b.x, b.y, 0)).toBeNull();
    });
  }

  it('allows a little to spare around a tab, and no more, and does not mix two tabs up when the spare reaches both', () => {
    const plan = planOf(SCREENS[0]!);
    const [a, b] = plan.tabs as [(typeof plan.tabs)[number], (typeof plan.tabs)[number]];
    expect(tabAt(plan, a.x + a.w + 3, a.y + a.h / 2, 0)).toBeNull();
    expect(tabAt(plan, a.x + a.w + 3, a.y + a.h / 2, 5)?.id).toBe(a.id);
    const between = { x: a.x + a.w / 2, y: (a.y + a.h + b.y) / 2 - 1 };
    expect(tabAt(plan, between.x, between.y, 30)?.id, 'nearer the first').toBe(a.id);
    expect(tabAt(plan, between.x, between.y + 2, 30)?.id, 'nearer the second').toBe(b.id);
    expect(tabAt(plan, 1e6, 1e6, 5)).toBeNull();
  });
});

describe('finding a button', () => {
  const plan = planOf(SCREENS[0]!);

  it('finds the one a point is on, and the nearest when a finger is between two', () => {
    for (const b of plan.buttons) expect(buttonAt(plan, b.x, b.y, 0)?.id).toBe(b.id);
    const [a, b] = plan.buttons as [(typeof plan.buttons)[number], (typeof plan.buttons)[number]];
    const between = { x: (a.x + b.x) / 2 + (b.x - a.x) * 0.1, y: (a.y + b.y) / 2 + (b.y - a.y) * 0.1 };
    expect(buttonAt(plan, between.x, between.y, 20)?.id).toBe(b.id);
  });

  it('allows a little to spare around a button, and no more', () => {
    const b = plan.buttons[0]!;
    expect(buttonAt(plan, b.x + b.r + 3, b.y, 0)).toBeNull();
    expect(buttonAt(plan, b.x + b.r + 3, b.y, 5)?.id).toBe(b.id);
    expect(buttonAt(plan, 1e6, 1e6, 5)).toBeNull();
  });
});

describe('the layout when the screen is held the other way', () => {
  it('puts the buttons in a row on a tall screen and in a column on a wide one, and the tabs the same way', () => {
    const tall = planOf(SCREENS.find((s) => s.name === 'a phone held upright')!);
    const wide = planOf(SCREENS.find((s) => s.name === 'a phone held sideways')!);
    expect(new Set(tall.buttons.map((b) => Math.round(b.y))).size, 'one row').toBe(1);
    expect(new Set(wide.buttons.map((b) => Math.round(b.x))).size, 'one column').toBe(1);
    expect(new Set(tall.tabs.map((t) => Math.round(t.y))).size, 'one row of tabs').toBe(1);
    expect(new Set(wide.tabs.map((t) => Math.round(t.x))).size, 'one column of tabs').toBe(1);
    expect(wide.keys.x).toBeGreaterThan(wide.buttons[0]!.x);
    expect(tall.keys.x).toBeLessThan(tall.grid.x);
  });
});
