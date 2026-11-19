import { picture } from '../icons';

/** The little pictures of the sticker book, drawn the way the rest of the game's icons are. */

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 5.2 : 2.3;
  return `${(11.4 + Math.cos(a) * r).toFixed(2)},${(10.8 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

/** A sticker: a rounded square with one corner peeling back, and a star on it. */
export const ICON_STICKER = picture(
  '<path d="M5.4 3.2h13.2a2.2 2.2 0 0 1 2.2 2.2v9.4L14.8 20.8H5.4a2.2 2.2 0 0 1-2.2-2.2V5.4a2.2 2.2 0 0 1 2.2-2.2z"/>',
  '<path d="M20.8 14.8 14.8 20.8v-4.2a2.2 2.2 0 0 1 2.2-2.2z" fill="#c9b6f5" stroke="#26183d" stroke-width="1.3" stroke-linejoin="round"/>' +
    `<polygon points="${STAR}" fill="#ffc933" stroke="#26183d" stroke-width="1.3" stroke-linejoin="round"/>`,
);
