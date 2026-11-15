import { readFileSync } from 'node:fs';
import { crop, upscale, writePng } from '../art/core/image';
import { decodePng } from '../lib/png';

/**
 * Crops a PNG and enlarges it with hard pixels. Usage: tsx tools/qa/zoom.ts in.png x,y,w,h scale
 * out.png
 */
const [input, box, scale, out] = process.argv.slice(2);
if (!input || !box || !scale || !out) throw new Error('usage: zoom.ts in.png x,y,w,h scale out.png');
const png = decodePng(new Uint8Array(readFileSync(input)));
const [x, y, w, h] = box.split(',').map(Number) as [number, number, number, number];
writePng(out, upscale(crop({ width: png.width, height: png.height, data: png.data }, x, y, w, h), Number(scale)));
console.log(`wrote ${out}`);
