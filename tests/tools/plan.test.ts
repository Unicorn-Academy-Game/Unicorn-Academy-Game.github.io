import { describe, expect, it } from 'vitest';
import {
  buildOfPage,
  isHashedAsset,
  kindOf,
  SHELL_URL,
  stampBuild,
  typeMatches,
  unstampBuild,
} from '../../src/shared/offline';
import { type DistFile, type GameAssets, makePlan } from '../../tools/build/plan';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const PAGE = `<!doctype html><html><head><title>t</title><script type="module" src="./assets/index-AbCdEfGh.js"></script><link rel="manifest" href="./manifest.webmanifest"></head><body></body></html>`;

const dist = (extra: Record<string, string> = {}): DistFile[] =>
  Object.entries({
    [SHELL_URL]: PAGE,
    'assets/index-AbCdEfGh.js': 'console.log(1)',
    'manifest.webmanifest': '{}',
    'assets/manifest.json': '{"v":1}',
    'assets/maps/forest.0123456789.json': '{}',
    'assets/audio/music.0123456789.mp3': 'tune',
    'assets/speech/word-apple.0123456789.mp3': 'apple',
    ...extra,
  }).map(([url, text]) => ({ url, bytes: bytes(text) }));

const game = (): GameAssets => ({
  all: new Set([
    'assets/manifest.json',
    'assets/maps/forest.0123456789.json',
    'assets/audio/music.0123456789.mp3',
    'assets/speech/word-apple.0123456789.mp3',
  ]),
  first: new Set(['assets/manifest.json', 'assets/maps/forest.0123456789.json']),
  voice: new Set(['assets/speech/word-apple.0123456789.mp3']),
});

const plan = (files = dist(), limits?: { initial: number; offline: number; voice: number }) =>
  makePlan(files, game(), limits);

describe('the release plan', () => {
  it('lists the page with the release written into it, and records the hash of the page as served', () => {
    const { plan: p, html } = plan();
    const entry = p.entries.find((e) => e.url === SHELL_URL)!;
    expect(buildOfPage(html)).toBe(p.build);
    expect(entry.kind).toBe('html');
    expect(entry.bytes).toBe(Buffer.byteLength(html));
    expect(p.entries.filter((e) => e.kind === 'html')).toHaveLength(1);
  });

  it('lists every other file with the hash of its bytes', () => {
    const { plan: p } = plan();
    expect(p.entries.map((e) => e.url).sort()).toEqual([
      'assets/audio/music.0123456789.mp3',
      'assets/index-AbCdEfGh.js',
      'assets/manifest.json',
      'assets/maps/forest.0123456789.json',
      'assets/speech/word-apple.0123456789.mp3',
      'index.html',
      'manifest.webmanifest',
    ]);
    const manifest = p.entries.find((e) => e.url === 'assets/manifest.json')!;
    expect(manifest.sha256).toBe('afbf9d0f3560b0fd7795e81c42a0a79ee6b6fc67e064f77826aee642cad28d91');
    expect(manifest.bytes).toBe(7);
  });

  it('keeps what the first playable moment needs in the group that is saved first, the rest for later, and the spoken lessons apart', () => {
    const { plan: p } = plan();
    const group = (url: string) => p.entries.find((e) => e.url === url)!.group;
    expect(group(SHELL_URL)).toBe('boot');
    expect(group('assets/index-AbCdEfGh.js')).toBe('boot');
    expect(group('manifest.webmanifest')).toBe('boot');
    expect(group('assets/manifest.json')).toBe('boot');
    expect(group('assets/maps/forest.0123456789.json')).toBe('boot');
    expect(group('assets/audio/music.0123456789.mp3')).toBe('rest');
    expect(group('assets/speech/word-apple.0123456789.mp3')).toBe('voice');
  });

  it('names the release the same way however the files are ordered, and when it is built again from its own output', () => {
    const first = plan();
    expect(plan([...dist()].reverse()).plan.build).toBe(first.plan.build);
    const again = plan(dist().map((f) => (f.url === SHELL_URL ? { url: f.url, bytes: bytes(first.html) } : f)));
    expect(again.plan.build).toBe(first.plan.build);
    expect(again.html).toBe(first.html);
  });

  it('names a different release when any one file differs, the page included', () => {
    const base = plan().plan.build;
    expect(plan(dist({ 'assets/index-AbCdEfGh.js': 'console.log(2)' })).plan.build).not.toBe(base);
    expect(plan(dist({ 'assets/audio/music.0123456789.mp3': 'tunf' })).plan.build).not.toBe(base);
    expect(plan(dist({ [SHELL_URL]: PAGE.replace('<title>t</title>', '<title>u</title>') })).plan.build).not.toBe(base);
  });

  describe('refuses to build a release that could not be trusted offline', () => {
    it('with a kind of file the worker could not recognise', () => {
      expect(() => plan(dist({ 'notes.txt': 'hello' }))).toThrow(
        /notes\.txt is a kind of file an offline release may not hold/,
      );
      expect(() => plan(dist({ 'assets/index-AbCdEfGh.js.map': '{}' }))).toThrow(/may not hold/);
    });

    it('with no page', () => {
      expect(() => plan(dist().filter((f) => f.url !== SHELL_URL))).toThrow(/no index\.html/);
    });

    it('when the asset manifest names a file the build does not have', () => {
      expect(() => plan(dist().filter((f) => !f.url.endsWith('.mp3')))).toThrow(
        /music\.0123456789\.mp3 is named by the asset manifest/,
      );
    });

    it('when the page asks for a file the release does not hold', () => {
      const broken = PAGE.replace('index-AbCdEfGh.js', 'index-Missing00.js');
      expect(() => plan(dist({ [SHELL_URL]: broken }))).toThrow(/asks for assets\/index-Missing00\.js/);
    });

    it("when the page asks for a file from the root of the site, which is not the game's own when it is served from a folder", () => {
      const rooted = PAGE.replace('./assets/index-AbCdEfGh.js', '/assets/index-AbCdEfGh.js');
      expect(() => plan(dist({ [SHELL_URL]: rooted }))).toThrow(/from the root of the site/);
    });

    it('but lets the page point at other sites and at itself', () => {
      const linked = PAGE.replace(
        '</body>',
        '<a href="https://example.org/x">x</a><a href="#top">top</a><a href="//cdn.example.org/y.js">y</a></body>',
      );
      expect(() => plan(dist({ [SHELL_URL]: linked }))).not.toThrow();
    });

    it('when the files needed to start are over the target, or the game kept for offline play is, or the spoken lessons are', () => {
      expect(() => plan(dist(), { initial: 50, offline: 1e9, voice: 1e9 })).toThrow(/needed to start/);
      expect(() => plan(dist(), { initial: 1e9, offline: 50, voice: 1e9 })).toThrow(/kept for offline play/);
      expect(() => plan(dist(), { initial: 1e9, offline: 1e9, voice: 2 })).toThrow(/spoken lessons/);
    });
  });

  it('counts the spoken lessons on their own, so that they are not in what the game keeps', () => {
    const { report } = plan();
    expect(report.voiceBytes).toBe(5);
    const all = plan(dist(), { initial: 1e9, offline: 1e9, voice: 1e9 }).report;
    expect(all.offlineBytes).toBe(report.offlineBytes);
  });

  it('counts text as sent compressed and pictures and sound as they are', () => {
    const noisy = 'x'.repeat(100_000);
    const { report } = plan(dist({ 'assets/index-AbCdEfGh.js': noisy }));
    expect(report.offlineBytes).toBeLessThan(5_000);
    const longPage = plan(dist({ [SHELL_URL]: PAGE.replace('<title>t</title>', `<title>${noisy}</title>`) }));
    expect(longPage.report.offlineBytes).toBeLessThan(5_000);
    const big = plan(dist({ 'assets/audio/music.0123456789.mp3': noisy }));
    expect(big.report.offlineBytes).toBeGreaterThan(100_000);
    expect(big.report.bootBytes).toBeLessThan(5_000);
  });
});

