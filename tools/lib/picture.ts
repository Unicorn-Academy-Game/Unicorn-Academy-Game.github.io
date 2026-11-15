import { readFileSync } from 'node:fs';
import { decodePng, type RgbaImage } from './png';
import { decodeWebp } from './webp';

/** A picture from a file as the pixels it holds, read as WebP or PNG by its name. */
export function readPicture(path: string): RgbaImage {
  const bytes = new Uint8Array(readFileSync(path));
  return path.endsWith('.webp') ? decodeWebp(bytes) : decodePng(bytes);
}
