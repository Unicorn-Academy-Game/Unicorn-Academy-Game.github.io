// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import { COLORS, css, darken, lighten, mix } from '../../engine/color';
import { clamp, lerp } from '../../engine/ease';
import { glowAt, roundedRect } from '../../engine/paint';
import type { Painter } from '../../engine/painter';
import { ACCENT, type Art } from './art';
import type { Board } from './board';
import type { Plan, Tab } from './layout';
import { PART_IDS, type PartId } from './parts';
import { SIZE } from './scale';

const INK = [38, 24, 61] as const;
/**
 * How far the tab that is chosen comes out from the glass, in CSS pixels, and how far it is let
 * into it, so that the two are one piece.
 */
const COMES_OUT = 4;
const LET_IN = 1.6;

/**
 * A rectangle with a radius for each corner, as a path: top left, top right, bottom right, bottom
 * left.
 */
function outline(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  [tl, tr, br, bl]: readonly [number, number, number, number],
): void {
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  g.arcTo(x + w, y, x + w, y + tr, tr);
  g.lineTo(x + w, y + h - br);
  g.arcTo(x + w, y + h, x + w - br, y + h, br);
  g.lineTo(x + bl, y + h);
  g.arcTo(x, y + h, x, y + h - bl, bl);
  g.lineTo(x, y + tl);
  g.arcTo(x, y, x + tl, y, tl);
  g.closePath();
}

/**
 * The glass takes the colour of the part that is on it: a rim of that colour that fades in as the
 * part is chosen and out as another is, so that the glass and the tab that stands against it are
 * one thing.
 */
export function paintRimTint(g: CanvasRenderingContext2D, plan: Plan, boards: Readonly<Record<PartId, Board>>): void {
  const { panel } = plan;
  g.lineWidth = 2;
  for (const id of PART_IDS) {
    const focus = boards[id].focus;
    if (focus < 0.01) continue;
    roundedRect(g, panel.x, panel.y, panel.w, panel.h, panel.radius);
    g.strokeStyle = css(lighten(ACCENT[id], 0.15), 0.62 * focus);
    g.stroke();
  }
}

/**
 * One tab: the part's picture on a chip that stands against the glass, and a row of sixteen small
 * lights that run with the loop.
 */
