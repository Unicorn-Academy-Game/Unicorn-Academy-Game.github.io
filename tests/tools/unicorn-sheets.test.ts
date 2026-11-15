import { describe, expect, it } from 'vitest';
import { allFacings } from '../../src/shared/clips';
import {
  angleOf,
  EAST,
  facingAt,
  NORTHEAST,
  SOUTH,
  SOUTHEAST,
  UNICORN_FACINGS,
  type UnicornFacing,
} from '../../src/shared/compass';
import type { ClipName } from '../../src/shared/ids';
import { facingKey, type UnicornAsset } from '../../src/shared/manifest';
import { pictureOf, shippedManifest, silhouette } from '../../tools/lib/unicorn-pictures';

/**
 * The shipped sheets are checked as a person would check them: by what is drawn. The attachment
 * points of a facing sit where its angle puts them, and a facing looks like the facings beside it.
 * A fine facing at the wrong angle, in the wrong place on its canvas, or from the wrong frame fails
 * one of these, and a manifest check that only reads numbers would not see it.
 */
const UNICORNS = Object.entries(shippedManifest().unicorns);
const CLIPS_WITH_FINE: readonly ClipName[] = ['walk', 'idle'];

/** How much of two silhouettes is the same: what they share over what either covers. */
function overlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! & b[i]!) both++;
    if (a[i]! | b[i]!) either++;
  }
  return both / either;
}

/**
 * How much each facing overlaps the next one round the ring, when the picture shown for a facing is
 * the one `shown` names.
 */
function neighbours(
  asset: UnicornAsset,
  name: ClipName,
  frame: number,
  shown: (f: UnicornFacing) => UnicornFacing = (f) => f,
): number[] {
  const masks = UNICORN_FACINGS.map((f) => silhouette(pictureOf(asset, name, shown(f)), frame));
  return UNICORN_FACINGS.map((_, f) => overlap(masks[f]!, masks[(f + 1) % masks.length]!));
}

/**
 * The pose does not depend on the facing, so how far the muzzle is from the back swings with the
 * model: with the cosine of the angle across the picture, and with its sine down it, at the slope
 * of the camera. East and south are drawn in the first sheet and set how far across and how far
 * down, so which way the ring runs is fixed by them and not by the pictures being tested. Returns
 * how far from that, in pixels, the worst facing is when the picture shown for a facing is the one
 * `shown` names.
 */
function anchorMisfit(
  asset: UnicornAsset,
  name: ClipName,
  frame: number,
  shown: (f: UnicornFacing) => UnicornFacing = (f) => f,
): number {
  const reach = (f: UnicornFacing): { dx: number; dy: number } => {
    const a = pictureOf(asset, name, f).clip.frames[frame]!.anchors!;
    return { dx: a.muzzle![0] - a.back![0], dy: a.muzzle![1] - a.back![1] };
  };
  const east = reach(EAST);
  const south = reach(SOUTH);
  let worst = 0;
  for (const f of UNICORN_FACINGS) {
    const got = reach(shown(f));
    const angle = angleOf(f);
    worst = Math.max(
      worst,
      Math.abs(got.dx - east.dx * Math.cos(angle)),
      Math.abs(got.dy - (east.dy + (south.dy - east.dy) * Math.sin(angle))),
    );
  }
  return worst;
}

describe('the fine facings in the shipped sheets', () => {
  it('give standing and walking a drawn picture for every one of the 32 facings, and no facing two', () => {
    for (const [id, asset] of UNICORNS) {
      for (const name of CLIPS_WITH_FINE) {
        const fine = Object.keys(asset.fine?.clips[name] ?? {});
        const drawnFirst = Object.entries(asset.clips[name])
          .filter(([, clip]) => !clip.flip)
          .map(([key]) => key);
        expect(
          [...fine, ...drawnFirst].map(Number).sort((x, y) => x - y),
          `${id} ${name}`,
        ).toEqual([...allFacings(name)]);
      }
    }
  });

  it('have the muzzle and the back where the angle of the facing puts them, to the rounding of a tenth of a pixel', () => {
    for (const [id, asset] of UNICORNS) {
      for (const name of CLIPS_WITH_FINE) {
        const frames = pictureOf(asset, name, EAST).clip.frames.length;
        for (let frame = 0; frame < frames; frame++)
          expect(anchorMisfit(asset, name, frame), `${id} ${name} frame ${frame}`).toBeLessThan(0.35);
      }
    }
  });

  it('are drawn as neighbours of the facings beside them: each facing overlaps the next by more than half, all the way round', () => {
    for (const [id, asset] of UNICORNS) {
      for (const name of CLIPS_WITH_FINE) {
        for (const frame of [0, 2]) {
          const round = neighbours(asset, name, frame);
          expect(Math.min(...round), `${id} ${name} frame ${frame}`).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('are not just alike everywhere: a quarter turn apart overlaps far less than a step apart, so the check above says something', () => {
    for (const [id, asset] of UNICORNS) {
      for (const name of CLIPS_WITH_FINE) {
        const masks = UNICORN_FACINGS.map((f) => silhouette(pictureOf(asset, name, f), 0));
        const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
        const step = mean(masks.map((m, f) => overlap(m, masks[(f + 1) % 32]!)));
        const quarter = mean(masks.map((m, f) => overlap(m, masks[(f + 8) % 32]!)));
        expect(step - quarter, `${id} ${name}`).toBeGreaterThan(0.25);
      }
    }
  });

  it('would be noticed if two of them swapped places', () => {
    const [, asset] = UNICORNS[0]!;
    const swap = (f: UnicornFacing): UnicornFacing => (f === 5 ? 7 : f === 7 ? 5 : f) as UnicornFacing;
    expect(Math.min(...neighbours(asset, 'walk', 0, swap))).toBeLessThan(0.5);
    expect(anchorMisfit(asset, 'walk', 0, swap)).toBeGreaterThan(1);
  });

  it('would be noticed if the ring ran the other way, which neighbours alone cannot tell but the angle can', () => {
    const [, asset] = UNICORNS[0]!;
    const backwards = (f: UnicornFacing): UnicornFacing => facingAt(32 - f);
    expect(anchorMisfit(asset, 'walk', 0, backwards)).toBeGreaterThan(5);
  });

  it('agree with the first sheet where they draw what it flips: northeast and southeast look like the turned northwest and southwest', () => {
    for (const [id, asset] of UNICORNS) {
      for (const name of CLIPS_WITH_FINE) {
        for (const f of [NORTHEAST, SOUTHEAST]) {
          const flipped = silhouette({ sheet: asset.atlas, clip: asset.clips[name][facingKey(f)]! }, 0);
          const drawn = silhouette(pictureOf(asset, name, f), 0);
          expect(asset.clips[name][facingKey(f)]!.flip, `${id} ${name} ${f} is flipped in the first sheet`).toBe(true);
          expect(overlap(flipped, drawn), `${id} ${name} facing ${f}`).toBeGreaterThan(0.6);
        }
      }
    }
  });
});
