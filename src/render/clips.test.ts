import { describe, expect, it } from 'vitest';
import {
  COMPASS_EIGHT,
  EAST,
  mirrorOf,
  NORTH,
  NORTHEAST,
  NORTHWEST,
  SOUTH,
  SOUTHEAST,
  SOUTHWEST,
  stepsBetween,
  UNICORN_FACINGS,
  type UnicornFacing,
  WEST,
} from '../shared/compass';
import { type ActorAsset, type Clip, facingKey } from '../shared/manifest';
import { clipMs, frameAt, resolveClip, walkFrame } from './clips';

const clip = (loop: boolean, ms: number[]): Clip => ({ fps: 10, loop, frames: ms.map((m, rect) => ({ rect, ms: m })) });

describe('frameAt', () => {
  it('walks through frames by their own durations', () => {
    const c = clip(true, [900, 500, 160, 500]);
    expect(frameAt(c, 0)).toBe(0);
    expect(frameAt(c, 899)).toBe(0);
    expect(frameAt(c, 900)).toBe(1);
    expect(frameAt(c, 1400)).toBe(2);
    expect(frameAt(c, 1560)).toBe(3);
  });

  it('wraps a looping clip and holds the last frame of a one-shot', () => {
    expect(frameAt(clip(true, [100, 100]), 250)).toBe(0);
    expect(frameAt(clip(true, [100, 100]), 150)).toBe(1);
    expect(frameAt(clip(false, [100, 100, 100]), 5000)).toBe(2);
  });

  it('treats time before the start as the first frame', () => {
    expect(frameAt(clip(false, [100, 100]), -50)).toBe(0);
    expect(frameAt(clip(true, [100, 100]), -50)).toBe(1);
  });

  it('adds up to the clip length', () => {
    expect(clipMs(clip(true, [900, 500, 160, 500]))).toBe(2060);
  });
});

describe('walkFrame', () => {
  const c = clip(true, [83, 83, 83, 83, 83, 83, 83, 83]);
  it('covers every frame once per loop and wraps', () => {
    expect([0, 0.125, 0.5, 0.99].map((p) => walkFrame(c, p))).toEqual([0, 1, 4, 7]);
    expect(walkFrame(c, 3.25)).toBe(2);
    expect(walkFrame(c, -0.25)).toBe(6);
  });
});

/** A set of pictures keyed by facing, as the manifest keys them. */
const pictures = (entries: [UnicornFacing, Clip][]): ActorAsset['clips'][string] =>
  Object.fromEntries(entries.map(([facing, c]) => [facingKey(facing), c]));

describe('resolveClip', () => {
  const asset = {
    clips: {
      idle: pictures([
        [SOUTH, clip(true, [100])],
        [EAST, clip(true, [100, 100])],
      ]),
      graze: pictures([
        [EAST, clip(true, [100, 100, 100])],
        [WEST, clip(true, [100])],
      ]),
    },
  } as unknown as ActorAsset;

  it('returns the exact facing when it exists', () => {
    expect(resolveClip(asset, 'graze', WEST).frames).toHaveLength(1);
  });

  it('falls back to a side view for a facing the clip lacks', () => {
    expect(resolveClip(asset, 'graze', NORTH).frames).toHaveLength(3);
  });

  it('falls back to idle for an unknown clip', () => {
    expect(resolveClip(asset, 'nonsense', SOUTH).frames).toHaveLength(1);
  });

  it('says so when there is nothing to show', () => {
    const empty = { clips: { idle: {} } } as unknown as ActorAsset;
    expect(() => resolveClip(empty, 'idle', EAST)).toThrow('no clip idle');
    expect(() => resolveClip({ clips: {} } as unknown as ActorAsset, 'idle', EAST)).toThrow('no clip idle');
  });
});

