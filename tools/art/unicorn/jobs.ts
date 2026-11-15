import type { UnicornFacing } from '../../../src/shared/compass';
import type { ClipName, UnicornId } from '../../../src/shared/ids';
import { CLIPS } from './anims';
import { UNICORN_IDS } from './characters';

export interface FrameJob {
  unicorn: UnicornId;
  clip: ClipName;
  facing: UnicornFacing;
  frame: number;
}

export const jobKey = (j: FrameJob): string => `${j.unicorn}/${j.clip}-${j.facing}-${String(j.frame).padStart(2, '0')}`;

/** The frames of every clip in each of the facings `pick` names for it, for every unicorn. */
function jobsFor(
  ids: readonly UnicornId[],
  pick: (def: (typeof CLIPS)[ClipName]) => readonly UnicornFacing[],
): FrameJob[] {
  const jobs: FrameJob[] = [];
  for (const unicorn of ids) {
    for (const [clip, def] of Object.entries(CLIPS) as [ClipName, (typeof CLIPS)[ClipName]][]) {
      for (const facing of pick(def))
        for (let frame = 0; frame < def.frames; frame++) jobs.push({ unicorn, clip, facing, frame });
    }
  }
  return jobs;
}

/**
 * Every frame of the first sheet. A mirrored facing is not one of them: it shows another's frame,
 * flipped.
 */
export const baseJobs = (ids: readonly UnicornId[] = UNICORN_IDS): FrameJob[] => jobsFor(ids, (def) => def.facings);

/**
 * Every frame of the fine sheets: the facings that fill in between those of the first sheet, drawn
 * as they are, not flipped.
 */
export const fineJobs = (ids: readonly UnicornId[] = UNICORN_IDS): FrameJob[] => jobsFor(ids, (def) => def.fine ?? []);

/** Every frame that has to be drawn for every unicorn. */
export const allJobs = (ids: readonly UnicornId[] = UNICORN_IDS): FrameJob[] => [...baseJobs(ids), ...fineJobs(ids)];
