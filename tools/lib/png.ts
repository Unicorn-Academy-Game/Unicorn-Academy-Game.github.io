import { deflateSync, inflateSync } from 'node:zlib';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Straight (non-premultiplied) RGBA, row-major, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(body.buffer, body.byteOffset, body.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

function ihdr(width: number, height: number, bitDepth: number, colorType: number): Buffer {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width, 0);
  b.writeUInt32BE(height, 4);
  b[8] = bitDepth;
  b[9] = colorType;
  return b;
}

/**
 * Filter each scanline with the adaptive heuristic (min sum of absolute differences) for better
 * compression.
 */
function filterScanlines(raw: Uint8Array, rowBytes: number, bpp: number, height: number): Buffer {
  const out = Buffer.alloc((rowBytes + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(rowBytes));
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev ? prev[i]! : 0;
      const c = prev && i >= bpp ? prev[i - bpp]! : 0;
      const x = row[i]!;
      candidates[0]![i] = x;
      candidates[1]![i] = (x - a) & 0xff;
      candidates[2]![i] = (x - b) & 0xff;
      candidates[3]![i] = (x - ((a + b) >> 1)) & 0xff;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      candidates[4]![i] = (x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      const cand = candidates[f]!;
      for (let i = 0; i < rowBytes; i++) {
        const v = cand[i]!;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    out[y * (rowBytes + 1)] = best;
    candidates[best]!.copy(out, y * (rowBytes + 1) + 1);
  }
  return out;
}

/** `level` is zlib's, from 1 for a quick file to 9 for the smallest. */
export function encodePngRgba(image: RgbaImage, level = 9): Buffer {
  const { width, height, data } = image;
  const idat = deflateSync(filterScanlines(data, width * 4, 4, height), { level });
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr(width, height, 8, 6)),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array()),
  ]);
}

export interface IndexedImage {
  readonly width: number;
  readonly height: number;
  /** One palette index per pixel. */
  readonly indices: Uint8Array;
  /** Palette entries as RGBA; alpha of 0 marks transparent entries. */
  readonly palette: readonly (readonly [number, number, number, number])[];
}

/**
 * Writes an 8-bit palette PNG with a tRNS chunk. Pixel-art atlases shrink by roughly 4x versus
 * RGBA.
 */
export function encodePngIndexed(image: IndexedImage): Buffer {
  const { width, height, indices, palette } = image;
  if (palette.length > 256) throw new Error(`indexed PNG supports at most 256 colors, got ${palette.length}`);
  const plte = Buffer.alloc(palette.length * 3);
  const trns = Buffer.alloc(palette.length);
  palette.forEach(([r, g, b, a], i) => {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
    trns[i] = a;
  });
  let lastNonOpaque = -1;
  for (let i = 0; i < trns.length; i++) if (trns[i] !== 255) lastNonOpaque = i;
  const idat = deflateSync(filterScanlines(indices, width, 1, height), { level: 9 });
  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr(width, height, 8, 3)), chunk('PLTE', plte)];
  if (lastNonOpaque >= 0) parts.push(chunk('tRNS', trns.subarray(0, lastNonOpaque + 1)));
  parts.push(chunk('IDAT', idat), chunk('IEND', new Uint8Array()));
  return Buffer.concat(parts);
}

/**
 * Builds an indexed image from RGBA when the image has at most 256 distinct colors; otherwise
 * returns null.
 */
export function quantizeExact(image: RgbaImage): IndexedImage | null {
  const lookup = new Map<number, number>();
  const palette: [number, number, number, number][] = [];
  const indices = new Uint8Array(image.width * image.height);
  const d = image.data;
  for (let i = 0; i < indices.length; i++) {
    const a = d[i * 4 + 3]!;
    const key = a === 0 ? 0 : ((d[i * 4]! << 24) | (d[i * 4 + 1]! << 16) | (d[i * 4 + 2]! << 8) | a) >>> 0;
    let idx = lookup.get(key);
    if (idx === undefined) {
      if (palette.length >= 256) return null;
      idx = palette.length;
      palette.push(a === 0 ? [0, 0, 0, 0] : [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!, a]);
      lookup.set(key, idx);
    }
    indices[i] = idx;
  }
  return { width: image.width, height: image.height, indices, palette };
}

/**
 * The smallest PNG that holds an image exactly: a palette PNG when it has at most 256 colors, as
 * pixel art almost always does, and a plain RGBA one when it does not. Pixels that are fully
 * transparent are all stored as transparent black, which a browser draws the same whatever color
 * they had.
 */
export const encodePngCompact = (image: RgbaImage): Buffer => {
  const indexed = quantizeExact(image);
  return indexed ? encodePngIndexed(indexed) : encodePngRgba(image);
};

export function decodePng(buf: Uint8Array): RgbaImage {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.length);
  if (!b.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    const body = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8]!;
      colorType = body[9]!;
      interlace = body[12]!;
    } else if (type === 'PLTE') palette = Buffer.from(body);
    else if (type === 'tRNS') trns = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels =
    colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (channels === 0) throw new Error(`unsupported color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  const px = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)]!;
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[y * (rowBytes + 1) + 1 + i]!;
      const a = i >= channels ? px[y * rowBytes + i - channels]! : 0;
      const up = y > 0 ? px[(y - 1) * rowBytes + i]! : 0;
      const c = y > 0 && i >= channels ? px[(y - 1) * rowBytes + i - channels]! : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + up;
          break;
        case 3:
          v = x + ((a + up) >> 1);
          break;
        case 4: {
          const p = a + up - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
          break;
        }
        default:
          throw new Error(`bad filter ${filter}`);
      }
      px[y * rowBytes + i] = v & 0xff;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r: number,
      g: number,
      bl: number,
      a = 255;
    if (colorType === 6) {
      r = px[i * 4]!;
      g = px[i * 4 + 1]!;
      bl = px[i * 4 + 2]!;
      a = px[i * 4 + 3]!;
    } else if (colorType === 2) {
      r = px[i * 3]!;
      g = px[i * 3 + 1]!;
      bl = px[i * 3 + 2]!;
    } else if (colorType === 3) {
      const idx = px[i]!;
      r = palette![idx * 3]!;
      g = palette![idx * 3 + 1]!;
      bl = palette![idx * 3 + 2]!;
      a = trns && idx < trns.length ? trns[idx]! : 255;
    } else if (colorType === 4) {
      r = g = bl = px[i * 2]!;
      a = px[i * 2 + 1]!;
    } else {
      r = g = bl = px[i]!;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = bl;
    out[i * 4 + 3] = a;
  }
  return { width, height, data: out };
}
