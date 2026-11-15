import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ROOT } from './source';

function listFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: ROOT,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .split('\0')
      .filter((path) => path !== '' && existsSync(`${ROOT}/${path}`));
  } catch {
    return [];
  }
}

/**
 * Every file a `git add .` would take, so that a file that is new and not yet added is held to the
 * same rules as the rest. It is empty outside a git checkout, such as an unpacked zip, where there
 * is nothing to ask.
 */
export const repositoryFiles: string[] = listFiles();

/** The checks that read the files of the repository have nothing to read without a checkout. */
export const inCheckout = repositoryFiles.length > 0;
