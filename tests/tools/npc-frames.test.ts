import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { humanArtVersion } from '../../tools/assets/npcs';

describe('the grown-up frames kept in the repository', () => {
  // Any edit to a file the art reads moves the key, a comment or a line break included. After one,
  // run `pnpm assets:build npcs` and commit the folder it renames.
  it('are filed under the key the art sources have now, so a clean checkout draws nothing', () => {
    expect(readdirSync('assets/source/npc-frames')).toEqual([humanArtVersion()]);
  });
});
