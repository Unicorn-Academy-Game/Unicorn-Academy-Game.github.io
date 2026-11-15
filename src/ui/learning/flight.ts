import type { Box } from '../../game/ports';
import { h } from '../dom';

/** How long a picture takes to fly to its place in the book. */
const FLIGHT_MS = 620;

export interface Flyer {
  /** The picture, as an image. */
  picture: string;
  /** A friend's head and shoulders, which sits in a round frame. */
  portrait: boolean;
}

/** The middle of a box, which is where something flying to it should end up. */
const middle = (box: Box): { x: number; y: number } => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * A picture in its frame lifts off from where it was and settles on `to`, growing or shrinking to
 * fit, and then `landed` is called. It is called at once when there is nothing to fly with, so
 * whatever waits for it is never left waiting. `layer` is the page's own layer, and a flyer in it
 * is above everything that was there. It returns a way to stop the flight, which lands it at once.
 */
export function flyPicture(layer: HTMLElement, what: Flyer, from: Box, to: Box, landed: () => void): () => void {
  if (from.width === 0 || to.width === 0 || typeof layer.animate !== 'function') {
    landed();
    return () => undefined;
  }
  const bounds = layer.getBoundingClientRect();
  const flyer = h(
    'span',
    { class: 'book-flyer', 'data-kind': what.portrait ? 'portrait' : 'thing', 'aria-hidden': 'true' },
    h('img', { src: what.picture, alt: '', draggable: 'false' }),
  );
  flyer.style.cssText = `left:${from.left - bounds.left}px;top:${from.top - bounds.top}px;width:${from.width}px;height:${from.height}px`;
  layer.append(flyer);
  const a = middle(from);
  const b = middle(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const grow = to.width / from.width;
  // It rises a little on the way, so it looks thrown and not slid.
  const rise = Math.min(70, 26 + Math.abs(dy) * 0.18);
  const flight = flyer.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.45}px, ${dy * 0.45 - rise}px) scale(${Math.max(grow, 0.5) * 0.5 + 0.55}) rotate(-8deg)`,
        opacity: 1,
        offset: 0.45,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${grow}) rotate(0deg)`, opacity: 1, offset: 1 },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(0.4, 0, 0.25, 1)' },
  );
  let over = false;
  const land = (): void => {
    if (over) return;
    over = true;
    flyer.remove();
    landed();
  };
  flight.onfinish = land;
  flight.oncancel = land;
  return () => flight.cancel();
}
