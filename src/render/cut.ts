import type Phaser from 'phaser';
import type { Manifest, Rect } from '../shared/manifest';
import { pageTexture } from './keys';

/**
 * Where the first picture of a sprite sits in its bundle's atlas. A sprite that is not there
 * throws, which the tests of the content find long before a child can.
 */
export function firstFrameOf(manifest: Manifest, bundleId: string, sprite: string): { page: number; rect: Rect } {
  const frame = manifest.bundles[bundleId]?.sprites[sprite]?.frames[0];
  const rect = frame && manifest.bundles[bundleId]?.pages[frame.page]?.rects[frame.rect];
  if (!frame || !rect) throw new Error(`There is no sprite ${sprite} in the ${bundleId} bundle.`);
  return { page: frame.page, rect };
}

/**
 * The first picture of a sprite as an image the page can show, for the parts of the game that are
 * drawn in HTML and cannot use the game's textures. It is the picture the world draws, so a child
 * knows it at once.
 */
export function cutSprite(scene: Phaser.Scene, manifest: Manifest, bundleId: string, sprite: string): string {
  const { page, rect } = firstFrameOf(manifest, bundleId, sprite);
  const source = scene.textures.get(pageTexture(bundleId, page)).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  canvas.getContext('2d')!.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return canvas.toDataURL('image/png');
}
