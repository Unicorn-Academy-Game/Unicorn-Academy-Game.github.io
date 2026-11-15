import { picture } from '../icons';

/**
 * The little pictures on the spell card and in the Spell Book, drawn the way the rest of the game's
 * icons are.
 */

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 10.4 : 4.6;
  return `${(12 + Math.cos(a) * r).toFixed(2)},${(12.7 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

/** A voice: a speaker with waves coming out of it. */
export const ICON_SAY = picture(
  '<path d="M3 9.4v5.2h3.9L12.6 19.4V4.6L6.9 9.4z"/>',
  '<g fill="none" stroke-linecap="round"><path d="M15.8 8.6a4.6 4.6 0 0 1 0 6.8M18.8 5.6a9 9 0 0 1 0 12.8" stroke="#26183d" stroke-width="4.2"/><path d="M15.8 8.6a4.6 4.6 0 0 1 0 6.8M18.8 5.6a9 9 0 0 1 0 12.8" stroke="#ffd75e" stroke-width="2"/></g>',
);

/** A bulb that has an idea. */
export const ICON_HELP = picture(
  '<circle cx="12" cy="9.8" r="6.6"/><rect x="8.7" y="15" width="6.6" height="5.6" rx="1.8"/>',
  '<circle cx="12" cy="9.8" r="4.3" fill="#ffd75e"/><path d="M9.8 18h4.4" stroke="#26183d" stroke-width="1.5" stroke-linecap="round"/>',
);

/** A star, gold and outlined once it is earned. */
export const ICON_STAR = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="${STAR}" fill="#ffd75e" stroke="#26183d" stroke-width="2.4" stroke-linejoin="round"/><polygon points="${STAR}" fill="none" stroke="#fff7d1" stroke-width="1" stroke-linejoin="round" transform="translate(0 -0.4)" opacity="0.7"/></svg>`;

/** A star that is still to be earned, dark and quiet. */
export const ICON_STAR_EMPTY = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="${STAR}" fill="rgb(0 0 0 / 0.28)" stroke="rgb(255 255 255 / 0.4)" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="2.4 2.4"/></svg>`;

const SPARKLE = 'M12 1 15.7 8.3 23 12 15.7 15.7 12 23 8.3 15.7 1 12 8.3 8.3Z';

/** A four pointed sparkle, gold with a pale heart, for the word the player found most recently. */
export const ICON_SPARKLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  `<path d="${SPARKLE}" fill="#ffc933" stroke="#26183d" stroke-width="1.8" stroke-linejoin="round"/>` +
  '<path d="M12 6.4 13.2 10.8 17.6 12 13.2 13.2 12 17.6 10.8 13.2 6.4 12 10.8 10.8Z" fill="#fff4b8"/>' +
  '</svg>';

/** The corner to close from. */
export const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** An open book, for the Spell Book. */
export const ICON_BOOK = picture(
  '<path d="M2.6 5.4c3.2-.9 6.2-.6 9.4 1.2 3.2-1.8 6.2-2.1 9.4-1.2v13.2c-3.2-.9-6.2-.6-9.4 1.2-3.2-1.8-6.2-2.1-9.4-1.2z"/>',
  '<path d="M12 6.6v13.2" stroke="#9b6bff" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M5 9.2c1.6-.2 3.2 0 4.6.8M5 12.4c1.6-.2 3.2 0 4.6.8M19 9.2c-1.6-.2-3.2 0-4.6.8M19 12.4c-1.6-.2-3.2 0-4.6.8" stroke="#c9b6f5" stroke-width="1.1" stroke-linecap="round" fill="none"/>',
);

const ink = '#26183d';

/** A ring of small circles, which makes the scalloped edge of a rosette. */
const SCALLOPS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return `<circle cx="${(12 + Math.cos(a) * 8).toFixed(2)}" cy="${(11 + Math.sin(a) * 8).toFixed(2)}" r="2.3"/>`;
}).join('');

const TAILS = '<polygon points="7,16 3.6,26 8,23.6 10.6,27"/><polygon points="17,16 20.4,26 16,23.6 13.4,27"/>';

const MIDDLE_STAR = `<polygon points="${Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 4.7 : 2.1;
  return `${(12 + Math.cos(a) * r).toFixed(2)},${(11.3 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ')}" fill="#ff8a1f" stroke="${ink}" stroke-width="0.9" stroke-linejoin="round"/>`;

/**
 * The shapes are drawn dark and thick first and then again on top, so a union of them gets one
 * clean outline.
 */
