import { createHash } from 'node:crypto';
import {
  cacheNames,
  type Group,
  kindOf,
  type Plan,
  type PrecacheEntry,
  SHELL_URL,
  stampBuild,
} from '../../src/shared/offline';
import type { CacheLike, CachesLike, Ports } from '../../src/sw/precache';

/**
 * A stand-in for the browser: a cache storage in memory and a network that answers from a table.
 * The service worker's rules are tested against it, so a test says what the server sends and checks
 * what ends up on the device.
 */

export const ORIGIN = 'https://unicorns.test';
/**
 * The folder the game is served from, as it is on GitHub Pages: a path of a site, not the whole
 * site.
 */
export const SCOPE = `${ORIGIN}/fan/`;
const SCOPE_PATH = new URL(SCOPE).pathname;
/** Where in the folder an address is, or the address itself for one outside it. */
export const pathOf = (address: string): string => {
  const { pathname } = new URL(address, SCOPE);
  return pathname.startsWith(SCOPE_PATH) ? pathname.slice(SCOPE_PATH.length) : pathname;
};

export const BUILD = 'a1b2c3d4e5f6';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  woff2: 'font/woff2',
  webmanifest: 'application/manifest+json',
};

export const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

export interface FileSpec {
  body: string;
  group?: Group;
}

export interface Release {
  plan: Plan;
  /** What the server holds, by path. */
  files: Map<string, string>;
}

/**
 * A release made of the given files. The page is stamped with the build, as the build step does.
 */
export function release(files: Record<string, FileSpec>, build: string = BUILD): Release {
  const held = new Map<string, string>();
  const entries: PrecacheEntry[] = [];
  for (const [url, spec] of Object.entries(files)) {
    const body = url === SHELL_URL ? stampBuild(spec.body, build) : spec.body;
    const kind = url === SHELL_URL ? 'html' : kindOf(url);
    if (!kind) throw new Error(`no kind for ${url}`);
    held.set(url, body);
    entries.push({ url, sha256: sha256(body), bytes: Buffer.byteLength(body), kind, group: spec.group ?? 'rest' });
  }
  return { plan: { build, entries }, files: held };
}

const typeOf = (url: string): string => TYPES[url === SHELL_URL ? 'html' : kindOf(url)!]!;

export const ok = (url: string, body: string): Response =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': typeOf(url), 'content-security-policy': "default-src 'self'", 'x-not-kept': 'yes' },
  });

class MemoryCache implements CacheLike {
  readonly files = new Map<string, Response>();
  failPuts = false;

  async match(url: string): Promise<Response | undefined> {
    return this.files.get(pathOf(url))?.clone();
  }

  async put(url: string, response: Response): Promise<void> {
    if (this.failPuts) throw new DOMException('full', 'QuotaExceededError');
    this.files.set(pathOf(url), response);
  }

  async keys(): Promise<readonly { url: string }[]> {
    return [...this.files.keys()].map((path) => ({ url: SCOPE + path }));
  }

  async text(path: string): Promise<string | null> {
    const hit = await this.match(path);
    return hit ? hit.text() : null;
  }
}

class MemoryCaches implements CachesLike {
  readonly stores = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    let store = this.stores.get(name);
    if (!store) {
      store = new MemoryCache();
      this.stores.set(name, store);
    }
    return store;
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  /** The cache for a build, as the worker names it. */
  of(build: string): MemoryCache {
    const store = this.stores.get(cacheNames(SCOPE_PATH).of(build));
    if (!store) throw new Error(`no cache for ${build}`);
    return store;
  }
}

type Answer = Response | Error | (() => Response | Promise<Response>);

/**
 * A network that answers each path from a table, counts what was asked, and can be told to
 * misbehave.
 */
class FakeNetwork {
  /** Paths asked for, in order. */
  readonly asked: string[] = [];
  readonly requests: Request[] = [];
  private readonly answers = new Map<string, Answer[]>();
  private inflight = 0;
  maxInflight = 0;
  /** How long each answer takes, so that parallel fetches overlap. */
  latency = 0;

  constructor(private readonly served: Map<string, string>) {}

  /**
   * The next answers for a path, used once each, in order. After they run out the path is served
   * normally.
   */
  script(path: string, ...answers: Answer[]): void {
    this.answers.set(path, answers);
  }

  fetch = async (request: Request): Promise<Response> => {
    // The folder itself answers with its page, as a static host does.
    const path = pathOf(request.url) || SHELL_URL;
    this.asked.push(path);
    this.requests.push(request);
    this.inflight += 1;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    try {
      if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency));
      const next = this.answers.get(path)?.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return await next();
      if (next) return next;
      const body = this.served.get(path);
      return body === undefined
        ? new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
        : ok(path, body);
    } finally {
      this.inflight -= 1;
    }
  };
}

export interface Device {
  caches: MemoryCaches;
  net: FakeNetwork;
  ports: Ports;
  waited: number[];
}

export function device(served: Map<string, string>): Device {
  const caches = new MemoryCaches();
  const net = new FakeNetwork(served);
  const waited: number[] = [];
  const ports: Ports = {
    caches,
    fetch: net.fetch,
    sha256: async (bytes) => sha256(new Uint8Array(bytes)),
    wait: async (ms) => void waited.push(ms),
    scope: SCOPE,
  };
  return { caches, net, ports, waited };
}

export const asNavigation = (path: string): Request => {
  const request = new Request(SCOPE + path, { headers: { accept: 'text/html' } });
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
};

export const get = (path: string, init?: RequestInit): Request => new Request(SCOPE + path, init);

/**
 * A response that says it is something other than what it looks like, as a browser reports a
 * redirect.
 */
export function pretending(
  response: Response,
  props: Partial<Pick<Response, 'type' | 'redirected' | 'status'>>,
): Response {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(response, key, { value });
  return response;
}

/** What a manual-redirect fetch resolves to when the server answers with a redirect. */
export const opaqueRedirect = (): Response => pretending(new Response(null), { type: 'opaqueredirect', status: 0 });
