import { describe, expect, it } from 'vitest';
import { cacheNames, type Report, SHELL_URL } from '../../src/shared/offline';
import { createPrecache, plainFailure } from '../../src/sw/precache';
import {
  asNavigation,
  BUILD,
  device,
  get,
  ORIGIN,
  ok,
  opaqueRedirect,
  pathOf,
  pretending,
  type Release,
  release,
  SCOPE,
  sha256,
} from './world';

const NAMES = cacheNames(new URL(SCOPE).pathname);
const SHELL = '<html><head></head><body>the game</body></html>';
const JS = 'assets/index-AbCdEfGh.js';
const MANIFEST = 'assets/manifest.json';
const FOREST = 'assets/maps/forest.0123456789.json';
const MUSIC = 'assets/audio/music.0123456789.mp3';

const SAY_APPLE = 'assets/speech/word-apple.0123456789.mp3';
const SAY_BEE = 'assets/speech/word-bee.0123456789.mp3';
const SAY_CAT = 'assets/speech/word-cat.0123456789.mp3';
const SPOKEN = [SAY_APPLE, SAY_BEE, SAY_CAT];
const SAID: Record<string, string> = { [SAY_APPLE]: 'apple', [SAY_BEE]: 'bee', [SAY_CAT]: 'cat' };

const SMALL = {
  [SHELL_URL]: { body: SHELL, group: 'boot' },
  [JS]: { body: 'console.log("game")', group: 'boot' },
  [MANIFEST]: { body: '{"v":1}', group: 'boot' },
  [FOREST]: { body: '{"map":"forest"}' },
  [MUSIC]: { body: 'tune' },
} as const;

/**
 * A small release: a page, a script and the manifest are needed to start. A map and a song can come
 * later.
 */
const small = (build = BUILD): Release => release(SMALL, build);

/** The same with three spoken lessons, which are not part of the game that is kept. */
const talking = (build = BUILD): Release =>
  release(
    { ...SMALL, ...Object.fromEntries(SPOKEN.map((url) => [url, { body: SAID[url]!, group: 'voice' as const }])) },
    build,
  );

const setup = (r: Release = small()) => {
  const d = device(r.files);
  return { r, d, cache: createPrecache(r.plan, d.ports) };
};

const reports = (): { list: Report[]; tell: (r: Report) => void } => {
  const list: Report[] = [];
  return { list, tell: (r) => void list.push(r) };
};

