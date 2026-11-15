import { describe, expect, it } from 'vitest';
import {
  decodePng,
  encodePngCompact,
  encodePngIndexed,
  encodePngRgba,
  quantizeExact,
  type RgbaImage,
} from '../../tools/lib/png';

function gradientImage(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 7) & 255;
      data[i + 1] = (y * 13) & 255;
      data[i + 2] = ((x ^ y) * 5) & 255;
      data[i + 3] = (x + y) % 5 === 0 ? 0 : 255;
    }
  }
  return { width, height, data };
}

describe('png codec', () => {
  it('round-trips RGBA pixels exactly, including transparent pixels', () => {
    const img = gradientImage(37, 23);
    const back = decodePng(encodePngRgba(img));
    expect(back.width).toBe(37);
    expect(back.height).toBe(23);
    for (let i = 0; i < img.width * img.height; i++) {
      const a = img.data[i * 4 + 3]!;
      expect(back.data[i * 4 + 3]).toBe(a);
      if (a !== 0)
        expect(Array.from(back.data.subarray(i * 4, i * 4 + 3))).toEqual(
          Array.from(img.data.subarray(i * 4, i * 4 + 3)),
        );
    }
  });

  it('round-trips an indexed image and keeps palette transparency', () => {
    const palette = [
      [0, 0, 0, 0],
      [255, 0, 128, 255],
      [10, 200, 30, 255],
    ] as const;
    const indices = new Uint8Array([0, 1, 2, 1, 2, 0, 0, 1, 1]);
    const back = decodePng(encodePngIndexed({ width: 3, height: 3, indices, palette }));
    const alphas = Array.from({ length: 9 }, (_, i) => back.data[i * 4 + 3]);
    expect(alphas).toEqual([0, 255, 255, 255, 255, 0, 0, 255, 255]);
    expect(Array.from(back.data.subarray(4, 7))).toEqual([255, 0, 128]);
    expect(Array.from(back.data.subarray(8, 11))).toEqual([10, 200, 30]);
  });

  it('quantizeExact reproduces the source and refuses images with more than 256 colors', () => {
    const few = gradientImage(8, 8);
    const q = quantizeExact(few);
    expect(q).not.toBeNull();
    const back = decodePng(encodePngIndexed(q!));
    for (let i = 0; i < 64; i++) expect(back.data[i * 4 + 3]).toBe(few.data[i * 4 + 3]);
    const many = gradientImage(64, 64);
    expect(quantizeExact(many)).toBeNull();
  });

  it('produces a smaller file for indexed pixel art than for the same RGBA art', () => {
    const w = 128;
    const h = 128;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const on = ((x >> 3) + (y >> 3)) % 2 === 0;
        data[i] = on ? 200 : 40;
        data[i + 1] = on ? 120 : 60;
        data[i + 2] = on ? 220 : 90;
        data[i + 3] = 255;
      }
    const img = { width: w, height: h, data };
    expect(encodePngIndexed(quantizeExact(img)!).length).toBeLessThan(encodePngRgba(img).length);
  });

  describe('the compact form', () => {
    /** The colour type byte of the header: 3 is a palette, 6 is RGBA. */
    const colorType = (png: Buffer): number => png[25]!;

    function pixelArt(): RgbaImage {
      const w = 40;
      const h = 30;
      const colors = [
        [200, 30, 40],
        [30, 200, 40],
        [30, 40, 200],
        [250, 250, 20],
      ] as const;
      const data = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if ((x + y) % 3 === 0) {
            // Hidden pixels keep whatever colour they had, which is what a renderer leaves behind.
            data[i] = 77;
            data[i + 1] = 88;
            data[i + 2] = 99;
            data[i + 3] = 0;
          } else {
            const c = colors[(x * 3 + y) % 4]!;
            data.set([c[0], c[1], c[2], 255], i);
          }
        }
      return { width: w, height: h, data };
    }

    it('is a palette when the image has few colours, and holds every visible pixel and every alpha exactly', () => {
      const img = pixelArt();
      const png = encodePngCompact(img);
      expect(colorType(png)).toBe(3);
      const back = decodePng(png);
      for (let i = 0; i < img.width * img.height; i++) {
        expect(back.data[i * 4 + 3], `alpha of pixel ${i}`).toBe(img.data[i * 4 + 3]);
        if (img.data[i * 4 + 3] !== 0)
          expect(Array.from(back.data.subarray(i * 4, i * 4 + 3))).toEqual(
            Array.from(img.data.subarray(i * 4, i * 4 + 3)),
          );
        else expect(Array.from(back.data.subarray(i * 4, i * 4 + 3))).toEqual([0, 0, 0]);
      }
      expect(png.length).toBeLessThan(encodePngRgba(img).length);
    });

    it('is plain RGBA when the image has more than 256 colours, and then loses nothing', () => {
      const img = gradientImage(64, 64);
      const png = encodePngCompact(img);
      expect(colorType(png)).toBe(6);
      expect(Array.from(decodePng(png).data)).toEqual(Array.from(decodePng(encodePngRgba(img)).data));
    });
  });

  it('rejects data that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/not a PNG/);
  });
});
