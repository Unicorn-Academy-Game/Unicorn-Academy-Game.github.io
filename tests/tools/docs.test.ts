import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The documents a reader follows. A path or command that has gone stale in one of them sends the
 * reader nowhere.
 */
const DOCS = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  ...readdirSync('docs')
    .filter((f) => f.endsWith('.md'))
    .map((f) => join('docs', f)),
];

/**
 * Named in the docs, but made by a build or by the reader, so a clean checkout does not have them.
 */
const MADE_LATER = new Set([
  'dist',
  'assets/source/frames',
  'assets/source/env-cache',
  'assets/source/_scratch',
  'test-results',
  'out.png',
]);

/** A folder that a build or the reader makes has things inside it that are made later too. */
const madeLater = (path: string): boolean =>
  [...MADE_LATER].some((made) => path === made || path.startsWith(`${made}/`));

const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);

/**
 * A span that names a repository path: it has a slash or a file extension and no placeholder, glob
 * or space.
 */
function pathOf(span: string): string | null {
  if (/[\s<>*{}$=]|^https?:|^window\.|^\?|^@/.test(span)) return null;
  const path = span.replace(/\/$/, '');
  if (madeLater(path)) return null;
  if (path.includes('/') && /^[\w.@-]+(\/[\w.@-]+)+$/.test(path)) return path;
  if (/^[\w.-]+\.(md|json|jsonc|ts|example|yml)$/.test(path) || path === '.node-version') return path;
  return null;
}

describe.each(DOCS)('%s', (file) => {
  const text = readFileSync(file, 'utf8');
  const spans = codeSpans(text);

  it('names only files and folders that exist', () => {
    const missing = spans.map(pathOf).filter((p): p is string => p !== null && !existsSync(p));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('links only to files that exist', () => {
    const targets = [...text.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)\)/g)]
      .map((m) => m[1]!.split('#')[0]!)
      .filter((target) => target !== '' && !/^[a-z]+:/.test(target));
    const missing = targets.filter((target) => !existsSync(join(dirname(file), target)));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('names only pnpm scripts that exist', () => {
    const missing: string[] = [];
    for (const span of spans) {
      const word = /^pnpm (?!exec |install|add |dlx )([\w:-]+)/.exec(span)?.[1];
      if (word !== undefined && !(word in scripts)) missing.push(span);
    }
    expect(missing).toEqual([]);
  });

  it('uses no long dash and no curly quotes', () => {
    expect(text.match(/[\u2014\u2013\u2018\u2019\u201c\u201d]/g) ?? []).toEqual([]);
  });
});
