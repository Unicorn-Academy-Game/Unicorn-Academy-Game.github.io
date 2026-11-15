import { createHash } from 'node:crypto';
import {
  type Group,
  kindOf,
  type Plan,
  type PrecacheEntry,
  SHELL_URL,
  stampBuild,
  unstampBuild,
} from '../../src/shared/offline';
import { BUDGET } from '../assets/check/budgets';
import { transferBytes } from '../assets/check/files';

/**
 * Turns the files of a finished build into the release plan the service worker carries.
 *
 * Every file in the build goes into the plan, so what the worker keeps is exactly what the server
 * will send. The builder refuses anything that would make offline play unsafe or unprovable: a file
 * of a kind the worker could not recognise, a page that points at a file the release does not hold,
 * or a release over the size targets.
 */

export interface DistFile {
  /**
   * Path from the folder the build is served from, such as `assets/index-AbCdEfGh.js`. The page is
   * `index.html`.
   */
  url: string;
  bytes: Uint8Array;
}

export interface GameAssets {
  /**
   * Every file the asset manifest names, and the manifest itself, as paths from the folder the
   * build is served from.
   */
  all: ReadonlySet<string>;
  /**
   * The part of `all` that the first playable moment needs. The rest can arrive after play has
   * started.
   */
  first: ReadonlySet<string>;
  /**
   * The part of `all` that is the spoken lessons, which are kept as they are heard and not all at
   * once.
   */
  voice: ReadonlySet<string>;
}

export interface Limits {
  /** Compressed bytes the files needed to start may add up to. */
  initial: number;
  /** Compressed bytes the game may add up to, which is every file but the spoken lessons. */
  offline: number;
  /** Compressed bytes the spoken lessons may add up to. */
  voice: number;
}

interface PlanReport {
  files: number;
  bootFiles: number;
  /** Bytes as sent compressed, for the files needed to start. */
  bootBytes: number;
  /** Bytes as sent compressed, for every file but the spoken lessons. */
  offlineBytes: number;
  /** Bytes as sent compressed, for the spoken lessons. */
  voiceBytes: number;
  largest: { url: string; bytes: number }[];
}

export interface BuiltPlan {
  plan: Plan;
  /** The page with the release's name written into it. The build writes this over `index.html`. */
  html: string;
  report: PlanReport;
}

const hex = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

/**
 * Paths a page asks for with `src` and `href`, from the folder it is in and without query or
 * fragment, for the ones that are on this site. A path from the root of the site is an error,
 * because the game is served from a folder of a site and the root is not its own.
 */
function referencedBy(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
    const value = match[1]!;
    if (value === '' || value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) continue;
    if (value.startsWith('/'))
      throw new Error(
        `the page asks for ${value} from the root of the site, so it would not load when the game is served from a folder. Use a path from the page`,
      );
    found.add(new URL(value, 'https://folder.test/').pathname.slice(1));
  }
  return [...found];
}

export function makePlan(
  files: readonly DistFile[],
  game: GameAssets,
  limits: Limits = { initial: BUDGET.initial, offline: BUDGET.offline, voice: BUDGET.voice },
): BuiltPlan {
  const page = files.find((file) => file.url === SHELL_URL);
  if (!page) throw new Error('the build has no index.html');

  const seen = new Set<string>();
  const others = files
    .filter((file) => file !== page)
    .map((file) => {
      if (seen.has(file.url)) throw new Error(`${file.url} appears twice in the build`);
      seen.add(file.url);
      const kind = kindOf(file.url);
      if (!kind)
        throw new Error(
          `${file.url} is a kind of file an offline release may not hold. Remove it from the build or teach src/shared/offline.ts about it`,
        );
      return { url: file.url, kind, bytes: file.bytes, sha256: hex(file.bytes) };
    })
    .sort((a, b) => (a.url < b.url ? -1 : 1));

  for (const url of game.all)
    if (!seen.has(url)) throw new Error(`${url} is named by the asset manifest and is not in the build`);

  // The release is named by everything in it, so any change to any file makes a new release.
  const bare = unstampBuild(Buffer.from(page.bytes).toString('utf8'));
  const build = hex([hex(bare), ...others.map((o) => `${o.url} ${o.sha256}`)].join('\n')).slice(0, 12);
  const html = stampBuild(bare, build);
  const pageBytes = Buffer.from(html, 'utf8');

  const groupOf = (url: string): Group =>
    game.voice.has(url) ? 'voice' : game.all.has(url) && !game.first.has(url) ? 'rest' : 'boot';
  const entries: PrecacheEntry[] = [
    { url: SHELL_URL, sha256: hex(pageBytes), bytes: pageBytes.byteLength, kind: 'html', group: 'boot' },
    ...others.map(
      (o): PrecacheEntry => ({
        url: o.url,
        sha256: o.sha256,
        bytes: o.bytes.byteLength,
        kind: o.kind,
        group: groupOf(o.url),
      }),
    ),
  ];

  const planned = new Set(entries.map((entry) => entry.url));
  for (const path of referencedBy(html)) {
    if (!planned.has(path))
      throw new Error(`the page asks for ${path}, which is not in the release, so the game could not start offline`);
  }

  const sent = new Map<string, number>([[SHELL_URL, transferBytes(SHELL_URL, pageBytes)]]);
  for (const o of others) sent.set(o.url, transferBytes(o.url, o.bytes));
  const sum = (keep: (entry: PrecacheEntry) => boolean): number =>
    entries.filter(keep).reduce((total, entry) => total + (sent.get(entry.url) ?? 0), 0);
  const bootBytes = sum((entry) => entry.group === 'boot');
  const offlineBytes = sum((entry) => entry.group !== 'voice');
  const voiceBytes = sum((entry) => entry.group === 'voice');
  const mib = (n: number): string => `${(n / 1024 / 1024).toFixed(2)} MiB`;
  if (bootBytes > limits.initial)
    throw new Error(
      `the files needed to start add up to ${mib(bootBytes)} compressed and the target is ${mib(limits.initial)}`,
    );
  if (offlineBytes > limits.offline)
    throw new Error(
      `the game kept for offline play adds up to ${mib(offlineBytes)} compressed and the target is ${mib(limits.offline)}`,
    );
  if (voiceBytes > limits.voice)
    throw new Error(`the spoken lessons add up to ${mib(voiceBytes)} and the target is ${mib(limits.voice)}`);

  const report: PlanReport = {
    files: entries.length,
    bootFiles: entries.filter((entry) => entry.group === 'boot').length,
    bootBytes,
    offlineBytes,
    voiceBytes,
    largest: [...sent]
      .map(([url, bytes]) => ({ url, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
  };
  return { plan: { build, entries }, html, report };
}
