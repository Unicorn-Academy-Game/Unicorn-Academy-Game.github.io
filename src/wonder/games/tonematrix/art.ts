// SPDX-License-Identifier: GPL-3.0-only
// Written for this game to go with the adapted files of ToneMatrix Redux (https://github.com/lupine-dev/ToneMatrixRedux), Copyright (c) Wolfy, under
// the GNU General Public License version 3 only. See `src/wonder/games/tonematrix/NOTICE.md`.

import { COLORS, css, darken, lighten, mix, type RGB } from '../../engine/color';
import { clamp, TAU } from '../../engine/ease';
import { addRoundedRect, prerender } from '../../engine/paint';
import type { ButtonId, Plan } from './layout';
import { PART_IDS, type PartId } from './parts';
import { PALETTE } from './scale';

/** The pictures the game stamps, made once for the size of the screen it is on. */
export interface Art {
  /**
   * A tile of each part in each of the five colours at full strength. How bright one looks is how
   * much of it is drawn.
   */
  readonly tiles: Readonly<Record<PartId, readonly HTMLCanvasElement[]>>;
  /** A white tile of the shape of each part, drawn over a tile to flash it. */
  readonly flashes: Readonly<Record<PartId, HTMLCanvasElement>>;
  /**
   * The small light that stands for a tile of a part that is not on the glass, in each of the five
   * colours.
   */
  readonly ghosts: readonly HTMLCanvasElement[];
  /** One step of the tail of a note that is held, in each of the five colours. */
  readonly tails: readonly HTMLCanvasElement[];
  /** A key in each of the five colours. */
  readonly keys: readonly HTMLCanvasElement[];
  readonly buttons: Readonly<Record<ButtonId, HTMLCanvasElement>>;
  /**
   * What stands on each tab: a picture of the part, in its colour for a tab that is dark, and in
   * ink for a tab that is lit.
   */
  readonly icons: Readonly<Record<PartId, { readonly colored: HTMLCanvasElement; readonly inked: HTMLCanvasElement }>>;
  /** The size of a tile's picture and of a key's, in units: a tile less the gap between tiles. */
  readonly tile: { readonly w: number; readonly h: number };
  readonly key: { readonly w: number; readonly h: number };
  /** The size of the picture on a tab, in units, a square. */
  readonly icon: number;
  /** The size of the small light of a part that is not on the glass, in units, a square. */
  readonly ghost: number;
  /** The size of a step of the tail of a held note, in units. */
  readonly tail: { readonly w: number; readonly h: number };
}

/**
 * The colour of each part, for its tab, the rim of the glass when it is chosen, and the lights that
 * show it is playing. The colours of the notes stay the colours of the notes.
 */
export const ACCENT: Readonly<Record<PartId, RGB>> = { melody: COLORS.magenta, beat: COLORS.amber, bass: COLORS.cyan };

const INK: RGB = [38, 24, 61];
const CREAM: RGB = COLORS.cream;

/**
 * Pictures are made at this many pixels to the unit, which is as sharp as the screen is, and no
 * sharper than the game ever draws.
 */
const sharpness = (unit: number): number => clamp(unit * 2, 1, 4);

/**
 * The gap between two tiles, in units: a tenth of the smaller side, never less than a unit nor more
 * than three.
 */
const gapOf = (plan: Plan): number => clamp(Math.min(plan.grid.tw, plan.grid.th) * 0.1, 1, 3);

/**
 * Adds the outline of a tile of a part to the path: a rounded square for the melody, a round pad
 * for the beat, and a bar with round ends for the bass.
 */
const SHAPES: Readonly<Record<PartId, (g: CanvasRenderingContext2D, w: number, h: number, inset: number) => void>> = {
  melody: (g, w, h, inset) =>
    addRoundedRect(g, inset, inset, w - 2 * inset, h - 2 * inset, Math.max(0, Math.min(w, h) * 0.26 - inset)),
  beat: (g, w, h, inset) => {
    const r = Math.min(w, h) * 0.48 - inset;
    g.moveTo(w / 2 + r, h / 2);
    g.arc(w / 2, h / 2, Math.max(0, r), 0, TAU);
  },
  bass: (g, w, h, inset) => {
    const bar = h * 0.76 - 2 * inset;
    addRoundedRect(g, inset, (h - bar) / 2, w - 2 * inset, bar, bar / 2);
  },
};

