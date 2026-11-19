import { picture } from '../icons';

/** The little pictures of the camera and the photo album, drawn the way the rest of the game's icons are. */

/** A camera with a big lens and a small gold flash. */
export const ICON_CAMERA = picture(
  '<rect x="2.4" y="7.2" width="19.2" height="13" rx="3.2"/><path d="M7.6 7.4 9.2 4.4h5.6l1.6 3z"/>',
  '<circle cx="12" cy="13.8" r="4.4" fill="#8cc8f2" stroke="#26183d" stroke-width="1.5"/>' +
    '<circle cx="10.7" cy="12.5" r="1.4" fill="#fff" opacity="0.85"/>' +
    '<circle cx="18.4" cy="10.2" r="1.2" fill="#ffc933" stroke="#26183d" stroke-width="0.8"/>',
);

/** An arrow going down into a tray, for keeping a copy of a picture on the device. */
export const ICON_SAVE = picture(
  '<path d="M9.2 3h5.6v7h3.8L12 16.6 5.4 10h3.8z"/><rect x="3.6" y="18" width="16.8" height="3" rx="1.2"/>',
);

/** A little bin, for putting a picture away. */
export const ICON_BIN = picture(
  '<path d="M5.6 8h12.8l-1.1 11.6a2.2 2.2 0 0 1-2.2 2H8.9a2.2 2.2 0 0 1-2.2-2z"/><rect x="3.6" y="5" width="16.8" height="3" rx="1.4"/><rect x="9" y="2.6" width="6" height="3" rx="1.2"/>',
  '<path d="M10 11v6.4M14 11v6.4" stroke="#9b6bff" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
);

/** Four prints side by side, for all the pictures. */
export const ICON_PRINTS = picture(
  '<rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="3.2" width="7.6" height="7.6" rx="1.6"/><rect x="3.2" y="13.2" width="7.6" height="7.6" rx="1.6"/><rect x="13.2" y="13.2" width="7.6" height="7.6" rx="1.6"/>',
);

/** A bracket that points along, for going to the next picture or the one before. */
export const arrow = (to: 'left' | 'right'): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${to === 'right' ? 'M9 4.6l7.4 7.4L9 19.4' : 'M15 4.6 7.6 12l7.4 7.4'}"/></svg>`;
