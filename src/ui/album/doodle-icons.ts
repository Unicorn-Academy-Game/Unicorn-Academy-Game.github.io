import { centreOf, type Point, type StampShape, stampParts } from '../../game/doodle';
import { picture } from '../icons';

/** The little pictures of drawing, made the way the rest of the game's icons are. */

/** A fat crayon pointing down to the left, with a band of paper round it and a pink tip. */
export const ICON_CRAYON = picture(
  '<path d="M17.2 3.4l3.4 3.4-11 11-3.4-3.4z"/><path d="M6.2 14.4l3.4 3.4-5.2 1.8z"/>',
  '<path d="M6.2 14.4l3.4 3.4-5.2 1.8z" fill="#ff8fc8" stroke="#26183d" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M13.4 7.2l3.4 3.4" stroke="#9b6bff" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
);

/** An eraser: a block on the slant, pink at one end and white at the other. */
export const ICON_RUBBER = picture(
  '<rect x="2.6" y="8.2" width="18.8" height="8.2" rx="2.4" transform="rotate(-45 12 12.3)"/>',
  '<rect x="2.6" y="8.2" width="8.6" height="8.2" rx="2.4" fill="#ff8fc8" stroke="#26183d" stroke-width="1.2" ' +
    'stroke-linejoin="round" transform="rotate(-45 12 12.3)"/>',
);

/** An arrow that turns back on itself, for taking the last thing off. */
export const ICON_UNDO = picture(
  '<path d="M3.6 9.6 9.4 4v3.6h5.2a6 6 0 0 1 0 12H7.8v-3.2h6.8a2.8 2.8 0 0 0 0-5.6H9.4V15z"/>',
);

const points = (list: readonly Point[]): string =>
  list.map((p) => `${(12 + p.x).toFixed(2)},${(12 + p.y).toFixed(2)}`).join(' ');

/** A stamp as a button shows it: its own outline, from the same numbers the stamp is drawn from. */
export function stampIcon(shape: StampShape): string {
  const parts = stampParts(shape, 9.2);
  const edge = parts.map((part) => `<polygon points="${points(part.points)}"/>`).join('');
  const colour = parts
    .map(
      (part) => `<polygon points="${points(part.points)}" fill="${part.fill === 'ink' ? '#fff' : centreOf('white')}"/>`,
    )
    .join('');
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    `<g fill="#26183d" stroke="#26183d" stroke-width="3.2" stroke-linejoin="round">${edge}</g>` +
    `<g stroke="none">${colour}</g></svg>`
  );
}
