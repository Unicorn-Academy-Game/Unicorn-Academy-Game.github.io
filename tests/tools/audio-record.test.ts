import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashFiles, PACK_SOURCES, RENDER_SOURCES } from '../../tools/assets/lib/audio-sources';

const record = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`assets/source/audio/${name}.json`, 'utf8'));

describe('the audio build kept in the repository', () => {
  // Any edit to a file the sounds are made or packed from moves a hash, a comment or a line break
  // included. After one, run `pnpm assets:build audio` and commit the three records it rewrites.
  it('is recorded under the hashes the sources have now, so a clean checkout draws nothing', () => {
    const fix = 'run `pnpm assets:build audio` and commit assets/source/audio';
    expect(record('build').sourceHash, fix).toBe(hashFiles(PACK_SOURCES));
    expect(record('report').sourceHash, fix).toBe(hashFiles(PACK_SOURCES));
    expect(new Set(Object.values(record('masters'))), fix).toEqual(new Set([hashFiles(RENDER_SOURCES)]));
  });
});
