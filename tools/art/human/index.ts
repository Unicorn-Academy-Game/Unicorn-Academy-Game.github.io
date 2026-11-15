import type { ClipSpec } from './clips';
import { GARDENER_CLIPS, STABLE_WORKER_CLIPS } from './clips';
import type { Character } from './frame';
import { gardener } from './gardener';
import { stableWorker } from './stable-worker';

export interface CastMember {
  character: Character;
  clips: Record<string, ClipSpec>;
}

/** Every drawn grown-up, with the clips each one has. */
export const CAST: Record<string, CastMember> = {
  gardener: { character: gardener, clips: GARDENER_CLIPS },
  'stable-worker': { character: stableWorker, clips: STABLE_WORKER_CLIPS },
};
