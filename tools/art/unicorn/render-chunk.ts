import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writePng } from '../core/image';
import { clipPose } from './anims';
import { UNICORNS } from './characters';
import { makeKit, renderFrame } from './frame';
import { allJobs, jobKey } from './jobs';
import type { Kit } from './kit';

/**
 * Child process of tools/assets/unicorns.ts. Renders every `count`th job starting at `index` into
 * `outDir`, skipping frames that already exist, so an interrupted batch resumes where it stopped.
 * Usage: tsx render-chunk.ts <outDir> <index> <count>
 */
const [outDir, indexArg, countArg] = process.argv.slice(2);
if (!outDir || indexArg === undefined || countArg === undefined)
  throw new Error('usage: render-chunk <outDir> <index> <count>');
const index = Number(indexArg);
const count = Number(countArg);

const kits = new Map<string, Kit>();
let done = 0;
allJobs().forEach((job, i) => {
  if (i % count !== index) return;
  const base = join(outDir, jobKey(job));
  if (existsSync(`${base}.json`)) return;
  const spec = UNICORNS[job.unicorn];
  let kit = kits.get(job.unicorn);
  if (!kit) {
    kit = makeKit(spec);
    kits.set(job.unicorn, kit);
  }
  const fr = renderFrame(kit, clipPose(spec, job.clip, job.frame, job.facing), job.facing);
  mkdirSync(dirname(base), { recursive: true });
  writePng(`${base}.png`, fr.rgba);
  // The sidecar is written last: its presence marks the frame as complete.
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ horn: fr.anchors.horn, muzzle: fr.anchors.muzzle, back: fr.anchors.back, feet: fr.anchors.feet }),
  );
  done++;
});
console.log(`chunk ${index}: rendered ${done}`);