function tileOf(part: PartId, color: RGB, w: number, h: number, scale: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      const fill = g.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, css(lighten(color, 0.3)));
      fill.addColorStop(0.5, css(color));
      fill.addColorStop(1, css(darken(color, 0.2)));
      g.fillStyle = fill;
      g.beginPath();
      SHAPES[part](g, w, h, 0);
      g.fill();
      g.strokeStyle = css(lighten(color, 0.7), 0.55);
      g.lineWidth = Math.max(0.7, Math.min(w, h) * 0.05);
      g.beginPath();
      SHAPES[part](g, w, h, g.lineWidth / 2);
      g.stroke();
      if (part === 'beat') {
        // The skin of a drum: a ring a little in from the rim, and a gloss on the upper left.
        const r = Math.min(w, h) * 0.48;
        g.strokeStyle = css(darken(color, 0.35), 0.45);
        g.lineWidth = Math.max(0.6, r * 0.09);
        g.beginPath();
        g.arc(w / 2, h / 2, r * 0.62, 0, TAU);
        g.stroke();
        g.fillStyle = css(COLORS.white, 0.38);
        g.beginPath();
        g.ellipse(w / 2 - r * 0.3, h / 2 - r * 0.42, r * 0.3, r * 0.15, -0.6, 0, TAU);
        g.fill();
      } else if (part === 'bass') {
        // A string's gleam along the top of the bar.
        const bar = h * 0.76;
        g.strokeStyle = css(COLORS.white, 0.38);
        g.lineWidth = Math.max(0.6, bar * 0.1);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(bar * 0.5, (h - bar) / 2 + bar * 0.27);
        g.lineTo(w - bar * 0.5, (h - bar) / 2 + bar * 0.27);
        g.stroke();
      }
    },
    scale,
  );
}

/**
 * One step of the tail of a held note: a thin bar the width of a tile, of the colour of the note.
 */
function tailOf(color: RGB, w: number, h: number, scale: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      const fill = g.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, css(lighten(color, 0.25)));
      fill.addColorStop(1, css(darken(color, 0.15)));
      g.fillStyle = fill;
      g.beginPath();
      addRoundedRect(g, 0, 0, w, h, h * 0.45);
      g.fill();
    },
    scale,
  );
}

function whiteOf(part: PartId, w: number, h: number, scale: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      g.fillStyle = '#fff';
      g.beginPath();
      SHAPES[part](g, w, h, 0);
      g.fill();
    },
    scale,
  );
}

/**
 * The small light of a part that is on one of the other tabs: a soft disc in the colour of its
 * note.
 */
function ghostOf(color: RGB, size: number, scale: number): HTMLCanvasElement {
  return prerender(
    size,
    size,
    (g, w) => {
      const r = w / 2;
      const body = g.createRadialGradient(r, r, 0, r, r, r);
      body.addColorStop(0, css(lighten(color, 0.55)));
      body.addColorStop(0.6, css(color));
      body.addColorStop(1, css(color, 0));
      g.fillStyle = body;
      g.beginPath();
      g.arc(r, r, r, 0, TAU);
      g.fill();
    },
    scale,
  );
}

function keyOf(color: RGB, w: number, h: number, scale: number): HTMLCanvasElement {
  return prerender(
    w,
    h,
    (g) => {
      const r = Math.min(w, h) * 0.34;
      const fill = g.createLinearGradient(0, 0, w, 0);
      fill.addColorStop(0, css(darken(color, 0.12)));
      fill.addColorStop(0.55, css(color));
      fill.addColorStop(1, css(lighten(color, 0.4)));
      g.fillStyle = fill;
      g.beginPath();
      addRoundedRect(g, 0, 0, w, h, r);
      g.fill();
      g.strokeStyle = css(lighten(color, 0.7), 0.5);
      g.lineWidth = Math.max(0.7, h * 0.07);
      g.beginPath();
      const inset = g.lineWidth / 2;
      addRoundedRect(g, inset, inset, w - 2 * inset, h - 2 * inset, r - inset);
      g.stroke();
    },
    scale,
  );
}

