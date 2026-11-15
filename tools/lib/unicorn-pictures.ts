import { readFileSync } from 'node:fs';
import { resolveClip } from '../../src/render/clips';
import type { UnicornFacing } from '../../src/shared/compass';
import type { ClipName } from '../../src/shared/ids';
import { type Atlas, type Clip, facingKey, Manifest, type UnicornAsset } from '../../src/shared/manifest';
import { readPicture } from './picture';
import type { RgbaImage } from './png';

/** The manifest the game ships, read from where `pnpm assets:build` puts it. */
export const shippedManifest = (): Manifest =>
  Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));

const decoded = new Map<string, RgbaImage>();
function image(file: string): RgbaImage {
  let img = decoded.get(file);
  if (!img) {
    img = readPicture(`public/assets/${file}`);
    decoded.set(file, img);
  }
  return img;
}

export interface Picture {
  sheet: Atlas;
  clip: Clip;
}

/**
 * The picture drawn for a facing: the fine sheet's where there is one, which is the picture drawn
 * for exactly that facing, else the first sheet's.
 */
export function pictureOf(asset: UnicornAsset, name: ClipName, facing: UnicornFacing): Picture {
  const fine = asset.fine?.clips[name]?.[facingKey(facing)];
  if (fine) return { sheet: asset.fine!.atlases[fine.page]!, clip: fine };
  return { sheet: asset.atlas, clip: asset.clips[name][facingKey(facing)]! };
}

/**
 * The picture a device that never loads the fine sheets draws for a facing: the nearest one the
 * first sheet has.
 */
export const firstSheetPictureOf = (asset: UnicornAsset, name: ClipName, facing: UnicornFacing): Picture => ({
  sheet: asset.atlas,
  clip: resolveClip(asset, name, facing),
});

/**
 * The size of the canvas every picture of a unicorn is drawn on, in source pixels. Her ground
 * anchor is `asset.origin` on it.
 */
export const canvasOf = (asset: UnicornAsset): { width: number; height: number } => {
  const r = asset.atlas.rects[0]!;
  return { width: r.sw, height: r.sh };
};

/**
 * Which pixels of her canvas a frame covers, with a flipped clip turned about the middle of the
 * canvas as the view turns it.
 */
export function silhouette({ sheet, clip }: Picture, frame: number): Uint8Array {
  const r = sheet.rects[clip.frames[frame]!.rect]!;
  const img = image(sheet.file);
  const covered = new Uint8Array(r.sw * r.sh);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (img.data[((r.y + y) * img.width + r.x + x) * 4 + 3] === 0) continue;
      const column = r.ox + x;
      covered[(r.oy + y) * r.sw + (clip.flip ? r.sw - 1 - column : column)] = 1;
    }
  }
  return covered;
}
