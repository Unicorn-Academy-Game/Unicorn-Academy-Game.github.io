import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inCheckout, repositoryFiles } from './repository';
import { ROOT } from './source';

const BINARY = /\.(png|jpe?g|gif|webp|ico|mp3|wav|flac|ogg|m4a|mp4|webm|woff2?|ttf|otf|gz|zip|wasm)$/i;
const SELF = 'tests/architecture/open-source.test.ts';
const LOCKFILE = 'pnpm-lock.yaml';
/**
 * The licence texts of the works the build carries, as their authors wrote them, with the public
 * address some of them give.
 */
const NOTICES = 'THIRD_PARTY_NOTICES.md';

/** The text of every readable file, read once. A file over 20 MB is not one that anyone reads. */
const texts = new Map<string, string[]>();
for (const path of repositoryFiles) {
  if (BINARY.test(path) || path === SELF || statSync(`${ROOT}/${path}`).size > 20 << 20) continue;
  const text = readFileSync(`${ROOT}/${path}`, 'utf8');
  if (!text.includes('\0')) texts.set(path, text.split('\n'));
}

/** Where a line passes `test`, as `path:line`, so that a failure says where to look. */
function find(test: (line: string) => boolean, skip: (path: string) => boolean = () => false): string[] {
  const found: string[] = [];
  for (const [path, lines] of texts) {
    if (skip(path)) continue;
    lines.forEach((line, i) => {
      if (test(line)) found.push(`${path}:${i + 1}`);
    });
  }
  return found;
}

const has = (pattern: RegExp) => (line: string) => pattern.test(line);

describe.skipIf(!inCheckout)('a tree that is safe to publish', () => {
  it('holds no key, token or private key', () => {
    const secret =
      /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9]{32,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\bAIza[0-9A-Za-z_-]{35}\b/;
    expect(find(has(secret))).toEqual([]);
  });

  it('holds no email address except the placeholders that documentation uses', () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
    const placeholder = /@(?:example\.(?:com|org|net)|users\.noreply\.github\.com|noreply\.github\.com)$/;
    const isReal = (line: string): boolean => (line.match(email) ?? []).some((address) => !placeholder.test(address));
    expect(find(isReal, (path) => path === LOCKFILE || path === NOTICES)).toEqual([]);
  });

  it("names no folder on anyone's computer", () => {
    expect(find(has(/\/Users\/[A-Za-z][\w.-]*\/|\/home\/[a-z][\w.-]*\/|[A-Z]:\\Users\\/))).toEqual([]);
  });

  it('has nothing left of the hosting it used to have, in a file or in the lockfile', () => {
    expect(find(has(/cloudflare|wrangler|workers\.dev|pages\.dev|GATE_PASSWORD|durable object|\bjose\b/i))).toEqual([]);
  });

  it('points at no document that a reader of the repository does not have', () => {
    // A citation like "(spec 7.1)" or "the spec's order" names a text that is not here. Say the
    // rule itself.
    const citation =
      /\(spec (?:section )?\d|\bspec(?:\.|ification)? (?:section )?\d+(?:\.\d+)*\b|\bthe spec(?:'s)?\b|\bspec's\b|\bspec (?:asks|says|leaves)\b|\bdocs\/(?:plan-|HANDOFF|IMPLEMENTATION_STATUS)|\bMVP-Tech-Spec\b/i;
    expect(find(has(citation), (path) => path === LOCKFILE || path === NOTICES)).toEqual([]);
  });

  const termsFile = `${ROOT}/.audit/private-terms.txt`;
  it.skipIf(!existsSync(termsFile))(
    "holds none of the words on the maintainer's private list, which is not in the repository",
    () => {
      const terms = readFileSync(termsFile, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'))
        .map((line) => new RegExp(line, 'i'));
      expect(terms.length).toBeGreaterThan(0);
      expect(terms.flatMap((term) => find(has(term), (path) => path === LOCKFILE))).toEqual([]);
    },
  );
});