const rosette = (middle: string): string =>
  '<svg viewBox="0 0 24 28" aria-hidden="true" focusable="false">' +
  `<g fill="${ink}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">${TAILS}</g><g fill="#ff5d73">${TAILS}</g>` +
  `<g fill="${ink}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">${SCALLOPS}<circle cx="12" cy="11" r="8"/></g>` +
  `<g fill="#ffd75e">${SCALLOPS}<circle cx="12" cy="11" r="8"/></g>` +
  `<circle cx="12" cy="11" r="6.3" fill="#fff3b8" stroke="#e3a21a" stroke-width="1"/>${middle}</svg>`;

/** A rosette with a star in the middle, for a page of the book that is finished. */
export const ICON_ROSETTE_STAR = rosette(MIDDLE_STAR);

/** A rosette with nothing in the middle, which has the number of words written over it. */
export const ICON_ROSETTE = rosette('');

const CROWN =
  '<path d="M3.4 18 4.8 8.6l4.6 4.2L12 5.4l2.6 7.4 4.6-4.2 1.4 9.4z"/><rect x="3.2" y="17.6" width="17.6" height="3.6" rx="1.2"/>';

/** A crown, for every word in the book. */
export const ICON_CROWN =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  `<g fill="${ink}" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">${CROWN}</g>` +
  '<g fill="#ffd75e"><path d="M3.4 18 4.8 8.6l4.6 4.2L12 5.4l2.6 7.4 4.6-4.2 1.4 9.4z"/></g><rect x="3.2" y="17.6" width="17.6" height="3.6" rx="1.2" fill="#ffb347"/>' +
  `<g fill="#ff5d73" stroke="${ink}" stroke-width="1"><circle cx="4.8" cy="7.8" r="1.6"/><circle cx="12" cy="4.6" r="1.8"/><circle cx="19.2" cy="7.8" r="1.6"/></g>` +
  '<g fill="#fff"><circle cx="8" cy="19.4" r="0.8"/><circle cx="12" cy="19.4" r="0.8"/><circle cx="16" cy="19.4" r="0.8"/></g></svg>';

/**
 * Reading glasses, for the badge in the Spell Book on a word the player reads on their own at the
 * computer.
 */
export const ICON_READ = picture(
  '<circle cx="6.6" cy="13.2" r="4.9"/><circle cx="17.4" cy="13.2" r="4.9"/><rect x="9.8" y="10.6" width="4.4" height="3.2" rx="1.4"/><rect x="0.8" y="10.8" width="3.2" height="2.8" rx="1.2"/><rect x="20" y="10.8" width="3.2" height="2.8" rx="1.2"/>',
  '<g stroke="#26183d" stroke-width="1.1"><circle cx="6.6" cy="13.2" r="3.1" fill="#8fd3ff"/><circle cx="17.4" cy="13.2" r="3.1" fill="#8fd3ff"/></g><g fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity="0.9"><path d="M4.8 12a2.2 2.2 0 0 1 1.5-1"/><path d="M15.6 12a2.2 2.2 0 0 1 1.5-1"/></g>',
);

/**
 * A magnifying glass, for the badge on a word the player has not found, which shows them where to
 * look.
 */
export const ICON_FIND = picture(
  '<circle cx="9.8" cy="9.8" r="7"/><rect x="0" y="-2" width="10.6" height="4" rx="2" transform="translate(13.4 13.4) rotate(45)"/>',
  '<circle cx="9.8" cy="9.8" r="4.6" fill="#8fd3ff" stroke="#26183d" stroke-width="1.1"/><path d="M7.4 8.6a3 3 0 0 1 2.2-1.8" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/>',
);

/** A fat arrow to the right, for going on to the next word. */
export const ICON_NEXT = picture('<path d="M3 9.2h9.4V4.4L21.4 12l-9 7.6v-4.8H3z"/>');

/** A round arrow, for reading some more. */
export const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<g fill="none" stroke-linecap="round"><path d="M19.2 12.6a7.2 7.2 0 1 1-2.5-6" stroke="#26183d" stroke-width="5"/><path d="M19.2 12.6a7.2 7.2 0 1 1-2.5-6" stroke="#fff" stroke-width="2.4"/></g>' +
  '<polygon points="20.2,2.6 20.6,10.4 13.2,8" fill="#26183d" stroke="#26183d" stroke-width="2.4" stroke-linejoin="round"/><polygon points="20.2,2.6 20.6,10.4 13.2,8" fill="#fff"/>' +
  '</svg>';

/** A tick, for being done. */
export const ICON_DONE = picture('<path d="M2.8 12.8l2.8-2.8 4 4 8.8-8.8 2.8 2.8-11.6 11.6z"/>');
