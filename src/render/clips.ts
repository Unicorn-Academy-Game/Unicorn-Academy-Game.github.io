import { nearestAmong, parseFacing, UNICORN_FACINGS, type UnicornFacing } from '../shared/compass';
import { type ActorAsset, type Clip, facingKey } from '../shared/manifest';

/** Length of one pass through a clip, in milliseconds. */
export const clipMs = (clip: Clip): number => clip.frames.reduce((sum, f) => sum + f.ms, 0);

/**
 * The frame a clip shows `elapsedMs` after it began. Looping clips wrap and the others hold their
 * last frame, so a finished gesture stays at rest until the simulation moves on.
 */
export function frameAt(clip: Clip, elapsedMs: number): number {
  const total = clipMs(clip);
  let t = clip.loop ? ((elapsedMs % total) + total) % total : Math.min(Math.max(0, elapsedMs), total - 1);
  for (let i = 0; i < clip.frames.length; i++) {
    t -= clip.frames[i]!.ms;
    if (t < 0) return i;
  }
  return clip.frames.length - 1;
}

/**
 * The frame of a walk loop at `phase` loops in, where one loop is the clip's stride distance of
 * travel.
 */
export function walkFrame(clip: Clip, phase: number): number {
  const wrapped = phase - Math.floor(phase);
  return Math.min(clip.frames.length - 1, Math.floor(wrapped * clip.frames.length));
}

type ByFacing = ActorAsset['clips'][string];

/**
 * For each facing wanted, the clip a set of pictures shows for it. A set is never changed, so this
 * is made once for each.
 */
const chosen = new WeakMap<object, readonly Clip[]>();

/**
 * The clip for a name and facing. A clip that lacks the facing (a side-only gesture asked for
 * north, or the sheet of a device that holds only some facings) falls back to the nearest one it
 * has, a side view first, rather than drawing nothing, so a content mistake shows as a wrong pose
 * and not as a vanished unicorn.
 */
export function resolveClip(asset: ActorAsset, name: string, facing: UnicornFacing): Clip {
  const byFacing: ByFacing | undefined = asset.clips[name] ?? asset.clips.idle;
  if (!byFacing) throw new Error(`actor has no clip ${name}`);
  let table = chosen.get(byFacing);
  if (!table) {
    const have = Object.keys(byFacing).flatMap((key) => parseFacing(key) ?? []);
    if (have.length === 0) throw new Error(`actor has no clip ${name}`);
    table = UNICORN_FACINGS.map((want) => byFacing[facingKey(nearestAmong(have, want))]!);
    chosen.set(byFacing, table);
  }
  return table[facing]!;
}