/** A star with `n` points, outer radius `big` and inner radius `small`, one point up. */
function star(g: CanvasRenderingContext2D, x: number, y: number, big: number, small: number, n = 5): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? big : small;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** A glint with four points that curve in. */
function glint(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.closePath();
}

const ellipse = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void => {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
};

/** A wand with a gold star on the end and glints around it. Drawn in a box of 64 by 64. */
function wand(g: CanvasRenderingContext2D): void {
  g.lineCap = 'round';
  const stick = g.createLinearGradient(12, 54, 42, 24);
  stick.addColorStop(0, css(COLORS.white));
  stick.addColorStop(1, css([196, 170, 255]));
  g.strokeStyle = stick;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(14, 52);
  g.lineTo(40, 26);
  g.stroke();
  g.strokeStyle = css(COLORS.gold);
  g.beginPath();
  g.moveTo(14, 52);
  g.lineTo(19, 47);
  g.stroke();
  const gold = g.createLinearGradient(36, 6, 56, 34);
  gold.addColorStop(0, css(lighten(COLORS.gold, 0.55)));
  gold.addColorStop(1, css(COLORS.amber));
  g.fillStyle = gold;
  star(g, 46, 20, 15, 6.6);
  g.fill();
  g.lineJoin = 'round';
  g.strokeStyle = css(CREAM);
  g.lineWidth = 1.8;
  g.stroke();
  g.fillStyle = css(COLORS.white);
  glint(g, 17, 17, 6.5);
  g.fill();
  glint(g, 56, 48, 4.5);
  g.fill();
  g.fillStyle = css(lighten(COLORS.pink, 0.3));
  glint(g, 30, 8, 3.2);
  g.fill();
}

/**
 * A broom with red binding and golden straw, leaning, and a little dust. Drawn in a box of 64 by
 * 64.
 */
