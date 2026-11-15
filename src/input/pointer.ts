import type Phaser from 'phaser';
import type { Vec2 } from '../shared/ids';
import { Contacts, type Kind, type PointerSink, type PressState } from './contacts';

export type { PointerSink } from './contacts';

export interface PointerInput {
  /**
   * Said once a frame with the clock, so a press that stays on something turns into a lead without
   * anyone moving.
   */
  update(now: number): void;
  /** Forgets any finger that is down, for when something is put over the game. */
  cancel(): void;
  /** What the game holds about the press, for tests. */
  state(): PressState;
  stop(): void;
}

const kindOf = (e: PointerEvent): Kind =>
  e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';

/**
 * How long ago the browser may say an event happened and be believed, in milliseconds. A longer
 * wait is a clock that is not this one.
 */
const LATE_MS = 2000;

/**
 * When a finger did something, on the page's clock. The page hears it when it gets round to it, and
 * on a slow device that is a long frame, a sound being decoded or a picture going to the graphics
 * card after the finger did it. A tap that lasted 60 ms and was heard 400 ms late is a tap, so the
 * browser's time for the event is the time that counts. An event with no time on this clock (none,
 * one from the date, one that has not come, one from long ago) is timed by when it is heard.
 */
function timeOf(e: Event): number {
  const now = performance.now();
  const at = e.timeStamp;
  return at > 0 && at <= now + 1 && now - at <= LATE_MS ? at : now;
}

/**
 * Turns what touches the game's canvas into taps and leads (see `Contacts`). It listens to the
 * page's own pointer events and not to the engine's, because the engine keeps a fixed number of
 * slots for fingers and a finger whose lift it never hears keeps its slot for good, so a few of
 * those leave the screen deaf. The page says what is on the glass as it happens, and a contact that
 * is taken away is told as such, which the game never mistakes for a tap.
 *
 * A finger that lands on the canvas is held by it until it lifts, wherever it goes, so a lift over
 * a button or past the edge of the page still ends the press. The camera does the conversion to
 * world positions, so a tap lands where it looks like it did at any zoom and pixel ratio. Positions
 * are measured in CSS pixels, which is what a finger is.
 *
 * Everything that could leave a press held after the finger has gone ends it: the page going out of
 * sight, the window losing focus, the page being put away, and the context menu.
 */
export function listenForPointer(
  scene: Phaser.Scene,
  sink: PointerSink,
  enabled: () => boolean = () => scene.input.enabled,
): PointerInput {
  const canvas = scene.game.canvas;
  const contacts = new Contacts(sink);

  /** Where an event is on the canvas, in CSS pixels and in the engine's own pixels. */
  const where = (e: PointerEvent): { css: Vec2; game: Vec2 } => {
    const r = canvas.getBoundingClientRect();
    const css = { x: e.clientX - r.left, y: e.clientY - r.top };
    return {
      css,
      game: {
        x: r.width > 0 ? (css.x * canvas.width) / r.width : css.x,
        y: r.height > 0 ? (css.y * canvas.height) / r.height : css.y,
      },
    };
  };
  const world = (game: Vec2): Vec2 => {
    const w = scene.cameras.main.getWorldPoint(game.x, game.y);
    return { x: w.x, y: w.y };
  };

  const down = (e: PointerEvent): void => {
    // Only the main button: a right or middle press is not a finger. And a game that has been put
    // behind something is not listening.
    if (e.button !== 0 || !enabled()) return;
    const at = where(e);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that a script made is not one the browser can hold.
    }
    contacts.down({ id: e.pointerId, kind: kindOf(e), primary: e.isPrimary, css: at.css }, world(at.game), timeOf(e));
  };
  const move = (e: PointerEvent): void => {
    if (!contacts.active) return;
    // A mouse that moves with its button up has been let go somewhere the page was not told.
    if (e.pointerType !== 'touch' && (e.buttons & 1) === 0) {
      contacts.lifted(e.pointerId);
      return;
    }
    contacts.move({ id: e.pointerId, kind: kindOf(e), primary: e.isPrimary, css: where(e).css }, timeOf(e));
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const at = where(e);
    contacts.up({ id: e.pointerId, kind: kindOf(e), primary: e.isPrimary, css: at.css }, world(at.game), timeOf(e));
  };
  const lost = (e: PointerEvent): void => contacts.lost(e.pointerId);
  const clear = (): void => contacts.clear();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', lost);
  canvas.addEventListener('lostpointercapture', lost);
  canvas.addEventListener('contextmenu', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', clear);

  return {
    update: (now) => contacts.hold(now),
    cancel: clear,
    state: () => contacts.state(),
    stop() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', lost);
      canvas.removeEventListener('lostpointercapture', lost);
      canvas.removeEventListener('contextmenu', clear);
      window.removeEventListener('blur', clear);
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', clear);
      clear();
    },
  };
}
