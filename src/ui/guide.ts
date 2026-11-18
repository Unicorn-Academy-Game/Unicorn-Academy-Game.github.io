import { EXIT_LOOKS } from '../content/exits';
import type { WordId } from '../content/lexicon';
import {
  type Corner,
  type ExitArrow,
  type Inset,
  roomAround,
  type Screen,
  type SeekBubble,
  type SurveyOffer,
  type WayOutOffer,
} from '../game/guide';
import { h } from './dom';
import { BACK_ICON, EXIT_ICONS } from './icons';
import { BOOK_LABELS, seekLabel } from './learning/book-text';
import { ICON_CLOSE } from './learning/icons';

export interface GuideHandlers {
  /** A bubble that points to a way out was tapped. */
  onExit: (portalId: string) => void;
  /** The button for looking at the whole of something was tapped. */
  onSurvey: () => void;
  /** The button that takes the herd out of where she is was tapped. */
  onWayOut: () => void;
  /** The bubble for the word the player is looking for was tapped. */
  onSeek: () => void;
  /** The small button that stops the player looking for it was tapped. */
  onSeekStop: () => void;
  /**
   * The corner of the screen that holds the counter, the Spell Book button and the basket, so a
   * bubble does not sit on them.
   */
  corner?: HTMLElement;
}

const BUBBLE = 52;
/**
 * How far in from the sides and the bottom a bubble's middle stays, and from the top, where the
 * buttons are. CSS pixels.
 */
const EDGE = 40;
const BOTTOM = 44;
const TOP = 96;
/**
 * How far the middle of a bubble stays from a button in the corner: its radius and a little air.
 */
