/**
 * What the service worker, the page and the build must agree on: which files a release is made of,
 * how each one is recognised, how the caches are named, and what the page and the worker say to
 * each other.
 *
 * A release is a `Plan`. The build writes it, the worker carries it, and nothing is kept for
 * offline play unless it matches the plan byte for byte. That is what stops a sign-in page or an
 * error page from ever being kept as a game file.
 */

/**
 * The kinds of file a release may contain. A file of any other kind fails the build, so nothing
 * unexpected is shipped.
 */
export type Kind = 'html' | 'js' | 'css' | 'json' | 'webmanifest' | 'png' | 'webp' | 'svg' | 'ico' | 'mp3' | 'woff2';

/**
 * What a server may say a file of each kind is. A `.json` file that arrives as `text/html` is a
 * sign-in page or an error page.
 */
const CONTENT_TYPES: Readonly<Record<Kind, readonly string[]>> = {
  html: ['text/html'],
  js: ['text/javascript', 'application/javascript'],
  css: ['text/css'],
  json: ['application/json'],
  webmanifest: ['application/manifest+json', 'application/json'],
  png: ['image/png'],
  webp: ['image/webp'],
  svg: ['image/svg+xml'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
  // `audio/mpeg` is the registered name. GitHub Pages sends `audio/mp3`, and a release that refused
  // it could not be kept there at all.
  mp3: ['audio/mpeg', 'audio/mp3'],
  woff2: ['font/woff2', 'application/font-woff2'],
};

const EXTENSIONS: Readonly<Record<string, Kind>> = {
  html: 'html',
  js: 'js',
  css: 'css',
  json: 'json',
  webmanifest: 'webmanifest',
  png: 'png',
  webp: 'webp',
  svg: 'svg',
  ico: 'ico',
  mp3: 'mp3',
  woff2: 'woff2',
};

/** The kind a path's extension names, or null for one a release may not contain. */
export function kindOf(path: string): Kind | null {
  const match = /\.([a-z0-9]+)$/.exec(path);
  return (match && EXTENSIONS[match[1]!]) || null;
}

/**
 * Whether a `Content-Type` header is one the kind may have. The charset and other parameters are
 * ignored.
 */
export function typeMatches(kind: Kind, header: string | null): boolean {
  if (header === null) return false;
  const type = header.split(';')[0]!.trim().toLowerCase();
  return CONTENT_TYPES[kind].includes(type);
}

/**
 * `name.0123456789.ext` from the asset packager and `name-AbCdEfGh.ext` from Vite: the name changes
 * whenever the content does. Such a file never changes, so a browser keeps it for good and a newer
 * release can reuse an older copy.
 */
const HASHED = /^assets\/.+[.-][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

export const isHashedAsset = (path: string): boolean => HASHED.test(path);

/**
 * `boot` files are kept before the game first starts. `rest` files are fetched in the background
 * after it has. `voice` files are the spoken lessons, which are kept as they are heard and all at
 * once only when a parent asks, because they are most of what the game weighs.
 */
export type Group = 'boot' | 'rest' | 'voice';

export interface PrecacheEntry {
  /**
   * Path from the folder the game is served from, such as `assets/index-AbCdEfGh.js`. The page
   * itself is `index.html`.
   */
  url: string;
  /** SHA-256 of the exact bytes the server sends, as lowercase hex. */
  sha256: string;
  bytes: number;
  kind: Kind;
  group: Group;
}

export interface Plan {
  /**
   * Names this release. It is a hash of every file in it, so two releases that differ at all have
   * different builds.
   */
  build: string;
  entries: readonly PrecacheEntry[];
}

/** The page. The folder itself answers for it as well. */
export const SHELL_URL = 'index.html';

const BUILD_META = /<meta name="ua-build" content="([0-9a-f]+)">/;

/**
 * The page with no release written into it. Stamping and unstamping undo each other, so a page can
 * be stamped again and again.
 */
export const unstampBuild = (html: string): string => html.replace(BUILD_META, '');

/**
 * Writes the release's name into the page, so a fetched page can be told apart from one of another
 * release.
 */
export function stampBuild(html: string, build: string): string {
  const bare = unstampBuild(html);
  if (!bare.includes('</head>')) throw new Error('the page has no head to put the build in');
  return bare.replace('</head>', `<meta name="ua-build" content="${build}"></head>`);
}

/** The release a page says it belongs to, or null when it says nothing. */
export function buildOfPage(html: string): string | null {
  return BUILD_META.exec(html)?.[1] ?? null;
}

/**
 * The names of the caches of one copy of the game. They begin with the folder the copy is served
 * from, so a second copy on the same origin, such as a fork under another path of the same site,
 * never removes the first one's files.
 */
export interface CacheNames {
  /** What every cache of this copy begins with. */
  readonly prefix: string;
  /** Holds one note saying which release is current and which was before it. */
  readonly meta: string;
  /** The cache of one release, so two releases are never mixed. */
  of(build: string): string;
  /**
   * Whether a cache is one that the first published releases made, before caches were named for
   * their folder: `ua-meta`, and `ua-` with a release id. Those releases were served from the root
   * of a site, so only a copy at the root can have any, and nothing reads them now.
   */
  isLegacy(name: string): boolean;
}

const LEGACY_CACHE = /^ua-(?:meta|[0-9a-f]{12})$/;

export function cacheNames(scopePath: string): CacheNames {
  const prefix = `ua:${scopePath}:`;
  return {
    prefix,
    meta: `${prefix}meta`,
    of: (build) => `${prefix}${build}`,
    isLegacy: (name) => scopePath === '/' && LEGACY_CACHE.test(name),
  };
}

export interface Generations {
  current: string;
  previous: string | null;
}

/**
 * `warm` asks for the rest of the game, and for every spoken lesson as well when `voice` is true.
 */
export type ToWorker = { type: 'hello' } | { type: 'warm'; voice: boolean } | { type: 'skip-waiting' };

/**
 * How far the worker has got with keeping the game on the device. The spoken lessons are not part
 * of it, and have their own `Voice` report.
 *   installing  the release is being fetched as part of a worker's own install
 *   warming     the rest of the release is being fetched in the background
 *   partial     some files are on the device and nothing is fetching them
 *   complete    every file of the game is on the device
 *   failed      the last attempt could not get every file
 */
export type Phase = 'installing' | 'warming' | 'partial' | 'complete' | 'failed';

/**
 * How many of the spoken lessons are on the device. A lesson is kept when it has been heard once,
 * or when a parent asked for all of them.
 */
export interface Voice {
  done: number;
  total: number;
  /** What all of them weigh, so a parent can be told before asking for them. */
  bytes: number;
  /** All of them are being fetched now. */
  keeping: boolean;
  /** The last attempt to keep all of them could not get every one. */
  failed: boolean;
}

export interface Report {
  type: 'report';
  build: string;
  phase: Phase;
  /** Files of the game now on the device, not counting the spoken lessons. */
  done: number;
  total: number;
  voice: Voice;
  /** A plain-words reason when `phase` is `failed`. */
  detail: string | null;
}

export const isReport = (value: unknown): value is Report =>
  typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'report';
