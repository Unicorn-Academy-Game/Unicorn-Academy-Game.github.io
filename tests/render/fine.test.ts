import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../../src/render/clips';
import { fineDrawable, type TextureLookup, withFine } from '../../src/render/fine';
import { finePage, unicornTexture } from '../../src/render/keys';
import { allFacings, CLIP_TIMING } from '../../src/shared/clips';
import { EAST, NORTHEAST, nearestAmong, parseFacing, SOUTHEAST, UNICORN_FACINGS } from '../../src/shared/compass';
import { CLIP_NAMES } from '../../src/shared/ids';
import { facingKey, Manifest, type UnicornAsset } from '../../src/shared/manifest';

const manifest = Manifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const UNICORNS = Object.entries(manifest.unicorns);
const wildstar = (): UnicornAsset => manifest.unicorns.wildstar;

describe('a unicorn with her fine facings laid over her first sheet', () => {
  it('has a clip for every one of the 32 facings of walking and standing, each drawn for exactly that facing', () => {
    for (const [id, asset] of UNICORNS) {
      const merged = withFine(asset);
      for (const name of ['walk', 'idle'] as const) {
        const have = Object.keys(merged.clips[name]!)
          .map((k) => parseFacing(k)!)
          .sort((a, b) => a - b);
        expect(have, `${id} ${name}`).toEqual([...UNICORN_FACINGS]);
        for (const f of UNICORN_FACINGS)
          expect(merged.clips[name]![facingKey(f)]!.flip, `${id} ${name} ${f}`).toBeUndefined();
      }
    }
  });

  it('draws northeast and southeast from the picture drawn for them, in place of the first sheet turning the other side round', () => {
    const asset = wildstar();
    const merged = withFine(asset);
    for (const f of [NORTHEAST, SOUTHEAST]) {
      expect(asset.clips.walk[facingKey(f)]!.flip).toBe(true);
      expect(merged.clips.walk![facingKey(f)]).toBe(asset.fine!.clips.walk![facingKey(f)]);
    }
  });

  it('keeps the facings that the first sheet draws, and the clips that have no fine facings, as they were', () => {
    const asset = wildstar();
    const merged = withFine(asset);
    for (const f of CLIP_TIMING.walk.facings)
      expect(merged.clips.walk![facingKey(f)]).toBe(asset.clips.walk[facingKey(f)]);
    for (const name of CLIP_NAMES) if (!CLIP_TIMING[name].fine) expect(merged.clips[name]).toBe(asset.clips[name]);
  });

  it("leaves the first sheet's own clips alone, because a set of clips is never changed", () => {
    const asset = wildstar();
    const before = JSON.stringify(asset.clips);
    withFine(asset);
    expect(JSON.stringify(asset.clips)).toBe(before);
    expect(Object.keys(asset.clips.walk)).toHaveLength(8);
  });

  it('is what it was when there are no fine sheets', () => {
    const { fine: _, ...first } = wildstar();
    expect(withFine(first as UnicornAsset)).toBe(first);
  });

  it('puts each fine clip on a sheet she has, and a clip of the first sheet on none', () => {
    for (const [id, asset] of UNICORNS) {
      const merged = withFine(asset);
      for (const name of ['walk', 'idle'] as const) {
        for (const f of UNICORN_FACINGS) {
          const clip = merged.clips[name]![facingKey(f)]!;
          const drawnFirst = CLIP_TIMING[name].facings.includes(f);
          if (drawnFirst) expect(clip.page, `${id} ${name} ${f}`).toBeUndefined();
          else expect(clip.page, `${id} ${name} ${f}`).toBeLessThan(asset.fine!.atlases.length);
        }
      }
    }
  });
});

