import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every .ts file under a directory of the repo, as repo-relative posix paths. */
export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(relative(ROOT, p).split('\\').join('/'));
    }
  };
  walk(join(ROOT, dir));
  return out.sort();
}

/** Every stylesheet under a directory of the repo, as repo-relative posix paths. */
export function styleSheets(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.css')) out.push(relative(ROOT, p).split('\\').join('/'));
    }
  };
  walk(join(ROOT, dir));
  return out.sort();
}

export interface Stripped {
  /** The file with comments removed. Strings are kept, so import paths can be read. */
  withStrings: string;
  /**
   * The file with comments removed and the inside of every string blanked, so tokens in prose and
   * data are not code.
   */
  code: string;
}

/**
 * Removes comments and string contents. Handles quotes, escapes and template literals, which is all
 * this codebase uses.
 */
export function strip(src: string): Stripped {
  let withStrings = '';
  let code = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') {
          withStrings += '\n';
          code += '\n';
        }
        i++;
      }
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      withStrings += c;
      code += c;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') {
          withStrings += src[i]! + (src[i + 1] ?? '');
          code += '  ';
          i += 2;
          continue;
        }
        withStrings += src[i];
        code += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      withStrings += c;
      code += c;
      i++;
    } else {
      withStrings += c;
      code += c;
      i++;
    }
  }
  return { withStrings, code };
}

/**
 * Module specifiers a file imports, re-exports or dynamically imports. The statements are found in
 * the code with its strings blanked, so a word like `import` inside a string is not mistaken for
 * one, and each specifier is then read from the same place in the text that still has its strings.
 */
export function specifiers({ code, withStrings }: Stripped): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]*)['"]/dg,
    /\bimport\s*['"]([^'"]*)['"]/dg,
    /\bimport\s*\(\s*['"]([^'"]*)['"]\s*\)/dg,
    /\brequire\s*\(\s*['"]([^'"]*)['"]\s*\)/dg,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      const [from, to] = m.indices![1]!;
      out.push(withStrings.slice(from, to));
    }
  }
  return out;
}

/** Where a relative import lands, as a repo-relative posix path without extension. */
export function resolveImport(fromFile: string, spec: string): string {
  return relative(ROOT, resolve(ROOT, dirname(fromFile), spec))
    .split('\\')
    .join('/');
}
