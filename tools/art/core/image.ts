import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePngRgba } from '../../lib/png';

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createRgba(width: number, height: number, fill?: readonly [number, number, number, number]): Rgba {
  const data = new Uint8Array(width * height * 4);
  if (fill) for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return { width, height, data };
}

/** Source-over composite of `src` onto `dst` at integer offset. */
export function blit(dst: Rgba, src: Rgba, x0: number, y0: number): void {
  for (let y = 0; y < src.height; y++) {
    const dy = y + y0;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x + x0;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3]!;
      if (a === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      if (a === 255) {
        dst.data[di] = src.data[si]!;
        dst.data[di + 1] = src.data[si + 1]!;
        dst.data[di + 2] = src.data[si + 2]!;
        dst.data[di + 3] = 255;
      } else {
        const t = a / 255;
        dst.data[di] = Math.round(src.data[si]! * t + dst.data[di]! * (1 - t));
        dst.data[di + 1] = Math.round(src.data[si + 1]! * t + dst.data[di + 1]! * (1 - t));
        dst.data[di + 2] = Math.round(src.data[si + 2]! * t + dst.data[di + 2]! * (1 - t));
        dst.data[di + 3] = Math.max(dst.data[di + 3]!, a);
      }
    }
  }
}

/** Nearest-neighbour integer upscale. */
export function upscale(src: Rgba, k: number): Rgba {
  const out = createRgba(src.width * k, src.height * k);
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < out.width; x++) {
      const si = (sy * src.width + Math.floor(x / k)) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = src.data[si + 3]!;
    }
  }
  return out;
}

export function crop(src: Rgba, x0: number, y0: number, w: number, h: number): Rgba {
  const out = createRgba(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + x0,
        sy = y + y0;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      out.data.set(src.data.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return out;
}

/** Tight bounding box of non-transparent pixels, or null when empty. */
export function alphaBounds(src: Rgba): { x: number; y: number; w: number; h: number } | null {
  let minX = src.width,
    minY = src.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export interface SheetOpts {
  cols: number;
  scale?: number;
  bg?: readonly [number, number, number, number];
  gap?: number;
  /** Draw a thin cell frame so canvas edges and clipping are visible. */
  grid?: boolean;
}

/** Lays frames out on a grid, upscaled by an integer factor over a background. */
export function contactSheet(frames: readonly Rgba[], o: SheetOpts): Rgba {
  const scale = o.scale ?? 1;
  const gap = o.gap ?? 2;
  const cw = Math.max(...frames.map((f) => f.width)) * scale;
  const ch = Math.max(...frames.map((f) => f.height)) * scale;
  const rows = Math.ceil(frames.length / o.cols);
  const sheet = createRgba(o.cols * (cw + gap) + gap, rows * (ch + gap) + gap, o.bg ?? [58, 66, 92, 255]);
  frames.forEach((f, i) => {
    const cx = gap + (i % o.cols) * (cw + gap);
    const cy = gap + Math.floor(i / o.cols) * (ch + gap);
    if (o.grid) {
      for (let x = 0; x < cw; x++) {
        for (const y of [0, ch - 1]) sheet.data.set([255, 255, 255, 40], ((cy + y) * sheet.width + cx + x) * 4);
      }
      for (let y = 0; y < ch; y++) {
        for (const x of [0, cw - 1]) sheet.data.set([255, 255, 255, 40], ((cy + y) * sheet.width + cx + x) * 4);
      }
    }
    blit(sheet, scale === 1 ? f : upscale(f, scale), cx, cy);
  });
  return sheet;
}

export function writePng(path: string, img: Rgba): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePngRgba(img));
}
