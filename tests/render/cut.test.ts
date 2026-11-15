import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORD_IDS, WORDS } from '../../src/content/lexicon';
import { firstFrameOf } from '../../src/render/cut';
import { Manifest } from '../../src/shared/manifest';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));

describe('cutting a picture out of an atlas', () => {
  it('finds the first picture of a sprite, inside the page it is on', () => {
    const { page, rect } = firstFrameOf(manifest, 'life', 'frog-green-sit');
    const atlas = manifest.bundles.life!.pages[page]!;
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(atlas.width);
    expect(rect.y + rect.h).toBeLessThanOrEqual(atlas.height);
  });

  it('finds one for every word that is a sprite, of a size that is worth showing', () => {
    let sprites = 0;
    for (const id of WORD_IDS) {
      const picture = WORDS[id].picture;
      if (picture.kind !== 'sprite') continue;
      sprites += 1;
      const { page, rect } = firstFrameOf(manifest, picture.bundle, picture.sprite);
      const atlas = manifest.bundles[picture.bundle]!.pages[page]!;
      expect(rect.x + rect.w, id).toBeLessThanOrEqual(atlas.width);
      expect(rect.y + rect.h, id).toBeLessThanOrEqual(atlas.height);
      // Small enough to be pixel art that scales up crisply, and big enough to be seen as
      // something.
      expect(Math.max(rect.w, rect.h), id).toBeGreaterThanOrEqual(16);
      expect(Math.max(rect.w, rect.h), id).toBeLessThanOrEqual(128);
    }
    expect(sprites, 'most words are pictures cut from a sprite').toBeGreaterThan(20);
  });

  it('says which sprite is missing, and from which bundle', () => {
    expect(() => firstFrameOf(manifest, 'life', 'no-such-sprite')).toThrow('no-such-sprite in the life bundle');
    expect(() => firstFrameOf(manifest, 'no-such-bundle', 'frog-green-sit')).toThrow('no-such-bundle');
  });
});