describe('choosing the picture for a facing', () => {
  it('is the picture drawn for exactly that facing once the fine facings are laid over, for all 32', () => {
    for (const [id, asset] of UNICORNS) {
      const merged = withFine(asset);
      for (const name of ['walk', 'idle'] as const) {
        for (const f of UNICORN_FACINGS)
          expect(resolveClip(merged, name, f), `${id} ${name} ${f}`).toBe(merged.clips[name]![facingKey(f)]);
      }
    }
  });

  it('is the nearest of the eight before they are, which is what every unicorn showed before there were 32', () => {
    const asset = wildstar();
    for (const f of UNICORN_FACINGS) {
      const nearest = nearestAmong([...CLIP_TIMING.walk.facings, ...CLIP_TIMING.walk.mirrored!], f);
      expect(resolveClip(asset, 'walk', f)).toBe(asset.clips.walk[facingKey(nearest)]);
    }
  });

  it('is the same picture before and after for the eight that the first sheet draws', () => {
    const asset = wildstar();
    const merged = withFine(asset);
    for (const f of CLIP_TIMING.walk.facings)
      expect(resolveClip(merged, 'walk', f)).toBe(resolveClip(asset, 'walk', f));
  });

  it('does not turn a clip that has no fine facings into one that has, such as casting', () => {
    const merged = withFine(wildstar());
    for (const f of UNICORN_FACINGS) expect(resolveClip(merged, 'cast', f)).toBe(resolveClip(wildstar(), 'cast', f));
  });

  it('answers for every facing from what a clip has, however few it has', () => {
    const merged = withFine(wildstar());
    for (const name of CLIP_NAMES) {
      expect(allFacings(name).length).toBeGreaterThan(0);
      for (const f of UNICORN_FACINGS) expect(resolveClip(merged, name, f).frames.length).toBeGreaterThan(0);
    }
    expect(EAST).toBe(0);
  });
});

describe('knowing when a unicorn can be drawn from her fine sheets', () => {
  /** A texture manager holding the given sheets, each with pictures cut up to the given index. */
  const manager = (cut: Record<string, number>): TextureLookup => ({
    exists: (key) => key in cut,
    get: (key) => ({ has: (frame) => Number(frame) <= cut[key]! }),
  });
  const asset = wildstar();
  const last = (page: number): number => asset.fine!.atlases[page]!.rects.length - 1;
  const key = (page: number): string => finePage(unicornTexture('wildstar'), page);

  it('is no before any has come', () => {
    expect(fineDrawable(manager({}), unicornTexture('wildstar'), asset)).toBe(false);
  });

  it('is no while one sheet is in and the others are not, because a clip may be on any of them', () => {
    expect(fineDrawable(manager({ [key(0)]: last(0) }), unicornTexture('wildstar'), asset)).toBe(false);
    const allButLast = Object.fromEntries(asset.fine!.atlases.slice(0, -1).map((_, page) => [key(page), last(page)]));
    expect(fineDrawable(manager(allButLast), unicornTexture('wildstar'), asset)).toBe(false);
  });

  it('is no while a sheet is in and its pictures are not cut yet, which a texture is for a moment', () => {
    const all = Object.fromEntries(asset.fine!.atlases.map((_, page) => [key(page), last(page)]));
    expect(fineDrawable(manager({ ...all, [key(1)]: 3 }), unicornTexture('wildstar'), asset)).toBe(false);
    expect(fineDrawable(manager({ ...all, [key(1)]: -1 }), unicornTexture('wildstar'), asset)).toBe(false);
  });

  it('is yes once every sheet is in with every picture cut', () => {
    const all = Object.fromEntries(asset.fine!.atlases.map((_, page) => [key(page), last(page)]));
    expect(fineDrawable(manager(all), unicornTexture('wildstar'), asset)).toBe(true);
  });

  it('is never yes for a unicorn with no fine sheets', () => {
    const { fine: _, ...first } = asset;
    expect(fineDrawable(manager({ [key(0)]: last(0) }), unicornTexture('wildstar'), first as UnicornAsset)).toBe(false);
  });

  it('keys a sheet after its unicorn and its place among her sheets', () => {
    expect(finePage('unicorn:storm', 1)).toBe('unicorn:storm:1');
  });
});
