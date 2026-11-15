import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inCheckout, repositoryFiles } from './repository';
import { ROOT } from './source';

const SELF = 'tests/architecture/prose.test.ts';
const NOTICES = 'THIRD_PARTY_NOTICES.md';
const CODE = /\.(?:ts|css|mjs)$/;
const WRITTEN = /\.(?:ts|css|mjs|html|md|ya?ml)$/;
const TEST = /(?:^tests\/|\.test\.ts$)/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * Where a line of a file matching `kinds` passes `test`, as `path:line`, so that a failure says
 * where to look.
 */
function find(kinds: RegExp, test: (line: string, path: string) => boolean): string[] {
  const found: string[] = [];
  for (const path of repositoryFiles) {
    if (path === SELF || path === NOTICES || !kinds.test(path)) continue;
    readFileSync(`${ROOT}/${path}`, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (test(line, path)) found.push(`${path}:${i + 1}`);
      });
  }
  return found;
}

describe.skipIf(!inCheckout)('the prose in the repository', () => {
  it('has no comment that is a line of dashes, equals signs or stars', () => {
    const banner = /^\s*(?:\/\/|\/\*+|\*)\s*[-=*#~_]{6,}/;
    expect(find(CODE, (line) => banner.test(line))).toEqual([]);
  });

  it('has no long dash, which a comma, a colon or two sentences say better', () => {
    expect(find(WRITTEN, (line) => /[\u2013\u2014]/.test(line))).toEqual([]);
  });

  it('writes a quote or an apostrophe in a comment or a test title as a plain one', () => {
    const curly = /[\u2018\u2019\u201c\u201d]/;
    const escapedInTitle = /^\s*(?:it|test|describe)(?:\.\w+)*\(\s*['"`].*\\u201[89cd]/i;
    const wrong = (line: string, path: string): boolean =>
      (curly.test(line) && (TEST.test(path) || COMMENT.test(line))) || escapedInTitle.test(line);
    expect(find(CODE, wrong)).toEqual([]);
  });

  it('names no milestone of the work it was made in, since nobody reading the code has that list', () => {
    const milestone = /\bM\d{1,3}\b(?!\.\d)/;
    expect(find(CODE, (line) => COMMENT.test(line) && milestone.test(line))).toEqual([]);
  });
});
