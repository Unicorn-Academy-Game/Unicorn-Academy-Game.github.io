import type { RGB } from '../core/color';
import type { Rgba } from '../core/image';

export type Color = readonly [number, number, number] | readonly [number, number, number, number];

/**
 * Hard-edged painting straight onto a rendered sprite, for details that must land on exact pixels.
 */
export class Painter {
  constructor(readonly img: Rgba) {}

  get w(): number {
    return this.img.width;
  }

  get h(): number {
    return this.img.height;
  }

  /** Writes one pixel, replacing what was there. */
  px(x: number, y: number, c: Color): void {
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return;
    const i = (y * this.img.width + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = c.length === 4 ? c[3] : 255;
  }

  /** Blends a color over what is there. */
  over(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return;
    const i = (y * this.img.width + x) * 4;
    const d = this.img.data;
    const da = d[i + 3]! / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((c[k]! * a + d[i + k]! * da * (1 - a)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }

  get(x: number, y: number): [number, number, number, number] {
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return [0, 0, 0, 0];
    const i = (y * this.img.width + x) * 4;
    const d = this.img.data;
    return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) this.px(px, py, c);
  }

  /** Fills every pixel whose center a test accepts, within a box. */
  fill(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    inside: (x: number, y: number) => boolean,
    color: (x: number, y: number) => Color | null,
  ): void {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        const c = color(x, y);
        if (c) this.px(x, y, c);
      }
    }
  }

  /** A straight line of one pixel, Bresenham. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
}
