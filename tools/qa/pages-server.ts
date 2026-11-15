import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A static host that behaves like GitHub Pages for a project site: the game is served from a folder
 * of the site, the folder's own address answers with its page, a missing slash is added by a
 * redirect, and every other address is a 404. It is how a build is tried before it is published,
 * and `tools/qa/smoke-dist.ts` drives the game through it.
 *   tsx tools/qa/pages-server.ts [dir] [--port 4173] [--prefix /unicorn-academy/]
 */

/**
 * What GitHub Pages sends for each kind of file, as `curl -I` on a live project site shows. It
 * calls a script `application/javascript` and an MP3 `audio/mp3`, and keeps every file in the
 * browser's cache for ten minutes.
 */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mp3',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

export const DEFAULT_PREFIX = '/unicorn-academy/';

interface Request {
  path: string;
  status: number;
}

export interface Pages {
  /** `http://127.0.0.1:port`. */
  origin: string;
  /** The address of the game: the origin and the folder. */
  url: string;
  /** Every request the host has answered, in order. */
  readonly asked: Request[];
  close(): Promise<void>;
}

export async function servePages(options: { dir: string; prefix?: string; port?: number }): Promise<Pages> {
  const dir = resolve(options.dir);
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const asked: Request[] = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]!);
    const reply = (status: number, headers: Record<string, string>, body?: Buffer | string): void => {
      asked.push({ path, status });
      response.writeHead(status, headers).end(body);
    };
    if (`${path}/` === prefix) return reply(301, { location: prefix });
    const missing = (): void =>
      reply(404, { 'content-type': 'text/html; charset=utf-8' }, '<!doctype html><title>404</title>File not found');
    if (!path.startsWith(prefix)) return missing();
    const file = join(dir, path.slice(prefix.length) || 'index.html');
    if (file !== dir && !file.startsWith(dir + sep)) return missing();
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return missing();
    reply(
      200,
      {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'max-age=600',
        'access-control-allow-origin': '*',
      },
      readFileSync(file),
    );
  });
  await new Promise<void>((done) => server.listen(options.port ?? 0, '127.0.0.1', done));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  return {
    origin,
    url: origin + prefix,
    asked,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const dir = args.find((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--')) ?? 'dist';
  const pages = await servePages({ dir, prefix: flag('prefix') ?? DEFAULT_PREFIX, port: Number(flag('port') ?? 4173) });
  console.log(`${dir} is served like GitHub Pages at ${pages.url}`);
}
