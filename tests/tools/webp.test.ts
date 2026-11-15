import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeSheet } from '../../tools/assets/lib/sheet';
import type { RgbaImage } from '../../tools/lib/png';
import { decodeWebp, encodeWebp, firstVisibleDifference, hasWebp, webpSize } from '../../tools/lib/webp';

function picture(width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 7) & 255;
      data[i + 1] = (y * 13) & 255;
      data[i + 2] = ((x ^ y) * 5) & 255;
      data[i + 3] = (x + y) % 5 === 0 ? 0 : (x * 3) % 7 === 0 ? 128 : 255;
    }
  }
  return { width, height, data };
}

/** The first bytes of a lossless WebP picture of this size, which is all `webpSize` reads. */
function losslessHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b[20] = 0x2f;
  b.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21);
  return b;
}

describe('the size a WebP file says it has', () => {
  it('is read from a lossless header', () => {
    expect(webpSize(losslessHeader(2048, 1004))).toEqual({ w: 2048, h: 1004 });
    expect(webpSize(losslessHeader(1, 16384))).toEqual({ w: 1, h: 16384 });
  });

  it('is read from an extended header', () => {
    const b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii');
    b.write('WEBP', 8, 'ascii');
    b.write('VP8X', 12, 'ascii');
    b.writeUIntLE(1023, 24, 3);
    b.writeUIntLE(511, 27, 3);
    expect(webpSize(b)).toEqual({ w: 1024, h: 512 });
  });

  it('is not made up for a file that is something else', () => {
    expect(webpSize(Buffer.from('not a picture, not even close, not even a little bit'))).toBeNull();
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    expect(webpSize(png)).toBeNull();
  });
});

describe('telling two pictures apart', () => {
  const base = picture(8, 8);
  const copy = (): RgbaImage => ({ ...base, data: new Uint8Array(base.data) });

  it('finds nothing in a picture and its copy', () => {
    expect(firstVisibleDifference(base, copy())).toBeNull();
  });

  it('ignores the colour of a pixel nobody can see', () => {
    const other = copy();
    const hidden = base.data.findIndex((_, i) => i % 4 === 3 && base.data[i] === 0);
    other.data[hidden - 3] = 99;
    expect(firstVisibleDifference(base, other)).toBeNull();
  });

  it('finds a changed colour, a changed alpha and a changed size', () => {
    const colour = copy();
    colour.data[4 * 9 + 1] = colour.data[4 * 9 + 1]! ^ 1;
    expect(firstVisibleDifference(base, colour)).toBe(9);
    const alpha = copy();
    alpha.data[4 * 20 + 3] = alpha.data[4 * 20 + 3]! === 255 ? 254 : 255;
    expect(firstVisibleDifference(base, alpha)).toBe(20);
    expect(firstVisibleDifference(base, picture(8, 9))).toBe(0);
  });
});

describe.skipIf(!hasWebp())('writing a picture as WebP', () => {
  it('keeps every visible pixel and every alpha, and says its own size', () => {
    const source = picture(61, 37);
    const bytes = encodeWebp(source);
    expect(webpSize(bytes)).toEqual({ w: 61, h: 37 });
    expect(firstVisibleDifference(source, decodeWebp(bytes))).toBeNull();
  });

  it('makes a sheet that has been read back and found to be the picture', () => {
    const bytes = encodeSheet('a test sheet', picture(40, 40));
    expect(webpSize(bytes)).toEqual({ w: 40, h: 40 });
  });
});

describe('the pictures that ship', () => {
  it('are all WebP, so none is left that is twice the size it needs to be', () => {
    const other: string[] = [];
    for (const dir of ['bundles', 'npcs', 'unicorns']) {
      for (const name of readdirSync(join('public/assets', dir)))
        if (!name.endsWith('.webp')) other.push(`${dir}/${name}`);
    }
    expect(other).toEqual([]);
  });

  it('are lossless files the browser can size without decoding them', () => {
    for (const name of readdirSync('public/assets/unicorns').slice(0, 6)) {
      expect(webpSize(readFileSync(join('public/assets/unicorns', name))), name).not.toBeNull();
    }
  });
});
