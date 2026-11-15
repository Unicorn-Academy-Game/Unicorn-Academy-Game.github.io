import { GAME_NAME } from '../shared/brand';
import {
  buildOfPage,
  cacheNames,
  type Generations,
  isHashedAsset,
  type Phase,
  type Plan,
  type PrecacheEntry,
  type Report,
  SHELL_URL,
  typeMatches,
} from '../shared/offline';

/**
 * Keeps one release of the game on the device and serves it when there is no network.
 *
 * Everything the worker touches comes in through `Ports`, so the rules here run the same under test
 * as in the browser. The rules are few and strict.
 *   A file is kept only if it is the file the build recorded: 200, not a redirect, the right
 *   content type and the right SHA-256. A sign-in page or an error page can never pass, whatever
 *   URL it arrives at.
 *   Each release has its own cache. A release never reads another release's unhashed files, so the
 *   page and the manifest it loads always belong together. A hashed file may be borrowed from an
 *   older release, because its name says what it holds.
 */

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<readonly { readonly url: string }[]>;
}

export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface Ports {
  caches: CachesLike;
  fetch(request: Request): Promise<Response>;
  sha256(bytes: ArrayBuffer): Promise<string>;
  wait(ms: number): Promise<void>;
  /**
   * The address of the folder the worker serves, with its closing slash, such as
   * `https://example.github.io/unicorn-academy/`.
   */
  scope: string;
}

type Tell = (report: Report) => void;

type FailureCode = 'network' | 'sign-in' | 'changed' | 'server' | 'storage';

export interface Failure {
  url: string;
  code: FailureCode;
}

/**
 * Words a parent can read for the worst thing that went wrong. A sign-in page is the one they can
 * act on, so it comes first.
 */
export function plainFailure(failures: readonly Failure[]): string {
  const order: FailureCode[] = ['sign-in', 'storage', 'changed', 'server', 'network'];
  const text: Record<FailureCode, string> = {
    'sign-in':
      'A Wi-Fi sign-in page or another page answered instead of the game. Sign in to the network, then try again.',
    storage: 'This device has no room left to keep the game for offline play.',
    changed: 'The game changed while it was being saved. It will try again with the newest version.',
    server: 'The server did not answer properly. It will try again.',
    network: 'The connection dropped before everything could be saved for offline play. It will try again.',
  };
  const worst = order.find((code) => failures.some((f) => f.code === code)) ?? 'network';
  return text[worst];
}

/**
 * The response headers worth keeping with a stored file. The page's content policy is among them.
 */
const KEPT_HEADERS = [
  'content-type',
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'x-robots-tag',
] as const;

/**
 * Where the note about which release is current is kept, below the folder the game is served from.
 * It is a key in the meta cache and is never fetched.
 */
const GENERATIONS_PATH = '__ua/generations';

