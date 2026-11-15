import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLOWED, carried, NOTICES_FILE, writtenNotices } from '../../tools/licenses/notices';
import { inCheckout, repositoryFiles } from './repository';
import { ROOT } from './source';

const CODE = /^(?:src|tools|tests)\/.*\.(?:ts|py|css)$/;
const HEADER = /SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)/;
/**
 * The one place whose files are not under the licence of the rest: the files adapted from a work
 * under the GPL.
 */
const ADAPTED = (path: string): boolean =>
  (path.startsWith('src/wonder/games/tonematrix/') && path.endsWith('.ts')) ||
  path === 'src/wonder/games/tone-matrix.ts';

/** The identifier a file declares in its first lines, if it declares one. */
const declared = (path: string): string | undefined =>
  HEADER.exec(readFileSync(`${ROOT}/${path}`, 'utf8').split('\n').slice(0, 6).join('\n'))?.[1];

describe('the licences of the repository', () => {
  it('are the AGPL for the whole, and the same for the package that says so', () => {
    expect(readFileSync(`${ROOT}/LICENSE`, 'utf8')).toMatch(
      /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/,
    );
    expect(JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')).license).toBe('AGPL-3.0-only');
  });

  it.skipIf(!inCheckout)(
    'keep the files adapted from a work under the GPL marked, and keep every other file free of that mark',
    () => {
      const marked = repositoryFiles.filter((path) => CODE.test(path) && declared(path) === 'GPL-3.0-only').sort();
      const adapted = repositoryFiles.filter(ADAPTED).sort();
      expect(adapted.length).toBeGreaterThan(0);
      expect(marked).toEqual(adapted);
    },
  );

  it.skipIf(!inCheckout)('declare only licences whose text is in LICENSES', () => {
    const used = new Set(repositoryFiles.filter((path) => CODE.test(path)).flatMap((path) => declared(path) ?? []));
    expect([...used].sort()).toEqual(['GPL-3.0-only']);
    for (const id of used) expect(existsSync(`${ROOT}/LICENSES/${id}.txt`), id).toBe(true);
  });

  it('keep a notice for the adapted work next to its files', () => {
    expect(existsSync(`${ROOT}/src/wonder/games/tonematrix/NOTICE.md`)).toBe(true);
  });
});

describe('the works the build carries', () => {
  it('are all under a licence that lets the game be shared under the AGPL', () => {
    for (const work of carried(ROOT))
      expect(ALLOWED as readonly string[], `${work.name} is ${work.license}`).toContain(work.license);
  });

  it('have their notices in the notices file, exactly as the installed packages say', () => {
    expect(readFileSync(`${ROOT}/${NOTICES_FILE}`, 'utf8'), `run \`pnpm notices\``).toBe(writtenNotices(ROOT));
  });
});
