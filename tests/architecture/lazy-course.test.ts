import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, resolveImport, type Stripped, sourceFiles, strip } from './source';

/**
 * The reading course is large: its stages, words and sentences, and the engine that deals them.
 * Only a child who sits down at the computer needs it, so the game loads it
 * as a chunk of its own the first time that happens. The games of the tables are chunks too, for
 * the same reason. This is the rule that keeps it so: nothing the page loads to start can reach
 * them by a plain import. A dynamic `import()` is how they are reached, and that is allowed, and so
 * is a type, which is gone when the code is built.
 */

/**
 * Where the lazy chunks live: the reading course, and then the games of the memory and maths tables
 * with what the tables share.
 */
const LAZY = [
  'src/content/reading/',
  'src/learning/reading/',
  'src/learning/course-clips',
  'src/game/reader',
  'src/game/reading',
  'src/ui/learning/reading',
  'src/audio/reading',
  'src/learning/play/',
  'src/game/desk',
  'src/game/maths',
  'src/game/memory',
  'src/game/play-ports',
  'src/ui/learning/play/',
  'src/audio/play-sounds',
];

/**
 * What the boot code imports when the player sits down at a table: the session, the screen and the
 * sounds of each, which are the whole of its chunk.
 */
const ENTRIES = [
  'src/audio/play-sounds.ts',
  'src/audio/reading-sounds.ts',
  'src/game/maths-game.ts',
  'src/game/memory-game.ts',
  'src/game/reader.ts',
  'src/ui/learning/play/maths-screen.ts',
  'src/ui/learning/play/memory-screen.ts',
  'src/ui/learning/reading/screen.ts',
];

/**
 * The files a file imports with an import that is kept when the code is built: not a type, and not
 * a dynamic `import()`.
 */
function keptImports({ code, withStrings }: Stripped): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]*)['"]/dg,
    /\bimport\s*()['"]([^'"]*)['"]/dg,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      if (m[1]) continue;
      const [from, to] = m.indices![2]!;
      out.push(withStrings.slice(from, to));
    }
  }
  return out;
}

/** The files a file reaches with a dynamic `import()`, which the build makes a chunk of. */
function lazyImports({ code, withStrings }: Stripped): string[] {
  return [...code.matchAll(/\bimport\s*\(\s*['"]([^'"]*)['"]\s*\)/dg)].map((m) => withStrings.slice(...m.indices![1]!));
}

/**
 * The repo-relative path of a file that an import lands on, or nothing when it is a package or
 * something that is not code.
 */
function fileOf(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = resolveImport(from, spec);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) if (existsSync(`${ROOT}/${candidate}`)) return candidate;
  return undefined;
}

/** Every file that loading `entry` loads, by the imports that are kept. */
function loaded(entry: string): Map<string, string> {
  const via = new Map<string, string>([[entry, '']]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const spec of keptImports(strip(readFileSync(`${ROOT}/${file}`, 'utf8')))) {
      const target = fileOf(file, spec);
      if (target === undefined || via.has(target)) continue;
      via.set(target, file);
      queue.push(target);
    }
  }
  return via;
}

describe('the reading course and the games of the tables are chunks of their own', () => {
  it('are not reached by anything the page loads to start', () => {
    const via = loaded('src/main.ts');
    expect(via.size, 'the walk found the game').toBeGreaterThan(50);
    for (const file of via.keys()) {
      const lazy = LAZY.find((prefix) => file.startsWith(prefix));
      expect(
        lazy,
        `${file} is loaded to start, through ${via.get(file)}, and is part of a table's chunk`,
      ).toBeUndefined();
    }
  });
});

describe('the chunks of the tables are reached when the player sits down', () => {
  it('through dynamic imports in the boot code of the session, the screen and the sounds of each, which are the whole of their chunks', () => {
    const reached = ['src/main.ts', ...sourceFiles('src/boot')].flatMap((file) =>
      lazyImports(strip(readFileSync(`${ROOT}/${file}`, 'utf8'))).map((spec) => fileOf(file, spec)),
    );
    // The memory table and the maths table are two sessions with one set of sounds, which both ask
    // for.
    expect([...new Set(reached)].sort()).toEqual(ENTRIES);
  });

  it('and every file that only the chunks load is one the rule above knows by its name, so the rule cannot miss a part of them', () => {
    // What the chunks load that the start does not is the course, the games and what shows them. A
    // file that both reach is in the page, once.
    const start = loaded('src/main.ts');
    const chunk = ENTRIES.flatMap((entry) => [...loaded(entry).keys()]);
    const own = new Set(chunk.filter((file) => !start.has(file)));
    expect(own.size, 'the chunks have files of their own').toBeGreaterThan(20);
    for (const file of own)
      expect(
        LAZY.some((prefix) => file.startsWith(prefix)),
        `${file} is only in a table's chunk, and is not one of its files`,
      ).toBe(true);
  });
});

describe('the scanner itself', () => {
  it('finds a dynamic import and leaves a plain one, a type and a comment', () => {
    const src = [
      "import { a } from './a';",
      "const lazy = import('./lazy');",
      'const again = import( "./again" );',
      "// import('./commented');",
    ].join('\n');
    expect(lazyImports(strip(src))).toEqual(['./lazy', './again']);
  });

  it('keeps an import, a re-export and a bare import, and leaves a type, a dynamic import and a comment', () => {
    const src = [
      "import { a } from './a';",
      "import type { T } from './t';",
      "export type { U } from './u';",
      "export * from './b';",
      "import './side';",
      "import { type V, w } from './vw';",
      "const lazy = import('./lazy');",
      "// import { x } from './commented';",
    ].join('\n');
    expect(keptImports(strip(src)).sort()).toEqual(['./a', './b', './side', './vw']);
  });

  it('finds the course through a chain of plain imports', () => {
    expect(fileOf('src/main.ts', './game/reader')).toBe(
      existsSync(`${ROOT}/src/game/reader.ts`) ? 'src/game/reader.ts' : undefined,
    );
    expect(fileOf('src/main.ts', 'phaser')).toBeUndefined();
  });
});