function stored(source: Response, body: ArrayBuffer): Response {
  const headers = new Headers();
  for (const name of KEPT_HEADERS) {
    const value = source.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(body, { status: 200, headers });
}

type Inspection = { ok: true; file: Response } | { ok: false; code: FailureCode };

export interface Precache {
  /**
   * Keeps the files a first start needs, or the whole game when an older release is already
   * running, along with the spoken lessons that release had kept. Rejects if any file is wrong.
   */
  install(hasActiveWorker: boolean, tell?: Tell): Promise<void>;
  /**
   * Makes this release the current one and removes releases older than the one before it, and the
   * caches of the first published releases.
   */
  activate(): Promise<void>;
  /**
   * Fetches whatever the device lacks of the game, and of the spoken lessons too when `voice` is
   * true. Calls made while one is running share it.
   */
  warm(tell?: Tell, voice?: boolean): Promise<void>;
  report(): Promise<Report>;
  /**
   * The answer for a request the worker should serve, or null when the browser should handle it as
   * usual.
   */
  route(request: Request, keep?: (work: Promise<unknown>) => void): Promise<Response> | null;
}

export function createPrecache(plan: Plan, ports: Ports): Precache {
  const scope = new URL(ports.scope);
  const names = cacheNames(scope.pathname);
  const name = names.of(plan.build);
  const byUrl = new Map(plan.entries.map((entry) => [entry.url, entry] as const));
  let opened: Promise<CacheLike> | undefined;
  const mine = (): Promise<CacheLike> => (opened ??= ports.caches.open(name));

  /** The address a path of the plan is served from. */
  const addressOf = (path: string): string => scope.href + path;
  /**
   * The path of the plan an address is, or null for one outside the folder the game is served from.
   */
  const pathOf = (address: string): string | null => {
    const url = new URL(address);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
      ? url.pathname.slice(scope.pathname.length)
      : null;
  };

  /**
   * The game is every file but the spoken lessons, which are most of the release and are kept as
   * they are heard.
   */
  const game = plan.entries.filter((entry) => entry.group !== 'voice');
  const spoken = plan.entries.filter((entry) => entry.group === 'voice');
  const spokenBytes = spoken.reduce((sum, entry) => sum + entry.bytes, 0);
  const isSpoken = (url: string): boolean => byUrl.get(url)?.group === 'voice';

  let activity: Extract<Phase, 'installing' | 'warming'> | null = null;
  let keepingVoice = false;
  let running: Promise<Failure[]> | null = null;
  let lastFailure: string | null = null;
  let voiceFailed = false;

  const present = async (cache: CacheLike): Promise<Set<string>> =>
    new Set((await cache.keys()).flatMap((request) => pathOf(request.url) ?? []));

  /**
   * `working` says the game itself is being fetched, so the report says so up to the last file, and
   * not that the game is complete a moment before the fetch ends.
   */
  function reportOf(gameDone: number, voiceDone: number, working = false): Report {
    const phase: Phase =
      working && activity
        ? activity
        : gameDone === game.length
          ? 'complete'
          : (activity ?? (lastFailure ? 'failed' : 'partial'));
    const voice = {
      done: voiceDone,
      total: spoken.length,
      bytes: spokenBytes,
      keeping: keepingVoice,
      failed: voiceFailed && voiceDone < spoken.length,
    };
    return {
      type: 'report',
      build: plan.build,
      phase,
      done: gameDone,
      total: game.length,
      voice,
      detail: phase === 'failed' ? lastFailure : null,
    };
  }

  async function report(): Promise<Report> {
    const have = await present(await mine());
    return reportOf(
      game.filter((entry) => have.has(entry.url)).length,
      spoken.filter((entry) => have.has(entry.url)).length,
    );
  }

  async function inspect(entry: PrecacheEntry, response: Response): Promise<Inspection> {
    // A redirect from a file's own address is a sign-in page or a moved page. It is never the file.
    if (response.type === 'opaqueredirect' || response.redirected || response.status === 401 || response.status === 403)
      return { ok: false, code: 'sign-in' };
    if (response.type === 'opaque' || response.type === 'error' || response.type === 'cors')
      return { ok: false, code: 'changed' };
    if (response.status >= 500) return { ok: false, code: 'server' };
    if (response.status !== 200) return { ok: false, code: 'changed' };
    const type = response.headers.get('content-type');
    if (!typeMatches(entry.kind, type)) {
      // A page where a script, picture or data file should be is a sign-in or hotel Wi-Fi page.
      return { ok: false, code: entry.kind !== 'html' && typeMatches('html', type) ? 'sign-in' : 'changed' };
    }
    const body = await response.arrayBuffer();
    if (entry.kind === 'html') {
      // Every page of this game says which release it belongs to. One that says nothing is somebody
      // else's page.
      const seen = buildOfPage(new TextDecoder().decode(body));
      if (seen === null) return { ok: false, code: 'sign-in' };
      if (seen !== plan.build) return { ok: false, code: 'changed' };
    }
    if ((await ports.sha256(body)) !== entry.sha256) return { ok: false, code: 'changed' };
    return { ok: true, file: stored(response, body) };
  }

  async function findOlder(path: string): Promise<Response | undefined> {
    for (const other of await ports.caches.keys()) {
      if (!other.startsWith(names.prefix) || other === names.meta || other === name) continue;
      const hit = await (await ports.caches.open(other)).match(addressOf(path));
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * One fetch of a file, checked. Null when the connection failed, including while the body was
   * arriving.
   */
  async function download(entry: PrecacheEntry, fresh: boolean): Promise<Inspection | null> {
    try {
      const response = await ports.fetch(
        new Request(addressOf(entry.url), {
          ...(fresh ? { cache: 'reload' as const } : {}),
          redirect: 'manual',
          credentials: 'same-origin',
        }),
      );
      return await inspect(entry, response);
    } catch {
      return null;
    }
  }

  /**
   * Gets one file into the cache, from an older release if its name vouches for it, else from the
   * network.
   */
  async function obtain(cache: CacheLike, entry: PrecacheEntry): Promise<Failure | null> {
    if (isHashedAsset(entry.url)) {
      const older = await findOlder(entry.url);
      if (older) {
        try {
          await cache.put(addressOf(entry.url), older);
        } catch {
          return { url: entry.url, code: 'storage' };
        }
        return null;
      }
    }
    // The browser may already hold a hashed file from loading the page, and the hash proves it is
    // the right one. Any other file must come fresh.
    let fresh = !isHashedAsset(entry.url);
    let code: FailureCode = 'network';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await ports.wait(attempt === 1 ? 400 : 1_200);
      let got = await download(entry, fresh);
      if (got && !got.ok && got.code === 'changed' && !fresh) {
        // A stale or damaged copy in the browser's own cache. The network has the real one.
        fresh = true;
        got = await download(entry, true);
      }
      if (!got) {
        code = 'network';
        continue;
      }
      if (got.ok) {
        try {
          await cache.put(addressOf(entry.url), got.file);
        } catch {
          return { url: entry.url, code: 'storage' };
        }
        return null;
      }
      // A server that is down may be up in a moment. A file that is wrong does not get better by
      // asking again.
      if (got.code !== 'server') return { url: entry.url, code: got.code };
      code = 'server';
    }
    return { url: entry.url, code };
  }

  async function fill(wanted: readonly PrecacheEntry[], limit: number, tell: Tell | undefined): Promise<Failure[]> {
    const cache = await mine();
    const have = await present(cache);
    const todo = wanted.filter((entry) => !have.has(entry.url));
    let gameDone = game.filter((entry) => have.has(entry.url)).length;
    let voiceDone = spoken.filter((entry) => have.has(entry.url)).length;
    const working = gameDone < game.length;
    const say = (): void => tell?.(reportOf(gameDone, voiceDone, working));
    say();
    const failures: Failure[] = [];
    let next = 0;
    const lane = async (): Promise<void> => {
      for (;;) {
        const entry = todo[next++];
        if (!entry) return;
        const failure = await obtain(cache, entry);
        if (failure) failures.push(failure);
        else if (entry.group === 'voice') voiceDone += 1;
        else gameDone += 1;
        say();
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, lane));
    return failures;
  }

  /**
   * Starts a fill unless one is running. The outcome is recorded before anyone waiting on it hears
   * that it finished.
   */
  function begin(
    label: 'installing' | 'warming',
    wanted: readonly PrecacheEntry[],
    limit: number,
    tell: Tell | undefined,
  ): Promise<Failure[]> {
    if (running) return running;
    activity = label;
    keepingVoice = wanted.some((entry) => entry.group === 'voice');
    const job: Promise<Failure[]> = fill(wanted, limit, tell)
      .catch((): Failure[] => [{ url: '', code: 'storage' }])
      .then((failures) => {
        const ofGame = failures.filter((failure) => !isSpoken(failure.url));
        lastFailure = ofGame.length > 0 ? plainFailure(ofGame) : null;
        // What happened to the spoken lessons stands until another try at all of them.
        if (keepingVoice) voiceFailed = failures.length > ofGame.length;
        activity = null;
        keepingVoice = false;
        running = null;
        return failures;
      });
    running = job;
    return job;
  }

  /**
   * Copies the spoken lessons that an older release kept, so they are still on the device after the
   * release that kept them is let go.
   */
  async function carryOverSpoken(): Promise<void> {
    const cache = await mine();
    const have = await present(cache);
    for (const other of await ports.caches.keys()) {
      if (!other.startsWith(names.prefix) || other === names.meta || other === name) continue;
      const older = await ports.caches.open(other);
      for (const { url } of await older.keys()) {
        const path = pathOf(url);
        if (path === null || have.has(path) || !isSpoken(path)) continue;
        const hit = await older.match(url);
        if (!hit) continue;
        await cache.put(addressOf(path), hit);
        have.add(path);
      }
    }
  }

  async function install(hasActiveWorker: boolean, tell?: Tell): Promise<void> {
    const wanted = hasActiveWorker ? game : plan.entries.filter((entry) => entry.group === 'boot');
    const failures = await begin('installing', wanted, 4, tell);
    if (failures.length > 0)
      throw new Error(`the release could not be kept: ${failures[0]!.code} for ${failures[0]!.url}`);
    if (hasActiveWorker) await carryOverSpoken().catch(() => undefined);
  }

  async function warm(tell?: Tell, voice = false): Promise<void> {
    await begin('warming', voice ? plan.entries : game, 3, tell);
  }

  async function activate(): Promise<void> {
    const meta = await ports.caches.open(names.meta);
    let before: Generations | null = null;
    try {
      const note = await meta.match(addressOf(GENERATIONS_PATH));
      before = note ? ((await note.json()) as Generations) : null;
    } catch {
      before = null;
    }
    const previous = before && before.current !== plan.build ? before.current : (before?.previous ?? null);
    const keep = new Set([names.meta, name, ...(previous ? [names.of(previous)] : [])]);
    for (const other of await ports.caches.keys()) {
      if ((other.startsWith(names.prefix) && !keep.has(other)) || names.isLegacy(other))
        await ports.caches.delete(other);
    }
    const now: Generations = { current: plan.build, previous };
    await meta.put(
      addressOf(GENERATIONS_PATH),
      new Response(JSON.stringify(now), { headers: { 'content-type': 'application/json' } }),
    );
  }

  async function shell(request: Request): Promise<Response> {
    const hit = await (await mine()).match(addressOf(SHELL_URL));
    if (hit) return hit;
    try {
      return await ports.fetch(request);
    } catch {
      return new Response(`${GAME_NAME} has to be opened once with a connection before it can be played offline.`, {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  }

  async function fromPlan(
    entry: PrecacheEntry,
    request: Request,
    keep: (work: Promise<unknown>) => void,
  ): Promise<Response> {
    const cache = await mine();
    const hit = await cache.match(addressOf(entry.url));
    if (hit) return hit;
    if (isHashedAsset(entry.url)) {
      const older = await findOlder(entry.url);
      if (older) {
        keep(cache.put(addressOf(entry.url), older.clone()).catch(() => undefined));
        return older;
      }
    }
    // Not kept yet, as while the rest of the release is still downloading. The browser would have
    // fetched it anyway.
    const response = await ports.fetch(request);
    const copy = response.clone();
    keep(
      inspect(entry, copy)
        .then((got) => (got.ok ? cache.put(addressOf(entry.url), got.file) : undefined))
        .catch(() => undefined),
    );
    return response;
  }

  function route(request: Request, keep: (work: Promise<unknown>) => void = () => undefined): Promise<Response> | null {
    if (request.method !== 'GET' || request.headers.has('range')) return null;
    const path = pathOf(request.url);
    if (path === null) return null;
    if (request.mode === 'navigate') return path === '' || path === SHELL_URL ? shell(request) : null;
    const entry = byUrl.get(path);
    if (entry) return fromPlan(entry, request, keep);
    if (!isHashedAsset(path)) return null;
    // A page from an older release asking for a file of its own.
    return findOlder(path).then((older) => older ?? ports.fetch(request));
  }

  return { install, activate, warm, report, route };
}
