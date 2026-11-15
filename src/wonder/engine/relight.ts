import { type DrawOptions, drawPic, type Pic } from './bank';
import type { RGB } from './color';

/**
 * Puts coloured light on a picture that is already drawn dark. The picture is drawn once more,
 * every pixel times the colour of the light, and added on top, so a friend under a red lamp is
 * warmer and keeps her own colours, and one under no lamp stays as dark as she was. The picture to
 * pass is the plain one, not the dark one.
 */
export class Relight {
  private scratch: HTMLCanvasElement | null = null;

  draw(
    g: CanvasRenderingContext2D,
    pic: Pic,
    x: number,
    y: number,
    light: RGB,
    strength: number,
    options: DrawOptions = {},
  ): void {
    if (strength <= 0.003) return;
    if (!this.scratch) this.scratch = document.createElement('canvas');
    const s = this.scratch;
    if (s.width < pic.sw) s.width = pic.sw;
    if (s.height < pic.sh) s.height = pic.sh;
    const c = s.getContext('2d')!;
    c.globalCompositeOperation = 'copy';
    c.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, pic.sw, pic.sh);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgb(${Math.round(light[0])},${Math.round(light[1])},${Math.round(light[2])})`;
    c.fillRect(0, 0, pic.sw, pic.sh);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, pic.sw, pic.sh);
    c.globalCompositeOperation = 'source-over';
    const before = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    drawPic(g, { image: s, sx: 0, sy: 0, sw: pic.sw, sh: pic.sh, ax: pic.ax, ay: pic.ay }, x, y, {
      ...options,
      alpha: Math.min(1, strength) * (options.alpha ?? 1),
    });
    g.globalCompositeOperation = before;
  }
}
