import { contactSheet, writePng } from '../core/image';
import { BOOK_COVERS, renderBook, renderCandles, renderCircle, renderGlobe } from './magic-interior';

const t0 = Date.now();
const group = process.argv[2] ?? 'books';
const frames =
  group === 'books'
    ? BOOK_COVERS.flatMap((c) => [0, 2, 4].map((f) => renderBook(c, f)))
    : group === 'globe'
      ? [0, 3, 6, 9].map((f) => renderGlobe(f))
      : group === 'candles'
        ? [0, 2, 4, 6].map((f) => renderCandles(f))
        : [0, 4, 8].map((f) => renderCircle(f));
console.log('rendered in', Date.now() - t0, 'ms');
writePng(
  `assets/source/_scratch/magic-interior-${group}-${Date.now()}.png`,
  contactSheet(frames, { cols: group === 'books' ? 6 : 4, scale: 1, bg: [226, 214, 250, 255], grid: true }),
);
