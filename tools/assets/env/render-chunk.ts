import { existsSync } from 'node:fs';
import { allFrames, cacheFile, renderOne } from './render';

/**
 * Child process: draws every n-th frame of the whole recipe list that is not drawn yet. The share a
 * process takes is decided by position in the full list, never by what is missing, so processes
 * that start at different moments still split the work without gaps or overlap. Usage:
 * render-chunk.ts <index> <count>
 */
const index = Number(process.argv[2]);
const count = Number(process.argv[3]);
const frames = allFrames((await import('./registry')).RECIPES);
let done = 0;
for (let i = index; i < frames.length; i += count) {
  const { recipe, frame } = frames[i]!;
  if (existsSync(cacheFile(recipe, frame))) continue;
  renderOne(recipe, frame);
  done++;
}
console.log(`env chunk ${index}: ${done} frames`);