describe('resolveClip with eight facings', () => {
  const marked = (frames: number, flip = false): Clip => ({
    ...clip(
      true,
      Array.from({ length: frames }, () => 100),
    ),
    ...(flip ? { flip: true as const } : {}),
  });
  const asset = {
    clips: {
      walk: pictures([
        [EAST, marked(1)],
        [WEST, marked(2)],
        [NORTH, marked(3)],
        [SOUTH, marked(4)],
        [NORTHWEST, marked(5)],
        [SOUTHWEST, marked(6)],
        [NORTHEAST, marked(5, true)],
        [SOUTHEAST, marked(6, true)],
      ]),
      cast: pictures([
        [EAST, marked(1)],
        [WEST, marked(2)],
        [NORTH, marked(3)],
        [SOUTH, marked(4)],
      ]),
      graze: pictures([
        [EAST, marked(1)],
        [WEST, marked(2)],
      ]),
    },
  } as unknown as ActorAsset;
  const frames = (name: string, facing: UnicornFacing): number => resolveClip(asset, name, facing).frames.length;

  it('gives each facing its own clip, and the flipped ones come marked to be flipped', () => {
    expect(frames('walk', NORTHWEST)).toBe(5);
    expect(frames('walk', SOUTHWEST)).toBe(6);
    expect(frames('walk', NORTH)).toBe(3);
    expect(resolveClip(asset, 'walk', NORTHEAST).flip).toBe(true);
    expect(resolveClip(asset, 'walk', SOUTHEAST).flip).toBe(true);
    expect(resolveClip(asset, 'walk', NORTHWEST).flip).toBeUndefined();
    expect(resolveClip(asset, 'walk', EAST).flip).toBeUndefined();
  });

  it('gives a clip drawn in four facings the side view for a diagonal, not the back or the front', () => {
    expect(frames('cast', NORTHWEST)).toBe(2);
    expect(frames('cast', SOUTHWEST)).toBe(2);
    expect(frames('cast', NORTHEAST)).toBe(1);
    expect(frames('cast', SOUTHEAST)).toBe(1);
  });

  it('gives a gesture drawn in side views the side she is nearer to', () => {
    expect(frames('graze', SOUTHWEST)).toBe(2);
    expect(frames('graze', NORTHEAST)).toBe(1);
    expect(frames('graze', NORTH)).toBe(1);
    expect(frames('graze', SOUTH)).toBe(1);
  });

  const shownFor = (name: string, want: UnicornFacing): UnicornFacing =>
    COMPASS_EIGHT.find((f) => resolveClip(asset, name, want) === asset.clips[name]![facingKey(f)])!;

  it('shows a facing between two of the eight as the nearer of them, at every one of the 32', () => {
    for (const want of UNICORN_FACINGS)
      expect(stepsBetween(shownFor('walk', want), want), `facing ${want}`).toBeLessThanOrEqual(2);
  });

  it('shows a facing and its mirror as mirrors of each other, so a turn looks the same either way', () => {
    // North and south are their own mirrors, so a clip with only side views has to pick one side
    // for them, and picks east.
    for (const name of ['walk', 'cast', 'graze'])
      for (const want of UNICORN_FACINGS)
        if (mirrorOf(want) !== want)
          expect(shownFor(name, mirrorOf(want)), `${name} facing ${want}`).toBe(mirrorOf(shownFor(name, want)));
    expect(shownFor('graze', NORTH)).toBe(EAST);
    expect(shownFor('graze', SOUTH)).toBe(EAST);
  });
});

describe('resolveClip with all 32 facings', () => {
  const asset = {
    clips: {
      walk: pictures(
        UNICORN_FACINGS.map((f): [UnicornFacing, Clip] => [
          f,
          clip(
            true,
            Array.from({ length: f + 1 }, () => 100),
          ),
        ]),
      ),
    },
  } as unknown as ActorAsset;

  it('gives every facing exactly its own clip', () => {
    for (const f of UNICORN_FACINGS) expect(resolveClip(asset, 'walk', f).frames).toHaveLength(f + 1);
  });

  it('gives the same clip object each time, so nothing is made for a frame that is drawn', () => {
    expect(resolveClip(asset, 'walk', 9)).toBe(resolveClip(asset, 'walk', 9));
  });
});
