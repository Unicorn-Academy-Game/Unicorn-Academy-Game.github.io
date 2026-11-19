import {
  type Brush,
  Drawing,
  INKS,
  type Ink,
  inkAt,
  type Point,
  penWidth,
  rubberWidth,
  STAMPS,
  type StampShape,
  stampSize,
} from '../../game/doodle';
import { type Shot, squeeze } from '../../render/squeeze';
import type { Photo } from '../../shared/photos';
import { tell } from '../book-chrome';
import { flag, h, trapFocus } from '../dom';
import { ICON_CLOSE, ICON_DONE } from '../learning/icons';
import { ICON_CRAYON, ICON_RUBBER, ICON_UNDO, stampIcon } from './doodle-icons';
import { type Paper, paintMark, paintMarks } from './doodle-paint';
import './doodle.css';
import { DRAW_LABELS, INK_LABELS, STAMP_LABELS } from './photo-text';

export interface DoodleDeps {
  /** The sheet of the album, which the editor covers. */
  sheet: HTMLElement;
  /** Where the album says what happened, for a screen reader. */
  live: HTMLElement;
  photo: Photo;
  sounds: { stamped(step: number): void; drawn(): void };
  /** Keeps the drawing as a picture. Answers it, or null when the album could not hold it. */
  keep(shot: Shot): Photo | null;
  /** The editor is gone. The drawing that was kept comes with it, when one was. */
  leave(kept: Photo | null): void;
}

type Tool = 'pen' | 'rubber' | StampShape;

/** Whether a tool draws a line, as the crayon and the rubber do, and not a stamp. */
const drawsLine = (tool: Tool): tool is 'pen' | 'rubber' => tool === 'pen' || tool === 'rubber';

/** How much smaller a drawing is made, one after the other, when it will not squeeze small enough. */
const SHRINKS = [1, 0.8, 0.64] as const;

/** How long the undo button nudges when the picture is full, in milliseconds. */
const NUDGE_MS = 520;

/** The most pixels one of the three canvases of a picture is given, since all three are kept at once. */
const MAX_PIXELS = 4_000_000;

/** The most pixels a canvas has to a unit of the picture. */
const MAX_SCALE = 4;

const swatchOf = (ink: Ink): string =>
  ink === 'rainbow'
    ? `conic-gradient(from 200deg, ${INKS.filter((i) => i !== 'rainbow' && i !== 'white' && i !== 'black')
        .map((i) => inkAt(i, 0))
        .join(', ')}, ${inkAt('red', 0)})`
    : inkAt(ink, 0);

const canvasOf = (w: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = height;
  return canvas;
};

const iconOf = (svg: string, kind = 'doodle-icon'): HTMLElement => {
  const node = h('span', { class: kind, 'aria-hidden': 'true' });
  node.innerHTML = svg;
  return node;
};

/**
 * Drawing on a picture: a crayon in nine colours, four stamps, two sizes, and undo. The picture
 * itself is never changed. What is drawn is kept as a new picture beside it, and only when the
 * player says so, because a new picture can push the oldest out of the album.
 *
 * The picture sits in a canvas, and the marks are painted on it as they are made. The canvas has as
 * many pixels as the screen shows the picture in, up to a limit, so that a line is as sharp as the
 * screen is and not as soft as a picture kept at a few hundred pixels. The marks that are finished are
 * painted once on a copy, so a long line costs no more than the one being drawn.
 */
export class Doodle {
  private readonly drawing: Drawing;
  private readonly root: HTMLElement;
  private readonly view: HTMLCanvasElement;
  /** The picture as it was, which undo goes back to. */
  private readonly bare: HTMLCanvasElement;
  /** The picture with every finished mark on it. */
  private readonly base: HTMLCanvasElement;
  private readonly undo: HTMLButtonElement;
  private readonly inks: HTMLButtonElement[];
  private readonly tools = new Map<Tool, HTMLButtonElement>();
  private readonly size: HTMLButtonElement;
  private readonly body: HTMLElement[];
  private tool: Tool = 'pen';
  private ink: Ink = 'rainbow';
  private brush: Brush = 'bold';
  /** How many marks are already painted on the copy. */
  private baked = 0;
  private stamps = 0;
  private pointer: number | null = null;
  private frame = 0;
  private asking: HTMLElement | null = null;
  private ready = false;
  private closed = false;
  private untrap: (() => void) | null = null;
  /** Pixels to a unit of the picture, for each of the canvases. */
  private k = 1;
  /** The picture, once it has loaded. */
  private image: HTMLImageElement | null = null;
  private watching: ResizeObserver | null = null;
  /** What the album under the editor holds, put out of reach of a screen reader while the editor is over it. */
  private covered: Element[] = [];

