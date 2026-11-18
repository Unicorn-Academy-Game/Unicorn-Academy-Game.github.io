import { contactSheet, writePng } from '../core/image';
import { renderMagicHall } from './magic-hall';

const t0 = Date.now();
const frames = [0, 2].map((f) => renderMagicHall(f));
console.log('rendered in', Date.now() - t0, 'ms');
writePng(
  `assets/source/_scratch/magic-hall-${Date.now()}.png`,
  contactSheet(frames, { cols: 2, scale: 1, bg: [110, 170, 120, 255], grid: true }),
);
