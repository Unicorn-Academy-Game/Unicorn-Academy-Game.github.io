import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `pnpm notices` writes `THIRD_PARTY_NOTICES.md`: the notices of the works the game carries that
 * are not its own. `pnpm notices --check` fails when the file is not what the installed packages
 * say it should be. The text is copied from the packages, so an upgrade that changes a licence or a
 * copyright line shows up as a difference to read.
 */

export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';

/**
 * The licences a package that ends up in the build may have. Each lets the game be distributed
 * under the AGPL when its notice is kept.
 */
export const ALLOWED = ['MIT', 'ISC', 'OFL-1.1', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD'] as const;

/**
 * What each package the build carries is for. A package that is not here has not been looked at
 * yet, and the notices will not build without it.
 */
const PURPOSE: Record<string, string> = {
  phaser: 'The game engine.',
  zod: 'Checks the data the game reads before it is used.',
  idb: 'Keeps the saved world in the browser.',
  '@fontsource-variable/fredoka':
    'The Fredoka typeface, in the files the page loads, and the outlines of the title lettering in `src/ui/wordmark-paths.ts`, which `tools/art/wordmark.py` cut from it.',
};

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING'];

export interface Carried {
  name: string;
  version: string;
  license: string;
  purpose: string;
  source: string;
  text: string;
}

interface PackageJson {
  version: string;
  license?: string;
  homepage?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

const readJson = (path: string): PackageJson => JSON.parse(readFileSync(path, 'utf8')) as PackageJson;

/** A repository address a person can open: no `git+`, no user name, no `.git`. */
function openable(address: string): string {
  return address
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^(https?:\/\/)[^/@]+@/, '$1')
    .replace(/\.git$/, '');
}

const clean = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

/** The packages the game depends on at run time, as installed, with the text of each licence. */
export function carried(root: string = '.'): Carried[] {
  const own = readJson(join(root, 'package.json'));
  return Object.keys(own.dependencies ?? {})
    .sort()
    .map((name) => {
      const dir = join(root, 'node_modules', name);
      const pkg = readJson(join(dir, 'package.json'));
      const purpose = PURPOSE[name];
      if (!purpose)
        throw new Error(
          `${name} is carried by the game and has no line in PURPOSE in tools/licenses/notices.ts. Say what it is for, and check its licence`,
        );
      if (!pkg.license) throw new Error(`${name} does not say what its licence is`);
      const file = LICENSE_FILES.find((candidate) => existsSync(join(dir, candidate)));
      if (!file) throw new Error(`${name} has no licence file to copy`);
      const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
      const source = pkg.homepage ?? (repository ? openable(repository) : '');
      return {
        name,
        version: pkg.version,
        license: pkg.license,
        purpose,
        source,
        text: clean(readFileSync(join(dir, file), 'utf8')),
      };
    });
}

/**
 * Works the game carries that do not come from a package, or that were used to make files and are
 * not carried themselves.
 */
const ADAPTED = `The piano of lights, the game at the piano by the palace, is adapted from [ToneMatrix Redux](https://github.com/lupine-dev/ToneMatrixRedux) by Wolfy, which is under the GNU General Public License, version 3. The adapted files are in \`src/wonder/games/tonematrix/\`, each marked \`GPL-3.0-only\`. \`src/wonder/games/tonematrix/NOTICE.md\` lists them and \`LICENSES/GPL-3.0-only.txt\` holds the licence. The AGPL lets a work under the GPL, version 3, be combined with the rest of the game.`;

const MADE_WITH = `The pictures and the music are drawn and played by the code in this repository, so they are covered by the licence of the repository.

The spoken lessons were made with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), which is under the Apache License 2.0, in the voice \`af_heart\`, and checked with [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (MIT) and [wav2vec2-lv-60-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-lv-60-espeak-cv-ft) (Apache License 2.0). \`tools/voice/README.md\` names the exact versions. The files they wrote are the game's, and no part of the models is in the build.

The files were packed with FFmpeg, LAME and libwebp. They are tools, not parts of the build, and their licences cover the tools and not the files they wrote.`;

function noticesOf(works: readonly Carried[]): string {
  const sections = works.map((work) =>
    [
      `### ${work.name} ${work.version}`,
      '',
      `${work.purpose} Licence: ${work.license}.${work.source ? ` Source: <${work.source}>.` : ''}`,
      '',
      '```text',
      work.text,
      '```',
    ].join('\n'),
  );
  return [
    '# Third-party notices',
    '',
    'Generated by `pnpm notices`. Do not edit by hand: run the command again.',
    '',
    'Unicorn Academy the Fan Game is free software under the GNU Affero General Public License, version 3, in `LICENSE`. It carries the works below, each under its own licence, and keeps their notices as those licences ask.',
    '',
    '## In the build',
    '',
    sections.join('\n\n'),
    '',
    '## Adapted source',
    '',
    ADAPTED,
    '',
    '## Used to make the files',
    '',
    MADE_WITH,
    '',
  ].join('\n');
}

export const writtenNotices = (root: string = '.'): string => noticesOf(carried(root));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wanted = writtenNotices();
  if (process.argv.includes('--check')) {
    const have = existsSync(NOTICES_FILE) ? readFileSync(NOTICES_FILE, 'utf8') : '';
    if (have !== wanted) {
      console.error(`${NOTICES_FILE} is out of date. Run \`pnpm notices\` and read what changed`);
      process.exit(1);
    }
    console.log(`${NOTICES_FILE} is up to date`);
  } else {
    writeFileSync(NOTICES_FILE, wanted);
    console.log(`wrote ${NOTICES_FILE}`);
  }
}