describe('installing', () => {
  it('keeps only what a first start needs when no older release is running', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    expect([...d.caches.of(BUILD).files.keys()].sort()).toEqual([SHELL_URL, JS, MANIFEST].sort());
    expect(d.net.asked.sort()).toEqual([SHELL_URL, JS, MANIFEST].sort());
  });

  it('keeps the whole release when an older one is running, so it is complete before it asks to be used', async () => {
    const { d, cache } = setup();
    await cache.install(true);
    expect(d.caches.of(BUILD).files.size).toBe(5);
    expect((await cache.report()).phase).toBe('complete');
  });

  it('keeps a song from a host that calls MP3 audio/mp3, which is what GitHub Pages does', async () => {
    const { d, cache } = setup();
    // The host says so every time it is asked, so the second ask that a doubtful file gets cannot
    // rescue the install.
    const song = () => new Response('tune', { status: 200, headers: { 'content-type': 'audio/mp3' } });
    d.net.script(MUSIC, song(), song());
    await cache.install(true);
    expect(await d.caches.of(BUILD).text(MUSIC)).toBe('tune');
    expect(d.net.asked.filter((p) => p === MUSIC)).toHaveLength(1);
    expect((await cache.report()).phase).toBe('complete');
  });

  it('does not keep a page that arrives where a song should be', async () => {
    const { d, cache } = setup();
    d.net.script(
      MUSIC,
      new Response('<html>sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(cache.install(true)).rejects.toThrow(/sign-in/);
    expect(d.caches.of(BUILD).files.has(MUSIC)).toBe(false);
  });

  it('asks for fresh copies of files that can change, lets the browser reuse a hashed file it already has, and refuses to follow redirects', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    const modes = Object.fromEntries(d.net.requests.map((r) => [pathOf(r.url), r.cache]));
    expect(modes).toEqual({ [SHELL_URL]: 'reload', [MANIFEST]: 'reload', [JS]: 'default' });
    for (const request of d.net.requests) expect(request.redirect).toBe('manual');
  });

  it("asks the network when the browser's own copy of a hashed file is not the right one", async () => {
    const { d, cache } = setup();
    d.net.script(
      JS,
      new Response('<html>stale</html>', { status: 200, headers: { 'content-type': 'text/javascript' } }),
    );
    await cache.install(false);
    expect(d.net.requests.filter((r) => pathOf(r.url) === JS).map((r) => r.cache)).toEqual(['default', 'reload']);
    expect(await d.caches.of(BUILD).text(JS)).toBe('console.log("game")');
    expect(d.waited).toEqual([]);
  });

  it('gives up on a hashed file that is wrong from the network too', async () => {
    const { d, cache } = setup();
    const wrong = () =>
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/javascript' } });
    d.net.script(JS, wrong(), wrong());
    await expect(cache.install(false)).rejects.toThrow(/changed/);
    expect(d.net.asked.filter((p) => p === JS)).toHaveLength(2);
  });

  it('keeps the exact bytes and the page security headers, and nothing else the server said', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    const kept = (await d.caches.of(BUILD).match(MANIFEST))!;
    expect(await kept.text()).toBe('{"v":1}');
    expect(kept.headers.get('content-type')).toBe('application/json');
    expect(kept.headers.get('content-security-policy')).toBe("default-src 'self'");
    expect(kept.headers.has('x-not-kept')).toBe(false);
  });

  it('says how far it has got while it works', async () => {
    const { cache } = setup();
    const seen = reports();
    await cache.install(true, seen.tell);
    expect(seen.list[0]).toMatchObject({ phase: 'installing', done: 0, total: 5 });
    expect(seen.list.at(-1)).toMatchObject({ phase: 'installing', done: 5, total: 5 });
    expect(seen.list.map((r) => r.done)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  describe('a file that is not the file the build recorded makes the install fail, and is not kept', () => {
    const wrongs: [string, (path: string) => Response][] = [
      ['a sign-in page with a 200', () => ok(SHELL_URL, '<html><head></head>sign in</html>')],
      ['a redirect', (path) => pretending(ok(path, '{"v":1}'), { redirected: true })],
      ['an opaque redirect from a manual fetch', () => opaqueRedirect()],
      ['a 403', () => new Response('no', { status: 403, headers: { 'content-type': 'text/html' } })],
      ['a 404', () => new Response('gone', { status: 404, headers: { 'content-type': 'application/json' } })],
      [
        'the right type with other bytes of the same length',
        () => new Response('{"v":2}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ],
      [
        'a truncated body',
        () => new Response('{"v"', { status: 200, headers: { 'content-type': 'application/json' } }),
      ],
      ['a response with no content type', () => new Response('{"v":1}', { status: 200 })],
    ];
    for (const [what, make] of wrongs) {
      it(what, async () => {
        const { d, cache } = setup();
        d.net.script(MANIFEST, make(MANIFEST));
        await expect(cache.install(false)).rejects.toThrow(/could not be kept/);
        expect(d.caches.of(BUILD).files.has(MANIFEST)).toBe(false);
      });
    }

    it('a page that does not carry this release', async () => {
      const { d, cache } = setup();
      const other = release({ [SHELL_URL]: { body: SHELL } }, 'ffffffffffff');
      d.net.script(SHELL_URL, ok(SHELL_URL, other.files.get(SHELL_URL)!));
      await expect(cache.install(false)).rejects.toThrow();
      expect(d.caches.of(BUILD).files.has(SHELL_URL)).toBe(false);
    });

    it('a page whose bytes match but which names another build', async () => {
      const wrongBuild = release(
        { [SHELL_URL]: { body: SHELL, group: 'boot' }, [JS]: { body: 'js', group: 'boot' } },
        'ffffffffffff',
      );
      const claimed = { ...wrongBuild.plan, build: BUILD };
      const d = device(wrongBuild.files);
      await expect(createPrecache(claimed, d.ports).install(false)).rejects.toThrow();
    });
  });

  it('does not ask again for a file that was wrong, but asks again after a server error or a dropped connection', async () => {
    const wrong = setup();
    wrong.d.net.script(
      MANIFEST,
      new Response('<html>x</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(wrong.cache.install(false)).rejects.toThrow();
    expect(wrong.d.net.asked.filter((p) => p === MANIFEST)).toHaveLength(1);

    const flaky = setup();
    flaky.d.net.script(MANIFEST, new Response('down', { status: 503 }), new TypeError('network'));
    await flaky.cache.install(false);
    expect(flaky.d.net.asked.filter((p) => p === MANIFEST)).toHaveLength(3);
    expect(flaky.d.waited).toEqual([400, 1200]);
    expect(await flaky.d.caches.of(BUILD).text(MANIFEST)).toBe('{"v":1}');
  });

  it('asks again when the connection breaks while a file is arriving', async () => {
    const { d, cache } = setup();
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"v"'));
          controller.error(new TypeError('network error'));
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    d.net.script(MANIFEST, broken);
    await cache.install(false);
    expect(d.net.asked.filter((p) => p === MANIFEST)).toHaveLength(2);
    expect(await d.caches.of(BUILD).text(MANIFEST)).toBe('{"v":1}');
  });

  it('gives up after three tries', async () => {
    const { d, cache } = setup();
    d.net.script(MANIFEST, new TypeError('a'), new TypeError('b'), new TypeError('c'), new TypeError('d'));
    await expect(cache.install(false)).rejects.toThrow(/network/);
    expect(d.net.asked.filter((p) => p === MANIFEST)).toHaveLength(3);
  });

  it('leaves the release that is running exactly as it was when the new one fails', async () => {
    const older = small('0000000000aa');
    const d = device(small().files);
    const before = await d.caches.open(NAMES.of('0000000000aa'));
    for (const [url, body] of older.files) await before.put(url, ok(url, body));
    const snapshot = [...before.files.keys()].sort();
    d.net.script(
      MANIFEST,
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(createPrecache(small().plan, d.ports).install(true)).rejects.toThrow();
    expect([...before.files.keys()].sort()).toEqual(snapshot);
    expect(await before.text(MANIFEST)).toBe('{"v":1}');
  });

  it('picks up where an interrupted install stopped', async () => {
    const { d, cache } = setup();
    d.net.script(MANIFEST, new TypeError('a'), new TypeError('b'), new TypeError('c'));
    await expect(cache.install(false)).rejects.toThrow();
    const had = d.caches.of(BUILD).files.size;
    expect(had).toBeLessThan(3);
    d.net.asked.length = 0;
    await createPrecache(small().plan, d.ports).install(false);
    expect(d.caches.of(BUILD).files.size).toBe(3);
    expect(d.net.asked.length).toBe(3 - had);
  });

  it('turns a full disk into a failed install', async () => {
    const { d, cache } = setup();
    (await d.caches.open(NAMES.of(BUILD))).failPuts = true;
    await expect(cache.install(false)).rejects.toThrow(/storage/);
    expect((await cache.report()).detail).toMatch(/no room/);
  });
});

describe('borrowing from an older release', () => {
  it('copies a file whose name carries its hash and fetches the rest', async () => {
    const next = release({
      [SHELL_URL]: { body: SHELL, group: 'boot' },
      [JS]: { body: 'console.log("game")', group: 'boot' },
      [MANIFEST]: { body: '{"v":2}', group: 'boot' },
      [FOREST]: { body: '{"map":"forest"}' },
    });
    const d = device(next.files);
    const old = await d.caches.open(NAMES.of('0000000000aa'));
    await old.put(FOREST, ok(FOREST, '{"map":"forest"}'));
    await old.put(MANIFEST, ok(MANIFEST, '{"v":1}'));
    await createPrecache(next.plan, d.ports).install(true);
    expect(d.net.asked).not.toContain(FOREST);
    expect(d.net.asked).toContain(MANIFEST);
    expect(await d.caches.of(BUILD).text(FOREST)).toBe('{"map":"forest"}');
    expect(await d.caches.of(BUILD).text(MANIFEST)).toBe('{"v":2}');
  });
});

describe('serving', () => {
  const installed = async () => {
    const s = setup();
    await s.cache.install(true);
    s.d.net.asked.length = 0;
    return s;
  };

  it('answers the page itself from the device, for every spelling of its address', async () => {
    const { d, cache } = await installed();
    for (const path of ['', '?test', '?incognito', SHELL_URL]) {
      const response = await cache.route(asNavigation(path))!;
      expect(await response.text()).toContain('the game');
    }
    expect(d.net.asked).toEqual([]);
  });

  it('leaves every other address to the browser', async () => {
    const { cache } = await installed();
    expect(cache.route(asNavigation('elsewhere'))).toBeNull();
    expect(cache.route(get('favicon.ico'))).toBeNull();
    expect(cache.route(get('assets/unknown.json'))).toBeNull();
  });

  it('ignores writes, other sites, other folders of the same site and range requests', async () => {
    const { cache } = await installed();
    expect(cache.route(get(JS, { method: 'POST', body: 'x' }))).toBeNull();
    expect(cache.route(new Request(`https://elsewhere.test/fan/${JS}`))).toBeNull();
    expect(cache.route(new Request(`${ORIGIN}/another-game/${JS}`))).toBeNull();
    expect(cache.route(new Request(`${ORIGIN}/${JS}`))).toBeNull();
    expect(cache.route(get(MUSIC, { headers: { range: 'bytes=0-1' } }))).toBeNull();
  });

  it('answers a kept file from the device without the network', async () => {
    const { d, cache } = await installed();
    const response = await cache.route(get(FOREST))!;
    expect(await response.json()).toEqual({ map: 'forest' });
    expect(d.net.asked).toEqual([]);
  });

  it('fetches a file the device does not have yet, hands it over, and keeps a checked copy', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    d.net.asked.length = 0;
    const work: Promise<unknown>[] = [];
    const response = await cache.route(get(FOREST), (w) => void work.push(w))!;
    expect(await response.json()).toEqual({ map: 'forest' });
    expect(d.net.asked).toEqual([FOREST]);
    await Promise.all(work);
    expect(await d.caches.of(BUILD).text(FOREST)).toBe('{"map":"forest"}');
  });

  it('hands over what the network sent for such a file, and keeps nothing, when it is not the recorded file', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    d.net.script(
      FOREST,
      new Response('<html>sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const work: Promise<unknown>[] = [];
    const response = await cache.route(get(FOREST), (w) => void work.push(w))!;
    expect(await response.text()).toContain('sign in');
    await Promise.all(work);
    expect(d.caches.of(BUILD).files.has(FOREST)).toBe(false);
  });

  it('fails the request when the file is missing and the network is down, so the game can say so', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    d.net.script(FOREST, new TypeError('offline'));
    await expect(cache.route(get(FOREST))!).rejects.toThrow('offline');
  });

  it('serves a page of an older release the files it asks for, from the older release', async () => {
    const { d, cache } = await installed();
    const old = await d.caches.open(NAMES.of('0000000000aa'));
    const OLD = 'assets/maps/forest.9999999999.json';
    await old.put(OLD, ok(OLD, '{"map":"old forest"}'));
    const response = await cache.route(get(OLD))!;
    expect(await response.json()).toEqual({ map: 'old forest' });
    expect(d.net.asked).toEqual([]);
  });

  it('asks the network for a hashed file nobody has', async () => {
    const { d, cache } = await installed();
    await cache.route(get('assets/maps/gone.9999999999.json'))!;
    expect(d.net.asked).toEqual(['assets/maps/gone.9999999999.json']);
  });

  it('never gives a page the unhashed files of another release', async () => {
    const { d, cache } = await installed();
    const old = await d.caches.open(NAMES.of('0000000000aa'));
    await old.put('assets/other.json', ok('assets/other.json', 'old'));
    expect(cache.route(get('assets/other.json'))).toBeNull();
    d.caches.of(BUILD).files.delete(MANIFEST);
    const response = await cache.route(get(MANIFEST))!;
    expect(await response.json()).toEqual({ v: 1 });
    expect(d.net.asked).toEqual([MANIFEST]);
  });

  it('serves the network page when the device has none, and says what to do when there is no network either', async () => {
    const { d, cache } = setup();
    const online = await cache.route(asNavigation(''))!;
    expect(await online.text()).toContain('the game');
    d.net.script(SHELL_URL, new TypeError('offline'));
    const offline = await cache.route(asNavigation(''))!;
    expect(offline.status).toBe(503);
    expect(await offline.text()).toContain('opened once with a connection');
  });
});

describe('keeping the rest of the release', () => {
  it('fetches only what is missing, a few at a time, and reports every step', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    d.net.asked.length = 0;
    d.net.latency = 5;
    const seen = reports();
    await cache.warm(seen.tell);
    expect(d.net.asked.sort()).toEqual([FOREST, MUSIC].sort());
    expect((await cache.report()).phase).toBe('complete');
    expect(seen.list.at(-1)).toMatchObject({ phase: 'warming', done: 5, total: 5 });
  });

  it('never has more than three fetches going', async () => {
    const files: Record<string, { body: string }> = { [SHELL_URL]: { body: SHELL } };
    for (let i = 0; i < 12; i++)
      files[`assets/maps/m${i}.${String(i).padStart(10, '0')}.json`] = { body: `{"i":${i}}` };
    const r = release(files);
    const d = device(r.files);
    d.net.latency = 4;
    await createPrecache(r.plan, d.ports).warm();
    expect(d.net.maxInflight).toBe(3);
    expect(d.caches.of(BUILD).files.size).toBe(13);
  });

  it('shares one run between callers', async () => {
    const { d, cache } = setup();
    d.net.latency = 5;
    await Promise.all([cache.warm(), cache.warm(), cache.warm()]);
    expect(d.net.asked.filter((p) => p === FOREST)).toHaveLength(1);
  });

  it('reports a failure in plain words, keeps what it got, and finishes the job on the next try', async () => {
    const { d, cache } = setup();
    await cache.install(false);
    d.net.script(MUSIC, new TypeError('a'), new TypeError('b'), new TypeError('c'));
    await cache.warm();
    const failed = await cache.report();
    expect(failed).toMatchObject({ phase: 'failed', done: 4, total: 5 });
    expect(failed.detail).toMatch(/connection dropped/);
    d.net.asked.length = 0;
    await cache.warm();
    expect(d.net.asked).toEqual([MUSIC]);
    expect(await cache.report()).toMatchObject({ phase: 'complete', done: 5, detail: null });
  });

  it('notices files the browser threw away, and fetches them again', async () => {
    const { d, cache } = setup();
    await cache.install(true);
    expect((await cache.report()).phase).toBe('complete');
    d.caches.of(BUILD).files.delete(FOREST);
    expect(await cache.report()).toMatchObject({ phase: 'partial', done: 4 });
    d.net.asked.length = 0;
    await cache.warm();
    expect(d.net.asked).toEqual([FOREST]);
    expect((await cache.report()).phase).toBe('complete');
  });

  describe('reports a sign-in problem as one a parent can act on', () => {
    const walls: [string, () => Response][] = [
      ['a redirect to a sign-in site', () => opaqueRedirect()],
      ['a 401', () => new Response('no', { status: 401, headers: { 'content-type': 'text/html' } })],
      ['a 403', () => new Response('no', { status: 403, headers: { 'content-type': 'text/html' } })],
      [
        'a page in place of a data file',
        () =>
          new Response('<html>sign in</html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
      ],
    ];
    for (const [what, make] of walls) {
      it(what, async () => {
        const { d, cache } = setup();
        await cache.install(false);
        d.net.script(FOREST, make());
        await cache.warm();
        expect((await cache.report()).detail).toMatch(/sign-in page/);
      });
    }

    it('a page of no release in place of the game page', async () => {
      const { d, cache } = setup();
      await cache.install(false);
      d.caches.of(BUILD).files.delete(SHELL_URL);
      d.net.script(
        SHELL_URL,
        new Response('<html><head></head>sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      );
      await cache.warm();
      expect((await cache.report()).detail).toMatch(/sign-in page/);
    });

    it('is not what a file that changed in a new deploy looks like', async () => {
      const { d, cache } = setup();
      await cache.install(false);
      // A hashed file is asked for a second time, with the browser's own copy ruled out, before it
      // counts as wrong.
      const other = () => new Response('{"v":2}', { status: 200, headers: { 'content-type': 'application/json' } });
      d.net.script(FOREST, other(), other());
      await cache.warm();
      expect((await cache.report()).detail).toMatch(/changed/);
    });
  });
});

describe('taking over', () => {
  it('records which release is current and which came before, and removes the ones older than that', async () => {
    const d = device(small().files);
    for (const old of ['0000000000a1', '0000000000a2']) await d.caches.open(NAMES.of(old));
    const meta = await d.caches.open(NAMES.meta);
    await meta.put(
      '__ua/generations',
      new Response(JSON.stringify({ current: '0000000000a2', previous: '0000000000a1' })),
    );
    await d.caches.open('unrelated');
    await createPrecache(small().plan, d.ports).install(true);
    await createPrecache(small().plan, d.ports).activate();
    expect((await d.caches.keys()).sort()).toEqual(
      [NAMES.meta, NAMES.of(BUILD), NAMES.of('0000000000a2'), 'unrelated'].sort(),
    );
    expect(await (await meta.match('__ua/generations'))!.json()).toEqual({ current: BUILD, previous: '0000000000a2' });
  });

  describe('the caches of the first published releases, which were named without a folder', () => {
    const LEGACY = ['ua-meta', 'ua-58000f4e811e', 'ua-0123456789ab'];

    it('are removed by a copy at the root of a site, the only place those releases ran, and nothing else of the site is', async () => {
      const d = device(small().files);
      const root = cacheNames('/');
      for (const name of [...LEGACY, 'ua-notes', 'ua-58000F4E811E', 'ua-58000f4e811e0', 'unrelated'])
        await d.caches.open(name);
      await createPrecache(small().plan, { ...d.ports, scope: `${ORIGIN}/` }).activate();
      expect((await d.caches.keys()).sort()).toEqual(
        [root.meta, 'ua-58000F4E811E', 'ua-58000f4e811e0', 'ua-notes', 'unrelated'].sort(),
      );
    });

    it('are left alone by a copy in a folder, which none of those releases ever ran in', async () => {
      const d = device(small().files);
      for (const name of LEGACY) await d.caches.open(name);
      await createPrecache(small().plan, d.ports).activate();
      expect((await d.caches.keys()).sort()).toEqual([...LEGACY, NAMES.meta].sort());
    });

    it('are only those names, and only at the root of a site', () => {
      expect(LEGACY.map((name) => cacheNames('/').isLegacy(name))).toEqual([true, true, true]);
      expect(LEGACY.map((name) => cacheNames('/fan/').isLegacy(name))).toEqual([false, false, false]);
      expect(cacheNames('/').isLegacy(cacheNames('/').of(BUILD))).toBe(false);
      expect(cacheNames('/').isLegacy(cacheNames('/').meta)).toBe(false);
    });
  });

  it('does not make a release its own previous one when it activates twice', async () => {
    const d = device(small().files);
    const precache = createPrecache(small().plan, d.ports);
    await precache.install(false);
    await precache.activate();
    await precache.activate();
    const meta = await d.caches.open(NAMES.meta);
    expect(await (await meta.match('__ua/generations'))!.json()).toEqual({ current: BUILD, previous: null });
  });

  it('copes with a note it cannot read', async () => {
    const d = device(small().files);
    const meta = await d.caches.open(NAMES.meta);
    await meta.put('__ua/generations', new Response('not json'));
    await expect(createPrecache(small().plan, d.ports).activate()).resolves.toBeUndefined();
  });
});

describe('the spoken lessons', () => {
  const talk = () => {
    const r = talking();
    const d = device(r.files);
    return { r, d, cache: createPrecache(r.plan, d.ports) };
  };
  const spokenAsked = (d: ReturnType<typeof device>): string[] => d.net.asked.filter((path) => SPOKEN.includes(path));

  it('are not part of the game, which is complete without them and keeps them out of every count', async () => {
    const { d, cache } = talk();
    await cache.install(true);
    await cache.warm();
    expect(spokenAsked(d)).toEqual([]);
    expect(await cache.report()).toMatchObject({
      phase: 'complete',
      done: 5,
      total: 5,
      voice: { done: 0, total: 3, bytes: 11, keeping: false, failed: false },
    });
  });

  it('are all fetched when a parent asks, with the game reported complete from the first step to the last', async () => {
    const { d, cache } = talk();
    await cache.install(false);
    await cache.warm();
    const seen = reports();
    await cache.warm(seen.tell, true);
    expect(spokenAsked(d).sort()).toEqual([...SPOKEN].sort());
    expect(seen.list.map((r) => r.voice.done)).toEqual([0, 1, 2, 3]);
    expect(seen.list.every((r) => r.phase === 'complete' && r.voice.keeping)).toBe(true);
    expect(await cache.report()).toMatchObject({
      phase: 'complete',
      voice: { done: 3, keeping: false, failed: false },
    });
  });

  it('are fetched with a game that is still being kept, which is reported as warming until it is done', async () => {
    const { cache } = talk();
    await cache.install(false);
    const seen = reports();
    await cache.warm(seen.tell, true);
    expect(seen.list[0]).toMatchObject({ phase: 'warming', done: 3, total: 5 });
    expect(seen.list.at(-1)).toMatchObject({ phase: 'warming', done: 5, voice: { done: 3 } });
    expect(await cache.report()).toMatchObject({ phase: 'complete', done: 5 });
  });

  it('are kept as they are heard, and answered from the device after that', async () => {
    const { d, cache } = talk();
    await cache.install(true);
    const work: Promise<unknown>[] = [];
    const heard = await cache.route(get(SAY_BEE), (w) => void work.push(w))!;
    expect(await heard.text()).toBe('bee');
    await Promise.all(work);
    expect((await cache.report()).voice).toMatchObject({ done: 1, total: 3 });
    d.net.asked.length = 0;
    expect(await (await cache.route(get(SAY_BEE))!).text()).toBe('bee');
    expect(d.net.asked).toEqual([]);
  });

  it('that cannot be fetched leave the game complete, are reported as failed, and come on the next try', async () => {
    const { d, cache } = talk();
    await cache.install(true);
    d.net.script(SAY_BEE, new TypeError('a'), new TypeError('b'), new TypeError('c'));
    await cache.warm(undefined, true);
    const report = await cache.report();
    expect(report).toMatchObject({ phase: 'complete', detail: null, voice: { done: 2, total: 3, failed: true } });
    await cache.warm(undefined, true);
    expect((await cache.report()).voice).toMatchObject({ done: 3, failed: false });
  });

  it('are not reported as failed by a try that did not ask for them', async () => {
    const { d, cache } = talk();
    await cache.install(true);
    d.net.script(SAY_BEE, new TypeError('a'), new TypeError('b'), new TypeError('c'));
    await cache.warm(undefined, true);
    await cache.warm();
    expect((await cache.report()).voice.failed).toBe(true);
  });

  it('that an older release kept are carried to a newer one, and the rest are left to be heard', async () => {
    const next = talking();
    const d = device(next.files);
    const old = await d.caches.open(NAMES.of('0000000000aa'));
    await old.put(SAY_APPLE, ok(SAY_APPLE, 'apple'));
    const OLD_CAT = 'assets/speech/word-cat.9999999999.mp3';
    await old.put(OLD_CAT, ok(OLD_CAT, 'old cat'));
    const cache = createPrecache(next.plan, d.ports);
    await cache.install(true);
    expect(spokenAsked(d)).toEqual([]);
    expect(await d.caches.of(BUILD).text(SAY_APPLE)).toBe('apple');
    expect(d.caches.of(BUILD).files.has(OLD_CAT)).toBe(false);
    expect([...d.caches.of(BUILD).files.keys()].filter((path) => path.startsWith('assets/speech/'))).toEqual([
      SAY_APPLE,
    ]);
    expect((await cache.report()).voice).toMatchObject({ done: 1, total: 3 });
  });

  it('carry over without failing the install when there is no room for them', async () => {
    const next = talking();
    const d = device(next.files);
    const old = await d.caches.open(NAMES.of('0000000000aa'));
    await old.put(SAY_APPLE, ok(SAY_APPLE, 'apple'));
    const cache = createPrecache(next.plan, d.ports);
    const mine = await d.caches.open(NAMES.of(BUILD));
    const put = mine.put.bind(mine);
    mine.put = async (url, response) => {
      if (url.includes('/speech/')) throw new DOMException('full', 'QuotaExceededError');
      return put(url, response);
    };
    await expect(cache.install(true)).resolves.toBeUndefined();
    expect((await cache.report()).phase).toBe('complete');
  });
});

describe('plainFailure', () => {
  it('names the problem a parent can fix before the ones they cannot', () => {
    expect(
      plainFailure([
        { url: 'a', code: 'network' },
        { url: 'b', code: 'sign-in' },
      ]),
    ).toMatch(/sign-in page/);
    expect(
      plainFailure([
        { url: 'a', code: 'network' },
        { url: 'b', code: 'storage' },
      ]),
    ).toMatch(/no room/);
    expect(
      plainFailure([
        { url: 'a', code: 'network' },
        { url: 'b', code: 'changed' },
      ]),
    ).toMatch(/changed/);
    expect(plainFailure([{ url: 'a', code: 'server' }])).toMatch(/server/);
  });
});

describe('the release plan the tests use', () => {
  it('records the real hash of every file', () => {
    const r = small();
    for (const entry of r.plan.entries) expect(entry.sha256).toBe(sha256(r.files.get(entry.url)!));
  });
});
