import type { ExitIcon } from '../content/exits';

/**
 * Small pictures for the bubbles that point to ways out. Each is a few plain shapes. The shapes are
 * drawn twice, thick and dark underneath and white on top, so any union of them gets one clean
 * outline, and an accent in a second colour sits on top.
 */
export const picture = (shapes: string, accent = ''): string =>
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  `<g fill="#26183d" stroke="#26183d" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
  `<g fill="#fff" stroke="none">${shapes}</g>${accent}</svg>`;

const petals = [0, 1, 2, 3, 4]
  .map((i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return `<circle cx="${(12 + Math.cos(a) * 5).toFixed(2)}" cy="${(12 + Math.sin(a) * 5).toFixed(2)}" r="3.5"/>`;
  })
  .join('');

const starPoints = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 10 : 4.4;
  return `${(12 + Math.cos(a) * r).toFixed(2)},${(12.6 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

export const EXIT_ICONS: Readonly<Record<ExitIcon, string>> = {
  tree: picture(
    '<circle cx="12" cy="8.5" r="5.6"/><circle cx="7.4" cy="12.4" r="4"/><circle cx="16.6" cy="12.4" r="4"/><rect x="10.7" y="13" width="2.6" height="8" rx="1"/>',
  ),
  flower: picture(petals, '<circle cx="12" cy="12" r="2.6" fill="#ffd75e"/>'),
  gem: picture(
    '<path d="M6.2 4h11.6l4.2 6L12 21 2 10z"/>',
    '<path d="M2.6 10h18.8M9.2 4.4 7.4 10 12 20M14.8 4.4 16.6 10 12 20" fill="none" stroke="#9b6bff" stroke-width="1.2" stroke-linejoin="round"/>',
  ),
  horseshoe: picture(
    '<path d="M5 21V11a7 7 0 0 1 14 0v10h-4.2V11a2.8 2.8 0 0 0-5.6 0v10z"/>',
    '<g fill="#ffd75e"><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/><circle cx="7" cy="11" r="1"/><circle cx="17" cy="11" r="1"/></g>',
  ),
  castle: picture(
    '<path d="M2.6 21V8.5h3.6V6.6h2.2v1.9h1.4V4.4h2.4v4.1h1.4V6.6h2.2v1.9h3.6V21z"/>',
    '<path d="M10.2 21v-4.4a1.8 1.8 0 0 1 3.6 0V21z" fill="#9b6bff"/>',
  ),
  star: picture(`<polygon points="${starPoints}"/>`),
  pumpkin: picture(
    '<ellipse cx="12" cy="13.4" rx="9.2" ry="7.2"/>',
    '<path d="M12 6.4V3.6" stroke="#6bcf5a" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M8.6 7.6c-2 2.6-2 8 0 11M15.4 7.6c2 2.6 2 8 0 11M12 6.4v14" fill="none" stroke="#e08a2e" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  wave: picture(
    '<path d="M2.4 9c2.4-3.4 4.4-3.4 6.8 0s4.4 3.4 6.8 0 4.4-3.4 6.8 0v10.6H2.4z"/>',
    '<path d="M2.4 14.2c2.4-3.4 4.4-3.4 6.8 0s4.4 3.4 6.8 0 4.4-3.4 6.8 0" fill="none" stroke="#3aa8e8" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  shell: picture(
    '<path d="M12 20.4 3 10.4a10 7.6 0 0 1 18 0z"/><rect x="9" y="19" width="6" height="2.4" rx="1"/>',
    '<path d="M12 19.6 6.2 9.8M12 19.6 9.2 7.6M12 19.6V6.6M12 19.6l2.8-12M12 19.6l5.8-9.8" fill="none" stroke="#ee77aa" stroke-width="1.3" stroke-linecap="round"/>',
  ),
  door: picture('<path d="M5 21V8.6a7 7 0 0 1 14 0V21z"/>', '<circle cx="15.6" cy="14.6" r="1.3" fill="#ffd75e"/>'),
};

/** A curved arrow turning back, for the button that brings the camera home. */
export const BACK_ICON = picture(
  '<path d="M9.4 3.6 2.6 10l6.8 6.4v-3.8c4.4-.2 7.4.9 9.6 5 .6-6.4-3.2-11.2-9.6-11.4z"/>',
);
