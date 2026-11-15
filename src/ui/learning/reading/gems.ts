import type { Gem, Prize } from '../../../learning/reading/prizes';
import { h } from '../../dom';
import { prizeName } from './text';

/**
 * The stones and the coin the player wins, drawn flat with a dark edge like the game's other icons,
 * one colour each.
 */

const EDGE = 'stroke="#26183d" stroke-width="1.6" stroke-linejoin="round"';
const cut = (fill: string, light: string): string =>
  `<path d="M6.2 4h11.6l4.2 6L12 21 2 10z" fill="${fill}" ${EDGE}/><path d="M2.6 10h18.8M9.2 4.4 7.4 10 12 20M14.8 4.4 16.6 10 12 20" fill="none" stroke="${light}" stroke-width="1.1" stroke-linejoin="round" opacity="0.8"/>`;

const SHAPES: Record<Gem, string> = {
  diamond: cut('#8fe8ff', '#ffffff'),
  emerald: cut('#3fd98a', '#d6ffe8'),
  ruby: cut('#ff4f78', '#ffd0dc'),
  sapphire: cut('#4d7dff', '#cfdcff'),
  gold: `<circle cx="12" cy="12" r="9.2" fill="#ffc83d" ${EDGE}/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#c98a0a" stroke-width="1.5"/><path d="M12 8.6v6.8M9.6 10.4c.5-1 4.8-1.2 4.8.4 0 1.9-4.8.6-4.8 2.6 0 1.5 4.3 1.3 4.8.2" fill="none" stroke="#c98a0a" stroke-width="1.1" stroke-linecap="round"/>`,
};

const gemIcon = (gem: Gem): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SHAPES[gem]}</svg>`;

/**
 * A stone with a number beside it, which is a prize or a heap of one kind. The words are for a
 * screen reader and the picture is for the player.
 */
export function gemChip(prize: Prize, className = 'read-gem', counted = true): HTMLElement {
  const icon = h('span', { class: 'read-gem-icon', 'aria-hidden': 'true' });
  icon.innerHTML = gemIcon(prize.gem);
  return h(
    'span',
    { class: className, 'data-gem': prize.gem, role: 'img', 'aria-label': prizeName(prize) },
    icon,
    ...(counted ? [h('span', { class: 'read-gem-count', 'aria-hidden': 'true' }, String(prize.count))] : []),
  );
}
