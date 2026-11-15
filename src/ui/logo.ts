import { GAME_NAME } from '../shared/brand';
import { h } from './dom';
import { WORDMARK_HEIGHT, WORDMARK_LINES, WORDMARK_WIDTH, type WordmarkLine } from './wordmark-paths';

const INK = '#26183d';
const GRADIENT_STOPS =
  '<stop offset="0" stop-color="#fff7d1"/><stop offset="0.3" stop-color="#ffd75e"/><stop offset="0.68" stop-color="#ff7ac8"/><stop offset="1" stop-color="#9b6bff"/>';

/**
 * One line of the title, built from a single outline: a shadow, the dark outline, the gradient
 * inside it, and a light edge just inside the top of the letters. The outline has no overlapping
 * pieces, so nothing shows through the letters, and the small counters it closes up are filled with
 * its colour, so nothing shows through those either.
 */
function line(spec: WordmarkLine, id: string): string {
  const { ink, lift } = spec;
  const shape = `<path id="${id}-shape" d="${spec.d}"/>`;
  const gradient = `<linearGradient id="${id}-fill" gradientUnits="userSpaceOnUse" x1="0" y1="${spec.top}" x2="0" y2="${spec.bottom}">${GRADIENT_STOPS}</linearGradient>`;
  const clip = `<clipPath id="${id}-clip"><use href="#${id}-shape"/></clipPath>`;
  const layers = [
    `<use href="#${id}-shape" y="${lift}" fill="${INK}" stroke="${INK}" stroke-width="${ink + 2}" opacity="0.55"/>`,
    `<use href="#${id}-shape" fill="${INK}" stroke="${INK}" stroke-width="${ink}"/>`,
    spec.plugs ? `<path d="${spec.plugs}" fill="${INK}"/>` : '',
    `<use href="#${id}-shape" fill="url(#${id}-fill)"/>`,
    `<g clip-path="url(#${id}-clip)"><use href="#${id}-shape" y="${Math.round(ink / 8)}" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/></g>`,
  ];
  return `<defs>${shape}${gradient}${clip}</defs>${layers.join('')}`;
}

/**
 * A four-point sparkle with an ink outline. The group places it; the path inside twinkles in CSS.
 */
const sparkle = (x: number, y: number, size: number, delay: number): string =>
  `<g transform="translate(${x} ${y}) scale(${size})"><path class="twinkle" style="animation-delay:${delay}s" stroke-width="${(5 / size).toFixed(2)}" ` +
  `fill="#fff7d1" stroke="${INK}" d="M0-1C.1-.3.3-.1 1 0C.3.1.1.3 0 1C-.1.3-.3.1-1 0C-.3-.1-.1-.3 0-1Z"/></g>`;

/**
 * The SVG of the wordmark, with ids that are unique to `id` so that several copies can share a
 * page.
 */
export function logoMarkup(id: string): string {
  const lines = WORDMARK_LINES.map((spec, index) => line(spec, `${id}-${index}`)).join('');
  return (
    `<svg viewBox="0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}" aria-hidden="true" focusable="false" stroke-linejoin="round">` +
    `${lines}${sparkle(462, 34, 20, 0)}${sparkle(500, 84, 11, 0.7)}${sparkle(26, 196, 14, 1.3)}</svg>`
  );
}

let copies = 0;

/**
 * The wordmark as the page's heading. The loading screen and the title screen each have one, and
 * the first goes when loading ends.
 */
export function logo(): HTMLElement {
  const host = h('h1', { class: 'logo' });
  host.setAttribute('aria-label', GAME_NAME);
  host.innerHTML = logoMarkup(`logo${++copies}`);
  return host;
}
