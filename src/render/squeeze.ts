import { MAX_IMAGE_CHARS } from '../shared/photos';

/** How hard the picture is squeezed, from the best the album takes down to the least. */
const QUALITY = [0.82, 0.66, 0.5] as const;

/** A picture the album can keep: a JPEG as a data URL, and how big it is. */
export interface Shot {
  image: string;
  w: number;
  h: number;
}

/**
 * Makes a canvas into a JPEG small enough to keep, squeezing harder until it is. Colours with hard
 * edges, like a drawing's, squeeze worse than a photograph, so when the least squeeze is still too
 * much the picture is made smaller. Answers null when no size is small enough.
 */
export function squeeze(canvas: HTMLCanvasElement, shrinks: readonly number[] = [1]): Shot | null {
  for (const shrink of shrinks) {
    const w = Math.max(16, Math.round(canvas.width * shrink));
    const h = Math.max(16, Math.round(canvas.height * shrink));
    let source = canvas;
    if (shrink !== 1) {
      const copy = document.createElement('canvas');
      copy.width = w;
      copy.height = h;
      const context = copy.getContext('2d');
      if (!context) return null;
      context.imageSmoothingQuality = 'high';
      context.drawImage(canvas, 0, 0, w, h);
      source = copy;
    }
    for (const quality of QUALITY) {
      const image = source.toDataURL('image/jpeg', quality);
      if (image.startsWith('data:image/jpeg;base64,') && image.length <= MAX_IMAGE_CHARS) return { image, w, h };
    }
  }
  return null;
}
