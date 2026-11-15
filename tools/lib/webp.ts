import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePngRgba, type RgbaImage } from './png';

/**
 * Lossless WebP for the pictures the game ships. The files are made and read back with `cwebp` and
 * `dwebp`, which come with libwebp (`brew install webp`, `apt install webp`). A sheet of pixel art
 * comes out about half the size of the same sheet as a PNG, and every browser the game runs in
 * draws it the same way.
 */

/** Whether the libwebp tools can be run here. */
export function hasWebp(): boolean {
  return ['cwebp', 'dwebp'].every((tool) => spawnSync(tool, ['-version']).status === 0);
}

/**
 * libwebp's effort level for a lossless picture, from 0 to 9. At 8 a sheet takes about a second and
 * is within a fifth of a percent of the size that 9 takes twenty seconds to find.
 */
const EFFORT = '8';

/**
 * Runs a libwebp tool on a scratch copy of the bytes it is given, and removes the copy afterwards.
 */
function withScratch<T>(name: string, bytes: Uint8Array, use: (input: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'ua-webp-'));
  try {
    const input = join(dir, name);
    writeFileSync(input, bytes);
    return use(input, dir);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(
        'cwebp and dwebp are needed to make the pictures. Install libwebp: brew install webp, or apt install webp',
        { cause },
      );
    throw cause;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The picture as a lossless WebP. Fully transparent pixels may come back with another colour, which
 * nothing draws.
 */
export function encodeWebp(image: RgbaImage): Buffer {
  return withScratch('in.png', encodePngRgba(image, 1), (input, dir) => {
    const output = join(dir, 'out.webp');
    execFileSync('cwebp', ['-quiet', '-lossless', '-z', EFFORT, input, '-o', output]);
    return readFileSync(output);
  });
}

/** A WebP file as straight RGBA pixels. */
export function decodeWebp(bytes: Uint8Array): RgbaImage {
  const pam = withScratch('in.webp', bytes, (input) =>
    execFileSync('dwebp', ['-quiet', '-pam', input, '-o', '-'], { maxBuffer: 1 << 30 }),
  );
  const end = pam.indexOf('ENDHDR\n');
  if (end < 0) throw new Error('dwebp did not answer with a PAM picture');
  const header = pam.toString('ascii', 0, end);
  const width = Number(/WIDTH (\d+)/.exec(header)?.[1]);
  const height = Number(/HEIGHT (\d+)/.exec(header)?.[1]);
  const data = pam.subarray(end + 'ENDHDR\n'.length);
  if (!(width > 0 && height > 0) || data.length !== width * height * 4)
    throw new Error(`dwebp answered with ${data.length} bytes for a ${width}x${height} picture`);
  return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/**
 * The pixel number of the first difference that could be seen, or null when the two pictures are
 * drawn the same.
 */
export function firstVisibleDifference(a: RgbaImage, b: RgbaImage): number | null {
  if (a.width !== b.width || a.height !== b.height) return 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const alpha = a.data[i * 4 + 3]!;
    if (alpha !== b.data[i * 4 + 3]) return i;
    if (
      alpha !== 0 &&
      (a.data[i * 4] !== b.data[i * 4] ||
        a.data[i * 4 + 1] !== b.data[i * 4 + 1] ||
        a.data[i * 4 + 2] !== b.data[i * 4 + 2])
    )
      return i;
  }
  return null;
}

/**
 * The size a WebP file says its picture is, or null for a file that is not a lossless or extended
 * WebP.
 */
export function webpSize(bytes: Uint8Array): { w: number; h: number } | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  return null;
}
