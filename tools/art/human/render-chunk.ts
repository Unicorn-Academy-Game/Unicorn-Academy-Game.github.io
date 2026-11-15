import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writePng } from '../core/image';
import { renderHuman } from './frame';
import { CAST } from './index';
import { allNpcJobs, jobKey } from './jobs';

/**
 * Child process of tools/assets/npcs.ts. Draws every `count`th frame starting at `index` into
 * `outDir`, skipping frames that exist. A frame is written under a temporary name and renamed, so a
 * killed run never leaves a half-written picture. Usage: tsx render-chunk.ts <outDir> <index>
 * <count>
 */
const [outDir, indexArg, countArg] = process.argv.slice(2);
if (!outDir || indexArg === undefined || countArg === undefined)
  throw new Error('usage: render-chunk <outDir> <index> <count>');
const index = Number(indexArg);
const count = Number(countArg);

let done = 0;
allNpcJobs().forEach((job, i) => {
  if (i % count !== index) return;
  const file = join(outDir, `${jobKey(job)}.png`);
  if (existsSync(file)) return;
  const member = CAST[job.npc]!;
  const clip = member.clips[job.clip]!;
  const keyed = clip.at(job.frame / clip.frames, job.facing);
  const frame = renderHuman(member.character, keyed.pose, job.facing, keyed.extras);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writePng(tmp, frame.rgba);
  renameSync(tmp, file);
  done++;
});
console.log(`npc chunk ${index}: rendered ${done}`);
