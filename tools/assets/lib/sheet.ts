import type { RgbaImage } from '../../lib/png';
import { decodeWebp, encodeWebp, firstVisibleDifference } from '../../lib/webp';

/** Where a sheet's file ends. Every picture the game draws from comes in this form. */
export const SHEET_EXTENSION = 'webp';

/**
 * A sheet as the file the game ships. The file is read back and has to hold every visible pixel and
 * every alpha of the sheet, so a smaller file can never be a different picture.
 */
export function encodeSheet(label: string, image: RgbaImage): Buffer {
  const bytes = encodeWebp(image);
  const at = firstVisibleDifference(image, decodeWebp(bytes));
  if (at !== null) throw new Error(`${label} does not come back from its file as it went in, at pixel ${at}`);
  return bytes;
}
