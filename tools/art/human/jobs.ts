import { FACINGS, type Facing } from '../../../src/shared/ids';
import { CAST } from './index';

export interface NpcFrameJob {
  npc: string;
  clip: string;
  facing: Facing;
  frame: number;
}

export const jobKey = (j: NpcFrameJob): string => `${j.npc}/${j.clip}-${j.facing}-${String(j.frame).padStart(2, '0')}`;

/** Every frame of every grown-up, in an order that does not depend on what is already drawn. */
export function allNpcJobs(ids: readonly string[] = Object.keys(CAST)): NpcFrameJob[] {
  const jobs: NpcFrameJob[] = [];
  for (const npc of ids) {
    for (const [clip, spec] of Object.entries(CAST[npc]!.clips)) {
      for (const facing of FACINGS)
        for (let frame = 0; frame < spec.frames; frame++) jobs.push({ npc, clip, facing, frame });
    }
  }
  return jobs;
}
