// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import { chromeOf, type Screen } from '../../engine/chrome';
import { clamp } from '../../engine/ease';
import { PART_IDS, type PartId } from './parts';
import { SIZE } from './scale';

/** The four buttons, in the order they are laid out: a new tune, clear, quicker and slower. */
export const BUTTON_IDS = ['wand', 'broom', 'hare', 'turtle'] as const;
export type ButtonId = (typeof BUTTON_IDS)[number];

/** A round button: where its middle is and how big. */
export interface Button {
  readonly id: ButtonId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A rectangle by its corner and size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The tab of a part: the box a finger chooses it by. */
export interface Tab extends Box {
  readonly id: PartId;
}

/** Where everything is, in the game's own units. */
export interface Plan {
  readonly w: number;
  readonly h: number;
  /** The 16 by 16 tiles. `tw` and `th` are the width and height of one. */
  readonly grid: Box & { readonly tw: number; readonly th: number };
  /** The dark glass the tiles are set in, a little bigger than they are. */
  readonly panel: Box & { readonly radius: number };
  /**
   * The column of 16 keys beside the tiles, the top one the highest. `th` is the height of one, the
   * same as a row of tiles.
   */
  readonly keys: Box & { readonly th: number };
  readonly buttons: readonly Button[];
  /**
   * The three tabs, one for each part, in the order of the parts. They stand against the glass, on
   * its right side when the screen is wide and above it when it is tall.
   */
  readonly tabs: readonly Tab[];
  /** Which edge of the glass the tabs stand against. */
  readonly tabSide: 'right' | 'top';
  /**
   * How far past a tile the player's finger may be and still be on the grid, so that the edge rows
   * and steps are as easy as the rest.
   */
  readonly slack: number;
}

/**
 * How much taller or wider than the other way a tile may be. A tile is a rounded box, not a bar.
 */
const MAX_ASPECT = 1.7;

/** The smallest button, in CSS pixels, which is the smallest a thumb is sure to hit. */
const BUTTON_MIN = 46;
const BUTTON_MAX = 58;
/**
 * How wide a tab is when the screen is wide, and how high when it is tall, in CSS pixels, and how
 * much taller than that the tab is the other way.
 */
const TAB_MIN = 48;
const TAB_MAX = 64;
const TAB_LONG = 1.4;

/**
 * Lays the game out on a screen of this size. The tiles are as big as the room allows and are never
 * put under what the page draws over the game: the way out, the buttons in the corner and the room
 * that the other games give to their stars and to the again and done buttons. That room stays empty
 * here, which leaves a margin for a thumb at the foot of a tall screen. On a wide screen the keys
 * and the buttons stand to the left of the tiles, and on a tall one the keys stand to the left and
 * the buttons in a row under them. The tabs of the three parts stand against the glass like the
 * tabs of a folder: in a column on its right when the screen is wide, and in a row above it when
 * the screen is tall.
 */
export function planOf(screen: Screen): Plan {
  const px = (n: number): number => n / screen.unit;
  const chrome = chromeOf(screen);
  const { w, h } = screen;
  const pad = px(8);
  const panelPad = px(5);
  const gapKeys = px(6);
  const gapButtons = px(8);
  const gapTab = px(4);
  const gapTabs = px(8);
  const radius = px(10);
  const top = Math.max(chrome.wayOut.y1, chrome.meter.y1, chrome.corner.y1) + px(6);
  const wide = w >= h;
  const count = BUTTON_IDS.length;

  // How big the buttons are comes from how big the tiles are, so a tablet has bigger ones than a
  // phone, but never too small to hit.
  const buttonFor = (th: number): number => clamp(th * 1.2, px(BUTTON_MIN), px(BUTTON_MAX));
  const keyFor = (th: number): number => clamp(th * 0.95, px(20), px(34));

  if (wide) {
    const th = (h - pad - top - 2 * panelPad) / SIZE;
    const button = buttonFor(th);
    const keyW = keyFor(th);
    const gapColumn = px(10);
    const tabW = clamp(th * 1.6, px(TAB_MIN), px(TAB_MAX));
    const panelH = SIZE * th + 2 * panelPad;
    const tabH = Math.min(
      tabW * TAB_LONG,
      (panelH - 2 * radius - 2 * px(6) - (PART_IDS.length - 1) * gapTabs) / PART_IDS.length,
    );
    // The tiles stop short of the room that the other games give to their again and done buttons,
    // which here is a margin.
    const right = chrome.finish.x0 - pad;
    const room = right - pad - button - gapColumn - keyW - gapKeys - 2 * panelPad - gapTab - tabW;
    const tw = Math.min(room / SIZE, th * MAX_ASPECT);
    const total = button + gapColumn + keyW + gapKeys + 2 * panelPad + SIZE * tw + gapTab + tabW;
    const left = pad + Math.max(0, (right - pad - total) / 2);
    const gridX = left + button + gapColumn + keyW + gapKeys + panelPad;
    const gridY = top + panelPad;
    const column = count * button + (count - 1) * gapButtons;
    const first = top + Math.max(0, (h - pad - top - column) / 2);
    const panel = { x: gridX - panelPad, y: gridY - panelPad, w: SIZE * tw + 2 * panelPad, h: panelH, radius };
    return {
      w,
      h,
      grid: { x: gridX, y: gridY, w: SIZE * tw, h: SIZE * th, tw, th },
      panel,
      keys: { x: left + button + gapColumn, y: gridY, w: keyW, h: SIZE * th, th },
      buttons: BUTTON_IDS.map((id, i) => ({
        id,
        x: left + button / 2,
        y: first + button / 2 + i * (button + gapButtons),
        r: button / 2,
      })),
      tabs: PART_IDS.map((id, i) => ({
        id,
        x: panel.x + panel.w + gapTab,
        y: panel.y + radius + px(6) + i * (tabH + gapTabs),
        w: tabW,
        h: tabH,
      })),
      tabSide: 'right',
      slack: Math.min(panelPad, tw / 2),
    };
  }

  // Tall: the tabs are a row above the glass, the buttons are a row above the place the again and
  // done buttons come to, and the tiles have the rest of the height.
  const keyW0 = keyFor(px(30));
  const twFull = (w - 2 * pad - keyW0 - gapKeys - 2 * panelPad) / SIZE;
  const button = buttonFor(twFull);
  const tabH = clamp(twFull * 2.4, px(TAB_MIN - 2), px(TAB_MAX - 8));
  const rowBottom = chrome.finish.y0 - pad;
  const rowTop = rowBottom - button;
  const shelf = top + tabH + gapTab;
  const thMax = (rowTop - pad - shelf - 2 * panelPad) / SIZE;
  const th = Math.min(thMax, twFull * MAX_ASPECT);
  const keyW = keyFor(th);
  const tw = (w - 2 * pad - keyW - gapKeys - 2 * panelPad) / SIZE;
  const gridH = SIZE * th;
  // What is left over above the buttons goes above and below the tiles equally, and the tabs go
  // with the glass.
  const gridY = shelf + panelPad + Math.max(0, (rowTop - pad - shelf - 2 * panelPad - gridH) / 2);
  const gridX = pad + keyW + gapKeys + panelPad;
  const row = count * button + (count - 1) * gapButtons;
  const rowLeft = (w - row) / 2;
  const panel = {
    x: gridX - panelPad,
    y: gridY - panelPad,
    w: SIZE * tw + 2 * panelPad,
    h: gridH + 2 * panelPad,
    radius,
  };
  const tabW = Math.min(px(TAB_MAX * 2), (panel.w - 2 * radius - (PART_IDS.length - 1) * gapTabs) / PART_IDS.length);
  const tabsLeft = panel.x + (panel.w - (PART_IDS.length * tabW + (PART_IDS.length - 1) * gapTabs)) / 2;
  return {
    w,
    h,
    grid: { x: gridX, y: gridY, w: SIZE * tw, h: gridH, tw, th },
    panel,
    keys: { x: pad, y: gridY, w: keyW, h: gridH, th },
    buttons: BUTTON_IDS.map((id, i) => ({
      id,
      x: rowLeft + button / 2 + i * (button + gapButtons),
      y: rowTop + button / 2,
      r: button / 2,
    })),
    tabs: PART_IDS.map((id, i) => ({
      id,
      x: tabsLeft + i * (tabW + gapTabs),
      y: panel.y - gapTab - tabH,
      w: tabW,
      h: tabH,
    })),
    tabSide: 'top',
    slack: Math.min(panelPad, tw / 2),
  };
}

/** The box of one tile, before the gap between tiles is taken from it. */
export function tileBox(plan: Plan, x: number, y: number): Box {
  const { grid } = plan;
  return { x: grid.x + x * grid.tw, y: grid.y + y * grid.th, w: grid.tw, h: grid.th };
}

/** The box of the key of a row, counted from the top. */
export function keyBox(plan: Plan, y: number): Box {
  return { x: plan.keys.x, y: plan.keys.y + y * plan.keys.th, w: plan.keys.w, h: plan.keys.th };
}

/**
 * The button a point is on, with a little to spare so that a finger that is a little off still has
 * it, or none.
 */
export function buttonAt(plan: Plan, x: number, y: number, spare: number): Button | null {
  let best: Button | null = null;
  let nearest = Infinity;
  for (const b of plan.buttons) {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d <= b.r + spare && d < nearest) {
      nearest = d;
      best = b;
    }
  }
  return best;
}

/**
 * The tab a point is on, with a little to spare so that a finger that is a little off still has it,
 * or none.
 */
export function tabAt(plan: Plan, x: number, y: number, spare: number): Tab | null {
  let best: Tab | null = null;
  let nearest = Infinity;
  for (const t of plan.tabs) {
    if (x < t.x - spare || x > t.x + t.w + spare || y < t.y - spare || y > t.y + t.h + spare) continue;
    const d = Math.hypot(x - (t.x + t.w / 2), y - (t.y + t.h / 2));
    if (d < nearest) {
      nearest = d;
      best = t;
    }
  }
  return best;
}