function paintTab(
  p: Painter,
  plan: Plan,
  art: Art,
  tab: Tab,
  board: Board,
  invite: number,
  time: number,
  px: number,
): void {
  const g = p.ctx;
  const accent = ACCENT[tab.id];
  const f = board.focus;
  const side = plan.tabSide;
  // The tab that is chosen comes out from the glass and is let into it, so that the glass seems to
  // have grown it.
  const out = COMES_OUT * px * f;
  const gap = side === 'right' ? tab.x - (plan.panel.x + plan.panel.w) : plan.panel.y - (tab.y + tab.h);
  const into = (gap + LET_IN * px) * f;
  const x = side === 'right' ? tab.x - into : tab.x;
  const y = side === 'top' ? tab.y - out : tab.y;
  const w = side === 'right' ? tab.w + out + into : tab.w;
  const h = side === 'top' ? tab.h + out + into : tab.h;
  const r = Math.min(tab.w, tab.h) * 0.24;
  const rs = r * (1 - f);
  const corners: readonly [number, number, number, number] = side === 'right' ? [rs, r, r, rs] : [r, r, rs, rs];
  const bump = 1 + 0.2 * board.pulse + 0.06 * f;

  // The chip: dark, as the glass is, and the colour of the part where it is chosen.
  g.beginPath();
  outline(g, x, y, w, h, corners);
  const dark = g.createLinearGradient(0, y, 0, y + h);
  dark.addColorStop(0, 'rgba(26,18,70,0.92)');
  dark.addColorStop(1, 'rgba(10,7,36,0.95)');
  g.fillStyle = dark;
  g.fill();
  if (f > 0.01) {
    const lit = g.createLinearGradient(0, y, 0, y + h);
    lit.addColorStop(0, css(lighten(accent, 0.42)));
    lit.addColorStop(0.5, css(accent));
    lit.addColorStop(1, css(darken(accent, 0.22)));
    g.globalAlpha = clamp(f);
    g.fillStyle = lit;
    g.fill();
    g.globalAlpha = 1;
  }
  g.lineWidth = Math.max(1.2, 1.6 * px);
  g.strokeStyle = css(lighten(accent, 0.2), lerp(0.5 + 0.35 * invite, 0.95, f));
  if (f < 0.99) {
    g.globalAlpha = 1 - f;
    g.stroke();
    g.globalAlpha = 1;
  }
  if (f > 0.01) {
    // Once it is chosen its outline is open on the side that is against the glass, where it is one
    // with it.
    g.beginPath();
    if (side === 'right') {
      g.moveTo(x, y);
      g.lineTo(x + w - r, y);
      g.arcTo(x + w, y, x + w, y + r, r);
      g.lineTo(x + w, y + h - r);
      g.arcTo(x + w, y + h, x + w - r, y + h, r);
      g.lineTo(x, y + h);
    } else {
      g.moveTo(x, y + h);
      g.lineTo(x, y + r);
      g.arcTo(x, y, x + r, y, r);
      g.lineTo(x + w - r, y);
      g.arcTo(x + w, y, x + w, y + r, r);
      g.lineTo(x + w, y + h);
    }
    g.globalAlpha = clamp(f);
    g.strokeStyle = css(lighten(accent, 0.55), 0.95);
    g.stroke();
    g.globalAlpha = 1;
  }

  // Where the picture and the lights go: the picture in the middle of what is left over above the
  // lights.
  const cx = tab.x + tab.w / 2;
  const led = clamp(tab.w * 0.052, 1.6, 3.4);
  const stripW = tab.w - 2 * Math.max(5 * px, tab.w * 0.1);
  const stripY = tab.y + tab.h - Math.max(7 * px, tab.h * 0.13) - led;
  const room = stripY - tab.y;
  const iconSize = art.icon * bump;
  const iconY = tab.y + room / 2 - iconSize / 2 + 1 * px;
  g.globalAlpha = clamp(1 - f);
  g.drawImage(art.icons[tab.id].colored, cx - iconSize / 2, iconY, iconSize, iconSize);
  g.globalAlpha = clamp(f);
  g.drawImage(art.icons[tab.id].inked, cx - iconSize / 2, iconY, iconSize, iconSize);
  g.globalAlpha = 1;

  // Sixteen lights, one for each step: lit where the part has a note, and flashing as the loop goes
  // over them.
  const slot = stripW / SIZE;
  const ink = mix(accent, INK, f);
  for (let step = 0; step < SIZE; step++) {
    const has = board.grid.inStep(step) > 0;
    const flash = board.sweep[step]!;
    const alpha = clamp((has ? 0.62 : 0.17) + 0.45 * flash);
    g.fillStyle = css(mix(ink, COLORS.white, clamp(flash * (has ? 0.7 : 0.35))), alpha);
    g.beginPath();
    const lx = cx - stripW / 2 + step * slot + slot * 0.17;
    g.rect(lx, stripY, slot * 0.66, led);
    g.fill();
  }

  // The light the part throws as it plays, and a breath of light on a tab the player has not opened
  // yet.
  const glow = 0.38 * board.pulse + 0.2 * f + invite * (0.12 + 0.1 * Math.sin(time * 3.2));
  if (glow > 0.01 && p.light !== g)
    glowAt(p.light, tab.x + tab.w / 2, tab.y + tab.h / 2, Math.max(tab.w, tab.h) * 1.7, accent, glow);
}

/**
 * The three tabs. `invite` is how much a tab the player has not opened yet calls to them, from 0 to
 * 1, for each part, and `time` is what its breath goes by, so a time that does not move holds the
 * breath still, as calm does. `px` is the size of a CSS pixel in the game's units.
 */
export function paintTabs(
  p: Painter,
  plan: Plan,
  art: Art,
  boards: Readonly<Record<PartId, Board>>,
  invite: Readonly<Record<PartId, number>>,
  time: number,
  px: number,
): void {
  for (const tab of plan.tabs) paintTab(p, plan, art, tab, boards[tab.id], invite[tab.id], time, px);
}
