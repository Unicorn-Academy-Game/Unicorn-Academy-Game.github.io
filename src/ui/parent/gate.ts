import { realClock, type SaveClock } from '../../persistence/save-service';
import { HOLD_MS, HoldGesture } from './hold';

export interface GateOptions {
  /** The hold lasted long enough. */
  onOpen(): void;
  /** The button was tapped, or activated some other quick way. Explain the gate. */
  onHint(): void;
  clock?: Pick<SaveClock, 'later'>;
  ms?: number;
}

/** How far a finger may drift from the button before the hold is let go. */
const SLOP_PX = 14;
/**
 * A click this soon after a press or release is the end of that gesture, not a separate activation.
 */
const SAME_GESTURE_MS = 800;

/**
 * Makes `button` open the parent controls on a long press, with a pointer, a finger or a held Enter
 * or Space key. While a press is held the button carries `data-holding` and a `--hold-ms` length so
 * a ring can fill. A quick activation, such as a tap or a screen reader's double tap, only explains
 * the gate. Returns a way to take it all off again.
 */
export function bindHold(button: HTMLButtonElement, options: GateOptions): () => void {
  const ms = options.ms ?? HOLD_MS;
  button.style.setProperty('--hold-ms', `${ms}ms`);
  let lastGesture = Number.NEGATIVE_INFINITY;
  const touch = (): void => {
    lastGesture = performance.now();
  };
  /**
   * What started the press in progress. Only a held key ends with the button losing focus; a
   * pointer press may not.
   */
  let by: 'pointer' | 'key' = 'pointer';

  const gesture = new HoldGesture(
    options.clock ?? realClock,
    {
      onStart: () => (button.dataset.holding = 'true'),
      onOpen: () => {
        delete button.dataset.holding;
        options.onOpen();
      },
      onTap: () => {
        delete button.dataset.holding;
        options.onHint();
      },
      onCancel: () => delete button.dataset.holding,
    },
    ms,
  );

  const outside = (event: PointerEvent): boolean => {
    const r = button.getBoundingClientRect();
    return (
      event.clientX < r.left - SLOP_PX ||
      event.clientX > r.right + SLOP_PX ||
      event.clientY < r.top - SLOP_PX ||
      event.clientY > r.bottom + SLOP_PX
    );
  };

  const listeners: [string, EventListener][] = [
    [
      'pointerdown',
      (e) => {
        const event = e as PointerEvent;
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        touch();
        by = 'pointer';
        button.setPointerCapture(event.pointerId);
        gesture.press();
      },
    ],
    ['pointermove', (e) => gesture.holding && outside(e as PointerEvent) && gesture.cancel()],
    [
      'pointerup',
      () => {
        touch();
        gesture.release();
      },
    ],
    ['pointercancel', () => gesture.cancel()],
    ['lostpointercapture', () => gesture.cancel()],
    ['contextmenu', (e) => e.preventDefault()],
    [
      'keydown',
      (e) => {
        const event = e as KeyboardEvent;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // The click a held key would make is not wanted. The hold is the whole gesture.
        event.preventDefault();
        if (event.repeat) return;
        touch();
        by = 'key';
        gesture.press();
      },
    ],
    [
      'keyup',
      (e) => {
        const event = e as KeyboardEvent;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        touch();
        gesture.release();
      },
    ],
    // Safari takes focus off a button that is pressed with a pointer, and a pointer press has its
    // own ways to end.
    ['blur', () => by === 'key' && gesture.cancel()],
    [
      'click',
      () => {
        if (performance.now() - lastGesture > SAME_GESTURE_MS) options.onHint();
      },
    ],
  ];
  for (const [type, listener] of listeners) button.addEventListener(type, listener);

  return () => {
    gesture.cancel();
    for (const [type, listener] of listeners) button.removeEventListener(type, listener);
  };
}
