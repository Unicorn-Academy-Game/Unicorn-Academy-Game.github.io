import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIP_TIMING } from '../../src/shared/clips';
import { mirrorOf } from '../../src/shared/compass';
import { CLIP_NAMES } from '../../src/shared/ids';
import { type Clip, facingKey, Manifest } from '../../src/shared/manifest';
import { flippedClip } from '../../tools/assets/unicorns';

const drawn = (): Clip => ({
  fps: 12,
  loop: true,
  strideDistance: 152,
  frames: [
    { rect: 4, ms: 83, anchors: { horn: [30.2, 20.4], muzzle: [10, 100], back: [96, 50.7] } },
    { rect: 5, ms: 83 },
  ],
});

describe('a clip that is shown by flipping another', () => {
  it('turns every attachment point about the ground anchor and keeps the height of each', () => {
    const turned = flippedClip(drawn());
    expect(turned.frames[0]!.anchors).toEqual({ horn: [161.8, 20.4], muzzle: [182, 100], back: [96, 50.7] });
  });

  it('is marked flipped and shares the pictures and the timing of the clip it turns', () => {
    const source = drawn();
    const turned = flippedClip(source);
    expect(turned.flip).toBe(true);
    expect(turned.frames.map((f) => [f.rect, f.ms])).toEqual(source.frames.map((f) => [f.rect, f.ms]));
    expect(turned).toMatchObject({ fps: 12, loop: true, strideDistance: 152 });
    expect(turned.frames[1]!.anchors).toBeUndefined();
  });

  it('leaves the clip it turns as it was', () => {
    const source = drawn();
    flippedClip(source);
    expect(source).toEqual(drawn());
    expect(source.flip).toBeUndefined();
  });
});

describe('the clips that ship for the facings that are flipped', () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));

  it('are what turning the drawn facing makes, for every unicorn', () => {
    let checked = 0;
    for (const asset of Object.values(manifest.unicorns))
      for (const name of CLIP_NAMES)
        for (const facing of CLIP_TIMING[name].mirrored ?? []) {
          expect(asset.clips[name][facingKey(facing)]).toEqual(
            flippedClip(asset.clips[name][facingKey(mirrorOf(facing))]!),
          );
          checked++;
        }
    // Six unicorns, standing and walking, the northeast and the southeast.
    expect(checked).toBe(6 * 2 * 2);
  });

  it('use no picture of their own', () => {
    for (const asset of Object.values(manifest.unicorns)) {
      const used = new Set<number>();
      for (const byFacing of Object.values(asset.clips))
        for (const clip of Object.values(byFacing)) if (!clip.flip) for (const f of clip.frames) used.add(f.rect);
      for (const byFacing of Object.values(asset.clips))
        for (const clip of Object.values(byFacing))
          if (clip.flip) for (const f of clip.frames) expect(used.has(f.rect)).toBe(true);
    }
  });
});
