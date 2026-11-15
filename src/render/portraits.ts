import type Phaser from 'phaser';
import { EAST } from '../shared/compass';
import { UNICORN_IDS, type UnicornId } from '../shared/ids';
import type { Manifest } from '../shared/manifest';
import { resolveClip } from './clips';
import { unicornTexture } from './keys';

/**
 * Which part of a standing unicorn, side on, a portrait keeps: the head, horn, mane and chest, as
 * fractions of her picture.
 */
const BUST = { x: 0.4, y: 0, w: 0.6, h: 0.74 } as const;

/** Each unicorn's portrait as a picture the page can show, keyed by her id. */
export type Portraits = Readonly<Record<UnicornId, string>>;

/**
 * Cuts a portrait of every unicorn out of her own sheet, for the parts of the screen that are drawn
 * in HTML and so cannot use the game's textures. The pictures are the ones she is drawn from in the
 * world, so a child knows her at once.
 */
export function drawPortraits(scene: Phaser.Scene, manifest: Manifest): Portraits {
  const portraits = {} as Record<UnicornId, string>;
  for (const id of UNICORN_IDS) {
    const asset = manifest.unicorns[id];
    const source = scene.textures.get(unicornTexture(id)).getSourceImage() as CanvasImageSource;
    const rect = asset.atlas.rects[resolveClip(asset, 'idle', EAST).frames[0]!.rect]!;
    const sx = rect.x + Math.floor(rect.w * BUST.x);
    const sy = rect.y + Math.floor(rect.h * BUST.y);
    const sw = Math.max(1, Math.round(rect.w * BUST.w));
    const sh = Math.max(1, Math.round(rect.h * BUST.h));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d')!.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    portraits[id] = canvas.toDataURL('image/png');
  }
  return portraits;
}
