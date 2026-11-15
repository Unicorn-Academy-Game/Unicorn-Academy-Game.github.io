import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT, resolveImport, sourceFiles, specifiers, strip } from './source';

/**
 * The shape of the code, as rules a build can break. The domain is a pure simulation that the
 * browser game drives and the tests drive the same way, so nothing it depends on may touch the
 * browser, the network, the clock or chance.
 *
 *   shared  <-  content  <-  domain  <-  game, render, ui, audio, persistence, input
 *   shared  <-  content  <-  learning  <-  game, ui, persistence
 *
 * The learning engine never reaches the domain, nor the reverse.
 */
interface Layer {
  dir: string;
  /** Repo directories its relative imports may reach. */
  may: string[];
  /** Packages it may import. */
  packages: string[];
  /** Tokens that may not appear in its code. */
  banned: RegExp[];
}

const PURE_BANNED: RegExp[] = [
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bperformance\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\brequestAnimationFrame\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /\blocalStorage\b/,
  /\bindexedDB\b/,
  /\bfetch\s*\(/,
  /\bprocess\./,
  /\bglobalThis\b/,
  /\bconsole\b/,
];

const LAYERS: Layer[] = [
  { dir: 'src/shared', may: ['src/shared'], packages: ['zod'], banned: PURE_BANNED },
  { dir: 'src/content', may: ['src/shared', 'src/content'], packages: [], banned: PURE_BANNED },
  { dir: 'src/domain', may: ['src/shared', 'src/content', 'src/domain'], packages: [], banned: PURE_BANNED },
  // What the player is asked to spell and what they have learned is as pure as the simulation: the
  // clock and chance come in as arguments.
  { dir: 'src/learning', may: ['src/shared', 'src/content', 'src/learning'], packages: [], banned: PURE_BANNED },
  // The service worker runs where there is no page. It knows the release plan in src/shared and
  // nothing else of the game.
  {
    dir: 'src/sw',
    may: ['src/shared', 'src/sw'],
    packages: [],
    banned: [/\bwindow\b/, /\bdocument\b/, /\blocalStorage\b/, /\bindexedDB\b/],
  },
  // The page's side of offline play talks to the worker and knows the same plan, and nothing that
  // draws or plays.
  { dir: 'src/offline', may: ['src/shared', 'src/offline'], packages: [], banned: [] },
];

const CLIENT = [
  'src/game',
  'src/render',
  'src/ui',
  'src/audio',
  'src/persistence',
  'src/input',
  'src/offline',
  'src/wonder',
];
/**
 * The browser entry point and the boot code wire the client together, so they may reach into every
 * part of it.
 */
const COMPOSITION_ROOT = ['src/main.ts', 'src/boot'];

const within = (path: string, dirs: string[]): boolean => dirs.some((d) => path === d || path.startsWith(`${d}/`));

describe('layers', () => {
  for (const layer of LAYERS) {
    const files = sourceFiles(layer.dir);
    describe(layer.dir, () => {
      it('has something in it', () => {
        expect(files.length).toBeGreaterThan(0);
      });
      for (const file of files) {
        it(`${file} imports only what its layer allows`, () => {
          const stripped = strip(readFileSync(`${ROOT}/${file}`, 'utf8'));
          for (const spec of specifiers(stripped)) {
            if (spec.startsWith('.')) {
              const target = resolveImport(file, spec);
              expect(
                within(target, layer.may),
                `${file} imports ${spec}, which is outside ${layer.may.join(', ') || 'anything'}`,
              ).toBe(true);
            } else {
              const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
              expect(layer.packages.includes(pkg), `${file} imports the package ${spec}`).toBe(true);
            }
          }
        });
        it(`${file} is free of banned globals`, () => {
          const { code } = strip(readFileSync(`${ROOT}/${file}`, 'utf8'));
          for (const re of layer.banned) expect(re.test(code), `${file} uses ${re}`).toBe(false);
        });
      }
    });
  }

  it('the client reaches the domain, content and shared code, and nothing reaches into the client', () => {
    const all = [...sourceFiles('src'), ...sourceFiles('tools')];
    for (const file of all) {
      const stripped = strip(readFileSync(`${ROOT}/${file}`, 'utf8'));
      for (const spec of specifiers(stripped)) {
        if (!spec.startsWith('.')) continue;
        const target = resolveImport(file, spec);
        if (within(file, CLIENT) || within(file, COMPOSITION_ROOT) || file.startsWith('tools/')) continue;
        expect(within(target, CLIENT), `${file} imports the client through ${spec}`).toBe(false);
      }
    }
  });

  it('nothing under src imports tools or tests', () => {
    for (const file of sourceFiles('src')) {
      const stripped = strip(readFileSync(`${ROOT}/${file}`, 'utf8'));
      for (const spec of specifiers(stripped)) {
        if (!spec.startsWith('.')) continue;
        const target = resolveImport(file, spec);
        expect(within(target, ['tools', 'tests']), `${file} imports ${spec}`).toBe(false);
      }
    }
  });
});

describe('the scanner itself', () => {
  it('reads imports, ignores comments, and does not mistake prose or data for code', () => {
    const src = [
      "import { a } from './a';",
      "export * from '../b';",
      "// import { x } from 'phaser';",
      '/* import y from "idb"; */',
      "const prose = 'uses Math.random and window';",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner to read, not a template
      'const t = `document ${1}`;',
      "const lazy = import('./lazy');",
    ].join('\n');
    const stripped = strip(src);
    expect(specifiers(stripped).sort()).toEqual(['../b', './a', './lazy']);
    expect(/Math\.random|window|document/.test(stripped.code)).toBe(false);
  });

  it('does not read the word import inside a string as an import', () => {
    expect(
      specifiers(
        strip("const mode = 'import' && x; const m = 'import takes one file from you'; if (mode === 'import') run();"),
      ),
    ).toEqual([]);
  });

  it('does flag a banned token in code', () => {
    expect(/\bMath\.random\b/.test(strip('const x = Math.random();').code)).toBe(true);
  });
});
