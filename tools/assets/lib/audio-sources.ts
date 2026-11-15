import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What changes the sound itself, and what changes it only in how it is packed. The audio build
 * keeps the hash of each in `assets/source/audio` and draws again when it moves.
 */
export const RENDER_SOURCES = ['tools/audio', 'src/shared/audio.ts', 'src/shared/ids.ts'];
export const PACK_SOURCES = [
  ...RENDER_SOURCES,
  'tools/assets/audio.ts',
  'tools/assets/lib/audio-sources.ts',
  'tools/assets/lib/ffmpeg.ts',
];

/** A fingerprint of the files listed, ignoring the development listening tools. */
export const hashFiles = (sources: readonly string[]): string => {
  const hash = createHash('sha1');
  const walk = (path: string): void => {
    if (!existsSync(path)) return;
    const stat = readdirSync(path, { withFileTypes: true });
    for (const entry of stat.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !/^try-/.test(entry.name)) hash.update(full).update(readFileSync(full));
    }
  };
  for (const p of sources) {
    if (p.endsWith('.ts')) hash.update(p).update(readFileSync(p));
    else walk(p);
  }
  return hash.digest('hex').slice(0, 12);
};
