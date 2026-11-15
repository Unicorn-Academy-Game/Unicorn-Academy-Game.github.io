import { picture } from '../../icons';

/**
 * The pictures the reading screen has that the spell card does not, drawn the way the rest of the
 * game's icons are.
 */

/** A triangle that points the way, for starting. */
export const ICON_PLAY = picture('<path d="M6.4 3.8v16.4L20.6 12z"/>');

/** An eye, for being shown how it goes. */
export const ICON_EYE = picture(
  '<path d="M1.6 12C4.4 7.2 8 5 12 5s7.6 2.2 10.4 7c-2.8 4.8-6.4 7-10.4 7S4.4 16.8 1.6 12z"/>',
  '<circle cx="12" cy="12" r="4.4" fill="#9b6bff" stroke="#26183d" stroke-width="1.2"/><circle cx="12" cy="12" r="1.9" fill="#26183d"/><circle cx="13.4" cy="10.6" r="1" fill="#fff"/>',
);

/** A house, for going back to where the player began. */
export const ICON_HOME = picture('<path d="M2.4 11.6 12 3.2l9.6 8.4h-2.6V20.6h-4.6v-5.8H9.6v5.8H5V11.6z"/>');

/** Stairs going up, for the levels. */
export const ICON_LEVELS = picture(
  '<path d="M2.4 21.2v-4.6h4.6v-4.6h4.6V7.4h4.6V2.8h3.4v18.4z"/>',
  '<path d="M2.4 21.2h19.2" stroke="#ffd75e" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
);

/** A computer: a screen with a letter on it, on a little stand. */
export const ICON_COMPUTER = picture(
  '<rect x="2" y="3" width="20" height="14.4" rx="2.6"/><rect x="8.4" y="17" width="7.2" height="3" rx="0.6"/><rect x="5.6" y="19.6" width="12.8" height="2.2" rx="1.1"/>',
  '<rect x="4.2" y="5.2" width="15.6" height="10" rx="1.4" fill="#3f2268"/><path d="M8.6 13 12 7.4 15.4 13M9.9 11.2h4.2" fill="none" stroke="#ffd75e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
);

/** Three tiles, for touching the letters. */
export const ICON_TILES = picture(
  '<rect x="1.6" y="6.4" width="6.4" height="11.2" rx="1.8"/><rect x="8.8" y="6.4" width="6.4" height="11.2" rx="1.8"/><rect x="16" y="6.4" width="6.4" height="11.2" rx="1.8"/>',
  '<g fill="none" stroke="#9b6bff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 12.2h3M10.6 12.2h3M17.8 12.2h3"/></g>',
);