describe('what the worker recognises', () => {
  it('knows the kinds of file a release may hold', () => {
    expect(kindOf('assets/a.js')).toBe('js');
    expect(kindOf('manifest.webmanifest')).toBe('webmanifest');
    expect(kindOf('assets/a.woff2')).toBe('woff2');
    expect(kindOf('assets/a.webp')).toBe('webp');
    expect(kindOf('a.exe')).toBeNull();
    expect(kindOf('noextension')).toBeNull();
  });

  it('checks a content type by its media type only', () => {
    expect(typeMatches('html', 'text/html; charset=utf-8')).toBe(true);
    expect(typeMatches('json', 'Application/JSON')).toBe(true);
    expect(typeMatches('json', 'text/html')).toBe(false);
    expect(typeMatches('png', null)).toBe(false);
    expect(typeMatches('webp', 'image/webp')).toBe(true);
    expect(typeMatches('webp', 'image/png')).toBe(false);
  });

  it('knows MP3 by both names a host may give it, and still not by the name of a page', () => {
    expect(typeMatches('mp3', 'audio/mpeg')).toBe(true);
    // GitHub Pages sends this one.
    expect(typeMatches('mp3', 'audio/mp3')).toBe(true);
    expect(typeMatches('mp3', 'text/html; charset=utf-8')).toBe(false);
  });

  it('tells a file whose name carries its content from one whose name does not', () => {
    expect(isHashedAsset('assets/index-AbCdEfGh.js')).toBe(true);
    expect(isHashedAsset('assets/maps/forest.0123456789.json')).toBe(true);
    expect(isHashedAsset('assets/manifest.json')).toBe(false);
    expect(isHashedAsset('manifest.webmanifest')).toBe(false);
    expect(isHashedAsset('api/assets/x-AbCdEfGh.js')).toBe(false);
    expect(isHashedAsset('/assets/index-AbCdEfGh.js')).toBe(false);
    expect(isHashedAsset('')).toBe(false);
  });

  it('stamps a page with its release, replaces an older stamp, and can take the stamp off again', () => {
    const once = stampBuild(PAGE, 'abc123');
    expect(buildOfPage(once)).toBe('abc123');
    expect(buildOfPage(PAGE)).toBeNull();
    const twice = stampBuild(once, 'def456');
    expect(buildOfPage(twice)).toBe('def456');
    expect(twice).toBe(stampBuild(PAGE, 'def456'));
    expect(unstampBuild(twice)).toBe(PAGE);
    expect(() => stampBuild('<html></html>', 'abc123')).toThrow(/no head/);
  });
});
