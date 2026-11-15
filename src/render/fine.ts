import { CLIP_NAMES } from '../shared/ids';
import type { ActorAsset, UnicornAsset } from '../shared/manifest';
import { finePage } from './keys';

/**
 * A unicorn's pictures with her fine facings laid over them: every clip of her first sheet, and for
 * the clips that have fine pictures, the one drawn for each facing, in place of any that the first
 * sheet shows flipped. A fine clip says which sheet it is on with `page`. This is a new object each
 * time, because `resolveClip` remembers its choice for each set of clips it has seen and a set is
 * never changed.
 */
export function withFine(asset: UnicornAsset): ActorAsset {
  const fine = asset.fine;
  if (!fine) return asset;
  const clips: ActorAsset['clips'] = { ...asset.clips };
  for (const name of CLIP_NAMES) {
    const drawn = fine.clips[name];
    if (drawn) clips[name] = { ...asset.clips[name], ...drawn };
  }
  return {
    atlas: asset.atlas,
    origin: asset.origin,
    shadow: asset.shadow,
    clips,
    ...(asset.crown ? { crown: asset.crown } : {}),
  };
}

/** The part of the engine's texture manager that tells whether a picture can be drawn. */
export interface TextureLookup {
  exists(key: string): boolean;
  get(key: string): { has(frame: string): boolean };
}

/**
 * Whether every fine sheet of a unicorn is in and cut into its pictures. A texture is in the
 * manager a moment before its pictures are cut, and a picture that is not cut cannot be drawn, so
 * the last of each sheet's is what says it is ready.
 */
export function fineDrawable(textures: TextureLookup, texture: string, asset: UnicornAsset): boolean {
  const sheets = asset.fine?.atlases ?? [];
  return (
    sheets.length > 0 &&
    sheets.every(
      (sheet, page) =>
        textures.exists(finePage(texture, page)) &&
        textures.get(finePage(texture, page)).has(String(sheet.rects.length - 1)),
    )
  );
}
