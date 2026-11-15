import type { StrandId } from '../../../learning/play/maths/question';
import { picture } from '../../icons';

/**
 * The little pictures on the maths table's tiles, one for each kind of sum, drawn the way the rest
 * of the game's icons are.
 */

/** Four tiles, for going back to the tiles of the kinds of sum. */
export const ICON_GRID = picture(
  '<rect x="2.8" y="2.8" width="8" height="8" rx="2"/><rect x="13.2" y="2.8" width="8" height="8" rx="2"/><rect x="2.8" y="13.2" width="8" height="8" rx="2"/><rect x="13.2" y="13.2" width="8" height="8" rx="2"/>',
  '<g><rect x="4.6" y="4.6" width="4.4" height="4.4" rx="1" fill="#ff9fc4"/><rect x="15" y="4.6" width="4.4" height="4.4" rx="1" fill="#ffd75e"/><rect x="4.6" y="15" width="4.4" height="4.4" rx="1" fill="#8fd3ff"/><rect x="15" y="15" width="4.4" height="4.4" rx="1" fill="#a6e86c"/></g>',
);

const plus = 'M9.4 3h5.2v6.4H21v5.2h-6.4V21H9.4v-6.4H3V9.4h6.4z';
const plusInside = 'M11 6v5H6v2h5v5h2v-5h5v-2h-5V6z';

/**
 * The sign of adding and the sign of taking away, which a kind of sum at each level of the table
 * has.
 */
const PLUS = picture(`<path d="${plus}"/>`, `<path d="${plusInside}" fill="#9be564"/>`);
const MINUS = picture(
  '<rect x="2.6" y="8.8" width="18.8" height="6.4" rx="2.2"/>',
  '<rect x="4.4" y="10.6" width="15.2" height="2.8" rx="1" fill="#ff9a9a"/>',
);

export const STRAND_ICONS: Record<StrandId, string> = {
  count: picture(
    '<circle cx="6" cy="16.4" r="3.8"/><circle cx="12" cy="7.6" r="3.8"/><circle cx="18" cy="16.4" r="3.8"/>',
    '<g fill="#ffd75e"><circle cx="6" cy="16.4" r="2"/><circle cx="12" cy="7.6" r="2"/><circle cx="18" cy="16.4" r="2"/></g>',
  ),
  next: picture(
    '<circle cx="4.2" cy="12" r="2.6"/><circle cx="10.2" cy="12" r="2.6"/><path d="M14 8.4h4.2V5.2L23 12l-4.8 6.8v-3.2H14z"/>',
    '<g fill="#8fd3ff"><circle cx="4.2" cy="12" r="1.2"/><circle cx="10.2" cy="12" r="1.2"/></g>',
  ),
  more: picture(
    '<rect x="2.6" y="11" width="7.4" height="10" rx="1.6"/><rect x="13" y="3" width="7.8" height="18" rx="1.6"/>',
    '<rect x="4.4" y="12.8" width="3.8" height="6.4" rx="0.8" fill="#8fd3ff"/><rect x="14.9" y="4.8" width="4" height="14.4" rx="0.8" fill="#ff9fc4"/>',
  ),
  add: PLUS,
  take: MINUS,
  double: picture(
    '<circle cx="8.2" cy="12" r="6.2"/><circle cx="15.8" cy="12" r="6.2"/>',
    '<circle cx="8.2" cy="12" r="3.6" fill="#c9a2ff"/><circle cx="15.8" cy="12" r="3.6" fill="#8fd3ff"/>',
  ),
  tens: picture(
    '<rect x="2.6" y="2.6" width="5.6" height="18.8" rx="1.2"/><rect x="11.2" y="14.6" width="5" height="5" rx="1.1"/><rect x="17.8" y="14.6" width="5" height="5" rx="1.1"/>',
    '<path d="M2.6 7.3h5.6M2.6 12h5.6M2.6 16.7h5.6" stroke="#26183d" stroke-width="1" fill="none"/><rect x="12.4" y="15.8" width="2.6" height="2.6" fill="#ffd75e"/><rect x="19" y="15.8" width="2.6" height="2.6" fill="#ffd75e"/>',
  ),
  shape: picture(
    '<path d="M7 2.4 12.8 11.8H1.2z"/><circle cx="17.4" cy="7" r="4.8"/><rect x="11.2" y="13.2" width="10" height="9" rx="1.6"/>',
    '<path d="M7 5.6 10 10.4H4z" fill="#ff9fc4"/><circle cx="17.4" cy="7" r="2.6" fill="#ffd75e"/><rect x="13" y="15" width="6.8" height="5.4" rx="0.8" fill="#8fd3ff"/>',
  ),
  clock: picture(
    '<circle cx="12" cy="12" r="9.8"/>',
    '<circle cx="12" cy="12" r="7.6" fill="#fff4b8" stroke="#26183d" stroke-width="1"/><path d="M12 12V6.6M12 12l3.8 2.3" stroke="#26183d" stroke-width="1.9" stroke-linecap="round" fill="none"/>',
  ),
  pattern: picture(
    '<circle cx="5" cy="12" r="3.8"/><rect x="8.4" y="8.4" width="7.2" height="7.2" rx="1.2"/><circle cx="19" cy="12" r="3.8"/>',
    '<circle cx="5" cy="12" r="1.9" fill="#ffd75e"/><rect x="10.2" y="10.2" width="3.6" height="3.6" rx="0.6" fill="#ff9fc4"/><circle cx="19" cy="12" r="1.9" fill="#ffd75e"/>',
  ),
  plus: PLUS,
  minus: MINUS,
  times: picture(
    `<path d="${plus}" transform="rotate(45 12 12)"/>`,
    `<path d="${plusInside}" transform="rotate(45 12 12)" fill="#ffd75e"/>`,
  ),
  share: picture(
    '<rect x="2.8" y="9.6" width="18.4" height="4.8" rx="2.2"/><circle cx="12" cy="4.4" r="2.6"/><circle cx="12" cy="19.6" r="2.6"/>',
    '<rect x="4.6" y="11.2" width="14.8" height="1.6" rx="0.8" fill="#8fd3ff"/><circle cx="12" cy="4.4" r="1.2" fill="#8fd3ff"/><circle cx="12" cy="19.6" r="1.2" fill="#8fd3ff"/>',
  ),
  mixed: picture(
    '<path d="M5.4 6.8h3.2v3.6h3.6v3.2H8.6v3.6H5.4v-3.6H1.8v-3.2h3.6z"/><rect x="14.6" y="10.4" width="7.6" height="3.2" rx="1.2"/>',
    '<g fill="#c9a2ff"><rect x="6.2" y="8.4" width="1.6" height="7.2" rx="0.6"/><rect x="3.6" y="11.2" width="6.8" height="1.6" rx="0.6"/><rect x="16" y="11.2" width="4.8" height="1.6" rx="0.6"/></g>',
  ),
};
