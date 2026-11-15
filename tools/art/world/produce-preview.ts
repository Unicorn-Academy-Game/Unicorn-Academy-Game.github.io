import { FOOD_IDS } from '../../../src/content/produce';
import { contactSheet, writePng } from '../core/image';
import { renderProduce } from './produce';

/** Usage: tsx tools/art/world/produce-preview.ts */
const frames = FOOD_IDS.map((id) => renderProduce(id));
const out = process.argv[2] ?? 'assets/source/_scratch/produce.png';
writePng(out, contactSheet(frames, { cols: 7, scale: 6, bg: [112, 168, 110, 255], grid: true }));
console.log('wrote', out);
