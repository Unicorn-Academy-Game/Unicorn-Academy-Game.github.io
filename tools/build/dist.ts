import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Manifest } from '../../src/shared/manifest';
import { initialDownload } from '../assets/check/budgets';
import { referencedFiles, spokenFiles } from '../assets/check/files';
import { loadMaps } from '../assets/check/maps';
import { type BuiltPlan, type DistFile, makePlan } from './plan';

/** The finished build on disk, and the release plan worked out from it. */

export const SERVICE_WORKER = 'sw.js';

/**
 * Every file in the build, as a path from the folder it is served from. The service worker itself
 * is not part of the release it carries.
 */
function readDist(dir: string): DistFile[] {
  const out: DistFile[] = [];
  const visit = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      if (name === '.DS_Store') continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      const url = relative(dir, full).split(sep).join('/');
      if (url !== SERVICE_WORKER) out.push({ url, bytes: readFileSync(full) });
    }
  };
  visit(dir);
  return out;
}

export function planOf(dist: string): BuiltPlan {
  const assets = join(dist, 'assets');
  const manifest = Manifest.parse(JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')));
  const maps = loadMaps(assets, manifest);
  const asUrl = (file: string): string => `assets/${file}`;
  const all = new Set([...referencedFiles(manifest), 'manifest.json'].map(asUrl));
  const first = new Set(initialDownload(assets, manifest, maps).map((cost) => asUrl(cost.file)));
  const voice = new Set([...spokenFiles(manifest)].map(asUrl));
  return makePlan(readDist(dist), { all, first, voice });
}