function broom(g: CanvasRenderingContext2D): void {
  g.lineCap = 'round';
  g.strokeStyle = css([226, 170, 108]);
  g.lineWidth = 5.5;
  g.beginPath();
  g.moveTo(50, 6);
  g.lineTo(33, 34);
  g.stroke();
  g.save();
  g.translate(33, 34);
  g.rotate(Math.atan2(17, 28));
  const straw = g.createLinearGradient(0, 4, 0, 27);
  straw.addColorStop(0, css(COLORS.amber));
  straw.addColorStop(1, css(lighten(COLORS.gold, 0.35)));
  g.fillStyle = straw;
  g.beginPath();
  g.moveTo(-8, 5);
  g.lineTo(8, 5);
  g.lineTo(14, 26);
  g.quadraticCurveTo(0, 29.5, -14, 26);
  g.closePath();
  g.fill();
  g.strokeStyle = css(darken(COLORS.amber, 0.3), 0.75);
  g.lineWidth = 1.4;
  g.beginPath();
  for (const k of [-0.6, -0.2, 0.2, 0.6]) {
    g.moveTo(k * 8, 8);
    g.lineTo(k * 13, 26.5);
  }
  g.stroke();
  g.fillStyle = css(COLORS.red);
  g.beginPath();
  addRoundedRect(g, -9.5, -1, 19, 7, 2.6);
  g.fill();
  g.restore();
  g.fillStyle = css(COLORS.white, 0.85);
  for (const [x, y, r] of [
    [13, 53, 2.6],
    [22, 58, 1.8],
    [8, 45, 1.6],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.fillStyle = css(COLORS.white);
  glint(g, 12, 22, 5);
  g.fill();
}

/** A turtle, walking right, for going slower. Drawn in a box of 64 by 64. */
function turtle(g: CanvasRenderingContext2D): void {
  const skin = lighten(COLORS.mint, 0.1);
  g.fillStyle = css(skin);
  g.beginPath();
  addRoundedRect(g, 15, 43, 10, 11, 4);
  addRoundedRect(g, 38, 43, 10, 11, 4);
  addRoundedRect(g, 42, 30, 11, 14, 5);
  g.fill();
  g.beginPath();
  g.moveTo(11, 42);
  g.lineTo(19, 37);
  g.lineTo(19, 46);
  g.closePath();
  g.fill();
  ellipse(g, 54, 34, 8.6, 7.6);
  g.fill();
  g.fillStyle = css(INK);
  ellipse(g, 57, 32, 1.8, 2);
  g.fill();
  g.strokeStyle = css(INK, 0.75);
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(58, 36, 3, 0.3, 1.5);
  g.stroke();
  const shell = g.createLinearGradient(0, 22, 0, 46);
  shell.addColorStop(0, css(lighten(COLORS.lime, 0.2)));
  shell.addColorStop(1, css(darken(COLORS.green, 0.1)));
  g.fillStyle = shell;
  g.beginPath();
  g.moveTo(8, 46);
  g.bezierCurveTo(8, 22, 24, 17, 31, 17);
  g.bezierCurveTo(40, 17, 54, 24, 54, 46);
  g.closePath();
  g.fill();
  g.strokeStyle = css(darken(COLORS.green, 0.35), 0.8);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(31, 18);
  g.lineTo(31, 46);
  g.moveTo(20, 46);
  g.quadraticCurveTo(20, 30, 28, 23);
  g.moveTo(42, 46);
  g.quadraticCurveTo(42, 30, 34, 23);
  g.moveTo(10, 36);
  g.lineTo(52, 36);
  g.stroke();
  g.fillStyle = css(darken(COLORS.green, 0.15));
  g.beginPath();
  addRoundedRect(g, 6, 44, 50, 5, 2.5);
  g.fill();
}

/**
 * A hare in mid-leap, going right, with speed lines behind it, for going quicker. Drawn in a box of
 * 64 by 64.
 */
function hare(g: CanvasRenderingContext2D): void {
  const fur = CREAM;
  g.fillStyle = css(fur);
  for (const [x, y, rx, ry, rot] of [
    [22, 50, 11, 4.6, -0.2],
    [43, 51, 8, 3.8, 0.25],
    [30, 41, 19, 10.5, -0.14],
  ] as const) {
    ellipse(g, x, y, rx, ry, rot);
    g.fill();
  }
  g.fillStyle = css(COLORS.white);
  g.beginPath();
  g.arc(11, 36, 5.6, 0, TAU);
  g.fill();
  g.fillStyle = css(fur);
  for (const [x, y, rot] of [
    [45, 14, 0.28],
    [54, 15, 0.08],
  ] as const) {
    ellipse(g, x, y, 3.8, 12, rot);
    g.fill();
    g.fillStyle = css(COLORS.pink);
    ellipse(g, x, y + 1, 1.7, 8, rot);
    g.fill();
    g.fillStyle = css(fur);
  }
  ellipse(g, 49, 31, 9.8, 8.4, 0.1);
  g.fill();
  g.fillStyle = css(INK);
  ellipse(g, 52, 29, 1.8, 2.1);
  g.fill();
  g.fillStyle = css(COLORS.rose);
  ellipse(g, 57.5, 32.5, 1.6, 1.3);
  g.fill();
  g.strokeStyle = css(COLORS.white, 0.85);
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  for (const [x, y, len] of [
    [3, 44, 9],
    [1, 51, 7],
    [6, 29, 6],
  ] as const) {
    g.moveTo(x, y);
    g.lineTo(x + len, y);
  }
  g.stroke();
}

const ICONS: Readonly<Record<ButtonId, (g: CanvasRenderingContext2D) => void>> = { wand, broom, hare, turtle };

/**
 * The three colours a picture on a tab is drawn in: the body of it, the lines on it, and the light
 * on it.
 */
interface Inks {
  readonly body: RGB;
  readonly detail: RGB;
  readonly shine: RGB;
}

/** Two notes joined by a beam, for the melody. Drawn in a box of 64 by 64. */
function notePair(g: CanvasRenderingContext2D, c: Inks): void {
  g.fillStyle = css(c.body);
  const heads: readonly (readonly [number, number])[] = [
    [17, 49],
    [45, 43],
  ];
  for (const [x, y] of heads) {
    ellipse(g, x, y, 9.8, 7.2, -0.38);
    g.fill();
  }
  g.strokeStyle = css(c.body);
  g.lineWidth = 4.6;
  g.beginPath();
  g.moveTo(25.4, 46.5);
  g.lineTo(25.4, 13);
  g.moveTo(53.4, 40.5);
  g.lineTo(53.4, 7);
  g.stroke();
  g.beginPath();
  g.moveTo(23.1, 10);
  g.lineTo(55.7, 3.5);
  g.lineTo(55.7, 15.5);
  g.lineTo(23.1, 22);
  g.closePath();
  g.fill();
  g.fillStyle = css(c.shine, 0.75);
  for (const [x, y] of heads) {
    ellipse(g, x - 2.6, y - 2.2, 3.8, 1.9, -0.38);
    g.fill();
  }
}

/** A drum with a stick in each hand, for the beat. Drawn in a box of 64 by 64. */
function drum(g: CanvasRenderingContext2D, c: Inks): void {
  g.lineCap = 'round';
  g.strokeStyle = css(c.detail);
  g.lineWidth = 4.8;
  g.beginPath();
  g.moveTo(9, 7);
  g.lineTo(27, 26);
  g.moveTo(55, 7);
  g.lineTo(37, 26);
  g.stroke();
  g.fillStyle = css(c.detail);
  for (const [x, y] of [
    [9, 7],
    [55, 7],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 3.6, 0, TAU);
    g.fill();
  }
  g.fillStyle = css(c.body);
  g.beginPath();
  g.moveTo(8, 35);
  g.lineTo(8, 51);
  g.ellipse(32, 51, 24, 8.4, 0, Math.PI, 0, true);
  g.lineTo(56, 35);
  g.ellipse(32, 35, 24, 8.4, 0, 0, Math.PI, true);
  g.closePath();
  g.fill();
  g.fillStyle = css(c.shine, 0.9);
  ellipse(g, 32, 35, 24, 8.4);
  g.fill();
  g.strokeStyle = css(c.body);
  g.lineWidth = 2.4;
  ellipse(g, 32, 35, 20.5, 5.6);
  g.stroke();
  g.strokeStyle = css(c.detail, 0.85);
  g.lineWidth = 2.2;
  g.beginPath();
  for (const x of [14, 23, 32, 41, 50]) {
    g.moveTo(x - 4, 43.5);
    g.lineTo(x, 55.5);
    g.moveTo(x, 55.5);
    g.lineTo(x + 4, 43.5);
  }
  g.stroke();
}

/** A bass guitar, leaning, for the bass. Drawn in a box of 64 by 64. */
function bassGuitar(g: CanvasRenderingContext2D, c: Inks): void {
  g.save();
  g.translate(32, 33);
  g.rotate(0.62);
  g.translate(-32, -33);
  g.fillStyle = css(c.body);
  ellipse(g, 32, 42, 11.2, 9.2);
  g.fill();
  ellipse(g, 32, 53, 14.6, 10.4);
  g.fill();
  g.beginPath();
  addRoundedRect(g, 29, 4, 6, 44, 2);
  g.fill();
  g.beginPath();
  addRoundedRect(g, 27, 0, 10, 12, 3);
  g.fill();
  g.fillStyle = css(c.detail);
  for (const [x, y, w, h] of [
    [26, 44.5, 12, 3.4],
    [26, 50.5, 12, 3.4],
    [27.5, 57.5, 9, 2.6],
  ] as const) {
    g.beginPath();
    addRoundedRect(g, x, y, w, h, 1.2);
    g.fill();
  }
  g.fillStyle = css(c.shine, 0.9);
  for (const [x, y] of [
    [25.4, 3.6],
    [38.6, 3.6],
    [25.4, 8],
    [38.6, 8],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 1.5, 0, TAU);
    g.fill();
  }
  g.strokeStyle = css(c.shine, 0.85);
  g.lineWidth = 0.95;
  g.beginPath();
  for (const x of [30.2, 31.4, 32.6, 33.8]) {
    g.moveTo(x, 12);
    g.lineTo(x, 58);
  }
  g.stroke();
  g.restore();
}

const PICTURES: Readonly<Record<PartId, (g: CanvasRenderingContext2D, c: Inks) => void>> = {
  melody: notePair,
  beat: drum,
  bass: bassGuitar,
};

/**
 * A picture for a tab, in the colours of the part for a tab that is dark, or in ink for a tab that
 * is lit with the colour of the part.
 */
function iconOf(part: PartId, inked: boolean, size: number, scale: number): HTMLCanvasElement {
  const accent = ACCENT[part];
  const inks: Inks = inked
    ? { body: INK, detail: mix(INK, accent, 0.35), shine: mix(accent, COLORS.white, 0.5) }
    : { body: lighten(accent, 0.1), detail: lighten(accent, 0.55), shine: lighten(accent, 0.85) };
  return prerender(
    size,
    size,
    (g, w) => {
      g.save();
      g.scale(w / 64, w / 64);
      PICTURES[part](g, inks);
      g.restore();
    },
    scale,
  );
}

function buttonOf(id: ButtonId, diameter: number, scale: number): HTMLCanvasElement {
  return prerender(
    diameter,
    diameter,
    (g, w) => {
      const r = w / 2;
      const body = g.createRadialGradient(r * 0.7, r * 0.55, r * 0.1, r, r, r);
      body.addColorStop(0, css([122, 92, 224]));
      body.addColorStop(1, css([52, 30, 128]));
      g.fillStyle = body;
      g.beginPath();
      g.arc(r, r, r - 0.8, 0, TAU);
      g.fill();
      g.strokeStyle = css([208, 190, 255], 0.75);
      g.lineWidth = Math.max(1, w * 0.045);
      g.beginPath();
      g.arc(r, r, r - g.lineWidth / 2 - 0.4, 0, TAU);
      g.stroke();
      g.save();
      const size = w * 0.66;
      g.translate((w - size) / 2, (w - size) / 2 + w * 0.01);
      g.scale(size / 64, size / 64);
      ICONS[id](g);
      g.restore();
    },
    scale,
  );
}

/**
 * Makes every picture the game stamps for a layout. They are made again when the screen changes
 * size.
 */
export function makeArt(plan: Plan, unit: number): Art {
  const scale = sharpness(unit);
  const gap = gapOf(plan);
  const tile = { w: plan.grid.tw - gap, h: plan.grid.th - gap };
  const key = { w: plan.keys.w - 1.5, h: plan.keys.th - gap };
  const diameter = plan.buttons[0]!.r * 2;
  const icon = Math.min(...plan.tabs.map((t) => Math.min(t.w, t.h))) * 0.56;
  const ghost = Math.min(tile.w, tile.h) * 0.46;
  const tail = { w: tile.w, h: tile.h * 0.76 * 0.4 };
  const forParts = <T>(make: (part: PartId) => T): Record<PartId, T> =>
    Object.fromEntries(PART_IDS.map((part) => [part, make(part)])) as Record<PartId, T>;
  return {
    tiles: forParts((part) => PALETTE.map((color) => tileOf(part, color, tile.w, tile.h, scale))),
    flashes: forParts((part) => whiteOf(part, tile.w, tile.h, scale)),
    ghosts: PALETTE.map((color) => ghostOf(color, ghost, scale)),
    tails: PALETTE.map((color) => tailOf(color, tail.w, tail.h, scale)),
    keys: PALETTE.map((color) => keyOf(color, key.w, key.h, scale)),
    buttons: {
      wand: buttonOf('wand', diameter, scale),
      broom: buttonOf('broom', diameter, scale),
      hare: buttonOf('hare', diameter, scale),
      turtle: buttonOf('turtle', diameter, scale),
    },
    icons: forParts((part) => ({ colored: iconOf(part, false, icon, scale), inked: iconOf(part, true, icon, scale) })),
    tile,
    key,
    icon,
    ghost,
    tail,
  };
}