  constructor(private readonly deps: DoodleDeps) {
    const { w, h: height } = deps.photo;
    this.drawing = new Drawing(w, height);
    this.view = h('canvas', {
      class: 'doodle-canvas',
      width: w,
      height: height,
      role: 'img',
      'aria-label': DRAW_LABELS.paper,
      style: `--r:${(w / height).toFixed(4)}`,
    });
    this.bare = canvasOf(w, height);
    this.base = canvasOf(w, height);
    this.view.addEventListener('pointerdown', (event) => this.down(event));
    this.view.addEventListener('pointermove', (event) => this.move(event));
    this.view.addEventListener('pointerup', (event) => this.up(event));
    this.view.addEventListener('pointercancel', (event) => this.up(event));
    this.view.addEventListener('contextmenu', (event) => event.preventDefault());

    const shut = this.control('doodle-shut', 'shut', DRAW_LABELS.close, () => this.back());
    shut.append(iconOf(ICON_CLOSE, 'doodle-shut-icon'));
    const done = this.control('doodle-done', 'done', DRAW_LABELS.doneLabel, () => this.finish());
    done.append(iconOf(ICON_DONE), h('span', { class: 'doodle-done-text' }, DRAW_LABELS.done));
    const head = h('div', { class: 'doodle-head' }, shut, done);

    const pen = this.toolButton('pen', DRAW_LABELS.pen, ICON_CRAYON);
    const rubber = this.toolButton('rubber', DRAW_LABELS.rubber, ICON_RUBBER);
    const stamps = STAMPS.map((shape) => this.toolButton(shape, STAMP_LABELS[shape], stampIcon(shape)));
    this.size = this.control('doodle-tool doodle-size', 'size', '', () => this.resize());
    this.size.append(h('span', { class: 'doodle-dot' }));
    this.undo = this.control('doodle-tool doodle-undo', 'undo', DRAW_LABELS.undoLabel, () => this.takeOff());
    this.undo.append(iconOf(ICON_UNDO));
    const tools = h(
      'div',
      { class: 'doodle-tools', role: 'toolbar', 'aria-label': DRAW_LABELS.tools },
      pen,
      rubber,
      ...stamps,
      this.size,
      this.undo,
    );
    this.inks = INKS.map((ink) => {
      const swatch = this.control('doodle-tool doodle-ink', 'ink', INK_LABELS[ink], () => this.paint(ink));
      swatch.dataset.ink = ink;
      swatch.style.setProperty('--swatch', swatchOf(ink));
      return swatch;
    });
    const inks = h('div', { class: 'doodle-inks', role: 'toolbar', 'aria-label': DRAW_LABELS.inks }, ...this.inks);
    const paper = h('div', { class: 'doodle-paper' }, this.view);
    this.body = [head, paper, tools, inks];
    this.root = h(
      'div',
      {
        class: 'doodle',
        role: 'group',
        'aria-label': DRAW_LABELS.title,
        tabindex: -1,
        'data-ready': 'false',
      },
      ...this.body,
    );
    this.root.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.takeOff();
      }
    });
    this.refresh();
  }

  /** A button of the editor, with the hook the tests and the monkey find it by. */
  private control(classes: string, kind: string, label: string, onclick: () => void): HTMLButtonElement {
    return h('button', {
      type: 'button',
      class: classes,
      'data-content-id': `doodle.${kind}`,
      'aria-label': label || undefined,
      onclick,
    });
  }

  private toolButton(tool: Tool, label: string, icon: string): HTMLButtonElement {
    const button = this.control('doodle-tool doodle-shape', drawsLine(tool) ? tool : 'stamp', label, () =>
      this.choose(tool),
    );
    button.dataset.tool = tool;
    button.append(iconOf(icon));
    this.tools.set(tool, button);
    return button;
  }

  /** Puts the editor over the album and brings the picture in. */
  open(): void {
    this.deps.sheet.append(this.root);
    this.deps.sheet.closest<HTMLElement>('.book')?.setAttribute('data-drawing', 'true');
    this.covered = [...this.deps.sheet.querySelectorAll(':scope > .book-head, :scope > .book-page')];
    for (const part of this.covered) part.setAttribute('inert', '');
    this.untrap = trapFocus(this.root);
    this.root.focus({ preventScroll: true });
    this.fit();
    this.watching = new ResizeObserver(() => this.fit());
    this.watching.observe(this.view);
    const image = new Image();
    image.onload = () => {
      if (this.closed) return;
      this.image = image;
      this.repaint();
      this.ready = true;
      this.root.dataset.ready = 'true';
      this.render();
      this.focusOn('doodle.pen');
    };
    image.onerror = () => this.close(null);
    image.src = this.deps.photo.image;
  }

  /** The album is shut, or the game needs the screen: the drawing goes without asking. */
  dismiss(): void {
    this.close(null);
  }

  /** Takes the editor away, and says what came of it. */
  private close(kept: Photo | null): void {
    if (this.closed) return;
    this.closed = true;
    window.cancelAnimationFrame(this.frame);
    this.watching?.disconnect();
    this.watching = null;
    this.untrap?.();
    this.untrap = null;
    for (const part of this.covered) part.removeAttribute('inert');
    this.covered = [];
    this.root.remove();
    this.deps.sheet.closest<HTMLElement>('.book')?.removeAttribute('data-drawing');
    this.deps.leave(kept);
  }

  /** Escape, or the cross: out of the question, and then out of the drawing, asking first when there is one. */
  back(): void {
    if (this.closed) return;
    if (this.asking) this.ask(false);
    else if (this.drawing.count > 0) this.ask(true);
    else this.close(null);
  }

  private focusOn(kind: string): void {
    this.root.querySelector<HTMLElement>(`[data-content-id="${kind}"]`)?.focus({ preventScroll: true });
  }

  /** Asks whether to keep the drawing before leaving it, or takes the question back. */
  private ask(on: boolean): void {
    this.asking?.remove();
    this.asking = null;
    for (const part of this.body) part.toggleAttribute('inert', on);
    if (!on) {
      this.focusOn('doodle.done');
      return;
    }
    const keep = this.control('photo-button', 'keep', DRAW_LABELS.keep, () => this.finish());
    keep.dataset.kind = 'keep';
    keep.append(h('span', { class: 'photo-button-text' }, DRAW_LABELS.keep));
    const drop = this.control('photo-button', 'drop', DRAW_LABELS.drop, () => this.close(null));
    drop.append(h('span', { class: 'photo-button-text' }, DRAW_LABELS.drop));
    this.asking = h(
      'div',
      { class: 'doodle-ask', role: 'alertdialog', 'aria-label': DRAW_LABELS.ask },
      h('b', {}, DRAW_LABELS.ask),
      h('div', { class: 'doodle-ask-buttons' }, keep, drop),
    );
    this.root.append(this.asking);
    keep.focus({ preventScroll: true });
  }

  /** Keeps what was drawn as a new picture. With nothing drawn there is nothing to keep, and it just closes. */
  private finish(): void {
    if (!this.ready || this.closed) return;
    this.drawing.end();
    if (this.drawing.count === 0) {
      this.close(null);
      return;
    }
    this.bake();
    const out = document.createElement('canvas');
    out.width = this.drawing.w;
    out.height = this.drawing.h;
    const g = out.getContext('2d');
    if (!g) return;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.base, 0, 0, out.width, out.height);
    const shot = squeeze(out, SHRINKS);
    const kept = shot ? this.deps.keep(shot) : null;
    if (!kept) {
      if (this.asking) this.ask(false);
      tell(this.deps.live, DRAW_LABELS.retry);
      return;
    }
    this.deps.sounds.drawn();
    tell(this.deps.live, DRAW_LABELS.kept);
    this.close(kept);
  }

  private choose(tool: Tool): void {
    this.tool = tool;
    this.refresh();
  }

  /** A colour is chosen. A player who picks one after the rubber wants to draw with it, so the crayon is back. */
  private paint(ink: Ink): void {
    this.ink = ink;
    if (this.tool === 'rubber') this.tool = 'pen';
    this.refresh();
  }

  private resize(): void {
    this.brush = this.brush === 'fine' ? 'bold' : 'fine';
    this.refresh();
  }

  /** The buttons say what is chosen, and undo says whether there is anything to take off. */
  private refresh(): void {
    for (const [tool, button] of this.tools) button.setAttribute('aria-pressed', String(tool === this.tool));
    for (const button of this.inks) button.setAttribute('aria-pressed', String(button.dataset.ink === this.ink));
    this.size.dataset.size = this.brush;
    this.size.setAttribute('aria-label', DRAW_LABELS[this.brush]);
    this.undo.disabled = this.drawing.count === 0;
  }

  /** Takes off the last thing drawn, and paints the picture again from the first mark. */
  private takeOff(): void {
    if (!this.ready || this.asking || !this.drawing.undo()) return;
    this.pointer = null;
    this.rebuild();
    this.refresh();
    this.render();
  }

  private rebuild(): void {
    const g = this.base.getContext('2d');
    if (!g) return;
    g.drawImage(this.bare, 0, 0);
    paintMarks(g, this.drawing.marks, this.paper());
    this.baked = this.drawing.count;
  }

  private paper(): Paper {
    return { bare: this.bare, k: this.k };
  }

  /** Paints the marks that are finished on to the copy, once. */
  private bake(): void {
    const g = this.base.getContext('2d');
    if (!g) return;
    paintMarks(g, this.drawing.marks.slice(this.baked), this.paper());
    this.baked = this.drawing.count;
  }

  /**
   * Gives the canvases as many pixels as the screen shows the picture in, in quarter steps and up to a
   * limit. A canvas that changes size is empty, so what was on it is painted again.
   */
  private fit(): void {
    const { w, h: height } = this.drawing;
    const shown = this.view.clientWidth * (window.devicePixelRatio || 1);
    const wanted = Math.min(MAX_SCALE, Math.sqrt(MAX_PIXELS / (w * height)), shown / w);
    const k = Math.max(1, Math.round(wanted * 4) / 4);
    if (k === this.k) return;
    this.k = k;
    for (const canvas of [this.view, this.bare, this.base]) {
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(height * k);
    }
    if (this.image) this.repaint();
  }

  /** Paints the picture, and every mark made on it, on all three canvases. */
  private repaint(): void {
    const image = this.image;
    if (!image) return;
    for (const canvas of [this.bare, this.base]) {
      const g = canvas.getContext('2d');
      if (!g) continue;
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    this.rebuild();
    this.render();
  }

  private at(event: PointerEvent): Point {
    const box = this.view.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * this.drawing.w,
      y: ((event.clientY - box.top) / box.height) * this.drawing.h,
    };
  }

  private down(event: PointerEvent): void {
    if (!this.ready || this.asking || this.pointer !== null || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.view.setPointerCapture(event.pointerId);
    this.pointer = event.pointerId;
    const at = this.at(event);
    const { w, h: height } = this.drawing;
    const tool = this.tool;
    const placed = drawsLine(tool)
      ? this.drawing.begin(
          at,
          tool === 'rubber' ? 'rubber' : this.ink,
          (tool === 'rubber' ? rubberWidth : penWidth)(this.brush, w, height),
        )
      : this.drawing.stamp(tool, at, this.ink, stampSize(this.brush, w, height));
    if (!placed) {
      this.pointer = null;
      tell(this.deps.live, DRAW_LABELS.full);
      flag(this.undo, 'nudge', NUDGE_MS);
      return;
    }
    if (!drawsLine(tool)) {
      this.deps.sounds.stamped(this.stamps);
      this.stamps += 1;
    }
    this.refresh();
    this.later();
  }

  private move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    // A finger can move faster than the screen is drawn, so every place it passed through is used.
    // Safari before 17 cannot say which they were, and has the one that is here.
    const along = event.getCoalescedEvents?.() ?? [];
    for (const step of along.length > 0 ? along : [event]) {
      const at = this.at(step);
      if (drawsLine(this.tool)) this.drawing.extend(at);
      else this.drawing.slide(at);
    }
    this.later();
  }

  private up(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    this.drawing.end();
    this.bake();
    this.later();
  }

  /** Paints on the next frame, once, however many times the finger moved before it. */
  private later(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render(): void {
    const g = this.view.getContext('2d');
    if (!g || !this.ready) return;
    g.drawImage(this.base, 0, 0);
    const paper = this.paper();
    for (const mark of this.drawing.marks.slice(this.baked)) paintMark(g, mark, paper);
  }
}
