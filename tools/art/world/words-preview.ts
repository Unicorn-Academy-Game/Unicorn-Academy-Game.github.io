import type { Rgba } from '../core/image';
import { contactSheet, writePng } from '../core/image';
import { WORD_DRAWINGS } from './words';
import { GARDEN } from './words/garden';
import { MANOR } from './words/manor';
import { NATURE } from './words/nature';
import { PALACE } from './words/palace';
import { TREASURE } from './words/treasure';

/**
 * Usage: tsx tools/art/world/words-preview.ts [nature|palace|manor|garden|treasure|all] [scale]
 * [out]
 */
const groups: Record<string, Record<string, () => Rgba>> = {
  nature: NATURE,
  palace: PALACE,
  manor: MANOR,
  garden: GARDEN,
  treasure: TREASURE,
  all: WORD_DRAWINGS,
};
const which = process.argv[2] ?? 'nature';
const scale = Number(process.argv[3] ?? 5);
const out = process.argv[4] ?? `/tmp/words-${which}.png`;
const draws = groups[which];
if (!draws) throw new Error(`No group ${which}`);
const names = Object.keys(draws);
const frames = names.map((name) => draws[name]!());
writePng(out, contactSheet(frames, { cols: which === 'all' ? 11 : 6, scale, bg: [120, 170, 120, 255], grid: true }));
console.log('wrote', out, names.join(' '));