const AROUND = BUBBLE / 2 + 6;
const css = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`;

/**
 * What is on show in the corner, as how far the right and lower side of each part are from the top
 * left of the screen, with the room a bubble needs added. A part that has faded out of the way, as
 * the basket does, keeps its place but is not there to be hidden behind, so it is left out. A part
 * is measured by its place in the layout and not by what is drawn, since the basket swells as it
 * arrives, and a bubble should keep to where it will be.
 */
function whatShows(corner: HTMLElement, screen: HTMLElement): Corner[] {
  const origin = screen.getBoundingClientRect();
  const at = corner.getBoundingClientRect();
  const parts: Corner[] = [];
  for (const part of Array.from(corner.children) as HTMLElement[]) {
    if (part.hidden || part.dataset.resting === 'true') continue;
    parts.push({
      right: at.left - origin.left + part.offsetLeft + part.offsetWidth + AROUND,
      bottom: at.top - origin.top + part.offsetTop + part.offsetHeight + AROUND,
    });
  }
  return parts;
}

interface Bubble {
  el: HTMLButtonElement;
  point: HTMLElement;
  x: number;
  y: number;
  angle: number;
  mapId: string;
  /** A timer that removes it a moment after it leaves, so it fades instead of vanishing. */
  gone: number | null;
}

/** What the bubble for a word the player is looking for shows, and where it is on the screen. */
export interface SeekView extends SeekBubble {
  /** Which word, so a bubble for one word is never taken for the bubble for the next. */
  word: WordId;
  /** The picture of what the player is looking for, as an image. */
  picture: string;
  /** The picture is a friend's head and shoulders. */
  portrait: boolean;
  /** For a screen reader, which is not told the word, since the word is the answer. */
  letters: number;
}

interface Seek {
  word: WordId;
  el: HTMLElement;
  point: HTMLElement;
  stop: HTMLElement;
  x: number;
  y: number;
  angle: number;
  over: boolean;
  gone: number | null;
}

/**
 * The layer that helps a child find their way: a bubble on the edge of the screen for each way out
 * they cannot see, which takes them there when they tap it, a button to look at the whole of what
 * stands near, and the bubble that goes with them to a word they asked to be shown. It draws what
 * it is told and holds no game state, so it is cheap to run every frame.
 */
export class Guide {
  readonly node: HTMLElement;
  private readonly bubbles = new Map<string, Bubble>();
  private seek: Seek | null = null;
  private readonly survey: HTMLButtonElement;
  private readonly surveyLabel: HTMLElement;
  private readonly surveyIcon: HTMLElement;
  private surveyShown: string | null = null;
  private readonly wayOut: HTMLButtonElement;
  private wayShown: string | null = null;
  private box: { screen: Screen; inset: Inset } = {
    screen: { w: 1, h: 1 },
    inset: { top: TOP, right: EDGE, bottom: BOTTOM, left: EDGE },
  };

  constructor(private readonly handlers: GuideHandlers) {
    this.surveyIcon = h('span', { class: 'icon', 'aria-hidden': 'true' });
    this.surveyLabel = h('span', { class: 'label' });
    this.survey = h('button', { type: 'button', class: 'survey' }, this.surveyIcon, this.surveyLabel);
    this.survey.hidden = true;
    this.survey.addEventListener('click', () => this.handlers.onSurvey());
    const wayIcon = h('span', { class: 'icon', 'aria-hidden': 'true' });
    wayIcon.innerHTML = EXIT_ICONS.door;
    this.wayOut = h('button', { type: 'button', class: 'way-out' }, wayIcon, h('span', { class: 'label' }));
    this.wayOut.hidden = true;
    this.wayOut.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onWayOut();
    });
    this.node = h('div', { class: 'guide' }, this.survey, this.wayOut);
    // The layer's padding is the device's safe area (a notch, a home bar), which only the browser
    // can say.
    const watch = new ResizeObserver(() => this.measure());
    watch.observe(this.node);
    // The bubbles keep off the buttons in the corner, so each one is watched: one grows when the
    // basket takes another kind, one comes when a button is added, and the basket keeps its size
    // when it fades out of the way, so its flag is what says the room is free.
    const corner = handlers.corner;
    if (corner) {
      const watched = new Set<Element>();
      const look = (): void => {
        for (const part of Array.from(corner.children)) {
          if (watched.has(part)) continue;
          watched.add(part);
          watch.observe(part);
        }
      };
      new MutationObserver(() => {
        look();
        this.measure();
      }).observe(corner, {
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'data-resting'],
        subtree: true,
      });
      look();
    }
  }

  /** The size of the screen and where a bubble may sit on it, in CSS pixels. */
  layout(): { screen: Screen; inset: Inset } {
    return this.box;
  }

  private measure(): void {
    const style = getComputedStyle(this.node);
    const safe = (side: 'Top' | 'Right' | 'Bottom' | 'Left'): number =>
      parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`)) || 0;
    const corner = this.handlers.corner;
    const screen = { w: this.node.clientWidth, h: this.node.clientHeight };
    const inset = {
      top: safe('Top') + TOP,
      right: safe('Right') + EDGE,
      bottom: safe('Bottom') + BOTTOM,
      left: safe('Left') + EDGE,
    };
    this.box = {
      screen,
      inset: corner && !corner.hidden ? roomAround(inset, whatShows(corner, this.node), screen, BUBBLE) : inset,
    };
  }

  /**
   * Brings the bubbles and the button up to date. A bubble for an exit that came back on the screen
   * fades away.
   */
  update(
    arrows: readonly ExitArrow[],
    survey: SurveyOffer | null,
    seek: SeekView | null,
    wayOut: WayOutOffer | null,
  ): void {
    const live = new Set<string>();
    for (const a of arrows) {
      live.add(a.portalId);
      const bubble = this.bubbles.get(a.portalId) ?? this.add(a);
      if (bubble.gone !== null) {
        window.clearTimeout(bubble.gone);
        bubble.gone = null;
        delete bubble.el.dataset.leaving;
      }
      this.place(bubble, a);
    }
    for (const [id, bubble] of this.bubbles) if (!live.has(id) && bubble.gone === null) this.leave(id, bubble);
    this.showSurvey(survey);
    this.showWayOut(wayOut);
    this.showSeek(seek);
  }

  /** Takes everything away at once, for a screen change or a closed game. */
  clear(): void {
    for (const bubble of this.bubbles.values()) {
      if (bubble.gone !== null) window.clearTimeout(bubble.gone);
      bubble.el.remove();
    }
    this.bubbles.clear();
    this.showSurvey(null);
    this.showWayOut(null);
    this.dropSeek();
  }

  private add(a: ExitArrow): Bubble {
    const look = EXIT_LOOKS[a.mapId];
    const icon = h('span', { class: 'icon', 'aria-hidden': 'true' });
    icon.innerHTML = EXIT_ICONS[look.icon];
    // The face pulses and the button as a whole is placed, because an animation on the button would
    // undo where it was put.
    const face = h('span', { class: 'face' }, icon);
    const point = h('span', { class: 'point', 'aria-hidden': 'true' }, h('i'));
    const el = h(
      'button',
      { type: 'button', class: 'exit', 'aria-label': `Go to the ${look.word}`, style: `--tint:${css(look.tint)}` },
      face,
      point,
    );
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onExit(a.portalId);
    });
    const bubble: Bubble = { el, point, x: NaN, y: NaN, angle: NaN, mapId: a.mapId, gone: null };
    this.bubbles.set(a.portalId, bubble);
    this.node.append(el);
    return bubble;
  }

  private place(b: Bubble, a: ExitArrow): void {
    // Position is written only when it moved enough to see, so a camera at rest costs nothing.
    if (Math.abs(a.x - b.x) > 0.4 || Math.abs(a.y - b.y) > 0.4 || Number.isNaN(b.x)) {
      b.el.style.transform = `translate(${(a.x - BUBBLE / 2).toFixed(1)}px, ${(a.y - BUBBLE / 2).toFixed(1)}px)`;
      b.x = a.x;
      b.y = a.y;
    }
    if (Math.abs(a.angle - b.angle) > 0.01 || Number.isNaN(b.angle)) {
      b.point.style.transform = `rotate(${a.angle.toFixed(3)}rad) translateX(${BUBBLE / 2 + 3}px)`;
      b.angle = a.angle;
    }
  }

  private leave(id: string, b: Bubble): void {
    b.el.dataset.leaving = 'true';
    b.gone = window.setTimeout(() => {
      b.el.remove();
      this.bubbles.delete(id);
    }, 260);
  }

  private showSeek(view: SeekView | null): void {
    const now = this.seek;
    if (!view) {
      if (now && now.gone === null) this.leaveSeek(now);
      return;
    }
    // A new word is a new bubble, so it does not slide over from where the last one was.
    if (now && now.word !== view.word) this.dropSeek();
    const bubble = this.seek ?? this.addSeek(view);
    if (bubble.gone !== null) {
      window.clearTimeout(bubble.gone);
      bubble.gone = null;
      delete bubble.el.dataset.leaving;
    }
    this.placeSeek(bubble, view);
  }

  private addSeek(view: SeekView): Seek {
    const picture = h('img', { src: view.picture, alt: '', draggable: 'false' });
    const face = h('span', { class: 'face' }, picture);
    const point = h('span', { class: 'point', 'aria-hidden': 'true' }, h('i'));
    const go = h(
      'button',
      {
        type: 'button',
        class: 'seek-go',
        'aria-label': seekLabel(view.letters),
        'data-content-id': 'learning.seek.go',
      },
      face,
      point,
    );
    go.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onSeek();
    });
    const stop = h('button', {
      type: 'button',
      class: 'seek-stop',
      'aria-label': BOOK_LABELS.stopLooking,
      'data-content-id': 'learning.seek.stop',
    });
    stop.innerHTML = ICON_CLOSE;
    stop.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onSeekStop();
    });
    const el = h('div', { class: 'seek', 'data-portrait': String(view.portrait) }, go, stop);
    const seek: Seek = { word: view.word, el, point, stop, x: NaN, y: NaN, angle: NaN, over: view.over, gone: null };
    this.seek = seek;
    this.node.append(el);
    return seek;
  }

  private placeSeek(b: Seek, v: SeekView): void {
    if (Math.abs(v.x - b.x) > 0.4 || Math.abs(v.y - b.y) > 0.4 || Number.isNaN(b.x)) {
      b.el.style.transform = `translate(${(v.x - BUBBLE / 2).toFixed(1)}px, ${(v.y - BUBBLE / 2).toFixed(1)}px)`;
      b.x = v.x;
      b.y = v.y;
    }
    if (Math.abs(v.angle - b.angle) > 0.01 || Number.isNaN(b.angle)) {
      b.point.style.transform = `rotate(${v.angle.toFixed(3)}rad) translateX(${BUBBLE / 2 + 3}px)`;
      // The way to stop looking is on the far side from where the bubble points, so the two never
      // meet.
      const back = v.angle + Math.PI;
      b.stop.style.transform = `rotate(${back.toFixed(3)}rad) translateX(${BUBBLE / 2 + 6}px) rotate(${(-back).toFixed(3)}rad)`;
      b.angle = v.angle;
    }
    if (v.over !== b.over || b.el.dataset.over === undefined) {
      b.el.dataset.over = String(v.over);
      b.over = v.over;
    }
  }

  private leaveSeek(b: Seek): void {
    b.el.dataset.leaving = 'true';
    b.gone = window.setTimeout(() => {
      b.el.remove();
      if (this.seek === b) this.seek = null;
    }, 260);
  }

  private dropSeek(): void {
    const b = this.seek;
    if (!b) return;
    if (b.gone !== null) window.clearTimeout(b.gone);
    b.el.remove();
    this.seek = null;
  }

  private showWayOut(offer: WayOutOffer | null): void {
    if (offer === null) {
      if (this.wayShown === null) return;
      this.wayOut.hidden = true;
      this.wayShown = null;
      return;
    }
    if (offer.label === this.wayShown) return;
    this.wayShown = offer.label;
    this.wayOut.hidden = false;
    this.wayOut.querySelector('.label')!.textContent = offer.label;
    this.wayOut.setAttribute('aria-label', offer.label);
  }

  private showSurvey(s: SurveyOffer | null): void {
    if (!s) {
      if (this.surveyShown === null) return;
      this.survey.hidden = true;
      this.surveyShown = null;
      return;
    }
    const key = `${s.word}:${s.active}`;
    if (key === this.surveyShown) return;
    this.surveyShown = key;
    this.survey.hidden = false;
    this.survey.dataset.active = String(s.active);
    this.surveyIcon.innerHTML = s.active ? BACK_ICON : EXIT_ICONS.castle;
    this.surveyLabel.textContent = s.active ? 'Back' : `See the whole ${s.word}`;
    this.survey.setAttribute('aria-label', s.active ? 'Go back to Wildstar' : `See the whole ${s.word}`);
  }
}
