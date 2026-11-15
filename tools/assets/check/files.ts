import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Manifest } from '../../../src/shared/manifest';
import { webpSize } from '../../lib/webp';
import { shortHash } from '../lib/hash';
import { error, type Finding } from './finding';

/** Every file the manifest names, relative to the assets directory. */
export function referencedFiles(manifest: Manifest): string[] {
  const files = new Set<string>();
  for (const u of Object.values(manifest.unicorns)) {
    files.add(u.atlas.file);
    if (u.crown) files.add(u.crown.atlas.file);
    for (const sheet of u.fine?.atlases ?? []) files.add(sheet.file);
  }
  for (const n of Object.values(manifest.npcs)) files.add(n.atlas.file);
  for (const b of Object.values(manifest.bundles)) for (const page of b.pages) files.add(page.file);
  for (const t of Object.values(manifest.tilesets)) files.add(t.file);
  for (const m of Object.values(manifest.maps)) if (m) files.add(m.file);
  if (manifest.audio) {
    for (const l of Object.values(manifest.audio.loops)) files.add(l.file);
    for (const s of Object.values(manifest.audio.sheets)) files.add(s.file);
    for (const c of Object.values(manifest.audio.speech?.clips ?? {})) files.add(c.file);
  }
  return [...files].sort();
}

/**
 * The files of the spoken clips, which the game keeps apart from the rest because they are most of
 * what it weighs.
 */
export const spokenFiles = (manifest: Manifest): Set<string> =>
  new Set(Object.values(manifest.audio?.speech?.clips ?? {}).map((clip) => clip.file));

/** Width and height of every image the manifest describes, by file. */
function declaredSizes(manifest: Manifest): Map<string, { w: number; h: number }> {
  const sizes = new Map<string, { w: number; h: number }>();
  const put = (file: string, w: number, h: number): void => void sizes.set(file, { w, h });
  for (const u of Object.values(manifest.unicorns)) {
    put(u.atlas.file, u.atlas.width, u.atlas.height);
    if (u.crown) put(u.crown.atlas.file, u.crown.atlas.width, u.crown.atlas.height);
    for (const sheet of u.fine?.atlases ?? []) put(sheet.file, sheet.width, sheet.height);
  }
  for (const n of Object.values(manifest.npcs)) put(n.atlas.file, n.atlas.width, n.atlas.height);
  for (const b of Object.values(manifest.bundles)) for (const p of b.pages) put(p.file, p.width, p.height);
  for (const t of Object.values(manifest.tilesets)) put(t.file, t.width, t.height);
  return sizes;
}

/**
 * Bytes a browser downloads for a file: text is sent compressed, and pictures and sound are already
 * compressed.
 */
export const transferBytes = (file: string, bytes: Uint8Array): number =>
  /\.(json|js|css|html|svg|webmanifest)$/.test(file) ? gzipSync(bytes, { level: 9 }).length : bytes.length;

/** Files under a directory, relative to it, in a stable order. */
function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(dir, full));
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

const NAME = /^(?:.+\/)?[^/]+\.([0-9a-f]{10})\.(webp|json|mp3)$/;

/**
 * Every file the manifest names exists, is the file its name says it is (the hash in the name
 * matches the content), is the size the manifest declares, and nothing else is left in the
 * directory to be shipped.
 */
export function checkFiles(dir: string, manifest: Manifest): Finding[] {
  const found: Finding[] = [];
  const referenced = referencedFiles(manifest);
  const sizes = declaredSizes(manifest);
  for (const file of referenced) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      found.push(error('files', `${file} is named by the manifest and is not there`));
      continue;
    }
    const bytes = readFileSync(path);
    const match = NAME.exec(file);
    if (!match)
      found.push(
        error(
          'files',
          `${file} does not carry a content hash in its name, so a cache could never tell it from a stale copy`,
        ),
      );
    else if (match[1] !== shortHash(bytes))
      found.push(error('files', `${file} does not match the hash in its name (content is ${shortHash(bytes)})`));
    const want = sizes.get(file);
    if (want) {
      const got = webpSize(bytes);
      if (!got) found.push(error('files', `${file} is not a WebP picture`));
      else if (got.w !== want.w || got.h !== want.h)
        found.push(error('files', `${file} is ${got.w}x${got.h} and the manifest says ${want.w}x${want.h}`));
    }
  }
  const named = new Set(referenced);
  for (const file of walk(dir)) {
    if (file === 'manifest.json') continue;
    if (!named.has(file))
      found.push(
        error(
          'files',
          `${file} is in the assets directory and the manifest does not use it, so it would be shipped for nothing`,
        ),
      );
  }
  return found;
}
