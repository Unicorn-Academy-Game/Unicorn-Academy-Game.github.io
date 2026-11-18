/**
 * A click this soon after a touch on the same control is the same press, which has already been
 * heard.
 */
const SAME_PRESS_MS = 700;

/**
 * Calls `run` the moment a finger lands on `button`, and not when it lifts, so a tile rings as it
 * is touched. A key, or a screen reader that activates the button, only makes a click, and that is
 * heard too. The click that follows a touch is the same press and is not heard twice.
 *
 * A finger that lands while another is already down is a second hand on the screen, or a palm, and
 * does not press a control unless the control says `everyFinger`. A card that is tapped as fast as
 * a child can tap, with both thumbs, says it, because the click of a second finger never comes.
 */
export function onPress(button: HTMLElement, run: () => void, { everyFinger = false } = {}): void {
  let touchedAt = -Infinity;
  button.addEventListener('pointerdown', (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || !(event.isPrimary || everyFinger)) return;
    touchedAt = performance.now();
    run();
  });
  button.addEventListener('click', () => {
    if (performance.now() - touchedAt < SAME_PRESS_MS) return;
    run();
  });
}
