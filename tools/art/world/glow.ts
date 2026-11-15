import type { RGB } from '../core/color';
import { blit, createRgba, type Rgba } from '../core/image';

/**
 * Returns `sprite` drawn over a soft round glow. The glow is part of the pixels, so it costs
 * nothing at runtime.
 */
export function underGlow(
  sprite: Rgba,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  strength: number,
): Rgba {
  const out = createRgba(sprite.width, sprite.height);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d >= 1) continue;
      // Quantized to a few steps so the halo keeps the pixel-art look instead of a smooth airbrush.
      const t = Math.floor((1 - d) * 5) / 5;
      const a = Math.round(strength * t * t * 255);
      if (a > 0) out.data.set([color[0], color[1], color[2], a], (y * out.width + x) * 4);
    }
  }
  blit(out, sprite, 0, 0);
  return out;
}
